import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeStructuralGroundGrid,makeColumnFootMarkers} from '../src/ground-reference.js';
import {roofDemoGeometry,roofDemoResults} from '../src/roof-demo.js';
import {isTerrainElement} from '../src/view-filters.mjs';

test('ground reference uses the same transform as structural Z-up coordinates',()=>{
  const pieces=roofDemoGeometry();
  const bounds=new THREE.Box3();
  for(const piece of pieces){
    if(isTerrainElement(piece))continue;
    piece.geometry.computeBoundingBox();
    bounds.union(piece.geometry.boundingBox);
  }
  const root=new THREE.Group();
  root.rotation.x=-Math.PI/2;
  root.scale.setScalar(2.5/24);
  const grid=makeStructuralGroundGrid(bounds);
  root.add(grid);
  root.updateWorldMatrix(true,true);
  const normal=new THREE.Vector3(0,1,0).transformDirection(grid.matrixWorld);
  assert.ok(normal.distanceTo(new THREE.Vector3(0,1,0))<1e-8);
  const groundY=grid.getWorldPosition(new THREE.Vector3()).y;
  assert.ok(Math.abs(groundY)<1e-10);
  // Exact location of the structural origin in the rendered Three.js scene.
  const localZero=new THREE.Vector3(0,0,0).applyMatrix4(root.matrixWorld);
  assert.ok(Math.abs(localZero.y-groundY)<1e-10);
  // The reference must encompass the *whole* 18 x 24 m roof, not a
  // fixed 11-unit helper visually detached from the ten column bases.
  grid.geometry.computeBoundingBox();
  const width=grid.geometry.boundingBox.max.x-grid.geometry.boundingBox.min.x;
  assert.ok(width>24);
  for(const piece of pieces)piece.geometry.dispose();
  grid.geometry.dispose();grid.material.dispose();
});

test('the ten column-base markers share Z=0 with the analytical support nodes',()=>{
  const pieces=roofDemoGeometry();
  const markers=makeColumnFootMarkers(pieces);
  assert.equal(markers.children.length,10);
  const nodes=roofDemoResults.nodes.filter(n=>n.z===0);
  assert.equal(nodes.length,10);
  const positions=new Set(nodes.map(n=>[n.x,n.y].join(',')));
  const root=new THREE.Group();
  root.rotation.x=-Math.PI/2;
  root.scale.setScalar(.12);
  root.add(markers);
  root.updateWorldMatrix(true,true);
  for(const marker of markers.children){
    assert.ok(positions.has([marker.position.x,marker.position.y].join(',')));
    assert.ok(Math.abs(marker.position.z-.002)<1e-5);
    const worldPoint=marker.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(worldPoint.y-.002*.12)<1e-5);
  }
  for(const piece of pieces)piece.geometry.dispose();
  for(const marker of markers.children){marker.geometry.dispose();marker.material.dispose();}
});
