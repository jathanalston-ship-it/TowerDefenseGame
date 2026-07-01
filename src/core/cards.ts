// Gene Cards — the temporary run bucket (PROGRESSION.md §1.1, DESIGN.md §6.3).
// Cards are drafted between waves and RESET every run: they only ever mutate the
// run's RunModifiers / run state, never permanent meta. No React/DOM here.

import type { CardOption, CardRarity, CardCategory, CardSubject, StatusType, TowerKind } from './types';
import type { AbilityComponent } from './ability';
import type { Rng } from './rng';
import { Registry } from './registry';
import { SELL } from './config';
import { GENE_UPGRADES } from './geneUpgrades';

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
  // Run-start (construction-time) behavioral knobs — folded ONCE when the run boots, so they
  // never touch the hot combat path (equipment/relics, applied pre-run, ride these). Neutral by
  // default, so a run with no gear is byte-identical (the golden invariant). NOTE for card
  // authors: a card drafted MID-run cannot use these (the value was already consumed at boot) —
  // use the live knobs or the instant ops (biomass/integrity/heroHp) for resource/max effects.
  startBiomassBonus: number; // flat biomass added at run start
  integrityMult: number; // multiplies max Nucleus integrity (equipment survivability)
  heroMaxHpMult: number; // multiplies hero max HP (equipment survivability)
  // ── Hero behavior profile (EQUIPMENT-PHILOSOPHY.md) — armor/relics author HOW the hero
  //    plays, not just its numbers. Neutral defaults ⇒ a gear-less run is byte-identical. ──
  heroAggroRangeMult: number; // scales the hero's target-seek range (aggression). 1 = base
  heroRetreatThreshold: number; // HP fraction below which the hero disengages to the nucleus (0 = never)
  heroAnchor: string; // where the hero idles/holds: 'default' | 'nucleus' | 'line' | 'towers'
  // ── Behavioral equipment verbs (EQUIPMENT.md archetypes) — gear authors HOW the hero plays
  //    across attacks / mobility / abilities / support / defense. Neutral defaults ⇒ a gear-less
  //    run is byte-identical (golden). The hero ATTACK KIT (grant 'heroAttackAbility') is collected
  //    separately at boot (game.ts), not here. ──
  heroSpeedMult: number; // MOBILITY — scales hero move speed (1 = base)
  heroLifestealFrac: number; // ATTACKS — hero heals this fraction of damage it deals (0 = off)
  heroThornsFrac: number; // DEFENSE — reflect this fraction of contact damage back to attackers (0 = off)
  heroAbilityRadiusMult: number; // ABILITIES — scales the hero ability's AoE radius (1 = base)
  // ── Hero stat axes shared by gear/cards AND the in-run Hero Evolution sink (docs/HERO-EVOLUTION.md).
  //    Neutral defaults ⇒ a run that buys nothing is byte-identical (golden). The sim reads each as
  //    `hmods(h).X × evo.X` so equipment and Evolution stack on the same field. ──
  heroAttackSpeedMult: number; // ATTACKS — scales hero attack + pulse cadence (1 = base; >1 = faster)
  heroCritChance: number; // ATTACKS — chance [0..1] a hero hit/ability crits (0 = never; no RNG spent at 0)
  heroCritDamageBonus: number; // ATTACKS — crit multiplier ADDED to HERO_CRIT_BASE (0 = base ×1.5 crit)
  heroHealingMult: number; // SUSTAIN — scales ALL healing the hero RECEIVES (1 = base)
  heroArmor: number; // DEFENSE — flat fraction [0..~0.6] of incoming contact damage prevented (0 = none)
  heroAuraRadius: number; // SUPPORT — radius of the hero's tower aura (0 = no aura)
  heroTowerHasteAura: number; // SUPPORT — +fire rate to towers within heroAuraRadius (0 = off)
  heroTowerDamageAura: number; // SUPPORT — +damage to towers within heroAuraRadius (0 = off)
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
  // ── Structural (run-only) — TEMPORARY tower-slot unlocks (gene cards). Adds to the run's
  //    available emplacements on top of the permanent base; capped at SLOTS.tempMax by the
  //    Game's `unlockedSlots` getter and reset every run. 0 = none (golden-safe). docs/SLOTS.md. ──
  bonusTowerSlots: number; // temporary tower slots unlocked this run (gene cards)
  // Tower SELL refund fraction (docs/TOWER-MANAGEMENT.md §2). The single extensibility point for
  // refund-rate mechanics — cards/equipment/prestige bump it via the normal effect pipeline.
  sellRefundFrac: number; // default SELL.refundFrac (0.75); ≤ 1 so selling is never exploitable
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
    heroSpeedMult: 1,
    heroLifestealFrac: 0,
    heroThornsFrac: 0,
    heroAbilityRadiusMult: 1,
    heroAttackSpeedMult: 1,
    heroCritChance: 0,
    heroCritDamageBonus: 0,
    heroHealingMult: 1,
    heroArmor: 0,
    heroAuraRadius: 0,
    heroTowerHasteAura: 0,
    heroTowerDamageAura: 0,
    executeThreshold: 0,
    lastStandThreshold: 0,
    lastStandMult: 1,
    damagePerEmptySlot: 0,
    damagePerTower: 0,
    reactionRepeats: 0,
    enemyHpRunMult: 1,
    classResonanceBonus: 0,
    diversityBonus: 0,
    bonusTowerSlots: 0,
    sellRefundFrac: SELL.refundFrac,
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
export type RunModNumberKey = { [K in keyof RunModifiers]: RunModifiers[K] extends number ? K : never }[keyof RunModifiers];
type RunModFlagKey = { [K in keyof RunModifiers]: RunModifiers[K] extends boolean ? K : never }[keyof RunModifiers];
type RunModStrKey = { [K in keyof RunModifiers]: RunModifiers[K] extends string ? K : never }[keyof RunModifiers];

