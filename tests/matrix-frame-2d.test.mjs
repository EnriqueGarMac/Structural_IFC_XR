import test from 'node:test';
import assert from 'node:assert/strict';
import {solveFramePlane} from '../src/matrix-frame-2d.mjs';
const close=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`Expected ${a}≈${b}`);
test('distributed axial cantilever matches exact EA displacement and reaction',()=>{
  const r=solveFramePlane({
    nodes:[{id:'A',x:0,y:0,z:0,fixed2D:[true,true,true]},
      {id:'B',x:2,y:0,z:0}],
    frames:[{id:'AB',i:'A',j:'B',E_kN_m2:1000000,A_m2:.01,
      I_m4:.0001,loads:{AXIAL:[10,0]}}],
    cases:[{name:'AXIAL'}]
  });
  close(r.cases[0].displacements[1].ux,.002);
  close(r.jointReactions.AXIAL.A.force_kN[0],-20);
  close(r.forces.AXIAL.AB[0].P_kN,20);
  close(r.frameCurves.AXIAL.AB[5][0],.0015);
});
test('uniform gravity on a cantilever matches exact Euler-Bernoulli tip deflection',()=>{
  const E=30000000,I=.0005,L=4,w=5;
  const r=solveFramePlane({
    nodes:[{id:'A',x:0,y:0,z:0,fixed2D:[true,true,true]},
      {id:'B',x:L,y:0,z:0}],
    frames:[{id:'B',i:'A',j:'B',E_kN_m2:E,A_m2:.08,I_m4:I,
      loads:{DEAD:[0,-w]}}],
    cases:[{name:'DEAD'}]
  });
  close(r.cases[0].displacements[1].uz,-w*L**4/(8*E*I));
  close(r.jointReactions.DEAD.A.force_kN[2],w*L);
  close(r.frameCurves.DEAD.B[10][2],r.cases[0].displacements[1].uz);
  assert.ok(Math.abs(r.frameCurves.DEAD.B[5][2])>0);
  const end=r.forces.DEAD.B;
  assert.ok(end[0].M3_kNm<0);
});
test('fully fixed member has no translations but nonzero end moments and balanced reactions',()=>{
  const r=solveFramePlane({
    nodes:[{id:'A',x:0,y:0,z:0,fixed2D:[true,true,true]},
      {id:'B',x:5,y:0,z:0,fixed2D:[true,true,true]}],
    frames:[{id:'B',i:'A',j:'B',E_kN_m2:210000000,A_m2:.012,
      I_m4:.00008,loads:{DEAD:[0,-6]}}],
    cases:[{name:'DEAD'}]
  });
  close(r.cases[0].displacements[0].uz,0);
  close(r.cases[0].displacements[1].uz,0);
  close(r.jointReactions.DEAD.A.force_kN[2]+r.jointReactions.DEAD.B.force_kN[2],30);
  assert.ok(Math.abs(r.jointReactions.DEAD.A.moment_kNm[1])>1);
});
