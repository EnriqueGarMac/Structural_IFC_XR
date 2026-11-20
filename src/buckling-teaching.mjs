// Teaching layer for linear buckling results (no Three.js, testable in Node):
//  * question mode: type of buckling, where it buckles, order of magnitude of the
//    critical factor and ordering of the pieces of a model, with an answer key
//    taken from the "teaching" block of the JSON;
//  * stresses before buckling: shell stresses of the static case with the same
//    load as the buckling case (bucklingReference[case].stress_case) and the
//    verdict "buckles before / yields before" (lambda_y = fy / sigma_vm,max);
//  * support groups (BC_<KIND>_<place>) with their teaching description.

export const BUCKLING_TYPES={
  flexion:'Pandeo por flexión (Euler)',
  torsion:'Pandeo por torsión',
  flexion_torsion:'Pandeo por flexión y torsión',
  lateral:'Pandeo lateral (vuelco)',
  eje_impuesto:'Pandeo con eje de giro impuesto',
  abolladura_compresion:'Abolladura por compresión (local)',
  abolladura_cortante:'Abolladura por cortante',
  abolladura_concentrada:'Abolladura bajo carga concentrada',
  eje_libre:'Pieza compuesta: flexión respecto al eje libre',
  eje_material:'Pieza compuesta: flexión respecto al eje material',
  cordon:'Pieza compuesta: pandeo de un cordón',
  traslacional:'Pórtico: modo traslacional',
  giro_planta:'Pórtico: giro del forjado en planta'
};

export const SUPPORT_KINDS={
  FORK:{label:'Horquilla',text:'Articulación en horquilla: la sección no se desplaza en su plano ni gira '+
    'alrededor del eje de la pieza; puede girar a flexión y alabear.'},
  PIN:{label:'Articulación',text:'Articulación: desplazamientos impedidos, giros libres.'},
  FIXED:{label:'Empotramiento',text:'Empotramiento: desplazamientos y giros impedidos.'},
  GUIDED:{label:'Extremo guiado',text:'Extremo guiado: la sección se mantiene plana y sin desplazarse '+
    'lateralmente, pero puede acortarse a lo largo de la pieza.'},
  BEARING:{label:'Apoyo',text:'Apoyo bajo el ala: impide el descenso; con guías laterales, también el '+
    'desplazamiento lateral del ala inferior.'},
  LATERAL:{label:'Coacción lateral continua',text:'Coacción lateral continua (correas, chapa, '+
    'cerramiento o arriostramiento): esa línea de la pieza no puede desplazarse lateralmente.'},
  STAY:{label:'Coacción lateral puntual',text:'Coacción lateral puntual (tornapuntas, jabalcón o punto '+
    'arriostrado).'},
  BASEPLATE:{label:'Placa de anclaje',text:'Placa de anclaje articulada: la base gira a flexión, pero no '+
    'alrededor del eje del pilar (pernos).'},
  RIGIDJOINT:{label:'Nudo rígido',text:'Nudo rígido: transmite momentos y giros entre las piezas que llegan.'},
  ENDPLATE:{label:'Chapas frontales',text:'Unión con chapas frontales: las dos piezas quedan continuas a '+
    'través de la unión.'},
  EDGE:{label:'Borde apoyado',text:'Borde de chapa apoyado.'}
};
export const supportInfo=kind=>SUPPORT_KINDS[String(kind).toUpperCase()]??
  {label:'Condición de borde',text:'Condición de borde '+kind+'.'};

// ------------------------------------------------------------ modes and cases
// Positive modes of a buckling case, lowest factor first, with their index in
// results.bucklingModes (the index the mode selector uses).
export function caseModes(results,caseName){
  return (results?.bucklingModes??[]).map((mode,index)=>({mode,index}))
    .filter(({mode})=>mode.case===caseName&&Number(mode.factor)>0)
    .sort((a,b)=>a.mode.factor-b.mode.factor);
}
export function modeForRank(results,caseName,rank=1){
  return caseModes(results,caseName)[Math.max(0,(rank|0)-1)]??null;
}
// Cases of the teaching block that exist in the results, in the block's order.
export function lessonCases(results){
  const spec=results?.teaching?.cases??{};
  return Object.entries(spec).map(([name,c])=>({name,spec:c,shown:modeForRank(results,name,c.rank??1)}))
    .filter(c=>c.shown);
}
export function typeLabel(key,results){
  return results?.teaching?.types?.[key]??BUCKLING_TYPES[key]??key;
}

