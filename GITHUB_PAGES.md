# Publicar IMIS Structural XR en GitHub Pages (sin compilar en Windows)

Esta versión incluye un workflow de GitHub Actions que compila y publica la aplicación **cuando lo ejecutes manualmente**. **No hace falta Node.js ni Windows para ver el visor desde Meta Quest 3**.

## Publicación inicial

1. Crea un repositorio **privado** llamado `imis-structural-xr`. GitHub Pages desde un repo privado requiere GitHub Pro, Team o Enterprise. El sitio web publicado con Pages será **público** en general, a pesar de que el código del repositorio sea privado. No actives Pages si necesitas que el sitio web también sea privado.
2. Sube **el contenido de esta carpeta**, conservando la ruta oculta `.github/workflows/deploy.yml`, a la rama `main` del repositorio. Se puede hacer mediante GitHub Desktop, git desde cualquier sistema o la web de GitHub.
3. En GitHub, abre **Settings > Pages > Build and deployment > Source** y elige **GitHub Actions**.
4. Abre la pestaña **Actions**, selecciona el workflow de Pages y ejecútalo manualmente. El proceso llamado «Publicar IMIS Structural XR en GitHub Pages» instalará dependencias, ejecutará las pruebas, compilará la aplicación y publicará la carpeta `dist`.
5. La URL final será, habitualmente, `https://TU-USUARIO.github.io/imis-structural-xr/`. GitHub mostrará la URL definitiva en **Settings > Pages**. Si cambia el nombre del repositorio, cambia también el segmento de la URL.
6. Abre esa URL en **Meta Quest Browser** y pulsa **Quest 3 RM**. La aplicación comprueba si el navegador admite `immersive-ar`. Puede haber limitaciones de controles y tamaño de modelos: hay que comprobarlo físicamente.

> `vite.config.js` utiliza `base: './'`, por lo que las rutas del bundle y del WASM son relativas y funcionan en subcarpetas de GitHub Pages.

## Subir con git desde cualquier ordenador

Desde la carpeta extraída:

```sh
git init
git branch -M main
git add .
git commit -m "Publicar IMIS Structural XR"
git remote add origin https://github.com/TU-USUARIO/imis-structural-xr.git
git push -u origin main
```

Para evitar errores, crea primero el repositorio vacío **sin** seleccionar README ni `.gitignore` al crearlo, ya que estos archivos están incluidos aquí.

## Trabajar con modelos reales

- Los IFC se abren desde un selector de archivos en el navegador. Para abrirlos desde Quest hay que tener el archivo accesible localmente en las gafas (por ejemplo, descargado al dispositivo). La versión actual **no** descarga modelos automáticamente desde GitHub.
- El visor también importa los resultados de SAP2000 como JSON, a través de «Cargar SAP». La deformada se interpola desde desplazamientos nodales y no es la deformada exacta de elementos finitos.
- **SAP2000 no se ejecuta en GitHub Pages.** El script `scripts/exportar_sap2000.py` necesita ejecutarse en un Windows con SAP2000 calculado y abierto. Después se transfiere el JSON a Quest (o a otro dispositivo) para visualizarlo. No hace falta mantener abierto el PC durante la visualización.
- Evita incorporar IFC confidenciales o resultados de proyectos privados en un repositorio público. Los archivos escogidos desde el selector se procesan en el navegador, pero su disponibilidad y tratamiento en el dispositivo deben evaluarse según la sensibilidad de cada proyecto.

## Límites de esta primera versión

- Requiere WebGL en el navegador de destino.
- El modo de realidad mixta requiere un navegador, dispositivo y versión compatibles con sesiones WebXR `immersive-ar`.
- El objeto puede aparecer delante del usuario, pero no se han implementado anclajes persistentes, reconocimiento de superficies, desplazamiento por gestos ni menús XR completos. Tampoco se ha verificado con Quest 3 física.
- GitHub Pages es hosting estático: no ejecuta programas Python ni SAP2000 en el servidor.

## Actualizar la web

La publicación está configurada como **manual** para evitar una publicación pública accidental. Cuando decidas desplegarla, ve a **Actions > Publicar IMIS Structural XR en GitHub Pages > Run workflow**. No es necesario compilar manualmente en un PC.
