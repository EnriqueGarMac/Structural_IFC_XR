## Transparencia del IFC y mobiliario docente

En **04 / VISUALIZACIÓN**, utiliza **Transparencia del IFC** (0–100 %) para
inspeccionar el interior. El selector **Aplicar transparencia a** ofrece:

- **Cerramientos, cubierta y forjados**: hace transparentes muros, ventanas,
  puertas, cubiertas, revestimientos y losas, pero mantiene sólidos los pilares,
  vigas, muebles y aparatos sanitarios. Es la opción preferente para explicar
  a los alumnos la diferencia entre estructura, envolvente y elementos de uso.
- **Todo el IFC**: aplica la misma opacidad a todos los sólidos del IFC,
  incluidos estructura, terreno y mobiliario.

Los controles de transparencia son de visualización. No cambian los archivos
IFC descargados, el análisis matricial, las cargas ni los resultados de SAP2000.
En **Quest VR / RM**, el menú **Capas / visualización** permite alternar el
ámbito y recorrer cinco niveles de opacidad apuntando con el mando.

El ejemplo **Edificio de 3 plantas** incluye piezas BIM independientes para
armarios y módulos de cocina, horno, placa de inducción, lavavajillas, grifos,
mesa y sillas, sofás, televisor, estanterías, inodoro, ducha y mampara,
lavabo, espejos, camas, mesillas, escritorios, luminarias y otros detalles.
Son geometrías docentes simplificadas, no bibliotecas comerciales ni un
proyecto de interiorismo. Se exportan como IFC4 con categorías de mobiliario
y aparatos sanitarios cuando corresponde. **No participan en la matriz de
rigidez**; los resultados estructurales siguen siendo los de los pórticos
planos del ejemplo.

---

## Reacciones en apoyos (SAP2000 → XR)

Al importar un JSON SAP2000 con `jointReactions`, selecciona **Reacciones en apoyos** en **Vista de resultados**. El visor muestra las reacciones del caso activo directamente sobre los nudos, sin recalcular el equilibrio:

- Flechas para `Fx, Fy, Fz` en **ejes globales XYZ**, con colores según el eje. El sentido refleja el signo obtenido en SAP2000. Unidades: **kN**.
- Arcos con flecha circular para `Mx, My, Mz` siguiendo la regla de la mano derecha. Unidades: **kN·m**.
- Botón **Mostrar valores de reacciones**: despliega los vectores `(Fx,Fy,Fz)` y `(Mx,My,Mz)` en cada apoyo. Las flechas y los radios tienen **escala ilustrativa**, no representan la magnitud física directamente.
- En **escritorio**, pasa el puntero sobre el marcador del apoyo. En **Quest RM o VR**, apunta con el mando al marcador y consulta sus seis componentes sin mover el modelo. Cambiar de caso actualiza las reacciones.
- La leyenda muestra las sumas `ΣRx`, `ΣRy` y `ΣRz`. Estas sumas **no constituyen por sí solas una comprobación completa de equilibrio** si faltan otras cargas o momentos externos.

El formato plano incluye por ejemplo:

```json
"jointReactions": {
  "DEAD": {
    "1": {"force_kN": [0, 0, 7.0285], "moment_kNm": [0, 0, 0]},
    "4": {"force_kN": [0, 0, 7.0285], "moment_kNm": [0, 0, 0]}
  }
}
```

Si un caso no contiene reacciones, se indica explícitamente y no se inventan valores a partir de las restricciones de los nudos.

---

## Realidad virtual inmersiva en Meta Quest (modo VR)

El visor dispone de dos experiencias independientes para Meta Quest:

- **Quest 3 RM:** realidad mixta mediante `immersive-ar`, con el entorno real
  visible a través del passthrough. Conserva la detección de superficies cuando
  el navegador la ofrece.
