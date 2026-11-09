import * as THREE from 'three';
import {caseNodes,analyticalNodePositions} from './results.mjs';

// Nodal displacement inspection. The ray targets are located at the DISPLAYED
// nodes; the readout is always the true, non-amplified FEM displacement in mm.
export function displacementLabel(node,caseName){
  if(!node)return '';
  const mm=v=>(v*1000).toLocaleString('es-ES',{
    minimumFractionDigits:3,maximumFractionDigits:3});
  return 'Nodo '+node.id+' · '+caseName+'\n'+
    'Ux '+mm(node.ux)+' mm · Uy '+mm(node.uy)+' mm\n'+
    'Uz '+mm(node.uz)+' mm · |u| '+mm(node.magnitude)+' mm';
}
export class NodeDisplacementProbe {
  constructor(app){
    this.app=app;
    this.group=new THREE.Group();this.group.name='Consultar desplazamientos nodales';
    app.contentRoot.add(this.group);
    this.pickers=[];this.hoverId=null;this.pinnedId=null;
    this.highlight=new THREE.Mesh(new THREE.SphereGeometry(.085,12,8),
      new THREE.MeshBasicMaterial({color:0xffda6a,depthTest:false,
        transparent:true,opacity:.95,depthWrite:false}));
    this.highlight.visible=false;this.highlight.renderOrder=3000;
    this.group.add(this.highlight);
    this.xrTooltip=null;this.xrTooltipText='';
  }
  active(){return this.app.sapVisuals?.view==='deformation'&&Boolean(this.app.results?.cases?.length);}
  clear(){
    for(const mesh of this.pickers){
      this.group.remove(mesh);
      mesh.geometry.dispose();mesh.material.dispose();
    }
    this.pickers=[];
    this.highlight.visible=false;
    this.hoverId=null;
    this.pinnedId=null;
    this.hideXRHover();
  }
  refresh(){
    this.clear();
    if(!this.active())return;
    const app=this.app;
    const nodes=caseNodes(app.results,app.caseName,app.offset);
    const displayed=analyticalNodePositions(nodes,app.amp,
      app.showDeformed);
    const radius=Math.max(.035,(app.maxSize||1)*.014);
    const pickRadius=radius*2.3;
    this.highlight.geometry.dispose();
    this.highlight.geometry=new THREE.SphereGeometry(radius*1.9,12,8);
    for(const n of displayed){
      const mesh=new THREE.Mesh(
        new THREE.SphereGeometry(pickRadius,10,8),
        new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,
          opacity:.012,depthTest:false,depthWrite:false})
      );
      mesh.position.set(n.x,n.y,n.z);
      mesh.renderOrder=1400;
      mesh.userData.displacementNode={id:n.id,ux:n.ux,uy:n.uy,uz:n.uz,
        magnitude:n.magnitude,caseName:app.caseName};
      this.group.add(mesh);this.pickers.push(mesh);
    }
  }
  pick(raycaster){
    if(!this.active()||!this.pickers.length)return null;
    if(this.app.worldRoot?.updateWorldMatrix)
      this.app.worldRoot.updateWorldMatrix(true,true);
    const hits=raycaster.intersectObjects(this.pickers,false);
    if(!hits.length)return null;
    const obj=hits[0].object;
    const point=new THREE.Vector3();obj.getWorldPosition(point);
    return {...obj.userData.displacementNode,
      point,localPoint:obj.position.clone()};
  }
  showHover(data){
    if(!data){
      if(!this.pinnedId)this.highlight.visible=false;
      else this._highlightId(this.pinnedId);
      return;
    }
    this.hoverId=data.id;
    this.highlight.position.copy(data.localPoint);
    this.highlight.visible=true;
  }
  _highlightId(id){
    const mesh=this.pickers.find(m=>m.userData.displacementNode.id===id);
    if(!mesh){this.highlight.visible=false;return;}
    this.highlight.position.copy(mesh.position);this.highlight.visible=true;
  }
  pin(data){
    this.pinnedId=data?.id??null;
    if(data)this._highlightId(data.id);
    else if(!this.hoverId)this.highlight.visible=false;
  }
  makeLabel(text){
    const canvas=document.createElement('canvas');
    canvas.width=840;canvas.height=230;
    const c=canvas.getContext('2d');
    c.fillStyle='rgba(10,29,42,.94)';
    c.beginPath();c.roundRect(5,5,830,220,20);c.fill();
    c.strokeStyle='#82d7eb';c.lineWidth=5;c.stroke();
    c.textAlign='center';c.textBaseline='middle';
    for(const [i,line] of text.split('\n').entries()){
      c.fillStyle=i===0?'#f9db98':'#eaf9ff';
      c.font=i===0?'bold 40px system-ui':'32px system-ui';
      c.fillText(line,420,52+i*70,810);
    }
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({
      map:texture,transparent:true,depthTest:false,depthWrite:false
    }));
    sprite.scale.set(.78,.22,1);
    sprite.renderOrder=25000;
    return sprite;
  }
  ensureXRTooltip(){
    if(this.xrTooltip||typeof document==='undefined')return;
    this.xrTooltip=this.makeLabel('Nodo');
    this.xrTooltip.visible=false;
    this.app.scene.add(this.xrTooltip);
  }
  inspectXRRay(raycaster){
    const data=this.pick(raycaster);
    if(!data){this.hideXRHover();return null;}
    this.showHover(data);
    this.ensureXRTooltip();
    if(this.xrTooltip){
      const text=displacementLabel(data,data.caseName);
      if(text!==this.xrTooltipText){
        const sprite=this.makeLabel(text);
        this.xrTooltip.material.map?.dispose();
        this.xrTooltip.material.map=sprite.material.map;
        sprite.material.map=null;sprite.material.dispose();
        this.xrTooltip.material.needsUpdate=true;this.xrTooltipText=text;
      }
      this.xrTooltip.position.copy(data.point).add(new THREE.Vector3(0,.19,0));
      this.xrTooltip.visible=true;
    }
    return data;
  }
  hideXRHover(){
    if(this.xrTooltip)this.xrTooltip.visible=false;
    this.hoverId=null;
    if(!this.pinnedId)this.highlight.visible=false;
    else this._highlightId(this.pinnedId);
  }
}
