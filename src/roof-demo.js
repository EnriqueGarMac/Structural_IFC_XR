import * as THREE from 'three';
import {normalizeResults} from './results.mjs';

// Demonstration model only: the coordinates, forces and displacements are
// illustrative and have NOT been calculated or exported from SAP2000.
// IFC types are semantic labels for the viewer, not a serialized IFC file.
export const ROOF_DEMO = Object.freeze({
  name:'Cubierta metálica en celosía · 18 × 24 m',
  span:18,length:24,eaves:6.5,ridge:9,
  description:'Cinco cerchas a dos aguas, pilares, correas y arriostramientos.'
});
const TRUSS_Y=[0,6,12,18,24];
const NX=12,DX=ROOF_DEMO.span/NX;
const topZ=x=>+(ROOF_DEMO.eaves+(ROOF_DEMO.ridge-ROOF_DEMO.eaves)*
  (1-Math.abs(x-ROOF_DEMO.span/2)/(ROOF_DEMO.span/2))).toFixed(4);

function buildDefinition(){
  const nodes=[],frames=[],members=[],loads=[],lookup=new Map();
  function node(x,y,z){
    const key=[x,y,z].map(v=>v.toFixed(4)).join(':');
    const old=lookup.get(key);
    if(old)return old;
    const id='N'+(nodes.length+1);
    nodes.push({id,x:+x.toFixed(4),y:+y.toFixed(4),z:+z.toFixed(4)});
    lookup.set(key,id);
    return id;
  }
  function member(name,a,b,width,depth,color,ifcType='IfcMember',loadFamily=null){
    const i=node(...a),j=node(...b);
    if(i===j)throw Error('Barra de longitud nula en cubierta demo');
    const id='F'+(frames.length+1);
    frames.push({id,i,j});
    members.push({name,a,b,width,depth,color,ifcType});
    if(loadFamily==='roof'){
      loads.push({frame:id,pattern:'G',csys:'Global',dir:6,start:0,end:1,w1:-1.65,w2:-1.65});
      loads.push({frame:id,pattern:'N',csys:'Global',dir:6,start:0,end:1,w1:-2.8,w2:-2.8});
    }
    if(loadFamily==='wind'){
      loads.push({frame:id,pattern:'V',csys:'Global',dir:4,start:0,end:1,w1:1.15,w2:1.15});
    }
  }
  const X=k=>+(k*DX).toFixed(4);
  for(let t=0;t<TRUSS_Y.length;t++){
    const y=TRUSS_Y[t];
    // Twin triangular chords and web system in each Pratt-inspired pitched
    // roof truss. Individual elements can be picked and identified in XR.
    for(let k=0;k<NX;k++){
      const xa=X(k),xb=X(k+1);
      member('Cordón superior · cercha '+(t+1)+' · '+(k+1),
        [xa,y,topZ(xa)],[xb,y,topZ(xb)],
        .19,.21,0xd8b77e,'IfcBeam');
      member('Cordón inferior · cercha '+(t+1)+' · '+(k+1),
        [xa,y,6.12],[xb,y,6.12],
        .16,.17,0x9cb5c6,'IfcBeam');
      // Diagonals point towards the centre of the span.
      const da=k<NX/2?[xa,y,6.12]:[xb,y,6.12];
      const db=k<NX/2?[xb,y,topZ(xb)]:[xa,y,topZ(xa)];
      member('Diagonal · cercha '+(t+1)+' · '+(k+1),da,db,
        .102,.102,0x60c2c7,'IfcMember');
    }
    for(let k=0;k<=NX;k++){
      const x=X(k);
      member('Montante · cercha '+(t+1)+' · '+(k+1),
        [x,y,6.12],[x,y,topZ(x)],
        .095,.095,0x92cbd0,'IfcMember');
    }
    for(const side of [0,18]){
      member('Pilar HEB · '+(side===0?'oeste':'este')+' · pórtico '+(t+1),
        [side,y,0],[side,y,6.12],
        .34,.34,0x809aa8,'IfcColumn',t>0&&t<4?'wind':null);
    }
  }
  // The purlins are continuous along the building and carry the synthetic
  // gravity/snow actions. They align exactly with the truss top nodes.
  for(let t=0;t<TRUSS_Y.length-1;t++){
    for(let k=0;k<=NX;k++){
      const x=X(k),z=topZ(x);
      member('Correa longitudinal · tramo '+(t+1)+' · '+(k+1),
        [x,TRUSS_Y[t],z],[x,TRUSS_Y[t+1],z],
        .115,.14,0xc7d8db,'IfcBeam',(k===2||k===4||k===6||k===8||k===10)?'roof':null);
    }
    // Sidewall girts keep the space frame legible from a ground-level view.
    for(const x of [0,18]){
      for(const z of [2.9,5.2]){
        member('Viga lateral · '+(x===0?'oeste':'este')+' · tramo '+(t+1),
          [x,TRUSS_Y[t],z],[x,TRUSS_Y[t+1],z],
          .13,.16,0x8fb1c3,'IfcBeam');
      }
    }
    if(t===0||t===3){
      // Roof bracing in the first and last bays.
      for(let k=0;k<NX;k+=4){
        const xa=X(k),xb=X(k+4),y0=TRUSS_Y[t],y1=TRUSS_Y[t+1];
        member('Arriostramiento cubierta · X'+(k/4+1)+'A · tramo '+(t+1),
          [xa,y0,topZ(xa)],[xb,y1,topZ(xb)],
          .055,.07,0x5aa99f,'IfcMember');
        member('Arriostramiento cubierta · X'+(k/4+1)+'B · tramo '+(t+1),
          [xb,y0,topZ(xb)],[xa,y1,topZ(xa)],
          .055,.07,0x5aa99f,'IfcMember');
      }
      for(const side of [0,18]){
        member('Cruz lateral · lado '+side+' · tramo '+(t+1),
          [side,TRUSS_Y[t],.85],[side,TRUSS_Y[t+1],5.6],
          .07,.07,0x6baba5,'IfcMember');
        member('Cruz lateral · lado '+side+' retorno · tramo '+(t+1),
          [side,TRUSS_Y[t],5.6],[side,TRUSS_Y[t+1],.85],
          .07,.07,0x6baba5,'IfcMember');
      }
    }
  }
  const cases=[
    {name:'G + N · cubierta (demo)',displacements:nodes.map(n=>{
      const sx=Math.sin(Math.PI*n.x/18)**2;
      const longitudinal=.82+.18*Math.sin(Math.PI*n.y/24)**2;
      const roof=n.z>5.8?1:Math.max(0,n.z/6.12);
      return {node:n.id,ux:.0012*Math.sin(Math.PI*n.x/18)*roof,
        uy:0,uz:-.025*sx*longitudinal*roof};
    })},
    {name:'Viento X · deriva (demo)',displacements:nodes.map(n=>{
      const h=Math.max(0,n.z)/9;
      return {node:n.id,ux:.024*h**1.15*(.8+.2*Math.sin(Math.PI*n.y/24)**2),
        uy:0,uz:-.0015*Math.sin(Math.PI*n.x/18)**2*h};
    })},
    {name:'Nieve asimétrica · demo',displacements:nodes.map(n=>{
      const sx=Math.sin(Math.PI*n.x/18)**1.4;
      const h=Math.min(1,Math.max(0,n.z/6));
      return {node:n.id,ux:.0022*sx*h,uy:0,
        uz:-.033*sx*(1-.58*n.x/18)*h};
    })}
  ];
  // Translate *both* the geometry and the synthetic SAP coordinates so that
  // (0, 0, 0) is at the centre of the building footprint, on the support level.
  // Displacement values above were defined before this rigid translation and
  // therefore remain unchanged, as required for consistent demo alignment.
  const centerX=ROOF_DEMO.span/2,centerY=ROOF_DEMO.length/2;
  for(const n of nodes){
    n.x=+(n.x-centerX).toFixed(4);
    n.y=+(n.y-centerY).toFixed(4);
  }
  for(const m of members){
    m.a=[m.a[0]-centerX,m.a[1]-centerY,m.a[2]];
    m.b=[m.b[0]-centerX,m.b[1]-centerY,m.b[2]];
  }
  return {nodes,frames,members,loads,cases};
}
const definition=buildDefinition();

