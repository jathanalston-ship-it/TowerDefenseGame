// METABOLISM PERSONA SIM (docs/METABOLISM.md §2) — `npm run sim:metabolism`.
// Simulates five personas accruing every track's lifetime ledger over 120 days and claiming
// daily, then GATES the curve design (exit 1 on violation):
//
//   1. NO FLOODING — steady-state daily claims stay small (the batch-notification contract),
//      and a veteran's day-1 back-fill bundle is a moment, not an avalanche.
//   2. NO DEAD STRETCH — every persona (even low-touch F2P) keeps reaching new tiers in
//      every rolling window; the infinite ladder never goes quiet for an engaged account.
//   3. ANTI-INFLATION — core-equivalent income from milestones DECAYS window over window
//      (absolute payouts grow per tier, but tiers space out faster), and the steady-state
//      daily take stays a MINOR share of the economy (never rivals primary faucets).
//
// Pure curve math over the LIVE registry (state/metabolism) — accrual is linear per track
// (a deliberate simplification; the shape assertions only need monotone accrual). Every
// track id MUST have a rate row here: a future TrackDef forces a sim update (by design).

import { META_TRACKS, rewardsFor, tierAt } from '../src/state/metabolism';
import type { MetaRewardType } from '../src/state/metabolism';

// ── Per-track accrual rates (units/day) for the MID persona — rough live-pacing estimates ──
const MID_RATES: Record<string, number> = {
  kills: 400, victories: 1.5, waves: 45, megas: 0.15, rushBosses: 2, strains: 2.5,
  genes: 0.35, cosmetics: 0.2, organs: 0.25, feats: 0.5,
  towerStars: 0.35, geneLevels: 0.8, mastery: 2, molts: 0.04, coreHoard: 900, ichorDrawn: 12,
  containers: 5, spores: 12, quests: 3.5, passClaims: 2.5, harvests: 1.5, devotion: 0.9,
};

interface Persona { id: string; mult: number; prebankDays: number }
const PERSONAS: Persona[] = [
  { id: 'new', mult: 0.45, prebankDays: 0 },
  { id: 'mid', mult: 1, prebankDays: 0 },
  { id: 'veteran', mult: 1.6, prebankDays: 400 }, // long history → the day-1 back-fill case
  { id: 'whale', mult: 2.5, prebankDays: 150 },
  { id: 'f2p', mult: 0.25, prebankDays: 0 }, // low-touch — the dead-stretch stress case
];

// The four RITUAL COUNTERS start at zero for every account at v51 launch (no lifetime ledger
// existed) — they never prebank. This is what keeps a veteran's ladder alive after the
// back-fill jackpot: fresh low-base ritual tracks pop through the first months.
const COUNTER_TRACKS = new Set(['containers', 'spores', 'quests', 'passClaims']);

// Rough core-equivalent value per reward unit (heuristic — only RATIOS between windows and
// the minor-share ceiling matter; mirrors the balance sims' conversion spirit).
const CORE_EQ: Record<MetaRewardType, number> = {
  cores: 1, geneEssence: 1, hiveMats: 1, mulliganTissue: 1,
  ichor: 20, bioSpores: 15, bpXp: 0.5,
  towerShardsAll: 12, heroShardsAll: 10, // qtyEach × roster, in core-eq
  container: 120, runCache: 90,
};

const DAYS = 120;
const failures: string[] = [];
const check = (ok: boolean, msg: string): void => { if (!ok) failures.push(msg); };

console.log('METABOLISM persona sim — 120 days, daily claims\n');

for (const p of PERSONAS) {
  // Rates + coverage guard: every registry track must be modeled.
  for (const t of META_TRACKS) {
    if (!(t.id in MID_RATES)) { failures.push(`track '${t.id}' has no rate row in sim-metabolism`); }
  }
  const rate = (id: string): number => (MID_RATES[id] ?? 0) * p.mult;

  const claimed: Record<string, number> = {};
  let day1 = 0;
  let maxDailyAfter1 = 0;
  const tiersByDay: number[] = [];
  const coreEqByDay: number[] = [];

  for (let day = 1; day <= DAYS; day++) {
    let tiersToday = 0;
    let valueToday = 0;
    for (const t of META_TRACKS) {
      const prebank = COUNTER_TRACKS.has(t.id) ? 0 : p.prebankDays;
      const lifetime = Math.floor(rate(t.id) * (prebank + day));
      const reached = tierAt(t, lifetime);
      const from = claimed[t.id] ?? 0;
      for (let tier = from; tier < reached; tier++) {
        tiersToday++;
        for (const r of rewardsFor(t, tier)) valueToday += r.qty * CORE_EQ[r.type];
      }
      claimed[t.id] = Math.max(from, reached);
    }
    tiersByDay.push(tiersToday);
    coreEqByDay.push(valueToday);
    if (day === 1) day1 = tiersToday;
    else maxDailyAfter1 = Math.max(maxDailyAfter1, tiersToday);
  }

  const sum = (a: number[], from: number, to: number): number => a.slice(from, to).reduce((x, y) => x + y, 0);
  const total = sum(tiersByDay, 0, DAYS);
  const win = (i: number): number => sum(tiersByDay, i * 30, (i + 1) * 30); // tiers per 30d window
  const val = (i: number): number => sum(coreEqByDay, i * 30, (i + 1) * 30); // core-eq per window
  const steadyDaily = sum(coreEqByDay, 30, DAYS) / (DAYS - 30);

  console.log(
    `  ${p.id.padEnd(8)} day1 ${String(day1).padStart(3)} · max/day>1 ${String(maxDailyAfter1).padStart(2)}` +
    ` · tiers/30d [${[0, 1, 2, 3].map((i) => win(i)).join(', ')}] · total ${total}` +
    ` · core-eq/30d [${[0, 1, 2, 3].map((i) => Math.round(val(i)).toLocaleString('en-US')).join(', ')}]` +
    ` · steady/day ${Math.round(steadyDaily)}`,
  );

  // 1. NO FLOODING — a session's claims are a beat, not a spam storm. Day 1 is the one
  // sanctioned jackpot (the veteran back-fill bundle, claimed in ≤22 gestures, toasts merge);
  // the cap guards absurdity, not the moment.
  check(day1 <= 200, `${p.id}: day-1 back-fill ${day1} tiers (> 200 — the reveal bundle overwhelms)`);
  check(maxDailyAfter1 <= 10, `${p.id}: ${maxDailyAfter1} tiers in one steady-state day (> 10 — floods the toaster)`);

  // 2. NO DEAD STRETCH — every 30-day window still pops new tiers for every persona.
  for (let i = 0; i < 4; i++) check(win(i) >= 1, `${p.id}: window ${i + 1} (days ${i * 30 + 1}–${(i + 1) * 30}) reached ZERO tiers — dead ladder`);

  // 3. ANTI-INFLATION — window income decays (window 4 < window 1) and stays a minor share.
  check(val(3) < val(0), `${p.id}: core-eq grew across windows (${Math.round(val(0))} → ${Math.round(val(3))}) — inflation`);
  check(steadyDaily <= 700, `${p.id}: steady-state ${Math.round(steadyDaily)} core-eq/day (> 700 — rivals primary faucets)`);
}

if (failures.length > 0) {
  console.error('\nsim-metabolism: FAIL');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\nsim-metabolism: PASS — no flooding, no dead tiers, income decays and stays minor.');
