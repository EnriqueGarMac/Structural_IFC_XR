import * as THREE from 'three';
import {caseNodes,analyticalNodePositions} from './results.mjs';

// A snapshot exporter for AR Quick Look. The USDZ is created locally on the
// user's iPhone from the currently loaded IFC/SAP geometry; no server upload.
export function buildStructuralARScene(app,maximumTriangles=150000){
  if(!app.parts?.length)throw Error('Primero carga un IFC o el modelo de demostración.');
  const scene=new THREE.Scene(),root=new THREE.Group();
  root.quaternion.copy(app.worldRoot.quaternion);
  root.scale.copy(app.worldRoot.scale);
  const content=new THREE.Group();
  content.position.copy(app.contentRoot.position);
  root.add(content);scene.add(root);
  let triangles=0;
  const addMesh=(mesh)=>{
    const copy=mesh.clone(false);
    // Preserve the current per-vertex displaced geometry and colours.
    copy.geometry=mesh.geometry.clone();
    copy.material=mesh.material.clone();
    copy.material.side=THREE.DoubleSide;
    const count=copy.geometry.index?.count??copy.geometry.getAttribute('position')?.count??0;
    triangles+=count/3;
    if(triangles>maximumTriangles)throw Error('Modelo demasiado complejo para AR móvil. Reduce el IFC o usa un modelo más pequeño.');
    content.add(copy);
  };
  try{
    if(!app.showSAPOnly){
      for(const part of app.parts){
        if(app.hideGround&&part.terrain)continue;
        if(app.originalGroup.visible&&part.orig.visible)addMesh(part.orig);
        if(app.deformedGroup.visible&&part.deformed.visible)addMesh(part.deformed);
      }
    }else{
      if(!app.results?.frames?.length)throw Error('La vista Solo SAP requiere un JSON con barras analíticas.');
      const nodes=analyticalNodePositions(
        caseNodes(app.results,app.caseName,app.offset),
        app.amp,app.showDeformed&&Boolean(app.results.cases?.length));
      const points=new Map(nodes.map(n=>[n.id,new THREE.Vector3(n.x,n.y,n.z)]));
      const r=Math.max(.012,(app.maxSize||8)*.0035);
      const material=new THREE.MeshStandardMaterial({color:0x6bdec9,roughness:.7});
      const barGeometry=new THREE.CylinderGeometry(r,r,1,7);
      const up=new THREE.Vector3(0,1,0);
      if(app.showFrames)for(const bar of app.results.frames){
        const a=points.get(bar.i),b=points.get(bar.j);
        if(!a||!b)continue;
        const v=b.clone().sub(a),length=v.length();
        if(length<1e-7)continue;
        const mesh=new THREE.Mesh(barGeometry,material);
        mesh.position.copy(a).add(b).multiplyScalar(.5);
        mesh.quaternion.setFromUnitVectors(up,v.normalize());
        mesh.scale.y=length;
        content.add(mesh);triangles+=12;
        if(triangles>maximumTriangles)throw Error('Modelo SAP demasiado grande para exportar.');
      }
      if(app.showFrames){
        const jointGeometry=new THREE.SphereGeometry(r*1.75,7,5);
        for(const point of points.values()){
          const mesh=new THREE.Mesh(jointGeometry,material);
          mesh.position.copy(point);content.add(mesh);triangles+=70;
          if(triangles>maximumTriangles)throw Error('Demasiados nudos para exportar al móvil.');
        }
      }
    }
    if(!content.children.length)throw Error('No hay elementos visibles para exportar.');
    // Centre the preview on an estimated horizontal support plane.
    const bounds=new THREE.Box3().setFromObject(root);
    const centre=bounds.getCenter(new THREE.Vector3());
    root.position.set(-centre.x,-bounds.min.y,-centre.z);
    return scene;
  }catch(e){
    scene.traverse(o=>{if(o.geometry&&o.parent===content)o.geometry.dispose();});
    throw e;
  }
}
export async function exportStructuralUSDZ(app){
  const scene=buildStructuralARScene(app);
  try{
    const {USDZExporter}=await import('three/addons/exporters/USDZExporter.js');
    const buffer=await new USDZExporter().parseAsync(scene,{
      quickLookCompatible:true,
      maxTextureSize:512,
      ar:{anchoring:{type:'plane'},planeAnchoring:{alignment:'horizontal'}}
    });
    return new Blob([buffer],{type:'model/vnd.usdz+zip'});
  }finally{
    scene.traverse(o=>{
      if(o.geometry&&o.parent?.isGroup)o.geometry.dispose();
      // Materials from IFC clones are owned by the export scene.
      if(o.material&&o.parent?.isGroup){
        (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose?.());
      }
    });
  }
}
