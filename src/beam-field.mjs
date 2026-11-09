// Beam-centreline projection of SAP2000 displacement curves to IFC mesh vertices.
// Coordinate frame: SAP global XYZ (Z up). Interpolated values are for XR visualisation.
const lerp=(a,b,t)=>a+(b-a)*t;
function curveAt(curve,t){
  const safe=Array.isArray(curve)&&curve.length>0?curve:[[0,0,0]];
  const x=Math.max(0,Math.min(1,t))*(safe.length-1),i=Math.min(safe.length-2,Math.floor(x));
  if(safe.length===1)return safe[0].slice(0,3).map(Number);
  const alpha=x-i;
  return [0,1,2].map(k=>lerp(Number(safe[i][k]||0),Number(safe[i+1][k]||0),alpha));
}
export function makeBeamFieldSampler(results,{caseName='',mode=null,offset=[0,0,0]}={}){
  const nodes=new Map(results.nodes.map(n=>[String(n.id),[n.x+offset[0],n.y+offset[1],n.z+offset[2]]]));
  const displacements=new Map((results.cases.find(c=>c.name===caseName)?.displacements??[])
    .map(d=>[String(d.node),[d.ux,d.uy,d.uz]]));
  const jointShape=mode?.jointShape??{};
  const curves=mode?(mode.frameCurves??{}):(results.frameCurves?.[caseName]??{});
  const segments=[];
  for(const f of results.frames){
    const a=nodes.get(String(f.i)),b=nodes.get(String(f.j));if(!a||!b)continue;
    const v=b.map((x,i)=>x-a[i]),len2=v.reduce((s,x)=>s+x*x,0);
    if(len2<1e-16)continue;
    let curve=curves[f.id];
    if(!curve?.length){
      curve=[mode?(jointShape[f.i]??[0,0,0]):(displacements.get(String(f.i))??[0,0,0]),
             mode?(jointShape[f.j]??[0,0,0]):(displacements.get(String(f.j))??[0,0,0])];
    }
    segments.push({a,v,len2,curve});
  }
  if(!segments.length)return()=>[0,0,0,0];
  return (x,y,z)=>{
    let best=null,bestT=0,bestD=Infinity;
    for(const s of segments){
      const q=[x-s.a[0],y-s.a[1],z-s.a[2]];
      const t=Math.max(0,Math.min(1,(q[0]*s.v[0]+q[1]*s.v[1]+q[2]*s.v[2])/s.len2));
      const dx=q[0]-t*s.v[0],dy=q[1]-t*s.v[1],dz=q[2]-t*s.v[2];
      const distance=dx*dx+dy*dy+dz*dz;
      if(distance<bestD){best=s;bestT=t;bestD=distance;}
    }
    if(!best)return[0,0,0,0];
    const [ux,uy,uz]=curveAt(best.curve,bestT);
    return [ux,uy,uz,Math.hypot(ux,uy,uz)];
  };
}
