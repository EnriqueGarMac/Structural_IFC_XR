// Force diagram helpers with no dependency on the renderer.
// Values are SAP2000 LOCAL section resultants, not stresses or global forces.
export const FORCE_COMPONENTS=Object.freeze({
  P:{field:'P_kN',unit:'kN',label:'Axil P'},
  V2:{field:'V2_kN',unit:'kN',label:'Cortante V2'},
  V3:{field:'V3_kN',unit:'kN',label:'Cortante V3'},
  T:{field:'T_kNm',unit:'kN·m',label:'Torsión T'},
  M2:{field:'M2_kNm',unit:'kN·m',label:'Momento M2'},
  M3:{field:'M3_kNm',unit:'kN·m',label:'Momento M3'}
});
const finite=Number.isFinite;
export const linear=(a,b,t)=>a+(b-a)*t;
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function readForceStations(rows,component,length){
  const field=FORCE_COMPONENTS[component]?.field;
  if(!field || !Array.isArray(rows))return [];
  return rows.map((row,index)=>({
    station: Number(row.station_m),
    value: Number(row[field]),
    index
  })).filter(row=>finite(row.station)&&finite(row.value))
    .map(row=>({...row,station:clamp(row.station,0,length)}))
    .sort((a,b)=>a.station-b.station||a.index-b.index);
}

// Separate positive/negative regions at zero crossings. This permits solid,
// sign-coloured surfaces without any false-colour overlap across a sign change.
export function forceSegments(stations){
  const sections=[];
  for(let i=1;i<stations.length;i++){
    const a=stations[i-1],b=stations[i];
    if(b.station-a.station<=1e-10)continue; // discontinuity, not a sloping patch
    if(a.value*b.value<0){
      const t=Math.abs(a.value)/(Math.abs(a.value)+Math.abs(b.value));
      const crossing={station:linear(a.station,b.station,t),value:0,index:a.index};
      sections.push({start:a,end:crossing,sign:Math.sign(a.value)});
      sections.push({start:crossing,end:b,sign:Math.sign(b.value)});
    }else{
      sections.push({start:a,end:b,sign:Math.sign(a.value||b.value)});
    }
  }
  return sections;
}

export function characteristicStations(stations,maxLabels=4){
  if(!stations.length)return [];
  const first=stations[0],last=stations.at(-1);
  const tolerance=Math.max(1e-8,Math.abs(last.station-first.station)*1e-5);
  const allEqual=stations.every(s=>Math.abs(s.value-first.value)<1e-9);
  if(allEqual)return [{...stations[Math.floor((stations.length-1)/2)],role:'Constante'}];
  const min=stations.reduce((a,b)=>b.value<a.value?b:a,stations[0]);
  const max=stations.reduce((a,b)=>b.value>a.value?b:a,stations[0]);
  // When labels are capped to protect the XR view from clutter, preserve
  // the largest negative and positive (or minimum and maximum) samples first.
  const proposed=[
    {...min,role:'Mín.'},
    {...max,role:'Máx.'},
    {...first,role:'Inicio'},
    {...last,role:'Fin'}
  ];
  const out=[];
  for(const p of proposed){
    const repeat=out.findIndex(q=>Math.abs(p.station-q.station)<tolerance);
    if(repeat>=0){
      if(Math.abs(p.value)>Math.abs(out[repeat].value))out[repeat]=p;
    } else out.push(p);
  }
  return out.slice(0,maxLabels).sort((a,b)=>a.station-b.station);
}

export function interpolateForce(segment,station){
  const t=clamp((station-segment.start.station)/
    Math.max(1e-12,segment.end.station-segment.start.station),0,1);
  return linear(segment.start.value,segment.end.value,t);
}

export function makeForcePatchCoordinates(segment,a,axis,normal,amplitude){
  const point=(station,value)=>[
    a[0]+axis[0]*station+normal[0]*value*amplitude,
    a[1]+axis[1]*station+normal[1]*value*amplitude,
    a[2]+axis[2]*station+normal[2]*value*amplitude
  ];
  const p0=point(segment.start.station,0),p1=point(segment.end.station,0);
  const q0=point(segment.start.station,segment.start.value);
  const q1=point(segment.end.station,segment.end.value);
  // Two triangles, double sided. Deflections of the diagram are a purely
  // graphical normalisation; the numeric values remain in kN / kN·m.
  return new Float32Array([...p0,...q0,...q1,...p0,...q1,...p1]);
}

export function forceReadoutFromPoint(segment,worldPoint,worldToLocal,origin,axis,frameId,component,caseName){
  const p=worldToLocal(worldPoint);
  const station=clamp((p[0]-origin[0])*axis[0]+
                      (p[1]-origin[1])*axis[1]+
                      (p[2]-origin[2])*axis[2],
                      segment.start.station,segment.end.station);
  return {
    frameId,component,caseName,station,
    value:interpolateForce(segment,station),
    unit:FORCE_COMPONENTS[component]?.unit??'',
    interpolated:true
  };
}
