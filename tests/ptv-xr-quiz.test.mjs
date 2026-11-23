import test from 'node:test';
import assert from 'node:assert/strict';
import {PTVXRQuiz,PTV_XR_TOTAL} from '../src/ptv-xr-quiz.mjs';
test('XR quiz gates progress and validates all ten answers',()=>{
 const q=new PTVXRQuiz();
 assert.equal(PTV_XR_TOTAL,10);
 assert.equal(q.submit(),false);
 assert.equal(q.index,0);
 q.value='AB';assert.equal(q.submit(),true);
 const vals=['5','5','-7.0710678','0.5','-0.70710678','0.05','0.191421356','0.95710678','0.191421356'];
 for(const value of vals){
   q.value=value;
   assert.equal(q.submit(),true,'failed at '+q.index+' with '+value);
 }
 assert.equal(q.done,true);
 assert.equal(q.index,10);
 q.reset();assert.equal(q.done,false);assert.equal(q.index,0);
});
test('numeric keypad edits negative and decimal values',()=>{
 const q=new PTVXRQuiz();
 q.input('-');q.input('7');q.input('.');q.input('1');q.input('2');q.input('backspace');
 assert.equal(q.value,'-7.1');
 q.input('clear');assert.equal(q.value,'');
});

test('XR attempt counts include rejected answers and reset cleanly',()=>{
 const q=new PTVXRQuiz();
 q.value='BC';assert.equal(q.submit(),false);
 q.value='AB';assert.equal(q.submit(),true);
 assert.equal(q.getSummary().totalAttempts,2);
 assert.equal(q.getSummary().attempts[0],2);
 q.reset();assert.equal(q.getSummary().totalAttempts,0);
});
