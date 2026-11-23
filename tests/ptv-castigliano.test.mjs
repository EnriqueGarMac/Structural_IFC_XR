import test from 'node:test';
import assert from 'node:assert/strict';
import {solveLesson,castigliano,near,evaluateLesson} from '../src/ptv-castigliano-core.mjs';

test('three-bar truss: equilibrium, virtual work, energy and Castigliano agree',()=>{
 const s=solveLesson();
 assert.ok(near(s.reactions[0]+s.reactions[1],10));
 assert.ok(near(s.N[0],5));
 assert.ok(near(s.N[1],-Math.sqrt(50)));
 assert.ok(near(s.n[0],.5));
 assert.ok(near(s.delta,0.1914213562373095,1e-9,1e-9));
 const h=1e-4;
 const derivative=(castigliano(10,h)-castigliano(10,-h))/(2*h);
 // J/kN converts to mm using 1 J/kN = 1 mm
 assert.ok(near(derivative,s.delta,1e-7,1e-7));
 assert.ok(near(s.energy,10*s.delta/2,1e-8,1e-8));
});
test('grading rejects incorrect or missing inputs',()=>{
 const e=evaluateLesson({});
 assert.equal(e.score,0);
 assert.equal(e.checks.axial,false);
 assert.equal(e.checks.explanation,false);
});
