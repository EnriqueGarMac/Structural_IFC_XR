// Geometric indicator for the EXACT station queried along a force diagram.
// Coordinates are in the same engineering XYZ basis as the SAP frame.
const length=v=>Math.hypot(v[0],v[1],v[2]);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,k)=>a.map(v=>v*k);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=v=>{const n=length(v);if(n<1e-12)throw Error('Dirección de barra o diagrama no válida');return mul(v,1/n);};

export function forceSectionMarker({origin,axis,normal,station,value,amplitude,scale=1}){
  if(![station,value,amplitude,scale].every(Number.isFinite))
    throw Error('No se puede marcar una sección con coordenadas no finitas.');
  const u=norm(axis),v=norm(sub(normal,mul(u,dot(normal,u))));
  const out=norm(cross(u,v));
  const base=add(origin,mul(u,station));
  const tip=add(base,mul(v,value*amplitude));
  // One continuous vertical-on-diagram cut and three short ticks. If the
  // force is zero, the indicator remains visible at the exact beam station.
  const pad=Math.max(.018,scale*.012),tick=Math.max(.02,scale*.009);
  const lines=[
    [sub(base,mul(v,pad)),add(tip,mul(v,pad))],
    [sub(base,mul(u,tick)),add(base,mul(u,tick))],
    [sub(tip,mul(u,tick)),add(tip,mul(u,tick))],
    [sub(base,mul(out,tick*.65)),add(base,mul(out,tick*.65))]
  ];
  return {base,tip,station,positions:new Float32Array(lines.flat(2))};
}
