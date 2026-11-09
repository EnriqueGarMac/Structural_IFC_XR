import * as THREE from 'three';
import {makeBeamFieldSampler} from './beam-field.mjs';

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
    this.group=new THREE.Group();app.contentRoot.add(this.group);
  }
  clear(){this.app.clearGroup(this.group);this.dynamic=[];this.modalParts=[];}
  setView(view){this.view=view;this.app.updateVisualization();}
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
      if(lo)lo.textContent='−'+(this.maxForce??0).toFixed(2);
      if(hi)hi.textContent='+'+(this.maxForce??0).toFixed(2);
      if(note)note.textContent='Valores en ejes locales · diagrama escalado visualmente';
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
  drawForces(r){
    const byFrame=r.forces?.[this.app.caseName];if(!byFrame)return;
    const key=forceKeys[this.component];
    const vals=Object.values(byFrame).flatMap(rows=>rows.map(row=>Math.abs(Number(row[key])||0)));
    const max=Math.max(1e-12,...vals),scale=(this.app.maxSize||1)*.16;
    this.maxForce=Math.max(0,...vals);
    const points=this.nodePositions(r);
    for(const f of r.frames){
      const rows=byFrame[f.id],a=points.get(f.i),b=points.get(f.j);
      if(!rows?.length||!a||!b)continue;
      const axis=b.clone().sub(a),L=axis.length();if(!L)continue;axis.normalize();
      const idx=(this.component==='M2'||this.component==='V3')?2:1;
      const local=f.local_axes?.basis_global?.[idx];
      const normal=local?new THREE.Vector3(...local):new THREE.Vector3(0,0,1).cross(axis);
      normal.addScaledVector(axis,-normal.dot(axis)).normalize();
      if(normal.lengthSq()<.5)normal.set(0,1,0).cross(axis).normalize();
      const poly=[],stems=[],colours=[];
      for(const row of [...rows].sort((x,y)=>x.station_m-y.station_m)){
        const s=Math.max(0,Math.min(L,Number(row.station_m)||0));
        const base=a.clone().addScaledVector(axis,s);
        const value=Number(row[key])||0;
        const end=base.clone().addScaledVector(normal,scale*value/max);
        poly.push(end);stems.push(base,end);
        const c=new THREE.Color(value>=0?0xf7b969:0x50d2fa);
        colours.push(c.r,c.g,c.b);
      }
      if(poly.length>1){
        const g=new THREE.BufferGeometry().setFromPoints(poly);
        g.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
        this.group.add(new THREE.Line(g,new THREE.LineBasicMaterial({vertexColors:true,depthTest:false})));
      }
      if(stems.length)this.group.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(stems),
        new THREE.LineBasicMaterial({color:0x64d6df,transparent:true,opacity:.55,depthTest:false})
      ));
    }
  }
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
