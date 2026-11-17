import * as THREE from 'three';
// One lightweight label helper for axial forces in both teaching experiences.
export function makeAxialLabel(value,position,{scale=.22}={}){
  if(!Number.isFinite(value))return null;
  const canvas=document.createElement('canvas');
  canvas.width=256;canvas.height=80;
  const ctx=canvas.getContext('2d');
  if(!ctx)return null;
  ctx.fillStyle='rgba(8,29,40,.88)';
  ctx.beginPath();ctx.roundRect(4,4,248,72,14);ctx.fill();
  ctx.strokeStyle='#8dced4';ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#f1fdff';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='bold 34px Arial,sans-serif';
  ctx.fillText((value>0?'+':'')+value.toFixed(2)+' kN',128,42,232);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({
    map:texture,depthTest:false,transparent:true
  }));
  sprite.position.copy(position);
  sprite.scale.set(scale*2.8,scale*.9,1);
  sprite.renderOrder=15000;
  return sprite;
}
