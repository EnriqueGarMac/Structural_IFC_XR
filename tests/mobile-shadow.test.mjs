import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {projectOntoGround,computeShadowFootprint,createBakedShadow} from '../src/mobile-shadow.js';

const sample=()=>{
  const scene=new THREE.Scene();
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),
    new THREE.MeshStandardMaterial({color:0x39a2c9}));
  mesh.position.set(0,.5,0);
  scene.add(mesh);
  return scene;
};
test('projected points move away from the virtual light as height increases',()=>{
  assert.deepEqual(projectOntoGround(1,2,3),[.31999999999999995,2.46]);
  assert.deepEqual(projectOntoGround(1,0,3),[1,3]);
});
test('shadow footprint derives from actual model geometry and ignores empty scenes',()=>{
  assert.equal(computeShadowFootprint(new THREE.Scene()),null);
  const bounds=computeShadowFootprint(sample());
  assert.ok(bounds);
  assert.ok(bounds.count>=36);
  assert.ok(bounds.left<0&&bounds.right>0);
  assert.ok(bounds.top<0&&bounds.bottom>0);
});
test('iPhone fallback shadow is a separate translucent textured ground decal',()=>{
  const previous=globalThis.document;
  let draws=0;
  const context=()=>({
    beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){draws++;},
    drawImage(){},fillRect(){},
    set fillStyle(v){this._fill=v},get fillStyle(){return this._fill},
    set globalAlpha(v){this._alpha=v},get globalAlpha(){return this._alpha},
    set filter(v){this._filter=v},get filter(){return this._filter},
    set globalCompositeOperation(v){this._op=v},
    get globalCompositeOperation(){return this._op}
  });
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context()})};
  try{
    const scene=sample();
    const shadow=createBakedShadow(scene,{size:128,opacity:.5});
    assert.ok(shadow.isMesh);
    assert.equal(shadow.userData.isBakedShadow,true);
    assert.equal(shadow.material.transparent,true);
    assert.ok(shadow.material.map.isTexture);
    assert.equal(shadow.position.y,.003);
    assert.ok(draws>0);
    assert.equal(computeShadowFootprint(scene).verts.length,1); // ignore shadow itself
    shadow.geometry.dispose();shadow.material.map.dispose();shadow.material.dispose();
  }finally{globalThis.document=previous;}
});
