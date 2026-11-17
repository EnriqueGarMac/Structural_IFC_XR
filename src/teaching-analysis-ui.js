// Both educational experiences reuse the platform's existing Analysis tab.
// No second results navigation stack or independent engineering solver.
import {cssForceGradient,cssResultGradient} from './visual-palettes.mjs';
const $=id=>document.getElementById(id);
const fmt=(value,d=2)=>Number.isFinite(value)?Number(value).toLocaleString('es-ES',
  {minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const modes={
  truss:[['axial','Esfuerzo axial N (kN)'],['stress','Tensión normal σ (MPa)'],
    ['strain','Deformación ε'],['displacement','Desplazamiento |u| (mm)']],
  bridge:[['axial','Esfuerzo axial N (kN)'],['stress','Tensión normal σ (MPa)'],
    ['utilization','Aprovechamiento (%)'],['displacement','Desplazamiento |u| (mm)']]
};
function grid(headers,rows){
  const safe=v=>String(v??'—').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  return '<table><thead><tr>'+headers.map(h=>'<th>'+safe(h)+'</th>').join('')+
    '</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+safe(v)+'</td>').join('')+
    '</tr>').join('')+'</tbody></table>';
}
export function setupTeachingAnalysis(app,{selectWorkspace}={}){
  const panel=$('teaching-analysis-results'),selector=$('teaching-analysis-mode');
  const info=$('teaching-analysis-context'),summary=$('teaching-analysis-summary'),
    tables=$('teaching-analysis-tables'),legend=$('teaching-analysis-legend'),
    amplification=$('teaching-amp'),axialLabels=$('teaching-axial-labels');
  let current=null;
  const render=(kind,result,experience)=>{
    current={kind,result,experience};
    document.body.classList.add('teaching-results-active');
    panel.hidden=false;
    const previous=selector.dataset.kind;
    if(previous!==kind){
      selector.replaceChildren();
      modes[kind].forEach(([value,label])=>selector.add(new Option(label,value)));
      selector.dataset.kind=kind;
    }
    selector.value=experience.mode;
    amplification.value=String(experience.ampFactor??1);
    $('teaching-amp-value').textContent='×'+fmt(experience.ampFactor??1,1);
    axialLabels.checked=Boolean(experience.showAxialLabels);
    if(!result){
      info.textContent='Diseño modificado. Calcula la resistencia antes de consultar resultados.';
      summary.textContent='SIN COMPROBAR · Resultados anteriores descartados';
      legend.textContent='Sin análisis disponible para el diseño actual.';
      tables.replaceChildren();
      $('legend-title').textContent='SIN RESULTADOS';
      $('legend-min').textContent='—';$('legend-max').textContent='—';
      return;
    }
    info.textContent=kind==='bridge'?'Concurso de pasarelas · celosía 2D · peso propio y carga central':
      'Cálculo matricial de celosías planas · cargas nodales';
    const bars=kind==='bridge'?result.members:result.bars;
    const displacement=kind==='bridge'?result.maxDeflection_mm:result.maxDisplacement_m*1000;
    const mode=experience.mode, palette=experience.palette??'classic';
    const name=Object.fromEntries(modes[kind])[mode];
    const values=mode==='axial'?bars.map(b=>b.axial_kN):
      mode==='stress'?bars.map(b=>b.stress_MPa):
      mode==='strain'?bars.map(b=>b.strain):
      mode==='utilization'?bars.map(b=>(b.utilization||0)*100):
      result.displacements.map(d=>(d.magnitude_m??Math.hypot(d.ux_m,d.uz_m))*1000);
    const finite=values.filter(Number.isFinite);
    const min=finite.length?Math.min(...finite):0;
    const max=finite.length?Math.max(...finite):0;
    const unit={axial:'kN',stress:'MPa',strain:'',utilization:'%',displacement:'mm'}[mode];
    const signed=['axial','stress','strain'].includes(mode);
    const colorGradient=signed?cssForceGradient(palette):cssResultGradient(palette);
    const rangeDigits=mode==='strain'?7:mode==='displacement'?3:2;
    const minText=fmt(min,rangeDigits)+(unit?' '+unit:'');
    const maxText=fmt(max,rangeDigits)+(unit?' '+unit:'');
    // Reuse the same floating legend as the main viewer instead of a
    // second unrelated colour key. Only the calculation source changes.
    $('legend-title').textContent=name.toUpperCase();
    $('legend-min').textContent=minText;
    $('legend-max').textContent=maxText;
    const stageBar=$('legend').querySelector('.legend-bar');
    if(stageBar)stageBar.style.background=colorGradient;
    legend.innerHTML='<strong>'+name+'</strong>'+
      '<div class="teaching-colour-ramp" style="background:'+colorGradient+'"></div>'+
      '<div class="teaching-colour-limits"><span>'+minText+'</span><span>'+maxText+'</span></div>'+
      '<div>Amplificación visual ×'+fmt(experience.ampFactor??1,1)+
      '. Valores y comprobaciones sin amplificar.</div>';
    summary.textContent=kind==='bridge'?
      'Estado: '+(result.status==='stable'?'APTA':result.status==='service'?'FLECHA EXCESIVA':
        'NO RESISTE')+' · Peso '+fmt(result.totalMass_kg)+' kg · Flecha '+
        fmt(displacement,3)+' mm · Aprovechamiento máximo '+
        fmt(result.maxUtilization==null?NaN:result.maxUtilization*100,1)+' %':
      'Desplazamiento máximo '+fmt(displacement,3)+' mm · '+result.bars.length+' barras';
    const barRows=bars.map(b=>[b.id,b.i+'–'+b.j,fmt(b.axial_kN,3),
      fmt(b.stress_MPa,3),fmt(b.strain,7),kind==='bridge'?fmt(b.utilization*100,1)+' %':
        fmt(b.extension_mm,3)+' mm']);
    const supports=result.reactions.map(r=>[r.nodeId,fmt(r.rx_kN,3),fmt(r.rz_kN,3)]);
    const motions=result.displacements.map(d=>[d.nodeId,fmt(d.ux_m*1000,3),
      fmt(d.uz_m*1000,3)]);
    tables.innerHTML='<h3>Barras</h3>'+grid(['ID','Nodos','N (kN)','σ (MPa)','ε',
      kind==='bridge'?'Uso':'ΔL'],barRows)+
      '<h3>Reacciones</h3>'+grid(['Apoyo','Rx (kN)','Rz (kN)'],supports)+
      '<h3>Desplazamientos nodales</h3>'+grid(['Nodo','Ux (mm)','Uz (mm)'],motions);
  };
  selector.addEventListener('change',()=>{
    if(!current)return;
    current.experience.setMode(selector.value);
  });
  amplification.addEventListener('input',()=>{
    if(!current)return;
    current.experience.setAmplification(Number(amplification.value));
  });
  axialLabels.addEventListener('change',()=>{
    if(!current)return;
    current.experience.setAxialLabels(axialLabels.checked);
  });
  for(const id of ['truss-open-analysis','bridge-open-analysis'])
    $(id)?.addEventListener('click',()=>selectWorkspace?.('analysis'));
  const leave=()=>{
    current=null;panel.hidden=true;
    document.body.classList.remove('teaching-results-active');
  };
  app.updateTeachingAnalysis=render;
  app.setTeachingAmplification=value=>{
    if(current)current.experience.setAmplification(value);
  };
  app.clearTeachingAnalysis=leave;
  return {render,leave};
}