// ── Behavioral grants / hooks (PROGRESSION-PHILOSOPHY §3A/B) — the run-start "verbs"
//    equipment (and future content) uses beyond stat tweaks. Collected at boot, not folded
//    into a stat; the sim consumes them (game.ts). Neutral when absent ⇒ golden-safe. ──

/** A capability granted to the whole run at boot. */
export type GrantSpec =
  | { kind: 'towerProjectileMutator'; id: string } // every tower's shots gain a projectile mutator
  | { kind: 'heroAttackStatus'; status: StatusType; amount: number } // the hero's hits also apply a status
  | { kind: 'heroAttackAbility'; component: AbilityComponent }; // the hero's hits also run an ability component
//   (cleave aura / chain / on-hit explosion / status / crit) — weapons RE-AUTHOR the attack

/** A battlefield RULE: an action fired when a run event occurs (relics). */
export type HookEvent = 'enemyKilled' | 'waveStarted' | 'abilityCast' | 'waveCleared';
export type HookAction =
  | { do: 'spreadStatus'; status: StatusType; amount: number; radius: number } // around the trigger point
  | { do: 'biomass'; value: number } // grant biomass
  | { do: 'heal'; value: number } // restore Nucleus integrity
  | { do: 'shield'; value: number; seconds: number }; // grant the hero an absorb-shield
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

/** Display labels for the synergy categories — DraftModal shows these. */
export const CARD_CATEGORY_LABEL: Record<CardCategory, string> = {
  poison: 'Poison',
  summons: 'Summons',
  economy: 'Economy',
  crit: 'Crit',
  aoe: 'AoE',
  control: 'Control',
  hero: 'Hero',
  tower: 'Tower',
  mutation: 'Mutation',
};

/** One permanent upgrade LEVEL for a gene card (docs/GENE-EVOLUTION.md). Its `effects` are ADDED on
 *  top of the card's base effects (and lower levels) when the card is applied at that level. `note`
 *  is the human description of what the level does. Authored per-card in Task 4; empty until then. */
export interface GeneUpgradeLevel {
  effects: CardEffect[];
  note: string;
}

/** Ascension BACKEND scaffolding (docs/GENE-EVOLUTION.md §Ascension) — data only, NO gameplay yet.
 *  A future tier can raise rarity, swap art, and layer extra effects/power. Absent ⇒ not ascendable. */
export interface GeneAscension {
  maxTier: number; // number of ascension tiers (0 until authored)
  tiers?: { rarity?: CardRarity; art?: string; effects?: CardEffect[]; note?: string }[];
}

