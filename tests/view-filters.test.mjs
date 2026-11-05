import test from 'node:test';
import assert from 'node:assert/strict';
import {isTerrainElement,displayModeVisibility} from '../src/view-filters.mjs';

test('foundation and terrain can be hidden without deleting them',()=>{
 assert.equal(isTerrainElement({name:'Cimentación',ifcType:'IfcFooting'}),true);
 assert.equal(isTerrainElement({name:'Terreno natural'}),true);
 assert.equal(isTerrainElement({name:'IfcSite',ifcType:'IfcSite'}),true);
 assert.equal(isTerrainElement({name:'Ground plane'}),true);
});
test('forjados, beams, columns and walls remain structural, even if names mention floors',()=>{
 assert.equal(isTerrainElement({name:'Losa de cubierta',ifcType:'IfcSlab'}),false);
 assert.equal(isTerrainElement({name:'Suelo planta baja',ifcType:'IfcSlab'}),false);
 assert.equal(isTerrainElement({name:'Viga principal',ifcType:'IfcBeam'}),false);
 assert.equal(isTerrainElement({name:'Pilar 1',ifcType:'IfcColumn'}),false);
 assert.equal(isTerrainElement({name:'Losa de cimentación',ifcType:'IfcSlab'}),false);
});
test('pure analytical SAP view suppresses all IFC meshes, even deformed ones',()=>{
 const view=displayModeVisibility({showSAPOnly:true,showOriginal:true,
   showDeformed:true,hasCases:true});
 assert.equal(view.original,false);
 assert.equal(view.deformed,false);
 assert.equal(view.frames,true);
});
test('combined IFC/SAP view respects visibility toggles and terrain filter',()=>{
 const slab=displayModeVisibility({showSAPOnly:false,showOriginal:true,
   showDeformed:true,hasCases:true,hideGround:true,terrain:false});
 assert.equal(slab.original,true);assert.equal(slab.deformed,true);
 const ground=displayModeVisibility({showSAPOnly:false,showOriginal:true,
   showDeformed:true,hasCases:true,hideGround:true,terrain:true});
 assert.equal(ground.original,false);assert.equal(ground.deformed,false);
 const restored=displayModeVisibility({showSAPOnly:false,showOriginal:true,
   showDeformed:true,hasCases:true,hideGround:false,terrain:true});
 assert.equal(restored.original,true);assert.equal(restored.deformed,true);
});
