import * as THREE from 'three';
import {BRIDGE_SECTIONS,BRIDGE_DEFAULTS,bridgeGrid,bridgeSampleMembers,
  addBridgeMember,calculateBridge} from './bridge-competition-solver.mjs';

const BASE=1.2;
const STEEL_COLOUR=0x9cacb5,TIE_COLOUR=0x77bfd0,FAILED_COLOUR=0xe96d60;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const world=(n,span)=>new THREE.Vector3(n.x*BASE/span,0,n.z*BASE/span);
function lineBetween(a,b,radius,color){
  const d=b.clone().sub(a),h=d.length();
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,h,9),
    new THREE.MeshStandardMaterial({color,metalness:.2,roughness:.65}));
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  return mesh;
}
function clear(group){
  for(const child of [...group.children]){
    group.remove(child);child.traverse(obj=>{
      obj.geometry?.dispose();
      for(const m of Array.isArray(obj.material)?obj.material:[obj.material]){
        m?.map?.dispose();m?.dispose();
      }
    });
  }
}
export function bridgeReferenceGeometry(){
  return [0,BASE].map((x,i)=>{
    const geom=new THREE.BoxGeometry(.0015,.0015,.0015);
    geom.translate(x,0,0);
    return {geometry:geom,name:'Anclaje visual '+(i+1),
      ifcType:'IfcBuildingElementProxy',color:0x6d99a4,
      structural:true,analysisIncluded:false,preserveStructuralOrigin:true};
  });
}
export class BridgeCompetitionExperience {
  constructor(app){
    this.app=app;
    this.root=new THREE.Group();
    this.root.name='Concurso docente: pasarela entre mesas';
    app.contentRoot.add(this.root);
    this.root.visible=false;
    this.active=false;
    this.span_m=BRIDGE_DEFAULTS.span_m;
    this.load_kN=BRIDGE_DEFAULTS.centralLoad_kN;
    this.sectionId='bar_m';
    this.members=[];
    this.result=null;
    this.editMode=true;
    this.removeMode=false;
    this.startNode=null;
    this.selectedNode='B2';
    this.selectedMemberId=null;
    this.pickers=[];
    this.onChange=null;
    this.breakAnimation=null;
    this.detectedGap=null;
    this.bestEligibleMass_kg=null;
    this.defaultWorldQuaternion=new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-Math.PI/2,0,0));
  }
  activate(){
    this.active=true;
    this.root.visible=true;
    this.draw();
  }
  deactivate(){
    this.active=false;
    this.root.visible=false;
    this.breakAnimation=null;
    clear(this.root);this.pickers=[];
  }
  setSpan(value){
    const span=Number(value);
    if(!Number.isFinite(span)||span<.3||span>3)throw Error('Vano entre 0,30 y 3,00 m.');
    this.span_m=span;this.bestEligibleMass_kg=null;this.result=null;this.breakAnimation=null;
    if(this.app?.maxSize){
      this.app.targetMeters=span;this.app.updateScale();
    }
    this.draw();
  }
  setLoad(value){
    if(!Number.isFinite(value)||value<0||value>50)throw Error('Carga de 0 a 50 kN.');
    this.load_kN=value;
    this.bestEligibleMass_kg=null;
    this.result=null;this.breakAnimation=null;this.draw();
  }
  setSection(id){
    if(!BRIDGE_SECTIONS[id])return;
    this.sectionId=id;this.draw();
  }
  addMember(i,j,sectionId=this.sectionId){
    this.members=addBridgeMember(this.members,bridgeGrid(this.span_m),i,j,sectionId);
    this.result=null;this.breakAnimation=null;this.startNode=null;
    this.selectedMemberId=this.members.at(-1).id;
    this.draw();
  }
  removeMember(id){
    if(!this.members.some(m=>m.id===id))return;
    this.members=this.members.filter(m=>m.id!==id);
    this.result=null;this.breakAnimation=null;this.selectedMemberId=null;
    this.draw();
  }
  reset(){
    this.members=[];this.result=null;this.breakAnimation=null;
    this.startNode=null;this.selectedMemberId=null;this.detectedGap=null;
    this.draw();
  }
  sample(){
    this.members=bridgeSampleMembers();
    this.result=null;this.breakAnimation=null;this.startNode=null;
    this.draw();
  }
  evaluate(){
    this.result=calculateBridge({span_m:this.span_m,
      load_kN:this.load_kN,members:this.members});
    if(this.result.status==='stable')
      this.bestEligibleMass_kg=this.bestEligibleMass_kg===null?
        this.result.totalMass_kg:Math.min(this.bestEligibleMass_kg,this.result.totalMass_kg);
    this.breakAnimation=this.result.status==='collapse'||this.result.status==='failure'?
      {startedAt:null,partIds:new Set(this.result.broken.map(m=>m.id)),
        dropped:[]}:null;
    this.draw();
    return this.result;
  }
  chooseNode(id){
    if(!bridgeGrid(this.span_m).some(n=>n.id===id))return;
    this.selectedNode=id;
    if(this.removeMode){this.startNode=null;this.draw();return;}
    if(!this.editMode){this.startNode=null;this.draw();return;}
    if(!this.startNode){this.startNode=id;this.draw();return;}
    if(this.startNode===id){this.startNode=null;this.draw();return;}
    const start=this.startNode;
    this.startNode=null;
    this.addMember(start,id);
  }
  chooseMember(id){
    if(!this.members.some(m=>m.id===id))return;
    this.selectedMemberId=id;
    if(this.removeMode)this.removeMember(id);
    else this.draw();
  }
  pick(raycaster){
    if(!this.active)return null;
    this.app.worldRoot.updateWorldMatrix(true,true);
    const hits=raycaster.intersectObjects(this.pickers,false);
    if(!hits.length)return null;
    const result=hits[0].object.userData;
    return result.bridgeNode?{kind:'node',id:result.bridgeNode}:
      result.bridgeMember?{kind:'member',id:result.bridgeMember}:null;
  }
  draw(){
    if(!this.active)return;
    clear(this.root);this.pickers=[];
    this.breakAnimation?.dropped.splice(0);
    const nodes=bridgeGrid(this.span_m),span=this.span_m;
    const byNode=new Map(nodes.map(n=>[n.id,n]));
    const disp=new Map((this.result?.displacements??[]).map(d=>[d.nodeId,d]));
    const maxDeflection=this.result?.maxDeflection_mm??0;
    const amp=maxDeflection>1e-9?
      Math.min(500,BASE*.17/(maxDeflection*.001*BASE/span)):0;
    const pose=n=>{
      const d=disp.get(n.id);
      const p=world(n,span);
      if(d){
        p.x+=d.ux_m*amp*BASE/span;
        p.z+=d.uz_m*amp*BASE/span;
      }
      return p;
    };
    // Behind the design: a passive snap-grid spanning both supports.
    const grid=new THREE.Group();this.root.add(grid);
    const grey=new THREE.LineBasicMaterial({color:0x64808a,transparent:true,opacity:.24});
    const yRows=[0,.14,.28].map(f=>f*BASE);
    const positions=[];
    for(let c=0;c<=4;c++){
      const x=c*BASE/4;
      positions.push(x,0,0,x,0,BASE*.36);
    }
    for(const z of yRows)positions.push(0,0,z,BASE,0,z);
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    grid.add(new THREE.LineSegments(g,grey));
    for(const node of nodes){
      const p=world(node,span);
      const marker=new THREE.Mesh(new THREE.SphereGeometry(.009,10,8),
        new THREE.MeshBasicMaterial({color:0xb0c8cf,transparent:true,opacity:.65}));
      marker.position.copy(p);grid.add(marker);
    }
    // Braced support feet: distinct from design members.
    for(const n of [nodes[0],nodes[4]]){
      const p=world(n,span);
      const support=new THREE.Mesh(new THREE.ConeGeometry(.048,.072,4),
        new THREE.MeshStandardMaterial({color:0x77a79e,roughness:.78}));
      support.rotation.x=Math.PI/2;
      support.position.copy(p).add(new THREE.Vector3(0,0,-.065));
      this.root.add(support);
    }
    const results=new Map((this.result?.members??[]).map(m=>[m.id,m]));
    for(const m of this.members){
      const section=BRIDGE_SECTIONS[m.sectionId];
      const a=pose(byNode.get(m.i)),b=pose(byNode.get(m.j));
      const actual=results.get(m.id);
      const broken=this.result?.broken.some(v=>v.id===m.id);
      const colour=broken?FAILED_COLOUR:
        actual?.axial_kN>1e-7?0xd39d6c:
        actual?.axial_kN< -1e-7?0x6eaac6:
        section.kind==='tie'?TIE_COLOUR:STEEL_COLOUR;
      const width=section.kind==='tie'?.009:.016+Math.sqrt(section.A_m2)*.40;
      const beam=lineBetween(a,b,width,colour);
      beam.userData.bridgeMember=m.id;
      this.root.add(beam);
      const hit=lineBetween(a,b,Math.max(.036,width*1.7),colour);
      hit.userData.bridgeMember=m.id;
      hit.material.transparent=true;hit.material.opacity=.015;
      hit.material.depthWrite=false;hit.material.depthTest=false;
      this.root.add(hit);this.pickers.push(hit);
      if(this.breakAnimation&&m.id!==undefined){
        const object=beam;
        this.breakAnimation.dropped.push({object,origin:object.position.clone(),
          baseRotation:object.rotation.clone(),broken});
      }
    }
    for(const node of nodes){
      const p=pose(node);
      const chosen=node.id===this.startNode||node.id===this.selectedNode;
      const visual=new THREE.Mesh(new THREE.SphereGeometry(chosen?.022:.014,12,8),
        new THREE.MeshStandardMaterial({color:chosen?0xf1cf82:0xe1edf0}));
      visual.position.copy(p);this.root.add(visual);
      const picker=new THREE.Mesh(new THREE.SphereGeometry(.08,12,8),
        new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,
          opacity:.01,depthTest:false,depthWrite:false}));
      picker.position.copy(p);picker.userData.bridgeNode=node.id;
      this.root.add(picker);this.pickers.push(picker);
    }
    // Fixed central load, always applied at the lower centre node B2.
    const centre=pose(byNode.get('B2'));
    const loadDir=new THREE.Vector3(0,0,-1);
    const loadArrow=new THREE.ArrowHelper(loadDir,
      centre.clone().add(new THREE.Vector3(0,0,.39)),.32,0xe49b69,.07,.048);
    this.root.add(loadArrow);
    this.app.xrControls && (this.app.xrControls.dirty=true);
    this.onChange?.(this.result);
  }
  animate(timeMs){
    if(!this.active||!this.breakAnimation)return;
    const state=this.breakAnimation;
    if(state.startedAt===null)state.startedAt=timeMs;
    const t=clamp((timeMs-state.startedAt)/2000,0,1);
    for(const {object,origin,baseRotation,broken} of state.dropped){
      const delay=broken?0:.25;
      const u=clamp((t-delay)/(1-delay),0,1);
      object.position.copy(origin);
      object.position.z-=BASE*.65*u*u;
      object.rotation.copy(baseRotation);
      object.rotation.y+=(broken?1:.35)*u;
      if(broken)object.material.color.setHex(FAILED_COLOUR);
      object.material.opacity=1-.5*u;
      if(!object.material.transparent){object.material.transparent=true;object.material.needsUpdate=true;}
    }
  }
}
