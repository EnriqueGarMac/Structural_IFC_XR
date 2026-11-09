import {normalizeResults} from './results.mjs';
import {buildingTeaching,BUILDING} from './building-teaching-model.mjs';
import {geometryFromParts} from './educational-geometry.js';

// Three-storey teaching building: all structural displacements, internal
// forces, support reactions and deformed beam curves come from a matrix solver.
export const demoGeometry=()=>geometryFromParts(buildingTeaching.parts);
export const demoResults=normalizeResults(buildingTeaching.results);
export {BUILDING,buildingTeaching};
