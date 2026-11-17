import * as THREE from 'three';
import {BRIDGE_SECTIONS,bridgeGrid} from './bridge-competition-solver.mjs';
import {pickBridgeTouch} from './mobile-bridge-interaction.mjs';

const $=id=>document.getElementById(id);
const BASE=1.2;
const modes=['displacement','axial','stress','utilization'];
const modeNames={
  displacement:'Desplazamientos',axial:'Esfuerzo axial',
  stress:'Tensión normal',utilization:'Aprovechamiento'
};
const fmt=(value,digits=1)=>Number(value).toLocaleString('es-ES',{
  maximumFractionDigits:digits,minimumFractionDigits:digits
});

// Project the real bridge-node positions through the XR view camera,
// instead of assuming that 2D screen taps are XR controller rays.
export function projectedMobileBridgeNodes(app,viewport){
  const bridge=app.bridgeCompetition;
  if(!bridge?.active||!viewport?.width||!viewport?.height)return [];
  const xrCamera=app.renderer?.xr?.getCamera?.();
  const camera=xrCamera?.cameras?.[0]??xrCamera;
  if(!camera?.projectionMatrix)return [];
  camera.updateWorldMatrix(true,false);
  bridge.root.updateWorldMatrix(true,false);
  const markers=new Map((bridge.rampMarkers??[]).map(item=>[item.id,item.object]));
  return bridgeGrid(bridge.span_m).map(n=>{
    const world=markers.has(n.id)?
      markers.get(n.id).getWorldPosition(new THREE.Vector3()):
      bridge.root.localToWorld(
        new THREE.Vector3(n.x*BASE/bridge.span_m,0,n.z*BASE/bridge.span_m));
    const clip=world.project(camera);
    return {id:n.id,
      x:(clip.x+1)*viewport.width/2,
      y:(1-clip.y)*viewport.height/2,
      visible:Number.isFinite(clip.z)&&clip.z>=-1&&clip.z<=1&&
        Number.isFinite(clip.x)&&Number.isFinite(clip.y)&&
        Math.abs(clip.x)<=1.06&&Math.abs(clip.y)<=1.06};
  });
}

