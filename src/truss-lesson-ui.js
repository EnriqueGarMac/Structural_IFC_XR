import {TrussExperience,trussGeometry} from './truss-experience.js';
import {TRUSS_LESSON} from './truss-solver.mjs';

const $=id=>document.getElementById(id);
const number=(value,decimals=3)=>Number(value).toLocaleString('es-ES',{
  minimumFractionDigits:decimals,maximumFractionDigits:decimals});
const fixed=(v,n=3)=>number(v,n);
const physical=(v)=>number(v*1000,3);
const safe=(v)=>Math.abs(v)<1e-12?0:v;
function table(head,rows){
  return '<table><thead><tr>'+head.map(t=>'<th scope="col">'+t+'</th>').join('')+
    '</tr></thead><tbody>'+rows.map(r=>'<tr'+(r.selected?' class="is-selected"':'')+'>'+
    r.cells.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
}
function downloadTrussCSV(experience){
  const result=experience.result;
  const csv=[
    ['tipo','id','extremo_i','extremo_j','N_kN','sigma_MPa','epsilon','deltaL_mm','Fx_kN','Fz_kN','ux_mm','uz_mm'],
    ...result.bars.map(b=>['barra',b.id,b.i,b.j,b.axial_kN,b.stress_MPa,b.strain,b.extension_mm,'','','','']),
    ...result.reactions.map(r=>['reaccion',r.nodeId,'','','','','','',r.rx_kN,r.rz_kN,'','']),
    ...result.displacements.map(d=>['desplazamiento',d.nodeId,'','','','','','','','',d.ux_m*1000,d.uz_m*1000])
  ].map(row=>row.map(v=>String(v??'')).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='IMIS_CELOSIA_RESULTADOS.csv';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),12000);
}
export function setupTrussLesson(app,{
  selectWorkspace,clearPrevious,modelLabel,status
}={}){
  const lesson=new TrussExperience(app);
  app.trussExperience=lesson;
  const select=$('truss-node-select');
  for(const n of TRUSS_LESSON.nodes){
    const label=n.fixX?' · articulación':n.fixZ?' · apoyo móvil':'';
    select.add(new Option('Nodo '+n.id+' (x='+number(n.x,1)+' m)'+label,n.id));
  }
  const inputs=()=>{
    const load=lesson.getLoad();
    select.value=lesson.selectedNode;
    $('truss-fx').value=String(load.fx_kN);
    $('truss-fz').value=String(load.fz_kN);
  };
  function update(result){
    if(!lesson.active)return;
    inputs();
    $('truss-display').value=lesson.mode;
    const rx=result.reactions.reduce((t,r)=>t+r.rx_kN,0),
      rz=result.reactions.reduce((t,r)=>t+r.rz_kN,0);
    $('truss-summary').innerHTML=
      '<span>Reacciones totales: <strong>Rx = '+fixed(rx)+' kN · Rz = '+fixed(rz)+' kN</strong></span>'+
      '<span>Desplazamiento máximo: <strong>'+physical(result.maxDisplacement_m)+' mm</strong></span>'+
      '<span>Equilibrio ΣFx, ΣFz, ΣM: <strong>'+fixed(result.equilibrium.fx_kN)+
      ' kN · '+fixed(result.equilibrium.fz_kN)+' kN · '+
      fixed(result.equilibrium.moment_kNm)+' kN·m</strong></span>';
    $('truss-reactions').innerHTML=table(['Apoyo','Rx (kN)','Rz (kN)'],
      result.reactions.map(r=>({cells:[r.nodeId,fixed(safe(r.rx_kN)),fixed(safe(r.rz_kN))]})));
    $('truss-bars-table').innerHTML=table(['Barra','N (kN)','σ (MPa)','ε (×10⁻⁶)','ΔL (mm)'],
      result.bars.map(b=>({selected:b.id===lesson.selectedBarId,
        cells:[b.id,fixed(safe(b.axial_kN)),fixed(safe(b.stress_MPa)),
          fixed(b.strain*1e6,2),fixed(b.extension_mm)]})));
    $('truss-nodes-table').innerHTML=table(['Nodo','Ux (mm)','Uz (mm)','|u| (mm)'],
      result.displacements.map(d=>({selected:d.nodeId===lesson.selectedNode,
        cells:[d.nodeId,physical(d.ux_m),physical(d.uz_m),
          physical(d.magnitude_m)]})));
    const s=lesson.getLoad(),bar=lesson.getSelectedBar();
    $('truss-stage-detail').textContent=bar?
      'Barra '+bar.id+' · N = '+fixed(bar.axial_kN)+' kN · σ = '+fixed(bar.stress_MPa)+' MPa':
      'Nodo '+lesson.selectedNode+' · Fx '+fixed(s.fx_kN,1)+' kN · Fz '+
      fixed(s.fz_kN,1)+' kN';
    $('truss-feedback').textContent=bar?
      'Barra '+bar.id+' · '+bar.state+' · ΔL '+fixed(bar.extension_mm)+' mm':
      'Nodo '+lesson.selectedNode+' seleccionado. Introduce Fx y Fz o usa el mando de Quest.';
    $('num-nodes').textContent=String(TRUSS_LESSON.nodes.length);
    $('num-frames').textContent=String(TRUSS_LESSON.bars.length);
    $('max-u').textContent=physical(result.maxDisplacement_m)+' mm';
    app.updateTeachingAnalysis?.('truss',result,lesson);
    app.xrControls.dirty=true;
  }
  lesson.onChange=update;
  function start(){
    if(!lesson.active){
      clearPrevious?.();
      app.showSAPOnly=false;app.showOriginal=true;app.showDeformed=false;
      app.showFrames=false;app.showSupports=false;app.showLoads=false;
      app.showAxes=false;app.hideGround=true;app.showStructureOnly=false;
      app.offset=[0,0,0];
      for(const [id,checked] of [
        ['show-sap-only',false],['show-original',true],['show-displaced',false],
        ['show-frames',false],['show-supports',false],['show-loads',false],
        ['show-axes',false],['hide-ground',true]
      ]){const input=$(id);if(input)input.checked=checked;}
      app.setResults(null);
      app.setModel(trussGeometry());
      lesson.activate();
      $('truss-controls').hidden=false;
      $('stage').classList.add('truss-mode');
      $('truss-stage-status').hidden=false;
      $('num-elements').textContent='—';
      $('sap-state').textContent='Resultados: calculados interactivamente';
      modelLabel?.('Celosía Warren · práctica docente');
      status?.('CELOSÍA · CÁLCULO MATRICIAL');
    }
    selectWorkspace?.('teaching');
  }
  $('truss-start').addEventListener('click',start);
  select.addEventListener('change',e=>lesson.selectNode(e.target.value));
  $('truss-apply').addEventListener('click',()=>{
    const fx=$('truss-fx').value.trim(),fz=$('truss-fz').value.trim();
    try{
      if(!fx||!fz)throw Error('Introduce ambos componentes de la carga.');
      lesson.setLoad(lesson.selectedNode,Number(fx),Number(fz));
    }catch(e){$('truss-feedback').textContent='Error: '+e.message;}
  });
  for(const id of ['truss-fx','truss-fz']){
    $(id).addEventListener('keydown',event=>{
      if(event.key==='Enter')$('truss-apply').click();
    });
  }
  $('truss-reset').addEventListener('click',()=>lesson.reset());
  $('truss-clear').addEventListener('click',()=>lesson.clearLoads());
  $('truss-display').addEventListener('change',e=>lesson.setMode(e.target.value));
  $('truss-export').addEventListener('click',()=>downloadTrussCSV(lesson));
  return lesson;
}
