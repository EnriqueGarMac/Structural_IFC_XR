import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {classifySupport,buildSupportSymbols} from '../src/support-symbols.js';

test('different restraint patterns map to appropriate 3D symbols',()=>{
  assert.equal(classifySupport([true,true,true,true,true,true]),'fixed');
  assert.equal(classifySupport([true,true,true,false,false,false]),'pinned');
  assert.equal(classifySupport([false,true,true,false,false,false]),'roller');
  assert.equal(classifySupport([true,false,false,false,false,false]),'partial');
  assert.equal(classifySupport([]),null);
});
test('supports are located at exact SAP node coordinates and include semantic kind',()=>{
  const group=buildSupportSymbols([
    {id:'B1',x:3,y:-2,z:0,restrained_dof:[true,true,true,true,true,true]},
    {id:'B2',x:8,y:-2,z:0,restrained_dof:[false,true,true,false,false,false]},
    {id:'FREE',x:3,y:-2,z:4,restrained_dof:[]}
  ],[.5,0,0],.3);
  assert.equal(group.children.length,2);
  assert.equal(group.children[0].userData.kind,'fixed');
  assert.equal(group.children[0].position.x,3.5);
  assert.equal(group.children[1].userData.kind,'roller');
  for(const o of group.children)o.traverse(x=>{x.geometry?.dispose();x.material?.dispose();});
});
test('a support group gets one symbol, sized to its joints, and its joints no single symbols',()=>{
  // Base section of a shell column: 4 restrained joints described by one BC_ group;
  // a lateral restraint line (2 joints held in Y) and one restrained joint outside groups.
  const nodes=[
    {id:'1',x:-.1,y:-.1,z:0,restrained_dof:[true,true,false]},{id:'2',x:.1,y:-.1,z:0,restrained_dof:[true,true,false]},
    {id:'3',x:-.1,y:.1,z:0,restrained_dof:[true,true,false]},{id:'4',x:.1,y:.1,z:5,restrained_dof:[]},
    {id:'5',x:0,y:0,z:2,restrained_dof:[false,true,false]},{id:'6',x:0,y:0,z:3,restrained_dof:[false,true,false]},
    {id:'7',x:4,y:0,z:0,restrained_dof:[true,true,true,true,true,true]}];
  const group=buildSupportSymbols(nodes,[0,0,0],.05,[
    {id:'BC_FORK_C_BOTTOM',kind:'FORK',place:'C_BOTTOM',joints:['1','2','3']},
    {id:'BC_LATERAL_C_RAILS',kind:'LATERAL',place:'C_RAILS',joints:['5','6']}]);
  assert.equal(group.children.length,3);
  const [fork,lateral,single]=group.children;
  assert.equal(fork.userData.kind,'FORK');
  assert.match(fork.name,/^Horquilla · C_BOTTOM — /);
  assert.ok(Math.abs(fork.position.x+.1/3)<1e-12&&Math.abs(fork.position.y+.1/3)<1e-12);
  // the glyph covers the section (0.2 m) instead of the tiny default size
  const box=new THREE.Box3().setFromObject(fork).getSize(new THREE.Vector3());
  assert.ok(box.x>.2);
  // lateral marks along global Y, the restrained direction of those joints
  const pos=lateral.children[0].geometry.getAttribute('position');
  assert.equal(pos.count,4);
  assert.ok(Math.abs(pos.getY(1)-pos.getY(0))>0&&pos.getX(1)===pos.getX(0));
  assert.equal(single.userData.kind,'fixed');
  for(const o of group.children)o.traverse(x=>{x.geometry?.dispose();x.material?.dispose();});
});
