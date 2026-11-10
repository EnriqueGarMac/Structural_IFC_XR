import * as THREE from 'three';

// Fit the actual VISIBLE BIM solids, in world coordinates, to the viewport.
// The model's site terrain is included only when the terrain is shown.
// The fixed orientation is retained while OrbitControls target follows the
// true centre of the visible model. Geometry and model transforms are never
// changed by this operation.
export function visibleModelBounds(parts,{hideGround=false,showStructureOnly=false}={}){
  const bounds=new THREE.Box3();
  for(const part of parts??[]){
    if(hideGround&&part.terrain)continue;
    if(showStructureOnly&&part.structural===false)continue;
    const mesh=part.orig;
    if(!mesh?.geometry||!mesh.matrixWorld)continue;
    mesh.geometry.computeBoundingBox();
    if(!mesh.geometry.boundingBox?.isEmpty()){
      const transformed=mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
      bounds.union(transformed);
    }
  }
  return bounds;
}
export function fitPerspectiveToBounds(camera,bounds,{
  direction=new THREE.Vector3(1.5,1.05,1.65),margin=1.4
}={}){
  if(!camera?.isPerspectiveCamera||bounds?.isEmpty?.()!==false)return null;
  const radius=Math.max(.001,bounds.getBoundingSphere(new THREE.Sphere()).radius);
  const center=bounds.getCenter(new THREE.Vector3());
  const tanV=Math.tan(Math.max(.01,THREE.MathUtils.degToRad(camera.fov)/2));
  const tanH=tanV*Math.max(.08,camera.aspect);
  // Fit the eight box corners as seen from the viewing direction, not the
  // bounding sphere: a sphere wastes most of the screen on long, slender
  // models (an 18 m plate girder, a truss). Same camera basis as lookAt.
  const unitDirection=direction.clone().normalize();
  const right=new THREE.Vector3().crossVectors(camera.up,unitDirection);
  if(right.lengthSq()<1e-12)right.set(1,0,0);
  right.normalize();
  const up=new THREE.Vector3().crossVectors(unitDirection,right);
  // A 40 % margin on the projected extent keeps the model clear of the
  // legend, the toolbar and the selection highlight.
  const m=Math.max(1,margin);
  let dist=.001;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])
    for(const z of [bounds.min.z,bounds.max.z]){
      const p=new THREE.Vector3(x,y,z).sub(center);
      const depth=p.dot(unitDirection);
      dist=Math.max(dist,depth+m*Math.abs(p.dot(right))/tanH,depth+m*Math.abs(p.dot(up))/tanV);
    }
  camera.position.copy(center).addScaledVector(unitDirection,dist);
  camera.near=Math.max(.001,(dist-radius*1.8)/300);
  camera.far=Math.max(500,dist+radius*6);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return {center:center.clone(),distance:dist,radius};
}
