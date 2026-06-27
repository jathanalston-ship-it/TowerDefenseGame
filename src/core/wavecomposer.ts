// Wave Composer — the data-driven framework that assembles every wave in the game.
//
// A wave is a list of configurable **groups** (`WaveGroup`). Waves come from two
// sources, both flowing through this one composer:
//   • SCRIPTED   — hand-authored exact encounters (the Classic campaign; future
//                  story/boss set-pieces). Byte-identical, fully authored.
//   • PROCEDURAL — budget-rolled from a biome-weighted pool, shaped by a wave
//                  THEME, with ELITE and BOSS injections layered on (Stage/Endless).
//
// On top of composition the framework owns **difficulty scaling** (per-mode HP/
// bounty curves). Everything is data: adding a theme, an injection rule, or a
// scripted encounter is a table entry — no engine change (see docs/WAVES.md).
//
// Determinism: the procedural path makes the same seeded `Rng` calls in the same
// order regardless of theme/injection config, so a neutral, injection-free compose
// reproduces the legacy generator byte-for-byte (gameplay preserved).

import type { EnemyKind } from './types';
import { ENEMY_DEFS } from './config';
import type { Rng } from './rng';

// ── Core wave types ──────────────────────────────────────────────────────────
/** One configurable enemy group — the atom of a wave. (`elite` buffs the spawns;
 *  the spawn pipeline reads it. Optional so legacy/authored groups are unchanged.) */
export interface WaveGroup {
  kind: EnemyKind;
  count: number;
  spacing: number; // seconds between spawns within the group
  delay: number; // seconds before the group starts
  elite?: boolean; // spawn as an elite (buffed) variant
  mutators?: string[]; // boss-only: procedural enhancement ids (bosses.ts BOSS_MODIFIERS)
}

export type WaveDef = WaveGroup[];

/** Metadata-rich composed wave (the composer's full output; callers may use just
 *  `.groups`). `bossWave` lets the HUD/renderer flag a set-piece. */
export interface ComposedWave {
  index: number; // 1-based
  groups: WaveGroup[];
  themeId: string | null;
  bossWave: boolean;
}

// ── Threat budget (shared by Stage + Endless rolls) ──────────────────────────
// Cost per spawnable archetype. Bosses are injected explicitly, never budget-rolled.
export const THREAT_COST: Partial<Record<EnemyKind, number>> = {
  runner: 1, rusher: 1.3, flyer: 2.5, burrower: 2.5, brute: 3, spitter: 3, splitter: 3.5, mender: 4, warden: 5, tank: 6,
};

// ── Wave themes (data-driven composition styles) ─────────────────────────────
// A theme biases the weighted pool and the pacing. `neutral` is the identity theme
// (bias ×1), so themed and un-themed rolls share one code path. Future content
// assigns a theme to a wave/biome to flavor its composition — no new code.
export interface WaveTheme {
  id: string;
  name: string;
  weightBias: Partial<Record<EnemyKind, number>>; // multiply pool weights (>1 favors)
  budgetScale: number; // spend more/less threat budget
}

export const WAVE_THEMES: Record<string, WaveTheme> = {
  neutral: { id: 'neutral', name: 'Mixed Assault', weightBias: {}, budgetScale: 1 },
  swarm: { id: 'swarm', name: 'Swarm', weightBias: { runner: 3, rusher: 2.5 }, budgetScale: 1.15 },
  armored: { id: 'armored', name: 'Armored Column', weightBias: { brute: 2.5, tank: 2.5, warden: 2 }, budgetScale: 0.95 },
  ranged: { id: 'ranged', name: 'Ranged Ambush', weightBias: { spitter: 3, mender: 1.5 }, budgetScale: 1 },
  brood: { id: 'brood', name: 'Brood Surge', weightBias: { splitter: 3, mender: 1.5 }, budgetScale: 1 },
};

export const NEUTRAL_THEME = WAVE_THEMES.neutral;

/** Apply a theme's weight bias to a pool (preserves order; ×1 entries unchanged). */
export function biasPool(pool: [EnemyKind, number][], theme: WaveTheme): [EnemyKind, number][] {
  return pool.map(([k, w]) => [k, w * (theme.weightBias[k] ?? 1)] as [EnemyKind, number]);
}

// ── Injections ───────────────────────────────────────────────────────────────
/** Append N bosses as a trailing group. The caller decides WHEN (it has wave/stage
 *  context); this keeps the *what* (which boss, how many, timing) as data. */