/** A cosmetic artwork variant (future). `id` is stable; `art` is the renderer art key. */
export interface GeneSkin {
  id: string;
  name: string;
  art?: string;
}

export interface CardDef {
  id: string; // PERMANENT unique id — the save key for this card's progression. Never reuse/rename.
  name: string;
  rarity: CardRarity;
  category: CardCategory; // synergy tag; CARD_CATEGORY_LABEL maps it to the display string
  description: string;
  effects: CardEffect[]; // BASE (level-0) effects
  // ── Permanent progression scaffolding (docs/GENE-EVOLUTION.md). ALL OPTIONAL — a card with none of
  //    these behaves exactly as before (base-only, no upgrades) so existing gameplay is preserved.
  //    Populated by later tasks; the architecture reads them through core/geneCards.ts. ──
  maxLevel?: number; // permanent upgrade ceiling (default = base only). Task 4 sets 3–5.
  upgrades?: GeneUpgradeLevel[]; // per-level upgrades; index i = the jump to level i+1. Task 4.
  ascension?: GeneAscension; // ascension backend (Task 10) — no gameplay.
  skins?: GeneSkin[]; // future artwork variants.
  art?: string; // base artwork key (procedural fallback if absent).
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

// The draftable pool. New content is pure data — a row here, no code. Effects fold into
// RunModifiers (mul/add/flag/set) or fire instant grants / run-start verbs (grant/hook).
// Per-rarity design role (CARDS.md §5): Common = one clean effect · Rare = stronger/two-part
// · Epic = build-shaping · Legendary = rule-bending. Values are starting points.
export const CARD_POOL: CardDef[] = [
  // ════════════════ Common — one clean effect ════════════════
  { id: 'sharpened_needles', name: 'Sharpened Needles', rarity: 'common', category: 'tower', description: '+12% tower damage.', effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.12 }] },
  { id: 'rapid_glands', name: 'Rapid Glands', rarity: 'common', category: 'tower', description: '+12% tower fire rate.', effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.12 }] },
  { id: 'fertile_decay', name: 'Fertile Decay', rarity: 'common', category: 'economy', description: '+18% biomass from kills.', effects: [{ op: 'mul', field: 'biomassMult', value: 1.18 }] },
  { id: 'biomass_surge', name: 'Biomass Surge', rarity: 'common', category: 'economy', description: 'Gain 180 biomass now.', effects: [{ op: 'biomass', value: 180 }] },
  { id: 'thick_marrow', name: 'Thick Marrow', rarity: 'common', category: 'economy', description: '+45 max & current Integrity.', effects: [{ op: 'integrity', value: 45 }] },
  { id: 'twin_fang', name: 'Twin Fang', rarity: 'common', category: 'tower', description: 'Needle Spitter fires +1 extra needle.', effects: [{ op: 'add', field: 'needleExtraProjectiles', value: 1 }] },
  { id: 'battle_stims', name: 'Battle Stims', rarity: 'common', category: 'hero', description: '+60 hero max & current HP.', effects: [{ op: 'heroHp', value: 60 }] },
  { id: 'toxic_coating', name: 'Toxic Coating', rarity: 'common', category: 'poison', description: '+15% Infection & Corrosion damage.', effects: [{ op: 'mul', field: 'parasiteInfectionMult', value: 1.15 }, { op: 'mul', field: 'poolDpsMult', value: 1.15 }] },
  { id: 'caustic_edge', name: 'Caustic Edge', rarity: 'common', category: 'poison', description: 'Corrosion slows enemies +8% more.', effects: [{ op: 'add', field: 'corrosionSlowBonus', value: 0.08 }] },
  { id: 'numbing_field', name: 'Numbing Field', rarity: 'common', category: 'control', description: 'Disruption slow is +8% stronger.', effects: [{ op: 'add', field: 'obeliskSlowBonus', value: 0.08 }] },
  { id: 'disorient', name: 'Disorient', rarity: 'common', category: 'control', description: 'Disrupted enemies take +6% more damage.', effects: [{ op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.06 }] },
  { id: 'thick_hide', name: 'Thick Hide', rarity: 'common', category: 'hero', description: '+80 hero max & current HP.', effects: [{ op: 'heroHp', value: 80 }] },
  { id: 'combat_stims', name: 'Combat Stims', rarity: 'common', category: 'hero', description: '−10% hero ability cooldown.', effects: [{ op: 'mul', field: 'heroCooldownMult', value: 0.9 }] },
  { id: 'fleet_step', name: 'Fleet Step', rarity: 'common', category: 'hero', description: '+12% hero move speed.', effects: [{ op: 'mul', field: 'heroSpeedMult', value: 1.12 }] },
  { id: 'fracture_point', name: 'Fracture Point', rarity: 'common', category: 'crit', description: '+2 max Fracture stacks (deeper shred).', effects: [{ op: 'add', field: 'fractureBonusStacks', value: 2 }] },
  { id: 'bonemeal', name: 'Bonemeal', rarity: 'common', category: 'economy', description: 'Gain 150 biomass now.', effects: [{ op: 'biomass', value: 150 }] },
  { id: 'hardened_carapace', name: 'Hardened Carapace', rarity: 'common', category: 'economy', description: '+70 max & current Integrity.', effects: [{ op: 'integrity', value: 70 }] },
  { id: 'engorged_reactor', name: 'Engorged Reactor', rarity: 'common', category: 'economy', description: '+0.15 reactor overcharge bonus.', effects: [{ op: 'add', field: 'reactorOverchargeBonus', value: 0.15 }] },

  // ════════════════ Rare — stronger / two-part ════════════════
  { id: 'caustic_catalyst', name: 'Caustic Catalyst', rarity: 'rare', category: 'mutation', description: 'Bone Mortar also applies Fracture — enabling SHRED on its own.', effects: [{ op: 'flag', field: 'mortarAppliesFracture' }] },
  { id: 'volatile_marrow', name: 'Volatile Marrow', rarity: 'rare', category: 'aoe', description: '+35% splash radius, +8% tower damage.', effects: [{ op: 'mul', field: 'splashRadiusMult', value: 1.35 }, { op: 'mul', field: 'towerDamageMult', value: 1.08 }] },
  { id: 'fracture_cascade', name: 'Fracture Cascade', rarity: 'rare', category: 'crit', description: '+3 max Fracture stacks (deeper shred & damage).', effects: [{ op: 'add', field: 'fractureBonusStacks', value: 3 }] },
  { id: 'apex_adrenaline', name: 'Apex Adrenaline', rarity: 'rare', category: 'hero', description: '+35% hero damage, −22% ability cooldown.', effects: [{ op: 'mul', field: 'heroDamageMult', value: 1.35 }, { op: 'mul', field: 'heroCooldownMult', value: 0.78 }] },
  { id: 'lingering_acid', name: 'Lingering Acid', rarity: 'rare', category: 'poison', description: 'Corrosion pools last +60% longer and tick +30% harder.', effects: [{ op: 'mul', field: 'mortarPoolDurationMult', value: 1.6 }, { op: 'mul', field: 'poolDpsMult', value: 1.3 }] },
  { id: 'overcharged_veins', name: 'Overcharged Veins', rarity: 'rare', category: 'economy', description: '+25% reactor overcharge & +30% reactor biomass.', effects: [{ op: 'add', field: 'reactorOverchargeBonus', value: 0.25 }, { op: 'mul', field: 'reactorBiomassMult', value: 1.3 }] },
  { id: 'swarm_bounty', name: 'Swarm Bounty', rarity: 'rare', category: 'economy', description: '+28% biomass from kills.', effects: [{ op: 'mul', field: 'biomassMult', value: 1.28 }] },
  { id: 'plague_vector', name: 'Plague Vector', rarity: 'rare', category: 'poison', description: '+30% Infection; slain enemies spread Infection to nearby foes.', effects: [{ op: 'mul', field: 'parasiteInfectionMult', value: 1.3 }, { op: 'hook', hook: { on: 'enemyKilled', action: { do: 'spreadStatus', status: 'Infection', amount: 2, radius: 70 } } }] },
  { id: 'vulnerability_field', name: 'Vulnerability Field', rarity: 'rare', category: 'control', description: 'Disrupted enemies take +18% more damage.', effects: [{ op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.18 }] },
  { id: 'pierce_protocol', name: 'Pierce Protocol', rarity: 'rare', category: 'aoe', description: "Every tower's shots pierce +2 enemies.", effects: [{ op: 'grant', grant: { kind: 'towerProjectileMutator', id: 'pierce2' } }] },
  { id: 'heavy_caliber', name: 'Heavy Caliber', rarity: 'rare', category: 'tower', description: '+30% tower damage, −5% fire rate.', effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.3 }, { op: 'mul', field: 'towerFireRateMult', value: 0.95 }] },
  { id: 'rapid_cycling', name: 'Rapid Cycling', rarity: 'rare', category: 'tower', description: '+25% tower fire rate.', effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.25 }] },
  { id: 'reclaimed_node', name: 'Reclaimed Node', rarity: 'rare', category: 'tower', description: 'Unlock one additional tower emplacement for this run (max 6).', effects: [{ op: 'add', field: 'bonusTowerSlots', value: 1 }] },
  { id: 'warlords_presence', name: "Warlord's Presence", rarity: 'rare', category: 'hero', description: 'Hero aura: nearby towers gain +15% damage.', effects: [{ op: 'add', field: 'heroAuraRadius', value: 120 }, { op: 'add', field: 'heroTowerDamageAura', value: 0.15 }] },
  { id: 'lifelink', name: 'Lifelink', rarity: 'rare', category: 'hero', description: 'Hero heals 10% of the damage it deals.', effects: [{ op: 'add', field: 'heroLifestealFrac', value: 0.1 }] },
  { id: 'adaptive_arsenal', name: 'Adaptive Arsenal', rarity: 'rare', category: 'tower', description: '+6% tower damage per DISTINCT tower class fielded.', effects: [{ op: 'add', field: 'diversityBonus', value: 0.06 }] },

  // ════════════════ Epic — build-shaping ════════════════
  { id: 'caustic_detonation', name: 'Caustic Detonation', rarity: 'epic', category: 'poison', description: 'Corrosion pools tick +50% and last +50%; Bone Mortar also Fractures.', effects: [{ op: 'mul', field: 'poolDpsMult', value: 1.5 }, { op: 'mul', field: 'mortarPoolDurationMult', value: 1.5 }, { op: 'flag', field: 'mortarAppliesFracture' }] },
  { id: 'shatterpoint', name: 'Shatterpoint', rarity: 'epic', category: 'crit', description: '+6 max Fracture stacks; status reactions re-fire once.', effects: [{ op: 'add', field: 'fractureBonusStacks', value: 6 }, { op: 'add', field: 'reactionRepeats', value: 1 }] },
  { id: 'cull_the_weak', name: 'Cull the Weak', rarity: 'epic', category: 'crit', description: 'Instantly kill non-elite enemies below 12% HP.', effects: [{ op: 'add', field: 'executeThreshold', value: 0.12 }] },
  { id: 'avatar_of_war', name: 'Avatar of War', rarity: 'epic', category: 'hero', description: 'Hero aura empowers nearby towers (+20% dmg, +15% rate); +20% hero damage.', effects: [{ op: 'add', field: 'heroAuraRadius', value: 160 }, { op: 'add', field: 'heroTowerDamageAura', value: 0.2 }, { op: 'add', field: 'heroTowerHasteAura', value: 0.15 }, { op: 'mul', field: 'heroDamageMult', value: 1.2 }] },
  { id: 'catalyst_engine', name: 'Catalyst Engine', rarity: 'epic', category: 'mutation', description: 'Status reactions re-fire once; +10% tower damage.', effects: [{ op: 'add', field: 'reactionRepeats', value: 1 }, { op: 'mul', field: 'towerDamageMult', value: 1.1 }] },
  { id: 'overcharged_grid', name: 'Overcharged Grid', rarity: 'epic', category: 'economy', description: '+0.40 reactor overcharge, +50% reactor biomass, +10% tower damage.', effects: [{ op: 'add', field: 'reactorOverchargeBonus', value: 0.4 }, { op: 'mul', field: 'reactorBiomassMult', value: 1.5 }, { op: 'mul', field: 'towerDamageMult', value: 1.1 }] },
  { id: 'gravity_well', name: 'Gravity Well', rarity: 'epic', category: 'control', description: 'Disruption slows +20% harder and adds +20% vulnerability.', effects: [{ op: 'add', field: 'obeliskSlowBonus', value: 0.2 }, { op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.2 }] },

  // ════════════════ Legendary — rule-bending ════════════════
  { id: 'glass_genome', name: 'Glass Genome', rarity: 'legendary', category: 'tower', description: '×2 tower damage — but every enemy has +25% HP.', effects: [{ op: 'mul', field: 'towerDamageMult', value: 2.0 }, { op: 'mul', field: 'enemyHpRunMult', value: 1.25 }] },
  { id: 'executioners_law', name: "Executioner's Law", rarity: 'legendary', category: 'crit', description: 'Execute non-elite enemies below 20% HP; +15% tower damage.', effects: [{ op: 'add', field: 'executeThreshold', value: 0.2 }, { op: 'mul', field: 'towerDamageMult', value: 1.15 }] },
  { id: 'last_bastion', name: 'Last Bastion', rarity: 'legendary', category: 'tower', description: 'Below 50% Nucleus, towers deal ×2.5 — and +4% per tower fielded.', effects: [{ op: 'add', field: 'lastStandThreshold', value: 0.5 }, { op: 'mul', field: 'lastStandMult', value: 2.5 }, { op: 'add', field: 'damagePerTower', value: 0.04 }] },
  { id: 'apex_predator', name: 'Apex Predator', rarity: 'legendary', category: 'hero', description: 'Hero damage ×3 and +150 HP — but every enemy has +15% HP.', effects: [{ op: 'mul', field: 'heroDamageMult', value: 3.0 }, { op: 'heroHp', value: 150 }, { op: 'mul', field: 'enemyHpRunMult', value: 1.15 }] },
];

