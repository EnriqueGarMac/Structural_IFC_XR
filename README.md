## Visualización y consulta de resultados

- **Encuadre al cargar:** la cámara centra y encuadra automáticamente el
  modelo visible completo. Si el terreno se muestra, se incluye en el encuadre;
  si está oculto, se adapta al edificio o nave. El botón de restablecer la vista
  recupera ese encuadre. La orientación y los datos de ingeniería no cambian.
  Se ajusta la caja del modelo tal como la ve la cámara, no su esfera
  envolvente, de modo que los modelos esbeltos (una viga de 18 m) llenan el visor.
- **Controles según la vista:** los controles que no afectan a la vista de
  resultados activa quedan atenuados y desactivados, sin cambiar de sitio.
  Por ejemplo, el caso, el patrón de carga y la amplificación de la deformada
  en los modos de vibración o de pandeo. El menú de Meta Quest sigue el mismo
  criterio.
- **Cristales IFC:** las ventanas comienzan con una opacidad de aproximadamente
  **60 %** (40 % de transparencia), incluso si el resto del IFC es opaco.
  El control general de transparencia permite reducirla todavía más.
- **Desplazamientos nodales:** en la vista Deformada, apunta a un nodo con el
  ratón o el mando de Quest para consultar Ux, Uy, Uz y la magnitud resultante,
  siempre en mm **sin amplificación**. Pulsa sobre el nodo para señalarlo.
- **Sección de esfuerzos:** apuntar a un diagrama muestra una línea sobre
  la sección exacta analizada. Al pulsar, queda marcada; los valores y la
  posición de la sección proceden de la consulta al diagrama.
- **Escala de colores de resultados:** haz clic directamente sobre la
  **leyenda** para elegir entre cuatro escalas. Una sola selección modifica
  desplazamientos, cargas, formas modales o diagramas del resultado activo.
  **Los materiales y colores IFC no cambian.** En Meta Quest se utiliza el
  botón «Escala de resultados» del menú Capas. Las reacciones mantienen su
  identificación por eje X/Y/Z, no una escala escalar de resultados.
- **Pavimentos del edificio:** las tres plantas incluyen superficies de
  acabado interior como entidades IFC4 `IfcCovering`, con gres en cocina
  y baño y tarima en salón y dormitorios. Permanecen opacos al transparentar
  la envolvente y dejan libre el hueco de la escalera.
- **Barra de navegación:** las instrucciones de ratón están situadas a la
  derecha de los botones Vista 3D / Cámara / Quest, sin flotar encima del
  modelo. En pantallas estrechas se ocultan.
- **Deformada:** el valor máximo se ha duplicado respecto a la revisión
  anterior, hasta una deformación ilustrativa del **12 % de la dimensión
  estructural**. La deformada inicial se mantiene en torno al 1,3 %.
  Ninguno de estos factores modifica los desplazamientos FEM reales.

---

## Interfaz definitiva

Los controles muestran «Nodos», «Barras», «Cargar resultados» y
«Solo modelo de cálculo» en lugar de etiquetas dependientes del origen
SAP2000. Al inspeccionar los diagramas de esfuerzos se muestran únicamente
la barra, el componente, el valor con unidades y la posición de la sección.
El método de muestreo/interpolación se conserva en la implementación y
documentación técnica, pero no aparece en cada consulta numérica.

---

## Amplificación de la deformada: control seguro

Al cargar el edificio de tres plantas, la nave o un JSON SAP2000, el rango
del deslizador se calcula de nuevo para cada caso **DEAD / WIND_X**.
Se utiliza la longitud máxima de la estructura resistente (nudos de análisis),
sin contar la parcela ni la explanada de la nave. También se consideran
los máximos de las curvas de desplazamientos de barras, que pueden superar
al desplazamiento nodal en el centro de un vano.

La deformada inicial es ahora aproximadamente **tres veces más visible**
que en la versión anterior: su máxima separación gráfica es cercana al
**1,3 % de la dimensión estructural**. Al llegar al extremo del deslizador,
la representación se limita aproximadamente al **12 % de esa dimensión**,
salvo situaciones excepcionales asociadas a un rango mínimo.
No se modifican esfuerzos, reacciones, desplazamientos físicos ni factores
en el archivo JSON. Se aplica igual en escritorio, Quest y AR móvil.

Se ha retirado el plano de sombra incluido artificialmente en el USDZ
del iPhone, junto con su interruptor. La sombra nativa de AR Quick Look,
si está disponible en el dispositivo, puede seguir apareciendo.

