import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {sessionOptions} from '../src/xr-session-config.mjs';
import {createVREnvironment} from '../src/vr-environment.js';

test('Quest virtual reality is opaque immersive-vr with floor-based reference',()=>{
  const v=sessionOptions({mode:'vr'});
  assert.equal(v.sessionType,'immersive-vr');
  assert.equal(v.referenceSpace,'local-floor');
  assert.deepEqual(v.init.requiredFeatures,['local-floor']);
  assert.ok(!v.init.requiredFeatures.includes('dom-overlay'));
  assert.ok(!v.init.optionalFeatures.includes('hit-test'));
});
test('Quest mixed reality retains passthrough AR and local space',()=>{
  const ar=sessionOptions();
  assert.equal(ar.sessionType,'immersive-ar');
  assert.equal(ar.referenceSpace,'local');
  assert.ok(ar.init.optionalFeatures.includes('hit-test'));
  const mobile=sessionOptions({mobile:true});
  assert.equal(mobile.sessionType,'immersive-ar');
  assert.ok(mobile.init.requiredFeatures.includes('dom-overlay'));
  assert.throws(()=>sessionOptions({mode:'vr',mobile:true}),/no es AR móvil/);
  assert.throws(()=>sessionOptions({mode:'nonsense'}),/desconocido/);
});
test('VR environment is hidden by default and independent of structural root',()=>{
  const room=createVREnvironment();
  assert.equal(room.visible,false);
  assert.ok(room.isGroup);
  const sky=room.getObjectByName('VR panoramic background');
  const floor=room.getObjectByName('VR virtual floor');
  const grid=room.getObjectByName('VR floor scale grid');
  assert.ok(sky?.isMesh && floor?.isMesh && grid?.type==='GridHelper');
  assert.equal(sky.material.side,THREE.BackSide);
  assert.ok(Math.abs(floor.rotation.x+Math.PI/2)<1e-12);
  assert.ok(grid.position.y>floor.position.y);
  assert.equal(room.getObjectByName('VR placement reference ring')?.isMesh,true);
  room.traverse(object=>{
    object.geometry?.dispose();
    object.material?.dispose();
  });
});
