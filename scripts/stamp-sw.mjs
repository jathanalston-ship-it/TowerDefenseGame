// Stamp the service worker version into the BUILT dist/sw.js (runs at the end of
// `npm run build`). Every build = a byte-different worker = browsers detect the
// update and the app can show the "update ready" toast. public/sw.js keeps the
// placeholder so dev/preview of an unstamped tree still works (version 'dev').
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const f = 'dist/sw.js';
if (!existsSync(f)) {
  console.error('stamp-sw: dist/sw.js missing — run after vite build');
  process.exit(1);
}
const version = `${Date.now().toString(36)}`;
writeFileSync(f, readFileSync(f, 'utf8').replace('__SW_VERSION__', version));
console.log(`stamp-sw: dist/sw.js → version ${version}`);
