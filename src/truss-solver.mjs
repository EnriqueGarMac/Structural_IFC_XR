// Interactive 2D pin-jointed truss, global X/Z (Z vertically upwards).
// Consistent units: kN, m, kN/m². Displacements in m.
// Axial member deformation only; no bending, self-weight or geometric nonlinearity.
const E_STEEL=210e6;
export const TRUSS_LESSON={
  name:'Celosía Warren · 12 m',
  description:'Celosía plana articulada de acero, apoyo fijo en A y móvil en E.',
  E_kN_m2:E_STEEL,A_m2:.006,
  nodes:[
    {id:'A',x:0,z:0,fixX:true,fixZ:true},
    {id:'B',x:3,z:0},
    {id:'C',x:6,z:0},
    {id:'D',x:9,z:0},
    {id:'E',x:12,z:0,fixZ:true},
    {id:'F',x:1.5,z:2.5},
    {id:'G',x:4.5,z:2.5},
    {id:'H',x:7.5,z:2.5},
    {id:'I',x:10.5,z:2.5}
  ],
  bars:[
    ...[['A','B'],['B','C'],['C','D'],['D','E']],
    ...[['F','G'],['G','H'],['H','I']],
    ...[['A','F'],['F','B'],['B','G'],['G','C'],
        ['C','H'],['H','D'],['D','I'],['I','E']]
  ].map(([i,j],index)=>({id:'B'+String(index+1).padStart(2,'0'),i,j,
    A_m2:.006,E_kN_m2:E_STEEL}))
};
export function defaultTrussLoads(){
  return [{nodeId:'G',fx_kN:0,fz_kN:-20},{nodeId:'H',fx_kN:0,fz_kN:-20}];
}
export function normaliseTrussLoads(model,loads=[]){
  const ids=new Set(model.nodes.map(n=>n.id)),total=new Map();
  for(const l of loads){
    const nodeId=l.nodeId??l.node;
    if(!ids.has(nodeId))throw Error('Nodo de carga desconocido: '+nodeId);
    const fx=Number(l.fx_kN??l.Fx??0),fz=Number(l.fz_kN??l.Fz??0);
    if(!Number.isFinite(fx)||!Number.isFinite(fz))throw Error('Carga no finita en '+nodeId);
    const prev=total.get(nodeId)??{nodeId,fx_kN:0,fz_kN:0};
    prev.fx_kN+=fx;prev.fz_kN+=fz;total.set(nodeId,prev);
  }
  return [...total.values()].filter(l=>Math.abs(l.fx_kN)+Math.abs(l.fz_kN)>1e-10);
}
function linearSolve(matrix,right){
  const n=right.length,a=matrix.map((row,i)=>[...row,right[i]]);
  const scale=Math.max(1,...a.flatMap(row=>row.slice(0,n).map(Math.abs)));
  for(let k=0;k<n;k++){
    let pivot=k;
    for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i;
    if(Math.abs(a[pivot][k])<=scale*1e-12)
      throw Error('Celosía inestable: matriz de rigidez singular. Comprueba barras y apoyos.');
    if(pivot!==k)[a[pivot],a[k]]=[a[k],a[pivot]];
    for(let i=k+1;i<n;i++){
      const f=a[i][k]/a[k][k];
      if(f===0)continue;
      a[i][k]=0;
      for(let j=k+1;j<=n;j++)a[i][j]-=f*a[k][j];
    }
  }
  const out=new Array(n).fill(0);
  for(let i=n-1;i>=0;i--){
    let sum=a[i][n];
    for(let j=i+1;j<n;j++)sum-=a[i][j]*out[j];
    out[i]=sum/a[i][i];
  }
  return out;
}
export function solveTruss2D(model,loads=[]){
  if(!model?.nodes?.length||!model?.bars?.length)throw Error('Modelo de celosía vacío.');
  const nodes=model.nodes,nodeIndex=new Map(nodes.map((n,i)=>[n.id,i]));
  if(nodeIndex.size!==nodes.length)throw Error('Los identificadores de nodo deben ser únicos.');
  const N=nodes.length*2,K=Array.from({length:N},()=>new Array(N).fill(0));
  const F=new Array(N).fill(0),barGeom=[];
  const applied=normaliseTrussLoads(model,loads);
  for(const load of applied){
    const index=nodeIndex.get(load.nodeId)*2;
    F[index]+=load.fx_kN;F[index+1]+=load.fz_kN;
  }
  for(const bar of model.bars){
    const ai=nodeIndex.get(bar.i),bi=nodeIndex.get(bar.j);
    if(ai===undefined||bi===undefined||ai===bi)throw Error('Barra con nudos inválidos: '+bar.id);
    const a=nodes[ai],b=nodes[bi],dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz);
    const A=Number(bar.A_m2??model.A_m2),E=Number(bar.E_kN_m2??model.E_kN_m2);
    if(!Number.isFinite(L)||L<1e-9||!Number.isFinite(A)||A<=0||!Number.isFinite(E)||E<=0)
      throw Error('Geometría o propiedades inválidas en barra '+bar.id);
    const c=dx/L,s=dz/L,k=E*A/L,dofs=[2*ai,2*ai+1,2*bi,2*bi+1];
    const t=[-c,-s,c,s];
    for(let m=0;m<4;m++)for(let n=0;n<4;n++)K[dofs[m]][dofs[n]]+=k*t[m]*t[n];
    barGeom.push({bar,L,c,s,k,A,E,ai,bi});
  }
  const fixed=[];
  for(let i=0;i<nodes.length;i++){
    if(nodes[i].fixX)fixed.push(i*2);
    if(nodes[i].fixZ)fixed.push(i*2+1);
  }
  const fixedSet=new Set(fixed);
  const free=Array.from({length:N},(_,i)=>i).filter(i=>!fixedSet.has(i));
  if(!free.length)throw Error('No existen grados de libertad para calcular.');
  const smallK=free.map(i=>free.map(j=>K[i][j]));
  const smallF=free.map(i=>F[i]);
  const smallU=linearSolve(smallK,smallF);
  const U=new Array(N).fill(0);
  free.forEach((dof,i)=>U[dof]=smallU[i]);
  const KTimesU=K.map(row=>row.reduce((sum,v,i)=>sum+v*U[i],0));
  const R=KTimesU.map((v,i)=>v-F[i]);
  const displacements=nodes.map((n,i)=>({
    nodeId:n.id,ux_m:U[2*i],uz_m:U[2*i+1],
    magnitude_m:Math.hypot(U[2*i],U[2*i+1])
  }));
  const bars=barGeom.map(({bar,L,c,s,k,A,E,ai,bi})=>{
    const extension_m=(U[bi*2]-U[ai*2])*c+(U[bi*2+1]-U[ai*2+1])*s;
    const axial_kN=k*extension_m;
    return {id:bar.id,i:bar.i,j:bar.j,length_m:L,
      axial_kN,stress_MPa:axial_kN/A/1000,
      strain:extension_m/L,extension_mm:extension_m*1000,
      state:axial_kN>1e-8?'tracción':axial_kN< -1e-8?'compresión':'nulo'};
  });
  const reactions=nodes.filter(n=>n.fixX||n.fixZ).map(n=>{
    const i=nodeIndex.get(n.id);
    return {nodeId:n.id,rx_kN:n.fixX?R[2*i]:0,rz_kN:n.fixZ?R[2*i+1]:0};
  });
  const sumF={x:applied.reduce((v,l)=>v+l.fx_kN,0),
    z:applied.reduce((v,l)=>v+l.fz_kN,0)};
  const sumR={x:reactions.reduce((v,l)=>v+l.rx_kN,0),
    z:reactions.reduce((v,l)=>v+l.rz_kN,0)};
  const mzLoad=applied.reduce((v,l)=>{
    const n=nodes[nodeIndex.get(l.nodeId)];return v+n.x*l.fz_kN-n.z*l.fx_kN;
  },0);
  const mzReact=reactions.reduce((v,l)=>{
    const n=nodes[nodeIndex.get(l.nodeId)];return v+n.x*l.rz_kN-n.z*l.rx_kN;
  },0);
  return {nodes,loads:applied,displacements,bars,reactions,
    maxDisplacement_m:Math.max(...displacements.map(d=>d.magnitude_m)),
    maxAbsAxial_kN:Math.max(...bars.map(b=>Math.abs(b.axial_kN))),
    equilibrium:{fx_kN:sumF.x+sumR.x,fz_kN:sumF.z+sumR.z,
      moment_kNm:mzLoad+mzReact},
    meta:{method:'Método matricial de rigidez: celosía plana biarticulada',
      linear:true,units:'kN, m, MPa',assumptions:'Barras articuladas y solo esfuerzo axial; cargas nodales estáticas'}
  };
}
