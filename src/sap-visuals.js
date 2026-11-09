import * as THREE from 'three';

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
    this.modalAmplitude=.3;this.frequency=0;this.dynamic=[];
    this.group=new THREE.Group();app.contentRoot.add(this.group);
  }
  clear(){this.app.clearGroup(this.group);this.dynamic=[];}
  setView(view){this.view=view;this.app.updateVisualization();this.refresh();this.updateLegend();}
  setComponent(key){if(forceKeys[key]){this.component=key;this.refresh();this.updateLegend();}}
  setMode(index){this.modeIndex=Number(index)||0;this.refresh();this.updateLegend();}
  setAmplitude(v){this.modalAmplitude=Math.max(0,Number(v)||0);}
  refresh(){
    this.clear();
    const r=this.app.results;if(!r)return;
    if(this.view==='forces')this.drawForces(r);
    if(this.view==='modes')this.drawMode(r);
  }
  updateLegend(){
    const r=this.app.results;if(!r||this.view==='deformation')return;
    const title=document.getElementById('legend-title');
    const lo=document.getElementById('legend-min');
    const hi=document.getElementById('legend-max');
    const note=document.getElementById('legend-note');
    if(this.view==='forces'){
      if(title)title.textContent=this.component+' | '+(['P','V2','V3'].includes(this.component)?'kN':'kN·m');
      if(lo)lo.textContent='−';
      if(hi)hi.textContent='+';
      if(note)note.textContent='Esfuerzos en ejes locales · escala normalizada por componente';
    }else if(this.view==='modes'){
      const m=r.modes?.[this.modeIndex];
      if(title)title.textContent=m?'MODO '+m.number:'SIN MODOS';
      if(lo)lo.textContent='Forma relativa';
      if(hi)hi.textContent=m?Number(m.frequency_hz).toFixed(3)+' Hz':'—';
      if(note)note.textContent='Autovector normalizado; amplitud visual arbitraria';
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
      const poly=[],stems=[];
      for(const row of [...rows].sort((x,y)=>x.station_m-y.station_m)){
        const s=Math.max(0,Math.min(L,Number(row.station_m)||0));
        const base=a.clone().addScaledVector(axis,s);
        const value=Number(row[key])||0;
        const end=base.clone().addScaledVector(normal,scale*value/max);
        poly.push(end);stems.push(base,end);
      }
      if(poly.length>1)this.group.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(poly),
        new THREE.LineBasicMaterial({color:0xffbf67,depthTest:false})
      ));
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
  updateModalAnimation(ms){
    if(this.view!=='modes')return;
    const sine=Math.sin(2*Math.PI*this.frequency*ms/1000);
    for(const {mesh,base,shape} of this.dynamic){
      const attr=mesh.geometry.getAttribute('position');
      for(let i=0;i<base.length;i++){
        const b=base[i],d=shape[i],s=sine*this.modalAmplitude;
        attr.setXYZ(i,b.x+s*d.x,b.y+s*d.y,b.z+s*d.z);
      }
      attr.needsUpdate=true;
      mesh.geometry.computeBoundingSphere();
    }
  }
}
