// Data-driven achievements — pure milestone checks over the save (+ the optional
// last-run summary). Unlocking is recognition/feedback only; it never touches the
// sim or grants power, so it adds zero gameplay. Add an entry to grow the set —
// the toaster, persistence, and sound are generic.

import { TOWER_ORDER } from '../core/config';
import type { SaveData } from '../save/saveStore';

/** Minimal run summary (structurally a subset of RunResult — avoids a meta import). */
export interface RunSummary {
  wave: number;
  kills: number;
  won: boolean;
}

export interface AchievementCtx {
  save: SaveData; // the save AFTER the run/change is applied
  run?: RunSummary; // present when evaluating at run end
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string; // placeholder glyph (swappable for art)
  test: (c: AchievementCtx) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_run', name: 'First Contact', desc: 'Finish your first run.', icon: '🧬', test: (c) => c.save.totalRuns >= 1 },
  { id: 'wave5', name: 'Holding the Line', desc: 'Reach wave 5.', icon: '🛡️', test: (c) => c.save.bestWave >= 5 },
  { id: 'extract', name: 'Extraction', desc: 'Survive every wave and extract.', icon: '🏆', test: (c) => !!c.run?.won },
  { id: 'centurion', name: 'Centurion', desc: 'Score 100 kills in a single run.', icon: '💀', test: (c) => (c.run?.kills ?? 0) >= 100 },
  { id: 'first_star', name: 'Ascendant', desc: 'Upgrade a tower to ★1.', icon: '⭐', test: (c) => TOWER_ORDER.some((k) => (c.save.towerStars[k] ?? 0) >= 1) },
  { id: 'star3', name: 'Star Forged', desc: 'Bring a tower to ★3.', icon: '🌟', test: (c) => TOWER_ORDER.some((k) => (c.save.towerStars[k] ?? 0) >= 3) },
  { id: 'specialist', name: 'Specialist', desc: 'Reach 2,000 Mastery XP on a tower.', icon: '📈', test: (c) => TOWER_ORDER.some((k) => (c.save.towerMasteryXp[k] ?? 0) >= 2000) },
  { id: 'hero_shard', name: 'Champion Fragment', desc: 'Collect a Hero Shard.', icon: '✦', test: (c) => Object.values(c.save.heroShards).some((n) => n > 0) },
  { id: 'hoarder', name: 'Hoarder', desc: 'Bank 500 lifetime Shards.', icon: '◆', test: (c) => c.save.lifetimeShards >= 500 },
  { id: 'veteran', name: 'Veteran', desc: 'Complete 10 runs.', icon: '🎖️', test: (c) => c.save.totalRuns >= 10 },
];

/** Achievements whose condition is now met but which aren't yet unlocked. */
export function checkAchievements(ctx: AchievementCtx): AchievementDef[] {
  const have = new Set(ctx.save.achievements ?? []);
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.test(ctx));
}

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
