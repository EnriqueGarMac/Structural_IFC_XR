import {solveFramePlane} from './matrix-frame-2d.mjs';
import {addApartmentDetails} from './building-apartment-detail.mjs';

// Teaching apartment building: three occupied levels at z=0,3.2,6.4 m;
// structural roof at z=9.6 m. Three independent XZ reinforced-concrete frames
// at y=-4,0,+4, with distributed slab-tributary selfweight and horizontal
// façade wind loads. The 2D model neglects slab diaphragms, 3D torsion,
// connection cracking, partition stiffness and foundation flexibility.
export const BUILDING={
  name:'Edificio de viviendas · 3 plantas · 12 × 8 m',
  width:12,depth:8,storeyHeight:3.2,storeys:3,
  E_kN_m2:30e6,unitWeight_kN_m3:25,
  floorDead_kN_m2:4.5,wind_kN_m2:.90
};
const xs=[-6,-2,2,6],ys=[-4,0,4],zs=[0,3.2,6.4,9.6];
const C={concrete:0xb4bfc5,beam:0x9facba,slab:0xbac6c9,
  wall:0xe7d9c7,inner:0xf2e9dd,glass:0x71aabb,
  door:0x9e7355,metal:0x698896,soil:0x66866f,
  green:0x648d70,paving:0x8f9996,wood:0xc19873};
