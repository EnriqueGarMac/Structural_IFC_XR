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
