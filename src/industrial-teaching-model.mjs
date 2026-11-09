import {solveFramePlane} from './matrix-frame-2d.mjs';

// Industrial portal + Pratt-like 2D truss demonstration, 18 x 24 m.
// Five independently analysed XZ trusses at y=-12,-6,0,6,12. Purlins,
// wall girts, sheeting and equipment are BIM geometry but not part of the
// primary 2D stiffness matrix. Their tributary roof/wind actions are placed
// explicitly on the primary chords and windward columns.
export const ROOF_TEACHING={
  name:'Nave industrial realista · 18 × 24 m',
  span:18,length:24,eaves:6.5,ridge:9,
  roofDead_kN_m2:1.10,wind_kN_m2:.75,
  E_kN_m2:210e6,steelWeight_kN_m3:78.5
};
const C={steel:0xa8bbcb,web:0x6fa9b8,top:0xd4b785,
  siding:0x94a8b3,roof:0x6d8da0,glass:0x8dc9d7,
  dark:0x556b79,asphalt:0x717d7d,soil:0x769278,
  pallet:0x9a7958,crate:0xb99d75,safety:0xf2bf58};
const xs=Array.from({length:13},(_,k)=>-9+1.5*k);
const ys=[-12,-6,0,6,12];
const zTop=(x)=>+(ROOF_TEACHING.eaves+(
  ROOF_TEACHING.ridge-ROOF_TEACHING.eaves)*(1-Math.abs(x)/9)).toFixed(6);
