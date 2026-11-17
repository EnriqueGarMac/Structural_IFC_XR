import test from 'node:test';
import assert from 'node:assert/strict';
import {TRUSS_LESSON,defaultTrussLoads,normaliseTrussLoads,solveTruss2D}
  from '../src/truss-solver.mjs';
const close=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<eps,a+' not close '+b);
test('pin-jointed triangular truss reproduces hand-calculated axial forces and reactions',()=>{
  const model={nodes:[
    {id:'A',x:0,z:0,fixX:true,fixZ:true},
    {id:'B',x:2,z:0,fixZ:true},
    {id:'C',x:1,z:1}],
    bars:[['A','B'],['A','C'],['C','B']].map(([i,j],k)=>({
      id:'E'+k,i,j,A_m2:.001,E_kN_m2:210e6
    }))};
  const r=solveTruss2D(model,[{nodeId:'C',fz_kN:-10}]);
  close(r.reactions[0].rz_kN,5);
  close(r.reactions[1].rz_kN,5);
  close(r.reactions[0].rx_kN,0);
  close(r.bars[0].axial_kN,5);
  close(r.bars[1].axial_kN,-5*Math.SQRT2);
  close(r.bars[2].axial_kN,-5*Math.SQRT2);
  close(r.bars[0].stress_MPa,5);
  close(r.bars[0].strain,5/(210e6*.001));
  close(r.bars[0].extension_mm,5/(210e6*.001)*2*1000);
  close(r.equilibrium.fx_kN,0,1e-8);
  close(r.equilibrium.fz_kN,0,1e-8);
  close(r.equilibrium.moment_kNm,0,1e-8);
});
test('12-m Warren teaching truss solves loads without artificial bending moments',()=>{
  const model=TRUSS_LESSON;
  const r=solveTruss2D(model,defaultTrussLoads());
  assert.equal(r.displacements.length,model.nodes.length);
  assert.equal(r.bars.length,model.bars.length);
  close(r.reactions.reduce((x,a)=>x+a.rz_kN,0),40,1e-7);
  assert.ok(r.bars.some(b=>b.state==='tracción'));
  assert.ok(r.bars.some(b=>b.state==='compresión'));
  assert.ok(r.maxDisplacement_m>0);
  assert.ok(Math.abs(r.equilibrium.fz_kN)<1e-6);
  const zero=solveTruss2D(model,[]);
  close(zero.maxDisplacement_m,0,1e-12);
});
test('truss load normalization validates nodes, finite values and sums duplicates',()=>{
  const x=normaliseTrussLoads(TRUSS_LESSON,[
    {nodeId:'G',fz_kN:-20},{nodeId:'G',fx_kN:4,fz_kN:-5}
  ]);
  assert.deepEqual(x,[{nodeId:'G',fx_kN:4,fz_kN:-25}]);
  assert.throws(()=>normaliseTrussLoads(TRUSS_LESSON,[{nodeId:'X',fz_kN:1}]),/desconocido/);
  assert.throws(()=>solveTruss2D(TRUSS_LESSON,[{nodeId:'G',fz_kN:Infinity}]),/no finita/);
  const unstable={nodes:[{id:'A',x:0,z:0,fixX:true,fixZ:true},
    {id:'B',x:1,z:0}],bars:[{id:'1',i:'A',j:'B',A_m2:.001,E_kN_m2:210e6}]};
  assert.throws(()=>solveTruss2D(unstable,[{nodeId:'B',fz_kN:-1}]),/inestable/);
});
