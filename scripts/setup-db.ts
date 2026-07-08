// One-command database setup (docs/RELEASE-GUIDE.md step 5):
//
//   npm run setup-db
//
// Runs `wrangler d1 create assimilate-db` (or finds the existing database), writes
// its id into wrangler.toml, and applies every migration locally AND remotely.
// Requires `npx wrangler@3 login` once beforehand. After this, the only database
// step left is the dashboard binding (variable name DB) — printed at the end.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const DB_NAME = 'assimilate-db';

function run(cmd: string, allowFail = false): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    if (allowFail) return `${err.stdout ?? ''}${err.stderr ?? ''}`;
    console.error(`\nCommand failed: ${cmd}\n${err.stderr ?? err.stdout ?? ''}`);
    console.error('If this is an auth error, run `npx wrangler@3 login` first, then retry.');
    process.exit(1);
  }
}

function extractId(text: string): string | null {
  // wrangler prints the id in its toml snippet and in JSON listings alike.
  const m = /database_id\s*[=:]\s*"?([0-9a-f-]{36})"?/i.exec(text) ?? /"uuid":\s*"([0-9a-f-]{36})"/.exec(text);
  return m ? m[1] : null;
}

console.log(`Creating (or finding) D1 database '${DB_NAME}'…`);
let id: string | null = null;
const created = run(`npx wrangler@3 d1 create ${DB_NAME}`, true);
id = extractId(created);
if (!id) {
  // Already exists (or output format drift) — look it up.
  const listed = run(`npx wrangler@3 d1 list --json`, true);
  try {
    const arr = JSON.parse(listed) as { name: string; uuid: string }[];
    id = arr.find((d) => d.name === DB_NAME)?.uuid ?? null;
  } catch {
    id = extractId(listed);
  }
}
if (!id) {
  console.error('Could not determine the database id. Run `npx wrangler@3 d1 list` and paste the id into wrangler.toml manually.');
  process.exit(1);
}
console.log(`  ✓ database id: ${id}`);

const tomlPath = 'wrangler.toml';
const toml = readFileSync(tomlPath, 'utf8');
const next = toml.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${id}"`);
if (next !== toml) {
  writeFileSync(tomlPath, next);
  console.log('  ✓ wrangler.toml updated');
} else {
  console.log('  ✓ wrangler.toml already carries this id');
}

console.log('Applying migrations (local)…');
run(`npx wrangler@3 d1 migrations apply ${DB_NAME} --local`, true);
console.log('Applying migrations (remote)…');
run(`npx wrangler@3 d1 migrations apply ${DB_NAME} --remote`);
console.log('  ✓ schema applied');

console.log(`
Done. ONE manual step remains (dashboards can't be scripted):
  Cloudflare → your Pages project → Settings → Functions → D1 database bindings
  → Add binding → variable name DB → select ${DB_NAME} → Save → redeploy.
Then commit the wrangler.toml change:  git add wrangler.toml && git commit -m "chore: bind D1 id" && git push`);
