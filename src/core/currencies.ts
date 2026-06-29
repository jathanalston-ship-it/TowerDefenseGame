// Currency framework — the single source of truth for every spendable currency in ASSIMILATE.
// One definition per currency keeps names (and, in the visual-identity pass, colors / glyphs /
// pickup effects) in one data-driven place, so a NEW currency plugs in here without hunting
// through the UI. Pure metadata: no save/DOM imports, so the core stays testable and light.
//
// STORAGE NOTE — a currency's `id` is its stable framework identifier, which is NOT always its
// save key. The primary account currency is `genomeCores` here but persists under the legacy
// save keys `shards` / `lifetimeShards`, retained for save compatibility (renaming the stored
// keys would force a schema migration across the economy/prestige tests for zero player-visible
// benefit). Tower/Hero Shards keep both their name AND their `towerShards` / `heroShards` keys.

export type CurrencyId = 'genomeCores' | 'towerShards' | 'heroShards' | 'ascendantCells';

export interface CurrencyDef {
  /** Stable framework id (see STORAGE NOTE — not always the save key). */
  id: CurrencyId;
  /** Canonical player-facing name, shown wherever the currency appears. */
  name: string;
  /** One-line description for tooltips: what it is, how it's earned and spent. */
  blurb: string;
}

export const CURRENCIES: Record<CurrencyId, CurrencyDef> = {
  // Primary account currency — the broad meta-progression spend. Renamed from "Shards" so it no
  // longer collides with the per-tower / per-hero Shard currencies below.
  genomeCores: {
    id: 'genomeCores',
    name: 'Genome Cores',
    blurb: 'Refined genetic capital. Banked from every run, spent on Permanent Upgrades and Molt.',
  },
  towerShards: {
    id: 'towerShards',
    name: 'Tower Shards',
    blurb: 'Per-tower currency cracked from bio-containers. Spent on tower Stars.',
  },
  heroShards: {
    id: 'heroShards',
    name: 'Hero Shards',
    blurb: 'Per-hero currency cracked from bio-containers. Spent on hero Stars.',
  },
  ascendantCells: {
    id: 'ascendantCells',
    name: 'Ascendant Cells',
    blurb: 'Prestige currency minted by Molting. Permanently empowers the hive.',
  },
};

/** Look up a currency definition by id. */
export function currency(id: CurrencyId): CurrencyDef {
  return CURRENCIES[id];
}

/** The primary account currency — the broad meta spend surfaced on the HUD, Results and shop. */
export const ACCOUNT_CURRENCY = CURRENCIES.genomeCores;
