// QUESTS & MISSIONS (docs/QUESTS.md) — the game's directive layer. MISSIONS compose QUESTS:
// each mission is a counted objective (a closed condition vocabulary judged at the meta
// seams), paying its own reward; completing every mission in a quest opens the quest's
// FINALE — currency plus, for story quests, a guaranteed CUTSCENE unlock and an exclusive
// Wardrobe cosmetic.
//
// Two lanes, one framework:
//   • WEEKLY quests — one live at a time from a rotating ring (7-day UTC windows, the
//     Battle-Pass pattern: max-window tamper rule, rollover auto-claims earned rewards,
//     PROGRESS NEVER CARRIES OVER). Repeat rotations replay the quest; already-granted
//     one-time finales (cutscene/cosmetic) substitute into currency.
//   • The MAIN QUESTLINE — the game's story spine: permanent chapters of 10 missions,
//     sequential (a chapter opens when the previous finale is claimed), never resets.
//
// PURE core: window math, defs, the condition judge, and progress folding. The meta layer
// owns persistence, crediting seams (finishRun / vault / expeditions / roulette / pass
// levels) and claims. Rewards reuse the Battle Pass reward language (one interpreter).
//
// Quest-adjacent kin: Champion Contracts (core/contracts.ts) share the constraint DNA and
// are surfaced on the same Quest Board — contracts stay the weekly SKILL checks; missions
// are the weekly/story GRIND arcs.

import type { PassReward } from './battlePass';
import type { ContractRunFacts } from './contracts';

// ── Config ─────────────────────────────────────────────────────────────────────
export const QUESTS = {
  /** Weekly quests rotate on 7-day UTC windows from the same Monday epoch the pass uses. */
  rotationMs: 7 * 86_400_000,
  epochMs: Date.UTC(2026, 6, 6), // 2026-07-06T00:00Z (Monday)
  /** Currency substituted for an already-granted one-time finale (cutscene/cosmetic). */
  repeatFinale: { ichor: 40, cores: 300 },
} as const;

export function weeklyWindow(now: number): number {
  return Math.max(0, Math.floor((now - QUESTS.epochMs) / QUESTS.rotationMs));
}
export function msToWeeklyRotation(now: number): number {
  return QUESTS.epochMs + (weeklyWindow(now) + 1) * QUESTS.rotationMs - now;
}

// ── Mission conditions — the closed vocabulary ─────────────────────────────────
/** Run facts a settled run reports to the judge — the contract facts plus depth extras. */
export interface QuestRunFacts extends ContractRunFacts {
  bossKills: number;
  megaKills: number;
}

export type QuestMode = ContractRunFacts['mode'] | 'any';

/** RUN conditions add qualifying-run counts (or accumulate magnitudes); META conditions
 *  count meta-side acts credited from their seams. Adding a verb = one case in judge(). */
export type MissionCond =
  | { kind: 'runs'; mode?: QuestMode } // settled runs (win or lose)
  | { kind: 'wins'; mode?: QuestMode }
  | { kind: 'waveReached'; wave: number; mode?: QuestMode } // runs that reached the wave
  | { kind: 'flawlessWins' } // win + zero integrity lost
  | { kind: 'leanWins'; maxTowers: number } // win with ≤ N total builds
  | { kind: 'killsTotal' } // accumulates kills across runs
  | { kind: 'bossKillsTotal' } // accumulates framework-boss kills
  | { kind: 'megaKillsTotal' } // accumulates Mega Boss kills
  | { kind: 'containersOpened' } // Vault cracks
  | { kind: 'expeditionsClaimed' } // Hero Expedition returns
  | { kind: 'rouletteCollects' } // Bio-Roulette ceremonies collected
  | { kind: 'passLevels' }; // Battle Pass levels gained

/** A meta-side credit event (non-run seams push these). */
export type QuestMetaEvent =
  | { type: 'containers'; n: number }
  | { type: 'expeditions'; n: number }
  | { type: 'roulette'; n: number }
  | { type: 'passLevels'; n: number };

