// Gene Cards — the temporary run bucket (PROGRESSION.md §1.1, DESIGN.md §6.3).
// Cards are drafted between waves and RESET every run: they only ever mutate the
// run's RunModifiers / run state, never permanent meta. No React/DOM here.

import type { CardOption, CardRarity, StatusType } from './types';
import type { Rng } from './rng';
import { Registry } from './registry';

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
  // ── Viral (Parasite Nest) / Neural (Neural Obelisk) hooks — identity by default
  //    so they're inert until a card sets them (the "support future cards" seam). ──
  parasiteInfectionMult: number; // scales Infection DoT + ramp speed
  obeliskVulnerabilityBonus: number; // adds to the Disruption damage-taken amp
  obeliskSlowBonus: number; // adds to the Disruption slow
  heroDamageMult: number;
  heroCooldownMult: number;
  // Run-start (construction-time) behavioral knobs — folded once when the run boots,
  // so they never touch the hot combat path (equipment/relics ride these). Neutral by
  // default, so a run with no gear is byte-identical (the golden invariant).
  startBiomassBonus: number; // flat biomass added at run start
  integrityMult: number; // multiplies max Nucleus integrity (e.g. Glass Genome ½)
  heroMaxHpMult: number; // multiplies hero max HP (survivability gear)
  // ── Hero behavior profile (EQUIPMENT-PHILOSOPHY.md) — armor/relics author HOW the hero
  //    plays, not just its numbers. Neutral defaults ⇒ a gear-less run is byte-identical. ──
  heroAggroRangeMult: number; // scales the hero's target-seek range (aggression). 1 = base
  heroRetreatThreshold: number; // HP fraction below which the hero disengages to the nucleus (0 = never)
  heroAnchor: string; // where the hero idles/holds: 'default' | 'nucleus' | 'line' | 'towers'
  // ── Keystones — rule-benders that change HOW combat resolves, not just the numbers.
  //    Neutral by default (off / ×1) so a run without the relevant gear/card is
  //    byte-identical (the golden invariant). The sim gates each on its neutral value. ──
  executeThreshold: number; // instakill non-elite/boss enemies below this HP fraction (0 = off)
  lastStandThreshold: number; // Nucleus HP fraction at/under which Last Stand triggers (0 = off)
  lastStandMult: number; // tower-damage × while Last Stand is active (1 = none)
  damagePerEmptySlot: number; // +tower damage per EMPTY unlocked build slot (0 = off)
  damagePerTower: number; // +tower damage per tower on the board (0 = off)
  reactionRepeats: number; // extra times a status reaction re-fires / chains (0 = off)
  enemyHpRunMult: number; // run-wide enemy-HP scalar (gear trade-off, e.g. Hivemind +10%) (1 = none)
  classResonanceBonus: number; // +tower damage for towers matching the fielded hero's class (0 = off)
  diversityBonus: number; // +tower damage per DISTINCT tower class on the board (0 = off)
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
    parasiteInfectionMult: 1,
    obeliskVulnerabilityBonus: 0,
    obeliskSlowBonus: 0,
    heroDamageMult: 1,
    heroCooldownMult: 1,
    startBiomassBonus: 0,
    integrityMult: 1,
    heroMaxHpMult: 1,
    heroAggroRangeMult: 1,
    heroRetreatThreshold: 0,
    heroAnchor: 'default',
    executeThreshold: 0,
    lastStandThreshold: 0,
    lastStandMult: 1,
    damagePerEmptySlot: 0,
    damagePerTower: 0,
    reactionRepeats: 0,
    enemyHpRunMult: 1,
    classResonanceBonus: 0,
    diversityBonus: 0,
  };
}

/** Context a card effect can touch: run mods + a few immediate grants. */
export interface CardContext {
  mods: RunModifiers;
  grantBiomass: (n: number) => void;
  grantIntegrity: (n: number) => void;
  healHero: (maxBonus: number) => void;
}

// Type-safe field references for data-driven effects: the number-valued vs
// boolean-valued keys of RunModifiers.
type RunModNumberKey = { [K in keyof RunModifiers]: RunModifiers[K] extends number ? K : never }[keyof RunModifiers];
type RunModFlagKey = { [K in keyof RunModifiers]: RunModifiers[K] extends boolean ? K : never }[keyof RunModifiers];
type RunModStrKey = { [K in keyof RunModifiers]: RunModifiers[K] extends string ? K : never }[keyof RunModifiers];

