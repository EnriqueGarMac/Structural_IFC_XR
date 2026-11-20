import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {xrSceneInventory} from '../src/xr-scene-inventory.mjs';

test('XR inventory counts only visible meshes and respects parent visibility',()=>{
  const scene=new THREE.Scene(),originalGroup=new THREE.Group();
  scene.add(originalGroup);
  const geometry=new THREE.BoxGeometry(1,1,1);
  const material=new THREE.MeshBasicMaterial();
  const first=new THREE.Mesh(geometry,material);
  const second=new THREE.Mesh(geometry,material);
  originalGroup.add(first,second);
  second.visible=false;
  const app={scene,originalGroup};
  let stats=xrSceneInventory(app);
  assert.equal(stats.originalGroup.meshes,1);
  assert.equal(stats.originalGroup.geometries,1);
  assert.equal(stats.originalGroup.materials,1);
  assert.equal(stats.total.meshes,1);
  assert.equal(stats.originalGroup.triangles,12);
  originalGroup.visible=false;
  stats=xrSceneInventory(app);
  assert.equal(stats.originalGroup.meshes,0);
  assert.equal(stats.total.meshes,0);
  assert.equal(first.visible,true);
  assert.equal(second.visible,false);
});
