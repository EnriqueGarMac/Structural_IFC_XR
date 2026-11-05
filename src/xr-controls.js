import * as THREE from 'three';
import {clamp,rotateIndex,snapModelSize,isValidHorizontalHit,caseLabel,nextUniquePattern} from './xr-logic.mjs';

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
    this.app=app;this.page='main';this.hits=[];this.hoverId=null;this.selected='—';
    this.dirty=true;this.drag=null;this.placeMode=false;this.latestHit=null;
    this.hitSources=new Map();this.hitByInput=new Map();this.currentSource=null;
    this.session=null;this.initializedPose=false;
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
    this.lastFrameTime=0;
  }
  start(session){
    this.session=session;
    this.initializedPose=false;this.panel.visible=true;
    this.page='main';this.dirty=true;this.placeMode=false;
    this.app.worldRoot.quaternion.copy(this.baseQuat);
    this.app.worldRoot.position.copy(this.basePosition);
    this.contact.visible=false;
  }
  stop(){
    this.session=null;this.panel.visible=false;this.reticle.visible=false;
    this.contact.visible=false;this.placeMode=false;this.drag=null;
    for(const h of this.hitSources.values())h.source?.cancel();
    this.hitSources.clear();this.hitByInput.clear();
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
        this.contact.visible=true;
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
      if(menuHit.item)this.command(menuHit.item.id);
      return;
    }
    // Trigger directly on structural geometry: select element and rotate
    // the entire IFC/SAP overlay according to the controller orientation.
    const picks=this._ray(controller).intersectObjects([
      ...this.app.originalGroup.children.filter(x=>x.visible),
      ...this.app.deformedGroup.children.filter(x=>x.visible)
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
       d.kind==='move'&&button==='squeeze')this.drag=null;
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
      btn('placement','COLOCACIÓN EN LA SALA',38,469,692,91);
      txt('Tamaño del modelo en realidad mixta',38,614,21);
      btn('size:-','−',38,645,144,78);
      txt(app.targetMeters.toFixed(1)+' m',385,684,29,'#f3ffff','center');
      btn('size:+','+',586,645,144,78);
      btn('reset-model','Recentrar estructura',38,769,335,76);
      btn('menu-move','Mover menú',395,769,335,76,true);
      txt(dataPresent?'Resultados importados o de ejemplo activos':'Sin resultados SAP importados',38,889,19);
      btn('exit','SALIR DE REALIDAD MIXTA',38,960,692,83);
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
      txt('Factor de amplificación visual (no físico)',38,584,21);
      btn('amp:-','−',38,622,126,70);
      txt('×'+app.amp,385,657,30,'#e6ffff','center');
      btn('amp:+','+',606,622,124,70);
      btn('deformed','Deformada: '+(app.showDeformed?'ON':'OFF'),38,748,334,81,true);
      btn('original','Original: '+(app.showOriginal?'ON':'OFF'),394,748,336,81);
      btn('loads','Cargas: '+(app.showLoads?'ON':'OFF'),38,853,692,75);
      txt('SAP2000: superposición e interpolación visual',38,1010,19);
    }else if(this.page==='layers'){
      btn('back','‹ Volver',38,117,230,66);
      txt('CAPAS / INFORMACIÓN',38,231,29,'#e1f7fc');
      btn('original','IFC original: '+(app.showOriginal?'visible':'oculto'),38,292,692,83,true);
      btn('deformed','Deformada: '+(app.showDeformed?'visible':'oculta'),38,404,692,83);
      btn('loads','Cargas: '+(app.showLoads?'visibles':'ocultas'),38,516,692,83);
      btn('frames','Barras SAP: '+(app.showFrames?'visibles':'ocultas'),38,628,692,83);
      btn('axes','Ejes: '+(app.showAxes?'visibles':'ocultos'),38,740,692,83);
      txt('Gatillo en elemento IFC: selección + rotación.',38,882,20);
      txt('Agarre lateral: desplazar todo el modelo.',38,929,20);
      txt(textFit(this.selected,40),38,1005,18,'#83e9da');
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
    else if(id==='menu-move'){this.moveMenu=!this.moveMenu;}
    else if(id==='reset-model'){
      app.worldRoot.position.copy(this.basePosition);
      app.worldRoot.quaternion.copy(this.baseQuat);
      this.contact.visible=false;
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
    else if(id==='pattern:+'||id==='pattern:-'){
      const p=nextUniquePattern(app.results?.loads,app.pattern,id==='pattern:+'?1:-1);
      app.setPattern(p);$('pattern-select').value=p;
    }
    else if(id==='amp:+'||id==='amp:-'){
      app.amp=clamp(app.amp+(id==='amp:+'?5:-5),0,150);
      $('amp').value=String(app.amp);$('amp-value').textContent='×'+app.amp;
      app.updateVisualization();
    }
    else if(['loads','deformed','original','frames','axes'].includes(id)){
      const dict={loads:['showLoads','show-loads'],deformed:['showDeformed','show-displaced'],
        original:['showOriginal','show-original'],frames:['showFrames','show-frames'],axes:['showAxes','show-axes']};
      const [prop,domId]=dict[id];
      this.syncControl(domId,!app[prop]);
    }
    else if(id==='place'){
      this.placeMode=!this.placeMode;
      this.latestHit=null;this.reticle.visible=false;
    }
    else if(id==='shadow'){
      this.shadow=!this.shadow;
      if(!this.shadow)this.contact.visible=false;
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
      d.source.updateMatrixWorld();
      const p=new THREE.Vector3(),q=new THREE.Quaternion();
      d.source.getWorldPosition(p);d.source.getWorldQuaternion(q);
      if(d.kind==='rotate'){
        const relative=q.clone().multiply(d.startQ.clone().invert());
        d.object.quaternion.copy(relative.multiply(d.startObjectQ));
      } else {
        d.object.position.copy(d.startObjectPos).add(p.sub(d.startPos));
        if(d.kind==='move'&&this.contact.visible){
          // The contact shadow is only valid while the model rests on its plane.
          this.contact.visible=false;
        }
      }
    }
    const dt=Math.min(.05,Math.max(0,(time-(this.lastFrameTime||time))/1000));
    this.lastFrameTime=time;
    for(const {controller,rayLine} of this.controllers){
      if(!controller.userData.xrInput)continue;
      const hit=this._menuHit(controller);
      if(hit?.item?.id!==this.hoverId){
        this.hoverId=hit?.item?.id??null;this.dirty=true;
      }
      rayLine.scale.z=hit?.intersection?.distance||2.8;
      const source=controller.userData.xrInput,axes=source.gamepad?.axes;
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
        const newSize=snapModelSize(this.app.targetMeters,-y*dt*1.3);
        if(newSize!==this.app.targetMeters){
          this.app.targetMeters=newSize;this.app.updateScale();this.dirty=true;
          $('model-size').value=String(newSize);$('size-value').textContent=newSize.toFixed(1)+' m';
        }
      }
    }
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
