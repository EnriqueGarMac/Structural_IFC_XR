import test from 'node:test';
import assert from 'node:assert/strict';
import {solveTruss2D,TRUSS_LESSON,defaultTrussLoads}
  from '../src/truss-solver.mjs';
import {bridgeSampleMembers,calculateBridge,bridgeGrid}
  from '../src/bridge-competition-solver.mjs';
import {teachingResultsToViewer,TEACHING_CASE}
  from '../src/teaching-results-adapter.mjs';
import {readForceStations} from '../src/force-diagrams.mjs';
import {reactionSummary} from '../src/reactions.mjs';
import * as THREE from 'three';
import {SAPVisuals} from '../src/sap-visuals.js';
import {ReactionVisuals} from '../src/reaction-visuals.js';

test('Warren truss reuses SAP force diagrams and XYZ reaction contract',()=>{
  const result=solveTruss2D(TRUSS_LESSON,defaultTrussLoads());
  const converted=teachingResultsToViewer('truss',result,{model:TRUSS_LESSON});
  assert.equal(converted.frames.length,TRUSS_LESSON.bars.length);
  assert.equal(converted.nodes.length,TRUSS_LESSON.nodes.length);
  for(const bar of result.bars){
    const stations=converted.forces[TEACHING_CASE][bar.id];
    assert.equal(stations.length,2);
    assert.equal(stations[0].P_kN,bar.axial_kN);
    assert.equal(stations[1].P_kN,bar.axial_kN);
    assert.ok(readForceStations(stations,'P',bar.length_m).length===2);
    assert.equal(stations[0].M3_kNm,0,'Articulated member has no flexural diagram');
  }
  const reactions=reactionSummary(converted.jointReactions,TEACHING_CASE);
  assert.equal(reactions.rows.length,result.reactions.length);
  assert.ok(Math.abs(reactions.force[2]+result.loads.reduce(
    (sum,l)=>sum+l.fz_kN,0))<1e-7);
  assert.equal(reactions.force[1],0);
});

test('bridge force/reaction overlays have aligned normalised endpoints at arbitrary span',()=>{
  const members=bridgeSampleMembers(),span_m=2.4;
  const result=calculateBridge({span_m,members});
  const converted=teachingResultsToViewer('bridge',result,{span_m,members});
  const pos=new Map(converted.nodes.map(n=>[n.id,n]));
  assert.equal(converted.frames.length,members.length);
  assert.ok(Math.abs(pos.get('B4').x-1.2)<1e-8);
  for(const frame of converted.frames){
    const a=pos.get(frame.i),b=pos.get(frame.j);
    assert.ok(Math.abs(frame.length_m-
      Math.hypot(b.x-a.x,b.z-a.z))<1e-8);
    const axes=frame.local_axes.basis_global;
    assert.ok(Math.abs(Math.hypot(...axes[0])-1)<1e-8);
    assert.ok(Math.abs(Math.hypot(...axes[1])-1)<1e-8);
  }
  const rx=reactionSummary(converted.jointReactions,TEACHING_CASE);
  assert.equal(rx.rows.length,result.reactions.length);
});

test('midspan loaded bridge maps axial, shear and moment stations to the general viewer',()=>{
  const members=[['B0','T2','bar_m'],['T2','B4','bar_m'],
    ['B0','B4','bar_l']].map(([i,j,sectionId],k)=>({
      id:'M'+(k+1),i,j,sectionId
    }));
  const result=calculateBridge({members});
  assert.equal(result.status,'stable');
  const converted=teachingResultsToViewer('bridge',result,{span_m:1.2,members});
  const stations=converted.forces[TEACHING_CASE].M3;
  assert.equal(stations.length,4);
  assert.equal(stations[1].station_m,stations[2].station_m);
  assert.equal(stations[1].M3_kNm,stations[2].M3_kNm);
  assert.ok(Math.abs(stations[1].M3_kNm-.9)<1e-8);
  assert.ok(stations[1].V2_kN>0&&stations[2].V2_kN<0);
  assert.equal(readForceStations(stations,'M3',1.2).length,4);
});

test('an unsolved bridge mechanism does not fabricate force diagrams',()=>{
  const members=[];
  const result=calculateBridge({members});
  const converted=teachingResultsToViewer('bridge',result,{members,span_m:1.2});
  assert.equal(Object.keys(converted.forces[TEACHING_CASE]).length,0);
  assert.equal(Object.keys(converted.jointReactions[TEACHING_CASE]).length,0);
});

test('actual common 3D engines draw teaching axial patches and joint reaction arrows',()=>{
  const result=solveTruss2D(TRUSS_LESSON,defaultTrussLoads());
  const converted=teachingResultsToViewer('truss',result,{model:TRUSS_LESSON});
  const contentRoot=new THREE.Group();
  const worldRoot=new THREE.Group();worldRoot.add(contentRoot);
  const scene=new THREE.Scene();scene.add(worldRoot);
  const app={
    contentRoot,worldRoot,scene,results:converted,caseName:TEACHING_CASE,
    offset:[0,0,0],maxSize:12,
    clearGroup(group){
      for(const child of [...group.children])group.remove(child);
    },
    updateVisualization(){}
  };
  const sap=new SAPVisuals(app);
  app.sapVisuals=sap;
  sap.component='P';sap.view='forces';sap.refresh();
  assert.equal(sap.forceMeshes.length,TRUSS_LESSON.bars.length,
    'The real force-diagram renderer must create a patch per teaching bar');
  assert.ok(sap.forceMeshes.every(mesh=>
    mesh.geometry.getAttribute('position').count>=6));
  const reactions=new ReactionVisuals(app);
  sap.view='reactions';reactions.refresh();
  assert.equal(reactions.pickers.length,result.reactions.length);
  assert.ok(reactions.group.children.length>reactions.pickers.length,
    'The real reaction renderer must create visible force arrows');
  sap.clear();reactions.clear();
});
