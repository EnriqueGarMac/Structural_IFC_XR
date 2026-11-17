import * as THREE from 'three';
import {TRUSS_LESSON,defaultTrussLoads,normaliseTrussLoads,solveTruss2D} from './truss-solver.mjs';
import {resultColourHex} from './visual-palettes.mjs';

const V=(n)=>new THREE.Vector3(n.x,0,n.z);

const COLORS={tension:0xd89b56,compression:0x5eabc1,neutral:0x90a1a8,
  selected:0xf2d28b,base:0x75838a,load:0xef8659,reaction:0x7dc2a5};
function cylinderBetween(a,b,radius,color){
  const start=V(a),end=V(b),direction=end.clone().sub(start);
  const mesh=new THREE.Mesh(
    new THREE.CylinderGeometry(radius,radius,direction.length(),10,1),
    new THREE.MeshStandardMaterial({color,roughness:.68,metalness:.10}));
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  return mesh;
}
function shapeMember(a,b,radius=.065){
  const m=cylinderBetween(a,b,radius,0x90a1a8);
  const geometry=m.geometry;
  geometry.applyQuaternion(m.quaternion);
  geometry.translate(...m.position.toArray());
  m.material.dispose();
  return geometry;
}
export function trussGeometry(model=TRUSS_LESSON){
  const byId=new Map(model.nodes.map(n=>[n.id,n]));
  return model.bars.map(bar=>({
    name:'Celosía · barra '+bar.id,ifcType:'IfcMember',
    geometry:shapeMember(this.nodeMap.get(bar.i),this.nodeMap.get(bar.j),.045),
    color:COLORS.base,structural:true,analysisIncluded:false,
    preserveStructuralOrigin:true
  }));
}
function clearGroup(group){
  for(const obj of [...group.children]){
    group.remove(obj);
    obj.traverse(item=>{
      item.geometry?.dispose();
      const mats=Array.isArray(item.material)?item.material:[item.material];
      mats.forEach(mat=>mat?.dispose());
    });
  }
}
function arrow(group,start,vector,color,scale){
  const direction=new THREE.Vector3(vector.x,0,vector.z);
  const norm=direction.length();
  if(norm<1e-10)return;
  const length=Math.min(1.15,.46+.48*norm/Math.max(scale,1e-3));
  const a=new THREE.ArrowHelper(direction.normalize(),start,length,color,.23,.115);
  group.add(a);
}
export class TrussExperience {
  constructor(app){
    this.app=app;
    this.root=new THREE.Group();
    this.root.name='Experiencia docente: celosía articulada';
    this.app.contentRoot.add(this.root);
    this.root.visible=false;
    this.active=false;
    this.model=TRUSS_LESSON;
    this.nodeMap=new Map(this.model.nodes.map(n=>[n.id,n]));
    this.loads=defaultTrussLoads();
    this.selectedNode='G';
    this.selectedBarId=null;
    this.mode='axial';
    this.result=solveTruss2D(this.model,this.loads);
    this.pickNodes=[];
    this.pickBars=[];
    this.onChange=null;
  }
  activate(){
    this.active=true;this.root.visible=true;
    this.app.showOriginal=true;
    this.draw();
  }
  deactivate(){
    this.active=false;this.root.visible=false;
    clearGroup(this.root);this.pickNodes=[];this.pickBars=[];
    this.selectedBarId=null;
  }
  setModel(model,{loads=[]}={}){
    const result=solveTruss2D(model,loads);
    this.model=model;
    this.nodeMap=new Map(model.nodes.map(n=>[n.id,n]));
    this.loads=normaliseTrussLoads(model,loads);
    this.result=result;
    this.selectedNode=model.nodes[0].id;
    this.selectedBarId=null;
    this.draw();
  }
  assignSupports(fixedNode,rollerNode){
    if(fixedNode===rollerNode)throw Error('Los apoyos deben estar en nodos diferentes.');
    if(!this.nodeMap.has(fixedNode)||!this.nodeMap.has(rollerNode))
      throw Error('Selecciona dos nodos existentes.');
    const model={...this.model,nodes:this.model.nodes.map(n=>({
      ...n,fixX:n.id===fixedNode,fixZ:n.id===fixedNode||n.id===rollerNode
    }))};
    const result=solveTruss2D(model,this.loads);
    this.model=model;this.nodeMap=new Map(model.nodes.map(n=>[n.id,n]));
    this.result=result;this.draw();
  }
  getLoad(nodeId=this.selectedNode){
    return this.loads.find(l=>l.nodeId===nodeId)??{nodeId,fx_kN:0,fz_kN:0};
  }
  setLoad(nodeId,fx_kN,fz_kN){
    if(!this.nodeMap.has(nodeId))throw Error('Nodo desconocido '+nodeId);
    if(!Number.isFinite(fx_kN)||!Number.isFinite(fz_kN))
      throw Error('Las cargas deben ser números finitos.');
    const remaining=this.loads.filter(l=>l.nodeId!==nodeId);
    this.loads=normaliseTrussLoads(this.model,
      [...remaining,{nodeId,fx_kN,fz_kN}]);
    this.selectedNode=nodeId;
    this.calculate();
  }
  changeNode(step){
    const nodes=this.model.nodes;
    const i=nodes.findIndex(n=>n.id===this.selectedNode);
    this.selectNode(nodes[(i+step+nodes.length)%nodes.length].id);
  }
  selectNode(nodeId){
    if(!this.nodeMap.has(nodeId))return false;
    this.selectedNode=nodeId;
    this.selectedBarId=null;
    this.draw();
    return true;
  }
  selectBar(id){
    if(!this.result.bars.some(b=>b.id===id))return false;
    this.selectedBarId=id;
    this.draw();return true;
  }
  getSelectedBar(){
    return this.result.bars.find(b=>b.id===this.selectedBarId)??null;
  }
  adjustSelected(component,delta){
    const old=this.getLoad();
    this.setLoad(this.selectedNode,old.fx_kN+(component==='x'?delta:0),
      old.fz_kN+(component==='z'?delta:0));
  }
  reset(){this.loads=this.model===TRUSS_LESSON?defaultTrussLoads():[];
    this.selectedNode=this.model===TRUSS_LESSON?'G':this.model.nodes[0].id;
    this.selectedBarId=null;this.calculate();}
  clearLoads(){this.loads=[];this.calculate();}
  setMode(mode){
    if(!['axial','stress','strain','displacement'].includes(mode))return;
    this.mode=mode;this.draw();
  }
  calculate(){
    // Solve first, so an invalid load cannot leave half-updated graphics.
    this.result=solveTruss2D(this.model,this.loads);
    this.draw();
  }
  draw(){
    if(!this.active)return;
    clearGroup(this.root);this.pickNodes=[];this.pickBars=[];
    const result=this.result,disp=new Map(result.displacements.map(d=>[d.nodeId,d]));
    const maxU=result.maxDisplacement_m;
    // Visual deformation only. Physical displacements remain unscaled.
    const amp=maxU>1e-12?Math.min(1200,.23/maxU):1;
    this.deformationAmplification=amp;
    const moved=node=>{
      const d=disp.get(node.id);
      return {x:node.x+d.ux_m*amp,z:node.z+d.uz_m*amp};
    };
    const maxBar=Math.max(1e-10,...result.bars.map(b=>Math.abs(
      this.mode==='stress'?b.stress_MPa:this.mode==='strain'?b.strain:b.axial_kN)));
    const maxNode=Math.max(maxU,1e-12);
    for(const bar of result.bars){
      const na=this.nodeMap.get(bar.i),nb=this.nodeMap.get(bar.j);
      const da=disp.get(bar.i),db=disp.get(bar.j);
      let color=bar.axial_kN>1e-6?COLORS.tension:
        bar.axial_kN< -1e-6?COLORS.compression:COLORS.neutral;
      if(this.mode==='displacement'){
        const t=(da.magnitude_m+db.magnitude_m)/(2*maxNode);
        color=resultColourHex(t,'classic');
      }else if(this.mode==='stress'||this.mode==='strain'){
        // Signed sign remains unambiguous. Magnitude adjusts saturation.
        const t=Math.abs(this.mode==='stress'?bar.stress_MPa:bar.strain)/maxBar;
        color=new THREE.Color(color).lerp(new THREE.Color(0xa8b6ba),.45*(1-t)).getHex();
      }
      const mesh=cylinderBetween(moved(na),moved(nb),bar.id===this.selectedBarId?.095:.067,
        bar.id===this.selectedBarId?COLORS.selected:color);
      mesh.userData={trussBarId:bar.id};
      this.root.add(mesh);this.pickBars.push(mesh);
    }
    for(const node of this.model.nodes){
      const p=moved(node);
      const isSelected=node.id===this.selectedNode;
      const marker=new THREE.Mesh(
        new THREE.SphereGeometry(isSelected?.20:.155,16,10),
        new THREE.MeshStandardMaterial({color:isSelected?COLORS.selected:0xd5e4e6,
          metalness:.16,roughness:.54}));
      marker.position.set(p.x,0,p.z);
      marker.userData={trussNodeId:node.id};
      this.root.add(marker);this.pickNodes.push(marker);
      // Transparent, slightly larger hit target improves Quest controller and mobile touch.
      const hitMesh=new THREE.Mesh(new THREE.SphereGeometry(.31,12,8),
        new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,
          opacity:.006,depthTest:false,depthWrite:false}));
      hitMesh.position.copy(marker.position);
      hitMesh.userData={trussNodeId:node.id};
      this.root.add(hitMesh);this.pickNodes.push(hitMesh);
      if(node.fixX||node.fixZ){
        const support=new THREE.Mesh(new THREE.ConeGeometry(.24,.30,3),
          new THREE.MeshStandardMaterial({color:0x699d9c,roughness:.85}));
        support.rotation.x=Math.PI/2;
        support.position.set(p.x,0,p.z-.38);
        this.root.add(support);
        if(!node.fixX){
          for(const offset of [-.12,.12]){
            const roller=new THREE.Mesh(new THREE.SphereGeometry(.078,9,6),
              new THREE.MeshStandardMaterial({color:0xa4b7b8}));
            roller.position.set(p.x+offset,0,p.z-.60);this.root.add(roller);
          }
        }
      }
    }
    const maxLoad=Math.max(1,...this.loads.flatMap(l=>[Math.abs(l.fx_kN),Math.abs(l.fz_kN)]));
    for(const l of this.loads){
      const n=moved(this.nodeMap.get(l.nodeId));
      if(Math.abs(l.fx_kN)>1e-9)arrow(this.root,
        new THREE.Vector3(n.x,0,n.z+.23),{x:l.fx_kN,z:0},COLORS.load,maxLoad);
      if(Math.abs(l.fz_kN)>1e-9)arrow(this.root,
        new THREE.Vector3(n.x+.17,0,n.z),{x:0,z:l.fz_kN},COLORS.load,maxLoad);
    }
    const maxR=Math.max(1,...result.reactions.flatMap(r=>[Math.abs(r.rx_kN),Math.abs(r.rz_kN)]));
    for(const r of result.reactions){
      const n=moved(this.nodeMap.get(r.nodeId));
      if(Math.abs(r.rx_kN)>1e-8)arrow(this.root,
        new THREE.Vector3(n.x,0,n.z-.20),{x:r.rx_kN,z:0},COLORS.reaction,maxR);
      if(Math.abs(r.rz_kN)>1e-8)arrow(this.root,
        new THREE.Vector3(n.x-.17,0,n.z-.20),{x:0,z:r.rz_kN},COLORS.reaction,maxR);
    }
    this.root.updateWorldMatrix(true,true);
    this.app.xrControls && (this.app.xrControls.dirty=true);
    this.onChange?.(this.result);
  }
  pick(raycaster){
    if(!this.active)return null;
    this.app.worldRoot.updateWorldMatrix(true,true);
    const nodes=raycaster.intersectObjects(this.pickNodes,false);
    if(nodes.length)return {kind:'node',id:nodes[0].object.userData.trussNodeId};
    const bars=raycaster.intersectObjects(this.pickBars,false);
    if(bars.length)return {kind:'bar',id:bars[0].object.userData.trussBarId};
    return null;
  }
}
