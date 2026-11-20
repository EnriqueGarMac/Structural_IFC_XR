// Non-mutating inventory of the actual scene graph. Counts renderable
// objects, not IFC products, and honours parent visibility.
const LAYERS=['originalGroup','deformedGroup','framesGroup','loadsGroup','supportGroup',
  'mobileSAPShadowGroup'];
export function xrSceneInventory(app){
  const out={};
  const collect=(root)=>{
    const result={meshes:0,lines:0,points:0,sprites:0,triangles:0,materials:0,geometries:0};
    if(!root)return result;
    const mats=new Set(),geoms=new Set();
    const walk=(node,visible)=>{
      const shown=visible&&node.visible;
      if(!shown)return;
      if(node.isMesh||node.isInstancedMesh)result.meshes++;
      else if(node.isLine||node.isLineSegments)result.lines++;
      else if(node.isPoints)result.points++;
      else if(node.isSprite)result.sprites++;
      if(node.geometry){
        geoms.add(node.geometry);
        const g=node.geometry;
        if(node.isMesh||node.isInstancedMesh){
          const n=g.index?.count??g.getAttribute('position')?.count??0;
          result.triangles+=Math.floor(n/3)*(node.isInstancedMesh?node.count:1);
        }
      }
      if(node.material)for(const m of Array.isArray(node.material)?node.material:[node.material])mats.add(m);
      for(const child of node.children)walk(child,shown);
    };
    walk(root,true);
    result.materials=mats.size;result.geometries=geoms.size;
    return result;
  };
  for(const name of LAYERS)out[name]=collect(app[name]);
  out.sapVisuals=collect(app.sapVisuals?.group);
  out.reactionVisuals=collect(app.reactionVisuals?.group);
  out.xrPanel=collect(app.xrControls?.panel);
  out.total=collect(app.scene);
  return out;
}
