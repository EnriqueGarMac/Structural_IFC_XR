// Display-only filtering: preserve slabs/forjados, columns and beams.
const structuralTypes=new Set(['IFCSLAB','IFCCOLUMN','IFCBEAM','IFCWALL','IFCMEMBER','IFCPLATE',
  'IFCSTAIR','IFCSTAIRFLIGHT','IFCROOF','IFCRAMP','IFCRAMPFLIGHT']);
const terrainTypes=new Set(['IFCSITE','IFCGEOGRAPHICELEMENT','IFCFOOTING']);
export function isTerrainElement(piece={}) {
  const type=String(piece.ifcType||'').toUpperCase().replace(/[^A-Z]/g,'');
  if(structuralTypes.has(type))return false;
  if(terrainTypes.has(type))return true;
  const name=String(piece.name||'').toLowerCase();
  // Only remove presentation-like ground/foundation surfaces. Generic IFC
  // slabs are always preserved, even when named "floor" or "ground slab".
  if(/terreno|cimentaci[oó]n|explanada|topograf[ií]a|earthwork|terrain|ground plane|site surface|foundation mat|losa de cimentaci[oó]n/.test(name))return true;
  if(/^(suelo|ground|site)(?:\s|$)/.test(name))return true;
  return false;
}
export function displayModeVisibility({showSAPOnly=false,hideGround=true,showOriginal=true,
  showDeformed=true,hasCases=false,terrain=false}={}) {
  return {
    original:!showSAPOnly&&showOriginal&&! (hideGround&&terrain),
    deformed:!showSAPOnly&&hasCases&&showDeformed&&!(hideGround&&terrain),
    frames:true
  };
}
