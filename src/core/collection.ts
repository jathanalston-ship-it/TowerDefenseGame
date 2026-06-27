// Collection layer — the long-horizon "collect everything" metagame. It is a registry-driven
// CODEX: every category enumerates straight from a content registry's ids(), so it scales as
// content grows (no hand-maintained lists), and each entry's tier is DERIVED from data the
// game already tracks (lifetime stats, owned equipment, best wave) — so the codex needs no new
// save fields and can't desync from progression. Completion grants identity rewards (titles,
// badges, portraits, UI themes, cosmetics) plus modest, lateral completion BONUSES (folded into
// a run like equipment). Pure: no DOM, no sim; meta.ts builds the context, the UI renders it.
//
// Collection COMPLEMENTS progression: progression is power (stars, mastery, gear); collection is
// breadth + identity, and chasing it naturally pushes a player through varied builds/heroes/towers.

import { ENEMY_DEFS, TOWER_DEFS, HERO_DEFS, CHESTS, chestForWave, TOTAL_WAVES, enemyRegistry, towerRegistry, heroRegistry, chestRegistry } from './config';
import { cardRegistry } from './cards';
import type { CardEffect } from './cards';
import { ALL_ITEMS } from './equipment';
import { CHASSIS } from './boss';
import type { LifetimeStats } from './types';

export type CollectionCategoryId = 'enemies' | 'bosses' | 'towers' | 'heroes' | 'cards' | 'equipment' | 'chests';

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
  complete: boolean;
}

export interface CollectionView {
  categories: CollectionCategory[];
  discovered: number;
  total: number;
  pct: number; // 0..1 overall discovery
}

/** Everything the codex needs, pulled from the save by meta.ts (read-only). */
export interface CollectionContext {
  stats: LifetimeStats;
  ownedDefIds: Set<string>; // equipment definition ids the player owns ≥1 of
  bestWave: number;
  bossesSlain: Set<string>; // framework-boss chassis archetypes ever slain
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
  return { id, name, entries, discovered, total: entries.length, complete: entries.length > 0 && discovered === entries.length };
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
    return { id, name: cardRegistry.get(id)?.name ?? id, tier, maxTier: 1, tierLabel: tier ? 'Collected' : 'Undiscovered' };
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

  const categories: CollectionCategory[] = [
    makeCategory('enemies', 'Bestiary', enemies),
    makeCategory('bosses', 'Bosses', bosses),
    makeCategory('towers', 'Towers', towers),
    makeCategory('heroes', 'Heroes', heroes),
    makeCategory('cards', 'Mutations', cards),
    makeCategory('equipment', 'Armory', equipment),
    makeCategory('chests', 'Caches', chests),
  ];
  const discovered = categories.reduce((a, c) => a + c.discovered, 0);
  const total = categories.reduce((a, c) => a + c.total, 0);
  return { categories, discovered, total, pct: total > 0 ? discovered / total : 0 };
}

// ── Completion rewards ────────────────────────────────────────────────────────
export type RewardKind = 'title' | 'badge' | 'portrait' | 'theme' | 'cosmetic' | 'bonus';

export interface CollectionReward {
  id: string;
  kind: RewardKind;
  name: string;
  desc: string;
  /** Unlock predicate over the live view. */
  requires: (v: CollectionView) => boolean;
  /** For 'bonus' rewards: run-start effects (modest + lateral) folded into a run. */
  effects?: CardEffect[];
}

const categoryComplete = (v: CollectionView, id: CollectionCategoryId): boolean => v.categories.find((c) => c.id === id)?.complete === true;
const masteredAll = (v: CollectionView, id: CollectionCategoryId): boolean => {
  const c = v.categories.find((x) => x.id === id);
  return !!c && c.entries.length > 0 && c.entries.every((e) => e.tier >= e.maxTier);
};

export const COLLECTION_REWARDS: CollectionReward[] = [
  // Per-category completion → a Badge + a Title, plus a modest, lateral Bonus.
  { id: 'badge_bestiary', kind: 'badge', name: 'Field Researcher', desc: 'Encounter every enemy archetype.', requires: (v) => categoryComplete(v, 'enemies') },
  { id: 'title_exterminator', kind: 'title', name: 'Exterminator', desc: 'Slay every enemy to its highest mastery.', requires: (v) => masteredAll(v, 'enemies'), },
  { id: 'bonus_bestiary', kind: 'bonus', name: 'Apex Predator', desc: 'Bestiary complete: +5% biomass from kills.', requires: (v) => categoryComplete(v, 'enemies'), effects: [{ op: 'mul', field: 'biomassMult', value: 1.05 }] },

  { id: 'badge_towers', kind: 'badge', name: 'Architect', desc: 'Deploy every tower.', requires: (v) => categoryComplete(v, 'towers') },
  { id: 'bonus_towers', kind: 'bonus', name: 'Master Builder', desc: 'All towers mastered: +4% tower damage.', requires: (v) => masteredAll(v, 'towers'), effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.04 }] },

  { id: 'badge_heroes', kind: 'badge', name: 'Warlord', desc: 'Field every hero.', requires: (v) => categoryComplete(v, 'heroes') },
  { id: 'badge_mutations', kind: 'badge', name: 'Geneticist', desc: 'Collect every mutation.', requires: (v) => categoryComplete(v, 'cards') },
  { id: 'badge_armory', kind: 'badge', name: 'Quartermaster', desc: 'Own every piece of equipment.', requires: (v) => categoryComplete(v, 'equipment') },
  { id: 'badge_caches', kind: 'badge', name: 'Treasure Hunter', desc: 'Earn every cache tier.', requires: (v) => categoryComplete(v, 'chests') },

  // Overall discovery milestones → cosmetics / portraits / UI themes.
  { id: 'portrait_collector', kind: 'portrait', name: 'Collector Portrait', desc: 'Discover a quarter of all content.', requires: (v) => v.pct >= 0.25 },
  { id: 'theme_curator', kind: 'theme', name: 'Curator UI Theme', desc: 'Discover half of all content.', requires: (v) => v.pct >= 0.5 },
  { id: 'cosmetic_archivist', kind: 'cosmetic', name: 'Archivist Aura', desc: 'Discover three quarters of all content.', requires: (v) => v.pct >= 0.75 },
  { id: 'title_completionist', kind: 'title', name: 'The Completionist', desc: 'Discover EVERYTHING.', requires: (v) => v.total > 0 && v.discovered === v.total },
  { id: 'bonus_completionist', kind: 'bonus', name: 'Total Synthesis', desc: 'Collection complete: +10% biomass and +5% tower damage.', requires: (v) => v.total > 0 && v.discovered === v.total, effects: [{ op: 'mul', field: 'biomassMult', value: 1.1 }, { op: 'mul', field: 'towerDamageMult', value: 1.05 }] },
];

/** Rewards currently unlocked for a view. */
export function unlockedRewards(v: CollectionView): CollectionReward[] {
  return COLLECTION_REWARDS.filter((r) => r.requires(v));
}

/** Run-start effects from unlocked completion BONUS rewards (folded into a run like gear).
 * Empty until the player completes a category, so a fresh save's run is byte-identical. */
export function collectionBonusEffects(v: CollectionView): CardEffect[] {
  const out: CardEffect[] = [];
  for (const r of unlockedRewards(v)) if (r.kind === 'bonus' && r.effects) out.push(...r.effects);
  return out;
}

const REWARD_BY_ID = new Map(COLLECTION_REWARDS.map((r) => [r.id, r] as const));
export function rewardDef(id: string): CollectionReward | undefined {
  return REWARD_BY_ID.get(id);
}
