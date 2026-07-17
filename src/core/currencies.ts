// Currency framework — the single source of truth for every spendable currency in ASSIMILATION.
// One definition per currency keeps names (and, in the visual-identity pass, colors / glyphs /
// pickup effects) in one data-driven place, so a NEW currency plugs in here without hunting
// through the UI. Pure metadata: no save/DOM imports, so the core stays testable and light.
//
// STORAGE NOTE — a currency's `id` is its stable framework identifier, which is NOT always its
// save key. The primary account currency is `genomeCores` here but persists under the legacy
// save keys `shards` / `lifetimeShards`, retained for save compatibility (renaming the stored
// keys would force a schema migration across the economy/prestige tests for zero player-visible
// benefit). Tower/Hero Shards keep both their name AND their `towerShards` / `heroShards` keys.

export type CurrencyId =
  | 'genomeCores' | 'towerShards' | 'heroShards' | 'ascendantCells' | 'geneEssence' | 'antigen' | 'ichor'
  | 'hiveMaterials' | 'mulliganTissue';

/** The ONE progression system a currency upgrades — the localized-economy law (docs/ECONOMY.md
 *  §localized). Every non-account currency names exactly one spend domain, and no two currencies
 *  share one (`currencyProblems()` enforces it). 'account' is reserved for the deliberately BROAD
 *  wallets — Genome Cores and Ichor — that buy across systems by design. */
export type CurrencyDomain =
  | 'account'
  | 'tower-evolution'
  | 'hero-evolution'
  | 'prestige'
  | 'gene-archive'
  | 'adaptation'
  | 'hive-production'
  | 'mulligans';

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
  // ── Localized-economy metadata (docs/ECONOMY.md §localized) ──────────────────────────────
  /** The one system this currency upgrades ('account' = deliberately broad — see CurrencyDomain). */
  domain: CurrencyDomain;
  /** Acquisition sources (short slugs). Documentation + the overlap law: `currencyProblems()`
   *  requires ≥2 distinct gameplay sources so no currency is a single-activity grind (the one
   *  exception is the prestige mint, whose single faucet — Molt — IS its identity). */
  earnedFrom: string[];
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
    domain: 'account',
    earnedFrom: ['runs', 'campaign-surveys', 'hive-hopper', 'quests-and-pass'],
  },
  // Tower-colored crystal shard. `color` is the default; tower contexts pass the tower's own hue.
  towerShards: {
    id: 'towerShards',
    name: 'Strain Samples',
    blurb: 'Per-strain DNA cracked from bio-containers. Spliced into strain Evolutions.',
    color: 'var(--kinetic)',
    glow: 'rgba(90, 209, 255, 0.55)',
    domain: 'tower-evolution',
    earnedFrom: ['bio-containers', 'hive-hopper', 'splice-market'],
  },
  // Hero-colored star sigil. `color` is the default; hero contexts pass the hero's own hue.
  heroShards: {
    id: 'heroShards',
    name: 'Apex Genome',
    blurb: 'Per-champion DNA cracked from bio-containers. Spliced into champion Evolutions.',
    color: 'var(--vital)',
    glow: 'rgba(255, 122, 89, 0.55)',
    domain: 'hero-evolution',
    earnedFrom: ['bio-containers', 'hive-hopper', 'splice-market'],
  },
  // Prestige currency — a violet dividing cell, deliberately unlike the other three.
  ascendantCells: {
    id: 'ascendantCells',
    name: 'Ascendant Cells',
    blurb: 'Prestige currency minted by Molting. Permanently empowers the hive.',
    color: 'var(--viral)',
    glow: 'rgba(226, 77, 255, 0.55)',
    domain: 'prestige',
    earnedFrom: ['molt'],
  },
  // Gene Essence — the permanent Gene Card upgrade currency (docs/GENE-EVOLUTION.md). Earned mainly by
  // AUTO-CONVERTING duplicate max-Star tower/hero shards, plus rare Bio-Container drops. Teal strand.
  geneEssence: {
    id: 'geneEssence',
    name: 'Gene Essence',
    blurb: 'Distilled genetic memory. Converted from max-Star duplicate shards + rare Bio-Container drops; spent to permanently upgrade Gene Cards in the Gene Archive.',
    color: 'var(--caustic, #6ad1b0)',
    glow: 'rgba(106, 209, 176, 0.55)',
    domain: 'gene-archive',
    earnedFrom: ['dupe-dissolve', 'bio-containers', 'hive-hopper', 'expeditions'],
  },
  // Antigen — the Adaptation specialization currency (docs/ADAPTATION.md). Deliberately scarce:
  // minted by Mastery Ranks, campaign depth, rare Bio-Container traces and achievements — never
  // farmable from repeat runs. Violet spike-ball, distinct from the Ascendant Cells cell shape.
  antigen: {
    id: 'antigen',
    name: 'Antigen',
    blurb: 'Adaptive specialization points. Earned from Mastery Ranks, campaign depth, rare container traces and achievements; spent in a unit’s Adaptation tree to rewrite its behavior.',
    color: 'var(--viral, #c98bff)',
    glow: 'rgba(201, 139, 255, 0.55)',
    domain: 'adaptation',
    earnedFrom: ['mastery-ranks', 'campaign-depth', 'container-traces', 'achievements'],
  },
  // Ichor — the PREMIUM currency (docs/MARKET.md). The organism's black blood: sparse, front-
  // loaded rewards (achievements, collection ranks, campaign milestones, Infinite depth records,
  // rare Bio-Container bleeds), spent in the Splice Market on rarer goods + more containers.
  // Deliberately never farmable; the microtransaction seam exists but stays closed.
  ichor: {
    id: 'ichor',
    name: 'Ichor',
    blurb: 'The organism’s black blood — a rare, premium reserve. Bled from achievements, collection ranks, campaign milestones, Infinite depth records and lucky Bio-Containers; spent in the Splice Market.',
    color: '#e0314b', // arterial crimson — deliberately unlike every other currency hue
    glow: 'rgba(224, 49, 75, 0.6)',
    domain: 'account',
    earnedFrom: ['achievements', 'collection-ranks', 'campaign-milestones', 'depth-records', 'container-bleeds'],
  },
  // Chitin — the Hive-Production build currency (docs/ECONOMY.md §localized). Secreted by the
  // working Hive itself: skimmed off every harvest hopper and hauled home by Expeditions, spent
  // ONLY to grow the Hive's production organs. Hive CONSTRUCTION (core/hiveOrgans.ts) deliberately
  // does NOT take Chitin — that system is the composite sink where the BROAD wallets drain.
  // Olive chitin-plate green, unlike every other hue.
  hiveMaterials: {
    id: 'hiveMaterials',
    name: 'Chitin',
    blurb: 'Structural hive secretion. Skimmed from every Hive harvest and hauled back by Expeditions; spent to grow the Hive’s production organs.',
    color: '#9dbf4e',
    glow: 'rgba(157, 191, 78, 0.55)',
    domain: 'hive-production',
    earnedFrom: ['hive-hopper', 'expeditions'],
  },
  // Mulligan Tissue — the Mulligan graft-upgrade currency (docs/MULLIGANS.md). Dissolved from
  // duplicate modifier sequences (the numbers formerly paid in Gene Essence — a currency swap,
  // not new value), carried by the premium-container Gene Bleed's even split, plus a trickle
  // in the hopper. Rose flesh-pink: graft material at a glance.
  mulliganTissue: {
    id: 'mulliganTissue',
    name: 'Mulligan Tissue',
    blurb: 'Living graft tissue dissolved from duplicate Mulligan modifiers and bled by premium Bio-Containers, with traces in the Hive hopper; spent to upgrade and Ascend Mulligan grafts.',
    color: '#f582a8',
    glow: 'rgba(245, 130, 168, 0.55)',
    domain: 'mulligans',
    earnedFrom: ['dupe-dissolve', 'container-bleed', 'hive-hopper'],
  },
};

