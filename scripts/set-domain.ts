// One-command launch configuration (docs/RELEASE-GUIDE.md):
//
//   npm run set-domain -- play.example.com --contact support@example.com
//
// Rewrites every domain/contact-dependent string across the repo, idempotently
// (safe to re-run with a new domain later):
//   • absolute og:url / og:image / twitter:image / canonical on the app + site pages
//   • robots.txt sitemap line + sitemap.xml <loc> entries
//   • PLACEHOLDER_CONTACT in the legal pages (when --contact is given)
// Commit + push afterwards; the next Pages deploy ships the branded URLs.

import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2).filter((a) => a !== '--');
const domainArg = args.find((a) => !a.startsWith('--'));
const contactIdx = args.indexOf('--contact');
const contact = contactIdx >= 0 ? args[contactIdx + 1] : undefined;

if (!domainArg || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domainArg)) {
  console.error('usage: npm run set-domain -- <domain> [--contact email]\n  e.g.  npm run set-domain -- play.example.com --contact support@example.com');
  process.exit(1);
}
const domain = domainArg.toLowerCase();
const origin = `https://${domain}`;

let edits = 0;
function patch(file: string, fn: (s: string) => string): void {
  const before = readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) {
    writeFileSync(file, after);
    edits++;
    console.log(`  ✓ ${file}`);
  }
}

/** Absolute-ize a tag's URL: replaces any prior origin OR a bare path. */
function setAbs(s: string, attrPrefix: string, path: string): string {
  const re = new RegExp(`(${attrPrefix})(?:https?://[^"']+)?(${path.replace('/', '\\/')})`, 'g');
  return s.replace(re, `$1${origin}$2`);
}

console.log(`Setting production domain → ${origin}${contact ? ` · contact → ${contact}` : ''}`);

patch('index.html', (s) => {
  s = setAbs(s, 'property="og:image" content="', '/og.png');
  s = setAbs(s, 'name="twitter:image" content="', '/og.png');
  // og:url — insert after og:site_name if absent, else rewrite
  if (s.includes('property="og:url"')) {
    s = s.replace(/(property="og:url" content=")[^"]*(")/, `$1${origin}/play$2`);
  } else {
    s = s.replace(
      '<meta property="og:site_name" content="ASSIMILATION" />',
      `<meta property="og:site_name" content="ASSIMILATION" />\n    <meta property="og:url" content="${origin}/play" />`,
    );
  }
  return s;
});

patch('public/welcome/index.html', (s) => {
  s = setAbs(s, 'property="og:image" content="', '/og.png');
  s = setAbs(s, 'name="twitter:image" content="', '/og.png');
  s = s.replace(/(rel="canonical" href=")[^"]*(")/, `$1${origin}/welcome/$2`);
  return s;
});

patch('public/robots.txt', (s) => s.replace(/https:\/\/[^/\s]+\/sitemap\.xml/, `${origin}/sitemap.xml`));
patch('public/sitemap.xml', (s) => s.replace(/https:\/\/[^/<]+\//g, `${origin}/`));

if (contact) {
  // The legal contact now lives in site/config.ts → CONTACT_EMAIL (the generated
  // contact/privacy/terms pages read it); it is no longer string-patched into HTML.
  // Set it there and re-run `npm run site` — this flag only reminds you.
  console.log(`  · contact address: set CONTACT_EMAIL in site/config.ts to ${contact}, then \`npm run site\` (this flag does not edit it)`);
}

console.log(edits > 0 ? `\nDone — ${edits} file(s) updated. Review with \`git diff\`, then commit + push.` : '\nNothing to change (already set).');
if (!contact) console.log('Tip: add --contact you@example.com to fill the legal-page contact too.');
console.log('Remaining manual token: PLACEHOLDER_JURISDICTION in terms.html (governing law — set with counsel).');
