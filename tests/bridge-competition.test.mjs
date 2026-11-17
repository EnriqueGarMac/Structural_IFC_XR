import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BRIDGE_DEFAULTS,BRIDGE_SECTIONS,bridgeGrid,bridgeSampleMembers,
  addBridgeMember,calculateBridge} from '../src/bridge-competition-solver.mjs';
import {bridgeGapBetween,detectBridgeTableGap,applyBridgeGapPlacement}
  from '../src/bridge-table-detection.mjs';
const near=(a,b,tol=.000001)=>assert.ok(Math.abs(a-b)<=tol,a+' != '+b);
test('bridge contest grid, materials and member edit validation',()=>{
  const nodes=bridgeGrid(1.2);
  assert.equal(nodes.length,45);
  assert.equal(new Set(nodes.map(n=>n.id)).size,45);
  assert.ok(nodes.some(n=>n.id==='G2_5'));
  assert.equal(nodes[0].fixX,true);
  assert.equal(nodes.find(n=>n.id==='B4').fixZ,true);
  assert.equal(nodes.find(n=>n.id==='B4').fixX,true);
  assert.equal(nodes.find(n=>n.id==='B0').fixX,true);
  assert.equal(nodes.find(n=>n.id==='B0').fixZ,true);
  assert.equal(BRIDGE_SECTIONS.bar_m.A_m2*1e6,120);
  assert.equal(BRIDGE_SECTIONS.bar_l.A_m2*1e6,550);
  assert.equal(BRIDGE_SECTIONS.tie_m.A_m2*1e6,80);
  assert.ok(BRIDGE_SECTIONS.bar_m.A_m2>BRIDGE_SECTIONS.tie_m.A_m2);
  const start=addBridgeMember([],nodes,'B0','T1','bar_m');
  assert.equal(start.length,1);
  assert.throws(()=>addBridgeMember(start,nodes,'T1','B0','tie_m'),/Ya existe/);
  assert.throws(()=>addBridgeMember(start,nodes,'B0','B0','bar_m'),/distintos/);
  assert.throws(()=>addBridgeMember(start,nodes,'B0','X','bar_m'),/no válidos/);
  assert.throws(()=>bridgeGrid(5),/rango/);
  const sample=bridgeSampleMembers();
  assert.equal(new Set(sample.map(m=>[m.i,m.j].sort().join('|'))).size,sample.length);
});
test('reference pedestrian truss resists its central teaching load with equilibrium',()=>{
  const r=calculateBridge({members:bridgeSampleMembers()});
  assert.ok(r.totalMass_kg>0);
  assert.ok(r.reactions.length>0,'Stable baseline must yield support reactions');
  assert.ok(r.members.every(m=>Number.isFinite(m.utilization)));
  assert.ok(r.maxDeflection_mm>=0);
  assert.ok(r.equilibrium);
  near(r.equilibrium.fx_kN,0,1e-6);
  near(r.equilibrium.fz_kN,0,1e-6);
  near(r.equilibrium.moment_kNm,0,1e-6);
  assert.equal(r.status,'stable','Reference must pass the challenge by default: '+r.reason);
  assert.ok(r.maxUtilization<=1);
  assert.ok(r.maxDeflection_mm<=r.serviceLimit_mm);
  assert.ok(r.totalMass_kg>0&&r.totalMass_kg<300);
});
test('grid nodes and unfinished unsupported bars do not cause false collapse',()=>{
  const grid=bridgeGrid(1.2),base=bridgeSampleMembers();
  const control=calculateBridge({members:base,span_m:1.2,load_kN:3});
  const unfinished=addBridgeMember(base,grid,'G2_0','G2_1','bar_m');
  const result=calculateBridge({members:unfinished,span_m:1.2,load_kN:3});
  assert.equal(result.status,'stable',result.reason);
  near(result.maxDeflection_mm,control.maxDeflection_mm,1e-7);
  assert.ok(result.totalMass_kg>control.totalMass_kg);
  assert.ok(result.pending.includes(unfinished.at(-1).id));
});
test('a newly drawn unbraced leaf member remains pending, not an instant collapse',()=>{
  const baseline=bridgeSampleMembers(),grid=bridgeGrid(1.2);
  const extended=addBridgeMember(baseline,grid,'T2','G3_5','bar_m');
  const r=calculateBridge({members:extended,span_m:1.2,load_kN:3});
  assert.equal(r.status,'stable',r.reason);
  assert.ok(r.pending.includes(extended.at(-1).id));
});
test('central load disconnected from any supported path is still an invalid mechanism',()=>{
  const members=bridgeSampleMembers().filter(m=>m.i!=='B2'&&m.j!=='B2');
  const result=calculateBridge({members});
  assert.equal(result.status,'collapse');
  assert.equal(result.reactions.length,0);
});
test('three-member triangle carries a point load placed on the interior of its bottom chord',()=>{
  const triangle=bottom=>[
    {id:'M1',i:'B0',j:'T2',sectionId:'bar_m'},
    {id:'M2',i:'T2',j:'B4',sectionId:'bar_m'},
    {id:'M3',i:'B0',j:'B4',sectionId:bottom}
  ];
  const light=calculateBridge({members:triangle('bar_m'),span_m:1.2,load_kN:3});
  assert.notEqual(light.maxDeflection_mm,null,
    'Geometrically closed triangle must be analysed, not rejected as disconnected');
  assert.equal(light.bending?.memberId,'M3');
  near(light.bending.moment_kNm,.9,1e-8);
  assert.ok(light.bending.stress_MPa>235,
    'Thin bottom chord should fail flexure rather than be falsely called safe');
  assert.equal(light.broken[0]?.mode,'bending');
  assert.match(light.reason,/flexión/);
  assert.ok(light.reactions.length>0);
  assert.ok(light.displacements.some(d=>d.nodeId==='B2'));
  const reinforced=calculateBridge({members:triangle('bar_l'),span_m:1.2,load_kN:3});
  assert.equal(reinforced.status,'stable',reinforced.reason);
  assert.ok(reinforced.bending.stress_MPa<235);
  assert.ok(reinforced.maxDeflection_mm<reinforced.serviceLimit_mm);
  near(reinforced.bending.localDeflection_mm,3.428571428571428,1e-6);
});
test('empty or mechanically unstable design is rejected, not assigned fictitious forces',()=>{
  const r=calculateBridge({members:[],load_kN:3});
  assert.equal(r.status,'collapse');
  assert.equal(r.reactions.length,0);
  assert.equal(r.maxUtilization,null);
  assert.match(r.reason,/inestable|camino resistente|Sin barras|no dispone de camino hasta los apoyos/);
});
test('tension-only ties cannot act as compressed top-chord members',()=>{
  const members=bridgeSampleMembers().map(m=>({
    ...m,sectionId:['M5','M6'].includes(m.id)?'tie_m':'bar_m'
  }));
  const r=calculateBridge({members,load_kN:50,span_m:2.9});
  assert.equal(r.status,'collapse','Compression-only tie assignment must not falsely pass');
  assert.ok(r.slack.includes('M5')&&r.slack.includes('M6'));
  assert.ok(r.totalMass_kg>0);
});
test('compression and tension are limited by yielding, not buckling',()=>{
  const sample=bridgeSampleMembers();
  const r=calculateBridge({members:sample,load_kN:35});
  assert.equal(r.status,'collapse');
  assert.equal(r.broken[0]?.id,'M6');
  assert.equal(r.broken[0]?.mode,'yield');
  assert.match(r.reason,/límite elástico/);
  const failed=r.members.find(m=>m.id==='M6');
  assert.ok(failed.axial_kN<0,'M6 is in compression');
  assert.equal(failed.compressionCapacity_kN,failed.tensionCapacity_kN);
  assert.ok(r.members.every(m=>m.kind==='tie'||
    m.compressionCapacity_kN===m.tensionCapacity_kN));
  assert.ok(!r.broken.some(f=>f.mode==='buckling'),
    'Buckling has not been studied and must not be checked in this exercise');
});
test('critical lightweight member fails first under demanding loading',()=>{
  const r=calculateBridge({members:bridgeSampleMembers(),load_kN:50,span_m:2.9});
  assert.equal(r.status,'collapse');
  assert.equal(r.broken[0]?.id,'M6');
  assert.equal(r.broken[0]?.mode,'yield');
  assert.ok(r.broken[0].utilization>1);
  assert.match(r.reason,/Tras el fallo/);
});
test('symmetric equally critical bars fail simultaneously, without arbitrary ID bias',()=>{
  const symmetric=[
    ['B0','B2'],['B2','B4'],['B0','T2'],['T2','B4'],['B2','T2']
  ].map(([i,j],k)=>({id:'M'+(k+1),i,j,sectionId:'bar_m'}));
  const r=calculateBridge({members:symmetric,load_kN:35});
  assert.equal(r.status,'collapse');
  assert.deepEqual(r.broken.map(f=>f.id),['M3','M4']);
  const stage=r.stages[0];
  assert.deepEqual(stage.nextFailures.map(f=>f.id),['M3','M4']);
  assert.ok(Math.abs(stage.nextFailures[0].utilization-
    stage.nextFailures[1].utilization)<1e-10);
  assert.deepEqual(r.stages[1].removed,['M3','M4']);
  assert.equal(r.stages[1].status,'mechanism');
});
test('progressive bridge failure recalculates member forces after each removal',()=>{
  const members=bridgeSampleMembers().map(m=>({
    ...m,sectionId:['M3','M4','M7','M9','M13'].includes(m.id)?
      'bar_l':'bar_m'
  }));
  members.push(
    {id:'M14',i:'T1',j:'B3',sectionId:'bar_m'},
    {id:'M15',i:'B2',j:'B4',sectionId:'bar_m'},
    {id:'M16',i:'B0',j:'B2',sectionId:'bar_l'}
  );
  const result=calculateBridge({members,load_kN:35});
  assert.equal(result.status,'collapse');
  assert.deepEqual(result.broken.map(f=>f.id),['M6','M14']);
  assert.equal(result.stages.length,3);
  assert.deepEqual(result.stages[0].removed,[]);
  assert.equal(result.stages[0].nextFailure.id,'M6');
  assert.deepEqual(result.stages[1].removed,['M6']);
  assert.equal(result.stages[1].nextFailure.id,'M14');
  const axial=stage=>stage.members.find(m=>m.id==='M14').axial_kN;
  assert.ok(Math.abs(axial(result.stages[1]))>10*Math.abs(axial(result.stages[0])),
    'The second failure must be based on NEW forces after losing M6');
  assert.equal(result.stages[2].status,'mechanism');
  assert.deepEqual(result.stages[2].removed,['M6','M14']);
  assert.deepEqual(result.stages[2].members,[],
    'A mechanism must not produce invented post-collapse member forces');
});
test('table-plane finder works only with two level facing surfaces of measured extents',()=>{
  const a={bounds:new THREE.Box3(new THREE.Vector3(0,.75,0),
      new THREE.Vector3(1,.78,.9)),top:.78,width:1,depth:.9,area:.9,label:'table'};
  const b={bounds:new THREE.Box3(new THREE.Vector3(1.8,.74,0),
      new THREE.Vector3(2.8,.78,.9)),top:.78,width:1,depth:.9,area:.9,label:'table'};
  const gap=bridgeGapBetween(a,b);
  assert.ok(gap);
  near(gap.span_m,.8);
  near(gap.start.x,1);
  near(gap.end.x,1.8);
  near(gap.start.y,.78);
  assert.equal(bridgeGapBetween(a,{...b,top:1.2}),null);
  assert.equal(bridgeGapBetween(a,{...b,bounds:new THREE.Box3(
    new THREE.Vector3(1.8,.74,3),new THREE.Vector3(2.8,.78,3.9))}),null);
  assert.equal(detectBridgeTableGap({detectedPlanes:new Set()},{}),null);
});
test('Quest placement maps exact measured endpoints without inventing scale',()=>{
  const app={worldRoot:new THREE.Object3D(),targetMeters:1,arAnchorPoint:null,
    updateScale(){this.updated=true;}};
  const experience={span_m:1.2,defaultWorldQuaternion:
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0)),
    setSpan(x){this.span_m=x;}};
  const gap={span_m:.8,start:new THREE.Vector3(1,.8,0),
    end:new THREE.Vector3(1.8,.8,0),direction:new THREE.Vector3(1,0,0)};
  near(applyBridgeGapPlacement(app,gap,experience),.8);
  near(app.worldRoot.position.x,1);
  near(app.worldRoot.position.y,.8);
  near(app.targetMeters,.8);
  assert.equal(app.arAnchorPoint,null);
  assert.equal(app.updated,true);
  assert.equal(experience.detectedGap,gap);
});
