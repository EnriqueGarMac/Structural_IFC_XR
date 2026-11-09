import * as THREE from 'three';

// Immersive VR teaching studio. Intentionally independent from the engineering
// model root so placing/rotating/scaling a bridge does not move the room.
// Never show in passthrough AR.
export function createVREnvironment(){
  const root=new THREE.Group();
  root.name='IMIS virtual engineering studio';
  root.visible=false;
  const sky=new THREE.Mesh(
    new THREE.SphereGeometry(60,40,24),
    new THREE.ShaderMaterial({
      side:THREE.BackSide,depthWrite:false,
      vertexShader:`varying vec3 p;
        void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`varying vec3 p;
        void main(){
          float t=clamp((normalize(p).y+0.25)/1.25,0.0,1.0);
          vec3 low=vec3(0.018,0.060,0.092);
          vec3 high=vec3(0.073,0.154,0.210);
          gl_FragColor=vec4(mix(low,high,pow(t,0.75)),1.0);
        }`
    })
  );
  sky.name='VR panoramic background';
  sky.frustumCulled=false;
  root.add(sky);
  const floor=new THREE.Mesh(
    new THREE.CircleGeometry(30,96),
    new THREE.MeshStandardMaterial({
      color:0x112633,roughness:.94,metalness:.04,side:THREE.DoubleSide
    })
  );
  floor.name='VR virtual floor';
  floor.rotation.x=-Math.PI/2;
  floor.position.y=-.025;
  root.add(floor);
  const floorGrid=new THREE.GridHelper(28,28,0x2f7182,0x1c4351);
  floorGrid.name='VR floor scale grid';
  floorGrid.position.y=-.018;
  root.add(floorGrid);
  const ring=new THREE.Mesh(
    new THREE.RingGeometry(1.45,1.47,96),
    new THREE.MeshBasicMaterial({color:0x3d9a9a,transparent:true,opacity:.5,
      side:THREE.DoubleSide,depthWrite:false})
  );
  ring.name='VR placement reference ring';
  ring.rotation.x=-Math.PI/2;
  ring.position.set(0,-.009,-1.5);
  root.add(ring);
  return root;
}
