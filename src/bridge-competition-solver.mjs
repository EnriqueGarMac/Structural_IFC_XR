import {solveTruss2D} from './truss-solver.mjs';

// Teaching bridge competition: 2D, pin-jointed, tension-only cables.
// Units kN / m / MPa. Values are illustrative design parameters, not code
// verification nor an engineering certification of real bridge safety.
export const BRIDGE_SECTIONS={
  // Educational sizes: 75 / 550 / 50 mm². The light bar reaches
  // axial yield at substantially smaller loads than the reinforced one.
  // Keep a representative section inertia for the optional simplified
  // bending check, scaled consistently with the smaller area.
  bar_m:{label:'Barra · ligera',kind:'bar',A_m2:.000075,I_m4:2.34375e-9,fy_MPa:235,E_kN_m2:210e6,density_kg_m3:7850},
  bar_l:{label:'Barra · reforzada',kind:'bar',A_m2:.00055,I_m4:1.5e-7,fy_MPa:235,E_kN_m2:210e6,density_kg_m3:7850},
  tie_m:{label:'Tirante · solo tracción',kind:'tie',A_m2:.00005,I_m4:0,fy_MPa:500,E_kN_m2:190e6,density_kg_m3:7850}
};
export const BRIDGE_DEFAULTS={span_m:1.2,centralLoad_kN:3,
  deflectionLimit:250,maxIterations:16};
