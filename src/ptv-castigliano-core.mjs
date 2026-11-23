// Fully deterministic teaching reference: three-bar, pin-jointed isostatic truss.
// A(0,0) pin, B(4,0) roller, C(2,2). P downward at C.
// SI internally, user-facing kN, mm, kN m.
export const LESSON={E:200e9,A:1e-3,P:10,barNames:['AB','AC','BC'],L:[4,Math.sqrt(8),Math.sqrt(8)]};
export function solveLesson(P=LESSON.P){
 if(!Number.isFinite(P)||P<=0)throw Error('La carga debe ser positiva');
 const N=[P/2,-P/Math.sqrt(2),-P/Math.sqrt(2)];
 const n=[.5,-1/Math.sqrt(2),-1/Math.sqrt(2)];
 const contributions=N.map((v,i)=>v*1000*n[i]*LESSON.L[i]/(LESSON.E*LESSON.A)*1000);
 const delta=contributions.reduce((a,b)=>a+b,0);
 const energy=N.reduce((sum,v,i)=>sum+(v*1000)**2*LESSON.L[i]/(2*LESSON.E*LESSON.A),0);
 return {P,N,n,contributions,delta,energy,reactions:[P/2,P/2]};
}
export function castigliano(P=LESSON.P,Q=0){
 // Auxiliary downward load Q at C: N_i(P,Q)=(P+Q)n_i.
 return solveLesson(P+Q).energy;
}
export function near(actual,expected,rel=.06,abs=.015){
 return Number.isFinite(actual)&&Math.abs(actual-expected)<=Math.max(abs,Math.abs(expected)*rel);
}
const entered=(answers,key)=>String(answers[key]??'').trim()!=='';
const numeric=(answers,key)=>entered(answers,key)?Number(String(answers[key]).replace(',','.')):NaN;
export function evaluateLesson(answers,P=LESSON.P){
 const s=solveLesson(P);
 const checks={
  roles:['xr','real','virtual','energy'].every(k=>String(answers[k]||'').trim().length>=2),
  prediction:answers.prediction==='AB-traccion-diagonales-compresion'&&String(answers.reason||'').trim().length>=25,
  reactions:near(numeric(answers,'ra'),P/2)&&near(numeric(answers,'rb'),P/2),
  axial:near(numeric(answers,'nab'),s.N[0])&&near(numeric(answers,'nac'),s.N[1])&&near(numeric(answers,'nbc'),s.N[2]),
  virtual:near(numeric(answers,'vab'),s.n[0])&&near(numeric(answers,'vac'),s.n[1])&&near(numeric(answers,'vbc'),s.n[2]),
  contributions:near(numeric(answers,'cab'),s.contributions[0])&&near(numeric(answers,'cac'),s.contributions[1])&&near(numeric(answers,'cbc'),s.contributions[2]),
  displacement:near(numeric(answers,'delta'),s.delta),
  castigliano:near(numeric(answers,'energy'),s.energy)&&near(numeric(answers,'castdelta'),s.delta),
  explanation:String(answers.explanation||'').trim().length>=80,
  reflection:String(answers.reflection||'').trim().length>=80
 };
 const weights={roles:5,prediction:10,reactions:10,axial:15,virtual:15,contributions:15,displacement:10,castigliano:10,explanation:5,reflection:5};
 const score=Object.entries(checks).reduce((sum,[key,ok])=>sum+(ok?weights[key]:0),0);
 const objectiveKeys=['reactions','axial','virtual','contributions','displacement','castigliano'];
 const objectiveScore=objectiveKeys.reduce((sum,k)=>sum+(checks[k]?weights[k]:0),0);
 const pendingHumanReview=weights.roles+weights.prediction+weights.explanation+weights.reflection;
 return {checks,weights,score,maxScore:100,objectiveScore,objectiveMax:75,pendingHumanReview,reference:s};
}
export function reportText(answers,P=LESSON.P){
 const e=evaluateLesson(answers,P);
 return ['IMIS-LAB · PRÁCTICA PTV Y CASTIGLIANO','Fecha: '+new Date().toISOString(),
  'Grupo: '+(answers.group||''),'Integrantes: '+['xr','real','virtual','energy'].map(k=>k+': '+(answers[k]||'')).join(' | '),
  'Carga P: '+P+' kN','Puntuación provisional (verificación de presencia, no calidad de textos): '+e.score+'/100',
  'Puntos numéricos verificables: '+e.objectiveScore+'/75',
  'Puntos que requieren revisión docente: '+e.pendingHumanReview+'/25',
  ...Object.entries(e.checks).map(([k,v])=>k+': '+(v?'correcto':'pendiente/incorrecto')),
  'RESPUESTAS',...Object.entries(answers).map(([k,v])=>k+': '+String(v)),
  'REFERENCIA DOCENTE','N (kN): '+e.reference.N.join(', '),
  'n: '+e.reference.n.join(', '),'Contribuciones (mm): '+e.reference.contributions.join(', '),
  'delta (mm): '+e.reference.delta,'U (J): '+e.reference.energy,
  'Evaluación automática orientativa: revisar razonamientos y autoría del grupo.'].join('\n');
}
