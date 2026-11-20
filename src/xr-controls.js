import * as THREE from 'three';
import {clamp,rotateIndex,snapModelSize,isValidHorizontalHit,caseLabel,nextUniquePattern,
  amplificationFromSliderX,sliderXFromAmplification} from './xr-logic.mjs';
import {nextXRIFCOpacity} from './ifc-opacity.mjs';
import {formatAmplification} from './deformation-scale.mjs';
import {bucklingSummary} from './results.mjs';
import {isControlActive} from './view-controls.mjs';
import {FORCE_PALETTES,nextPalette} from './visual-palettes.mjs';
import {placeModelOnSurface,matchingTablePlane,tableFitSize} from './ar-placement.mjs';
import {BridgeRoomScan,applyBridgeGapPlacement} from './bridge-table-detection.mjs';
import {BRIDGE_SECTIONS} from './bridge-competition-solver.mjs';

// A real 3D UI: HTML overlays do not reliably appear in immersive WebXR.
// All model/result operations are routed to the same StructuralScene used on PC.
const W=768,H=1100;
const uiColour={bg:'#0a1c29',surface:'#163345',edge:'#467083',text:'#e8fbfc',muted:'#9fc7d4',accent:'#71f3dc',
  dim:'#55707c'};
function rounded(ctx,x,y,w,h,r,fill,stroke){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);
  if(fill){ctx.fillStyle=fill;ctx.fill();}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}
}
const textFit=(value,max=52)=>String(value??'').length>max?String(value).slice(0,max-1)+'…':String(value??'');

