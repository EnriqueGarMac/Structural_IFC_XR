import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridgeCollapseDynamics,stepBridgeCollapseDynamics}
  from '../src/bridge-collapse-dynamics.mjs';
import {solveTruss2D,TRUSS_LESSON,defaultTrussLoads} from '../src/truss-solver.mjs';

test('independently changing a member area updates truss stiffness and displacement',()=>{
  const base=solveTruss2D(TRUSS_LESSON,defaultTrussLoads());
  const stiff={...TRUSS_LESSON,bars:TRUSS_LESSON.bars.map(b=>({...b,A_m2:b.A_m2*3}))};
  const stronger=solveTruss2D(stiff,defaultTrussLoads());
  assert.ok(stronger.maxDisplacement_m<base.maxDisplacement_m);
  assert.ok(Math.abs(stronger.maxDisplacement_m*3-base.maxDisplacement_m)<1e-8);
});
test('collapse animation preserves pins, roller height and ground collision',()=>{
  const nodes=[
    {id:'B0',x:0,z:0,fixX:true,fixZ:true},
    {id:'B2',x:.5,z:0},
    {id:'B4',x:1,z:0,fixZ:true}
  ];
  const m=[{id:'M1',i:'B0',j:'B2'},{id:'M2',i:'B2',j:'B4'}];
  const state=createBridgeCollapseDynamics(nodes,m,[], -.65);
  state.edges=state.edges.filter(e=>e.id!=='M1');
  for(let i=0;i<300;i++)stepBridgeCollapseDynamics(state,1/60);
  assert.equal(state.positions.get('B0').x,0);
  assert.equal(state.positions.get('B0').z,0);
  assert.equal(state.positions.get('B4').z,0);
  assert.ok([...state.positions.values()].every(p=>
    Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.z>=-.65-1e-8));
  assert.ok(state.positions.get('B2').z<0);
});