export interface BossInjection {
  kind: EnemyKind;
  count: number;
  spacing: number;
  delay: number;
  mutators?: string[]; // procedural boss enhancements applied to each spawned boss
}

/** Mark `count` of a wave's rolled enemies as elites. Off by default everywhere
 *  (so current gameplay is preserved); enabling is one data entry per call. */
export interface EliteInjection {
  count: number; // how many enemies become elites
}

/** Split `inj.count` of the costliest non-elite group into an `elite: true` group.
 *  Deterministic (no RNG) so it never desyncs the seed. */
export function injectElites(groups: WaveGroup[], inj: EliteInjection): WaveGroup[] {
  if (inj.count <= 0 || groups.length === 0) return groups;
  // Target the highest-threat group so elites read as the wave's "champions".
  let ti = 0;
  for (let i = 1; i < groups.length; i++) {
    if ((THREAT_COST[groups[i].kind] ?? 0) > (THREAT_COST[groups[ti].kind] ?? 0)) ti = i;
  }
  const target = groups[ti];
  const n = Math.min(inj.count, target.count);
  if (n <= 0) return groups;
  const out = groups.slice();
  if (n === target.count) {
    out[ti] = { ...target, elite: true };
  } else {
    out[ti] = { ...target, count: target.count - n };
    out.push({ kind: target.kind, count: n, spacing: target.spacing, delay: target.delay, elite: true });
  }
  return out;
}

// ── Procedural composition ───────────────────────────────────────────────────
export interface ProceduralOptions {
  pool: [EnemyKind, number][]; // biome-weighted spawnable pool (pre-theme)
  budget: number; // threat budget to spend
  theme?: WaveTheme; // default neutral
  startDelay: number; // delay before the first group
  /** Spacing within a group: [base, jitter] for cheap (<2) vs expensive kinds. */
  fastSpacing: [number, number];
  slowSpacing: [number, number];
  delayStep: [number, number]; // [base, jitter] added between groups
  boss?: BossInjection; // appended last if present
  elite?: EliteInjection; // applied before the boss
  guard?: number; // roll-loop safety cap (default 400)
}

/**
 * Budget-roll a single wave's groups, theme-biased, with elite + boss injections.
 * The RNG call order is identical to the legacy generators when `theme=neutral`
 * and `elite` is absent, so existing seeds are byte-preserved.
 */
export function composeProceduralWave(rng: Rng, o: ProceduralOptions): WaveGroup[] {
  const theme = o.theme ?? NEUTRAL_THEME;
  const pool = biasPool(o.pool, theme);
  let budget = o.budget * theme.budgetScale;

  const counts = new Map<EnemyKind, number>();
  let guard = 0;
  const cap = o.guard ?? 400;
  while (budget > 1 && guard++ < cap) {
    const kind = rng.pickWeighted(pool);
    const cost = THREAT_COST[kind] as number;
    if (cost > budget && counts.size > 0) break;
    budget -= cost;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }

  let groups: WaveGroup[] = [];
  let delay = o.startDelay;
  for (const [kind, count] of counts) {
    const cheap = (THREAT_COST[kind] as number) < 2;
    const [sb, sj] = cheap ? o.fastSpacing : o.slowSpacing;
    const spacing = sb + rng.range(0, sj);
    groups.push({ kind, count, spacing, delay });
    delay += o.delayStep[0] + rng.range(0, o.delayStep[1]);
  }

  if (o.elite) groups = injectElites(groups, o.elite);
  if (o.boss) groups.push({ kind: o.boss.kind, count: o.boss.count, spacing: o.boss.spacing, delay: o.boss.delay, mutators: o.boss.mutators });
  return groups;
}

// ── Difficulty scaling (per-mode HP/bounty curves) ───────────────────────────
export type WaveMode = 'classic' | 'stage' | 'endless';

/** Per-wave HP/bounty multipliers. `stageNumber` only matters for Stage mode.
 *  These are the canonical curves — tuning them tunes every mode's ramp. */
export function waveDifficulty(mode: WaveMode, index: number, stageNumber = 1): { hpMult: number; bountyMult: number } {
  const w = Math.max(0, index - 1);
  if (mode === 'endless') return { hpMult: 1 + 0.06 * w, bountyMult: 1 + 0.02 * w };
  if (mode === 'stage') return { hpMult: 1 + 0.06 * w + (stageNumber - 1) * 0.05, bountyMult: 1 + 0.03 * w };
  return { hpMult: 1 + CLASSIC_HP_GROWTH * w, bountyMult: 1 + CLASSIC_BOUNTY_GROWTH * w };
}

