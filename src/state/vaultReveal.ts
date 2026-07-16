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
import { cardRegistry } from '../core/cards';
import { HERO_DEFS, HERO_LABELS, TOWER_DEFS } from '../core/config';
import type { LootRarity } from '../core/config';
import type { HeroKind } from '../core/types';
import { itemDef, SLOT_LABELS } from '../core/equipment';
import type { OwnedItem } from '../core/equipment';
import { MATERIAL_META } from '../core/materialDrop';
import { itemPowerScore } from './itemPower';
import type { PowerCompare } from './itemPower';
import { CURRENCIES } from '../core/currencies';
import type { CurrencyId } from '../core/currencies';
import { MULLIGAN_MARK } from '../core/mulligan';

export { itemPowerScore }; // re-exported for callers that import it from the reveal read-model

/** Reward families the summary groups by (fixed display order below). NEW gene-strand
 *  recoveries lead the ledger in their own section (docs/CARDS.md §discovery); equipment
 *  first-finds keep their NEW badge inside Equipment (their identity is the gear). */
export type RevealCategory = 'discoveries' | 'equipment' | 'towerShards' | 'heroShards' | 'materials' | 'other';

const CATEGORY_ORDER: RevealCategory[] = ['discoveries', 'equipment', 'towerShards', 'heroShards', 'materials', 'other'];
const CATEGORY_TITLE: Record<RevealCategory, string> = {
  discoveries: 'New Discoveries',
  equipment: 'Equipment',
  towerShards: 'Strain Samples',
  heroShards: 'Apex Genome',
  materials: 'Materials',
  other: 'Other',
};

const TIER: LootRarity[] = ['common', 'rare', 'epic', 'legendary', 'exotic'];
// ASSIMILATION grade ladder (docs/LEXICON.md) — uppercased for the reveal's rarity word.
// 'uncommon' is the gene-card FIVE-tier ladder's second grade (docs/CARDS.md §rarity).
const RARITY_LABEL: Record<string, string> = {
  common: 'INERT', uncommon: 'LATENT', rare: 'ACTIVE', epic: 'VIRULENT', legendary: 'RAMPANT', exotic: 'APEX', mythic: 'ABERRANT',
};

/** Gene-card FIVE-tier rarity colors (CSS tokens; --r-uncommon added with the discovery
 *  overhaul). Separate from the equipment/loot map — the two scales stay distinct. */
const CARD_RARITY_COLOR: Record<string, string> = {
  common: 'var(--r-common)', uncommon: 'var(--r-uncommon)', rare: 'var(--r-rare)',
  epic: 'var(--r-epic)', legendary: 'var(--r-legendary)',
};


/** Higher of two rarities (open — an unknown id sorts as lowest so it never wins the finale). */
export function maxRarity(a: LootRarity, b: LootRarity): LootRarity {
  return TIER.indexOf(a) >= TIER.indexOf(b) ? a : b;
}
export function rarityLabel(r: string): string { return RARITY_LABEL[r] ?? r.toUpperCase(); }
import { rarityColorOf as rarityColor } from '../core/equipment'; // ONE canonical rarity map
export { rarityColor };

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
  compare?: PowerCompare; // equipment: ▲/▼/= vs the selected hero's equipped slot (when supplied)
  isNew?: boolean; // equipment: first collection discovery (defId not owned at roll time)
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
  compare?: PowerCompare; // equipment: ▲/▼/= vs the selected hero's equipped slot (when supplied)
  isNew?: boolean; // equipment: first collection discovery → the NEW badge
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

/** Map a raw reward pull to its display fields (pure; shared by the pull list and the summary).
 *  `compare` (optional) attaches the equipped-vs-drop Power verdict to equipment pulls. */
