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
  assert.equal(nodes.length,8);
  assert.equal(nodes[0].fixX,true);
  assert.equal(nodes.find(n=>n.id==='B4').fixZ,true);
  assert.ok(BRIDGE_SECTIONS.bar_m.A_m2>BRIDGE_SECTIONS.tie_m.A_m2);
  const start=addBridgeMember([],nodes,'B0','T1','bar_m');
  assert.equal(start.length,1);
  assert.throws(()=>addBridgeMember(start,nodes,'T1','B0','tie_s'),/Ya existe/);
  assert.throws(()=>addBridgeMember(start,nodes,'B0','B0','bar_s'),/distintos/);
  assert.throws(()=>addBridgeMember(start,nodes,'B0','X','bar_s'),/no válidos/);
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
test('empty or mechanically unstable design is rejected, not assigned fictitious forces',()=>{
  const r=calculateBridge({members:[],load_kN:3});
  assert.equal(r.status,'collapse');
  assert.equal(r.reactions.length,0);
  assert.equal(r.maxUtilization,null);
  assert.match(r.reason,/inestable|camino resistente|Sin barras/);
});
test('a stressed weak bridge triggers failed members and a failure result',()=>{
  const members=bridgeSampleMembers().map(m=>({...m,sectionId:'bar_s'}));
  const r=calculateBridge({members,load_kN:50,span_m:2.9});
  assert.ok(['collapse','failure','service'].includes(r.status));
  assert.ok(r.totalMass_kg>0);
  if(r.broken.length)assert.equal(r.status!=='stable',true);
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
