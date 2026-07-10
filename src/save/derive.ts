// Pure derivations over SaveData that MANY layers need (state, UI read-models, mechanics).
// This module exists so those readers share ONE implementation without importing the meta store
// (which would create meta ↔ reader cycles) — it depends only on the save schema's types.
// Add a derivation here the moment a second module needs it; never re-inline.

import { DEEP_STRAIN_STAGE, MODE_UNLOCKS } from '../core/config';
import { CUTSCENES } from '../core/cutscenes';
import type { CutsceneDef } from '../core/cutscenes';
import type { SaveData } from './saveStore';

/** Highest Campaign stage cleared on ANY difficulty track — the player's furthest progress.
 *  Drives the Evolution Cap, gene-level gates, mechanic unlocks, and loadout slot gates.
 *  0 for a fresh account. */
export function highestCampaignStage(save: SaveData): number {
  let max = 0;
  for (const v of Object.values(save.campaign?.cleared ?? {})) max = Math.max(max, v ?? 0);
  return max;
}

/** Infinite unlock (docs/MODE-IDENTITY.md §gates): clear Campaign Stage 3. Deliberately NOT
 *  grandfathered on save.bestWave — that record also moves on campaign/stage runs, so it can't
 *  identify "has played Infinite" (and the gate itself is minutes of campaign away). */
export function isInfiniteUnlocked(save: SaveData): boolean {
  return highestCampaignStage(save) >= MODE_UNLOCKS.infinite;
}

/** Boss Rush unlock (docs/MODE-IDENTITY.md §gates): clear Campaign Stage 10. Pre-gate rush
 *  accounts are grandfathered in via their records/ledgers. */
export function isBossRushUnlocked(save: SaveData): boolean {
  return (
    highestCampaignStage(save) >= MODE_UNLOCKS.bossRush ||
    save.rushBestWave > 0 ||
    (save.stats?.rushRuns ?? 0) > 0
  );
}

/** Daily Run unlock (docs/DAILY-RUN.md §gates): clear Campaign Stage 5. Accounts with any daily
 *  history are grandfathered in via their ledger. */
export function isDailyUnlocked(save: SaveData): boolean {
  return highestCampaignStage(save) >= MODE_UNLOCKS.daily || save.daily.completions > 0 || save.daily.lastKey !== '';
}

/** Deep-Strain unlock (docs/SIPHON.md §gate): clear Campaign Stage 15. The single milestone that
 *  opens the deep gene cards to the draft AND starts the Marrow Siphon's shards dropping. */
export function isDeepStrainUnlocked(save: SaveData): boolean {
  return highestCampaignStage(save) >= DEEP_STRAIN_STAGE;
}

/** Cutscene unlock resolution (docs/CUTSCENES.md §unlocks) — DERIVED, never stored: megas by
 *  the lifetime slain ledger, story beats by their milestone. Exhaustive over CutsceneUnlock
 *  (a new unlock kind fails to compile here before it can silently never unlock). */
export function isCutsceneUnlocked(save: SaveData, def: CutsceneDef): boolean {
  const u = def.unlock;
  switch (u.kind) {
    case 'mega': return save.megaProgress.slain.includes(u.megaId);
    case 'stage': return highestCampaignStage(save) >= u.stage;
    case 'molt': return (save.prestige?.molts ?? 0) >= 1;
    case 'wave': return save.bestWave >= u.wave;
    case 'quest': return save.quests.once.includes(`cutscene:${u.questId}`);
  }
}

/** Every unlocked cutscene id, in authored order (the Archive + the passive fold read this). */
export function unlockedCutsceneIds(save: SaveData): string[] {
  return CUTSCENES.filter((c) => isCutsceneUnlocked(save, c)).map((c) => c.id);
}
