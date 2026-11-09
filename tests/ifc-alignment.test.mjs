import test from 'node:test';
import assert from 'node:assert/strict';
import {ROTATIONS,findRotation,rotateVector,findBestAlignment,frameSamples,makeIFCTransformElements} from '../src/ifc-alignment.mjs';
import {makeBeamFieldSampler} from '../src/beam-field.mjs';

const example={
  nodes:[{id:'1',x:-5,y:0,z:0},{id:'2',x:5,y:0,z:0},
         {id:'3',x:0,y:0,z:3.7},{id:'4',x:1,y:0,z:2.1}],
  frames:[{id:'B1',i:'1',j:'3'},{id:'B2',i:'3',j:'2'},{id:'B3',i:'1',j:'2'},{id:'B4',i:'3',j:'4'}],
  cases:[{name:'DEAD',displacements:[
     {node:'1',ux:0,uy:0,uz:0},{node:'2',ux:0,uy:0,uz:0},
     {node:'3',ux:0,uy:0,uz:-.0001},{node:'4',ux:0,uy:0,uz:-.00015}
  ]}],
  frameCurves:{DEAD:{B1:[[0,0,0],[0,0,-.0003],[0,0,-.0001]]}},
  modes: [{number:1,frequency_hz:2.5,jointShape:{'1':[0,0,0],'3':[0,1,0]},frameCurves:{B1:[[0,0,0],[0,1,0]]}}]
};
test('24 rigid rotations, determinant positive, and manually selected quarter turns',()=>{
  assert.equal(ROTATIONS.length,24);
  for(const r of ROTATIONS){
    const a=rotateVector([1,0,0],r),b=rotateVector([0,1,0],r),c=rotateVector([0,0,1],r);
    const cross=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    assert.deepEqual(cross,c);
  }
  assert.deepEqual(rotateVector([1,2,3],findRotation('x90')),[1,-3,2]);
  assert.deepEqual(rotateVector([1,2,3],findRotation('x_90')),[1,3,-2]);
});
test('automatically corrects a truss rotated 90 degrees with translation',()=>{
  // SAP truss is in XZ. IFC was exported in XY, with a different origin.
  const sapSamples=frameSamples(example);
  const points=sapSamples.map(p=>[p[0]+6,p[2]+3,11]); // IFC XY plane
  const attr={count:points.length,getX:i=>points[i][0],getY:i=>points[i][1],getZ:i=>points[i][2]};
  const parts=[{geometry:{getAttribute:()=>attr}}];
  const fit=findBestAlignment(parts,example);
  assert.ok(fit.rms_m<.000001,'RMS='+fit.rms_m+'; rotation '+fit.rotation.key);
  const arr=makeIFCTransformElements(fit);
  assert.equal(arr.length,16);
  assert.ok(arr.every(Number.isFinite));
  assert.ok(Math.abs(Math.abs(arr[0])+Math.abs(arr[1])+Math.abs(arr[2])-1)<1e-10);
});
test('project IFC vertex onto measured beam and preserve physical scale',()=>{
  const sample=makeBeamFieldSampler(example,{caseName:'DEAD'});
  const d=sample(-3.75,0,.925); // 1/4 of B1, station fraction 0.25
  assert.ok(d[2]<-.00011 && d[2]>-.00020,JSON.stringify(d));
  const modal=makeBeamFieldSampler(example,{mode:example.modes[0]});
  const m=modal(-2.5,0,1.85);
  assert.ok(m[1]>.45 && m[1]<.55,JSON.stringify(m));
  assert.equal(m[0],0);
});
