// PLAYER-FACING CURRENCIES (docs/ECONOMY.md §player-facing) — the presentation gate between the
// economy and the screen. The economy stays exactly as it is (nothing merged, withheld or
// converted in the save); this layer only decides what the player SEES:
//
//   (a) a currency / reward kind is never shown or announced before the system that spends it
//       has revealed (docs/PROGRESSION-GATING.md). Earlier drops bank silently and surface once,
//       as the balance the new wing opens onto;
//   (b) the secondary upgrade/crafting wallets (Gene Essence · Mutagen · Scrap · Catalyst ·
//       Chitin · Mulligan Tissue) read as ONE "Materials" group everywhere — the top-bar chip,
//       reward toasts, the Vault summary and the Results "Also earned" row — instead of six
//       separate counters.
//
// The first hours therefore show four currencies — Biomass (in-run), Genome Cores, the per-unit
// Strain Samples / Apex Genome, and Ichor once the Splice Market opens — plus the one grouped
// Materials chip. Pure over SaveData.

import { featureRevealed } from './unlocks';
import { rewardTypeOf } from './rewardToast';
import type { RewardEvent } from './rewardToast';
import type { ChestResult, RewardItem } from './lootbox';
import type { SaveData } from '../save/saveStore';
import { CURRENCIES } from '../core/currencies';
import { MATERIAL_META } from '../core/materialDrop';

/** Reward/currency key → the unlock-registry feature whose reveal makes it player-facing. Keys
 *  are REWARD_TYPES ids, CurrencyIds, loot event currencies and material kinds. A key absent
 *  here is always visible (Biomass, Genome Cores, Strain Samples, Apex Genome, containers). */
export const REVEALED_WITH: Readonly<Record<string, string>> = {
  geneEssence: 'genes', // spent in the Gene Archive
  ichor: 'cur:ichor', // the Splice Market's currency (the chip reveals with the Market)
  cells: 'cur:cells', ascendantCells: 'cur:cells', // minted by the first Molt
  antigen: 'adaptation', // spent in the Adaptation Chamber
  mulliganTissue: 'mulligans', mulligan: 'mulligans', mulliganModifier: 'mulligans', // the Mulligan Lab
  hiveMaterials: 'harvest', idleLoot: 'harvest', // Chitin grows the Hive's production organs
  organ: 'hive',
  mutagen: 'equipment', scrap: 'equipment', catalyst: 'equipment', // Armory crafting
  equipment: 'equipment',
  bioSpores: 'bossrush', stamina: 'bossrush', // the Boss Rush economy (Roulette spores, entries)
  bpXp: 'season', passStack: 'season', // the Season Pass track
  cosmetic: 'phenotypes', phenotype: 'phenotypes', // the wardrobe
};

/** The secondary wallets presented as ONE "Materials" group (they stay separate in the save and
 *  the economy — this is presentation only). Order = the chip's breakdown order. */
export const MATERIAL_KEYS = ['geneEssence', 'mutagen', 'scrap', 'catalyst', 'hiveMaterials', 'mulliganTissue'] as const;
export type MaterialKey = (typeof MATERIAL_KEYS)[number];
const MATERIAL_SET: ReadonlySet<string> = new Set(MATERIAL_KEYS);

export function isMaterial(key: string): key is MaterialKey {
  return MATERIAL_SET.has(key);
}

/** Is this reward/currency kind player-facing yet on this save? */
export function rewardVisible(save: SaveData, key: string): boolean {
  const f = REVEALED_WITH[key];
  return !f || featureRevealed(save, f);
}

/** Display name + glyph of one Materials member. */
export function materialLabel(k: MaterialKey): { name: string; glyph: string } {
  switch (k) {
    case 'geneEssence': return { name: CURRENCIES.geneEssence.name, glyph: '⌬' };
    case 'hiveMaterials': return { name: CURRENCIES.hiveMaterials.name, glyph: '⬢' };
    case 'mulliganTissue': return { name: CURRENCIES.mulliganTissue.name, glyph: '⊛' };
    default: return { name: MATERIAL_META[k].name, glyph: MATERIAL_META[k].icon };
  }
}