export function describePull(item: RewardItem, compare?: (i: OwnedItem) => PowerCompare): PullView {
  switch (item.type) {
    case 'tower': {
      const d = TOWER_DEFS[item.kind];
      return { key: `tower:${item.kind}`, category: 'towerShards', rarity: item.rarity, color: d.color, name: d.name, qty: item.amount, unit: 'Strain Samples', amountLabel: `+${item.amount} Strain Samples`, currency: 'towerShards' };
    }
    case 'hero': {
      const color = HERO_DEFS[item.id as HeroKind]?.color ?? 'var(--vital)';
      return { key: `hero:${item.id}`, category: 'heroShards', rarity: item.rarity, color, name: HERO_LABELS[item.id] ?? item.id, qty: item.amount, unit: 'Apex Genome', amountLabel: `+${item.amount} Apex Genome`, currency: 'heroShards' };
    }
    case 'material': {
      const m = MATERIAL_META[item.mat];
      return { key: `mat:${item.mat}`, category: 'materials', rarity: item.rarity, color: m.color, name: m.name, qty: item.amount, unit: m.name, amountLabel: `+${item.amount} ${m.name}`, glyph: m.icon };
    }
    case 'equipment': {
      const d = itemDef(item.item.defId);
      const power = itemPowerScore(item.item);
      return { key: `equip:${item.item.uid}`, category: 'equipment', rarity: item.rarity, color: rarityColor(item.rarity), name: d?.name ?? 'Equipment', qty: 1, unit: '', amountLabel: rarityLabel(item.rarity), glyph: d ? SLOT_LABELS[d.slot][0] : '◆', power, compare: compare?.(item.item), isNew: item.isNew };
    }
    case 'gene': {
      // Gene Card discovery (docs/CARDS.md §discovery): a NEW strand celebrates; a known
      // strand echoes into Gene Essence (the amount rides the label so it is never invisible).
      const def = cardRegistry.get(item.cardId);
      const color = CARD_RARITY_COLOR[item.cardRarity] ?? 'var(--viral)';
      return {
        key: `gene:${item.cardId}${item.isNew ? '' : ':echo'}`,
        category: item.isNew ? 'discoveries' : 'other', rarity: item.rarity, color,
        name: def?.name ?? item.cardId,
        qty: item.isNew ? 1 : item.echoEssence ?? 0,
        unit: item.isNew ? 'Gene Card' : 'Gene Essence',
        amountLabel: item.isNew ? `${rarityLabel(item.cardRarity)} STRAND` : `+${item.echoEssence ?? 0} Gene Essence`,
        glyph: '🧬',
        isNew: item.isNew,
      };
    }
    case 'cosmetic':
      return { key: `cos:${item.id}`, category: 'other', rarity: item.rarity, color: 'var(--r-epic)', name: item.id, qty: 1, unit: 'Cosmetic', amountLabel: 'Cosmetic', glyph: '✦' };
    case 'relic':
      return { key: `relic:${item.id}`, category: 'other', rarity: item.rarity, color: 'var(--r-legendary)', name: item.id, qty: 1, unit: 'Relic', amountLabel: 'Relic', glyph: '❈' };
    case 'event': {
      // Modifier discoveries wear the Mulligan system's ⊛ mark in their sequenced rarity's color
      // (docs/MULLIGANS.md §reveal). The Gene Essence bleed rides the generic currency branch below.
      if (item.currency === 'mulliganModifier') {
        return {
          key: `evt:${item.currency}:${item.note ?? ''}`,
          category: 'other', rarity: item.rarity,
          color: rarityColor(item.rarity),
          name: item.note ?? 'Modifier',
          qty: item.amount, unit: 'Modifier',
          amountLabel: rarityLabel(item.rarity),
          glyph: MULLIGAN_MARK,
        };
      }
      // Currency events (e.g. Gene Essence from duplicate conversion) render the animated currency
      // icon; `note` becomes the reason ("Duplicate Common Tower") so the player sees WHY it converted.
      const cur = CURRENCIES[item.currency as CurrencyId];
      return {
        key: `evt:${item.currency}:${item.note ?? ''}`,
        category: 'other', rarity: item.rarity,
        color: cur?.color ?? 'var(--viral)',
        name: item.note ?? cur?.name ?? item.currency,
        qty: item.amount, unit: cur?.name ?? 'Event',
        amountLabel: `+${item.amount} ${cur?.name ?? ''}`.trim(),
        currency: cur ? (item.currency as CurrencyId) : undefined,
        glyph: cur ? undefined : '✦',
      };
    }
  }
}

/** Build the reveal model: an honest ordered pull list + a merged, categorized summary. */
export function buildReveal(chests: ChestResult | ChestResult[], compare?: (i: OwnedItem) => PowerCompare): RevealModel {
  const list = Array.isArray(chests) ? chests : [chests];
  const items = list.flatMap((c) => c.items);
  const pulls = items.map((it) => describePull(it, compare)); // one per raw pull — never collapsed

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
      byKey.set(p.key, { key: p.key, category: p.category, rarity: p.rarity, color: p.color, name: p.name, qty: p.qty, count: 1, amountLabel: p.amountLabel, currency: p.currency, glyph: p.glyph, power: p.power, compare: p.compare, isNew: p.isNew });
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
    case 'towerShards': return 'Strain Samples';
    case 'heroShards': return 'Apex Genome';
    case 'materials': return r.name; // each material row is its own kind (Mutagen / Scrap / Catalyst)
    default: return '';
  }
}

// ── SPECIMEN REVEAL SESSION (docs/LOOTBOX.md §opening) ──────────────────────────────────
// The simultaneous face-down grid that replaced the one-at-a-time births: every reward
// materializes at once as a face-down specimen; the player flips each by hand (or arms the
// Reveal All cascade). Pure rules — pacing/animation live in the component; ANY RewardItem
// variant integrates automatically because a specimen is derived entirely from describePull's
// output (a future reward type only needs its describePull case — zero reveal code).

