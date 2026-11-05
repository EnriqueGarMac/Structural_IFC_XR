import test from 'node:test';
import assert from 'node:assert/strict';
import {clamp,rotateIndex,snapModelSize,isValidHorizontalHit,placeObjectOnHit,
  caseLabel,nextUniquePattern} from '../src/xr-logic.mjs';

test('XR model size is bounded and adjusted in readable intervals',()=>{
  assert.equal(snapModelSize(2.5,.2),2.7);
  assert.equal(snapModelSize(5,.2),5);
  assert.equal(snapModelSize(.4,-.3),.4);
});
test('results cases wrap in either direction',()=>{
  assert.equal(rotateIndex(0,-1,3),2);
  assert.equal(rotateIndex(2,1,3),0);
  assert.equal(rotateIndex(0,1,0),-1);
  assert.equal(caseLabel([{name:'G'},{name:'Q'}],1),'Q');
  assert.equal(caseLabel([],0),'SIN DEFORMADAS');
});
test('loads pattern navigation includes all patterns',()=>{
  const loads=[{pattern:'G'},{pattern:'Q'},{pattern:'G'}];
  assert.equal(nextUniquePattern(loads,'all',1),'G');
  assert.equal(nextUniquePattern(loads,'G',1),'Q');
  assert.equal(nextUniquePattern(loads,'Q',1),'all');
});
test('only nearly-horizontal supports are used for room placement',()=>{
  assert.equal(isValidHorizontalHit([0,1,0]),true);
  assert.equal(isValidHorizontalHit([.2,.9,.1]),true);
  assert.equal(isValidHorizontalHit([1,0,0]),false);
  assert.equal(isValidHorizontalHit([0,-1,0]),false);
});
test('placement remains aligned to the chosen hit position',()=>{
  assert.deepEqual(placeObjectOnHit([1,.7,2],[0,1,0],.04),[1,.74,2]);
  assert.equal(placeObjectOnHit([0,1,0],[1,0,0],.04),null);
});
test('clamp handles input outside bounds',()=>{
  assert.equal(clamp(-1,0,5),0);
  assert.equal(clamp(8,0,5),5);
  assert.equal(clamp(2,0,5),2);
});
