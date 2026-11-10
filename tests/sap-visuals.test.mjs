import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SAPVisuals} from '../src/sap-visuals.js';

const results={
  nodes:[{id:'1',x:0,y:0,z:0},{id:'2',x:4,y:0,z:0}],
  frames:[{id:'F1',i:'1',j:'2',local_axes:{basis_global:[[1,0,0],[0,0,1],[0,-1,0]]}}],
  cases:[{name:'DEAD',displacements:[{node:'1',ux:0,uy:0,uz:0},{node:'2',ux:0,uy:0,uz:-.0001}]}],
  frameCurves:{DEAD:{F1:[[0,0,0],[0,0,-.0004],[0,0,-.0001]]}},
  forces:{DEAD:{F1:[{station_m:0,M3_kNm:-2},{station_m:2,M3_kNm:5},{station_m:4,M3_kNm:1}]}},
  modes:[{number:1,frequency_hz:2.4,jointShape:{'1':[0,0,0],'2':[0,1,0]},
          frameCurves:{F1:[[0,0,0],[0,1,0]]}}]
};
function makeApp(){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,4,0,0],3));
  g.setAttribute('color',new THREE.Float32BufferAttribute([0,0,0,0,0,0],3));
  g.setAttribute('heat',new THREE.Float32BufferAttribute([0,0],1));
  const part={base:new Float32Array([0,0,0,4,0,0]),deformed:new THREE.Mesh(g,new THREE.MeshStandardMaterial())};
  return {contentRoot:new THREE.Group(),parts:[part],results,offset:[0,0,0],maxSize:4,caseName:'DEAD',showSAPOnly:false,
    clearGroup(group){for(const child of [...group.children]){group.remove(child);child.geometry?.dispose();child.material?.dispose();}}};
}
test('M3 diagram uses retained local axis and renders numerical station results',()=>{
  const app=makeApp(),visuals=new SAPVisuals(app);
  visuals.component='M3';
  visuals.drawForces(results);
  assert.equal(visuals.maxForce,5);
  assert.ok(visuals.group.children.length>=2);
  for(const line of visuals.group.children){
    const attr=line.geometry.getAttribute('position');
    for(let i=0;i<attr.count;i++)assert.ok([attr.getX(i),attr.getY(i),attr.getZ(i)].every(Number.isFinite));
  }
});
test('modal displacement changes actual deformed IFC mesh, not only stick lines',()=>{
  const app=makeApp(),visuals=new SAPVisuals(app);
  visuals.view='modes';visuals.modeIndex=0;
  visuals.prepareModalMeshes(results);
  assert.equal(visuals.modalParts.length,1);
  visuals.updateModalAnimation(250);
  const position=app.parts[0].deformed.geometry.getAttribute('position');
  assert.ok(position.getY(1)>0.2,'No modal deformation of mesh: '+position.getY(1));
  visuals.setAmplitude(0);
  assert.ok(Math.abs(position.getY(1))<1e-10);
});

test('shaded force panels are raycastable and report SAP section value',()=>{
  const app=makeApp(),visuals=new SAPVisuals(app);
  visuals.view='forces';visuals.component='M3';
  visuals.drawForces(results);
  assert.equal(visuals.forceMeshes.length,3,'zero crossing splits signed segments');
  assert.ok(visuals.forceMeshes.every(x=>x.isMesh&&x.material.side===THREE.DoubleSide));
  assert.ok(new Set(visuals.forceMeshes.map(x=>x.material.color.getHex())).size>1);
  const ray=new THREE.Raycaster(new THREE.Vector3(3,-2,.15),
    new THREE.Vector3(0,1,0));
  const hovered=visuals.pickForce(ray);
  assert.ok(hovered,'Could not intersect shaded diagram');
  assert.equal(hovered.frameId,'F1');
  assert.equal(hovered.component,'M3');
  assert.equal(hovered.unit,'kN·m');
  assert.ok(Math.abs(hovered.station-3)<1e-5);
  assert.ok(Math.abs(hovered.value-3)<1e-5);
  visuals.clear();
  assert.equal(visuals.forceMeshes.length,0);
});
test('characteristic labels option can be toggled independently of force component',()=>{
  const app=makeApp(),visuals=new SAPVisuals(app);
  visuals.view='forces';
  visuals.setCharacteristics(true);
  assert.equal(visuals.showCharacteristics,true);
  visuals.setCharacteristics(false);
  assert.equal(visuals.showCharacteristics,false);
});

test('hover and click draw the exact force-section cut without changing values',()=>{
  const app=makeApp(),visuals=new SAPVisuals(app);
  visuals.view='forces';visuals.drawForces(results);
  const ray=new THREE.Raycaster(new THREE.Vector3(3,-2,.15),
    new THREE.Vector3(0,1,0));
  const data=visuals.pickForce(ray);
  assert.ok(data,'Expected force diagram hit');
  visuals.setHoverSection(data);
  assert.equal(visuals.hoverMarker.visible,true);
  const coords=visuals.hoverMarker.geometry.getAttribute('position').array;
  assert.ok(coords.every(Number.isFinite));
  assert.ok(Math.abs(coords[0]-data.station)<1e-5);
  visuals.pinSection(data);
  visuals.setHoverSection(null);
  assert.equal(visuals.pinnedMarker.visible,true);
  assert.equal(visuals.hoverMarker.visible,false);
  visuals.clearPinnedSection();
  assert.equal(visuals.pinnedMarker.visible,false);
  visuals.clear();
});
test('plates become one merged mesh on the SAP joints and show a static buckling shape',async()=>{
  const {makeSAPGeometry}=await import('../src/sap-visuals.js');
  const {normalizeResults}=await import('../src/results.mjs');
  const plates=normalizeResults({
    nodes:[[1,0,0],[2,1,0],[3,2,0],[4,0,1],[5,1,1],[6,2,1]].map(([id,x,y])=>({id:String(id),x,y,z:0})),
    frames:[],areas:[{id:'10',joints:['1','2','5','4'],section:'PL'},{id:'11',joints:['2','3','6','5'],section:'PL'}],
    cases:[],bucklingModes:[{number:1,case:'B',factor:-2,jointShape:{'3':[0,0,1]}}]
  });
  const [piece]=makeSAPGeometry(plates);
  assert.equal(piece.ifcType,'SapArea');
  assert.equal(piece.faceNames.length,4);
  assert.equal(piece.faceNames[2],'Placa 11 · PL');
  const g=piece.geometry.clone(),count=g.getAttribute('position').count;
  assert.equal(count,12);
  g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(count*3),3));
  g.setAttribute('heat',new THREE.Float32BufferAttribute(new Float32Array(count),1));
  const app=makeApp();
  app.results=plates;
  app.parts=[{base:piece.geometry.getAttribute('position').array.slice(),ifcType:'SapArea',
    deformed:new THREE.Mesh(g,new THREE.MeshStandardMaterial())}];
  const visuals=new SAPVisuals(app);
  visuals.view='buckling';visuals.modalAmplitude=.5;
  visuals.prepareModalMeshes(plates);
  const position=g.getAttribute('position'),base=app.parts[0].base;
  const lifted=[...Array(count).keys()].filter(i=>Math.abs(position.getZ(i)-.5)<1e-9);
  // Joint 3 (2,0,0) is a corner of one triangle (2,3,6) of plate 11, raised by the full amplitude.
  assert.equal(lifted.length,1);
  assert.ok(lifted.every(i=>base[3*i]===2&&base[3*i+1]===0));
  // The render loop does not animate a buckling shape.
  visuals.updateModalAnimation(250);
  assert.equal(position.getZ(lifted[0]),.5);
});
