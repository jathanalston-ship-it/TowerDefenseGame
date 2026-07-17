// MARKET CATALOG (docs/AUCTION-HOUSE.md §catalog) — the Auction House's family vocabulary,
// DERIVED from the real content registries (cards, equipment, wardrobe, classic cosmetics).
// This is the foundational-inheritance seam: new content added to any registry automatically
// gains market eligibility, search labels, baseline-stock classification, and server-side
// listing validation — no per-item market wiring, ever.
//
// A FAMILY is the price-history aggregation identity: every instance of the same thing
// shares one family (gene.<cardId>, eq.<defId>.<rarity>, cos.<id>). `exclusive` marks what
// the Market Authority must NEVER stock as baseline supply (seasonal/limited/event/pass/
// achievement/prestige/arena/exotic — the player-scarcity economy); players may still trade
// those freely. `neverTrade` is the server-refusal seam for categorically untradable
// families (none today — instance-level soul-binding lives in itemIdentity stamps).
//
// Pure data module: no DOM, no state imports, no Math.random.

import { CARD_POOL } from './cards';
import type { CardDef } from './cards';
import { STARTER_GENES } from './geneDiscovery';
import { ALL_ITEMS, RARITY_ORDER } from './equipment';
import type { EquipDef, Rarity } from './equipment';
import { WARDROBE_ITEMS } from './wardrobe';
import type { WardrobeItemDef } from './wardrobe';
import { cosmeticRegistry } from './cosmetics';
import type { CosmeticDef } from './cosmetics';
import type { TradableCategory } from './itemIdentity';
import type { BaselineCatalogEntry } from './marketAuthority';
import { baselineEligible } from './marketAuthority';

export interface MarketFamily {
  familyKey: string;
  cat: TradableCategory;
  /** Display + text-search label (the client resolves free text → family keys with this). */
  name: string;
  rarity: string;
  /** The Market Authority must never stock this as baseline supply. */
  exclusive: boolean;
  /** The server refuses listings outright. The one categorical ban today: content the save
   *  SANITIZER re-seeds on every load (starter genes, starter wardrobe items) — selling a
   *  thing that self-heals back would be an infinite Ichor printer. Per-instance binding
   *  stays itemIdentity's job. */
  neverTrade: boolean;
}

export function geneFamilyKey(cardId: string): string {
  return `gene.${cardId}`;
}
/** Equipment families are per-def PER-RARITY — a common and an exotic of the same def are
 *  different market identities (mixing them would poison the price statistics). */
export function equipmentFamilyKey(defId: string, rarity: string): string {
  return `eq.${defId}.${rarity}`;
}
export function cosmeticFamilyKey(id: string): string {
  return `cos.${id}`;
}

// ── Exclusivity rules (reviewable in one place — docs/AUCTION-HOUSE.md §baseline) ──
/** Ultra-rare genes stay out of baseline stock at ANY future band (defense in depth on top
 *  of the authority's rarity band, which already stops at uncommon). */
function geneExclusive(def: CardDef): boolean {
  return def.rarity === 'epic' || def.rarity === 'legendary';
}
/** Exotic defs (and the exotic band of any def) are chase items — never baseline. */
function equipmentExclusive(def: EquipDef, rarity: Rarity): boolean {
  return def.exotic === true || rarity === 'exotic';
}
/** Wardrobe: only the Ichor boutique ('shop') and starter rows are foundational; every
 *  earned/seasonal lane (battlepass, event, quest, achievement, collection, milestone,
 *  campaign/infinite/daily/login/rush/roulette grinds) is player-scarcity — exclusive. */
function wardrobeExclusive(def: WardrobeItemDef): boolean {
  return def.source.kind !== 'shop' && def.source.kind !== 'starter';
}
/** Classic cosmetics: the cultivate pool is the foundational lane; contract/nemesis
 *  rewards are earned exclusives. */
function classicCosmeticExclusive(def: CosmeticDef): boolean {
  return def.source !== 'cultivate';
}

