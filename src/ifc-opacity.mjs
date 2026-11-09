// Visual-only opacity policy for imported IFC geometry and educational BIM.
// This does not alter the IFC4 geometry, element classifications or FEM results.
export const IFC_OPACITY_SCOPES=['envelope','all'];
const ENVELOPE_TYPES=new Set([
  'IFCWALL','IFCWINDOW','IFCDOOR','IFCROOF','IFCCOVERING','IFCSLAB'
]);
export function normalizedScope(scope){
  return IFC_OPACITY_SCOPES.includes(scope)?scope:'envelope';
}
export function isEnvelopeElement(type){
  return ENVELOPE_TYPES.has(String(type??'').replace(/[^a-zA-Z]/g,'').toUpperCase());
}
export function ifcElementOpacity({opacity=1,scope='envelope',ifcType,structuralDeformation=false}={}){
  const alpha=Math.max(0,Math.min(1,Number.isFinite(Number(opacity))?Number(opacity):1));
  const affected=normalizedScope(scope)==='all'||isEnvelopeElement(ifcType);
  const applied=affected?alpha:1;
  return structuralDeformation?Math.min(applied,.16):applied;
}
export function nextXRIFCOpacity(opacity){
  const steps=[1,.75,.5,.25,.08];
  const current=Number(opacity);
  const nearest=steps.reduce((best,v,i)=>
    Math.abs(v-current)<Math.abs(steps[best]-current)?i:best,0);
  return steps[(nearest+1)%steps.length];
}
