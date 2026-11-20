import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {XRStaticBIMBatch} from '../src/xr-static-bim-batch.js';

test('static XR batching reduces visible BIM meshes without touching structural parts',()=>{
  const originalGroup=new THREE.Group(),parts=[];
  for(let i=0;i<40;i++){
    const geometry=new THREE.BoxGeometry(1,1,1);
    geometry.translate(i*2,0,0);
    const orig=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({
      color:0x88aabb,side:THREE.DoubleSide
    }));
    originalGroup.add(orig);
    parts.push({orig,structural:i===39});
  }
  const app={isXR:true,mobileAR:false,originalGroup,parts};
  const batch=new XRStaticBIMBatch(app);
  batch.refresh();
  assert.equal(batch.count,39);
  assert.equal(originalGroup.children.filter(x=>x.visible).length,2);
  assert.equal(parts[39].orig.visible,true);
  assert.equal(batch.mesh.geometry.getAttribute('position').count,39*36);
  batch.clear();
  assert.equal(originalGroup.children.length,40);
  assert.equal(originalGroup.children.filter(x=>x.visible).length,40);
});
test('transparent BIM remains individually rendered',()=>{
  const originalGroup=new THREE.Group(),parts=[];
  for(let i=0;i<40;i++){
    const orig=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({
      transparent:true,opacity:.5,side:THREE.DoubleSide
    }));
    originalGroup.add(orig);parts.push({orig,structural:false});
  }
  const batch=new XRStaticBIMBatch({isXR:true,originalGroup,parts});
  batch.refresh();
  assert.equal(batch.count,0);
  assert.equal(originalGroup.children.length,40);
});
