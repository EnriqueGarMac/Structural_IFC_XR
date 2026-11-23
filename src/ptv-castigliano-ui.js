import {LESSON,solveLesson,evaluateLesson,reportText} from './ptv-castigliano-core.mjs';
const stages=[
 {title:'01 · Equipo y misión',intro:'Formad un grupo de cuatro. Una persona dirige la experiencia XR y explica la geometría, otra calcula el estado real, otra el estado virtual y otra verifica la energía. Los tres móviles pueden consultar esta página como guía; las respuestas oficiales se registran en un solo dispositivo.',fields:[['group','Código de grupo','text'],['xr','Responsable de gafas','text'],['real','Responsable estado real','text'],['virtual','Responsable estado virtual','text'],['energy','Responsable energía y revisión','text']]},
 {title:'02 · Predicción razonada',intro:'Antes de resolver: celosía triangular A(0,0), B(4,0), C(2,2) m. A articulación, B rodillo vertical. Una carga P=10 kN actúa hacia abajo en C. Convención: N positivo a tracción. Discutid los signos de las tres barras antes de continuar.',fields:[['prediction','Predicción de esfuerzos','select',[['','Elegid una hipótesis'],['AB-traccion-diagonales-compresion','AB tracción; AC y BC compresión'],['AB-compresion-diagonales-traccion','AB compresión; AC y BC tracción'],['todos-traccion','Todas a tracción'],['todos-compresion','Todas a compresión']]],['reason','Explicad por qué (mínimo 25 caracteres)','textarea']]},
 {title:'03 · Estado real: equilibrio',intro:'Calculad primero las reacciones verticales y después los axiles N. No se muestran las soluciones hasta registrar la respuesta. Recordad el equilibrio en el nudo C y que las diagonales forman 45°.',fields:[['ra','Reacción vertical en A (kN)','number'],['rb','Reacción vertical en B (kN)','number'],['nab','N_AB (kN)','number'],['nac','N_AC (kN)','number'],['nbc','N_BC (kN)','number']]},
 {title:'04 · Estado virtual unitario',intro:'El objetivo es el desplazamiento vertical de C hacia abajo. Retirad las cargas reales y aplicad una carga virtual de 1 kN hacia abajo en C. Calculad los axiles virtuales n_i, expresados por unidad de carga. Comparad signos y magnitudes con el estado real.',fields:[['vab','n_AB (adimensional)','number'],['vac','n_AC (adimensional)','number'],['vbc','n_BC (adimensional)','number']]},
 {title:'05 · Trabajos virtuales',intro:'Usad δ_C=Σ N_i n_i L_i/(EA). Datos: E=200 GPa, A=1000 mm² para todas las barras. Longitudes: AB=4 m, AC=BC=√8 m. Introducid las aportaciones en mm, con signo, y el desplazamiento total positivo hacia abajo.',fields:[['cab','Contribución AB (mm)','number'],['cac','Contribución AC (mm)','number'],['cbc','Contribución BC (mm)','number'],['delta','Desplazamiento vertical δ_C (mm)','number']]},
 {title:'06 · Castigliano y conexión',intro:'La energía axial es U=Σ N_i² L_i/(2EA). Introducid una carga auxiliar Q hacia abajo en C. Con N_i(P,Q)=(P+Q)n_i, demostrad que ∂U/∂Q evaluada en Q=0 reproduce el PTV. Indicad U en julios y δ en mm.',fields:[['energy','Energía U para P=10 kN (J)','number'],['castdelta','∂U/∂Q en Q=0 (mm)','number'],['explanation','Justificad la equivalencia entre PTV y Castigliano (mínimo 80 caracteres)','textarea']]},
 {title:'07 · Reflexión y entrega',intro:'Debatid qué ocurre si se duplica P y qué sucede si se duplica el área de todas las barras. Registrad una explicación física, revisad los resultados y generad el informe evaluable. La entrega por correo requiere confirmación en la aplicación de correo.',fields:[['reflection','Conclusión razonada del grupo (mínimo 80 caracteres)','textarea']]}
];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const savedKey='imis-ptv-castigliano-v1';
function diagram(){
 return '<svg viewBox="0 0 460 235" role="img" aria-label="Celosía triangular: A a la izquierda, B a la derecha, C en el vértice, carga vertical descendente en C" style="max-width:100%;background:#102b39;border-radius:12px"><path d="M 60 180 L 400 180 L 230 45 Z" fill="none" stroke="#86e7d9" stroke-width="7"/><path d="M60 191 l-16 20 h32z M400 191 l-16 20 h32z" fill="#d4e6ee"/><line x1="230" y1="3" x2="230" y2="33" stroke="#ffb78a" stroke-width="4"/><path d="M222 26 L230 39 L238 26" fill="none" stroke="#ffb78a" stroke-width="3"/><g fill="white" font-size="18"><text x="42" y="173">A</text><text x="409" y="174">B</text><text x="244" y="53">C</text><text x="246" y="20">P=10 kN</text><text x="211" y="202">AB</text><text x="115" y="96">AC</text><text x="333" y="96">BC</text></g></svg>';
}
export function setupPTVCastigliano(){
 const root=document.getElementById('ptv-castigliano-root');
 const start=document.getElementById('ptv-castigliano-start');
 if(!root||!start)return;
 let answers={},stage=0,completed=false;
 try{const saved=JSON.parse(localStorage.getItem(savedKey)||'null');if(saved){answers=saved.answers||{};stage=Math.min(6,Math.max(0,saved.stage||0));completed=!!saved.completed;}}catch{}
 const persist=()=>{try{localStorage.setItem(savedKey,JSON.stringify({answers,stage,completed}));}catch{}};
 const render=()=>{
   root.hidden=false;
   const item=stages[stage];
   const fields=item.fields.map(([id,label,type,opts])=>'<label style="display:block;margin:12px 0">'+esc(label)+
     (type==='textarea'?'<textarea data-answer="'+id+'" rows="4" style="width:100%">'+esc(answers[id]||'')+'</textarea>':
      type==='select'?'<select data-answer="'+id+'" style="width:100%">'+opts.map(([v,l])=>'<option value="'+esc(v)+'"'+(answers[id]===v?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select>':
      '<input data-answer="'+id+'" type="'+type+'" '+(type==='number'?'step="any" inputmode="decimal"':'')+' value="'+esc(answers[id]||'')+'" style="width:100%">')+'</label>').join('');
   const teacherEmail=document.getElementById('ptv-teacher-email')?.value||'';
   root.innerHTML='<button type="button" id="ptv-close" class="secondary-btn">Volver a experiencias docentes</button>'+ 
     '<label for="ptv-teacher-email">Correo del profesor <input id="ptv-teacher-email" type="email" placeholder="profesor@universidad.es"></label>'+ 
     '<div class="teaching-active-head"><strong>PTV y Castigliano · aprendizaje cooperativo</strong><span>Fase '+(stage+1)+' de 7 · '+(completed?'Finalizada':'En curso')+'</span></div>'+
     '<p>Una persona utiliza las Quest y tres trabajan en sus móviles. Deben debatir antes de registrar una única respuesta consensuada.</p>'+
     diagram()+'<h3>'+esc(item.title)+'</h3><p>'+esc(item.intro)+'</p>'+fields+
     '<p id="ptv-feedback" role="status" aria-live="polite"></p>'+
     '<div style="display:flex;flex-wrap:wrap;gap:10px;margin:16px 0">'+
     (stage?'<button type="button" id="ptv-prev" class="secondary-btn">Volver</button>':'')+
     '<button type="button" id="ptv-next" class="secondary-btn teaching-primary">'+(stage===6?'Evaluar y finalizar':'Comprobar y continuar')+'</button>'+
     '<button type="button" id="ptv-reset" class="secondary-btn">Reiniciar práctica</button></div>'+
     (completed?'<div id="ptv-report"></div>':'');
   root.querySelector('#ptv-teacher-email').value=teacherEmail;
   root.querySelectorAll('[data-answer]').forEach(el=>el.addEventListener('input',()=>{answers[el.dataset.answer]=el.value;completed=false;persist();}));
   root.querySelector('#ptv-prev')?.addEventListener('click',()=>{stage--;persist();render();});
   root.querySelector('#ptv-reset').addEventListener('click',()=>{
     if(!confirm('¿Reiniciar todas las respuestas de esta práctica?'))return;
     answers={};stage=0;completed=false;persist();render();
   });
   root.querySelector('#ptv-next').addEventListener('click',()=>{
     const feedback=root.querySelector('#ptv-feedback'),e=evaluateLesson(answers);
     const requirements=[['roles'],['prediction'],['reactions','axial'],['virtual'],['contributions','displacement'],['castigliano','explanation'],['reflection']];
     const missing=requirements[stage].filter(k=>!e.checks[k]);
     if(missing.length){
       feedback.textContent='Revisad antes de continuar: '+missing.join(', ')+'. Comprobad signos, unidades y razonamiento. Cada integrante debe justificar su respuesta.';
       return;
     }
     if(stage<6){stage++;persist();render();}
     else{completed=true;persist();render();}
   });
   if(completed){
     const e=evaluateLesson(answers);
     const report=root.querySelector('#ptv-report');
     report.innerHTML='<h3>Práctica completada · '+e.score+'/100</h3><p>Revisad el informe antes de enviarlo. Las preguntas abiertas requieren evaluación docente adicional.</p>'+
       '<button type="button" class="secondary-btn" id="ptv-download">Descargar hoja evaluable (.txt)</button> '+
       '<button type="button" class="secondary-btn" id="ptv-email">Preparar correo de entrega</button>';
     const content=reportText(answers);
     report.querySelector('#ptv-download').addEventListener('click',()=>{
       const url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}));
       const a=document.createElement('a');a.href=url;a.download='IMIS_PTV_'+(answers.group||'grupo').replace(/[^a-z0-9_-]/gi,'_')+'.txt';a.click();
       setTimeout(()=>URL.revokeObjectURL(url),10000);
     });
     report.querySelector('#ptv-email').addEventListener('click',()=>{
       const recipient=document.getElementById('ptv-teacher-email')?.value?.trim()||'';
       if(!recipient||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)){
         alert('Introduce primero el correo del profesor. No se ha enviado ningún mensaje.');return;
       }
       const subject='Práctica PTV y Castigliano · '+(answers.group||'grupo');
       const body='Adjuntamos nuestra hoja de respuestas evaluable de PTV y Castigliano. Puntuación orientativa: '+e.score+'/100.\n\nAdjuntaremos el archivo descargado desde la aplicación.';
       window.location.href='mailto:'+encodeURIComponent(recipient)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
     });
   }
 };
 start.addEventListener('click',()=>{document.getElementById('teaching-picker').hidden=true;root.hidden=false;render();root.scrollIntoView({behavior:'smooth',block:'start'});});
 root.addEventListener('click',e=>{if(e.target?.id==='ptv-close'){root.hidden=true;document.getElementById('teaching-picker').hidden=false;}});
}
