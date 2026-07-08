// Launch preflight (docs/RELEASE-GUIDE.md): one command answers "am I ready?".
//
//   npm run preflight                       — local repo/config checks
//   npm run preflight -- --url https://x.pages.dev   — plus live checks against a deployment
//
// Every check prints ✓ / ✗ / – (not applicable yet) with the exact next action.
// Exit code 1 only on hard failures (✗), so it can gate CI if wanted.

import { existsSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2).filter((a) => a !== '--');
const urlIdx = args.indexOf('--url');
const baseUrl = urlIdx >= 0 ? args[urlIdx + 1]?.replace(/\/$/, '') : undefined;

let fails = 0;
const ok = (msg: string): void => console.log(`  ✓ ${msg}`);
const warn = (msg: string, fix: string): void => console.log(`  – ${msg}\n      → ${fix}`);
const bad = (msg: string, fix: string): void => {
  fails++;
  console.log(`  ✗ ${msg}\n      → ${fix}`);
};

console.log('── Local checks ────────────────────────────────────────────');

// Repo shape
for (const f of ['package-lock.json', '.node-version', 'public/_headers', 'public/_redirects', 'public/manifest.json', 'migrations/0001_init.sql', 'functions/api/health.ts']) {
  if (existsSync(f)) ok(`${f} present`);
  else bad(`${f} missing`, 'restore it from the repository — Pages builds depend on it');
}

// D1 binding configured locally
const wrangler = readFileSync('wrangler.toml', 'utf8');
if (wrangler.includes('REPLACE_WITH_YOUR_D1_DATABASE_ID')) {
  warn('wrangler.toml still has the D1 placeholder id', 'npx wrangler@3 d1 create assimilate-db, paste the id, then npm run db:migrate (RELEASE-GUIDE step 5)');
} else ok('wrangler.toml carries a real D1 database id');

// Domain-dependent strings
const robots = readFileSync('public/robots.txt', 'utf8');
if (robots.includes('PLACEHOLDER_DOMAIN')) {
  warn('production domain not set (robots/sitemap/og URLs)', 'npm run set-domain -- your.domain --contact you@example.com (RELEASE-GUIDE step 12)');
} else ok('domain strings set (robots/sitemap)');

// Legal placeholders
const terms = readFileSync('public/welcome/terms.html', 'utf8');
const privacy = readFileSync('public/welcome/privacy.html', 'utf8');
if (privacy.includes('PLACEHOLDER_CONTACT') || terms.includes('PLACEHOLDER_CONTACT')) {
  warn('legal contact not filled', 'run set-domain with --contact, or edit public/welcome/{privacy,terms}.html');
} else ok('legal contact filled');
if (terms.includes('PLACEHOLDER_JURISDICTION')) {
  warn('governing law not set in terms.html', 'set PLACEHOLDER_JURISDICTION with counsel before launch');
} else ok('governing law set');

// Secrets hygiene: nothing sensitive committed
for (const f of ['.dev.vars', '.env', '.env.local']) {
  if (existsSync(f)) {
    const gi = readFileSync('.gitignore', 'utf8');
    if (gi.split('\n').some((l) => l.trim() === f || (f === '.dev.vars' && l.trim() === '.dev.vars'))) ok(`${f} exists and is gitignored`);
    else bad(`${f} exists but is NOT gitignored`, 'add it to .gitignore immediately');
  }
}

async function live(): Promise<void> {
  if (!baseUrl) {
    console.log('\n── Live checks skipped ─────────────────────────────────────');
    console.log('  – pass a deployment to test it:  npm run preflight -- --url https://<project>.pages.dev');
    return;
  }
  console.log(`\n── Live checks · ${baseUrl} ──────────────────────`);
  const get = async (path: string): Promise<Response | null> => {
    try {
      return await fetch(baseUrl + path);
    } catch {
      return null;
    }
  };

  const health = await get('/api/health');
  if (!health) bad('deployment unreachable', 'check the URL / deploy state');
  else {
    const h = (await health.json().catch(() => null)) as Record<string, unknown> | null;
    if (!h) bad('/api/health returned non-JSON', 'check Functions deployed (build log lists "Functions")');
    else {
      for (const [key, fix] of Object.entries({
        db: 'bind D1 as "DB" (Settings → Functions → D1 bindings) and redeploy — RELEASE-GUIDE step 6',
        stripe: 'set STRIPE_SECRET_KEY — RELEASE-GUIDE steps 9/16',
        webhook: 'set STRIPE_WEBHOOK_SECRET — RELEASE-GUIDE steps 10/16',
        turnstile: 'set TURNSTILE_SECRET_KEY (+ VITE_TURNSTILE_SITE_KEY) — step 7',
        dayTickets: 'set DAY_TICKET_SECRET — step 8',
      })) {
        if (h[key] === true) ok(`health: ${key}`);
        else warn(`health: ${key} not configured`, fix);
      }
      if (h.environment === 'production') ok('health: environment=production');
      else warn(`health: environment=${String(h.environment)}`, 'set ENVIRONMENT=production on the Production env — step 8');
    }
  }

  const index = await get('/');
  if (index?.ok) {
    const csp = index.headers.get('content-security-policy');
    if (csp?.includes("default-src 'self'")) ok('CSP header served');
    else bad('CSP header missing', 'confirm public/_headers shipped in dist/ (rebuild + redeploy)');
  } else bad('/ not serving', 'check the deployment');

  for (const [path, name] of [
    ['/manifest.json', 'PWA manifest'],
    ['/og.png', 'social card'],
    ['/welcome/', 'landing page'],
    ['/sitemap.xml', 'sitemap'],
  ] as const) {
    const r = await get(path);
    if (r?.ok) ok(`${name} reachable (${path})`);
    else bad(`${name} unreachable (${path})`, 'rebuild + redeploy; check public/ contents');
  }
}

void live().then(() => {
  console.log(`\n${fails === 0 ? '✓ Preflight clean — remaining "–" items are the launch checklist.' : `✗ ${fails} hard failure(s) — fix the ✗ lines above.`}`);
  process.exit(fails === 0 ? 0 : 1);
});
