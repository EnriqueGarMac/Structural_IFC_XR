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
export function ifcElementOpacity({opacity=1,scope='envelope',ifcType,elementName='',structuralDeformation=false}={}){
  const alpha=Math.max(0,Math.min(1,Number.isFinite(Number(opacity))?Number(opacity):1));
  // Flooring should remain legible when making the envelope see-through.
  // Only the explicit "all" scope fades interior pavement finishes.
  const interiorFloor=/^Pavimento interior /i.test(elementName);
  const affected=normalizedScope(scope)==='all'||
    (!interiorFloor&&isEnvelopeElement(ifcType));
  const applied=affected?alpha:1;
  // Give window glazing a modest default transparency even if the general
  // IFC slider is at 0 % transparency. User-selected stronger transparency
  // still wins, and this never changes the underlying IFC file.
  const glass=String(ifcType??'').toUpperCase()==='IFCWINDOW';
  const visualOpacity=glass?Math.min(applied,.60):applied;
  return structuralDeformation?Math.min(visualOpacity,.16):visualOpacity;
}
export function nextXRIFCOpacity(opacity){
  const steps=[1,.75,.5,.25,.08];
  const current=Number(opacity);
  const nearest=steps.reduce((best,v,i)=>
    Math.abs(v-current)<Math.abs(steps[best]-current)?i:best,0);
  return steps[(nearest+1)%steps.length];
}
