// Diagnostic A/B isolation: never persists changes to model visibility.
// The chosen mode is applied only during the draw and restored immediately.
export const XR_TEST_MODES=['normal','sin-modelo','solo-bim','sin-bim'];
export function withXRTestMode(app,render){
  const mode=app.xrTestMode||'normal';
  if(!app.isXR||mode==='normal')return render();
  const saved=[];
  const hide=(object)=>{
    if(!object)return;
    saved.push([object,object.visible]);
    object.visible=false;
  };
  try{
    if(mode==='sin-modelo'){
      hide(app.worldRoot);
      hide(app.vrEnvironment);
    }else if(mode==='solo-bim'){
      for(const child of app.contentRoot?.children||[]){
        if(child!==app.originalGroup&&child!==app.deformedGroup)hide(child);
      }
      hide(app.loadsGroup);hide(app.framesGroup);hide(app.supportGroup);
      hide(app.sapVisuals?.group);hide(app.reactionVisuals?.group);
    }else if(mode==='sin-bim'){
      hide(app.originalGroup);hide(app.deformedGroup);
    }
    return render();
  }finally{
    for(let i=saved.length-1;i>=0;i--)saved[i][0].visible=saved[i][1];
  }
}
export function nextXRTestMode(mode){
  return XR_TEST_MODES[(XR_TEST_MODES.indexOf(mode)+1)%XR_TEST_MODES.length];
}
