import test from 'node:test';
import assert from 'node:assert/strict';
import {planarTrussFromIFC} from '../src/truss-ifc-import.mjs';

function member(name,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
  const vertices=[];
  for(const end of [a,b])for(const s of [-1,1])for(const t of [-1,1])
    vertices.push([end[0]+s*.006*(-dz),end[1]+t*.012,
      end[2]+s*.006*dx]);
  return {name,ifcType:'IfcMember',geometry:{
    getAttribute(key){
      if(key!=='position')return null;
      return {count:vertices.length,getX:i=>vertices[i][0],
        getY:i=>vertices[i][1],getZ:i=>vertices[i][2]};
    }
  }};
}
test('IFC member axes give planar nodes and rods without invented supports',()=>{
  const items=[
    member('bottom',[0,0,0],[1,0,0]),
    member('left',[0,0,0],[.5,0,.4]),
    member('right',[.5,0,.4],[1,0,0])
  ];
  const model=planarTrussFromIFC(items,{A_m2:.003,E_kN_m2:210e6});
  assert.equal(model.nodes.length,3);
  assert.equal(model.bars.length,3);
  assert.ok(model.nodes.every(n=>!n.fixX&&!n.fixZ));
});
test('IFC extraction refuses models without slender structural members',()=>{
  assert.throws(()=>planarTrussFromIFC([{ifcType:'IfcWall'}]),/barras/);
});
