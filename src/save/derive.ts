// Pure derivations over SaveData that MANY layers need (state, UI read-models, mechanics).
// This module exists so those readers share ONE implementation without importing the meta store
// (which would create meta ↔ reader cycles) — it depends only on the save schema's types.
// Add a derivation here the moment a second module needs it; never re-inline.

import { DEEP_STRAIN_STAGE, MODE_UNLOCKS } from '../core/config';
import { CUTSCENES } from '../core/cutscenes';
import type { CutsceneDef } from '../core/cutscenes';
import type { DoctrineDef } from '../core/doctrines';
import { automationGate } from '../core/hivemind';
import type { AutomationMode } from '../core/hivemind';
import { THREAT_BENCHMARK, threatMaxSelectable } from '../core/threat';
import type { ThreatMode } from '../core/threat';
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

/** Boss Rush unlock (docs/MODE-IDENTITY.md §gates): clear Campaign Stage MODE_UNLOCKS.bossRush.
 *  Pre-gate rush accounts are grandfathered in via their records/ledgers — and so is an account
 *  whose Boss Rush wing already REVEALED (latched) under an earlier, lower gate: a re-paced
 *  timeline never seals a mode the player was already shown. */
export function isBossRushUnlocked(save: SaveData): boolean {
  return (
    highestCampaignStage(save) >= MODE_UNLOCKS.bossRush ||
    save.rushBestWave > 0 ||
    (save.stats?.rushRuns ?? 0) > 0 ||
    save.director?.revealed?.bossrush !== undefined
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

/** Doctrine unlock (docs/DOCTRINES.md §gates): each doctrine names its campaign stage. Accounts
 *  that have ALREADY run a doctrine are grandfathered via the doctrineRuns ledger — a gate added
 *  after the fact never takes an option away. */
export function isDoctrineUnlocked(save: SaveData, def: DoctrineDef): boolean {
  return (
    def.unlockStage <= 0 ||
    highestCampaignStage(save) >= def.unlockStage ||
    (save.stats?.doctrineRuns?.[def.id] ?? 0) > 0
  );
}

/** Has this account EVER felled a Mega Boss? The Bio-Container meter's awakening gate
 *  (docs/LOOTBOX.md §meter): until the first mega falls, runs pay run/stage caches only —
 *  the loot queue banks nothing. Derived from the lifetime slain ledger (written live by the
 *  megaKilled event), so veterans are unlocked the moment the gate ships. */
export function hasSlainMega(save: SaveData): boolean {
  return save.megaProgress.slain.length > 0;
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

// ── THREAT LADDER (docs/THREAT.md) — save-aware reads over the pure ladder ─────────────────

/** The mode's Threat-0 benchmark, DERIVED from existing records so veterans start one rung up:
 *  any cleared Campaign stage (a replay exists) / the Infinite depth / the Boss Rush wave record. */
export function threatBaselineMet(save: SaveData, mode: ThreatMode): boolean {
  if (mode === 'campaign') return highestCampaignStage(save) >= 1;
  if (mode === 'endless') return save.bestWave >= THREAT_BENCHMARK.endless.wave;
  return save.rushBestWave >= THREAT_BENCHMARK.bossRush.wave;
}

/** The mode's best CLEARED Threat level (0 = none above the baseline). */
export function threatCleared(save: SaveData, mode: ThreatMode): number {
  return save.threat?.[mode] ?? 0;
}

/** The highest Threat level the picker may offer in this mode right now. */
export function threatMaxFor(save: SaveData, mode: ThreatMode): number {
  return threatMaxSelectable(threatCleared(save, mode), threatBaselineMet(save, mode));
}

/** Is this Campaign stage already cleared on that difficulty track (a replay, not the frontier)? */
export function campaignStageCleared(save: SaveData, stage: number, difficulty: string): boolean {
  return stage >= 1 && stage <= (save.campaign?.cleared?.[difficulty] ?? 0);
}

/** THE AUTOMATION GATE, save-aware (docs/HIVE-MIND.md §solved-content): the meta layer's verdict
 *  for one run, threaded into the sim as RunOptions.automationAllowed (+ the reason the HUD shows). */
export function automationFor(
  save: SaveData,
  run: { mode: AutomationMode; tutorial: boolean; stage?: number; difficulty?: string; threat?: number },
): { allowed: boolean; reason: string | null } {
  const ladder: ThreatMode | null = run.mode === 'campaign' || run.mode === 'endless' || run.mode === 'bossRush' ? run.mode : null;
  return automationGate({
    campaignCleared: highestCampaignStage(save),
    mode: run.mode,
    tutorial: run.tutorial,
    contentCleared: run.mode === 'campaign' && run.stage !== undefined && campaignStageCleared(save, run.stage, run.difficulty ?? 'standard'),
    threat: run.threat ?? 0,
    threatCleared: ladder ? threatCleared(save, ladder) : 0,
  });
}
