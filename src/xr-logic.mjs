// Pure helpers for the immersive structural viewer. No browser or Three.js dependency.
export function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
export function rotateIndex(current,delta,count){
  if(!Number.isInteger(count)||count<=0)return -1;
  return ((current+delta)%count+count)%count;
}
export function snapModelSize(size,delta){
  return Math.round(clamp(size+delta,0.4,5)*10)/10;
}
export function isValidHorizontalHit(normal){
  if(!normal||normal.length!==3)return false;
  const l=Math.hypot(...normal)||1;
  return normal[1]/l>=0.72;
}
export function placeObjectOnHit(point,normal,verticalOffset=0){
  if(!isValidHorizontalHit(normal))return null;
  return [point[0]+normal[0]*verticalOffset,
    point[1]+normal[1]*verticalOffset,
    point[2]+normal[2]*verticalOffset];
}
export function caseLabel(cases,index){
  if(!Array.isArray(cases)||!cases.length)return 'SIN DEFORMADAS';
  const item=cases[rotateIndex(index,0,cases.length)];
  return item?.name||String(item);
}
export function nextUniquePattern(loads,current,delta){
  const values=['all',...new Set((loads||[]).map(l=>l.pattern).filter(Boolean))];
  const index=values.indexOf(current);
  return values[rotateIndex(index===-1?0:index,delta,values.length)];
}
