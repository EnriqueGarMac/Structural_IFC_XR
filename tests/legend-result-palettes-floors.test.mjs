import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildingTeaching} from '../src/building-teaching-model.mjs';
import {demoResults} from '../src/demo.js';
import {exportEducationalIFC} from '../src/ifc4-export.mjs';
import {isTerrainElement} from '../src/view-filters.mjs';
import {ifcElementOpacity} from '../src/ifc-opacity.mjs';
import {FORCE_PALETTES,resultColourHex,resultColourStops,
  cssResultGradient,forceSignColour} from '../src/visual-palettes.mjs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('the only colour UI is the accessible results legend, never the IFC',()=>{
  const html=source('index.html'),main=source('src/main.js');
  const xr=source('src/xr-controls.js');
  assert.match(html,/id="legend-palette-toggle"/);
  assert.match(html,/id="legend-palette-picker" hidden/);
  assert.match(html,/id="result-palette"/);
  assert.match(html,/id="legend-title"/);
  assert.doesNotMatch(html,/id="structure-palette"|id="force-palette"/);
  assert.doesNotMatch(main,/setStructurePalette|\$\('force-palette'\)/);
  assert.match(main,/app\.sapVisuals\.setPalette\(e\.target\.value\)/);
  assert.match(xr,/palette:results/);
  assert.doesNotMatch(xr,/palette:model|palette:forces|this\.page==='colors'/);
});
test('one palette applies consistently to scalar displacement and signed forces',()=>{
  for(const key of Object.keys(FORCE_PALETTES)){
    const stops=resultColourStops(key);
    assert.equal(resultColourHex(0,key),stops[0][1]);
    assert.equal(resultColourHex(1,key),stops.at(-1)[1]);
    assert.notEqual(resultColourHex(.2,key),resultColourHex(.8,key));
    assert.ok(cssResultGradient(key).startsWith('linear-gradient('));
    assert.notEqual(forceSignColour(-1,key),forceSignColour(1,key));
  }
  assert.equal(resultColourHex(-3,'classic'),resultColourHex(0,'classic'));
  assert.equal(resultColourHex(8,'classic'),resultColourHex(1,'classic'));
  const scene=source('src/scene.js');
  assert.match(scene,/colorMap\(intensity,this\.sapVisuals\?\.palette\)/);
  assert.match(scene,/colorMap\(Math\.abs\(intensity\)\/maxW,this\.sapVisuals\?\.palette\)/);
  assert.doesNotMatch(scene,/setStructurePalette\(/);
});
test('every occupied storey has opaque floor finishes underneath furniture',()=>{
  const rooms=buildingTeaching.parts.filter(part=>
    part.ifcType==='IfcCovering'&&part.name.startsWith('Pavimento interior '));
  assert.equal(rooms.length,21);
  for(let level=0;level<3;level++){
    const pieces=rooms.filter(p=>p.storey===level);
    assert.equal(pieces.length,7);
    assert.ok(pieces.some(p=>/Cocina/.test(p.name)));
    assert.ok(pieces.some(p=>/Baño/.test(p.name)));
    assert.ok(pieces.some(p=>/Salón/.test(p.name)));
    assert.ok(pieces.some(p=>/Dormitorio/.test(p.name)));
    for(const p of pieces){
      assert.equal(p.structural,false);
      assert.equal(isTerrainElement(p),false,'Interior pavement must not be hidden with terrain');
      assert.ok(Math.abs(p.center[2]+p.size[2]/2-(level*3.2+.12))<1e-9);
      assert.equal(ifcElementOpacity({
        opacity:.22,scope:'envelope',ifcType:p.ifcType,elementName:p.name
      }),1,'Floor finishes remain opaque with translucent envelope');
      assert.equal(ifcElementOpacity({
        opacity:.22,scope:'all',ifcType:p.ifcType,elementName:p.name
      }),.22);
    }
  }
  assert.deepEqual(demoResults.cases.map(c=>c.name),['DEAD','WIND_X']);
  const ifc=exportEducationalIFC({name:buildingTeaching.results.meta.name,
    parts:buildingTeaching.parts,levels:[0,3.2,6.4,9.6]});
  assert.ok(ifc.content.includes('Pavimento interior Cocina'));
  assert.ok(ifc.content.split('=IFCCOVERING(').length>=22);
});
test('navigation guidance is docked after view controls rather than floating over model',()=>{
  const html=source('index.html'),css=source('src/style.css');
  const row=html.indexOf('class="viewer-controls-row"');
  const buttons=html.indexOf('class="mode-tabs"',row);
  const help=html.indexOf('id="help-text"',buttons);
  const reset=html.indexOf('id="reset-view"',help);
  assert.ok(row>=0&&row<buttons&&buttons<help&&help<reset);
  assert.match(css,/\.viewer-controls-row\s*\{/);
  assert.match(css,/\.viewer-controls-row \.help-text/);
  assert.match(css,/\.viewer-controls-row \.mode-tabs/);
});
