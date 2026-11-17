// Screen-space hit-testing for AR mobile bridge editing.
// All positions are CSS pixels projected from the ACTUAL XR camera.
// Kept separate from solver to share exactly the same bridge geometry.
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function pickBridgeTouchNode(points,x,y,radiusPx=32){
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  let best=null,min=radiusPx;
  for(const p of points){
    if(!p.visible)continue;
    const delta=Math.hypot(p.x-x,p.y-y);
    if(delta<=min){min=delta;best={kind:'node',id:p.id,distancePx:delta};}
  }
  return best;
}
export function pickBridgeTouchMember(points,members,x,y,radiusPx=25){
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  const byId=new Map(points.filter(p=>p.visible).map(p=>[p.id,p]));
  let best=null,min=radiusPx;
  for(const member of members){
    const a=byId.get(member.i),b=byId.get(member.j);
    if(!a||!b)continue;
    const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
    if(len2<1e-7)continue;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/len2));
    const d=Math.hypot(a.x+t*dx-x,a.y+t*dy-y);
    if(d<=min){min=d;best={kind:'member',id:member.id,distancePx:d};}
  }
  return best;
}
// A touch on a construction point always wins in add mode.
// In remove/inspection mode avoid misinterpreting a tap on a support node
// as a bar selection, unless the user specifically requests bar removal.
export function pickBridgeTouch(points,members,x,y,mode='add'){
  if(mode==='remove')return pickBridgeTouchMember(points,members,x,y,27);
  return pickBridgeTouchNode(points,x,y,37);
}
