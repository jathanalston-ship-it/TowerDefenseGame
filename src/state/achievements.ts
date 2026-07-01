// Data-driven achievement framework — pure milestone checks over the save (+ the
// optional last-run summary). Unlocking is recognition/feedback (and an optional
// Genome Cores reward); it never touches the sim or grants combat power, so it adds zero
// gameplay drift. Add an entry to grow the set — persistence, toasts, rewards,
// progress bars, and hidden reveals are all generic.
//
// Architecture (per the brief — build the framework, not hundreds of entries):
//   • hidden   — concealed until unlocked (surprise milestones).
//   • reward   — Genome Cores granted once on unlock (0/absent = recognition only).
//   • progress — optional lifetime tracker {cur,max} → drives the panel's bar.
//   • test     — the unlock predicate. Reads `save` (incl. lifetime `save.stats`,
//                the statistics-system integration) and the optional run summary.

import { TOWER_ORDER } from '../core/config';
import { ACCOUNT_CURRENCY } from '../core/currencies';
import type { SaveData } from '../save/saveStore';

/** Minimal run summary (structurally a subset of RunResult — avoids a meta import). */
export interface RunSummary {
  wave: number;
  kills: number;
  won: boolean;
}

export interface AchievementCtx {
  save: SaveData; // the save AFTER the run/change is applied (incl. save.stats)
  run?: RunSummary; // present when evaluating at run end
}

export interface AchievementProgress {
  cur: number;
  max: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  hidden?: boolean; // concealed in the gallery until unlocked
  reward?: number; // Genome Cores granted on unlock
  test: (c: AchievementCtx) => boolean;
  /** Optional lifetime progress for the gallery bar (run-only goals omit it). */
  progress?: (c: AchievementCtx) => AchievementProgress;
}

const maxStars = (s: SaveData): number => Math.max(0, ...TOWER_ORDER.map((k) => s.towerStars[k] ?? 0));
const maxMastery = (s: SaveData): number => Math.max(0, ...TOWER_ORDER.map((k) => s.towerMasteryXp[k] ?? 0));

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Milestones (visible, save/run based) ──
  { id: 'tutorial_complete', name: 'Assimilation Protocol', desc: 'Complete the Combat Tutorial.', reward: 20, test: (c) => c.save.tutorial.completed.includes('combat') },
  { id: 'first_run', name: 'First Contact', desc: 'Finish your first run.', reward: 10, test: (c) => c.save.totalRuns >= 1 },
  { id: 'wave5', name: 'Holding the Line', desc: 'Reach wave 5.', reward: 15, test: (c) => c.save.bestWave >= 5, progress: (c) => ({ cur: c.save.bestWave, max: 5 }) },
  { id: 'extract', name: 'Extraction', desc: 'Survive every wave and extract.', reward: 50, test: (c) => !!c.run?.won },
  { id: 'centurion', name: 'Centurion', desc: 'Score 100 kills in a single run.', reward: 25, test: (c) => (c.run?.kills ?? 0) >= 100 },
  { id: 'veteran', name: 'Veteran', desc: 'Complete 10 runs.', reward: 50, test: (c) => c.save.totalRuns >= 10, progress: (c) => ({ cur: c.save.totalRuns, max: 10 }) },
  { id: 'hoarder', name: 'Hoarder', desc: `Bank 500 lifetime ${ACCOUNT_CURRENCY.name}.`, reward: 40, test: (c) => c.save.lifetimeShards >= 500, progress: (c) => ({ cur: c.save.lifetimeShards, max: 500 }) },

  // ── Progression (towers) ──
  { id: 'first_star', name: 'Ascendant', desc: 'Upgrade a tower to one star.', reward: 10, test: (c) => maxStars(c.save) >= 1, progress: (c) => ({ cur: maxStars(c.save), max: 1 }) },
  { id: 'star3', name: 'Star Forged', desc: 'Bring a tower to three stars.', reward: 30, test: (c) => maxStars(c.save) >= 3, progress: (c) => ({ cur: maxStars(c.save), max: 3 }) },
  { id: 'specialist', name: 'Specialist', desc: 'Reach 2,000 Mastery XP on a tower.', reward: 25, test: (c) => maxMastery(c.save) >= 2000, progress: (c) => ({ cur: maxMastery(c.save), max: 2000 }) },
  { id: 'hero_shard', name: 'Champion Fragment', desc: 'Collect a Hero Shard.', test: (c) => Object.values(c.save.heroShards).some((n) => n > 0) },

  // ── Statistics-driven (integrates with the lifetime stats system) ──
  { id: 'exterminator', name: 'Exterminator', desc: 'Kill 1,000 enemies (lifetime).', reward: 60, test: (c) => c.save.stats.lifetimeKills >= 1000, progress: (c) => ({ cur: c.save.stats.lifetimeKills, max: 1000 }) },
  { id: 'biomass_baron', name: 'Biomass Baron', desc: 'Harvest 50,000 biomass (lifetime).', reward: 60, test: (c) => c.save.stats.totalBiomass >= 50000, progress: (c) => ({ cur: c.save.stats.totalBiomass, max: 50000 }) },
  { id: 'collector', name: 'Gene Collector', desc: 'Collect 12 distinct Gene Cards.', reward: 40, test: (c) => c.save.stats.uniqueCards.length >= 12, progress: (c) => ({ cur: c.save.stats.uniqueCards.length, max: 12 }) },
  { id: 'persistent', name: 'Persistence', desc: 'Complete 5 runs to extraction.', reward: 40, test: (c) => c.save.stats.runsCompleted >= 5, progress: (c) => ({ cur: c.save.stats.runsCompleted, max: 5 }) },

  // ── Hidden (surprise milestones — concealed until earned) ──
  { id: 'apex_slayer', name: 'Apex Slayer', desc: 'Slay a Brood Tyrant.', hidden: true, reward: 75, test: (c) => (c.save.stats.killsByEnemy.tyrant ?? 0) >= 1 },
  { id: 'annihilation', name: 'Annihilation', desc: 'Deal 1,000,000 total damage (lifetime).', hidden: true, reward: 100, test: (c) => c.save.stats.totalDamage >= 1_000_000, progress: (c) => ({ cur: c.save.stats.totalDamage, max: 1_000_000 }) },
];

/** Achievements whose condition is now met but which aren't yet unlocked. */
export function checkAchievements(ctx: AchievementCtx): AchievementDef[] {
  const have = new Set(ctx.save.achievements ?? []);
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.test(ctx));
}

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Total Genome Cores a set of newly-unlocked achievements grants. */
export function rewardFor(defs: AchievementDef[]): number {
  return defs.reduce((sum, a) => sum + (a.reward ?? 0), 0);
}
