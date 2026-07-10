// Generate the marketing site into public/ (docs/WEBSITE.md §architecture).
//   npm run site        — regenerate all pages (COMMIT the output; a drift test enforces sync)
// Pages are plain committed HTML so Cloudflare Pages serves them directly, the dev server
// previews them, and every diff is reviewable. Run after content/data changes; `npm run site`
// also refreshes patch notes first so /news/ is current.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildSite } from '../site/build';

const site = buildSite();
let n = 0;
for (const [servedPath, content] of site) {
  const rel = servedPath.endsWith('/') ? servedPath + 'index.html' : servedPath;
  const file = join('public', rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  n++;
}
console.log(`gen-site: ${n} files written into public/ (pages, sitemap, 404)`);
