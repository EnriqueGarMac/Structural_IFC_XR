// SAP2000 reactions are GLOBAL XYZ resultants at analysis joints.
// Retains force (kN) and moment (kN·m) independently. Never reconstructs them
// from the visible model, and never assumes a sign convention beyond SAP's.
const clean = (v,label)=>{
  if(!Array.isArray(v)||v.length!==3 || v.some(x=>x===null||x===undefined||!Number.isFinite(Number(x))))
    throw Error('Reacción SAP inválida en '+label+': se requieren tres componentes finitas.');
  return v.map(Number);
};
export function normalizeJointReactions(raw,nodes=[]){
  if(raw==null)return {};
  if(typeof raw!=='object'||Array.isArray(raw))
    throw Error('Las reacciones deben estar agrupadas por caso y nudo.');
  const ids=new Set(nodes.map(n=>String(n.id)));
  const output={};
  for(const [caseName,atJoints] of Object.entries(raw)){
    if(atJoints==null)continue;
    if(typeof atJoints!=='object'||Array.isArray(atJoints))
      throw Error('Reacciones de '+caseName+': se esperaba un objeto de nudos.');
    output[caseName]={};
    for(const [jointId,source] of Object.entries(atJoints)){
      if(!ids.has(String(jointId)))
        throw Error('Reacciones del caso '+caseName+': nudo inexistente '+jointId);
      if(!source||typeof source!=='object')throw Error('Reacción inválida en '+jointId);
      const force=clean(source.force_kN??source.force??[source.Fx_kN,source.Fy_kN,source.Fz_kN],
        caseName+'/nudo '+jointId+'/fuerza');
      const moment=clean(source.moment_kNm??source.moment??[source.Mx_kNm,source.My_kNm,source.Mz_kNm],
        caseName+'/nudo '+jointId+'/momento');
      output[caseName][String(jointId)]={force_kN:force,moment_kNm:moment};
    }
  }
  return output;
}
export function reactionSummary(reactions,caseName){
  const rows=Object.entries(reactions?.[caseName]??{}).map(([node,v])=>({node,...v}));
  const force=[0,0,0],moment=[0,0,0];
  for(const row of rows)for(let k=0;k<3;k++){
    force[k]+=row.force_kN[k];moment[k]+=row.moment_kNm[k];
  }
  return {rows,force,moment};
}
export function reactionComponents(reaction,tolerance=1e-10){
  const components=[];
  for(const [kind,unit,values] of [
    ['F','kN',reaction.force_kN],['M','kN·m',reaction.moment_kNm]
  ])for(let k=0;k<3;k++){
    const value=values[k];
    if(Math.abs(value)>tolerance)
      components.push({kind,axis:k,value,unit,label:kind+'xyz'[0]});
  }
  return components;
}
export function reactionText(reaction,decimals=3){
  const value=(x)=>Math.abs(x)<1e-10?'0':(x>0?'+':'')+x.toFixed(decimals);
  const f=reaction.force_kN,m=reaction.moment_kNm;
  const fmt=(key,values,unit)=>'  '+key+' = ('+values.map(value).join(', ')+') '+unit;
  return fmt('Fxyz',f,'kN')+'\n'+fmt('Mxyz',m,'kN·m');
}
