import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {TrussExperience,trussGeometry} from '../src/truss-experience.js';
import {BridgeCompetitionExperience,bridgeReferenceGeometry}
  from '../src/bridge-competition.js';

const makeApp=()=>{
  const scene=new THREE.Scene();
  const worldRoot=new THREE.Group();
  worldRoot.rotation.x=-Math.PI/2;
  const contentRoot=new THREE.Group();
  scene.add(worldRoot);worldRoot.add(contentRoot);
  return {scene,worldRoot,contentRoot,targetMeters:1.2,maxSize:1.2,
    showDeformed:true,xrControls:{dirty:false},
    updateScale(){this.worldRoot.scale.setScalar(this.targetMeters/this.maxSize);}};
};
test('Warren truss renderer creates selectable geometry and recalculates real loads',()=>{
  const app=makeApp();
  const g=trussGeometry();
  assert.equal(g.length,15);
  for(const part of g)assert.ok(part.geometry.getAttribute('position').count>0);
  const experience=new TrussExperience(app);
  let updates=0;experience.onChange=()=>updates++;
  experience.activate();
  assert.ok(experience.root.visible);
  assert.ok(experience.pickNodes.length>=9);
  assert.ok(experience.pickBars.length>=15);
  experience.setLoad('G',0,-30);
  assert.equal(experience.getLoad('G').fz_kN,-30);
  assert.ok(experience.result.maxDisplacement_m>0);
  assert.ok(updates>=2);
  experience.selectNode('H');
  assert.equal(experience.selectedNode,'H');
  experience.setMode('stress');
  assert.equal(experience.mode,'stress');
  experience.clearLoads();
  assert.equal(experience.result.maxDisplacement_m,0);
  experience.deactivate();
  assert.equal(experience.root.visible,false);
  assert.equal(experience.root.children.length,0);
});
test('mouse design rays snap to grid endpoints and ghost bar follows pointer',()=>{
  const app=makeApp(),exercise=new BridgeCompetitionExperience(app);
  exercise.activate();
  exercise.beginAdd();
  const pointerAt=(x,z)=>{
    exercise.root.updateWorldMatrix(true,false);
    const root=exercise.root.matrixWorld;
    return new THREE.Raycaster(
      new THREE.Vector3(x,1,z).applyMatrix4(root),
      new THREE.Vector3(0,-1,0).transformDirection(root)
    );
  };
  assert.equal(exercise.pickDesignNode(pointerAt(.6,0))?.id,'B2');
  assert.equal(exercise.pickDesignNode(pointerAt(.6,.042)),null,
    'No snapping at arbitrary points between grid nodes');
  exercise.chooseNode('B0');
  exercise.updatePreviewRay(pointerAt(.22,.14));
  assert.ok(exercise.previewMesh?.visible);
  assert.ok(Math.abs(exercise.previewPoint.x-.22)<1e-6);
  assert.ok(Math.abs(exercise.previewPoint.z-.14)<1e-6);
  exercise.updatePreviewRay(pointerAt(.3,.336));
  assert.equal(exercise.pickDesignNode(pointerAt(.3,.336))?.id,'T1');
  exercise.chooseNode('T1');
  assert.equal(exercise.members.length,1);
  assert.equal(exercise.addMode,false);
  exercise.deactivate();
});
test('bridge visual tube diameter scales with physical section and span',()=>{
  const app=makeApp(),exercise=new BridgeCompetitionExperience(app);
  exercise.activate();exercise.sample();
  const diameter=()=>{
    const member=exercise.root.children.find(x=>x.userData.bridgeMember==='M1'&&
      x.geometry?.type==='CylinderGeometry'&&
      x.material?.opacity!==.015);
    assert.ok(member,'Rendered member exists');
    return member.geometry.parameters.radiusTop*2;
  };
  const diameter12=diameter();
  assert.ok(diameter12<.023,'Light bar must not look oversized at 1.2 m');
  exercise.setSpan(2.4);
  const diameter24=diameter();
  assert.ok(Math.abs(diameter12/diameter24-2)<1e-6,
    'Same steel area shown across twice the span must appear half as thick');
  exercise.deactivate();
});
test('bridge renderer allows a lightweight design, editing and animated failure',()=>{
  const app=makeApp();
  assert.equal(bridgeReferenceGeometry().length,2);
  const exercise=new BridgeCompetitionExperience(app);
  let updates=0;exercise.onChange=()=>updates++;
  exercise.activate();
  assert.equal(exercise.root.visible,true);
  assert.ok(exercise.pickers.length>0);
  // The editor now requires the explicit Add Element command before the
  // two endpoint selections; passive node clicks never start a new bar.
  exercise.chooseNode('B0');
  assert.equal(exercise.startNode,null);
  assert.equal(exercise.members.length,0);
  exercise.beginAdd();
  assert.equal(exercise.addMode,true);
  exercise.chooseNode('B0');
  assert.equal(exercise.startNode,'B0');
  exercise.chooseNode('T1');
  assert.equal(exercise.members.length,1);
  assert.equal(exercise.addMode,false);
  assert.equal(exercise.startNode,null);
  exercise.removeMember(exercise.members[0].id);
  assert.equal(exercise.members.length,0);
  exercise.sample();
  assert.equal(exercise.members.length,13);
  const analysis=exercise.evaluate();
  assert.equal(analysis.status,'stable',analysis.reason);
  assert.ok(exercise.bestEligibleMass_kg>0);
  assert.ok(updates>3);
  const firstBest=exercise.bestEligibleMass_kg;
  exercise.setLoad(1.5);
  assert.equal(exercise.bestEligibleMass_kg,null,
    'Changing the competition load must reset weight comparison');
  const repeat=exercise.evaluate();
  assert.equal(repeat.status,'stable',repeat.reason);
  assert.ok(exercise.bestEligibleMass_kg>0);
  exercise.setSpan(1.8);
  assert.equal(exercise.span_m,1.8);
  assert.equal(app.targetMeters,1.8);
  exercise.clearAnimationIfNeeded?.();
  exercise.reset();
  const fail=exercise.evaluate();
  assert.equal(fail.status,'collapse');
  assert.ok(exercise.breakAnimation);
  exercise.animate(500);
  exercise.animate(1700);
  exercise.deactivate();
  assert.equal(exercise.root.visible,false);
  assert.equal(exercise.root.children.length,0);
});