---

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
   cargas, diagramas de esfuerzos, formas modales y modos de pandeo. En los
   modos de vibración y de pandeo, los botones −/+ ajustan la amplitud de la forma.
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

## De SAP2000 a la web: exportar a Excel y convertir a JSON

Es la vía recomendada para cargar un modelo propio. No necesita SAP2000
abierto ni librerías de Python adicionales.

1. En SAP2000, con el modelo **ya calculado**, usa **File > Export > SAP2000 MS
   Excel Spreadsheet** y marca las tablas que vayas a usar:

   | Para… | Tablas |
   |---|---|
   | Geometría (imprescindible) | `Joint Coordinates`, `Connectivity - Frame` y/o `Connectivity - Area` |
   | Casos y deformadas | `Joint Displacements` (la lista de casos de la web sale de esta tabla) |
   | Esfuerzos en barras | `Element Forces - Frames` |
   | Apoyos y reacciones | `Joint Restraint Assignments`, `Joint Reactions` |
   | Modos de vibración | `Modal Periods And Frequencies`, `Modal Participating Mass Ratios` |
   | Pandeo lineal | `Buckling Factors`, `Case - Buckling 2 - Loads` |
   | Cargas | `Load Pattern Definitions`, `Joint Loads - Force`, `Frame Loads - Distributed`, `Frame Loads - Point` |
   | Peso propio | `Frame Props 01 - General`, `Frame Section Assignments`, `Area Section Properties`, `Area Section Assignments`, `MatProp 01 - General`, `MatProp 02 - Basic Mech Props` |

   Las tablas de tensiones, deformaciones y fuerzas de placas
   (`Element Stresses`, `Element Strains`, `Element Forces - Area Shells`,
   `Element Joint Forces - Areas`) todavía no se usan y pueden ocupar
   decenas de MB, así que es mejor no exportarlas.
2. Convierte el Excel con Python 3.10 o superior:

   ```powershell
   py scripts\sap2000_to_xr.py Modelo.xlsx -o Modelo_XR.json
   ```

   El conversor acepta las unidades de SAP2000 (N, kN, MN, Kgf, tonf, lb, kip;
   mm, cm, m, in, ft) y escribe siempre m, kN y kN·m. Al terminar resume lo
   exportado y avisa de lo que no ha podido representar, sin inventarlo.
   Con `--format rich` genera el esquema anidado `imis.sap2000.xr/1`; la web
   lee ambos formatos.
3. En la web, pulsa **Cargar resultados** y elige el JSON. Si no hay IFC, se
   crean barras cilíndricas y placas planas a partir del modelo de cálculo.
4. En **Vista de resultados**, elige **Desplazamientos**, **Esfuerzos internos**
   (componentes locales `P, V2, V3, T, M2, M3`), **Reacciones en apoyos**,
   **Modos de vibración** o **Modos de pandeo**.

Tratamiento de las cargas en el conversor:

- **Distribuidas en barras:** las globales X/Y/Z y *Gravity* (−Z) se dibujan
  con flechas; las proyectadas se convierten a intensidad por longitud real;
  las locales 1/2/3 se dibujan como bandas, sin dirección global.
- **Puntuales**, en nudos y en barras: flecha en el punto de aplicación.
- **Cargas de superficie** (`Area Loads`), momentos repartidos y otras
  asignaciones: se conservan en el JSON (`loadAssignments`), pero no se dibujan.
- **Envolventes de combinaciones:** los valores *Max* y *Min* se cargan como
  dos casos, `COMB (Max)` y `COMB (Min)`.

En **Meta Quest**, abre **Análisis y deformadas** y utiliza el botón
**VISTA** para alternar entre desplazamientos, diagramas, reacciones,
vibraciones y pandeo. Las flechas del campo de detalle cambian el esfuerzo o el modo.

**Importante:** las formas modales y de pandeo están normalizadas: sus amplitudes
no equivalen a desplazamientos físicos. Las barras y placas generadas a partir
del JSON son aproximaciones analíticas, no la geometría exacta IFC. El visor no
realiza un cálculo FEM ni transforma esfuerzos locales a globales.

---

## Modelos de placas y pandeo lineal

El visor también carga modelos con elementos de área (*Shell*) de SAP2000 y
casos de **pandeo lineal** (*Linear Buckling*). Como ejemplo se incluye
`sap2000/test_lateral_buckling_XR.json`: una viga en I de 18 m modelada con
480 placas, con pandeo lateral.

