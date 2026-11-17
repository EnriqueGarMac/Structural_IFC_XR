import {solveTruss2D} from './truss-solver.mjs';

// Teaching bridge competition: 2D, pin-jointed, tension-only cables.
// Units kN / m / MPa. Values are illustrative design parameters, not code
// verification nor an engineering certification of real bridge safety.
export const BRIDGE_SECTIONS={
  bar_s:{label:'Barra · ligera',kind:'bar',A_m2:.00030,I_m4:1.2e-8,fy_MPa:235,E_kN_m2:210e6,density_kg_m3:7850},
  bar_m:{label:'Barra · media',kind:'bar',A_m2:.00080,I_m4:8.2e-8,fy_MPa:235,E_kN_m2:210e6,density_kg_m3:7850},
  bar_l:{label:'Barra · robusta',kind:'bar',A_m2:.0018,I_m4:3.9e-7,fy_MPa:235,E_kN_m2:210e6,density_kg_m3:7850},
  tie_s:{label:'Tirante · fino',kind:'tie',A_m2:.00009,I_m4:0,fy_MPa:500,E_kN_m2:190e6,density_kg_m3:7850},
  tie_m:{label:'Tirante · medio',kind:'tie',A_m2:.00022,I_m4:0,fy_MPa:500,E_kN_m2:190e6,density_kg_m3:7850}
};
export const BRIDGE_DEFAULTS={span_m:1.2,centralLoad_kN:3,
  deflectionLimit:250,maxIterations:16};
