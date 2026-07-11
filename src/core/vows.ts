// MOLT VOWS (docs/VOWS.md) — the prestige WAGER: before committing a Molt, arm up to
// MAX_VOWS handicaps that warp the ENEMY WORLD for the entire next cycle and multiply the
// Ascendant Cell mint at the NEXT Molt. A vow is pure data reusing the existing DoctrineWarp
// machinery (core/doctrines.ts) — no new sim axes, no new code paths: the armed product folds
// into the Universal Difficulty Director EXACTLY where the doctrine warp folds (game.ts
// construction), multiplying the doctrine rather than replacing it (see composeWarps).
//
// Economy: arming costs banked Genome Cores on a geometric curve (1st cheap, 3rd expensive) —
// a deliberate SINK for post-tree cores; costs are consumed at arm time and are NEVER
// refunded (not by disarm, not by the Molt reset).
//
// Golden invariant: no armed vows ⇒ combinedVowWarp([]) is undefined ⇒ the director sees the
// doctrine warp UNTOUCHED (referential passthrough — not even a new object) ⇒ zero extra RNG
// draws, byte-identical runs. Pinned by vows.test.ts + the golden suite.

import type { DoctrineWarp } from './doctrines';

export interface VowDef {
  id: string;
  name: string;
  /** Single-glyph identity (HUD chip / ledger rows) — matches the doctrine icon convention. */
  icon: string;
  blurb: string; // the oath, in the game's voice
  /** The handicap — enemy-world reshaping via the EXISTING warp axes (never player math). */
  warp: DoctrineWarp;
  /** Ascendant Cell mint multiplier paid at the NEXT Molt. Stacks multiplicatively. */
  cellYieldMult: number;
}

/** How many vows may be armed at once. */
export const MAX_VOWS = 3;

/** Arm-cost curve — geometric with the number ALREADY armed: base, ×growth, ×growth². A real
 *  sink against the ≥6,400-Core cycle a Molt requires (PRESTIGE.molt.minCells). */
export const VOW_COST = { base: 750, growth: 4 } as const;

/** Genome Cores to arm the (n+1)-th vow, given `armed` already armed this cycle. */
export function vowArmCost(armed: number): number {
  return VOW_COST.base * Math.pow(VOW_COST.growth, Math.max(0, armed));
}

const V = (id: string, name: string, icon: string, blurb: string, warp: DoctrineWarp, cellYieldMult: number): VowDef =>
  ({ id, name, icon, blurb, warp, cellYieldMult });

/** THE VOW BOOK — adding a vow = one row. Each names ONE dominant handicap axis so the risk
 *  reads at a glance; yields sit in the 1.3–1.6 band (the 3-vow product is the real wager). */
export const VOWS: VowDef[] = [
  V('vow_flesh', 'Vow of Flesh', '⛒', 'Every organism arrives thicker-walled. Carve deeper.',
    { hpMult: 1.25 }, 1.35),
  V('vow_haste', 'Vow of Haste', '➶', 'The swarm runs. You will not be given time.',
    { speedMult: 1.15 }, 1.3),
  V('vow_famine', 'Vow of Famine', '⌀', 'The dead yield less. Build lean, or starve.',
    { bountyMult: 0.8 }, 1.4),
  V('vow_legion', 'Vow of the Legion', '⁂', 'More of them. Always more of them.',
    { countMult: 1.25 }, 1.45),
  V('vow_cruelty', 'Vow of Cruelty', '✠', 'Every blow against the Nucleus lands heavier.',
    { damageMult: 1.3 }, 1.4),
  V('vow_apex', 'Vow of the Apex', '♆', 'The strong are promoted. The strongest come for you.',
    { eliteChance: 0.1, hpMult: 1.1 }, 1.6),
];

export function vowById(id: string): VowDef | undefined {
  return VOWS.find((v) => v.id === id);
}

