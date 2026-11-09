import './style.css';
import { StructuralScene } from './scene.js';
import { readIFC } from './ifc-loader.js';
import { demoGeometry, demoResults, buildingTeaching } from './demo.js';
import {roofDemoGeometry,roofDemoResults,ROOF_DEMO,industrialTeaching} from './roof-demo.js';
import {exportEducationalIFC} from './ifc4-export.mjs';
import { normalizeResults } from './results.mjs';
import { SAPVisuals, makeSAPGeometry } from './sap-visuals.js';
import { ReactionVisuals } from './reaction-visuals.js';
import { reactionText } from './reactions.mjs';
import * as THREE from 'three';
import {findBestAlignment,makeIFCTransformElements} from './ifc-alignment.mjs';
import {deformationScale,clampAmplification,formatAmplification} from './deformation-scale.mjs';
const $=(id)=>document.getElementById(id);
const app=new StructuralScene($('canvas-wrap'));
app.sapVisuals=new SAPVisuals(app);
app.reactionVisuals=new ReactionVisuals(app);
let sapGeometryActive=false;
let originalIFC=null;
let importedIFCName='';
let ifcElementCount=0;
app.ampMax=150;app.ampStep=1;
function showAmplitude(){
  for(const id of ['amp','mobile-ar-amp']){
    const input=$(id);
    input.max=String(app.ampMax);
    input.step=String(app.ampStep);
    input.value=String(app.amp);
  }
  $('amp-value').textContent=formatAmplification(app.amp);
  $('mobile-ar-amp-value').textContent=formatAmplification(app.amp);
  app.xrControls && (app.xrControls.dirty=true);
}
function setSafeDeformationScale(){
  const range=deformationScale(app.results,app.caseName);
  app.ampMax=range.maxAmp;
  app.ampStep=range.step;
  app.amp=clampAmplification(range.defaultAmp,range.maxAmp);
  showAmplitude();
  app.updateVisualization();
}
function alignIFC(results,notify=true){
  if(!originalIFC?.length||!results?.frames?.length)return null;
  const mode=$('ifc-rotation').value;
  // Files downloaded together from this application use identical global XYZ,
  // not an unknown IFC local placement. Do not auto-centre them independently
  // against architectural walls/terrain, which distorts the analytical datum.
  const educationalPair=
    ((/^EDIFICIO_3_PLANTAS_IMIS\.ifc$/i.test(importedIFCName)&&
      /Edificio de viviendas/i.test(results.meta?.name||''))||
     (/^NAVE_INDUSTRIAL_IMIS\.ifc$/i.test(importedIFCName)&&
      /Nave industrial/i.test(results.meta?.name||'')));
  const fit=educationalPair?
    {rotation:{key:'012+++'},translation:[0,0,0],rms_m:0,confidence:null,automatic:false}:
    findBestAlignment(originalIFC,results,mode);
  const matrix=educationalPair?new THREE.Matrix4():
    new THREE.Matrix4().set(...makeIFCTransformElements(fit));
  const transformed=originalIFC.map(piece=>({...piece,geometry:piece.geometry.clone().applyMatrix4(matrix)}));
  app.setResults(null);
  app.setModel(transformed);
  app.setResults(results);
  sapGeometryActive=false;
  const label=educationalPair?'XYZ directo · IFC/JSON docentes':mode==='auto'?('Automática ('+fit.rotation.key+')'):(mode+' ('+fit.rotation.key+')');
  const confidence=fit.confidence!==null&&fit.confidence<.02?' · orientación ambigua':'';
  const message='Alineación: '+label+' · RMS aprox. '+fit.rms_m.toFixed(3)+' m'+confidence;
  $('alignment-status').textContent=message;
  setModelLabel('IFC alineado + SAP2000');
  updateStats(ifcElementCount);
  if(notify)info(message);
  return fit;
}

