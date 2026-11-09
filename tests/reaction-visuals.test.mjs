import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ReactionVisuals} from '../src/reaction-visuals.js';

const results={
  nodes:[{id:'1',x:-5,y:0,z:0},{id:'4',x:5,y:0,z:0}],
  frames:[],loads:[],cases:[{name:'DEAD',displacements:[]}],
  jointReactions:{
    DEAD:{
      1:{force_kN:[0,0,7.0285],moment_kNm:[0,0,0]},
      4:{force_kN:[0,0,7.0285],moment_kNm:[0,0,0]}
    },
    MOMENT:{
      1:{force_kN:[-2,0,3],moment_kNm:[2,0,-4]}
    }
  }
};
function makeApp(){
  const scene=new THREE.Scene(),worldRoot=new THREE.Group(),contentRoot=new THREE.Group();
  scene.add(worldRoot);worldRoot.add(contentRoot);
  return {scene,worldRoot,contentRoot,
    sapVisuals:{view:'reactions'},
    results,caseName:'DEAD',offset:[0,0,0],maxSize:10,
    clearGroup(group){
      for(const child of [...group.children]){
        group.remove(child);
        child.traverse(obj=>{
          obj.geometry?.dispose();
          obj.material?.dispose();
        });
      }
    }
  };
}
test('renders 7.0285 kN reaction vectors on both supports',()=>{
  const app=makeApp();
  const reactions=new ReactionVisuals(app);
  reactions.refresh();
  assert.equal(reactions.pickers.length,2);
  const arrows=reactions.group.children.filter(obj=>obj.type==='ArrowHelper');
  assert.equal(arrows.length,2);
  assert.ok(arrows.every(arrow=>arrow.position.z===0));
  assert.deepEqual(reactions.lastSummary.force,[0,0,14.057]);
  const ray=new THREE.Raycaster(new THREE.Vector3(-5,0,4),new THREE.Vector3(0,0,-1));
  const pick=reactions.pick(ray);
  assert.ok(pick,'Expected hit on support-node marker');
  assert.equal(pick.node,'1');
  assert.equal(pick.reaction.force_kN[2],7.0285);
});
test('switches case to moment, with circular arrows and no stale reaction arrows',()=>{
  const app=makeApp(),reactions=new ReactionVisuals(app);
  reactions.refresh();
  app.caseName='MOMENT';
  reactions.refresh();
  assert.equal(reactions.pickers.length,1);
  const momentArcs=reactions.group.children.filter(obj=>obj.type==='Line');
  assert.equal(momentArcs.length,2);
  const arrows=reactions.group.children.filter(obj=>obj.type==='ArrowHelper');
  assert.equal(arrows.length,2);
  assert.deepEqual(reactions.lastSummary.moment,[2,0,-4]);
  assert.deepEqual(reactions.lastSummary.force,[-2,0,3]);
});
test('renders no invented reactions when case has no reported support resultants',()=>{
  const app=makeApp(),reactions=new ReactionVisuals(app);
  app.caseName='UNKNOWN';
  reactions.refresh();
  assert.equal(reactions.pickers.length,0);
  assert.equal(reactions.lastSummary.rows.length,0);
  app.sapVisuals.view='modes';
  reactions.refresh();
  assert.equal(reactions.group.children.length,0);
});