- **Quest 3 VR:** realidad virtual mediante `immersive-vr`, sin passthrough.
  La estructura se muestra en un estudio virtual oscuro, con suelo y cuadrícula
  de referencia, utilizando un espacio de seguimiento `local-floor`.

### Uso en Meta Quest

1. Abre la aplicación HTTPS desde **Quest Browser** y, antes de entrar en VR,
   carga un IFC y su JSON SAP2000, o escoge una demostración.
2. Pulsa **Quest 3 VR** y acepta entrar en realidad virtual.
3. Utiliza el menú flotante **Análisis y deformadas** para elegir caso,
   cargas, diagramas de esfuerzos y formas modales.
4. Apunta al modelo con el gatillo para girarlo, usa el botón lateral para
   desplazarlo, el joystick izquierdo para rotarlo y el derecho para ajustar
   el tamaño. En **Mover modelo en VR** puedes recentrarlo delante de ti.
5. En **Esfuerzos internos**, apunta el mando a las superficies sombreadas
   para leer barra, estación y valor. Activa las etiquetas características
   si lo deseas.
6. Sal con **SALIR DE REALIDAD VIRTUAL** en el menú inmersivo o mediante el
   control de salida de Quest. Para alternar VR/RM, termina una sesión antes
   de iniciar la otra.

El entorno virtual **no reproduce una habitación real** y no requiere
captura de la cámara. La escala inicial es una maqueta ajustable, no una
garantía de escala 1:1. Los modos de vibración tienen amplitudes ilustrativas
y sus frecuencias reales siguen mostrándose como resultados de SAP2000.

**Compatibilidad:** requiere navegador compatible con `immersive-vr`
y seguimiento `local-floor` (por ejemplo Quest Browser). La vista 3D
de escritorio permanece disponible sin visor. El código puede verificarse
automáticamente, pero la experiencia física requiere pruebas en las gafas.

---

## Importar directamente un JSON de SAP2000 (nuevo esquema IMIS)

La aplicación admite tanto los archivos clásicos `{nodes, frames, loads, cases}` como
el JSON enriquecido `imis.sap2000.xr/1` generado por el conversor Excel de SAP2000.

1. Abre el visor y pulsa **Cargar SAP**.
2. Selecciona `Modelo_XR.json`. No hace falta importar un IFC: se crea una
   representación analítica de las barras con geometría cilíndrica simplificada.
3. En **Vista de resultados**, elige **Desplazamientos**, **Esfuerzos internos**
   o **Modos de vibración**.
4. Para esfuerzos, selecciona el caso y el componente local
   `P, V2, V3, T, M2, M3`. Los diagramas tienen escala visual normalizada.
5. Para modos, selecciona el modo propio y una amplitud ilustrativa. La
   frecuencia de animación corresponde al autovalor exportado.

En **Meta Quest**, abre **Análisis y deformadas** y utiliza el botón
**VISTA** para alternar entre desplazamientos, diagramas y vibraciones.
Las flechas del campo de detalle cambian el esfuerzo o el modo.

**Importante:** las formas modales están normalizadas: sus amplitudes
no equivalen a desplazamientos físicos. Las barras generadas a partir del JSON
son aproximaciones analíticas, no la geometría exacta IFC. El visor no realiza
un cálculo FEM ni transforma esfuerzos locales a globales.

