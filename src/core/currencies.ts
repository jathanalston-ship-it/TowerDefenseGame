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

export type CurrencyId = 'genomeCores' | 'towerShards' | 'heroShards' | 'ascendantCells' | 'geneEssence';

export interface CurrencyDef {
  /** Stable framework id (see STORAGE NOTE — not always the save key). */
  id: CurrencyId;
  /** Canonical player-facing name, shown wherever the currency appears. */
  name: string;
  /** One-line description for tooltips: what it is, how it's earned and spent. */
  blurb: string;
  // ── Visual identity ──────────────────────────────────────────────────────────────────────
  // Each currency owns a UNIQUE silhouette (the <CurrencyIcon> SVG), color and glow so a reward
  // is recognizable from the visual alone — never the text. Tower/Hero Shards are per-kind, so
  // their `color` here is a sensible default; callers pass the specific tower/hero color to tint
  // the same shard/sigil shape. Idle + pickup motion live in CSS keyed on `cur-${id}`.
  /** Signature color (CSS value — a token like `var(--gold)` or a hex). */
  color: string;
  /** Glow color used for the icon drop-shadow / pickup burst (rgba so it can sit under the fill). */
  glow: string;
}

export const CURRENCIES: Record<CurrencyId, CurrencyDef> = {
  // Primary account currency — the broad meta-progression spend. Renamed from "Shards" so it no
  // longer collides with the per-tower / per-hero Shard currencies below. Gold double-helix.
  genomeCores: {
    id: 'genomeCores',
    name: 'Genome Cores',
    blurb: 'Refined genetic capital. Banked from every run, spent on Permanent Upgrades and Molt.',
    color: 'var(--gold)',
    glow: 'rgba(255, 210, 77, 0.6)',
  },
  // Tower-colored crystal shard. `color` is the default; tower contexts pass the tower's own hue.
  towerShards: {
    id: 'towerShards',
    name: 'Strain Samples',
    blurb: 'Per-strain DNA cracked from bio-containers. Spliced into strain Evolutions.',
    color: 'var(--kinetic)',
    glow: 'rgba(90, 209, 255, 0.55)',
  },
  // Hero-colored star sigil. `color` is the default; hero contexts pass the hero's own hue.
  heroShards: {
    id: 'heroShards',
    name: 'Apex Genome',
    blurb: 'Per-champion DNA cracked from bio-containers. Spliced into champion Evolutions.',
    color: 'var(--vital)',
    glow: 'rgba(255, 122, 89, 0.55)',
  },
  // Prestige currency — a violet dividing cell, deliberately unlike the other three.
  ascendantCells: {
    id: 'ascendantCells',
    name: 'Ascendant Cells',
    blurb: 'Prestige currency minted by Molting. Permanently empowers the hive.',
    color: 'var(--viral)',
    glow: 'rgba(226, 77, 255, 0.55)',
  },
  // Gene Essence — the permanent Gene Card upgrade currency (docs/GENE-EVOLUTION.md). Earned mainly by
  // AUTO-CONVERTING duplicate max-Star tower/hero shards, plus rare Bio-Container drops. Teal strand.
  geneEssence: {
    id: 'geneEssence',
    name: 'Gene Essence',
    blurb: 'Distilled genetic memory. Converted from max-Star duplicate shards + rare Bio-Container drops; spent to permanently upgrade Gene Cards in the Gene Archive.',
    color: 'var(--caustic, #6ad1b0)',
    glow: 'rgba(106, 209, 176, 0.55)',
  },
};

/** Look up a currency definition by id. */
export function currency(id: CurrencyId): CurrencyDef {
  return CURRENCIES[id];
}

/** The primary account currency — the broad meta spend surfaced on the HUD, Results and shop. */
export const ACCOUNT_CURRENCY = CURRENCIES.genomeCores;