// ── Behavioral grants / hooks (PROGRESSION-PHILOSOPHY §3A/B) — the run-start "verbs"
//    equipment (and future content) uses beyond stat tweaks. Collected at boot, not folded
//    into a stat; the sim consumes them (game.ts). Neutral when absent ⇒ golden-safe. ──

/** A capability granted to the whole run at boot. */
export type GrantSpec =
  | { kind: 'towerProjectileMutator'; id: string } // every tower's shots gain a projectile mutator
  | { kind: 'heroAttackStatus'; status: StatusType; amount: number }; // the hero's hits also apply a status

/** A battlefield RULE: an action fired when a run event occurs (relics). */
export type HookEvent = 'enemyKilled' | 'waveStarted';
export type HookAction =
  | { do: 'spreadStatus'; status: StatusType; amount: number; radius: number } // around the trigger point
  | { do: 'biomass'; value: number }; // grant biomass
export interface HookSpec {
  on: HookEvent;
  action: HookAction;
}

/** A single declarative effect (cards + equipment). New content is pure data — no code.
 * `mul`/`add`/`flag`/`set` fold into RunModifiers; `grant`/`hook` are run-start verbs the
 * sim consumes; the instant ops grant resources immediately. */
export type CardEffect =
  | { op: 'mul'; field: RunModNumberKey; value: number }
  | { op: 'add'; field: RunModNumberKey; value: number }
  | { op: 'flag'; field: RunModFlagKey }
  | { op: 'set'; field: RunModStrKey; value: string } // set a string knob (e.g. heroAnchor)
  | { op: 'grant'; grant: GrantSpec } // run-start capability grant
  | { op: 'hook'; hook: HookSpec } // run-start battlefield rule
  | { op: 'biomass'; value: number } // instant biomass grant
  | { op: 'integrity'; value: number } // instant max+current integrity
  | { op: 'heroHp'; value: number }; // instant max+current hero HP

export interface CardDef {
  id: string;
  name: string;
  rarity: CardRarity;
  category: string;
  description: string;
  effects: CardEffect[];
}

/** Apply a card's declarative effects to the run. The only card interpreter. */
export function applyCard(def: CardDef, ctx: CardContext): void {
  for (const e of def.effects) {
    switch (e.op) {
      case 'mul': ctx.mods[e.field] *= e.value; break;
      case 'add': ctx.mods[e.field] += e.value; break;
      case 'flag': ctx.mods[e.field] = true; break;
      case 'set': ctx.mods[e.field] = e.value; break;
      // grant/hook are run-start verbs consumed by the Game at boot (not by in-run cards).
      case 'grant': case 'hook': break;
      case 'biomass': ctx.grantBiomass(e.value); break;
      case 'integrity': ctx.grantIntegrity(e.value); break;
      case 'heroHp': ctx.healHero(e.value); break;
    }
  }
}

