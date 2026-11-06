import * as THREE from 'three';

// Structural coordinates in this viewer are Z-up. The app's worldRoot then
// rotates them into Three.js Y-up coordinates. The reference plane must be
// a child of worldRoot; otherwise it can look detached after model scaling,
// rotation, or a switch between desktop and XR.
export function makeStructuralGroundGrid(bounds){
  if(!bounds||bounds.isEmpty())throw Error('Se necesitan los límites de la estructura.');
  const footprint=bounds.getSize(new THREE.Vector3());
  const size=Math.max(footprint.x,footprint.y,1)*1.20;
  const divisions=Math.max(8,Math.min(48,Math.ceil(size/1.5)));
  const grid=new THREE.GridHelper(size,divisions,0x6edbd3,0x355969);
  grid.rotation.x=Math.PI/2;  // local XZ grid -> structural XY at Z=0
  grid.position.set(0,0,0);
  grid.material.transparent=true;
  grid.material.opacity=.48;
  grid.material.depthWrite=false;
  grid.name='Plano de referencia estructural: Z=0';
  return grid;
}

export function makeColumnFootMarkers(items,{radius=.24}={}){
  const markers=new THREE.Group();
  markers.name='Arranques pilares: cota estructural Z=0';
  for(const piece of items){
    if(String(piece.ifcType||'').toUpperCase()!=='IFCCOLUMN')continue;
    const geometry=piece.geometry;
    if(!geometry)continue;
    if(!geometry.boundingBox)geometry.computeBoundingBox();
    const bbox=geometry.boundingBox;
    // Marker is deliberately tied to the true COLUMN FOOT coordinate, not
    // the bottom of a hidden footing or a bounding-box-centred model.
    const x=(bbox.min.x+bbox.max.x)/2;
    const y=(bbox.min.y+bbox.max.y)/2;
    const z=bbox.min.z;
    const ring=new THREE.Mesh(
      new THREE.RingGeometry(radius,radius*1.35,32),
      new THREE.MeshBasicMaterial({
        color:0x7fe9d5,side:THREE.DoubleSide,transparent:true,
        opacity:.85,depthWrite:false
      })
    );
    ring.position.set(x,y,z+.002);
    ring.name='Arranque '+(piece.name||'pilar')+' · Z='+z.toFixed(3);
    markers.add(ring);
  }
  return markers;
}
