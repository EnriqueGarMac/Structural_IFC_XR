// Adapter for educational results: reuses the main Analysis selectors,
// amplification slider, force-value toggle and stage legend. The original
// result tables remain in Resources, where the exercises are edited.
import {cssForceGradient,cssResultGradient} from './visual-palettes.mjs';
import {teachingResultsToViewer,TEACHING_CASE} from './teaching-results-adapter.mjs';
import {SAPVisuals} from './sap-visuals.js';
import {ReactionVisuals} from './reaction-visuals.js';
const $=id=>document.getElementById(id);
const fmt=(value,d=2)=>Number.isFinite(value)?Number(value).toLocaleString('es-ES',
  {minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const baseViews=[
  ['deformation','Desplazamientos'],
  ['forces','Esfuerzos internos'],
  ['reactions','Reacciones en apoyos'],
  ['modes','Modos de vibración'],
  ['buckling','Modos de pandeo']
];
const teachingViews={
  truss:[
    ['forces','Esfuerzo axial N (kN)'],
    ['stress','Tensión normal σ (MPa)'],
    ['strain','Deformación unitaria ε'],
    ['deformation','Desplazamientos |u| (mm)'],
    ['reactions','Reacciones de apoyo (kN)']
  ],
  bridge:[
    ['forces','Esfuerzo axial N (kN)'],
    ['stress','Tensión normal σ (MPa)'],
    ['utilization','Aprovechamiento (%)'],
    ['deformation','Desplazamientos |u| (mm)'],
    ['reactions','Reacciones de apoyo (kN)']
  ]
};
const modeForView={forces:'axial',stress:'stress',strain:'strain',
  utilization:'utilization',deformation:'displacement',reactions:'axial'};
const viewForMode={axial:'forces',stress:'stress',strain:'strain',
  utilization:'utilization',displacement:'deformation'};
export function setupTeachingAnalysis(app,{selectWorkspace}={}){
  const view=$('analysis-view'),amp=$('amp'),showValues=$('toggle-force-values'),
    forceControls=$('force-values-controls'),legend=$('legend');
  const reactionControls=$('reaction-values-controls'),reactionButton=$('toggle-reaction-values');
  const componentSelect=$('force-component'),componentRow=componentSelect.closest('.control');
  const originalComponents=[...componentSelect.options].map(o=>({value:o.value,disabled:o.disabled}));
  // Dedicated renderers but the SAME implementations as the main SAP view.
  // The proxy prevents teaching data from overwriting the imported SAP model.
  const proxy={contentRoot:app.contentRoot,worldRoot:app.worldRoot,
    scene:app.scene,offset:[0,0,0],maxSize:1,caseName:TEACHING_CASE,
    results:null,xrControls:app.xrControls,
    clearGroup:group=>app.clearGroup(group),
    updateVisualization:()=>{forceRenderer.refresh();reactionRenderer.refresh();}};
  const forceRenderer=app.contentRoot?new SAPVisuals(proxy):{
    group:{visible:false},component:'P',showCharacteristics:false,
    refresh(){},clear(){},pickForce(){return null;},pinSection(){}
  };
  const reactionRenderer=app.contentRoot?new ReactionVisuals(proxy):{
    group:{visible:false},showValues:false,refresh(){},clear(){},
    setValues(enabled){this.showValues=Boolean(enabled);},pick(){return null;}
  };
  proxy.sapVisuals=forceRenderer;
  forceRenderer.group.visible=false;reactionRenderer.group.visible=false;
  forceRenderer.component='P';
  app.teachingForceRenderer=forceRenderer;
  app.teachingReactionRenderer=reactionRenderer;
  view.closest('.control')?.classList.add('teaching-shared-control');
  amp.closest('.range-control')?.classList.add('teaching-shared-control');
  forceControls.classList.add('teaching-shared-control');
  reactionControls.classList.add('teaching-shared-control');
  componentRow.classList.add('teaching-shared-control');
  let current=null;
  const setOptions=options=>{
    view.replaceChildren(...options.map(([id,title])=>new Option(title,id)));
  };
  const refresh=()=>{
    if(!current)return;
    const {kind,result,experience}=current;
    document.body.classList.add('teaching-results-active');
    // A previous SAP mode may have frozen these controls.
    view.disabled=false;amp.disabled=false;componentSelect.disabled=false;
    reactionButton.disabled=false;
    view.closest('.control')?.classList.remove('is-frozen');
    amp.closest('.range-control')?.classList.remove('is-frozen');
    const paletteToggle=$('legend-palette-toggle');
    if(paletteToggle)paletteToggle.disabled=false;
    if(view.dataset.teachingKind!==kind){
      setOptions(teachingViews[kind]);
      view.dataset.teachingKind=kind;
    }
    if(!current.view||!teachingViews[kind].some(([id])=>id===current.view))
      current.view=viewForMode[experience.mode]??'forces';
    view.value=current.view;
    amp.max='150';amp.min='0';amp.step='1';
    amp.value=String(Math.round((experience.ampFactor??1)*15));
    $('amp-value').textContent='×'+fmt(experience.ampFactor??1,1)+' · visual';
    forceControls.hidden=current.view!=='forces';
    reactionControls.hidden=current.view!=='reactions';
    componentRow.hidden=current.view!=='forces';
    componentRow.classList.remove('is-frozen');
    reactionControls.classList.remove('is-frozen');
    const hasBending=kind==='bridge'&&Boolean(result?.bending);
    const allowed=hasBending?['P','V2','M3']:['P'];
    for(const option of componentSelect.options)
      option.disabled=!allowed.includes(option.value);
    if(!allowed.includes(forceRenderer.component))forceRenderer.component='P';
    componentSelect.value=forceRenderer.component;
    reactionButton.textContent=reactionRenderer.showValues?
      'Ocultar valores de reacciones':'Mostrar valores de reacciones';
    reactionButton.setAttribute('aria-pressed',String(reactionRenderer.showValues));
    showValues.textContent=experience.showAxialLabels?
      'Ocultar valores axiles':'Mostrar valores axiles sobre barras';
    showValues.setAttribute('aria-pressed',String(Boolean(experience.showAxialLabels)));
    const title=$('legend-title'),lo=$('legend-min'),hi=$('legend-max');
    const stageBar=legend.querySelector('.legend-bar');
    proxy.results=teachingResultsToViewer(kind,result,experience);
    if(kind==='bridge')proxy.maxSize=1.2;
    else{
      const xs=experience.model.nodes.map(n=>n.x),zs=experience.model.nodes.map(n=>n.z);
      proxy.maxSize=Math.max(1,Math.max(...xs)-Math.min(...xs),
        Math.max(...zs)-Math.min(...zs));
    }
    forceRenderer.palette=experience.palette??'classic';
    forceRenderer.showCharacteristics=Boolean(experience.showAxialLabels);
    const diagrams=current.view==='forces';
    const reactions=current.view==='reactions';
    forceRenderer.view=diagrams?'forces':reactions?'reactions':'deformation';
    reactionRenderer.group.visible=reactions;
    forceRenderer.group.visible=diagrams;
    // The general engines consume the converted educational model directly.
    forceRenderer.refresh();reactionRenderer.refresh();
    if(!result){
      title.textContent='SIN RESULTADOS';
      lo.textContent='—';hi.textContent='—';
      if(stageBar)stageBar.style.background=cssForceGradient(experience.palette??'classic');
      return;
    }
    const members=kind==='bridge'?result.members:result.bars;
    let values=[],unit='',digits=2,signed=true,name='';
    if(current.view==='reactions'){
      values=result.reactions.flatMap(r=>[r.rx_kN,r.rz_kN]);
      name='REACCIONES Rx / Rz';unit='kN';
    }else if(current.view==='deformation'){
      values=result.displacements.map(d=>
        (d.magnitude_m??Math.hypot(d.ux_m,d.uz_m))*1000);
      name='DESPLAZAMIENTO |u|';unit='mm';digits=3;signed=false;
    }else if(current.view==='stress'){
      values=members.map(m=>m.stress_MPa);
      name='TENSIÓN NORMAL σ';unit='MPa';
    }else if(current.view==='strain'){
      values=members.map(m=>m.strain);
      name='DEFORMACIÓN UNITARIA ε';digits=7;
    }else if(current.view==='utilization'){
      values=members.map(m=>(m.utilization??0)*100);
      name='APROVECHAMIENTO';unit='%';signed=false;
    }else{
      const key={P:'P_kN',V2:'V2_kN',M3:'M3_kNm'}[forceRenderer.component]??'P_kN';
      values=Object.values(proxy.results?.forces?.[TEACHING_CASE]??{})
        .flatMap(stations=>stations.map(p=>p[key]));
      unit=key.endsWith('kNm')?'kN·m':'kN';
      name={P:'ESFUERZO AXIAL N',V2:'CORTANTE V2',M3:'MOMENTO M3'}[forceRenderer.component];
    }
    const finite=values.filter(Number.isFinite);
    const min=finite.length?Math.min(...finite):0;
    const max=finite.length?Math.max(...finite):0;
    title.textContent=name;
    lo.textContent=fmt(min,digits)+(unit?' '+unit:'');
    hi.textContent=fmt(max,digits)+(unit?' '+unit:'');
    if(stageBar)stageBar.style.background=signed?
      cssForceGradient(experience.palette??'classic'):
      cssResultGradient(experience.palette??'classic');
  };
  const render=(kind,result,experience)=>{
    if(!current||current.kind!==kind||current.experience!==experience)
      current={kind,result,experience,view:viewForMode[experience.mode]??'forces',
        lastMode:experience.mode};
    else{
      current.result=result;
      if(current.lastMode!==experience.mode){
        current.view=viewForMode[experience.mode]??'forces';
        current.lastMode=experience.mode;
      }
    }
    refresh();
  };
  const selectView=value=>{
    if(!current)return false;
    if(!teachingViews[current.kind].some(([id])=>id===value))return false;
    current.view=value;
    const target=modeForView[value];
    current.lastMode=target;
    if(target!==current.experience.mode)current.experience.setMode(target);
    else refresh();
    return true;
  };
  const setAmplification=value=>{
    if(!current)return false;
    current.experience.setAmplification(Number(value)/15);
    return true;
  };
  const toggleAxialValues=()=>{
    if(!current)return false;
    current.experience.setAxialLabels(!current.experience.showAxialLabels);
    return true;
  };
  const toggleReactionValues=()=>{
    if(!current)return false;
    reactionRenderer.setValues(!reactionRenderer.showValues);
    refresh();return true;
  };
  const selectComponent=key=>{
    if(!current||current.view!=='forces')return false;
    const allowed=current.kind==='bridge'&&current.result?.bending?
      ['P','V2','M3']:['P'];
    if(!allowed.includes(key))return false;
    forceRenderer.component=key;
    refresh();return true;
  };
  for(const id of ['truss-open-analysis','bridge-open-analysis'])
    $(id)?.addEventListener('click',()=>selectWorkspace?.('analysis'));
  const leave=()=>{
    current=null;
    document.body.classList.remove('teaching-results-active');
    delete view.dataset.teachingKind;
    setOptions(baseViews);
    view.value='deformation';
    forceControls.hidden=true;reactionControls.hidden=true;componentRow.hidden=false;
    for(const saved of originalComponents){
      const o=[...componentSelect.options].find(option=>option.value===saved.value);
      if(o)o.disabled=saved.disabled;
    }
    componentSelect.value=app.sapVisuals?.component??'M3';
    proxy.results=null;forceRenderer.clear();reactionRenderer.clear();
    forceRenderer.group.visible=false;reactionRenderer.group.visible=false;
    showValues.textContent='Mostrar valores característicos';
    showValues.setAttribute('aria-pressed','false');
  };
  app.updateTeachingAnalysis=render;
  app.teachingAnalysis={get active(){return Boolean(current);},
    selectView,setAmplification,toggleAxialValues,toggleReactionValues,
    selectComponent,pickForce:ray=>current?.view==='forces'?forceRenderer.pickForce(ray):null,
    pickReaction:ray=>current?.view==='reactions'?reactionRenderer.pick(ray):null,
    pinForce:hit=>forceRenderer.pinSection(hit),
    hoverForce:hit=>forceRenderer.setHoverSection(hit),
    inspectForceXR:ray=>current?.view==='forces'?forceRenderer.inspectXRRay(ray):null,
    inspectReactionXR:ray=>current?.view==='reactions'?reactionRenderer.inspectXRRay(ray):null,
    hideXRHover:()=>{forceRenderer.hideXRHover?.();reactionRenderer.hideXRHover?.();},
    refresh,leave};
  app.clearTeachingAnalysis=leave;
  return app.teachingAnalysis;
}
