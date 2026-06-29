// Hero Lab read-model — folds a hero's permanent state (stars, mastery, equipment, lifetime
// ownership stats) into one view object the Champion-Select UI renders. Pure: derives from a
// SaveData snapshot via the existing meta/mastery/equipment selectors. Future-proof — adding a
// hero needs nothing here; it reads whatever HERO_ORDER exposes.

import { HERO_DEFS, STAR } from '../core/config';
import type { HeroDef } from '../core/config';
import type { HeroKind } from '../core/types';
import { heroProgress, masteryProgress, nextHeroStarCost } from './meta';
import {
  MASTERY_RANK_EVERY,
  masteryPerksUpTo,
  masteryRank,
  masteryRankTitle,
  masteryRewardsBetween,
} from '../core/mastery';
import type { MasteryPerk } from '../core/mastery';
import { itemDef, SLOT_LABELS } from '../core/equipment';
import type { EquipSlot, Rarity } from '../core/equipment';
import { heroLore } from '../core/heroLore';
import type { HeroLore } from '../core/heroLore';
import type { SaveData } from '../save/saveStore';

export interface LoadoutView {
  slot: EquipSlot;
  label: string;
  name: string | null; // null = empty slot
  rarity: Rarity | null;
}

export interface FutureUnlock {
  kind: string; // 'Star' | 'Rank' | 'Title' | 'Lore'
  label: string;
  detail: string;
}

export interface HeroDetailView {
  def: HeroDef;
  lore: HeroLore;
  fielded: boolean;
  stars: number;
  maxStars: number;
  shards: number;
  nextStarCost: number | null; // null = maxed
  canBuyStar: boolean;
  dmgPct: number;
  cdPct: number;
  mastery: { level: number; into: number; need: number; rank: number; rankTitle: string };
  runs: number; // runs fielded with this hero
  kills: number; // lifetime kills by this hero
  favoriteEquip: string | null; // most-run gear name with this hero
  loadout: LoadoutView[];
  perks: MasteryPerk[]; // earned mechanic perks (may be empty)
  nextUnlocks: FutureUnlock[];
}

/** The most-run equipment def name for a hero (argmax of the usage counts), or null. */
function favoriteEquipName(counts: Record<string, number> | undefined): string | null {
  if (!counts) return null;
  let best: string | null = null;
  let max = 0;
  for (const [defId, n] of Object.entries(counts)) {
    if (n > max) { max = n; best = defId; }
  }
  return best ? (itemDef(best)?.name ?? null) : null;
}

/** Resolve the equipped item (name + rarity) for a slot from the shared loadout. */
function loadoutSlot(save: SaveData, slot: EquipSlot): LoadoutView {
  const uid = save.equipment.loadout[slot];
  const it = uid ? save.equipment.inventory.find((i) => i.uid === uid) : undefined;
  const def = it ? itemDef(it.defId) : undefined;
  return { slot, label: SLOT_LABELS[slot], name: def?.name ?? null, rarity: it?.rarity ?? null };
}

export function heroDetail(save: SaveData, kind: HeroKind): HeroDetailView {
  const def = HERO_DEFS[kind];
  const prog = heroProgress(save)[kind];
  const stars = save.heroStars[kind] ?? 0;
  const shards = save.heroShards[kind] ?? 0;
  const cost = nextHeroStarCost(save, kind);
  const mp = masteryProgress(save.heroMasteryXp[kind] ?? 0);
  const rank = masteryRank(mp.level);

  const nextUnlocks: FutureUnlock[] = [];
  if (cost !== null) {
    nextUnlocks.push({
      kind: 'Star',
      label: `Star ${stars + 1} / ${STAR.maxStars}`,
      detail: `+${Math.round(STAR.damagePerStar * 100)}% damage · faster ability · ${cost} ✦`,
    });
  }
  const nextRankLevel = (rank + 1) * MASTERY_RANK_EVERY;
  nextUnlocks.push({ kind: 'Rank', label: masteryRankTitle(nextRankLevel), detail: `at Mastery Lv ${nextRankLevel}` });
  const nextReward = masteryRewardsBetween('hero', kind, mp.level, Number.MAX_SAFE_INTEGER)[0];
  if (nextReward) {
    nextUnlocks.push({ kind: nextReward.kind === 'title' ? 'Title' : 'Lore', label: nextReward.name, detail: `at Mastery Lv ${nextReward.at}` });
  }

  return {
    def,
    lore: heroLore(def),
    fielded: save.selectedHero === kind,
    stars,
    maxStars: STAR.maxStars,
    shards,
    nextStarCost: cost,
    canBuyStar: cost !== null && shards >= cost,
    dmgPct: Math.round((prog.damageMult - 1) * 100),
    cdPct: Math.round((1 - prog.cooldownMult) * 100),
    mastery: { level: mp.level, into: mp.into, need: mp.need, rank, rankTitle: masteryRankTitle(mp.level) },
    runs: save.stats.heroUsage[kind] ?? 0,
    kills: save.heroKills[kind] ?? 0,
    favoriteEquip: favoriteEquipName(save.heroFavEquip[kind]),
    loadout: (['weapon', 'armor', 'relic'] as EquipSlot[]).map((s) => loadoutSlot(save, s)),
    perks: masteryPerksUpTo('hero', kind, mp.level),
    nextUnlocks,
  };
}
