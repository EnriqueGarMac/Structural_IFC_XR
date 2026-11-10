import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {VIEW_CONTROLS,isControlActive} from '../src/view-controls.mjs';
import {fitPerspectiveToBounds} from '../src/camera-framing.mjs';

test('each results view only enables the controls that change it',()=>{
  assert.ok(isControlActive('deformation','pattern')&&isControlActive('deformation','amplification'));
  assert.ok(!isControlActive('forces','pattern')&&isControlActive('forces','component'));
  for(const view of ['modes','buckling']){
    assert.ok(isControlActive(view,'mode'));
    assert.ok(!isControlActive(view,'case'),'A modal shape does not depend on the static case: '+view);
    assert.ok(!isControlActive(view,'amplification'));
  }
  // Buckling keeps the loads: it draws the reference loads of the case.
  assert.ok(isControlActive('buckling','loads')&&!isControlActive('buckling','pattern'));
  assert.deepEqual(Object.keys(VIEW_CONTROLS),['deformation','forces','reactions','modes','buckling']);
  assert.equal(isControlActive('unknown','pattern'),true);
});

test('a slender model fills the view instead of its bounding sphere',()=>{
  // An 18 m girder, 0.5 m deep and 0.2 m wide (world Y up).
  const bounds=new THREE.Box3(new THREE.Vector3(0,0,-.1),new THREE.Vector3(18,.5,.1));
  const camera=new THREE.PerspectiveCamera(45,1.45,.01,1000);
  const fit=fitPerspectiveToBounds(camera,bounds);
  const sphereDistance=fit.radius/Math.sin(THREE.MathUtils.degToRad(22.5))*1.22;
  assert.ok(fit.distance<sphereDistance*.75,'Framing still wastes the screen: '+fit.distance);
  camera.updateMatrixWorld();
  let widest=0;
  for(const x of [0,18])for(const y of [0,.5])for(const z of [-.1,.1]){
    const p=new THREE.Vector3(x,y,z).project(camera);
    widest=Math.max(widest,Math.abs(p.x),Math.abs(p.y));
  }
  // Every corner is visible, with the 40 % margin on the limiting extent.
  assert.ok(widest<=1/1.4+1e-9,'A corner leaves the safe area: '+widest);
  assert.ok(widest>.65,'The girder should use most of the safe area: '+widest);
});

test('Quest results menu freezes inactive controls and offers the shape amplitude',async()=>{
  const elements=new Map([['modal-amplitude',{value:'0.3',min:'0',max:'1',events:[],
    dispatchEvent(e){this.events.push(e.type);}}]]);
  const context=new Proxy({},{get:(target,key)=>key in target?target[key]:()=>({width:0}),
    set:(target,key,value)=>{target[key]=value;return true;}});
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context}),
    getElementById:id=>elements.get(id)??null};
  const {StructuralXRControls}=await import('../src/xr-controls.js');
  const group=()=>new THREE.Group();
  const app={scene:new THREE.Scene(),worldRoot:new THREE.Group(),
    renderer:{xr:{getController:group,getControllerGrip:group}},
    caseName:'DEAD',pattern:'all',amp:10,ampMax:150,results:{modes:[],bucklingModes:[{number:1,factor:-59.5}]},
    sapVisuals:{view:'buckling',modeIndex:0,modalAmplitude:.3,activeModes:()=>[]}};
  const menu=new StructuralXRControls(app);
  menu.page='results';
  const ids=()=>{menu.repaint();return new Set(menu.hits.map(h=>h.id));};
  let hits=ids();
  for(const frozen of ['case:+','case:-','pattern:+','pattern:-','amp-slider','amp:+'])
    assert.ok(!hits.has(frozen),'Frozen control still reacts in buckling view: '+frozen);
  assert.ok(hits.has('shape-amp:+')&&hits.has('shape-amp:-'));
  menu.command('shape-amp:+');
  assert.equal(elements.get('modal-amplitude').value,'0.4');
  assert.deepEqual(elements.get('modal-amplitude').events,['input']);
  app.sapVisuals.view='deformation';
  hits=ids();
  for(const active of ['case:+','pattern:+','amp-slider','amp:+'])assert.ok(hits.has(active),active);
  assert.ok(!hits.has('shape-amp:+'));
  delete globalThis.document;
});
