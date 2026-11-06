import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ROOF_DEMO,roofDemoGeometry,roofDemoResults,roofDemoStats} from '../src/roof-demo.js';
import {demoGeometry,demoResults} from '../src/demo.js';
import {isTerrainElement} from '../src/view-filters.mjs';
import {caseNodes,maxDisplacement,selectedLoads,analyticalNodePositions} from '../src/results.mjs';

test('both demonstration models remain available with independent structures',()=>{
  assert.ok(demoGeometry().length>0);
  assert.ok(demoResults.frames.length>=8);
  const roof=roofDemoGeometry();
  const stats=roofDemoStats();
  assert.ok(roof.length>280,'roof requires several trusses and purlins');
  assert.equal(roof.length,stats.pieces);
  assert.equal(roofDemoResults.frames.length,stats.frames);
  assert.ok(roofDemoResults.nodes.length>150);
  for(const item of roof)item.geometry.dispose();
});

test('roof geometry spans 18 m by 24 m and rises to a pitched ridge',()=>{
  assert.equal(ROOF_DEMO.span,18);
  assert.equal(ROOF_DEMO.length,24);
  const roof=roofDemoGeometry();
  const boxes=new THREE.Box3();
  for(const part of roof){
    const box=part.geometry.boundingBox||(
      part.geometry.computeBoundingBox(),part.geometry.boundingBox
    );
    boxes.union(box);
  }
  const size=boxes.getSize(new THREE.Vector3());
  assert.ok(size.x>18&&size.x<22);
  assert.ok(size.y>24&&size.y<27);
  assert.ok(boxes.max.z>8.8);
  assert.ok(boxes.min.z<0);
  assert.ok(roof.some(x=>x.name.includes('Diagonal')));
  assert.ok(roof.some(x=>x.name.includes('Correa')));
  assert.ok(roof.some(x=>x.name.includes('Arriostramiento')));
  for(const part of roof)part.geometry.dispose();
});

test('hidden foundations do not remove roof sheets, braces or structural columns',()=>{
  const pieces=roofDemoGeometry();
  const foundations=pieces.filter(x=>isTerrainElement(x));
  const structural=pieces.filter(x=>!isTerrainElement(x));
  assert.equal(foundations.length,10);
  assert.ok(structural.some(x=>x.ifcType==='IfcCovering'));
  assert.ok(structural.some(x=>x.ifcType==='IfcColumn'));
  assert.ok(structural.some(x=>x.ifcType==='IfcBeam'));
  assert.ok(structural.some(x=>x.ifcType==='IfcMember'));
  assert.ok(new Set(pieces.map(x=>x.color)).size>=5);
  for(const part of pieces)part.geometry.dispose();
});

test('every synthetic SAP frame connects distinct, existing roof joints',()=>{
  const {nodes,frames,loads,cases}=roofDemoResults;
  const ids=new Set(nodes.map(n=>n.id));
  assert.equal(ids.size,nodes.length);
  const frameIds=new Set(frames.map(f=>f.id));
  assert.equal(frameIds.size,frames.length);
  for(const f of frames){
    assert.ok(ids.has(f.i));assert.ok(ids.has(f.j));
    assert.notEqual(f.i,f.j);
  }
  for(const l of loads){
    assert.ok(frameIds.has(l.frame));
    assert.equal(l.csys,'Global');
    assert.ok(Number.isFinite(l.w1));
    assert.ok(Number.isFinite(l.w2));
  }
  assert.ok(selectedLoads(roofDemoResults,'G').length>10);
  assert.ok(selectedLoads(roofDemoResults,'N').length>10);
  assert.ok(selectedLoads(roofDemoResults,'V').length>3);
  assert.ok(cases.length>=3);
  assert.match(roofDemoResults.meta.note,/SINTÉTICA/i);
  assert.match(roofDemoResults.meta.note,/NO obtenidos de SAP2000/i);
});

test('gravity/snow case gives support-zero deflection and higher ridge sag',()=>{
  const nodes=caseNodes(roofDemoResults,roofDemoResults.cases[0].name);
  const supports=nodes.filter(n=>n.z===0);
  assert.ok(supports.length>=10);
  assert.ok(supports.every(n=>n.uz===0));
  const ridge=nodes.filter(n=>n.x===9&&n.z>8);
  assert.ok(ridge.length>=5);
  assert.ok(ridge.every(n=>n.uz<-.015));
  assert.ok(maxDisplacement(nodes)>.02&&maxDisplacement(nodes)<.05);
  const magnified=analyticalNodePositions(nodes,25,true);
  const mid=nodes.findIndex(n=>n.id===ridge[0].id);
  assert.ok(magnified[mid].z<nodes[mid].z);
  assert.equal(nodes[mid].z,roofDemoResults.nodes[mid].z);
});

test('wind case gives predominantly horizontal sway of the steel roof',()=>{
  const nodes=caseNodes(roofDemoResults,roofDemoResults.cases[1].name);
  assert.ok(nodes.some(n=>n.z>8&&n.ux>.015));
  assert.ok(nodes.filter(n=>n.z===0).every(n=>n.ux===0));
  assert.ok(maxDisplacement(nodes)<.05);
});
