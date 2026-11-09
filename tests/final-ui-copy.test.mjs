import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {demoResults} from '../src/demo.js';
import {roofDemoResults} from '../src/roof-demo.js';
import {deformationScale} from '../src/deformation-scale.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('final UI names the actual educational buildings and uses clear result vocabulary',()=>{
  const html=read('index.html');
  assert.match(html,/Edificio de 3 plantas/);
  assert.match(html,/Nave industrial/);
  assert.match(html,/<small>NODOS<\/small>/);
  assert.match(html,/<small>BARRAS<\/small>/);
  assert.match(html,/Cargar resultados/);
  assert.match(html,/Amplificación de la deformada/);
  assert.doesNotMatch(html,/NUDOS SAP|BARRAS SAP|Prototipo experimental|Interpolada entre nudos SAP/);
  const xr=read('src/xr-controls.js');
  assert.match(xr,/EDIFICIO · 3 PLANTAS/);
  assert.match(xr,/NAVE INDUSTRIAL/);
  assert.match(xr,/Solo modelo de cálculo/);
  assert.doesNotMatch(xr,/CUBIERTA CELOSÍA|PÓRTICO'|Barras SAP:|Solo elementos SAP2000/);
});

test('force readout contains its engineering value and section but no raw interpolation explanation',()=>{
  const main=read('src/main.js');
  assert.match(main,/measured\.station\.toFixed\(3\)/);
  assert.match(main,/measured\.value\.toFixed\(3\)/);
  assert.match(main,/measured\.unit/);
  assert.doesNotMatch(main,/Interpolado entre estaciones SAP2000/);
});

test('increased visual magnification stays below a bounded physical-span fraction',()=>{
  for(const model of [demoResults,roofDemoResults]){
    for(const {name} of model.cases){
      const next=deformationScale(model,name);
      const old=deformationScale(model,name,{
        targetFraction:.004,maximumFraction:.025
      });
      // Compared with the previous version, the initial deformation is
      // approximately 3.25x more legible, without changing solver values.
      assert.ok(next.defaultAmp>=old.defaultAmp*2.9,
        'Deformation has not increased sufficiently in '+model.meta?.name+' '+name);
      assert.ok(next.defaultAmp*next.displacement<=next.span*.015+1e-6);
      assert.ok(next.maxAmp*next.displacement<=next.span*.06+1e-6);
    }
  }
});
