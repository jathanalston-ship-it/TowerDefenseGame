// THE THREAT LADDER (docs/THREAT.md) — the opt-in difficulty ladder that is the main replay axis
// (Hades Heat / Slay-the-Spire Ascension). Before a run on SOLVED content (a Campaign replay of a
// cleared stage, Infinite, Boss Rush) the player picks a Threat level 0..THREAT_MAX. Each level
// STACKS one named modifier on everything below it, built from the EXISTING DoctrineWarp levers
// (enemy HP / speed / count / contact damage / elite rate / bounty drought) — data rows, never
// code paths — and adds a modest bonus to the run-end reward multiplier.
//
// WHERE IT COMPOSES (no inline factor math anywhere else):
//   • threat world   — difficultyDirector.createDirector({ threat }) folds threatWarp(level) onto
//                      doctrine × vows × sector through the SAME composeWarps seam vows use;
//   • threat economy — difficultyDirector.threatEconomy(level).rewardMult → the economy director's
//                      named `threat.reward` factor (Genome Cores + loot points).
// Threat NEVER grants Power: it is a world handicap + a currency multiplier + cosmetic milestones
// (titles, profile frames, achievements) — the Power rule holds by construction (docs/THREAT.md).
//
// GOLDEN SAFETY: Threat 0 ⇒ threatWarp(0) is undefined ⇒ composeWarps passes the other warp
// through untouched (referential identity — not even a new object) ⇒ zero extra RNG, byte-
// identical runs; threatEconomy(0).rewardMult === 1 (an exact IEEE ×1 in the income chains).
//
// Pure data + math: no sim, no DOM, no save imports (the save-aware helpers live in save/derive.ts).

import type { DoctrineWarp } from './doctrines';
import { composeWarps } from './vows';

/** The modes that carry a Threat ladder (each keeps its OWN record). Daily is excluded by design —
 *  one shared, fair worldwide board; Arena is wave-vs-wave PvP; Quick Skirmish is practice. */
export type ThreatMode = 'campaign' | 'endless' | 'bossRush';
export const THREAT_MODES: readonly ThreatMode[] = ['campaign', 'endless', 'bossRush'];
export const THREAT_MODE_LABEL: Record<ThreatMode, string> = { campaign: 'Campaign', endless: 'Infinite', bossRush: 'Boss Rush' };

/** One rung. `warp` is the ONE modifier this level stacks (existing warp axes only); `rewardBonus`
 *  is added to the reward multiplier (Σ over the rungs ≤ L). `title` marks a MILESTONE rung — clearing
 *  it in any mode grants the cosmetic title (profile titles chain via threatTitleName). */
export interface ThreatLevelDef {
  level: number; // 1..THREAT_MAX, contiguous
  name: string;
  icon: string;
  blurb: string; // the modifier in the game's voice + its exact number
  warp: DoctrineWarp;
  rewardBonus: number;
  title?: { id: string; name: string };
}

/** THE LADDER — adding a rung = one row (THREAT_MAX follows). Axes rotate so every rung reads as a
 *  NEW pressure; magnitudes are modest per rung and compound (docs/THREAT.md §ladder). */
