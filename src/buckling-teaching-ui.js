// Buckling teaching layer of the viewer (desktop panel and Quest menu page):
//   * what the plates show in the buckling view: the mode shape, the stresses
//     before buckling, or "does it buckle or yield first?";
//   * question mode: before showing a mode the student orders the pieces, says
//     the type of buckling, points where it buckles and estimates lambda.
// Pure logic and the answer key: buckling-teaching.mjs. Data: the JSON fields
// teaching, areaStresses, supports and materials (scripts/sap2000_to_xr.py).
import * as THREE from 'three';
import './buckling-teaching.css';
import {lessonCases,typeQuestion,magnitudeQuestion,orderAnswer,checkOrder,whereScore,WHERE_THRESHOLD,
  stressSummary,areaValue,divergingColour,utilisationColour,VERDICT_TEXT,answersCSV,typeLabel,
  caseModes,roundNice} from './buckling-teaching.mjs';
import {makeDisplacementSampler,modeNodes} from './results.mjs';

const $=id=>document.getElementById(id);
const fmt=(v,d=2)=>Number.isFinite(v)?Number(v).toLocaleString('es-ES',
  {minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const fmtG=v=>Number.isFinite(v)?Number(roundNice(v)).toLocaleString('es-ES'):'—';
export const DISPLAYS={shape:'Forma del modo',stress:'Tensiones antes de pandear',
  yield:'¿Pandea o plastifica?'};
const HIDDEN_COLOUR=[.55,.66,.72];

export class BucklingTeaching{
  constructor(app){
    this.app=app;this.display='shape';this.atBuckling=false;
    this.quiz=null;this.log=[];this.student='';this.marker=null;
    this.buildPanel();
  }
  // ------------------------------------------------------------- state
  get results(){return this.app.results;}
  get available(){return Boolean(this.results?.bucklingModes?.length);}
  get hasStresses(){return Object.keys(this.results?.areaStresses??{}).length>0;}
  get hasLesson(){return lessonCases(this.results).length>0;}
  get hideShape(){return Boolean(this.quiz&&!this.quiz.revealed);}
  get awaitingWhere(){return this.quiz?.step==='where'&&!this.quiz.feedback;}
  currentMode(){
    const sv=this.app.sapVisuals;
    return sv?.view==='buckling'?(this.results?.bucklingModes??[])[sv.modeIndex]:null;
  }
  selectMode(index){
    const select=$('mode-select');
    if(select&&select.value!==String(index)){select.value=String(index);select.dispatchEvent(new Event('change'));}
    else this.app.sapVisuals?.setMode(index);
  }
  refreshScene(){this.app.updateVisualization();this.render();this.markDirty();}
  markDirty(){if(this.app.xrControls)this.app.xrControls.dirty=true;}

  onResults(){this.quiz=null;this.display='shape';this.atBuckling=false;this.clearMarker();this.render();}
  onView(){if(this.app.sapVisuals?.view!=='buckling'&&this.quiz)this.stopQuiz();this.render();}

  setDisplay(display){
    this.display=DISPLAYS[display]?display:'shape';
    this.refreshScene();
  }
  setAtBuckling(on){this.atBuckling=Boolean(on);this.refreshScene();}

  // ------------------------------------------------- plate colours / legend
  // Called by SAPVisuals after it has painted the mode shape on the plates.
  paintPlates(modalParts){
    const mode=this.currentMode();
    if(!mode)return;
    if(this.hideShape){
      for(const {part} of modalParts)fill(part,()=>HIDDEN_COLOUR);
      if(this.display==='shape')return;
    }
    if(this.display==='shape')return;
    const summary=stressSummary(this.results,mode);
    if(!summary)return;
    const table=this.results.areaStresses[summary.stressCase];
    const lambda=summary.lambda;
    const scale=Math.max(1e-12,Math.abs(summary.compressionMax),
      ...Object.values(table).map(r=>Math.abs(r[0])));
    for(const {part} of modalParts){
      const ids=part.orig.userData?.faceAreaIds;
      if(!ids)continue;
      fill(part,tri=>{
        const row=table[ids[tri]];
        if(!row)return HIDDEN_COLOUR;
        if(this.display==='yield')return utilisationColour(areaValue(row,'yield',{lambda,fy:summary.fy}));
        return divergingColour(row[0]/scale);
      });
    }
  }
  legend(mode){
    if(this.hideShape)return {title:'MODO PREGUNTA',lo:'Forma oculta',hi:'λ oculto',
      gradient:'linear-gradient(90deg,#8ca8b8,#8ca8b8)'};
    if(this.display==='shape')return null;
    const s=stressSummary(this.results,mode);
    if(!s)return {title:'SIN TENSIONES PARA ESTE CASO',lo:'—',hi:'—',gradient:null};
    // Utilisation at the buckling load: green up to 0.5, yellow towards 1 and red
    // above 1 (that plate would already have yielded before buckling).
    if(this.display==='yield')return {title:'σ_vm / fy CON LA CARGA DE PANDEO λ·P',lo:'0',
      hi:'1 · rojo: > 1, plastifica antes',
      gradient:'linear-gradient(90deg,#2ea861 0%,#2ea861 40%,#f7cc33 80%,#d62e26 80%,#d62e26 100%)'};
    const k=this.atBuckling?s.lambda:1;
    return {title:'σ MEMBRANA MÍNIMA · '+(this.atBuckling?'a λ·P':'a la carga de referencia'),
      lo:fmtG(s.compressionMax*k)+' MPa',hi:'tracción',
      gradient:'linear-gradient(90deg,#2160d9,#dbe0e6,#db4529)'};
  }

  // -------------------------------------------------------------- quiz
  startQuiz(seed=Date.now()){
    const cases=lessonCases(this.results);
    if(!cases.length)return;
    this.student=$('bt-student')?.value?.trim()??this.student;
    let s=seed>>>0;
    const random=()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);
      t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
    this.quiz={cases,random,i:0,picked:[],score:0,total:0,revealed:false,feedback:null,
      step:this.results.teaching?.order_question&&cases.length>1?'order':'type'};
    if(this.quiz.step!=='order')this.enterCase();
    else{this.selectMode(cases[0].shown.index);this.question={kind:'order'};}
    this.display='shape';this.refreshScene();
  }
  stopQuiz(){this.quiz=null;this.question=null;this.clearMarker();this.refreshScene();}
  enterCase(){
    const q=this.quiz,c=q.cases[q.i];
    q.revealed=false;q.feedback=null;q.step='type';
    this.question=typeQuestion(this.results,c.spec,q.random);
    this.clearMarker();
    this.selectMode(c.shown.index);
  }
  record(question,answer,correct,ok){
    const q=this.quiz,c=q.cases[q.i];
    q.total++;if(ok)q.score++;
    this.log.push({model:this.results.teaching?.title??this.results.meta?.name??'',
      case:question==='orden'?'todos':c.spec.label??c.name,question,answer,correct,ok,
      time:new Date().toISOString()});
  }
  pickOrder(name){
    const q=this.quiz;if(!q||q.step!=='order'||q.feedback)return;
    if(!q.picked.includes(name))q.picked.push(name);
    if(q.picked.length===q.cases.length){
      const ok=checkOrder(q.cases,q.picked),label=n=>q.cases.find(c=>c.name===n)?.spec.label??n;
      const right=orderAnswer(q.cases).map(label).join(' < ');
      this.record('orden',q.picked.map(label).join(' < '),right,ok);
      q.feedback={ok,text:(ok?'Correcto: ':'El orden es: ')+right};
    }
    this.render();this.markDirty();
  }
  answer(key){
    const q=this.quiz,question=this.question;
    if(!q||q.feedback||!question)return;
    if(question.kind==='type'){
      const ok=key===question.answer;
      this.record('tipo',typeLabel(key,this.results),typeLabel(question.answer,this.results),ok);
      q.feedback={ok,text:ok?'Correcto.':'No: es '+typeLabel(question.answer,this.results)+'.'};
    }else if(question.kind==='magnitude'){
      const ok=key===question.answer;
      const value=o=>fmtG(question.options.find(x=>x.key===o)?.value);
      this.record('λ',value(key),value(question.answer),ok);
      q.feedback={ok,text:ok?'Correcto.':'No: λ ≈ '+value(question.answer)+'.'};
    }
    this.render();this.markDirty();
  }
  next(){
    const q=this.quiz;if(!q)return;
    const c=q.cases[q.i];
    q.feedback=null;
    if(q.step==='order'){this.enterCase();}
    else if(q.step==='type'){
      if(c.spec.ask_where){q.step='where';this.question={kind:'where'};}
      else this.toMagnitude();
    }else if(q.step==='where')this.toMagnitude();
    else if(q.step==='magnitude'){q.step='reveal';q.revealed=true;this.question=null;}
    else if(q.step==='reveal'){
      if(q.i+1<q.cases.length){q.i++;this.enterCase();}
      else{q.step='end';q.revealed=true;}
    }
    this.refreshScene();
  }
  toMagnitude(){
    const q=this.quiz;q.step='magnitude';
    this.question=magnitudeQuestion(q.cases[q.i].shown.mode.factor,q.random);
  }
  // "Where does it buckle?": point on the structure (mouse or Quest ray).
  pickWhere(raycaster){
    if(!this.awaitingWhere)return false;
    const app=this.app;
    const targets=[...app.deformedGroup.children,...app.originalGroup.children].filter(o=>o.visible);
    const hit=raycaster.intersectObjects(targets,false)[0];
    if(!hit)return true;
    const local=app.contentRoot.worldToLocal(hit.point.clone());
    const point=[local.x-app.offset[0],local.y-app.offset[1],local.z-app.offset[2]];
    const mode=this.quiz.cases[this.quiz.i].shown.mode;
    const score=whereScore(makeDisplacementSampler(modeNodes(this.results,mode)),point);
    const ok=score>=WHERE_THRESHOLD;
    this.record('dónde',Math.round(score*100)+' % de la amplitud máxima','≥ '+WHERE_THRESHOLD*100+' %',ok);
    this.quiz.feedback={ok,text:ok?'Bien: ahí está la mayor deformación del modo ('+Math.round(score*100)+' %).':
      'Ahí el modo apenas se mueve ('+Math.round(score*100)+' % del máximo). Al revelar el modo verás dónde.'};
    this.setMarker(local,ok);
    this.render();this.markDirty();
    return true;
  }
  setMarker(local,ok){
    this.clearMarker();
    const size=(this.app.maxSize||5)*.012;
    this.marker=new THREE.Mesh(new THREE.SphereGeometry(size,16,12),
      new THREE.MeshBasicMaterial({color:ok?0x3fd17a:0xf26b4f,depthTest:false}));
    this.marker.renderOrder=3000;this.marker.position.copy(local);
    this.app.contentRoot.add(this.marker);
  }
  clearMarker(){
    if(!this.marker)return;
    this.app.contentRoot.remove(this.marker);this.marker.geometry.dispose();this.marker.material.dispose();
    this.marker=null;
  }
  downloadCSV(){
    const csv=answersCSV(this.log,this.student);
    const url=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;
    a.download='RESPUESTAS_PANDEO_'+(this.student||'alumno').replace(/\W+/g,'_')+'.csv';
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),12000);
  }

  // ------------------------------------------------------ text helpers
  summaryLines(){
    const mode=this.currentMode();
    if(!mode||this.hideShape)return [];
    const s=stressSummary(this.results,mode);
    const lines=['λ_cr = '+fmtG(mode.factor)];
    if(s){
      lines.push('σ_vm,máx = '+fmtG(s.sigmaVmMax)+' MPa a la carga de referencia · fy = '+fmtG(s.fy)+' MPa');
      if(s.lambdaY){
        lines.push('λ_y = fy/σ_vm,máx = '+fmtG(s.lambdaY)+' (primera plastificación)');
        lines.push('λ̄ = √(λ_y/λ_cr) = '+fmt(s.slenderness,2)+' · '+VERDICT_TEXT[s.verdict]);
      }
      if(s.lambdaY&&this.display==='yield')lines.push('Con la carga de pandeo, σ_vm/fy llega a '+
        fmt(s.lambda/s.lambdaY,2)+(s.lambda>s.lambdaY?': las placas en rojo ya habrían plastificado.':
        ': ninguna placa llega a plastificar antes de pandear.'));
      if(s.excluded)lines.push('Sin contar '+s.excluded+' placas junto a los apoyos.');
    }
    return lines;
  }
  quizView(){
    const q=this.quiz;if(!q)return null;
    const c=q.cases[q.i];
    const head=q.step==='order'?'Ordena las piezas de menor a mayor carga crítica':
      q.step==='end'?'Fin · '+q.score+' de '+q.total+' aciertos':
      (c.spec.label??c.name)+' · pregunta '+(q.i+1)+' de '+q.cases.length;
    let prompt='',options=[],next=null;
    if(q.step==='order'){
      prompt='Pulsa las piezas en orden ('+q.picked.length+'/'+q.cases.length+').';
      options=q.cases.map(x=>({id:'order:'+x.name,label:x.spec.label??x.name,
        done:q.picked.includes(x.name)}));
    }else if(q.step==='type'||q.step==='magnitude'){
      prompt=this.question.prompt;
      options=this.question.options.map(o=>({id:'answer:'+o.key,
        label:this.question.kind==='magnitude'?'λ ≈ '+fmtG(o.value):o.label}));
    }else if(q.step==='where'){
      prompt='Señala con el ratón o con el mando dónde pandea la pieza.';
    }else if(q.step==='reveal'){
      prompt='λ = '+fmtG(c.shown.mode.factor)+' · '+typeLabel(c.spec.type,this.results)+'. '+(c.spec.explain??'');
    }else if(q.step==='end'){
      prompt='Puedes descargar tus respuestas en CSV o volver a empezar.';
    }
    if(q.feedback||q.step==='reveal')next=q.step==='reveal'&&q.i+1>=q.cases.length?'Terminar':'Siguiente';
    if(q.step==='where'&&!q.feedback)next='No lo sé';
    // After the reveal, the asked mode and the other modes of interest can be
    // viewed in any order: one button each, the one on screen marked active.
    const current=this.app.sapVisuals?.modeIndex;
    const also=q.step==='reveal'?[
      {index:c.shown.index,label:typeLabel(c.spec.type,this.results)+' · λ = '+fmtG(c.shown.mode.factor)},
      ...(c.spec.also??[]).map(a=>{
        const m=caseModes(this.results,c.name)[(a.rank|0)-1];
        return m?{index:m.index,label:(a.note??typeLabel(a.type,this.results))+' · λ = '+fmtG(m.mode.factor)}:null;
      }).filter(Boolean)].map(v=>({...v,active:v.index===current})):[];
    return {head,prompt,options,feedback:q.feedback,next,also:also.length>1?also:[],end:q.step==='end'};
  }

  // ------------------------------------------------------ desktop panel
  buildPanel(){
    const anchor=$('modal-amplitude')?.closest('.range-control');
    if(!anchor||$('bt-panel'))return;
    const panel=document.createElement('section');
    panel.id='bt-panel';panel.className='bt-panel';panel.hidden=true;
    panel.innerHTML=`
      <div class="control"><label for="bt-display">Mostrar en las placas</label>
        <select id="bt-display">${Object.entries(DISPLAYS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
      <label class="checkrow" id="bt-at-row"><input id="bt-at-buckling" type="checkbox"/> A la carga crítica (× λ)</label>
      <div id="bt-summary" class="bt-summary"></div>
      <div class="bt-quiz-head"><strong>Modo pregunta</strong>
        <input id="bt-student" type="text" placeholder="Nombre del alumno" autocomplete="off"/>
        <button id="bt-start" type="button">Empezar</button><button id="bt-stop" type="button">Salir</button></div>
      <div id="bt-quiz" class="bt-quiz"></div>
      <button id="bt-csv" type="button" class="bt-csv">Descargar respuestas (CSV)</button>`;
    anchor.after(panel);
    $('bt-display').addEventListener('change',e=>this.setDisplay(e.target.value));
    $('bt-at-buckling').addEventListener('change',e=>this.setAtBuckling(e.target.checked));
    $('bt-start').addEventListener('click',()=>this.startQuiz());
    $('bt-stop').addEventListener('click',()=>this.stopQuiz());
    $('bt-csv').addEventListener('click',()=>this.downloadCSV());
    $('bt-quiz').addEventListener('click',e=>{
      const id=e.target.closest('button')?.dataset.id;if(id)this.command(id);
    });
  }
  command(id){
    if(id==='next')this.next();
    else if(id.startsWith('order:'))this.pickOrder(id.slice(6));
    else if(id.startsWith('answer:'))this.answer(id.slice(7));
    else if(id.startsWith('mode:'))this.selectMode(Number(id.slice(5)));
    else if(id==='start')this.startQuiz();
    else if(id==='stop')this.stopQuiz();
    else if(id==='display')this.setDisplay(nextKey(DISPLAYS,this.display));
    else if(id==='at-buckling')this.setAtBuckling(!this.atBuckling);
  }
  render(){
    const panel=$('bt-panel');if(!panel)return;
    const show=this.app.sapVisuals?.view==='buckling'&&this.available;
    panel.hidden=!show;
    const modeRow=$('mode-select')?.closest('.control');
    if(modeRow)modeRow.classList.toggle('bt-hidden',this.hideShape);
    if(!show)return;
    $('bt-display').value=this.display;$('bt-display').disabled=!this.hasStresses;
    $('bt-at-row').classList.toggle('bt-hidden',this.display!=='stress');
    $('bt-at-buckling').checked=this.atBuckling;
    $('bt-summary').innerHTML=this.summaryLines().map(l=>`<div>${l}</div>`).join('');
    $('bt-start').hidden=Boolean(this.quiz)||!this.hasLesson;
    $('bt-student').hidden=Boolean(this.quiz)||!this.hasLesson;
    $('bt-stop').hidden=!this.quiz;
    $('bt-csv').hidden=!this.log.length;
    const v=this.quizView(),box=$('bt-quiz');
    if(!v){box.innerHTML=this.hasLesson?'':'<p class="bt-note">Este modelo no incluye preguntas.</p>';return;}
    box.innerHTML=`<p class="bt-head">${v.head}</p><p>${v.prompt}</p>`+
      v.options.map(o=>`<button type="button" data-id="${o.id}" ${o.done?'disabled':''}>${o.label}</button>`).join('')+
      (v.feedback?`<p class="bt-feedback ${v.feedback.ok?'ok':'ko'}">${v.feedback.text}</p>`:'')+
      v.also.map(a=>`<button type="button" class="bt-also${a.active?' active':''}" data-id="mode:${a.index}" ${a.active?'disabled':''}>${a.active?'Viendo':'Ver'}: ${a.label}</button>`).join('')+
      (v.next?`<button type="button" class="bt-next" data-id="next">${v.next}</button>`:'');
  }

  // ------------------------------------------------------ Quest menu page
  xrPaint(btn,txt){
    btn('back','‹ Volver',38,117,230,66);
    txt('PANDEO · DOCENCIA',38,222,28,'#e6f6fc');
    btn('bt:display','PLACAS: '+DISPLAYS[this.display].toUpperCase(),38,262,692,66,true,this.hasStresses);
    btn('bt:at-buckling',this.atBuckling?'TENSIONES A λ·P':'TENSIONES A P (REFERENCIA)',
      38,338,692,56,false,this.display==='stress');
    this.summaryLines().slice(0,3).forEach((l,k)=>txt(l,38,420+k*30,18,'#a6eeea'));
    const v=this.quizView();
    if(!v){
      btn('bt:start','MODO PREGUNTA: EMPEZAR',38,530,692,80,true,this.hasLesson);
      if(!this.hasLesson)txt('Este modelo no incluye preguntas.',38,640,19);
      return;
    }
    txt(v.head,38,530,22,'#e6f6fc');
    wrap(v.prompt,62).slice(0,4).forEach((l,k)=>txt(l,38,568+k*28,18,'#d4eef5'));
    let y=690;
    for(const o of v.options.slice(0,4)){
      btn('bt:'+o.id,o.label,38,y,692,62,false,!o.done&&!v.feedback);y+=70;
    }
    if(v.feedback){wrap(v.feedback.text,62).slice(0,2).forEach((l,k)=>
      txt(l,38,y+12+k*26,18,v.feedback.ok?'#8ff0b6':'#ffb09c'));y+=62;}
    for(const a of v.also){
      if(y>=950)break;
      btn('bt:mode:'+a.index,(a.active?'VIENDO: ':'VER: ')+a.label,38,y,692,54,false,!a.active);y+=60;
    }
    if(v.next)btn('bt:next',v.next.toUpperCase(),38,Math.max(y,960),335,62,true);
    btn('bt:stop','SALIR DE PREGUNTAS',395,Math.max(y,960),335,62);
  }
  xrCommand(id){this.command(id.slice(3));this.markDirty();}
}

function fill(part,colourOfTriangle){
  const attr=part.deformed.geometry.getAttribute('color');
  for(let v=0;v<attr.count;v++){
    const [r,g,b]=colourOfTriangle(Math.floor(v/3));
    attr.setXYZ(v,r,g,b);
  }
  attr.needsUpdate=true;
}
function nextKey(obj,key){const keys=Object.keys(obj);return keys[(keys.indexOf(key)+1)%keys.length];}
function wrap(text,width){
  const out=[];let line='';
  for(const word of String(text).split(/\s+/)){
    if((line+' '+word).trim().length>width){out.push(line);line=word;}else line=(line+' '+word).trim();
  }
  if(line)out.push(line);
  return out;
}
