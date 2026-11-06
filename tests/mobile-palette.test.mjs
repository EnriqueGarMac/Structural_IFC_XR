import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {DEFORMATION_STOPS,deformationColour,bakeHeatUV} from '../src/mobile-palette.js';

test('SAP colour legend is preserved in the USDZ texture gradient',()=>{
  assert.equal(DEFORMATION_STOPS.length,4);
  for(const [v,hex] of DEFORMATION_STOPS){
    assert.equal(deformationColour(v).getHex(),hex);
  }
  assert.notEqual(deformationColour(0).getHex(),0xffffff);
  assert.notEqual(deformationColour(1).getHex(),0xffffff);
});
test('normalized node displacements become UV texture coordinates',()=>{
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([
    0,0,0,1,0,0,0,1,0
  ],3));
  geometry.setAttribute('heat',new THREE.Float32BufferAttribute([0,.45,1],1));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute([
    1,0,0, 1,1,0, 0,0,1
  ],3));
  bakeHeatUV(geometry);
  assert.deepEqual(Array.from(geometry.getAttribute('uv').array),[0,.5,.44999998807907104,.5,1,.5]);
  assert.equal(geometry.getAttribute('color'),undefined);
  geometry.dispose();
});
test('texture mapping safely clamps out-of-range heat values',()=>{
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  geometry.setAttribute('heat',new THREE.Float32BufferAttribute([-2,.5,3],1));
  bakeHeatUV(geometry);
  assert.deepEqual(Array.from(geometry.getAttribute('uv').array),[0,.5,.5,.5,1,.5]);
  geometry.dispose();
});
