import {unpackRichSAP} from './sap-rich.mjs';
import {normalizeJointReactions} from './reactions.mjs';
// Data contract deliberately independent from IFC/Three.js for testing.
// All SAP2000 coordinates and displacements are in metres, forces in kN.
const finite = (v, defaultValue=0) => v === undefined || v === null || v === '' ? defaultValue : Number(v);
const valid = (x) => Number.isFinite(x);
export function normalizeResults(input) {
  input=unpackRichSAP(input);
  if (!input || typeof input !== 'object') throw new Error('El archivo JSON no contiene un objeto válido.');
  const nodes = (input.nodes || []).map((n, i) => ({
    id: String(n.id ?? n.name ?? i), x: finite(n.x), y: finite(n.y), z: finite(n.z),
    restrained_dof:Array.isArray(n.restrained_dof)?n.restrained_dof.map(Boolean):[]
  }));
  if (nodes.some(n => ![n.x,n.y,n.z].every(valid))) throw new Error('Hay coordenadas SAP no numéricas.');
  const seen = new Set();
  for (const n of nodes) { if (seen.has(n.id)) throw new Error('Identificador de nudo duplicado: '+n.id); seen.add(n.id); }
  const frames = (input.frames || []).map(f=>({
    id: String(f.id ?? f.name), i: String(f.i), j: String(f.j),
    section: f.section??null,material:f.material??null,
    local_axes:f.local_axes??null,length_m:f.length_m??null
  })).filter(f=> f.i !== 'undefined' && f.j !== 'undefined');
  const loads = (input.loads || []).map(l=>({
    frame: String(l.frame), pattern: String(l.pattern ?? 'SIN_PATRON'),
    type: String(l.type ?? 'force_per_length'),
    csys: String(l.csys ?? l.coordinateSystem ?? 'Global'),
    dir: Number(l.dir ?? 6),
    start: Math.max(0, Math.min(1, finite(l.start,0))),
    end: Math.max(0, Math.min(1, finite(l.end,1))),
    w1: finite(l.w1), w2: finite(l.w2)
  }));
  if (loads.some(l=> ![l.start,l.end,l.w1,l.w2,l.dir].every(valid) || l.end<l.start)) throw new Error('Datos de cargas inválidos.');
  const cases = (input.cases || []).map((c,i)=>({
    name: String(c.name ?? `Caso ${i+1}`),
    stepType: c.stepType || null, stepNum: c.stepNum ?? null,
    displacements: (c.displacements || []).map(d=>({
      node: String(d.node ?? d.id), ux: finite(d.ux), uy:finite(d.uy), uz:finite(d.uz)
    }))
  }));
  for (const c of cases) if (c.displacements.some(d=>![d.ux,d.uy,d.uz].every(valid))) throw new Error('Desplazamientos no numéricos en '+c.name);
  // Shell/plate elements: 3 or more joints, drawn as flat surfaces.
  const nodeIds=new Set(nodes.map(n=>n.id));
  const areas=(input.areas||[]).map((a,i)=>({
    id:String(a.id ?? i), joints:(a.joints||[]).map(String),
    section:a.section??null, material:a.material??null,
    thickness_m:a.thickness_m==null?null:Number(a.thickness_m)
  }));
  for (const a of areas) if (a.joints.length<3 || a.joints.some(j=>!nodeIds.has(j)))
    throw new Error('Placa '+a.id+': nudos inexistentes o insuficientes.');
  const pointLoads=(input.pointLoads||[]).map(p=>({
    pattern:String(p.pattern ?? 'SIN_PATRON'), joint:p.joint==null?null:String(p.joint),
    frame:p.frame==null?null:String(p.frame),
    xyz_m:(p.xyz_m||[]).map(Number), force_kN:(p.force_kN||[0,0,0]).map(Number)
  }));
  if (pointLoads.some(p=>p.xyz_m.length!==3 || p.force_kN.length!==3 || ![...p.xyz_m,...p.force_kN].every(valid)))
    throw new Error('Datos de cargas puntuales inválidos.');
  // Linear buckling: factor lambda multiplies the reference loads of the case.
  const bucklingModes=(input.bucklingModes||[]).map(m=>({...m, factor:Number(m.factor),
    jointShape:m.jointShape??{}, frameCurves:m.frameCurves??{}}));
  if (bucklingModes.some(m=>!valid(m.factor))) throw new Error('Factor de pandeo no numérico.');
  if(!nodes.length && !frames.length && !areas.length && !cases.length && !loads.length)
    throw new Error('Este JSON no contiene nodos, barras ni resultados compatibles de SAP2000.');
  // An empty curve set is not a beam deflection: dropping it lets the
  // viewer fall back to the nodal displacements (shell-only models).
  const frameCurves=Object.fromEntries(Object.entries(input.frameCurves??{})
    .filter(([,curves])=>curves && Object.keys(curves).length));
  return {meta:{...input.meta, units:'m, kN'}, nodes, frames, areas, loads, pointLoads, cases,
    forces:input.forces??{},modes:input.modes??[],bucklingModes,
    bucklingReference:input.bucklingReference??{},sections:input.sections??{},
    areaSections:input.areaSections??{},frameCurves,
    jointReactions:normalizeJointReactions(input.jointReactions??{},nodes)};
}
// Nodal field of a modal or buckling shape, in the same form as caseNodes.
export function modeNodes(results, mode, offset=[0,0,0]) {
  const shape=mode?.jointShape??{};
  return results.nodes.map(n=>{
    const [ux,uy,uz]=(shape[n.id]??[0,0,0]).map(Number);
    return {...n, x:n.x+offset[0], y:n.y+offset[1], z:n.z+offset[2], ux,uy,uz,
      magnitude:Math.hypot(ux,uy,uz)};
  });
}
// Unique joint pairs along the perimeter of the shell elements.
export function areaEdges(areas) {
  const seen=new Set(), edges=[];
  for (const a of areas||[]) a.joints.forEach((j,k)=>{
    const next=a.joints[(k+1)%a.joints.length];
    const key=j<next?j+'|'+next:next+'|'+j;
    if(!seen.has(key)){seen.add(key);edges.push([j,next]);}
  });
  return edges;
}
// Legend text for a buckling mode. A negative factor means that buckling
// occurs with the reference loads reversed; the direction is reported apart
// so that the short legend fields stay legible.
export function bucklingSummary(mode) {
  if (!mode) return null;
  const factor=Number(mode.factor);
  const fmt=v=>v.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
  const p=mode.critical_force_resultant_kN;
  const magnitude=Array.isArray(p)&&p.length===3?Math.hypot(...p.map(Number)):null;
  return {factor, label:'λ = '+fmt(factor),
    critical:magnitude===null?null:'Pcr = '+fmt(magnitude)+' kN',
    direction:factor<0?'sentido inverso':'mismo sentido'};
}
export function caseNodes(results, selectedCase, offset=[0,0,0]) {
  const c = results.cases.find(v=>v.name===selectedCase) || results.cases[0];
  const ds = new Map((c?.displacements || []).map(d=>[d.node,d]));
  return results.nodes.map(n=> {
    const d=ds.get(n.id) || {ux:0,uy:0,uz:0};
    return {...n, x:n.x+offset[0], y:n.y+offset[1], z:n.z+offset[2], ux:d.ux,uy:d.uy,uz:d.uz,
      magnitude: Math.hypot(d.ux,d.uy,d.uz) };
  });
}
export function interpolateDisplacement(x,y,z,nodes) {
  if (!nodes?.length) return [0,0,0,0];
  // Visual field only. This is NOT finite-element interpolation of shell/beam shape functions.
  const closest=[];
  for (const n of nodes) {
    const d2=(n.x-x)**2+(n.y-y)**2+(n.z-z)**2;
    if (d2<1e-12) return [n.ux,n.uy,n.uz,n.magnitude];
    if (closest.length<4 || d2<closest[closest.length-1].d2) {
      closest.push({n,d2}); closest.sort((a,b)=>a.d2-b.d2);
      if(closest.length>4) closest.pop();
    }
  }
  let wSum=0,ux=0,uy=0,uz=0,mag=0;
  for (const {n,d2} of closest){ const w=1/(d2+1e-5);wSum+=w;ux+=w*n.ux;uy+=w*n.uy;uz+=w*n.uz;mag+=w*n.magnitude; }
  return [ux/wSum,uy/wSum,uz/wSum,mag/wSum];
}
// Analytic stick-model deformation: positions used for rendering only.
// Original nodal coordinates and computed displacements remain unchanged.
export function analyticalNodePositions(nodes,amplification=0,applyDeformation=false){
  if(!applyDeformation)return nodes;
  const amp=Number.isFinite(amplification)?amplification:0;
  return nodes.map(n=>({
    ...n,x:n.x+amp*(n.ux||0),y:n.y+amp*(n.uy||0),z:n.z+amp*(n.uz||0)
  }));
}
export function maxDisplacement(nodes) { return nodes.reduce((v,n)=>Math.max(v,n.magnitude),0); }
export function loadMagnitude(l) { return Math.max(Math.abs(l.w1),Math.abs(l.w2)); }
export function selectedLoads(results, pattern) { return results.loads.filter(l=>pattern==='all' || l.pattern===pattern); }

