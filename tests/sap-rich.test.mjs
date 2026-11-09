import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeResults} from '../src/results.mjs';
import {unpackRichSAP} from '../src/sap-rich.mjs';

const rich={
  schema:'imis.sap2000.xr/1',
  source:{workbook:'modelo.xlsx'},
  geometry:{
    joints:{'1':{xyz_m:[0,0,0]},'2':{xyz_m:[3,0,0]}},
    frames:{'A':{joint_i:'1',joint_j:'2',section:'S',local_axes:{basis_global:[[1,0,0],[0,0,1],[0,-1,0]]}}},
    sections:{S:{t2_m:.1,t3_m:.2}}
  },
  loads:{self_weight:[{frame:'A',load_pattern:'DEAD',q_global_kN_per_m:[0,0,-2]}]},
  results:{
    joint_displacements:{DEAD:{'1':{translation_m:[0,0,0]},'2':{translation_m:[0,0,-.01]}}},
    frame_forces:{DEAD:{A:[{station_m:0,M3_kNm:1},{station_m:3,M3_kNm:-1}]}},
    modes:[{number:1,frequency_hz:2.5,period_s:.4,
      normalized_shape:{'1':[0,0,0],'2':[0,0,1]},
      frame_curve_normalized:{A:[[0,0,0],[0,0,1]]}}]
  }
};
test('SAP rich JSON is accepted by existing normalizer',()=>{
  const results=normalizeResults(rich);
  assert.equal(results.nodes.length,2);
  assert.equal(results.frames[0].id,'A');
  assert.equal(results.loads[0].dir,6);
  assert.equal(results.loads[0].w1,-2);
  assert.equal(results.cases[0].displacements[1].uz,-.01);
  assert.equal(results.forces.DEAD.A[0].M3_kNm,1);
  assert.equal(results.modes[0].frequency_hz,2.5);
  assert.equal(results.sections.S.t2_m,.1);
});
test('legacy JSON still imports',()=>{
  const old={nodes:[{id:'1',x:0,y:0,z:0}],frames:[],loads:[],cases:[]};
  assert.equal(unpackRichSAP(old),old);
  assert.equal(normalizeResults(old).nodes.length,1);
});
test('bad rich JSON reports a problem instead of silent blank model',()=>{
  assert.throws(()=>normalizeResults({schema:'imis.sap2000.xr/1',geometry:{}}),/incompleto/);
  assert.throws(()=>normalizeResults({...rich,geometry:{...rich.geometry,frames:{A:{joint_i:'1',joint_j:'99'}}}}),/inexistente/);
});
