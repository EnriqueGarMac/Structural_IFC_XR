import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORCE_COMPONENTS,readForceStations,forceSegments,
  characteristicStations,makeForcePatchCoordinates,
  interpolateForce,forceReadoutFromPoint
} from '../src/force-diagrams.mjs';

test('read P,V2,V3,T,M2,M3 with their physical units',()=>{
  assert.deepEqual(Object.keys(FORCE_COMPONENTS),['P','V2','V3','T','M2','M3']);
  assert.equal(FORCE_COMPONENTS.P.unit,'kN');
  assert.equal(FORCE_COMPONENTS.M3.unit,'kN·m');
  assert.equal(FORCE_COMPONENTS.T.field,'T_kNm');
});
test('split signed diagram precisely at zero without interpolating across a jump',()=>{
  const rows=[
    {station_m:0,M3_kNm:-4},
    {station_m:2,M3_kNm:4},
    {station_m:2,M3_kNm:9}, // distinct result at same station (point load)
    {station_m:4,M3_kNm:3}
  ];
  const sampled=readForceStations(rows,'M3',4);
  assert.equal(sampled.length,4);
  const seg=forceSegments(sampled);
  assert.equal(seg.length,3);
  assert.equal(seg[0].sign,-1);assert.equal(seg[1].sign,1);
  assert.equal(seg[0].end.station,1);
  assert.equal(seg[0].end.value,0);
  assert.equal(seg[1].start.station,1);
  assert.equal(seg[2].start.value,9);
  assert.equal(seg[2].end.value,3);
});
test('filled diagram mesh has nonzero area and preserves station values for raycast',()=>{
  const vals=readForceStations([{station_m:0,P_kN:2},{station_m:4,P_kN:5}],'P',4);
  const segment=forceSegments(vals)[0];
  const coordinates=makeForcePatchCoordinates(segment,[0,0,0],[1,0,0],[0,0,1],.1);
  assert.equal(coordinates.length,18);
  assert.ok(coordinates.every(Number.isFinite));
  assert.ok(coordinates[8]>.1);
  const readout=forceReadoutFromPoint(segment,[2,1,1],p=>p,[0,0,0],[1,0,0],
    '7','P','DEAD');
  assert.equal(readout.station,2);
  assert.equal(readout.value,3.5);
  assert.equal(readout.unit,'kN');
  assert.equal(readout.frameId,'7');
});
test('characteristic values identify extremes, endpoints and constant forces',()=>{
  const stations=readForceStations([
    {station_m:0,V2_kN:-2},{station_m:1,V2_kN:-7},
    {station_m:2,V2_kN:5},{station_m:3,V2_kN:2}
  ],'V2',3);
  const characteristic=characteristicStations(stations);
  assert.ok(characteristic.some(s=>s.value===-7));
  assert.ok(characteristic.some(s=>s.value===5));
  assert.ok(characteristic.some(s=>s.station===0));
  assert.ok(characteristic.some(s=>s.station===3));
  const constant=characteristicStations(readForceStations([
    {station_m:0,P_kN:2.4},{station_m:2,P_kN:2.4},{station_m:4,P_kN:2.4}
  ],'P',4));
  assert.equal(constant.length,1);
  assert.equal(constant[0].role,'Constante');
});