export function bridgeGrid(span=BRIDGE_DEFAULTS.span_m){
  if(!Number.isFinite(span)||span<.3||span>3)throw Error('Vano fuera de rango (0,30 a 3,00 m).');
  // Keep the existing B/T identifiers for old exercises and saved designs,
  // then add a fine 9 x 5 lattice for more elaborate bridge geometries.
  const xs=[0,.25,.5,.75,1].map(f=>f*span);
  const canonical=[
    ...xs.map((x,i)=>({id:'B'+i,x,z:0,
      // Two fixed-position pin joints (UX=UZ=0). The ideal truss does not
      // transmit rotational moments, so these are not beam encastrements.
      fixX:i===0||i===4,fixZ:i===0||i===4})),
    ...xs.slice(1,-1).map((x,i)=>({id:'T'+(i+1),x,z:span*.28}))
  ];
  const fine=[];
  for(let row=0;row<=4;row++)for(let col=0;col<=8;col++){
    const x=span*col/8,z=span*.28*row/4;
    if(canonical.some(n=>Math.abs(n.x-x)<1e-9&&Math.abs(n.z-z)<1e-9))continue;
    fine.push({id:'G'+row+'_'+col,x,z,fixX:false,fixZ:false});
  }
  return [...canonical,...fine];
}
export function bridgeMemberKey(i,j){
  if(i===j)throw Error('Una barra necesita dos nodos distintos.');
  return [i,j].sort().join('|');
}
// A node with just two straight, same-section members does not need to
// introduce a spurious pin-joint mechanism. Collapse that construction
// point into a continuous member; protect the loaded point and supports.
export function mergeCollinearBridgeMembers(members,nodes){
  const points=new Map(nodes.map(n=>[n.id,n]));
  const result=members.map(m=>({...m}));
  for(let pass=0;pass<=members.length;pass++){
    const touching=new Map(nodes.map(n=>[n.id,[]]));
    for(const m of result){
      touching.get(m.i)?.push(m);
      touching.get(m.j)?.push(m);
    }
    let changed=false;
    for(const n of nodes){
      if(n.fixX||n.fixZ||n.id==='B2')continue;
      const bars=touching.get(n.id);
      if(bars?.length!==2)continue;
      const [first,second]=bars;
      if(first.sectionId!==second.sectionId)continue;
      const a=points.get(first.i===n.id?first.j:first.i);
      const b=points.get(second.i===n.id?second.j:second.i);
      if(!a||!b||a.id===b.id)continue;
      const ux=a.x-n.x,uz=a.z-n.z,vx=b.x-n.x,vz=b.z-n.z;
      const L1=Math.hypot(ux,uz),L2=Math.hypot(vx,vz);
      if(L1<1e-8||L2<1e-8)continue;
      // Straight, opposite directions. Two different sections, a load
      // or a third connected member must remain separate.
      if(Math.abs(ux*vz-uz*vx)>1e-7*L1*L2||
         ux*vx+uz*vz>=0)continue;
      const firstAt=result.indexOf(first),secondAt=result.indexOf(second);
      result[firstAt]={...first,i:a.id,j:b.id};
      result.splice(secondAt,1);
      changed=true;
      break;
    }
    if(!changed)break;
  }
  return result;
}
function pointInsideBridgeMember(node,member,byId){
  if(node.id===member.i||node.id===member.j)return false;
  const a=byId.get(member.i),b=byId.get(member.j);
  const dx=b.x-a.x,dz=b.z-a.z,L2=dx*dx+dz*dz;
  if(L2<=1e-15)return false;
  const t=((node.x-a.x)*dx+(node.z-a.z)*dz)/L2;
  return t>1e-7&&t<1-1e-7&&
    Math.abs((node.x-a.x)*dz-(node.z-a.z)*dx)<=1e-7*L2;
}
export function addBridgeMember(members,nodes,i,j,sectionId){
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const section=BRIDGE_SECTIONS[sectionId];
  if(!byId.has(i)||!byId.has(j)||!section)
    throw Error('Nodos o sección no válidos.');
  const key=bridgeMemberKey(i,j);
  if(members.some(m=>bridgeMemberKey(m.i,m.j)===key))
    throw Error('Ya existe un elemento entre esos nodos.');
  const expanded=members.map(m=>({...m}));
  if(expanded.length>=60)throw Error('Límite docente de 60 elementos.');
  let number=1;
  while(expanded.some(m=>m.id==='M'+number))number++;
  expanded.push({id:'M'+number,i,j,sectionId});
  // An unconnected construction leaf must NOT break an existing bar
  // into two collinear pin-ended pieces. Do so only once the branch
  // actually links to the loaded node or either support without using
  // the bar it is attempting to split.
  const protectedIds=new Set(nodes.filter(n=>n.fixX||n.fixZ||
    n.id==='B2').map(n=>n.id));
  let changed=true;
  while(changed){
    changed=false;
    for(let k=0;k<expanded.length;k++){
      const host=expanded[k];
      const candidates=new Set(expanded.filter(m=>m!==host)
        .flatMap(m=>[m.i,m.j]));
      let splitId=null;
      for(const id of candidates){
        const node=byId.get(id);
        if(!pointInsideBridgeMember(node,host,byId))continue;
        const visited=new Set([id]),queue=[id];
        for(const v of queue){
          for(const m of expanded){
            if(m===host)continue;
            const w=m.i===v?m.j:m.j===v?m.i:null;
            if(w!==null&&!visited.has(w)){visited.add(w);queue.push(w);}
          }
        }
        if([...visited].some(v=>v!==id&&protectedIds.has(v))){
          splitId=id;break;
        }
      }
      if(!splitId)continue;
      const used=new Set(expanded.map(m=>m.id));
      let idNum=1;while(used.has('M'+idNum))idNum++;
      expanded.splice(k,1,{...host,j:splitId},
        {...host,id:'M'+idNum,i:splitId});
      changed=true;break;
    }
  }
  return mergeCollinearBridgeMembers(expanded,nodes);
}
export function bridgeSampleMembers(){
  const edges=[
    ['B0','B1','bar_m'],['B1','B2','bar_m'],['B2','B3','bar_m'],['B3','B4','bar_m'],
    ['T1','T2','bar_m'],['T2','T3','bar_m'],
    ['B0','T1','bar_m'],['T1','B1','bar_m'],['B1','T2','bar_m'],
    ['T2','B2','bar_m'],['B2','T3','bar_m'],['T3','B3','bar_m'],
    ['T3','B4','bar_m']
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
  const centreNode=nodes.find(n=>n.id==='B2');
  const centre=nodal.get('B2');
  const activeMembers=all.filter(m=>active.has(m.id));
  const connectedToCentre=activeMembers.some(m=>m.i==='B2'||m.j==='B2');
  let loadTransfer=null;
  if(!connectedToCentre&&load_kN>0){
    // A load on the interior of a continuous member cannot be treated as
    // an unsupported free truss node. Transfer its vertical resultant to
    // the end joints AND later verify bending of the loaded member.
    const byId=new Map(nodes.map(n=>[n.id,n]));
    const candidates=activeMembers.filter(m=>{
      if(m.kind!=='bar')return false; // cables cannot resist transverse load
      const a=byId.get(m.i),b=byId.get(m.j);
      const dx=b.x-a.x,dz=b.z-a.z,L2=dx*dx+dz*dz;
      const t=((centreNode.x-a.x)*dx+(centreNode.z-a.z)*dz)/L2;
      const offset=Math.abs((centreNode.x-a.x)*dz-(centreNode.z-a.z)*dx)/
        Math.sqrt(L2);
      return t>1e-6&&t<1-1e-6&&offset<1e-6;
    }).sort((a,b)=>a.L-b.L);
    const m=candidates[0];
    if(m){
      const a=byId.get(m.i),b=byId.get(m.j);
      const t=((centreNode.x-a.x)*(b.x-a.x)+
        (centreNode.z-a.z)*(b.z-a.z))/(m.L*m.L);
      loadTransfer={memberId:m.id,i:m.i,j:m.j,t,length_m:m.L,
        load_kN,sectionId:m.sectionId};
      nodal.get(m.i).fz_kN-=load_kN*(1-t);
      nodal.get(m.j).fz_kN-=load_kN*t;
    }else centre.fz_kN-=load_kN;
  }else centre.fz_kN-=load_kN;
  // Only member-connected components that carry load or touch a support
  // enter the stiffness matrix. Decorative or unfinished isolated branches
  // must not produce zero-energy DOFs or false collapses.
  let edges=all.filter(m=>active.has(m.id));
  const protectedNodes=new Set(nodes.filter(n=>n.fixX||n.fixZ||
    (n.id==='B2'&&!loadTransfer)).map(n=>n.id));
  // During construction, an unfinished leaf bar at an otherwise unloaded
  // node is a pending member, not evidence that the completed bridge fails.
  // Peel those loose ends recursively until they are braced. The central
  // load node and supports are never pruned, so genuine mechanisms remain.
  for(let pass=0;pass<nodes.length;pass++){
    const degree=new Map(nodes.map(n=>[n.id,0]));
    for(const m of edges){
      degree.set(m.i,degree.get(m.i)+1);
      degree.set(m.j,degree.get(m.j)+1);
    }
    const pending=new Set(nodes.filter(n=>!protectedNodes.has(n.id)&&
      degree.get(n.id)===1).map(n=>n.id));
    if(!pending.size)break;
    edges=edges.filter(m=>!pending.has(m.i)&&!pending.has(m.j));
  }
  const adjacency=new Map(nodes.map(n=>[n.id,[]]));
  for(const m of edges){
    adjacency.get(m.i).push(m.j);adjacency.get(m.j).push(m.i);
  }
  const supportIds=new Set(nodes.filter(n=>n.fixX||n.fixZ).map(n=>n.id));
  const loadIds=new Set(nodes.filter(n=>
    Math.abs(nodal.get(n.id).fx_kN)+Math.abs(nodal.get(n.id).fz_kN)>1e-9)
    .map(n=>n.id));
  const retained=new Set();
  const inspected=new Set();
  for(const node of nodes){
    if(inspected.has(node.id)||!adjacency.get(node.id).length)continue;
    const group=[],queue=[node.id];inspected.add(node.id);
    for(const current of queue){
      group.push(current);
      for(const next of adjacency.get(current))if(!inspected.has(next)){
        inspected.add(next);queue.push(next);
      }
    }
    // Unsupported components in an unfinished design are not yet part of
    // the load-bearing structure; do not let their dead load create a
    // spurious mechanism before the student connects them to the supports.
    if(group.some(id=>supportIds.has(id)))group.forEach(id=>retained.add(id));
  }
  if([...loadIds].some(id=>!retained.has(id)))
    throw Error('La carga central no dispone de camino hasta los apoyos.');
  for(const m of all){
    if(!retained.has(m.i)||!retained.has(m.j))continue;
    const dead=m.mass_kg*9.81/1000;
    nodal.get(m.i).fz_kN-=dead/2;
    nodal.get(m.j).fz_kN-=dead/2;
  }
  const model={
    nodes:nodes.filter(n=>retained.has(n.id)),
    bars:edges.filter(m=>retained.has(m.i)&&retained.has(m.j))
      .map(m=>({id:m.id,i:m.i,j:m.j,E_kN_m2:m.E_kN_m2,A_m2:m.A_m2}))
  };
  if(!model.bars.length)throw Error('Sin barras que transmitan cargas a los apoyos.');
  const solved=solveTruss2D(model,[...nodal.values()]
    .filter(n=>retained.has(n.nodeId)));
  const solvedIds=new Set(model.bars.map(m=>m.id));
  solved.pendingMemberIds=all.filter(m=>!solvedIds.has(m.id)).map(m=>m.id);
  solved.loadTransfer=loadTransfer;
  return solved;
}
function midMemberBending(transfer,m,displacements){
  if(!transfer||m?.id!==transfer.memberId)return null;
  const section=BRIDGE_SECTIONS[m.sectionId],L=transfer.length_m;
  const t=transfer.t,a=L*t,b=L*(1-t),P=transfer.load_kN;
  const moment_kNm=P*a*b/L;
  const radius_m=Math.sqrt(section.A_m2/Math.PI);
  const stress_MPa=section.I_m4>0?
    moment_kNm*radius_m/(section.I_m4*1000):Infinity;
  const localDeflection_mm=section.I_m4>0?
    P*a*a*b*b/(3*section.E_kN_m2*section.I_m4*L)*1000:Infinity;
  const byU=new Map(displacements.map(d=>[d.nodeId,d]));
  const verticalAtLoad_m=(byU.get(transfer.i)?.uz_m??0)*(1-t)+
    (byU.get(transfer.j)?.uz_m??0)*t-localDeflection_mm/1000;
  return {...transfer,moment_kNm,stress_MPa,localDeflection_mm,
    verticalAtLoad_mm:verticalAtLoad_m*1000,
    utilization:(Math.abs(m.axial_kN)/(1000*section.A_m2)+stress_MPa)/
      section.fy_MPa};
}
function extension(nodes,displacements,m){
  const byNode=new Map(nodes.map(n=>[n.id,n]));
  const byU=new Map(displacements.map(d=>[d.nodeId,d]));
  const a=byNode.get(m.i),b=byNode.get(m.j);
  const dx=(b.x-a.x)/m.L,dz=(b.z-a.z)/m.L;
  const ua=byU.get(m.i),ub=byU.get(m.j);
  if(!ua||!ub)return 0;
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
    // This teaching exercise does not study buckling yet. Both tensile
    // and compressive bars are checked ONLY against axial yield; cables
    // remain tension-only and do not carry compression.
    const compressionCapacity=m.kind==='bar'?yieldCapacity:0;
    const capacity=axial>=0?yieldCapacity:compressionCapacity;
    const utilization=activeState&&Math.abs(axial)>1e-8?
      Math.abs(axial)/Math.max(capacity,1e-12):0;
    return {...m,axial_kN:axial,stress_MPa:axial/(1000*m.A_m2),
      strain:axial/(m.E_kN_m2*m.A_m2),extension_mm:axial*m.L/
        (m.E_kN_m2*m.A_m2)*1000,
      tensionCapacity_kN:yieldCapacity,compressionCapacity_kN:compressionCapacity,
      utilization,slack:m.kind==='tie'&&!activeState,
      pending:activeState&&!b};
  });
}
// A documented, immutable result snapshot for the selected surviving
// equilibrium after a member-loss event. The mechanism state has no
// calculable static displacements/stresses and is represented by null.
export function bridgeStageResult(result,stage){
  if(!result||!stage||stage.status==='mechanism')return null;
  const current=new Map(stage.members.map(m=>[m.id,m]));
  const members=result.members.map(member=>{
    const update=current.get(member.id);
    if(!update||!update.active||update.pending||update.slack)return {
      ...member,axial_kN:0,stress_MPa:0,strain:0,utilization:0,
      pending:true,active:false
    };
    return {...member,...update,pending:false};
  });
  const displacements=stage.displacements.map(d=>({
    ...d,magnitude_m:Math.hypot(d.ux_m??0,d.uz_m??0)
  }));
  return {...result,members,displacements,
    reactions:stage.reactions.map(r=>({...r})),
    maxUtilization:stage.maxUtilization,
    maxDeflection_mm:Math.max(0,...displacements.map(d=>
      Math.abs(d.uz_m??0)*1000)),
    bending:stage.step===0?result.bending:null,
    stageIndex:stage.step,stageStatus:stage.status};
}
export function calculateBridge({span_m=1.2,load_kN=3,members=[],progressive=true}={}){
  if(!Number.isFinite(load_kN)||load_kN<0||load_kN>50)
    throw Error('Carga central fuera de rango (0 a 50 kN).');
  const nodes=bridgeGrid(span_m),all=physical(nodes,members);
  const totalMass_kg=all.reduce((s,m)=>s+m.mass_kg,0);
  const active=new Set(members.map(m=>m.id));
  const failures=[],slackIds=new Set(),visited=new Set(),stages=[];
  let original=null,raw=null,memberResults=null;
  let status='stable',reason='Estructura resistente';
  for(let iteration=0;iteration<BRIDGE_DEFAULTS.maxIterations;iteration++){
    let solved;
    try{solved=analysis(nodes,members,load_kN,active);}
    catch(error){
      status='collapse';
      reason=failures.length?
        ('Tras el fallo de '+failures.map(f=>f.id+' ('+
          ({bending:'flexión',yield:'límite elástico'}[f.mode]||
            'resistencia')+')').join(', ')+
          ' se pierde el camino resistente de la estructura.'):
        (error.message.startsWith('La carga central')?error.message:
          'Mecanismo inestable o sin camino resistente entre los apoyos.');
      // No invertible stiffness system exists after the listed removals.
      // Record the terminal mechanism rather than fabricating further
      // member forces or claiming additional fractures.
      stages.push({step:stages.length,removed:failures.map(f=>f.id),
        status:'mechanism',reason,members:[],reactions:[],displacements:[]});
      if(!original)original=null;
      break;
    }
    raw=solved;
    const hash=[...active].sort().join('|');
    if(visited.has(hash)){status='collapse';reason='No converge la redistribución de tirantes.';break;}
    visited.add(hash);
    const current=membersWithCapacities(all,raw,active,nodes);
    const loaded=raw.loadTransfer;
    if(loaded){
      const loadedMember=current.find(m=>m.id===loaded.memberId);
      const bending=midMemberBending(loaded,loadedMember,raw.displacements);
      if(bending){
        loadedMember.bendingMoment_kNm=bending.moment_kNm;
        loadedMember.bendingStress_MPa=bending.stress_MPa;
        loadedMember.bendingUtilization=bending.utilization;
        loadedMember.utilization=Math.max(loadedMember.utilization,bending.utilization);
        raw.bending=bending;
      }
    }
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
    const overloaded=current.filter(m=>active.has(m.id)&&m.utilization>1+1e-7)
      .sort((a,b)=>b.utilization-a.utilization);
    const critical=overloaded[0];
    // Exact structural symmetries produce equal utilization within solver
    // round-off. Remove all *equally critical* elements in one physical
    // event, instead of arbitrarily privileging whichever ID sorts first.
    // Do not force mirrored failures when geometries, sections or stresses
    // are genuinely different. The load redistribution happens afterwards.
    const simultaneous=critical?overloaded.filter(m=>
      Math.abs(m.utilization-critical.utilization)<=
        1e-6*Math.max(1,critical.utilization)) : [];
    const nextFailures=simultaneous.map(m=>({
      id:m.id,utilization:m.utilization,
      mode:m.bendingUtilization>1?'bending':'yield'
    }));
    // Each stable equilibrium state is a distinct recalculation following
    // member loss. The next fracture is selected from the UPDATED forces.
    stages.push({step:stages.length,removed:failures.map(f=>f.id),
      status:critical?'overloaded':'equilibrium',
      members:current.map(m=>({id:m.id,axial_kN:m.axial_kN,
        stress_MPa:m.stress_MPa,strain:m.strain,
        extension_mm:m.extension_mm,utilization:m.utilization,
        bendingUtilization:m.bendingUtilization??null,
        active:active.has(m.id),pending:m.pending,slack:m.slack})),
      reactions:raw.reactions.map(r=>({...r})),
      displacements:raw.displacements.map(d=>({...d})),
      maxUtilization:Math.max(0,...current.map(m=>m.utilization)),
      nextFailure:nextFailures[0]??null,nextFailures});
    if(critical){
      status='failure';
      reason=critical.bendingUtilization>1?
        'La carga actúa entre nudos de '+critical.id+
        ': la barra supera su resistencia a flexión. Refuerza la sección o triangula el punto cargado.':
        'La barra '+critical.id+' alcanza su límite elástico axial '+
          (critical.axial_kN<0?'en compresión.':'en tracción.');
      for(const member of simultaneous){
        const mode=member.bendingUtilization>1?'bending':'yield';
        failures.push({id:member.id,utilization:member.utilization,
          kind:member.kind,mode});
      }
      if(!progressive)break;
      simultaneous.forEach(member=>active.delete(member.id));
      continue;
    }
    if(failures.length){
      // A redundant structure can regain equilibrium after some members
      // fail. It still fails the challenge, but is not falsely called a
      // geometric collapse if its remaining members carry the load.
      status='failure';
      reason='Tras la pérdida de '+failures.length+
        ' elemento(s), la estructura restante recupera el equilibrio.';
    }
    break;
  }
  if(!raw){
    return {status:'collapse',reason,span_m,load_kN,loads:[],
      nodes,members:all.map(m=>({...m,utilization:0,axial_kN:0,
        stress_MPa:0,strain:0,slack:false})),
      broken:failures,slack:[...slackIds],stages,
      pending:members.map(m=>m.id),totalMass_kg,
      maxDeflection_mm:null,maxUtilization:null,reactions:[],displacements:[],
      equilibrium:null};
  }
  if(!memberResults)memberResults=membersWithCapacities(all,raw,active,nodes);
  const reference=original??{...raw,members:memberResults};
  const mid=reference.displacements.find(d=>d.nodeId==='B2');
  const bending=reference.bending??null;
  const maxDeflection_mm=Math.max(
    0,...reference.displacements.map(d=>Math.abs(d.uz_m)*1000),
    Math.abs(bending?.verticalAtLoad_mm??0));
  const maxUtilization=Math.max(0,...reference.members.map(m=>m.utilization));
  const serviceLimit_mm=span_m*1000/BRIDGE_DEFAULTS.deflectionLimit;
  if(status==='stable'&&maxDeflection_mm>serviceLimit_mm){
    status='service';
    reason='La pasarela no cumple la flecha de servicio L/'+BRIDGE_DEFAULTS.deflectionLimit+
      '. No implica rotura resistente.';
  }
  const resistant=status==='stable';
  return {status,resistant,reason,nodes,span_m,load_kN,totalMass_kg,
    serviceLimit_mm,midspanDeflection_mm:bending?.verticalAtLoad_mm??
      (mid?.uz_m*1000??0),
    maxDeflection_mm,maxUtilization,bending,
    members:reference.members,displacements:bending?
      [...reference.displacements.filter(d=>d.nodeId!=='B2'),{
        nodeId:'B2',
        ux_m:(reference.displacements.find(d=>d.nodeId===bending.i)?.ux_m??0)*
          (1-bending.t)+(reference.displacements.find(d=>d.nodeId===bending.j)?.ux_m??0)*
          bending.t,
        uz_m:bending.verticalAtLoad_mm/1000,
        magnitude_m:Math.hypot(
          (reference.displacements.find(d=>d.nodeId===bending.i)?.ux_m??0)*
            (1-bending.t)+(reference.displacements.find(d=>d.nodeId===bending.j)?.ux_m??0)*
            bending.t,
          bending.verticalAtLoad_mm/1000)
      }]:reference.displacements,
    reactions:reference.reactions,equilibrium:reference.equilibrium,
    broken:failures,slack:[...slackIds],stages,
    pending:reference.pendingMemberIds??[],
    postFailure:failures.length?{members:memberResults,displacements:raw.displacements}:null,
    meta:{solver:'2D axial stiffness, nonlinear active-set tension-only cables; simplified progressive member removal',
      assumptions:'Uniones articuladas, dos extremos con desplazamientos horizontal y vertical impedidos, límite elástico axial en tracción y compresión (sin comprobación de pandeo), peso propio y cargas nodales; carga entre nudos transferida estáticamente y flexión de barra simplemente apoyada comprobada por separado; sin interacción suelo ni dinámica real'}
  };
}
