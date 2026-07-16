// MASTERY EVOLUTION TRACKS (docs/MASTERY.md §evolution track) — the CLAIMABLE second layer on
// top of infinite mastery: every unit (tower or hero) owns a 100-level reward track that renews
// through PRESTIGE forever. Mastery LEVELS are untouched (config.MASTERY accrual, the gentle log
// power hum, rank titles, Adaptation's Antigen minting all keep working exactly as before) —
// this module only decides WHAT a track pays and WHERE, as pure data:
//
//   masteryEvolutionTrack(subject, unit, prestige) → 100-level node list
//
// • Nodes land every 2–5 levels (deterministic per-unit seeded spacing — intentional-feeling,
//   never a metronome), MAJORS land exactly on every 10th level, the level-100 node is the
//   completion ceremony.
// • PRESTIGE 1 carries the unit's OWN shards — the whole track totals a configured 3–5 star
//   upgrades' worth on the REAL cost ladder (meta.towerStarCost / heroStarCost), banded by the
//   unit's scarcity (unlockShards: starters pay out in bigger piles, deep unlocks in fewer,
//   richer chunks — same total band).
// • PRESTIGE 2+ NEVER pays unit shards again (no infinite shard farm): the pool swaps to
//   alternate progression — Genome Cores, Gene Essence, crafting materials, Bio Containers,
//   and rare, small Ichor — and every loop's amounts grow slightly (evolution, not a reset).
// • Everything derives from MASTERY_EVOLUTION profiles + the unit's def. A future tower/hero
//   gets a full track with ZERO new code and zero authoring.
//
// Deterministic (djb2-seeded xorshift per unit×prestige — no Math.random, no gameplay rng),
// registry-free, sim-free: the meta layer (state/meta.ts) executes grants; nothing here can
// perturb a run (golden-safe by construction).

import { HERO_DEFS, MASTERY, STAR, TOWER_DEFS } from './config';
import type { HeroKind, TowerKind } from './types';

export type EvolutionSubject = 'tower' | 'hero';

/** One claimable good. A small closed union the meta layer executes; extend it here and in
 *  meta.applyEvolutionGrant — every profile/table below stays valid. */
export type EvolutionGrant =
  | { kind: 'unitShards'; amount: number } // the unit's OWN shards (Prestige 1 only)
  | { kind: 'genomeCores'; amount: number }
  | { kind: 'geneEssence'; amount: number }
  | { kind: 'scrap'; amount: number }
  | { kind: 'mutagen'; amount: number }
  | { kind: 'catalyst'; amount: number }
  | { kind: 'container'; tier: 1 | 2 | 3 } // Bio Containers — the small-cosmetics lane
  | { kind: 'ichor'; amount: number }; // rare + small, deep prestige only

export interface EvolutionNode {
  level: number; // track level 1..100 (mastery level within this prestige loop)
  major: boolean; // every 10th level — substantially better goods + the big celebration
  grants: EvolutionGrant[];
}

export interface EvolutionTrack {
  subject: EvolutionSubject;
  unit: string;
  prestige: number; // 0-based loop index (0 = "Prestige 1" in player language)
  nodes: EvolutionNode[]; // strictly ascending levels; last is always 100
}

