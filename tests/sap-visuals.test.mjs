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