/** The toast presenter: null hides a not-yet-revealed kind (it banked silently); a Materials
 *  member toasts as a "Materials" card that keeps its member name ("Materials · Gene Essence"). */
export function presentRewardEvent(save: SaveData, e: RewardEvent): RewardEvent | null {
  if (!rewardVisible(save, e.type)) return null;
  // The member keeps its own "view it" jump (Essence → Gene Archive, Chitin → the Hive, …).
  if (isMaterial(e.type)) return { ...e, type: 'materials', name: materialLabel(e.type).name, nav: e.nav !== undefined ? e.nav : rewardTypeOf(e.type)?.nav ?? null };
  return e;
}

/** Vault-reveal filter: drop pulls whose system hasn't revealed (they still banked). New Gene
 *  Card strands stay visible — drafting is part of the run from minute 0; only the Essence echo
 *  of a known strand waits for the Archive. */
export function rewardItemVisible(save: SaveData, item: RewardItem): boolean {
  switch (item.type) {
    case 'material': return rewardVisible(save, item.mat);
    case 'equipment': return rewardVisible(save, 'equipment');
    case 'cosmetic': return rewardVisible(save, 'cosmetic');
    case 'event': return rewardVisible(save, item.currency);
    case 'gene': return item.isNew || rewardVisible(save, 'geneEssence');
    default: return true;
  }
}

/** The chests a Vault ceremony shows — each chest's pulls filtered by rewardItemVisible. */
export function visibleChests(save: SaveData, chests: readonly ChestResult[]): ChestResult[] {
  return chests.map((c) => ({ ...c, items: c.items.filter((it) => rewardItemVisible(save, it)) }));
}

export interface MaterialWallet { key: MaterialKey; name: string; glyph: string; amount: number }

/** The Materials group's visible members (revealed systems only), for the top-bar chip. */
export function materialWallets(save: SaveData): MaterialWallet[] {
  const amount: Record<MaterialKey, number> = {
    geneEssence: save.geneEssence ?? 0,
    mutagen: save.mats.mutagen, scrap: save.mats.scrap, catalyst: save.mats.catalyst,
    hiveMaterials: save.hiveMaterials ?? 0, mulliganTissue: save.mulliganTissue ?? 0,
  };
  return MATERIAL_KEYS.filter((k) => rewardVisible(save, k)).map((k) => ({ key: k, ...materialLabel(k), amount: amount[k] }));
}

/** The player-facing currency SET the hub currently shows (the ≤4-in-the-first-hours budget,
 *  measured): Biomass (in-run) and Genome Cores always; the per-unit Samples / Apex Genome
 *  family once a lab reveals; Ichor with the Market; then the later systems' own wallets. The
 *  grouped Materials chip is reported separately (`materialsChip`) — it is one panel, not a
 *  currency, whatever it holds. */
export function playerFacingCurrencies(save: SaveData): { currencies: string[]; materialsChip: boolean } {
  const out = ['Biomass', CURRENCIES.genomeCores.name];
  if (featureRevealed(save, 'towers') || featureRevealed(save, 'heroes')) out.push(`${CURRENCIES.towerShards.name} / ${CURRENCIES.heroShards.name}`);
  if (rewardVisible(save, 'ichor')) out.push(CURRENCIES.ichor.name);
  if (rewardVisible(save, 'cells')) out.push(CURRENCIES.ascendantCells.name);
  if (rewardVisible(save, 'antigen')) out.push(CURRENCIES.antigen.name);
  if (rewardVisible(save, 'bioSpores')) out.push('Bio-Spores');
  return { currencies: out, materialsChip: featureRevealed(save, 'cur:mats') && materialWallets(save).length > 0 };
}