function define(){
  const parts=[],planes=[],caseNames=['DEAD','WIND_X'];
  const box=(name,ifcType,center,size,color,structural=false,storey=0)=>{
    if(Math.min(...size)<=0)return;
    parts.push({type:'box',name,ifcType,center,size,color,structural,storey});
  };
  const mem=(name,ifcType,a,b,width,depth,color,structural=false,storey=0)=>{
    parts.push({type:'member',name,ifcType,a,b,width,depth,color,structural,storey});
  };
  const space=(name,level,cx,cy,sx,sy)=>parts.push({type:'space',name,
    ifcType:'IfcSpace',center:[cx,cy,zs[level]+1.4],size:[sx,sy,2.8],storey:level});
  for(let plane=0;plane<ys.length;plane++){
    const y=ys[plane],nodes=[],frames=[];
    const id=(xk,level)=>'B'+plane+'_'+level+'_'+xk;
    const byLevel=[];
    for(let level=0;level<=3;level++){
      for(let k=0;k<xs.length;k++){
        nodes.push({id:id(k,level),x:xs[k],y,z:zs[level],
          fixed2D:level===0?[true,true,true]:[false,false,false],
          restrained_dof:level===0?[true,true,true,true,true,true]:[]});
      }
    }
    const tributary=plane===1?4:2;
    for(let level=0;level<3;level++){
      const z0=zs[level],z1=zs[level+1];
      for(let k=0;k<xs.length;k++){
        const a=[xs[k],y,z0],b=[xs[k],y,z1];
        const frameId='BC'+plane+'_'+level+'_'+k;
        frames.push({id:frameId,i:id(k,level),j:id(k,level+1),
          E_kN_m2:BUILDING.E_kN_m2,A_m2:.40*.40,
          I_m4:.40*.40**3/12,density_kN_m3:BUILDING.unitWeight_kN_m3,
          section:'RC40x40',material:'C30/37',
          loads:{WIND_X:k===0?[BUILDING.wind_kN_m2*tributary,0]:[0,0]}});
        mem('Pilar de HA '+frameId,'IfcColumn',a,b,.40,.40,C.concrete,true,level);
      }
      for(let k=0;k<xs.length-1;k++){
        const a=[xs[k],y,z1],b=[xs[k+1],y,z1];
        const frameId='BV'+plane+'_'+level+'_'+k;
        frames.push({id:frameId,i:id(k,level+1),j:id(k+1,level+1),
          E_kN_m2:BUILDING.E_kN_m2,A_m2:.32*.55,
          I_m4:.32*.55**3/12,density_kN_m3:BUILDING.unitWeight_kN_m3,
          section:'RC32x55',material:'C30/37',
          loads:{DEAD:[0,-BUILDING.floorDead_kN_m2*tributary]}});
        mem('Viga porticada de HA '+frameId,'IfcBeam',a,b,.32,.55,C.beam,true,level+1);
      }
    }
    planes.push(solveFramePlane({nodes,frames,cases:caseNames.map(name=>({
      name,selfWeight:name==='DEAD'
    }))}));
  }
  // The Y-direction edge beams are secondary structural geometry. In the
  // analytical teaching exercise their tributary gravity actions are already
  // transferred to the three independent XZ frames; no 3D bending is claimed.
  for(let level=1;level<=3;level++){
    for(const x of xs)for(let j=0;j<ys.length-1;j++){
      mem('Viga longitudinal secundaria '+level+'/'+x+'/'+j,
        'IfcBeam',[x,ys[j],zs[level]],[x,ys[j+1],zs[level]],
        .30,.48,C.beam,true,level);
    }
  }
  // Floor plates with a visible staircase opening near the central corridor.
  for(let level=1;level<=3;level++){
    const z=zs[level]-.11;
    box('Forjado '+level+' · ala oeste','IfcSlab',[-3,0,z],[6.0,8.20,.22],C.slab,true,level);
    box('Forjado '+level+' · ala este','IfcSlab',[4.0,0,z],[4.0,8.20,.22],C.slab,true,level);
    box('Forjado '+level+' · banda sur','IfcSlab',[1,-1.55,z],[2.0,5.1,.22],C.slab,true,level);
    box('Forjado '+level+' · banda norte','IfcSlab',[1,3.55,z],[2.0,.9,.22],C.slab,true,level);
  }
  box('Losa de acceso a planta baja','IfcSlab',[0,0,-.10],[12.15,8.15,.20],C.slab,true,0);
  for(const y of ys)for(const x of xs){
    box('Zapata aislada '+x+'/'+y,'IfcFooting',[x,y,-.38],[1.25,1.25,.56],0x7e9294,true,0);
  }
  // A vertical or horizontal partition is tessellated around every opening:
  // doors and windows are therefore physically visible, not overdrawn onto
  // opaque solids. Corresponding IFC products remain separate objects.
  let counter=0;
  function pierced(axis,constCoord,from,to,z0,z1,thick,openings,display,storey){
    const edges=[from,to,...openings.flatMap(o=>[o.at-o.width/2,o.at+o.width/2])];
    const values=[...new Set(edges.map(x=>+x.toFixed(4)))].sort((a,b)=>a-b);
    for(let i=1;i<values.length;i++){
      const left=values[i-1],right=values[i],mid=(left+right)/2;
      const occupied=openings.filter(o=>mid>o.at-o.width/2+1e-5&&mid<o.at+o.width/2-1e-5);
      const zEdges=[z0,z1,...occupied.flatMap(o=>[o.bottom,o.top])];
      const bounds=[...new Set(zEdges.map(x=>+x.toFixed(4)))].sort((a,b)=>a-b);
      for(let j=1;j<bounds.length;j++){
        const low=bounds[j-1],high=bounds[j],zm=(low+high)/2;
        if(occupied.some(o=>zm>o.bottom&&zm<o.top))continue;
        const center=axis==='x'?[(left+right)/2,constCoord,(low+high)/2]:
          [constCoord,(left+right)/2,(low+high)/2];
        const size=axis==='x'?[right-left,thick,high-low]:
          [thick,right-left,high-low];
        box(display+' · paño '+(++counter),'IfcWall',center,size,
          display.includes('Fachada')?C.wall:C.inner,false,storey);
      }
    }
  }
  function glassWindow(axis,at,constCoord,zCenter,w,h,storey,tag){
    const center=axis==='x'?[at,constCoord,zCenter]:[constCoord,at,zCenter];
    const size=axis==='x'?[w,.075,h]:[.075,w,h];
    box(tag+' · vidrio','IfcWindow',center,size,C.glass,false,storey);
    const border=.055;
    for(const sign of [-1,1]){
      const p=axis==='x'?[at+sign*(w/2-border/2),constCoord,zCenter]:
        [constCoord,at+sign*(w/2-border/2),zCenter];
      const dims=axis==='x'?[border,.11,h]:[.11,border,h];
      box(tag+' · montante','IfcMember',p,dims,C.metal,false,storey);
    }
  }
  function openingDoor(axis,at,constCoord,z0,w,h,storey,tag){
    const center=axis==='x'?[at,constCoord,z0+h/2]:[constCoord,at,z0+h/2];
    const size=axis==='x'?[w,.072,h]:[.072,w,h];
    box(tag,'IfcDoor',center,size,C.door,false,storey);
    box(tag+' · tirador','IfcBuildingElementProxy',
      axis==='x'?[at+w*.31,constCoord-.08,z0+1]:
      [constCoord-.08,at+w*.31,z0+1],[.06,.06,.12],C.metal,false,storey);
  }
  for(let level=0;level<3;level++){
    const z0=zs[level]+.07,z1=zs[level+1]-.12;
    const frontOpenings=level===0?[
      {at:0,width:1.35,bottom:z0,top:z0+2.4},
      {at:-4.0,width:1.65,bottom:z0+1.05,top:z0+2.24},
      {at:4.1,width:1.65,bottom:z0+1.05,top:z0+2.24}
    ]:[-4,0,4].map(at=>({at,width:1.7,bottom:z0+1.05,top:z0+2.30}));
    pierced('x',-4,-6,6,z0,z1,.20,frontOpenings,'Fachada principal',level);
    for(const o of frontOpenings){
      if(level===0&&o.at===0)openingDoor('x',o.at,-4,z0,o.width,o.top-o.bottom,level,'Puerta de acceso');
      else glassWindow('x',o.at,-4,(o.bottom+o.top)/2,o.width,o.top-o.bottom,level,
        'Ventana fachada sur · '+level);
    }
    const back=[-4,0,4].map(at=>({at,width:1.3,bottom:z0+1.10,top:z0+2.20}));
    pierced('x',4,-6,6,z0,z1,.20,back,'Fachada patio',level);
    for(const o of back)glassWindow('x',o.at,4,(o.bottom+o.top)/2,o.width,o.top-o.bottom,level,'Ventana patio');
    for(const x of [-6,6]){
      const openings=[-2,2].map(at=>({at,width:1.18,bottom:z0+1.12,top:z0+2.2}));
      pierced('y',x,-4,4,z0,z1,.20,openings,'Fachada lateral',level);
      for(const o of openings)glassWindow('y',o.at,x,(o.bottom+o.top)/2,o.width,o.top-o.bottom,level,'Ventana lateral');
    }
    // A kitchen/living room and bath/bedroom plan repeated on each occupied level.
    const interior1=[{at:-1.1,width:.90,bottom:z0,top:z0+2.10}];
    pierced('y',-2,-3.8,3.8,z0,z1,.12,interior1,'Tabique transversal',level);
    openingDoor('y',-1.1,-2,z0,.90,2.1,level,'Puerta entre cocina y sala');
    const interior2=[{at:-4.0,width:.84,bottom:z0,top:z0+2.08},
      {at:3.5,width:.84,bottom:z0,top:z0+2.08}];
    pierced('x',0,-5.85,5.85,z0,z1,.12,interior2,'Tabique habitaciones',level);
    for(const o of interior2)openingDoor('x',o.at,0,z0,o.width,o.top-o.bottom,level,
      'Puerta interior planta '+level);
    space('Cocina · planta '+(level+1),level,-4,-2,3.7,3.7);
    space('Salón comedor · planta '+(level+1),level,2,-2,7.6,3.7);
    space('Baño · planta '+(level+1),level,-4,2,3.7,3.7);
    space('Dormitorio · planta '+(level+1),level,3,2,5.7,3.7);
    const z=z0+.12;
    box('Encimera cocina · '+level,'IfcFurnishingElement',[-5.50,-2,z+.38],[.72,2.4,.76],C.wood,false,level);
    box('Fregadero cocina · '+level,'IfcSanitaryTerminal',[-5.5,-2,z+.79],[.55,.58,.11],0xd5e9e9,false,level);
    box('Frigorífico cocina · '+level,'IfcFurnishingElement',[-5.40,-3.18,z+.94],[.66,.70,1.88],0xd3e0e2,false,level);
    box('Mesa comedor · '+level,'IfcFurnishingElement',[1,-2.5,z+.67],[1.5,.9,.14],C.wood,false,level);
    box('Sofá salón · '+level,'IfcFurnishingElement',[3.8,-3.05,z+.38],[1.9,.85,.76],0x497d85,false,level);
    box('Inodoro baño · '+level,'IfcSanitaryTerminal',[-5.12,2.7,z+.35],[.60,.72,.70],0xe9f3f0,false,level);
    box('Lavabo baño · '+level,'IfcSanitaryTerminal',[-3,3.35,z+.85],[.65,.44,.18],0xf3f7f4,false,level);
    box('Ducha baño · '+level,'IfcSanitaryTerminal',[-5.15,.83,z+.04],[.85,.85,.08],0x9bc5cc,false,level);
    box('Cama doble dormitorio · '+level,'IfcFurnishingElement',[3.65,2.4,z+.25],[2.1,1.65,.48],0xd7c0ae,false,level);
    box('Armario dormitorio · '+level,'IfcFurnishingElement',[5.6,1.5,z+1],[.45,1.45,2],C.wood,false,level);
    // Individual IFC furnishings are non-resistant and never enter the FEM.
    addApartmentDetails({level,floorZ:zs[level],box});
    // Flight within the 2 × 2 m stair shaft.
    for(let step=0;step<12;step++){
      const y=.98+step*.17;
      box('Peldaño escalera '+level+'/'+step,'IfcStairFlight',
        [1.0,y,zs[level]+(step+1)*.255],[1.65,.23,.16],0xaaa4a0,false,level);
    }
  }
  // Parapet, a glazed entrance canopy and simple outdoor landscaping.
  for(const x of [-5.96,5.96])box('Pretil cubierta lateral','IfcWall',
    [x,0,10.02],[.18,8.1,.73],C.wall,false,3);
  for(const y of [-3.97,3.97])box('Pretil cubierta transversal','IfcWall',
    [0,y,10.02],[11.9,.18,.73],C.wall,false,3);
  box('Marquesina entrada','IfcCovering',[0,-4.8,2.72],[3.2,1.65,.12],0xb9bfc2,false,0);
  box('Terreno natural y césped','IfcGeographicElement',[0,0,-.65],[31,26,.50],C.green,false,0);
  box('Camino peatonal de acceso','IfcCovering',[0,-9,-.385],[2.35,10,.08],C.paving,false,0);
  box('Aparcamiento exterior','IfcCovering',[8.3,-4,-.39],[4.6,13,.08],0x6c7476,false,0);
  for(let k=0;k<4;k++)box('Línea aparcamiento '+k,'IfcBuildingElementProxy',
    [6.25,-9.4+3*k,-.335],[3.9,.10,.014],0xe5e8de,false,0);
  for(const [x,y] of [[-11,-8],[-10,8],[11,9]]){
    box('Árbol ornamental · tronco','IfcBuildingElementProxy',
      [x,y,.72],[.26,.26,1.5],0x735b41,false,0);
    box('Árbol ornamental · copa','IfcBuildingElementProxy',
      [x,y,2.05],[2.0,2.0,1.25],C.green,false,0);
  }
  const combined={nodes:[],frames:[],loads:[],cases:caseNames.map(name=>({
    name,displacements:[]})),forces:{},frameCurves:{},jointReactions:{},
    sections:{}};
  for(const name of caseNames){
    combined.forces[name]={};combined.frameCurves[name]={};combined.jointReactions[name]={};
  }
  for(const result of planes){
    combined.nodes.push(...result.nodes);combined.frames.push(...result.frames);
    combined.loads.push(...result.loads);Object.assign(combined.sections,result.sections);
    for(const c of result.cases){
      combined.cases.find(x=>x.name===c.name).displacements.push(...c.displacements);
      Object.assign(combined.forces[c.name],result.forces[c.name]);
      Object.assign(combined.frameCurves[c.name],result.frameCurves[c.name]);
      Object.assign(combined.jointReactions[c.name],result.jointReactions[c.name]);
    }
  }
  combined.meta={name:BUILDING.name,
    source:'Cálculo matricial 2D de pórticos planos',
    note:'Resultados calculados mediante rigidez matricial lineal, no sintéticos. Tres pórticos XZ independientes. Vigas y forjados longitudinales no incluidos como elementos 3D; cargas gravitatorias repartidas por anchura tributaria. Estructura esquemática no verificada para construcción.',
    analysis:{method:'2D Euler-Bernoulli stiffness matrix',E_MPa:30000,
      supports:'bases empotradas',dead_floor_kN_m2:BUILDING.floorDead_kN_m2,
      wind_kN_m2:BUILDING.wind_kN_m2,limits:'No 3D torsion or slab shell'}}
  return {parts,results:combined,spaces:parts.filter(x=>x.type==='space')};
}
export const buildingTeaching=define();