// Reusable spatial sampler: build once for each case; avoids O(vertices × joints)
// on models with thousands of analysis nodes.
export function makeDisplacementSampler(nodes) {
  if (!nodes.length) return () => [0,0,0,0];
  if (nodes.length < 28) return (x,y,z) => interpolateDisplacement(x,y,z,nodes);
  const axisNames=['x','y','z'];
  function build(rows,depth=0){
    if(!rows.length)return null;
    const axis=depth%3;rows.sort((a,b)=>a[axisNames[axis]]-b[axisNames[axis]]);
    const m=rows.length>>>1;
    return {point:rows[m],axis,left:build(rows.slice(0,m),depth+1),right:build(rows.slice(m+1),depth+1)};
  }
  const root=build([...nodes]);
  return (x,y,z)=>{
    const coords=[x,y,z],best=[];
    function visit(node){
      if(!node)return;
      const p=node.point;
      const d2=(x-p.x)**2+(y-p.y)**2+(z-p.z)**2;
      if(d2<1e-12){best.length=0;best.push({n:p,d2:0});return;}
      if(best.length<4 || d2<best[best.length-1].d2){
        best.push({n:p,d2});best.sort((a,b)=>a.d2-b.d2);if(best.length>4)best.pop();
      }
      const delta=coords[node.axis]-p[axisNames[node.axis]];
      const first=delta<0?node.left:node.right,other=delta<0?node.right:node.left;
      visit(first);
      if(best.length===1&&best[0].d2===0)return;
      if(best.length<4||delta*delta<best[best.length-1].d2)visit(other);
    }
    visit(root);
    if(best[0].d2===0){const n=best[0].n;return [n.ux,n.uy,n.uz,n.magnitude];}
    let wSum=0,ux=0,uy=0,uz=0,mag=0;
    for(const {n,d2} of best){const w=1/(d2+1e-5);wSum+=w;ux+=w*n.ux;uy+=w*n.uy;uz+=w*n.uz;mag+=w*n.magnitude;}
    return [ux/wSum,uy/wSum,uz/wSum,mag/wSum];
  };
}