/** How much progress ONE event contributes to a mission (0 = not this mission's business). */
export function missionCredit(cond: MissionCond, ev: { type: 'run'; facts: QuestRunFacts } | QuestMetaEvent): number {
  if (ev.type === 'run') {
    const f = ev.facts;
    const modeOk = (m?: QuestMode): boolean => m === undefined || m === 'any' || m === f.mode;
    switch (cond.kind) {
      case 'runs': return modeOk(cond.mode) ? 1 : 0;
      case 'wins': return f.won && modeOk(cond.mode) ? 1 : 0;
      case 'waveReached': return f.wave >= cond.wave && modeOk(cond.mode) ? 1 : 0;
      case 'flawlessWins': return f.won && f.integrityLost <= 0 ? 1 : 0;
      case 'leanWins': {
        const built = Object.values(f.towerBuilds).reduce((a: number, n) => a + (n ?? 0), 0);
        return f.won && built <= cond.maxTowers ? 1 : 0;
      }
      case 'killsTotal': return Math.max(0, Math.floor(f.kills));
      case 'bossKillsTotal': return Math.max(0, Math.floor(f.bossKills));
      case 'megaKillsTotal': return Math.max(0, Math.floor(f.megaKills));
      default: return 0;
    }
  }
  switch (cond.kind) {
    case 'containersOpened': return ev.type === 'containers' ? ev.n : 0;
    case 'expeditionsClaimed': return ev.type === 'expeditions' ? ev.n : 0;
    case 'rouletteCollects': return ev.type === 'roulette' ? ev.n : 0;
    case 'passLevels': return ev.type === 'passLevels' ? ev.n : 0;
    default: return 0;
  }
}

// ── Defs ───────────────────────────────────────────────────────────────────────
export interface MissionDef {
  id: string; // '<questId>:<slug>'
  name: string;
  blurb: string; // states the objective in plain language
  cond: MissionCond;
  target: number; // progress needed
  rewards: PassReward[];
}

export interface QuestDef {
  id: string;
  lane: 'weekly' | 'main';
  name: string;
  tagline: string;
  glyph: string;
  accent: string; // CSS color
  missions: MissionDef[];
  /** The finale: repeatable currency + (story quests) the guaranteed one-time unlocks. */
  finaleRewards: PassReward[];
  finaleCutscene: string; // cutscene id unlocked FOREVER on first completion
  finaleCosmetic: string; // wardrobe item id granted FOREVER on first completion
}

const m = (questId: string, slug: string, name: string, blurb: string, cond: MissionCond, target: number, rewards: PassReward[]): MissionDef =>
  ({ id: `${questId}:${slug}`, name, blurb, cond, target, rewards });

