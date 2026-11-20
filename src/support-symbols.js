// Three-dimensional glyphs for boundary conditions in SAP global XYZ (Z vertical).
// Geometry is purely explanatory; the analysis still uses the actual
// restrained_dof array for its support definitions.
import * as THREE from 'three';
import {supportInfo} from './buckling-teaching.mjs';

export function classifySupport(dof){
  if(!Array.isArray(dof)||!dof.some(Boolean))return null;
  const d=Array.from({length:6},(_,i)=>Boolean(dof[i]));
  if(d.slice(0,6).every(Boolean))return 'fixed';
  if(d.slice(0,3).every(Boolean))return 'pinned';
  if(d[2]&&(!d[0]||!d[1]))return 'roller';
  return 'partial';
}
const material=(color)=>new THREE.MeshStandardMaterial({
  color,metalness:.2,roughness:.38,transparent:true,opacity:.92
});
export function createSupportSymbol(kind,size=.35){
  const group=new THREE.Group();
  group.name='Condición de borde: '+kind;
  const steel=material(0x82bed2),base=material(0x637f8b);
  if(kind==='fixed'){
    const cube=new THREE.Mesh(new THREE.BoxGeometry(size*1.15,size*1.15,size*.34),base);
    cube.position.z=-size*.18;
    group.add(cube);
    for(let n=-2;n<=2;n++){
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-size*.53+n*size*.21,-size*.56,-size*.35),
        new THREE.Vector3(-size*.32+n*size*.21,size*.56,-size*.35)
      ]),new THREE.LineBasicMaterial({color:0xb3e3ef}));
      group.add(line);
    }
  }else{
    const cone=new THREE.Mesh(new THREE.ConeGeometry(size*.46,size*.63,4),steel);
    cone.rotation.x=Math.PI/2;
    cone.rotation.y=Math.PI/4;
    cone.position.z=-size*.35;
    group.add(cone);
    const plate=new THREE.Mesh(new THREE.BoxGeometry(size*1.16,size*1.16,size*.1),base);
    plate.position.z=-size*.72;
    group.add(plate);
    if(kind==='roller'){
      for(const x of [-.23,.23]){
        const wheel=new THREE.Mesh(new THREE.CylinderGeometry(size*.13,size*.13,size*.66,12),steel);
        wheel.rotation.x=Math.PI/2;
        wheel.position.set(x*size,0,-size*.67);
        group.add(wheel);
      }
    }
    if(kind==='fork'){
      // Two upright cheeks: the section cannot twist but bends freely.
      for(const y of [-.5,.5]){
        const cheek=new THREE.Mesh(new THREE.BoxGeometry(size*.9,size*.08,size*.75),base);
        cheek.position.set(0,y*size*.9,size*.1);
        group.add(cheek);
      }
    }
    if(kind==='baseplate'){
      const plate=new THREE.Mesh(new THREE.BoxGeometry(size*1.5,size*1.5,size*.08),material(0xb8c7cf));
      plate.position.z=-size*.04;
      group.add(plate);
    }
    if(kind==='partial'){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(size*.33,size*.045,8,18),
        material(0xf2bf73));
      ring.position.z=size*.15;
      group.add(ring);
    }
  }
  return group;
}
export function buildSupportSymbols(nodes,offset=[0,0,0],size=.35,supportGroups=[]){
  const group=new THREE.Group();
  group.name='Símbolos 3D de condiciones de borde';
  // Joints described by a support group get one symbol for the whole group.
  const grouped=new Set();
  if(supportGroups?.length){
    const byId=new Map(nodes.map(n=>[String(n.id),n]));
    const zs=nodes.map(n=>n.z);
    const zMid=(Math.min(...zs)+Math.max(...zs))/2;
    const span=Math.max(...['x','y','z'].map(k=>{const v=nodes.map(n=>n[k]);return Math.max(...v)-Math.min(...v);}));
    for(const support of supportGroups){
      const symbol=buildGroupSymbol(support,byId,offset,size,zMid,span);
      if(!symbol)continue;
      group.add(symbol);
      support.joints.forEach(j=>grouped.add(String(j)));
    }
  }
  for(const node of nodes){
    if(grouped.has(String(node.id)))continue;
    const kind=classifySupport(node.restrained_dof);
    if(!kind)continue;
    const symbol=createSupportSymbol(kind,size);
    symbol.userData={node:String(node.id),kind};
    symbol.position.set(node.x+offset[0],node.y+offset[1],node.z+offset[2]);
    group.add(symbol);
  }
  return group;
}