export const CARD_POOL: CardDef[] = [
  // ── Common ──
  { id: 'sharpened_needles', name: 'Sharpened Needles', rarity: 'common', category: 'Tower Buff', description: '+12% tower damage.', effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.12 }] },
  { id: 'rapid_glands', name: 'Rapid Glands', rarity: 'common', category: 'Tower Buff', description: '+12% tower fire rate.', effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.12 }] },
  { id: 'fertile_decay', name: 'Fertile Decay', rarity: 'common', category: 'Economy', description: '+18% biomass from kills.', effects: [{ op: 'mul', field: 'biomassMult', value: 1.18 }] },
  { id: 'biomass_surge', name: 'Biomass Surge', rarity: 'common', category: 'Economy', description: 'Gain 180 biomass now.', effects: [{ op: 'biomass', value: 180 }] },
  { id: 'thick_marrow', name: 'Thick Marrow', rarity: 'common', category: 'Survival', description: '+45 max & current Integrity.', effects: [{ op: 'integrity', value: 45 }] },
  { id: 'twin_fang', name: 'Twin Fang', rarity: 'common', category: 'Crits', description: 'Needle Spitter fires +1 extra needle.', effects: [{ op: 'add', field: 'needleExtraProjectiles', value: 1 }] },
  { id: 'battle_stims', name: 'Battle Stims', rarity: 'common', category: 'Hero Buff', description: '+60 hero max & current HP.', effects: [{ op: 'heroHp', value: 60 }] },

  // ── Rare ──
  { id: 'caustic_catalyst', name: 'Caustic Catalyst', rarity: 'rare', category: 'Mutation Synergy', description: 'Bone Mortar also applies Fracture — enabling SHRED on its own.', effects: [{ op: 'flag', field: 'mortarAppliesFracture' }] },
  { id: 'volatile_marrow', name: 'Volatile Marrow', rarity: 'rare', category: 'AoE', description: '+35% splash radius, +8% tower damage.', effects: [{ op: 'mul', field: 'splashRadiusMult', value: 1.35 }, { op: 'mul', field: 'towerDamageMult', value: 1.08 }] },
  { id: 'fracture_cascade', name: 'Fracture Cascade', rarity: 'rare', category: 'Crits', description: '+3 max Fracture stacks (deeper shred & damage).', effects: [{ op: 'add', field: 'fractureBonusStacks', value: 3 }] },
  { id: 'apex_adrenaline', name: 'Apex Adrenaline', rarity: 'rare', category: 'Hero Buff', description: '+35% hero damage, −22% ability cooldown.', effects: [{ op: 'mul', field: 'heroDamageMult', value: 1.35 }, { op: 'mul', field: 'heroCooldownMult', value: 0.78 }] },
  { id: 'lingering_acid', name: 'Lingering Acid', rarity: 'rare', category: 'Poison', description: 'Corrosion pools last +60% longer and tick +30% harder.', effects: [{ op: 'mul', field: 'mortarPoolDurationMult', value: 1.6 }, { op: 'mul', field: 'poolDpsMult', value: 1.3 }] },
  { id: 'overcharged_veins', name: 'Overcharged Veins', rarity: 'rare', category: 'Tower Buff', description: '+25% reactor overcharge & +30% reactor biomass.', effects: [{ op: 'add', field: 'reactorOverchargeBonus', value: 0.25 }, { op: 'mul', field: 'reactorBiomassMult', value: 1.3 }] },
  { id: 'swarm_bounty', name: 'Swarm Bounty', rarity: 'rare', category: 'Economy', description: '+28% biomass from kills.', effects: [{ op: 'mul', field: 'biomassMult', value: 1.28 }] },
];

/** Per-card invariants (shared with the registry's own `validate()`). */
export function cardProblems(c: CardDef): string[] {
  const out: string[] = [];
  const mods = defaultRunModifiers() as unknown as Record<string, unknown>;
  if (c.effects.length === 0) out.push('has no effects');
  for (const e of c.effects) {
    const numericValueOp = e.op === 'mul' || e.op === 'add' || e.op === 'biomass' || e.op === 'integrity' || e.op === 'heroHp';
    if (numericValueOp && !Number.isFinite((e as { value: number }).value)) out.push('non-finite effect value');
    if (e.op === 'mul' && e.value <= 0) out.push('multiplier must be > 0');
    if ((e.op === 'mul' || e.op === 'add') && typeof mods[e.field] !== 'number') {
      out.push(`'${e.field}' is not a numeric run modifier`);
    }
    if (e.op === 'flag' && typeof mods[e.field] !== 'boolean') {
      out.push(`'${e.field}' is not a boolean run modifier`);
    }
    if (e.op === 'set' && typeof mods[e.field] !== 'string') {
      out.push(`'${e.field}' is not a string run modifier`);
    }
    if (e.op === 'grant' && e.grant.kind === 'towerProjectileMutator' && !e.grant.id) out.push('grant missing mutator id');
  }
  return out;
}

// Cards self-register; drafts sample the registry's ACTIVE (non-deprecated) entries.
export const cardRegistry = new Registry<CardDef>('card', { idOf: (c) => c.id, validate: cardProblems });
cardRegistry.registerAll(CARD_POOL);

const BY_RARITY: Record<CardRarity, CardDef[]> = {
  common: cardRegistry.active().filter((c) => c.rarity === 'common'),
  rare: cardRegistry.active().filter((c) => c.rarity === 'rare'),
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
