import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {demoGeometry,demoResults,buildingTeaching} from '../src/demo.js';
import {roofDemoGeometry,roofDemoResults,ROOF_DEMO,industrialTeaching,roofDemoStats} from '../src/roof-demo.js';
import {isTerrainElement} from '../src/view-filters.mjs';

const balance=(results,caseName)=>{
  const total=[0,0,0];
  const frames=new Map(results.frames.map(f=>[f.id,f]));
  for(const l of results.loads.filter(x=>x.pattern===caseName)){
    const f=frames.get(l.frame);
    assert.ok(f);
    const v=(l.w1+l.w2)/2*f.length_m*(l.end-l.start);
    const axis={4:0,5:1,6:2}[l.dir];
    if(axis!==undefined)total[axis]+=v;
  }
  for(const r of Object.values(results.jointReactions[caseName]??{}))
    for(let i=0;i<3;i++)total[i]+=r.force_kN[i];
  assert.ok(total.every(v=>Math.abs(v)<1e-5),caseName+' unbalanced: '+JSON.stringify(total));
};
const validate=(results)=>{
  const ids=new Set(results.nodes.map(n=>n.id));
  const frames=new Set(results.frames.map(f=>f.id));
  assert.equal(ids.size,results.nodes.length);
  assert.equal(frames.size,results.frames.length);
  assert.deepEqual(results.cases.map(c=>c.name),['DEAD','WIND_X']);
  for(const f of results.frames){
    assert.ok(ids.has(f.i)&&ids.has(f.j));
    assert.ok(f.length_m>0);
  }
  for(const name of ['DEAD','WIND_X']){
    assert.ok(results.forces[name]&&results.frameCurves[name]);
    assert.ok(Object.keys(results.jointReactions[name]).length);
    assert.ok(results.cases.find(c=>c.name===name).displacements.some(d=>
      Math.hypot(d.ux,d.uy,d.uz)>1e-9));
    for(const f of results.frames){
      const data=results.forces[name][f.id];
      assert.equal(data.length,11);
      assert.ok(data.every(x=>['P_kN','V2_kN','M3_kNm'].every(k=>Number.isFinite(x[k]))));
      assert.equal(results.frameCurves[name][f.id].length,11);
    }
    balance(results,name);
  }
};
test('three-storey building: gravity and wind FEM, wall/door/window/room semantics',()=>{
  validate(demoResults);
  const parts=buildingTeaching.parts;
  const categories=new Set(parts.map(p=>p.ifcType));
  for(const kind of ['IfcColumn','IfcBeam','IfcSlab','IfcWall','IfcDoor',
    'IfcWindow','IfcSpace','IfcSanitaryTerminal','IfcFurnishingElement',
    'IfcGeographicElement','IfcFooting'])assert.ok(categories.has(kind),kind);
  assert.ok(parts.some(p=>/Cocina/i.test(p.name)));
  assert.ok(parts.some(p=>/Dormitorio/i.test(p.name)));
  assert.ok(parts.some(p=>/Baño/i.test(p.name)));
  assert.ok(parts.some(p=>/Fachada/i.test(p.name)));
  assert.ok(parts.some(p=>p.structural));
  assert.ok(parts.some(p=>p.structural===false));
  assert.equal(buildingTeaching.spaces.filter(x=>x.type==='space').length,12);
  assert.ok(demoResults.nodes.filter(n=>n.restrained_dof?.[0]).length>=6);
  const geo=demoGeometry();
  assert.ok(geo.length>150);
  assert.ok(geo.every(x=>x.preserveStructuralOrigin));
  assert.ok(geo.some(x=>x.analysisIncluded));
  assert.ok(geo.some(x=>x.structural && !x.analysisIncluded));
  assert.ok(geo.some(x=>!x.structural && !x.analysisIncluded));
  geo.forEach(p=>p.geometry.dispose());
});
test('industrial hall: exact global balance, 5 truss planes and warehouse BIM',()=>{
  validate(roofDemoResults);
  assert.equal(ROOF_DEMO.span,18);
  assert.equal(ROOF_DEMO.length,24);
  assert.equal(roofDemoStats().cases,2);
  assert.ok(roofDemoResults.nodes.length>120);
  assert.ok(roofDemoResults.frames.length>240);
  const parts=industrialTeaching.parts;
  for(const type of ['IfcRoof','IfcWall','IfcWindow','IfcDoor','IfcFooting',
    'IfcSlab','IfcGeographicElement','IfcFurnishingElement']){
    assert.ok(parts.some(p=>p.ifcType===type),type);
  }
  assert.ok(parts.some(p=>/Correa longitudinal/i.test(p.name)));
  assert.ok(parts.some(p=>/Puerta seccional|Portón/i.test(p.name)));
  assert.ok(parts.some(p=>/Muelle|Explanada/i.test(p.name)));
  const roof=roofDemoGeometry();
  assert.equal(roof.length,roofDemoStats().pieces);
  const bbox=new THREE.Box3();
  roof.filter(x=>!isTerrainElement(x)).forEach(p=>bbox.union(
    p.geometry.boundingBox||(p.geometry.computeBoundingBox(),p.geometry.boundingBox)));
  assert.ok(bbox.max.z>=9.0);
  assert.ok(bbox.min.z<0);
  roof.forEach(p=>p.geometry.dispose());
});
test('calculated displacements are not synthetic and each fixed support stays immobile',()=>{
  for(const results of [demoResults,roofDemoResults]){
    assert.match(results.meta.source,/matricial/i);
    assert.doesNotMatch(results.meta.note,/NO proceden de SAP2000/);
    const fixed=new Set(results.nodes.filter(n=>n.restrained_dof?.[0]&&n.restrained_dof?.[2]).map(n=>n.id));
    for(const c of results.cases)
      for(const d of c.displacements.filter(d=>fixed.has(d.node))){
        assert.ok(Math.hypot(d.ux,d.uy,d.uz)<1e-10);
      }
  }
});