/** Per-effect invariants — shared by base effects AND every authored upgrade level. */
function effectProblems(e: CardEffect, mods: Record<string, unknown>): string[] {
  const out: string[] = [];
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
  if (e.op === 'grant' && e.grant.kind === 'heroAttackAbility' && !e.grant.component) out.push('heroAttackAbility grant missing component');
  return out;
}

// Upgrade fields that are CONSUMED at run boot — dead if a card is drafted mid-run, so upgrade
// content must never rely on them (the base card may; it sets expectations at draft time).
const BOOT_ONLY_FIELDS = new Set(['startBiomassBonus', 'integrityMult', 'heroMaxHpMult']);

/** Per-card invariants (shared with the registry's own `validate()`). Since Task 4, EVERY gene card
 *  must carry 3–5 authored permanent upgrade levels — the structural "no card bypasses the upgrade
 *  system" guarantee (docs/GENE-EVOLUTION.md). */
export function cardProblems(c: CardDef): string[] {
  const out: string[] = [];
  const mods = defaultRunModifiers() as unknown as Record<string, unknown>;
  if (c.effects.length === 0) out.push('has no effects');
  if (!(c.category in CARD_CATEGORY_LABEL)) out.push(`unknown category '${c.category}'`);
  for (const e of c.effects) out.push(...effectProblems(e, mods));
  // ── Permanent-upgrade contract (Task 4): 3–5 meaningful, valid, non-boot-only levels. ──
  const ups = c.upgrades ?? [];
  if (ups.length < 3 || ups.length > 5) out.push(`must have 3–5 upgrade levels (has ${ups.length})`);
  if ((c.maxLevel ?? 0) !== ups.length) out.push(`maxLevel (${c.maxLevel}) must equal upgrade count (${ups.length})`);
  ups.forEach((u, i) => {
    if (u.effects.length === 0) out.push(`upgrade L${i + 1} has no effects`);
    if (!u.note?.trim()) out.push(`upgrade L${i + 1} has no note`);
    for (const e of u.effects) {
      out.push(...effectProblems(e, mods).map((p) => `upgrade L${i + 1}: ${p}`));
      if ((e.op === 'mul' || e.op === 'add') && BOOT_ONLY_FIELDS.has(e.field)) {
        out.push(`upgrade L${i + 1}: '${e.field}' is boot-only (dead when drafted mid-run)`);
      }
    }
  });
  return out;
}

