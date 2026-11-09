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
  direction=new THREE.Vector3(1.5,1.05,1.65),margin=1.22
}={}){
  if(!camera?.isPerspectiveCamera||bounds?.isEmpty?.()!==false)return null;
  const sphere=bounds.getBoundingSphere(new THREE.Sphere());
  const radius=Math.max(.001,sphere.radius);
  const vFov=THREE.MathUtils.degToRad(camera.fov);
  const halfV=vFov/2;
  const halfH=Math.atan(Math.tan(halfV)*Math.max(.08,camera.aspect));
  // A sphere of radius R fits the entire rectangle if R <= d*sin(fov/2).
  // Include a 22 % margin for selection/highlighting and sidebars.
  const dist=Math.max(
    radius/Math.sin(Math.max(.01,halfV)),
    radius/Math.sin(Math.max(.01,halfH))
  )*Math.max(1,margin);
  const center=sphere.center;
  const unitDirection=direction.clone().normalize();
  camera.position.copy(center).addScaledVector(unitDirection,dist);
  camera.near=Math.max(.001,(dist-radius*1.8)/300);
  camera.far=Math.max(500,dist+radius*6);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return {center:center.clone(),distance:dist,radius};
}