// ── Tunables (docs/MASTERY.md §evolution track — every number lives here) ──────
export const MASTERY_EVOLUTION = {
  trackLevels: 100, // one prestige loop
  // Prestige-1 shard budget, in STAR-UPGRADES' WORTH on the unit's real ladder: starters
  // (unlockShards 0) get starsWorthMax in bigger piles; the deepest unlocks get starsWorthMin
  // in fewer, richer chunks. Both ends sit inside the design contract of 3–5.
  starsWorthMin: 3.5,
  starsWorthMax: 5,
  scarcityFullAt: 150, // unlockShards at (or beyond) this = the deep end of the band
  majorShardShare: 0.7, // fraction of the P1 shard budget carried by the 10 majors
  // Alternate-progression pools (Prestige 2+ swaps shards for these; minors draw from the
  // small table, majors from the big one). Amounts are BASE values at prestige 2 — each
  // further loop multiplies by prestigeGrowth (capped) so re-runs keep feeling upgraded.
  minorAlt: [
    { kind: 'geneEssence', amount: 25 },
    { kind: 'scrap', amount: 12 },
    { kind: 'genomeCores', amount: 40 },
    { kind: 'mutagen', amount: 6 },
  ] as const,
  majorAlt: [
    { kind: 'genomeCores', amount: 140 },
    { kind: 'geneEssence', amount: 90 },
    { kind: 'catalyst', amount: 2 },
    { kind: 'container', tier: 2 },
  ] as const,
  // Prestige-1 non-shard seasoning (minors alternate shards with these so the track reads
  // varied, not a shard drip-feed).
  minorP1: [
    { kind: 'scrap', amount: 10 },
    { kind: 'geneEssence', amount: 15 },
    { kind: 'genomeCores', amount: 25 },
  ] as const,
  containerEveryMajors: 3, // every 3rd major also opens a Bio Container (tier ladders 1→2→3)
  prestigeGrowth: 0.12, // +12% alt amounts per loop past the first alt loop…
  prestigeGrowthCap: 2, // …capped at ×2 so deep loops enrich without exploding the economy
  // Ichor (premium-adjacent) stays RARE and SMALL: only on deep-prestige majors.
  ichorAt50: 1, // level-50 major, prestige ≥ 2, every other loop (hash-phased)
  ichorAt100: 2, // level-100 completion, prestige ≥ 2, every loop
  // Power reflection (docs/POWER-SCORE.md): every completed loop is permanent account strength.
  powerPerPrestige: 0.005, // +0.5% to the meta bucket per completed loop…
  powerCap: 0.6, // …with the summed hum capped, so deep grinders enrich without dominating
  // Loop pacing (§pacing below): each loop past the first costs +25% more XP than the base
  // loop — the endless chain stays chainable (a LEVEL-windowed loop 2 would cost ×83,522).
  loopEffortGrowth: 1.25,
} as const;

/** Permanent Power hum from completed Evolution loops: ×1 with no prestige anywhere (fresh
 *  accounts and v43 saves read identically), small per-loop growth, capped. The direct
 *  "every EVOLVE made the account stronger" reflection — folded into accountPowerParts.meta. */
export function masteryEvolutionPowerMult(evo: Record<string, { claimedUpTo: number; prestige: number }> | undefined): number {
  let loops = 0;
  for (const st of Object.values(evo ?? {})) loops += Math.max(0, st.prestige);
  return 1 + Math.min(MASTERY_EVOLUTION.powerCap, MASTERY_EVOLUTION.powerPerPrestige * loops);
}

