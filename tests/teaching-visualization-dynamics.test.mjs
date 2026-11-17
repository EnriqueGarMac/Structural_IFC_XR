import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridgeCollapseDynamics,stepBridgeCollapseDynamics,
  resolveBridgeCylinderFloor}
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

test('unused grid points are not part of the collapse simulation',()=>{
  const nodes=[
    {id:'B0',x:0,z:0,fixX:true,fixZ:true},
    {id:'B2',x:.5,z:0},
    {id:'B4',x:1,z:0,fixZ:true},
    {id:'G1',x:.25,z:.3},
    {id:'G2',x:.75,z:.3}
  ];
  const members=[{id:'M1',i:'B0',j:'B2'},{id:'M2',i:'B2',j:'B4'}];
  const state=createBridgeCollapseDynamics(nodes,members,[], -.65);
  assert.deepEqual([...state.positions.keys()],['B0','B2','B4']);
  assert.equal(state.positions.has('G1'),false);
  assert.equal(state.positions.has('G2'),false);
  for(let i=0;i<150;i++)stepBridgeCollapseDynamics(state,1/60);
  assert.equal(state.positions.has('G1'),false);
  assert.equal(state.positions.has('G2'),false);
  const empty=createBridgeCollapseDynamics(nodes,[],[],-.65);
  assert.equal(empty.positions.size,0);
  stepBridgeCollapseDynamics(empty,1/60);
  assert.equal(empty.positions.size,0);
});

test('finite-radius surviving members do not penetrate the floor',()=>{
  const floor=-.5,radius=.04;
  const nodes=[
    {id:'A',x:0,z:0,fixX:true,fixZ:true},
    {id:'B',x:.5,z:0},
    {id:'C',x:1,z:0}
  ];
  const members=[
    {id:'M1',i:'A',j:'B',radius},
    {id:'M2',i:'B',j:'C',radius}
  ];
  const state=createBridgeCollapseDynamics(nodes,members,[],floor);
  // Detach the free component to let both members settle.
  state.edges=[];
  for(let i=0;i<240;i++)stepBridgeCollapseDynamics(state,1/60);
  for(const [id,p] of state.positions){
    if(id==='A')continue;
    assert.ok(p.z-radius>=floor-1e-8,
      'Entire member thickness should remain above the collision plane');
    assert.ok(Math.abs(p.z-(floor+radius))<1e-6,
      'Free node should settle against the ground without continuous bounce');
  }
});
test('tilted fracture fragments are resolved using their full cylinder extent',()=>{
  const floor=-.75;
  for(const axisZ of [-1,-.7,0,.8,1]){
    const collision=resolveBridgeCylinderFloor(-2,axisZ,.6,.025,floor);
    assert.equal(collision.contact,true);
    assert.ok(collision.lowestZ>=floor-1e-10,
      'No orientation may extend below the physical floor');
    const free=resolveBridgeCylinderFloor(0,axisZ,.6,.025,floor);
    assert.equal(free.contact,false);
    assert.equal(free.centerZ,0);
  }
});
