import test from 'node:test';
import assert from 'node:assert/strict';
import {BRIDGE_SECTIONS,bridgeSampleMembers,calculateBridge,bridgeGrid} from '../src/bridge-competition-solver.mjs';
import {solveTruss2D} from '../src/truss-solver.mjs';

test('bridge competition provides exactly two bars and one tension-only cable',()=>{
  assert.deepEqual(Object.keys(BRIDGE_SECTIONS),['bar_m','bar_l','tie_m']);
  assert.equal(BRIDGE_SECTIONS.tie_m.kind,'tie');
  assert.equal(BRIDGE_SECTIONS.tie_m.I_m4,0);
});

test('reference bridge carries the default central load without collapsing',()=>{
  const result=calculateBridge({span_m:1.2,load_kN:3,members:bridgeSampleMembers()});
  assert.equal(result.status,'stable',result.reason);
  assert.equal(result.broken.length,0);
  assert.ok(result.maxDeflection_mm>=0);
  assert.ok(result.maxUtilization<1);
  assert.ok(Math.abs(result.equilibrium.fx_kN)<1e-6);
  assert.ok(Math.abs(result.equilibrium.fz_kN)<1e-6);
});

test('bridge with no design members is a mechanism, not a fabricated stress result',()=>{
  const result=calculateBridge({members:[],span_m:1.2,load_kN:3});
  assert.equal(result.status,'collapse');
  assert.equal(result.maxDeflection_mm,null);
});

test('an independently triangulated planar truss solves without singularities',()=>{
  const nodes=[
    {id:'A',x:0,z:0,fixX:true,fixZ:true},
    {id:'B',x:.5,z:0},
    {id:'C',x:1,z:0,fixZ:true},
    {id:'D',x:.5,z:.4}
  ];
  const bars=[
    ['A','B'],['B','C'],['A','D'],['D','B'],['D','C']
  ].map(([i,j],k)=>({id:'M'+k,i,j,E_kN_m2:210e6,A_m2:.0008}));
  const result=solveTruss2D({nodes,bars},[{nodeId:'B',fz_kN:-3}]);
  assert.ok(result.maxDisplacement_m>0);
});
