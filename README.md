# IMIS Structural XR

### 🌐 [Abrir la aplicación web — Structural IFC XR](https://enriquegarmac.github.io/Structural_IFC_XR/)

**Visualización interactiva de modelos BIM y análisis estructural en 3D, realidad aumentada, mixta y virtual.** Funciona desde el navegador, con experiencias inmersivas para Meta Quest y opciones móviles según el dispositivo.

## ¿Qué permite hacer?

- **Explorar modelos BIM/IFC:** visualizar edificios y estructuras, seleccionar elementos, ocultar capas, ajustar transparencias e inspeccionar la estructura resistente.
- **Visualizar resultados estructurales:** cargas, deformadas amplificadas, desplazamientos nodales, esfuerzos internos, reacciones, modos de vibración y pandeo lineal, cuando están disponibles en los datos importados.
- **Comparar modelo arquitectónico y modelo analítico:** superponer IFC y resultados, o mostrar únicamente barras, nudos y resultados del modelo de cálculo.
- **Interactuar en XR:** recorrer y manipular los modelos con mandos de Meta Quest en realidad mixta (RM) o realidad virtual (VR). También hay visualización 3D web y opciones de AR móvil.
- **Exportar ejemplos docentes:** descargar modelos IFC4 y resultados FEM en JSON.

## Experiencias incluidas

| Experiencia | Contenido |
| --- | --- |
| **Edificio residencial de tres plantas** | Modelo BIM con espacios interiores, cerramientos y estructura. Casos de peso propio y viento con análisis matricial simplificado de pórticos planos. |
| **Nave industrial metálica** | Pórticos y cerchas, cubierta y entorno industrial. Visualización de cargas, deformaciones, esfuerzos y reacciones. |
| **Celosías articuladas** | Actividad docente para modificar cargas y secciones y calcular desplazamientos, reacciones, axiles, tensiones y deformaciones mediante el método matricial de rigidez. |
| **Concurso de pasarelas** | Diseñar una pasarela entre dos apoyos con barras y tirantes, aplicar una carga, comprobar resistencia y flecha, comparar el peso y observar una representación esquemática del fallo. |

Las experiencias docentes se encuentran en la sección **Recursos docentes** de la aplicación.

## Modos de visualización

- **Vista 3D:** navegador de escritorio o móvil, sin gafas.
- **Meta Quest RM:** superposición del modelo sobre el entorno real mediante WebXR y passthrough. La detección de superficies depende del navegador.
- **Meta Quest VR:** inspección en un entorno virtual, con menú inmersivo y controles mediante mandos.
- **Android AR:** colocación e interacción en realidad aumentada en dispositivos compatibles con WebXR.
- **iPhone/iPad:** visualización en AR Quick Look mediante exportación USDZ de una instantánea de la escena. No permite editar interactivamente el modelo dentro de Quick Look.

Para utilizar las gafas, abre el **[enlace de la aplicación](https://enriquegarmac.github.io/Structural_IFC_XR/)** en Quest Browser y selecciona el modo RM o VR.

## Modelos y resultados propios

Puedes cargar un archivo **IFC** para la geometría BIM y un archivo **JSON** compatible para el modelo analítico y los resultados. La aplicación incluye un conversor de exportaciones Excel de **SAP2000**:

```bash
python scripts/sap2000_to_xr.py Modelo.xlsx -o Modelo_XR.json
```

Exporta desde SAP2000 las tablas de geometría y los resultados que necesites antes de ejecutar el conversor. La aplicación **no ejecuta SAP2000**: visualiza los resultados previamente calculados. La alineación entre IFC y modelo analítico puede ajustarse en el visor.

## Ejecutar localmente

Requiere Node.js:

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. Para ejecutar las pruebas automatizadas, utiliza `npm test`. La publicación web se realiza mediante GitHub Pages. Más información en [GITHUB_PAGES.md](GITHUB_PAGES.md).

## Alcance y limitaciones

**Prototipo de investigación y docencia.** Los ejemplos incorporan modelos mecánicos simplificados, no análisis tridimensionales completos. Las deformadas y animaciones de colapso pueden estar amplificadas o ser ilustrativas. El concurso no verifica pandeo ni todos los estados límite de una pasarela real. **No debe utilizarse para dimensionar estructuras ni certificar su seguridad.**

Desarrollado con **Three.js, WebXR, web-ifc y Vite**.
