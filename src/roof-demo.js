import {normalizeResults} from './results.mjs';
import {industrialTeaching,ROOF_TEACHING} from './industrial-teaching-model.mjs';
import {geometryFromParts} from './educational-geometry.js';

// True stiffness-matrix results from five independent truss/portal XZ planes;
// not the previous hand-painted synthetic deflection fields.
export const ROOF_DEMO=ROOF_TEACHING;
export const roofDemoGeometry=()=>geometryFromParts(industrialTeaching.parts);
export const roofDemoResults=normalizeResults(industrialTeaching.results);
export function roofDemoStats(){
  const pieces=industrialTeaching.parts.filter(p=>p.type!=='space').length;
  return {pieces,nodes:roofDemoResults.nodes.length,
    frames:roofDemoResults.frames.length,
    loads:roofDemoResults.loads.length,cases:roofDemoResults.cases.length};
}
export {industrialTeaching};
