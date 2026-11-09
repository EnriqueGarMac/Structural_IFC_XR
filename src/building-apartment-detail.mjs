// Detailed, deliberately non-load-bearing BIM furnishing for each residential
// storey. The geometric parts are separate IFC4 products with meaningful names.
// All positions are in the building's global XYZ frame (m, Z vertical).
export function addApartmentDetails({level,floorZ,box}){
  if(!Number.isInteger(level)||level<0||typeof box!=='function')
    throw Error('Invalid apartment furniture placement.');
  const F='IfcFurnishingElement',S='IfcSanitaryTerminal',P='IfcBuildingElementProxy',
    COVER='IfcCovering',T='IfcLightFixture';
  const wood=0xc39a74,oak=0xa87853,white=0xeceae3,cream=0xd9cfc1,
    steel=0x9db5bf,black=0x273947,glass=0x85bfd0,blue=0x5f879d,
    green=0x718e81,soft=0xc4afa0,chrome=0xc9d7da,
    teal=0x7bb7b9,stone=0xbfc2ba;
  const z=floorZ+.10;
  const add=(name,type,c,size,color)=>box(name+' · planta '+(level+1),
    type,c,size,color,false,level);
  const furnishing=(name,c,size,color=wood)=>add(name,F,c,size,color);

  // Kitchen: distinguish cabinetry, worktop, appliances, sink and extraction.
  // The existing tall counter and fridge are deliberately retained.
  add('Encimera porcelánica cocina',COVER,[-5.50,-2.04,z+.82],[.80,2.55,.065],stone);
  for(const [n,y] of [['A',-2.82],['B',-1.92],['C',-1.03]]){
    furnishing('Mueble bajo cocina '+n,[-5.48,y,z+.42],[.70,.76,.77],cream);
    furnishing('Frente cajón cocina '+n,[-5.07,y,z+.45],[.033,.64,.29],white);
    add('Tirador acero cocina '+n,P,[-5.045,y,z+.55],[.025,.33,.03],chrome);
    furnishing('Armario colgante cocina '+n,[-5.51,y,z+2.04],[.52,.70,.67],white);
    add('Tirador armario cocina '+n,P,[-5.226,y,z+2.0],[.024,.025,.27],chrome);
  }
  furnishing('Horno eléctrico empotrado',[-5.07,-1.10,z+.43],[.065,.56,.58],black);
  add('Ventana cristal de horno',P,[-5.028,-1.10,z+.43],[.015,.45,.32],glass);
  add('Panel de inducción',P,[-5.50,-1.07,z+.855],[.56,.57,.024],black);
  for(const [i,offX,offY] of [[1,-.15,-.15],[2,.15,-.15],[3,-.15,.15],[4,.15,.15]])
    add('Zona cocción '+i,P,[-5.50+offX,-1.07+offY,z+.869],[.17,.17,.008],0x4e6373);
  furnishing('Campana extracción cocina',[-5.51,-1.1,z+2.47],[.65,.80,.25],steel);
  furnishing('Lavavajillas cocina',[-5.075,-2.88,z+.40],[.06,.55,.74],chrome);
  add('Grifo fregadero acero',S,[-5.40,-2.06,z+1.00],[.055,.055,.34],chrome);
  add('Caño grifo fregadero',S,[-5.34,-2.06,z+1.16],[.22,.05,.045],chrome);
  add('Salpicadero cocina',COVER,[-5.92,-2.08,z+1.20],[.04,2.7,.68],0xe0e4e0);
  furnishing('Cubos residuos cocina',[-3.02,-3.15,z+.31],[.36,.45,.62],stone);

  // Dining / living: chair backs, seating, cushions, TV furniture and lighting.
  for(const [n,x,y] of [['N',1,-3.27],['S',1,-1.72],['W',.01,-2.5],['E',1.99,-2.5]]){
    furnishing('Silla comedor asiento '+n,[x,y,z+.46],[.46,.45,.10],oak);
    furnishing('Silla comedor respaldo '+n,
      [x,y+(n==='N'?.21:n==='S'?-.21:0),z+.78],
      n==='W'||n==='E'?[.06,.45,.65]:[.46,.06,.65],wood);
    for(const dx of [-.15,.15])for(const dy of [-.14,.14])
      add('Pata silla comedor '+n+' '+dx+dy,P,
        [x+dx,y+dy,z+.22],[.045,.045,.43],wood);
  }
  for(const dx of [-.53,.53])for(const dy of [-.26,.26])
    add('Pata mesa comedor '+dx+dy,P,
      [1+dx,-2.50+dy,z+.34],[.078,.078,.67],oak);
  furnishing('Sofá respaldo tapizado',[3.82,-3.46,z+.68],[1.95,.22,.9],green);
  for(const x of [3.20,3.82,4.44]){
    furnishing('Cojín asiento sofá '+x,[x,-2.94,z+.50],[.57,.65,.23],teal);
    furnishing('Cojín respaldo sofá '+x,[x,-3.30,z+.85],[.48,.14,.47],soft);
  }
  furnishing('Mesa centro salón',[3.40,-1.90,z+.36],[1.10,.65,.10],oak);
  for(const x of [2.96,3.84])for(const y of [-2.09,-1.72])
    add('Pata mesa centro '+x+y,P,[x,y,z+.17],[.045,.045,.31],black);
  add('Alfombra salón',COVER,[3.36,-2.27,z+.014],[2.32,1.50,.024],0x7b9f9e);
  furnishing('Mueble bajo televisión',[4.75,-.39,z+.24],[2.15,.39,.46],white);
  furnishing('Panel TV pantalla',[4.75,-.14,z+1.56],[1.45,.05,.88],black);
  add('Marco TV',P,[4.75,-.175,z+1.56],[1.53,.045,.95],steel);
  furnishing('Biblioteca salón',[5.61,-1.43,z+1.06],[.36,.58,2.10],oak);
  for(const h of [.43,.89,1.37,1.80])
    furnishing('Balda librería salón '+h,[5.61,-1.43,z+h],[.37,.60,.045],white);
  add('Lámpara techo salón',T,[2.60,-1.95,z+2.65],[.52,.52,.17],cream);

  // Bathroom: fixture parts, mirrors, glazed shower, taps and towels.
  furnishing('Cisterna inodoro',[-5.17,3.07,z+.76],[.49,.19,.43],white);
  add('Tapa asiento inodoro',S,[-5.12,2.7,z+.72],[.54,.60,.05],white);
  furnishing('Mueble lavabo bajo',[-3,3.43,z+.41],[.78,.45,.74],oak);
  add('Grifería lavabo',S,[-3,3.26,z+1.03],[.045,.09,.28],chrome);
  add('Espejo baño',COVER,[-3,3.79,z+1.80],[.72,.045,.87],glass);
  add('Aplique espejo baño',T,[-3,3.77,z+2.38],[.55,.07,.10],cream);
  add('Mampara de ducha frontal',P,[-4.69,.82,z+1.03],[.052,.83,1.91],glass);
  add('Mampara de ducha lateral',P,[-5.15,1.28,z+1.03],[.89,.052,1.91],glass);
  add('Columna ducha',S,[-5.50,.58,z+1.19],[.057,.057,1.80],chrome);
  add('Rociador ducha',S,[-5.36,.58,z+2.12],[.32,.32,.045],chrome);
  add('Desagüe plato ducha',S,[-5.15,.83,z+.08],[.12,.12,.018],steel);
  furnishing('Armario toallas baño',[-2.40,2.67,z+.92],[.38,.54,1.65],white);
  add('Toallero acero baño',P,[-2.27,1.05,z+1.13],[.045,.45,.047],chrome);
  add('Textil toalla colgada',COVER,[-2.25,1.05,z+.90],[.028,.37,.48],0x6a9da8);
  add('Extractor techo baño',T,[-3.62,2.15,z+2.80],[.22,.22,.055],white);

  // Bedroom: upholstered bed, textiles, bedside furniture, desk and wardrobe.
  furnishing('Cabecero cama dormitorio',[4.67,2.40,z+.66],[.15,1.84,1.17],wood);
  furnishing('Colchón cama dormitorio',[3.63,2.40,z+.48],[1.99,1.58,.27],white);
  add('Colcha dormitorio',COVER,[3.30,2.40,z+.64],[1.25,1.58,.065],0x8aafbb);
  for(const y of [2.05,2.74]){
    furnishing('Almohada dormitorio '+y,[4.29,y,z+.69],[.48,.47,.14],cream);
    furnishing('Mesilla noche dormitorio '+y,[2.17,y,z+.36],[.48,.47,.72],wood);
    add('Tirador mesilla '+y,P,[2.16,y-.24,z+.42],[.23,.04,.025],steel);
    add('Lámpara sobremesa dormitorio '+y,T,[2.17,y,z+.82],[.25,.25,.25],white);
  }
  for(const y of [1.08,1.88]){
    furnishing('Puerta armario dormitorio '+y,[5.35,y,z+1.08],[.05,.73,1.95],cream);
    add('Tirador armario dormitorio '+y,P,
      [5.31,y+.26,z+1.09],[.025,.035,.36],chrome);
  }
  furnishing('Escritorio dormitorio',[.99,2.75,z+.73],[1.15,.59,.065],oak);
  for(const x of [.55,1.40])for(const y of [2.50,3.03])
    add('Pata escritorio '+x+y,P,[x,y,z+.35],[.045,.045,.68],steel);
  furnishing('Silla escritorio asiento',[1.05,1.97,z+.51],[.52,.50,.12],blue);
  furnishing('Silla escritorio respaldo',[1.05,1.72,z+.89],[.50,.10,.64],blue);
  furnishing('Cómoda dormitorio',[.42,1.03,z+.52],[.74,.42,1.01],white);
  add('Espejo cuerpo entero dormitorio',COVER,[.30,3.79,z+1.35],[.66,.04,1.82],glass);
  add('Alfombra dormitorio',COVER,[3.10,1.38,z+.018],[2.0,.72,.026],soft);

  // Household details visible through the architectural transparency.
  for(const [n,x,y] of [['salón',3.5,-1.0],['cocina',-3.2,-1.5],['dormitorio',2.5,3.1]]){
    add('Luminaria empotrada '+n,T,[x,y,z+2.76],[.25,.25,.055],white);
  }
  add('Radiador salón',P,[5.7,-2.20,z+.57],[.15,.65,.98],white);
  add('Radiador dormitorio',P,[.20,2.40,z+.55],[.12,.70,.93],white);
}
