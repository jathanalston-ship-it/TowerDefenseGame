// Hero Lab read-model — folds a hero's permanent state (stars, mastery, equipment, lifetime
// ownership stats) into one view object the Champion-Select UI renders. Pure: derives from a
// SaveData snapshot via the existing meta/mastery/equipment selectors. Future-proof — adding a
// hero needs nothing here; it reads whatever HERO_ORDER exposes.

import { HERO_DEFS, STAR } from '../core/config';
import type { HeroDef } from '../core/config';
import type { HeroKind } from '../core/types';
import { heroProgress, masteryProgress, nextHeroPrimeCost, nextHeroStarCost } from './meta';
import { primeBonusPct, primeNextGainPct } from '../core/prime';
import {
  MASTERY_RANK_EVERY,
  masteryPerksUpTo,
  masteryRank,
  masteryRankTitle,
  masteryRewardsBetween,
} from '../core/mastery';
import type { MasteryPerk } from '../core/mastery';
import { emptyLoadout, EQUIP_SLOTS, itemDef, loadoutScore, SLOT_LABELS } from '../core/equipment';
import type { EquipSlot, Loadout, OwnedItem, Rarity } from '../core/equipment';
import { heroLore } from '../core/heroLore';
import type { HeroLore } from '../core/heroLore';
import { HERO_SYMBIOTE_GATES, SYMBIOTE_SLOTS, resolveHeroSymbiote } from '../core/heroSymbiote';
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
  /** PRIME ladder (docs/PRIME-STRAINS.md) — opens at ★max; null before. */
  prime: { level: number; shards: number; catalyst: number; catalystHave: number; affordable: boolean; bonusPct: number; nextGainPct: number } | null;
  dmgPct: number;
  cdPct: number;
  equipScore: number; // account gear score (the shared loadout)
  powerRating: number; // one legible number: stars × mastery × gear
  mastery: { level: number; into: number; need: number; rank: number; rankTitle: string; nextRankLevel: number; nextRankTitle: string };
  runs: number; // runs fielded with this hero
  kills: number; // lifetime kills by this hero
  favoriteEquip: string | null; // most-run gear name with this hero
  loadout: LoadoutView[];
  perks: MasteryPerk[]; // earned mechanic perks (may be empty)
  nextUnlocks: FutureUnlock[];
  /** Symbiote summary (docs/HERO-SYMBIOTES.md): active slots, graft Power, the resonance crown,
   *  active organ motifs (the portrait preview), and the next sealed slot's trial name. */
  symbiote: { slotsActive: number; slots: number; power: number; resonance: string | null; fx: string[]; nextTrial: string | null };
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

/** Resolve the equipped item (name + rarity) for a slot from THIS hero's loadout (per-hero). */
function loadoutSlot(loadout: Loadout, inventory: OwnedItem[], slot: EquipSlot): LoadoutView {
  const uid = loadout[slot];
  const it = uid ? inventory.find((i) => i.uid === uid) : undefined;
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
  const heroLoadout = save.equipment.loadouts[kind] ?? emptyLoadout(); // this hero's own gear (per-hero)
  const equipScore = loadoutScore(save.equipment.inventory, heroLoadout);

  const nextUnlocks: FutureUnlock[] = [];
  if (cost !== null) {
    nextUnlocks.push({
      kind: 'Star',
      label: `Star ${stars + 1} / ${STAR.maxStars}`,
      detail: `+${Math.round(STAR.damagePerStar * 100)}% damage · faster ability · ${cost} ✦`,
    });
  }
  const nextRankLevel = (rank + 1) * MASTERY_RANK_EVERY;
  const nextRankTitle = masteryRankTitle(nextRankLevel);
  nextUnlocks.push({ kind: 'Rank', label: nextRankTitle, detail: `at Mastery Lv ${nextRankLevel}` });
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
    prime: (() => {
      const q = nextHeroPrimeCost(save, kind);
      if (q === null) return null;
      const level = save.heroPrime?.[kind] ?? 0;
      return {
        level, shards: q.shards, catalyst: q.catalyst, catalystHave: save.mats.catalyst,
        affordable: shards >= q.shards && save.mats.catalyst >= q.catalyst,
        bonusPct: primeBonusPct(level), nextGainPct: primeNextGainPct(level),
      };
    })(),
    dmgPct: Math.round((prog.damageMult - 1) * 100),
    cdPct: Math.round((1 - prog.cooldownMult) * 100),
    equipScore,
    powerRating: Math.round(prog.damageMult * (100 + equipScore)),
    mastery: { level: mp.level, into: mp.into, need: mp.need, rank, rankTitle: masteryRankTitle(mp.level), nextRankLevel, nextRankTitle },
    runs: save.stats.heroUsage[kind] ?? 0,
    kills: save.heroKills[kind] ?? 0,
    favoriteEquip: favoriteEquipName(save.heroFavEquip[kind]),
    loadout: EQUIP_SLOTS.map((s) => loadoutSlot(heroLoadout, save.equipment.inventory, s)),
    perks: masteryPerksUpTo('hero', kind, mp.level),
    nextUnlocks,
    symbiote: (() => {
      const r = resolveHeroSymbiote(save.heroSymbiotes?.[kind]);
      const unlocked = save.heroSymbiotes?.[kind]?.unlocked ?? 1;
      const nextGate = unlocked < SYMBIOTE_SLOTS ? HERO_SYMBIOTE_GATES[kind].find((g) => g.slot === unlocked + 1) : undefined;
      return { slotsActive: r.slotsActive, slots: SYMBIOTE_SLOTS, power: r.power, resonance: r.resonance?.name ?? null, fx: r.fx, nextTrial: nextGate?.title ?? null };
    })(),
  };
}
