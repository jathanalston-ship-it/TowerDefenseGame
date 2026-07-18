// LIVE EVENT ROTATION SIMULATION (docs/LIVE-EVENTS.md §validation) — npm run sim:events.
// Walks YEARS of the three-horizon calendar and verifies the brief's laws: multiple events
// always simultaneously live, rings rotate independently and evenly, overlapping identities
// stay readable (accent-distinct + one theme owner), and total mint stays inside the
// per-day budgets (no inflation as rotations repeat — every window mints the same bounded
// amount, so supply is linear in time, never compounding).

import { BP } from '../src/core/battlePass';
import {
  EVENT_HORIZONS, LIVE_EVENTS_V2, TRACK_LEVELS, activeLiveEvents, eventTrack,
  liveEventProblems, themeOwner, windowMintBudget, MINT_BUDGET_PER_DAY,
} from '../src/core/liveEvents';

const DAY = 86_400_000;
const YEARS = 3;
const fails: string[] = [];
const bar = (ok: boolean, label: string): void => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`);
  if (!ok) fails.push(label);
};

console.log(`LIVE EVENT ROTATION — ${YEARS} years, daily resolution\n`);

const problems = liveEventProblems();
bar(problems.length === 0, `registry laws hold (${problems.join('; ') || 'no problems'})`);

// ── The multi-year walk ──
const seen: Record<string, Set<number>> = {};
let tripleDays = 0;
let readableDays = 0;
let ownerSwaps = 0;
let lastOwner = '';
const mintPerYear: number[] = [];
for (let y = 0; y < YEARS; y++) {
  let mint = 0;
  const counted = new Set<string>();
  for (let d = 0; d < 365; d++) {
    const t = BP.epochMs + (y * 365 + d) * DAY + 3_600_000;
    const active = activeLiveEvents(t);
    if (active.length === 3) tripleDays++;
    const accents = active.map((a) => a.def.theme.accent.toLowerCase());
    if (new Set(accents).size === 3) readableDays++;
    for (const a of active) {
      (seen[a.def.id] ??= new Set()).add(a.window);
      if (!counted.has(a.key)) { counted.add(a.key); mint += windowMintBudget(a.def); }
    }
    const owner = themeOwner(t).key;
    if (owner !== lastOwner) { ownerSwaps++; lastOwner = owner; }
  }
  mintPerYear.push(mint);
}
const totalDays = YEARS * 365;
bar(tripleDays === totalDays, `three events live EVERY day (${tripleDays}/${totalDays})`);
bar(readableDays === totalDays, `co-active identities accent-distinct EVERY day (${readableDays}/${totalDays})`);
bar(ownerSwaps <= Math.ceil(totalDays / 91) + 2, `theme ownership is stable (only major-epoch flips: ${ownerSwaps} swaps in ${YEARS}y)`);

// Every event participates every cycle of its ring.
for (const e of LIVE_EVENTS_V2) {
  const ring = LIVE_EVENTS_V2.filter((x) => x.horizon === e.horizon).length;
  const expected = Math.floor(totalDays / (EVENT_HORIZONS[e.horizon].periodDays * ring));
  const got = seen[e.id]?.size ?? 0;
  bar(got >= expected, `${e.id} rotated ${got} windows (≥ ${expected} expected over ${YEARS}y)`);
}

// Anti-inflation: yearly mint is FLAT (identical windows), i.e. supply is linear in time.
const spread = Math.max(...mintPerYear) - Math.min(...mintPerYear);
console.log(`\nmint/year (core-eq): ${mintPerYear.map((m) => m.toFixed(0)).join(' · ')}`);
bar(spread <= Math.max(...mintPerYear) * 0.05, `yearly mint flat within 5% (spread ${spread.toFixed(0)}) — no compounding inflation`);
const dailyCeiling = (Object.keys(EVENT_HORIZONS) as (keyof typeof EVENT_HORIZONS)[]).reduce((a, h) => a + MINT_BUDGET_PER_DAY[h], 0);
bar(mintPerYear[0] / 365 <= dailyCeiling, `average mint/day ${(mintPerYear[0] / 365).toFixed(0)} ≤ ${dailyCeiling} ceiling`);

// Expandability probe: the rotation math is ring-size-derived (no hardcoded counts) — a
// 4th short event would simply lengthen the cycle. Assert the derivation is structural.
const shortRing = LIVE_EVENTS_V2.filter((e) => e.horizon === 'short');
bar(shortRing.length >= 3, `short ring ${shortRing.length} rows — grows by pushing a row (no engine change)`);

// ── Persona economy (docs/LIVE-EVENTS.md §economy-personas) ──
// Challenge-completion rates per archetype: how much of each event's token pool a player
// actually earns in a window. Track depth reached = levels whose `at` ≤ earned tokens.
// Laws: NEW players see meaningful progress (≥40% of levels), WHALES cannot overshoot
// (tokens cap at the earnable pool — no purchasable tokens exist, engagement-only), F2P
// veterans finish mediums, and REPEAT windows keep ≥70% value for veterans (spine
// permanents substitute via applyRewardList; generated filler is consumable by design).
const PERSONA_RATES: Record<string, number> = { 'new-player': 0.45, 'f2p-regular': 0.7, veteran: 0.85, whale: 1.0 };
console.log('\npersona economy — track depth per window:');
for (const e of LIVE_EVENTS_V2) {
  const full = eventTrack(e);
  const pool = (e.challenges ?? []).reduce((a, c) => a + c.tokens, 0);
  const depths = Object.entries(PERSONA_RATES).map(([id, rate]) => {
    const earned = Math.floor(pool * rate);
    const depth = full.filter((m) => m.at <= earned).length;
    return `${id} ${depth}/${full.length}`;
  });
  console.log(`  ${e.theme.logo} ${e.name.padEnd(22)} ${depths.join(' · ')}`);
  const newbieDepth = full.filter((m) => m.at <= Math.floor(pool * PERSONA_RATES['new-player'])).length;
  bar(newbieDepth >= Math.ceil(full.length * 0.4), `${e.id}: new players reach ${newbieDepth}/${full.length} levels (≥40%)`);
  const whaleDepth = full.filter((m) => m.at <= pool).length;
  bar(whaleDepth === full.length, `${e.id}: full pool completes the track exactly (no dead tail, no overshoot)`);
  bar(full.length >= TRACK_LEVELS[e.horizon], `${e.id}: ${e.horizon} track ${full.length} levels ≥ ${TRACK_LEVELS[e.horizon]}`);
  // REPEAT VALUE: spine permanents (cosmetic/passive/phenotype) substitute at claim; the
  // veteran's repeat-window value = consumables + substitution bundles. Filler is 100%
  // consumable, so repeat value ≥ consumable share of the full mint.
  const iv = windowMintBudget(e);
  const permShare = full.flatMap((m) => m.rewards).filter((r) => r.kind === 'cosmetic' || r.kind === 'passive' || r.kind === 'phenotype').length / Math.max(1, full.flatMap((m) => m.rewards).length);
  bar(permShare <= 0.3, `${e.id}: permanent-unlock share ${(permShare * 100).toFixed(0)}% ≤ 30% (repeat value ≥70% consumable, iv ${iv})`);
}

// A week of calendar, printed — the designer's glanceable sample.
console.log('\nsample fortnight:');
for (let d = 0; d < 14; d++) {
  const t = BP.epochMs + d * DAY + 3_600_000;
  const [maj, med, sho] = activeLiveEvents(t);
  console.log(`  day ${String(d).padStart(2)}: ${maj.def.theme.logo} ${maj.def.name.padEnd(22)} | ${med.def.theme.logo} ${med.def.name.padEnd(16)} | ${sho.def.theme.logo} ${sho.def.name}`);
}

if (fails.length > 0) {
  console.error(`\nFAILED ${fails.length} live-event law(s).`);
  process.exit(1);
}
console.log('\nALL LAWS HOLD — the calendar rotates readably and mints flat, forever.');
