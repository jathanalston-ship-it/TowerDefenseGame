// Genetic Vault reveal read-model (docs/LOOTBOX.md). ONE pure transform from a rolled
// ChestResult (or several) into the two shapes the reveal ceremony renders:
//   • pulls    — one entry per RAW pull, in roll order. This is the HONEST pull list: its
//                length always equals the container's roll count, so "Pull 2/5" and the
//                cinematic one-by-one reveal can never disagree with what was rolled.
//   • sections — the same pulls MERGED by reward for the end summary: duplicate shard/material
//                pulls collapse into one row carrying a `count` ("×3") and the summed total,
//                grouped into categories. Equipment never merges (each piece is unique).
//
// Merging lives ONLY here, at the summary layer — the pull list is never collapsed. That split
// is the fix for the old bug where a 5-pull container advertised "5 pulls" but showed 3 rewards
// (the reveal merged before counting). Pure: no DOM/React/sim — a state read-model over lootbox
// results, safe to unit-test.

import type { ChestResult, RewardItem } from './lootbox';
import { HERO_DEFS, HERO_LABELS, TOWER_DEFS } from '../core/config';
import type { LootRarity, MaterialKind } from '../core/config';
import type { HeroKind } from '../core/types';
import { itemDef, itemEffects, SLOT_LABELS } from '../core/equipment';
import type { OwnedItem } from '../core/equipment';
import { effectsPower, itemRarityPower, POWER_BASE } from '../core/power';
import type { CurrencyId } from '../core/currencies';

/** Reward families the summary groups by (fixed display order below). */
export type RevealCategory = 'equipment' | 'towerShards' | 'heroShards' | 'materials' | 'other';

const CATEGORY_ORDER: RevealCategory[] = ['equipment', 'towerShards', 'heroShards', 'materials', 'other'];
const CATEGORY_TITLE: Record<RevealCategory, string> = {
  equipment: 'Equipment',
  towerShards: 'Tower Shards',
  heroShards: 'Hero Shards',
  materials: 'Materials',
  other: 'Other',
};

const TIER: LootRarity[] = ['common', 'rare', 'epic', 'legendary', 'exotic'];
const RARITY_LABEL: Record<string, string> = {
  common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY', exotic: 'EXOTIC', mythic: 'MYTHIC',
};
const RARITY_COLOR: Record<string, string> = {
  common: 'var(--r-common)', rare: 'var(--r-rare)', epic: 'var(--r-epic)',
  legendary: 'var(--r-legendary)', exotic: '#5ffbf1', mythic: '#ff5fd2',
};
const MAT_LABEL: Record<MaterialKind, string> = { mutagen: 'Mutagen', scrap: 'Scrap', catalyst: 'Catalyst' };

/** Higher of two rarities (open — an unknown id sorts as lowest so it never wins the finale). */
export function maxRarity(a: LootRarity, b: LootRarity): LootRarity {
  return TIER.indexOf(a) >= TIER.indexOf(b) ? a : b;
}
export function rarityLabel(r: string): string { return RARITY_LABEL[r] ?? r.toUpperCase(); }
export function rarityColor(r: string): string { return RARITY_COLOR[r] ?? 'var(--r-common)'; }

/** An equipment piece's intrinsic Power Score contribution (points over a fresh account), so a
 *  drop reads as "+NN Power" without needing the equip context (the equipped-vs-owned comparison
 *  is a separate feature). Rarity/affix flat weight × behavioral-effect offense multiplier. */
export function itemPowerScore(item: OwnedItem): number {
  const mult = itemRarityPower(item.rarity, item.affixes.length) * effectsPower(itemEffects(item));
  return Math.max(0, Math.round(POWER_BASE * (mult - 1)));
}

/** One revealed pull, display-ready. `qty` is the numeric amount (shards granted, or 1 for a
 *  unique item); `key` is the merge identity used to collapse duplicates in the summary. */
export interface PullView {
  key: string;
  category: RevealCategory;
  rarity: LootRarity;
  color: string;
  name: string;
  qty: number;
  unit: string; // "Shards" / "Hero Shards" / "Materials" / "" (equipment shows its rarity word)
  amountLabel: string; // "+5 Shards" or "EPIC"
  currency?: CurrencyId; // shard pulls → the matching animated currency icon
  glyph?: string; // fallback glyph when there is no currency icon (equipment/material/…)
  power?: number; // equipment: intrinsic Power Score points (drives the highlight)
}

/** A merged summary row — duplicate pulls of the same reward collapsed, `count` = how many. */
export interface SummaryRow {
  key: string;
  category: RevealCategory;
  rarity: LootRarity;
  color: string;
  name: string;
  qty: number; // summed across merged pulls
  count: number; // pulls merged into this row (≥ 1) → the "×N" badge
  amountLabel: string;
  currency?: CurrencyId;
  glyph?: string;
  power?: number; // summed equipment power across merged pulls (equipment never actually merges)
}

export interface SummarySection {
  id: RevealCategory;
  title: string;
  rows: SummaryRow[];
  power: number; // section Power Score total (equipment only; 0 elsewhere)
}

