import {evaluateLesson,solveLesson} from './ptv-castigliano-core.mjs';
const questions=[
 {stage:'PREDICCIÓN',title:'¿Qué barra trabaja a tracción?',help:['C: carga vertical hacia abajo.','Debatid signos antes de elegir.'],kind:'choice',options:[['AB','AB: base horizontal'],['AC','AC: diagonal izquierda'],['BC','BC: diagonal derecha']],answer:'AB'},
 {stage:'EQUILIBRIO',title:'Reacción vertical en A (kN)',help:['A articulado, B rodillo.','P=10 kN en el vértice central.'],key:'ra',expected:5},
 {stage:'ESTADO REAL',title:'Axil AB (kN)',help:['Tracción positiva.','Usad equilibrio del nudo A.'],key:'nab',expected:5},
 {stage:'ESTADO REAL',title:'Axil AC (kN)',help:['Compresión negativa.','La diagonal forma 45 grados.'],key:'nac',expected:-Math.SQRT1_2*10},
 {stage:'ESTADO VIRTUAL',title:'Axil virtual AB',help:['Carga unitaria hacia abajo en C.','Misma geometría, sin carga real.'],key:'vab',expected:.5},
 {stage:'ESTADO VIRTUAL',title:'Axil virtual AC',help:['Carga unitaria hacia abajo en C.','Expresad el coeficiente sin unidades.'],key:'vac',expected:-Math.SQRT1_2},
 {stage:'TRABAJO VIRTUAL',title:'Contribución AB (mm)',help:['N · n · L / EA','E=200 GPa, A=1000 mm2.'],key:'cab',expected:solveLesson().contributions[0]},
 {stage:'TRABAJO VIRTUAL',title:'Desplazamiento C (mm)',help:['Sumad las tres contribuciones.','AC y BC son simétricas.'],key:'delta',expected:solveLesson().delta},
 {stage:'CASTIGLIANO',title:'Energía de deformación (J)',help:['U = suma de N²L/(2EA).','El resultado es positivo.'],key:'energy',expected:solveLesson().energy},
 {stage:'CASTIGLIANO',title:'dU/dQ en Q=0 (mm)',help:['Q es una carga auxiliar en C.','Comparad con el resultado del PTV.'],key:'castdelta',expected:solveLesson().delta}
];
export class PTVXRQuiz{
 constructor(){this.index=0;this.value='';this.answers={};this.done=false;this.feedback='';}
 get current(){return questions[this.index];}
 input(key){
  if(this.done)return;
  if(key==='clear'){this.value='';return;}
  if(key==='sign'){this.value=this.value.startsWith('-')?this.value.slice(1):'-'+this.value;return;}
  if(key==='backspace'){this.value=this.value.slice(0,-1);return;}
  if(key==='.'&&this.value.includes('.'))return;
  if(this.value.length<13)this.value+=key;
 }
 submit(){
  if(this.done)return true;
  const q=this.current;
  const actual=Number(this.value);
  const ok=q.kind==='choice'?this.value===q.answer:
    this.value.trim()!==''&&Number.isFinite(actual)&&
    Math.abs(actual-q.expected)<=Math.max(.015,Math.abs(q.expected)*.06);
  if(!ok){this.feedback='Revisad el resultado con el equipo.';return false;}
  this.answers[q.key||'prediction']=this.value;
  this.index++;
  this.value='';this.feedback='Respuesta validada. Buen trabajo.';
  if(this.index===questions.length){this.done=true;this.feedback='Reto XR completado. Entregad la hoja grupal desde el móvil.';}
  return true;
 }
 reset(){this.index=0;this.value='';this.answers={};this.done=false;this.feedback='';}
}
export const PTV_XR_TOTAL=questions.length;
