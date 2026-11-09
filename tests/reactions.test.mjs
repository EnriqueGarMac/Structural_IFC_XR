import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeResults} from '../src/results.mjs';
import {normalizeJointReactions,reactionSummary,reactionText} from '../src/reactions.mjs';

const nodes=[
  {id:'1',x:-5.4864,y:0,z:0,restrained_dof:[true,true,true,true,false,true]},
  {id:'4',x:5.4864,y:0,z:0,restrained_dof:[false,true,true,true,false,true]}
];
const reactions={DEAD:{
  '1':{force_kN:[0,0,7.028505552704042],moment_kNm:[0,0,0]},
  '4':{force_kN:[0,0,7.028505552704042],moment_kNm:[0,0,0]}
}};
test('preserves real SAP reactions, node IDs, units and support restraints',()=>{
  const data=normalizeResults({nodes,frames:[],loads:[],cases:[
    {name:'DEAD',displacements:[]}],jointReactions:reactions});
  assert.equal(data.nodes[0].restrained_dof[0],true);
  assert.equal(data.jointReactions.DEAD['1'].force_kN[2],7.028505552704042);
  assert.equal(data.jointReactions.DEAD['4'].moment_kNm[0],0);
  const sum=reactionSummary(data.jointReactions,'DEAD');
  assert.equal(sum.rows.length,2);
  assert.ok(Math.abs(sum.force[2]-14.057011105408084)<1e-12);
  assert.equal(sum.force[0],0);
  assert.match(reactionText(sum.rows[0]),/kN·m/);
});
test('changes selected case without mixing reaction totals',()=>{
  const both=normalizeJointReactions({
    ...reactions,WIND:{'1':{force_kN:[-3,2,5],moment_kNm:[0,4,-1]}}
  },nodes);
  assert.deepEqual(reactionSummary(both,'DEAD').force,[0,0,14.057011105408084]);
  assert.deepEqual(reactionSummary(both,'WIND').force,[-3,2,5]);
  assert.deepEqual(reactionSummary(both,'WIND').moment,[0,4,-1]);
  assert.equal(reactionSummary(both,'NONE').rows.length,0);
});
test('rejects malformed reaction vectors and nonexistent joints, not inventing values',()=>{
  assert.deepEqual(normalizeJointReactions(undefined,nodes),{});
  assert.throws(()=>normalizeJointReactions({DEAD:{'1':{force_kN:[0,0,3]}}},nodes),/momento/);
  assert.throws(()=>normalizeJointReactions({DEAD:{'5':{force_kN:[0,0,1],moment_kNm:[0,0,0]}}},nodes),/inexistente/);
  assert.throws(()=>normalizeJointReactions({DEAD:{'1':{force_kN:[0,NaN,0],moment_kNm:[0,0,0]}}},nodes),/fuerza/);
});
