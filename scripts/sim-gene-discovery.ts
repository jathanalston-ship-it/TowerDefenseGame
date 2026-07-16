// GENE DISCOVERY economy simulation (docs/CARDS.md §discovery) — run with
//   npx vite-node scripts/sim-gene-discovery.ts
// Models three player profiles opening Bio-Containers against the REAL discovery core
// (rollGeneDiscovery + GENE_DISCOVERY tunables + the live card catalog):
//   • completion timelines (collector 30 / deep 60 / common set / first legendary / 90% / 100%)
//   • discovery-vs-echo rates as the archive fills (duplicate-protection fade)
//   • echo-essence income by account age
//   • pool-opening pacing per campaign milestone
// Pure reads of the shipped modules — no save, no writes. Re-run after any GENE_DISCOVERY
// tunable or catalog change and refresh docs/CARDS.md §discovery pacing.

import { GENE_DISCOVERY, STARTER_GENES, rollGeneDiscovery } from '../src/core/geneDiscovery';
import { CARD_POOL } from '../src/core/cards';
import type { CardRarity } from '../src/core/types';
import { Rng } from '../src/core/rng';

const TOTAL = CARD_POOL.length;
const COMMONS = CARD_POOL.filter((c) => c.rarity === 'common').map((c) => c.id);
const LEGENDARIES = new Set(CARD_POOL.filter((c) => c.rarity === 'legendary').map((c) => c.id));
const GATED = CARD_POOL.filter((c) => c.unlock).map((c) => c.id);

// ── Assumptions (documented, not measured — the sim's only fictions) ─────────────────────
// Campaign pace: fast early clears, slowing at the difficulty knees. stage(day) is shared
// across profiles scaled by `paceMult` (whales push campaign harder too).
function stageAt(day: number, paceMult: number): number {
  let s = 2; // the tutorial-adjacent clears land on day 0
  for (let d = 0; d < day; d++) {
    const rate = s < 30 ? 0.6 : s < 60 ? 0.3 : 0.15; // stages/day by band
    s += rate * paceMult;
  }
  return Math.min(75, Math.floor(s));
}
// Per-card unlock gates (tower strains, depth, kills…) are met organically as the account
// deepens: model the met FRACTION of gated cards as stage/50 (all met by stage 50).
function unlockMetAt(stage: number): Set<string> {
  const met = new Set<string>();
  const frac = Math.min(1, stage / 50);
  for (let i = 0; i < GATED.length; i++) if (i / GATED.length < frac) met.add(GATED[i]);
  return met;
}
// Containers/day by rarity — F2P earns a steady trickle; the whale buys stockpiles.
type Profile = { name: string; paceMult: number; perDay: Record<string, number> };
const PROFILES: Profile[] = [
  { name: 'F2P (daily loops)', paceMult: 1.0, perDay: { common: 2.2, uncommon: 0.9, rare: 0.5, epic: 0.12, legendary: 0.03 } },
  { name: 'Regular (evenings + pass)', paceMult: 1.4, perDay: { common: 3.5, uncommon: 1.6, rare: 1.0, epic: 0.3, legendary: 0.08 } },
  { name: 'Whale (stockpile buyer)', paceMult: 2.0, perDay: { common: 6, uncommon: 3.5, rare: 2.5, epic: 1.2, legendary: 0.5 } },
];

const HORIZON = 365;
const SEEDS = 40;

interface Timeline {
  day30: number; day60: number; dayCommons: number; dayLegendary: number; day90pct: number; dayFull: number;
  pct30: number; pct90: number; pct180: number; pct365: number;
  findsPer10_wk1: number; findsPer10_d30: number; findsPer10_d120: number;
  essence30: number; essence180: number; // cumulative echo essence by day
}