// ── Deterministic per-track stream (no Math.random, no gameplay rng) ───────────
function seedOf(subject: EvolutionSubject, unit: string, prestige: number): number {
  const s = `${subject}:${unit}:${prestige}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0 || 1;
}

function xorshift(state: number): number {
  let x = state;
  x ^= x << 13; x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5; x >>>= 0;
  return x >>> 0;
}

/** The unit's scarcity band 0..1 (0 = starter, 1 = deepest unlock) — read straight off the
 *  def's unlockShards, so future rarities keep working with zero new code. */
export function scarcityBand(subject: EvolutionSubject, unit: string): number {
  const def = subject === 'tower'
    ? TOWER_DEFS[unit as TowerKind]
    : HERO_DEFS[unit as HeroKind];
  const gate = (def as { unlockShards?: number } | undefined)?.unlockShards ?? 0;
  return Math.max(0, Math.min(1, gate / MASTERY_EVOLUTION.scarcityFullAt));
}

/** The Prestige-1 TOTAL shard budget for a unit: 3.5–5 star-upgrades' worth on its real
 *  ladder (cheapest stars first — the track funds the early climb, never the ★10 spike). */
export function p1ShardBudget(subject: EvolutionSubject, unit: string): number {
  const band = scarcityBand(subject, unit);
  const starsWorth = MASTERY_EVOLUTION.starsWorthMax - band * (MASTERY_EVOLUTION.starsWorthMax - MASTERY_EVOLUTION.starsWorthMin);
  const base = subject === 'tower' ? STAR.towerBaseCost : STAR.heroBaseCost;
  const mult = subject === 'tower' ? STAR.towerCostMult : STAR.heroCostMult;
  let total = 0;
  let n = starsWorth;
  for (let s = 0; n > 0; s++, n--) total += Math.round(base * Math.pow(mult, s)) * Math.min(1, n);
  return Math.round(total);
}

// Valid decade shapes (gap runs of 2..5 summing to 10): every consecutive gap — including
// into the next major — honors the 2–5 contract. One- and two-minor decades mix so the
// rhythm feels authored, never periodic.
const DECADE_SHAPES: readonly (readonly number[])[] = [
  [5], // one minor at +5
  [2, 3], [2, 4], [2, 5], [3, 2], [3, 3], [3, 4], [4, 2], [4, 3], [5, 2], [5, 3], [4, 4],
];

/** Generate the full track for (unit, prestige). Pure + deterministic: the same arguments
 *  always produce the same nodes, so saves store only { claimedUpTo, prestige }. */
export function masteryEvolutionTrack(subject: EvolutionSubject, unit: string, prestige: number): EvolutionTrack {
  const C = MASTERY_EVOLUTION;
  let rng = seedOf(subject, unit, prestige);
  const next = (): number => (rng = xorshift(rng));

  // 1. Node placement: majors at 10,20,…,100; minors from a per-decade shape.
  const nodes: EvolutionNode[] = [];
  for (let d = 0; d < 10; d++) {
    const base = d * 10;
    const shape = DECADE_SHAPES[next() % DECADE_SHAPES.length];
    let at = base;
    for (const gap of shape) {
      at += gap;
      nodes.push({ level: at, major: false, grants: [] });
    }
    nodes.push({ level: base + 10, major: true, grants: [] });
  }

  // 2. Grants. Alt-pool amounts grow gently per loop past their debut (evolution, not reset).
  const loopMult = prestige <= 1 ? 1 : Math.min(C.prestigeGrowthCap, 1 + C.prestigeGrowth * (prestige - 1));
  const scale = (amount: number): number => Math.max(1, Math.round(amount * loopMult));
  const minors = nodes.filter((n) => !n.major);
  const majors = nodes.filter((n) => n.major);

  if (prestige === 0) {
    // ── Prestige 1: the unit's OWN shards, budgeted to the star ladder. ──
    const budget = p1ShardBudget(subject, unit);
    const majorPot = Math.round(budget * C.majorShardShare);
    const minorPot = budget - majorPot;
    // Majors ascend (weights 1..10) — the climb pays better the deeper it goes.
    const wSum = (10 * 11) / 2;
    let paid = 0;
    majors.forEach((m, i) => {
      const amt = i === majors.length - 1 ? majorPot - paid : Math.max(1, Math.round((majorPot * (i + 1)) / wSum));
      paid += amt;
      m.grants.push({ kind: 'unitShards', amount: amt });
    });
    // Minors alternate a shard trickle with seasoning goods (hash-picked, so two units'
    // tracks never read identically).
    const shardMinors = minors.filter((_, i) => i % 2 === 0);
    const per = Math.max(1, Math.floor(minorPot / Math.max(1, shardMinors.length)));
    let minorPaid = 0;
    shardMinors.forEach((m, i) => {
      const amt = i === shardMinors.length - 1 ? Math.max(1, minorPot - minorPaid) : per;
      minorPaid += amt;
      m.grants.push({ kind: 'unitShards', amount: amt });
    });
    for (const m of minors) {
      if (m.grants.length > 0) continue;
      const pick = C.minorP1[next() % C.minorP1.length];
      m.grants.push({ ...pick } as EvolutionGrant);
    }
  } else {
    // ── Prestige 2+: shards are RETIRED — alternate progression only. ──
    for (const m of minors) {
      const pick = C.minorAlt[next() % C.minorAlt.length];
      m.grants.push(scaleGrant(pick as EvolutionGrant, scale));
    }
    majors.forEach((m, i) => {
      const pick = C.majorAlt[(next() + i) % C.majorAlt.length];
      m.grants.push(scaleGrant(pick as EvolutionGrant, scale));
    });
  }

  // 3. Ceremony toppers — container cadence on majors, rare small Ichor deep in.
  majors.forEach((m, i) => {
    if ((i + 1) % C.containerEveryMajors === 0) {
      const tier = (Math.min(3, 1 + Math.floor(i / 4)) as 1 | 2 | 3);
      if (!m.grants.some((g) => g.kind === 'container')) m.grants.push({ kind: 'container', tier });
    }
  });
  if (prestige >= 1) {
    const at50 = majors[4];
    const at100 = majors[9];
    if (seedOf(subject, unit, prestige) % 2 === 0) at50.grants.push({ kind: 'ichor', amount: C.ichorAt50 });
    at100.grants.push({ kind: 'ichor', amount: C.ichorAt100 });
  }
  // The completion node is the loop's crown — it always carries a container on top.
  const crown = majors[9];
  if (!crown.grants.some((g) => g.kind === 'container')) crown.grants.push({ kind: 'container', tier: 3 });

  return { subject, unit, prestige, nodes };
}

function scaleGrant(g: EvolutionGrant, scale: (n: number) => number): EvolutionGrant {
  return 'amount' in g ? ({ ...g, amount: scale(g.amount) } as EvolutionGrant) : { ...g };
}

/** Content guardrails — swept by tests across EVERY unit × several prestiges, so a future
 *  unit (or profile tweak) that breaks the design contract fails the build, not the player. */
export function masteryEvolutionProblems(t: EvolutionTrack): string[] {
  const out: string[] = [];
  let prev = 0;
  for (const n of t.nodes) {
    const gap = n.level - prev;
    if (gap < 2 || gap > 5) out.push(`gap ${gap} at level ${n.level} breaks the 2–5 contract`);
    if (n.major !== (n.level % 10 === 0)) out.push(`major flag wrong at ${n.level}`);
    if (n.grants.length === 0) out.push(`empty node at ${n.level}`);
    for (const g of n.grants) {
      if ('amount' in g && !(g.amount > 0)) out.push(`non-positive amount at ${n.level}`);
      if (g.kind === 'unitShards' && t.prestige > 0) out.push(`unit shards at ${n.level} on prestige ${t.prestige} (P2+ must never pay shards)`);
    }
    prev = n.level;
  }
  if (t.nodes[t.nodes.length - 1]?.level !== 100) out.push('the track must end at level 100');
  if (t.prestige === 0) {
    const budget = p1ShardBudget(t.subject, t.unit);
    let total = 0;
    for (const n of t.nodes) for (const g of n.grants) if (g.kind === 'unitShards') total += g.amount;
    if (Math.abs(total - budget) > Math.max(2, budget * 0.02)) out.push(`P1 shard total ${total} drifted from the ${budget} budget`);
  }
  return out;
}

// ── Loop pacing — XP-metered loops (docs/MASTERY.md §pacing) ────────────────────
// Loop 1 is EXACTLY the unit's first 100 mastery levels (xpAt = 0 ⇒ the meters coincide).
// Later loops are XP-METERED on the same first-loop requirement ladder, scaled by a gentle
// per-loop effort growth. This is deliberate: the mastery level curve is geometric (×1.12 per
// level), so a LEVEL-windowed loop 2 (levels 100→200) would cost ×83,522 the XP of loop 1 —
// the balancing sims killed that dead end. XP-metering keeps every next loop +25% effort:
// chainable forever, ever-slower, never absurd. Mastery LEVEL itself is untouched — it keeps
// climbing on its own curve while the helix measures loop progress in its own 100 steps.

/** One full loop's XP on the BASE ladder (the first 100 mastery levels' real requirements —
 *  mirrors state/meta.masteryReq: round(baseReq · reqGrowth^level)). Computed once. */
const BASE_LOOP_REQS: readonly number[] = Array.from(
  { length: MASTERY_EVOLUTION.trackLevels },
  (_, l) => Math.round(MASTERY.baseReq * Math.pow(MASTERY.reqGrowth, l)),
);
export const BASE_LOOP_XP: number = BASE_LOOP_REQS.reduce((a, n) => a + n, 0);

/** The effort multiplier for loop `prestige` (0-based): ×1 for the debut loop, +25% per loop. */
export function loopEffortMult(prestige: number): number {
  return Math.pow(MASTERY_EVOLUTION.loopEffortGrowth, Math.max(0, prestige));
}

/** Total XP the loop at `prestige` requires from its watermark to its crown — the exact sum
 *  of the per-level requirements trackLevelFromXp walks (same rounding, no drift). */
export function loopXpRequirement(prestige: number): number {
  const effort = loopEffortMult(prestige);
  let total = 0;
  for (const req of BASE_LOOP_REQS) total += Math.round(req * effort);
  return total;
}

/** The track level (0..100) reached with `xpIntoLoop` XP earned since the loop's watermark
 *  (save.masteryEvolution[key].xpAt). Walks the base ladder scaled by the loop's effort —
 *  at prestige 0 with watermark 0 this reproduces the unit's mastery level exactly (capped). */
export function trackLevelFromXp(xpIntoLoop: number, prestige: number): number {
  const effort = loopEffortMult(prestige);
  let rem = Math.max(0, xpIntoLoop);
  for (let level = 0; level < MASTERY_EVOLUTION.trackLevels; level++) {
    const need = Math.round(BASE_LOOP_REQS[level] * effort);
    if (rem < need) return level;
    rem -= need;
  }
  return MASTERY_EVOLUTION.trackLevels;
}

/** Whether the loop is complete and the organism may evolve (prestige). */
export function canPrestigeFromXp(xpIntoLoop: number, prestige: number): boolean {
  return trackLevelFromXp(xpIntoLoop, prestige) >= MASTERY_EVOLUTION.trackLevels;
}
