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
  // A rod has finite thickness: its centreline must stay at least one
  // visual radius above the floor, not merely its mathematical nodes.
  const clearance=new Map([...positions.keys()].map(id=>[id,0]));
  for(const m of members){
    const radius=Math.max(0,Number(m.radius)||0);
    for(const id of [m.i,m.j])if(clearance.has(id))
      clearance.set(id,Math.max(clearance.get(id),radius));
  }
  const broken=new Set(brokenIds);
  const edges=members.filter(m=>!broken.has(m.id)).map(m=>{
    const a=positions.get(m.i),b=positions.get(m.j);
    return {id:m.id,i:m.i,j:m.j,tie:Boolean(m.tie),
      rest:Math.hypot(b.x-a.x,b.z-a.z)};
  });
  const original=new Map([...positions].map(([id,p])=>[id,{x:p.x,z:p.z}]));
  return {positions,original,edges,broken,clearance,floorZ,time:0};
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
      const minZ=floor+(state.clearance?.get(id)??0);
      if(!p.fixZ&&p.z<minZ){
        p.z=minZ;
        // Resting contact: cancel downward Verlet velocity and dissipate
        // lateral motion. Do not accumulate artificial rebound each frame.
        p.oldZ=p.z;
        p.oldX=p.x-(p.x-p.oldX)*.45;
      }
      p.x=clamp(p.x,-4,5);
      if(!p.fixZ)p.z=clamp(p.z,minZ,3);
    }
  }
  return state;
}

// Projection of a finite cylindrical fragment onto the ground plane.
// axisZ is the signed vertical component of the cylinder's unit axis.
// Conservative radius allowance also covers end caps and angled members.
export function resolveBridgeCylinderFloor(centerZ,axisZ,length,radius,floorZ){
  const halfExtent=Math.abs(axisZ)*Math.max(0,length)*.5+
    Math.max(0,radius);
  const minCenter=floorZ+halfExtent;
  const corrected=Math.max(Number(centerZ),minCenter);
  return {centerZ:corrected,contact:corrected>centerZ,
    lowestZ:corrected-halfExtent};
}

// Integrate a free fractured half-member as a 2D rigid body. Contact acts
// on its finite-length, finite-radius footprint; after an impact, damping
// and a small roll settle the member flat rather than pinning a tilted rod
// at a fixed height forever. The output is in the same local coordinates
// as the bridge's floor plane. Does not model member/member collisions.
export function stepBridgeLooseFragment(body,dt,floorZ){
  const step=Math.min(.035,Math.max(0,dt));
  if(!step)return body;
  const radius=Math.max(0,body.radius??0);
  const length=Math.max(0,body.length??0);
  if(body.settled){
    // After falling and rolling the bar is at rest. Track a movable floor
    // surface (Quest plane detection) without allowing re-penetration.
    body.z=floorZ+radius;
    body.vx=0;body.vz=0;body.omega=0;
    return body;
  }
  body.vz-=3.5*step;
  body.x+=body.vx*step;
  body.z+=body.vz*step;
  body.angle+=body.omega*step;
  let axisZ=body.axisZ*Math.cos(body.angle)-
    body.axisX*Math.sin(body.angle);
  let contact=resolveBridgeCylinderFloor(body.z,axisZ,length,radius,floorZ);
  if(contact.contact){
    body.z=contact.centerZ;
    body.vz=0;
    // The only angular degree of freedom is within the vertical bridge
    // plane. Choose the nearest horizontal orientation (either polarity).
    const horizontal=Math.atan2(body.axisZ,body.axisX);
    let delta=horizontal-body.angle;
    delta=((delta+Math.PI/2)%Math.PI+Math.PI)%Math.PI-Math.PI/2;
    body.groundedFor=(body.groundedFor??0)+step;
    body.omega=body.omega*.12+delta*step*4;
    body.angle+=delta*Math.min(.32,8*step);
    body.vx*=Math.exp(-9*step);
    axisZ=body.axisZ*Math.cos(body.angle)-
      body.axisX*Math.sin(body.angle);
    contact=resolveBridgeCylinderFloor(body.z,axisZ,length,radius,floorZ);
    body.z=contact.centerZ;
    body.touchingFloor=true;
    // The educational animation has a defined final rest configuration.
    // Complete the last fraction of a degree instead of leaving a
    // nearly-horizontal rod visually intersecting or hovering above ground.
    if((body.groundedFor>.4&&Math.abs(axisZ)<.015&&
        Math.abs(body.vx)<.02)||body.groundedFor>1.6){
      body.angle+=Math.atan2(axisZ,Math.abs(body.axisX*Math.cos(body.angle)+
        body.axisZ*Math.sin(body.angle)))*(
        (body.axisX*Math.cos(body.angle)+
         body.axisZ*Math.sin(body.angle))>=0?1:-1);
      body.z=floorZ+radius;
      body.vx=0;body.vz=0;body.omega=0;
      body.settled=true;
    }
  }
  return body;
}
