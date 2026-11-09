import test from 'node:test';
import assert from 'node:assert/strict';
import * as WebIFC from 'web-ifc';
import {exportEducationalIFC} from '../src/ifc4-export.mjs';

test('open generated IFC4 file using the same web-ifc engine as the XR viewer',async()=>{
  const ifc=new WebIFC.IfcAPI();
  ifc.SetWasmPath(new URL('../node_modules/web-ifc/',import.meta.url).pathname);
  await ifc.Init();
  const content=exportEducationalIFC({name:'Test model IFC4',parts:[{
    type:'box',name:'Test column',ifcType:'IfcColumn',
    center:[1,2,1.5],size:[.3,.3,3],color:0xabcdd2,structural:true
  },{
    type:'box',name:'Test wall',ifcType:'IfcWall',
    center:[3,0,1],size:[2,.2,2],color:0xe1d5c0,structural:false
  }]});
  const model=ifc.OpenModel(new Uint8Array(Buffer.from(content.content,'utf8')));
  try{
    const cols=ifc.GetAllItemsOfType(model,WebIFC.IFCCOLUMN);
    const walls=ifc.GetAllItemsOfType(model,WebIFC.IFCWALL);
    assert.equal(cols.size(),1);
    assert.equal(walls.size(),1);
    let meshCount=0;
    ifc.StreamAllMeshes(model,()=>{meshCount++});
    assert.ok(meshCount>=2,'IFC parsed but BRep geometry not recognized');
  }finally{
    ifc.CloseModel(model);
  }
});