// Fold the authored permanent-upgrade content (Task 4) onto each def BEFORE registration, so every
// seam (effectiveGeneEffects / Power / the Archive) reads it off the def. maxLevel == level count.
for (const c of CARD_POOL) {
  const ups = GENE_UPGRADES[c.id];
  if (ups) {
    c.upgrades = ups;
    c.maxLevel = ups.length;
  }
}

// Cards self-register; drafts sample the registry's ACTIVE (non-deprecated) entries.
export const cardRegistry = new Registry<CardDef>('card', { idOf: (c) => c.id, validate: cardProblems });
cardRegistry.registerAll(CARD_POOL);

/** Rarity draw weights (CARDS.md §2). DATA, not hardcoded probabilities: a roll sums the
 * weights of the rarities actually present in the pool and walks a uniform draw, so adding a
 * rarity is one table row. `weightPerWave` nudges odds toward higher rarity as a run deepens
 * (deep/endless runs grow Epic/Legendary-rich) — the per-card weight / pity / unlock hooks
 * from §2–3 layer on top of this same seam. */
export interface CardRarityDef {
  rarity: CardRarity;
  weight: number; // base draw weight at wave 0
  weightPerWave: number; // added to `weight` per wave cleared (depth scaling)
}
export const CARD_RARITY_DEFS: CardRarityDef[] = [
  { rarity: 'common', weight: 64, weightPerWave: 0 },
  { rarity: 'rare', weight: 28, weightPerWave: 0 },
  { rarity: 'epic', weight: 7, weightPerWave: 0.4 },
  { rarity: 'legendary', weight: 1, weightPerWave: 0.1 },
];

