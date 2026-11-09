// SAP2000 and IFC should be compared in a single Z-up engineering coordinate system.
// This helper ONLY rotates/translates IFC geometry; SAP result vectors remain untouched.
const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
function permutationParity(a){let n=0;for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)if(a[i]>a[j])n++;return n%2?-1:1;}
export const ROTATIONS=[...function*(){
  for(const axes of permutations)for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]){
    const signs=[sx,sy,sz];
    if(permutationParity(axes)*sx*sy*sz!==1)continue;
    const key=axes.join('')+signs.map(x=>x===1?'+':'-').join('');
    const name=key;
    yield {key,name,axes,signs};
  }
}()];
export const ROTATION_KEYS={
  identity:'012+++',
  x90:'021+-+',
  x_90:'021++-',
  y90:'210++-',
  y_90:'210-++',
  z90:'102-++',
  z_90:'102+-+'
};
export function rotateVector(point,rotation){
  return rotation.axes.map((axis,k)=>Number(point[axis])*rotation.signs[k]);
}
export function findRotation(key){
  const concrete=ROTATION_KEYS[key]??key;
  return ROTATIONS.find(r=>r.key===concrete)??ROTATIONS.find(r=>r.key==='012+++');
}
const midpoint=(a,b)=>a.map((v,k)=>(v+b[k])/2);
function bounds(points){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const p of points)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
  if(!points.length)throw new Error('Faltan puntos para la alineación IFC/SAP.');
  return {min,max,center:midpoint(min,max),size:max.map((v,k)=>v-min[k])};
}
function nearestDistanceSquared(p,vertices){
  let best=Infinity;
  for(const q of vertices){
    const a=p[0]-q[0],b=p[1]-q[1],c=p[2]-q[2],d2=a*a+b*b+c*c;
    if(d2<best)best=d2;
  }
  return best;
}
export function frameSamples(results){
  const nodes=new Map(results.nodes.map(n=>[String(n.id),[n.x,n.y,n.z]]));
  const out=[];
  for(const f of results.frames){
    const a=nodes.get(String(f.i)),b=nodes.get(String(f.j));if(!a||!b)continue;
    for(const t of [.05,.25,.5,.75,.95])out.push(a.map((v,k)=>v+t*(b[k]-v)));
  }
  return out.length?out:[...nodes.values()];
}
export function sampleIFCVertices(items,maxPoints=1800){
  const out=[];
  // Sample every element so that small cross-braces are not hidden by one large slab.
  const quota=Math.max(8,Math.floor(maxPoints/Math.max(items.length,1)));
  for(const item of items){
    const pos=item.geometry?.getAttribute?.('position');
    if(!pos?.count)continue;
    const step=Math.max(1,Math.ceil(pos.count/quota));
    for(let i=0;i<pos.count;i+=step){
      out.push([pos.getX(i),pos.getY(i),pos.getZ(i)]);
    }
  }
  if(out.length>maxPoints){
    const step=Math.ceil(out.length/maxPoints);
    return out.filter((_,i)=>i%step===0);
  }
  return out;
}
export function evaluateAlignment(ifcVertices,results,rotation){
  const structural=frameSamples(results);
  const sapBounds=bounds(structural);
  const rotated=ifcVertices.map(p=>rotateVector(p,rotation));
  const ifcBounds=bounds(rotated);
  const translation=sapBounds.center.map((v,i)=>v-ifcBounds.center[i]);
  const samples=rotated.map(p=>p.map((v,i)=>v+translation[i]));
  const nearest=structural.map(p=>nearestDistanceSquared(p,samples));
  const meanD2=nearest.reduce((a,b)=>a+b,0)/Math.max(1,nearest.length);
  const diameter=Math.max(...sapBounds.size,.001);
  // Penalize orientations with a vertical/span mismatch, allowing member thickness.
  const sizes=ifcBounds.size.map((v,k)=>Math.max(v,1e-9));
  const spanPenalty=sapBounds.size.reduce((acc,v,k)=>{
    const diff=Math.abs(v-sizes[k]);
    return acc+Math.max(0,diff-.04*diameter)**2;
  },0);
  const score=meanD2+.12*spanPenalty;
  return {rotation,translation,score,rms_m:Math.sqrt(meanD2),
    boundsIFC:ifcBounds,boundsSAP:sapBounds};
}
export function findBestAlignment(items,results,option='auto'){
  const vertices=sampleIFCVertices(items);
  if(!vertices.length||!results?.nodes?.length)throw Error('Se requieren geometría IFC y nudos SAP.');
  const candidates=(option==='auto'?ROTATIONS:[findRotation(option)])
    .map(rotation=>evaluateAlignment(vertices,results,rotation))
    .sort((a,b)=>a.score-b.score);
  return {...candidates[0],confidence:option==='auto'&&candidates.length>1?
    (candidates[1].score-candidates[0].score)/Math.max(candidates[1].score,1e-12):null,
    automatic:option==='auto'};
}

export function makeIFCTransformElements(alignment){
  const R=Array.from({length:3},()=>[0,0,0]);
  for(let row=0;row<3;row++)R[row][alignment.rotation.axes[row]]=alignment.rotation.signs[row];
  const [x,y,z]=alignment.translation;
  return [R[0][0],R[0][1],R[0][2],x,
          R[1][0],R[1][1],R[1][2],y,
          R[2][0],R[2][1],R[2][2],z,
          0,0,0,1];
}
