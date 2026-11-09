// WebXR modes are deliberately separate: immersive-ar uses camera passthrough;
// immersive-vr uses a virtual scene. The desktop renderer remains a normal 3D view.
export function sessionOptions({mode='ar',mobile=false}={}){
  if(mode==='vr'){
    if(mobile)throw Error('La sesión de realidad virtual no es AR móvil.');
    return {
      sessionType:'immersive-vr',
      referenceSpace:'local-floor',
      init:{requiredFeatures:['local-floor'],optionalFeatures:['bounded-floor']}
    };
  }
  if(mode!=='ar')throw Error('Modo XR desconocido: '+mode);
  if(mobile)return {
    sessionType:'immersive-ar',
    referenceSpace:'local',
    init:{requiredFeatures:['local','dom-overlay'],
      optionalFeatures:['hit-test','local-floor']}
  };
  return {
    sessionType:'immersive-ar',
    referenceSpace:'local',
    init:{requiredFeatures:['local'],optionalFeatures:['hit-test','local-floor']}
  };
}