let webcamStream=null;
let demoActive=false;
let syntheticResults=true;
function info(message,error=false){const el=$('toast');el.hidden=false;el.textContent=message;el.classList.toggle('error',error);if(info.timer)clearTimeout(info.timer);info.timer=setTimeout(()=>el.hidden=true,error?9000:5000);}
function status(message){$('status-summary').textContent=message;}
function setModelLabel(text){$('model-state').textContent=`Modelo: ${text}`;$('scene-label').textContent=text.toUpperCase();}
function updateStats(count){$('num-elements').textContent=count.toLocaleString('es-ES');}
function setResults(results,label){
  app.setResults(results);
  $('sap-state').textContent=`Resultados: ${label}`;
  $('num-nodes').textContent=results.nodes.length.toLocaleString('es-ES');
  $('num-frames').textContent=results.frames.length.toLocaleString('es-ES');
  const modalSelect=$('mode-select');modalSelect.innerHTML='';
  (results.modes||[]).forEach((m,i)=>modalSelect.add(new Option('Modo '+m.number+' · '+Number(m.frequency_hz).toFixed(3)+' Hz',String(i))));
  if(!results.modes?.length)modalSelect.add(new Option('Sin modos', ''));
  $('analysis-view').value='deformation';
  app.sapVisuals.view='deformation';app.sapVisuals.refresh();app.reactionVisuals.refresh();
  $('force-values-controls').hidden=true;
  $('reaction-values-controls').hidden=true;
  $('legend').classList.remove('force-legend','reaction-legend');
  $('force-readout').hidden=true;
  setSafeDeformationScale();
  const cases=$('case-select');cases.innerHTML='';
  if(!results.cases.length)cases.add(new Option('Sin deformadas', ''));
  results.cases.forEach(c=>cases.add(new Option(c.name,c.name)));
  const patterns=$('pattern-select');patterns.innerHTML='';patterns.add(new Option('Todos los patrones','all'));
  for(const pattern of [...new Set(results.loads.map(l=>l.pattern))].sort())patterns.add(new Option(pattern,pattern));
  const rawFrameCount=results.loads.length;
  status(`${results.cases.length} caso(s) · ${rawFrameCount} cargas`);
}
const demos={
  frame:{
    title:buildingTeaching.results.meta.name,
    geometry:demoGeometry,results:demoResults,button:'demo-btn',
    definition:buildingTeaching,levels:[0,3.2,6.4,9.6],
    filename:'EDIFICIO_3_PLANTAS_IMIS'
  },
  roof:{
    title:ROOF_DEMO.name,
    geometry:roofDemoGeometry,results:roofDemoResults,button:'roof-demo-btn',
    definition:industrialTeaching,levels:[0],filename:'NAVE_INDUSTRIAL_IMIS'
  }
};
let activeDemo='frame';
function showDemo(kind='frame'){
  const selected=demos[kind];
  if(!selected)throw Error('Ejemplo de demostración desconocido.');
  demoActive=true;syntheticResults=true;sapGeometryActive=false;originalIFC=null;importedIFCName='';activeDemo=kind;
  $('alignment-status').textContent='Importa un IFC y un JSON para alinear.';
  // Start with legible combined views, without inheriting an empty SAP-only mode.
  app.showSAPOnly=false;app.showOriginal=true;app.showDeformed=true;
  app.showFrames=true;app.showSupports=true;app.showLoads=true;app.hideGround=false;app.showStructureOnly=false;
  for(const [id,checked] of [
    ['show-sap-only',false],['show-original',true],['show-displaced',true],
    ['show-frames',true],['show-supports',true],['show-resistance-only',false],['show-loads',true],['hide-ground',false]
  ])$(id).checked=checked;
  app.setResults(null); // Never interpolate the previous demo's result field.
  app.offset=[0,0,0];for(const c of ['x','y','z'])$('offset-'+c).value='0';
  app.amp=1;showAmplitude();
  app.setModel(selected.geometry());
  setModelLabel(selected.title);
  updateStats(app.parts.length);
  setResults(selected.results,'MATRIZ DE RIGIDEZ · DOCENTE (2D)');
  setSafeDeformationScale();
  for(const [name,config] of Object.entries(demos)){
    const button=$(config.button);
    button.classList.toggle('is-current',name===kind);
    button.setAttribute('aria-pressed',String(name===kind));
  }
  app.xrControls.selected='—';
  app.xrControls.dirty=true;
  app.updateVisualization();
  status('DEMO DOCENTE · ANÁLISIS MATRICIAL');
}
function downloadLocalFile(content,name,mime){
  const objectURL=URL.createObjectURL(new Blob([content],{type:mime}));
  const anchor=document.createElement('a');anchor.href=objectURL;anchor.download=name;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(objectURL),30000);
}
$('download-demo-ifc').addEventListener('click',()=>{
  if(!demoActive){info('Selecciona un modelo docente para descargar su IFC.',true);return;}
  const current=demos[activeDemo];
  try{
    const output=exportEducationalIFC({
      name:current.title,parts:current.definition.parts,levels:current.levels
    });
    downloadLocalFile(output.content,current.filename+'.ifc','application/octet-stream');
    info('IFC4 creado: '+output.stats.products+' elementos y '+
      output.stats.spaces+' espacios BIM.');
  }catch(err){console.error(err);info('Error al generar IFC: '+err.message,true);}
});
$('download-demo-json').addEventListener('click',()=>{
  if(!demoActive){info('Selecciona un modelo docente para descargar resultados.',true);return;}
  const current=demos[activeDemo];
  downloadLocalFile(JSON.stringify(current.results),
    current.filename+'_FEM.json','application/json');
  info('Resultados FEM exportados para los casos DEAD y WIND_X.');
});
$('demo-btn').addEventListener('click',()=>showDemo('frame'));
$('roof-demo-btn').addEventListener('click',()=>showDemo('roof'));
$('ifc-input').addEventListener('change',async(e)=>{
  const file=e.target.files?.[0];if(!file)return;
  status('Leyendo IFC…');
  try{
    const res=await readIFC(file,(message)=>status(message));
    originalIFC=res.items.map(item=>({...item,geometry:item.geometry.clone()}));
    importedIFCName=file.name;
    ifcElementCount=res.elementCount;
    app.setModel(res.items);
    // Never accidentally apply synthetic example results to a real IFC.
    if(syntheticResults){app.setResults(null);$('sap-state').textContent='Resultados: importa SAP JSON';$('num-nodes').textContent='—';$('num-frames').textContent='—';$('case-select').innerHTML='<option>Sin resultados</option>'; $('pattern-select').innerHTML='<option value="all">Todos</option>';}
    demoActive=false;sapGeometryActive=false;
    if(!syntheticResults&&app.results?.frames?.length)alignIFC(app.results,false);
    for(const config of Object.values(demos)){
      $(config.button).classList.remove('is-current');
      $(config.button).setAttribute('aria-pressed','false');
    }
    setModelLabel(file.name);
    updateStats(res.elementCount);
    status('IFC cargado');info(`${res.elementCount} elementos IFC renderizados. Carga el JSON de SAP2000 para superponer los resultados.`);
  }catch(err){console.error(err);status('Error IFC');info(`Error importando IFC: ${err.message}`,true);}
  e.target.value='';
});
$('sap-input').addEventListener('change',async(e)=>{
  const f=e.target.files?.[0];if(!f)return;
  try{
    const data=normalizeResults(JSON.parse(await f.text()));
    if(demoActive||sapGeometryActive||!app.parts.length){
      originalIFC=null;importedIFCName='';
      const geometry=makeSAPGeometry(data);
      if(!geometry.length)throw Error('El JSON no contiene barras válidas para visualizar.');
      app.setResults(null);
      app.setModel(geometry);
      demoActive=false;sapGeometryActive=true;
      app.showSAPOnly=false;app.showOriginal=true;app.showDeformed=true;app.showFrames=true;
      $('show-sap-only').checked=false;
      $('show-original').checked=true;$('show-displaced').checked=true;$('show-frames').checked=true;
      for(const config of Object.values(demos)){
        $(config.button).classList.remove('is-current');
        $(config.button).setAttribute('aria-pressed','false');
      }
      setModelLabel(f.name+' · barras SAP');
      updateStats(0);
    }
    syntheticResults=false;
    if(originalIFC?.length)alignIFC(data,false);
    setResults(data,f.name);
    info('Modelo SAP2000 cargado: '+data.nodes.length+' nudos, '+data.frames.length+
      ' barras. Vista analítica generada; secciones simplificadas.');
  }catch(err){console.error(err);info(`No se pudo leer SAP JSON: ${err.message}`,true);}
  e.target.value='';
});
$('analysis-view').addEventListener('change',e=>{
  const kind=e.target.value;
  app.showDeformed=kind==='deformation'||kind==='modes';
  app.showLoads=kind==='deformation';
  $('show-displaced').checked=app.showDeformed;
  $('show-loads').checked=app.showLoads;
  app.sapVisuals.setView(kind);
  $('legend').classList.toggle('force-legend',kind==='forces');
  $('force-values-controls').hidden=kind!=='forces';
  $('reaction-values-controls').hidden=kind!=='reactions';
  $('legend').classList.toggle('reaction-legend',kind==='reactions');
  $('force-readout').hidden=true;
});
$('force-component').addEventListener('change',e=>app.sapVisuals.setComponent(e.target.value));
$('toggle-force-values').addEventListener('click',()=>{
  const enabled=!app.sapVisuals.showCharacteristics;
  app.sapVisuals.setCharacteristics(enabled);
  $('toggle-force-values').setAttribute('aria-pressed',String(enabled));
  $('toggle-force-values').textContent=enabled?
    'Ocultar valores característicos':'Mostrar valores característicos';
});
$('toggle-reaction-values').addEventListener('click',()=>{
  const enabled=!app.reactionVisuals.showValues;
  app.reactionVisuals.setValues(enabled);
  $('toggle-reaction-values').setAttribute('aria-pressed',String(enabled));
  $('toggle-reaction-values').textContent=enabled?
    'Ocultar valores de reacciones':'Mostrar valores de reacciones';
});
$('mode-select').addEventListener('change',e=>app.sapVisuals.setMode(e.target.value));
$('modal-amplitude').addEventListener('input',e=>{
  app.sapVisuals.setAmplitude(e.target.value);
  $('modal-amplitude-value').textContent=Number(e.target.value).toFixed(2)+' m (visual)';
});
$('case-select').addEventListener('change',e=>{app.setCase(e.target.value);setSafeDeformationScale();});
$('pattern-select').addEventListener('change',e=>app.setPattern(e.target.value));
$('ifc-transparency').addEventListener('input',e=>{
  const transparency=Number(e.target.value);
  app.setIFCOpacity(1-transparency/100);
  $('ifc-transparency-value').textContent=transparency+' %';
  if(app.xrControls)app.xrControls.dirty=true;
});
$('ifc-opacity-scope').addEventListener('change',e=>{
  app.setIFCOpacityScope(e.target.value);
  if(app.xrControls)app.xrControls.dirty=true;
});
$('show-resistance-only').addEventListener('change',e=>{
  app.showStructureOnly=e.target.checked;
  app.updateVisualization();
  if(!demoActive)info('El filtro solo tiene clasificación resistente completa en los ejemplos docentes.');
});
const showControls={ 'show-loads':'showLoads','show-displaced':'showDeformed','show-original':'showOriginal','show-frames':'showFrames','show-supports':'showSupports','show-axes':'showAxes' };
for(const [id,key]of Object.entries(showControls)){
  $(id).addEventListener('change',e=>{app[key]=e.target.checked;app.axes.visible=app.showAxes;
    if(id==='show-axes'){
      app.axes.visible=app.showAxes&&!app.showSAPOnly;
      app.grid.visible=app.showAxes&&!app.isXR&&!app.showSAPOnly;
      app.groundMarkers.visible=app.grid.visible;
      return;
    }
    app.updateVisualization();
  });
}
$('show-sap-only').addEventListener('change',e=>{
  if(!app.setSAPOnly(e.target.checked)){
    e.target.checked=app.showSAPOnly;
    info('Para mostrar solo SAP2000, importa un JSON con barras analíticas y carga un modelo IFC.',true);
    return;
  }
  $('show-frames').checked=app.showFrames;
  info(app.showSAPOnly?'Vista analítica SAP2000 activa: IFC oculto.':'Vista combinada IFC + SAP2000 activa.');
});
$('hide-ground').addEventListener('change',e=>app.setHideGround(e.target.checked));
$('amp').addEventListener('input',e=>{
  app.amp=clampAmplification(e.target.value,app.ampMax);
  showAmplitude();
  app.updateVisualization(app.showSAPOnly);
});
$('model-size').addEventListener('input',e=>{app.targetMeters=Number(e.target.value);$('size-value').textContent=`${app.targetMeters.toFixed(1)} m`;app.updateScale();if(!app.isXR)app.recenterCamera();});
$('ifc-rotation').addEventListener('change',()=>{
  if(originalIFC?.length&&app.results?.frames?.length){const current=app.caseName;
    alignIFC(app.results);if(current)app.setCase(current);
  }
});
$('fit-ifc').addEventListener('click',()=>{
  if(!originalIFC?.length||!app.results?.frames?.length){info('Carga primero un IFC real y un JSON de SAP2000.',true);return;}
  alignIFC(app.results);
});
$('apply-offset').addEventListener('click',()=>{
  const off=['x','y','z'].map(c=>Number($(`offset-${c}`).value));
  if(off.some(v=>!Number.isFinite(v))){info('Los offsets deben ser numéricos.',true);return;}
  app.setOffset(off);info('Alineación actualizada. Verifica visualmente si las barras SAP coinciden con los elementos IFC.');
});

