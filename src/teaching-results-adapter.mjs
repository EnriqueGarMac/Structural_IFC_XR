// Map educational pin-jointed results into the same structural-result
// contract consumed by SAPVisuals and ReactionVisuals. This is only an
// interoperability layer; it does not replace the educational solvers.
export const TEACHING_CASE='DOCENTE';
const valid=value=>Number.isFinite(Number(value));
const vec=(n,scale)=>({id:String(n.id),x:n.x*scale,y:0,z:n.z*scale,
  restrained_dof:[Boolean(n.fixX),false,Boolean(n.fixZ),false,false,false]});
export function teachingResultsToViewer(kind,result,experience){
  if(!result||!experience||!['truss','bridge'].includes(kind))return null;
  const isBridge=kind==='bridge',span=experience.span_m||1.2;
  // The bridge visual model uses BASE=1.2 irrespective of its real span.
  // All forces, reactions and distances must use the same displayed frame.
  const scale=isBridge?1.2/span:1;
  const modelNodes=isBridge?result.nodes:experience.model.nodes;
  const analysisBars=isBridge?result.members:result.bars;
  const modelBars=isBridge?experience.members:experience.model.bars;
  const nodeById=new Map(modelNodes.map(n=>[n.id,n]));
  const participating=new Set(modelBars.flatMap(m=>[m.i,m.j]));
  for(const r of result.reactions??[])participating.add(r.nodeId);
  const nodes=modelNodes.filter(n=>participating.has(n.id)).map(n=>vec(n,scale));
  const nodeIds=new Set(nodes.map(n=>n.id));
  const frames=modelBars.filter(b=>nodeIds.has(b.i)&&nodeIds.has(b.j))
    .map(b=>{
      const a=nodeById.get(b.i),c=nodeById.get(b.j);
      const dx=c.x-a.x,dz=c.z-a.z,L=Math.hypot(dx,dz)*scale;
      const len=Math.max(1e-9,L);
      // Local 2 is in the 2D XZ plane, so the main diagram engine draws
      // axial diagrams in the structural plane (not edge-on in 3D).
      return {id:String(b.id),i:String(b.i),j:String(b.j),length_m:len,
        section:b.sectionId??'steel',
        local_axes:{basis_global:[[dx/len,0,dz/len],
          [-dz/len,0,dx/len],[0,-1,0]]}};
    });
  const analysisById=new Map(analysisBars.map(b=>[String(b.id),b]));
  const forces={};
  for(const frame of frames){
    const b=analysisById.get(frame.id);
    if(!b||b.pending)continue;
    const axial=valid(b.axial_kN)?Number(b.axial_kN):0;
    const row=(station,P_kN,V2_kN=0,M3_kNm=0)=>({
      station_m:station,P_kN,V2_kN,V3_kN:0,T_kNm:0,M2_kNm:0,M3_kNm
    });
    const bending=isBridge&&result.bending?.memberId===frame.id?
      result.bending:null;
    const L=frame.length_m;
    const stations=[row(0,axial),row(L,axial)];
    if(bending){
      const P=bending.load_kN,t=bending.t,at=L*t;
      // Simply-supported member carrying a transverse mid-member load:
      // M(0)=M(L)=0 and M(a)=P*a*(L-a)/L.
      // The shear has a true jump at a, represented by duplicate stations.
      const left=P*(1-t),right=-P*t,moment=P*L*t*(1-t);
      stations.splice(0,stations.length,
        row(0,axial,left,0),row(at,axial,left,moment),
        row(at,axial,right,moment),row(L,axial,right,0));
    }
    forces[frame.id]=stations;
  }
  const jointReactions={};
  for(const r of result.reactions??[]){
    if(!nodeIds.has(String(r.nodeId)))continue;
    jointReactions[String(r.nodeId)]={
      force_kN:[r.rx_kN??0,0,r.rz_kN??0],
      moment_kNm:[0,0,0]
    };
  }
  const displacements=(result.displacements??[])
    .filter(d=>nodeIds.has(String(d.nodeId)))
    .map(d=>({node:String(d.nodeId),ux:(d.ux_m??0)*scale,uy:0,
      uz:(d.uz_m??0)*scale}));
  return {nodes,frames,areas:[],loads:[],pointLoads:[],
    cases:[{name:TEACHING_CASE,displacements}],
    forces:{[TEACHING_CASE]:forces},
    jointReactions:{[TEACHING_CASE]:jointReactions},
    sections:{},modes:[],bucklingModes:[],frameCurves:{},
    meta:{source:'educational',kind,units:'m, kN',
      note:'Barra articulada: N constante. Cortante/momento solo disponibles en el tramo de carga transversal calculada.'}
  };
}
