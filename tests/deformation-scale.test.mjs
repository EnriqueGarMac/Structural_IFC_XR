import test from 'node:test';
import assert from 'node:assert/strict';
import {
  structuralSpan,maxCaseDeflection,deformationScale,clampAmplification,
  formatAmplification
} from '../src/deformation-scale.mjs';
import {demoResults} from '../src/demo.js';
import {roofDemoResults} from '../src/roof-demo.js';

test('adaptive amplification uses structural nodes, not the much larger IFC terrain',()=>{
  for(const model of [demoResults,roofDemoResults]){
    const span=structuralSpan(model);
    assert.ok(span>7&&span<35,'Unexpected structural span '+span);
    for(const c of model.cases){
      const {maxAmp,defaultAmp,displacement,step}=deformationScale(model,c.name);
      assert.ok(displacement>0,'Missing FEM results '+c.name);
      assert.ok(maxAmp>0 && maxAmp<25000,'Unsafe maximum for '+c.name+': '+maxAmp);
      assert.ok(defaultAmp<=maxAmp,'Default > max');
      assert.ok(defaultAmp>0,'Default empty');
      // Underlying true displacement is preserved; graphical offset stays
      // below 12 % of the structural span, even at maximum slider travel.
      assert.ok(maxAmp*displacement<=span*.12+1e-6,
        c.name+' maximum screen deformation exceeds safety budget');
      assert.ok(defaultAmp*displacement<=span*.015+1e-6,
        c.name+' default deformation visually exaggerated');
      assert.ok(defaultAmp*displacement>span*.010,
        c.name+' default deformation too small');
      assert.ok(step>0);
    }
  }
});
test('beam midspan bending (not just the joint displacements) limits amplification',()=>{
  const model={nodes:[{id:'1',x:0,y:0,z:0},{id:'2',x:10,y:0,z:0}],
    cases:[{name:'DEAD',displacements:[
      {node:'1',ux:0,uy:0,uz:0},{node:'2',ux:0,uy:0,uz:0}
    ]}],frameCurves:{DEAD:{B:[[0,0,0],[0,0,-.010],[0,0,0]]}}};
  assert.equal(maxCaseDeflection(model,'DEAD'),.010);
  const range=deformationScale(model,'DEAD');
  assert.equal(range.span,10);
  assert.ok(range.maxAmp<=120);
  assert.ok(range.defaultAmp>10 && range.defaultAmp<15);
});
test('no displacement case is safe and all updates are clamped',()=>{
  const r=deformationScale({nodes:[{x:0,y:0,z:0}],cases:[]},'UNKNOWN');
  assert.equal(r.defaultAmp,1);
  assert.equal(r.maxAmp,1);
  assert.equal(clampAmplification(100,15),15);
  assert.equal(clampAmplification(-3,15),0);
  assert.equal(clampAmplification('NaN',15),0);
  assert.equal(formatAmplification(10),'×10');
  assert.equal(formatAmplification(.75),'×0,75');
});