// ── The weekly ring (one live per 7-day window; better-than-average payouts) ───
export const WEEKLY_QUESTS: QuestDef[] = [
  {
    id: 'wk_red_harvest', lane: 'weekly', name: 'The Red Harvest', glyph: '✸', accent: '#ff5d73',
    tagline: 'The hive is hungry this week. Feed it well.',
    missions: [
      m('wk_red_harvest', 'reap', 'First Reaping', 'Eliminate 400 enemies this week.', { kind: 'killsTotal' }, 400, [{ kind: 'cores', qty: 140 }]),
      m('wk_red_harvest', 'stand', 'Stand Twice', 'Win 2 runs in any mode.', { kind: 'wins' }, 2, [{ kind: 'geneEssence', qty: 90 }]),
      m('wk_red_harvest', 'tyrants', 'Tyrant Tax', 'Fell 6 bosses.', { kind: 'bossKillsTotal' }, 6, [{ kind: 'cores', qty: 180 }]),
      m('wk_red_harvest', 'clean', 'Not One Drop', 'Win a run without losing Nucleus integrity.', { kind: 'flawlessWins' }, 1, [{ kind: 'ichor', qty: 14 }]),
      m('wk_red_harvest', 'deep', 'Push the Line', 'Reach wave 14 in any run.', { kind: 'waveReached', wave: 14 }, 1, [{ kind: 'mats', mutagen: 4, scrap: 12, catalyst: 2 }]),
      m('wk_red_harvest', 'crack', 'Open the Larder', 'Crack 3 Bio-Containers in the Vault.', { kind: 'containersOpened' }, 3, [{ kind: 'cores', qty: 150 }]),
    ],
    finaleRewards: [{ kind: 'ichor', qty: 30 }, { kind: 'container', rarity: 'epic', count: 2 }, { kind: 'cores', qty: 260 }],
    finaleCutscene: 'story:red_harvest',
    finaleCosmetic: 'wd_projectiletrail_reaper_s_wake',
  },
  {
    id: 'wk_deep_signals', lane: 'weekly', name: 'Deep Signals', glyph: '∿', accent: '#8fd0ff',
    tagline: 'Something under the strata is transmitting. Go listen.',
    missions: [
      m('wk_deep_signals', 'descend', 'Descend Twice', 'Reach Depth 10 in two Infinite runs.', { kind: 'waveReached', wave: 10, mode: 'endless' }, 2, [{ kind: 'cores', qty: 170 }]),
      m('wk_deep_signals', 'sorties', 'Constant Sorties', 'Settle 4 runs in any mode.', { kind: 'runs' }, 4, [{ kind: 'geneEssence', qty: 80 }]),
      m('wk_deep_signals', 'static', 'Clear the Static', 'Eliminate 300 enemies this week.', { kind: 'killsTotal' }, 300, [{ kind: 'cores', qty: 120 }]),
      m('wk_deep_signals', 'listeners', 'Send Listeners', 'Claim 2 returned Hero Expeditions.', { kind: 'expeditionsClaimed' }, 2, [{ kind: 'mats', mutagen: 3, scrap: 10, catalyst: 3 }]),
      m('wk_deep_signals', 'season', 'Boost the Antenna', 'Gain 3 Season Pass levels.', { kind: 'passLevels' }, 3, [{ kind: 'cores', qty: 160 }]),
      m('wk_deep_signals', 'tyrants', 'Silence the Escorts', 'Fell 8 bosses.', { kind: 'bossKillsTotal' }, 8, [{ kind: 'ichor', qty: 12 }]),
    ],
    finaleRewards: [{ kind: 'ichor', qty: 30 }, { kind: 'container', rarity: 'legendary', count: 1 }, { kind: 'geneEssence', qty: 220 }],
    finaleCutscene: 'story:deep_signals',
    finaleCosmetic: 'wd_nucleusskin_signal_heart',
  },
  {
    id: 'wk_long_watch', lane: 'weekly', name: 'The Long Watch', glyph: '☄', accent: '#b6e84a',
    tagline: 'A week of discipline: hold, spend little, waste nothing.',
    missions: [
      m('wk_long_watch', 'hold', 'Hold Three Times', 'Win 3 runs in any mode.', { kind: 'wins' }, 3, [{ kind: 'cores', qty: 160 }]),
      m('wk_long_watch', 'lean', 'Lean Garrison', 'Win a run building 8 towers or fewer.', { kind: 'leanWins', maxTowers: 8 }, 1, [{ kind: 'ichor', qty: 14 }]),
      m('wk_long_watch', 'clean', 'The Unbroken Wall', 'Win a run without losing Nucleus integrity.', { kind: 'flawlessWins' }, 1, [{ kind: 'geneEssence', qty: 100 }]),
      m('wk_long_watch', 'wheel', 'One Spin of the Wheel', 'Collect a Bio-Roulette ceremony.', { kind: 'rouletteCollects' }, 1, [{ kind: 'cores', qty: 130 }]),
      m('wk_long_watch', 'stores', 'Audit the Stores', 'Crack 4 Bio-Containers in the Vault.', { kind: 'containersOpened' }, 4, [{ kind: 'mats', mutagen: 4, scrap: 14, catalyst: 2 }]),
      m('wk_long_watch', 'watchline', 'Watch the Deep Line', 'Reach wave 12 in any run.', { kind: 'waveReached', wave: 12 }, 1, [{ kind: 'cores', qty: 140 }]),
    ],
    finaleRewards: [{ kind: 'ichor', qty: 30 }, { kind: 'cores', qty: 320 }, { kind: 'container', rarity: 'epic', count: 2 }],
    finaleCutscene: 'story:long_watch',
    finaleCosmetic: 'wd_banner_watchfire_standard',
  },
];

/** The weekly quest live in a rotation window (the ring wraps forever). */
export function weeklyQuestFor(window: number): QuestDef {
  return WEEKLY_QUESTS[window % WEEKLY_QUESTS.length];
}

