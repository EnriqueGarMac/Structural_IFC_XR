import * as THREE from 'three';
import { normalizeResults } from './results.mjs';
function addBox(out,name,cx,cy,cz,sx,sy,sz,color){
  const g=new THREE.BoxGeometry(sx,sy,sz);
  g.translate(cx,cy,cz); // all geometry is built in IFC XYZ (Z up)
  out.push({geometry:g, name, color});
}
export function demoGeometry(){
  const pieces=[];
  addBox(pieces,'Losa de cubierta',4,3,3.15,8.2,6.2,.24,0xa5b8c1);
  addBox(pieces,'Cimentación',4,3,-.16,8.5,6.5,.30,0x5a7785);
  for(const x of [0,8]) for(const y of [0,6]) addBox(pieces,`Pilar (${x},${y})`,x,y,1.52,.36,.36,3.04,0x8facbc);
  for(const y of [0,6]) {
    addBox(pieces,`Viga larga ${y} A`,2,y,2.83,4,.32,.5,0xd4b7a0);
    addBox(pieces,`Viga larga ${y} B`,6,y,2.83,4,.32,.5,0xd4b7a0);
  }
  for(const x of [0,8])addBox(pieces,`Viga transversal ${x}`,x,3,2.83,.32,6,.5,0xd4b7a0);
  return pieces;
}
export const demoResults=normalizeResults({
  meta:{name:'Pórtico 8 × 6 m · ejemplo ficticio',note:'Los resultados son sintéticos, NO proceden de SAP2000.'},
  nodes:[
    {id:'A0',x:0,y:0,z:0},{id:'B0',x:8,y:0,z:0},{id:'C0',x:8,y:6,z:0},{id:'D0',x:0,y:6,z:0},
    {id:'A1',x:0,y:0,z:3},{id:'B1',x:8,y:0,z:3},{id:'C1',x:8,y:6,z:3},{id:'D1',x:0,y:6,z:3},
    {id:'E1',x:4,y:0,z:3},{id:'F1',x:4,y:6,z:3}
  ],
  frames:[
    {id:'C1',i:'A0',j:'A1'},{id:'C2',i:'B0',j:'B1'},{id:'C3',i:'C0',j:'C1'},{id:'C4',i:'D0',j:'D1'},
    {id:'B1A',i:'A1',j:'E1'},{id:'B1B',i:'E1',j:'B1'},{id:'B2A',i:'D1',j:'F1'},{id:'B2B',i:'F1',j:'C1'},
    {id:'B3',i:'A1',j:'D1'},{id:'B4',i:'B1',j:'C1'}
  ],
  loads:[
    {frame:'B1A',pattern:'G',dir:6,csys:'Global',start:0,end:1,w1:-9,w2:-9},
    {frame:'B1B',pattern:'G',dir:6,csys:'Global',start:0,end:1,w1:-9,w2:-9},
    {frame:'B2A',pattern:'G',dir:6,csys:'Global',start:0,end:1,w1:-7,w2:-7},
    {frame:'B2B',pattern:'G',dir:6,csys:'Global',start:0,end:1,w1:-7,w2:-7},
    {frame:'B1A',pattern:'Q',dir:6,csys:'Global',start:0,end:1,w1:-3,w2:-6},
    {frame:'B1B',pattern:'Q',dir:6,csys:'Global',start:0,end:1,w1:-6,w2:-3}
  ],
  cases:[
    {name:'G + Q (demostración)',displacements:[
      {node:'A0',ux:0,uy:0,uz:0},{node:'B0',ux:0,uy:0,uz:0},{node:'C0',ux:0,uy:0,uz:0},{node:'D0',ux:0,uy:0,uz:0},
      {node:'A1',ux:.001,uy:0,uz:-.005},{node:'B1',ux:.001,uy:0,uz:-.004},{node:'C1',ux:.002,uy:0,uz:-.004},{node:'D1',ux:.002,uy:0,uz:-.005},
      {node:'E1',ux:.0015,uy:0,uz:-.019},{node:'F1',ux:.0016,uy:0,uz:-.014}
    ]},
    {name:'Viento X (demostración)',displacements:[
      {node:'A0',ux:0,uy:0,uz:0},{node:'B0',ux:0,uy:0,uz:0},{node:'C0',ux:0,uy:0,uz:0},{node:'D0',ux:0,uy:0,uz:0},
      {node:'A1',ux:.025,uy:0,uz:-.001},{node:'B1',ux:.020,uy:0,uz:-.001},{node:'C1',ux:.019,uy:0,uz:-.001},{node:'D1',ux:.023,uy:0,uz:-.001},
      {node:'E1',ux:.022,uy:0,uz:-.004},{node:'F1',ux:.021,uy:0,uz:-.003}
    ]}
  ]
});
