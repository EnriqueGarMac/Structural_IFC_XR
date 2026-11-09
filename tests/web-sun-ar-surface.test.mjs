import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {placeModelOnSurface,modelPlacementBounds,supportOffsetY,
  matchingTablePlane,planeFromDetection,tableFitSize} from '../src/ar-placement.mjs';
import {WebSun} from '../src/web-sun.js';
import {sessionOptions} from '../src/xr-session-config.mjs';

function makeApp({site=false}={}){
  const scene=new THREE.Scene();
  const worldRoot=new THREE.Group();
  worldRoot.rotation.x=-Math.PI/2;
  worldRoot.position.set(0,-.6,0);
  worldRoot.scale.setScalar(.25);
  scene.add(worldRoot);
  const contentRoot=new THREE.Group();
  worldRoot.add(contentRoot);
  const originalGroup=new THREE.Group(),deformedGroup=new THREE.Group();
  contentRoot.add(originalGroup,deformedGroup);
  const parts=[];
  function add({name,type,center,size,terrain=false}){
    const geo=new THREE.BoxGeometry(...size);geo.translate(...center);
    const orig=new THREE.Mesh(geo,new THREE.MeshStandardMaterial());
    const deformed=new THREE.Mesh(geo.clone(),new THREE.MeshStandardMaterial());
    originalGroup.add(orig);deformedGroup.add(deformed);
    parts.push({name,ifcType:type,orig,deformed,terrain,structural:!terrain});
  }
  add({name:'Edificio',type:'IfcColumn',center:[0,0,2],size:[10,8,4]});
  if(site)add({name:'Terreno',type:'IfcGeographicElement',
    center:[0,0,-.3],size:[13,11,.6],terrain:true});
  originalGroup.visible=true;deformedGroup.visible=false;
  const app={scene,worldRoot,contentRoot,originalGroup,deformedGroup,
    parts,showStructureOnly:false,hideGround:!site,
    showSAPOnly:false,targetMeters:2.5,maxSize:10,
    renderer:{shadowMap:{enabled:false,type:null}},webcamActive:false,
    isXR:false,bounds:new THREE.Box3(
      new THREE.Vector3(-5,-4,0),new THREE.Vector3(5,4,4))};
  return app;
}
function topRelativeY(app){
  app.worldRoot.updateWorldMatrix(true,true);
  return modelPlacementBounds(app);
}
test('model sits on the hit plane (not 2cm above) despite nonzero root offset and scale',()=>{
  const app=makeApp();
  const ground=new THREE.Vector3(1.5,.83,-1.25);
  placeModelOnSurface(app,ground);
  const b=topRelativeY(app).bounds;
  assert.ok(Math.abs(b.min.y-(ground.y+.003))<1e-8);
  assert.ok(Math.abs(app.worldRoot.position.x-ground.x)<1e-8);
  app.targetMeters=.8;app.worldRoot.scale.setScalar(.08);
  placeModelOnSurface(app,ground);
  assert.ok(Math.abs(topRelativeY(app).bounds.min.y-(ground.y+.003))<1e-8);
});
test('visible terrain uses its top surface; hidden terrain uses structural base',()=>{
  const app=makeApp({site:true});
  const y=new THREE.Vector3(0,.95,0);
  placeModelOnSurface(app,y);
  const ground=topRelativeY(app).terrain[0];
  assert.ok(Math.abs(ground.max.y-(y.y+.003))<1e-8);
  app.hideGround=true;
  placeModelOnSurface(app,y);
  const b=topRelativeY(app).bounds;
  assert.ok(Math.abs(b.min.y-(y.y+.003))<1e-8);
});
test('WebXR table polygon width/depth can fit scale but plain hit-test cannot invent it',()=>{
  const transform=new THREE.Matrix4().makeTranslation(0,1.25,0);
  const pose={transform:{matrix:transform.toArray()}};
  const plane={planeSpace:{},semanticLabel:'table',
    polygon:[{x:-.55,y:0,z:-.38},{x:.55,y:0,z:-.38},
      {x:.55,y:0,z:.38},{x:-.55,y:0,z:.38}]};
  const frame={detectedPlanes:new Set([plane]),getPose:()=>pose};
  const candidate=matchingTablePlane(frame,{},new THREE.Vector3(0,1.25,0));
  assert.ok(candidate);
  assert.ok(Math.abs(candidate.width-1.1)<1e-6);
  assert.ok(Math.abs(candidate.depth-.76)<1e-6);
  const app=makeApp();
  const adapted=tableFitSize(app,candidate);
  assert.ok(adapted>.2&&adapted<1.0);
  assert.equal(matchingTablePlane({}, {},new THREE.Vector3(0,1.25,0)),null);
  assert.equal(matchingTablePlane(frame,{},new THREE.Vector3(10,1.25,0)),null);
  const vertical={...plane,planeSpace:{}};
  const verticalPose={transform:{matrix:new THREE.Matrix4().makeRotationX(Math.PI/2).toArray()}};
  assert.equal(planeFromDetection(vertical,{getPose:()=>verticalPose},{}),null);
});
test('sun lights loaded IFC only in web view and never in immersive AR/VR',()=>{
  const app=makeApp();
  const sun=new WebSun(app);
  sun.update();
  assert.equal(sun.light.visible,true);
  assert.equal(sun.catcher.visible,true);
  assert.equal(app.parts[0].orig.castShadow,true);
  assert.equal(app.renderer.shadowMap.enabled,true);
  assert.ok(sun.light.position.y>sun.light.target.position.y);
  app.isXR=true;
  sun.update();
  assert.equal(sun.light.visible,false);
  assert.equal(sun.catcher.visible,false);
  assert.equal(app.parts[0].orig.castShadow,false);
  app.isXR=false;
  app.webcamActive=true;sun.update();
  assert.equal(sun.light.visible,false);
  app.webcamActive=false;app.showSAPOnly=true;sun.update();
  assert.equal(sun.light.visible,false);
});
test('optional plane detection never blocks AR if the device only supports hit-test',()=>{
  const quest=sessionOptions({mode:'ar'});
  const mobile=sessionOptions({mode:'ar',mobile:true});
  assert.ok(quest.init.optionalFeatures.includes('plane-detection'));
  assert.ok(mobile.init.optionalFeatures.includes('plane-detection'));
  assert.ok(!quest.init.requiredFeatures.includes('plane-detection'));
  assert.equal(sessionOptions({mode:'vr'}).sessionType,'immersive-vr');
});
