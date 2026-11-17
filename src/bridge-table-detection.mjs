import * as THREE from 'three';
import {planeFromDetection} from './ar-placement.mjs';

// Detect facing edges of TWO distinct approximately horizontal tabletops.
// Only plane polygons reveal extent. Simple WebXR hit-tests cannot tell
// whether a ray has hit the first or second table, or estimate their widths.
function axisOverlap(a,b,axis){
  const min=Math.max(a.bounds.min[axis],b.bounds.min[axis]);
  const max=Math.min(a.bounds.max[axis],b.bounds.max[axis]);
  return {min,max,length:max-min,centre:(min+max)/2};
}
export function bridgeGapBetween(a,b,{minGap=.20,maxGap=3,heightTolerance=.10}={}){
  if(!a||!b||Math.abs(a.top-b.top)>heightTolerance)return null;
  let candidates=[];
  const oz=axisOverlap(a,b,'z'),ox=axisOverlap(a,b,'x');
  if(oz.length>.22){
    if(a.bounds.max.x<=b.bounds.min.x){
      candidates.push({gap:b.bounds.min.x-a.bounds.max.x,
        start:new THREE.Vector3(a.bounds.max.x,(a.top+b.top)/2,oz.centre),
        end:new THREE.Vector3(b.bounds.min.x,(a.top+b.top)/2,oz.centre)});
    }
    if(b.bounds.max.x<=a.bounds.min.x){
      candidates.push({gap:a.bounds.min.x-b.bounds.max.x,
        start:new THREE.Vector3(b.bounds.max.x,(a.top+b.top)/2,oz.centre),
        end:new THREE.Vector3(a.bounds.min.x,(a.top+b.top)/2,oz.centre)});
    }
  }
  if(ox.length>.22){
    if(a.bounds.max.z<=b.bounds.min.z){
      candidates.push({gap:b.bounds.min.z-a.bounds.max.z,
        start:new THREE.Vector3(ox.centre,(a.top+b.top)/2,a.bounds.max.z),
        end:new THREE.Vector3(ox.centre,(a.top+b.top)/2,b.bounds.min.z)});
    }
    if(b.bounds.max.z<=a.bounds.min.z){
      candidates.push({gap:a.bounds.min.z-b.bounds.max.z,
        start:new THREE.Vector3(ox.centre,(a.top+b.top)/2,b.bounds.max.z),
        end:new THREE.Vector3(ox.centre,(a.top+b.top)/2,a.bounds.min.z)});
    }
  }
  candidates=candidates.filter(c=>c.gap>=minGap&&c.gap<=maxGap);
  if(!candidates.length)return null;
  const best=candidates.sort((u,v)=>u.gap-v.gap)[0];
  return {...best,span_m:best.gap,
    direction:best.end.clone().sub(best.start).normalize(),
    source:'WebXR plane-detection'};
}
// Fallback for browsers without plane polygons (commonly Android WebXR).
// The student aims the hit-test reticle at each INNER tabletop edge and
// explicitly records the two points. We measure the horizontal distance
// between those points; these are not automatically discovered plane edges.
export function bridgeGapFromHitPoints(first,second,{
  minGap=.3,maxGap=3,heightTolerance=.12
}={}){
  if(!first||!second||![first.x,first.y,first.z,
    second.x,second.y,second.z].every(Number.isFinite))
    throw Error('Se necesitan dos puntos de superficie detectados.');
  if(Math.abs(first.y-second.y)>heightTolerance)
    throw Error('Los bordes de ambas mesas deben estar a una altura similar.');
  const dx=second.x-first.x,dz=second.z-first.z;
  const span=Math.hypot(dx,dz);
  if(span<minGap||span>maxGap)
    throw Error('El vano medido debe estar entre '+
      minGap.toFixed(2).replace('.',',')+' y '+
      maxGap.toFixed(2).replace('.',',')+' m.');
  const height=(first.y+second.y)/2;
  const start=new THREE.Vector3(first.x,height,first.z);
  const end=new THREE.Vector3(second.x,height,second.z);
  return {span_m:span,start,end,
    direction:end.clone().sub(start).normalize(),
    source:'Dos bordes señalados con hit-test (sin detección de contornos)'};
}
export function detectBridgeTableGap(frame,referenceSpace){
  if(!frame?.detectedPlanes||!referenceSpace)return null;
  const surfaces=[];
  for(const plane of frame.detectedPlanes){
    try{
      const item=planeFromDetection(plane,frame,referenceSpace);
      if(!item)continue;
      // Reject large floor/wall planes, accept measured tabletop candidates.
      const label=item.label.toLowerCase();
      if(label&&label!=='table'&&label!=='desk'&&label!=='unknown')continue;
      if(item.width<.4||item.depth<.35||item.width>2.8||item.depth>2.8)continue;
      if(item.area<.2||item.area>7.5)continue;
      // XR local coordinates are relative to the session origin, NOT the
      // floor. On phones, tabletop tops can have negative Y; absolute
      // [0.35,1.75] would silently reject every detected plane.
      surfaces.push(item);
    }catch{/* Ignore individual unsupported planes. */}
  }
  if(surfaces.length<2)return null;
  const options=[];
  for(let i=0;i<surfaces.length;i++){
    for(let j=i+1;j<surfaces.length;j++){
      const proposal=bridgeGapBetween(surfaces[i],surfaces[j]);
      if(proposal)options.push(proposal);
    }
  }
  // If multiple pairs match, choose the smallest compatible gap and require
  // repeat observations in the XR controller before accepting placement.
  return options.sort((a,b)=>a.span_m-b.span_m)[0]??null;
}
export function applyBridgeGapPlacement(app,gap,experience){
  if(!gap||!experience)throw Error('No se han detectado dos mesas compatibles.');
  const span=gap.span_m;
  experience.setSpan(span);
  app.targetMeters=span;
  app.updateScale();
  app.worldRoot.quaternion.setFromUnitVectors(
    new THREE.Vector3(1,0,0),gap.direction
  ).multiply(experience.defaultWorldQuaternion);
  app.worldRoot.position.copy(gap.start);
  app.arAnchorPoint=null;
  experience.detectedGap=gap;
  return span;
}