// Uses the SAME challenge instance and solver as Quest and desktop.
// No private mobile copy of bars, load, or results is maintained.
export function setupMobileBridgeEditor(app){
  const bridge=app.bridgeCompetition;
  const overlay=$('mobile-ar-overlay');
  const touch=$('mobile-ar-bridge-touch');
  const editor=$('mobile-ar-bridge-editor');
  const section=$('mobile-ar-bridge-section');
  const message=$('mobile-ar-bridge-feedback');
  if(!bridge||!touch||!editor||!section)return {refresh(){}};
  for(const [key,spec] of Object.entries(BRIDGE_SECTIONS))
    section.add(new Option(spec.label+' · '+Math.round(spec.A_m2*1e6)+' mm²',key));

  const active=()=>Boolean(app.mobileAR&&bridge.active);
  const placed=()=>Boolean(active()&&app.mobileARState?.placed&&
    !app.mobileARState.bridgeGuide&&!app.mobileARState.bridgeScan);
  const say=text=>{message.textContent=text;};
  const refresh=()=>{
    const enabled=active();
    overlay.classList.toggle('bridge-editor-active',enabled);
    editor.hidden=!enabled;
    touch.hidden=!placed();
    if(!enabled)return;
    section.value=bridge.sectionId;
    $('mobile-ar-bridge-load-value').textContent=fmt(bridge.load_kN)+' kN';
    $('mobile-ar-bridge-count').textContent=
      bridge.members.length+' barras · vano '+fmt(bridge.span_m,2)+' m';
    $('mobile-ar-bridge-add').setAttribute('aria-pressed',String(bridge.addMode));
    $('mobile-ar-bridge-remove').setAttribute('aria-pressed',String(bridge.removeMode));
    $('mobile-ar-bridge-add').textContent=bridge.addMode?
      (bridge.startNode?'Cancelar · primer nudo '+bridge.startNode:'Cancelar añadir'):
      'Añadir barra';
    $('mobile-ar-bridge-mode').textContent='Ver: '+modeNames[bridge.mode];
    $('mobile-ar-bridge-undeformed').textContent=bridge.undeformedView?
      'Ver deformada':'Sin deformar';
    $('mobile-ar-bridge-undeformed').disabled=!bridge.result;
    $('mobile-ar-bridge-undo').disabled=!bridge.members.length;
    for(const id of ['mobile-ar-bridge-add','mobile-ar-bridge-pick',
      'mobile-ar-bridge-remove'])$(id).disabled=!placed();
    $('mobile-ar-bridge-pick').textContent=bridge.addMode?
      'Marcar nudo en el centro':'Seleccionar bajo la cruz';
  };
  const guard=fn=>()=>{
    try{fn();refresh();}
    catch(e){say(e.message??String(e));refresh();}
  };
  const backToEditing=()=>{
    if(bridge.result&&!bridge.undeformedView)
      bridge.setUndeformedView(true);
  };
  section.addEventListener('change',guard(()=>bridge.setSection(section.value)));
  $('mobile-ar-bridge-load-minus').addEventListener('click',guard(()=>{
    bridge.setLoad(Math.max(0,Math.round((bridge.load_kN-.5)*2)/2));
    say('Carga: '+fmt(bridge.load_kN)+' kN. Pulsa Calcular para actualizar.');
  }));
  $('mobile-ar-bridge-load-plus').addEventListener('click',guard(()=>{
    bridge.setLoad(Math.min(50,Math.round((bridge.load_kN+.5)*2)/2));
    say('Carga: '+fmt(bridge.load_kN)+' kN. Pulsa Calcular para actualizar.');
  }));
  $('mobile-ar-bridge-add').addEventListener('click',guard(()=>{
    if(!placed())throw Error('Coloca primero la pasarela sobre las mesas.');
    if(bridge.addMode){bridge.cancelAdd();say('Creación cancelada.');}
    else{
      backToEditing();
      bridge.beginAdd();
      say('Toca el primer nudo y después el segundo sobre la retícula en AR.');
    }
  }));
  $('mobile-ar-bridge-remove').addEventListener('click',guard(()=>{
    if(!placed())throw Error('Coloca primero la pasarela.');
    if(!bridge.removeMode)backToEditing();
    bridge.removeMode=!bridge.removeMode;
    bridge.editMode=!bridge.removeMode;
    bridge.addMode=false;bridge.startNode=null;
    bridge.draw();
    say(bridge.removeMode?
      'Toca la barra que quieras eliminar en la vista AR.':
      'Modo borrar desactivado.');
  }));
  $('mobile-ar-bridge-calc').addEventListener('click',guard(()=>{
    if(!bridge.members.length)throw Error('Dibuja primero las barras de la pasarela.');
    bridge.removeMode=false;bridge.addMode=false;
    bridge.editMode=true;bridge.startNode=null;
    const result=bridge.evaluate();
    say((result.status==='stable'?'RESISTE':result.status==='service'?
      'FLECHA EXCESIVA':'NO RESISTE')+
      ' · '+bridge.members.length+' barras · '+fmt(bridge.load_kN)+' kN'+
      (result.broken.length?' · Fallan '+result.broken.map(m=>m.id).join(', '):''));
    app.updateTeachingAnalysis?.('bridge',result,bridge);
  }));
  $('mobile-ar-bridge-undeformed').addEventListener('click',guard(()=>{
    if(bridge.result)bridge.setUndeformedView(!bridge.undeformedView);
  }));
  $('mobile-ar-bridge-mode').addEventListener('click',guard(()=>{
    bridge.setMode(modes[(modes.indexOf(bridge.mode)+1)%modes.length]);
    if(bridge.result)app.updateTeachingAnalysis?.('bridge',bridge.result,bridge);
  }));
  $('mobile-ar-bridge-undo').addEventListener('click',guard(()=>{
    const member=bridge.members.at(-1);
    if(member)bridge.removeMember(member.id);
    say('Última barra retirada.');
  }));
  $('mobile-ar-bridge-example').addEventListener('click',guard(()=>{
    bridge.sample();say('Ejemplo de pasarela cargado. Puedes modificarlo.');
  }));
  $('mobile-ar-bridge-clear').addEventListener('click',guard(()=>{
    bridge.reset();say('Diseño vaciado. Vuelve a añadir barras.');
  }));

  const locate=(clientX,clientY)=>{
    if(!placed())return null;
    const viewport=touch.getBoundingClientRect();
    const x=clientX-viewport.left,y=clientY-viewport.top;
    const points=projectedMobileBridgeNodes(app,viewport);
    return pickBridgeTouch(points,bridge.members,x,y,
      bridge.removeMode?'remove':'add');
  };
  const applyPick=hit=>{
    if(!hit){
      say(bridge.removeMode?'Toca más cerca de una barra.':
        'Apunta o toca más cerca de un nudo de la retícula.');
      return;
    }
    if(hit.kind==='member'){
      const id=hit.id,remove=bridge.removeMode;
      bridge.chooseMember(id);
      say(remove?'Barra '+id+' eliminada.':'Barra '+id+' seleccionada.');
      return;
    }
    if(!bridge.addMode){
      bridge.selectedNode=hit.id;bridge.draw();
      say('Nudo '+hit.id+' seleccionado. Pulsa Añadir barra para dibujar.');
      return;
    }
    const wasFirst=bridge.startNode;
    bridge.chooseNode(hit.id);
    say(!wasFirst?
      'Primer nudo: '+hit.id+'. Toca el segundo nudo.':
      bridge.addMode?'Selecciona otro nudo para completar la barra.':
      'Barra creada entre '+wasFirst+' y '+hit.id+'.');
  };
  touch.addEventListener('pointerup',event=>{
    if(event.button!==0||!placed())return;
    event.preventDefault();
    try{applyPick(locate(event.clientX,event.clientY));refresh();}
    catch(e){say(e.message??String(e));refresh();}
  });
  $('mobile-ar-bridge-pick').addEventListener('click',guard(()=>{
    const viewport=touch.getBoundingClientRect();
    const rect=overlay.getBoundingClientRect();
    // The '+' overlay reticle is at 50% width and 48% height.
    const hit=locate(rect.left+rect.width*.5,rect.top+rect.height*.48);
    applyPick(hit);
  }));
  // Keep the mobile panel in sync with edits from desktop and Quest APIs.
  const prior=bridge.onChange;
  bridge.onChange=result=>{prior?.(result);refresh();};
  app.onMobileARPlacementChange=refresh;
  refresh();
  return {refresh,pickAt:locate};
}