/** Look up a currency definition by id. */
export function currency(id: CurrencyId): CurrencyDef {
  return CURRENCIES[id];
}

/** The primary account currency — the broad meta spend surfaced on the HUD, Results and shop. */
export const ACCOUNT_CURRENCY = CURRENCIES.genomeCores;

// ── Localized-economy laws (machine-enforced; currencies.test.ts pins them) ─────────────────
// The registry IS the economy contract: every currency declares the ONE system it upgrades and
// where it comes from, so "add a currency" = one row here — and these laws keep the map honest
// as the roster grows. Colors are compared as strings: that catches copy-paste duplicates (the
// real regression risk), not resolved-hue collisions (Antigen and Ascendant Cells share the
// violet FAMILY deliberately; their silhouettes differ).

/** Validate a currency registry. Returns human-readable violations (empty = lawful). */
export function currencyProblems(defs: Readonly<Record<string, CurrencyDef>> = CURRENCIES): string[] {
  const out: string[] = [];
  const names = new Map<string, string>();
  const colors = new Map<string, string>();
  const domains = new Map<string, string>();
  for (const [key, d] of Object.entries(defs)) {
    if (key !== d.id) out.push(`${key}: record key must equal def.id ('${d.id}')`);
    if (!d.name.trim()) out.push(`${d.id}: name required`);
    if (!d.blurb.trim()) out.push(`${d.id}: blurb required`);
    if (!d.color.trim() || !d.glow.trim()) out.push(`${d.id}: color + glow required (visual identity)`);
    const nameKey = d.name.trim().toLowerCase();
    const dupName = names.get(nameKey);
    if (dupName) out.push(`${d.id}: name '${d.name}' collides with ${dupName}`);
    names.set(nameKey, d.id);
    const dupColor = colors.get(d.color);
    if (dupColor) out.push(`${d.id}: color '${d.color}' collides with ${dupColor} (each currency owns a hue)`);
    colors.set(d.color, d.id);
    // One specialized currency per system — the anti-overlap law. 'account' wallets are exempt
    // (broad by design: Genome Cores, Ichor); every OTHER domain may appear exactly once.
    if (d.domain !== 'account') {
      const dupDomain = domains.get(d.domain);
      if (dupDomain) out.push(`${d.id}: domain '${d.domain}' already upgraded by ${dupDomain} (one currency per system)`);
      domains.set(d.domain, d.id);
    }
    // Overlapping acquisition — ≥2 distinct gameplay sources, so no currency is a single-
    // activity grind. Prestige is the one deliberate single-faucet mint (Molt IS its identity).
    const minSources = d.domain === 'prestige' ? 1 : 2;
    const uniq = new Set(d.earnedFrom.map((s) => s.trim()).filter(Boolean));
    if (uniq.size < minSources || uniq.size !== d.earnedFrom.length) {
      out.push(`${d.id}: needs ≥${minSources} distinct earn sources (got: ${d.earnedFrom.join(', ') || 'none'})`);
    }
  }
  return out;
}
