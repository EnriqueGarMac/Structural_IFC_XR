import * as THREE from 'three';
import {clamp,rotateIndex,snapModelSize,isValidHorizontalHit,caseLabel,nextUniquePattern,
  amplificationFromSliderX,sliderXFromAmplification} from './xr-logic.mjs';
import {nextXRIFCOpacity} from './ifc-opacity.mjs';

// A real 3D UI: HTML overlays do not reliably appear in immersive WebXR.
// All model/result operations are routed to the same StructuralScene used on PC.
const W=768,H=1100;
const uiColour={bg:'#0a1c29',surface:'#163345',edge:'#467083',text:'#e8fbfc',muted:'#9fc7d4',accent:'#71f3dc'};
function rounded(ctx,x,y,w,h,r,fill,stroke){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);
  if(fill){ctx.fillStyle=fill;ctx.fill();}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}
}
const textFit=(value,max=52)=>String(value??'').length>max?String(value).slice(0,max-1)+'…':String(value??'');

export class StructuralXRControls {
  constructor(app){
    this.app=app;this.page='main';this.hits=[];this.hoverId=null;this.selected='—';this.notice='';
    this.dirty=true;this.drag=null;this.placeMode=false;this.moveMenu=false;this.shadow=true;this.hasPlacedSurface=false;this.hitAvailable=false;this.latestHit=null;
    this.hitSources=new Map();this.hitByInput=new Map();this.currentSource=null;
    this.session=null;this.initializedPose=false;this.buttonLatches=new Map();
    this.canvas=document.createElement('canvas');this.canvas.width=W;this.canvas.height=H;
    this.ctx=this.canvas.getContext('2d');
    this.texture=new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace=THREE.SRGBColorSpace;
    this.texture.anisotropy=2;
    const material=new THREE.MeshBasicMaterial({
      map:this.texture,transparent:true,side:THREE.DoubleSide,
      depthTest:false,depthWrite:false,toneMapped:false
    });
    this.panel=new THREE.Mesh(new THREE.PlaneGeometry(.73,1.045),material);
    this.panel.renderOrder=20000;
    this.panel.visible=false;
    app.scene.add(this.panel);
    this.raycaster=new THREE.Raycaster();
    this.raycaster.far=12;
    this.controllers=[];
    for(let i=0;i<2;i++){
      const controller=app.renderer.xr.getController(i);
      const grip=app.renderer.xr.getControllerGrip(i);
      const geometry=new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,-1)
      ]);
      const rayLine=new THREE.Line(geometry,
        new THREE.LineBasicMaterial({color:0x6beadd,depthTest:false,transparent:true,opacity:.85}));
      rayLine.scale.z=2.6;rayLine.renderOrder=19000;
      controller.add(rayLine);
      controller.addEventListener('connected',e=>{controller.userData.xrInput=e.data;});
      controller.addEventListener('disconnected',()=>{controller.userData.xrInput=null;});
      controller.addEventListener('selectstart',()=>this.onSelectStart(controller));
      controller.addEventListener('selectend',()=>this.onRelease(controller,'select'));
      controller.addEventListener('squeezestart',()=>this.onSqueezeStart(controller,grip));
      controller.addEventListener('squeezeend',()=>this.onRelease(controller,'squeeze'));
      app.scene.add(controller);app.scene.add(grip);
      this.controllers.push({controller,grip,rayLine});
    }
    this.reticle=new THREE.Mesh(new THREE.RingGeometry(.07,.095,32),
      new THREE.MeshBasicMaterial({color:0x60ffbd,side:THREE.DoubleSide,depthTest:false,transparent:true,opacity:.85}));
    this.reticle.rotation.x=-Math.PI/2;
    this.reticle.visible=false;this.reticle.renderOrder=15000;app.scene.add(this.reticle);
    this.contact=new THREE.Mesh(new THREE.CircleGeometry(.55,40),
      new THREE.MeshBasicMaterial({color:0x02070b,transparent:true,opacity:.14,
        depthTest:false,depthWrite:false,side:THREE.DoubleSide}));
    this.contact.rotation.x=-Math.PI/2;this.contact.visible=false;
    this.contact.renderOrder=-1;app.scene.add(this.contact);
    this.baseQuat=app.worldRoot.quaternion.clone();
    this.basePosition=new THREE.Vector3(0,-.85,-1.55);
    this.vrPosition=new THREE.Vector3(0,.72,-2.4);
    this.lastFrameTime=0;
  }
  start(session){
    this.session=session;
    this.initializedPose=false;this.panel.visible=true;
    this.page='main';this.dirty=true;this.placeMode=false;this.moveMenu=false;
    this.hitAvailable=this.app.xrMode!=='vr' &&
      typeof session.requestHitTestSource==='function' &&
      (!session.enabledFeatures||session.enabledFeatures.includes('hit-test'));
    this.app.worldRoot.quaternion.copy(this.baseQuat);
    this.app.worldRoot.position.copy(this.app.xrMode==='vr'?
      this.vrPosition:this.basePosition);
    this.contact.visible=false;this.hasPlacedSurface=false;
  }
  stop(){
    this.session=null;this.panel.visible=false;this.reticle.visible=false;
    this.app.sapVisuals?.hideXRHover();
    this.app.reactionVisuals?.hideXRHover();
    this.contact.visible=false;this.hasPlacedSurface=false;this.placeMode=false;this.moveMenu=false;this.drag=null;this.latestHit=null;
    for(const h of this.hitSources.values())h.source?.cancel();
    this.hitSources.clear();this.hitByInput.clear();this.buttonLatches.clear();
    this.app.worldRoot.position.set(0,0,0);
    this.app.worldRoot.quaternion.copy(this.baseQuat);
  }
  dispose(){
    this.stop();
    for(const item of this.controllers){
      item.controller.remove(item.rayLine);
      item.rayLine.geometry.dispose();item.rayLine.material.dispose();
      this.app.scene.remove(item.controller,item.grip);
    }
    this.app.scene.remove(this.panel,this.reticle,this.contact);
    this.panel.geometry.dispose();this.panel.material.dispose();this.texture.dispose();
    this.reticle.geometry.dispose();this.reticle.material.dispose();
    this.contact.geometry.dispose();this.contact.material.dispose();
  }
  locatePanel(){
    if(this.initializedPose||!this.session)return;
    const camera=this.app.renderer.xr.getCamera();
    camera.updateMatrixWorld();
    const pos=new THREE.Vector3(),q=new THREE.Quaternion();
    camera.getWorldPosition(pos);camera.getWorldQuaternion(q);
    this.panel.position.copy(pos).add(new THREE.Vector3(-.26,-.02,-1.27).applyQuaternion(q));
    this.panel.quaternion.copy(q);
    this.initializedPose=true;
  }
  resetPanel(){
    this.initializedPose=false;this.locatePanel();this.dirty=true;
  }
  _ray(controller){
    this.raycaster.setFromXRController(controller);
    return this.raycaster;
  }
  _menuHit(controller){
    const hits=this._ray(controller).intersectObject(this.panel,false);
    if(!hits.length)return null;
    const uv=hits[0].uv;
    const x=uv.x*W,y=(1-uv.y)*H;
    const item=this.hits.find(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h);
    return {item,intersection:hits[0]};
  }
  onSelectStart(controller){
    if(!this.session)return;
    if(this.moveMenu){
      // Second trigger confirms the current panel placement even when
      // the menu is physically following the ray.
      this.moveMenu=false;this.dirty=true;return;
    }
    if(this.placeMode){
      // Buttons remain usable while scanning, but other clicks place the model.
      const menuHit=this._menuHit(controller);
      if(menuHit?.item&&menuHit.item.id!=='menu-handle'){
        this.command(menuHit.item.id);return;
      }
      const input=controller.userData.xrInput;
      const plane=(input&&this.hitByInput.get(input))||this.latestHit;
      if(plane){
        this.app.worldRoot.position.set(plane.point.x,plane.point.y+.02,plane.point.z);
        this.app.worldRoot.quaternion.copy(this.baseQuat);
        this.placeMode=false;this.reticle.visible=false;
        this.contact.position.set(plane.point.x,plane.point.y+.008,plane.point.z);
        this.hasPlacedSurface=true;this.contact.visible=this.shadow;
        this.dirty=true;
        this.app.onXRMessage?.('Modelo colocado en superficie horizontal detectada.');
      }
      return;
    }
    const menuHit=this._menuHit(controller);
    if(menuHit){
      if(menuHit.item?.id==='menu-handle'){
        this.beginDrag('menu',controller,controller,this.panel);return;
      }
      if(menuHit.item?.id==='amp-slider'){
        this.drag={kind:'amp-slider',controller};
        this.setAmplificationFromX(menuHit.intersection.uv.x*W);
        return;
      }
      if(menuHit.item)this.command(menuHit.item.id);
      return;
    }
    // A force-diagram click queries a section instead of rotating the structure.
    // The live hover also works without pressing the trigger.
    if(this.app.sapVisuals?.view==='forces'){
      const selected=this.app.sapVisuals.inspectXRRay(this._ray(controller));
      if(selected){
        this.selected='Barra '+selected.frameId+' · '+selected.component+
          ' '+selected.value.toFixed(2)+' '+selected.unit;
        this.dirty=true;return;
      }
    }
    if(this.app.sapVisuals?.view==='reactions'){
      const reaction=this.app.reactionVisuals?.inspectXRRay(this._ray(controller));
      if(reaction){
        this.selected='Nudo '+reaction.node+' · '+reaction.caseName;
        this.dirty=true;return;
      }
    }
    // Trigger directly on structural geometry: select element and rotate
    // the entire IFC/SAP overlay according to the controller orientation.
    const picks=this._ray(controller).intersectObjects([
      ...(this.app.originalGroup.visible?this.app.originalGroup.children.filter(x=>x.visible):[]),
      ...(this.app.deformedGroup.visible?this.app.deformedGroup.children.filter(x=>x.visible):[])
    ],false);
    const hit=picks.find(x=>x.object.visible);
    if(hit){
      const item=hit.object.userData;
      this.selected=item?.name||'Elemento IFC';
      this.app.onSelection?.(item?.guid?this.selected+' · GUID '+item.guid:this.selected);
      this.beginDrag('rotate',controller,controller,this.app.worldRoot);
      this.dirty=true;
    }
  }
  onSqueezeStart(controller,grip){
    if(!this.session||this.drag||this._menuHit(controller))return;
    this.beginDrag('move',controller,grip,this.app.worldRoot);
  }
  beginDrag(kind,controller,source,object){
    source.updateMatrixWorld();
    const point=new THREE.Vector3(),q=new THREE.Quaternion();
    source.getWorldPosition(point);source.getWorldQuaternion(q);
    this.drag={kind,controller,source,object,startPos:point,
      startQ:q,startObjectPos:object.position.clone(),startObjectQ:object.quaternion.clone()};
  }
  onRelease(controller,button){
    const d=this.drag;
    if(!d||d.controller!==controller)return;
    if(d.kind==='menu'&&button==='select'||
       d.kind==='rotate'&&button==='select'||
       d.kind==='move'&&button==='squeeze'||
       d.kind==='amp-slider'&&button==='select')this.drag=null;
  }
  setAmplification(value){
    const next=Math.round(clamp(value,0,25000));
    if(next===this.app.amp)return false;
    const input=$('amp');
    input.value=String(next);
    input.dispatchEvent(new Event('input'));
    this.dirty=true;
    return true;
  }
  setAmplificationFromX(x){
    return this.setAmplification(amplificationFromSliderX(x,163,604,25000));
  }
  _buttons(){
    const c=this.ctx;
    const btn=(id,label,x,y,w,h,accent=false)=>{
      this.hits.push({id,x,y,w,h});
      const active=id===this.hoverId;
      rounded(c,x,y,w,h,13,active?'#356c76':accent?'#1f6670':uiColour.surface,
        active?'#90ffdc':uiColour.edge);
      c.fillStyle='#f0fcff';c.font=(accent?'bold 24px':'22px')+' system-ui';
      c.textAlign='center';c.textBaseline='middle';c.fillText(label,x+w/2,y+h/2,w-22);
    };
    const txt=(str,x,y,size=21,color=uiColour.muted,align='left')=>{
      c.fillStyle=color;c.textAlign=align;c.textBaseline='middle';
      c.font=size+'px system-ui';c.fillText(String(str),x,y,W-70);
    };
    return {btn,txt};
  }
  repaint(){
    const c=this.ctx;c.clearRect(0,0,W,H);this.hits=[];
    rounded(c,0,0,W,H,22,'rgba(7,26,40,.97)','#4b8290');
    rounded(c,15,15,W-30,86,15,'#164450');
    const {btn,txt}=this._buttons();
    txt('IMIS · STRUCTURAL XR',35,55,30,uiColour.accent);
    txt('ARRASTRAR',722,55,17,'#b0d3df','right');
    this.hits.push({id:'menu-handle',x:15,y:15,w:W-30,h:86});
    const app=this.app;
    const dataPresent=Boolean(app.results?.cases?.length);
    if(this.page==='main'){
      txt(textFit($('model-state').textContent,56),38,148,20,'#e5f9fb');
      txt('Seleccionado: '+textFit(this.selected,34),38,193,20,'#b5d8df');
      btn('results','ANÁLISIS Y DEFORMADAS',38,245,692,91,true);
      btn('layers','CAPAS Y ELEMENTOS',38,357,692,91);
      btn('placement',app.xrMode==='vr'?'MOVER MODELO EN VR':'COLOCACIÓN EN LA SALA',
        38,469,692,91);
      txt('Tamaño del modelo en realidad mixta',38,614,21);
      btn('size:-','−',38,645,144,78);
      txt(app.targetMeters.toFixed(1)+' m',385,684,29,'#f3ffff','center');
      btn('size:+','+',586,645,144,78);
      btn('reset-model','Recentrar estructura',38,769,335,76);
      btn('menu-move',this.moveMenu?'Gatillo: fijar menú':'Mover menú',395,769,335,76,true);
      txt('CAMBIAR EJEMPLO SIN SALIR DE RM',38,861,18,'#afcdd7');
      btn('demo-frame','PÓRTICO',38,880,335,67);
      btn('demo-roof','CUBIERTA CELOSÍA',395,880,335,67,true);
      btn('exit','SALIR DE REALIDAD MIXTA',38,979,692,77);
    }else if(this.page==='results'){
      btn('back','‹ Volver',38,117,230,66);
      txt('RESULTADOS ESTRUCTURALES',38,225,28,'#e6f6fc');
      txt('Caso / combinación',38,283,22);
      btn('case:-','‹',38,321,126,70);
      txt(textFit(app.caseName||'Sin casos',37),385,356,23,'#edffff','center');
      btn('case:+','›',606,321,124,70);
      txt('Patrón de cargas',38,438,22);
      btn('pattern:-','‹',38,473,126,68);
      txt(textFit(app.pattern==='all'?'Todos':app.pattern,28),385,506,23,'#edffff','center');
      btn('pattern:+','›',606,473,124,68);
      txt('AMPLIFICACIÓN DE LA DEFORMADA',38,584,21);
      txt('×'+app.amp,712,584,29,'#8bf6df','right');
      const left=163,right=604,y=660;
      rounded(c,left-7,y-8,right-left+14,16,8,'#254859');
      const x=sliderXFromAmplification(app.amp,163,604,25000);
      rounded(c,left-7,y-8,Math.max(10,x-left+7),16,8,'#45c6ae');
      c.beginPath();c.arc(x,y,21,0,Math.PI*2);c.fillStyle='#e8ffff';c.fill();
      c.strokeStyle='#72eed9';c.lineWidth=4;c.stroke();
      this.hits.push({id:'amp-slider',x:153,y:619,w:461,h:82});
      btn('amp:-','−',38,622,102,75);
      btn('amp:+','+',629,622,101,75);
      txt('×0',157,713,18,'#a2c6d1');
      txt('×25.000',613,713,18,'#a2c6d1','right');
      const view=app.sapVisuals?.view||'deformation';
      const viewLabel={deformation:'Deformadas y cargas',forces:'Diagramas de esfuerzos',
        reactions:'Reacciones en apoyos',modes:'Modos de vibración'};
      btn('view:next','VISTA: '+viewLabel[view],38,756,692,73,true);
      const detail=view==='forces'?'Esfuerzo: '+(app.sapVisuals?.component||'M3'):
        view==='modes'?'Modo '+((app.results?.modes||[])[app.sapVisuals?.modeIndex||0]?.number??'—')+
          ' · '+Number((app.results?.modes||[])[app.sapVisuals?.modeIndex||0]?.frequency_hz||0).toFixed(2)+' Hz':
          'Patrón: '+(app.pattern==='all'?'Todos':app.pattern);
      if(view==='reactions'){
        const summary=app.reactionVisuals?.lastSummary;
        const z=summary?.force?.[2];
        txt('Suma reacciones Z: '+(Number.isFinite(z)?z.toFixed(3)+' kN':'—'),
          385,881,23,'#a6eeea','center');
        btn('reaction-values','VALORES: '+(app.reactionVisuals?.showValues?'SÍ':'NO'),
          38,932,334,77,true);
        btn('sap-only',app.showSAPOnly?'IFC: OCULTO':'IFC: VISIBLE',
          394,932,336,77);
        txt('Apunta al nudo del apoyo: fuerzas y momentos en ejes globales XYZ.',
          38,1052,17,'#9ce6d9');
      }else{
        btn('detail:-','‹',38,847,126,69);
        txt(textFit(detail,37),385,881,23,'#edffff','center');
        btn('detail:+','›',606,847,124,69);
      if(view==='forces'){
        btn('force-values','ETIQUETAS: '+(app.sapVisuals?.showCharacteristics?'SÍ':'NO'),
          38,932,334,77,true);
        btn('sap-only',app.showSAPOnly?'IFC: OCULTO':'IFC: VISIBLE',
          394,932,336,77);
        txt('Apunta al área sombreada con el mando para consultar s y el esfuerzo.',
          38,1052,17,'#9ce6d9');
      }else{
        btn('sap-only',app.showSAPOnly?'✓ SOLO SAP — IFC OCULTO':'VER SOLO ELEMENTOS SAP',
          38,932,692,77,true);
        txt('La escala solo afecta a la representación, no al cálculo.',38,1052,18);
      }
      }
    }else if(this.page==='layers'){
      btn('back','‹ Volver',38,117,230,66);
      txt('CAPAS / VISUALIZACIÓN',38,224,28,'#e1f7fc');
      btn('sap-only',app.showSAPOnly?'✓ SOLO SAP — IFC OCULTO':'Solo elementos SAP2000',
        38,277,692,66,true);
      btn('terrain',app.hideGround?'Terreno: OCULTO':'Terreno: VISIBLE',38,349,692,66);
      btn('original','IFC: '+(app.showOriginal?'VISIBLE':'OCULTO'),38,421,692,66);
      btn('deformed','Deformada: '+(app.showDeformed?'visible':'oculta'),38,493,692,66);
      btn('loads','Cargas: '+(app.showLoads?'visibles':'ocultas'),38,565,692,66);
      btn('frames','Barras SAP: '+(app.showFrames?'visibles':'ocultas'),38,637,692,66);
      btn('supports','Apoyos 3D: '+(app.showSupports?'visibles':'ocultos'),38,709,692,66);
      btn('axes','Ejes: '+(app.showAxes?'visibles':'ocultos'),38,781,692,66);
      btn('ifc-opacity-scope','Transparencia: '+
        (app.ifcOpacityScope==='all'?'TODO EL IFC':'ENVOLVENTE'),38,853,692,66);
      btn('ifc-opacity-step','Opacidad IFC: '+Math.round(app.ifcOpacity*100)+
        '%  ·  siguiente nivel',38,925,692,66,true);
      txt('0% / 25% / 50% / 75% / 92% transpar. por pulsación',38,1027,17,'#92e9d9');
      txt(textFit(this.selected,48),38,1052,18,'#83e9da');
    }else if(this.page==='placement' && app.xrMode==='vr'){
      btn('back','‹ Volver',38,117,230,66);
      txt('ESTUDIO VIRTUAL · VR',38,219,29,'#e4f8ff');
      txt('Gatillo sobre estructura: selecciona y gira',38,294,22,'#a0e1e9');
      txt('Grip: desplaza el modelo en el espacio',38,354,22,'#a0e1e9');
      txt('Joystick izquierdo: rota la estructura',38,414,22,'#a0e1e9');
      txt('Joystick derecho: ajusta tamaño',38,474,22,'#a0e1e9');
      btn('reset-model','Recentrar modelo enfrente de ti',38,575,692,90,true);
      btn('results','Consultar cargas, esfuerzos y modos',38,709,692,90);
      txt('Sala virtual sin passthrough: no se graba tu entorno.',38,893,20);
      btn('exit','SALIR DE REALIDAD VIRTUAL',38,978,692,78);
    }else if(this.page==='placement'){
      btn('back','‹ Volver',38,117,230,66);
      txt('COLOCACIÓN EN EL ENTORNO',38,220,28,'#e4f8ff');
      btn('place',this.placeMode?'Cancelar detección':'Detectar mesa / suelo',
        38,306,692,92,true);
      txt(this.hitAvailable?'Detección horizontal WebXR disponible':
        'Este navegador no proporciona WebXR hit-test',38,442,20,
        this.hitAvailable?'#86f7d9':'#ffb7a5');
      txt(this.latestHit&&this.placeMode?'Anillo verde visible: gatillo para colocar':
        'Apunta al plano y confirma con el gatillo.',38,497,20);
      btn('reset-model','Recentrar modelo',38,590,692,82);
      btn('shadow','Sombra de contacto: '+(this.shadow?'ON':'OFF'),38,703,692,82);
      txt('La sombra es virtual y aproximada.',38,854,21);
      txt('No reconstruye ni almacena mallas de la sala.',38,903,21);
      txt('La importación de IFC/SAP se hace antes de entrar.',38,977,19);
    }
    this.texture.needsUpdate=true;this.dirty=false;
  }
  syncControl(id,checked){
    const el=document.getElementById(id);
    if(el){el.checked=checked;el.dispatchEvent(new Event('change'));}
  }
  command(id){
    const app=this.app;
    if(id==='back'){this.page='main';}
    else if(['results','layers','placement'].includes(id))this.page=id;
    else if(id==='exit'){this.session?.end();return;}
    else if(id==='demo-frame'||id==='demo-roof'){
      const button=$((id==='demo-roof')?'roof-demo-btn':'demo-btn');
      button?.click();
      this.selected='—';
      this.notice='Ejemplo sintético cargado. No procede de SAP2000.';
      this.dirty=true;
    }
    else if(id==='menu-move'){
      this.moveMenu=!this.moveMenu;
      // The first click only arms placement; the following click pins the panel.
    }
    else if(id==='reset-model'){
      app.worldRoot.position.copy(app.xrMode==='vr'?this.vrPosition:this.basePosition);
      app.worldRoot.quaternion.copy(this.baseQuat);
      this.contact.visible=false;this.hasPlacedSurface=false;
    }
    else if(id==='sap-only'){
      const desired=!app.showSAPOnly;
      this.syncControl('show-sap-only',desired);
      this.notice=app.showSAPOnly===desired?
        (desired?'Modo analítico SAP2000 activo.':'Vista IFC + SAP restaurada.') :
        'Importa SAP2000 y un IFC antes de activar este modo.';
    }
    else if(id==='ifc-opacity-scope'){
      const next=app.ifcOpacityScope==='envelope'?'all':'envelope';
      const select=$('ifc-opacity-scope');
      if(select){select.value=next;select.dispatchEvent(new Event('change'));}
    }
    else if(id==='ifc-opacity-step'){
      const next=nextXRIFCOpacity(app.ifcOpacity);
      const slider=$('ifc-transparency');
      if(slider){
        slider.value=String(Math.round((1-next)*100));
        slider.dispatchEvent(new Event('input'));
      }
    }
    else if(id==='terrain'){
      this.syncControl('hide-ground',!app.hideGround);
      this.notice=app.hideGround?'Terreno oculto; forjados visibles.':'Terreno visible.';
    }
    else if(id==='size:+'||id==='size:-'){
      app.targetMeters=snapModelSize(app.targetMeters,id==='size:+'?.2:-.2);
      app.updateScale();
      const input=$('model-size');if(input)input.value=String(app.targetMeters);
      const label=$('size-value');if(label)label.textContent=app.targetMeters.toFixed(1)+' m';
    }
    else if(id==='case:+'||id==='case:-'){
      const cases=app.results?.cases||[];
      if(cases.length){
        const i=cases.findIndex(c=>c.name===app.caseName);
        const next=cases[rotateIndex(Math.max(0,i),id==='case:+'?1:-1,cases.length)].name;
        app.setCase(next);$('case-select').value=next;
      }
    }
    else if(id==='view:next'){
      const choices=['deformation','forces','reactions','modes'];
      const active=app.sapVisuals?.view||'deformation';
      const next=choices[(choices.indexOf(active)+1)%choices.length];
      const el=$('analysis-view');if(el){el.value=next;el.dispatchEvent(new Event('change'));}
    }
    else if(id==='detail:+'||id==='detail:-'){
      const step=id==='detail:+'?1:-1,kind=app.sapVisuals?.view||'deformation';
      if(kind==='forces'){
        const options=['P','V2','V3','T','M2','M3'],i=options.indexOf(app.sapVisuals.component);
        const selected=options[rotateIndex(Math.max(0,i),step,options.length)];
        $('force-component').value=selected;$('force-component').dispatchEvent(new Event('change'));
      }else if(kind==='modes'){
        const n=app.results?.modes?.length||0;
        if(n){
          const selected=rotateIndex(app.sapVisuals.modeIndex,step,n);
          $('mode-select').value=String(selected);$('mode-select').dispatchEvent(new Event('change'));
        }
      }else{
        const p=nextUniquePattern(app.results?.loads,app.pattern,step);
        app.setPattern(p);$('pattern-select').value=p;
      }
    }
    else if(id==='reaction-values'){
      $('toggle-reaction-values')?.click();
    }
    else if(id==='force-values'){
      $('toggle-force-values')?.click();
      this.notice=app.sapVisuals?.showCharacteristics?
        'Valores característicos activados. Apunta con el mando para inspeccionar las secciones.':
        'Valores característicos ocultos. Puedes seguir apuntando para leer esfuerzos.';
    }
    else if(id==='pattern:+'||id==='pattern:-'){
      const p=nextUniquePattern(app.results?.loads,app.pattern,id==='pattern:+'?1:-1);
      app.setPattern(p);$('pattern-select').value=p;
    }
    else if(id==='amp:+'||id==='amp:-'){
      this.setAmplification(app.amp+(id==='amp:+'?500:-500));
    }
    else if(['loads','deformed','original','frames','supports','axes'].includes(id)){
      const dict={loads:['showLoads','show-loads'],deformed:['showDeformed','show-displaced'],
        original:['showOriginal','show-original'],frames:['showFrames','show-frames'],supports:['showSupports','show-supports'],axes:['showAxes','show-axes']};
      const [prop,domId]=dict[id];
      this.syncControl(domId,!app[prop]);
    }
    else if(id==='place'){
      if(!this.hitAvailable){this.app.onXRMessage?.('WebXR hit-test no disponible.');return;}
      this.placeMode=!this.placeMode;
      this.latestHit=null;this.reticle.visible=false;
    }
    else if(id==='shadow'){
      this.shadow=!this.shadow;
      this.contact.visible=this.shadow&&this.hasPlacedSurface;
    }
    this.dirty=true;
  }
  updateHitTesting(frame){
    if(!frame||!this.placeMode||!this.hitAvailable||!this.session)return;
    const ref=this.app.renderer.xr.getReferenceSpace();
    if(!ref)return;
    for(const input of this.session.inputSources){
      if(!input.targetRaySpace||this.hitSources.has(input))continue;
      this.hitSources.set(input,{pending:true});
      this.session.requestHitTestSource({space:input.targetRaySpace}).then(source=>{
        if(this.session&&this.hitSources.has(input))this.hitSources.set(input,{source});
        else source.cancel();
      }).catch(()=>this.hitSources.set(input,{error:true}));
    }
    this.hitByInput.clear();
    let chosen=null;
    for(const input of this.session.inputSources){
      const src=this.hitSources.get(input)?.source;if(!src)continue;
      try{
        for(const hit of frame.getHitTestResults(src)){
          const pose=hit.getPose(ref);if(!pose)continue;
          const m=pose.transform.matrix;
          const normal=[m[4],m[5],m[6]];
          if(!isValidHorizontalHit(normal))continue;
          const point=new THREE.Vector3(m[12],m[13],m[14]);
          const item={point,normal};
          this.hitByInput.set(input,item);chosen??=item;break;
        }
      }catch{/* Spatial sensing is best-effort. */}
    }
    this.latestHit=chosen;
    this.reticle.visible=!!chosen;
    if(chosen)this.reticle.position.copy(chosen.point).add(new THREE.Vector3(0,.012,0));
  }
  update(time,frame){
    if(!this.session)return;
    this.locatePanel();
    this.updateHitTesting(frame);
    if(this.drag){
      const d=this.drag;
      if(d.kind==='amp-slider'){
        const hit=this._menuHit(d.controller);
        if(hit?.intersection)this.setAmplificationFromX(hit.intersection.uv.x*W);
      }else{
        d.source.updateMatrixWorld();
        const p=new THREE.Vector3(),q=new THREE.Quaternion();
        d.source.getWorldPosition(p);d.source.getWorldQuaternion(q);
        if(d.kind==='rotate'){
          const relative=q.clone().multiply(d.startQ.clone().invert());
          d.object.quaternion.copy(relative.multiply(d.startObjectQ));
        } else {
          d.object.position.copy(d.startObjectPos).add(p.sub(d.startPos));
          if(d.kind==='move'&&this.contact.visible)this.contact.visible=false;
        }
      }
    }
    const dt=Math.min(.05,Math.max(0,(time-(this.lastFrameTime||time))/1000));
    this.lastFrameTime=time;
    let hovered=null;
    let forceHovered=false;
    for(const {controller,rayLine} of this.controllers){
      if(!controller.userData.xrInput)continue;
      const hit=this._menuHit(controller);
      hovered??=hit?.item?.id??null;
      if(!hit&&!this.drag&&!this.placeMode&&!forceHovered){
        if(this.app.sapVisuals?.view==='forces'){
          const selected=this.app.sapVisuals.inspectXRRay(this._ray(controller));
          if(selected)forceHovered=true;
        }else if(this.app.sapVisuals?.view==='reactions'){
          const selected=this.app.reactionVisuals?.inspectXRRay(this._ray(controller));
          if(selected)forceHovered=true;
        }
      }
      rayLine.scale.z=hit?.intersection?.distance||2.8;
      const source=controller.userData.xrInput;
      const resetPressed=!!source.gamepad?.buttons?.[4]?.pressed;
      if(resetPressed&&!this.buttonLatches.get(source))this.resetPanel();
      this.buttonLatches.set(source,resetPressed);
      const axes=source.gamepad?.axes;
      if(!axes||axes.length<2||this.drag)continue;
      const x=axes.length>3?axes[2]:axes[0],y=axes.length>3?axes[3]:axes[1];
      if(source.handedness==='left'){
        const q=new THREE.Quaternion();
        if(Math.abs(x)>.16){
          q.setFromAxisAngle(new THREE.Vector3(0,1,0),-x*dt*1.6);
          this.app.worldRoot.quaternion.premultiply(q);
        }
        if(Math.abs(y)>.16){
          q.setFromAxisAngle(new THREE.Vector3(1,0,0),y*dt*1.6);
          this.app.worldRoot.quaternion.premultiply(q);
        }
      }else if(source.handedness==='right'&&Math.abs(y)>.16){
        // Continuous scaling: rounding on every frame would swallow small
        // joystick increments, so quantize the label, not the actual size.
        const newSize=clamp(this.app.targetMeters-y*dt*1.3,0.4,5);
        if(Math.abs(newSize-this.app.targetMeters)>1e-6){
          this.app.targetMeters=newSize;this.app.updateScale();this.dirty=true;
          $('model-size').value=String(newSize);
          $('size-value').textContent=newSize.toFixed(1)+' m';
        }
      }
    }
    if(!forceHovered){this.app.sapVisuals?.hideXRHover();this.app.reactionVisuals?.hideXRHover();}
    if(hovered!==this.hoverId){this.hoverId=hovered;this.dirty=true;}
    if(this.moveMenu&&!this.drag){
      const ctrl=this.controllers.find(x=>x.controller.userData.xrInput)?.controller;
      if(ctrl){
        const ray=this._ray(ctrl).ray;
        this.panel.position.copy(ray.origin).addScaledVector(ray.direction,1.2);
        const camera=this.app.renderer.xr.getCamera();camera.getWorldQuaternion(this.panel.quaternion);
      }
    }
    if(this.dirty)this.repaint();
  }
}
function $(id){return document.getElementById(id);}
