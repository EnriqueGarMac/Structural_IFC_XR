// Adapter for richer SAP2000 Excel exports (schema imis.sap2000.xr/1).
// Keeps legacy JSON compatibility; coordinates use global SAP XYZ, Z up.
export function unpackRichSAP(input) {
  if (!input || input.schema !== 'imis.sap2000.xr/1') return input;
  // Two valid versions share this schema identifier:
  // - flat, with arrays nodes/frames/loads/cases and richer forces/modes;
  // - nested, with geometry/loads/results objects.
  // Preserve the flat variant rather than misreading loads as an object.
  if (Array.isArray(input.nodes) && Array.isArray(input.frames) &&
      Array.isArray(input.loads) && Array.isArray(input.cases)) return input;
  const g=input.geometry, r=input.results, l=input.loads;
  if (!g?.joints || !g?.frames || !r) throw Error('SAP XR incompleto: faltan geometry o results.');
  const vec=(v,label)=>{
    if(!Array.isArray(v)||v.length!==3||v.some(x=>!Number.isFinite(Number(x))))
      throw Error('Vector no válido: '+label);
    return v.map(Number);
  };
  const nodes=Object.entries(g.joints).map(([id,j])=>{
    const [x,y,z]=vec(j.xyz_m,'nudo '+id);
    return {id,x,y,z,restrained_dof:j.restrained_dof??[]};
  });
  const ids=new Set(nodes.map(n=>n.id));
  const frames=Object.entries(g.frames).map(([id,f])=>({
    id,i:String(f.joint_i),j:String(f.joint_j),
    section:f.section,material:f.material,local_axes:f.local_axes,length_m:f.length_m
  }));
  for(const f of frames)if(!ids.has(f.i)||!ids.has(f.j))
    throw Error('Barra '+f.id+': referencia de nudo inexistente.');
  const loads=[];
  // The weight vector is a distributed GLOBAL load. Never rotate it as a local force.
  for(const q of l?.self_weight??[]){
    const comps=vec(q.q_global_kN_per_m,'peso propio '+q.frame);
    comps.forEach((w,k)=>{
      if(Math.abs(w)>1e-14)loads.push({
        frame:String(q.frame),pattern:String(q.load_pattern),type:'force_per_length',
        csys:'Global',dir:k+4,start:0,end:1,w1:w,w2:w
      });
    });
  }
  // Preserve explicit distributed loads only when already unambiguously resolved
  // to global components; avoid inventing directions for unresolved SAP assignments.
  for(const q of l?.frame_distributed??[]){
    if(q.csys==='Global' && [4,5,6].includes(Number(q.dir)) &&
       Number.isFinite(q.w1_kN_per_m)&&Number.isFinite(q.w2_kN_per_m)){
      loads.push({frame:String(q.frame),pattern:String(q.pattern),
        type:'force_per_length',csys:'Global',dir:Number(q.dir),
        start:Number(q.start??0),end:Number(q.end??1),
        w1:q.w1_kN_per_m,w2:q.w2_kN_per_m});
    }
  }
  const cases=Object.entries(r.joint_displacements??{}).map(([name,rows])=>({
    name,displacements:Object.entries(rows).map(([node,d])=>{
      const [ux,uy,uz]=vec(d.translation_m,'desplazamiento '+name+'/'+node);
      return {node,ux,uy,uz};
    })
  }));
  const modes=(r.modes??[]).map(m=>({
    number:m.number,case:m.case,frequency_hz:m.frequency_hz,
    period_s:m.period_s,jointShape:m.normalized_shape??{},
    frameCurves:m.frame_curve_normalized??{},normalization:m.normalization
  }));
  return {
    meta:{source:'SAP2000 Excel',units:'m, kN',schema:input.schema,
      name:input.source?.workbook??'Modelo SAP2000',
      note:(input.warnings??[]).join(' ')},
    nodes,frames,loads,cases,modes,
    forces:r.frame_forces??{},sections:g.sections??{},frameCurves:r.frame_curves_m??{}
  };
}