// ── Warp composition — the algebra that lets vows RIDE the doctrine ─────────────────────────
// Multiplicative axes multiply; additive axes (eliteChance, essencePerWave) add. Keys absent
// from both sides stay ABSENT (consumers gate on presence — materializing a ×1 would wake
// warp paths on the golden run). An empty/undefined side returns the OTHER side untouched
// (referential passthrough), so "no vows" cannot perturb the doctrine path even in principle.

const MULT_KEYS = ['countMult', 'hpMult', 'bountyMult', 'damageMult', 'speedMult', 'scalingRateMult', 'rewardMult'] as const;
const ADD_KEYS = ['eliteChance', 'essencePerWave'] as const;

function warpEmpty(w?: DoctrineWarp): boolean {
  return !w || Object.keys(w).length === 0;
}

/** Compose two warps (a=doctrine, b=vows — order is symmetric). Multiplying, not replacing. */
export function composeWarps(a?: DoctrineWarp, b?: DoctrineWarp): DoctrineWarp | undefined {
  if (warpEmpty(b)) return a;
  if (warpEmpty(a)) return b;
  const out: DoctrineWarp = {};
  for (const k of MULT_KEYS) {
    const av = a![k];
    const bv = b![k];
    if (av !== undefined || bv !== undefined) out[k] = (av ?? 1) * (bv ?? 1);
  }
  for (const k of ADD_KEYS) {
    const av = a![k];
    const bv = b![k];
    if (av !== undefined || bv !== undefined) out[k] = (av ?? 0) + (bv ?? 0);
  }
  return out;
}

/** The armed set's combined enemy-world warp — undefined when nothing is armed (golden path).
 *  Unknown ids are ignored defensively (the save sanitizer already drops them). */
export function combinedVowWarp(ids?: readonly string[]): DoctrineWarp | undefined {
  if (!ids || ids.length === 0) return undefined;
  let acc: DoctrineWarp | undefined;
  for (const id of ids) {
    const v = vowById(id);
    if (v) acc = composeWarps(acc, v.warp);
  }
  return acc;
}

/** The armed set's Ascendant Cell mint multiplier (×1 when nothing is armed). */
export function vowYieldProduct(ids?: readonly string[]): number {
  if (!ids || ids.length === 0) return 1;
  return ids.reduce((p, id) => p * (vowById(id)?.cellYieldMult ?? 1), 1);
}

/** Registry-level validation (content-registry pattern) — vows.test.ts runs this per row. */
export function vowProblems(v: VowDef): string[] {
  const out: string[] = [];
  if (!v.id || !/^vow_[a-z_]+$/.test(v.id)) out.push(`${v.id}: id must be vow_snake_case`);
  if (!v.name || !v.blurb || !v.icon) out.push(`${v.id}: name/blurb/icon required`);
  if (warpEmpty(v.warp)) out.push(`${v.id}: a vow must carry a real handicap warp`);
  const handicapped = Object.entries(v.warp).some(([k, val]) =>
    (MULT_KEYS as readonly string[]).includes(k)
      ? (k === 'bountyMult' || k === 'rewardMult' ? (val as number) < 1 : (val as number) > 1)
      : (val as number) > 0);
  if (!handicapped) out.push(`${v.id}: the warp must be a HANDICAP (harder world or leaner economy)`);
  for (const [k, val] of Object.entries(v.warp)) {
    if (typeof val !== 'number' || !isFinite(val)) out.push(`${v.id}: warp.${k} must be finite`);
    else if ((MULT_KEYS as readonly string[]).includes(k) && (val < 0.5 || val > 2)) out.push(`${v.id}: warp.${k} outside sane band [0.5, 2]`);
    else if (k === 'eliteChance' && (val < 0 || val > 0.5)) out.push(`${v.id}: eliteChance outside [0, 0.5]`);
  }
  if (v.cellYieldMult < 1.05 || v.cellYieldMult > 2) out.push(`${v.id}: cellYieldMult outside the wager band [1.05, 2]`);
  return out;
}