export interface RevealModel {
  count: number; // TRUE pull count — always equals pulls.length (the honest number)
  pulls: PullView[]; // one per raw pull, in roll order (never merged)
  sections: SummarySection[]; // merged + categorized, in CATEGORY_ORDER (empty sections dropped)
  topRarity: LootRarity; // best rarity across all pulls (drives ceremony magnitude)
  totalPower: number; // Power Score gained from equipment in this container
}

function amountLabel(qty: number, unit: string, rarity: LootRarity, isEquip: boolean): string {
  return isEquip ? rarityLabel(rarity) : `+${qty} ${unit}`;
}

/** Map a raw reward pull to its display fields (pure; shared by the pull list and the summary). */
export function describePull(item: RewardItem): PullView {
  switch (item.type) {
    case 'tower': {
      const d = TOWER_DEFS[item.kind];
      return { key: `tower:${item.kind}`, category: 'towerShards', rarity: item.rarity, color: d.color, name: d.name, qty: item.amount, unit: 'Shards', amountLabel: `+${item.amount} Shards`, currency: 'towerShards' };
    }
    case 'hero': {
      const color = HERO_DEFS[item.id as HeroKind]?.color ?? 'var(--vital)';
      return { key: `hero:${item.id}`, category: 'heroShards', rarity: item.rarity, color, name: HERO_LABELS[item.id] ?? item.id, qty: item.amount, unit: 'Hero Shards', amountLabel: `+${item.amount} Hero Shards`, currency: 'heroShards' };
    }
    case 'material':
      return { key: `mat:${item.mat}`, category: 'materials', rarity: item.rarity, color: 'var(--caustic)', name: MAT_LABEL[item.mat], qty: item.amount, unit: 'Materials', amountLabel: `+${item.amount} Materials`, glyph: '✦' };
    case 'equipment': {
      const d = itemDef(item.item.defId);
      const power = itemPowerScore(item.item);
      return { key: `equip:${item.item.uid}`, category: 'equipment', rarity: item.rarity, color: rarityColor(item.rarity), name: d?.name ?? 'Equipment', qty: 1, unit: '', amountLabel: rarityLabel(item.rarity), glyph: d ? SLOT_LABELS[d.slot][0] : '◆', power };
    }
    case 'cosmetic':
      return { key: `cos:${item.id}`, category: 'other', rarity: item.rarity, color: 'var(--r-epic)', name: item.id, qty: 1, unit: 'Cosmetic', amountLabel: 'Cosmetic', glyph: '✦' };
    case 'relic':
      return { key: `relic:${item.id}`, category: 'other', rarity: item.rarity, color: 'var(--r-legendary)', name: item.id, qty: 1, unit: 'Relic', amountLabel: 'Relic', glyph: '❈' };
    case 'event':
      return { key: `evt:${item.currency}`, category: 'other', rarity: item.rarity, color: 'var(--viral)', name: item.currency, qty: item.amount, unit: 'Event', amountLabel: `+${item.amount}`, glyph: '✦' };
  }
}

/** Build the reveal model: an honest ordered pull list + a merged, categorized summary. */
export function buildReveal(chests: ChestResult | ChestResult[]): RevealModel {
  const list = Array.isArray(chests) ? chests : [chests];
  const items = list.flatMap((c) => c.items);
  const pulls = items.map(describePull); // one per raw pull — never collapsed

  // Merge duplicates for the summary (equipment keys are per-uid, so they never merge).
  const byKey = new Map<string, SummaryRow>();
  for (const p of pulls) {
    const ex = byKey.get(p.key);
    if (ex) {
      ex.qty += p.qty;
      ex.count += 1;
      ex.rarity = maxRarity(ex.rarity, p.rarity);
      if (p.power) ex.power = (ex.power ?? 0) + p.power;
    } else {
      byKey.set(p.key, { key: p.key, category: p.category, rarity: p.rarity, color: p.color, name: p.name, qty: p.qty, count: 1, amountLabel: p.amountLabel, currency: p.currency, glyph: p.glyph, power: p.power });
    }
  }
  // Finalize merged labels (amount reflects the summed qty) and group into ordered sections.
  const sections: SummarySection[] = [];
  for (const cat of CATEGORY_ORDER) {
    const rows = [...byKey.values()]
      .filter((r) => r.category === cat)
      .map((r) => ({ ...r, amountLabel: amountLabel(r.qty, unitFor(r), r.rarity, cat === 'equipment') }))
      .sort((a, b) => (b.power ?? 0) - (a.power ?? 0) || TIER.indexOf(b.rarity) - TIER.indexOf(a.rarity) || b.qty - a.qty);
    if (rows.length === 0) continue;
    const power = rows.reduce((s, r) => s + (r.power ?? 0), 0);
    sections.push({ id: cat, title: CATEGORY_TITLE[cat], rows, power });
  }

  const topRarity = pulls.reduce<LootRarity>((r, p) => maxRarity(r, p.rarity), 'common');
  const totalPower = pulls.reduce((s, p) => s + (p.power ?? 0), 0);
  return { count: pulls.length, pulls, sections, topRarity, totalPower };
}

/** The unit word to reprint on a merged row (kept off SummaryRow to avoid a redundant field). */
function unitFor(r: SummaryRow): string {
  switch (r.category) {
    case 'towerShards': return 'Shards';
    case 'heroShards': return 'Hero Shards';
    case 'materials': return 'Materials';
    default: return '';
  }
}
