// Collection layer — the long-horizon "collect everything" metagame, and a genuine PERMANENT
// PROGRESSION system (docs/COLLECTION.md). It is a registry-driven CODEX: every category
// enumerates straight from a content registry's ids(), so it scales as content grows (no
// hand-maintained lists), and each entry's tier is DERIVED from data the game already tracks
// (lifetime stats, owned equipment, best wave, campaign depth) — so the codex needs no new save
// fields and can't desync from progression.
//
// Every discovery MATTERS: each category earns a tier-weighted COMPLETION score (0..1) that
// continuously drives (a) a mechanical BONUS folded into runs like gear, (b) a POWER SCORE
// contribution, and (c) a RANK (Bronze→Ascendant) with a visible reward track. All bonus-bearing
// categories read 0 on a fresh save, so a new account's run + Power are byte-identical (golden-safe).
// Pure: no DOM, no sim; meta.ts builds the context + folds the bonuses, the UI renders it.

import { ENEMY_DEFS, TOWER_DEFS, TOWER_ORDER, HERO_DEFS, CHESTS, chestForWave, TOTAL_WAVES, enemyRegistry, towerRegistry, heroRegistry, chestRegistry } from './config';
import { cardRegistry } from './cards';
import type { CardEffect } from './cards';
import { ALL_ITEMS } from './equipment';
import { CHASSIS } from './boss';
import { megaBossRegistry } from './megaboss';
import { BIOMES } from './biomes';
import { cosmeticRegistry } from './cosmetics';
import type { CosmeticDef } from './cosmetics';
import { wardrobeGroupItems } from './wardrobe';
import type { WardrobeGroup } from './wardrobe';
import { MULLIGAN_RARITY, mulliganRegistry, rarityAtLeast } from './mulligan';
import type { MulliganRarity } from './mulligan';
import type { LifetimeStats } from './types';

export type CollectionCategoryId =
  | 'enemies' | 'bosses' | 'megaBosses' | 'towers' | 'heroes' | 'cards' | 'equipment' | 'biomes' | 'chests'
  | 'towerSkins' | 'heroSkins' // unit Phenotypes, split per target (docs/COSMETICS.md)
  | 'wardrobeArena' | 'wardrobeAudio' | 'wardrobeInterface' | 'wardrobeIdentity' // Wardrobe codices (§wardrobe)
  | 'mulligans' | 'mulliganOrganisms';

export interface CollectionEntry {
  id: string;
  name: string;
  tier: number; // 0 = undiscovered; 1..maxTier = discovered / mastery tiers
  maxTier: number;
  tierLabel: string; // human label for the current tier
}

export interface CollectionCategory {
  id: CollectionCategoryId;
  name: string;
  entries: CollectionEntry[];
  discovered: number; // entries with tier >= 1
  total: number;
  complete: boolean; // every entry discovered
  completion: number; // tier-weighted 0..1 (discovery + mastery) — drives bonuses, power, rank
  rank: CollectionRank;
  rankIndex: number; // 0 = Unranked … 6 = Ascendant
  nextRank: CollectionRank | null; // null at Ascendant
  nextRankAt: number | null; // completion needed to reach the next rank (null at Ascendant)
  bonuses: BonusLine[]; // the live per-category bonus at the current completion
}

export interface CollectionView {
  categories: CollectionCategory[];
  discovered: number;
  total: number;
  pct: number; // 0..1 overall discovery (entry count)
  completion: number; // 0..1 overall tier-weighted completion (average of categories)
  rank: CollectionRank; // overall account rank (from overall completion)
  rankIndex: number;
  power: number; // the collection's Power Score contribution (≥ 1; exactly 1 on a fresh save)
}

