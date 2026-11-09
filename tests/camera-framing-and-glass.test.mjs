import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {visibleModelBounds,fitPerspectiveToBounds} from '../src/camera-framing.mjs';
import {ifcElementOpacity} from '../src/ifc-opacity.mjs';

function makePart(group,id,position,size,{terrain=false,structural=true}={}){
  const geom=new THREE.BoxGeometry(...size);
  const mesh=new THREE.Mesh(geom,new THREE.MeshBasicMaterial());
  mesh.name=id;mesh.position.set(...position);group.add(mesh);
  return {orig:mesh,terrain,structural};
}
test('the camera fits and centres the visible building, not a hidden parcel',()=>{
  const scene=new THREE.Scene(),root=new THREE.Group(),content=new THREE.Group();
  scene.add(root);root.add(content);
  root.rotation.x=-Math.PI/2;root.scale.setScalar(.125);
  const building=makePart(content,'building',[15,8,6],[12,8,12]);
  const site=makePart(content,'site',[15,8,-.6],[42,56,.4],{terrain:true,structural:false});
  scene.updateMatrixWorld(true);
  const hidden=visibleModelBounds([building,site],{hideGround:true});
  const visible=visibleModelBounds([building,site],{hideGround:false});
  assert.ok(visible.getSize(new THREE.Vector3()).length()>hidden.getSize(new THREE.Vector3()).length());
  const camera=new THREE.PerspectiveCamera(45,1.5,.01,1000);
  const framing=fitPerspectiveToBounds(camera,hidden);
  assert.ok(framing);
  const centre=hidden.getCenter(new THREE.Vector3());
  assert.ok(camera.position.distanceTo(centre)>0);
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).length()>0);
  assert.ok(framing.center.distanceTo(centre)<1e-10);
  const aspectWide=framing.distance;
  camera.aspect=.43;
  const narrow=fitPerspectiveToBounds(camera,hidden);
  assert.ok(narrow.distance>aspectWide*1.3,
    'Portrait devices must fit the complete width without clipping');
  assert.ok(visibleModelBounds([building,site],{showStructureOnly:true}).equals(hidden));
  assert.equal(fitPerspectiveToBounds(camera,new THREE.Box3()),null);
  building.orig.geometry.dispose();building.orig.material.dispose();
  site.orig.geometry.dispose();site.orig.material.dispose();
});
test('windows have 40% transparent default, but user-controlled opacity is respected',()=>{
  assert.equal(ifcElementOpacity({opacity:1,ifcType:'IfcWindow'}),.6);
  assert.equal(ifcElementOpacity({opacity:1,ifcType:'IFCWINDOW'}),.6);
  assert.equal(ifcElementOpacity({opacity:.25,ifcType:'IfcWindow'}),.25);
  assert.equal(ifcElementOpacity({opacity:1,ifcType:'IfcWall'}),1);
  assert.equal(ifcElementOpacity({opacity:1,ifcType:'IfcColumn'}),1);
  assert.equal(ifcElementOpacity({opacity:.8,scope:'all',ifcType:'IfcWindow'}),.6);
});
