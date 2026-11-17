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
  near(reinforced.bending.localDeflection_mm,1.3186813186813182,1e-6);
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
test('member limit-state cause distinguishes yielding from Euler buckling',()=>{
  const shallow=[
    ['B0','B2','bar_l'],['B2','B4','bar_l'],
    ['B0','G1_4','bar_m'],['G1_4','B4','bar_m'],
    ['B2','G1_4','bar_m']
  ].map(([i,j,sectionId],k)=>({id:'M'+(k+1),i,j,sectionId}));
  const yieldResult=calculateBridge({members:shallow,span_m:.6,load_kN:50});
  assert.equal(yieldResult.broken[0]?.mode,'yield');
  assert.match(yieldResult.reason,/límite elástico/);
  const buckleResult=calculateBridge({members:shallow,span_m:1.2,load_kN:50});
  assert.equal(buckleResult.broken[0]?.mode,'buckling');
  assert.match(buckleResult.reason,/pandeo/);
});
test('critical lightweight member fails first under demanding loading',()=>{
  const r=calculateBridge({members:bridgeSampleMembers(),load_kN:50,span_m:2.9});
  assert.equal(r.status,'collapse');
  assert.equal(r.broken[0]?.id,'M7');
  assert.ok(r.broken[0].utilization>1);
  assert.match(r.reason,/Tras el fallo/);
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
