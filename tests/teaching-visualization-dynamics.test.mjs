import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridgeCollapseDynamics,stepBridgeCollapseDynamics,
  resolveBridgeCylinderFloor,stepBridgeLooseFragment,bridgeFragmentScatter,
  syncBridgeEdgeRestLengths}
  from '../src/bridge-collapse-dynamics.mjs';
import {solveTruss2D,TRUSS_LESSON,defaultTrussLoads} from '../src/truss-solver.mjs';

test('independently changing a member area updates truss stiffness and displacement',()=>{
  const base=solveTruss2D(TRUSS_LESSON,defaultTrussLoads());
  const stiff={...TRUSS_LESSON,bars:TRUSS_LESSON.bars.map(b=>({...b,A_m2:b.A_m2*3}))};
  const stronger=solveTruss2D(stiff,defaultTrussLoads());
  assert.ok(stronger.maxDisplacement_m<base.maxDisplacement_m);
  assert.ok(Math.abs(stronger.maxDisplacement_m*3-base.maxDisplacement_m)<1e-8);
});
test('surviving constraints inherit the last deformed equilibrium before collapse',()=>{
  const state=createBridgeCollapseDynamics([
    {id:'A',x:0,z:0,fixX:true,fixZ:true},
    {id:'B',x:.5,z:-.1},
    {id:'C',x:1,z:0,fixX:true,fixZ:true}
  ],[
    {id:'M1',i:'A',j:'B'},
    {id:'M2',i:'B',j:'C'}
  ],[],-.75);
  const p=state.positions.get('B');
  p.x=.53;p.z=-.21;p.oldX=p.x;p.oldZ=p.z;
  const stale=state.edges.map(e=>e.rest);
  syncBridgeEdgeRestLengths(state);
  const updated=state.edges.map(e=>e.rest);
  assert.ok(updated.some((l,i)=>Math.abs(l-stale[i])>.01),
    'The updated pose must change old constraints');
  for(const edge of state.edges){
    const a=state.positions.get(edge.i),b=state.positions.get(edge.j);
    assert.ok(Math.abs(edge.rest-Math.hypot(a.x-b.x,a.z-b.z))<1e-12);
  }
  const before={x:p.x,z:p.z};
  stepBridgeCollapseDynamics(state,1/60,{gravity:0});
  assert.ok(Math.hypot(p.x-before.x,p.z-before.z)<1e-10,
    'No sudden repositioning when the second failure begins');
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

test('a fractured rod finishes rolling within a short time after first ground contact',()=>{
  for(const [axisX,axisZ] of [[.65,.76],[-.65,.76],[0,1],[1,0]]){
    const member={x:0,z:.2,vx:.09,vz:0,angle:0,omega:.8,
      axisX,axisZ,length:.6,radius:.01};
    let firstContact=null,lastRoll=null;
    for(let k=0;k<180;k++){
      const t=k/60;
      stepBridgeLooseFragment(member,1/60,-.75);
      if(member.touchingFloor&&firstContact===null)firstContact=t;
      if(member.settled){lastRoll=t;break;}
    }
    assert.ok(firstContact!==null&&lastRoll!==null);
    assert.ok(lastRoll-firstContact<.3,
      'Once the rod touches the ground it should rotate rapidly into a horizontal pose');
    const up=axisZ*Math.cos(member.angle)-axisX*Math.sin(member.angle);
    assert.ok(Math.abs(up)<1e-6);
  }
});
test('fractured members fall, roll, and settle horizontally without ground penetration',()=>{
  const floor=-.75;
  for(const [axisX,axisZ] of [[.65,.76],[-.65,.76],[0,1],[1,0]]){
    const part={x:0,z:.2,vx:.09,vz:0,angle:0,omega:.8,
      axisX,axisZ,length:.6,radius:.01};
    for(let i=0;i<350;i++){
      stepBridgeLooseFragment(part,1/60,floor);
      const az=axisZ*Math.cos(part.angle)-axisX*Math.sin(part.angle);
      const lowest=part.z-Math.abs(az)*part.length*.5-part.radius;
      assert.ok(lowest>=floor-1e-8,
        'Cylinder end caps must never enter the ground');
    }
    assert.ok(part.touchingFloor,'Free fragment must contact the ground');
    const finalAxisZ=axisZ*Math.cos(part.angle)-axisX*Math.sin(part.angle);
    assert.ok(Math.abs(finalAxisZ)<1e-4,
      'The fragment should settle flat instead of floating vertically');
    assert.ok(Math.abs(part.z-(floor+part.radius))<1e-4);
    assert.ok(Math.abs(part.vx)<1e-6&&Math.abs(part.vz)<1e-6,
      'Fragment velocity dissipates after impact');
    assert.equal(part.settled,true,'The final resting pose must be explicit');
    const raisedFloor=floor+.12;
    stepBridgeLooseFragment(part,1/60,raisedFloor);
    assert.equal(part.z,raisedFloor+part.radius,
      'A resting fragment must follow a corrected detected floor');
  }
});

test('fracture scatter separates both halves without altering floor contact',()=>{
  const a=bridgeFragmentScatter(20261117,'M7',0);
  const b=bridgeFragmentScatter(20261117,'M7',1);
  assert.deepEqual(bridgeFragmentScatter(20261117,'M7',0),a,
    'A running collapse uses reproducible individual fragment parameters');
  assert.notDeepEqual(a,b,'Separate halves must not receive the same impulse');
  assert.ok(a.vx<0&&b.vx>0,'The halves disperse instead of reassembling');
  assert.ok(a.delay>=0&&a.delay<.1&&b.delay>=0&&b.delay<.1);
  for(const params of [a,b]){
    assert.ok(Math.abs(params.depth)<=.013);
    assert.ok(Math.abs(params.vz)<=.045);
  }
  const floor=-.75;
  const parts=[a,b].map((scatter,index)=>({
    x:index===0?-.15:.15,z:.2,
    vx:scatter.vx,vz:scatter.vz,angle:0,omega:scatter.omega,
    axisX:.7,axisZ:.714,length:.3,radius:.01
  }));
  for(let i=0;i<270;i++){
    for(const body of parts){
      stepBridgeLooseFragment(body,1/60,floor);
      const vertical=body.axisZ*Math.cos(body.angle)-
        body.axisX*Math.sin(body.angle);
      const bottom=body.z-Math.abs(vertical)*body.length/2-body.radius;
      assert.ok(bottom>=floor-1e-8,'Scattered fragments remain above ground');
    }
  }
  assert.ok(parts.every(body=>body.settled));
  assert.ok(parts[1].x-parts[0].x>.35,
    'The separated fragments must not reconstruct the original bar');
});