export class StructuralXRControls {
  constructor(app){
    this.app=app;this.page='main';this.hits=[];this.hoverId=null;this.selected='—';this.notice='';
    this.dirty=true;this.roomScan=new BridgeRoomScan();this.bridgeScan=false;this.bridgeScanStable=0;this.bridgeLastGap=null;this.drag=null;this.placeMode=false;this.moveMenu=false;this.shadow=false;this.hasPlacedSurface=false;this.hitAvailable=false;this.latestHit=null;this.hitObservation=null;
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
    // Diagnostic overlay: triangulated polygons supplied by WebXR plane detection.
    // This is NOT a full room mesh; no geometry is invented for unseen areas.
    this.scanOverlay=new THREE.Group();
    this.scanOverlay.visible=false;
    app.scene.add(this.scanOverlay);
    this.scanOverlayTick=0;this.scanPlaneMeshes=new Map();this.rawPlaneCount=0;this.planeApiAvailable=false;this.planeDiagnostics={polygon:0,pose:0,horizontal:0};
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
    this.page='main';this.dirty=true;this.roomScan.reset();this.bridgeScan=false;this.clearScanOverlay();this.placeMode=false;this.moveMenu=false;
    this.hitAvailable=this.app.xrMode!=='vr' &&
      typeof session.requestHitTestSource==='function' &&
      (!session.enabledFeatures||session.enabledFeatures.includes('hit-test'));
    this.app.worldRoot.quaternion.copy(this.baseQuat);
    this.app.worldRoot.position.copy(this.app.xrMode==='vr'?
      this.vrPosition:this.basePosition);
    this.contact.visible=false;this.hasPlacedSurface=false;
  }
  stop(){
    this.session=null;this.roomScan.reset();this.bridgeScan=false;this.clearScanOverlay();this.panel.visible=false;this.reticle.visible=false;
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
    this.clearScanOverlay();this.app.scene.remove(this.scanOverlay);
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
        this.app.worldRoot.quaternion.copy(this.baseQuat);
        const table=plane.table??null;
        if(table){
          const fitted=tableFitSize(this.app,table);
          if(fitted){
            this.app.targetMeters=fitted;this.app.updateScale();
            const slider=document.getElementById('model-size');
            if(slider)slider.value=String(fitted);
            const label=document.getElementById('size-value');
            if(label)label.textContent=fitted.toFixed(2)+' m';
          }
        }
        this.app.arAnchorPoint=plane.point.clone();
        placeModelOnSurface(this.app,plane.point);
        this.placeMode=false;this.reticle.visible=false;
        this.hasPlacedSurface=true;this.contact.visible=false;
        this.dirty=true;
        this.app.onXRMessage?.(table?
          'Modelo apoyado y ajustado al tamaño de la mesa.':
          'Modelo apoyado sobre la superficie detectada.');
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
    if(this.app.teachingAnalysis?.active&&!this.app.bridgeCompetition?.addMode){
      const ray=this._ray(controller);
      const section=this.app.teachingAnalysis.inspectForceXR(ray);
      if(section){
        this.app.teachingAnalysis.pinForce(section);
        this.selected='Barra '+section.frameId+' · '+section.component+
          ' '+section.value.toFixed(2)+' '+section.unit;
        this.dirty=true;return;
      }
      const reaction=this.app.teachingAnalysis.inspectReactionXR(ray);
      if(reaction){
        this.selected='Reacción '+reaction.node;
        this.dirty=true;return;
      }
    }
    if(this.app.bridgeCompetition?.active){
      const hit=this.app.bridgeCompetition.pick(this._ray(controller));
      if(hit){
        try{
          if(hit.kind==='node')this.app.bridgeCompetition.chooseNode(hit.id);
          else this.app.bridgeCompetition.chooseMember(hit.id);
          this.page='bridge';
          this.selected=(hit.kind==='node'?'Nodo ':'Elemento ')+hit.id;
        }catch(error){
          this.selected=error.message;
        }
        this.dirty=true;return;
      }
      // Do not rotate the bridge by grabbing a design member; the trigger
      // is reserved for placing rods/cables between grid nodes.
      return;
    }
    // In the teaching experience the controller selects nodes or members,
    // rather than grabbing the entire model. Loads are entered in the XR menu.
    if(this.app.trussExperience?.active){
      const hit=this.app.trussExperience.pick(this._ray(controller));
      if(hit){
        if(hit.kind==='node')this.app.trussExperience.selectNode(hit.id);
        else this.app.trussExperience.selectBar(hit.id);
        this.page='truss';
        this.selected=(hit.kind==='node'?'Nodo ':'Barra ')+hit.id;
        this.dirty=true;return;
      }
    }
    // A force-diagram click queries a section instead of rotating the structure.
    // The live hover also works without pressing the trigger.
    if(this.app.sapVisuals?.view==='forces'){
      const selected=this.app.sapVisuals.inspectXRRay(this._ray(controller));
      if(selected){
        this.app.sapVisuals.pinSection(selected);
        this.selected='Barra '+selected.frameId+' · '+selected.component+
          ' '+selected.value.toFixed(2)+' '+selected.unit;
        this.dirty=true;return;
      }
    }
    if(this.app.sapVisuals?.view==='deformation'){
      const node=this.app.nodeProbe?.inspectXRRay(this._ray(controller));
      if(node){
        this.app.nodeProbe.pin(node);
        this.selected='Nodo '+node.id+' · |u| '+(node.magnitude*1000).toFixed(3)+' mm';
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
    const teaching=this.app.teachingAnalysis?.active;
    const max=teaching?150:(this.app.ampMax??150);
    const step=teaching?1:(this.app.ampStep??1);
    const next=Number((Math.round(clamp(value,0,max)/step)*step).toFixed(2));
    const exp=teaching?(this.app.bridgeCompetition?.active?
      this.app.bridgeCompetition:this.app.trussExperience):null;
    const current=teaching?Math.round((exp?.ampFactor??1)*15):this.app.amp;
    if(next===current)return false;
    const input=$('amp');
    input.value=String(next);
    input.dispatchEvent(new Event('input'));
    this.dirty=true;
    return true;
  }
  setAmplificationFromX(x){
    return this.setAmplification(amplificationFromSliderX(x,163,604,
      this.app.teachingAnalysis?.active?150:(this.app.ampMax??150)));
  }
  _buttons(){
    const c=this.ctx;
    // A disabled button is drawn dimmed and registers no hit area.
    const btn=(id,label,x,y,w,h,accent=false,enabled=true)=>{
      if(enabled)this.hits.push({id,x,y,w,h});
      const active=enabled&&id===this.hoverId;
      rounded(c,x,y,w,h,13,!enabled?'#112633':active?'#356c76':accent?'#1f6670':uiColour.surface,
        active?'#90ffdc':enabled?uiColour.edge:'#253c49');
      c.fillStyle=enabled?'#f0fcff':uiColour.dim;c.font=(accent?'bold 24px':'22px')+' system-ui';
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
      btn('placement',app.bridgeCompetition?.active&&app.xrMode==='ar'?
        'ESCANEO DE SALA · DOS MESAS':
        app.xrMode==='vr'?'MOVER MODELO EN VR':'COLOCACIÓN EN LA SALA',
        38,469,692,91);
      txt('Tamaño del modelo en '+(app.xrMode==='vr'?'VR':'realidad mixta'),38,614,21);
      btn('size:-','−',38,645,144,78);
      txt(app.targetMeters.toFixed(1)+' m',385,684,29,'#f3ffff','center');
      btn('size:+','+',586,645,144,78);
      btn('reset-model','Recentrar estructura',38,769,335,76);
      btn('menu-move',this.moveMenu?'Gatillo: fijar menú':'Mover menú',395,769,335,76,true);
      txt('CAMBIAR MODELO',38,846,18,'#afcdd7');
      btn('demo-frame','EDIFICIO · 3 PLANTAS',38,867,335,60);
      btn('demo-roof','NAVE INDUSTRIAL',395,867,335,60);
      btn('teaching-menu','RECURSOS DOCENTES · ELEGIR EXPERIENCIA',38,941,692,61,true);
      btn('exit',app.xrMode==='vr'?'SALIR DE REALIDAD VIRTUAL':'SALIR DE REALIDAD MIXTA',38,1016,692,65);
    }else if(this.page==='teaching'){
      btn('back','‹ Volver',38,117,230,66);
      txt('RECURSOS DOCENTES',38,236,31,'#e4f8ff');
      txt('ELIGE UNA EXPERIENCIA',38,311,20,'#b6dbe2');
      btn('truss-open','01 · CÁLCULO DE CELOSÍAS',38,365,692,123,true);
      txt('Aplica cargas nodales y consulta los resultados matriciales.',
        38,528,20,'#a8d4d9');
      btn('bridge-open','02 · CONCURSO DE PASARELAS',38,624,692,123,true);
      txt('Diseña una estructura ligera que salve el hueco entre mesas.',
        38,781,20,'#a8d4d9');
      txt('Ambas experiencias funcionan con los mandos.',
        38,957,19,'#b0d5d8');
    }else if(this.page==='bridge'){
      const bridge=app.bridgeCompetition;
      btn('back','‹ Volver',38,117,230,66);
      txt('CONCURSO DOCENTE · PASARELA',38,218,29,'#e4f8ff');
      if(!bridge?.active){
        txt('Inicia el reto para construir sobre la retícula.',38,335,22);
        btn('bridge-open','ABRIR CONCURSO',38,453,692,92,true);
      }else{
        const keys=Object.keys(BRIDGE_SECTIONS),section=BRIDGE_SECTIONS[bridge.sectionId];
        txt('SECCIÓN · '+section.label.toUpperCase(),38,279,19);
        btn('bridge-section:-','‹',38,307,138,68);
        txt((section.A_m2*1e6).toFixed(0)+' mm²',385,342,27,'#ecfdff','center');
        btn('bridge-section:+','›',592,307,138,68);
        txt(app.xrMode==='ar'&&this.bridgeScan?
          'ESCANEANDO LA SALA · MIRA AMBAS MESAS':
          'GATILLO EN DOS NODOS PARA AÑADIR UNA BARRA',38,413,19);
        btn('bridge-edit',bridge.addMode?
          (bridge.startNode?'ELIGE SEGUNDO NODO':'ELIGE PRIMER NODO'):'AÑADIR ELEMENTO',
          38,448,330,69,true);
        btn('bridge-remove-mode',bridge.removeMode?'BORRAR: ACTIVO':'MODO BORRAR',
          400,448,330,69);
        txt('CARGA CENTRAL: '+bridge.load_kN.toFixed(1)+' kN',38,570,22);
        btn('bridge-load:-','− 0,5 kN',38,598,185,75);
        btn('bridge-load:+','+ 0,5 kN',542,598,188,75);
        txt(app.xrMode==='ar'&&this.bridgeScan?
          'ESCANEO: '+this.roomScan.status().surfaces+' superficies detectadas':
          'VANO: '+bridge.span_m.toFixed(2)+' m · '+bridge.members.length+' elementos',
          38,725,22,'#b1dfe0');
        btn('bridge-scan',this.bridgeScan?'REINICIAR ESCANEO DE LA SALA': 'ESCANEAR DOS MESAS',38,750,692,70,true,
          app.xrMode==='ar');
        btn('bridge-evaluate','COMPROBAR',38,833,430,78,true);
        btn('bridge-reference',bridge.undeformedView?'VER DEFORMADA':'SIN DEFORMAR',
          480,833,250,78,false,Boolean(bridge.result));
        btn('bridge-sample','EJEMPLO',38,925,335,65);
        btn('bridge-clear','VACIAR',395,925,335,65);
        const state=bridge.result;
        txt('LEYENDA · N: naranja tracción · azul compresión · rojo fallo',
          38,1013,16,'#a4d6de');
        txt(state?
          'Uso '+(state.maxUtilization==null?'—':(state.maxUtilization*100).toFixed(1)+' %')+
          ' · Flecha '+(state.maxDeflection_mm==null?'—':state.maxDeflection_mm.toFixed(2))+' mm · Peso '+(state.totalMass_kg==null?'—':state.totalMass_kg.toFixed(2))+' kg':
          'Sin comprobar · colores y deformada ilustrativa',
          38,1053,18,state?.status==='stable'?'#8fedc9':'#ffce9d');
      }
    }else if(this.page==='truss'){
      const lesson=app.trussExperience;
      btn('back','‹ Volver',38,117,230,66);
      txt('RECURSOS DOCENTES · CELOSÍAS',38,221,29,'#e4f8ff');
      if(!lesson?.active){
        txt('Abre primero la experiencia.',38,340,23);
        btn('truss-open','ABRIR CELOSÍA',38,440,692,94,true);
      }else{
        const node=lesson.selectedNode,load=lesson.getLoad();
        txt('SELECCIONA UN NODO (O APUNTA CON EL GATILLO)',38,294,18);
        btn('truss-node:-','‹',38,326,130,77);
        txt('NODO '+node,384,365,30,'#f5d899','center');
        btn('truss-node:+','›',600,326,130,77);
        txt('CARGA HORIZONTAL Fx (kN)',38,464,21);
        btn('truss-fx:-','− 5 kN',38,497,188,78);
        txt((load.fx_kN>0?'+':'')+load.fx_kN.toFixed(1),384,537,29,'#edffff','center');
        btn('truss-fx:+','+ 5 kN',542,497,188,78);
        txt('CARGA VERTICAL Fz (kN) · POSITIVO HACIA ARRIBA',38,621,18);
        btn('truss-fz:-','− 5 kN',38,660,188,78);
        txt((load.fz_kN>0?'+':'')+load.fz_kN.toFixed(1),384,699,29,'#edffff','center');
        btn('truss-fz:+','+ 5 kN',542,660,188,78);
        const modeName={axial:'ESFUERZO AXIAL',stress:'TENSIÓN NORMAL',
          strain:'DEFORMACIÓN UNITARIA',displacement:'DESPLAZAMIENTOS'};
        btn('truss-mode','REPRESENTAR: '+modeName[lesson.mode],38,778,692,74,true);
        const member=lesson.model.bars.find(b=>b.id===lesson.selectedBarId);
        txt(member?'ÁREA '+member.id+': '+((member.A_m2??lesson.model.A_m2)*1e6).toFixed(0)+' mm²':
          'SEÑALA UNA BARRA PARA EDITAR SU SECCIÓN',38,870,19,'#c6ebec');
        btn('truss-area:-','− ÁREA',38,890,210,58,false,Boolean(member));
        btn('truss-area:+','+ ÁREA',265,890,210,58,false,Boolean(member));
        btn('truss-labels',lesson.showAxialLabels?'AXILES: SÍ':'AXILES: NO',
          492,890,238,58);
        btn('truss-amp:-','− DEFORMADA',38,957,210,52);
        txt('×'+lesson.ampFactor.toFixed(1),385,985,23,'#e9ffff','center');
        btn('truss-amp:+','+ DEFORMADA',520,957,210,52);
        btn('truss-reset','RESTAURAR',38,1017,333,48);
        btn('truss-clear','QUITAR CARGAS',396,1017,334,48);
      }
    }else if(this.page==='results'){
      // Controls that do not apply to the active view are drawn frozen,
      // as in the desktop panel (see view-controls.mjs).
      const teaching=Boolean(app.teachingAnalysis?.active);
      const view=teaching?($('analysis-view')?.value||'forces'):
        (app.sapVisuals?.view||'deformation');
      const on=control=>teaching?
        (control==='amplification'&&view==='deformation'):
        isControlActive(view,control);
      btn('back','‹ Volver',38,117,230,66);
      txt('RESULTADOS ESTRUCTURALES',38,225,28,'#e6f6fc');
      txt('Caso / combinación',38,283,22,on('case')?uiColour.muted:uiColour.dim);
      btn('case:-','‹',38,321,126,70,false,on('case'));
      txt(textFit(app.caseName||'Sin casos',37),385,356,23,on('case')?'#edffff':uiColour.dim,'center');
      btn('case:+','›',606,321,124,70,false,on('case'));
      txt('Patrón de cargas',38,438,22,on('pattern')?uiColour.muted:uiColour.dim);
      btn('pattern:-','‹',38,473,126,68,false,on('pattern'));
      txt(textFit(app.pattern==='all'?'Todos':app.pattern,28),385,506,23,on('pattern')?'#edffff':uiColour.dim,'center');
      btn('pattern:+','›',606,473,124,68,false,on('pattern'));
      if(on('mode')){
        // Vibration and buckling shapes have their own display amplitude.
        txt(view==='buckling'?'AMPLITUD DE LA FORMA DE PANDEO':'AMPLITUD DE VIBRACIÓN',38,584,21);
        btn('shape-amp:-','−',38,622,126,75);
        txt(Number(app.sapVisuals?.modalAmplitude??0).toFixed(2)+' m',385,660,29,'#8bf6df','center');
        btn('shape-amp:+','+',606,622,124,75);
        txt('Solo cambia la representación, no los resultados.',38,713,18,'#a2c6d1');
      }else{
        const enabled=on('amplification');
        txt('AMPLIFICACIÓN DE LA DEFORMADA',38,584,21,enabled?uiColour.muted:uiColour.dim);
        const ampDisplay=teaching?
          Math.round(((app.bridgeCompetition?.active?
            app.bridgeCompetition:app.trussExperience)?.ampFactor??1)*15):
          app.amp;
        txt(teaching?'×'+(ampDisplay/15).toFixed(1):
          formatAmplification(ampDisplay),712,584,29,
          enabled?'#8bf6df':uiColour.dim,'right');
        const left=163,right=604,y=660;
        rounded(c,left-7,y-8,right-left+14,16,8,'#254859');
        const x=sliderXFromAmplification(ampDisplay,163,604,
          teaching?150:(app.ampMax??150));
        rounded(c,left-7,y-8,Math.max(10,x-left+7),16,8,enabled?'#45c6ae':'#2b4651');
        c.beginPath();c.arc(x,y,21,0,Math.PI*2);c.fillStyle=enabled?'#e8ffff':'#4a626d';c.fill();
        c.strokeStyle=enabled?'#72eed9':'#38525d';c.lineWidth=4;c.stroke();
        if(enabled)this.hits.push({id:'amp-slider',x:153,y:619,w:461,h:82});
        btn('amp:-','−',38,622,102,75,false,enabled);
        btn('amp:+','+',629,622,101,75,false,enabled);
        txt('×0',157,713,18,enabled?'#a2c6d1':uiColour.dim);
        txt(teaching?'×10':formatAmplification(app.ampMax??150),
          613,713,18,enabled?'#a2c6d1':uiColour.dim,'right');
      }
      const viewLabel={deformation:'Deformadas y cargas',forces:'Diagramas de esfuerzos',
        reactions:'Reacciones en apoyos',modes:'Modos de vibración',buckling:'Modos de pandeo'};
      btn('view:next','VISTA: '+viewLabel[view],38,756,692,73,true);
      const buckled=(app.results?.bucklingModes||[])[app.sapVisuals?.modeIndex||0];
      const detail=view==='forces'?'Esfuerzo: '+(teaching?
        app.teachingForceRenderer?.component:app.sapVisuals?.component||'M3'):
        view==='buckling'?'Pandeo '+(buckled?.number??'—')+' · '+(bucklingSummary(buckled)?.label??'—'):
        view==='modes'?'Modo '+((app.results?.modes||[])[app.sapVisuals?.modeIndex||0]?.number??'—')+
          ' · '+Number((app.results?.modes||[])[app.sapVisuals?.modeIndex||0]?.frequency_hz||0).toFixed(2)+' Hz':
          'Patrón: '+(app.pattern==='all'?'Todos':app.pattern);
      if(view==='reactions'){
        const summary=teaching?app.teachingReactionRenderer?.lastSummary:
          app.reactionVisuals?.lastSummary;
        const z=summary?.force?.[2];
        txt('Reacción vertical total: '+(Number.isFinite(z)?z.toFixed(3)+' kN':'—'),
          385,881,23,'#a6eeea','center');
        btn('reaction-values','VALORES: '+((teaching?
          app.teachingReactionRenderer:app.reactionVisuals)?.showValues?'SÍ':'NO'),
          38,932,334,77,true);
        btn('sap-only',app.showSAPOnly?'IFC: OCULTO':'IFC: VISIBLE',
          394,932,336,77);
        txt('Apunta a un apoyo para consultar sus fuerzas y momentos.',
          38,1052,17,'#9ce6d9');
      }else{
        btn('detail:-','‹',38,847,126,69);
        txt(textFit(detail,37),385,881,23,'#edffff','center');
        btn('detail:+','›',606,847,124,69);
      if(view==='forces'){
        btn('force-values','ETIQUETAS: '+((teaching?
          app.teachingForceRenderer:app.sapVisuals)?.showCharacteristics?'SÍ':'NO'),
          38,932,334,77,true);
        btn('sap-only',app.showSAPOnly?'IFC: OCULTO':'IFC: VISIBLE',
          394,932,336,77);
        txt('Apunta al diagrama para consultar el esfuerzo en esa sección.',
          38,1052,17,'#9ce6d9');
      }else{
        btn('sap-only',app.showSAPOnly?'MOSTRAR MODELO BIM':'VER SOLO ESTRUCTURA',
          38,932,692,77,true);
        txt(view==='deformation'?
          'Apunta a un nodo: consulta Ux, Uy, Uz y desplazamiento total.':
          'La escala solo afecta a la representación.',38,1052,18);
      }
      }
    }else if(this.page==='layers'){
      btn('back','‹ Volver',38,117,230,66);
      txt('CAPAS / VISUALIZACIÓN',38,224,28,'#e1f7fc');
      btn('sap-only',app.showSAPOnly?'Mostrar modelo BIM':'Solo modelo de cálculo',
        38,277,692,66,true);
      btn('terrain',app.hideGround?'Terreno: OCULTO':'Terreno: VISIBLE',38,349,692,66);
      btn('original','IFC: '+(app.showOriginal?'VISIBLE':'OCULTO'),38,421,692,66);
      btn('deformed','Deformada: '+(app.showDeformed?'visible':'oculta'),38,493,692,66);
      btn('loads','Cargas: '+(app.showLoads?'visibles':'ocultas'),38,565,692,66);
      btn('frames','Barras: '+(app.showFrames?'visibles':'ocultas'),38,637,692,66);
      btn('supports','Apoyos 3D: '+(app.showSupports?'visibles':'ocultos'),38,709,692,66);
      btn('axes','Ejes: '+(app.showAxes?'visibles':'ocultos'),38,781,692,66);
      btn('ifc-opacity-scope','Transparencia: '+
        (app.ifcOpacityScope==='all'?'TODO EL IFC':'ENVOLVENTE'),38,853,692,66);
      btn('ifc-opacity-step','Opacidad IFC: '+Math.round(app.ifcOpacity*100)+
        '%  ·  siguiente nivel',38,925,692,66,true);
      btn('palette:results','ESCALA DE RESULTADOS: '+
        (FORCE_PALETTES[app.sapVisuals?.palette]?.label??'Clásica'),
        38,998,692,67,true);
    }else if(this.page==='placement' && app.xrMode==='vr'){
      btn('back','‹ Volver',38,117,230,66);
      txt('ESTUDIO VIRTUAL · VR',38,219,29,'#e4f8ff');
      txt('Gatillo sobre estructura: selecciona y gira',38,294,22,'#a0e1e9');
      txt('Grip: desplaza el modelo en el espacio',38,354,22,'#a0e1e9');
      txt(app.trussExperience?.active?'Joystick izquierdo: desplazarse':'Joystick izquierdo: rota la estructura',38,414,22,'#a0e1e9');
      txt('Joystick derecho: ajusta tamaño',38,474,22,'#a0e1e9');
      btn('reset-model','Recentrar modelo enfrente de ti',38,575,692,90,true);
      btn('results','Consultar cargas, esfuerzos y modos',38,709,692,90);
      txt('Explora el modelo en una sala virtual inmersiva.',38,893,20);
      btn('exit','SALIR DE REALIDAD VIRTUAL',38,978,692,78);
    }else if(this.page==='placement'&&app.bridgeCompetition?.active&&app.xrMode==='ar'){
      btn('back','‹ Volver',38,117,230,66);
      txt('CONCURSO · ESCANEO DE LA SALA',38,220,27,'#e4f8ff');
      txt(this.bridgeScan?'ESCANEANDO LA SALA…':'ESCANEO EN ESPERA',38,310,27,
        this.bridgeScan?'#86f7d9':'#ffce9d');
      const scan=this.roomScan.status();
      txt('Máximo de planos WebXR: '+this.rawPlaneCount,38,389,23);
      txt('Superficies compatibles: '+scan.surfaces,38,429,21);
      txt('Mallas acumuladas: '+this.planeDiagnostics.polygon+
        ' · con posición: '+this.planeDiagnostics.pose+
        ' · horizontales: '+this.planeDiagnostics.horizontal,38,468,18);
      txt(scan.candidate?'Dos mesas candidatas · comprobando vano':
        'Mira lentamente las dos mesas y sus bordes.',38,515,20);
      txt(!this.planeApiAvailable?
        'WebXR no expone detectedPlanes en esta sesión.':
        this.rawPlaneCount===0?'API disponible, pero no devuelve planos.':
        'API activa: comprobando geometría y dimensiones.',38,577,19,'#ffce9d');
      btn('bridge-scan','REINICIAR ESCANEO',38,640,692,90,true);
      btn('bridge-menu','VOLVER AL CONCURSO',38,755,692,82);
      txt('La retícula se colocará entre las mesas al detectar el vano.',
        38,895,19);
    }else if(this.page==='placement'){
      btn('back','‹ Volver',38,117,230,66);
      txt('COLOCACIÓN EN EL ENTORNO',38,220,28,'#e4f8ff');
      btn('place',this.placeMode?'Cancelar detección':'Detectar mesa / suelo',
        38,306,692,92,true);
      txt(this.hitAvailable?'Detección de superficies disponible':
        'Detección de superficies no disponible',38,442,20,
        this.hitAvailable?'#86f7d9':'#ffb7a5');
      txt(this.latestHit&&this.placeMode?'Anillo verde visible: gatillo para colocar':
        'Apunta al plano y confirma con el gatillo.',38,497,20);
      btn('reset-model','Recentrar modelo',38,590,692,82);
      txt('La superficie detectada define la altura real del modelo.',38,738,19);
      txt('En mesas detectadas, el tamaño se ajusta automáticamente.',38,821,19);
      txt('Ajusta la posición y el tamaño con los mandos.',38,903,21);
      txt('Carga los modelos desde el navegador antes de entrar.',38,977,19);
    }
    this.texture.needsUpdate=true;this.dirty=false;
  }
  syncControl(id,checked){
    const el=document.getElementById(id);
    if(el){el.checked=checked;el.dispatchEvent(new Event('change'));}
  }
  command(id){
    const app=this.app;
    if(id==='back'){
      this.page=['bridge','truss'].includes(this.page)?'teaching':'main';
    }
    else if(['results','layers','placement'].includes(id))this.page=id;
    else if(id==='teaching-menu')this.page='teaching';
    else if(id==='bridge-menu')this.page='bridge';
    else if(id==='exit'){this.session?.end();return;}
    else if(id==='bridge-open'){
      document.getElementById('bridge-start')?.click();
      this.page=app.xrMode==='ar'?'placement':'bridge';
      this.selected='Concurso de pasarelas';
      // In mixed reality, begin looking for two tabletops as soon as the
      // competition opens. The manual scan button remains available to retry.
      if(app.xrMode==='ar'){
        this.roomScan.reset();this.clearScanOverlay();this.bridgeScan=true;
        this.bridgeScanStable=0;
        this.bridgeLastGap=null;
        this.notice='Buscando automáticamente dos mesas enfrentadas…';
      }
    }
    else if(id.startsWith('bridge-')){
      const bridge=app.bridgeCompetition;
      if(!bridge?.active){this.notice='Abre primero el concurso.';}
      else if(id==='bridge-section:+'||id==='bridge-section:-'){
        const keys=Object.keys(BRIDGE_SECTIONS);
        const i=keys.indexOf(bridge.sectionId);
        bridge.setSection(keys[(i+(id.endsWith(':+')?1:-1)+keys.length)%keys.length]);
        const el=$('bridge-section');
        if(el)el.value=bridge.sectionId;
      }else if(id==='bridge-load:+'||id==='bridge-load:-'){
        bridge.setLoad(Math.max(0,Math.min(50,bridge.load_kN+(id.endsWith(':+')?.5:-.5))));
      }else if(id==='bridge-edit'){
        if(bridge.addMode)bridge.cancelAdd();
        else bridge.beginAdd();
      }else if(id==='bridge-remove-mode'){
        bridge.removeMode=!bridge.removeMode;
        if(bridge.removeMode)bridge.editMode=false;
        bridge.startNode=null;bridge.draw();
      }else if(id==='bridge-scan'){
        if(app.xrMode!=='ar')this.notice='La detección de mesas requiere Quest RM.';
        else {
          this.roomScan.reset();this.bridgeScan=true;this.bridgeScanStable=0;this.bridgeLastGap=null;
          this.notice='Busca dos mesas horizontales y enfrentadas.';
        }
      }else if(id==='bridge-evaluate'){
        const r=bridge.evaluate();
        this.selected=r.status==='stable'?'APTA · Peso '+r.totalMass_kg.toFixed(2)+' kg':
          'NO RESISTE · '+r.reason;
      }else if(id==='bridge-reference'){
        if(bridge.result){
          bridge.setUndeformedView(!bridge.undeformedView);
          this.selected=bridge.undeformedView?'Geometría sin deformar':
            'Deformada calculada';
        }
      }else if(id==='bridge-sample')bridge.sample();
      else if(id==='bridge-clear')bridge.reset();
    }
    else if(id==='truss-open'){
      document.getElementById('truss-start')?.click();
      this.page='truss';
      this.selected='Celosía interactiva';
    }
    else if(id.startsWith('truss-')){
      const lesson=app.trussExperience;
      if(!lesson?.active){this.notice='Abre la experiencia de celosías.';}
      else if(id==='truss-node:-'||id==='truss-node:+'){
        lesson.changeNode(id.endsWith(':+')?1:-1);
        this.selected='Nodo '+lesson.selectedNode;
      }else if(id==='truss-fx:-'||id==='truss-fx:+'){
        lesson.adjustSelected('x',id.endsWith(':+')?5:-5);
        this.selected='Carga horizontal actualizada';
      }else if(id==='truss-fz:-'||id==='truss-fz:+'){
        lesson.adjustSelected('z',id.endsWith(':+')?5:-5);
        this.selected='Carga vertical actualizada';
      }else if(id==='truss-area:+'||id==='truss-area:-'){
        try{
          lesson.adjustMemberArea(lesson.selectedBarId,id.endsWith(':+')?250:-250);
          this.selected='Área de '+lesson.selectedBarId+' modificada';
        }catch(error){this.notice=error.message;}
      }else if(id==='truss-amp:+'||id==='truss-amp:-'){
        lesson.setAmplification(clamp(lesson.ampFactor+(id.endsWith(':+')?.25:-.25),0,10));
      }else if(id==='truss-labels'){
        lesson.setAxialLabels(!lesson.showAxialLabels);
      }else if(id==='truss-reset'){lesson.reset();this.selected='Cargas iniciales';}
      else if(id==='truss-clear'){lesson.clearLoads();this.selected='Sin cargas';}
      else if(id==='truss-mode'){
        const modes=['axial','stress','strain','displacement'];
        const next=modes[(modes.indexOf(lesson.mode)+1)%modes.length];
        lesson.setMode(next);
      }
    }
    else if(id==='demo-frame'||id==='demo-roof'){
      const button=$((id==='demo-roof')?'roof-demo-btn':'demo-btn');
      button?.click();
      this.selected='—';
      this.notice='Modelo docente y resultados matriciales cargados.';
      this.dirty=true;
    }
    else if(id==='menu-move'){
      this.moveMenu=!this.moveMenu;
      // The first click only arms placement; the following click pins the panel.
    }
    else if(id==='reset-model'){
      app.worldRoot.position.copy(app.xrMode==='vr'?this.vrPosition:this.basePosition);
      app.worldRoot.quaternion.copy(this.baseQuat);
      this.contact.visible=false;this.hasPlacedSurface=false;app.arAnchorPoint=null;
    }
    else if(id==='sap-only'){
      const desired=!app.showSAPOnly;
      this.syncControl('show-sap-only',desired);
      this.notice=app.showSAPOnly===desired?
        (desired?'Solo estructura visible.':'Modelo BIM visible.') :
        'Carga un modelo con sus resultados antes de activar esta vista.';
    }
    else if(id==='palette:results'){
      if(app.sapVisuals?.view==='reactions'){
        this.notice='Las reacciones se distinguen por eje XYZ.';
      }else{
        const select=$('result-palette');
        if(select){
          select.value=nextPalette(FORCE_PALETTES,select.value);
          select.dispatchEvent(new Event('change'));
        }
      }
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
      const label=$('size-value');if(label)label.textContent=app.targetMeters.toFixed(2)+' m';
    }
    else if(id==='case:+'||id==='case:-'){
      const cases=app.results?.cases||[];
      if(cases.length){
        const i=cases.findIndex(c=>c.name===app.caseName);
        const next=cases[rotateIndex(Math.max(0,i),id==='case:+'?1:-1,cases.length)].name;
        $('case-select').value=next;$('case-select').dispatchEvent(new Event('change'));
      }
    }
    else if(id==='view:next'){
      const teaching=Boolean(app.teachingAnalysis?.active);
      const choices=teaching?[...$('analysis-view').options].map(o=>o.value):
        ['deformation','forces','reactions','modes','buckling'];
      const active=teaching?$('analysis-view').value:
        (app.sapVisuals?.view||'deformation');
      const next=choices[(choices.indexOf(active)+1)%choices.length];
      const el=$('analysis-view');if(el){el.value=next;el.dispatchEvent(new Event('change'));}
    }
    else if(id==='detail:+'||id==='detail:-'){
      const step=id==='detail:+'?1:-1;
      const teaching=Boolean(app.teachingAnalysis?.active);
      const kind=teaching?$('analysis-view').value:(app.sapVisuals?.view||'deformation');
      if(kind==='forces'){
        const options=teaching?[...$('force-component').options]
          .filter(o=>!o.disabled).map(o=>o.value):['P','V2','V3','T','M2','M3'];
        const i=options.indexOf(teaching?app.teachingForceRenderer?.component:
          app.sapVisuals.component);
        const selected=options[rotateIndex(Math.max(0,i),step,options.length)];
        $('force-component').value=selected;$('force-component').dispatchEvent(new Event('change'));
      }else if(kind==='modes'||kind==='buckling'){
        const n=app.sapVisuals.activeModes().length;
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
    else if(id==='shape-amp:+'||id==='shape-amp:-'){
      // Same slider as the desktop panel; 0.1 m steps stay on its 0.02 m grid.
      const input=$('modal-amplitude');
      if(input){
        const next=clamp(Number(input.value)+(id==='shape-amp:+'?.1:-.1),Number(input.min)||0,Number(input.max)||1);
        input.value=String(Math.round(next*100)/100);
        input.dispatchEvent(new Event('input'));
      }
    }
    else if(id==='amp:+'||id==='amp:-'){
      const teaching=Boolean(app.teachingAnalysis?.active);
      const activeExperience=app.bridgeCompetition?.active?
        app.bridgeCompetition:app.trussExperience;
      const current=teaching?Math.round((activeExperience?.ampFactor??1)*15):app.amp;
      const delta=teaching?3:Math.max(this.app.ampStep??1,
        (this.app.ampMax??150)/80);
      this.setAmplification(current+(id==='amp:+'?delta:-delta));
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
      this.latestHit=null;this.hitObservation=null;this.reticle.visible=false;
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
          const item={point,normal,table:matchingTablePlane(frame,ref,point)};
          this.hitByInput.set(input,item);chosen??=item;break;
        }
      }catch{/* Spatial sensing is best-effort. */}
    }
    if(chosen){
      const previous=this.hitObservation;
      const close=previous&&previous.point.distanceTo(chosen.point)<.07;
      this.hitObservation={point:chosen.point.clone(),count:close?previous.count+1:1};
    }else this.hitObservation=null;
    const stable=Boolean(chosen&&this.hitObservation?.count>=3);
    this.latestHit=stable?chosen:null;
    if(!stable)this.hitByInput.clear();
    this.reticle.visible=stable;
    if(stable)this.reticle.position.copy(chosen.point).add(new THREE.Vector3(0,.012,0));
  }
  clearScanOverlay(){
    for(const obj of this.scanOverlay.children.slice()){
      this.scanOverlay.remove(obj);
      obj.geometry?.dispose();
      obj.material?.dispose();
    }
    this.scanPlaneMeshes.clear();
    this.scanOverlay.visible=false;
    this.scanOverlayTick=0;
    this.rawPlaneCount=0;
    this.planeDiagnostics={polygon:0,pose:0,horizontal:0};
  }
  paintScanPlanes(frame,ref){
    if(!this.bridgeScan||!frame?.detectedPlanes||!ref)return;
    if(++this.scanOverlayTick%6!==0)return;
    const diagnostics={...this.planeDiagnostics};
    for(const plane of frame.detectedPlanes){
      if(!plane.polygon||plane.polygon.length<3||!plane.planeSpace)continue;
      let pose;
      try{pose=frame.getPose(plane.planeSpace,ref);}catch{continue;}
      if(!pose?.transform?.matrix)continue;
      const transform=new THREE.Matrix4().fromArray(pose.transform.matrix);
      const normal=new THREE.Vector3(0,1,0).transformDirection(transform);
      const horizontal=Math.abs(normal.y)>.88;
      let mesh=this.scanPlaneMeshes.get(plane);
      if(!mesh){
        const vertices=Array.from(plane.polygon,p=>new THREE.Vector3(p.x,p.y,p.z));
        const indices=[];
        for(let i=1;i<vertices.length-1;i++)indices.push(0,i,i+1);
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(
          vertices.flatMap(v=>v.toArray()),3));
        geometry.setIndex(indices);
        const material=new THREE.MeshBasicMaterial({
          color:horizontal?0x46eac4:0x6ca6e8,
          transparent:true,opacity:.45,wireframe:true,
          side:THREE.DoubleSide,depthTest:false,depthWrite:false
        });
        mesh=new THREE.Mesh(geometry,material);
        mesh.matrixAutoUpdate=false;
        mesh.renderOrder=18000;
        this.scanOverlay.add(mesh);
        this.scanPlaneMeshes.set(plane,mesh);
      }
      mesh.matrix.copy(transform);
      mesh.matrixWorldNeedsUpdate=true;
    }
    diagnostics.polygon=this.scanPlaneMeshes.size;
    diagnostics.pose=this.scanPlaneMeshes.size;
    diagnostics.horizontal=[...this.scanPlaneMeshes.values()]
      .filter(mesh=>mesh.material.color.getHex()===0x46eac4).length;
    this.planeDiagnostics=diagnostics;
    this.scanOverlay.visible=true;
    this.dirty=true;
  }
  updateBridgeScan(frame){
    if(!this.bridgeScan||!this.app.bridgeCompetition?.active||
      this.app.xrMode!=='ar'||!frame)return;
    const ref=this.app.renderer.xr.getReferenceSpace();
    this.planeApiAvailable=frame.detectedPlanes!=null;
    this.rawPlaneCount=Math.max(this.rawPlaneCount,frame.detectedPlanes?.size??0);
    this.paintScanPlanes(frame,ref);
    const scan=this.roomScan.observe(frame,ref);
    if(scan.frames%30===0){
      this.notice=!frame.detectedPlanes?'Quest Browser no proporciona planos de la sala':scan.candidate?
        'Mesas candidatas: '+scan.surfaces+' superficies · estabilizando medición':
        'Escaneando sala: '+scan.surfaces+' superficies · mira ambas mesas';
      this.dirty=true;
    }
    if(!scan.gap)return;
    const gap=scan.gap;
    this.bridgeScan=false;
    this.clearScanOverlay();
    const measured=applyBridgeGapPlacement(this.app,gap,this.app.bridgeCompetition);
    const input=document.getElementById('bridge-span');
    if(input)input.value=String(Number(measured.toFixed(3)));
    const feedback=document.getElementById('bridge-detection-status');
    if(feedback)feedback.textContent='Dos mesas detectadas. Vano '+measured.toFixed(2)+
      ' m. La pasarela se ha colocado entre sus bordes.';
    this.selected='Vano detectado · '+measured.toFixed(2)+' m';
    this.notice='Escaneo completado. Vano '+measured.toFixed(2)+' m.';
    this.page='bridge';
    this.dirty=true;
  }
  update(time,frame){
    if(!this.session)return;
    this.locatePanel();
    this.updateHitTesting(frame);
    this.updateBridgeScan(frame);
    // Update the bridge's collision plane from actual detected floor
    // surfaces on every Quest AR frame, not only during initial table scan.
    if(this.app.xrMode==='ar'&&this.app.bridgeCompetition?.active&&frame){
      const ref=this.app.renderer.xr.getReferenceSpace();
      this.app.bridgeCompetition.observeFloor(frame,ref);
    }
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
        if(this.app.teachingAnalysis?.active&&!this.app.bridgeCompetition?.addMode){
          const ray=this._ray(controller);
          const section=this.app.teachingAnalysis.inspectForceXR(ray);
          const reaction=section?null:this.app.teachingAnalysis.inspectReactionXR(ray);
          if(section||reaction){
            forceHovered=true;
            const label=section?
              'Barra '+section.frameId+' · '+section.component+
                ' '+section.value.toFixed(2)+' '+section.unit:
              'Reacción '+reaction.node;
            if(this.selected!==label){this.selected=label;this.dirty=true;}
          }
        }
        if(!forceHovered&&this.app.bridgeCompetition?.active){
          this.app.bridgeCompetition.updatePreviewRay(this._ray(controller));
          const picked=this.app.bridgeCompetition.pick(this._ray(controller));
          if(picked){
            forceHovered=true;
            const label=(picked.kind==='node'?'Nodo ':'Barra ')+picked.id;
            if(this.selected!==label){this.selected=label;this.dirty=true;}
          }
        }else if(!forceHovered&&this.app.trussExperience?.active){
          const selected=this.app.trussExperience.pick(this._ray(controller));
          if(selected){
            forceHovered=true;
            const label=(selected.kind==='node'?'Nodo ':'Barra ')+selected.id;
            if(this.selected!==label){this.selected=label;this.dirty=true;}
          }
        }else if(this.app.sapVisuals?.view==='forces'){
          const selected=this.app.sapVisuals.inspectXRRay(this._ray(controller));
          if(selected)forceHovered=true;
        }else if(this.app.sapVisuals?.view==='deformation'){
          const selected=this.app.nodeProbe?.inspectXRRay(this._ray(controller));
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
        if(this.app.trussExperience?.active && this.app.xrMode==='vr'){
          // Locomotion is camera-relative and horizontal: move the scene
          // opposite to the desired walking direction, without rotating it.
          const camera=this.app.renderer.xr.getCamera();
          const heading=new THREE.Vector3();
          camera.getWorldDirection(heading);
          heading.y=0;
          if(heading.lengthSq()<1e-8)heading.set(0,0,-1);
          heading.normalize();
          const right=new THREE.Vector3().crossVectors(heading,new THREE.Vector3(0,1,0)).normalize();
          const deadzone=.16,speed=1.8;
          const strafe=Math.abs(x)>deadzone?x:0;
          const forward=Math.abs(y)>deadzone?-y:0;
          if(strafe||forward){
            const delta=right.multiplyScalar(strafe).addScaledVector(heading,forward);
            if(delta.lengthSq()>1)delta.normalize();
            // Convert the world-space motion into the parent frame.
            delta.multiplyScalar(-speed*dt);
            const parent=this.app.worldRoot.parent;
            if(parent)delta.applyQuaternion(parent.getWorldQuaternion(new THREE.Quaternion()).invert());
            this.app.worldRoot.position.add(delta);
          }
        }else{
          const q=new THREE.Quaternion();
          if(Math.abs(x)>.16){
            q.setFromAxisAngle(new THREE.Vector3(0,1,0),-x*dt*1.6);
            this.app.worldRoot.quaternion.premultiply(q);
          }
          if(Math.abs(y)>.16){
            q.setFromAxisAngle(new THREE.Vector3(1,0,0),y*dt*1.6);
            this.app.worldRoot.quaternion.premultiply(q);
          }
        }
      }else if(source.handedness==='right'&&Math.abs(y)>.16){
        // Continuous scaling: rounding on every frame would swallow small
        // joystick increments, so quantize the label, not the actual size.
        const newSize=clamp(this.app.targetMeters-y*dt*1.3,0.12,5);
        if(Math.abs(newSize-this.app.targetMeters)>1e-6){
          this.app.targetMeters=newSize;this.app.updateScale();this.dirty=true;
          $('model-size').value=String(newSize);
          $('size-value').textContent=newSize.toFixed(1)+' m';
        }
      }
    }
    if(!forceHovered){this.app.teachingAnalysis?.hideXRHover();this.app.sapVisuals?.hideXRHover();this.app.reactionVisuals?.hideXRHover();this.app.nodeProbe?.hideXRHover();}
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
