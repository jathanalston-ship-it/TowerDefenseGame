// One-command ad enablement (docs/WEBSITE.md §3 · docs/RESEARCH.md §providers):
//
//   npm run set-ads -- google --client ca-pub-1234567890123456   # enable
//   npm run set-ads -- off                                       # disable again
//
// What `google` does, atomically and idempotently:
//   1. public/_headers — swaps the CSP line for the Google-ads-augmented variant
//      (script/frame/img/connect hosts the H5 Games Ads runtime needs);
//   2. public/ads.txt — writes the AdSense authorization line (required, easy to miss);
//   3. public/welcome/ads.js — sets the site display-ad provider + client id
//      (site slots stay hidden until you also map their numeric unit ids there);
//   4. prints the two Pages env vars to set (VITE_ADS_PROVIDER / VITE_ADS_GOOGLE_CLIENT)
//      — build-time values, so set them in Cloudflare and redeploy.
// `off` restores the strict CSP, removes ads.txt, and hides everything again.

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const BASE_CSP =
  "Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests";

const GOOGLE_CSP =
  "Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com https://pagead2.googlesyndication.com https://tpc.googlesyndication.com https://www.googletagservices.com; frame-src https://challenges.cloudflare.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com; connect-src 'self' https://cloudflareinsights.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://csi.gstatic.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests";

const args = process.argv.slice(2).filter((a) => a !== '--');
const mode = args[0];
const clientIdx = args.indexOf('--client');
const client = clientIdx >= 0 ? args[clientIdx + 1] : undefined;

function patchCsp(target: string): void {
  const f = 'public/_headers';
  const s = readFileSync(f, 'utf8');
  const out = s
    .split('\n')
    .map((line) => (line.trim().startsWith('Content-Security-Policy:') ? `  ${target}` : line))
    .join('\n');
  writeFileSync(f, out);
  console.log(`  ✓ ${f} — CSP ${target === BASE_CSP ? 'restored to strict' : 'augmented for Google ads'}`);
}

/** The committed public build config carries the VITE_ ad values — one command, all surfaces. */
function patchEnvProduction(provider: string, client: string): void {
  const f = '.env.production';
  if (!existsSync(f)) return;
  let s = readFileSync(f, 'utf8');
  s = s.replace(/^VITE_ADS_PROVIDER=.*$/m, `VITE_ADS_PROVIDER=${provider}`);
  s = s.replace(/^VITE_ADS_GOOGLE_CLIENT=.*$/m, `VITE_ADS_GOOGLE_CLIENT=${client}`);
  writeFileSync(f, s);
  console.log(`  ✓ ${f} — VITE_ADS_PROVIDER=${provider}`);
}

function patchSiteAds(provider: string, id: string): void {
  const f = 'public/welcome/ads.js';
  let s = readFileSync(f, 'utf8');
  s = s.replace(/var AD_PROVIDER = '[^']*';/, `var AD_PROVIDER = '${provider}';`);
  if (s.includes('var AD_CLIENT')) s = s.replace(/var AD_CLIENT = '[^']*';/, `var AD_CLIENT = '${id}';`);
  else s = s.replace(`var AD_PROVIDER = '${provider}';`, `var AD_PROVIDER = '${provider}';\n  var AD_CLIENT = '${id}'; // AdSense publisher id (set-ads)`);
  writeFileSync(f, s);
  console.log(`  ✓ ${f} — provider '${provider}'`);
}

if (mode === 'google') {
  if (!client || !/^ca-pub-\d{10,20}$/.test(client)) {
    console.error('usage: npm run set-ads -- google --client ca-pub-XXXXXXXXXXXXXXXX\n(find the id at adsense.google.com → Account → Account information)');
    process.exit(1);
  }
  patchCsp(GOOGLE_CSP);
  patchEnvProduction('google', client);
  writeFileSync('public/ads.txt', `google.com, ${client.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`);
  console.log('  ✓ public/ads.txt written (AdSense authorization — crawled at yourdomain/ads.txt)');
  patchSiteAds('adsense', client);
  console.log(`
All four surfaces are set (CSP, ads.txt, site ads.js, .env.production) — commit + push
to deploy; no dashboard fields needed. The in-game Field Research lane goes live once AdSense approves the
site for H5 Games Ads; until approval, studies quietly report 'unavailable'.
Site display slots additionally need their numeric unit ids mapped in
public/welcome/ads.js (create units in AdSense → copy each data-ad-slot number).
Test the reward loop any time with VITE_ADS_PROVIDER=simulated on a preview.`);
} else if (mode === 'status') {
  const headers = readFileSync('public/_headers', 'utf8');
  const adsJs = readFileSync('public/welcome/ads.js', 'utf8');
  const provider = /var AD_PROVIDER = '([^']*)'/.exec(adsJs)?.[1] ?? '?';
  const client = /var AD_CLIENT = '([^']*)'/.exec(adsJs)?.[1] ?? '';
  const googleCsp = headers.includes('pagead2.googlesyndication.com');
  const adsTxt = existsSync('public/ads.txt');
  const envProd = existsSync('.env.production') ? readFileSync('.env.production', 'utf8') : '';
  const viteProvider = /^VITE_ADS_PROVIDER=(\S*)/m.exec(envProd)?.[1] ?? '(unset)';
  const viteClient = /^VITE_ADS_GOOGLE_CLIENT=(\S*)/m.exec(envProd)?.[1] ?? '';
  console.log(`Ads wiring status:
  site provider (welcome/ads.js): ${provider}${client ? ` · ${client}` : ''}
  CSP (public/_headers):          ${googleCsp ? 'Google-augmented' : 'strict (no ad hosts)'}
  ads.txt:                        ${adsTxt ? 'present' : 'absent'}
  .env.production:                VITE_ADS_PROVIDER=${viteProvider}${viteClient ? ` · client ${viteClient}` : ''}`);
  const coherentOn = googleCsp && adsTxt && provider === 'adsense' && viteProvider === 'google';
  const coherentOff = !googleCsp && !adsTxt && provider === 'none' && (viteProvider === 'none' || viteProvider === '(unset)' || viteProvider === '');
  console.log(coherentOn ? '\n  ✓ COHERENT: ads ON everywhere — only AdSense/H5 approval remains external.'
    : coherentOff ? '\n  ✓ COHERENT: ads fully OFF (the shipped default).'
    : '\n  ✗ MIXED state — run `npm run set-ads -- google --client ca-pub-…` or `-- off` to realign all four surfaces.');
  process.exit(coherentOn || coherentOff ? 0 : 1);
} else if (mode === 'off') {
  patchCsp(BASE_CSP);
  patchEnvProduction('none', '');
  if (existsSync('public/ads.txt')) {
    unlinkSync('public/ads.txt');
    console.log('  ✓ public/ads.txt removed');
  }
  patchSiteAds('none', '');
  console.log('\nAds disabled on all four surfaces. Commit + push to deploy.');
} else {
  console.error('usage: npm run set-ads -- google --client ca-pub-… | off | status');
  process.exit(1);
}
console.log('\nReview with `git diff`, commit + push.');