/** Everything the codex needs, pulled from the save by meta.ts (read-only). */
export interface CollectionContext {
  stats: LifetimeStats;
  ownedDefIds: Set<string>; // equipment definition ids the player owns ≥1 of
  bestWave: number;
  bossesSlain: Set<string>; // framework-boss chassis archetypes ever slain
  megaSlain: Set<string>; // Mega Boss def ids ever defeated (docs/MEGA-BOSS.md §collection)
  megaPerfect: Set<string>; // …defeated with zero Nucleus integrity lost
  megaSpeed: Set<string>; // …defeated faster than the expected kill time
  biomesSeen: Set<string>; // biome ids the account has reached in Campaign
  cosmeticsOwned: Set<string>; // Phenotype ids owned (docs/COSMETICS.md) — drives the skin codices
  wardrobeOwned: Set<string>; // Wardrobe item ids owned (§wardrobe) — drives the four Wardrobe codices
  mulliganDex: Record<string, MulliganRarity>; // Mulligan modifier id → best DISCOVERED rarity — drives the Pieces codex
  /** Per-tower organism status (docs/MULLIGANS.md §collection) — complete Mulligans are their
   *  own codex, SEPARATE from pieces: awake (all three grafts) is tier 1, reforge-locked is tier 2. */
  mulliganOrganisms: Record<string, { active: boolean; locked: boolean }>;
  geneLevels?: Record<string, number>; // card id → permanent Gene level (label enrichment only)
}