// ── THE MAIN QUESTLINE — “The Descent Below” (the game's story spine) ──────────
// Sequential chapters; each opens when the previous finale is CLAIMED. Progress is
// permanent and only the ACTIVE chapter accrues (a questline, not a checklist farm).
export const MAIN_QUESTLINE: QuestDef[] = [
  {
    id: 'mq_awakening', lane: 'main', name: 'Chapter I — Awakening', glyph: '❖', accent: '#b6e84a',
    tagline: 'The Core opens its first eye. Teach it what defense means.',
    missions: [
      m('mq_awakening', 'stir', 'First Stirrings', 'Settle 3 runs in any mode.', { kind: 'runs' }, 3, [{ kind: 'cores', qty: 90 }]),
      m('mq_awakening', 'hold', 'Hold the Line', 'Win 2 runs.', { kind: 'wins' }, 2, [{ kind: 'geneEssence', qty: 60 }]),
      m('mq_awakening', 'cull', 'The First Cull', 'Eliminate 500 enemies.', { kind: 'killsTotal' }, 500, [{ kind: 'cores', qty: 120 }]),
      m('mq_awakening', 'descent', 'Begin the Descent', 'Win a Campaign stage.', { kind: 'wins', mode: 'campaign' }, 1, [{ kind: 'towerShardsAll', qtyEach: 6 }]),
      m('mq_awakening', 'wall', 'Test the Wall', 'Reach wave 8 in any run.', { kind: 'waveReached', wave: 8 }, 1, [{ kind: 'cores', qty: 100 }]),
      m('mq_awakening', 'taste', 'A Taste of Tyrants', 'Fell 3 bosses.', { kind: 'bossKillsTotal' }, 3, [{ kind: 'geneEssence', qty: 80 }]),
      m('mq_awakening', 'larder', 'Open the Larder', 'Crack 2 Bio-Containers.', { kind: 'containersOpened' }, 2, [{ kind: 'cores', qty: 110 }]),
      m('mq_awakening', 'scout', 'Send a Scout', 'Claim a returned Hero Expedition.', { kind: 'expeditionsClaimed' }, 1, [{ kind: 'mats', mutagen: 2, scrap: 8, catalyst: 1 }]),
      m('mq_awakening', 'season', 'Feel the Season', 'Gain 2 Season Pass levels.', { kind: 'passLevels' }, 2, [{ kind: 'cores', qty: 120 }]),
      m('mq_awakening', 'perfect', 'A Perfect Hold', 'Win a run without losing Nucleus integrity.', { kind: 'flawlessWins' }, 1, [{ kind: 'ichor', qty: 10 }]),
    ],
    finaleRewards: [{ kind: 'ichor', qty: 50 }, { kind: 'container', rarity: 'epic', count: 2 }, { kind: 'cores', qty: 400 }, { kind: 'heroShardsAll', qtyEach: 10 }],
    finaleCutscene: 'story:mq_awakening',
    finaleCosmetic: 'wd_emblem_first_eye',
  },
  {
    id: 'mq_choirs', lane: 'main', name: 'Chapter II — The Choirs', glyph: '♆', accent: '#d98cff',
    tagline: 'The organ-lords sing to something below. Count the voices.',
    missions: [
      m('mq_choirs', 'campaigns', 'March Deeper', 'Win 5 runs in any mode.', { kind: 'wins' }, 5, [{ kind: 'cores', qty: 160 }]),
      m('mq_choirs', 'harvest', 'The Great Harvest', 'Eliminate 2,000 enemies.', { kind: 'killsTotal' }, 2000, [{ kind: 'geneEssence', qty: 140 }]),
      m('mq_choirs', 'tyrants', 'Break the Escorts', 'Fell 15 bosses.', { kind: 'bossKillsTotal' }, 15, [{ kind: 'cores', qty: 200 }]),
      m('mq_choirs', 'colossus', 'Silence One Voice', 'Defeat a Mega Boss.', { kind: 'megaKillsTotal' }, 1, [{ kind: 'ichor', qty: 20 }]),
      m('mq_choirs', 'deepline', 'The Fifteenth Ring', 'Reach wave 15 in two runs.', { kind: 'waveReached', wave: 15 }, 2, [{ kind: 'cores', qty: 180 }]),
      m('mq_choirs', 'lean', 'Doctrine of Less', 'Win a run building 8 towers or fewer.', { kind: 'leanWins', maxTowers: 8 }, 1, [{ kind: 'geneEssence', qty: 120 }]),
      m('mq_choirs', 'vault', 'Feed the Vault', 'Crack 8 Bio-Containers.', { kind: 'containersOpened' }, 8, [{ kind: 'cores', qty: 170 }]),
      m('mq_choirs', 'wheel', 'Two Turns of the Wheel', 'Collect 2 Bio-Roulette ceremonies.', { kind: 'rouletteCollects' }, 2, [{ kind: 'mats', mutagen: 5, scrap: 16, catalyst: 4 }]),
      m('mq_choirs', 'endless', 'Prove It Endless', 'Win an Infinite run (extract past your qualifying depth).', { kind: 'wins', mode: 'endless' }, 1, [{ kind: 'cores', qty: 190 }]),
      m('mq_choirs', 'season', 'Ride the Season', 'Gain 5 Season Pass levels.', { kind: 'passLevels' }, 5, [{ kind: 'geneEssence', qty: 150 }]),
    ],
    finaleRewards: [{ kind: 'ichor', qty: 60 }, { kind: 'container', rarity: 'legendary', count: 1 }, { kind: 'cores', qty: 600 }, { kind: 'towerShardsAll', qtyEach: 12 }],
    finaleCutscene: 'story:mq_choirs',
    finaleCosmetic: 'wd_banner_choirbreaker',
  },
  {
    id: 'mq_root', lane: 'main', name: 'Chapter III — The Root', glyph: '⏚', accent: '#e24dff',
    tagline: 'Past the choirs, the digging continues — from the other side.',
    missions: [
      m('mq_root', 'war', 'A Long War', 'Win 10 runs in any mode.', { kind: 'wins' }, 10, [{ kind: 'cores', qty: 260 }]),
      m('mq_root', 'legion', 'Cull the Legion', 'Eliminate 6,000 enemies.', { kind: 'killsTotal' }, 6000, [{ kind: 'geneEssence', qty: 220 }]),
      m('mq_root', 'tyrants', 'Fell the Vanguard', 'Fell 40 bosses.', { kind: 'bossKillsTotal' }, 40, [{ kind: 'cores', qty: 300 }]),
      m('mq_root', 'colossi', 'Three Silences', 'Defeat 3 Mega Bosses.', { kind: 'megaKillsTotal' }, 3, [{ kind: 'ichor', qty: 30 }]),
      m('mq_root', 'perfects', 'Immaculate Defense', 'Win 3 runs without losing integrity.', { kind: 'flawlessWins' }, 3, [{ kind: 'cores', qty: 280 }]),
      m('mq_root', 'abyss', 'The Twenty-Fifth Ring', 'Reach wave 25 in any run.', { kind: 'waveReached', wave: 25 }, 1, [{ kind: 'geneEssence', qty: 200 }]),
      m('mq_root', 'hoard', 'Empty the Hoard', 'Crack 15 Bio-Containers.', { kind: 'containersOpened' }, 15, [{ kind: 'cores', qty: 260 }]),
      m('mq_root', 'expedition', 'Map the Depths', 'Claim 6 returned Hero Expeditions.', { kind: 'expeditionsClaimed' }, 6, [{ kind: 'mats', mutagen: 8, scrap: 24, catalyst: 6 }]),
      m('mq_root', 'wheel', 'Five Turns of the Wheel', 'Collect 5 Bio-Roulette ceremonies.', { kind: 'rouletteCollects' }, 5, [{ kind: 'cores', qty: 240 }]),
      m('mq_root', 'discipline', 'Doctrine Perfected', 'Win 2 runs building 8 towers or fewer.', { kind: 'leanWins', maxTowers: 8 }, 2, [{ kind: 'geneEssence', qty: 180 }]),
    ],
    finaleRewards: [{ kind: 'ichor', qty: 80 }, { kind: 'container', rarity: 'legendary', count: 2 }, { kind: 'cores', qty: 900 }, { kind: 'heroShardsAll', qtyEach: 20 }],
    finaleCutscene: 'story:mq_root',
    finaleCosmetic: 'wd_uitheme_the_root',
  },
];