---
🌐 **[Abrir Structural IFC XR — aplicación web](https://enriquegarmac.github.io/Structural_IFC_XR/)**

> Acceso directo desde el navegador, también desde Meta Quest 3. Sin instalar nada.

# IMIS Structural XR — IFC + SAP2000 + Meta Quest 3

Prototipo abierto para visualizar **geometría IFC**, **cargas distribuidas aplicadas a barras** y **deformadas nodales de SAP2000** en escritorio, webcam y realidad mixta en Meta Quest 3.

**Estado:** prototipo docente. Incluye un calculador matricial 2D para ejemplos y un visor de resultados externos SAP2000; no está destinado a dimensionamiento normativo. La conexión COM con SAP2000 sigue siendo una vía independiente.



## Modelos docentes: BIM arquitectónico y pórticos calculados

Los dos ejemplos incluidos en el visor tienen geometría visible, entidades
IFC4 exportables y resultados obtenidos mediante **matriz de rigidez**.
A diferencia de las demostraciones anteriores, los desplazamientos no
son funciones ilustrativas dibujadas a mano.

### 1. Edificio residencial de tres plantas (12 × 8 m)

- Tres alturas de 3,20 m, 3 pórticos independientes XZ de hormigón,
  vigas, pilares y forjados.
- Fachadas con huecos, ventanas y puertas, dormitorios, cocina, baño,
  salón, tabiques, escalera, instalaciones sanitarias, mobiliario y
  exteriores con acceso y aparcamiento.
- El visor permite **Solo estructura resistente** y distingue en el IFC
  `StructuralElement` de `IncludedIn2DMatrixModel`.
- Casos `DEAD`: peso propio y cargas permanentes repartidas por anchura
  tributaria. `WIND_X`: viento horizontal equivalente sobre el pórtico.

### 2. Nave industrial metálica (18 × 24 m)

- Cinco pórticos/cerchas transversales independientes, cordones, montantes,
  diagonales, pilares empotrados y correas longitudinales.
- Cerramientos de chapa sándwich, ventanas laterales en huecos reales,
  cubierta inclinada, acceso de camiones, estanterías, mercancías, solera,
  marquesina y terreno exterior.
- Casos `DEAD` y `WIND_X`, con esfuerzos `P`, `V2`, `M3`,
  desplazamientos a lo largo de la barra y reacciones en apoyos.

### Exportar cada ejemplo

1. Selecciona **Edificio de 3 plantas** o **Nave industrial**.
2. Pulsa **Descargar IFC4 del ejemplo**: genera un modelo IFC4 STEP con
   productos `IfcBeam`, `IfcColumn`, `IfcWall`, `IfcWindow`,
   `IfcDoor`, `IfcSpace`, jerarquía `IfcProject`–`IfcSite`–
   `IfcBuilding`–`IfcBuildingStorey`, mallas BRep cerradas y estilos.
3. Pulsa **Descargar resultados FEM (JSON)** para guardar los resultados
   calculados en las mismas coordenadas globales, en m/kN/kN·m.
4. Puedes importarlos en aplicaciones BIM o volver a cargar ambos archivos
   en Structural IFC XR.

### Alcance mecánico y límites

Se implementa **rigidez matricial lineal 2D** de barras de
Euler–Bernoulli en el plano XZ, con deformaciones pequeñas, materiales
elásticos y uniones idealizadas. Los casos resuelven desplazamientos
nodales, esfuerzos internos y reacciones, e interpolan desplazamientos
dentro de las barras con funciones de forma y el efecto de cargas
distribuidas. No equivale a un modelo tridimensional completo.
Los forjados, cerramientos, correas y arriostramientos
fuera de los pórticos analizados se representan como BIM, pero **no
aportan rigidez al sistema matricial**. Su deformación no se inventa.
No se incluyen pandeo, flexibilidad de uniones, interacción suelo-cimentación,
diafragmas de losas ni estabilidad fuera del plano.
La herramienta es para docencia, **no para dimensionamiento ni
comprobación normativa**.

---

## Realidad aumentada desde el móvil (Android e iPhone)

Entra directamente en **[Structural IFC XR](https://enriquegarmac.github.io/Structural_IFC_XR/)** desde tu teléfono y pulsa **«AR móvil»**. Carga primero el IFC y, si necesitas resultados estructurales, el JSON de SAP2000. También puedes probar el edificio de tres plantas o la nave industrial con resultados de rigidez matricial.

- **Android con Chrome + WebXR/ARCore:** se inicia una sesión de realidad aumentada con cámara. Apunta a una mesa o al suelo y usa **Colocar aquí** para anclar visualmente el modelo. La barra táctil permite cambiar el tamaño, ajustar el factor de deformada ×0–×150 y alternar Solo SAP. Puedes buscar otra superficie y salir. La disponibilidad depende de ARCore, permisos y compatibilidad WebXR/detección de superficies del dispositivo.
- **iPhone/iPad con Safari:** se genera **en el propio teléfono** una copia USDZ de la **vista actual**. Pulsa **Abrir en AR Quick Look** después de preparar el archivo. Allí puedes colocar, trasladar y escalar el modelo con los dedos. La exportación respeta las capas IFC visibles y el estado actual de la deformada. En modo **Solo SAP**, convierte las barras y nudos analíticos en cilindros/esferas para su visualización AR. Es una **instantánea**, no un visor interactivo SAP dentro de Quick Look: para cambiar el caso de carga o el factor, vuelve a la web y regenera el archivo.
- Modelos IFC muy grandes pueden exceder la memoria del móvil; la exportación incluye un límite de complejidad y muestra una explicación en caso de superarlo.

**Colores y sombras en AR móvil:** la deformada SAP usa una **textura cromática** con la misma escala azul–turquesa–amarillo–coral que en el visor web. Esto evita que Quick Look muestre en blanco las mallas coloreadas por vértice. Los elementos IFC conservan el color de su material. En **iPhone/iPad**, Quick Look puede generar una sombra automática, pero algunos modelos USDZ no la muestran. El panel de AR móvil ofrece ahora **«Añadir sombra suave bajo el modelo»**, activada por defecto. Se genera una proyección adicional en forma de textura semitransparente incorporada en el USDZ a partir de la geometría IFC o de las barras SAP. Es una **sombra aproximada, fijada al modelo y no interactiva con la iluminación real**. Puede desactivarse si el dispositivo ya genera una sombra nativa. En **Android/WebXR**, una luz virtual genera una sombra dinámica sobre un plano receptor transparente, tanto para los sólidos IFC como para las barras analíticas del modo Solo SAP. Se trata de una proyección gráfica, no de iluminación física de la habitación.

Los datos permanecen en el navegador; no se suben archivos IFC/SAP a un servidor para convertirlos. Estas vías móviles han pasado pruebas automatizadas, pero requieren validación funcional sobre dispositivos reales.

## Realidad mixta interactiva en Meta Quest 3 (XR 0.10)

El visor incluye un **menú 3D dentro del entorno inmersivo**, independiente de los paneles HTML del navegador. No requiere descargar software. Antes de entrar en **Quest 3 RM**, puedes cargar el IFC y el JSON exportado desde SAP2000, o utilizar el ejemplo incluido. Los resultados de los ejemplos se obtienen mediante rigidez matricial lineal de pórticos planos.

- **Gatillo sobre los botones del menú**: navegar por **Análisis y deformadas**, **Capas y elementos** y **Colocación en la sala**.
- **Gatillo sobre un elemento estructural**: seleccionarlo y mostrar su nombre/identificador. Mantener pulsado y girar el mando para **rotar el modelo IFC y las superposiciones SAP conjuntamente**.
- **Botón lateral de agarre**: mover la estructura con el mando.
- **Joystick izquierdo**: rotar en los ejes horizontal y vertical; **joystick derecho**: cambiar de tamaño progresivamente.
- **Botón A/X del mando**: recentrar el menú si lo has movido fuera del campo visual.
- **Cabecera del menú + gatillo**: arrastrar el menú. Alternativamente, pulsa **Mover menú**, señala el destino y vuelve a pulsar el gatillo para dejarlo fijo.
- **Análisis y deformadas**: pasar entre casos y patrones de cargas SAP y **arrastrar el nuevo slider de amplificación con el gatillo** (×0–×150, paso de 1). Los botones −/+ ajustan en pasos de 5. El cambio es exclusivamente visual, no modifica los resultados del análisis.
- **Modo «Solo SAP»**: desde «Análisis y deformadas» o «Capas y elementos», oculta toda la geometría IFC original y deformada, dejando únicamente las barras analíticas, nudos y cargas procedentes del JSON de SAP2000. Requiere un modelo IFC cargado y un JSON SAP con barras. Se pueden mantener las cargas encendidas/apagadas por separado. Esta vista es un esquema analítico de líneas/nudos, no una recreación de vigas sólidas calculadas por SAP2000. **Si el caso SAP incluye desplazamientos nodales y la deformada está activada, el mismo slider también amplifica la geometría de las barras y nudos analíticos.** El campo de desplazamientos real y sus unidades no cambian.
- **Capas y elementos**: activar/desactivar IFC, deformada, fuerzas, barras analíticas SAP y ejes. Contiene también **«Terreno y cimentación: ocultos»**, activado por defecto y reversible. En la demo desaparece la base de cimentación, **pero permanece el forjado de cubierta**. En un IFC externo se identifican elementos como `IfcSite`, `IfcGeographicElement`, `IfcFooting` y nombres habituales de terreno/cimentación. Las losas `IfcSlab`, vigas y pilares permanecen visibles. En IFC con clasificaciones o nombres atípicos es posible que haya que refinar el filtro.
- **Colocación en la sala**: si Quest Browser admite WebXR \`hit-test\`, apuntar a una superficie horizontal para colocar el modelo y mostrar una sombra **de contacto aproximada**. El visor no reconstruye la habitación ni mide automáticamente el tamaño de la mesa en esta versión.
- **Recentrar estructura**: devuelve el modelo a su posición inicial.

El filtro de terreno y el modo Solo SAP también pueden activarse desde el panel web de escritorio. El slider de deformada de escritorio permite ahora pasos de 1.

El menú se crea mediante una textura de canvas sobre un plano Three.js, con selección usando los rayos de los mandos. Las dimensiones del modelo están en metros visualizados y **no constituyen una nueva escala física del IFC/SAP ni modifican los resultados numéricos**. El modelo y los resultados SAP se transforman juntos para no desalinearse. Los valores \`u\` no cambian cuando aumenta la amplificación, solo lo hace la representación.

El recorte cercano WebXR se ajusta a 2,5 cm para poder inspeccionar los detalles de la estructura de cerca. Las funciones experimentales (interacción con los mandos y superficie real) están verificadas por compilación y pruebas automáticas, pero no se han validado físicamente en unas Quest 3 en esta sesión.


## Publicación directa en GitHub Pages (sin PC Windows)

Esta distribución incluye `.github/workflows/ci.yml` para verificar la compilación y `.github/workflows/pages.yml` para publicar en GitHub Pages **automáticamente al actualizar la rama main**, además de permitir publicación manual. Consulta **[GITHUB_PAGES.md](GITHUB_PAGES.md)** para instrucciones completas. No es necesario construir en Windows para ejecutar la web; **solo el exportador COM de SAP2000 necesita Windows**.

## 1. Probar en Windows / PC (recomendado)

1. Extrae el ZIP en una carpeta de tu PC.
2. Instala [Node.js LTS](https://nodejs.org/) si no lo tienes. Internet es necesario para instalar las librerías una vez.
3. Ejecuta con doble clic **`INICIAR_WINDOWS.bat`** o, desde una terminal situada en la carpeta:

   ```powershell
   npm install
   npm run dev
   ```

4. Abre **http://localhost:5173** en Chrome/Edge.
5. El edificio residencial de tres plantas aparece automáticamente. Selecciona «DEAD» o «WIND_X», visualiza esfuerzos y cambia el factor de amplificación.
6. Pulsa **Webcam + 3D**, acepta los permisos de cámara y verás el 3D superpuesto a la imagen real de la webcam.

**La webcam no hace seguimiento de posición ni anclaje espacial**. Para visión a través de Quest 3, se utiliza WebXR con passthrough; no es necesario disponer de Unity.

## 2. Abrir TU IFC

- Pulsa **Cargar IFC** y selecciona un archivo `.ifc` real. Se procesa **localmente en el navegador** mediante `web-ifc`.
- Es compatible con geometría IFC que el parser pueda leer. El límite de tamaño de archivo de esta versión es 300 MB. Para modelos grandes la memoria o el rendimiento pueden ser insuficientes.
- Si el modelo usa coordenadas georreferenciadas muy grandes, conviene exportarlo en coordenadas locales para evitar pérdida de precisión 3D.
- Puedes inspeccionar un elemento haciendo clic en él.

## 3. Obtener resultados reales de SAP2000

SAP2000 debe estar **instalado y abierto en el mismo PC Windows**, con el modelo analizado y guardado. La web **no ejecuta SAP2000**, solo lee su exportación.

1. Instala Python y la dependencia COM (solo para el exportador):

   ```powershell
   py -m pip install comtypes
   ```

2. Abre SAP2000 y el modelo ya calculado. Localiza el **nombre exacto del caso o combinación**, por ejemplo `DEAD`, `MODAL`, `COMB1`.
3. En PowerShell, desde el directorio del proyecto, ejecuta:

   ```powershell
   py scripts\exportar_sap2000.py --case DEAD --out resultado_sap.json
   ```

4. Si se creó `resultado_sap.json`, vuelve a la web y pulsa **Cargar SAP** para seleccionarlo. Usa los controles de caso y amplificación.
5. Comprueba que las barras analíticas y los nudos coinciden visualmente con el IFC. Si difieren en el **origen** pero no en rotación, introduce los offsets ΔX, ΔY, ΔZ (metros) y pulsa **Aplicar alineación**.

El exportador recopila:

- Identificadores y coordenadas XYZ de nudos (en metros).
- Conectividad de objetos frame.
- Desplazamientos U1, U2, U3 de un caso/comb. (metros).
- Cargas **distribuidas de fuerza** en objetos frame, con sus patrones, dirección y valores (kN/m).

El script usa el **CSI OAPI/COM**; es un punto de partida con pruebas frente a dobles de la API, pero **no se ha ejecutado contra una instancia SAP2000 real** desde este entorno. Puede requerir adaptar el ProgID o la firma de funciones a tu versión. No cambia el modelo analítico ni corre análisis; cambia temporalmente las unidades de presentación a kN,m,°C y las restaura.

**Análisis estáticos:** recomendado para la primera versión. En resultados con múltiples pasos, el exportador selecciona el último resultado devuelto por nudo; **no** reconstruye ni reproduce una historia temporal y no debe usarse para interpretar envolventes.

Si tu IFC y SAP tienen distinta orientación de ejes, distinta escala u otros cambios geométricos, **los offsets NO bastan**: requiere una transformación de coordenadas (rotación + traslación) que aún no está implementada.

### Alternativa sin COM

SAP2000 permite exportar tablas de análisis a Excel desde **File > Export > SAP2000 MS Excel Spreadsheet**. Se pueden convertir después al contrato JSON descrito abajo. La aplicación no interpreta directamente los formatos de tablas Excel de CSI.

## 4. Entrar en realidad mixta con Quest 3

Para WebXR es necesario servir el sitio mediante **HTTPS**, salvo `localhost` en el propio dispositivo.

1. En Windows ejecuta `npm install` y luego `npm run build`.
2. Publica el contenido de `dist/` en un alojamiento web estático que proporcione HTTPS (por ejemplo Netlify o GitHub Pages).
3. Abre la URL HTTPS desde **Quest Browser en tus Meta Quest 3**.
4. Pulsa **Quest 3 RM** y acepta los permisos. El visor comprobará compatibilidad `immersive-ar`.

El objeto aparece frente a la posición inicial del visor con escala física ajustable. Esta primera versión **no** incorpora *hit testing* de mesas ni anclajes persistentes ni gestos de mano para reposicionar el objeto. Los controles de escritorio no están garantizados durante la sesión inmersiva en todos los navegadores. La experiencia real en Quest 3 debe verificarse en hardware.

No se puede usar `http://IP-DEL-PC:5173` para la sesión inmersiva WebXR a través de la red local, ya que no es un contexto seguro. Para uso local en Quest hace falta un certificado HTTPS válido o una URL HTTPS publicada.

## 5. Qué significan las visualizaciones

- **Superficie IFC original:** geometría BIM de referencia, translúcida si hay deformada.
- **Deformada (color):** campo de magnitud |u| obtenido por interpolación inversa de distancias de los desplazamientos nodales; escala en **mm reales**.
- **Deformada (forma):** desplazamientos multiplicados por el factor de amplificación. **No representa la geometría deformada FEM exacta.** No emplea funciones de forma de los elementos originales, giros nodales ni curvaturas de barras.
- **Distribución de cargas:** bandas coloreadas sobre **barras analíticas** por intensidad de carga aplicada (kN/m). Solo aparecen flechas con sentido físico para direcciones **globales X/Y/Z (4/5/6)**. Las cargas locales se muestran como bandas sin atribuirles una dirección global.
- **No es un mapa de tensiones, deformaciones unitarias, momentos, cortantes ni esfuerzos internos.** No incluye por ahora cargas superficiales de `AreaObj`, cargas puntuales ni presión sobre forjados.

## 6. Datos JSON

Puedes probar el formato con `samples/sap_example.json`. Ojo: ese JSON contiene un pórtico más sencillo **diferente** de la geometría de demostración, por lo que no coinciden exactamente.

```json
{
  "meta": {"units": "m, kN"},
  "nodes": [{"id":"N1","x":0,"y":0,"z":0}],
  "frames": [{"id":"B1","i":"N1","j":"N2"}],
  "loads": [{"frame":"B1","pattern":"G","type":"force_per_length","csys":"Global","dir":6,"start":0,"end":1,"w1":-8,"w2":-8}],
  "cases": [{"name":"G","displacements":[{"node":"N1","ux":0,"uy":0,"uz":-0.001}]}]
}
```

- Todas las coordenadas y desplazamientos deben estar en **metros** y fuerzas en **kN**. La aplicación no convierte unidades entrantes automáticamente.
- `start`, `end` son fracciones entre 0 y 1 a lo largo de la barra.
- Un `case` puede contener desplazamientos por nudo y puede cargarse más de uno en el mismo JSON.
- `w1` y `w2` son las intensidades en ambos extremos del tramo de carga.

## 7. Pruebas incluidas

```sh
npm test
python tests/test_sap_export.py
```

Las pruebas cubren parsing/validación de JSON, filtrado por patrón, desplazamientos, offsets y salidas OAPI simuladas. **No sustituyen pruebas end-to-end** de importación IFC, WebGL, permisos de cámara, SAP2000 y Quest 3.

## 8. Tecnologías

- [Three.js](https://threejs.org/) (MIT), vista 3D y WebXR
- [web-ifc](https://github.com/ThatOpen/engine_web-ifc) (MPL-2.0), parser IFC/WebAssembly
- [Vite](https://vite.dev/), servidor y publicación web
- [CSI OAPI](https://www.csiamerica.com/developer), exportador desde SAP2000 (solo Windows)

La web no contiene claves, no envía archivos a servidores de la app ni necesita que conectes el programa SAP2000 con el navegador. Dependencias npm se descargan de sus repositorios durante `npm install`.

---

IMIS Structural XR / prototipo de investigación. 3 de noviembre de 2026.