// --------------------------------------------------------------- questions
// Small seeded generator so a sequence of questions can be reproduced (tests).
export function makeRandom(seed=Date.now()){
  let a=seed>>>0;
  return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);
    t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
}
export function shuffled(list,random=Math.random){
  const out=[...list];
  for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  return out;
}
export function typeQuestion(results,spec,random=Math.random){
  const keys=[spec.type,...(spec.distractors??[]).filter(k=>k!==spec.type)].slice(0,4);
  return {kind:'type',prompt:'¿Qué tipo de pandeo es?',answer:spec.type,
    options:shuffled(keys,random).map(key=>({key,label:typeLabel(key,results)}))};
}
// Four candidate values, the true one among values 2x and 4x apart: it asks for
// the order of magnitude, which a hand calculation can give before seeing it.
export function magnitudeQuestion(factor,random=Math.random){
  const sets=[[1,2,4,8],[.5,1,2,4],[.25,.5,1,2],[.125,.25,.5,1]];
  const set=sets[Math.floor(random()*sets.length)];
  const options=set.map(k=>({key:String(k),value:roundNice(factor*k)}));
  return {kind:'magnitude',prompt:'¿Cuánto vale λ (factor de carga crítica)?',answer:'1',options};
}
export function roundNice(v){
  if(!Number.isFinite(v)||v===0)return v;
  const digits=Math.max(0,2-Math.floor(Math.log10(Math.abs(v))));
  const p=10**digits;
  return Math.round(v*p)/p;
}
// The pieces of a model in the right order (lowest critical factor first).
export function orderAnswer(cases){
  return [...cases].sort((a,b)=>a.shown.mode.factor-b.shown.mode.factor).map(c=>c.name);
}
export function checkOrder(cases,picked){
  const right=orderAnswer(cases);
  return picked.length===right.length&&picked.every((name,i)=>name===right[i]);
}
// "Where does it buckle?": amplitude of the normalised mode shape at the picked
// point, relative to its maximum (1 at the crest of the buckle).
export const WHERE_THRESHOLD=.5;
export function whereScore(sample,point){
  const [,,,mag]=sample(point[0],point[1],point[2]);
  return Math.max(0,Math.min(1,mag));
}

// ---------------------------------------------------- stresses before buckling
export function stressCaseFor(results,caseName){
  return results?.bucklingReference?.[caseName]?.stress_case??null;
}
export function supportJoints(results){
  const set=new Set();
  for(const s of results?.supports??[])for(const j of s.joints??[])set.add(String(j));
  return set;
}
// fy of the shells' material (the lowest one if there are several).
export function yieldStrength(results){
  const materials=results?.materials??{};
  const used=new Set((results?.areas??[]).map(a=>a.material).filter(Boolean));
  const values=[...(used.size?used:Object.keys(materials))]
    .map(m=>Number(materials[m]?.fy_MPa)).filter(v=>Number.isFinite(v)&&v>0);
  if(values.length)return Math.min(...values);
  const fallback=Number(results?.teaching?.fy_MPa);
  return Number.isFinite(fallback)&&fallback>0?fallback:null;
}
// lambda_y: load factor at first yield (largest von Mises stress, leaving out the
// plates that touch a support, where the reactions concentrate the stresses);
// slenderness = sqrt(lambda_y / lambda_cr) as in EN 1993-1-1.
export function stressSummary(results,mode){
  const stressCase=stressCaseFor(results,mode?.case);
  const table=stressCase?results?.areaStresses?.[stressCase]:null;
  const fy=yieldStrength(results);
  if(!table||!mode)return null;
  const supported=supportJoints(results);
  const touching=new Set((results.areas??[])
    .filter(a=>a.joints.some(j=>supported.has(j))).map(a=>a.id));
  let vm=0,area=null,excluded=0,compression=0;
  for(const [id,[smin,,svm]] of Object.entries(table)){
    compression=Math.min(compression,smin);
    if(touching.has(id)){excluded++;continue;}
    if(svm>vm){vm=svm;area=id;}
  }
  const lambda=Number(mode.factor);
  const lambdaY=fy&&vm>0?fy/vm:null;
  const slenderness=lambdaY&&lambda>0?Math.sqrt(lambdaY/lambda):null;
  return {stressCase,fy,lambda,sigmaVmMax:vm,area,excluded,compressionMax:compression,lambdaY,slenderness,
    verdict:lambdaY==null?null:lambdaY>=lambda?'buckles':'yields'};
}
export const VERDICT_TEXT={
  buckles:'Pandea antes de plastificar (λ_cr < λ_y)',
  yields:'Plastifica antes de pandear (λ_y < λ_cr)'
};
// Scalar shown on each plate.
//   stress: most compressive membrane principal stress [MPa] (negative =
//           compression), at the reference load or times lambda;
//   yield:  utilisation at the buckling load, lambda * sigma_vm / fy.
export function areaValue(row,display,{lambda=1,fy=null,atBuckling=false}={}){
  if(!row)return null;
  const [smin,,svm]=row;
  if(display==='yield')return fy?lambda*svm/fy:null;
  return smin*(atBuckling?lambda:1);
}
// Blue (compression) - light grey - red (tension), t in [-1, 1].
export function divergingColour(t){
  const x=Math.max(-1,Math.min(1,Number(t)||0));
  const mid=[.86,.88,.9],blue=[.13,.36,.85],red=[.86,.27,.16];
  const end=x<0?blue:red,f=Math.abs(x);
  return mid.map((m,i)=>m+(end[i]-m)*f);
}
// Utilisation: green up to 0.5, yellow at 1, red above 1 (yields before buckling).
export function utilisationColour(u){
  const x=Math.max(0,Number(u)||0);
  const green=[.18,.66,.38],yellow=[.97,.8,.2],red=[.84,.18,.15];
  if(x<=.5)return green;
  if(x<=1){const f=(x-.5)/.5;return green.map((g,i)=>g+(yellow[i]-g)*f);}
  return red;
}

// ------------------------------------------------------------------ answers
export function answersCSV(rows,student=''){
  const head=['alumno','modelo','caso','pregunta','respuesta','correcta','acierto','fecha'];
  const esc=v=>{const s=String(v??'');return /[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  return [head,...rows.map(r=>[student,r.model,r.case,r.question,r.answer,r.correct,
    r.ok?'sí':'no',r.time])].map(r=>r.map(esc).join(';')).join('\r\n');
}