export const THREAT_LEVELS: ThreatLevelDef[] = [
  { level: 1, name: 'Thickened Membranes', icon: '⛒', blurb: 'Every organism arrives with +10% HP.', warp: { hpMult: 1.1 }, rewardBonus: 0.05 },
  { level: 2, name: 'Quickened Pulse', icon: '➶', blurb: 'The swarm moves 6% faster.', warp: { speedMult: 1.06 }, rewardBonus: 0.05 },
  { level: 3, name: 'Brood Surge', icon: '⁂', blurb: 'Every wave hatches 12% more enemies.', warp: { countMult: 1.12 }, rewardBonus: 0.05, title: { id: 'threat_t3', name: 'Threat-Tempered' } },
  { level: 4, name: 'Serrated Mandibles', icon: '✠', blurb: 'Blows on the Nucleus land 20% heavier.', warp: { damageMult: 1.2 }, rewardBonus: 0.06 },
  { level: 5, name: 'Apex Promotion', icon: '♆', blurb: '+5% of every wave is promoted to elite.', warp: { eliteChance: 0.05 }, rewardBonus: 0.06, title: { id: 'threat_t5', name: 'Swarmbreaker' } },
  { level: 6, name: 'Lean Harvest', icon: '⌀', blurb: 'Kills yield 12% less Biomass.', warp: { bountyMult: 0.88 }, rewardBonus: 0.06 },
  { level: 7, name: 'Calcified Hides', icon: '⛨', blurb: 'Every organism arrives with another +12% HP.', warp: { hpMult: 1.12 }, rewardBonus: 0.07, title: { id: 'threat_t7', name: 'Apex Hunter' } },
  { level: 8, name: 'Endless Legion', icon: '⁘', blurb: 'Every wave hatches another 12% more enemies.', warp: { countMult: 1.12 }, rewardBonus: 0.07 },
  { level: 9, name: 'Frenzy', icon: '⚡', blurb: 'The swarm moves another 8% faster.', warp: { speedMult: 1.08 }, rewardBonus: 0.07 },
  { level: 10, name: 'The Apex Horde', icon: '☣', blurb: '+8% more elites, and every organism +10% HP.', warp: { eliteChance: 0.08, hpMult: 1.1 }, rewardBonus: 0.08, title: { id: 'threat_t10', name: 'Unbroken Under Threat' } },
];

export const THREAT_MAX = THREAT_LEVELS.length;

/** What clears a Threat level in each mode (data — the picker prints `label`). Campaign: WIN a
 *  replay near your frontier (within `nearFrontier` stages of your highest cleared stage on that
 *  difficulty — so Stage 1 at Threat 10 is not a free clear). Infinite / Boss Rush: REACH a depth. */
export const THREAT_BENCHMARK: Record<ThreatMode, { wave: number; nearFrontier: number; label: string }> = {
  campaign: { wave: 0, nearFrontier: 5, label: 'Win a replay within 5 stages of your frontier' },
  endless: { wave: 15, nearFrontier: 0, label: 'Reach Depth 15' },
  bossRush: { wave: 5, nearFrontier: 0, label: 'Reach Boss Rush wave 5' },
};

/** Did this run meet its mode's benchmark? `stage`/`frontier` only matter for Campaign. */
export function threatBenchmarkMet(mode: ThreatMode, run: { won: boolean; wave: number; stage?: number; frontier?: number }): boolean {
  const b = THREAT_BENCHMARK[mode];
  if (mode === 'campaign') {
    return run.won && run.stage !== undefined && run.frontier !== undefined && run.stage > run.frontier - b.nearFrontier;
  }
  return run.wave >= b.wave;
}

/** The highest selectable level: 0 until the mode's baseline (Threat 0) benchmark is met, then one
 *  past the best CLEARED level (capped). `cleared` = the save's best cleared Threat (0 = none ≥ 1). */
export function threatMaxSelectable(cleared: number, baselineMet: boolean): number {
  if (!baselineMet) return 0;
  return Math.min(THREAT_MAX, Math.max(0, Math.floor(cleared)) + 1);
}

/** Clamp a requested level into [0, max] (stale prefs / imports can never exceed what is earned). */
export function clampThreat(level: number, max: number): number {
  const n = Number.isFinite(level) ? Math.floor(level) : 0;
  return Math.max(0, Math.min(max, THREAT_MAX, n));
}

/** The rungs active at `level` (1..level), in order. */
export function threatRungs(level: number): ThreatLevelDef[] {
  return THREAT_LEVELS.slice(0, clampThreat(level, THREAT_MAX));
}

/** The stacked enemy-world warp at `level` — undefined at 0 (the golden passthrough). */
export function threatWarp(level: number): DoctrineWarp | undefined {
  let acc: DoctrineWarp | undefined;
  for (const r of threatRungs(level)) acc = composeWarps(acc, r.warp);
  return acc;
}

/** The run-end reward multiplier at `level`: 1 + Σ rewardBonus (exactly 1 at Threat 0). The
 *  difficulty director's threatEconomy() is the ONE caller (it feeds the `threat.reward` factor). */