function simProfile(p: Profile, seed: number): Timeline {
  const rng = new Rng(seed);
  const r = () => rng.next();
  const discovered = new Set<string>(STARTER_GENES);
  const acc: Record<string, number> = {}; // fractional container banks
  let essence = 0;
  const t: Timeline = { day30: -1, day60: -1, dayCommons: -1, dayLegendary: -1, day90pct: -1, dayFull: -1, pct30: 0, pct90: 0, pct180: 0, pct365: 0, findsPer10_wk1: 0, findsPer10_d30: 0, findsPer10_d120: 0, essence30: 0, essence180: 0 };
  let opens = 0, finds = 0; // rolling window counters for finds/10
  const window: { opens: number; finds: number }[] = [];
  for (let day = 0; day < HORIZON; day++) {
    const stage = stageAt(day, p.paceMult);
    const unlockMet = unlockMetAt(stage);
    let dayOpens = 0, dayFinds = 0;
    for (const [rar, n] of Object.entries(p.perDay)) {
      acc[rar] = (acc[rar] ?? 0) + n;
      while (acc[rar] >= 1) {
        acc[rar] -= 1;
        dayOpens++;
        const roll = rollGeneDiscovery(r, rar, stage, unlockMet, discovered);
        if (roll?.kind === 'discover') { discovered.add(roll.card.id); dayFinds++; }
        else if (roll?.kind === 'echo') essence += roll.essence;
      }
    }
    opens += dayOpens; finds += dayFinds;
    window.push({ opens: dayOpens, finds: dayFinds });
    if (window.length > 14) window.shift(); // a 2-week rolling window
    const wOpens = window.reduce((a, w) => a + w.opens, 0);
    const wFinds = window.reduce((a, w) => a + w.finds, 0);
    const per10 = wOpens > 0 ? (wFinds / wOpens) * 10 : 0;
    if (day === 6) t.findsPer10_wk1 = per10;
    if (day === 30) { t.findsPer10_d30 = per10; t.pct30 = discovered.size / TOTAL; t.essence30 = essence; }
    if (day === 90) t.pct90 = discovered.size / TOTAL;
    if (day === 120) t.findsPer10_d120 = per10;
    if (day === 180) { t.pct180 = discovered.size / TOTAL; t.essence180 = essence; }
    if (t.day30 < 0 && discovered.size >= 30) t.day30 = day;
    if (t.day60 < 0 && discovered.size >= 60) t.day60 = day;
    if (t.dayCommons < 0 && COMMONS.every((id) => discovered.has(id))) t.dayCommons = day;
    if (t.dayLegendary < 0 && [...discovered].some((id) => LEGENDARIES.has(id))) t.dayLegendary = day;
    if (t.day90pct < 0 && discovered.size / TOTAL >= 0.9) t.day90pct = day;
    if (t.dayFull < 0 && discovered.size >= TOTAL) t.dayFull = day;
  }
  t.pct365 = discovered.size / TOTAL;
  return t;
}

function avg(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length; }
/** Average a "day it happened" metric; -1 (never) clamps to the horizon so averages stay honest. */
function avgDay(xs: number[]): string {
  const hit = xs.filter((x) => x >= 0).length;
  const v = avg(xs.map((x) => (x < 0 ? HORIZON : x)));
  return hit === xs.length ? `d${Math.round(v)}` : hit === 0 ? `>${HORIZON}` : `~d${Math.round(v)} (${xs.length - hit}/${xs.length} miss)`;
}
const pc = (x: number): string => `${Math.round(x * 100)}%`;

console.log(`GENE DISCOVERY pacing — catalog ${TOTAL} cards (${STARTER_GENES.length} starters, ${COMMONS.length} commons, ${LEGENDARIES.size} legendaries), ${SEEDS} seeds × ${HORIZON}d\n`);

