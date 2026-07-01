// Hero Evolution (docs/HERO-EVOLUTION.md) — the in-run BIOMASS sink. Permanent-FOR-THE-RUN hero
// upgrades that apply to EVERY active hero at once, and to any hero unlocked later in the run. Pure:
// no sim / DOM / state. Data-driven — a new category is one row in HERO_EVO_CATEGORIES; a future
// hero stat is one RunModifiers field + one HeroEvoMods slot. Reset every run (never saved).

import type { CardEffect, RunModifiers } from './cards';

/** A hero crit deals ×(this + critDamageBonus) damage (base ×1.5 with no Crit-Damage levels). */
export const HERO_CRIT_BASE = 1.5;

// Cost model — deliberately LINEAR (no exponential spikes). Buying the next level of a category costs
//   baseCost × (1 + PER_LEVEL_STEP · levelsInCategory) × (1 + GLOBAL_STEP · totalOwnedThisRun)
// The per-category term is a gentle ramp; the global term means every purchase ANYWHERE nudges ALL
// future costs up — so a run can deepen a few axes (specialization) but not max everything, while no
// axis is ever locked out (flexibility).
export const HERO_EVO = {
  maxLevel: 10,
  perLevelStep: 0.6,
  globalStep: 0.05,
};

/** The concrete per-run multiplier/bonus bundle the SIM reads live (on top of each hero's own
 *  gear mods). Neutral = no purchases. Keys are short (sim-facing); each maps to one RunModifiers
 *  field for Power scoring via `field` below. */
export interface HeroEvoMods {
  maxHpMult: number;
  damageMult: number;
  attackSpeedMult: number;
  moveSpeedMult: number;
  cooldownMult: number; // <1 ⇒ faster abilities
  abilityRadiusMult: number;
  critChance: number;
  critDamageBonus: number;
  healingMult: number;
  armor: number; // fraction of incoming contact damage prevented
}

export const NEUTRAL_HERO_EVO: HeroEvoMods = {
  maxHpMult: 1, damageMult: 1, attackSpeedMult: 1, moveSpeedMult: 1, cooldownMult: 1,
  abilityRadiusMult: 1, critChance: 0, critDamageBonus: 0, healingMult: 1, armor: 0,
};

/** One upgrade axis. `key` is the sim bundle slot; `field` is the shared RunModifiers/Power field it
 *  scores through (so Evolution rides the SAME Power model as gear/cards). `op` decides how a level
 *  folds — mul: value = 1 + perLevel·level (cooldown uses a negative perLevel to REDUCE); add: value
 *  = perLevel·level. `unit` is a display hint only. */
export interface HeroEvoCategory {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  key: keyof HeroEvoMods;
  field: keyof RunModifiers;
  op: 'mul' | 'add';
  perLevel: number;
  baseCost: number;
  unit: 'pct' | 'x' | 'flatpct';
}

// The 10 launch axes. Values chosen so a maxed axis is a strong-but-not-absurd run swing, and every
// axis is individually meaningful. Extend this array to add categories — nothing else changes.
export const HERO_EVO_CATEGORIES: readonly HeroEvoCategory[] = [
  { id: 'health',      name: 'Vitality',       blurb: 'Max HP for every hero.',                 icon: '❤', key: 'maxHpMult',        field: 'heroMaxHpMult',        op: 'mul', perLevel: 0.08,  baseCost: 45, unit: 'pct' },
  { id: 'damage',      name: 'Lethality',      blurb: 'Hero attack + ability damage.',          icon: '⚔', key: 'damageMult',       field: 'heroDamageMult',       op: 'mul', perLevel: 0.10,  baseCost: 55, unit: 'pct' },
  { id: 'attackspeed', name: 'Frenzy',         blurb: 'Faster hero attacks + pulses.',          icon: '⚡', key: 'attackSpeedMult',  field: 'heroAttackSpeedMult',  op: 'mul', perLevel: 0.06,  baseCost: 55, unit: 'pct' },
  { id: 'movespeed',   name: 'Swiftness',      blurb: 'Hero movement speed.',                   icon: '➤', key: 'moveSpeedMult',    field: 'heroSpeedMult',        op: 'mul', perLevel: 0.05,  baseCost: 40, unit: 'pct' },
  { id: 'cooldown',    name: 'Overdrive',      blurb: 'Shorter ability cooldowns.',             icon: '↻', key: 'cooldownMult',     field: 'heroCooldownMult',     op: 'mul', perLevel: -0.04, baseCost: 55, unit: 'pct' },
  { id: 'radius',      name: 'Amplitude',      blurb: 'Larger ability area of effect.',         icon: '◎', key: 'abilityRadiusMult',field: 'heroAbilityRadiusMult',op: 'mul', perLevel: 0.06,  baseCost: 45, unit: 'pct' },
  { id: 'critchance',  name: 'Precision',      blurb: 'Chance for hero hits to crit.',          icon: '✷', key: 'critChance',       field: 'heroCritChance',       op: 'add', perLevel: 0.03,  baseCost: 60, unit: 'flatpct' },
  { id: 'critdamage',  name: 'Savagery',       blurb: 'Bigger critical strikes.',               icon: '✸', key: 'critDamageBonus',  field: 'heroCritDamageBonus',  op: 'add', perLevel: 0.15,  baseCost: 50, unit: 'x' },
  { id: 'healing',     name: 'Regeneration',   blurb: 'All healing the hero receives.',         icon: '✚', key: 'healingMult',      field: 'heroHealingMult',      op: 'mul', perLevel: 0.08,  baseCost: 40, unit: 'pct' },
  { id: 'armor',       name: 'Carapace',       blurb: 'Reduces incoming contact damage.',       icon: '⛨', key: 'armor',            field: 'heroArmor',            op: 'add', perLevel: 0.03,  baseCost: 50, unit: 'flatpct' },
];

