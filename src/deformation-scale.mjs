// Safe, model-adaptive VISUAL magnification for the calculated static
// deflections. Actual FEM values and force diagrams never change.
// The span comes from the STRUCTURAL nodes, not landscape/site terrain.
const nonzero=(v)=>Number.isFinite(v)&&v>=0?v:0;
export function structuralSpan(results){
  const nodes=results?.nodes??[];
  if(!nodes.length)return 1;
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const n of nodes){
    const p=[n.x,n.y,n.z];
    for(let k=0;k<3;k++){
      if(!Number.isFinite(p[k]))continue;
      min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);
    }
  }
  const spans=max.map((v,k)=>v-min[k]).filter(Number.isFinite);
  return Math.max(.25,...spans);
}
export function maxCaseDeflection(results,caseName){
  const item=results?.cases?.find(c=>c.name===caseName);
  let max=0;
  for(const d of item?.displacements??[]){
    max=Math.max(max,Math.hypot(nonzero(Math.abs(d.ux)),nonzero(Math.abs(d.uy)),
      nonzero(Math.abs(d.uz))));
  }
  // End-node values can miss beam sagging at intermediate stations. Including
  // the FEM curves prevents a high multiplier from exaggerating local bending.
  for(const points of Object.values(results?.frameCurves?.[caseName]??{}))
    for(const p of Array.isArray(points)?points:[]){
      const v=Array.isArray(p)?p:[p.ux,p.uy,p.uz];
      if(v?.length>=3)max=Math.max(max,Math.hypot(
        nonzero(Math.abs(v[0])),nonzero(Math.abs(v[1])),nonzero(Math.abs(v[2]))));
    }
  return max;
}
export function deformationScale(results,caseName,{
  targetFraction=.013, maximumFraction=.12, absoluteMaximum=25000
}={}){
  const span=structuralSpan(results);
  const displacement=maxCaseDeflection(results,caseName);
  if(displacement<=1e-12)return {span,displacement,defaultAmp:1,maxAmp:1,step:.01};
  const maxAmp=Math.min(absoluteMaximum,
    Math.max(.05,Math.floor((span*maximumFraction/displacement)*100)/100));
  const defaultAmp=Math.min(maxAmp,
    Math.max(.01,Math.round(span*targetFraction/displacement*100)/100));
  const step=maxAmp>=20?1:maxAmp>=2?.1:.01;
  return {span,displacement,defaultAmp:Math.round(defaultAmp/step)*step,
    maxAmp,step};
}
export function clampAmplification(value,limit){
  const cap=Math.max(.05,Number(limit)||1);
  const num=Number(value);
  return Math.min(cap,Math.max(0,Number.isFinite(num)?num:0));
}
export function formatAmplification(value){
  const x=Number(value);
  if(!Number.isFinite(x))return '×0';
  return '×'+(x>=10?Math.round(x).toLocaleString('es-ES'):
    x.toLocaleString('es-ES',{maximumFractionDigits:2}));
}
