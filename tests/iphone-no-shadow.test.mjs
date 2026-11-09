import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {buildStructuralARScene,exportStructuralUSDZ} from '../src/mobile-usdz.js';

test('iPhone Quick Look export has no injected textured shadow plane',()=>{
  // Regression: USDZ must not contain the old extra mesh that covered the
  // user's floor. Apple Quick Look provides native plane anchoring.
  const source=readFileSync(new URL('../src/mobile-usdz.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/createBakedShadow|includeShadow|mobile-shadow\.js/);
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/mobile-ios-shadow|Añadir sombra suave bajo el modelo/);
  assert.equal(typeof exportStructuralUSDZ,'function');

  const scene=new THREE.Scene(),contentRoot=new THREE.Group(),worldRoot=new THREE.Group();
  scene.add(worldRoot);worldRoot.add(contentRoot);
  const g=new THREE.BoxGeometry(1,1,1);
  g.translate(0,.5,0);
  const material=new THREE.MeshStandardMaterial({color:0x99bbc4});
  const orig=new THREE.Mesh(g,material);
  const parts=[{orig,deformed:orig,terrain:false}];
  const app={parts,worldRoot,contentRoot,
    originalGroup:{visible:true},deformedGroup:{visible:false},
    showSAPOnly:false,hideGround:false,showFrames:false};
  const exported=buildStructuralARScene(app);
  const meshes=[];exported.traverse(o=>{if(o.isMesh)meshes.push(o);});
  assert.equal(meshes.length,1,'No shadow decal should be added to USDZ scene');
  assert.ok(meshes.every(m=>!m.userData.isBakedShadow));
  exported.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  orig.geometry.dispose();orig.material.dispose();
});