const forceReadout=$('force-readout');
app.renderer.domElement.addEventListener('pointermove',event=>{
  const view=app.sapVisuals.view;
  if(app.isXR||(view!=='forces'&&view!=='reactions')){
    forceReadout.hidden=true;return;
  }
  const rect=app.renderer.domElement.getBoundingClientRect();
  if(rect.width<1||rect.height<1)return;
  app.mouse.set((event.clientX-rect.left)/rect.width*2-1,
    -(event.clientY-rect.top)/rect.height*2+1);
  app.pickRaycaster.setFromCamera(app.mouse,app.camera);
  if(view==='reactions'){
    const reaction=app.reactionVisuals.pick(app.pickRaycaster);
    if(!reaction){forceReadout.hidden=true;return;}
    forceReadout.textContent='Nudo '+reaction.node+' · '+reaction.caseName+
      '\n'+reactionText(reaction.reaction);
  }else{
    const measured=app.sapVisuals.pickForce(app.pickRaycaster);
    if(!measured){forceReadout.hidden=true;return;}
    const sign=measured.value>0?'+':'';
    forceReadout.textContent='Barra '+measured.frameId+' · '+measured.component+
      '\n'+sign+measured.value.toFixed(3)+' '+measured.unit+
      '\nSección s = '+measured.station.toFixed(3)+' m · '+measured.caseName+
      '\nInterpolado entre estaciones SAP2000';
  }
  const stage=$('stage').getBoundingClientRect();
  forceReadout.style.left=Math.max(10,Math.min(stage.width-280,event.clientX-stage.left+20))+'px';
  forceReadout.style.top=Math.max(10,Math.min(stage.height-115,event.clientY-stage.top+16))+'px';
  forceReadout.hidden=false;
});
app.renderer.domElement.addEventListener('pointerleave',()=>{forceReadout.hidden=true;});
$('reset-view').addEventListener('click',()=>app.recenterCamera());
app.onSelection=(name)=>info(`Elemento seleccionado: ${name}`);
async function setWebcam(enable){
  const el=$('webcam');
  if(!enable){if(webcamStream){webcamStream.getTracks().forEach(track=>track.stop());webcamStream=null;}
    el.srcObject=null;$('stage').classList.remove('cam-active');$('btn-cam').classList.remove('active');$('btn-3d').classList.add('active');return;}
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('La cámara necesita localhost o HTTPS.');
    webcamStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user'}});
    el.srcObject=webcamStream;await el.play();
    $('stage').classList.add('cam-active');$('btn-cam').classList.add('active');$('btn-3d').classList.remove('active');
    info('Webcam activada. Se trata de una superposición 3D, sin seguimiento espacial ni calibración de cámara.');
  }catch(err){await setWebcam(false);info(`No se pudo activar la cámara: ${err.message}`,true);}
}
$('btn-cam').addEventListener('click',()=>setWebcam(!webcamStream));
$('btn-3d').addEventListener('click',()=>setWebcam(false));
// WebXR requires a real click to enter an immersive session. Switching mode
// while a different session is active asks the user to leave that session first.
async function startQuestXR(mode){
  const name=mode==='vr'?'VR':'RM';
  try{
    if(webcamStream)await setWebcam(false);
    if(app.xrSession&&app.xrMode!==mode){
      info('Sal del modo inmersivo actual antes de entrar en '+name+'.');
      return;
    }
    await app.enterXR({mode});
    if(app.xrMode===mode){
      $('btn-xr').textContent=mode==='ar'?'◎ Salir de RM':'◉ Quest 3 RM';
      $('btn-vr').textContent=mode==='vr'?'◎ Salir de VR':'◉ Quest 3 VR';
    }
  }catch(err){info('WebXR '+name+': '+err.message,true);}
}
$('btn-xr').addEventListener('click',()=>startQuestXR('ar'));
$('btn-vr').addEventListener('click',()=>startQuestXR('vr'));