function define(){
  const parts=[],caseNames=['DEAD','WIND_X'],planes=[];
  const box=(name,ifcType,center,size,color,structural=false,storey=0)=>{
    if(Math.min(...size)<=0)throw Error('Dimensiones no válidas en '+name);
    parts.push({type:'box',name,ifcType,center,size,color,structural,storey});
  };
  const mem=(name,ifcType,a,b,width,depth,color,structural=false,storey=0)=>{
    parts.push({type:'member',name,ifcType,a,b,width,depth,color,structural,storey});
  };
  const space=(name,center,size)=>parts.push({type:'space',name,ifcType:'IfcSpace',
    center,size,storey:0});
  for(let t=0;t<ys.length;t++){
    const y=ys[t],trib=(t===0||t===ys.length-1)?3:6;
    const nodes=[],frames=[];
    const n=(k,which)=>'R'+t+'_'+which+'_'+k;
    for(let k=0;k<xs.length;k++){
      nodes.push({id:n(k,'B'),x:xs[k],y,z:6.12,fixed2D:[false,false,false]});
      nodes.push({id:n(k,'T'),x:xs[k],y,z:zTop(xs[k]),fixed2D:[false,false,false]});
    }
    for(const k of [0,12])nodes.push({
      id:n(k,'F'),x:xs[k],y,z:0,fixed2D:[true,true,true],
      restrained_dof:[true,true,true,true,true,true]
    });
    const steel=(id,i,j,type,A,I,loads={},colour=C.steel)=>{
      const ni=nodes.find(x=>x.id===i),nj=nodes.find(x=>x.id===j);
      const a=[ni.x,ni.y,ni.z],b=[nj.x,nj.y,nj.z];
      frames.push({id,i,j,E_kN_m2:ROOF_TEACHING.E_kN_m2,A_m2:A,I_m4:I,
        density_kN_m3:ROOF_TEACHING.steelWeight_kN_m3,
        section:type,material:'S355',loads});
      mem('Acero '+type+' · '+id,
        type==='HEB'?'IfcColumn':type==='DIAG'||type==='MONT'?'IfcMember':'IfcBeam',
        a,b,type==='HEB'?.36:type==='DIAG'?.105:.18,
        type==='HEB'?.36:type==='DIAG'?.105:.20,colour,true);
    };
    // Chords, rigid web joints, windward fixed-base columns.
    for(let k=0;k<12;k++){
      const L=Math.hypot(1.5,zTop(xs[k+1])-zTop(xs[k]));
      steel('TOP'+t+'_'+k,n(k,'T'),n(k+1,'T'),'UPN',
        .014,.00011,{DEAD:[0,-ROOF_TEACHING.roofDead_kN_m2*trib*1.5/L]},C.top);
      steel('BOT'+t+'_'+k,n(k,'B'),n(k+1,'B'),'IPE',
        .012,.000085,{},C.steel);
      if(k<6)
        steel('DIA'+t+'_'+k,n(k,'B'),n(k+1,'T'),'DIAG',
          .0054,.0000045,{},C.web);
      else
        steel('DIA'+t+'_'+k,n(k+1,'B'),n(k,'T'),'DIAG',
          .0054,.0000045,{},C.web);
    }
    for(let k=0;k<=12;k++)
      steel('VER'+t+'_'+k,n(k,'B'),n(k,'T'),'MONT',
        .0055,.000005,{},0x8cb6c5);
    for(const k of [0,12]){
      steel('COL'+t+'_'+k,n(k,'F'),n(k,'B'),'HEB',
        .026,.00038,
        {WIND_X:k===0?[ROOF_TEACHING.wind_kN_m2*trib,0]:[0,0]},C.steel);
    }
    planes.push(solveFramePlane({nodes,frames,cases:caseNames.map(name=>({
      name,selfWeight:name==='DEAD'
    }))}));
  }
  // Longitudinal purlins and wall rails physically join trusses, but are
  // secondary elements omitted from independent portal-frame FEM.
  for(let j=0;j<ys.length-1;j++){
    for(const x of xs){
      mem('Correa longitudinal '+j+' / '+x,'IfcBeam',
        [x,ys[j],zTop(x)],[x,ys[j+1],zTop(x)],
        .115,.15,0xc6d2d6,true);
    }
    for(const x of [-9,9])for(const z of [2.2,4.8]){
      mem('Correa de fachada '+j+' / '+x+' / '+z,'IfcBeam',
        [x,ys[j],z],[x,ys[j+1],z],.14,.15,0x91acb7,true);
    }
    for(const x of [-9,9]){
      if(j!==0&&j!==3)continue;
      mem('Arriostramiento longitudinal '+j+' A','IfcMember',
        [x,ys[j],.65],[x,ys[j+1],5.7],.09,.09,0x66b5a4,true);
      mem('Arriostramiento longitudinal '+j+' B','IfcMember',
        [x,ys[j],5.7],[x,ys[j+1],.65],.09,.09,0x66b5a4,true);
    }
  }
  for(const [a,b] of [[-9,0],[0,9]]){
    mem('Panel de cubierta metálica a dos aguas','IfcRoof',
      [a,0,zTop(a)+.24],[b,0,zTop(b)+.24],
      24.40,.095,C.roof,false);
  }
  // Skylights and visible ridge flashing in the roof envelope.
  for(const x of [-4.5,4.5]){
    mem('Franja de lucernario industrial','IfcWindow',
      [x,0,zTop(x)+.32],[x+1.2,0,zTop(x+1.2)+.32],
      5.2,.035,C.glass,false);
  }
  mem('Cumbrera metálica de coronación','IfcCovering',
    [0,-12.2,9.30],[0,12.2,9.30],.27,.09,0xcddbe1,false);
  // Vertical metal cladding with an unobstructed vehicle entrance in the
  // front façade. BIM walls carry neither analytical stiffness nor loads.
  for(const x of [-9.07,9.07]){
    for(let j=0;j<12;j++){
      const yc=-11+j*2;
      box('Panel sándwich fachada lateral '+x+'/'+j,'IfcWall',
        [x,yc,3.25],[.12,2.02,6.50],C.siding,false);
    }
    for(const z of [1.7,4.7]){
      for(let j=0;j<8;j++){
        box('Ventana industrial lateral '+x+'/'+z+'/'+j,'IfcWindow',
          [x+(x>0?.07:-.07),-10.5+3*j,z],
          [.06,1.30,.60],C.glass,false);
      }
    }
  }
  for(const y of [-12.05,12.05]){
    const entrance=y===-12.05;
    for(let k=0;k<9;k++){
      const x=-8+k*2;
      if(entrance&&Math.abs(x)<3.1)continue;
      box('Chapa fachada testero · '+y+' / '+k,'IfcWall',
        [x,y,3.20],[2.02,.14,6.4],C.siding,false);
    }
    if(entrance){
      box('Dintel superior puerta nave','IfcWall',
        [0,y,5.45],[6.25,.14,2.1],C.siding,false);
      box('Puerta seccional de carga','IfcDoor',[0,y-.08,2.15],
        [5.2,.105,4.3],0x718b9a,false);
      for(let k=0;k<7;k++)box('Greca de puerta industrial '+k,'IfcMember',
        [0,y-.16,.35+k*.56],[5.28,.065,.07],0xa8c6cc,false);
      box('Acceso peatonal lateral nave','IfcDoor',[-7,y-.12,1.05],
        [1.1,.095,2.1],0x6c8a93,false);
    }
    // Gable triangles are stepped panels with voids for ventilation.
    for(let k=0;k<12;k++){
      const x=-8.25+1.5*k,top=zTop(x);
      const h=Math.max(.08,top-6.50);
      box('Cerramiento triangular frontón '+y+'/'+k,'IfcCovering',
        [x,y,6.5+h/2],[1.53,.12,h],C.siding,false);
    }
  }
  // Baseplates, foundations and slab-on-grade.
  for(const y of ys)for(const x of [-9,9]){
    box('Zapata pilar nave '+x+'/'+y,'IfcFooting',
      [x,y,-.40],[1.60,1.60,.68],0x667c83,true);
    box('Placa base y pernos','IfcPlate',[x,y,.045],
      [.57,.57,.090],0x8fa6ab,true);
  }
  box('Solera industrial de hormigón','IfcSlab',[0,0,-.10],
    [18.1,24.1,.2],0xa0aeb3,true);
  // Realistic internal usage: pallet racking, goods, loading and office.
  space('Área de almacenamiento logístico',[0,2,2.65],[16,18,5.3]);
  space('Área de expedición',[0,-9.2,2.35],[15,4.5,4.7]);
  for(const x of [-5,0,5])for(const y of [-3,2,7]){
    for(const z of [1.0,2.35,3.7]){
      box('Bastidor estantería logística','IfcFurnishingElement',
        [x,y,z],[2.1,.09,.09],C.dark,false);
      box('Palé de mercancía','IfcTransportElement',
        [x,y,z+.25],[1.5,1.1,.40],C.crate,false);
    }
    for(const dx of [-1,1])box('Montante estantería','IfcFurnishingElement',
      [x+dx,y,2.15],[.09,.09,4.3],0x5d8193,false);
  }
  box('Cabina oficina técnica','IfcSpace',[6,8,1.5],[4,5,3],0xd1d4cb,false);
  box('Módulo oficina prefabricado','IfcBuildingElementProxy',[6,8,1.5],
    [4,5,3],0xb8c7ca,false);
  box('Ventana oficina','IfcWindow',[4,8,1.8],[.085,1.7,1.05],C.glass,false);
  box('Puerta oficina','IfcDoor',[6,5.5,1.05],[1.0,.12,2.1],0x8d7560,false);
  // Around the shed: compact parcel, access road, loading apron and planting.
  box('Terreno natural alrededor nave','IfcGeographicElement',
    [0,0,-.62],[46,54,.54],C.soil,false);
  box('Explanada logística y carretera acceso','IfcCovering',
    [0,-19,-.32],[24,13,.09],C.asphalt,false);
  box('Zona estacionamiento vehículos','IfcCovering',
    [15,1,-.32],[9,27,.08],0x858d8e,false);
  box('Muelle de carga','IfcRamp',[0,-13.65,-.12],[7,2.6,.36],0x9a9fa1,false);
  for(let k=0;k<6;k++)box('Marca aparcamiento industrial '+k,'IfcBuildingElementProxy',
    [11.25,-11+4*k,-.27],[6.7,.10,.018],0xdfdfcb,false);
  for(const [x,y] of [[-18,-18],[-18,18],[20,20]]){
    box('Vegetación exterior · tronco','IfcBuildingElementProxy',
      [x,y,.55],[.28,.28,1.25],0x735c49,false);
    box('Vegetación exterior · copa','IfcBuildingElementProxy',
      [x,y,1.85],[2.15,2.0,1.7],0x6c966c,false);
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
  combined.meta={name:ROOF_TEACHING.name,
    source:'Cálculo matricial 2D de cerchas/pórticos de acero',
    note:'DEAD y WIND_X resueltos por matriz de rigidez Euler-Bernoulli. Cinco pórticos XZ independientes: correas, arriostramientos longitudinales y cerramientos son geometría secundaria sin rigidez 3D. En lugar de deformadas estimadas se utilizan desplazamientos nodales y curvas de barras obtenidas del FEM. No usar para proyecto constructivo.',
    analysis:{method:'2D Euler-Bernoulli frame stiffness matrix',E_MPa:210000,
      roof_dead_kN_m2:ROOF_TEACHING.roofDead_kN_m2,
      wind_kN_m2:ROOF_TEACHING.wind_kN_m2,supports:'pilares de base empotrada',
      limits:'Independent planar trusses, no purlin bending or out-of-plane stability'}}
  return {parts,results:combined,spaces:parts.filter(x=>x.type==='space')};
}
export const industrialTeaching=define();