function rarityWeight(d: CardRarityDef, wave: number): number {
  return Math.max(0, d.weight + d.weightPerWave * wave);
}

/** Roll a rarity by weight — restricted to the rarities present in `available`, depth-scaled
 * by `wave`. No probability is hardcoded; the weights are data. */
export function rollCardRarity(rng: Rng, wave: number, available: ReadonlySet<CardRarity>): CardRarity {
  const pool = CARD_RARITY_DEFS.filter((d) => available.has(d.rarity));
  let total = 0;
  for (const d of pool) total += rarityWeight(d, wave);
  let u = rng.next() * total;
  for (const d of pool) {
    u -= rarityWeight(d, wave);
    if (u < 0) return d.rarity;
  }
  return pool[pool.length - 1].rarity; // float-rounding guard
}

/** Draft `count` distinct cards: roll a depth-scaled rarity, then pick within it (falling
 * back to any remaining card if that tier is exhausted). `wave` drives the depth scaling. */
export function draftCards(rng: Rng, count = 3, wave = 0): CardDef[] {
  const active = cardRegistry.active();
  const available = new Set<CardRarity>(active.map((c) => c.rarity));
  const chosen: CardDef[] = [];
  const used = new Set<string>();
  let guard = 0;
  while (chosen.length < count && guard++ < 200) {
    const rarity = rollCardRarity(rng, wave, available);
    const pool = active.filter((c) => c.rarity === rarity && !used.has(c.id));
    const source = pool.length > 0 ? pool : active.filter((c) => !used.has(c.id));
    if (source.length === 0) break;
    const card = rng.pick(source);
    used.add(card.id);
    chosen.push(card);
  }
  return chosen;
}

