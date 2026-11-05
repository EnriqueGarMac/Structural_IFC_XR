import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { caseNodes, makeDisplacementSampler, maxDisplacement, selectedLoads, loadMagnitude, analyticalNodePositions } from './results.mjs';
import { StructuralXRControls } from './xr-controls.js';
import {isTerrainElement,displayModeVisibility} from './view-filters.mjs';
const vector=(n)=>new THREE.Vector3(n.x,n.y,n.z);
const lerp=(a,b,t)=>a.clone().lerp(b,t);
const colorMap=(t)=> {
  const stops=[ [0,0x3a9fcf],[.35,0x65d8b1],[.68,0xf0cb66],[1,0xe96153] ];
  t=THREE.MathUtils.clamp(t,0,1);
  for(let i=1;i<stops.length;i++) if(t<=stops[i][0]) {
    const a=stops[i-1], b=stops[i];
    return new THREE.Color(a[1]).lerp(new THREE.Color(b[1]),(t-a[0])/(b[0]-a[0]));
  }
  return new THREE.Color(stops.at(-1)[1]);
};
const $=(id)=>document.getElementById(id);
export class StructuralScene {
  constructor(container){
    this.container=container;
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(45,1,.01,1000);
    this.camera.position.set(4.6,3.5,5.8);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:false});
    this.renderer.setClearColor(0x07131d,0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    this.renderer.xr.enabled=true;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.4;
    container.appendChild(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true;
    this.controls.target.set(0,.65,0);
    this.controls.maxDistance=150;
    this.scene.add(new THREE.HemisphereLight(0xd9f3ff,0x304a63,2.2));
    const key=new THREE.DirectionalLight(0xfff7e7,3.4);key.position.set(5,9,6);this.scene.add(key);
    const rim=new THREE.DirectionalLight(0x72cdeb,1.2);rim.position.set(-5,4,-6);this.scene.add(rim);
    this.worldRoot=new THREE.Group();this.worldRoot.rotation.x=-Math.PI/2;this.scene.add(this.worldRoot);
    this.contentRoot=new THREE.Group();this.worldRoot.add(this.contentRoot);
    this.originalGroup=new THREE.Group();this.deformedGroup=new THREE.Group();
    this.loadsGroup=new THREE.Group();this.framesGroup=new THREE.Group();
    this.contentRoot.add(this.originalGroup,this.deformedGroup,this.loadsGroup,this.framesGroup);
    this.grid=new THREE.GridHelper(11,22,0x557b89,0x244453);
    this.grid.material.opacity=.35;this.grid.material.transparent=true;this.scene.add(this.grid);
    this.axes=new THREE.AxesHelper(1.5);this.contentRoot.add(this.axes);
    this.parts=[];this.results=null;this.caseName='';this.pattern='all';this.offset=[0,0,0];this.maxU=0;this.bounds=null;
    this.amp=25;this.targetMeters=2.5;this.showLoads=true;this.showDeformed=true;this.showOriginal=true;
    this.showFrames=true;this.showAxes=true;this.hideGround=true;this.showSAPOnly=false;this.isXR=false;this.xrSession=null;
    this.pickRaycaster=new THREE.Raycaster();this.mouse=new THREE.Vector2();
    this.xrControls=new StructuralXRControls(this);
    this.renderer.domElement.addEventListener('pointerdown',(evt)=>this.pickStart={x:evt.clientX,y:evt.clientY});
    this.renderer.domElement.addEventListener('pointerup',(evt)=>this.pickElement(evt));
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);
    this.renderer.setAnimationLoop((time,frame)=>{
      if(this.isXR)this.xrControls.update(time,frame);
      else this.controls.update();
      this.renderer.render(this.scene,this.camera);
    });
    this.resize();
  }
  resize(){let w=this.container.clientWidth,h=this.container.clientHeight;if(w<1||h<1)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);}
  clearGroup(group,disposeGeometry=true){
    for(const child of [...group.children]){
      group.remove(child);
      child.traverse(o=>{
        if(o.geometry&&disposeGeometry)o.geometry.dispose();
        if(o.material){const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}
      });
    }
  }
  setModel(items){
    this.clearGroup(this.originalGroup);this.clearGroup(this.deformedGroup);this.clearGroup(this.loadsGroup);this.clearGroup(this.framesGroup);
    this.parts=[];
    const bbox=new THREE.Box3(),allBounds=new THREE.Box3();
    for(const piece of items){
      const originalGeom=piece.geometry;
      const copiedGeom=originalGeom.clone();
      const origMat=new THREE.MeshStandardMaterial({color:piece.color??0xb2c7d1,side:THREE.DoubleSide,roughness:.77,transparent:true,opacity:1,depthWrite:true});
      const displacedMat=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide,roughness:.54,metalness:.04});
      const a=new THREE.Mesh(originalGeom,origMat),b=new THREE.Mesh(copiedGeom,displacedMat);
      a.userData={name:piece.name,guid:piece.guid,expressId:piece.expressId,ifcType:piece.ifcType};
      b.userData=a.userData;
      a.castShadow=b.castShadow=false;
      this.originalGroup.add(a);this.deformedGroup.add(b);
      allBounds.expandByObject(a);
      if(!this.hideGround||!isTerrainElement(piece))bbox.expandByObject(a);
      const pos=copiedGeom.getAttribute('position');
      const colors=new Float32Array(pos.count*3);
      for(let j=0;j<pos.count;j++){colors[3*j]=.35;colors[3*j+1]=.72;colors[3*j+2]=.85;}
      copiedGeom.setAttribute('color',new THREE.BufferAttribute(colors,3));
      this.parts.push({orig:a,deformed:b,terrain:isTerrainElement(piece),base:originalGeom.getAttribute('position').array.slice(),name:piece.name});
    }
    if(allBounds.isEmpty())throw new Error('No se ha recibido geometría 3D.');
    if(bbox.isEmpty()){
      // A terrain-only IFC should remain inspectable rather than disappear.
      this.hideGround=false;
      const toggle=document.getElementById('hide-ground');
      if(toggle)toggle.checked=false;
      bbox.copy(allBounds);
    }
    this.bounds=bbox;
    const c=bbox.getCenter(new THREE.Vector3());
    this.contentRoot.position.set(-c.x,-c.y,-bbox.min.z);
    this.axes.position.set(bbox.min.x,bbox.min.y,bbox.min.z);
    this.axes.scale.setScalar(bbox.getSize(new THREE.Vector3()).length()/13);
    this.updateScale();this.recenterCamera();this.updateVisualization();
  }
  updateScale(){
    if(!this.bounds)return;
    const size=this.bounds.getSize(new THREE.Vector3());
    this.maxSize=Math.max(size.x,size.y,size.z,.1);
    this.worldRoot.scale.setScalar(this.targetMeters/this.maxSize);
    this.grid.scale.setScalar(Math.max(.5,this.targetMeters/5));
    this.grid.visible=this.showAxes&&!this.showSAPOnly&&!this.isXR;
  }
  recenterCamera(){
    if(!this.bounds)return;
    const s=this.targetMeters;
    this.camera.position.set(s*1.50,s*1.05,s*1.65);
    this.camera.near=Math.max(.001,s/1000);this.camera.far=Math.max(200,s*30);
    this.camera.updateProjectionMatrix();
    const h=this.bounds.getSize(new THREE.Vector3()).z*this.targetMeters/this.maxSize;
    this.controls.target.set(0,h*.46,0);this.controls.update();
  }
  setResults(results){this.results=results;this.caseName=results?.cases?.[0]?.name||'';this.pattern='all';this.updateVisualization();}
  setCase(name){this.caseName=name;this.updateVisualization();}
  setPattern(name){this.pattern=name;this.updateVisualization();}
  setOffset(offset){this.offset=offset;this.updateVisualization();}
  setHideGround(enabled){this.hideGround=!!enabled;this.updateVisualization();}
  setSAPOnly(enabled){
    // Avoid showing an empty environment if SAP geometry has not been imported.
    if(enabled&&(!this.results?.frames?.length||!this.parts.length))return false;
    this.showSAPOnly=!!enabled;
    if(enabled)this.showFrames=true;
    this.updateVisualization();
    return true;
  }
  updateVisualization(rebuildOverlays=true){
    const hasCases=!!this.results?.cases?.length;
    const nodes=hasCases?caseNodes(this.results,this.caseName,this.offset):[];
    this.maxU=maxDisplacement(nodes);
    const sample=makeDisplacementSampler(nodes);
    const deform=hasCases && this.showDeformed;
    this.axes.visible=this.showAxes&&!this.showSAPOnly;
    this.grid.visible=this.showAxes&&!this.isXR&&!this.showSAPOnly;
    const visibility=displayModeVisibility({showSAPOnly:this.showSAPOnly,
      hideGround:this.hideGround,showOriginal:this.showOriginal,
      showDeformed:this.showDeformed,hasCases});
    this.originalGroup.visible=visibility.original;
    this.deformedGroup.visible=visibility.deformed;
    for(const part of this.parts){
      part.orig.visible=part.deformed.visible=!(this.hideGround&&part.terrain);
      part.orig.material.opacity=deform ? 0.20 : 1;
      part.orig.material.depthWrite=!deform;
      if(!deform)continue;
      const attrs=part.deformed.geometry.getAttribute('position');
      const cs=part.deformed.geometry.getAttribute('color');
      const src=part.base;
      for(let i=0;i<attrs.count;i++){
        const j=3*i;
        const [ux,uy,uz,mag]=sample(src[j],src[j+1],src[j+2]);
        attrs.array[j]=src[j]+this.amp*ux;
        attrs.array[j+1]=src[j+1]+this.amp*uy;
        attrs.array[j+2]=src[j+2]+this.amp*uz;
        const c=colorMap(this.maxU>0?mag/this.maxU:0);
        cs.array[j]=c.r;cs.array[j+1]=c.g;cs.array[j+2]=c.b;
      }
      attrs.needsUpdate=true;cs.needsUpdate=true;
      part.deformed.geometry.computeVertexNormals();
      part.deformed.geometry.computeBoundingSphere();
    }
    if(rebuildOverlays)this.updateOverlays();
    $('legend-title').textContent=deform?'DESPLAZAMIENTO |u|':'INTENSIDAD DE CARGA';
    $('legend-min').textContent=deform?'0 mm':'0 kN/m';
    const visibleLoads=this.results?selectedLoads(this.results,this.pattern):[];
    const maxLoad=Math.max(0,...visibleLoads.map(loadMagnitude));
    $('legend-max').textContent=deform?`${(this.maxU*1000).toFixed(2)} mm`:`${maxLoad.toFixed(2)} kN/m`;
    $('legend-note').textContent=deform?'Color: desplazamiento real · Forma: amplificada':'Acciones aplicadas, no esfuerzos internos';
    $('max-u').textContent=hasCases?`${(this.maxU*1000).toFixed(2)} mm`:'—';
  }
  updateOverlays(){
    this.clearGroup(this.loadsGroup);this.clearGroup(this.framesGroup);
    if(!this.results)return;
    const nodes=caseNodes(this.results,this.caseName,this.offset);
    const showAnalyticalDeformation=this.showSAPOnly&&this.showDeformed&&
      Boolean(this.results.cases?.length);
    const displayedNodes=analyticalNodePositions(nodes,this.amp,showAnalyticalDeformation);
    const nodeMap=new Map(displayedNodes.map(n=>[n.id,vector(n)]));
    const frameMap=new Map(this.results.frames.map(f=>[f.id,f]));
    if(this.showFrames){
      const points=[];
      for(const f of this.results.frames){const a=nodeMap.get(f.i),b=nodeMap.get(f.j);if(a&&b)points.push(...a.toArray(),...b.toArray());}
      if(points.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
        const line=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x53f0e1,transparent:true,opacity:.85}));this.framesGroup.add(line);}
      for(const n of displayedNodes){const dot=new THREE.Mesh(new THREE.SphereGeometry(this.maxSize*.008,7,5),new THREE.MeshBasicMaterial({color:0x82f5d6}));dot.position.copy(vector(n));this.framesGroup.add(dot);}
    }
    this.framesGroup.visible=this.showFrames;
    if(!this.showLoads)return;
    const loads=selectedLoads(this.results,this.pattern).filter(l=>l.type==='force_per_length');
    const maxW=Math.max(1,...loads.map(loadMagnitude));
    let arrowCount=0;
    for(const l of loads){
      const f=frameMap.get(l.frame);if(!f)continue;
      const start=nodeMap.get(f.i),end=nodeMap.get(f.j);if(!start||!end)continue;
      const nSegments=8;
      const pts=[];const colors=[];
      for(let i=0;i<=nSegments;i++){
        const t=l.start+(l.end-l.start)*i/nSegments;
        const intensity=l.w1+(l.w2-l.w1)*i/nSegments;
        const base=lerp(start,end,t);
        const c=colorMap(Math.abs(intensity)/maxW);
        if(i){pts.push(...this._prevLoadPt.toArray(),...base.toArray());colors.push(...this._prevLoadColor.toArray(),...c.toArray());}
        this._prevLoadPt=base;this._prevLoadColor=c;
        if(i%2===0&&arrowCount<550){
          const positiveAxis=String(l.csys).toLowerCase()==='global' && [4,5,6].includes(l.dir);
          if(positiveAxis&&Math.abs(intensity)>1e-7){
            const axis=l.dir===4?new THREE.Vector3(1,0,0):l.dir===5?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);
            axis.multiplyScalar(Math.sign(intensity));
            const length=this.maxSize*(.035+.15*Math.abs(intensity)/maxW);
            const arrow=new THREE.ArrowHelper(axis,base,length,c.getHex(),length*.28,length*.12);
            this.loadsGroup.add(arrow);arrowCount++;
          }
        }
      }
      if(pts.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
        this.loadsGroup.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({vertexColors:true,linewidth:3})));}
    }
  }
  pickElement(evt){
    if(this.isXR||!this.pickStart||Math.hypot(this.pickStart.x-evt.clientX,this.pickStart.y-evt.clientY)>4)return;
    const r=this.renderer.domElement.getBoundingClientRect();this.mouse.set((evt.clientX-r.left)/r.width*2-1,-(evt.clientY-r.top)/r.height*2+1);
    this.pickRaycaster.setFromCamera(this.mouse,this.camera);
    const hit=this.pickRaycaster.intersectObjects([...this.originalGroup.children,...this.deformedGroup.children],false)[0];
    if(hit){const u=hit.object.userData;const id=u.guid?` · GUID ${u.guid}`:'';
      this.onSelection?.(`${u.name}${id}`);}
  }
  async enterXR(){
    if(!navigator.xr)throw new Error('Este navegador no dispone de WebXR. Abre la aplicación HTTPS desde el navegador de Quest 3.');
    if(this.xrSession){await this.xrSession.end();return;}
    const ok=await navigator.xr.isSessionSupported('immersive-ar');
    if(!ok)throw new Error('Este dispositivo/navegador no admite sesiones immersive-ar. Prueba Quest Browser en Quest 3.');
    this.renderer.xr.setReferenceSpaceType('local');
    const session=await navigator.xr.requestSession('immersive-ar',{
      requiredFeatures:['local'],
      optionalFeatures:['hit-test','local-floor']
    });
    this.xrSession=session;this.isXR=true;
    this.grid.visible=false;
    this.controls.enabled=false;
    session.addEventListener('end',()=>{
      this.xrSession=null;this.isXR=false;
      this.xrControls.stop();
      this.grid.visible=this.showAxes;this.controls.enabled=true;
      this.onXREnd?.();
    });
    try{
      await this.renderer.xr.setSession(session);
      session.updateRenderState({depthNear:0.025,depthFar:75});
      this.xrControls.start(session);
    }catch(err){
      await session.end().catch(()=>{});
      throw err;
    }
  }
  async webXRSupported(){try{return Boolean(await navigator.xr?.isSessionSupported('immersive-ar'));}catch{return false;}}
}
