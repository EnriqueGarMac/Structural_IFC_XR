// IFC4 STEP writer for educational BIM parts.
// Generates actual IfcBeam/IfcColumn/IfcSlab/IfcWall/IfcDoor/IfcWindow/
// IfcSpace + IFC spatial hierarchy, coloured faceted BReps and a property
// stating whether an element participates in the simplified matrix analysis.
// Units: metres; one consistent SAP/IFC engineering XYZ frame, Z vertical.
// This is not a substitute for a professional IFC validation roundtrip.
const chars='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
function guid(seed){
  // IFC global ID: 22 printable chars, with top two bits of the first char 0.
  let h1=2166136261>>>0,h2=0x9e3779b9>>>0;
  for(const char of seed){
    h1=Math.imul(h1^char.charCodeAt(0),16777619)>>>0;
    h2=Math.imul(h2^char.charCodeAt(0),0x45d9f3b)>>>0;
  }
  let value=BigInt(h1)<<96n|BigInt(h2)<<64n|
    BigInt((h1^0x83d729b9)>>>0)<<32n|BigInt((h2^0x517cc1b7)>>>0);
  let out='';
  for(let i=0;i<21;i++){out=chars[Number(value&63n)]+out;value>>=6n;}
  return '0'+out;
}
const esc=str=>"'"+String(str??'').replace(/'/g,"''").replace(/[\r\n\x00-\x1F]/g,' ')+"'";
const num=x=>{
  if(!Number.isFinite(Number(x)))throw Error('Valor numérico IFC inválido: '+x);
  const s=Number(x).toFixed(6).replace(/\.?0+$/,'');
  return s.includes('.')?s:s+'.';
};
const vector=v=>'('+v.map(num).join(',')+')';
const refs=r=>'('+r.map(x=>'#'+x).join(',')+')';
function cross(a,b){return [
  a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]
];}
const norm=a=>Math.hypot(...a);
function normalise(a){const len=norm(a);if(len<1e-12)throw Error('Vector IFC degenerado');return a.map(v=>v/len);}
function orientedVertices(part){
  if(part.type==='box'){
    const [cx,cy,cz]=part.center,[dx,dy,dz]=part.size;
    const points=[];
    for(const sign of [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
                        [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]){
      points.push([cx+sign[0]*dx/2,cy+sign[1]*dy/2,cz+sign[2]*dz/2]);
    }
    return points;
  }
  if(part.type==='member'){
    const a=part.a,b=part.b,d=b.map((v,k)=>v-a[k]),length=norm(d);
    if(length<1e-9)throw Error('Barra IFC de longitud nula '+part.name);
    const u=normalise(d);
    // Identical to Three.js quaternion.setFromUnitVectors(X,u).
    const crossUV=cross([1,0,0],u);
    let q=[crossUV[0],crossUV[1],crossUV[2],1+u[0]];
    const qn=norm(q);
    if(qn<1e-10)q=[0,1,0,0];
    else q=q.map(v=>v/qn);
    const rotate=v=>{
      const qv=q.slice(0,3),t=cross(qv,v).map(x=>2*x);
      const t2=cross(qv,t);
      return v.map((x,k)=>x+q[3]*t[k]+t2[k]);
    };
    const v=rotate([0,1,0]),w=rotate([0,0,1]);
    const center=a.map((x,k)=>(x+b[k])/2);
    const points=[];
    for(const sign of [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
                        [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]){
      points.push(center.map((x,k)=>x+sign[0]*u[k]*length/2+
        sign[1]*v[k]*part.width/2+sign[2]*w[k]*part.depth/2));
    }
    return points;
  }
  throw Error('Elemento IFC no exportable: '+part.type);
}
function newWriter(){
  const rows=[],make=(name,...args)=>{
    const id=rows.length+1;
    rows.push('#'+id+'='+name+'('+args.join(',')+');');
    return id;
  };
  return {rows,make};
}
const IFC_TYPES=new Set([
  'IFCBEAM','IFCCOLUMN','IFCMEMBER','IFCPLATE','IFCFOOTING','IFCSLAB',
  'IFCWALL','IFCROOF','IFCCOVERING','IFCWINDOW','IFCDOOR','IFCSTAIRFLIGHT',
  'IFCRAMP','IFCFURNISHINGELEMENT','IFCSANITARYTERMINAL','IFCGEOGRAPHICELEMENT',
  'IFCBUILDINGELEMENTPROXY','IFCPIPESEGMENT','IFCTRANSPORTELEMENT'
]);
function entityArgs(type,globalId,owner,name,placement,representation){
  const core=[esc(globalId),'#'+owner,esc(name),'$','$',
    '#'+placement,'#'+representation];
  if(type==='IFCDOOR')return [...core,'$','$','$','.DOOR.','$.','$'];
  if(type==='IFCWINDOW')return [...core,'$','$','$','.WINDOW.','$.','$'];
  // IfcTransportElement has two attributes after Tag: OperationType, Capacity.
  if(type==='IFCTRANSPORTELEMENT')return [...core,'$','.NOTDEFINED.','$'];
  // IfcGeographicElement, IfcRoof and most IfcBuildingElement subclasses:
  // Tag plus optional PredefinedType at end.
  if(type==='IFCFURNISHINGELEMENT'||type==='IFCSANITARYTERMINAL'||
      type==='IFCPIPESEGMENT')return [...core,'$','.NOTDEFINED.'];
  if(type==='IFCBUILDINGELEMENTPROXY')return [...core,'$','.NOTDEFINED.'];
  return [...core,'$','$'];
}
export function exportEducationalIFC({
  name,parts,levels=[0],author='IMIS-Lab · Universidad de Granada'
}){
  if(!Array.isArray(parts)||!parts.length)throw Error('No existen elementos IFC.');
  const W=newWriter(),M=W.make;
  const person=M('IFCPERSON','$','$',esc(author),'$','$','$','$','$');
  const organisation=M('IFCORGANIZATION','$',esc('University of Granada'),'$','$','$');
  const personOrg=M('IFCPERSONANDORGANIZATION','#'+person,'#'+organisation,'$');
  const application=M('IFCAPPLICATION','#'+organisation,esc('1.0'),
    esc('IMIS Structural XR IFC teaching exporter'),esc('IMIS-XR'));
  const history=M('IFCOWNERHISTORY','#'+personOrg,'#'+application,'$','.ADDED.','$','$','$',String(1794268800));
  const point=(a)=>M('IFCCARTESIANPOINT',vector(a));
  const dir=(a)=>M('IFCDIRECTION',vector(a));
  const axis=(position)=>M('IFCAXIS2PLACEMENT3D','#'+point(position),
    '#'+dir([0,0,1]),'#'+dir([1,0,0]));
  const origin=axis([0,0,0]);
  const context=M('IFCGEOMETRICREPRESENTATIONCONTEXT','$',esc('Model'),'3',
    '0.000001','#'+origin,'$');
  const length=M('IFCSIUNIT','*','.LENGTHUNIT.','$','.METRE.');
  const area=M('IFCSIUNIT','*','.AREAUNIT.','$','.SQUARE_METRE.');
  const volume=M('IFCSIUNIT','*','.VOLUMEUNIT.','$','.CUBIC_METRE.');
  const units=M('IFCUNITASSIGNMENT',refs([length,area,volume]));
  const place=()=>M('IFCLOCALPLACEMENT','$','#'+origin);
  const project=M('IFCPROJECT',esc(guid('project'+name)),'#'+history,esc('IMIS XR · '+name),
    esc('Didactic building with analytical results in separate JSON'),'$','$','$',
    refs([context]),'#'+units);
  const site=M('IFCSITE',esc(guid('site'+name)),'#'+history,esc('Parcela docente'),
    '$','$','#'+place(),'$',esc('Terreno exterior'),'.ELEMENT.',
    '$','$','$','$','$');
  const building=M('IFCBUILDING',esc(guid('building'+name)),'#'+history,esc(name),
    '$','$','#'+place(),'$',esc('Edificio'),'.ELEMENT.','$','$','$');
  M('IFCRELAGGREGATES',esc(guid('project-site'+name)),'#'+history,'$','$',
    '#'+project,refs([site]));
  M('IFCRELAGGREGATES',esc(guid('site-building'+name)),'#'+history,'$','$',
    '#'+site,refs([building]));
  const storeyIds=levels.map((elevation,i)=>M('IFCBUILDINGSTOREY',
    esc(guid('floor'+i+name)),'#'+history,esc('Planta '+i+' · Z='+elevation+' m'),
    '$','$','#'+place(),'$',esc('Nivel '+i),'.ELEMENT.',num(elevation)));
  M('IFCRELAGGREGATES',esc(guid('building-storeys'+name)),'#'+history,'$','$',
    '#'+building,refs(storeyIds));
  const faceOrder=[[3,2,1,0],[4,5,6,7],[0,1,5,4],
    [1,2,6,5],[2,3,7,6],[3,0,4,7]];
  const containers=storeyIds.map(()=>[]);
  const palette=new Map(),spaces=[];
  let nProducts=0;
  for(const [index,part] of parts.entries()){
    const level=Math.max(0,Math.min(storeyIds.length-1,Number(part.storey)||0));
    if(part.type==='space'||part.ifcType==='IfcSpace'){
      // IfcSpace is a spatial element: aggregate it under its storey rather
      // than treating a room as a structural product or solid box.
      const id=M('IFCSPACE',esc(guid('space'+index+name)),'#'+history,
        esc(part.name),'$','$','#'+place(),'$',esc(part.name),
        '.ELEMENT.','.INTERNAL.','$');
      spaces.push({id,level});continue;
    }
    const type=String(part.ifcType??'IfcBuildingElementProxy').toUpperCase();
    const productType=IFC_TYPES.has(type)?type:'IFCBUILDINGELEMENTPROXY';
    const vertices=orientedVertices(part).map(point);
    const faces=[];
    for(const indices of faceOrder){
      const poly=M('IFCPOLYLOOP',refs(indices.map(i=>vertices[i])));
      const outer=M('IFCFACEOUTERBOUND','#'+poly,'.T.');
      faces.push(M('IFCFACE',refs([outer])));
    }
    const shell=M('IFCCLOSEDSHELL',refs(faces));
    const brep=M('IFCFACETEDBREP','#'+shell);
    const rgb=Number(part.color??0xb2c3cc)>>>0;
    if(!palette.has(rgb)){
      const colour=M('IFCCOLOURRGB','$',num(((rgb>>16)&255)/255),
        num(((rgb>>8)&255)/255),num((rgb&255)/255));
      const rendering=M('IFCSURFACESTYLERENDERING','#'+colour,
        '$','$','$','$','$','$','$','.NOTDEFINED.');
      const style=M('IFCSURFACESTYLE',esc('Colour '+rgb.toString(16)),
        '.BOTH.',refs([rendering]));
      palette.set(rgb,style);
    }
    M('IFCSTYLEDITEM','#'+brep,refs([palette.get(rgb)]),'$');
    const rep=M('IFCSHAPEREPRESENTATION','#'+context,esc('Body'),esc('Brep'),
      refs([brep]));
    const definition=M('IFCPRODUCTDEFINITIONSHAPE','$','$',refs([rep]));
    const id=M(productType,...entityArgs(productType,guid('part'+index+name),
      history,part.name,place(),definition));
    containers[level].push(id);nProducts++;
    // Didactic model: BIM object role is not inferred from visual IFC type.
    const prop=M('IFCPROPERTYSINGLEVALUE',esc('IncludedIn2DMatrixModel'),'$',
      'IFCBOOLEAN('+(part.structural?'.T.':'.F.')+')','$');
    const pset=M('IFCPROPERTYSET',esc(guid('Pset'+index+name)),'#'+history,
      esc('Pset_IMIS_StructuralRole'),'$',refs([prop]));
    M('IFCRELDEFINESBYPROPERTIES',esc(guid('role'+index+name)),'#'+history,
      '$','$',refs([id]),'#'+pset);
  }
  for(let i=0;i<containers.length;i++){
    if(containers[i].length)M('IFCRELCONTAINEDINSPATIALSTRUCTURE',
      esc(guid('container'+i+name)),'#'+history,'$','$',
      refs(containers[i]),'#'+storeyIds[i]);
  }
  for(const s of spaces)M('IFCRELAGGREGATES',
    esc(guid('space-storey'+s.id+name)),'#'+history,'$','$',
    '#'+storeyIds[s.level],refs([s.id]));
  const timestamp='2026-11-09T00:00:00';
  const header=[
    'ISO-10303-21;','HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    'FILE_NAME('+[esc(name+'.ifc'),esc(timestamp),'('+esc(author)+')',
      '('+esc('University of Granada')+')',esc('IMIS Structural XR'),
      esc('IMIS-Lab'),'$'].join(',')+');',
    "FILE_SCHEMA(('IFC4'));",'ENDSEC;','DATA;'
  ];
  const content=[...header,...W.rows,'ENDSEC;','END-ISO-10303-21;'].join('\n');
  return {content,stats:{products:nProducts,spaces:spaces.length,
    levels:storeyIds.length,entities:W.rows.length,bytes:content.length}};
}