// ── Ranks ─────────────────────────────────────────────────────────────────────
export const COLLECTION_RANKS = ['Unranked', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant'] as const;
export type CollectionRank = (typeof COLLECTION_RANKS)[number];
/** Completion needed to REACH each rank (index-aligned with COLLECTION_RANKS). Bronze at the first
 *  discovery; Ascendant only at 100% (fully discovered AND mastered). */
const RANK_THRESHOLDS = [0, 0.001, 0.2, 0.4, 0.6, 0.8, 1.0];
export const RANK_COLORS: Record<CollectionRank, string> = {
  Unranked: '#5a6673', Bronze: '#c9803e', Silver: '#c7d0d8', Gold: '#ffd24d',
  Platinum: '#7fe3d0', Diamond: '#7cc9ff', Ascendant: '#e6a2ff',
};

/** The reward-track milestones: each earnable rank (Bronze→Ascendant) + the completion it needs.
 *  Single source of truth for the UI's track pips, so display can't drift from RANK_THRESHOLDS. */
export function rankMilestones(): { rank: CollectionRank; at: number }[] {
  return COLLECTION_RANKS.slice(1).map((rank, i) => ({ rank, at: RANK_THRESHOLDS[i + 1] }));
}

/** Resolve a completion fraction into its rank + the threshold for the next rank. */
export function rankOf(completion: number): { index: number; name: CollectionRank; next: CollectionRank | null; nextAt: number | null } {
  let idx = 0;
  for (let i = 0; i < RANK_THRESHOLDS.length; i++) if (completion + 1e-9 >= RANK_THRESHOLDS[i]) idx = i;
  const last = COLLECTION_RANKS.length - 1;
  return {
    index: idx,
    name: COLLECTION_RANKS[idx],
    next: idx < last ? COLLECTION_RANKS[idx + 1] : null,
    nextAt: idx < last ? RANK_THRESHOLDS[idx + 1] : null,
  };
}

/** Count how many ascending thresholds `n` has reached (the entry's mastery tier). */
function tierFor(n: number, thresholds: number[]): number {
  let t = 0;
  for (const th of thresholds) if (n >= th) t++;
  return t;
}
const labelAt = (tier: number, labels: string[]): string => labels[Math.min(tier, labels.length - 1)];

// Per-category tiering. Each derives an entry's tier from existing data + a label ladder.
const ENEMY_TIERS = [1, 50, 250];
const ENEMY_LABELS = ['Unseen', 'Slain', 'Hunter', 'Nemesis'];
const TOWER_TIERS = [1, 25, 100];
const TOWER_LABELS = ['Unbuilt', 'Deployed', 'Veteran', 'Master'];
const HERO_TIERS = [1, 10, 50];
const HERO_LABELS = ['Unmet', 'Fielded', 'Bonded', 'Legend'];

function makeCategory(id: CollectionCategoryId, name: string, entries: CollectionEntry[]): CollectionCategory {
  const discovered = entries.filter((e) => e.tier >= 1).length;
  const tierSum = entries.reduce((a, e) => a + e.tier, 0);
  const maxSum = entries.reduce((a, e) => a + e.maxTier, 0);
  const completion = maxSum > 0 ? tierSum / maxSum : 0;
  const r = rankOf(completion);
  return {
    id, name, entries, discovered, total: entries.length,
    complete: entries.length > 0 && discovered === entries.length,
    completion, rank: r.name, rankIndex: r.index, nextRank: r.next, nextRankAt: r.nextAt,
    bonuses: categoryBonusLines(id, completion),
  };
}

/** Build the full codex view from the player's save-derived context. */
export function collectionView(ctx: CollectionContext): CollectionView {
  const { stats } = ctx;

  const enemies = enemyRegistry.ids().map((id): CollectionEntry => {
    const tier = tierFor(stats.killsByEnemy[id as keyof typeof stats.killsByEnemy] ?? 0, ENEMY_TIERS);
    return { id, name: ENEMY_DEFS[id as keyof typeof ENEMY_DEFS]?.name ?? id, tier, maxTier: ENEMY_TIERS.length, tierLabel: labelAt(tier, ENEMY_LABELS) };
  });

  const towers = towerRegistry.ids().map((id): CollectionEntry => {
    const tier = tierFor(stats.towerUsage[id as keyof typeof stats.towerUsage] ?? 0, TOWER_TIERS);
    return { id, name: TOWER_DEFS[id as keyof typeof TOWER_DEFS]?.name ?? id, tier, maxTier: TOWER_TIERS.length, tierLabel: labelAt(tier, TOWER_LABELS) };
  });

  const heroes = heroRegistry.ids().map((id): CollectionEntry => {
    const tier = tierFor(stats.heroUsage[id] ?? 0, HERO_TIERS);
    return { id, name: HERO_DEFS[id as keyof typeof HERO_DEFS]?.name ?? id, tier, maxTier: HERO_TIERS.length, tierLabel: labelAt(tier, HERO_LABELS) };
  });

  const seenCards = new Set(stats.uniqueCards);
  const cards = cardRegistry.ids().map((id): CollectionEntry => {
    const tier = seenCards.has(id) ? 1 : 0;
    // The permanent Gene level enriches the LABEL only (tier/maxTier untouched, so collection
    // completion and its Power/bonuses are unchanged — Gene power is counted by the Archive).
    const lvl = ctx.geneLevels?.[id] ?? 0;
    return { id, name: cardRegistry.get(id)?.name ?? id, tier, maxTier: 1, tierLabel: tier ? (lvl > 0 ? `Gene Level ${lvl}` : 'Collected') : 'Undiscovered' };
  });

  const equipment = ALL_ITEMS.map((d): CollectionEntry => {
    const tier = ctx.ownedDefIds.has(d.id) ? 1 : 0;
    return { id: d.id, name: d.name, tier, maxTier: 1, tierLabel: tier ? 'Owned' : 'Unowned' };
  });

  // Loot boxes: a chest tier is "discovered" once the player has reached the wave that grants
  // it (its unlock wave) — derived from bestWave + chestForWave, no new tracking.
  const chests = chestRegistry.ids().map((id): CollectionEntry => {
    let unlockWave = TOTAL_WAVES + 1;
    for (let w = 0; w <= TOTAL_WAVES; w++) {
      if (chestForWave(w) === id) { unlockWave = w; break; }
    }
    const tier = ctx.bestWave >= unlockWave ? 1 : 0;
    return { id, name: CHESTS[id]?.name ?? id, tier, maxTier: 1, tierLabel: tier ? 'Earned' : 'Locked' };
  });

  // Framework bosses are collected by CHASSIS archetype (the stable, finite set every authored
  // and procedural boss is built from) — slain in endless / boss waves.
  const bosses = Object.keys(CHASSIS).map((id): CollectionEntry => {
    const tier = ctx.bossesSlain.has(id) ? 1 : 0;
    return { id, name: `${id[0].toUpperCase()}${id.slice(1)}`, tier, maxTier: 1, tierLabel: tier ? 'Slain' : 'Unencountered' };
  });

  // Mega Bosses (docs/MEGA-BOSS.md §collection): registry-driven — a future mega joins the codex
  // automatically. Tiered MASTERY, not mere discovery: Slain → Perfect Kill → Swift Execution.
  const megaBosses = megaBossRegistry.active().map((d): CollectionEntry => {
    const tier = ctx.megaSlain.has(d.id) ? 1 + (ctx.megaPerfect.has(d.id) ? 1 : 0) + (ctx.megaSpeed.has(d.id) ? 1 : 0) : 0;
    const label = tier === 0 ? 'Undisturbed' : tier === 1 ? 'Slain' : tier === 2 ? 'Mastered' : 'Dominated';
    return { id: d.id, name: `${d.name} — ${d.title}`, tier, maxTier: 3, tierLabel: label };
  });

  // Biomes: discovered once the account has reached that biome's region in Campaign (derived from
  // campaign depth by meta.ts, no new tracking).
  const biomes = BIOMES.map((b): CollectionEntry => {
    const tier = ctx.biomesSeen.has(b.id) ? 1 : 0;
    return { id: b.id, name: b.name, tier, maxTier: 1, tierLabel: tier ? 'Charted' : 'Uncharted' };
  });

  // Phenotypes (docs/COSMETICS.md): owned = expressed. Registry-driven like everything else,
  // so new towers/heroes (and new theme families) extend the codices automatically. Split per
  // target — Tower Skins and Hero Skins are separate collections (§wardrobe).
  const phenoEntry = (c: CosmeticDef): CollectionEntry => {
    const tier = ctx.cosmeticsOwned.has(c.id) ? 1 : 0;
    return { id: c.id, name: c.name, tier, maxTier: 1, tierLabel: tier ? 'Expressed' : 'Dormant' };
  };
  const towerSkins = cosmeticRegistry.all().filter((c) => c.target.kind === 'tower').map(phenoEntry);
  const heroSkins = cosmeticRegistry.all().filter((c) => c.target.kind === 'hero').map(phenoEntry);

  // Wardrobe codices (docs/COSMETICS.md §wardrobe): one collection per cosmetic GROUP —
  // arena FX, audio packs, interface shells, commander identity. Registry-driven: a new
  // wardrobe item joins its group's codex (and the completion math) by itself.
  const wardrobeCat = (group: WardrobeGroup): CollectionEntry[] =>
    wardrobeGroupItems(group).map((d) => {
      const tier = ctx.wardrobeOwned.has(d.id) ? 1 : 0;
      return { id: d.id, name: d.name, tier, maxTier: 1, tierLabel: tier ? 'Fitted' : 'Unclaimed' };
    });

  // Mulligan Modifiers (docs/MULLIGANS.md §collection): tiered MASTERY over the dex —
  // discovering the modifier is tier 1, seeing it at Legendary-or-better is tier 2 — so the
  // Modifier codex rewards both the hunt and the deep-rarity chase. Registry-driven: a future
  // modifier row joins the codex (and its completion math) by itself.
  const mulligans = mulliganRegistry.all().map((m): CollectionEntry => {
    const rar = ctx.mulliganDex[m.id];
    const tier = rar ? (rarityAtLeast(rar, 'legendary') ? 2 : 1) : 0;
    const label = rar ? (tier === 2 ? 'Transcendent' : `Discovered — ${MULLIGAN_RARITY[rar].label}`) : 'Unsequenced';
    return { id: m.id, name: m.name, tier, maxTier: 2, tierLabel: label };
  });

  // Complete Mulligans (§collection) — one entry per tower kind: growing the organism to
  // AWAKE discovers it; REFORGING (the permanent lock) masters it. Separate from pieces.
  const mulliganOrganisms = TOWER_ORDER.map((k): CollectionEntry => {
    const st = ctx.mulliganOrganisms[k] ?? { active: false, locked: false };
    const tier = st.locked ? 2 : st.active ? 1 : 0;
    return {
      id: `org_${k}`, name: `${TOWER_DEFS[k].name} Organism`, tier, maxTier: 2,
      tierLabel: st.locked ? 'Reforged — Bound' : st.active ? 'Grafted — Awake' : 'Dormant',
    };
  });

  const categories: CollectionCategory[] = [
    makeCategory('enemies', 'Bestiary', enemies),
    makeCategory('bosses', 'Bosses', bosses),
    makeCategory('megaBosses', 'Mega Bosses', megaBosses),
    makeCategory('towers', 'Towers', towers),
    makeCategory('heroes', 'Heroes', heroes),
    makeCategory('cards', 'Mutations', cards),
    makeCategory('equipment', 'Armory', equipment),
    makeCategory('biomes', 'Biomes', biomes),
    makeCategory('chests', 'Caches', chests),
    makeCategory('towerSkins', 'Tower Skins', towerSkins),
    makeCategory('heroSkins', 'Hero Skins', heroSkins),
    makeCategory('wardrobeArena', 'Arena FX', wardrobeCat('arena')),
    makeCategory('wardrobeAudio', 'Audio Packs', wardrobeCat('audio')),
    makeCategory('wardrobeInterface', 'Interface', wardrobeCat('interface')),
    makeCategory('wardrobeIdentity', 'Identity', wardrobeCat('identity')),
    makeCategory('mulligans', 'Mulligan Pieces', mulligans),
    makeCategory('mulliganOrganisms', 'Mulligans', mulliganOrganisms),
  ];
  const discovered = categories.reduce((a, c) => a + c.discovered, 0);
  const total = categories.reduce((a, c) => a + c.total, 0);
  const completion = categories.length ? categories.reduce((a, c) => a + c.completion, 0) / categories.length : 0;
  const r = rankOf(completion);
  const power = collectionPowerOf(categories);
  return { categories, discovered, total, pct: total > 0 ? discovered / total : 0, completion, rank: r.name, rankIndex: r.index, power };
}

// ── Per-category bonuses (the mechanical progression) ───────────────────────────
// Each category declares bonus contributions that scale with its completion (0 at fresh → the
// listed max at 100%). Three delivery channels, all derived from one spec so a new category/bonus
// is a single data edit:
//   • effects  → CardEffect[] folded into a run via meta.collectionRunEffects() (like gear).
//   • econ     → account economy levers read at run-end / loot roll (meta.collectionEconomyBonuses).
//   • power    → the collection's Power Score contribution (meta accountPowerParts.collection).

type EconKey = 'towerXpMult' | 'heroXpMult' | 'bossLootMult' | 'campaignRewardMult' | 'lootQualityTier';
interface EffectSpec { op: 'mul' | 'add'; field: string; max: number; label: string }
interface EconSpec { key: EconKey; max: number; label: string }
interface CategoryBonusSpec { effects: EffectSpec[]; econ: EconSpec[]; powerWeight: number }

/** THE tunable table — cost/role of every collection bonus lives here (docs/COLLECTION.md). Values
 *  are the bonus at 100% completion; the live value scales linearly with completion. */
const CATEGORY_BONUS_SPECS: Record<CollectionCategoryId, CategoryBonusSpec> = {
  enemies: { effects: [{ op: 'mul', field: 'biomassMult', max: 1.12, label: 'Biomass' }], econ: [], powerWeight: 0.03 },
  bosses: { effects: [], econ: [{ key: 'bossLootMult', max: 0.15, label: 'Boss Loot' }], powerWeight: 0.03 },
  // Mega mastery pays PERMANENT passives (docs/MEGA-BOSS.md §collection): a small run-wide damage
  // edge + deeper boss loot + the largest single-category Power weight (it is the hardest codex).
  megaBosses: { effects: [{ op: 'mul', field: 'towerDamageMult', max: 1.06, label: 'Tower Damage' }], econ: [{ key: 'bossLootMult', max: 0.1, label: 'Boss Loot' }], powerWeight: 0.04 },
  towers: { effects: [{ op: 'mul', field: 'towerDamageMult', max: 1.08, label: 'Tower Damage' }], econ: [{ key: 'towerXpMult', max: 0.25, label: 'Tower XP' }], powerWeight: 0.03 },
  heroes: { effects: [], econ: [{ key: 'heroXpMult', max: 0.25, label: 'Hero XP' }], powerWeight: 0.03 },
  cards: { effects: [], econ: [], powerWeight: 0.03 },
  equipment: { effects: [], econ: [{ key: 'lootQualityTier', max: 1.0, label: 'Loot Quality' }], powerWeight: 0.03 },
  biomes: { effects: [], econ: [{ key: 'campaignRewardMult', max: 0.2, label: 'Campaign Rewards' }], powerWeight: 0.03 },
  chests: { effects: [], econ: [], powerWeight: 0 }, // caches are cosmetic (discovered on a fresh save → no bonus)
  // Phenotype expression pays a small hive-wide vigor edge — visual mastery with real teeth.
  // Split across the two skin codices (the old 6% biomass, halved each — same total at 100%).
  towerSkins: { effects: [{ op: 'mul', field: 'biomassMult', max: 1.03, label: 'Biomass' }], econ: [], powerWeight: 0.02 },
  heroSkins: { effects: [{ op: 'mul', field: 'biomassMult', max: 1.03, label: 'Biomass' }], econ: [], powerWeight: 0.02 },
  // Wardrobe codices (docs/COSMETICS.md §wardrobe) stay STRICTLY cosmetic: zero Power, zero
  // effects — starter items are pre-owned, so ANY weight would move a fresh account off
  // POWER_BASE (the chests precedent). Their real payout is the milestone track
  // (Ichor/containers/cores/shards/exclusive cosmetics via WARDROBE_MILESTONES).
  wardrobeArena: { effects: [], econ: [], powerWeight: 0 },
  wardrobeAudio: { effects: [], econ: [], powerWeight: 0 },
  wardrobeInterface: { effects: [], econ: [], powerWeight: 0 },
  wardrobeIdentity: { effects: [], econ: [], powerWeight: 0 },
  // Modifier mastery (docs/MULLIGANS.md §collection) quickens every graft host: run-wide fire
  // rate at full completion — the set bonus for sequencing the whole modifier library.
  mulligans: { effects: [{ op: 'mul', field: 'towerFireRateMult', max: 1.05, label: 'Fire Rate' }], econ: [], powerWeight: 0.03 },
  mulliganOrganisms: { effects: [{ op: 'mul', field: 'towerDamageMult', max: 1.05, label: 'Tower Damage' }], econ: [], powerWeight: 0.03 },
};

const effVal = (op: 'mul' | 'add', max: number, c: number): number => (op === 'mul' ? 1 + (max - 1) * c : max * c);
const pct1 = (v: number): string => `+${Math.round(v * 100)}%`;

export interface BonusLine { label: string; value: string; power?: boolean }
/** The human-readable bonus lines for a category at a given completion (drives the UI + reward track). */
export function categoryBonusLines(id: CollectionCategoryId, completion: number): BonusLine[] {
  const spec = CATEGORY_BONUS_SPECS[id];
  const out: BonusLine[] = [];
  for (const e of spec.effects) {
    const v = effVal(e.op, e.max, completion);
    out.push({ label: e.label, value: e.op === 'mul' ? pct1(v - 1) : `+${v.toFixed(2)}` });
  }
  for (const ec of spec.econ) {
    out.push({ label: ec.label, value: ec.key === 'lootQualityTier' ? `+${(ec.max * completion).toFixed(2)}` : pct1(ec.max * completion) });
  }
  if (spec.powerWeight > 0) out.push({ label: 'Power', value: pct1(spec.powerWeight * completion), power: true });
  return out;
}

// ── Account-wide economy bonuses (read at run-end / loot roll) ───────────────────
export interface CollectionEconomyBonuses {
  towerXpMult: number; heroXpMult: number; bossLootMult: number; campaignRewardMult: number; lootQualityTier: number;
}
export const NEUTRAL_ECON: CollectionEconomyBonuses = { towerXpMult: 1, heroXpMult: 1, bossLootMult: 1, campaignRewardMult: 1, lootQualityTier: 0 };

/** Aggregate the economy levers across all categories, scaled by each one's completion. Neutral on
 *  a fresh save (all bonus categories read 0), so run rewards are unchanged for a new player. */
export function collectionEconomyBonuses(v: CollectionView): CollectionEconomyBonuses {
  const out: CollectionEconomyBonuses = { ...NEUTRAL_ECON };
  for (const cat of v.categories) {
    for (const ec of CATEGORY_BONUS_SPECS[cat.id].econ) {
      if (ec.key === 'lootQualityTier') out.lootQualityTier += ec.max * cat.completion;
      else out[ec.key] *= 1 + ec.max * cat.completion;
    }
  }
  return out;
}

/** Collection's Power Score contribution: the product over categories of (1 + weight × completion).
 *  Exactly 1 on a fresh save (every bonus category at 0) → a new account still reads POWER_BASE. */
function collectionPowerOf(categories: CollectionCategory[]): number {
  let p = 1;
  for (const cat of categories) p *= 1 + CATEGORY_BONUS_SPECS[cat.id].powerWeight * cat.completion;
  return p;
}

// ── Completion rewards (identity: badges / titles / cosmetics) ──────────────────
export type RewardKind = 'title' | 'badge' | 'portrait' | 'theme' | 'cosmetic' | 'bonus';

export interface CollectionReward {
  id: string;
  kind: RewardKind;
  name: string;
  desc: string;
  /** Unlock predicate over the live view. */
  requires: (v: CollectionView) => boolean;
}

const categoryComplete = (v: CollectionView, id: CollectionCategoryId): boolean => v.categories.find((c) => c.id === id)?.complete === true;
const masteredAll = (v: CollectionView, id: CollectionCategoryId): boolean => {
  const c = v.categories.find((x) => x.id === id);
  return !!c && c.entries.length > 0 && c.entries.every((e) => e.tier >= e.maxTier);
};

export const COLLECTION_REWARDS: CollectionReward[] = [
  // Per-category completion → a Badge + a Title. The mechanical bonus now scales continuously with
  // completion (categoryBonusLines / collectionEconomyBonuses), so these are identity rewards.
  { id: 'badge_bestiary', kind: 'badge', name: 'Field Researcher', desc: 'Encounter every enemy archetype.', requires: (v) => categoryComplete(v, 'enemies') },
  { id: 'title_exterminator', kind: 'title', name: 'Exterminator', desc: 'Slay every enemy to its highest mastery.', requires: (v) => masteredAll(v, 'enemies') },
  { id: 'badge_towers', kind: 'badge', name: 'Architect', desc: 'Deploy every tower.', requires: (v) => categoryComplete(v, 'towers') },
  { id: 'title_master_builder', kind: 'title', name: 'Master Builder', desc: 'Master every tower.', requires: (v) => masteredAll(v, 'towers') },
  { id: 'badge_heroes', kind: 'badge', name: 'Warlord', desc: 'Field every hero.', requires: (v) => categoryComplete(v, 'heroes') },
  { id: 'badge_mutations', kind: 'badge', name: 'Geneticist', desc: 'Collect every mutation.', requires: (v) => categoryComplete(v, 'cards') },
  { id: 'badge_armory', kind: 'badge', name: 'Quartermaster', desc: 'Own every piece of equipment.', requires: (v) => categoryComplete(v, 'equipment') },
  { id: 'badge_biomes', kind: 'badge', name: 'Pathfinder', desc: 'Chart every biome.', requires: (v) => categoryComplete(v, 'biomes') },
  { id: 'badge_caches', kind: 'badge', name: 'Treasure Hunter', desc: 'Earn every cache tier.', requires: (v) => categoryComplete(v, 'chests') },

  // Overall discovery milestones → cosmetics / portraits / UI themes.
  { id: 'portrait_collector', kind: 'portrait', name: 'Collector Portrait', desc: 'Discover a quarter of all content.', requires: (v) => v.pct >= 0.25 },
  { id: 'theme_curator', kind: 'theme', name: 'Curator UI Theme', desc: 'Discover half of all content.', requires: (v) => v.pct >= 0.5 },
  { id: 'cosmetic_archivist', kind: 'cosmetic', name: 'Archivist Aura', desc: 'Discover three quarters of all content.', requires: (v) => v.pct >= 0.75 },
  { id: 'title_completionist', kind: 'title', name: 'The Completionist', desc: 'Discover EVERYTHING.', requires: (v) => v.total > 0 && v.discovered === v.total },
];

/** Rewards currently unlocked for a view. */
export function unlockedRewards(v: CollectionView): CollectionReward[] {
  return COLLECTION_REWARDS.filter((r) => r.requires(v));
}

/** Run-start effects from the collection, scaled by each category's completion (folded into a run
 *  like gear). Empty for a fresh save (all bonus categories read 0) ⇒ a new player's run is
 *  byte-identical (golden-safe). */
export function collectionBonusEffects(v: CollectionView): CardEffect[] {
  const out: CardEffect[] = [];
  for (const cat of v.categories) {
    if (cat.completion <= 0) continue;
    for (const e of CATEGORY_BONUS_SPECS[cat.id].effects) {
      out.push({ op: e.op, field: e.field, value: effVal(e.op, e.max, cat.completion) } as CardEffect);
    }
  }
  return out;
}

// ── Rank-up detection (session-diffed, for celebrations) ────────────────────────
export interface CollectionRankUp {
  category: CollectionCategoryId;
  categoryName: string;
  rank: CollectionRank;
  rankIndex: number;
}
/** Diff the view's per-category ranks against a prior snapshot → the promotions to celebrate, plus
 *  the updated snapshot. `prev` is session state (meta), so a rank is celebrated once per session. */
export function collectionRankUps(
  v: CollectionView,
  prev: Partial<Record<CollectionCategoryId, number>>,
): { rankUps: CollectionRankUp[]; snapshot: Partial<Record<CollectionCategoryId, number>> } {
  const snapshot: Partial<Record<CollectionCategoryId, number>> = { ...prev };
  const rankUps: CollectionRankUp[] = [];
  for (const c of v.categories) {
    const before = prev[c.id] ?? 0;
    if (c.rankIndex > before) {
      rankUps.push({ category: c.id, categoryName: c.name, rank: c.rank, rankIndex: c.rankIndex });
    }
    snapshot[c.id] = c.rankIndex;
  }
  return { rankUps, snapshot };
}

/** A snapshot of the current per-category rank indices (the session baseline, set at load). */
export function rankSnapshot(v: CollectionView): Partial<Record<CollectionCategoryId, number>> {
  const snap: Partial<Record<CollectionCategoryId, number>> = {};
  for (const c of v.categories) snap[c.id] = c.rankIndex;
  return snap;
}

const REWARD_BY_ID = new Map(COLLECTION_REWARDS.map((r) => [r.id, r] as const));
export function rewardDef(id: string): CollectionReward | undefined {
  return REWARD_BY_ID.get(id);
}
