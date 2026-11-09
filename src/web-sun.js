import * as THREE from 'three';
import {visibleModelBounds} from './camera-framing.mjs';

// Static diagonal sunlight only for the standard web 3D viewer. Not part of
// worldRoot / USDZ export, nor the VR / passthrough AR scene.
export class WebSun {
  constructor(app){
    this.app=app;
    this.light=new THREE.DirectionalLight(0xffe1b2,1.7);
    this.light.name='Sol inclinado · visor web';
    this.light.castShadow=true;
    this.light.shadow.mapSize.set(2048,2048);
    this.light.shadow.bias=-.0002;
    this.light.shadow.normalBias=.014;
    this.light.shadow.camera.near=.05;
    this.light.visible=false;
    app.scene.add(this.light,this.light.target);
    this.catcher=new THREE.Mesh(new THREE.PlaneGeometry(1,1),
      new THREE.ShadowMaterial({color:0x09131d,opacity:.38,
        depthWrite:false,side:THREE.DoubleSide}));
    this.catcher.name='Receptor de sombra exclusivo del visor web';
    this.catcher.receiveShadow=true;
    this.catcher.visible=false;
    app.contentRoot.add(this.catcher);
    app.renderer.shadowMap.enabled=true;
    app.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  }
  update(){
    const app=this.app;
    const on=!app.isXR&&!app.webcamActive&&!app.showSAPOnly&&app.parts.length>0;
    this.light.visible=on;this.catcher.visible=false;
    if(!on){
      for(const part of app.parts){
        part.orig.castShadow=false;part.deformed.castShadow=false;
        part.orig.receiveShadow=false;part.deformed.receiveShadow=false;
      }
      return;
    }
    app.worldRoot.updateWorldMatrix(true,true);
    const bounds=visibleModelBounds(app.parts,{
      hideGround:app.hideGround,showStructureOnly:app.showStructureOnly
    });
    if(bounds.isEmpty())return;
    const sphere=bounds.getBoundingSphere(new THREE.Sphere());
    const radius=Math.max(.5,sphere.radius),center=sphere.center;
    const sunDirection=new THREE.Vector3(.85,1.6,1.05).normalize();
    this.light.target.position.copy(center);
    this.light.position.copy(center).addScaledVector(sunDirection,radius*3+6);
    const extent=Math.max(2,radius*1.8);
    const camera=this.light.shadow.camera;
    camera.left=-extent;camera.right=extent;camera.top=extent;
    camera.bottom=-extent;camera.far=Math.max(50,radius*7+15);
    camera.updateProjectionMatrix();
    this.light.target.updateMatrixWorld();
    for(const part of app.parts){
      const visible=!(app.hideGround&&part.terrain)&&
        (!app.showStructureOnly||part.structural!==false);
      part.orig.receiveShadow=Boolean(visible&&part.orig.visible);
      part.deformed.receiveShadow=Boolean(visible&&part.deformed.visible);
      part.orig.castShadow=Boolean(visible&&app.originalGroup.visible&&
        part.orig.visible&&part.orig.material.opacity>=.74);
      part.deformed.castShadow=Boolean(visible&&app.deformedGroup.visible&&
        part.deformed.visible&&part.deformed.material.opacity>=.74);
    }
    const hasSite=app.parts.some(part=>
      part.terrain&&/IFCGEOGRAPHICELEMENT|IFCSITE/i.test(part.ifcType??'')&&
      part.orig.visible&&app.originalGroup.visible);
    if(!hasSite&&app.bounds){
      const bbox=app.bounds,size=bbox.getSize(new THREE.Vector3());
      this.catcher.geometry.dispose();
      this.catcher.geometry=new THREE.PlaneGeometry(
        Math.max(2,size.x*1.6),Math.max(2,size.y*1.6));
      this.catcher.position.set((bbox.min.x+bbox.max.x)/2,
        (bbox.min.y+bbox.max.y)/2,bbox.min.z-.025);
      this.catcher.visible=true;
    }
  }
}