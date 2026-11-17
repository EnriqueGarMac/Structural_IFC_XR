// Lightweight position-based collapse animation for the educational 2D bridge.
// This is a constrained particle visualization, NOT an impact/fracture FEM.
// Pinned and roller supports stay fixed; unbroken bars constrain node distances;
// detached nodes are accelerated by gravity and collide with the floor.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createBridgeCollapseDynamics(nodes,members,brokenIds=[],floorZ=-.75){
  // Grid points without members are design guides, not structural particles.
  // Keep both ends of every originally assigned member even if it is broken,
  // so genuine detached fragments can fall after a failure.
  const assigned=new Set(members.flatMap(m=>[m.i,m.j]));
  const positions=new Map(nodes.filter(n=>assigned.has(n.id)).map(n=>[n.id,{
    x:n.x,z:n.z,oldX:n.x,oldZ:n.z,
    fixX:Boolean(n.fixX),fixZ:Boolean(n.fixZ)
  }]));
  const broken=new Set(brokenIds);
  const edges=members.filter(m=>!broken.has(m.id)).map(m=>{
    const a=positions.get(m.i),b=positions.get(m.j);
    return {id:m.id,i:m.i,j:m.j,tie:Boolean(m.tie),
      rest:Math.hypot(b.x-a.x,b.z-a.z)};
  });
  const original=new Map([...positions].map(([id,p])=>[id,{x:p.x,z:p.z}]));
  return {positions,original,edges,broken,floorZ,time:0};
}
export function stepBridgeCollapseDynamics(state,dt,{gravity=3.5,iterations=12}={}){
  const step=Math.min(.035,Math.max(0,dt));
  if(!step)return state;
  state.time+=step;
  const floor=state.floorZ;
  for(const [id,p] of state.positions){
    const vx=(p.x-p.oldX)*.985,vz=(p.z-p.oldZ)*.985;
    const x=p.x,z=p.z;
    if(!p.fixX)p.x+=vx;
    if(!p.fixZ)p.z+=vz-gravity*step*step*(id==='B2'?2.5:1);
    p.oldX=x;p.oldZ=z;
  }
  for(let iteration=0;iteration<iterations;iteration++){
    for(const edge of state.edges){
      const a=state.positions.get(edge.i),b=state.positions.get(edge.j);
      const dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz);
      if(L<1e-12)continue;
      if(edge.tie&&L<edge.rest)continue;
      const error=(L-edge.rest)/L;
      const wx=a.fixX?0:1,wy=b.fixX?0:1,wxz=a.fixZ?0:1,wyz=b.fixZ?0:1;
      const wX=wx+wy,wZ=wxz+wyz;
      if(wX){a.x+=dx*error*wx/wX;b.x-=dx*error*wy/wX;}
      if(wZ){a.z+=dz*error*wxz/wZ;b.z-=dz*error*wyz/wZ;}
    }
    for(const [id,p] of state.positions){
      const origin=state.original.get(id);
      if(p.fixX)p.x=origin.x;
      if(p.fixZ)p.z=origin.z;
      if(!p.fixZ&&p.z<floor){
        p.z=floor;
        // Inelastic floor contact. Preserve only a fraction of rebound speed.
        p.oldZ=Math.min(p.z,p.oldZ);
      }
      p.x=clamp(p.x,-4,5);p.z=clamp(p.z,floor,3);
    }
  }
  return state;
}