- **Placas:** se dibujan como superficies planas, con una malla por sección y
  los vértices sobre los nudos de SAP2000. Desplazamientos y formas modales
  coinciden con SAP en los nudos y varían linealmente dentro de cada placa.
  Al hacer clic se identifica la placa (`Placa 1205 · sección`). En
  **Solo modelo de cálculo** se ven sus aristas.
- **Modos de pandeo:** la leyenda muestra el factor **λ** de cada modo y, si el
  conversor ha podido sumar las cargas de referencia del caso, la carga crítica
  **Pcr = λ · P_ref**. Un λ **negativo** significa que la estructura pandea con
  las cargas de referencia **invertidas**.
- **Forma de pandeo:** es **fija**, porque se trata de una bifurcación y no de
  una vibración, y se escala con el deslizador de amplitud. Su amplitud y su
  signo son arbitrarios. La vista dibuja además las cargas de referencia del caso.
- En **Meta Quest**: **VISTA → Modos de pandeo**; los botones −/+ ajustan la amplitud.

Límites actuales:
- aún no hay mapas de tensiones en placas;
- Pcr no se calcula si las cargas de referencia incluyen cargas que el
  conversor no sabe sumar, como las de superficie (en ese caso solo se da λ);
- la alineación automática con un IFC y la exportación USDZ en
  **Solo modelo de cálculo** necesitan barras.

