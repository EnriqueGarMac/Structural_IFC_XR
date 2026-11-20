import test from 'node:test';
import assert from 'node:assert/strict';
import {withXRTestMode,nextXRTestMode} from '../src/xr-ab-diagnostics.mjs';

test('A/B render modes isolate groups and restore all visibility',()=>{
 const originalGroup={visible:true},deformedGroup={visible:true};
 const loadsGroup={visible:true},other={visible:true};
 const contentRoot={children:[originalGroup,deformedGroup,loadsGroup,other]};
 const worldRoot={visible:true},vrEnvironment={visible:true};
 const app={isXR:true,xrTestMode:'sin-modelo',worldRoot,vrEnvironment,
   originalGroup,deformedGroup,loadsGroup,contentRoot};
 withXRTestMode(app,()=>{
   assert.equal(worldRoot.visible,false);
   assert.equal(vrEnvironment.visible,false);
 });
 assert.equal(worldRoot.visible,true);
 assert.equal(vrEnvironment.visible,true);
 app.xrTestMode='solo-bim';
 withXRTestMode(app,()=>{
   assert.equal(originalGroup.visible,true);
   assert.equal(deformedGroup.visible,true);
   assert.equal(loadsGroup.visible,false);
   assert.equal(other.visible,false);
 });
 assert.equal(loadsGroup.visible,true);
 assert.equal(other.visible,true);
 app.xrTestMode='sin-bim';
 assert.throws(()=>withXRTestMode(app,()=>{
   assert.equal(originalGroup.visible,false);
   throw Error('render failure');
 }),/render failure/);
 assert.equal(originalGroup.visible,true);
 assert.equal(deformedGroup.visible,true);
});
test('test mode cycle returns to normal',()=>{
 let mode='normal';
 for(let i=0;i<4;i++)mode=nextXRTestMode(mode);
 assert.equal(mode,'normal');
});
