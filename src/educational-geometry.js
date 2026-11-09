import * as THREE from 'three';

// Shared elementary geometry used by the viewer and by the IFC export
// definitions. IFC representations are generated from these exact dimensions.
export function geometryFromParts(parts){
  return parts.filter(p=>p.type!=='space').map(part=>{
    let geometry;
    if(part.type==='member'){
      const a=new THREE.Vector3(...part.a),b=new THREE.Vector3(...part.b);
      const diff=b.clone().sub(a),len=diff.length();
      geometry=new THREE.BoxGeometry(len,part.width,part.depth);
      geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(1,0,0),diff.normalize()));
      geometry.translate(...a.add(b).multiplyScalar(.5).toArray());
    }else{
      geometry=new THREE.BoxGeometry(...part.size);
      geometry.translate(...part.center);
    }
    return {name:part.name,ifcType:part.ifcType,color:part.color,
      geometry,preserveStructuralOrigin:true,structural:part.structural===true,
      storey:part.storey??null};
  });
}
