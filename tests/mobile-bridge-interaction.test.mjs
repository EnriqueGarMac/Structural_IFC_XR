import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {pickBridgeTouch,pickBridgeTouchNode,pickBridgeTouchMember}
  from '../src/mobile-bridge-interaction.mjs';
import {projectedMobileBridgeNodes,setupMobileBridgeEditor}
  from '../src/mobile-bridge-editor.js';
import {BridgeCompetitionExperience} from '../src/bridge-competition.js';

function makeApp(){
  const scene=new THREE.Scene(),worldRoot=new THREE.Group();
  worldRoot.rotation.x=-Math.PI/2;
  const contentRoot=new THREE.Group();
  scene.add(worldRoot);worldRoot.add(contentRoot);
  const camera=new THREE.PerspectiveCamera(60,1080/1920,.01,100);
  camera.position.set(.6,1.4,2.5);
  camera.lookAt(.6,.14,0);
  scene.add(camera);
  const app={
    scene,worldRoot,contentRoot,camera,mobileAR:true,
    mobileARState:{placed:true},
    renderer:{xr:{getCamera:()=>camera}},
    targetMeters:1.2,maxSize:1.2,
    xrControls:{dirty:false},
    updateScale(){},
    updateTeachingAnalysis(){this.analysisUpdates=(this.analysisUpdates??0)+1;}
  };
  app.bridgeCompetition=new BridgeCompetitionExperience(app);
  app.bridgeCompetition.activate();
  return app;
}
const viewport={left:0,top:0,width:1080,height:1920};
test('mobile projected grid points correspond to actual XR camera geometry',()=>{
  const app=makeApp(),bridge=app.bridgeCompetition;
  const projected=projectedMobileBridgeNodes(app,viewport);
  assert.equal(projected.length,45);
  for(const id of ['B0','B2','B4','T1']){
    const p=projected.find(x=>x.id===id);
    assert.ok(p?.visible,id+' should be visible');
    assert.deepEqual(pickBridgeTouch(projected,[],p.x,p.y,'add')?.id,id);
  }
  assert.equal(pickBridgeTouch(projected,[],50,50,'add'),null,
    'An unrelated screen tap must not create an arbitrary bar');
  bridge.deactivate();
});
test('mobile bar removal selects a drawn member rather than background nodes',()=>{
  const nodes=[
    {id:'A',x:100,y:180,visible:true},
    {id:'B',x:400,y:180,visible:true},
    {id:'C',x:250,y:400,visible:true}
  ],members=[{id:'M1',i:'A',j:'B'}];
  assert.deepEqual(pickBridgeTouchMember(nodes,members,260,191)?.id,'M1');
  assert.equal(pickBridgeTouchMember(nodes,members,260,250),null);
  assert.equal(pickBridgeTouchNode(nodes,101,183)?.id,'A');
  assert.equal(pickBridgeTouch(nodes,members,250,180,'remove')?.id,'M1');
  assert.equal(pickBridgeTouch(nodes,members,250,180,'add'),null);
});
test('Android AR touch toolbar edits same structural model and calls same calculator',()=>{
  const originalDocument=globalThis.document;
  const originalOption=globalThis.Option;
  const elements=new Map();
  class FakeElement {
    constructor(id){this.id=id;this.hidden=false;this.disabled=false;
      this.textContent='';this.value='';this.listeners=new Map();this.attrs={};
      this.options=[];this.classList={toggle(){}};}
    addEventListener(name,listener){this.listeners.set(name,listener);}
    setAttribute(name,value){this.attrs[name]=value;}
    add(option){this.options.push(option);}
    getBoundingClientRect(){return viewport;}
    fire(name,extras={}){
      const fn=this.listeners.get(name);
      assert.ok(fn,this.id+' must support '+name);
      return fn({button:0,preventDefault(){},...extras});
    }
  }
  globalThis.document={getElementById(id){
    if(!elements.has(id))elements.set(id,new FakeElement(id));
    return elements.get(id);
  }};
  globalThis.Option=class Option{
    constructor(text,value){this.text=text;this.value=value;}
  };
  try{
    const app=makeApp(),bridge=app.bridgeCompetition;
    const ui=setupMobileBridgeEditor(app);
    assert.equal(elements.get('mobile-ar-bridge-editor').hidden,false);
    assert.equal(elements.get('mobile-ar-bridge-touch').hidden,false);
    const fire=(id,event='click',extras={})=>
      elements.get(id).fire(event,extras);
    const touchNode=id=>{
      const target=projectedMobileBridgeNodes(app,viewport).find(p=>p.id===id);
      assert.ok(target?.visible);
      fire('mobile-ar-bridge-touch','pointerup',{
        clientX:target.x,clientY:target.y});
    };
    fire('mobile-ar-bridge-add');
    assert.equal(bridge.addMode,true);
    touchNode('B0');touchNode('T1');
    assert.equal(bridge.members.length,1);
    assert.equal(bridge.addMode,false);
    assert.equal(bridge.members[0].sectionId,'bar_m');
    assert.equal(bridge.members[0].i,'B0');
    assert.equal(bridge.members[0].j,'T1');
    elements.get('mobile-ar-bridge-section').value='bar_l';
    fire('mobile-ar-bridge-section','change');
    fire('mobile-ar-bridge-load-plus');
    assert.equal(bridge.load_kN,3.5);
    fire('mobile-ar-bridge-add');
    touchNode('T1');touchNode('B2');
    assert.equal(bridge.members.at(-1).sectionId,'bar_l');
    fire('mobile-ar-bridge-calc');
    assert.ok(bridge.result,'AR uses the existing calculation');
    assert.equal(bridge.mode,'displacement');
    assert.ok(app.analysisUpdates>0);
    fire('mobile-ar-bridge-mode');
    assert.equal(bridge.mode,'axial');
    fire('mobile-ar-bridge-undeformed');
    assert.equal(bridge.undeformedView,true);
    fire('mobile-ar-bridge-remove');
    assert.equal(bridge.removeMode,true);
    const map=projectedMobileBridgeNodes(app,viewport);
    const a=map.find(p=>p.id==='B0'),b=map.find(p=>p.id==='T1');
    fire('mobile-ar-bridge-touch','pointerup',{
      clientX:(a.x+b.x)/2,clientY:(a.y+b.y)/2});
    assert.equal(bridge.members.length,1);
    fire('mobile-ar-bridge-clear');
    assert.equal(bridge.members.length,0);
    app.mobileARState.placed=false;
    ui.refresh();
    assert.equal(elements.get('mobile-ar-bridge-touch').hidden,true,
      'Surface placement must occur before scene taps are consumed');
    bridge.deactivate();
  }finally{
    globalThis.document=originalDocument;
    globalThis.Option=originalOption;
  }
});