---
🌐 **[Abrir Structural IFC XR — aplicación web](https://enriquegarmac.github.io/Structural_IFC_XR/)**

> Acceso directo desde el navegador, también desde Meta Quest 3. Sin instalar nada.

# IMIS Structural XR — IFC + SAP2000 + Meta Quest 3

Prototipo abierto para visualizar **geometría IFC** y **resultados de SAP2000** (modelos de barras y placas: cargas, deformadas, esfuerzos, reacciones, modos de vibración y de pandeo) en escritorio, webcam, móvil y realidad mixta o virtual en Meta Quest 3.

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

**Colores y sombras en AR móvil:** la deformada SAP usa una **textura cromática** con la misma escala que el visor web. En **iPhone/iPad**, la exportación USDZ ya **no incluye el plano ni la textura de sombra artificial**, que interferían con la colocación. Se deja que **AR Quick Look** gestione el suelo y las sombras nativas que admita el dispositivo. En **Android/WebXR** se mantiene la representación independiente de sombras virtuales, sin cambiar el terreno geométrico IFC.

Los datos permanecen en el navegador; no se suben archivos IFC/SAP a un servidor para convertirlos. Estas vías móviles han pasado pruebas automatizadas, pero requieren validación funcional sobre dispositivos reales.

## Realidad mixta interactiva en Meta Quest 3 (XR 0.10)

El visor incluye un **menú 3D dentro del entorno inmersivo**, independiente de los paneles HTML del navegador. No requiere descargar software. Antes de entrar en **Quest 3 RM**, puedes cargar el IFC y el JSON exportado desde SAP2000, o utilizar el ejemplo incluido. Los resultados de los ejemplos se obtienen mediante rigidez matricial lineal de pórticos planos.

- **Gatillo sobre los botones del menú**: navegar por **Análisis y deformadas**, **Capas y elementos** y **Colocación en la sala**.
- **Gatillo sobre un elemento estructural**: seleccionarlo y mostrar su nombre/identificador. Mantener pulsado y girar el mando para **rotar el modelo IFC y las superposiciones SAP conjuntamente**.
- **Botón lateral de agarre**: mover la estructura con el mando.
- **Joystick izquierdo**: rotar en los ejes horizontal y vertical; **joystick derecho**: cambiar de tamaño progresivamente.
- **Botón A/X del mando**: recentrar el menú si lo has movido fuera del campo visual.
- **Cabecera del menú + gatillo**: arrastrar el menú. Alternativamente, pulsa **Mover menú**, señala el destino y vuelve a pulsar el gatillo para dejarlo fijo.
- **Análisis y deformadas:** los casos SAP y el control de amplificación se muestran en la misma página. El máximo es **adaptativo por caso y por modelo**, usando la dimensión de la estructura y el mayor desplazamiento de las curvas FEM (incluido el vano), no las dimensiones de la parcela. El control XR y los botones −/+ usan incrementos proporcionales y suaves. Solo cambia la representación gráfica, nunca el cálculo.
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

La vía recomendada es exportar a Excel y usar el conversor (sección **De SAP2000 a la web**, más arriba). Como alternativa, más limitada, existe un exportador por COM que solo obtiene los desplazamientos de un caso y las cargas distribuidas en barras.

Para el exportador COM, SAP2000 debe estar **instalado y abierto en el mismo PC Windows**, con el modelo analizado y guardado. La web **no ejecuta SAP2000**, solo lee su exportación.

1. Instala Python y la dependencia COM (solo para el exportador):

   ```powershell
   py -m pip install comtypes
   ```

2. Abre SAP2000 y el modelo ya calculado. Localiza el **nombre exacto del caso o combinación**, por ejemplo `DEAD`, `MODAL`, `COMB1`.
3. En PowerShell, desde el directorio del proyecto, ejecuta:

   ```powershell
   py scripts\exportar_sap2000.py --case DEAD --out resultado_sap.json
   ```

4. Si se creó `resultado_sap.json`, vuelve a la web y pulsa **Cargar resultados** para seleccionarlo. Usa los controles de caso y amplificación.
5. Comprueba que las barras analíticas y los nudos coinciden visualmente con el IFC (ver **Alineación con el IFC**).

El exportador recopila:

- Identificadores y coordenadas XYZ de nudos (en metros).
- Conectividad de objetos frame.
- Desplazamientos U1, U2, U3 de un caso/comb. (metros).
- Cargas **distribuidas de fuerza** en objetos frame, con sus patrones, dirección y valores (kN/m).

El script usa el **CSI OAPI/COM**; es un punto de partida con pruebas frente a dobles de la API, pero **no se ha ejecutado contra una instancia SAP2000 real** desde este entorno. Puede requerir adaptar el ProgID o la firma de funciones a tu versión. No cambia el modelo analítico ni corre análisis; cambia temporalmente las unidades de presentación a kN,m,°C y las restaura.

**Análisis estáticos:** recomendado para la primera versión. En resultados con múltiples pasos, el exportador selecciona el último resultado devuelto por nudo; **no** reconstruye ni reproduce una historia temporal y no debe usarse para interpretar envolventes.

### Alineación con el IFC

Al cargar un IFC y un JSON con barras, el visor prueba las **24 orientaciones ortogonales** del IFC: en cada una centra ambos modelos y mide cuánto se alejan las barras de SAP2000 de la geometría IFC, y se queda con la que mejor coincide. El selector **Orientación del modelo IFC** permite fijar una rotación concreta. Los offsets ΔX, ΔY, ΔZ (metros) y **Aplicar alineación** sirven para el ajuste fino del origen. No se corrigen escalas distintas ni rotaciones que no sean múltiplos de 90°, y con modelos solo de placas la alineación automática aún no está disponible.

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
- **Cargas puntuales:** flechas en nudos y barras, con la punta en el punto de aplicación y longitud ilustrativa.
- **No es un mapa de tensiones, deformaciones unitarias, momentos, cortantes ni esfuerzos internos.** No incluye por ahora cargas superficiales de `AreaObj` ni presión sobre forjados.

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

El conversor `scripts/sap2000_to_xr.py` añade campos opcionales que la web también lee:

- `areas`: placas, con sus nudos (3 o más), sección y espesor.
- `pointLoads`: cargas puntuales con posición `xyz_m` y vector `force_kN` globales.
- `forces`, `jointReactions`, `frameCurves`: esfuerzos de barras, reacciones y curvas de deformada por caso.
- `modes`: modos de vibración (`frequency_hz`, forma normalizada `jointShape`).
- `bucklingModes` y `bucklingReference`: factores λ, formas de pandeo, cargas de referencia y, cuando se pueden calcular, cargas críticas.

## 7. Pruebas incluidas

```sh
npm test
python tests/test_sap_export.py
python tests/test_sap2000_to_xr.py
```

Las pruebas cubren parsing/validación de JSON, filtrado por patrón, desplazamientos, offsets, salidas OAPI simuladas y el conversor Excel → JSON con libros sintéticos (barras, placas, pandeo, unidades y envolventes). **No sustituyen pruebas end-to-end** de importación IFC, WebGL, permisos de cámara, SAP2000 y Quest 3.

## 8. Tecnologías

- [Three.js](https://threejs.org/) (MIT), vista 3D y WebXR
- [web-ifc](https://github.com/ThatOpen/engine_web-ifc) (MPL-2.0), parser IFC/WebAssembly
- [Vite](https://vite.dev/), servidor y publicación web
- [CSI OAPI](https://www.csiamerica.com/developer), exportador desde SAP2000 (solo Windows)

La web no contiene claves, no envía archivos a servidores de la app ni necesita que conectes el programa SAP2000 con el navegador. Dependencias npm se descargan de sus repositorios durante `npm install`.

---

IMIS Structural XR / prototipo de investigación. 3 de noviembre de 2026.