export const roofDemoResults=normalizeResults({
  meta:{
    name:ROOF_DEMO.name,
    note:'DEMO SINTÉTICA: cargas y desplazamientos ilustrativos, NO obtenidos de SAP2000.',
    model:'Cubierta industrial a dos aguas con cerchas y arriostramientos.'
  },
  nodes:definition.nodes,frames:definition.frames,
  loads:definition.loads,cases:definition.cases
});

function orientedBox(a,b,width,depth){
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b);
  const axis=end.clone().sub(start),length=axis.length();
  const geom=new THREE.BoxGeometry(length,width,depth);
  geom.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1,0,0),axis.normalize()));
  geom.translate(...start.clone().add(end).multiplyScalar(.5).toArray());
  return geom;
}
function boxAt(cx,cy,cz,sx,sy,sz){
  const geom=new THREE.BoxGeometry(sx,sy,sz);
  geom.translate(cx,cy,cz);
  return geom;
}
export function roofDemoGeometry(){
  const pieces=definition.members.map(({name,a,b,width,depth,color,ifcType})=>({
    name,color,ifcType,geometry:orientedBox(a,b,width,depth)
  }));
  // Foundations are individually classified as IfcFooting and hidden by the
  // existing terrain/cimentación toggle, while columns and trusses remain.
  for(const y of TRUSS_Y)for(const x of [0,18]){
    const cx=x-ROOF_DEMO.span/2,cy=y-ROOF_DEMO.length/2;
    pieces.push({name:'Zapata · '+x+' / '+y,ifcType:'IfcFooting',
      color:0x526875,geometry:boxAt(cx,cy,-.16,1.10,1.10,.32)});
    pieces.push({name:'Placa base de pilar · '+x+' / '+y,ifcType:'IfcPlate',
      color:0x7f9ba6,geometry:boxAt(cx,cy,.045,.50,.50,.09)});
  }
  // This demonstration uses an engineering coordinate system, not a
  // bounding-box centred one. Its (0,0,0) is the centre of the footprint
  // at the column-base elevation. Keep this anchor when the viewer loads it.
  return pieces.map(piece=>({...piece,preserveStructuralOrigin:true}));
}

// Summary data is kept in sync with the corresponding synthetic analysis.
export function roofDemoStats(){
  return {pieces:definition.members.length+TRUSS_Y.length*4,
    nodes:roofDemoResults.nodes.length,frames:roofDemoResults.frames.length,
    loads:roofDemoResults.loads.length,cases:roofDemoResults.cases.length};
}
