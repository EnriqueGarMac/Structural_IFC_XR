import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// XR-only, render-only batching for static BIM details. The individual
// originals remain in the graph (hidden from rendering) for element picking.
// Structural elements and the deformed layer are deliberately not batched.
export class XRStaticBIMBatch {
  constructor(app){this.app=app;this.mesh=null;this.members=[];this.count=0;}
  clear(){
    for(const part of this.members)part.orig.visible=true;
    this.members=[];
    if(this.mesh){
      this.mesh.parent?.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh=null;
    }
    this.count=0;
  }
  refresh(){
    this.clear();
    const app=this.app;
    if(!app.isXR||app.mobileAR||app.bridgeCompetition?.active||
      !app.originalGroup.visible)return;
    const candidates=app.parts.filter(p=>
      p.structural===false&&p.orig.visible&&p.orig.geometry?.getAttribute('position')&&
      p.orig.geometry.getAttribute('normal')&&p.orig.material?.isMeshStandardMaterial&&
      !p.orig.material.transparent&&p.orig.material.opacity>=.999&&
      !p.orig.material.map&&p.orig.material.side===THREE.DoubleSide);
    if(candidates.length<24)return;
    const geometries=[];
    try{
      for(const p of candidates){
        const source=p.orig.geometry;
        // Strip arbitrary IFC attributes so all geometries have an identical
        // position/normal/color layout. Preserve existing object transforms.
        const g=source.index?source.toNonIndexed():source.clone();
        const pos=g.getAttribute('position'),normal=g.getAttribute('normal');
        if(pos.itemSize!==3||normal.itemSize!==3)throw Error('Unsupported BIM geometry');
        const clean=new THREE.BufferGeometry();
        clean.setAttribute('position',pos.clone());
        clean.setAttribute('normal',normal.clone());
        const colors=new Float32Array(pos.count*3);
        const c=p.orig.material.color;
        for(let i=0;i<pos.count;i++){
          colors[3*i]=c.r;colors[3*i+1]=c.g;colors[3*i+2]=c.b;
        }
        clean.setAttribute('color',new THREE.BufferAttribute(colors,3));
        p.orig.updateMatrix();
        clean.applyMatrix4(p.orig.matrix);
        geometries.push(clean);
        g.dispose();
      }
      const merged=mergeGeometries(geometries,false);
      if(!merged)throw Error('BIM merge failed');
      this.mesh=new THREE.Mesh(merged,new THREE.MeshStandardMaterial({
        color:0xffffff,vertexColors:true,side:THREE.DoubleSide,roughness:.77
      }));
      this.mesh.name='XR static BIM render batch';
      this.mesh.frustumCulled=false;
      app.originalGroup.add(this.mesh);
      this.members=candidates;
      for(const p of candidates)p.orig.visible=false;
      this.count=candidates.length;
    }catch(err){
      this.clear();
      console.warn('Static BIM batching skipped:',err);
    }finally{
      for(const g of geometries)g.dispose();
    }
  }
}
