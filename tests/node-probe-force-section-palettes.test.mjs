import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {forceSectionMarker} from '../src/force-section-marker.mjs';
import {
  FORCE_PALETTES,STRUCTURE_COLOURS,forceSignColour,forcePalette,
  structuralColour,nextPalette,cssForceGradient
} from '../src/visual-palettes.mjs';
import {NodeDisplacementProbe,displacementLabel} from '../src/node-displacement-probe.js';

test('section cut crosses exactly the selected station and reaches force ordinate',()=>{
  const line=forceSectionMarker({
    origin:[1,2,3],axis:[1,0,0],normal:[0,0,1],
    station:2.5,value:-5,amplitude:.2,scale:10
  });
  assert.equal(line.positions.length,24);
  assert.deepEqual(line.base,[3.5,2,3]);
  assert.deepEqual(line.tip,[3.5,2,2]);
  assert.ok(line.positions.every(Number.isFinite));
  assert.ok(line.positions[0]===3.5);
  // The cut remains visible on the force-axis if ordinate is zero.
  const zero=forceSectionMarker({
    origin:[0,0,0],axis:[1,0,0],normal:[0,0,1],
    station:1,value:0,amplitude:.2,scale:10
  });
  assert.ok(zero.positions.some(v=>v!==0));
  assert.throws(()=>forceSectionMarker({
    origin:[0,0,0],axis:[1,0,0],normal:[0,0,1],
    station:NaN,value:1,amplitude:1
  }),/no finitas/);
});
test('colours always distinguish force signs and preserve model originals',()=>{
  assert.deepEqual(Object.keys(FORCE_PALETTES),
    ['classic','contrast','nature','violet']);
  assert.equal(forceSignColour(-1,'classic'),0x48bbd8);
  assert.equal(forceSignColour(1,'classic'),0xf5b364);
  for(const key of Object.keys(FORCE_PALETTES)){
    const scheme=forcePalette(key);
    assert.notEqual(scheme.negative,scheme.positive);
    assert.equal(forceSignColour(0,key),scheme.zero);
    assert.ok(cssForceGradient(key).includes('#'));
  }
  assert.equal(structuralColour('original',0x334455),0x334455);
  assert.equal(structuralColour('teal',0x334455),STRUCTURE_COLOURS.teal.hex);
  assert.equal(nextPalette(STRUCTURE_COLOURS,'original'),'teal');
  assert.equal(nextPalette(FORCE_PALETTES,'violet'),'classic');
});
test('node probe reads true unscaled displacement even when the geometry is amplified',()=>{
  const scene=new THREE.Scene(),worldRoot=new THREE.Group();
  const contentRoot=new THREE.Group();scene.add(worldRoot);worldRoot.add(contentRoot);
  const app={scene,worldRoot,contentRoot,maxSize:10,amp:100,showDeformed:true,
    offset:[0,0,0],caseName:'WIND_X',
    sapVisuals:{view:'deformation'},results:{
      nodes:[{id:'A',x:0,y:0,z:0},{id:'B',x:3,y:0,z:0}],
      cases:[{name:'WIND_X',displacements:[
        {node:'A',ux:0,uy:0,uz:0},
        {node:'B',ux:.01,uy:0,uz:-.02}
      ]}]
    }};
  const probe=new NodeDisplacementProbe(app);
  probe.refresh();
  assert.equal(probe.pickers.length,2);
  const ray=new THREE.Raycaster(new THREE.Vector3(4,0,5),
    new THREE.Vector3(0,0,-1));
  const hit=probe.pick(ray);
  assert.ok(hit,'Expected ray hit on visually displaced node B');
  assert.equal(hit.id,'B');
  assert.equal(hit.ux,.01);
  assert.equal(hit.uz,-.02);
  assert.equal(hit.point.x,4);
  assert.ok(displacementLabel(hit,'WIND_X').includes('10,000 mm'));
  assert.ok(displacementLabel(hit,'WIND_X').includes('22,361 mm'));
  probe.pin(hit);
  assert.equal(probe.pinnedId,'B');
  probe.hideXRHover();
  assert.equal(probe.highlight.visible,true);
  app.caseName='OTHER';probe.refresh();assert.equal(probe.pickers.length,0);
});
