// Extract a candidate 2D pin-jointed analytical truss from IFC prismatic
// member geometry. Only accept member-like elements and a common X/Z plane.
// This is a geometry-based educational reconstruction; explicit support,
// load, E and A assignments are always necessary.
const MEMBER=/^IFC(MEMBER|BEAM|COLUMN|STRUCTURALCURVEMEMBER|BRACE|PLATE)$/i;
function principalAxis(points){
  const n=points.length;
  const center=[0,0,0];
  for(const p of points)for(let j=0;j<3;j++)center[j]+=p[j]/n;
  const cov=Array.from({length:3},()=>[0,0,0]);
  for(const p of points){
    const d=p.map((v,j)=>v-center[j]);
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)cov[i][j]+=d[i]*d[j]/n;
  }
  let axis=[1,0,1].map(v=>v/Math.sqrt(2));
  for(let i=0;i<40;i++){
    const next=cov.map(row=>row.reduce((s,v,j)=>s+v*axis[j],0));
    const norm=Math.hypot(...next);
    if(norm<1e-12)return null;
    axis=next.map(v=>v/norm);
  }
  return {axis,center};
}
function segmentFromGeometry(geometry){
  const attribute=geometry?.getAttribute?.('position');
  if(!attribute||attribute.count<6)return null;
  const points=[];
  const step=Math.max(1,Math.floor(attribute.count/5000));
  for(let i=0;i<attribute.count;i+=step)
    points.push([attribute.getX(i),attribute.getY(i),attribute.getZ(i)]);
  const principal=principalAxis(points);
  if(!principal)return null;
  const {center,axis}=principal;
  const projections=points.map(p=>p.reduce((s,v,j)=>s+(v-center[j])*axis[j],0));
  const low=Math.min(...projections),high=Math.max(...projections),length=high-low;
  if(length<.15||length>100)return null;
  const tol=Math.min(length*.05,.035);
  const mean=side=>{
    const sum=[0,0,0];let count=0;
    for(let i=0;i<points.length;i++){
      if(side==='low'?projections[i]>low+tol:projections[i]<high-tol)continue;
      for(let j=0;j<3;j++)sum[j]+=points[i][j];
      count++;
    }
    if(!count)return center.map((v,j)=>v+(side==='low'?low:high)*axis[j]);
    return sum.map(v=>v/count);
  };
  const a=mean('low'),b=mean('high');
  const distance=Math.hypot(...a.map((v,i)=>v-b[i]));
  if(distance<.15)return null;
  const thickness=Math.max(...points.map(p=>{
    const delta=p.map((v,i)=>v-center[i]);
    const along=delta.reduce((s,v,i)=>s+v*axis[i],0);
    return Math.hypot(...delta.map((v,i)=>v-along*axis[i]));
  }));
  // Reject walls, slabs and bulky solids rather than treating them as rods.
  if(thickness>distance*.22)return null;
  return {a,b,length:distance};
}
export function planarTrussFromIFC(items,{E_kN_m2=210e6,A_m2=.006,snap_m=.08}={}){
  if(!Number.isFinite(E_kN_m2)||E_kN_m2<=0||
     !Number.isFinite(A_m2)||A_m2<=0)throw Error('Introduce E y A válidos.');
  const segments=[];
  for(const item of items){
    if(!MEMBER.test(item.ifcType??''))continue;
    const line=segmentFromGeometry(item.geometry);
    if(line)segments.push({...line,name:item.name});
  }
  if(!segments.length)throw Error('No hay barras prismáticas reconocibles en el IFC.');
  const midY=segments.map(s=>(s.a[1]+s.b[1])*.5).sort((a,b)=>a-b);
  const planeY=midY[Math.floor(midY.length/2)];
  if(segments.some(s=>Math.abs(s.a[1]-planeY)>.08||
      Math.abs(s.b[1]-planeY)>.08))
    throw Error('El IFC no define una única estructura plana XZ. Exporta solo la celosía y revisa sus ejes.');
  const nodes=[],bars=[];
  const merge=p=>{
    const close=nodes.find(n=>Math.hypot(n.x-p[0],n.z-p[2])<=snap_m);
    if(close)return close.id;
    const id='N'+(nodes.length+1);
    nodes.push({id,x:p[0],z:p[2],fixX:false,fixZ:false});
    return id;
  };
  for(const s of segments){
    const i=merge(s.a),j=merge(s.b);
    if(i===j)continue;
    if(bars.some(b=>[b.i,b.j].sort().join('|')===[i,j].sort().join('|')))continue;
    bars.push({id:'B'+(bars.length+1),i,j,E_kN_m2,A_m2});
  }
  if(nodes.length<3||bars.length<2)throw Error('Conectividad analítica insuficiente.');
  // No invented IFC boundary conditions or material properties.
  // The user must explicitly assign both supports before analysis.
  return {name:'IFC · celosía importada',nodes,bars,E_kN_m2,A_m2,
    metadata:{source:'IFC prismatic member geometry',planeY,
      warning:'E y A se asignan en la experiencia docente; los apoyos deben seleccionarse manualmente.'}};
}