export function threatRewardMult(level: number): number {
  let m = 1;
  for (const r of threatRungs(level)) m += r.rewardBonus;
  return m;
}

/** Milestone titles (cosmetic only), resolvable by id for the profile title chain. */
export const THREAT_TITLES: { id: string; name: string; level: number }[] = THREAT_LEVELS
  .filter((r) => r.title).map((r) => ({ id: r.title!.id, name: r.title!.name, level: r.level }));

export function threatTitleName(id: string): string | null {
  return THREAT_TITLES.find((t) => t.id === id)?.name ?? null;
}

/** Titles EARNED by clearing up to `level` (in any mode). */
export function threatTitlesThrough(level: number): string[] {
  return THREAT_TITLES.filter((t) => t.level <= level).map((t) => t.id);
}

/** What a settled Threat run reports (Results renders it; the record + titles persist). */
export interface ThreatOutcome {
  mode: ThreatMode;
  level: number;
  rewardMult: number; // the director's threatEconomy(level) — echoed for the Results line
  cleared: boolean; // the run met its mode's benchmark at this level
  newRecord: boolean; // … and it beat the mode's previous best cleared level
  nextUnlocked: number | null; // the rung this run opened (null when none / at the cap)
  titles: string[]; // milestone titles NEWLY earned (cosmetic)
}

/** Pure settle: fold a finished Threat run into the per-mode record + milestone titles. The record
 *  only grows; titles are derived from the best record across modes (self-healing on merges). */
export function settleThreat(
  record: Readonly<Record<ThreatMode, number>>,
  mode: ThreatMode,
  level: number,
  run: { won: boolean; wave: number; stage?: number; frontier?: number },
  ownedTitles: readonly string[],
  rewardMult: number,
): { record: Record<ThreatMode, number>; outcome: ThreatOutcome } {
  const lvl = clampThreat(level, THREAT_MAX);
  const cleared = lvl > 0 && threatBenchmarkMet(mode, run);
  const newRecord = cleared && lvl > (record[mode] ?? 0);
  const next = newRecord ? { ...record, [mode]: lvl } : { ...record };
  const best = Math.max(0, ...THREAT_MODES.map((m) => next[m] ?? 0));
  const titles = threatTitlesThrough(best).filter((id) => !ownedTitles.includes(id));
  return {
    record: next,
    outcome: { mode, level: lvl, rewardMult, cleared, newRecord, nextUnlocked: newRecord && lvl < THREAT_MAX ? lvl + 1 : null, titles },
  };
}

/** Registry-level validation (vows.ts pattern) — threat.test runs it. A rung must be a real
 *  HANDICAP on an existing warp axis, contiguous, and pay a modest positive bonus. */
export function threatProblems(): string[] {
  const out: string[] = [];
  const MULT = ['countMult', 'hpMult', 'damageMult', 'speedMult', 'bountyMult'];
  THREAT_LEVELS.forEach((r, i) => {
    if (r.level !== i + 1) out.push(`rung ${i}: level must be contiguous (got ${r.level})`);
    if (!r.name || !r.blurb || !r.icon) out.push(`rung ${r.level}: name/blurb/icon required`);
    const keys = Object.keys(r.warp);
    if (keys.length === 0) out.push(`rung ${r.level}: must stack a real modifier`);
    for (const [k, v] of Object.entries(r.warp)) {
      if (k === 'eliteChance') { if (!(v > 0 && v <= 0.2)) out.push(`rung ${r.level}: eliteChance outside (0, 0.2]`); continue; }
      if (!MULT.includes(k)) { out.push(`rung ${r.level}: '${k}' is not a threat lever`); continue; }
      const harder = k === 'bountyMult' ? v < 1 && v >= 0.7 : v > 1 && v <= 1.3;
      if (!harder) out.push(`rung ${r.level}: ${k}=${v} must be a modest handicap`);
    }
    if (!(r.rewardBonus > 0 && r.rewardBonus <= 0.15)) out.push(`rung ${r.level}: rewardBonus outside (0, 0.15]`);
  });
  if (THREAT_MAX < 10) out.push(`the ladder needs ≥ 10 rungs (has ${THREAT_MAX})`);
  return out;
}
