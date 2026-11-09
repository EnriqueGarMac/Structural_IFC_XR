import test from 'node:test';
import assert from 'node:assert/strict';
import {exportEducationalIFC} from '../src/ifc4-export.mjs';
import {buildingTeaching} from '../src/building-teaching-model.mjs';
import {industrialTeaching} from '../src/industrial-teaching-model.mjs';

function checkStep(model,levels){
  const output=exportEducationalIFC({name:model.results.meta.name,
    parts:model.parts,levels});
  const s=output.content;
  assert.ok(s.startsWith('ISO-10303-21;\nHEADER;'));
  assert.match(s,/FILE_SCHEMA\(\('IFC4'\)\);/);
  assert.ok(s.endsWith('ENDSEC;\nEND-ISO-10303-21;'));
  for(const entity of ['IFCPROJECT','IFCSITE','IFCBUILDING','IFCBUILDINGSTOREY',
    'IFCRELAGGREGATES','IFCRELCONTAINEDINSPATIALSTRUCTURE',
    'IFCGEOMETRICREPRESENTATIONCONTEXT','IFCFACETEDBREP',
    'IFCWALL','IFCBEAM','IFCCOLUMN','IFCDOOR','IFCWINDOW','IFCSLAB',
    'IFCPROPERTYSET','IFCPROPERTYSINGLEVALUE'])assert.ok(s.includes('='+entity+'('),entity);
  assert.ok(output.stats.products>150);
  assert.ok(output.stats.spaces>0);
  assert.equal(output.stats.levels,levels.length);
  assert.equal((s.match(/=IFCFACETEDBREP\(/g)||[]).length,output.stats.products);
  assert.equal((s.match(/=IFCPROPERTYSET\(/g)||[]).length,output.stats.products);
  const defined=[...s.matchAll(/^#(\d+)=/gm)].map(m=>Number(m[1]));
  const definedSet=new Set(defined);
  assert.equal(definedSet.size,defined.length);
  assert.equal(defined.length,output.stats.entities);
  for(const ref of s.matchAll(/#(\d+)(?=[,);])/g))
    assert.ok(definedSet.has(Number(ref[1])),'Dangling STEP #'+ref[1]);
  assert.ok(!s.includes("'$."),"Malformed IFC string token");
  assert.ok(s.includes('IncludedIn2DMatrixModel'));
  assert.ok(s.includes('StructuralElement'));
  assert.ok(s.includes('IFCBOOLEAN(.T.)')&&s.includes('IFCBOOLEAN(.F.)'));
  return output;
}
test('real IFC4 STEP model for residential building with rooms and load-bearing roles',()=>{
  const out=checkStep(buildingTeaching,[0,3.2,6.4,9.6]);
  assert.ok(out.stats.spaces>=12);
  assert.ok(out.stats.products>300);
  assert.match(out.content,/=IFCSANITARYTERMINAL\(/);
  assert.match(out.content,/=IFCFURNISHINGELEMENT\(/);
});
test('real IFC4 STEP model for industrial warehouse with loading landscape',()=>{
  const out=checkStep(industrialTeaching,[0]);
  assert.ok(out.stats.products>250);
  assert.ok(out.stats.spaces>=2);
  assert.match(out.content,/=IFCROOF\(/);
  assert.match(out.content,/=IFCGEOGRAPHICELEMENT\(/);
});
test('a simple cube has 6 closed BRep faces and 8 IFC Cartesian points',()=>{
  const out=exportEducationalIFC({name:'Test box',parts:[{
    type:'box',name:'Beam unit',ifcType:'IfcBeam',
    center:[0,0,0],size:[2,.3,.4],color:0xabcdd2,structural:true
  }]});
  assert.equal((out.content.match(/=IFCFACE\(/g)||[]).length,6);
  assert.equal((out.content.match(/=IFCFACEOUTERBOUND\(/g)||[]).length,6);
  assert.ok((out.content.match(/=IFCCARTESIANPOINT\(/g)||[]).length>=8);
});