/** One face-down specimen in the grid. `tier` (0..4 on the loot ladder) drives flip
 *  animation/sound/lighting magnitude; `interrupt` names the flow-stopping celebration the
 *  flip triggers (a NEW strand recovery, or a legendary+ pull's zoom moment). */
export interface SpecimenView {
  index: number;
  pull: PullView;
  tier: number;
  interrupt: 'discovery' | 'legendary' | null;
}

export function buildSpecimens(model: RevealModel): SpecimenView[] {
  return model.pulls.map((pull, index) => {
    const tier = Math.max(0, TIER.indexOf(pull.rarity));
    const interrupt = pull.category === 'discoveries' ? 'discovery' as const
      : tier >= 3 ? 'legendary' as const : null;
    return { index, pull, tier, interrupt };
  });
}

/** Grid geometry: a single clutch up to 12 specimens; larger stockpiles page in clutches
 *  (only the active page mounts — 100× is nine 12-specimen pages, zero scrolling). */
export interface RevealGridSpec {
  pageSize: number;
  pages: number;
  cols: number; // desktop columns
  colsNarrow: number; // phone columns (≤480px)
}

export function revealGrid(count: number): RevealGridSpec {
  const pageSize = count <= 12 ? Math.max(1, count) : 12;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const per = Math.min(count, pageSize);
  const cols = per <= 1 ? 1 : per <= 4 ? 2 : per <= 9 ? 3 : 4;
  const colsNarrow = per <= 1 ? 1 : per <= 4 ? 2 : 3;
  return { pageSize, pages, cols, colsNarrow };
}

/** The session's live state — a plain reducer so the flip rules are unit-testable and the
 *  component stays presentation-only. Timing (cascade pacing, flip durations) is UI-owned. */
export interface RevealSessionState {
  flipped: boolean[];
  order: number[]; // specimen indices in flip order (drives Replay Highlights)
  interrupt: number | null; // specimen whose celebration currently HOLDS the flow
  page: number;
  revealAll: boolean; // the auto-flip cascade is armed (UI drives the timer)
  fast: boolean; // shortened flip pacing
  skipAnims: boolean; // instant flips — suppresses interrupts entirely
}

export type RevealAction =
  | { kind: 'flip'; index: number }
  | { kind: 'ack' } // dismiss the held celebration
  | { kind: 'revealAll' }
  | { kind: 'fast' }
  | { kind: 'skipAnims' }
  | { kind: 'page'; to: number };

export function initialRevealState(count: number): RevealSessionState {
  return { flipped: Array.from({ length: count }, () => false), order: [], interrupt: null, page: 0, revealAll: false, fast: false, skipAnims: false };
}

export function revealReduce(specimens: SpecimenView[], s: RevealSessionState, a: RevealAction): RevealSessionState {
  switch (a.kind) {
    case 'flip': {
      // One rule set, every path: face-down only, and never while a celebration holds the flow.
      if (s.interrupt !== null) return s;
      if (a.index < 0 || a.index >= s.flipped.length || s.flipped[a.index]) return s;
      const flipped = s.flipped.slice();
      flipped[a.index] = true;
      const sp = specimens[a.index];
      const interrupt = !s.skipAnims && sp?.interrupt ? a.index : null;
      return { ...s, flipped, order: [...s.order, a.index], interrupt };
    }
    case 'ack':
      return s.interrupt === null ? s : { ...s, interrupt: null };
    case 'revealAll':
      return s.revealAll ? s : { ...s, revealAll: true };
    case 'fast':
      return { ...s, fast: !s.fast };
    case 'skipAnims':
      return { ...s, skipAnims: !s.skipAnims };
    case 'page': {
      const pages = revealGrid(s.flipped.length).pages;
      const to = Math.max(0, Math.min(pages - 1, a.to));
      return to === s.page ? s : { ...s, page: to };
    }
  }
}

export function revealDone(s: RevealSessionState): boolean {
  return s.flipped.every(Boolean);
}

/** First face-down specimen at or after `from` (the cascade's next target), else -1. */
export function nextFaceDown(s: RevealSessionState, from = 0): number {
  for (let i = Math.max(0, from); i < s.flipped.length; i++) if (!s.flipped[i]) return i;
  return -1;
}

/** Replay Highlights: the ceremony-worthy flips (celebrations, rare+ pulls, first finds),
 *  in the order the player actually revealed them. */
export function revealHighlights(specimens: SpecimenView[], s: RevealSessionState): SpecimenView[] {
  return s.order
    .map((i) => specimens[i])
    .filter((sp): sp is SpecimenView => !!sp && (sp.interrupt !== null || sp.tier >= 2 || sp.pull.isNew === true));
}
