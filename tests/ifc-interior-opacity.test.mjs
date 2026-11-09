import test from 'node:test';
import assert from 'node:assert/strict';
import {ifcElementOpacity,isEnvelopeElement,nextXRIFCOpacity,
  normalizedScope} from '../src/ifc-opacity.mjs';
import {buildingTeaching} from '../src/building-teaching-model.mjs';
import {exportEducationalIFC} from '../src/ifc4-export.mjs';

test('envelope transparency exposes furniture while retaining structure opacity',()=>{
  assert.equal(ifcElementOpacity({opacity:.25,scope:'envelope',ifcType:'IfcWall'}),.25);
  assert.equal(ifcElementOpacity({opacity:.25,scope:'envelope',ifcType:'IfcRoof'}),.25);
  assert.equal(ifcElementOpacity({opacity:.25,scope:'envelope',ifcType:'IfcSlab'}),.25);
  assert.equal(ifcElementOpacity({opacity:.25,scope:'envelope',ifcType:'IfcWindow'}),.25);
  assert.equal(ifcElementOpacity({opacity:.25,scope:'envelope',ifcType:'IfcColumn'}),1);
  assert.equal(ifcElementOpacity({opacity:.25,scope:'envelope',ifcType:'IfcFurnishingElement'}),1);
  assert.equal(ifcElementOpacity({opacity:.25,scope:'envelope',ifcType:'IfcSanitaryTerminal'}),1);
  assert.equal(ifcElementOpacity({opacity:.25,scope:'all',ifcType:'IfcFurnishingElement'}),.25);
  assert.equal(ifcElementOpacity({opacity:1,structuralDeformation:true,ifcType:'IfcBeam'}),.16);
  assert.equal(ifcElementOpacity({opacity:.07,scope:'all',
    structuralDeformation:true,ifcType:'IfcBeam'}),.07);
  assert.equal(ifcElementOpacity({opacity:-1,scope:'all',ifcType:'IfcWall'}),0);
  assert.equal(ifcElementOpacity({opacity:2,scope:'all',ifcType:'IfcWall'}),1);
  assert.equal(normalizedScope('bad'),'envelope');
  assert.equal(isEnvelopeElement('IFCROOF'),true);
  assert.equal(isEnvelopeElement('IfcGeographicElement'),false);
});
test('Quest opacity cycle is predictable and includes an effective see-through setting',()=>{
  const sequence=[1,.75,.5,.25,.08,1];
  for(let i=0;i<sequence.length-1;i++)
    assert.equal(nextXRIFCOpacity(sequence[i]),sequence[i+1]);
});
test('the three storeys contain genuinely classified furniture and sanitary fixtures',()=>{
  const parts=buildingTeaching.parts;
  for(let level=0;level<3;level++){
    const floor=parts.filter(p=>p.storey===level);
    const n=phrase=>floor.filter(p=>p.name.includes(phrase));
    for(const title of ['Horno eléctrico','Campana extracción','Lavavajillas',
      'Silla comedor','Panel TV pantalla','Cojín asiento','Mampara de ducha',
      'Columna ducha','Cisterna inodoro','Espejo baño',
      'Mesilla noche','Almohada','Escritorio','Lámpara']){
      assert.ok(n(title).length>0,'Missing '+title+' on floor '+level);
    }
    assert.ok(floor.filter(p=>p.ifcType==='IfcFurnishingElement').length>=35);
    assert.ok(floor.filter(p=>p.ifcType==='IfcSanitaryTerminal').length>=5);
    for(const detail of floor.filter(p=>p.type!=='space'&&p.name.endsWith('· planta '+(level+1))))
      assert.equal(detail.structural,false,'Unexpected structural furnishing '+detail.name);
  }
  const bedrooms=parts.filter(p=>p.type==='space'&&p.name.includes('Dormitorio'));
  assert.equal(bedrooms.length,3);
  const bathrooms=parts.filter(p=>p.type==='space'&&p.name.includes('Baño'));
  assert.equal(bathrooms.length,3);
  const ifc=exportEducationalIFC({
    name:buildingTeaching.results.meta.name,parts,levels:[0,3.2,6.4,9.6]
  });
  assert.ok(ifc.stats.products>350);
  assert.ok((ifc.content.match(/=IFCFURNISHINGELEMENT\(/g)||[]).length>=100);
  assert.ok((ifc.content.match(/=IFCSANITARYTERMINAL\(/g)||[]).length>=20);
  assert.ok(ifc.content.split('=IFCLIGHTFIXTURE(').length-1>=10);
  assert.ok(ifc.content.includes('Mampara de ducha'));
  assert.ok(ifc.content.includes('Almohada dormitorio'));
});