// ── Lookups & shared math ──────────────────────────────────────────────────────
export const ALL_QUESTS: QuestDef[] = [...WEEKLY_QUESTS, ...MAIN_QUESTLINE];
const QUEST_BY_ID = new Map(ALL_QUESTS.map((q) => [q.id, q] as const));
const MISSION_BY_ID = new Map(ALL_QUESTS.flatMap((q) => q.missions.map((mi) => [mi.id, mi] as const)));

export function questById(id: string): QuestDef | undefined {
  return QUEST_BY_ID.get(id);
}
export function missionById(id: string): MissionDef | undefined {
  return MISSION_BY_ID.get(id);
}
/** Every mission across every quest (the Missions codex enumerates this). */
export function allMissions(): MissionDef[] {
  return ALL_QUESTS.flatMap((q) => q.missions);
}

/** A quest is COMPLETE when every mission's progress meets its target. */
export function questComplete(q: QuestDef, progress: Record<string, number>): boolean {
  return q.missions.every((mi) => (progress[mi.id] ?? 0) >= mi.target);
}

/** Fold one credit event into a progress map for the given missions (capped at target).
 *  Returns the ids that moved (the UI toasts on them) — {} in, {} out, no mutation. */
export function foldCredit(
  missions: MissionDef[],
  progress: Record<string, number>,
  ev: { type: 'run'; facts: QuestRunFacts } | QuestMetaEvent,
): { next: Record<string, number>; moved: string[] } {
  let next = progress;
  const moved: string[] = [];
  for (const mi of missions) {
    const cur = progress[mi.id] ?? 0;
    if (cur >= mi.target) continue;
    const add = missionCredit(mi.cond, ev);
    if (add <= 0) continue;
    if (next === progress) next = { ...progress };
    next[mi.id] = Math.min(mi.target, cur + add);
    moved.push(mi.id);
  }
  return { next, moved };
}
