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

test('assessment accepts a complete correct group and distinguishes teacher review',()=>{
 const r=solveLesson();
 const a={group:'G1',xr:'Alumno XR',real:'Alumno real',virtual:'Alumno virtual',energyStudent:'Alumno energia',
 prediction:'AB-traccion-diagonales-compresion',reason:'La simetría exige compresión diagonal y tracción en el tirante inferior.',
 ra:'5',rb:'5',nab:'5',nac:String(r.N[1]),nbc:String(r.N[2]),
 vab:'.5',vac:String(r.n[1]),vbc:String(r.n[2]),
 cab:String(r.contributions[0]),cac:String(r.contributions[1]),cbc:String(r.contributions[2]),
 delta:String(r.delta),energy:String(r.energy),castdelta:String(r.delta),
 explanation:'Derivamos la energía axial respecto de una carga auxiliar Q en la dirección del desplazamiento, obteniendo la suma de productos real y virtual.',
 reflection:'Al duplicar P se duplica la flecha y la energía se cuadruplica. Al duplicar el área, el desplazamiento y la energía se reducen a la mitad.'};
 const e=evaluateLesson(a);
 assert.equal(e.score,100);
 assert.equal(e.objectiveScore,75);
 assert.equal(e.pendingHumanReview,25);
 assert.equal(e.checks.roles,true);
 assert.equal(e.checks.castigliano,true);
 assert.equal(evaluateLesson({...a,energyStudent:''}).checks.roles,false);
 for(const key of ['ra','nac','vab','cab','delta','energy']){
   const bad={...a,[key]:''};
   assert.ok(evaluateLesson(bad).score<100,'blank '+key+' must not pass');
 }
 assert.equal(evaluateLesson({...a,ra:'0'}).checks.reactions,false);
});
