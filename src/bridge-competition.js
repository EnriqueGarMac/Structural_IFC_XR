import * as THREE from 'three';
import {planeFromDetection} from './ar-placement.mjs';
import {forceSignColour,resultColourHex} from './visual-palettes.mjs';
import {makeAxialLabel} from './teaching-axial-label.js';
import {createBridgeCollapseDynamics,stepBridgeCollapseDynamics,
  resolveBridgeCylinderFloor} from './bridge-collapse-dynamics.mjs';
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
    this.mode='axial';
    this.palette='classic';this.ampFactor=1;this.showAxialLabels=false;
    this.undeformedView=false;
    this.editMode=true;
    this.removeMode=false;
    this.startNode=null;
    this.addMode=false;
    this.previewPoint=null;
    this.previewMesh=null;
    this.selectedNode='B2';
    this.selectedMemberId=null;
    this.pickers=[];
    this.onChange=null;
    this.breakAnimation=null;
    this.detectedGap=null;
    this.collisionFloorZ=null;
    this.floorSurface=null;
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
    clear(this.root);this.pickers=[];this.floorSurface=null;this.previewMesh=null;
  }
  setSpan(value){
    const span=Number(value);
    if(!Number.isFinite(span)||span<.3||span>3)throw Error('Vano entre 0,30 y 3,00 m.');
    this.span_m=span;this.bestEligibleMass_kg=null;this.result=null;this.breakAnimation=null;
    this.collisionFloorZ=null;
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
  setPalette(palette){this.palette=palette;this.draw();}
  setAmplification(factor){
    const n=Number(factor);
    if(!Number.isFinite(n)||n<0||n>10)throw Error('Amplificación de 0 a 10.');
    this.ampFactor=n;
    if(this.undeformedView)this.undeformedView=false;
    this.draw();
  }
  setAxialLabels(enabled){this.showAxialLabels=Boolean(enabled);this.draw();}
  setUndeformedView(enabled){
    this.undeformedView=Boolean(enabled);
    // Returning to the reference geometry stops, but does not delete, the
    // illustrative failure animation; the computed results are retained.
    if(this.undeformedView)this.breakAnimation=null;
    this.draw();
  }
  setMode(mode){
    if(!['axial','stress','utilization','displacement'].includes(mode))return;
    this.mode=mode;this.draw();
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
    this.startNode=null;this.addMode=false;this.previewPoint=null;
    this.selectedMemberId=null;this.detectedGap=null;
    this.collisionFloorZ=null;
    this.draw();
  }
  sample(){
    this.members=bridgeSampleMembers();
    this.result=null;this.breakAnimation=null;this.startNode=null;
    this.addMode=false;this.previewPoint=null;
    this.draw();
  }
  evaluate(){
    this.undeformedView=false;
    this.result=calculateBridge({span_m:this.span_m,
      load_kN:this.load_kN,members:this.members});
    if(this.result.status==='stable')
      this.bestEligibleMass_kg=this.bestEligibleMass_kg===null?
        this.result.totalMass_kg:Math.min(this.bestEligibleMass_kg,this.result.totalMass_kg);
    // Serviceability alone never triggers a collapse animation.
    // Follow the ordered failure sequence reported by the member-removal solver.
    this.breakAnimation=['collapse','failure'].includes(this.result.status)?
      {startedAt:null,sequence:this.result.broken.map(m=>m.id),dropped:[]}:null;
    this.draw();
    return this.result;
  }
  beginAdd(){
    this.editMode=true;this.removeMode=false;
    this.addMode=true;this.startNode=null;this.previewPoint=null;
    this.draw();
  }
  cancelAdd(){this.addMode=false;this.startNode=null;this.previewPoint=null;this.draw();}
  designRayPoint(raycaster){
    // The canvas and the bridge share a local XZ plane (Y=0). Intersect
    // the pointer ray with that plane rather than selecting overlapping
    // transparent rod and node meshes in the increasingly dense lattice.
    this.root.updateWorldMatrix(true,false);
    const inverse=this.root.matrixWorld.clone().invert();
    const origin=raycaster.ray.origin.clone().applyMatrix4(inverse);
    const direction=raycaster.ray.direction.clone().transformDirection(inverse);
    if(Math.abs(direction.y)<1e-7)return null;
    const distance=-origin.y/direction.y;
    if(!Number.isFinite(distance)||distance<0)return null;
    return origin.addScaledVector(direction,distance);
  }
  pickDesignNode(raycaster){
    if(!this.active)return null;
    const point=this.designRayPoint(raycaster);
    if(!point)return null;
    const nearest=bridgeGrid(this.span_m).reduce((best,n)=>{
      const p=world(n,this.span_m);
      const distance=Math.hypot(p.x-point.x,p.z-point.z);
      return distance<best.distance?{distance,id:n.id}:best;
    },{distance:Infinity,id:null});
    // Grid spacing is 0.084 m vertically in the displayed 1.2 m plane.
    // A 0.023 m snap radius is comfortably below half that distance.
    return nearest.distance<=.023?{kind:'node',id:nearest.id}:null;
  }
  updatePreviewRay(raycaster){
    if(!this.active||!this.addMode||!this.startNode||!this.previewMesh)return;
    const intersection=this.designRayPoint(raycaster);
    if(!intersection)return;
    const snapped=this.pickDesignNode(raycaster);
    const node=snapped&&bridgeGrid(this.span_m).find(n=>n.id===snapped.id);
    const point=node?world(node,this.span_m):intersection;
    this.previewPoint=point.clone();this.positionPreview(point);
  }
  positionPreview(point){
    if(!this.previewMesh||!this.startNode)return;
    const start=bridgeGrid(this.span_m).find(n=>n.id===this.startNode);
    if(!start)return;
    const a=world(start,this.span_m),b=point.clone();b.y=0;
    const delta=b.clone().sub(a),length=delta.length();
    this.previewMesh.visible=length>1e-5;
    if(length<1e-5)return;
    this.previewMesh.position.copy(a).add(b).multiplyScalar(.5);
    this.previewMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
    this.previewMesh.scale.y=length;
  }
  chooseNode(id){
    if(!bridgeGrid(this.span_m).some(n=>n.id===id))return;
    this.selectedNode=id;
    if(this.removeMode){this.startNode=null;this.draw();return;}
    if(!this.editMode){this.startNode=null;this.draw();return;}
    if(!this.addMode){this.selectedNode=id;this.draw();return;}
    if(!this.startNode){this.startNode=id;this.draw();return;}
    if(this.startNode===id){this.startNode=null;this.draw();return;}
    const start=this.startNode;
    try{
      this.addMember(start,id);
      this.addMode=false;this.startNode=null;this.previewPoint=null;
      this.draw();
    }catch(error){this.startNode=start;this.draw();throw error;}
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
    // A nearby rod's generous hit target should not block selection of
    // a small grid node when finishing the second endpoint.
    const nodeHit=hits.find(hit=>hit.object.userData.bridgeNode);
    const result=(nodeHit??hits[0]).object.userData;
    return result.bridgeNode?{kind:'node',id:result.bridgeNode}:
      result.bridgeMember?{kind:'member',id:result.bridgeMember}:null;
  }
  draw(){
    if(!this.active)return;
    clear(this.root);this.pickers=[];
    if(this.breakAnimation){this.breakAnimation.dropped=[];this.breakAnimation.nodeMarkers=[];
      this.breakAnimation.physics=null;this.breakAnimation.startedAt=null;this.breakAnimation.lastStep=null;}
    const nodes=bridgeGrid(this.span_m),span=this.span_m;
    const byNode=new Map(nodes.map(n=>[n.id,n]));
    const disp=new Map((this.result?.displacements??[]).map(d=>[d.nodeId,d]));
    const maxDeflection=this.result?.maxDeflection_mm??0;
    const amp=!this.undeformedView&&maxDeflection>1e-9?
      Math.min(500,BASE*.17/(maxDeflection*.001*BASE/span))*this.ampFactor:0;
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
    const positions=[];
    for(let c=0;c<=8;c++){
      const x=c*BASE/8;
      positions.push(x,0,0,x,0,BASE*.28);
    }
    for(let r=0;r<=4;r++){
      const z=r*BASE*.28/4;
      positions.push(0,0,z,BASE,0,z);
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    grid.add(new THREE.LineSegments(g,grey));
    for(const node of nodes){
      const p=world(node,span);
      const marker=new THREE.Mesh(new THREE.SphereGeometry(.006,10,8),
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
      const failure=this.result?.broken.find(v=>v.id===m.id);
      const broken=Boolean(failure);
      let colour=actual?forceSignColour(actual.axial_kN,this.palette):
        section.kind==='tie'?TIE_COLOUR:STEEL_COLOUR;
      if(actual&&!broken){
        if(this.mode==='utilization'){
          const u=Math.min(1,Math.max(0,actual.utilization||0));
          colour=resultColourHex(u,this.palette);
        }else if(this.mode==='displacement'){
          const da=disp.get(m.i),db=disp.get(m.j);
          const max=Math.max(1e-9,...this.result.displacements.map(d=>d.magnitude_m||Math.hypot(d.ux_m,d.uz_m)));
          const aU=da?.magnitude_m??Math.hypot(da?.ux_m||0,da?.uz_m||0);
          const bU=db?.magnitude_m??Math.hypot(db?.ux_m||0,db?.uz_m||0);
          colour=resultColourHex(Math.min(1,(aU+bU)/(2*max)),this.palette);
        }else if(this.mode==='stress'){
          const max=Math.max(1e-9,...this.result.members.map(x=>Math.abs(x.stress_MPa||0)));
          colour=new THREE.Color(colour).lerp(new THREE.Color(0x9cacb5),
            .55*(1-Math.min(1,Math.abs(actual.stress_MPa||0)/max))).getHex();
        }
      }
      // Draw a physical-equivalent circular area in the normalized 1.2 m
      // span. The displayed diameter scales with the physical span, while
      // a modest upper clamp avoids visually massive teaching rods.
      const width=clamp(Math.sqrt(section.A_m2/Math.PI)*BASE/span,
        section.kind==='tie'?.002:.003,.015);
      const beam=lineBetween(a,b,width,colour);
      beam.userData.bridgeMember=m.id;
      this.root.add(beam);
      // A load in the interior of a continuous bar causes bending.
      // Draw the simply-supported elastic curve with the same display
      // amplification, instead of moving the load-point marker away from
      // an apparently straight (but bending) bar.
      const bending=this.result?.bending;
      if(!this.undeformedView&&bending?.memberId===m.id&&section.I_m4>0){
        const L=bending.length_m,at=L*bending.t,other=L-at;
        const E=section.E_kN_m2,I=section.I_m4,P=bending.load_kN;
        const points=[];
        for(let k=0;k<=14;k++){
          const fraction=k/14,x=fraction*L;
          const deflection=x<=at?
            P*other*x*(L*L-other*other-x*x)/(6*L*E*I):
            P*at*(L-x)*(L*L-at*at-(L-x)*(L-x))/(6*L*E*I);
          const point=a.clone().lerp(b,fraction);
          point.z-=deflection*amp*BASE/span;
          points.push(point);
        }
        beam.visible=false;
        beam.userData.curvedPieces=[];
        for(let k=0;k<points.length-1;k++){
          const segment=lineBetween(points[k],points[k+1],width,colour);
          segment.userData.bridgeMember=m.id;
          this.root.add(segment);
          beam.userData.curvedPieces.push(segment);
        }
      }
      if(this.showAxialLabels&&actual){
        const label=makeAxialLabel(actual.axial_kN,beam.position.clone().add(
          new THREE.Vector3(0,-.07,.07)),{scale:.14});
        if(label)this.root.add(label);
      }
      const hit=lineBetween(a,b,Math.max(.012,width*1.6),colour);
      hit.userData.bridgeMember=m.id;
      hit.material.transparent=true;hit.material.opacity=.015;
      hit.material.depthWrite=false;hit.material.depthTest=false;
      this.root.add(hit);this.pickers.push(hit);
      if(this.breakAnimation){
        const index=this.breakAnimation.sequence.indexOf(m.id);
        let fragments=null;
        if(index>=0){
          // Two separate half-bars replace the intact member at fracture.
          const mid=a.clone().add(b).multiplyScalar(.5);
          fragments=[
            lineBetween(a,mid,width,FAILED_COLOUR),
            lineBetween(mid,b,width,FAILED_COLOUR)
          ].map((piece,k)=>{
            piece.visible=false;
            this.root.add(piece);
            return {object:piece,origin:piece.position.clone(),
              baseRotation:piece.quaternion.clone(),
              length:piece.geometry.parameters.height,radius:width,
              index,fragment:k};
          });
        }
        this.breakAnimation.dropped.push({
          id:m.id,i:m.i,j:m.j,
          failureMode:failure?.mode??null,
          object:beam,origin:beam.position.clone(),
          baseRotation:beam.quaternion.clone(),
          length:a.distanceTo(b),radius:width,
          index:index>=0?index:this.breakAnimation.sequence.length+
            this.members.findIndex(other=>other.id===m.id),
          fragments
        });
      }
    }
    const assignedNodes=new Set(this.members.flatMap(m=>[m.i,m.j]));
    for(const node of nodes){
      // Grid points without assigned members remain stationary design guides.
      // B2 can mark a load applied within a member without becoming a joint.
      const p=assignedNodes.has(node.id)?pose(node):world(node,span);
      const chosen=node.id===this.startNode||node.id===this.selectedNode;
      const visual=new THREE.Mesh(new THREE.SphereGeometry(chosen?.016:.009,12,8),
        new THREE.MeshStandardMaterial({color:chosen?0xf1cf82:0xe1edf0}));
      visual.position.copy(p);this.root.add(visual);
      if(this.breakAnimation&&assignedNodes.has(node.id))
        this.breakAnimation.nodeMarkers.push({id:node.id,object:visual});
      const picker=new THREE.Mesh(new THREE.SphereGeometry(.017,12,8),
        new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,
          opacity:.01,depthTest:false,depthWrite:false}));
      picker.position.copy(p);picker.userData.bridgeNode=node.id;
      this.root.add(picker);this.pickers.push(picker);
    }
    // The ghost bar is independent of the calculated structure and follows
    // the pointer until a second grid node is selected.
    if(this.addMode&&this.startNode){
      this.previewMesh=new THREE.Mesh(
        new THREE.CylinderGeometry(clamp(Math.sqrt(BRIDGE_SECTIONS[this.sectionId].A_m2/Math.PI)*BASE/span,
          .002,.015),clamp(Math.sqrt(BRIDGE_SECTIONS[this.sectionId].A_m2/Math.PI)*BASE/span,
          .002,.015),1,8),
        new THREE.MeshBasicMaterial({color:0xf4db90,transparent:true,opacity:.7,
          depthTest:false,depthWrite:false}));
      this.previewMesh.renderOrder=12000;
      this.root.add(this.previewMesh);
      this.positionPreview(this.previewPoint??world(
        byNode.get(this.startNode),this.span_m));
    }
    // Fixed central load at B2. The arrow tip, not its centre, must coincide
    // with the load point. An unused grid point stays at its reference position.
    const centre=assignedNodes.has('B2')?pose(byNode.get('B2')):
      world(byNode.get('B2'),span);
    const loadDir=new THREE.Vector3(0,0,-1);
    const arrowLength=.16;
    const loadArrow=new THREE.ArrowHelper(loadDir,
      centre.clone().add(new THREE.Vector3(0,0,arrowLength)),
      arrowLength,0xe49b69,.05,.035);
    loadArrow.name='Carga central B2';
    this.root.add(loadArrow);
    if(this.breakAnimation){
      const floorZ=this.collisionFloorZ??(-.75*BASE/this.span_m);
      this.breakAnimation.physics=createBridgeCollapseDynamics(
        nodes.map(n=>({...n,x:pose(n).x,z:pose(n).z})),
        this.members.map(m=>{
          const section=BRIDGE_SECTIONS[m.sectionId];
          return {...m,tie:section.kind==='tie',
            radius:clamp(Math.sqrt(section.A_m2/Math.PI)*BASE/span,
              section.kind==='tie'?.002:.003,.015)};
        }),[],floorZ
      );
      // Show where impact is actually calculated. Without a visual contact
      // plane, an otherwise grounded rod appears to float or pass through
      // an imagined floor (especially in the desktop perspective camera).
      const floor=new THREE.Group();
      floor.name='Plano de colisión de la pasarela';
      const surface=new THREE.Mesh(
        new THREE.PlaneGeometry(BASE*1.8,BASE*.55),
        new THREE.MeshBasicMaterial({color:0x7798a3,side:THREE.DoubleSide,
          transparent:true,opacity:.10,depthWrite:false}));
      surface.position.set(BASE*.5,0,0);
      floor.add(surface);
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-BASE*.38,0,0),
        new THREE.Vector3(BASE*1.38,0,0)]),
        new THREE.LineBasicMaterial({color:0x8cc6cd,transparent:true,
          opacity:.65,depthTest:false}));
      floor.add(line);
      floor.position.z=floorZ;
      floor.renderOrder=-1;
      this.root.add(floor);
      this.floorSurface=floor;
    }
    this.app.xrControls && (this.app.xrControls.dirty=true);
    this.onChange?.(this.result);
  }
  observeFloor(frame,referenceSpace){
    if(!this.active||!this.breakAnimation||!this.detectedGap||
      !frame?.detectedPlanes||!referenceSpace)return;
    const tableY=this.detectedGap.start.y;
    let nearest=null;
    for(const plane of frame.detectedPlanes){
      let candidate;
      try{candidate=planeFromDetection(plane,frame,referenceSpace);}catch{continue;}
      if(!candidate||candidate.top>=tableY-.25||candidate.top<tableY-2.5)continue;
      const label=candidate.label.toLowerCase();
      if(label&&label!=='floor'&&label!=='unknown')continue;
      if(!nearest||candidate.top>nearest.top)nearest=candidate;
    }
    if(nearest){
      // Transform the detected real-world floor through the *current*
      // bridge model matrix, including Quest placement, scale and rotation.
      this.root.updateWorldMatrix(true,false);
      const floorPoint=this.root.worldToLocal(
        new THREE.Vector3(this.detectedGap.start.x,nearest.top,
          this.detectedGap.start.z));
      if(Number.isFinite(floorPoint.z)){
        this.collisionFloorZ=floorPoint.z;
        if(this.floorSurface)this.floorSurface.position.z=floorPoint.z;
      }
    }
  }
  animate(timeMs){
    if(!this.active||!this.breakAnimation)return;
    const state=this.breakAnimation;
    if(state.startedAt===null){state.startedAt=timeMs;state.lastStep=timeMs;}
    const elapsed=(timeMs-state.startedAt)/1000;
    const physics=state.physics;
    if(!physics)return;
    const dt=Math.max(0,Math.min(.06,(timeMs-state.lastStep)/1000));
    state.lastStep=timeMs;
    physics.floorZ=this.collisionFloorZ??(-.75*BASE/this.span_m);
    if(this.floorSurface)this.floorSurface.position.z=physics.floorZ;
    // Let the identified element fracture before structural nodes start
    // moving. Surviving members retain compatible shared endpoints.
    if(elapsed>.38){
      // Remove failed members exactly when their fracture becomes visible.
      // The remaining constraints then redistribute motion between nodes.
      state.sequence.forEach((id,i)=>{
        if(elapsed<.38+i*.22||physics.broken.has(id))return;
        physics.broken.add(id);
        physics.edges=physics.edges.filter(edge=>edge.id!==id);
      });
      for(let i=0;i<Math.max(1,Math.ceil(dt/.016));i++)
        stepBridgeCollapseDynamics(physics,dt/Math.max(1,Math.ceil(dt/.016)));
    }
    for(const {id,object} of state.nodeMarkers){
      const p=physics.positions.get(id);
      if(p)object.position.set(p.x,0,p.z);
    }
    for(const part of state.dropped){
      const first=state.sequence.indexOf(part.id);
      if(first>=0){
        const start=.38+first*.22;
        const t=Math.max(0,elapsed-start);
        // Material yielding receives an amber warning before fracture;
        // buckling bends visibly before separating. A geometric mechanism
        // has no invented member fracture because it has no failed member.
        const warning=Math.max(0,Math.min(1,(elapsed-(start-.3))/.3));
        if(t<=0&&warning>0&&part.failureMode==='yield'){
          part.object.material.color.setHex(0xf2b24c);
          for(const segment of part.object.userData.curvedPieces??[])
            segment.material.color.setHex(0xf2b24c);
        }
        if(t<=0&&warning>0&&part.failureMode==='buckling'){
          part.object.position.copy(part.origin);
          part.object.position.y-=.04*warning;
          part.object.quaternion.copy(part.baseRotation);
          part.object.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0,0,1),.18*warning));
        }
        part.object.visible=t<=0&&!part.object.userData.curvedPieces;
        for(const segment of part.object.userData.curvedPieces??[])
          segment.visible=t<=0;
        if(part.fragments)for(const fragment of part.fragments){
          fragment.object.visible=t>0;
          if(t<=0)continue;
          const q=fragment.object.quaternion;
          q.copy(fragment.baseRotation);
          q.multiply(new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0,1,0),Math.min(1.6,t)*(fragment.fragment?-.7:.7)));
          fragment.object.position.copy(fragment.origin);
          fragment.object.position.x+=(fragment.fragment?1:-1)*Math.min(t*.07,.14);
          fragment.object.position.z-=1.75*t*t;
          const axis=new THREE.Vector3(0,1,0).applyQuaternion(q);
          const contact=resolveBridgeCylinderFloor(fragment.object.position.z,
            axis.z,fragment.length,fragment.radius,physics.floorZ);
          fragment.object.position.z=contact.centerZ;
        }
        continue;
      }
      // Unbroken bar follows its two moving nodes without separating at
      // shared joints. Fixed supports do not fall arbitrarily.
      const a=physics.positions.get(part.i),b=physics.positions.get(part.j);
      if(!a||!b)continue;
      const p1=new THREE.Vector3(a.x,0,a.z),p2=new THREE.Vector3(b.x,0,b.z);
      const axis=p2.clone().sub(p1);
      const length=axis.length();
      if(length<1e-6)continue;
      part.object.position.copy(p1).add(p2).multiplyScalar(.5);
      part.object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis.normalize());
      part.object.scale.y=length/part.length;
    }
  }
}
