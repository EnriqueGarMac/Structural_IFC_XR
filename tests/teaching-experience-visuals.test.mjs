import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {TrussExperience,trussGeometry} from '../src/truss-experience.js';
import {bridgeSampleMembers} from '../src/bridge-competition-solver.mjs';
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
test('three-member triangle visualizes mid-chord bending, without moving unused grid nodes',()=>{
  const app=makeApp(),exercise=new BridgeCompetitionExperience(app);
  exercise.activate();
  exercise.members=[
    {id:'M1',i:'B0',j:'T2',sectionId:'bar_m'},
    {id:'M2',i:'T2',j:'B4',sectionId:'bar_m'},
    {id:'M3',i:'B0',j:'B4',sectionId:'bar_l'}
  ];
  const result=exercise.evaluate();
  assert.equal(result.status,'stable');
  assert.equal(result.bending?.memberId,'M3');
  const chord=exercise.root.children.find(x=>
    x.userData.bridgeMember==='M3'&&
    Array.isArray(x.userData.curvedPieces));
  assert.ok(chord);
  assert.equal(chord.visible,false);
  assert.equal(chord.userData.curvedPieces.length,14);
  const centre=exercise.root.children.find(x=>
    x.geometry?.type==='SphereGeometry'&&
    Math.abs(x.position.x-.6)<1e-8&&
    Math.abs(x.position.z)<1e-8);
  assert.ok(centre,'Unused B2 grid marker must stay in its design position');
  exercise.deactivate();
});
test('resetting to undeformed bridge shape retains numerical results and stops collapse',()=>{
  const app=makeApp(),exercise=new BridgeCompetitionExperience(app);
  exercise.activate();exercise.sample();
  const result=exercise.evaluate();
  assert.equal(result.status,'stable');
  exercise.setUndeformedView(true);
  assert.equal(exercise.result,result);
  assert.equal(exercise.undeformedView,true);
  assert.equal(exercise.breakAnimation,null);
  exercise.setAmplification(2);
  assert.equal(exercise.undeformedView,false,
    'Changing the shared amplification slider reactivates the deformed view');
  assert.equal(exercise.ampFactor,2);
  assert.equal(exercise.result,result);
  exercise.setUndeformedView(true);
  exercise.setUndeformedView(false);
  assert.equal(exercise.result,result);
  assert.equal(exercise.undeformedView,false);
  exercise.setSpan(2.9);exercise.setLoad(50);
  const failure=exercise.evaluate();
  assert.equal(failure.status,'collapse');
  assert.ok(exercise.breakAnimation);
  exercise.setUndeformedView(true);
  assert.equal(exercise.result,failure);
  assert.equal(exercise.breakAnimation,null);
  exercise.deactivate();
});
test('central load arrow tip coincides with B2 in reference and deformed views',()=>{
  const app=makeApp(),exercise=new BridgeCompetitionExperience(app);
  exercise.activate();
  const checkTip=()=>{
    const arrow=exercise.root.children.find(o=>o.name==='Carga central B2');
    assert.ok(arrow,'central load arrow exists');
    const B2=exercise.root.children.find(o=>o.geometry?.type==='SphereGeometry'&&
      o.material?.color?.getHex()===0xf1cf82);
    assert.ok(B2,'selected B2 node marker exists');
    // ArrowHelper points along negative Z and starts 0.16 m above B2.
    assert.ok(Math.abs(arrow.position.x-B2.position.x)<1e-9);
    assert.ok(Math.abs(arrow.position.z-.16-B2.position.z)<1e-9,
      'arrow tip must terminate on the loaded node');
  };
  checkTip();
  exercise.sample();exercise.evaluate();
  checkTip();
  exercise.setUndeformedView(true);
  checkTip();
  exercise.deactivate();
});
test('equally loaded mirror members break in the same animation frame',()=>{
  const app=makeApp(),bridge=new BridgeCompetitionExperience(app);
  bridge.activate();
  bridge.members=[
    ['B0','B2'],['B2','B4'],['B0','T2'],['T2','B4'],['B2','T2']
  ].map(([i,j],k)=>({id:'M'+(k+1),i,j,sectionId:'bar_m'}));
  bridge.setLoad(35);
  const result=bridge.evaluate();
  assert.deepEqual(result.broken.map(m=>m.id),['M3','M4']);
  assert.equal(bridge.breakAnimation.failureTimes.M3,
    bridge.breakAnimation.failureTimes.M4);
  bridge.animate(100);
  bridge.animate(750);
  const broken=bridge.breakAnimation.physics.broken;
  assert.equal(broken.has('M3'),true);
  assert.equal(broken.has('M4'),true);
  bridge.deactivate();
});
test('progressive failure animation follows the actual recalculated sequence',()=>{
  const app=makeApp(),bridge=new BridgeCompetitionExperience(app);
  bridge.activate();
  bridge.members=bridgeSampleMembers().map(m=>({
    ...m,sectionId:['M3','M4','M7','M9','M13'].includes(m.id)?
      'bar_l':'bar_m'
  }));
  bridge.members.push(
    {id:'M14',i:'T1',j:'B3',sectionId:'bar_m'},
    {id:'M15',i:'B2',j:'B4',sectionId:'bar_m'},
    {id:'M16',i:'B0',j:'B2',sectionId:'bar_l'}
  );
  bridge.setLoad(35);
  const updates=[];
  bridge.onFailureProgress=stage=>updates.push({
    removed:[...stage.removed],next:stage.nextFailure?.id??null
  });
  const r=bridge.evaluate();
  assert.deepEqual(r.broken.map(f=>f.id),['M6','M14']);
  bridge.animate(100);
  bridge.animate(950);
  assert.deepEqual(updates[0],{removed:['M6'],next:'M14'});
  assert.equal(bridge.breakAnimation.physics.broken.has('M6'),true);
  assert.equal(bridge.breakAnimation.physics.broken.has('M14'),false);
  bridge.animate(2300);
  assert.deepEqual(updates[1],{removed:['M6','M14'],next:null});
  assert.equal(bridge.breakAnimation.physics.broken.has('M14'),true);
  bridge.deactivate();
});
test('visible collision plane and fractured cylinders share the same ground height',()=>{
  const app=makeApp(),exercise=new BridgeCompetitionExperience(app);
  exercise.activate();exercise.sample();exercise.setSpan(2.9);exercise.setLoad(50);
  const result=exercise.evaluate();
  assert.equal(result.status,'collapse');
  const floor=exercise.root.getObjectByName('Plano de colisión de la pasarela');
  assert.ok(floor,'Floor collision must be visible in the scene');
  exercise.animate(100);
  exercise.animate(1800);
  exercise.animate(3800);
  const limit=exercise.breakAnimation.physics.floorZ;
  assert.ok(Math.abs(floor.position.z-limit)<1e-8);
  for(const member of exercise.breakAnimation.dropped){
    for(const fragment of member.fragments??[]){
      if(!fragment.object.visible)continue;
      const axis=new THREE.Vector3(0,1,0).applyQuaternion(fragment.object.quaternion);
      const lowest=fragment.object.position.z-
        Math.abs(axis.z)*fragment.length*.5-fragment.radius;
      assert.ok(lowest>=limit-1e-8,
        'Broken member '+member.id+' must not intersect displayed floor');
    }
  }
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
