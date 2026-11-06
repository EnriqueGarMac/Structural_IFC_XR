import * as THREE from 'three';

// Matches the displacement legend in src/scene.js (colours in sRGB).
export const DEFORMATION_STOPS=[
  [0,0x3a9fcf],[.35,0x65d8b1],[.68,0xf0cb66],[1,0xe96153]
];
export function deformationColour(t){
  const v=THREE.MathUtils.clamp(Number(t)||0,0,1);
  for(let i=1;i<DEFORMATION_STOPS.length;i++){
    if(v<=DEFORMATION_STOPS[i][0]){
      const [lo,lcol]=DEFORMATION_STOPS[i-1],[hi,hcol]=DEFORMATION_STOPS[i];
      return new THREE.Color(lcol).lerp(new THREE.Color(hcol),(v-lo)/(hi-lo));
    }
  }
  return new THREE.Color(DEFORMATION_STOPS.at(-1)[1]);
}
export function bakeHeatUV(geometry){
  const heat=geometry.getAttribute('heat');
  if(!heat)throw Error('Falta la magnitud de desplazamiento por vértice en la deformada.');
  const uv=new Float32Array(heat.count*2);
  for(let i=0;i<heat.count;i++){
    uv[i*2]=THREE.MathUtils.clamp(heat.getX(i),0,1);
    uv[i*2+1]=.5;
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geometry.deleteAttribute('color');
  return geometry;
}
export function makeDeformationTexture(width=512){
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=4;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Canvas 2D no disponible para preparar colores USDZ.');
  // Sampling after linear-space interpolation reproduces the desktop legend.
  for(let x=0;x<width;x++){
    ctx.fillStyle=deformationColour(x/(width-1)).getStyle(THREE.SRGBColorSpace);
    ctx.fillRect(x,0,1,4);
  }
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=THREE.ClampToEdgeWrapping;
  texture.wrapT=THREE.ClampToEdgeWrapping;
  texture.minFilter=THREE.LinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.needsUpdate=true;
  return texture;
}
export function makeDeformationExportMaterial(geometry,material){
  bakeHeatUV(geometry);
  const copy=material.clone();
  copy.vertexColors=false;
  copy.color.set(0xffffff);
  copy.map=makeDeformationTexture();
  copy.roughness=.72;copy.metalness=0;
  copy.opacity=1;copy.transparent=false;
  copy.side=THREE.DoubleSide;
  copy.needsUpdate=true;
  return copy;
}
