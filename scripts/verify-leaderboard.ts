// Leaderboard replay verification — the R1 operator command (docs/SECURITY-AUDIT.md).
//
//   npm run verify-leaderboard                       # today's daily top 20 (remote D1)
//   npm run verify-leaderboard -- --day 2026-07-08 --top 50
//   npm run verify-leaderboard -- --local            # against the local dev database
//
// Pulls unverified top entries + their replay blobs straight from D1 with wrangler
// (operator auth — NO new public endpoint), re-simulates each recorded input log with
// the actual deterministic sim (the same code the client runs), and stamps verdicts:
//   verified =  1  → replay reproduced the exact claim (wave + kills)
//   verified = -1  → claim did NOT reproduce → the row disappears from /api/leaderboard/top
// Entries without a blob stay at 0 (unverifiable — old clients / oversized logs).
// Run it as part of the daily ops loop; each day's board is a few seconds of sim time.

import { execSync } from 'node:child_process';
import { verifyReplay } from '../src/core/replay';

const args = process.argv.slice(2).filter((a) => a !== '--');
const val = (f: string): string | undefined => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};
const DB = 'assimilate-db';
const remoteFlag = args.includes('--local') ? '--local' : '--remote';
const day = val('--day') ?? new Date().toISOString().slice(0, 10);
const top = Math.max(1, Math.min(200, Number(val('--top') ?? 20)));

function d1<T>(sql: string): T[] {
  const out = execSync(
    `npx wrangler@3 d1 execute ${DB} ${remoteFlag} --json --command "${sql.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const parsed = JSON.parse(out) as { results?: T[] }[];
  return parsed[0]?.results ?? [];
}

interface Row { player_id: string; name: string; score: number; replay: string | null; verified: number }

console.log(`Verifying daily leaderboard · ${day} · top ${top} (${remoteFlag})`);
const rows = d1<Row>(
  `SELECT player_id, name, score, replay, verified FROM leaderboard
   WHERE mode = 'daily' AND day_key = '${day}' AND verified = 0
   ORDER BY score DESC LIMIT ${top}`,
);
if (rows.length === 0) {
  console.log('Nothing unverified in range — done.');
  process.exit(0);
}

let pass = 0;
let fail = 0;
let skip = 0;
for (const r of rows) {
  if (!r.replay) {
    skip++;
    console.log(`  – ${r.name} (${r.player_id.slice(0, 8)}…) score ${r.score}: no replay blob — left unverifiable`);
    continue;
  }
  const t0 = Date.now();
  const v = verifyReplay(r.replay);
  const ms = Date.now() - t0;
  const verdict = v.ok ? 1 : -1;
  d1(`UPDATE leaderboard SET verified = ${verdict} WHERE mode = 'daily' AND day_key = '${day}' AND player_id = '${r.player_id.replace(/'/g, '')}'`);
  if (v.ok) {
    pass++;
    console.log(`  ✓ ${r.name} score ${r.score} — replay matched (${ms}ms)`);
  } else {
    fail++;
    console.log(`  ✗ ${r.name} score ${r.score} — ${v.reason} (claimed w${v.claimed?.wave ?? '?'} vs replayed w${v.replayed?.wave ?? '?'}) → HIDDEN from /top`);
  }
}
console.log(`\n${pass} verified · ${fail} failed (hidden) · ${skip} unverifiable — remaining rows untouched.`);