/** Fast lookup by id (frozen at module load). */
export const HERO_EVO_BY_ID: Record<string, HeroEvoCategory> = Object.fromEntries(HERO_EVO_CATEGORIES.map((c) => [c.id, c]));

export type HeroEvoLevels = Record<string, number>;

/** The value a category contributes at a given level: mul ⇒ multiplier (1 at level 0), add ⇒ amount (0 at level 0). */
export function heroEvoValue(cat: HeroEvoCategory, level: number): number {
  return cat.op === 'mul' ? 1 + cat.perLevel * level : cat.perLevel * level;
}

/** Human label for a category's effect at `level` — e.g. "+40%", "−32%" (cooldown), "×2.10" (crit
 *  damage), or "—" at level 0. Presentation helper shared by the panel + tooltips. */
export function heroEvoEffectLabel(cat: HeroEvoCategory, level: number): string {
  if (cat.unit === 'x') return `×${(HERO_CRIT_BASE + cat.perLevel * level).toFixed(2)}`;
  if (level <= 0) return '—';
  const pct = Math.round(Math.abs(cat.perLevel) * level * 100);
  return `${cat.perLevel < 0 ? '−' : '+'}${pct}%`;
}

/** Total levels bought across all categories this run (drives the global cost ramp). */
export function heroEvoTotalOwned(levels: HeroEvoLevels): number {
  let n = 0;
  for (const c of HERO_EVO_CATEGORIES) n += levels[c.id] ?? 0;
  return n;
}

/** Cost of the NEXT level of `cat` given its current level + the run's total owned. Integer biomass. */
export function heroEvoCost(cat: HeroEvoCategory, levelInCategory: number, totalOwned: number): number {
  return Math.round(cat.baseCost * (1 + HERO_EVO.perLevelStep * levelInCategory) * (1 + HERO_EVO.globalStep * totalOwned));
}

/** Fold the purchased levels into the concrete sim bundle. Neutral for empty levels (golden-safe). */
export function deriveHeroEvoMods(levels: HeroEvoLevels): HeroEvoMods {
  const evo: HeroEvoMods = { ...NEUTRAL_HERO_EVO };
  for (const c of HERO_EVO_CATEGORIES) {
    const lvl = levels[c.id] ?? 0;
    if (lvl > 0) evo[c.key] = heroEvoValue(c, lvl);
  }
  return evo;
}

/** Express the purchases as CardEffect[] so the SAME `effectsPower` bridge scores them into the
 *  run's `temporary` Power bucket — Hero Evolution rides the global Power architecture, no exceptions. */
export function heroEvoEffects(levels: HeroEvoLevels): CardEffect[] {
  const out: CardEffect[] = [];
  for (const c of HERO_EVO_CATEGORIES) {
    const lvl = levels[c.id] ?? 0;
    if (lvl > 0) out.push({ op: c.op, field: c.field, value: heroEvoValue(c, lvl) } as CardEffect);
  }
  return out;
}
