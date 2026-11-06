🌐 **[Abrir Structural IFC XR — aplicación web](https://enriquegarmac.github.io/Structural_IFC_XR/)**

> Acceso directo desde el navegador, también desde Meta Quest 3. Sin instalar nada.

# IMIS Structural XR — IFC + SAP2000 + Meta Quest 3

Prototipo abierto para visualizar **geometría IFC**, **cargas distribuidas aplicadas a barras** y **deformadas nodales de SAP2000** en escritorio, webcam y realidad mixta en Meta Quest 3.

**Estado:** prototipo 0.1.0, no es una herramienta de cálculo ni de verificación estructural. La demo contiene **resultados sintéticos**, no extraídos de SAP2000. La conexión COM con SAP2000 requiere verificarse en tu instalación.



## Realidad aumentada desde el móvil (Android e iPhone)

Entra directamente en **[Structural IFC XR](https://enriquegarmac.github.io/Structural_IFC_XR/)** desde tu teléfono y pulsa **«AR móvil»**. Carga primero el IFC y, si necesitas resultados estructurales, el JSON de SAP2000. También puedes probar el pórtico de demostración (datos sintéticos).

- **Android con Chrome + WebXR/ARCore:** se inicia una sesión de realidad aumentada con cámara. Apunta a una mesa o al suelo y usa **Colocar aquí** para anclar visualmente el modelo. La barra táctil permite cambiar el tamaño, ajustar el factor de deformada ×0–×150 y alternar Solo SAP. Puedes buscar otra superficie y salir. La disponibilidad depende de ARCore, permisos y compatibilidad WebXR/detección de superficies del dispositivo.
- **iPhone/iPad con Safari:** se genera **en el propio teléfono** una copia USDZ de la **vista actual**. Pulsa **Abrir en AR Quick Look** después de preparar el archivo. Allí puedes colocar, trasladar y escalar el modelo con los dedos. La exportación respeta las capas IFC visibles y el estado actual de la deformada. En modo **Solo SAP**, convierte las barras y nudos analíticos en cilindros/esferas para su visualización AR. Es una **instantánea**, no un visor interactivo SAP dentro de Quick Look: para cambiar el caso de carga o el factor, vuelve a la web y regenera el archivo.
- Modelos IFC muy grandes pueden exceder la memoria del móvil; la exportación incluye un límite de complejidad y muestra una explicación en caso de superarlo.

Los datos permanecen en el navegador; no se suben archivos IFC/SAP a un servidor para convertirlos. Estas vías móviles han pasado pruebas automatizadas, pero requieren validación funcional sobre dispositivos reales.

## Realidad mixta interactiva en Meta Quest 3 (XR 0.4)

El visor incluye un **menú 3D dentro del entorno inmersivo**, independiente de los paneles HTML del navegador. No requiere descargar software. Antes de entrar en **Quest 3 RM**, puedes cargar el IFC y el JSON exportado desde SAP2000, o utilizar el ejemplo incluido. Los resultados del ejemplo son **sintéticos**.

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
5. La demo de un pórtico de 8 × 6 m aparece automáticamente. Selecciona «G + Q (demostración)» y cambia el factor de amplificación.
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
