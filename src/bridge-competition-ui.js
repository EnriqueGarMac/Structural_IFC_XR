import {BridgeCompetitionExperience,bridgeReferenceGeometry} from './bridge-competition.js';
import {BRIDGE_SECTIONS,bridgeGrid} from './bridge-competition-solver.mjs';

const $=id=>document.getElementById(id);
const fmt=(v,d=2)=>v===null||v===undefined?'—':Number(v).toLocaleString('es-ES',{
  minimumFractionDigits:d,maximumFractionDigits:d});
const key=(s)=>String(s??'');
function textTable(headers,rows){
  const th=headers.map(h=>'<th>'+h+'</th>').join('');
  return '<table><thead><tr>'+th+'</tr></thead><tbody>'+
    rows.map(row=>'<tr>'+row.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+
    '</tbody></table>';
}
function downloadBridge(experience){
  const content=JSON.stringify({
    project:'IMIS Structural XR · Concurso de pasarelas',
    units:'m, kN, MPa',span_m:experience.span_m,
    centralLoad_kN:experience.load_kN,
    sections:BRIDGE_SECTIONS,members:experience.members,
    analysis:experience.result,
    disclaimer:'Uso exclusivamente educativo: celosía plana articulada; no valida pasarelas reales.'
  },null,2);
  const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download='IMIS_CONCURSO_PASARELA.json';
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),12000);
}
export function setupBridgeCompetition(app,{selectWorkspace,clearPrevious,modelLabel,status}={}){
  const challenge=new BridgeCompetitionExperience(app);
  app.bridgeCompetition=challenge;
  const section=$('bridge-section');
  for(const [id,property] of Object.entries(BRIDGE_SECTIONS))
    section.add(new Option(property.label+' · A = '+fmt(property.A_m2*1e6,0)+' mm²',id));
  const from=$('bridge-from'),to=$('bridge-to');
  for(const node of bridgeGrid(challenge.span_m)){
    const title=node.id+(node.fixX?' · apoyo fijo':node.fixZ?' · apoyo móvil':'');
    from.add(new Option(title,node.id));
    to.add(new Option(title,node.id));
  }
  from.value='B0';to.value='T1';section.value=challenge.sectionId;
  const report=$('bridge-result'),detector=$('bridge-detection-status');
  function update(result){
    if(!challenge.active)return;
    $('bridge-span').value=String(Number(challenge.span_m.toFixed(3)));
    $('bridge-load').value=String(challenge.load_kN);
    $('bridge-section').value=challenge.sectionId;
    if(challenge.startNode)from.value=challenge.startNode;
    $('bridge-add').textContent=challenge.addMode?
      (challenge.startNode?'Selecciona el segundo nodo…':'Selecciona el primer nodo…'):
      'Añadir elemento a la retícula';
    if(challenge.selectedNode&&challenge.startNode!==challenge.selectedNode)
      to.value=challenge.selectedNode;
    const masses=challenge.members.reduce((sum,m)=>{
      const s=BRIDGE_SECTIONS[m.sectionId];
      const n=new Map(bridgeGrid(challenge.span_m).map(n=>[n.id,n]));
      const a=n.get(m.i),b=n.get(m.j);
      return sum+s.A_m2*Math.hypot(b.x-a.x,b.z-a.z)*s.density_kg_m3;
    },0);
    const detail=result?
      result.status==='stable'?'APTA':
      result.status==='service'?'FLECHA EXCESIVA':'NO RESISTE':'SIN COMPROBAR';
    $('bridge-stage-detail').textContent=detail+' · Vano '+fmt(challenge.span_m,2)+
      ' m · Carga '+fmt(challenge.load_kN,1)+' kN · Peso '+fmt(masses,2)+' kg';
    $('bridge-members').innerHTML=textTable(['ID','Entre','Tipo','A (mm²)'],
      challenge.members.map(m=>[m.id,m.i+'–'+m.j,
        BRIDGE_SECTIONS[m.sectionId].kind==='tie'?'Tirante':'Barra',
        fmt(BRIDGE_SECTIONS[m.sectionId].A_m2*1e6,0)]));
    if(!challenge.members.length)
      $('bridge-members').textContent='Todavía no hay elementos. Selecciona dos nodos para añadir una barra.';
    const mobileLegend=$('mobile-ar-bridge-legend');
    if(mobileLegend){
      mobileLegend.hidden=false;
      mobileLegend.textContent=result?
        'N naranja: tracción · azul: compresión · rojo: fallo · Uso '+
          (result.maxUtilization==null?'—':fmt(result.maxUtilization*100,1)+' %')+
          ' · Flecha '+fmt(result.maxDeflection_mm,2)+' mm · Peso '+fmt(result.totalMass_kg,2)+' kg':
        'Naranja: tracción · azul: compresión · rojo: fallo · deformada amplificada';
    }
    report.hidden=!result;
    if(result){
      const statusLabel=result.status==='stable'?'Resiste · cumple resistencia y flecha':
        result.status==='service'?'No cumple flecha de servicio':
        'No resiste · colapso esquemático';
      report.innerHTML='<span><strong>'+statusLabel+'</strong></span>'+
        (challenge.bestEligibleMass_kg===null?'':
          '<span>Mejor propuesta válida: <strong>'+fmt(challenge.bestEligibleMass_kg,2)+' kg</strong></span>')+
        '<span>Razón: '+result.reason+'</span>'+
        (result.bending?
          '<span><strong>Carga aplicada dentro de la barra '+result.bending.memberId+
          ':</strong> momento máximo '+fmt(result.bending.moment_kNm,3)+
          ' kN·m · tensión de flexión '+fmt(result.bending.stress_MPa,1)+
          ' MPa · flecha local '+fmt(result.bending.localDeflection_mm,2)+
          ' mm. Comprobación aproximada de viga simplemente apoyada.</span>':'')+
        (result.pending?.length?'<span>'+result.pending.length+
          ' barra(s) pendientes de conexión: no intervienen todavía en la rigidez ni en las cargas aplicadas, pero sí cuentan para el peso total.</span>':'')+
        '<span>Vano <strong>'+fmt(challenge.span_m,2)+' m</strong> · Carga '+fmt(challenge.load_kN,2)+' kN</span>'+
        '<span>Peso de acero: <strong>'+fmt(result.totalMass_kg,2)+' kg</strong></span>'+
        '<span>Aprovechamiento máximo: <strong>'+
          (result.maxUtilization===null?'—':fmt(result.maxUtilization*100,1)+' %')+'</strong></span>'+
        '<span>Flecha máxima: <strong>'+fmt(result.maxDeflection_mm,3)+
          ' mm</strong> · Límite '+fmt(result.serviceLimit_mm,3)+' mm</span>';
      $('bridge-feedback').textContent=result.reason+
        (result.broken.length?' Rotura: '+result.broken.map(x=>x.id).join(', ')+'.':'');
      const memberRows=result.members.map(m=>[
        m.id,
        fmt(m.axial_kN,2),
        fmt(m.stress_MPa,2),
        fmt(m.utilization*100,1)+' %',
        m.pending?'Pendiente de conectar':m.slack?'Holgado':m.kind==='tie'?'Tirante':'Barra'
      ]);
      const reactionRows=result.reactions.map(r=>[
        'Apoyo '+r.nodeId,'Rx '+fmt(r.rx_kN,2)+' kN',
        'Rz '+fmt(r.rz_kN,2)+' kN','—','Reacción']);
      $('bridge-detail').innerHTML=textTable(
        ['Elemento','N (kN) / Rx','σ (MPa) / Rz','Uso','Estado'],
        [...memberRows,...reactionRows]);
    }else{
      report.innerHTML='';
      $('bridge-detail').textContent='Pulsa «Aplicar carga y comprobar resistencia».';
      $('bridge-feedback').textContent=challenge.startNode?
        'Primer nodo: '+challenge.startNode+'. Selecciona el segundo para crear el elemento.':
        'Diseño editable. Elige dos nodos y un tipo de elemento.';
    }
    $('num-nodes').textContent=String(bridgeGrid(challenge.span_m).length);
    $('num-frames').textContent=String(challenge.members.length);
    $('max-u').textContent=result?.maxDeflection_mm!==null&&result?
      fmt(result.maxDeflection_mm,3)+' mm':'—';
    app.updateTeachingAnalysis?.('bridge',result,challenge);
    app.xrControls.dirty=true;
  }
  challenge.onChange=update;
  const run=()=>{
    if(challenge.active)return;
    clearPrevious?.();
    app.showSAPOnly=false;app.showOriginal=true;app.showDeformed=false;
    app.showFrames=false;app.showSupports=false;app.showLoads=false;
    app.showAxes=false;app.hideGround=true;app.showStructureOnly=false;
    app.offset=[0,0,0];
    for(const [id,value] of [
      ['show-sap-only',false],['show-original',true],
      ['show-displaced',false],['show-frames',false],['show-supports',false],
      ['show-loads',false],['show-axes',false],['hide-ground',true]
    ]){const el=$(id);if(el)el.checked=value;}
    app.setResults(null);
    app.setModel(bridgeReferenceGeometry());
    app.targetMeters=challenge.span_m;
    app.updateScale();app.recenterCamera();
    challenge.activate();
    $('bridge-controls').hidden=false;
    $('bridge-stage-status').hidden=false;
    $('stage').classList.add('bridge-mode');
    $('num-elements').textContent='—';
    $('sap-state').textContent='Resultados: concurso de pasarelas';
    modelLabel?.('Concurso · Pasarela entre mesas');
    status?.('PASARELA · DISEÑO DOCENTE');
  };
  $('bridge-start').addEventListener('click',()=>{
    run();selectWorkspace?.('teaching');
  });
  $('bridge-span').addEventListener('change',event=>{
    try{
      challenge.setSpan(Number(event.target.value));
      challenge.detectedGap=null;
      detector.textContent='Vano ajustado manualmente.';
    }catch(e){detector.textContent=e.message;}
  });
  $('bridge-load').addEventListener('change',event=>{
    try{challenge.setLoad(Number(event.target.value));}
    catch(e){$('bridge-feedback').textContent=e.message;}
  });
  section.addEventListener('change',event=>challenge.setSection(event.target.value));
  $('bridge-add').addEventListener('click',()=>{
    challenge.beginAdd();
    $('bridge-feedback').textContent=
      'Selecciona el primer nodo con el ratón o mando. La barra seguirá al puntero hasta seleccionar el segundo.';
  });
  $('bridge-remove').addEventListener('click',()=>{
    if(challenge.selectedMemberId)challenge.removeMember(challenge.selectedMemberId);
    else challenge.removeMode=!challenge.removeMode;
    $('bridge-feedback').textContent=challenge.removeMode?
      'Modo eliminar activo: señala una barra para retirarla.':'Selecciona una barra con el mando o el ratón para eliminarla.';
  });
  $('bridge-undo').addEventListener('click',()=>{
    const last=challenge.members.at(-1);
    if(last)challenge.removeMember(last.id);
  });
  $('bridge-example').addEventListener('click',()=>challenge.sample());
  $('bridge-clear').addEventListener('click',()=>challenge.reset());
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&challenge.active&&challenge.addMode)challenge.cancelAdd();
  });
  $('bridge-evaluate').addEventListener('click',()=>challenge.evaluate());
  $('bridge-export').addEventListener('click',()=>downloadBridge(challenge));
  $('bridge-detect').addEventListener('click',()=>{
    if(!challenge.active)run();
    if(!app.isXR||app.xrMode!=='ar'){
      detector.textContent='Entra en Quest RM o Android AR y utiliza «Detectar hueco entre mesas». Se requieren contornos de dos planos; si no están disponibles, introduce el vano manualmente.';
      return;
    }
    if(app.mobileAR){
      app.startMobileBridgeScan();
      detector.textContent='Buscando dos mesas desde Android AR…';
      return;
    }
    app.xrControls.bridgeScan=true;
    app.xrControls.bridgeScanStable=0;
    detector.textContent='Buscando dos superficies horizontales enfrentadas de altura similar…';
    app.xrControls.page='bridge';
    app.xrControls.dirty=true;
  });
  return challenge;
}
