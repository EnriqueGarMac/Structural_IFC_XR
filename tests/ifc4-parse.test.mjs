import test from 'node:test';
import assert from 'node:assert/strict';
import * as WebIFC from 'web-ifc';
import {exportEducationalIFC} from '../src/ifc4-export.mjs';
import {buildingTeaching} from '../src/building-teaching-model.mjs';
import {industrialTeaching} from '../src/industrial-teaching-model.mjs';

test('open generated IFC4 file using the same web-ifc engine as the XR viewer',async()=>{
  const ifc=new WebIFC.IfcAPI();

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
    const cols=ifc.GetLineIDsWithType(model,WebIFC.IFCCOLUMN);
    const walls=ifc.GetLineIDsWithType(model,WebIFC.IFCWALL);
    assert.equal(cols.size(),1);
    assert.equal(walls.size(),1);
    let meshCount=0;
    ifc.StreamAllMeshes(model,()=>{meshCount++});
    assert.ok(meshCount>=2,'IFC parsed but BRep geometry not recognized');
  }finally{
    ifc.CloseModel(model);
  }
});

test('roundtrip IFC4 multi-storey building and industrial hall into WebIFC',async()=>{
  const api=new WebIFC.IfcAPI();
  await api.Init();
  for(const [model,levels] of [[buildingTeaching,[0,3.2,6.4,9.6]],[industrialTeaching,[0]]]){
    const exported=exportEducationalIFC({name:model.results.meta.name,
      parts:model.parts,levels});
    const id=api.OpenModel(new Uint8Array(Buffer.from(exported.content,'utf8')));
    try{
      const n=(type)=>api.GetLineIDsWithType(id,type).size();
      assert.ok(n(WebIFC.IFCCOLUMN)>=8);
      assert.ok(n(WebIFC.IFCBEAM)>=8);
      assert.ok(n(WebIFC.IFCWALL)>20);
      assert.ok(n(WebIFC.IFCDOOR)>=2);
      assert.ok(n(WebIFC.IFCWINDOW)>=4);
      assert.equal(n(WebIFC.IFCBUILDINGSTOREY),levels.length);
      let meshCount=0;
      api.StreamAllMeshes(id,()=>meshCount++);
      assert.ok(meshCount>=200,'Too few IFC tessellated products: '+meshCount);
    }finally{api.CloseModel(id);}
  }
});
