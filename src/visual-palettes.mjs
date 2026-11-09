// Named colour schemes keep negative and positive force resultants distinct.
// Changing a palette only affects rendering: signs and numerical data remain.
export const FORCE_PALETTES={
  classic:{label:'Cian y ámbar',negative:0x48bbd8,positive:0xf5b364,zero:0xa1b9c0,
    outline:0xf3faff,stems:0xa7e8ef,description:'Cian: negativo · ámbar: positivo'},
  contrast:{label:'Azul y rojo',negative:0x4d91ff,positive:0xff7464,zero:0xb0bfcf,
    outline:0xf3faff,stems:0xc0d7ff,description:'Azul: negativo · rojo: positivo'},
  nature:{label:'Verde y naranja',negative:0x54d4a2,positive:0xffac56,zero:0xb6c8bc,
    outline:0xf5fff5,stems:0xaee9c6,description:'Verde: negativo · naranja: positivo'},
  violet:{label:'Violeta y dorado',negative:0xb29afd,positive:0xffce65,zero:0xc9bdd7,
    outline:0xffffff,stems:0xd3c6ff,description:'Violeta: negativo · dorado: positivo'}
};
export const STRUCTURE_COLOURS={
  original:{label:'Materiales originales',hex:null},
  teal:{label:'Turquesa',hex:0x70d1d0},
  steel:{label:'Azul acero',hex:0x83abd0},
  coral:{label:'Coral',hex:0xef9f81},
  ivory:{label:'Marfil',hex:0xe2ded2}
};
export function forcePalette(key='classic'){
  return FORCE_PALETTES[key]??FORCE_PALETTES.classic;
}
export function forceSignColour(value,palette='classic'){
  const p=forcePalette(palette);
  return value<0?p.negative:value>0?p.positive:p.zero;
}
export function structuralColour(key='original',original=0xb2c7d1){
  return STRUCTURE_COLOURS[key]?.hex??original;
}
export function nextPalette(palettes,current){
  const keys=Object.keys(palettes),i=keys.indexOf(current);
  return keys[(i+1+keys.length)%keys.length];
}
export function cssForceGradient(key='classic'){
  const p=forcePalette(key);
  const hex=n=>'#'+n.toString(16).padStart(6,'0');
  return `linear-gradient(90deg,${hex(p.negative)} 0%,${hex(p.negative)} 45%,${hex(p.zero)} 50%,${hex(p.positive)} 55%,${hex(p.positive)} 100%)`;
}

export const RESULT_COLOUR_STOPS={
  classic:[[0,0x3a9fcf],[.35,0x65d8b1],[.68,0xf0cb66],[1,0xe96153]],
  contrast:[[0,0x265bc4],[.48,0xb3e7f7],[.52,0xffe8db],[1,0xec5344]],
  nature:[[0,0x127c70],[.4,0x69cfaa],[.72,0xf4d16e],[1,0xf0863c]],
  violet:[[0,0x4756b3],[.36,0x9e88d9],[.7,0xe7b4bb],[1,0xffce65]]
};
export function resultColourStops(key='classic'){
  return RESULT_COLOUR_STOPS[key]??RESULT_COLOUR_STOPS.classic;
}
export function resultColourHex(value,key='classic'){
  const t=Math.max(0,Math.min(1,Number(value)||0));
  const stops=resultColourStops(key);
  for(let i=1;i<stops.length;i++){
    if(t<=stops[i][0]){
      const a=stops[i-1],b=stops[i],f=(t-a[0])/(b[0]-a[0]);
      const component=shift=>Math.round(
        ((a[1]>>shift)&255)*(1-f)+((b[1]>>shift)&255)*f
      );
      return (component(16)<<16)|(component(8)<<8)|component(0);
    }
  }
  return stops.at(-1)[1];
}
export function cssResultGradient(key='classic'){
  const hex=n=>'#'+n.toString(16).padStart(6,'0');
  return 'linear-gradient(90deg,'+resultColourStops(key).map(([t,c])=>
    hex(c)+' '+(t*100)+'%').join(',')+')';
}
