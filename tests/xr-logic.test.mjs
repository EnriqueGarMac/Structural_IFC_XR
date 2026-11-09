import test from 'node:test';
import assert from 'node:assert/strict';
import {clamp,rotateIndex,snapModelSize,isValidHorizontalHit,placeObjectOnHit,
  caseLabel,nextUniquePattern,amplificationFromSliderX,sliderXFromAmplification} from '../src/xr-logic.mjs';

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

test('deformation slider maps trigger position to amplification 0..150',()=>{
  assert.equal(amplificationFromSliderX(163),0);
  assert.equal(amplificationFromSliderX(604),150);
  assert.equal(amplificationFromSliderX(383.5),75);
  assert.equal(amplificationFromSliderX(-100),0);
  assert.equal(amplificationFromSliderX(10000),150);
});
test('amplification-to-knob and knob-to-amplification roundtrip',()=>{
  for(const amp of [0,1,25,75,100,149,150]){
    assert.equal(amplificationFromSliderX(sliderXFromAmplification(amp)),amp);
  }
});

test('Quest slider handles small safe amplification ranges without integer snapping',()=>{
  assert.equal(amplificationFromSliderX(163,163,604,.8),0);
  assert.equal(amplificationFromSliderX(604,163,604,.8),.8);
  assert.equal(amplificationFromSliderX(383.5,163,604,.8),.4);
  assert.equal(amplificationFromSliderX(383.5,163,604,8),4);
  assert.equal(sliderXFromAmplification(.4,163,604,.8),383.5);
});
