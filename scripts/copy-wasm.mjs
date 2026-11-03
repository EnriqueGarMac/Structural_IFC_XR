import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const src = join(root, 'node_modules', 'web-ifc');
const dest = join(root, 'public', 'wasm');
mkdirSync(dest, { recursive: true });
for (const name of ['web-ifc.wasm', 'web-ifc-mt.wasm', 'web-ifc-mt.worker.js']) {
  if (existsSync(join(src, name))) cpSync(join(src, name), join(dest, name));
}
if (!existsSync(join(dest, 'web-ifc.wasm'))) throw new Error('No se encontró web-ifc.wasm tras npm install');
console.log('WASM de IFC preparado en public/wasm/');
