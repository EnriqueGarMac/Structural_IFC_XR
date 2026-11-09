// Three-dimensional glyphs for boundary conditions in SAP global XYZ (Z vertical).
// Geometry is purely explanatory; the analysis still uses the actual
// restrained_dof array for its support definitions.
import * as THREE from 'three';

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
    if(kind==='partial'){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(size*.33,size*.045,8,18),
        material(0xf2bf73));
      ring.position.z=size*.15;
      group.add(ring);
    }
  }
  return group;
}
export function buildSupportSymbols(nodes,offset=[0,0,0],size=.35){
  const group=new THREE.Group();
  group.name='Símbolos 3D de condiciones de borde';
  for(const node of nodes){
    const kind=classifySupport(node.restrained_dof);
    if(!kind)continue;
    const symbol=createSupportSymbol(kind,size);
    symbol.userData={node:String(node.id),kind};
    symbol.position.set(node.x+offset[0],node.y+offset[1],node.z+offset[2]);
    group.add(symbol);
  }
  return group;
}
