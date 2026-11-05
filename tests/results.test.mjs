import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeResults,caseNodes,interpolateDisplacement,maxDisplacement,selectedLoads,analyticalNodePositions } from '../src/results.mjs';
const good={nodes:[{id:'A',x:0,y:0,z:0},{id:'B',x:2,y:0,z:0}],frames:[{id:'E',i:'A',j:'B'}],loads:[{frame:'E',pattern:'G',w1:-2,w2:-4}],cases:[{name:'LC1',displacements:[{node:'A',ux:0,uy:0,uz:0},{node:'B',ux:0,uy:0,uz:-.01}]}]};
test('validate units and identifiers',()=>{
  const s=normalizeResults(good);
  assert.equal(s.meta.units,'m, kN');assert.equal(s.nodes[1].x,2);assert.equal(s.loads[0].end,1);
});
test('nodal interpolation exact at node',()=>{
  const s=normalizeResults(good),p=caseNodes(s,'LC1');
  assert.deepEqual(interpolateDisplacement(2,0,0,p),[0,0,-.01,.01]);
  assert.equal(maxDisplacement(p),.01);
});
test('interpolation midpoint is intermediate',()=>{
  const s=normalizeResults(good),p=caseNodes(s,'LC1');
  const z=interpolateDisplacement(1,0,0,p)[2];
  assert.ok(z<-.0049 && z>-.0051);
});
test('coordinate offset leaves displacement unchanged',()=>{
  const s=normalizeResults(good),p=caseNodes(s,'LC1',[2,3,4]);
  assert.equal(p[0].x,2);assert.equal(p[0].y,3);assert.equal(p[0].z,4);
  assert.equal(p[1].uz,-.01);
});
test('filter applied loads by pattern',()=>{
  const s=normalizeResults(good);assert.equal(selectedLoads(s,'G').length,1);assert.equal(selectedLoads(s,'Q').length,0);
});
test('reject invalid geometry & loads',()=>{
  assert.throws(()=>normalizeResults({nodes:[{id:'A',x:'oops',y:0,z:0}]}),/coordenadas/i);
  assert.throws(()=>normalizeResults({nodes:[{id:'A'},{id:'A'}]}),/duplicado/i);
  assert.throws(()=>normalizeResults({loads:[{frame:'B',w1:'no'}]}),/cargas/i);
});
import { makeDisplacementSampler } from '../src/results.mjs';
test('spatial index matches exact displacement at a large model joint',()=>{
  const sampleNodes=Array.from({length:100},(_,i)=>({x:i,y:(i%5)*3,z:0,ux:.001*i,uy:0,uz:-.002*i,magnitude:.002*i}));
  const fn=makeDisplacementSampler(sampleNodes);
  assert.deepEqual(fn(53,9,0),[.053,0,-.106,.106]);
});

test('SAP-only analytic bars follow amplified case nodal displacements',()=>{
  const original=caseNodes(normalizeResults(good),'LC1');
  const displaced=analyticalNodePositions(original,50,true);
  assert.equal(displaced[0].z,0);
  assert.ok(Math.abs(displaced[1].z-(-.5))<1e-12);
  assert.equal(original[1].z,0);
  assert.equal(displaced[1].uz,-.01);
  assert.equal(maxDisplacement(displaced),.01);
});
test('SAP frame coordinates remain undeformed when amplification is disabled',()=>{
  const original=caseNodes(normalizeResults(good),'LC1');
  assert.equal(analyticalNodePositions(original,150,false),original);
  assert.equal(analyticalNodePositions(original,0,true)[1].z,0);
});
