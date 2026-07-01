// Pure derivations over SaveData that MANY layers need (state, UI read-models, mechanics).
// This module exists so those readers share ONE implementation without importing the meta store
// (which would create meta ↔ reader cycles) — it depends only on the save schema's types.
// Add a derivation here the moment a second module needs it; never re-inline.

import type { SaveData } from './saveStore';

/** Highest Campaign stage cleared on ANY difficulty track — the player's furthest progress.
 *  Drives the Evolution Cap, gene-level gates, mechanic unlocks, and loadout slot gates.
 *  0 for a fresh account. */
export function highestCampaignStage(save: SaveData): number {
  let max = 0;
  for (const v of Object.values(save.campaign?.cleared ?? {})) max = Math.max(max, v ?? 0);
  return max;
}