for (const p of PROFILES) {
  const runs = Array.from({ length: SEEDS }, (_, i) => simProfile(p, 1000 + i * 7919));
  console.log(`── ${p.name} (campaign ×${p.paceMult}) ──`);
  console.log(`  milestones   30 strands ${avgDay(runs.map((r) => r.day30))} · 60 strands ${avgDay(runs.map((r) => r.day60))} · common set ${avgDay(runs.map((r) => r.dayCommons))} · first legendary ${avgDay(runs.map((r) => r.dayLegendary))}`);
  console.log(`  completion   d30 ${pc(avg(runs.map((r) => r.pct30)))} · d90 ${pc(avg(runs.map((r) => r.pct90)))} · d180 ${pc(avg(runs.map((r) => r.pct180)))} · d365 ${pc(avg(runs.map((r) => r.pct365)))} · 90% ${avgDay(runs.map((r) => r.day90pct))} · full ${avgDay(runs.map((r) => r.dayFull))}`);
  console.log(`  finds/10 opens  wk1 ${avg(runs.map((r) => r.findsPer10_wk1)).toFixed(1)} → d30 ${avg(runs.map((r) => r.findsPer10_d30)).toFixed(1)} → d120 ${avg(runs.map((r) => r.findsPer10_d120)).toFixed(1)} (dupe-protection fade)`);
  console.log(`  echo essence  by d30 ${Math.round(avg(runs.map((r) => r.essence30)))} · by d180 ${Math.round(avg(runs.map((r) => r.essence180)))}\n`);
}

// ── Duplicate-protection fade at fixed completion levels (fired rolls only) ─────────────
console.log('── P(discover | lane fired) at fixed archive completion (stage 75, all unlocks met) ──');
const allMet = new Set(GATED);
for (const target of [0.2, 0.5, 0.8]) {
  const discovered = new Set<string>(STARTER_GENES);
  for (const c of CARD_POOL) {
    if (discovered.size >= Math.floor(TOTAL * target)) break;
    discovered.add(c.id);
  }
  const rng = new Rng(42);
  const r = () => rng.next();
  let fired = 0, found = 0;
  for (let i = 0; i < 60_000; i++) {
    const roll = rollGeneDiscovery(r, 'legendary', 75, allMet, discovered);
    if (roll) { fired++; if (roll.kind === 'discover') found++; }
  }
  console.log(`  ${pc(target)} complete → discover ${pc(found / fired)} of fired rolls (echo ${pc(1 - found / fired)})`);
}

// ── Pool-opening pacing (days to each campaign milestone, from the shared ramp) ─────────
console.log('\n── Card-rarity pool openings (campaign ramp days) ──');
const rarities: CardRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
for (const p of PROFILES) {
  const row = rarities.map((rar) => {
    const gate = GENE_DISCOVERY.poolStageByCardRarity[rar];
    let day = 0;
    while (day < HORIZON && stageAt(day, p.paceMult) < gate) day++;
    return `${rar}@${gate} d${day}`;
  });
  console.log(`  ${p.name.padEnd(28)} ${row.join(' · ')}`);
}

// ── Guardrails — a tunable change that breaks the design contract fails THIS script ─────
const f2p = Array.from({ length: SEEDS }, (_, i) => simProfile(PROFILES[0], 1000 + i * 7919));
const whale = Array.from({ length: SEEDS }, (_, i) => simProfile(PROFILES[2], 1000 + i * 7919));
const fail = (msg: string): void => { console.error(`GUARDRAIL FAIL: ${msg}`); process.exitCode = 1; };
if (avg(f2p.map((r) => r.pct30)) > 0.75) fail('F2P completes >75% of the archive in 30 days — discovery is too fast to mean anything');
if (avg(f2p.map((r) => r.pct90)) < 0.3) fail('F2P sits under 30% at day 90 — the collection chase feels dead');
if (f2p.filter((r) => r.dayLegendary >= 0).length < SEEDS * 0.8) fail('F2P misses a first legendary within a year too often');
if (avg(whale.map((r) => (r.dayFull < 0 ? HORIZON : r.dayFull))) < 60) fail('a whale finishes the whole archive in under 2 months — no chase left to sell');
console.log(`\nguardrails ${process.exitCode === 1 ? 'FAILED' : 'PASS'} — F2P d30 ${pc(avg(f2p.map((r) => r.pct30)))}, d90 ${pc(avg(f2p.map((r) => r.pct90)))}; whale full ${avgDay(whale.map((r) => r.dayFull))}`);
