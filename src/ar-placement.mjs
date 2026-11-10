import * as THREE from 'three';

// Work only on already-loaded IFC geometry. No extra shadow assets enter USDZ
// or XR scenes. The same helper supports Quest controller & mobile hit-tests.
function boxForMesh(mesh){
  if(!mesh?.geometry)return null;
  mesh.geometry.computeBoundingBox();
  if(!mesh.geometry.boundingBox)return null;
  mesh.updateWorldMatrix(true,false);
  return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
}
export function modelPlacementBounds(app){
  const bounds=new THREE.Box3(),terrain=[];
  for(const part of app.parts??[]){
    if(app.hideGround&&part.terrain)continue;
    if(app.showStructureOnly&&part.structural===false)continue;
    if(app.showSAPOnly)continue;
    if(!part.orig?.visible)continue;
    const box=boxForMesh(part.orig);
    if(!box||box.isEmpty())continue;
    bounds.union(box);
    if(part.terrain&&/IFCGEOGRAPHICELEMENT|IFCSITE/i.test(part.ifcType??''))
      terrain.push(box);
  }
  // With "solo modelo de cálculo" active the original geometry is hidden.
  // Use the true structural frames as the physical support reference.
  if(bounds.isEmpty()){
    const offsets=app.offset??[0,0,0],nodeBox=new THREE.Box3();
    for(const n of app.results?.nodes??[]){
      nodeBox.expandByPoint(new THREE.Vector3(
        n.x+offsets[0],n.y+offsets[1],n.z+offsets[2]));
    }
    if(!nodeBox.isEmpty()){
      const parent=app.contentRoot;parent.updateWorldMatrix(true,false);
      nodeBox.applyMatrix4(parent.matrixWorld);
      bounds.union(nodeBox);
    }
  }
  return {bounds,terrain};
}
export function supportOffsetY(app){
  app.worldRoot.updateWorldMatrix(true,true);
  const {bounds,terrain}=modelPlacementBounds(app);
  if(bounds.isEmpty())return 0;
  // If the site is visible, rest its walking surface on the real plane;
  // otherwise rest the lowest visible structural geometry on that plane.
  const siteTop=terrain.length?Math.max(...terrain.map(box=>box.max.y)):bounds.min.y;
  return siteTop-app.worldRoot.position.y;
}
export function placeModelOnSurface(app,point,{clearance=.003}={}){
  if(!point||![point.x,point.y,point.z].every(Number.isFinite))return null;
  const support=supportOffsetY(app);
  app.worldRoot.position.set(point.x,point.y-support+clearance,point.z);
  return {position:app.worldRoot.position.clone(),support};
}
export function planeFromDetection(plane,frame,referenceSpace){
  if(!plane?.polygon?.length||!plane.planeSpace||!frame?.getPose)return null;
  const pose=frame.getPose(plane.planeSpace,referenceSpace);
  if(!pose?.transform?.matrix)return null;
  const matrix=new THREE.Matrix4().fromArray(pose.transform.matrix);
  const normal=new THREE.Vector3(0,1,0).transformDirection(matrix);
  // Not a usable tabletop if significantly tilted or vertical.
  if(Math.abs(normal.y)<.9)return null;
  const bounds=new THREE.Box3();
  for(const vertex of plane.polygon)
    bounds.expandByPoint(new THREE.Vector3(vertex.x,vertex.y,vertex.z).applyMatrix4(matrix));
  const size=bounds.getSize(new THREE.Vector3());
  if(size.x<.30||size.z<.30||size.x>20||size.z>20)return null;
  return {width:size.x,depth:size.z,top:bounds.max.y,
    bounds,area:size.x*size.z,label:String(plane.semanticLabel??'')};
}
export function matchingTablePlane(frame,referenceSpace,point){
  if(!point||!frame?.detectedPlanes)return null;
  let best=null,score=Infinity;
  for(const plane of frame.detectedPlanes){
    let candidate;
    try{candidate=planeFromDetection(plane,frame,referenceSpace);}catch{continue;}
    if(!candidate)continue;
    if(point.x<candidate.bounds.min.x-.06||point.x>candidate.bounds.max.x+.06||
       point.z<candidate.bounds.min.z-.06||point.z>candidate.bounds.max.z+.06||
       Math.abs(candidate.top-point.y)>.10)continue;
    const tableBySize=candidate.width<=2.4&&candidate.depth<=2.4;
    if(!tableBySize&&candidate.label.toLowerCase()!=='table')continue;
    const distance=Math.abs(candidate.top-point.y);
    if(distance<score){best=candidate;score=distance;}
  }
  return best;
}
export function tableFitSize(app,plane,{margin=.78,min=.12,max=5}={}){
  if(!plane?.width||!plane?.depth||!app?.maxSize)return null;
  app.worldRoot.updateWorldMatrix(true,true);
  const {bounds}=modelPlacementBounds(app);
  if(bounds.isEmpty())return null;
  const size=bounds.getSize(new THREE.Vector3());
  if(size.x<=1e-9||size.z<=1e-9)return null;
  const factor=Math.min(plane.width/size.x,plane.depth/size.z)*margin;
  const desired=app.targetMeters*factor;
  if(!Number.isFinite(desired)||desired<min)return null;
  return Math.min(max,Math.max(min,Number(desired.toFixed(2))));
}