app.onXREnd=()=>{
  $('btn-xr').textContent='◉ Quest 3 RM';
  $('btn-vr').textContent='◉ Quest 3 VR';
  $('btn-mobile-ar').textContent='▣ AR móvil';
};
$('mobile-ar-overlay').addEventListener('beforexrselect',e=>e.preventDefault());
$('mobile-ar-place').addEventListener('click',()=>{
  if(app.mobileARState)app.mobileARState.placeRequested=true;
});
$('mobile-ar-redetect').addEventListener('click',()=>app.resetMobilePlacement());
function adjustMobileSize(delta){
  app.targetMeters=Math.max(.4,Math.min(5,Math.round((app.targetMeters+delta)*10)/10));
  $('model-size').value=String(app.targetMeters);
  $('model-size').dispatchEvent(new Event('input'));
}
$('mobile-ar-smaller').addEventListener('click',()=>adjustMobileSize(-.2));
$('mobile-ar-larger').addEventListener('click',()=>adjustMobileSize(.2));
$('mobile-ar-amp').addEventListener('input',e=>{
  $('amp').value=e.target.value;
  $('amp').dispatchEvent(new Event('input'));
  $('mobile-ar-amp-value').textContent=formatAmplification(app.amp);
});
$('mobile-ar-sap-only').addEventListener('click',()=>{
  $('show-sap-only').checked=!app.showSAPOnly;
  $('show-sap-only').dispatchEvent(new Event('change'));
  $('mobile-ar-sap-only').textContent='Solo SAP: '+(app.showSAPOnly?'SÍ':'NO');
});
$('mobile-ar-exit').addEventListener('click',()=>app.xrSession?.end());
$('mobile-ios-close').addEventListener('click',()=>{$('mobile-ios-actions').hidden=true;});
function isIOSDevice(){
  return /iPhone|iPad|iPod/.test(navigator.userAgent)||
    (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
}
let iosBlobURL=null,iosWorking=false;
async function prepareQuickLook(){
  if(iosWorking)return;
  iosWorking=true;
  const panel=$('mobile-ios-actions'),status=$('mobile-ios-status'),anchor=$('mobile-ios-open');
  panel.hidden=false;anchor.hidden=true;
  status.textContent='Preparando el modelo 3D para AR Quick Look…';
  try{
    const {exportStructuralUSDZ}=await import('./mobile-usdz.js');
    const blob=await exportStructuralUSDZ(app,{includeShadow:$('mobile-ios-shadow').checked});
    if(iosBlobURL)URL.revokeObjectURL(iosBlobURL);
    iosBlobURL=URL.createObjectURL(blob);
    anchor.href=iosBlobURL;anchor.hidden=false;
    status.textContent='Modelo preparado. Pulsa «Abrir en AR Quick Look».';
  }catch(e){status.textContent='No se pudo preparar AR: '+e.message;}
  finally{iosWorking=false;}
}
$('mobile-ios-shadow').addEventListener('change',()=>{if(!$('mobile-ios-actions').hidden)prepareQuickLook();});
$('btn-mobile-ar').addEventListener('click',async()=>{
  if(isIOSDevice())return prepareQuickLook();
  try{
    if(!navigator.xr||!await navigator.xr.isSessionSupported('immersive-ar'))
      throw Error('Este móvil no admite WebXR AR. En Android utiliza Chrome y Servicios de Google Play para RA.');
    $('mobile-ar-amp').value=String(app.amp);
    $('mobile-ar-amp-value').textContent=formatAmplification(app.amp);
    $('mobile-ar-sap-only').textContent='Solo SAP: '+(app.showSAPOnly?'SÍ':'NO');
    if(app.xrSession)await app.xrSession.end();
    await app.enterXR({mobile:true});
    $('btn-mobile-ar').textContent='▣ Salir de AR móvil';
  }catch(e){info('AR móvil: '+e.message,true);}
});

(async()=>{
  const [mrOK,vrOK]=await Promise.all([
    app.webXRSupported('ar'),app.webXRSupported('vr')
  ]);
  $('xr-status').textContent=mrOK&&vrOK?
    'Quest · Realidad mixta y virtual disponibles':
    vrOK?'WebXR VR disponible · entorno virtual inmersivo':
    mrOK?'WebXR RM disponible · passthrough':
    isIOSDevice()?'iPhone: usa «AR móvil» (Quick Look)':
    'Para VR/RM abre esta página HTTPS con Quest Browser';
})();
showDemo('frame');
