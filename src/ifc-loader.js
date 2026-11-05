import * as THREE from 'three';
import * as WebIFC from 'web-ifc';

let api = null;
let openedModel = null;
export async function readIFC(file,onProgress=()=>{}) {
  if (file.size>300*1024*1024) throw new Error('El IFC supera 300 MB. Este prototipo está pensado para modelos pequeños o medianos.');
  if (!api) {
    api = new WebIFC.IfcAPI();
    api.SetWasmPath(new URL('wasm/', document.baseURI).href);
    await api.Init();
  }
  if (openedModel !== null) { api.CloseModel(openedModel); openedModel=null; }
  const data = new Uint8Array(await file.arrayBuffer());
  onProgress('Interpretando el archivo IFC…');
  const modelId = api.OpenModel(data);
  openedModel = modelId;
  const items = [];
  let count=0;
  try {
    api.StreamAllMeshes(modelId,(flatMesh,idx,total)=>{
      count++;
      if (count%150===0) onProgress(`Leyendo elementos IFC: ${count} de ${total}…`);
      let name=`IFC #${flatMesh.expressID}`;
      let guid='';
      let ifcType='';
      try {
        const p=api.GetLine(modelId,flatMesh.expressID);
        ifcType=api.GetNameFromTypeCode(p?.type)||'';
        name=p?.Name?.value || `${ifcType || 'IFC'} #${flatMesh.expressID}`;
        guid=p?.GlobalId?.value || '';
      } catch { /* some geometries are not IFC products */ }
      for(let k=0;k<flatMesh.geometries.size();k++){
        const pg=flatMesh.geometries.get(k);
        const wasmGeometry=api.GetGeometry(modelId,pg.geometryExpressID);
        const verts=api.GetVertexArray(wasmGeometry.GetVertexData(),wasmGeometry.GetVertexDataSize());
        const faces=api.GetIndexArray(wasmGeometry.GetIndexData(),wasmGeometry.GetIndexDataSize());
        const n=Math.floor(verts.length/6);
        if(!n || !faces.length) {wasmGeometry.delete?.();continue;}
        const pos=new Float32Array(n*3), normal=new Float32Array(n*3);
        for(let v=0;v<n;v++){
          pos[3*v]=verts[6*v]; pos[3*v+1]=verts[6*v+1]; pos[3*v+2]=verts[6*v+2];
          normal[3*v]=verts[6*v+3]; normal[3*v+1]=verts[6*v+4]; normal[3*v+2]=verts[6*v+5];
        }
        const g=new THREE.BufferGeometry();
        g.setAttribute('position',new THREE.BufferAttribute(pos,3));
        g.setAttribute('normal',new THREE.BufferAttribute(normal,3));
        g.setIndex(new THREE.BufferAttribute(new Uint32Array(faces),1));
        g.applyMatrix4(new THREE.Matrix4().fromArray(pg.flatTransformation));
        wasmGeometry.delete?.();
        const c=pg.color;
        const col=new THREE.Color(Math.max(0,Math.min(1,c?.x??.71)),Math.max(0,Math.min(1,c?.y??.78)),Math.max(0,Math.min(1,c?.z??.84)));
        items.push({geometry:g,name,guid,ifcType,expressId:flatMesh.expressID,color:col});
      }
    });
  } catch(e){ for(const it of items)it.geometry.dispose(); throw e; }
  if(!items.length)throw new Error('El IFC no contiene geometría renderizable.');
  return {items,modelId,elementCount:count};
}
