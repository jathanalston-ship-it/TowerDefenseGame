// Achievements & titles — the long-term *motivation* layer (not power). Each
// achievement is pure data: an id, copy, a group (for chains), an optional wearable
// title, and a `check` over a small save-derived stats view. Adding one is a single
// array entry; nothing here grants stats, so achievements can never inflate balance.
//
// Thresholds that mean "collect them all" are derived from the live content tables
// (enemies/biomes/cards), so they stay correct automatically as content grows — no
// magic numbers to update when Task-4 content is added.

import { CARD_POOL } from './cards';
import { ENEMY_DEFS } from './config';
import { BIOMES } from './biomes';

export const TOTAL_ENEMIES = Object.keys(ENEMY_DEFS).length;
export const TOTAL_BIOMES = Object.keys(BIOMES).length;
export const TOTAL_CARDS = CARD_POOL.length;

/** The minimal, save-derived view an achievement check reads. Built by meta.ts. */
export interface AchievementStats {
  totalRuns: number;
  bestWave: number; // classic depth
  bestStage: number;
  stagesCleared: number;
  bestEndlessWave: number;
  bestEndlessScore: number;
  lifetimeShards: number;
  enemiesSeen: number;
  biomesSeen: number;
  cardsSeen: number;
}

export type AchievementGroup = 'Initiation' | 'Defense' | 'Stage' | 'Endless' | 'Collection';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  group: AchievementGroup;
  /** Capstones grant a wearable title (shown on the main menu). */
  title?: string;
  check: (s: AchievementStats) => boolean;
}

// Ordered within each group from easy → hard so the UI renders natural chains and
// `titleFor` can pick the rarest reached title by scan order.
export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Initiation — just keep playing ──
  { id: 'first_run', name: 'First Assimilation', description: 'Finish your first run.', group: 'Initiation', check: (s) => s.totalRuns >= 1 },
  { id: 'persistent', name: 'Persistent Strain', description: 'Finish 25 runs.', group: 'Initiation', check: (s) => s.totalRuns >= 25 },
  { id: 'relentless', name: 'Relentless', description: 'Finish 100 runs.', group: 'Initiation', title: 'the Relentless', check: (s) => s.totalRuns >= 100 },

  // ── Defense — the classic 12-wave hold ──
  { id: 'first_blood', name: 'Hold the Line', description: 'Reach wave 6 in any mode.', group: 'Defense', check: (s) => Math.max(s.bestWave, s.bestEndlessWave) >= 6 },
  { id: 'extraction', name: 'Extraction', description: 'Survive all 12 classic waves.', group: 'Defense', title: 'Defender', check: (s) => s.bestWave >= 12 },

  // ── Stage — the procedural ladder ──
  { id: 'stage_breaker', name: 'Stage Breaker', description: 'Clear Stage 3.', group: 'Stage', check: (s) => s.bestStage >= 3 },
  { id: 'pathfinder', name: 'Pathfinder', description: 'Clear Stage 8.', group: 'Stage', check: (s) => s.bestStage >= 8 },
  { id: 'deep_strain', name: 'Deep Strain', description: 'Clear Stage 15.', group: 'Stage', title: 'Stagebreaker', check: (s) => s.bestStage >= 15 },

  // ── Endless — the leaderboard climb ──
  { id: 'tide_holder', name: 'Tide Holder', description: 'Reach wave 15 in Endless.', group: 'Endless', check: (s) => s.bestEndlessWave >= 15 },
  { id: 'unbroken', name: 'Unbroken', description: 'Reach wave 30 in Endless.', group: 'Endless', check: (s) => s.bestEndlessWave >= 30 },
  { id: 'apex_endless', name: 'Apex Endless', description: 'Reach wave 50 in Endless.', group: 'Endless', title: 'the Endless', check: (s) => s.bestEndlessWave >= 50 },

  // ── Collection — the codex completion goals ──
  { id: 'naturalist', name: 'Naturalist', description: 'Discover 8 enemy strains.', group: 'Collection', check: (s) => s.enemiesSeen >= 8 },
  { id: 'apex_naturalist', name: 'Apex Naturalist', description: `Discover all ${TOTAL_ENEMIES} enemy strains.`, group: 'Collection', title: 'the Curator', check: (s) => s.enemiesSeen >= TOTAL_ENEMIES },
  { id: 'cartographer', name: 'Cartographer', description: `Visit all ${TOTAL_BIOMES} biomes.`, group: 'Collection', check: (s) => s.biomesSeen >= TOTAL_BIOMES },
  { id: 'archivist', name: 'Archivist', description: 'Discover 20 Gene Cards.', group: 'Collection', check: (s) => s.cardsSeen >= 20 },
  { id: 'geneticist', name: 'Geneticist', description: `Discover all ${TOTAL_CARDS} Gene Cards.`, group: 'Collection', title: 'the Geneticist', check: (s) => s.cardsSeen >= TOTAL_CARDS },
];

export const ACHIEVEMENT_GROUPS: AchievementGroup[] = ['Initiation', 'Defense', 'Stage', 'Endless', 'Collection'];

/** Ids of every achievement whose condition the stats currently satisfy. */
export function evaluateUnlocked(stats: AchievementStats): string[] {
  return ACHIEVEMENTS.filter((a) => a.check(stats)).map((a) => a.id);
}

/** The wearable title for an unlocked set — the rarest (latest in order) titled one. */
export function titleFor(unlocked: ReadonlySet<string>): string | null {
  let t: string | null = null;
  for (const a of ACHIEVEMENTS) if (a.title && unlocked.has(a.id)) t = a.title;
  return t;
}
