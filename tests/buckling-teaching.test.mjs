import test from 'node:test';
import assert from 'node:assert/strict';
import {caseModes,modeForRank,lessonCases,typeQuestion,magnitudeQuestion,makeRandom,orderAnswer,
  checkOrder,stressSummary,yieldStrength,areaValue,divergingColour,utilisationColour,supportInfo,
  answersCSV,roundNice,whereScore} from '../src/buckling-teaching.mjs';
import {makeDisplacementSampler,modeNodes} from '../src/results.mjs';

// Two pieces: column A (areas 1, 2) and column B (area 3); B buckles first.
function results(){
  return {
    nodes:[{id:'1',x:0,y:0,z:0},{id:'2',x:1,y:0,z:0},{id:'3',x:0,y:0,z:1},{id:'4',x:1,y:0,z:1},
      {id:'5',x:0,y:0,z:2},{id:'6',x:1,y:0,z:2}],
    areas:[{id:'1',joints:['1','2','4','3'],material:'S355'},{id:'2',joints:['3','4','6','5'],material:'S355'},
      {id:'3',joints:['1','2','4','3'],material:'S355'}],
    materials:{S355:{fy_MPa:355},Other:{fy_MPa:235}},
    supports:[{id:'BC_FORK_A_BOTTOM',kind:'FORK',place:'A_BOTTOM',joints:['1','2']}],
    bucklingModes:[
      {case:'BUCKLING_A',number:1,factor:-5,jointShape:{}},
      {case:'BUCKLING_A',number:2,factor:900,jointShape:{'5':[0,1,0],'3':[0,.4,0]}},
      {case:'BUCKLING_A',number:3,factor:400,jointShape:{'5':[0,1,0]}},
      {case:'BUCKLING_B',number:1,factor:150,jointShape:{'5':[1,0,0]}}],
    bucklingReference:{BUCKLING_A:{stress_case:'PRE_A'},BUCKLING_B:{}},
    areaStresses:{PRE_A:{'1':[-2,0,5],'2':[-1,0.5,1]}},
    teaching:{cases:{
      BUCKLING_A:{label:'A',rank:1,type:'flexion',distractors:['torsion','lateral','cordon']},
      BUCKLING_B:{label:'B',rank:1,type:'torsion',distractors:['flexion']},
      BUCKLING_C:{label:'missing',rank:1,type:'flexion'}}}
  };
}

test('positive modes are ranked by factor and keep their index',()=>{
  const r=results();
  assert.deepEqual(caseModes(r,'BUCKLING_A').map(m=>[m.mode.number,m.index]),[[3,2],[2,1]]);
  assert.equal(modeForRank(r,'BUCKLING_A',2).mode.number,2);
  assert.equal(modeForRank(r,'BUCKLING_A',5),null);
  // a case of the teaching block without results is left out
  assert.deepEqual(lessonCases(r).map(c=>c.name),['BUCKLING_A','BUCKLING_B']);
});

test('type question: the right answer and the distractors, four options at most',()=>{
  const r=results();
  const q=typeQuestion(r,r.teaching.cases.BUCKLING_A,makeRandom(1));
  assert.equal(q.answer,'flexion');
  assert.equal(q.options.length,4);
  assert.deepEqual(q.options.map(o=>o.key).sort(),['cordon','flexion','lateral','torsion']);
  assert.ok(q.options.every(o=>o.label&&o.label!==o.key));
});

test('magnitude question contains the true factor and values 2x apart',()=>{
  for(let seed=0;seed<20;seed++){
    const q=magnitudeQuestion(1641.7,makeRandom(seed));
    const right=q.options.find(o=>o.key===q.answer);
    assert.equal(right.value,1642);
    const values=q.options.map(o=>o.value).sort((a,b)=>a-b);
    for(let i=1;i<values.length;i++)assert.ok(Math.abs(values[i]/values[i-1]-2)<.02);
  }
  assert.equal(roundNice(6.981),6.98);
  assert.equal(roundNice(0.01234),0.0123);
});

test('ordering the pieces by critical factor',()=>{
  const cases=lessonCases(results());
  assert.deepEqual(orderAnswer(cases),['BUCKLING_B','BUCKLING_A']);
  assert.ok(checkOrder(cases,['BUCKLING_B','BUCKLING_A']));
  assert.ok(!checkOrder(cases,['BUCKLING_A','BUCKLING_B']));
});

test('where: amplitude of the normalised shape at the picked point',()=>{
  const r=results();
  const sample=makeDisplacementSampler(modeNodes(r,r.bucklingModes[1]));
  assert.equal(whereScore(sample,[0,0,2]),1);
  assert.ok(Math.abs(whereScore(sample,[0,0,1])-.4)<1e-9);
  assert.equal(whereScore(sample,[1,0,0]),0);
});

test('stress summary: lambda_y leaves out plates on supports, verdict and slenderness',()=>{
  const r=results();
  assert.equal(yieldStrength(r),355);
  const mode=modeForRank(r,'BUCKLING_A',1).mode;  // lambda = 400
  const s=stressSummary(r,mode);
  // area 1 touches the support joints 1-2: excluded; area 2 governs (1 MPa)
  assert.equal(s.excluded,1);
  assert.equal(s.area,'2');
  assert.equal(s.sigmaVmMax,1);
  assert.equal(s.lambdaY,355);
  assert.equal(s.verdict,'yields');
  assert.ok(Math.abs(s.slenderness-Math.sqrt(355/400))<1e-12);
  assert.equal(s.compressionMax,-2);
  // no static case paired with the buckling case: no summary
  assert.equal(stressSummary(r,modeForRank(r,'BUCKLING_B',1).mode),null);
});

test('plate values and colours',()=>{
  assert.equal(areaValue([-2,0,5],'stress'),-2);
  assert.equal(areaValue([-2,0,5],'stress',{lambda:10,atBuckling:true}),-20);
  assert.equal(areaValue([-2,0,5],'yield',{lambda:10,fy:100}),.5);
  assert.equal(areaValue([-2,0,5],'yield',{lambda:10}),null);
  assert.deepEqual(divergingColour(0),[.86,.88,.9]);
  const blue=divergingColour(-1),red=divergingColour(1);
  assert.ok(blue[2]>blue[0]&&red[0]>red[2]);
  assert.deepEqual(utilisationColour(.2),utilisationColour(.5));
  assert.deepEqual(utilisationColour(1.5),[.84,.18,.15]);
});

test('support descriptions and answers CSV',()=>{
  assert.equal(supportInfo('fork').label,'Horquilla');
  assert.match(supportInfo('XYZ').text,/XYZ/);
  const csv=answersCSV([{model:'A1',case:'BUCKLING_A',question:'tipo',answer:'Torsión; x',correct:'Flexión',
    ok:false,time:'t'}],'Ana');
  assert.equal(csv.split('\r\n').length,2);
  assert.match(csv,/"Torsión; x"/);
  assert.match(csv,/;no;t$/);
});
