// Linear-elastic 2D Euler–Bernoulli matrix-frame solver (XZ plane).
// Global units: metres, kN, kN/m; E in kN/m². Local x is along the bar,
// local 2=(-sin,0,cos), local 3=(0,-1,0). Rotational degree of freedom is
// positive CCW in XZ (physical moment vector points in -global Y).
// Each call models ONE independently braced plane, with rigid beam/column
// connections and fixed/pinned supports. It does not solve 3D torsion,
// slab-shell action, connection flexibility, buckling or dynamics.
const zeros=(m,n)=>Array.from({length:m},()=>new Float64Array(n));
const multiply=(a,b)=>a.map(row=>b[0].map((_,j)=>row.reduce((sum,v,k)=>sum+v*b[k][j],0)));
const transpose=a=>a[0].map((_,j)=>a.map(row=>row[j]));
function matVec(a,x){return a.map(row=>row.reduce((s,v,j)=>s+v*x[j],0));}
function solveLinear(A,b){
  const n=b.length,a=A.map(row=>Float64Array.from(row)),f=Float64Array.from(b);
  for(let k=0;k<n;k++){
    let pivot=k;
    for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i;
    if(Math.abs(a[pivot][k])<1e-9 || !Number.isFinite(a[pivot][k]))
      throw Error('Matriz de rigidez singular: revisa apoyos y conectividad en DOF '+k);
    if(pivot!==k){[a[k],a[pivot]]=[a[pivot],a[k]];[f[k],f[pivot]]=[f[pivot],f[k]];}
    for(let i=k+1;i<n;i++){
      const factor=a[i][k]/a[k][k];
      if(Math.abs(factor)<1e-22)continue;
      a[i][k]=0;
      for(let j=k+1;j<n;j++)a[i][j]-=factor*a[k][j];
      f[i]-=factor*f[k];
    }
  }
  const x=new Float64Array(n);
  for(let i=n-1;i>=0;i--){
    let val=f[i];
    for(let j=i+1;j<n;j++)val-=a[i][j]*x[j];
    x[i]=val/a[i][i];
  }
  if(x.some(v=>!Number.isFinite(v)))throw Error('El cálculo matricial produjo desplazamientos no finitos.');
  return x;
}
function localStiffness(E,A,I,L){
  const k=zeros(6,6),a=E*A/L,b=12*E*I/L**3,
    c=6*E*I/L**2,d=4*E*I/L,e=2*E*I/L;
  for(const [i,j,val] of [
    [0,0,a],[0,3,-a],[3,0,-a],[3,3,a],
    [1,1,b],[1,2,c],[1,4,-b],[1,5,c],
    [2,1,c],[2,2,d],[2,4,-c],[2,5,e],
    [4,1,-b],[4,2,-c],[4,4,b],[4,5,-c],
    [5,1,c],[5,2,e],[5,4,-c],[5,5,d]
  ])k[i][j]=val;
  return k;
}
function transformation(c,s){
  return [
    [c,s,0,0,0,0],[-s,c,0,0,0,0],[0,0,1,0,0,0],
    [0,0,0,c,s,0],[0,0,0,-s,c,0],[0,0,0,0,0,1]
  ];
}
const vectorAdd=(a,b)=>a.map((v,k)=>v+b[k]);
export function solveFramePlane({nodes,frames,cases}){
  if(!nodes?.length||!frames?.length||!cases?.length)
    throw Error('El cálculo requiere nudos, barras y casos.');
  const ids=new Map(nodes.map((n,i)=>[String(n.id),i]));
  if(ids.size!==nodes.length)throw Error('Nudos duplicados en el modelo matricial.');
  const dof=nodes.length*3,K=zeros(dof,dof),fixed=new Set();
  nodes.forEach((n,i)=>{
    const r=n.fixed2D??[];
    for(let j=0;j<3;j++)if(r[j])fixed.add(3*i+j);
  });
  const state=frames.map(f=>{
    const ia=ids.get(String(f.i)),ib=ids.get(String(f.j));
    if(ia===undefined||ib===undefined)throw Error('Barra '+f.id+' con nudo inexistente.');
    const start=nodes[ia],end=nodes[ib],dx=end.x-start.x,dz=end.z-start.z,L=Math.hypot(dx,dz);
    if(L<1e-9)throw Error('Barra '+f.id+' de longitud nula en XZ.');
    const E=Number(f.E_kN_m2),A=Number(f.A_m2),I=Number(f.I_m4);
    if(![E,A,I].every(v=>Number.isFinite(v)&&v>0))
      throw Error('Propiedades E,A,I no válidas en '+f.id);
    if(Math.abs(end.y-start.y)>1e-5)throw Error('La barra '+f.id+' no pertenece a un plano XZ.');
    const c=dx/L,s=dz/L,T=transformation(c,s),k=localStiffness(E,A,I,L);
    const kg=multiply(transpose(T),multiply(k,T));
    const idx=[3*ia,3*ia+1,3*ia+2,3*ib,3*ib+1,3*ib+2];
    for(let r=0;r<6;r++)for(let col=0;col<6;col++)K[idx[r]][idx[col]]+=kg[r][col];
    return {f,L,c,s,T,k,idx,ia,ib};
  });
  const free=Array.from({length:dof},(_,i)=>i).filter(i=>!fixed.has(i));
  if(!fixed.size)throw Error('No se han definido condiciones de borde.');
  const Kff=free.map(i=>free.map(j=>K[i][j]));
  const results={nodes:nodes.map(n=>({
      id:String(n.id),x:n.x,y:n.y,z:n.z,
      restrained_dof:n.restrained_dof??[
        !!n.fixed2D?.[0],true,!!n.fixed2D?.[1],
        true,!!n.fixed2D?.[2],true]
    })),
    frames:state.map(({f,L,c,s})=>({
      id:String(f.id),i:String(f.i),j:String(f.j),
      section:f.section,material:f.material,length_m:L,
      local_axes:{basis_global:[[c,0,s],[-s,0,c],[0,-1,0]]}
    })),
    loads:[],cases:[],forces:{},jointReactions:{},frameCurves:{},
    sections:{}
  };
  for(const {f} of state){
    if(f.section)results.sections[f.section]={
      A_m2:f.A_m2,I_m4:f.I_m4,E_kN_m2:f.E_kN_m2};
  }
  for(const spec of cases){
    const loadVector=new Float64Array(dof),loadByFrame=new Map();
    for(const st of state){
      const {f,L,c,s,T,idx}=st;
      const q=(f.loads?.[spec.name]??[0,0]).slice();
      if(spec.selfWeight)q[1]-=Number(f.density_kN_m3??0)*f.A_m2;
      if(q.some(v=>!Number.isFinite(v)))throw Error('Carga distribuida inválida en '+f.id);
      const qx=c*q[0]+s*q[1],qv=-s*q[0]+c*q[1];
      const fl=[qx*L/2,qv*L/2,qv*L*L/12,qx*L/2,qv*L/2,-qv*L*L/12];
      loadByFrame.set(f.id,{qx,qv,fl,q});
      const eq=matVec(transpose(T),fl);
      for(let a=0;a<6;a++)loadVector[idx[a]]+=eq[a];
      for(let k=0;k<2;k++)if(Math.abs(q[k])>1e-12)results.loads.push({
        frame:String(f.id),pattern:spec.name,type:'force_per_length',
        csys:'Global',dir:k===0?4:6,start:0,end:1,w1:q[k],w2:q[k]
      });
    }
    for(const [nodeId,loads] of Object.entries(spec.nodalLoads??{})){
      const n=ids.get(nodeId);
      if(n===undefined)throw Error('Carga nodal en '+nodeId+': nudo desconocido.');
      const values=[loads.Fx??0,loads.Fz??0,loads.MyCCW??0];
      for(let j=0;j<3;j++)loadVector[3*n+j]+=values[j];
    }
    const ur=solveLinear(Kff,free.map(i=>loadVector[i]));
    const u=new Float64Array(dof);
    for(let j=0;j<free.length;j++)u[free[j]]=ur[j];
    const displacements=nodes.map((n,i)=>({
      node:String(n.id),ux:u[3*i],uy:0,uz:u[3*i+1],
      rotationY_rad:-u[3*i+2]
    }));
    results.cases.push({name:spec.name,displacements});
    const total=matVec(K,u).map((v,i)=>v-loadVector[i]);
    const reactions={};
    nodes.forEach((n,i)=>{
      if(![0,1,2].some(j=>fixed.has(3*i+j)))return;
      const components=[0,1,2].map(j=>fixed.has(3*i+j)?total[3*i+j]:0);
      reactions[String(n.id)]={
        force_kN:[components[0],0,components[1]],
        moment_kNm:[0,-components[2],0]
      };
    });
    results.jointReactions[spec.name]=reactions;
    const stationData={},curves={};
    for(const st of state){
      const {f,L,c,s,T,k,idx}=st;
      const {qx,qv,fl}=loadByFrame.get(f.id);
      const ul=matVec(T,idx.map(j=>u[j]));
      const end=vectorAdd(matVec(k,ul),fl.map(x=>-x));
      const samples=[],shape=[];
      const EA=f.E_kN_m2*f.A_m2,EI=f.E_kN_m2*f.I_m4;
      for(let t=0;t<=10;t++){
        const x=L*t/10,r=x/L;
        // Interpolatory beam end-DOFs + exact uniformly-loaded particular
        // solution for clamped ends. This is a linear Euler-Bernoulli result.
        const ax=ul[0]*(1-r)+ul[3]*r+qx*x*(L-x)/(2*EA);
        const n1=1-3*r*r+2*r*r*r,n2=L*(r-2*r*r+r*r*r);
        const n3=3*r*r-2*r*r*r,n4=L*(-r*r+r*r*r);
        const transverse=n1*ul[1]+n2*ul[2]+n3*ul[4]+n4*ul[5]
          +qv*x*x*(L-x)*(L-x)/(24*EI);
        shape.push([c*ax-s*transverse,0,s*ax+c*transverse]);
        samples.push({
          station_m:x,
          P_kN:-end[0]-qx*x,
          V2_kN:-end[1]-qv*x,V3_kN:0,T_kNm:0,M2_kNm:0,
          M3_kNm:-end[2]+end[1]*x+qv*x*x/2
        });
      }
      stationData[String(f.id)]=samples;
      curves[String(f.id)]=shape;
    }
    results.forces[spec.name]=stationData;
    results.frameCurves[spec.name]=curves;
    // Absolute maximum *free* force residual, excluding support reactions:
    let maxFreeResidual=0;
    for(const id of free)maxFreeResidual=Math.max(maxFreeResidual,Math.abs(total[id]));
    if(maxFreeResidual>1e-4)throw Error(
      'Residuo de equilibrio superior a 10^-4 kN: '+maxFreeResidual.toExponential(2));
  }
  return results;
}