let cache: MarketFamily[] | null = null;
let byKey: Map<string, MarketFamily> | null = null;

/** The full derived catalog (built once, cached — registries are static content). */
export function marketFamilies(): MarketFamily[] {
  if (cache) return cache;
  const starterGenes = new Set(STARTER_GENES);
  const out: MarketFamily[] = [];
  for (const c of CARD_POOL) {
    out.push({ familyKey: geneFamilyKey(c.id), cat: 'geneCard', name: c.name, rarity: c.rarity, exclusive: geneExclusive(c), neverTrade: starterGenes.has(c.id) });
  }
  for (const d of ALL_ITEMS) {
    for (const r of RARITY_ORDER) {
      out.push({
        familyKey: equipmentFamilyKey(d.id, r), cat: 'equipment', name: `${d.name} (${r})`,
        rarity: r, exclusive: equipmentExclusive(d, r), neverTrade: false,
      });
    }
  }
  for (const w of WARDROBE_ITEMS) {
    out.push({ familyKey: cosmeticFamilyKey(w.id), cat: 'cosmetic', name: w.name, rarity: w.rarity, exclusive: wardrobeExclusive(w), neverTrade: w.source.kind === 'starter' });
  }
  for (const c of cosmeticRegistry.active()) {
    out.push({ familyKey: cosmeticFamilyKey(c.id), cat: 'cosmetic', name: c.name, rarity: c.rarity, exclusive: classicCosmeticExclusive(c), neverTrade: false });
  }
  cache = out;
  return out;
}

export function marketFamily(key: string): MarketFamily | undefined {
  if (!byKey) byKey = new Map(marketFamilies().map((f) => [f.familyKey, f]));
  return byKey.get(key);
}

/** The Market Authority's restock input (core/marketAuthority.planBaselineRestock) — every
 *  family, classified; the authority's own band + exclusivity rules pick the stockable set.
 *  neverTrade families ride the `exclusive` channel: never stocked either way. */
export function baselineCatalog(): BaselineCatalogEntry[] {
  return marketFamilies().map((f) => ({ familyKey: f.familyKey, cat: f.cat, rarity: f.rarity, exclusive: f.exclusive || f.neverTrade }));
}

/** The families the authority may actually stock (derived; used by hosts + tests).
 *  neverTrade families are excluded too — everyone already owns the self-healing starters. */
export function stockableFamilies(): MarketFamily[] {
  return marketFamilies().filter((f) => !f.exclusive && !f.neverTrade && baselineEligible({ familyKey: f.familyKey, cat: f.cat, rarity: f.rarity, exclusive: f.exclusive }));
}

/** "Authority Eligible" overrides (docs/AUCTION-HOUSE.md §buybacks) — the per-family data
 *  hook for the liquidity engine: `true` widens the buyback band for a specific family,
 *  `false` vetoes one outright. EMPTY by design today; exclusivity always wins regardless.
 *  This is deliberately a hand-curated map, never derived — flagging an item for buyback
 *  support is a design decision, not a registry property. */
export const AUTHORITY_ELIGIBLE_OVERRIDES: Readonly<Record<string, boolean>> = {};

/** Content-integrity check (registered beside the other registry validators):
 *  unique keys, non-empty names, and at least one stockable family per category
 *  (the baseline lane must never silently die as content evolves). */
export function marketCatalogProblems(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const f of marketFamilies()) {
    if (seen.has(f.familyKey)) problems.push(`duplicate market family key: ${f.familyKey}`);
    seen.add(f.familyKey);
    if (!f.name) problems.push(`market family without a name: ${f.familyKey}`);
  }
  for (const cat of ['equipment', 'cosmetic', 'geneCard'] as const) {
    if (!stockableFamilies().some((f) => f.cat === cat)) {
      problems.push(`no baseline-stockable ${cat} family — the authority's ${cat} lane is dead`);
    }
  }
  return problems;
}