export function bridgeGrid(span=BRIDGE_DEFAULTS.span_m){
  if(!Number.isFinite(span)||span<.3||span>3)throw Error('Vano fuera de rango (0,30 a 3,00 m).');
  const xs=[0,.25,.5,.75,1].map(x=>x*span);
  return [
    ...xs.map((x,i)=>({id:'B'+i,x,z:0,fixX:i===0,fixZ:i===0||i===4})),
    ...xs.slice(1,-1).map((x,i)=>({id:'T'+(i+1),x,z:span*.28}))
  ];
}
export function bridgeMemberKey(i,j){
  if(i===j)throw Error('Una barra necesita dos nodos distintos.');
  return [i,j].sort().join('|');
}
export function addBridgeMember(members,nodes,i,j,sectionId){
  const ids=new Set(nodes.map(n=>n.id)),section=BRIDGE_SECTIONS[sectionId];
  if(!ids.has(i)||!ids.has(j)||!section)throw Error('Nodos o sección no válidos.');
  const key=bridgeMemberKey(i,j);
  if(members.some(m=>bridgeMemberKey(m.i,m.j)===key))
    throw Error('Ya existe un elemento entre esos nodos.');
  if(members.length>=60)throw Error('Límite docente de 60 elementos.');
  return [...members,{id:'M'+String(Date.now()).slice(-8)+'_'+members.length,i,j,sectionId}];
}
export function bridgeSampleMembers(){
  const edges=[
    ['B0','B1','bar_m'],['B1','B2','bar_m'],['B2','B3','bar_m'],['B3','B4','bar_m'],
    ['T1','T2','bar_s'],['T2','T3','bar_s'],
    ['B0','T1','bar_m'],['T1','B1','bar_s'],['B1','T2','bar_s'],
    ['T2','B2','bar_s'],['B2','T3','bar_s'],['T3','B3','bar_s'],
    ['B3','T3','bar_m'],['T3','B4','bar_m']
  ];
  return edges.map(([i,j,sectionId],k)=>({id:'M'+(k+1),i,j,sectionId}));
}
function physical(model,members){
  const nodeMap=new Map(model.map(n=>[n.id,n]));
  return members.map(m=>{
    const section=BRIDGE_SECTIONS[m.sectionId];
    if(!section)throw Error('Sección no válida: '+m.sectionId);
    const a=nodeMap.get(m.i),b=nodeMap.get(m.j);
    if(!a||!b||a===b)throw Error('Barra con nudos no válidos.');
    const L=Math.hypot(b.x-a.x,b.z-a.z);
    if(L<1e-8)throw Error('Barra de longitud nula.');
    return {...m,L,...section,mass_kg:section.density_kg_m3*section.A_m2*L};
  });
}
function analysis(nodes,members,load_kN,active){
  const all=physical(nodes,members);
  const nodal=new Map(nodes.map(n=>[n.id,{nodeId:n.id,fx_kN:0,fz_kN:0}]));
  const centre=nodal.get('B2');
  centre.fz_kN-=load_kN;
  for(const m of all){
    const dead=m.mass_kg*9.81/1000;
    nodal.get(m.i).fz_kN-=dead/2;
    nodal.get(m.j).fz_kN-=dead/2;
  }
  const model={nodes,bars:all.filter(m=>active.has(m.id)).map(m=>({
    id:m.id,i:m.i,j:m.j,E_kN_m2:m.E_kN_m2,A_m2:m.A_m2
  }))};
  if(!model.bars.length)throw Error('Sin barras que transmitan cargas a los apoyos.');
  return solveTruss2D(model,[...nodal.values()]);
}
function extension(nodes,displacements,m){
  const byNode=new Map(nodes.map(n=>[n.id,n]));
  const byU=new Map(displacements.map(d=>[d.nodeId,d]));
  const a=byNode.get(m.i),b=byNode.get(m.j);
  const dx=(b.x-a.x)/m.L,dz=(b.z-a.z)/m.L;
  const ua=byU.get(m.i),ub=byU.get(m.j);
  return (ub.ux_m-ua.ux_m)*dx+(ub.uz_m-ua.uz_m)*dz;
}
function membersWithCapacities(all,raw,active,nodes){
  const computed=new Map(raw.bars.map(b=>[b.id,b]));
  return all.map(m=>{
    const b=computed.get(m.id);
    const elasticAxial=b?.axial_kN??m.E_kN_m2*m.A_m2/m.L*
      extension(nodes,raw.displacements,m);
    const activeState=active.has(m.id);
    const axial=activeState?elasticAxial:0;
    const yieldCapacity=m.fy_MPa*1000*m.A_m2;
    const compressionCapacity=m.kind==='bar'?
      Math.min(yieldCapacity,Math.PI**2*m.E_kN_m2*m.I_m4/m.L**2):0;
    const capacity=axial>=0?yieldCapacity:compressionCapacity;
    const utilization=activeState&&Math.abs(axial)>1e-8?
      Math.abs(axial)/Math.max(capacity,1e-12):0;
    return {...m,axial_kN:axial,stress_MPa:axial/(1000*m.A_m2),
      strain:axial/(m.E_kN_m2*m.A_m2),extension_mm:axial*m.L/
        (m.E_kN_m2*m.A_m2)*1000,
      tensionCapacity_kN:yieldCapacity,compressionCapacity_kN:compressionCapacity,
      utilization,slack:m.kind==='tie'&&!activeState};
  });
}
export function calculateBridge({span_m=1.2,load_kN=3,members=[],progressive=true}={}){
  if(!Number.isFinite(load_kN)||load_kN<0||load_kN>50)
    throw Error('Carga central fuera de rango (0 a 50 kN).');
  const nodes=bridgeGrid(span_m),all=physical(nodes,members);
  const totalMass_kg=all.reduce((s,m)=>s+m.mass_kg,0);
  const active=new Set(members.map(m=>m.id));
  const failures=[],slackIds=new Set(),visited=new Set();
  let original=null,raw=null,memberResults=null;
  let status='stable',reason='Estructura resistente';
  for(let iteration=0;iteration<BRIDGE_DEFAULTS.maxIterations;iteration++){
    let solved;
    try{solved=analysis(nodes,members,load_kN,active);}
    catch(error){
      status='collapse';
      reason='Mecanismo inestable o sin camino resistente entre los apoyos.';
      if(!original)original=null;
      break;
    }
    raw=solved;
    const hash=[...active].sort().join('|');
    if(visited.has(hash)){status='collapse';reason='No converge la redistribución de tirantes.';break;}
    visited.add(hash);
    const current=membersWithCapacities(all,raw,active,nodes);
    // Tension-only: discard cables predicted in compression and repeat.
    const compressive=current.filter(m=>m.kind==='tie'&&active.has(m.id)
      &&m.axial_kN< -1e-6);
    if(compressive.length){
      compressive.forEach(m=>{active.delete(m.id);slackIds.add(m.id);});
      continue;
    }
    // Re-activate previously slack cables only if extension becomes positive.
    const reactivated=current.filter(m=>m.kind==='tie'&&!active.has(m.id)
      &&extension(nodes,raw.displacements,m)>1e-8);
    if(reactivated.length){
      reactivated.forEach(m=>{active.add(m.id);slackIds.delete(m.id);});
      continue;
    }
    memberResults=current;
    if(!original)original={...raw,members:current};
    const critical=current.filter(m=>m.utilization>1+1e-7)
      .sort((a,b)=>b.utilization-a.utilization)[0];
    if(critical){
      status='failure';
      reason='La barra '+critical.id+' supera su resistencia axial o a pandeo.';
      failures.push({id:critical.id,utilization:critical.utilization,
        kind:critical.kind});
      if(!progressive)break;
      active.delete(critical.id);
      continue;
    }
    if(failures.length){
      status='collapse';
      reason='Rotura progresiva de '+failures.length+' elemento(s).';
    }
    break;
  }
  if(!raw){
    return {status:'collapse',reason,span_m,load_kN,loads:[],
      nodes,members:all.map(m=>({...m,utilization:0,axial_kN:0,
        stress_MPa:0,strain:0,slack:false})),
      broken:failures,slack:[...slackIds],totalMass_kg,
      maxDeflection_mm:null,maxUtilization:null,reactions:[],displacements:[],
      equilibrium:null};
  }
  if(!memberResults)memberResults=membersWithCapacities(all,raw,active,nodes);
  const reference=original??{...raw,members:memberResults};
  const mid=reference.displacements.find(d=>d.nodeId==='B2');
  const maxDeflection_mm=Math.max(...reference.displacements.map(d=>Math.abs(d.uz_m)))*1000;
  const maxUtilization=Math.max(0,...reference.members.map(m=>m.utilization));
  const serviceLimit_mm=span_m*1000/BRIDGE_DEFAULTS.deflectionLimit;
  if(status==='stable'&&maxDeflection_mm>serviceLimit_mm){
    status='service';
    reason='La pasarela no cumple la flecha de servicio L/'+BRIDGE_DEFAULTS.deflectionLimit+
      '. No implica rotura resistente.';
  }
  const resistant=status==='stable';
  return {status,resistant,reason,nodes,span_m,load_kN,totalMass_kg,
    serviceLimit_mm,midspanDeflection_mm:mid?.uz_m*1000??0,
    maxDeflection_mm,maxUtilization,
    members:reference.members,displacements:reference.displacements,
    reactions:reference.reactions,equilibrium:reference.equilibrium,
    broken:failures,slack:[...slackIds],
    postFailure:failures.length?{members:memberResults,displacements:raw.displacements}:null,
    meta:{solver:'2D axial stiffness, nonlinear active-set tension-only cables; simplified progressive member removal',
      assumptions:'Uniones articuladas, barras con pandeo de Euler, cargas nodales y peso propio repartido; sin interacción suelo ni dinámica real'}
  };
}
