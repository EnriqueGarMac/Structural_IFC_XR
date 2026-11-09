import './style.css';
import { StructuralScene } from './scene.js';
import { readIFC } from './ifc-loader.js';
import { demoGeometry, demoResults } from './demo.js';
import {roofDemoGeometry,roofDemoResults,ROOF_DEMO} from './roof-demo.js';
import { normalizeResults } from './results.mjs';
import { SAPVisuals, makeSAPGeometry } from './sap-visuals.js';
import * as THREE from 'three';
import {findBestAlignment,makeIFCTransformElements} from './ifc-alignment.mjs';
const $=(id)=>document.getElementById(id);
const app=new StructuralScene($('canvas-wrap'));
app.sapVisuals=new SAPVisuals(app);
let sapGeometryActive=false;
let originalIFC=null;
let ifcElementCount=0;
const MAX_AMP=25000;
function showAmplitude(){ $('amp').value=String(app.amp); $('amp-value').textContent='×'+app.amp.toLocaleString('es-ES'); }
function alignIFC(results,notify=true){
  if(!originalIFC?.length||!results?.frames?.length)return null;
  const mode=$('ifc-rotation').value;
  const fit=findBestAlignment(originalIFC,results,mode);
  const matrix=new THREE.Matrix4().set(...makeIFCTransformElements(fit));
  const transformed=originalIFC.map(piece=>({...piece,geometry:piece.geometry.clone().applyMatrix4(matrix)}));
  app.setResults(null);
  app.setModel(transformed);
  app.setResults(results);
  sapGeometryActive=false;
  const label=mode==='auto'?('Automática ('+fit.rotation.key+')'):(mode+' ('+fit.rotation.key+')');
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
  app.sapVisuals.view='deformation';app.sapVisuals.refresh();
  if(!syntheticResults){
    const factor=app.maxU>0?Math.min(MAX_AMP,Math.max(25,Math.round(.10*app.maxSize/app.maxU))):25;
    app.amp=factor;showAmplitude();app.updateVisualization();
  }
  const cases=$('case-select');cases.innerHTML='';
  if(!results.cases.length)cases.add(new Option('Sin deformadas', ''));
  results.cases.forEach(c=>cases.add(new Option(c.name,c.name)));
  const patterns=$('pattern-select');patterns.innerHTML='';patterns.add(new Option('Todos los patrones','all'));
  for(const pattern of [...new Set(results.loads.map(l=>l.pattern))].sort())patterns.add(new Option(pattern,pattern));
  if(results.meta?.note)info(results.meta.note);
  const rawFrameCount=results.loads.length;
  status(`${results.cases.length} caso(s) · ${rawFrameCount} cargas`);
}
const demos={
  frame:{
    title:'Pórtico de demostración · 8 × 6 m',
    geometry:demoGeometry,results:demoResults,button:'demo-btn'
  },
  roof:{
    title:ROOF_DEMO.name,
    geometry:roofDemoGeometry,results:roofDemoResults,button:'roof-demo-btn'
  }
};
let activeDemo='frame';
function showDemo(kind='frame'){
  const selected=demos[kind];
  if(!selected)throw Error('Ejemplo de demostración desconocido.');
  demoActive=true;syntheticResults=true;sapGeometryActive=false;originalIFC=null;activeDemo=kind;
  $('alignment-status').textContent='Importa un IFC y un JSON para alinear.';
  // Start with legible combined views, without inheriting an empty SAP-only mode.
  app.showSAPOnly=false;app.showOriginal=true;app.showDeformed=true;
  app.showFrames=true;app.showLoads=true;app.hideGround=true;
  for(const [id,checked] of [
    ['show-sap-only',false],['show-original',true],['show-displaced',true],
    ['show-frames',true],['show-loads',true],['hide-ground',true]
  ])$(id).checked=checked;
  app.setResults(null); // Never interpolate the previous demo's result field.
  app.offset=[0,0,0];for(const c of ['x','y','z'])$('offset-'+c).value='0';
  $('amp').value='25';app.amp=25;$('amp-value').textContent='×25';
  app.setModel(selected.geometry());
  setModelLabel(selected.title);
  updateStats(app.parts.length);
  setResults(selected.results,'SINTÉTICOS · NO SAP2000');
  for(const [name,config] of Object.entries(demos)){
    const button=$(config.button);
    button.classList.toggle('is-current',name===kind);
    button.setAttribute('aria-pressed',String(name===kind));
  }
  app.xrControls.selected='—';
  app.xrControls.dirty=true;
  app.updateVisualization();
  status('DEMO SINTÉTICA · NO SAP2000');
}
$('demo-btn').addEventListener('click',()=>showDemo('frame'));
$('roof-demo-btn').addEventListener('click',()=>showDemo('roof'));
$('ifc-input').addEventListener('change',async(e)=>{
  const file=e.target.files?.[0];if(!file)return;
  status('Leyendo IFC…');
  try{
    const res=await readIFC(file,(message)=>status(message));
    originalIFC=res.items.map(item=>({...item,geometry:item.geometry.clone()}));
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
      originalIFC=null;
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
  $('force-readout').hidden=true;
});
$('force-component').addEventListener('change',e=>app.sapVisuals.setComponent(e.target.value));
$('show-force-values').addEventListener('change',e=>{
  app.sapVisuals.setCharacteristics(e.target.checked);
});
$('mode-select').addEventListener('change',e=>app.sapVisuals.setMode(e.target.value));
$('modal-amplitude').addEventListener('input',e=>{
  app.sapVisuals.setAmplitude(e.target.value);
  $('modal-amplitude-value').textContent=Number(e.target.value).toFixed(2)+' m (visual)';
});
$('case-select').addEventListener('change',e=>app.setCase(e.target.value));
$('pattern-select').addEventListener('change',e=>app.setPattern(e.target.value));
const showControls={ 'show-loads':'showLoads','show-displaced':'showDeformed','show-original':'showOriginal','show-frames':'showFrames','show-axes':'showAxes' };
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
$('amp').addEventListener('input',e=>{app.amp=Number(e.target.value);$('amp-value').textContent=`×${app.amp}`;app.updateVisualization(app.showSAPOnly);});
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
  if(app.isXR||app.sapVisuals.view!=='forces'){
    forceReadout.hidden=true;return;
  }
  const rect=app.renderer.domElement.getBoundingClientRect();
  if(rect.width<1||rect.height<1)return;
  app.mouse.set((event.clientX-rect.left)/rect.width*2-1,
    -(event.clientY-rect.top)/rect.height*2+1);
  app.pickRaycaster.setFromCamera(app.mouse,app.camera);
  const measured=app.sapVisuals.pickForce(app.pickRaycaster);
  if(!measured){forceReadout.hidden=true;return;}
  const sign=measured.value>0?'+':'';
  forceReadout.textContent='Barra '+measured.frameId+' · '+measured.component+
    '\n'+sign+measured.value.toFixed(3)+' '+measured.unit+
    '\\nSección s = '+measured.station.toFixed(3)+' m · '+measured.caseName+
    '\\nInterpolado entre estaciones SAP2000';
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
$('btn-xr').addEventListener('click',async()=>{
  try{if(webcamStream)await setWebcam(false);await app.enterXR();$('btn-xr').textContent='◎ Salir de RM';}
  catch(err){info(`WebXR: ${err.message}`,true);}
});

app.onXREnd=()=>{
  $('btn-xr').textContent='◉ Quest 3 RM';
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
  $('mobile-ar-amp-value').textContent='×'+app.amp;
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
    $('mobile-ar-amp-value').textContent='×'+app.amp;
    $('mobile-ar-sap-only').textContent='Solo SAP: '+(app.showSAPOnly?'SÍ':'NO');
    if(app.xrSession)await app.xrSession.end();
    await app.enterXR({mobile:true});
    $('btn-mobile-ar').textContent='▣ Salir de AR móvil';
  }catch(e){info('AR móvil: '+e.message,true);}
});

(async()=>{
  const xrOK=await app.webXRSupported();
  $('xr-status').textContent=xrOK?'WebXR disponible · Quest o Android':isIOSDevice()?'iPhone: usa «AR móvil» (Quick Look)':'Quest / Android: WebXR compatible necesario';
})();
showDemo('frame');
