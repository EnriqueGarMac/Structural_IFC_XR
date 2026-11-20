// One-frame WebXR render-pass sampler. Unlike a scene inventory, this
// records actual Three.js onBeforeRender invocations (including stereo eyes).
// Does not change visibility, materials or renderer settings.
export class XRDrawSampler {
  constructor(app){this.app=app;this.last=null;this.lastSample=0;}
  sample(){
    const app=this.app;
    const roots=[
      ['original',app.originalGroup],['deformed',app.deformedGroup],
      ['loads',app.loadsGroup],['frames',app.framesGroup],
      ['supports',app.supportGroup],['sap',app.sapVisuals?.group],
      ['reactions',app.reactionVisuals?.group],
      ['xr-ui',app.xrControls?.panel]
    ].filter(([,root])=>root);
    const counters={total:0,transparent:0,opaque:0,other:0,byLayer:{}};
    const restored=[];
    const classify=(node)=>{
      for(const [name,root] of roots){
        let p=node;
        while(p){if(p===root)return name;p=p.parent;}
      }
      return 'other';
    };
    app.scene.traverse(node=>{
      if(!(node.isMesh||node.isLine||node.isPoints||node.isSprite))return;
      const previous=node.onBeforeRender;
      node.onBeforeRender=function(renderer,scene,camera,geometry,material,group){
        const layer=classify(node);
        counters.total++;
        counters.byLayer[layer]=(counters.byLayer[layer]||0)+1;
        if(material?.transparent)counters.transparent++;
        else counters.opaque++;
        if(typeof previous==='function')previous.call(this,renderer,scene,camera,geometry,material,group);
      };
      restored.push([node,previous]);
    });
    return ()=>{
      for(const [node,previous] of restored)node.onBeforeRender=previous;
      this.last=counters;
      this.lastSample=Date.now();
      return counters;
    };
  }
}
