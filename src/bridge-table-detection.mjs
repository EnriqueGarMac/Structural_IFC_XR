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
export function bridgeGapBetween(a,b,{minGap=.45,maxGap=4,heightTolerance=.18}={}){
  if(!a||!b||Math.abs(a.top-b.top)>heightTolerance)return null;
  // Fragments of one tabletop can appear as distinct WebXR planes.
  // Reject nearby fragments and strongly overlapping bounding boxes.
  if(a.bounds.intersectsBox(b.bounds))return null;
  let candidates=[];
  const oz=axisOverlap(a,b,'z'),ox=axisOverlap(a,b,'x');
  if(oz.length>.12){
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
  if(ox.length>.12){
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
  minGap=.3,maxGap=4,heightTolerance=.18
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
// Accumulate plane observations across frames: individual WebXR frames may
// report only a subset of the room. Track plane identities without assuming
// that a complete room mesh is available to the browser.
export class BridgeRoomScan {
  constructor(){this.reset();}
  reset(){this.surfaces=new Map();this.frameCount=0;this.candidate=null;this.stability=0;this.options=[];}
  observe(frame,referenceSpace){
    this.frameCount++;
    if(!frame?.detectedPlanes||!referenceSpace)return this.status();
    for(const plane of frame.detectedPlanes){
      let item;
      try{item=planeFromDetection(plane,frame,referenceSpace);}catch{continue;}
      if(!item)continue;
      const label=item.label.toLowerCase();
      if(label&&['wall','ceiling','floor','door','window'].includes(label))continue;
      if(item.width<.30||item.depth<.30||item.width>5||item.depth>5||
         item.area<.15||item.area>20)continue;
      const old=this.surfaces.get(plane);
      this.surfaces.set(plane,{...item,observations:(old?.observations??0)+1,
        lastSeen:this.frameCount});
    }
    for(const [key,item] of this.surfaces){
      if(this.frameCount-item.lastSeen>180)this.surfaces.delete(key);
    }
    const stable=[...this.surfaces.values()].filter(s=>s.observations>=5);
    const options=[];
    for(let i=0;i<stable.length;i++)for(let j=i+1;j<stable.length;j++){
      const gap=bridgeGapBetween(stable[i],stable[j]);
      if(gap)options.push(gap);
    }
    this.options=options.sort((a,b)=>a.span_m-b.span_m).slice(0,12);
    const best=this.options[0]??null;
    const prev=this.candidate;
    const same=best&&prev&&Math.abs(best.span_m-prev.span_m)<.04&&
      best.start.distanceTo(prev.start)<.08&&best.end.distanceTo(prev.end)<.08;
    this.stability=best?(same?this.stability+1:1):0;
    this.candidate=best;
    return this.status();
  }
  status(){return {surfaces:this.surfaces.size,frames:this.frameCount,
    gap:this.stability>=12?this.candidate:null,
    candidate:this.candidate,stability:this.stability,options:this.options};}
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
