// Stamp the service worker version into the BUILT dist/sw.js (runs at the end of
// `npm run build`). Every build = a byte-different worker = browsers detect the
// update and the app can show the "update ready" toast. public/sw.js keeps the
// placeholder so dev/preview of an unstamped tree still works (version 'dev').
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

const dir = process.argv[2] ?? 'dist'; // optional out dir (probe / offline checks stamp a temp build)
const f = `${dir}/sw.js`;
if (!existsSync(f)) {
  console.error(`stamp-sw: ${f} missing — run after vite build`);
  process.exit(1);
}
const version = `${Date.now().toString(36)}`;
// Precache list: every hashed JS/CSS asset of this build (the app is code-split — lazy chunks
// must be available offline). Source maps are excluded; they're only fetched by DevTools.
const assets = existsSync(`${dir}/assets`)
  ? readdirSync(`${dir}/assets`).filter((n) => /\.(js|css)$/.test(n)).sort().map((n) => `/assets/${n}`)
  : [];
writeFileSync(
  f,
  readFileSync(f, 'utf8').replaceAll('__SW_VERSION__', version).replace('/*__PRECACHE__*/[]', JSON.stringify(assets)),
);
console.log(`stamp-sw: ${f} → version ${version}, precache ${assets.length} assets`);
