import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildStructuralARScene} from '../src/mobile-usdz.js';
import {demoGeometry,demoResults} from '../src/demo.js';
import {roofDemoGeometry,roofDemoResults} from '../src/roof-demo.js';
import {isTerrainElement} from '../src/view-filters.mjs';

function demoApp({sapOnly=false}={}){
  const parts=demoGeometry().map(item=>{
    const material=new THREE.MeshStandardMaterial({color:item.color});
    return {orig:new THREE.Mesh(item.geometry,material),
      deformed:new THREE.Mesh(item.geometry.clone(),material.clone()),
      terrain:item.ifcType==='IfcFooting'};
  });
  const originalGroup=new THREE.Group(),deformedGroup=new THREE.Group();
  for(const p of parts){originalGroup.add(p.orig);deformedGroup.add(p.deformed);}
  const contentRoot=new THREE.Group();
  contentRoot.position.set(-4,-3,.31);
  return {parts,worldRoot:new THREE.Group(),contentRoot,originalGroup,deformedGroup,
    showSAPOnly:sapOnly,hideGround:true,results:demoResults,
    caseName:demoResults.cases[0].name,offset:[0,0,0],amp:25,
    showDeformed:true,showOriginal:true,showFrames:true,maxSize:8};
}
test('iPhone export uses visible IFC meshes and excludes terrain without deleting slab',()=>{
 const app=demoApp();
 const scene=buildStructuralARScene(app);
 const meshes=[];
 scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
 assert.ok(meshes.length>=4);
 assert.ok(!meshes.some(m=>m===app.parts[1].orig));
 const bbox=new THREE.Box3().setFromObject(scene);
 assert.ok(Math.abs(bbox.min.y)<1e-5);
});
test('iPhone SAP-only export contains analytical stick models',()=>{
 const app=demoApp({sapOnly:true});
 const scene=buildStructuralARScene(app);
 let n=0;scene.traverse(o=>{if(o.isMesh)n++;});
 assert.ok(n>5);
 assert.ok(Math.abs(new THREE.Box3().setFromObject(scene).min.y)<1e-4);
});
test('iPhone AR export fails clearly if no IFC is loaded or budget exceeded',()=>{
 assert.throws(()=>buildStructuralARScene({parts:[]}),/IFC/);
 assert.throws(()=>buildStructuralARScene(demoApp(),1),/complejo/);
});

test('steel lattice-roof demo can be exported as visible geometry to iPhone AR',()=>{
  const parts=roofDemoGeometry().map(item=>{
    const material=new THREE.MeshStandardMaterial({color:item.color});
    const orig=new THREE.Mesh(item.geometry,material);
    const deformed=new THREE.Mesh(item.geometry.clone(),material.clone());
    return {orig,deformed,terrain:isTerrainElement(item)};
  });
  const originalGroup=new THREE.Group(),deformedGroup=new THREE.Group();
  for(const part of parts){originalGroup.add(part.orig);deformedGroup.add(part.deformed);}
  const contentRoot=new THREE.Group(); // Roof coordinates are now already centred at (0,0,0).
  const app={parts,worldRoot:new THREE.Group(),contentRoot,originalGroup,deformedGroup,
    showSAPOnly:false,hideGround:true,results:roofDemoResults,
    caseName:roofDemoResults.cases[0].name,offset:[0,0,0],amp:25,
    showDeformed:false,showOriginal:true,showFrames:true,maxSize:24};
  const scene=buildStructuralARScene(app);
  let meshes=0;scene.traverse(o=>{if(o.isMesh)meshes++;});
  assert.ok(meshes>300);
  const bbox=new THREE.Box3().setFromObject(scene);
  assert.ok(Math.abs(bbox.min.y)<1e-4);
  assert.ok(bbox.max.x-bbox.min.x>18);
  assert.ok(bbox.max.z-bbox.min.z>5);
});
test('the same roof can be exported in SAP-only analytical mode to iPhone',()=>{
  const geometry=roofDemoGeometry();
  const parts=geometry.map(item=>({
    orig:new THREE.Mesh(item.geometry,new THREE.MeshStandardMaterial()),
    terrain:isTerrainElement(item)
  }));
  const app={parts,showSAPOnly:true,hideGround:true,worldRoot:new THREE.Group(),
    contentRoot:new THREE.Group(),showFrames:true,
    results:roofDemoResults,caseName:roofDemoResults.cases[0].name,
    offset:[0,0,0],amp:25,showDeformed:true,maxSize:24};
  const scene=buildStructuralARScene(app);
  let bars=0;scene.traverse(o=>{if(o.isMesh)bars++;});
  assert.ok(bars>roofDemoResults.frames.length);
  assert.ok(Math.abs(new THREE.Box3().setFromObject(scene).min.y)<1e-4);
});