// --------------------------------------------------------- support groups
// Kinds placed as a single glyph at the centroid of the group; the others are
// drawn on every joint (restraint lines) or around the joint (rigid joints).
const POINT_GLYPH={FORK:'fork',PIN:'pinned',FIXED:'fixed',GUIDED:'roller',BEARING:'roller',BASEPLATE:'baseplate'};
const LINE_COLOUR=0xf2bf73,JOINT_COLOUR=0x6fe3d1;
function tagged(object,support){
  const info=supportInfo(support.kind);
  object.name=info.label+(support.place?' · '+support.place:'')+' — '+info.text;
  object.userData={support:support.id,kind:support.kind,place:support.place,label:info.label,text:info.text};
  object.traverse(o=>{if(o!==object){o.name=object.name;o.userData=object.userData;}});
  return object;
}
function buildGroupSymbol(support,byId,offset,size,zMid,span){
  const pts=support.joints.map(j=>byId.get(String(j))).filter(Boolean);
  if(!pts.length)return null;
  const at=n=>new THREE.Vector3(n.x+offset[0],n.y+offset[1],n.z+offset[2]);
  const centre=pts.reduce((c,n)=>c.add(at(n)),new THREE.Vector3()).multiplyScalar(1/pts.length);
  const extent=new THREE.Box3().setFromPoints(pts.map(at)).getSize(new THREE.Vector3());
  // Shell models: the symbol must cover the whole section of the member, and
  // restraint marks scale with the model (a 20 m frame vs a 5 m column).
  const lineSize=Math.max(size,span*.012);
  const glyph=POINT_GLYPH[support.kind];
  if(glyph){
    const symbol=createSupportSymbol(glyph,Math.max(size,1.2*Math.max(extent.x,extent.y,extent.z)));
    symbol.position.copy(centre);
    // A support at the top of a member points downwards onto it.
    if(centre.z-offset[2]>zMid)symbol.rotation.x=Math.PI;
    return tagged(symbol,support);
  }
  if(support.kind==='RIGIDJOINT'||support.kind==='ENDPLATE'){
    const box=new THREE.Box3().setFromPoints(pts.map(at));
    const dims=box.getSize(new THREE.Vector3()).addScalar(lineSize*.25);
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(dims.x,dims.y,dims.z)),
      new THREE.LineBasicMaterial({color:JOINT_COLOUR,transparent:true,opacity:.9}));
    edges.position.copy(box.getCenter(new THREE.Vector3()));
    const holder=new THREE.Group();holder.add(edges);
    return tagged(holder,support);
  }
  // Lateral restraints: a short bar along the restrained horizontal direction(s)
  // of each joint (at most ~40 marks per group to keep the scene light).
  const step=Math.max(1,Math.ceil(pts.length/40));
  const segments=[];
  for(let k=0;k<pts.length;k+=step){
    const n=pts[k],p=at(n),dof=n.restrained_dof??[];
    const dirs=[[1,0,0],[0,1,0],[0,0,1]].filter((_,i)=>dof[i]);
    for(const d of dirs.length?dirs:[[0,1,0]]){
      const v=new THREE.Vector3(...d).multiplyScalar(lineSize);
      segments.push(p.clone(),p.clone().add(v));
    }
  }
  const line=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segments),
    new THREE.LineBasicMaterial({color:LINE_COLOUR}));
  const holder=new THREE.Group();holder.add(line);
  if(support.kind==='STAY'){
    for(let k=0;k<segments.length;k+=2){
      const dot=new THREE.Mesh(new THREE.SphereGeometry(lineSize*.18,10,8),material(LINE_COLOUR));
      dot.position.copy(segments[k+1]);holder.add(dot);
    }
  }
  return tagged(holder,support);
}
