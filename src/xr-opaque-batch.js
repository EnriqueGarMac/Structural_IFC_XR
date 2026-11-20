import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Render-only batching. Original meshes remain in the scene for accurate
// selection and per-element material/visibility updates.
export class XROpaqueBatch {
  constructor(app){this.app=app;this.mesh=null;this.members=[];this.signature='';}
  clear(){
    for(const part of this.members)part.orig.visible=part._batchVisible;
    this.members=[];
    if(this.mesh){
      this.mesh.parent?.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh=null;
    }
    this.signature='';
  }
  refresh(){
    if(!this.app.isXR||!this.app.originalGroup.visible||this.app.bridgeCompetition?.active||
      this.app.mobileAR){this.clear();return;}
    const eligible=this.app.parts.filter(p=>p.orig?.isMesh&&p.orig.geometry&&
      p.orig.visible&&p.orig.material?.isMeshStandardMaterial&&
      !p.orig.material.transparent&&p.orig.material.opacity>=.999&&
      p.orig.geometry.getAttribute('position')&&
      p.orig.geometry.getAttribute('normal')&&
      !p.orig.material.map&&p.orig.material.side===THREE.DoubleSide);
    if(eligible.length<12){this.clear();return;}
    const geometries=[];
    try{
      for(const p of eligible){
        const source=p.orig.geometry;
        const g=source.index?source.toNonIndexed():source.clone();
        const pos=g.getAttribute('position'),normal=g.getAttribute('normal');
        if(!pos||!normal||pos.itemSize!==3||normal.itemSize!==3)throw Error('Unsupported geometry');
        const color=new Float32Array(pos.count*3);
        const c=p.orig.material.color;
        for(let i=0;i<pos.count;i++){color[i*3]=c.r;color[i*3+1]=c.g;color[i*3+2]=c.b;}
        const clean=new THREE.BufferGeometry();
        clean.setAttribute('position',pos.clone());
        clean.setAttribute('normal',normal.clone());
        clean.setAttribute('color',new THREE.BufferAttribute(color,3));
        geometries.push(clean);
        g.dispose();
      }
      const merged=mergeGeometries(geometries,false);
      if(!merged)throw Error('Unable to merge meshes');
      this.clear();
      const material=new THREE.MeshStandardMaterial({
        color:0xffffff,vertexColors:true,side:THREE.DoubleSide,roughness:.77
      });
      this.mesh=new THREE.Mesh(merged,material);
      this.mesh.name='XR opaque IFC batch (render only)';
      this.mesh.frustumCulled=false;
      this.app.originalGroup.add(this.mesh);
      this.members=eligible;
      for(const p of eligible){p._batchVisible=p.orig.visible;p.orig.visible=false;}
    }catch(e){this.clear();console.warn('XR batching disabled:',e);}
    finally{for(const g of geometries)g.dispose();}
  }
}
