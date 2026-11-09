import * as THREE from 'three';
import {reactionSummary,reactionText} from './reactions.mjs';

// Render the exact SAP2000 joint reactions as world-axis force arrows and
// right-hand-rule moment circles. Lengths/radii are illustrative only.
const directions=[
  new THREE.Vector3(1,0,0),
  new THREE.Vector3(0,1,0),
  new THREE.Vector3(0,0,1)
];
const palette=[0xffb26c,0x86e0a8,0x5dc7f2];
const absMax=(rows,key)=>Math.max(0,...rows.flatMap(x=>x[key].map(Math.abs)));
export class ReactionVisuals{
  constructor(app){
    this.app=app;
    this.group=new THREE.Group();
    this.group.name='Reacciones en apoyos';
    app.contentRoot.add(this.group);
    this.showValues=false;this.pickers=[];this.labels=[];
    this.xrTooltip=null;this.xrTooltipText='';
    this.lastSummary=null;
  }
  clear(){
    for(const label of this.labels){
      this.group.remove(label);
      label.material.map?.dispose();
      label.material.dispose();
    }
    this.labels=[];this.pickers=[];
    this.app.clearGroup(this.group);
    this.hideXRHover();
  }
  setValues(visible){
    this.showValues=Boolean(visible);
    this.refresh();
    if(this.app.xrControls)this.app.xrControls.dirty=true;
  }
  isActive(){return this.app.sapVisuals?.view==='reactions';}
  refresh(){
    this.clear();
    if(!this.isActive()||!this.app.results)return;
    this.draw(this.app.results);
    this.updateLegend();
  }
  makeLabel(text,colour='#defaff'){
    const canvas=document.createElement('canvas');
    canvas.width=820;canvas.height=196;
    const c=canvas.getContext('2d');
    c.fillStyle='rgba(10,32,47,.95)';
    c.beginPath();c.roundRect(6,6,808,184,24);c.fill();
    c.strokeStyle='rgba(114,202,220,.75)';c.lineWidth=5;c.stroke();
    c.fillStyle=colour;c.font='bold 36px system-ui,Arial';
    c.textAlign='center';c.textBaseline='middle';
    const lines=text.split('\n');
    const y0=98-((lines.length-1)*23);
    for(let i=0;i<lines.length;i++)c.fillText(lines[i],410,y0+46*i,775);
    const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;
    return new THREE.Sprite(new THREE.SpriteMaterial({
      map:t,transparent:true,depthTest:false,depthWrite:false
    }));
  }
  draw(results){
    const summary=reactionSummary(results.jointReactions,this.app.caseName);
    this.lastSummary=summary;
    const pts=new Map(results.nodes.map(n=>[
      String(n.id),new THREE.Vector3(n.x+this.app.offset[0],
        n.y+this.app.offset[1],n.z+this.app.offset[2])
    ]));
    const span=this.app.maxSize||1;
    const maxForce=absMax(summary.rows,'force_kN');
    const maxMoment=absMax(summary.rows,'moment_kNm');
    const toleranceForce=Math.max(1e-10,maxForce*1e-8);
    const toleranceMoment=Math.max(1e-10,maxMoment*1e-8);
    for(const row of summary.rows){
      const center=pts.get(row.node);if(!center)continue;
      // Amber dot indicates the joint where SAP2000 reports a reaction.
      const dot=new THREE.Mesh(new THREE.SphereGeometry(span*.022,12,8),
        new THREE.MeshBasicMaterial({color:0xffdc99,depthTest:false}));
      dot.position.copy(center);dot.renderOrder=55;this.group.add(dot);
      const picker=new THREE.Mesh(new THREE.SphereGeometry(span*.082,12,10),
        new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,
          opacity:0,depthWrite:false}));
      picker.position.copy(center);
      picker.userData.reactionNode=String(row.node);
      picker.userData.reaction=row;
      this.group.add(picker);this.pickers.push(picker);
      for(let k=0;k<3;k++){
        const val=row.force_kN[k];if(Math.abs(val)<=toleranceForce)continue;
        const direction=directions[k].clone().multiplyScalar(Math.sign(val));
        const length=span*(.12+.19*Math.abs(val)/Math.max(1e-12,maxForce));
        const arrow=new THREE.ArrowHelper(direction,center,length,palette[k],
          Math.max(span*.027,length*.25),Math.max(span*.013,length*.095));
        arrow.name='F'+['x','y','z'][k]+' = '+val.toFixed(3)+' kN';
        this.group.add(arrow);
      }
      for(let k=0;k<3;k++){
        const value=row.moment_kNm[k];if(Math.abs(value)<=toleranceMoment)continue;
        const axis=directions[k];
        const basis=new THREE.Vector3(k===0?0:1,k===1?0:0,k===2?0:1);
        // Select a stable radial basis orthogonal to axis.
        if(Math.abs(basis.dot(axis))>.5)basis.set(0,1,0);
        basis.addScaledVector(axis,-basis.dot(axis)).normalize();
        const tangent=axis.clone().cross(basis).normalize();
        const radius=span*(.07+.045*Math.abs(value)/Math.max(1e-12,maxMoment));
        const points=[];
        const turns=Math.sign(value);
        for(let j=0;j<=32;j++){
          const a=turns*(.1+Math.PI*1.65*j/32);
          points.push(center.clone().addScaledVector(basis,Math.cos(a)*radius)
            .addScaledVector(tangent,Math.sin(a)*radius));
        }
        this.group.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({color:palette[k],depthTest:false})
        ));
        const tip=points.at(-1),start=points.at(-2);
        const heading=tip.clone().sub(start).normalize();
        const cone=new THREE.Mesh(
          new THREE.ConeGeometry(span*.026,span*.066,10),
          new THREE.MeshBasicMaterial({color:palette[k],depthTest:false})
        );
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),heading);
        cone.position.copy(tip);
        this.group.add(cone);
      }
      if(this.showValues && typeof document!=='undefined'){
        const f=row.force_kN,m=row.moment_kNm;
        const fmt=(value)=>Math.abs(value)<1e-9?'0':(value>0?'+':'')+value.toFixed(2);
        const text='Nudo '+row.node+' · F: ('+f.map(fmt).join(', ')+') kN\n'+
          'M: ('+m.map(fmt).join(', ')+') kN·m';
        const tag=this.makeLabel(text);
        const height=span*.095+Math.max(0,...f.map(Math.abs))/Math.max(maxForce,1e-12)*span*.33;
        tag.position.copy(center).add(new THREE.Vector3(0,0,height));
        tag.scale.set(span*.67,span*.16,1);
        tag.renderOrder=200;this.group.add(tag);this.labels.push(tag);
      }
    }
  }
  updateLegend(){
    if(typeof document==='undefined'||!this.isActive())return;
    const summary=this.lastSummary??{force:[0,0,0],rows:[]};
    const [rx,ry,rz]=summary.force;
    const set=(id,value)=>{const element=document.getElementById(id);if(element)element.textContent=value;};
    set('legend-title','REACCIONES · GLOBAL XYZ');
    set('legend-min','ΣRx '+rx.toFixed(2)+' kN');
    set('legend-max','ΣRz '+rz.toFixed(2)+' kN');
    set('legend-note',summary.rows.length?
      'ΣRy '+ry.toFixed(2)+' kN · Flechas: fuerza (kN); arcos: momento (kN·m). Longitudes ilustrativas.':
      'Este caso no contiene reacciones exportadas. No se calculan automáticamente.');
  }
  pick(raycaster){
    if(!this.isActive()||!this.pickers.length)return null;
    this.app.worldRoot?.updateWorldMatrix(true,true);
    const hits=raycaster.intersectObjects(this.pickers,false);
    if(!hits.length)return null;
    const obj=hits[0].object,center=new THREE.Vector3();
    obj.getWorldPosition(center);
    return {node:obj.userData.reactionNode,
      reaction:obj.userData.reaction,point:center,caseName:this.app.caseName};
  }
  ensureXRTooltip(){
    if(this.xrTooltip||typeof document==='undefined')return;
    const sprite=this.makeLabel('Reacciones','#d5f9ff');
    sprite.scale.set(.80,.19,1);sprite.material.depthTest=false;
    sprite.renderOrder=22000;sprite.visible=false;
    this.app.scene.add(sprite);this.xrTooltip=sprite;
  }
  inspectXRRay(raycaster){
    const hit=this.pick(raycaster);
    if(!hit){this.hideXRHover();return null;}
    this.ensureXRTooltip();
    const r=hit.reaction;
    const line='Nudo '+hit.node+' · '+hit.caseName+'\n'+reactionText(r,2);
    if(this.xrTooltip&&this.xrTooltipText!==line){
      const fresh=this.makeLabel(line);
      this.xrTooltip.material.map?.dispose();
      this.xrTooltip.material.map=fresh.material.map;
      fresh.material.map=null;fresh.material.dispose();
      this.xrTooltip.material.needsUpdate=true;this.xrTooltipText=line;
    }
    if(this.xrTooltip){
      this.xrTooltip.position.copy(hit.point).add(new THREE.Vector3(0,.19,0));
      this.xrTooltip.visible=true;
    }
    return hit;
  }
  hideXRHover(){if(this.xrTooltip)this.xrTooltip.visible=false;}
}
