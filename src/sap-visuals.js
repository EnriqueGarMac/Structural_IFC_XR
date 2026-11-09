import * as THREE from 'three';
import {makeBeamFieldSampler} from './beam-field.mjs';
import {FORCE_COMPONENTS,readForceStations,forceSegments,characteristicStations,
  makeForcePatchCoordinates,forceReadoutFromPoint} from './force-diagrams.mjs';

// Fallback geometry: analytical frame rods, not exact section extrusions.
export function makeSAPGeometry(results){
  const nodes=new Map(results.nodes.map(n=>[n.id,new THREE.Vector3(n.x,n.y,n.z)]));
  const pts=[...nodes.values()],extent=new THREE.Box3().setFromPoints(pts).getSize(new THREE.Vector3()).length()||1;
  const pieces=[];
  for(const f of results.frames){
    const a=nodes.get(f.i),b=nodes.get(f.j);
    if(!a||!b)continue;
    const direction=b.clone().sub(a),length=direction.length();
    if(length<1e-9)continue;
    const section=results.sections?.[f.section];
    const width=Number(section?.t2_m)||extent*.015;
    const depth=Number(section?.t3_m)||extent*.015;
    const rad=Math.min(length*.18,Math.max(extent*.003,Math.min(extent*.025,Math.min(width,depth)*.23)));
    const geometry=new THREE.CylinderGeometry(rad,rad,length,10);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
    const midpoint=a.clone().add(b).multiplyScalar(.5);
    geometry.translate(midpoint.x,midpoint.y,midpoint.z);
    pieces.push({geometry,name:'SAP barra '+f.id,color:0x9ac8d1,ifcType:'SapFrame'});
  }
  return pieces;
}

