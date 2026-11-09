import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { caseNodes, makeDisplacementSampler, maxDisplacement, selectedLoads, loadMagnitude, analyticalNodePositions } from './results.mjs';
import { StructuralXRControls } from './xr-controls.js';
import {isTerrainElement,displayModeVisibility} from './view-filters.mjs';
import {makeStructuralGroundGrid,makeColumnFootMarkers} from './ground-reference.js';
import {makeBeamFieldSampler} from './beam-field.mjs';
import {sessionOptions} from './xr-session-config.mjs';
import {createVREnvironment} from './vr-environment.js';
import {ifcElementOpacity,normalizedScope} from './ifc-opacity.mjs';
import {buildSupportSymbols} from './support-symbols.js';
import {visibleModelBounds,fitPerspectiveToBounds} from './camera-framing.mjs';
import {resultColourHex,cssResultGradient} from './visual-palettes.mjs';
import {WebSun} from './web-sun.js';
import {placeModelOnSurface,matchingTablePlane,tableFitSize} from './ar-placement.mjs';
const vector=(n)=>new THREE.Vector3(n.x,n.y,n.z);
const lerp=(a,b,t)=>a.clone().lerp(b,t);
const colorMap=(t,palette)=>new THREE.Color(resultColourHex(t,palette));
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
    // Mobile passthrough: real-time simulated shadows on a fully transparent
    // support plane. Does not change the physical lighting of the room.
    this.mobileShadowLight=new THREE.DirectionalLight(0xffffff,1.65);
    this.mobileShadowLight.position.set(3,6,4);
    this.mobileShadowLight.castShadow=true;
    this.mobileShadowLight.shadow.mapSize.set(1024,1024);
    this.mobileShadowLight.shadow.camera.left=-8;
    this.mobileShadowLight.shadow.camera.right=8;
    this.mobileShadowLight.shadow.camera.top=8;
    this.mobileShadowLight.shadow.camera.bottom=-8;
    this.mobileShadowLight.shadow.camera.near=.05;
    this.mobileShadowLight.shadow.camera.far=40;
    this.mobileShadowLight.shadow.bias=-.00015;
    this.mobileShadowLight.shadow.normalBias=.025;
    this.mobileShadowLight.visible=false;
    this.scene.add(this.mobileShadowLight,this.mobileShadowLight.target);
    this.mobileShadowPlane=new THREE.Mesh(
      new THREE.PlaneGeometry(24,24),
      new THREE.ShadowMaterial({color:0x091119,opacity:.36,depthWrite:false,side:THREE.DoubleSide})
    );
    this.mobileShadowPlane.rotation.x=-Math.PI/2;
    this.mobileShadowPlane.receiveShadow=true;
    this.mobileShadowPlane.visible=false;
    this.scene.add(this.mobileShadowPlane);
    this.vrEnvironment=createVREnvironment();
    this.scene.add(this.vrEnvironment);
    this.worldRoot=new THREE.Group();this.worldRoot.rotation.x=-Math.PI/2;this.scene.add(this.worldRoot);
    this.contentRoot=new THREE.Group();this.worldRoot.add(this.contentRoot);
    this.webSun=new WebSun(this);
    this.originalGroup=new THREE.Group();this.deformedGroup=new THREE.Group();
    this.loadsGroup=new THREE.Group();this.framesGroup=new THREE.Group();this.supportGroup=new THREE.Group();
    this.contentRoot.add(this.originalGroup,this.deformedGroup,this.loadsGroup,this.framesGroup,this.supportGroup);
    this.mobileSAPShadowGroup=new THREE.Group();
    this.mobileSAPShadowGroup.visible=false;
    this.contentRoot.add(this.mobileSAPShadowGroup);
    this.grid=new THREE.GridHelper(11,22,0x557b89,0x244453);
    // Structural coordinates are Z-up. The reference must share the same
    // parent transform as the structure and rotate into the XY ground plane.
    this.grid.rotation.x=Math.PI/2;
    this.worldRoot.add(this.grid);
    this.groundMarkers=new THREE.Group();
    this.worldRoot.add(this.groundMarkers);
    this.axes=new THREE.AxesHelper(1.5);this.contentRoot.add(this.axes);
    this.parts=[];this.results=null;this.caseName='';this.pattern='all';this.offset=[0,0,0];this.maxU=0;this.bounds=null;
    this.amp=25;this.targetMeters=2.5;this.showLoads=true;this.showDeformed=true;this.showOriginal=true;
    this.showFrames=true;this.showSupports=true;this.showStructureOnly=false;this.ifcOpacity=1;this.ifcOpacityScope='envelope';this.showAxes=true;this.hideGround=true;this.showSAPOnly=false;this.isXR=false;this.xrSession=null;this.xrMode=null;
    this.mobileAR=false;this.mobileARState=null;this.webcamActive=false;this.arAnchorPoint=null;
    this.mobileOriginalShadowMap=false;this.mobileCastShadowState=new Map();
    this.pickRaycaster=new THREE.Raycaster();this.mouse=new THREE.Vector2();
    this.xrControls=new StructuralXRControls(this);
    this.renderer.domElement.addEventListener('pointerdown',(evt)=>this.pickStart={x:evt.clientX,y:evt.clientY});
    this.renderer.domElement.addEventListener('pointerup',(evt)=>this.pickElement(evt));
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);
    this.renderer.setAnimationLoop((time,frame)=>{
      if(this.isXR){
        if(this.mobileAR)this.updateMobileAR(frame);
        else this.xrControls.update(time,frame);
      }else this.controls.update();
      this.sapVisuals?.updateModalAnimation(time);
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
    const hasExplicitRoles=items.some(p=>p.structural===true);
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
      // Size the educational model using the resisting system, not the
      // much larger landscaped parcel or external parking areas.
      if(hasExplicitRoles?
        (piece.structural===true&&!isTerrainElement(piece)):
        !isTerrainElement(piece))bbox.expandByObject(a);
      const pos=copiedGeom.getAttribute('position');
      const colors=new Float32Array(pos.count*3);
      for(let j=0;j<pos.count;j++){colors[3*j]=.35;colors[3*j+1]=.72;colors[3*j+2]=.85;}
      copiedGeom.setAttribute('color',new THREE.BufferAttribute(colors,3));
      // Normalized displacement amplitudes are also used as UVs for USDZ,
      // because Quick Look may discard THREE's per-vertex colours.
      copiedGeom.setAttribute('heat',new THREE.Float32BufferAttribute(new Float32Array(pos.count),1));
      this.parts.push({orig:a,deformed:b,terrain:isTerrainElement(piece),
        structural:piece.structural??null,
        ifcType:piece.ifcType??null,
        analysisIncluded:piece.analysisIncluded??null,
        baseColor:piece.color??0xb2c7d1,
        base:originalGeom.getAttribute('position').array.slice(),name:piece.name});
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
    // Rebuild the reference for the actual footprint, instead of a small
    // fixed-size helper in unrelated scene coordinates.
    this.worldRoot.remove(this.grid);
    this.grid.geometry.dispose();this.grid.material.dispose();
    this.grid=makeStructuralGroundGrid(bbox);
    this.worldRoot.add(this.grid);
    const c=bbox.getCenter(new THREE.Vector3());
    // Demo roof coordinates are already engineering coordinates: the
    // pillar-foot level is Z=0 and the centre of the plan is X=Y=0.
    // Do not let bounding-box recentering move that elevation or the origin.
    // Imported IFC and the legacy frame retain their original auto-centring.
    const fixedStructuralOrigin=items.length>0&&items.every(
      piece=>piece.preserveStructuralOrigin===true
    );
    this.clearGroup(this.groundMarkers);
    if(fixedStructuralOrigin){
      // Highlight all ten column feet exactly on the Z=0 structural plane.
      const footMarkers=makeColumnFootMarkers(items);
      this.groundMarkers.add(...footMarkers.children);
      this.contentRoot.position.set(0,0,0);
      this.axes.position.set(0,0,0);
    }else{
      this.contentRoot.position.set(-c.x,-c.y,-bbox.min.z);
      this.axes.position.set(bbox.min.x,bbox.min.y,bbox.min.z);
    }
    this.axes.scale.setScalar(bbox.getSize(new THREE.Vector3()).length()/13);
    this.updateScale();this.recenterCamera();this.updateVisualization();
  }
  updateScale(){
    if(!this.bounds)return;
    const size=this.bounds.getSize(new THREE.Vector3());
    this.maxSize=Math.max(size.x,size.y,size.z,.1);
    this.worldRoot.scale.setScalar(this.targetMeters/this.maxSize);
    if(this.isXR&&this.xrMode==='ar'&&this.arAnchorPoint)
      placeModelOnSurface(this,this.arAnchorPoint);
    // The grid now inherits the exact same worldRoot scale as the columns.
    this.grid.visible=this.showAxes&&!this.showSAPOnly&&!this.isXR;
    this.groundMarkers.visible=this.grid.visible;
  }
  recenterCamera(){
    if(!this.bounds||this.isXR)return;
    this.worldRoot.updateWorldMatrix(true,true);
    const bounds=visibleModelBounds(this.parts,{
      hideGround:this.hideGround,showStructureOnly:this.showStructureOnly
    });
    if(bounds.isEmpty())return;
    const result=fitPerspectiveToBounds(this.camera,bounds);
    if(!result)return;
    this.controls.target.copy(result.center);
    this.controls.maxDistance=Math.max(150,result.distance*8);
    this.controls.update();
  }
  setResults(results){this.results=results;this.caseName=results?.cases?.[0]?.name||'';this.pattern='all';this.updateVisualization();}
  setCase(name){this.caseName=name;this.updateVisualization();}
  setPattern(name){this.pattern=name;this.updateVisualization();}
  setOffset(offset){this.offset=offset;this.updateVisualization();}
  setHideGround(enabled){this.hideGround=!!enabled;this.updateVisualization();}
  setIFCOpacity(opacity){this.ifcOpacity=Math.max(0,Math.min(1,Number(opacity)||0));this.updateVisualization(false);}
  setIFCOpacityScope(scope){this.ifcOpacityScope=normalizedScope(scope);this.updateVisualization(false);}

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
    const view=this.sapVisuals?.view||'deformation';
    const isModal=view==='modes'&&Boolean(this.results?.modes?.length);
    const hasBeamCurves=Boolean(this.results?.frameCurves?.[this.caseName]);
    const sample=hasCases&&hasBeamCurves?
      makeBeamFieldSampler(this.results,{caseName:this.caseName,offset:this.offset}):
      makeDisplacementSampler(nodes);
    const deform=hasCases&&this.showDeformed&&view==='deformation';
    this.axes.visible=this.showAxes&&!this.showSAPOnly;
    this.grid.visible=this.showAxes&&!this.isXR&&!this.showSAPOnly;
    this.groundMarkers.visible=this.grid.visible;
    const visibility=displayModeVisibility({showSAPOnly:this.showSAPOnly,
      hideGround:this.hideGround,showOriginal:this.showOriginal,
      showDeformed:this.showDeformed,hasCases:hasCases||isModal});
    this.originalGroup.visible=visibility.original;
    this.deformedGroup.visible=isModal&&!this.showSAPOnly?this.showDeformed:visibility.deformed;
    for(const part of this.parts){
      const visible=!(this.hideGround&&part.terrain)&&
        (!this.showStructureOnly||part.structural!==false);
      part.orig.visible=visible;
      // A partition, glazed façade or piece of furniture does not acquire
      // an invented FEM displacement field: only the analysed frame meshes
      // deform in the educational examples. Imported IFC stays compatible.
      part.deformed.visible=visible&&part.structural!==false&&part.analysisIncluded!==false;
      const structuralDeformation=part.structural!==false&&part.analysisIncluded!==false&&(deform||isModal);
      const alpha=ifcElementOpacity({
        opacity:this.ifcOpacity,scope:this.ifcOpacityScope,
        ifcType:part.ifcType,elementName:part.name,structuralDeformation
      });
      const mat=part.orig.material;
      const transparent=alpha<.999;
      if(mat.transparent!==transparent){mat.transparent=transparent;mat.needsUpdate=true;}
      mat.opacity=alpha;
      // An invisible wall must never write to the depth buffer.
      mat.depthWrite=!transparent;
      // External IFC results may also contain wall meshes in the displaced
      // layer. Fade these too, otherwise they would conceal the interior.
      const displacedAlpha=ifcElementOpacity({
        opacity:this.ifcOpacity,scope:this.ifcOpacityScope,ifcType:part.ifcType,elementName:part.name
      });
      const dmat=part.deformed.material;
      const displacedTransparent=displacedAlpha<.999;
      if(dmat.transparent!==displacedTransparent){
        dmat.transparent=displacedTransparent;dmat.needsUpdate=true;
      }
      dmat.opacity=displacedAlpha;
      dmat.depthWrite=!displacedTransparent;
      if(isModal){
        const attrs=part.deformed.geometry.getAttribute('position');
        attrs.array.set(part.base);attrs.needsUpdate=true;
        continue;
      }
      if(!deform)continue;
      const attrs=part.deformed.geometry.getAttribute('position');
      const cs=part.deformed.geometry.getAttribute('color');
      const hs=part.deformed.geometry.getAttribute('heat');
      const src=part.base;
      for(let i=0;i<attrs.count;i++){
        const j=3*i;
        const [ux,uy,uz,mag]=sample(src[j],src[j+1],src[j+2]);
        attrs.array[j]=src[j]+this.amp*ux;
        attrs.array[j+1]=src[j+1]+this.amp*uy;
        attrs.array[j+2]=src[j+2]+this.amp*uz;
        const intensity=this.maxU>0?mag/this.maxU:0;
        const c=colorMap(intensity,this.sapVisuals?.palette);
        cs.array[j]=c.r;cs.array[j+1]=c.g;cs.array[j+2]=c.b;
        hs.array[i]=intensity;
      }
      attrs.needsUpdate=true;cs.needsUpdate=true;hs.needsUpdate=true;
      part.deformed.geometry.computeVertexNormals();
      part.deformed.geometry.computeBoundingSphere();
    }
    if(rebuildOverlays){this.updateOverlays();this.sapVisuals?.refresh();this.reactionVisuals?.refresh();this.nodeProbe?.refresh();}
    $('legend-title').textContent=deform?'DESPLAZAMIENTO |u|':'INTENSIDAD DE CARGA';
    $('legend-min').textContent=deform?'0 mm':'0 kN/m';
    const visibleLoads=this.results?selectedLoads(this.results,this.pattern):[];
    const maxLoad=Math.max(0,...visibleLoads.map(loadMagnitude));
    $('legend-max').textContent=deform?`${(this.maxU*1000).toFixed(2)} mm`:`${maxLoad.toFixed(2)} kN/m`;
    if(view==='deformation'){
      const bar=document.querySelector('#legend .legend-bar');
      if(bar)bar.style.background=cssResultGradient(this.sapVisuals?.palette);
    }
    $('max-u').textContent=hasCases?`${(this.maxU*1000).toFixed(2)} mm`:'—';
    this.sapVisuals?.updateLegend();
    this.reactionVisuals?.updateLegend();
    this.webSun?.update();
  }
  updateOverlays(){
    this.clearGroup(this.loadsGroup);this.clearGroup(this.framesGroup);this.clearGroup(this.supportGroup);
    if(!this.results)return;
    const nodes=caseNodes(this.results,this.caseName,this.offset);
    const size=Math.max(.08,Math.min(.6,(this.maxSize||8)*.028));
    const symbols=buildSupportSymbols(this.results.nodes,this.offset,size);
    for(const symbol of [...symbols.children])this.supportGroup.add(symbol);
    this.supportGroup.visible=this.showSupports;
    const showAnalyticalDeformation=this.sapVisuals?.view==='deformation'&&this.showSAPOnly&&this.showDeformed&&
      Boolean(this.results.cases?.length);
    const displayedNodes=analyticalNodePositions(nodes,this.amp,showAnalyticalDeformation);
    const nodeMap=new Map(displayedNodes.map(n=>[n.id,vector(n)]));
    const frameMap=new Map(this.results.frames.map(f=>[f.id,f]));
    if(this.showFrames){
      const points=[],colors=[];
      const scaledColors=showAnalyticalDeformation&&this.maxU>0;
      const heat=new Map(displayedNodes.map(n=>[
        n.id,scaledColors?colorMap(n.magnitude/this.maxU,this.sapVisuals?.palette):new THREE.Color(0x53f0e1)
      ]));
      for(const f of this.results.frames){
        const a=nodeMap.get(f.i),b=nodeMap.get(f.j);
        if(!a||!b)continue;
        points.push(...a.toArray(),...b.toArray());
        colors.push(...heat.get(f.i).toArray(),...heat.get(f.j).toArray());
      }
      if(points.length){
        const g=new THREE.BufferGeometry();
        g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
        g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
        this.framesGroup.add(new THREE.LineSegments(g,
          new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.9})));
      }
      for(const n of displayedNodes){
        const dot=new THREE.Mesh(new THREE.SphereGeometry(this.maxSize*.008,7,5),
          new THREE.MeshBasicMaterial({color:heat.get(n.id)}));
        dot.position.copy(vector(n));this.framesGroup.add(dot);
      }
    }
    this.framesGroup.visible=this.showFrames&&this.sapVisuals?.view!=='modes';
    // Immersive scenes do not inject virtual shadow casters.
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
        const c=colorMap(Math.abs(intensity)/maxW,this.sapVisuals?.palette);
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
    if(this.sapVisuals?.view==='forces'&&this.sapVisuals.pickForce(this.pickRaycaster))return;
    if(this.sapVisuals?.view==='deformation'&&this.nodeProbe?.pick(this.pickRaycaster))return;
    const hit=this.pickRaycaster.intersectObjects([...this.originalGroup.children,...this.deformedGroup.children],false)[0];
    if(hit){const u=hit.object.userData;const id=u.guid?` · GUID ${u.guid}`:'';
      this.onSelection?.(`${u.name}${id}`);}
  }
  updateMobileSAPShadowCasters(){
    // SAP analytical elements are Three.js lines (which cannot cast mesh
    // shadows). Add invisible cylinder surrogates only to the shadow pass.
    const group=this.mobileSAPShadowGroup;
    this.clearGroup(group);
    group.visible=Boolean(this.mobileAR&&this.showSAPOnly&&this.showFrames&&this.results?.frames?.length);
    if(!group.visible)return;
    const original=caseNodes(this.results,this.caseName,this.offset);
    const nodes=analyticalNodePositions(original,this.amp,
      this.showDeformed&&Boolean(this.results.cases?.length));
    const pointMap=new Map(nodes.map(n=>[n.id,new THREE.Vector3(n.x,n.y,n.z)]));
    const material=new THREE.MeshBasicMaterial({color:0xffffff,colorWrite:false,depthWrite:false});
    const geometry=new THREE.CylinderGeometry(Math.max(.005,(this.maxSize||8)*.004),
      Math.max(.005,(this.maxSize||8)*.004),1,8);
    const axis=new THREE.Vector3(0,1,0);
    for(const bar of this.results.frames){
      const a=pointMap.get(bar.i),b=pointMap.get(bar.j);
      if(!a||!b)continue;
      const displacement=b.clone().sub(a);
      const length=displacement.length();
      if(length<.00001)continue;
      const mesh=new THREE.Mesh(geometry,material);
      mesh.position.copy(a).add(b).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(axis,displacement.normalize());
      mesh.scale.y=length;
      mesh.castShadow=true;
      group.add(mesh);
    }
    // Geometries and materials are shared by these shadow surrogates.
  }
  enableMobileCastShadows(){
    // Only stable IFC parts belong in the persistent map. Transient SAP
    // overlays are rebuilt when changing load cases or amplification.
    for(const group of [this.originalGroup,this.deformedGroup]){
      group.traverse(obj=>{
        if(!obj.isMesh)return;
        if(!this.mobileCastShadowState.has(obj))
          this.mobileCastShadowState.set(obj,obj.castShadow);
        obj.castShadow=true;
      });
    }
    this.framesGroup.traverse(obj=>{if(obj.isMesh)obj.castShadow=true;});
  }
  disableMobileCastShadows(){
    for(const [obj,original] of this.mobileCastShadowState)obj.castShadow=original;
    this.mobileCastShadowState.clear();
    this.framesGroup.traverse(obj=>{if(obj.isMesh)obj.castShadow=false;});
  }
  positionMobileShadow(point,normal=[0,1,0]){
    if(!point)return;
    this.mobileShadowPlane.position.copy(point).addScaledVector(new THREE.Vector3(...normal),.004);
    const n=new THREE.Vector3(...normal).normalize();
    this.mobileShadowPlane.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),n);
    // PlaneGeometry is XY with +Z normal; align it to the surface normal.
    this.mobileShadowLight.target.position.copy(point);
    this.mobileShadowLight.position.copy(point).add(new THREE.Vector3(3.5,7,4));
    this.mobileShadowLight.target.updateMatrixWorld();
    this.mobileShadowPlane.visible=true;
  }
  async startMobileAR(session){
    const st={session,source:null,preview:null,previewPlane:null,lastCandidate:null,stableFrames:0,scanning:true,placeRequested:false,placed:false};
    this.mobileARState=st;
    this.xrControls.reticle.visible=false;
    this.xrControls.contact.visible=false;
    this.mobileOriginalShadowMap=this.renderer.shadowMap.enabled;
    // Do not inject virtual contact shadows into immersive AR.
    this.renderer.shadowMap.enabled=false;
    this.mobileShadowLight.visible=false;
    this.mobileShadowPlane.visible=false;
    this.webSun.update();
    const status=document.getElementById('mobile-ar-status');
    if(status)status.textContent='Apunta hacia una mesa o al suelo.';
    const capability=typeof session.requestHitTestSource==='function'&&
      (!session.enabledFeatures||session.enabledFeatures.includes('hit-test'));
    if(!capability){
      if(status)status.textContent='AR iniciado sin detección de superficies. El modelo aparece delante.';
      return;
    }
    try{
      const viewer=await session.requestReferenceSpace('viewer');
      const source=await session.requestHitTestSource({space:viewer});
      if(this.mobileARState!==st){source.cancel();return;}
      st.source=source;
    }catch(e){
      if(status)status.textContent='No se pudo detectar el suelo: '+e.message;
    }
  }
  updateMobileAR(frame){
    const st=this.mobileARState;
    if(!frame||!st||!this.xrSession)return;
    const ref=this.renderer.xr.getReferenceSpace();
    if(st.scanning&&st.source&&ref){
      try{
        let candidate=null,normal=null;
        for(const hit of frame.getHitTestResults(st.source)){
          const pose=hit.getPose(ref);
          if(!pose)continue;
          const m=pose.transform.matrix;
          const axis=[m[4],m[5],m[6]];
          if(axis[1]/(Math.hypot(...axis)||1)<.85)continue;
          candidate=new THREE.Vector3(m[12],m[13],m[14]);normal=axis;
          break;
        }
        if(candidate){
          st.stableFrames=st.lastCandidate&&st.lastCandidate.distanceTo(candidate)<.065?
            st.stableFrames+1:1;
          st.lastCandidate=candidate.clone();
        }else{st.stableFrames=0;st.lastCandidate=null;}
        st.preview=st.stableFrames>=3?candidate:null;
        st.previewNormal=st.preview?normal:null;
        st.previewPlane=st.preview?matchingTablePlane(frame,ref,st.preview):null;
      }catch{st.preview=null;st.previewPlane=null;st.stableFrames=0;st.lastCandidate=null;}
      this.xrControls.reticle.visible=Boolean(st.preview);
      if(st.preview)this.xrControls.reticle.position.copy(st.preview).add(new THREE.Vector3(0,.012,0));
      const field=document.getElementById('mobile-ar-status');
      const message=st.previewPlane?'Mesa detectada. Se ajustará el tamaño automáticamente.':
        st.preview?'Superficie detectada. Pulsa «Colocar aquí».':'Apunta a una mesa o al suelo.';
      if(field&&field.textContent!==message)field.textContent=message;
    }
    const place=document.getElementById('mobile-ar-place');
    if(place)place.disabled=!st.preview;
    if(st.placeRequested){
      st.placeRequested=false;
      if(st.preview){
        this.worldRoot.quaternion.copy(this.xrControls.baseQuat);
        if(st.previewPlane){
          const fitted=tableFitSize(this,st.previewPlane);
          if(fitted){
            this.targetMeters=fitted;this.updateScale();
            const slider=$('model-size');
            if(slider)slider.value=String(fitted);
            const output=$('size-value');
            if(output)output.textContent=fitted.toFixed(2)+' m';
          }
        }
        this.arAnchorPoint=st.preview.clone();
        placeModelOnSurface(this,st.preview);
        this.xrControls.reticle.visible=false;
        this.xrControls.contact.visible=false;
        st.scanning=false;st.placed=true;
        const field=document.getElementById('mobile-ar-status');
        if(field)field.textContent=st.previewPlane?'Modelo apoyado y ajustado a la mesa.':'Modelo apoyado. Puedes modificar el tamaño.';
      }
    }
  }
  resetMobilePlacement(){
    const st=this.mobileARState;
    if(st){st.scanning=true;st.placed=false;st.preview=null;st.previewPlane=null;st.stableFrames=0;st.lastCandidate=null;}
    this.arAnchorPoint=null;
    this.xrControls.contact.visible=false;
    this.mobileShadowPlane.visible=false;
  }
  stopMobileAR(){
    this.mobileARState?.source?.cancel();
    this.mobileARState=null;this.mobileAR=false;
    this.mobileShadowPlane.visible=false;
    this.mobileShadowLight.visible=false;
    this.disableMobileCastShadows();
    this.clearGroup(this.mobileSAPShadowGroup);
    this.mobileSAPShadowGroup.visible=false;
    this.renderer.shadowMap.enabled=this.mobileOriginalShadowMap;
    document.getElementById('mobile-ar-overlay').hidden=true;
    this.xrControls.reticle.visible=false;this.xrControls.contact.visible=false;
  }
  async enterXR({mobile=false,mode='ar'}={}){
    if(!navigator.xr)throw new Error(
      'Este navegador no dispone de WebXR. Para la realidad virtual abre HTTPS con Quest Browser.');
    if(this.xrSession){await this.xrSession.end();return;}
    const config=sessionOptions({mobile,mode});
    const supported=await navigator.xr.isSessionSupported(config.sessionType);
    if(!supported)throw new Error(mode==='vr'?
      'Este dispositivo no admite immersive-vr. Abre la aplicación en el navegador de Meta Quest.':
      'Este dispositivo/navegador no admite immersive-ar. Prueba Quest Browser en Quest.');
    this.renderer.xr.setReferenceSpaceType(config.referenceSpace);
    const overlay=document.getElementById('mobile-ar-overlay');
    if(mobile)overlay.hidden=false;
    let session;
    try{
      session=await navigator.xr.requestSession(config.sessionType,mobile?
        {...config.init,domOverlay:{root:overlay}}:config.init);
    }catch(e){
      if(mobile)overlay.hidden=true;
      throw e;
    }
    this.xrMode=mode;
    this.arAnchorPoint=null;
    this.mobileAR=mobile;
    this.xrSession=session;
    this.isXR=true;
    this.renderer.shadowMap.enabled=false;
    this.webSun.update();
    this.vrEnvironment.visible=mode==='vr';
    this.grid.visible=false;
    this.groundMarkers.visible=false;
    this.controls.enabled=false;
    session.addEventListener('end',()=>{
      this.xrSession=null;this.isXR=false;this.xrMode=null;this.arAnchorPoint=null;
      this.vrEnvironment.visible=false;
      this.stopMobileAR();
      this.xrControls.stop();
      this.grid.visible=this.showAxes&&!this.showSAPOnly;
      this.groundMarkers.visible=this.grid.visible;
      this.controls.enabled=true;
      this.renderer.shadowMap.enabled=true;
      this.webSun.update();
      this.onXREnd?.();
    });
    try{
      await this.renderer.xr.setSession(session);
      session.updateRenderState({depthNear:0.025,depthFar:75});
      if(mobile){
        this.worldRoot.position.copy(this.xrControls.basePosition);
        this.worldRoot.quaternion.copy(this.xrControls.baseQuat);
        await this.startMobileAR(session);
      }else this.xrControls.start(session);
    }catch(err){
      await session.end().catch(()=>{});
      throw err;
    }
  }
  async webXRSupported(mode='ar'){
    try{return Boolean(await navigator.xr?.isSessionSupported(
      mode==='vr'?'immersive-vr':'immersive-ar'
    ));}catch{return false;}
  }
}