export const CLASSIC_HP_GROWTH = 0.12; // +12% enemy HP per classic wave index
export const CLASSIC_BOUNTY_GROWTH = 0.05;

// ── Scripted encounters (hand-authored, exact) ───────────────────────────────
// The Classic campaign is the first scripted encounter: 12 authored waves that
// introduce each archetype, then remix them. Future story/boss set-pieces are new
// entries in SCRIPTED_ENCOUNTERS. Authored byte-for-byte (gameplay preserved).
export const CLASSIC_CAMPAIGN: WaveDef[] = [
  // 1 — Skitterling intro
  [{ kind: 'runner', count: 8, spacing: 0.9, delay: 0.5 }],
  // 2 — first Razor Sprinters (Fast)
  [
    { kind: 'runner', count: 10, spacing: 0.75, delay: 0.5 },
    { kind: 'rusher', count: 3, spacing: 1.0, delay: 2.2 },
  ],
  // 3 — fast pressure
  [
    { kind: 'rusher', count: 6, spacing: 0.6, delay: 0.4 },
    { kind: 'runner', count: 10, spacing: 0.6, delay: 1.6 },
  ],
  // 4 — first Carapace Warden (Shielded) behind brutes
  [
    { kind: 'brute', count: 3, spacing: 1.4, delay: 0.5 },
    { kind: 'warden', count: 1, spacing: 1, delay: 3.0 },
    { kind: 'runner', count: 8, spacing: 0.6, delay: 4.5 },
  ],
  // 5 — Knit Crawlers (Regen) in a swarm
  [
    { kind: 'runner', count: 16, spacing: 0.45, delay: 0.4 },
    { kind: 'mender', count: 2, spacing: 2.0, delay: 2.5 },
  ],
  // 6 — Brood Sacs (Splitter) + fast
  [
    { kind: 'rusher', count: 6, spacing: 0.6, delay: 0.4 },
    { kind: 'splitter', count: 2, spacing: 2.6, delay: 2.0 },
    { kind: 'runner', count: 8, spacing: 0.6, delay: 3.0 },
  ],
  // 7 — Bile Spitters (Ranged) behind a brute screen
  [
    { kind: 'brute', count: 5, spacing: 1.1, delay: 0.5 },
    { kind: 'spitter', count: 3, spacing: 1.4, delay: 2.2 },
  ],
  // 8 — Wardens + swarm + fast
  [
    { kind: 'warden', count: 2, spacing: 2.2, delay: 0.5 },
    { kind: 'runner', count: 14, spacing: 0.42, delay: 1.5 },
    { kind: 'rusher', count: 4, spacing: 0.7, delay: 3.2 },
  ],
  // 9 — Menders + brutes + fast
  [
    { kind: 'mender', count: 3, spacing: 1.7, delay: 0.5 },
    { kind: 'brute', count: 5, spacing: 1.0, delay: 2.0 },
    { kind: 'rusher', count: 5, spacing: 0.6, delay: 3.6 },
  ],
  // 10 — Splitter wave
  [
    { kind: 'splitter', count: 4, spacing: 1.7, delay: 0.5 },
    { kind: 'runner', count: 16, spacing: 0.4, delay: 2.2 },
  ],
  // 11 — Ranged + Shielded + brutes
  [
    { kind: 'spitter', count: 4, spacing: 1.3, delay: 0.5 },
    { kind: 'warden', count: 2, spacing: 2.4, delay: 1.8 },
    { kind: 'brute', count: 6, spacing: 0.9, delay: 3.2 },
  ],
  // 12 — Brood Tyrant finale + a taste of everything
  [
    { kind: 'tyrant', count: 1, spacing: 1, delay: 1.0 },
    { kind: 'warden', count: 2, spacing: 2.0, delay: 2.0 },
    { kind: 'splitter', count: 2, spacing: 2.6, delay: 3.5 },
    { kind: 'spitter', count: 3, spacing: 1.5, delay: 5.0 },
    { kind: 'runner', count: 16, spacing: 0.45, delay: 6.0 },
  ],
];

/** Registry of named scripted encounters (the campaign + future set-pieces). */
export const SCRIPTED_ENCOUNTERS: Record<string, WaveDef[]> = {
  classic: CLASSIC_CAMPAIGN,
};

export const CLASSIC_WAVE_COUNT = CLASSIC_CAMPAIGN.length;

/** True if a composed wave contains a boss (any `isBoss` enemy). */
export function isBossWave(groups: WaveGroup[]): boolean {
  return groups.some((g) => ENEMY_DEFS[g.kind].isBoss);
}