const forceKeys={P:'P_kN',V2:'V2_kN',V3:'V3_kN',T:'T_kNm',M2:'M2_kNm',M3:'M3_kNm'};
export class SAPVisuals{
  constructor(app){
    this.app=app;this.view='deformation';this.component='M3';this.modeIndex=0;
    this.modalAmplitude=.3;this.frequency=0;this.visualHz=.65;this.dynamic=[];this.modalParts=[];this.frameNumber=0;
    this.showCharacteristics=false;this.characteristicSprites=[];this.forceMeshes=[];this.forceMin=0;this.forceMax=0;
    this.xrTooltip=null;this.xrTooltipText='';
    this.group=new THREE.Group();app.contentRoot.add(this.group);
  }
  clear(){
    // Three.js Sprite uses a shared geometry; remove texture labels before the
    // application's generic geometry-disposal traversal runs.
    for(const sprite of this.characteristicSprites){
      this.group.remove(sprite);
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
    this.characteristicSprites=[];
    this.app.clearGroup(this.group);
    this.dynamic=[];this.modalParts=[];this.forceMeshes=[];
    this.hideXRHover();
  }
  setCharacteristics(enabled){
    this.showCharacteristics=Boolean(enabled);
    if(this.view==='forces')this.refresh();
    this.app.xrControls && (this.app.xrControls.dirty=true);
  }
  setView(view){this.view=view;this.app.updateVisualization();if(view!=='forces')this.hideXRHover();}
  setComponent(key){if(forceKeys[key]){this.component=key;this.refresh();this.updateLegend();}}
  setMode(index){this.modeIndex=Number(index)||0;this.app.updateVisualization();}
  setAmplitude(v){this.modalAmplitude=Math.max(0,Number(v)||0);this.updateModalAnimation(performance.now());}
  refresh(){
    this.clear();
    const r=this.app.results;if(!r)return;
    if(this.view==='forces')this.drawForces(r);
    if(this.view==='modes'){this.drawMode(r);this.prepareModalMeshes(r);}
  }
  updateLegend(){
    const r=this.app.results;if(!r||this.view==='deformation')return;
    const title=document.getElementById('legend-title');
    const lo=document.getElementById('legend-min');
    const hi=document.getElementById('legend-max');
    const note=document.getElementById('legend-note');
    if(this.view==='forces'){
      if(title)title.textContent=this.component+' | '+(['P','V2','V3'].includes(this.component)?'kN':'kN·m');
      if(lo)lo.textContent=(this.forceMin??0).toFixed(2);
      if(hi)hi.textContent=(this.forceMax??0).toFixed(2);
      if(note)note.textContent=(this.maxForce??0)<1e-10?
        'Este componente no presenta esfuerzos distintos de cero en el caso seleccionado.':
        'Cian: negativo · ámbar: positivo · valores en ejes locales';
    }else if(this.view==='modes'){
      const m=r.modes?.[this.modeIndex];
      if(title)title.textContent=m?'MODO '+m.number:'SIN MODOS';
      if(lo)lo.textContent='Forma relativa';
      if(hi)hi.textContent=m?Number(m.frequency_hz).toFixed(3)+' Hz':'—';
      if(note)note.textContent='Forma normalizada · animación lenta ilustrativa, no tiempo real';
    }
  }
  nodePositions(r){
    return new Map(r.nodes.map(n=>[n.id,new THREE.Vector3(
      n.x+this.app.offset[0],n.y+this.app.offset[1],n.z+this.app.offset[2]
    )]));
  }
  // An analytical filled diagram is an extrusion between the zero-line and the
  // SAP station values. Each sign zone is a separately raycastable mesh.
  drawForces(r){
    const key=FORCE_COMPONENTS[this.component]?.field;
    const byFrame=r.forces?.[this.app.caseName]??{};
    const values=Object.values(byFrame).flatMap(rows=>
      (Array.isArray(rows)?rows:[]).map(row=>Number(row[key])).filter(Number.isFinite));
    this.forceMin=values.length?Math.min(0,...values):0;
    this.forceMax=values.length?Math.max(0,...values):0;
    this.maxForce=Math.max(Math.abs(this.forceMin),Math.abs(this.forceMax));
    const denom=Math.max(1e-12,this.maxForce);
    const amplitude=(this.app.maxSize||1)*.16/denom;
    const nodes=this.nodePositions(r);
    const unit=FORCE_COMPONENTS[this.component]?.unit??'';
    for(const f of r.frames){
      const a=nodes.get(f.i),b=nodes.get(f.j);
      if(!a||!b)continue;
      const beam=b.clone().sub(a),L=beam.length();if(L<1e-10)continue;
      const axis=beam.clone().normalize();
      const idx=(this.component==='M2'||this.component==='V3')?2:1;
      const local=f.local_axes?.basis_global?.[idx];
      const normal=local?.length===3?
        new THREE.Vector3(...local):new THREE.Vector3(0,0,1).cross(axis);
      normal.addScaledVector(axis,-normal.dot(axis)).normalize();
      if(normal.lengthSq()<1e-10){
        normal.set(0,1,0).cross(axis).normalize();
        if(normal.lengthSq()<1e-10)normal.set(1,0,0).cross(axis).normalize();
      }
      const stations=readForceStations(byFrame[f.id],this.component,L);
      if(!stations.length)continue;
      const segments=forceSegments(stations);
      const outline=[];
      const stems=[];
      for(const seg of segments){
        const positions=makeForcePatchCoordinates(seg,a.toArray(),axis.toArray(),
          normal.toArray(),amplitude);
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
        geometry.computeVertexNormals();
        const colour=seg.sign<0?0x48bbd8:seg.sign>0?0xf5b364:0xa1b9c0;
        const material=new THREE.MeshBasicMaterial({
          color:colour,transparent:true,opacity:.62,side:THREE.DoubleSide,
          depthWrite:false,depthTest:true
        });
        const mesh=new THREE.Mesh(geometry,material);
        mesh.renderOrder=12;
        mesh.userData.forceSegment={segment:seg,frameId:f.id,
          component:this.component,caseName:this.app.caseName,
          origin:a.toArray(),axis:axis.toArray()};
        this.group.add(mesh);
        this.forceMeshes.push(mesh);
      }
      // Crisp top-edge and subdued station rods: helps the students read shape.
      for(const row of stations){
        const base=a.clone().addScaledVector(axis,row.station);
        const tip=base.clone().addScaledVector(normal,row.value*amplitude);
        outline.push(tip);
        stems.push(base,tip);
      }
      if(outline.length>1)this.group.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(outline),
        new THREE.LineBasicMaterial({color:0xf3faff,transparent:true,opacity:.84,
          depthTest:false})
      ));
      if(stems.length)this.group.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(stems),
        new THREE.LineBasicMaterial({color:0xa7e8ef,transparent:true,opacity:.24,
          depthTest:false})
      ));
      if(this.showCharacteristics&&typeof document!=='undefined'){
        for(const p of characteristicStations(stations,3)){
          const value=Math.abs(p.value)<1e-9?0:p.value;
          const sign=value>0?'+':'';
          const line='B'+f.id+' '+p.role+' · '+sign+value.toFixed(2)+' '+unit;
          const tag=this.makeLabel(line,value>=0?'#f9c786':'#77d5eb');
          const point=a.clone().addScaledVector(axis,p.station)
            .addScaledVector(normal,value*amplitude);
          // Lift the tag off the diagram so it remains legible from either side.
          point.addScaledVector(normal,(this.app.maxSize||1)*.045);
          tag.position.copy(point);
          const size=(this.app.maxSize||1);
          tag.scale.set(size*.23,size*.061,1);
          tag.renderOrder=90;
          this.group.add(tag);this.characteristicSprites.push(tag);
        }
      }
    }
  }
  makeLabel(label,foreground='#f9e9c1'){
    const canvas=document.createElement('canvas');
    canvas.width=640;canvas.height=150;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='rgba(8,29,41,.93)';
    ctx.beginPath();ctx.roundRect(5,6,630,138,20);ctx.fill();
    ctx.strokeStyle='rgba(119,207,221,.8)';ctx.lineWidth=4;ctx.stroke();
    ctx.fillStyle=foreground;ctx.font='bold 42px system-ui, Arial';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(label,320,77,608);
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.SpriteMaterial({map:texture,transparent:true,
      depthTest:false,depthWrite:false});
    return new THREE.Sprite(material);
  }
  // Pointer and WebXR ray intersections use the exact same SAP station data.
  pickForce(raycaster){
    if(this.view!=='forces'||!this.forceMeshes.length)return null;
    if(this.app.worldRoot?.updateWorldMatrix)this.app.worldRoot.updateWorldMatrix(true,true);
    else this.app.contentRoot.updateMatrixWorld(true);
    const hits=raycaster.intersectObjects(this.forceMeshes,false);
    if(!hits.length)return null;
    const hit=hits[0],meta=hit.object.userData.forceSegment;
    const toLocal=(p)=>{
      const v=this.app.contentRoot.worldToLocal(new THREE.Vector3(...p));
      return v.toArray();
    };
    const readout=forceReadoutFromPoint(meta.segment,hit.point.toArray(),toLocal,
      meta.origin,meta.axis,meta.frameId,meta.component,meta.caseName);
    return {...readout,point:hit.point.clone()};
  }
  ensureXRTooltip(){
    if(this.xrTooltip || typeof document==='undefined')return;
    const label=this.makeLabel('Esfuerzo','#e8fbff');
    // World-space billboard attached to the XR scene, not the transformed SAP root.
    label.scale.set(.55,.14,1);
    label.material.depthTest=false;label.renderOrder=25000;
    label.visible=false;this.app.scene.add(label);
    this.xrTooltip=label;
  }
  inspectXRRay(raycaster){
    const data=this.pickForce(raycaster);
    if(!data){this.hideXRHover();return null;}
    this.ensureXRTooltip();
    const sign=data.value>0?'+':'';
    const line='B'+data.frameId+'  '+data.component+' '+sign+data.value.toFixed(2)+' '+data.unit+
      '  ·  s='+data.station.toFixed(2)+' m';
    if(this.xrTooltip){
      if(this.xrTooltipText!==line){
        const sprite=this.makeLabel(line,data.value>=0?'#f9c786':'#77d5eb');
        this.xrTooltip.material.map?.dispose();
        this.xrTooltip.material.map=sprite.material.map;
        sprite.material.map=null;
        sprite.material.dispose();
        this.xrTooltip.material.needsUpdate=true;
        this.xrTooltipText=line;
      }
      this.xrTooltip.position.copy(data.point).add(new THREE.Vector3(0,.12,0));
      this.xrTooltip.visible=true;
    }
    return data;
  }
  hideXRHover(){if(this.xrTooltip)this.xrTooltip.visible=false;}

  drawMode(r){
    const mode=r.modes?.[this.modeIndex];if(!mode)return;
    this.frequency=Number(mode.frequency_hz)||0;
    const points=this.nodePositions(r);
    for(const f of r.frames){
      const a=points.get(f.i),b=points.get(f.j);if(!a||!b)continue;
      const displacements=mode.frameCurves?.[f.id]??[
        mode.jointShape?.[f.i]??[0,0,0],mode.jointShape?.[f.j]??[0,0,0]];
      if(displacements.length<2)continue;
      const base=displacements.map((_,i)=>a.clone().lerp(b,i/(displacements.length-1)));
      const shape=displacements.map(d=>new THREE.Vector3(...d));
      const mesh=new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(base),
        new THREE.LineBasicMaterial({color:0xffc16b,depthTest:false})
      );
      this.group.add(mesh);this.dynamic.push({mesh,base,shape});
    }
    this.updateModalAnimation(0);
  }
  prepareModalMeshes(r){
    this.modalParts=[];
    const mode=r.modes?.[this.modeIndex];if(!mode)return;
    const sample=makeBeamFieldSampler(r,{mode,offset:this.app.offset});
    let max=0;
    for(const part of this.app.parts){
      const shape=new Float32Array(part.base.length);
      for(let j=0;j<shape.length;j+=3){
        const [ux,uy,uz,mag]=sample(part.base[j],part.base[j+1],part.base[j+2]);
        shape[j]=ux;shape[j+1]=uy;shape[j+2]=uz;max=Math.max(max,mag);
      }
      this.modalParts.push({part,shape});
    }
    const cold=new THREE.Color(0x51b4d9),hot=new THREE.Color(0xf2b766);
    for(const {part,shape} of this.modalParts){
      const attr=part.deformed.geometry.getAttribute('color');
      const heat=part.deformed.geometry.getAttribute('heat');
      for(let i=0;i<shape.length;i+=3){
        const mag=Math.hypot(shape[i],shape[i+1],shape[i+2])/(max||1);
        const c=cold.clone().lerp(hot,mag);
        attr.setXYZ(i/3,c.r,c.g,c.b);
        heat.setX(i/3,mag);
      }
      attr.needsUpdate=true;heat.needsUpdate=true;
    }
    this.updateModalAnimation(0);
  }
  updateModalAnimation(ms){
    if(this.view!=='modes')return;
    // Real eigenfrequencies are shown in the legend, while playback is slowed
    // so modes above the headset frame rate do not alias.
    const sine=Math.sin(2*Math.PI*this.visualHz*ms/1000);
    for(const {mesh,base,shape} of this.dynamic){
      const attr=mesh.geometry.getAttribute('position');
      for(let i=0;i<base.length;i++){
        const b=base[i],d=shape[i],s=sine*this.modalAmplitude;
        attr.setXYZ(i,b.x+s*d.x,b.y+s*d.y,b.z+s*d.z);
      }
      attr.needsUpdate=true;
      mesh.geometry.computeBoundingSphere();
    }
    this.frameNumber++;
    for(const {part,shape} of this.modalParts){
      const attr=part.deformed.geometry.getAttribute('position');
      const base=part.base,s=this.modalAmplitude*sine;
      for(let j=0;j<shape.length;j++)attr.array[j]=base[j]+s*shape[j];
      attr.needsUpdate=true;
      if(this.frameNumber%4===0){
        part.deformed.geometry.computeVertexNormals();
        part.deformed.geometry.computeBoundingSphere();
      }
    }
  }
}
