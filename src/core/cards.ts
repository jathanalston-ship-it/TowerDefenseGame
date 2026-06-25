// Gene Cards — the temporary run bucket (PROGRESSION.md §1.1, DESIGN.md §6.3).
// Cards are drafted between waves and RESET every run: they only ever mutate the
// run's RunModifiers / run state, never permanent meta. No React/DOM here.

import type { CardOption, CardRarity } from './types';
import type { Rng } from './rng';

/** The run "R bucket": multipliers/flags a run accumulates from drafted cards. */
export interface RunModifiers {
  towerDamageMult: number;
  towerFireRateMult: number;
  splashRadiusMult: number;
  biomassMult: number;
  reactorBiomassMult: number;
  reactorOverchargeBonus: number;
  needleExtraProjectiles: number;
  mortarPoolDurationMult: number;
  poolDpsMult: number;
  mortarAppliesFracture: boolean;
  fractureBonusStacks: number;
  corrosionSlowBonus: number;
  heroDamageMult: number;
  heroCooldownMult: number;
}

export function defaultRunModifiers(): RunModifiers {
  return {
    towerDamageMult: 1,
    towerFireRateMult: 1,
    splashRadiusMult: 1,
    biomassMult: 1,
    reactorBiomassMult: 1,
    reactorOverchargeBonus: 0,
    needleExtraProjectiles: 0,
    mortarPoolDurationMult: 1,
    poolDpsMult: 1,
    mortarAppliesFracture: false,
    fractureBonusStacks: 0,
    corrosionSlowBonus: 0,
    heroDamageMult: 1,
    heroCooldownMult: 1,
  };
}

/** Context a card effect can touch: run mods + a few immediate grants. */
export interface CardContext {
  mods: RunModifiers;
  grantBiomass: (n: number) => void;
  grantIntegrity: (n: number) => void;
  healHero: (maxBonus: number) => void;
}

export interface CardDef {
  id: string;
  name: string;
  rarity: CardRarity;
  category: string;
  description: string;
  apply: (ctx: CardContext) => void;
}

export const CARD_POOL: CardDef[] = [
  // ── Common ──
  { id: 'sharpened_needles', name: 'Sharpened Needles', rarity: 'common', category: 'Tower Buff', description: '+12% tower damage.', apply: (c) => { c.mods.towerDamageMult *= 1.12; } },
  { id: 'rapid_glands', name: 'Rapid Glands', rarity: 'common', category: 'Tower Buff', description: '+12% tower fire rate.', apply: (c) => { c.mods.towerFireRateMult *= 1.12; } },
  { id: 'fertile_decay', name: 'Fertile Decay', rarity: 'common', category: 'Economy', description: '+18% biomass from kills.', apply: (c) => { c.mods.biomassMult *= 1.18; } },
  { id: 'biomass_surge', name: 'Biomass Surge', rarity: 'common', category: 'Economy', description: 'Gain 180 biomass now.', apply: (c) => c.grantBiomass(180) },
  { id: 'thick_marrow', name: 'Thick Marrow', rarity: 'common', category: 'Survival', description: '+45 max & current Integrity.', apply: (c) => c.grantIntegrity(45) },
  { id: 'twin_fang', name: 'Twin Fang', rarity: 'common', category: 'Crits', description: 'Needle Spitter fires +1 extra needle.', apply: (c) => { c.mods.needleExtraProjectiles += 1; } },
  { id: 'battle_stims', name: 'Battle Stims', rarity: 'common', category: 'Hero Buff', description: '+60 hero max & current HP.', apply: (c) => c.healHero(60) },

  // ── Rare ──
  { id: 'caustic_catalyst', name: 'Caustic Catalyst', rarity: 'rare', category: 'Mutation Synergy', description: 'Bone Mortar also applies Fracture — enabling SHRED on its own.', apply: (c) => { c.mods.mortarAppliesFracture = true; } },
  { id: 'volatile_marrow', name: 'Volatile Marrow', rarity: 'rare', category: 'AoE', description: '+35% splash radius, +8% tower damage.', apply: (c) => { c.mods.splashRadiusMult *= 1.35; c.mods.towerDamageMult *= 1.08; } },
  { id: 'fracture_cascade', name: 'Fracture Cascade', rarity: 'rare', category: 'Crits', description: '+3 max Fracture stacks (deeper shred & damage).', apply: (c) => { c.mods.fractureBonusStacks += 3; } },
  { id: 'apex_adrenaline', name: 'Apex Adrenaline', rarity: 'rare', category: 'Hero Buff', description: '+35% hero damage, −22% ability cooldown.', apply: (c) => { c.mods.heroDamageMult *= 1.35; c.mods.heroCooldownMult *= 0.78; } },
  { id: 'lingering_acid', name: 'Lingering Acid', rarity: 'rare', category: 'Poison', description: 'Corrosion pools last +60% longer and tick +30% harder.', apply: (c) => { c.mods.mortarPoolDurationMult *= 1.6; c.mods.poolDpsMult *= 1.3; } },
  { id: 'overcharged_veins', name: 'Overcharged Veins', rarity: 'rare', category: 'Tower Buff', description: '+25% reactor overcharge & +30% reactor biomass.', apply: (c) => { c.mods.reactorOverchargeBonus += 0.25; c.mods.reactorBiomassMult *= 1.3; } },
  { id: 'swarm_bounty', name: 'Swarm Bounty', rarity: 'rare', category: 'Economy', description: '+28% biomass from kills.', apply: (c) => { c.mods.biomassMult *= 1.28; } },
];

const BY_RARITY: Record<CardRarity, CardDef[]> = {
  common: CARD_POOL.filter((c) => c.rarity === 'common'),
  rare: CARD_POOL.filter((c) => c.rarity === 'rare'),
};

const RARE_CHANCE = 0.32;

/** Draft `count` distinct cards, rarity-weighted. */
export function draftCards(rng: Rng, count = 3): CardDef[] {
  const chosen: CardDef[] = [];
  const used = new Set<string>();
  let guard = 0;
  while (chosen.length < count && guard++ < 100) {
    const rarity: CardRarity = rng.chance(RARE_CHANCE) ? 'rare' : 'common';
    const pool = BY_RARITY[rarity].filter((c) => !used.has(c.id));
    const fallback = CARD_POOL.filter((c) => !used.has(c.id));
    const source = pool.length > 0 ? pool : fallback;
    if (source.length === 0) break;
    const card = rng.pick(source);
    used.add(card.id);
    chosen.push(card);
  }
  return chosen;
}

export function cardToOption(def: CardDef): CardOption {
  return {
    id: def.id,
    name: def.name,
    rarity: def.rarity,
    description: def.description,
    category: def.category,
  };
}
