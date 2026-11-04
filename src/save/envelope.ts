// SAVE ENVELOPE (docs/ACCOUNTS.md §save-architecture) — the versioned, described,
// MODULAR wrapper every cloud upload and file export can ride. The in-memory
// SaveData stays the single aggregate the game reads (public API untouched); the
// envelope PARTITIONS it into independent modules at the persistence boundary, so
// versioning, integrity, conflict preview and per-module merge all operate on
// named parts instead of one opaque blob.
//
// Losslessness is structural: the LAST module ('core') claims every field no other
// module named — a brand-new SaveData field is carried automatically, and the
// round-trip test (envelope.test.ts) pins reassembly to exact identity.

import type { SaveData } from './saveStore';
import { CURRENT_VERSION } from './saveStore';
import { hashStr } from '../core/hash';

export const ENVELOPE_FORMAT = 2; // v1 = the bare {schemaVersion, data} export wrapper
/** Envelope-level migration counter — bump when the MODULE PARTITION itself changes
 *  shape (module renames/splits). SaveData content migrations stay on schemaVersion. */
export const ENVELOPE_MIGRATION = 0;

/** One independent save module: a named set of SaveData fields. */
export interface SaveModuleDef {
  id: string;
  fields: readonly (keyof SaveData & string)[];
}

/** The partition. Order matters only for reassembly determinism; 'core' is the
 *  structural catch-all and MUST stay last. */
export const SAVE_MODULES: readonly SaveModuleDef[] = [
  { id: 'profile', fields: ['profileName', 'profileFrame', 'createdAt', 'unlockedTitles', 'equippedTitle', 'timeline'] },
  { id: 'wallet', fields: ['shards', 'lifetimeShards', 'ichor', 'lifetimeIchor', 'mats', 'matPity', 'geneEssence'] },
  { id: 'progression', fields: ['upgrades', 'prestige', 'research', 'expeditions', 'infestation', 'adaptation', 'antigen', 'mulligans', 'mulliganDex', 'nucleus'] },
  { id: 'towers', fields: ['towerShards', 'towerStars', 'towerForks', 'towerMasteryXp', 'towerKills', 'towerUnlocked', 'favoriteTower'] },
  { id: 'heroes', fields: ['heroShards', 'heroStars', 'heroForks', 'heroMasteryXp', 'heroKills', 'selectedHero', 'heroLoadout', 'heroUnlocked', 'heroFavEquip', 'heroSymbiotes'] },
  { id: 'equipment', fields: ['equipment', 'lastSalvage'] },
  { id: 'genes', fields: ['genes', 'geneSlots', 'geneLoadout', 'cardsSeen'] },
  { id: 'campaign', fields: ['campaign', 'nemesis', 'vengeance'] },
  { id: 'infinite', fields: ['bestWave'] },
  { id: 'bossRush', fields: ['rushBestWave', 'rushBestBoss', 'rushLegacyBestBoss', 'rushStamina'] },
  { id: 'daily', fields: ['daily', 'contracts'] },
  { id: 'collections', fields: ['unlockedLore', 'bossesSlain', 'megaProgress', 'cosmetics', 'equippedTrophies'] },
  { id: 'loot', fields: ['lootQueue', 'pendingContainers', 'market', 'premium'] },
  { id: 'statistics', fields: ['stats', 'totalRuns'] },
  { id: 'achievements', fields: ['achievements'] },
  { id: 'tutorial', fields: ['tutorial', 'help', 'prediction'] },
  { id: 'core', fields: [] }, // catch-all — computed at pick time, never listed
];

const CLAIMED = new Set<string>(SAVE_MODULES.flatMap((m) => m.fields));

/** The versioned wrapper. Top-level `schemaVersion` deliberately matches the v1
 *  export shape — the server's cheap blob check and old importers keep working. */
export interface SaveEnvelope {
  fmt: typeof ENVELOPE_FORMAT;
  schemaVersion: number;
  migration: number;
  accountId: string;
  platform: string;
  savedAt: number; // ms epoch
  playtimeSec: number;
  power: number; // headline Power Score (conflict preview)
  campaignStage: number; // headline campaign progress (conflict preview)
  checksum: string;
  modules: Record<string, Record<string, unknown>>;
}

/** The cloud-save headline the server stores alongside the blob (preview without
 *  download). Kept flat + tiny (the server caps meta at 2 KB). */
export interface EnvelopeMeta {
  savedAt: number;
  playtimeSec: number;
  power: number;
  campaignStage: number;
  schemaVersion: number;
  checksum: string;
  platform: string;
}

function checksumOf(modules: Record<string, Record<string, unknown>>): string {
  const canonical = JSON.stringify(SAVE_MODULES.map((m) => [m.id, modules[m.id] ?? {}]));
  // Two independent FNV passes (offset by a salt prefix) → 64 bits of integrity
  // against accidental corruption. NOT tamper-proof (the client is untrusted by
  // design — entitlements are server-authoritative; docs/ACCOUNTS.md §security).
  return `${(hashStr(canonical) >>> 0).toString(16)}-${(hashStr(`assim:${canonical}`) >>> 0).toString(16)}`;
}

export function buildEnvelope(
  save: SaveData,
  ctx: { accountId: string; platform: string; power: number; campaignStage: number },
): SaveEnvelope {
  const modules: Record<string, Record<string, unknown>> = {};
  const bag = save as unknown as Record<string, unknown>;
  for (const m of SAVE_MODULES) {
    const part: Record<string, unknown> = {};
    if (m.id === 'core') {
      for (const k of Object.keys(bag)) if (!CLAIMED.has(k)) part[k] = bag[k];
    } else {
      for (const k of m.fields) if (k in bag) part[k] = bag[k];
    }
    modules[m.id] = part;
  }
  return {
    fmt: ENVELOPE_FORMAT,
    schemaVersion: CURRENT_VERSION,
    migration: ENVELOPE_MIGRATION,
    accountId: ctx.accountId,
    platform: ctx.platform,
    savedAt: Date.now(),
    playtimeSec: save.stats?.playtimeSec ?? 0,
    power: Math.round(ctx.power),
    campaignStage: ctx.campaignStage,
    checksum: checksumOf(modules),
    modules,
  };
}

/** True when `v` parses as a v2 envelope (shape check only — verify separately). */
export function isEnvelope(v: unknown): v is SaveEnvelope {
  const e = v as SaveEnvelope | null;
  return !!e && e.fmt === ENVELOPE_FORMAT && typeof e.schemaVersion === 'number' && !!e.modules && typeof e.modules === 'object';
}

/** Integrity check — a corrupted/truncated envelope is refused before import. */
export function verifyEnvelope(e: SaveEnvelope): boolean {
  return typeof e.checksum === 'string' && checksumOf(e.modules) === e.checksum;
}

/** Reassemble the flat SaveData object (as JSON text) from the module partition.
 *  The result feeds the NORMAL import path (parseImport → sanitizer → migrations),
 *  so envelope restores get every defense the file import has. */
export function openEnvelope(e: SaveEnvelope): string {
  const flat: Record<string, unknown> = {};
  for (const m of SAVE_MODULES) Object.assign(flat, e.modules[m.id] ?? {});
  return JSON.stringify({ schemaVersion: e.schemaVersion, data: flat });
}

export function envelopeMeta(e: SaveEnvelope): EnvelopeMeta {
  return {
    savedAt: e.savedAt,
    playtimeSec: e.playtimeSec,
    power: e.power,
    campaignStage: e.campaignStage,
    schemaVersion: e.schemaVersion,
    checksum: e.checksum,
    platform: e.platform,
  };
}