/**
 * Endless Gene Card cadence — waves required between drafts at a given depth (CARDS.md §1).
 * Grows one wave per 5-depth band (1→2→3→4→5) and caps at 5, so cards become progressively
 * rarer the deeper an endless run goes and late runs lean on permanent progression instead of
 * endless card stacking. Campaign (stage) ignores this and drafts every wave.
 */
export function endlessDraftInterval(wave: number): number {
  return Math.min(5, Math.max(1, Math.ceil(wave / 5)));
}

// ── Card SUBJECT — "what it AFFECTS" (CARDS.md) ──────────────────────────────────────────
// Derived from a card's effects, so the draft badge can NEVER drift from what the card does and a
// NEW card auto-classifies from the fields it touches. This map is the single source of truth: each
// tower-/hero-/resource-specific RunModifiers field points at the thing it changes. Fields left out
// are army-wide ⇒ 'global'. Adding a tower = map its new tower-specific fields here (one place).
type SubjectTag = TowerKind | 'hero' | 'global' | 'economy' | 'hive';

const FIELD_SUBJECT: Partial<Record<keyof RunModifiers, SubjectTag>> = {
  // tower identity fields (each maps to the one tower it belongs to)
  needleExtraProjectiles: 'needle',
  mortarPoolDurationMult: 'mortar',
  mortarAppliesFracture: 'mortar',
  corrosionSlowBonus: 'mortar',
  poolDpsMult: 'mortar',
  parasiteInfectionMult: 'parasite',
  obeliskVulnerabilityBonus: 'obelisk',
  obeliskSlowBonus: 'obelisk',
  reactorBiomassMult: 'reactor',
  reactorOverchargeBonus: 'reactor',
  // hero kit (numbers + behaviour)
  heroDamageMult: 'hero', heroCooldownMult: 'hero', heroMaxHpMult: 'hero',
  heroAggroRangeMult: 'hero', heroRetreatThreshold: 'hero', heroAnchor: 'hero',
  heroSpeedMult: 'hero', heroLifestealFrac: 'hero', heroThornsFrac: 'hero',
  heroAbilityRadiusMult: 'hero', heroAuraRadius: 'hero',
  heroTowerHasteAura: 'hero', heroTowerDamageAura: 'hero',
  // economy (biomass income / stockpile)
  biomassMult: 'economy', startBiomassBonus: 'economy',
  // the Hive itself (the Nucleus + its build structure)
  integrityMult: 'hive', bonusTowerSlots: 'hive',
  // (towerDamageMult, towerFireRateMult, splashRadiusMult, fractureBonusStacks, reactionRepeats,
  //  executeThreshold, diversityBonus, damagePer*, lastStand*, classResonanceBonus, enemyHpRunMult)
  //  are army-wide ⇒ 'global' via the default — intentionally unlisted.
};

