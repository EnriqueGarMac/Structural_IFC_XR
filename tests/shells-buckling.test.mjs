import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeResults,modeNodes,areaEdges,bucklingSummary,makeDisplacementSampler,caseNodes} from '../src/results.mjs';
import {unpackRichSAP} from '../src/sap-rich.mjs';

// Two 1 x 1 m plates in the XY plane, as written by scripts/sap2000_to_xr.py.
const plates={
  schema:'imis.sap2000.xr/compatible-1',
  nodes:[[1,0,0],[2,1,0],[3,2,0],[4,0,1],[5,1,1],[6,2,1]].map(([id,x,y])=>({id:String(id),x,y,z:0})),
  frames:[],
  areas:[{id:'10',joints:['1','2','5','4'],section:'PL20',thickness_m:.02},
    {id:'11',joints:['2','3','6','5'],section:'PL20',thickness_m:.02}],
  loads:[],
  pointLoads:[{pattern:'P',joint:'3',xyz_m:[2,0,0],force_kN:[-2,0,0],moment_kNm:[0,0,0]}],
  cases:[{name:'DEAD',displacements:[{node:'5',ux:0,uy:0,uz:-.004}]}],
  frameCurves:{DEAD:{}},
  bucklingModes:[{number:1,case:'BUCK',factor:-12.5,jointShape:{'3':[0,0,1]},frameCurves:{},
    critical_force_resultant_kN:[25,0,0]}],
  bucklingReference:{BUCK:{load_patterns:[{type:'Load pattern',name:'P',scale:1}],
    force_resultant_kN:[-2,0,0],complete:true}}
};

test('plate model keeps areas, point loads and buckling modes',()=>{
  const r=normalizeResults(plates);
  assert.equal(r.areas.length,2);
  assert.deepEqual(r.areas[1].joints,['2','3','6','5']);
  assert.equal(r.pointLoads[0].pattern,'P');
  assert.equal(r.bucklingModes[0].factor,-12.5);
  assert.equal(r.bucklingReference.BUCK.complete,true);
});

test('empty beam curves are dropped so plates use the nodal displacements',()=>{
  const r=normalizeResults(plates);
  assert.deepEqual(r.frameCurves,{});
  const sample=makeDisplacementSampler(caseNodes(r,'DEAD'));
  // A plate vertex sits exactly on a joint: the SAP value is reproduced.
  assert.deepEqual(sample(1,1,0).slice(0,3),[0,0,-.004]);
});

test('plates referencing missing joints are rejected',()=>{
  assert.throws(()=>normalizeResults({...plates,areas:[{id:'9',joints:['1','2','99']}]}),/Placa 9/);
  assert.throws(()=>normalizeResults({...plates,areas:[{id:'8',joints:['1','2']}]}),/Placa 8/);
});

test('buckling shape becomes a nodal field for the plate meshes',()=>{
  const r=normalizeResults(plates);
  const nodes=modeNodes(r,r.bucklingModes[0]);
  const sample=makeDisplacementSampler(nodes);
  assert.deepEqual(sample(2,0,0),[0,0,1,1]);
  assert.deepEqual(sample(0,0,0),[0,0,0,0]);
});

test('shared plate edges are drawn once',()=>{
  const edges=areaEdges(normalizeResults(plates).areas);
  assert.equal(edges.length,7);
  assert.equal(edges.filter(([a,b])=>[a,b].sort().join()==='2,5').length,1);
});

test('buckling legend reports the factor and the sign of the critical load',()=>{
  const reversed=bucklingSummary({factor:-59.496,critical_force_resultant_kN:[0,0,59.496]});
  assert.equal(reversed.label,'λ = -59,50');
  assert.equal(reversed.critical,'Pcr = 59,50 kN con las cargas de referencia invertidas');
  const direct=bucklingSummary({factor:71.144,critical_force_resultant_kN:[0,0,-71.144]});
  assert.equal(direct.critical,'Pcr = 71,14 kN');
  // Without a complete reference load only the factor is shown.
  assert.equal(bucklingSummary({factor:3}).critical,null);
});

test('nested rich schema carries plates, point loads and buckling',()=>{
  const nested={
    schema:'imis.sap2000.xr/1',
    geometry:{joints:{'1':{xyz_m:[0,0,0]},'2':{xyz_m:[1,0,0]},'3':{xyz_m:[1,1,0]}},frames:{},
      areas:{'7':{joints:['1','2','3'],section:'PL',thickness_m:.01}}},
    loads:{joint_forces:[{pattern:'P',joint:'3',xyz_m:[1,1,0],force_kN:[0,0,-1]}],
      frame_distributed:[]},
    results:{joint_displacements:{},buckling_modes:[{number:1,case:'B',factor:4,
      normalized_shape:{'3':[0,0,1]},frame_curve_normalized:{}}],
      buckling_reference:{B:{complete:true,force_resultant_kN:[0,0,-1]}}}
  };
  const r=normalizeResults(unpackRichSAP(nested));
  assert.deepEqual(r.areas[0].joints,['1','2','3']);
  assert.deepEqual(r.pointLoads[0].force_kN,[0,0,-1]);
  assert.equal(r.bucklingModes[0].factor,4);
  assert.deepEqual(r.bucklingModes[0].jointShape,{'3':[0,0,1]});
});

test('local distributed loads survive the nested schema as bands',()=>{
  const nested={
    schema:'imis.sap2000.xr/1',
    geometry:{joints:{'1':{xyz_m:[0,0,0]},'2':{xyz_m:[3,0,0]}},frames:{A:{joint_i:'1',joint_j:'2'}}},
    loads:{frame_distributed:[{frame:'A',pattern:'L',csys:'Local',dir:2,start:0,end:1,
      w1_kN_per_m:-5,w2_kN_per_m:-5}]},
    results:{}
  };
  const [load]=normalizeResults(unpackRichSAP(nested)).loads;
  assert.equal(load.csys,'Local');assert.equal(load.dir,2);assert.equal(load.w1,-5);
});
