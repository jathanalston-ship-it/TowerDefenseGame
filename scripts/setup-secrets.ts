// One-command server-secret setup (docs/RELEASE-GUIDE.md step 7):
//
//   npm run setup-secrets -- --stripe-key sk_live_… --webhook-secret whsec_… --turnstile-secret 0x…
//
// Pushes each provided secret to the Pages project with `wrangler pages secret put`
// (encrypted; production env — add `--preview` to ALSO write the preview env), and
// ALWAYS ensures DAY_TICKET_SECRET exists (auto-generated unless --day-ticket is given).
// Requires `npx wrangler@3 login` once beforehand, and the Pages project to exist
// (RELEASE-GUIDE step 4). Public build-time values live in .env.production instead —
// edit + commit that file; no dashboard needed for either half.

import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2).filter((a) => a !== '--');
const val = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const project = val('--project') ?? (/name\s*=\s*"([^"]+)"/.exec(readFileSync('wrangler.toml', 'utf8'))?.[1] ?? 'assimilate');
const preview = args.includes('--preview');

const secrets: [name: string, value: string | undefined, hint: string][] = [
  ['STRIPE_SECRET_KEY', val('--stripe-key'), 'Stripe → Developers → API keys (sk_…) — RELEASE-GUIDE step 9'],
  ['STRIPE_WEBHOOK_SECRET', val('--webhook-secret'), 'Stripe → Developers → Webhooks → Signing secret (whsec_…) — step 10'],
  ['TURNSTILE_SECRET_KEY', val('--turnstile-secret'), 'Cloudflare → Turnstile → your site → Secret key — step 7'],
  ['DAY_TICKET_SECRET', val('--day-ticket') ?? randomBytes(32).toString('hex'), '(auto-generated — nothing to look up)'],
];

function put(name: string, value: string, env: 'production' | 'preview'): boolean {
  const envFlag = env === 'preview' ? ' --environment preview' : '';
  try {
    execSync(`npx wrangler@3 pages secret put ${name} --project-name ${project}${envFlag}`, {
      input: `${value}\n`,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch (e) {
    const err = e as { stderr?: Buffer; stdout?: Buffer };
    console.error(`  ✗ ${name} (${env}): ${String(err.stderr ?? err.stdout ?? e).slice(0, 300)}`);
    return false;
  }
}

console.log(`Setting server secrets on Pages project '${project}'${preview ? ' (production + preview)' : ' (production)'}…`);
let set = 0;
let skipped = 0;
let failed = 0;
for (const [name, value, hint] of secrets) {
  if (!value) {
    skipped++;
    console.log(`  – ${name} skipped (no flag given)\n      → ${hint}`);
    continue;
  }
  const envs: ('production' | 'preview')[] = preview ? ['production', 'preview'] : ['production'];
  for (const env of envs) {
    if (put(name, value, env)) {
      set++;
      console.log(`  ✓ ${name} (${env})${name === 'DAY_TICKET_SECRET' && !val('--day-ticket') ? ' — generated' : ''}`);
    } else failed++;
  }
}

console.log(`
${set} secret value(s) set · ${skipped} skipped · ${failed} failed.${failed > 0 ? '\nIf these are auth errors: npx wrangler@3 login, then re-run. If "project not found": create the Pages project first (RELEASE-GUIDE step 4) or pass --project <name>.' : ''}
Secrets take effect on the NEXT deployment — trigger one (push a commit, or Deployments → Retry).
Public build-time values (Turnstile site key, checkout/ads providers) live in .env.production — edit + commit.
Verify with: npm run preflight -- --url https://<project>.pages.dev`);
process.exit(failed > 0 ? 1 : 0);