// On-hit status → the tower whose identity that status is (for spread-on-event relic hooks).
const STATUS_SUBJECT: Partial<Record<StatusType, SubjectTag>> = {
  Fracture: 'needle', Corrosion: 'mortar', Infection: 'parasite', Disruption: 'obelisk',
};

function effectSubject(e: CardEffect): SubjectTag {
  switch (e.op) {
    case 'mul': case 'add': case 'flag': case 'set':
      return FIELD_SUBJECT[e.field] ?? 'global';
    case 'biomass': return 'economy';
    case 'integrity': return 'hive';
    case 'heroHp': return 'hero';
    case 'grant':
      return e.grant.kind === 'towerProjectileMutator' ? 'global' : 'hero';
    case 'hook': {
      const a = e.hook.action;
      if (a.do === 'biomass') return 'economy';
      if (a.do === 'heal') return 'hive';
      if (a.do === 'shield') return 'hero';
      return STATUS_SUBJECT[a.status] ?? 'global'; // spreadStatus
    }
  }
}

/** What a card primarily AFFECTS, derived from its effects: exactly one distinct non-global
 *  subject ⇒ that subject; none or several ⇒ 'global' (army-wide). Pure + deterministic
 *  (cards.test pins every card's result, so a behaviour change that shifts a badge is caught). */
export function cardSubject(def: CardDef): CardSubject {
  const specific = [...new Set(def.effects.map(effectSubject))].filter((t) => t !== 'global');
  const tag: SubjectTag = specific.length === 1 ? specific[0] : 'global';
  switch (tag) {
    case 'needle': case 'mortar': case 'reactor': case 'parasite': case 'obelisk':
      return { kind: 'tower', tower: tag };
    case 'hero': return { kind: 'hero' };
    case 'economy': return { kind: 'economy' };
    case 'hive': return { kind: 'hive' };
    case 'global': return { kind: 'global' };
  }
}

export function cardToOption(def: CardDef): CardOption {
  return {
    id: def.id,
    name: def.name,
    rarity: def.rarity,
    description: def.description,
    category: CARD_CATEGORY_LABEL[def.category],
    subject: cardSubject(def),
  };
}
