// Hero equipment (EQUIPMENT.md). Three slots — Weapon · Armor · Relic — built to the
// canonical spec: behavior-first (no stat-sticks), rarity tiers, rolled affixes with
// bounded tiers (the reroll chase), set bonuses, and crafting/reroll hooks. The whole
// system is DATA: items/affixes/sets are config, and a run folds the equipped loadout
// into the RunModifiers bucket at construction (so it composes with cards/meta and a
// gear-less run stays byte-identical — the golden invariant). No React/DOM here.
//
// Architecturally this scales to hundreds: a new item is one EquipDef entry; its
// gameplay change is a declarative CardEffect[] (the same interpreter cards use) plus
// a human `desc`. Effects that map to a sim lever apply now; richer behaviors are
// catalogued with their descriptor and wire in incrementally — the pipeline is ready.

import type { CardEffect } from './cards';
import { Registry } from './registry';

export type EquipSlot = 'weapon' | 'armor' | 'relic';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'exotic';
export type WeaponType = 'melee' | 'ranged' | 'conduit';
export type ArmorType = 'carapace' | 'hide' | 'weave';

/** How many rolled affixes a rarity carries (base behavior is always-on, on top). */
export const RARITY_AFFIXES: Record<Rarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
  exotic: 3,
};
export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'exotic'];

/** Canonical rarity → CSS color (design tokens). THE one map every surface renders rarity with —
 *  Armory, reveals, tooltips, art frames (docs/UI-STANDARDS.md §Color). Open: unknown → common. */
export const RARITY_COLOR: Record<string, string> = {
  common: 'var(--r-common)', uncommon: 'var(--r-uncommon)', rare: 'var(--r-rare)',
  epic: 'var(--r-epic)', legendary: 'var(--r-legendary)', exotic: 'var(--viral)', mythic: 'var(--r-mythic)',
};
export function rarityColorOf(r: string): string {
  return RARITY_COLOR[r] ?? 'var(--r-common)';
}

/** Bounded magnitude ladder for affix tiers T1..T6 (the reroll chase — never unbounded). */
export const AFFIX_TIER_SCALE = [0, 1, 1.18, 1.36, 1.58, 1.8, 2.0];
export const MAX_AFFIX_TIER = 6;

/** Item-level → affix tier ceiling (Reforge gradual progression). Low ilvl caps low (T2), deep
 *  runs unlock T6; a missing ilvl (legacy gear) is uncapped. Power climbs with depth, never in one
 *  jump. Lives here (next to the tier ladder) so item generation can honour it without a cycle. */
export function maxTierForIlvl(ilvl?: number): number {
  if (ilvl === undefined) return MAX_AFFIX_TIER; // legacy / uncapped
  return Math.max(2, Math.min(MAX_AFFIX_TIER, 2 + Math.floor((Math.max(1, ilvl) - 1) / 8)));
}

// ── Affixes (behavioral, drawn by slot bias) ─────────────────────────────────
export interface AffixDef {
  id: string;
  name: string;
  bias: EquipSlot | 'any';
  /** Prefix (offense) or suffix (utility) for the Reforge affix view. Optional: affixes default
   *  via `affixKind` (offense list → prefix, else suffix); set here to override for new content. */
  kind?: 'prefix' | 'suffix';
  /** Tier-1 magnitude; scaled by AFFIX_TIER_SCALE[tier] at application. */
  effects: CardEffect[];
}

export const AFFIXES: AffixDef[] = [
  { id: 'keen', name: 'Keen', bias: 'weapon', effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.05 }] },
  { id: 'rapid', name: 'Rapid', bias: 'weapon', effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.05 }] },
  { id: 'volatile', name: 'Volatile', bias: 'weapon', effects: [{ op: 'mul', field: 'splashRadiusMult', value: 1.12 }] },
  { id: 'piercing', name: 'Piercing', bias: 'weapon', effects: [{ op: 'add', field: 'fractureBonusStacks', value: 1 }] },
  { id: 'savage', name: 'Savage', bias: 'weapon', effects: [{ op: 'mul', field: 'heroDamageMult', value: 1.08 }] },
  { id: 'swift', name: 'Swift', bias: 'weapon', effects: [{ op: 'mul', field: 'heroCooldownMult', value: 0.95 }] },
  { id: 'warded', name: 'Warded', bias: 'armor', effects: [{ op: 'mul', field: 'heroMaxHpMult', value: 1.08 }] },
  { id: 'bulwark', name: 'Bulwark', bias: 'armor', effects: [{ op: 'mul', field: 'integrityMult', value: 1.06 }] },
  { id: 'galvanic', name: 'Galvanic', bias: 'armor', effects: [{ op: 'add', field: 'reactorOverchargeBonus', value: 0.06 }] },
  { id: 'tidal', name: 'Tidal', bias: 'armor', effects: [{ op: 'mul', field: 'mortarPoolDurationMult', value: 1.12 }] },
  { id: 'glacial', name: 'Glacial', bias: 'armor', effects: [{ op: 'add', field: 'corrosionSlowBonus', value: 0.05 }] },
  // Behavioral armor (EQUIPMENT-PHILOSOPHY.md): these change HOW the hero plays, not its
  // numbers — wider hunting vs. disengaging when wounded.
  { id: 'vigilant', name: 'Vigilant', bias: 'armor', effects: [{ op: 'mul', field: 'heroAggroRangeMult', value: 1.2 }] },
  { id: 'wary', name: 'Wary', bias: 'armor', effects: [{ op: 'add', field: 'heroRetreatThreshold', value: 0.3 }] },
  // Unified grant/set/hook verbs (PROGRESSION-PHILOSOPHY §3): armor sets a STANCE, weapons
  // change the ATTACK, relics bend a RULE — behavior, not numbers.
  { id: 'anchored', name: 'Anchored', bias: 'armor', effects: [{ op: 'set', field: 'heroAnchor', value: 'nucleus' }] },
  { id: 'venomous', name: 'Venomous', bias: 'weapon', effects: [{ op: 'grant', grant: { kind: 'heroAttackStatus', status: 'Corrosion', amount: 2 } }] },
  { id: 'piercer', name: 'Piercer', bias: 'relic', effects: [{ op: 'grant', grant: { kind: 'towerProjectileMutator', id: 'pierce1' } }] },
  { id: 'cursed', name: 'Cursed', bias: 'relic', effects: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'spreadStatus', status: 'Corrosion', amount: 2, radius: 60 } } }] },
  { id: 'fertile', name: 'Fertile', bias: 'relic', effects: [{ op: 'mul', field: 'biomassMult', value: 1.08 }] },
  { id: 'flush', name: 'Flush', bias: 'relic', effects: [{ op: 'add', field: 'startBiomassBonus', value: 60 }] },
  { id: 'corrosive', name: 'Corrosive', bias: 'relic', effects: [{ op: 'mul', field: 'poolDpsMult', value: 1.1 }] },
  { id: 'reactive', name: 'Reactive', bias: 'any', effects: [{ op: 'mul', field: 'reactorBiomassMult', value: 1.1 }] },
  { id: 'twinned', name: 'Twinned', bias: 'any', effects: [{ op: 'add', field: 'needleExtraProjectiles', value: 1 }] },
  // Behavioral affixes (scale by tier) — they sharpen a PLAYSTYLE, not a stat: lifesteal,
  // mobility, thorns, hero auras, ability reach. These keep the reroll chase build-relevant.
  { id: 'leeching', name: 'Leeching', bias: 'weapon', effects: [{ op: 'add', field: 'heroLifestealFrac', value: 0.04 }] },
  { id: 'overwhelming', name: 'Overwhelming', bias: 'weapon', effects: [{ op: 'mul', field: 'heroAbilityRadiusMult', value: 1.06 }] },
  { id: 'swiftfooted', name: 'Swiftfooted', bias: 'armor', effects: [{ op: 'mul', field: 'heroSpeedMult', value: 1.06 }] },
  { id: 'barbed', name: 'Barbed', bias: 'armor', effects: [{ op: 'add', field: 'heroThornsFrac', value: 0.08 }] },
  { id: 'quickening', name: 'Quickening', bias: 'armor', effects: [{ op: 'add', field: 'heroTowerHasteAura', value: 0.04 }] },
  { id: 'amplifying', name: 'Amplifying', bias: 'armor', effects: [{ op: 'add', field: 'heroTowerDamageAura', value: 0.04 }] },
  { id: 'farseeing', name: 'Farseeing', bias: 'any', effects: [{ op: 'add', field: 'heroAuraRadius', value: 18 }] },
  { id: 'widening', name: 'Widening', bias: 'relic', effects: [{ op: 'mul', field: 'heroAbilityRadiusMult', value: 1.06 }] },
];

const AFFIX_BY_ID = new Map(AFFIXES.map((a) => [a.id, a] as const));
export function affixDef(id: string): AffixDef | undefined {
  return AFFIX_BY_ID.get(id);
}

/** Human labels for the RunModifier fields an affix touches — so the Details screen can EXPLAIN a
 *  stat in plain words ("+5% Tower Damage") instead of showing a raw field key. Unlisted fields fall
 *  back to a camelCase→words humanizer, so new content reads sensibly without a hand-edit. */
const FIELD_LABEL: Record<string, string> = {
  towerDamageMult: 'Tower Damage', towerFireRateMult: 'Fire Rate', splashRadiusMult: 'Splash Radius',
  fractureBonusStacks: 'max Fracture', heroDamageMult: 'Hero Damage', heroCooldownMult: 'Ability Cooldown',
  heroMaxHpMult: 'Hero Health', integrityMult: 'Nucleus Integrity', reactorOverchargeBonus: 'Reactor Overcharge',
  mortarPoolDurationMult: 'Acid Pool Duration', corrosionSlowBonus: 'Corrosion Slow', heroAggroRangeMult: 'Hunt Range',
  heroRetreatThreshold: 'Retreat Caution', biomassMult: 'Biomass Income', startBiomassBonus: 'Starting Biomass',
  poolDpsMult: 'Acid Pool Damage', reactorBiomassMult: 'Reactor Biomass', needleExtraProjectiles: 'extra Needles',
  heroLifestealFrac: 'Lifesteal', heroAbilityRadiusMult: 'Ability Radius', heroSpeedMult: 'Move Speed',
  heroThornsFrac: 'Thorns', heroTowerHasteAura: 'Tower Haste Aura', heroTowerDamageAura: 'Tower Damage Aura',
  heroAuraRadius: 'Aura Radius', heroAnchor: 'Anchor Point',
};
function humanizeField(f: string): string {
  return FIELD_LABEL[f] ?? f.replace(/(Mult|Frac|Bonus)$/, '').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
}

/** A plain-language explanation of what an affix DOES (its tier-1 magnitude + which stat it moves).
 *  Shown on the Details screen so a first-time player understands each roll at a glance. */
export function affixEffectText(affix: RolledAffix): string {
  const def = affixDef(affix.affixId);
  const e = def?.effects[0];
  if (!def || !e) return affix.affixId;
  switch (e.op) {
    case 'mul': {
      const pct = Math.round(Math.abs(e.value - 1) * 100);
      return `${e.value >= 1 ? '+' : '−'}${pct}% ${humanizeField(e.field)}`;
    }
    case 'add':
      return `${e.value >= 0 ? '+' : '−'}${Math.abs(e.value)} ${humanizeField(e.field)}`;
    case 'flag':
      return humanizeField(e.field);
    case 'set':
      return `Sets ${humanizeField(e.field)} → ${e.value}`;
    case 'grant':
      return e.grant.kind === 'heroAttackStatus' ? `Hero attacks apply ${e.grant.status}`
        : e.grant.kind === 'towerProjectileMutator' ? 'Shots pierce +1 host'
        : 'Grants a run capability';
    case 'hook':
      return `On ${e.hook.on}: a battlefield rule`;
    default:
      return def.name;
  }
}

/** Offense affixes → "prefix"; everything else is a utility "suffix". Data-driven classification
 *  for the Reforge affix view (Primary / Prefix / Suffix). One reviewable list; an AffixDef may
 *  override via its `kind` field, and any new affix defaults to a suffix unless listed here. */
const PREFIX_AFFIX_IDS = new Set<string>([
  'keen', 'rapid', 'volatile', 'piercing', 'savage', 'venomous', 'piercer', 'cursed', 'corrosive', 'twinned',
]);
export function affixKind(id: string): 'prefix' | 'suffix' {
  return affixDef(id)?.kind ?? (PREFIX_AFFIX_IDS.has(id) ? 'prefix' : 'suffix');
}

// ── Sets (counted across equipped weapon + armor) ────────────────────────────
export interface SetDef {
  id: string;
  name: string;
  /** Bonus effects unlocked at 2 / 4 set-pieces equipped. */
  bonus2: CardEffect[];
  bonus4: CardEffect[];
}
export const SETS: Record<string, SetDef> = {
  apex: { id: 'apex', name: 'Apex Predator', bonus2: [{ op: 'add', field: 'fractureBonusStacks', value: 1 }], bonus4: [{ op: 'mul', field: 'towerFireRateMult', value: 1.1 }] },
  caustic: { id: 'caustic', name: 'Caustic Foundry', bonus2: [{ op: 'mul', field: 'splashRadiusMult', value: 1.15 }], bonus4: [{ op: 'mul', field: 'poolDpsMult', value: 1.2 }] },
  lifebloom: { id: 'lifebloom', name: 'Lifebloom', bonus2: [{ op: 'mul', field: 'reactorBiomassMult', value: 1.15 }], bonus4: [{ op: 'add', field: 'reactorOverchargeBonus', value: 0.12 }] },
};

// ── Item definitions (the catalog) ───────────────────────────────────────────
export interface EquipDef {
  id: string;
  name: string;
  slot: EquipSlot;
  weaponType?: WeaponType;
  armorType?: ArmorType;
  setId?: string;
  /** Always-on base behavior (present even on a Common — never a pure stat). */
  base: CardEffect[];
  /** Design-intent behavior text (full effect; `base` is what the sim applies today). */
  desc: string;
  /** Named effect for legendary/exotic items (extra always-on effects). */
  signature?: { name: string; effects: CardEffect[] };
  exotic?: boolean;
  /** Limited-time line (future-proof for seasonal drops) — shows a ribbon + filter when set. */
  season?: string;
}

// WEAPONS (~50) — RE-AUTHOR THE ATTACK: cleave / chain / lifesteal / on-hit status / crit /
// nova / support-aura / ability, via the hero attack kit + behavioral verbs. No stat-sticks.
export const WEAPONS: EquipDef[] = [
  { id: 'w_quill', name: 'Quill Launcher', slot: 'weapon', weaponType: 'ranged', setId: 'apex', base: [{ op: 'add', field: 'needleExtraProjectiles', value: 1 }], desc: 'Towers fire an extra needle (soft AoE).' },
  { id: 'w_ricochet', name: 'Ricochet Stinger', slot: 'weapon', weaponType: 'ranged', setId: 'apex', base: [{ op: 'add', field: 'needleExtraProjectiles', value: 1 }, { op: 'mul', field: 'towerFireRateMult', value: 1.05 }], desc: 'Projectiles bounce; faster cadence.' },
  { id: 'w_marrow', name: 'Marrow Claws', slot: 'weapon', weaponType: 'melee', setId: 'apex', base: [{ op: 'add', field: 'fractureBonusStacks', value: 1 }], desc: 'Cleaving attacks Fracture all struck.' },
  { id: 'w_splinter', name: 'Splinterfist', slot: 'weapon', weaponType: 'melee', setId: 'apex', base: [{ op: 'mul', field: 'heroDamageMult', value: 1.12 }], desc: 'Crits shatter into shrapnel.' },
  { id: 'w_scatter', name: 'Scattergut', slot: 'weapon', weaponType: 'ranged', setId: 'caustic', base: [{ op: 'mul', field: 'splashRadiusMult', value: 1.2 }], desc: 'Close cone blast — point-blank shredder.' },
  { id: 'w_bile', name: 'Bile Sprayer', slot: 'weapon', weaponType: 'conduit', setId: 'caustic', base: [{ op: 'mul', field: 'poolDpsMult', value: 1.15 }], desc: 'Acid cone leaves a Corrosion pool.' },
  { id: 'w_lobber', name: 'Marrowbomb Lobber', slot: 'weapon', weaponType: 'conduit', setId: 'caustic', base: [{ op: 'mul', field: 'splashRadiusMult', value: 1.15 }, { op: 'mul', field: 'mortarPoolDurationMult', value: 1.2 }], desc: 'Lobs AoE acid grenades.' },
  { id: 'w_lash', name: 'Corrosive Lash', slot: 'weapon', weaponType: 'melee', setId: 'caustic', base: [{ op: 'flag', field: 'mortarAppliesFracture' }], desc: 'Builds Corrosion; bursts — enables Shred on the Mortar.' },
  { id: 'w_synapse', name: 'Synapse Lance', slot: 'weapon', weaponType: 'conduit', base: [{ op: 'add', field: 'fractureBonusStacks', value: 2 }], desc: 'Applies Vulnerability; chains on vulnerable.' },
  { id: 'w_static', name: 'Static Conduit', slot: 'weapon', weaponType: 'conduit', base: [{ op: 'mul', field: 'towerFireRateMult', value: 1.12 }], desc: 'A ramping beam that slows while held.' },
  { id: 'w_lifegraft', name: 'Lifegraft Censer', slot: 'weapon', weaponType: 'conduit', setId: 'lifebloom', base: [{ op: 'mul', field: 'reactorBiomassMult', value: 1.2 }], desc: 'Heals towers; scales with hive HP.' },
  { id: 'w_harvest', name: 'Harvest Sickle', slot: 'weapon', weaponType: 'melee', setId: 'lifebloom', base: [{ op: 'mul', field: 'biomassMult', value: 1.15 }], desc: 'Kills yield bonus biomass.' },
  { id: 'w_coil', name: 'Coilgun Carbine', slot: 'weapon', weaponType: 'ranged', base: [{ op: 'mul', field: 'towerDamageMult', value: 1.1 }], desc: 'Charged shots pierce a full line.' },
  { id: 'w_harpoon', name: 'Harpoon Gland', slot: 'weapon', weaponType: 'ranged', base: [{ op: 'mul', field: 'heroDamageMult', value: 1.1 }, { op: 'mul', field: 'heroCooldownMult', value: 0.92 }], desc: 'Reels big targets toward the hero.' },
  { id: 'w_garrote', name: 'Tendon Garrote', slot: 'weapon', weaponType: 'melee', base: [{ op: 'mul', field: 'heroDamageMult', value: 1.15 }], desc: 'Bleed detonates on the killing blow.' },
  { id: 'w_ovipositor', name: 'Brood Ovipositor', slot: 'weapon', weaponType: 'ranged', base: [{ op: 'mul', field: 'biomassMult', value: 1.1 }], desc: 'Implants parasites; host death spawns a Crawler.' },
  { id: 'w_totem', name: 'Totem Driver', slot: 'weapon', weaponType: 'conduit', base: [{ op: 'mul', field: 'towerDamageMult', value: 1.08 }], desc: 'Plants temporary auto-firing turret-totems.' },
  { id: 'w_paradox', name: 'Paradox Edge', slot: 'weapon', weaponType: 'melee', exotic: true, base: [{ op: 'mul', field: 'heroCooldownMult', value: 0.8 }], desc: 'Every Nth attack repeats your last ability free.', signature: { name: 'Echo', effects: [{ op: 'mul', field: 'heroDamageMult', value: 1.1 }] } },
  { id: 'w_hunger', name: 'The Hunger', slot: 'weapon', weaponType: 'melee', exotic: true, base: [{ op: 'mul', field: 'heroDamageMult', value: 1.2 }], desc: 'Weapon damage grows per kill (curve-capped, resets each run).', signature: { name: 'Devour', effects: [{ op: 'mul', field: 'biomassMult', value: 1.1 }] } },
  { id: 'w_null', name: 'Null Scalpel', slot: 'weapon', weaponType: 'ranged', exotic: true, base: [{ op: 'mul', field: 'towerDamageMult', value: 1.18 }], desc: 'Ignores all armor/shields — but applies NO status (anti-reaction trade-off).' },

  // ── Expansion: every weapon RE-AUTHORS the attack via the hero attack kit / lifesteal /
  //    on-hit status / crit (EQUIPMENT.md archetypes). No pure stat-sticks. ──
  // CLEAVE — the hero's hit damages an arc around the target (Frontline / Reaver).
  { id: 'w_reaver', name: 'Reaver Arc', slot: 'weapon', weaponType: 'melee', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'aura', radius: 72, damage: 8 } } }], desc: 'Hits cleave a wide arc around the target.' },
  { id: 'w_sweep', name: 'Sweeping Mandible', slot: 'weapon', weaponType: 'melee', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'aura', radius: 96, damage: 6 } } }, { op: 'grant', grant: { kind: 'heroAttackStatus', status: 'Fracture', amount: 1 } }], desc: 'A huge sweep that Fractures all it cleaves.' },
  { id: 'w_whirl', name: 'Whirlwind Spur', slot: 'weapon', weaponType: 'melee', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'aura', radius: 64, damage: 6 } } }, { op: 'mul', field: 'heroSpeedMult', value: 1.15 }], desc: 'Spin through the swarm — cleave while you move.' },
  { id: 'w_bonereaver', name: 'Bone Reaver', slot: 'weapon', weaponType: 'melee', setId: 'apex', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'aura', radius: 80, damage: 11 } } }, { op: 'grant', grant: { kind: 'heroAttackStatus', status: 'Fracture', amount: 1 } }], desc: 'Heavy cleave that shears armor off the pack.' },
  { id: 'w_acidcleave', name: 'Acid Cleaver', slot: 'weapon', weaponType: 'melee', setId: 'caustic', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'aura', radius: 70, damage: 6, status: { kind: 'Corrosion', amount: 2 }, react: true } } }], desc: 'Cleaves leave Corrosion across the arc.' },
  // CHAIN — the hit arcs to nearby enemies (Conduit / Skirmisher).
  { id: 'w_arc', name: 'Arc Tether', slot: 'weapon', weaponType: 'conduit', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'chain', jumps: 3, range: 110, damage: 10, falloff: 0.7 } } }], desc: 'Hits arc to three nearby foes.' },
  { id: 'w_fork', name: 'Forked Stinger', slot: 'weapon', weaponType: 'conduit', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'chain', jumps: 4, range: 130, damage: 8, falloff: 0.75 } } }], desc: 'Lightning forks across the whole line.' },
  { id: 'w_synweb', name: 'Synapse Web', slot: 'weapon', weaponType: 'conduit', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'chain', jumps: 2, range: 100, damage: 6 } } }, { op: 'grant', grant: { kind: 'heroAttackStatus', status: 'Disruption', amount: 1.5 } }], desc: 'Chains that Disrupt — slow + amplify.' },
  { id: 'w_thunderchain', name: 'Thunderchain', slot: 'weapon', weaponType: 'conduit', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'chain', jumps: 5, range: 150, damage: 9, falloff: 0.8 } } }], desc: 'A storm that leaps endlessly through the swarm.', signature: { name: 'Storm Surge', effects: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'chain', jumps: 2, range: 150, damage: 9, falloff: 0.8 } } }] } },
  { id: 'w_disruptarc', name: 'Hijack Coil', slot: 'weapon', weaponType: 'conduit', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'chain', jumps: 3, range: 120, damage: 5 } } }, { op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.1 }], desc: 'Control conduit — chains soften every target for your towers.' },
  // LIFESTEAL — sustain through attacking (Bruiser / Berserker).
  { id: 'w_sanguine', name: 'Sanguine Fang', slot: 'weapon', weaponType: 'melee', base: [{ op: 'add', field: 'heroLifestealFrac', value: 0.15 }], desc: 'Drinks a share of all damage you deal.' },
  { id: 'w_gluttony', name: 'Gluttony Maw', slot: 'weapon', weaponType: 'melee', base: [{ op: 'add', field: 'heroLifestealFrac', value: 0.1 }, { op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'heal', self: 3 } } }], desc: 'Feeds on every hit — leech and gorge.' },
  { id: 'w_vampcleave', name: 'Crimson Glaive', slot: 'weapon', weaponType: 'melee', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'aura', radius: 70, damage: 7 } } }, { op: 'add', field: 'heroLifestealFrac', value: 0.1 }], desc: 'Vampiric cleave — bleed the pack, heal yourself.' },
  { id: 'w_siphon', name: 'Siphon Lash', slot: 'weapon', weaponType: 'conduit', base: [{ op: 'add', field: 'heroLifestealFrac', value: 0.2 }, { op: 'mul', field: 'heroMaxHpMult', value: 1.1 }], desc: 'A draining tether — the longer you fight, the tankier you get.' },
  // STATUS — on-hit afflictions (Plaguebearer / Controller).
  { id: 'w_spore', name: 'Spore Caster', slot: 'weapon', weaponType: 'conduit', base: [{ op: 'grant', grant: { kind: 'heroAttackStatus', status: 'Infection', amount: 2 } }], desc: 'Every hit seeds ramping Infection.' },
  { id: 'w_plaguebloom', name: 'Plaguebloom Censer', slot: 'weapon', weaponType: 'conduit', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'debuff', radius: 80, status: { kind: 'Infection', amount: 1 } } } }, { op: 'grant', grant: { kind: 'heroAttackStatus', status: 'Infection', amount: 1 } }], desc: 'Hits bloom an Infection cloud around the target.' },
  { id: 'w_venomlance', name: 'Venom Lance', slot: 'weapon', weaponType: 'ranged', setId: 'caustic', base: [{ op: 'grant', grant: { kind: 'heroAttackStatus', status: 'Corrosion', amount: 3 } }], desc: 'Drips deep Corrosion on every strike.' },
  { id: 'w_mindspike', name: 'Mind Spike', slot: 'weapon', weaponType: 'conduit', base: [{ op: 'grant', grant: { kind: 'heroAttackStatus', status: 'Disruption', amount: 2 } }], desc: 'Hits Disrupt — slow them, amplify all your damage.' },
  { id: 'w_swarmcaller', name: "Swarm-Caller's Horn", slot: 'weapon', weaponType: 'conduit', setId: 'lifebloom', base: [{ op: 'grant', grant: { kind: 'heroAttackStatus', status: 'Infection', amount: 2 } }, { op: 'mul', field: 'biomassMult', value: 1.1 }], desc: 'The plague pays — infected deaths feed the hive.' },
  // CRIT / BURST — spike damage on a roll (Assassin / Marksman).
  { id: 'w_drill', name: 'Fracture Drill', slot: 'weapon', weaponType: 'ranged', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'crit', chance: 0.25, mult: 2, damage: 12 } } }], desc: 'Crits drill deep into a single target.' },
  { id: 'w_deadeye', name: 'Deadeye Needler', slot: 'weapon', weaponType: 'ranged', setId: 'apex', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'crit', chance: 0.3, mult: 2, damage: 9 } } }, { op: 'add', field: 'needleExtraProjectiles', value: 1 }], desc: 'Marksman precision — crit + an extra needle.' },
  { id: 'w_execbolt', name: 'Execution Bolt', slot: 'weapon', weaponType: 'ranged', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'crit', chance: 0.2, mult: 2.5, damage: 12 } } }, { op: 'add', field: 'executeThreshold', value: 0.08 }], desc: 'Crits finish the wounded outright.' },
  { id: 'w_phaseblade', name: 'Phase Blade', slot: 'weapon', weaponType: 'melee', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'crit', chance: 0.35, mult: 2.2, damage: 10 } } }, { op: 'mul', field: 'heroSpeedMult', value: 1.18 }], desc: 'Blink-fast assassin — crit and reposition.' },
  // NOVA / AOE — the hit detonates (Artillery / Demolisher).
  { id: 'w_shrapnel', name: 'Shrapnel Burster', slot: 'weapon', weaponType: 'ranged', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'explosion', radius: 82, damage: 13, react: true } } }], desc: 'Hits burst into a shrapnel nova.' },
  { id: 'w_causticlet', name: 'Caustic Bomblet', slot: 'weapon', weaponType: 'ranged', setId: 'caustic', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'explosion', radius: 72, damage: 9, status: { kind: 'Corrosion', amount: 2 }, react: true } } }], desc: 'Acid bomblets that pool and spread.' },
  { id: 'w_concussion', name: 'Concussion Maul', slot: 'weapon', weaponType: 'melee', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'explosion', radius: 90, damage: 11, status: { kind: 'Disruption', amount: 1.5 } } } }], desc: 'Each blow shockwaves — damage + Disruption.' },
  { id: 'w_vampnova', name: 'Hemorrhage Coil', slot: 'weapon', weaponType: 'conduit', base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'explosion', radius: 76, damage: 10 } } }, { op: 'add', field: 'heroLifestealFrac', value: 0.08 }], desc: 'Bursts that bleed the swarm and heal you.' },
  // SUPPORT — the hero projects a tower aura (Conduit support).
  { id: 'w_resonance', name: 'Resonance Staff', slot: 'weapon', weaponType: 'conduit', setId: 'lifebloom', base: [{ op: 'add', field: 'heroAuraRadius', value: 150 }, { op: 'add', field: 'heroTowerHasteAura', value: 0.18 }], desc: 'Towers near the hero fire faster — a roaming overcharge.' },
  { id: 'w_empower', name: 'Empowerment Rod', slot: 'weapon', weaponType: 'conduit', base: [{ op: 'add', field: 'heroAuraRadius', value: 140 }, { op: 'add', field: 'heroTowerDamageAura', value: 0.18 }], desc: 'Towers near the hero hit harder.' },
  // ABILITY — built around the signature ability (Caster).
  { id: 'w_echo', name: 'Echo Brand', slot: 'weapon', weaponType: 'melee', base: [{ op: 'mul', field: 'heroCooldownMult', value: 0.85 }, { op: 'mul', field: 'heroAbilityRadiusMult', value: 1.2 }], desc: 'Wider, faster signature abilities.' },
  { id: 'w_overload', name: 'Overload Prism', slot: 'weapon', weaponType: 'conduit', exotic: true, base: [{ op: 'mul', field: 'heroAbilityRadiusMult', value: 1.45 }, { op: 'mul', field: 'heroCooldownMult', value: 0.85 }], desc: 'Your ability becomes a screen-wide nuke.', signature: { name: 'Cataclysm', effects: [{ op: 'mul', field: 'heroDamageMult', value: 1.12 }] } },
  // EXOTIC — rule-bending attacks.
  { id: 'w_reaperscythe', name: "Reaper's Scythe", slot: 'weapon', weaponType: 'melee', exotic: true, base: [{ op: 'grant', grant: { kind: 'heroAttackAbility', component: { type: 'aura', radius: 84, damage: 10 } } }, { op: 'add', field: 'heroLifestealFrac', value: 0.12 }, { op: 'add', field: 'executeThreshold', value: 0.1 }], desc: 'Reap the wounded, heal on the harvest.', signature: { name: 'Soul Harvest', effects: [{ op: 'mul', field: 'biomassMult', value: 1.12 }] } },
  { id: 'w_voidlance', name: 'Void Lance', slot: 'weapon', weaponType: 'ranged', exotic: true, base: [{ op: 'grant', grant: { kind: 'towerProjectileMutator', id: 'pierce1' } }, { op: 'grant', grant: { kind: 'heroAttackStatus', status: 'Disruption', amount: 2 } }], desc: 'Hits pierce reality — and every tower shot pierces too.', signature: { name: 'Rift', effects: [{ op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.12 }] } },
];

// ARMOR (~55) — AUTHOR THE HERO'S AI / STANCE / MOBILITY / SUPPORT: where it holds (anchor),
// how fast it moves, what it reflects (thorns), and the tower aura it projects.
export const ARMOR: EquipDef[] = [
  { id: 'a_chitin', name: 'Chitin Plating', slot: 'armor', armorType: 'carapace', setId: 'apex', base: [{ op: 'mul', field: 'heroMaxHpMult', value: 1.2 }], desc: 'On lethal damage, become invulnerable 2s (once/wave).' },
  { id: 'a_regen', name: 'Regenerative Hide', slot: 'armor', armorType: 'hide', setId: 'lifebloom', base: [{ op: 'mul', field: 'heroMaxHpMult', value: 1.1 }, { op: 'mul', field: 'reactorBiomassMult', value: 1.1 }], desc: 'Regen out of combat; doubled near a Flesh Reactor.' },
  { id: 'a_spineback', name: 'Spineback Carapace', slot: 'armor', armorType: 'carapace', setId: 'apex', base: [{ op: 'add', field: 'fractureBonusStacks', value: 1 }], desc: 'Reflects melee damage back as Fracture.' },
  { id: 'a_acidgland', name: 'Acid Gland Vest', slot: 'armor', armorType: 'carapace', setId: 'caustic', base: [{ op: 'mul', field: 'poolDpsMult', value: 1.12 }], desc: 'Attackers gain Corrosion (acid thorns).' },
  { id: 'a_neural', name: 'Neural Lace Weave', slot: 'armor', armorType: 'weave', base: [{ op: 'add', field: 'fractureBonusStacks', value: 1 }], desc: 'Aura: enemies near the hero gain Vulnerability.' },
  { id: 'a_bloom', name: 'Bloom Cloak', slot: 'armor', armorType: 'weave', setId: 'lifebloom', base: [{ op: 'mul', field: 'reactorBiomassMult', value: 1.15 }], desc: 'Aura: heals towers in radius.' },
  { id: 'a_overcharge', name: 'Overcharge Harness', slot: 'armor', armorType: 'weave', setId: 'lifebloom', base: [{ op: 'add', field: 'reactorOverchargeBonus', value: 0.12 }], desc: 'Aura: +attack speed to towers in radius.' },
  { id: 'a_bulwark', name: 'Bulwark Ribcage', slot: 'armor', armorType: 'carapace', base: [{ op: 'mul', field: 'integrityMult', value: 1.12 }], desc: 'Stacking armor while standing still (zoner).' },
  { id: 'a_adrenal', name: 'Adrenal Sacs', slot: 'armor', armorType: 'hide', base: [{ op: 'mul', field: 'heroDamageMult', value: 1.12 }], desc: 'Below 30% HP: +attack speed + lifesteal.' },
  { id: 'a_mirror', name: 'Mirror Cyst', slot: 'armor', armorType: 'hide', base: [{ op: 'mul', field: 'heroMaxHpMult', value: 1.12 }], desc: 'First hit each wave is fully negated.' },
  { id: 'a_hardened', name: 'Hardened Marrow', slot: 'armor', armorType: 'carapace', base: [{ op: 'mul', field: 'integrityMult', value: 1.08 }, { op: 'mul', field: 'heroMaxHpMult', value: 1.06 }], desc: 'Immune to slow/stun/knockback.' },
  { id: 'a_toxin', name: 'Toxin Filter', slot: 'armor', armorType: 'hide', setId: 'caustic', base: [{ op: 'add', field: 'corrosionSlowBonus', value: 0.06 }], desc: 'Immune to DoT; converts incoming DoT to healing.' },
  { id: 'a_predator', name: 'Predator Hide', slot: 'armor', armorType: 'hide', base: [{ op: 'mul', field: 'heroDamageMult', value: 1.2 }, { op: 'mul', field: 'heroMaxHpMult', value: 0.85 }], desc: '+damage, −max HP (glass-cannon enabler).' },
  { id: 'a_sentinel', name: 'Sentinel Shell', slot: 'armor', armorType: 'carapace', base: [{ op: 'mul', field: 'heroMaxHpMult', value: 1.18 }], desc: 'Taunts nearby enemies off your towers.' },
  { id: 'a_veindrinker', name: 'Veindrinker Mail', slot: 'armor', armorType: 'weave', base: [{ op: 'mul', field: 'heroDamageMult', value: 1.08 }, { op: 'mul', field: 'biomassMult', value: 1.06 }], desc: 'Aura: hero + allies lifesteal on hit.' },
  { id: 'a_static', name: 'Static Field Vest', slot: 'armor', armorType: 'weave', base: [{ op: 'add', field: 'corrosionSlowBonus', value: 0.05 }], desc: 'Aura: enemies that hit the hero are slowed.' },
  { id: 'a_reservoir', name: 'Biomass Reservoir', slot: 'armor', armorType: 'carapace', setId: 'lifebloom', base: [{ op: 'add', field: 'startBiomassBonus', value: 80 }], desc: 'Stores overflow biomass; releases a heal/shield burst.' },
  { id: 'a_reactive', name: 'Reactive Spines', slot: 'armor', armorType: 'carapace', base: [{ op: 'add', field: 'fractureBonusStacks', value: 1 }, { op: 'mul', field: 'integrityMult', value: 1.05 }], desc: 'A big hit triggers a Fracture nova.' },
  { id: 'a_aegis', name: 'Aegis Cortex', slot: 'armor', armorType: 'weave', exotic: true, base: [{ op: 'mul', field: 'integrityMult', value: 1.25 }], desc: 'Overhealing becomes an uncapped shield.', signature: { name: 'Bastion', effects: [{ op: 'mul', field: 'heroMaxHpMult', value: 1.15 }] } },
  { id: 'a_secondheart', name: 'Second Heart', slot: 'armor', armorType: 'carapace', exotic: true, base: [{ op: 'mul', field: 'heroMaxHpMult', value: 1.3 }], desc: 'Revive once per run at full HP.', signature: { name: 'Rebirth', effects: [{ op: 'mul', field: 'integrityMult', value: 1.1 }] } },

  // ── Expansion: every armor authors the hero's AI / STANCE / mobility / support behavior
  //    (where it holds, how fast it moves, what it reflects, what aura it projects). Stats are
  //    garnish only. ──
  // GUARDIAN (carapace) — hold a position, body-block, punish attackers (thorns + anchor).
  { id: 'a_aegisward', name: 'Aegis Ward', slot: 'armor', armorType: 'carapace', base: [{ op: 'add', field: 'heroThornsFrac', value: 0.4 }, { op: 'set', field: 'heroAnchor', value: 'line' }], desc: 'Holds the line; reflects contact damage back at attackers.' },
  { id: 'a_corestance', name: 'Core Stance Plate', slot: 'armor', armorType: 'carapace', base: [{ op: 'set', field: 'heroAnchor', value: 'nucleus' }, { op: 'add', field: 'heroThornsFrac', value: 0.25 }, { op: 'mul', field: 'integrityMult', value: 1.08 }], desc: 'Body-blocks the core — anchors on the Nucleus and thorns the swarm.' },
  { id: 'a_spinewall', name: 'Spinewall Carapace', slot: 'armor', armorType: 'carapace', setId: 'apex', base: [{ op: 'add', field: 'heroThornsFrac', value: 0.5 }, { op: 'mul', field: 'heroMaxHpMult', value: 1.12 }], desc: 'A wall of spines — the more it is hit, the more it hurts.' },
  { id: 'a_thornmantle', name: 'Thorn Mantle', slot: 'armor', armorType: 'carapace', base: [{ op: 'add', field: 'heroThornsFrac', value: 0.45 }], desc: 'Pure retaliation — attackers shred themselves on you.' },
  { id: 'a_anchorplate', name: 'Anchor Plate', slot: 'armor', armorType: 'carapace', base: [{ op: 'set', field: 'heroAnchor', value: 'line' }, { op: 'add', field: 'heroThornsFrac', value: 0.2 }, { op: 'add', field: 'heroAuraRadius', value: 100 }, { op: 'add', field: 'heroTowerHasteAura', value: 0.08 }], desc: 'A frontline standard — hold the line and haste the towers behind it.' },
  { id: 'a_bastionshell', name: 'Bastion Shell', slot: 'armor', armorType: 'carapace', exotic: true, base: [{ op: 'set', field: 'heroAnchor', value: 'nucleus' }, { op: 'add', field: 'heroThornsFrac', value: 0.5 }, { op: 'mul', field: 'heroMaxHpMult', value: 1.2 }], desc: 'The last wall — an immovable guardian of the core.', signature: { name: 'Unbreakable', effects: [{ op: 'add', field: 'heroThornsFrac', value: 0.25 }] } },
  // SKIRMISHER (hide) — fast, evasive, hunts wide, disengages when hurt.
  { id: 'a_swiftstep', name: 'Swiftstep Hide', slot: 'armor', armorType: 'hide', base: [{ op: 'mul', field: 'heroSpeedMult', value: 1.25 }], desc: 'Darts across the field — never where the swarm expects.' },
  { id: 'a_evasivehide', name: 'Evasive Hide', slot: 'armor', armorType: 'hide', base: [{ op: 'mul', field: 'heroSpeedMult', value: 1.15 }, { op: 'add', field: 'heroRetreatThreshold', value: 0.4 }], desc: 'Kites and disengages — bails for the core when wounded.' },
  { id: 'a_flankcloak', name: 'Flanker Cloak', slot: 'armor', armorType: 'hide', base: [{ op: 'mul', field: 'heroSpeedMult', value: 1.2 }, { op: 'mul', field: 'heroAggroRangeMult', value: 1.4 }], desc: 'Hunts wide and strikes the flanks fast.' },
  { id: 'a_phantommesh', name: 'Phantom Mesh', slot: 'armor', armorType: 'hide', base: [{ op: 'mul', field: 'heroSpeedMult', value: 1.3 }, { op: 'mul', field: 'heroMaxHpMult', value: 0.9 }], desc: 'Blink-fast, paper-thin — speed is the only defense.' },
  { id: 'a_stalkerhide', name: 'Stalker Hide', slot: 'armor', armorType: 'hide', base: [{ op: 'mul', field: 'heroSpeedMult', value: 1.2 }, { op: 'add', field: 'heroLifestealFrac', value: 0.08 }], desc: 'Hit-and-run predator — strike, leech, vanish.' },
  { id: 'a_wraithshroud', name: 'Wraith Shroud', slot: 'armor', armorType: 'hide', exotic: true, base: [{ op: 'mul', field: 'heroSpeedMult', value: 1.35 }, { op: 'mul', field: 'heroAggroRangeMult', value: 1.5 }, { op: 'mul', field: 'heroMaxHpMult', value: 0.85 }], desc: 'A hunting ghost — everywhere at once, impossible to pin.', signature: { name: 'Untouchable', effects: [{ op: 'add', field: 'heroRetreatThreshold', value: 0.3 }] } },
  // SUPPORT (weave) — anchor among towers and project an aura that empowers them.
  { id: 'a_resonweave', name: 'Resonant Weave', slot: 'armor', armorType: 'weave', setId: 'lifebloom', base: [{ op: 'set', field: 'heroAnchor', value: 'towers' }, { op: 'add', field: 'heroAuraRadius', value: 150 }, { op: 'add', field: 'heroTowerHasteAura', value: 0.2 }], desc: 'Anchors in the tower cluster — a roaming overcharge of fire rate.' },
  { id: 'a_empowerveil', name: 'Empowerment Veil', slot: 'armor', armorType: 'weave', base: [{ op: 'set', field: 'heroAnchor', value: 'towers' }, { op: 'add', field: 'heroAuraRadius', value: 150 }, { op: 'add', field: 'heroTowerDamageAura', value: 0.2 }], desc: 'Stands among the towers and lends them its strength.' },
  { id: 'a_conduitcloak', name: 'Conduit Cloak', slot: 'armor', armorType: 'weave', base: [{ op: 'add', field: 'heroAuraRadius', value: 130 }, { op: 'add', field: 'heroTowerHasteAura', value: 0.1 }, { op: 'add', field: 'heroTowerDamageAura', value: 0.1 }], desc: 'A balanced support field — haste and power both.' },
  { id: 'a_overweave', name: 'Overcharge Weave', slot: 'armor', armorType: 'weave', setId: 'lifebloom', base: [{ op: 'add', field: 'heroAuraRadius', value: 140 }, { op: 'add', field: 'heroTowerHasteAura', value: 0.15 }, { op: 'add', field: 'reactorOverchargeBonus', value: 0.1 }], desc: 'Turns the hero into a second reactor.' },
  { id: 'a_grovekeeper', name: "Grovekeeper's Mantle", slot: 'armor', armorType: 'weave', setId: 'lifebloom', base: [{ op: 'set', field: 'heroAnchor', value: 'towers' }, { op: 'add', field: 'heroAuraRadius', value: 150 }, { op: 'add', field: 'heroTowerHasteAura', value: 0.12 }, { op: 'mul', field: 'reactorBiomassMult', value: 1.1 }], desc: 'Tends the garden — haste, and richer biomass.' },
  { id: 'a_choirmantle', name: 'Choir Mantle', slot: 'armor', armorType: 'weave', exotic: true, base: [{ op: 'set', field: 'heroAnchor', value: 'towers' }, { op: 'add', field: 'heroAuraRadius', value: 170 }, { op: 'add', field: 'heroTowerDamageAura', value: 0.18 }, { op: 'add', field: 'heroTowerHasteAura', value: 0.12 }], desc: 'A conductor of the whole battery.', signature: { name: 'Crescendo', effects: [{ op: 'add', field: 'heroAuraRadius', value: 40 }] } },
  // BRUISER / BERSERKER — sustain and aggression woven together.
  { id: 'a_bloodplate', name: 'Bloodletter Plate', slot: 'armor', armorType: 'carapace', base: [{ op: 'add', field: 'heroLifestealFrac', value: 0.1 }, { op: 'mul', field: 'heroMaxHpMult', value: 1.12 }], desc: 'Sustains through the grind — heal as you carve.' },
  { id: 'a_juggernaut', name: 'Juggernaut Carapace', slot: 'armor', armorType: 'carapace', base: [{ op: 'add', field: 'heroLifestealFrac', value: 0.08 }, { op: 'add', field: 'heroThornsFrac', value: 0.2 }, { op: 'mul', field: 'heroMaxHpMult', value: 1.12 }], desc: 'Wade in and stay in — thorns, leech, bulk.' },
  { id: 'a_ragehide', name: 'Rage Hide', slot: 'armor', armorType: 'hide', base: [{ op: 'mul', field: 'heroSpeedMult', value: 1.15 }, { op: 'add', field: 'heroLifestealFrac', value: 0.1 }], desc: 'A fast vampire — chase, drink, repeat.' },
  { id: 'a_frenzyplate', name: 'Frenzy Plate', slot: 'armor', armorType: 'hide', base: [{ op: 'mul', field: 'heroSpeedMult', value: 1.2 }, { op: 'add', field: 'heroThornsFrac', value: 0.3 }], desc: 'A whirling, spiked storm of a hero.' },
  { id: 'a_revenantmail', name: 'Revenant Mail', slot: 'armor', armorType: 'hide', base: [{ op: 'add', field: 'heroLifestealFrac', value: 0.12 }, { op: 'add', field: 'heroRetreatThreshold', value: 0.25 }], desc: 'Bleeds the swarm, then slips away to recover.' },
  // HYBRID — mobile support, frontline support, etc.
  { id: 'a_courierweave', name: 'Courier Weave', slot: 'armor', armorType: 'weave', base: [{ op: 'mul', field: 'heroSpeedMult', value: 1.15 }, { op: 'add', field: 'heroAuraRadius', value: 120 }, { op: 'add', field: 'heroTowerHasteAura', value: 0.1 }], desc: 'A roving buff-runner — carries haste wherever it goes.' },
  { id: 'a_zealotweave', name: 'Zealot Weave', slot: 'armor', armorType: 'weave', base: [{ op: 'add', field: 'heroAuraRadius', value: 120 }, { op: 'add', field: 'heroTowerDamageAura', value: 0.15 }, { op: 'mul', field: 'heroSpeedMult', value: 1.08 }], desc: 'Leads from the front, empowering nearby fire.' },
  { id: 'a_vipermesh', name: 'Viper Mesh', slot: 'armor', armorType: 'hide', base: [{ op: 'mul', field: 'heroSpeedMult', value: 1.22 }, { op: 'mul', field: 'heroAggroRangeMult', value: 1.3 }, { op: 'add', field: 'heroLifestealFrac', value: 0.06 }], desc: 'A wide-ranging striker that never stops moving.' },
  { id: 'a_guardianaura', name: 'Guardian Aura Shell', slot: 'armor', armorType: 'carapace', base: [{ op: 'set', field: 'heroAnchor', value: 'line' }, { op: 'add', field: 'heroAuraRadius', value: 130 }, { op: 'add', field: 'heroTowerHasteAura', value: 0.1 }, { op: 'mul', field: 'integrityMult', value: 1.06 }], desc: 'Holds the line as a haste totem for the battery.' },
  { id: 'a_tempesthide', name: 'Tempest Hide', slot: 'armor', armorType: 'hide', base: [{ op: 'mul', field: 'heroSpeedMult', value: 1.28 }, { op: 'add', field: 'heroThornsFrac', value: 0.1 }], desc: 'A whirling storm — fast and bristling.' },
  { id: 'a_quicksilver', name: 'Quicksilver Hide', slot: 'armor', armorType: 'hide', base: [{ op: 'mul', field: 'heroSpeedMult', value: 1.3 }, { op: 'add', field: 'heroRetreatThreshold', value: 0.35 }], desc: 'Untouchable — slips every encirclement.' },
  { id: 'a_pouncerhide', name: 'Pouncer Hide', slot: 'armor', armorType: 'hide', base: [{ op: 'mul', field: 'heroSpeedMult', value: 1.22 }, { op: 'mul', field: 'heroAggroRangeMult', value: 1.5 }], desc: 'Ranges far and pounces on the deepest threat.' },
  { id: 'a_ironveil', name: 'Iron Veil', slot: 'armor', armorType: 'carapace', base: [{ op: 'set', field: 'heroAnchor', value: 'line' }, { op: 'add', field: 'heroThornsFrac', value: 0.3 }, { op: 'mul', field: 'heroMaxHpMult', value: 1.1 }], desc: 'An iron line-holder that punishes every blow.' },
  { id: 'a_bloodguard', name: 'Bloodguard Carapace', slot: 'armor', armorType: 'carapace', base: [{ op: 'add', field: 'heroLifestealFrac', value: 0.12 }, { op: 'add', field: 'heroThornsFrac', value: 0.25 }], desc: 'A sustaining wall — leech and retaliate.' },
  { id: 'a_warpriest', name: 'War-Priest Weave', slot: 'armor', armorType: 'weave', base: [{ op: 'add', field: 'heroAuraRadius', value: 140 }, { op: 'add', field: 'heroTowerDamageAura', value: 0.12 }, { op: 'add', field: 'heroLifestealFrac', value: 0.05 }], desc: 'Fights and empowers at once — a battle-chaplain.' },
  { id: 'a_beaconweave', name: 'Beacon Weave', slot: 'armor', armorType: 'weave', setId: 'lifebloom', base: [{ op: 'set', field: 'heroAnchor', value: 'towers' }, { op: 'add', field: 'heroAuraRadius', value: 160 }, { op: 'add', field: 'heroTowerHasteAura', value: 0.1 }, { op: 'add', field: 'heroTowerDamageAura', value: 0.08 }], desc: 'A beacon in the battery — haste and power for all nearby fire.' },
  { id: 'a_communionplate', name: 'Communion Plate', slot: 'armor', armorType: 'carapace', base: [{ op: 'set', field: 'heroAnchor', value: 'nucleus' }, { op: 'add', field: 'heroAuraRadius', value: 120 }, { op: 'add', field: 'heroTowerHasteAura', value: 0.1 }, { op: 'mul', field: 'integrityMult', value: 1.06 }], desc: 'Guards the core and empowers the towers that ring it.' },
];

// RELICS (~52) — BEND A RULE via run-event hooks (deaths spread plague / kills & abilities &
// waves fund or heal the hive / shields) and keystone fields. The most build-defining slot.
export const RELICS: EquipDef[] = [
  { id: 'r_hivemind', name: 'Hivemind Catalyst', slot: 'relic', base: [{ op: 'add', field: 'fractureBonusStacks', value: 2 }, { op: 'add', field: 'reactionRepeats', value: 1 }, { op: 'mul', field: 'enemyHpRunMult', value: 1.1 }], desc: '+Reactions trigger twice. −Enemies +10% HP.' },
  { id: 'r_glass', name: 'Glass Genome', slot: 'relic', base: [{ op: 'mul', field: 'towerDamageMult', value: 1.45 }, { op: 'mul', field: 'integrityMult', value: 0.6 }], desc: '+All damage way up. −Nucleus integrity slashed.' },
  { id: 'r_acidrain', name: 'Acid Rain', slot: 'relic', base: [{ op: 'mul', field: 'poolDpsMult', value: 1.25 }, { op: 'mul', field: 'mortarPoolDurationMult', value: 0.85 }], desc: '+Corrosion spreads on death. −Pools decay faster.' },
  { id: 'r_singularity', name: 'Biomass Singularity', slot: 'relic', base: [{ op: 'mul', field: 'biomassMult', value: 1.6 }, { op: 'mul', field: 'towerDamageMult', value: 0.92 }], desc: '+Biomass income way up. −Slightly weaker towers.' },
  { id: 'r_frenzy', name: 'Frenzy Engine', slot: 'relic', base: [{ op: 'mul', field: 'towerFireRateMult', value: 1.15 }], desc: '+Towers gain attack speed as a wave progresses.' },
  { id: 'r_famine', name: 'Famine Doctrine', slot: 'relic', base: [{ op: 'mul', field: 'towerDamageMult', value: 1.18 }, { op: 'add', field: 'damagePerEmptySlot', value: 0.04 }], desc: '+Towers deal more per EMPTY build slot (rewards minimalism).' },
  { id: 'r_swarm', name: 'Swarm Doctrine', slot: 'relic', base: [{ op: 'mul', field: 'towerFireRateMult', value: 1.08 }, { op: 'mul', field: 'towerDamageMult', value: 1.05 }, { op: 'add', field: 'damagePerTower', value: 0.03 }], desc: '+Damage per tower on the board (rewards going wide).' },
  { id: 'r_laststand', name: 'Last Stand Protocol', slot: 'relic', base: [{ op: 'mul', field: 'towerDamageMult', value: 1.1 }, { op: 'add', field: 'lastStandThreshold', value: 0.25 }, { op: 'mul', field: 'lastStandMult', value: 3 }], desc: '+When the Nucleus is <25%, all damage ×3.' },
  { id: 'r_cascade', name: 'Reaction Cascade', slot: 'relic', base: [{ op: 'add', field: 'fractureBonusStacks', value: 1 }, { op: 'mul', field: 'poolDpsMult', value: 1.1 }, { op: 'add', field: 'reactionRepeats', value: 1 }], desc: '+Reactions chain into other reactions.' },
  { id: 'r_longgame', name: 'The Long Game', slot: 'relic', base: [{ op: 'mul', field: 'poolDpsMult', value: 1.2 }, { op: 'mul', field: 'mortarPoolDurationMult', value: 1.2 }], desc: '+DoT/Infection ramps over time. −Burst −25%.' },
  { id: 'r_executioner', name: "Executioner's Mandate", slot: 'relic', base: [{ op: 'mul', field: 'towerDamageMult', value: 1.12 }, { op: 'add', field: 'executeThreshold', value: 0.15 }], desc: '+Instantly kill enemies <15% HP. −Elites/bosses immune & +HP.' },
  { id: 'r_hoarder', name: "Hoarder's Instinct", slot: 'relic', base: [{ op: 'add', field: 'startBiomassBonus', value: 200 }, { op: 'mul', field: 'biomassMult', value: 0.92 }], desc: '+Big starting biomass. −Lower income.' },
  { id: 'r_overclock', name: 'Overclock Core', slot: 'relic', base: [{ op: 'mul', field: 'heroCooldownMult', value: 0.78 }], desc: '+No ability cooldowns for the first 10s of each wave.' },
  { id: 'r_pacifist', name: 'Pacifist Paradox', slot: 'relic', base: [{ op: 'mul', field: 'towerDamageMult', value: 1.2 }], desc: '+Towers you DON\'T manually upgrade gain +50% (idle reward).' },
  { id: 'r_bloodprice', name: 'Blood Price', slot: 'relic', base: [{ op: 'add', field: 'startBiomassBonus', value: 120 }, { op: 'mul', field: 'integrityMult', value: 0.85 }], desc: '+Build with integrity instead of biomass (high-risk economy).' },
  { id: 'r_twinstrain', name: 'Twin Strain', slot: 'relic', base: [{ op: 'mul', field: 'biomassMult', value: 1.08 }], desc: '+Draft 2 cards per pick, keep 1 (better selection).' },
  { id: 'r_conductor', name: 'The Conductor', slot: 'relic', base: [{ op: 'add', field: 'fractureBonusStacks', value: 1 }, { op: 'mul', field: 'splashRadiusMult', value: 1.1 }], desc: '+Vulnerability also boosts reaction damage.' },
  { id: 'r_mirrorhive', name: 'Mirror Hive', slot: 'relic', base: [{ op: 'mul', field: 'reactorBiomassMult', value: 1.2 }], desc: '+At wave start, copy your strongest tower onto a slot.' },
  { id: 'r_quantum', name: 'Quantum Draft', slot: 'relic', exotic: true, base: [{ op: 'mul', field: 'biomassMult', value: 1.15 }], desc: 'Banished cards return UPGRADED.', signature: { name: 'Recursion', effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.08 }] } },
  { id: 'r_singularityseed', name: 'Singularity Seed', slot: 'relic', exotic: true, base: [{ op: 'mul', field: 'splashRadiusMult', value: 1.3 }], desc: 'Deep runs spawn a growing black hole that pulls & damages all.', signature: { name: 'Event Horizon', effects: [{ op: 'mul', field: 'poolDpsMult', value: 1.2 }] } },

  // ── Expansion: every relic BENDS A RULE via a run event hook or a keystone field —
  //    deaths spread plague, kills/abilities/waves fund or heal the hive, etc. No stat-sticks. ──
  // SPREAD — deaths propagate a status (turn kills into chain damage).
  { id: 'r_contagion', name: 'Contagion Engine', slot: 'relic', base: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'spreadStatus', status: 'Corrosion', amount: 2, radius: 80 } } }], desc: 'Every death sprays Corrosion onto its neighbours.' },
  { id: 'r_pandemic', name: 'Pandemic Vector', slot: 'relic', base: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'spreadStatus', status: 'Infection', amount: 1, radius: 90 } } }], desc: 'Deaths seed Infection — the plague never stops walking.' },
  { id: 'r_neuralcollapse', name: 'Neural Collapse', slot: 'relic', base: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'spreadStatus', status: 'Disruption', amount: 1.5, radius: 70 } } }], desc: 'A death-pulse Disrupts everything nearby.' },
  { id: 'r_chainreaction', name: 'Chain Reaction', slot: 'relic', base: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'spreadStatus', status: 'Fracture', amount: 1, radius: 80 } } }, { op: 'add', field: 'reactionRepeats', value: 1 }], desc: 'Deaths Fracture the pack and reactions re-fire.' },
  // ECONOMY — gameplay events fund the hive.
  { id: 'r_tithe', name: 'Tithe Collector', slot: 'relic', base: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'biomass', value: 3 } } }], desc: 'Every kill tithes a little biomass to the hive.' },
  { id: 'r_bloodharvest', name: 'Blood Harvest', slot: 'relic', base: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'biomass', value: 6 } } }, { op: 'mul', field: 'integrityMult', value: 0.9 }], desc: '+Rich kill income. −A frailer core (you bleed to earn).' },
  { id: 'r_jubilee', name: 'Jubilee Doctrine', slot: 'relic', base: [{ op: 'hook', hook: { on: 'waveCleared', action: { do: 'biomass', value: 260 } } }], desc: 'A surge of biomass each time a wave is held.' },
  { id: 'r_overflowcell', name: 'Overflow Cell', slot: 'relic', base: [{ op: 'hook', hook: { on: 'abilityCast', action: { do: 'biomass', value: 70 } } }], desc: 'Casting your ability vents surplus biomass.' },
  // REACTIVE DEFENSE — events heal the core or shield the hero.
  { id: 'r_phylactery', name: 'Phylactery', slot: 'relic', base: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'heal', value: 1 } } }], desc: 'Every death mends the core a little — lifesteal for the hive.' },
  { id: 'r_secondwind', name: 'Second Wind', slot: 'relic', base: [{ op: 'hook', hook: { on: 'waveCleared', action: { do: 'heal', value: 60 } } }], desc: 'Holding a wave restores a chunk of Integrity.' },
  { id: 'r_wardstone', name: 'Wardstone', slot: 'relic', base: [{ op: 'hook', hook: { on: 'abilityCast', action: { do: 'shield', value: 90, seconds: 6 } } }], desc: 'Each ability cast cloaks the hero in an absorb-shield.' },
  { id: 'r_communion', name: 'Communion Idol', slot: 'relic', base: [{ op: 'hook', hook: { on: 'abilityCast', action: { do: 'heal', value: 25 } } }], desc: 'Each cast channels a mend into the core.' },
  { id: 'r_lifelink', name: 'Lifelink Sigil', slot: 'relic', base: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'heal', value: 1 } } }, { op: 'hook', hook: { on: 'abilityCast', action: { do: 'shield', value: 60, seconds: 5 } } }], desc: 'Kills mend the core; casts shield the hero.' },
  // ABILITY — the run is built around the signature cast.
  { id: 'r_overdrivecore', name: 'Overdrive Core', slot: 'relic', base: [{ op: 'mul', field: 'heroCooldownMult', value: 0.7 }, { op: 'hook', hook: { on: 'abilityCast', action: { do: 'shield', value: 60, seconds: 4 } } }], desc: 'Abilities come back fast and armor you on cast.' },
  { id: 'r_resonantmatrix', name: 'Resonant Matrix', slot: 'relic', base: [{ op: 'mul', field: 'heroAbilityRadiusMult', value: 1.35 }, { op: 'mul', field: 'heroCooldownMult', value: 0.88 }], desc: 'Wider, more frequent battlefield-clearing casts.' },
  { id: 'r_echochamber', name: 'Echo Chamber', slot: 'relic', base: [{ op: 'mul', field: 'heroAbilityRadiusMult', value: 1.2 }, { op: 'hook', hook: { on: 'abilityCast', action: { do: 'biomass', value: 45 } } }], desc: 'Casting echoes — a bigger blast that pays you back.' },
  // KEYSTONES — global rules that reward a board shape or playstyle.
  { id: 'r_diversitydoctrine', name: 'Symbiosis Doctrine', slot: 'relic', base: [{ op: 'add', field: 'diversityBonus', value: 0.06 }], desc: '+Tower damage per DISTINCT tower class — reward a varied board.' },
  { id: 'r_resonancedoctrine', name: 'Resonance Doctrine', slot: 'relic', base: [{ op: 'add', field: 'classResonanceBonus', value: 0.2 }], desc: '+Towers matching the fielded hero\'s class hit much harder.' },
  { id: 'r_berserkerpact', name: 'Berserker Pact', slot: 'relic', base: [{ op: 'add', field: 'lastStandThreshold', value: 0.3 }, { op: 'mul', field: 'lastStandMult', value: 2.5 }], desc: 'When the core is low, everything hits like a truck.' },
  { id: 'r_minimalistcreed', name: 'Minimalist Creed', slot: 'relic', base: [{ op: 'add', field: 'damagePerEmptySlot', value: 0.05 }, { op: 'mul', field: 'towerDamageMult', value: 1.08 }], desc: '+Damage per EMPTY build slot — win with few towers.' },
  { id: 'r_swarmlord', name: 'Swarmlord Doctrine', slot: 'relic', base: [{ op: 'add', field: 'damagePerTower', value: 0.04 }, { op: 'mul', field: 'towerFireRateMult', value: 1.05 }], desc: '+Damage per tower on the board — go wide.' },
  { id: 'r_cascadeengine', name: 'Cascade Engine', slot: 'relic', base: [{ op: 'add', field: 'reactionRepeats', value: 1 }, { op: 'mul', field: 'poolDpsMult', value: 1.12 }], desc: 'Reactions re-fire — chain Shred into Shred.' },
  { id: 'r_executionersedict', name: "Executioner's Edict", slot: 'relic', base: [{ op: 'add', field: 'executeThreshold', value: 0.15 }, { op: 'mul', field: 'towerDamageMult', value: 1.08 }], desc: '+Instantly kill enemies under 15% HP (elites/bosses immune).' },
  { id: 'r_piercedoctrine', name: 'Piercing Doctrine', slot: 'relic', base: [{ op: 'grant', grant: { kind: 'towerProjectileMutator', id: 'pierce1' } }], desc: 'Every tower\'s shots punch through an extra foe.' },
  { id: 'r_vulndoctrine', name: 'Vulnerability Doctrine', slot: 'relic', base: [{ op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.15 }, { op: 'add', field: 'obeliskSlowBonus', value: 0.1 }], desc: 'Disruption bites deeper — slow harder, amplify more.' },
  { id: 'r_plaguedoctrine', name: 'Plague Doctrine', slot: 'relic', base: [{ op: 'mul', field: 'parasiteInfectionMult', value: 1.4 }], desc: 'Infection ramps and ticks far harder.' },
  // RISK — power for a downside (the gambler's relics).
  { id: 'r_recklessgenome', name: 'Reckless Genome', slot: 'relic', base: [{ op: 'mul', field: 'towerDamageMult', value: 1.4 }, { op: 'mul', field: 'integrityMult', value: 0.65 }], desc: '+Towers hit far harder. −The core is fragile.' },
  { id: 'r_overgrowth', name: 'Overgrowth Pact', slot: 'relic', base: [{ op: 'mul', field: 'enemyHpRunMult', value: 1.15 }, { op: 'mul', field: 'towerDamageMult', value: 1.28 }], desc: '+Big damage. −Enemies are tougher (a harder, richer run).' },
  { id: 'r_thinveil', name: 'Thin Veil', slot: 'relic', base: [{ op: 'mul', field: 'heroSpeedMult', value: 1.2 }, { op: 'mul', field: 'heroMaxHpMult', value: 0.7 }, { op: 'mul', field: 'heroDamageMult', value: 1.2 }], desc: '+Fast, lethal hero. −Made of glass.' },
  // EXOTIC — signature rule-benders.
  { id: 'r_apexplague', name: 'Apex Plague', slot: 'relic', exotic: true, base: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'spreadStatus', status: 'Infection', amount: 2, radius: 100 } } }, { op: 'hook', hook: { on: 'enemyKilled', action: { do: 'biomass', value: 4 } } }], desc: 'Every death is an outbreak — and a payday.', signature: { name: 'Patient Zero', effects: [{ op: 'mul', field: 'parasiteInfectionMult', value: 1.25 }] } },
  { id: 'r_worldengine', name: 'World Engine', slot: 'relic', exotic: true, base: [{ op: 'mul', field: 'heroAbilityRadiusMult', value: 1.4 }, { op: 'hook', hook: { on: 'waveCleared', action: { do: 'heal', value: 50 } } }], desc: 'A planet-cracking ability that mends the hive each wave.', signature: { name: 'Genesis', effects: [{ op: 'mul', field: 'heroCooldownMult', value: 0.85 }] } },
];

export const ALL_ITEMS: EquipDef[] = [...WEAPONS, ...ARMOR, ...RELICS];

// Equipment self-registers under the content-registry framework (lookups/validation/
// modding flow through it; `itemDef` below stays as the fast id index the sim uses).
export const equipmentRegistry = new Registry<EquipDef>('equipment', {
  idOf: (d) => d.id,
  validate: (d) => (d.base.length > 0 ? [] : ['item needs at least one base effect']),
});
equipmentRegistry.registerAll(ALL_ITEMS);

const ITEM_BY_ID = new Map(ALL_ITEMS.map((d) => [d.id, d] as const));
export function itemDef(id: string): EquipDef | undefined {
  return ITEM_BY_ID.get(id);
}

const BY_SLOT: Record<EquipSlot, EquipDef[]> = {
  weapon: WEAPONS,
  armor: ARMOR,
  relic: RELICS,
};

// ── Owned (rolled) instances + loadout ───────────────────────────────────────
export interface RolledAffix {
  affixId: string;
  tier: number; // 1..MAX_AFFIX_TIER
  locked?: boolean; // Reforge: shielded from reroll / reforge / randomize
}
export interface OwnedItem {
  uid: string;
  defId: string;
  rarity: Rarity;
  affixes: RolledAffix[];
  ilvl?: number; // Reforge item level (drop depth) — caps the affix tier ceiling; legacy gear omits it
  favorite?: boolean; // pinned by the player (sorts first; never the salvage target)
  locked?: boolean; // protected from salvage (the collectible "keep" flag)
  source?: string; // where it came from (Genetic Vault / Run Extraction / …) — shown on the Details screen
  history?: string[]; // mod log: one short entry per Reforge op applied (oldest first) — Details screen
  seen?: boolean; // the player has opened its Details at least once — drives the "NEW" card badge
}
export interface Loadout {
  weapon: string | null; // OwnedItem.uid
  armor: string | null;
  relic: string | null;
}

/** The three equip slots, in display order. */
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'armor', 'relic'];

/** An empty loadout — the default for a hero with no gear equipped (HEROES.md per-hero loadouts). */
export function emptyLoadout(): Loadout {
  return { weapon: null, armor: null, relic: null };
}

type Rng = () => number;
const pick = <T>(rng: Rng, a: readonly T[]): T => a[Math.floor(rng() * a.length)];
/** Roll a random affix tier in 1..maxTier (the reroll chase, bounded by the ilvl ceiling). */
export const rollAffixTier = (rng: Rng, maxTier: number = MAX_AFFIX_TIER): number =>
  1 + Math.floor(rng() * Math.max(1, Math.min(MAX_AFFIX_TIER, maxTier)));

/** Roll N affixes biased to the slot (no duplicates), each at a random tier ≤ maxTier.
 *  `exclude` seeds the used-set so callers (Reforge ops) can avoid affix types already carried. */
export function rollAffixes(
  rng: Rng, slot: EquipSlot, n: number, maxTier: number = MAX_AFFIX_TIER, exclude: Iterable<string> = [],
): RolledAffix[] {
  const pool = AFFIXES.filter((a) => a.bias === slot || a.bias === 'any');
  const out: RolledAffix[] = [];
  const used = new Set<string>(exclude);
  let guard = 0;
  while (out.length < n && guard++ < 50) {
    const a = pick(rng, pool);
    if (used.has(a.id)) continue;
    used.add(a.id);
    out.push({ affixId: a.id, tier: rollAffixTier(rng, maxTier) });
  }
  return out;
}

let uidSeq = 0;
function newUid(): string {
  return `it_${Date.now().toString(36)}_${(uidSeq++).toString(36)}`;
}

/** Create an owned instance of a definition at a rarity (rolls affixes for the tier). An optional
 *  `ilvl` stamps the item level and caps rolled affix tiers to that level's ceiling. */
export function rollItem(rng: Rng, def: EquipDef, rarity: Rarity, ilvl?: number, source = 'Genetic Vault'): OwnedItem {
  const fixed: Rarity = def.exotic ? 'exotic' : rarity;
  const cap = ilvl === undefined ? MAX_AFFIX_TIER : maxTierForIlvl(ilvl);
  const item: OwnedItem = { uid: newUid(), defId: def.id, rarity: fixed, affixes: rollAffixes(rng, def.slot, RARITY_AFFIXES[fixed], cap), source };
  if (ilvl !== undefined) item.ilvl = ilvl;
  return item;
}

/** A run-end drop: a slot-balanced random item, rarity weighted by how deep the run got, stamped
 *  with an item level from the run depth (the Reforge tier ceiling). */
export function rollItemDrop(rng: Rng, wave: number, source = 'Run Extraction'): OwnedItem {
  // Pick a SLOT uniformly, then an item within it — so Weapon / Armor / Relic each drop at a 1/3
  // share regardless of how many items each category defines (equal category representation).
  const slot = pick(rng, ['weapon', 'armor', 'relic'] as EquipSlot[]);
  const def = pick(rng, BY_SLOT[slot]);
  const ilvl = Math.max(1, Math.round(wave));
  if (def.exotic) return rollItem(rng, def, 'exotic', ilvl, source);
  // deeper → better floor
  const roll = rng() + Math.min(0.35, wave * 0.03);
  const rarity: Rarity = roll > 1.15 ? 'legendary' : roll > 0.9 ? 'epic' : roll > 0.55 ? 'rare' : 'common';
  return rollItem(rng, def, rarity, ilvl, source);
}

/** Map an account Power Score → an equipment item level, so a container's gear rarity tracks account
 *  STRENGTH (not run depth). A fresh account (score ≈ base) floors at ilvl 1 (Common); it climbs
 *  smoothly and caps at 30 so late-game reads Legendary/Exotic-capable without spikes. `base` is
 *  POWER_BASE, passed in to avoid a power↔equipment import cycle. Pure + monotonic. */
export function powerItemLevel(powerScore: number, base = 1000): number {
  return Math.max(1, Math.min(30, Math.round((powerScore - base) / 150) + 1));
}

/** A power-scaled equipment drop: ONE item whose rarity floor + ilvl track the account Power Score,
 *  reusing the wave→rarity ladder via powerItemLevel. This is the single acquisition path used when a
 *  container yields gear (docs/EQUIPMENT.md). */
export function rollItemForPower(rng: Rng, powerScore: number, base = 1000): OwnedItem {
  return rollItemDrop(rng, powerItemLevel(powerScore, base), 'Genetic Vault');
}

// ── Reroll & craft hooks (the optimization sink — bounded, deterministic-ish) ──

/** Reroll the (unlocked) affixes of an item to fresh random tiers. */
export function rerollAffixes(rng: Rng, item: OwnedItem, lockedAffixIds: string[] = []): OwnedItem {
  const locked = new Set(lockedAffixIds);
  const def = itemDef(item.defId);
  const slot = def?.slot ?? 'weapon';
  const kept = item.affixes.filter((a) => locked.has(a.affixId));
  const need = RARITY_AFFIXES[item.rarity] - kept.length;
  const fresh = rollAffixes(rng, slot, Math.max(0, need)).filter((a) => !kept.some((k) => k.affixId === a.affixId));
  return { ...item, affixes: [...kept, ...fresh].slice(0, RARITY_AFFIXES[item.rarity]) };
}

/** Transmute up a rarity tier (crafting hook): adds an affix slot. */
export function transmute(rng: Rng, item: OwnedItem): OwnedItem | null {
  const idx = RARITY_ORDER.indexOf(item.rarity);
  if (idx < 0 || idx >= RARITY_ORDER.indexOf('legendary')) return null; // can't transmute past legendary / exotics
  const next = RARITY_ORDER[idx + 1];
  const def = itemDef(item.defId);
  const slot = def?.slot ?? 'weapon';
  const need = RARITY_AFFIXES[next] - item.affixes.length;
  const extra = rollAffixes(rng, slot, Math.max(0, need));
  return { ...item, rarity: next, affixes: [...item.affixes, ...extra] };
}

// ── Effect resolution (folded into a run at construction) ─────────────────────

function scaleEffect(e: CardEffect, tierFactor: number): CardEffect {
  if (e.op === 'mul') return { ...e, value: 1 + (e.value - 1) * tierFactor };
  if (e.op === 'add' || e.op === 'biomass' || e.op === 'integrity' || e.op === 'heroHp') return { ...e, value: e.value * tierFactor };
  return e; // flags don't scale
}

/** All CardEffects an owned item contributes (base + signature + tier-scaled affixes). */
export function itemEffects(item: OwnedItem): CardEffect[] {
  const def = itemDef(item.defId);
  if (!def) return [];
  const out: CardEffect[] = [...def.base];
  if (def.signature && (item.rarity === 'legendary' || item.rarity === 'exotic')) out.push(...def.signature.effects);
  for (const ra of item.affixes) {
    const affix = AFFIX_BY_ID.get(ra.affixId);
    if (!affix) continue;
    const f = AFFIX_TIER_SCALE[Math.max(1, Math.min(MAX_AFFIX_TIER, ra.tier))];
    for (const e of affix.effects) out.push(scaleEffect(e, f));
  }
  return out;
}

/** Resolve a full loadout (equipped items + set bonuses) into CardEffects for the run. */
export function loadoutEffects(inventory: OwnedItem[], loadout: Loadout): CardEffect[] {
  const byUid = new Map(inventory.map((i) => [i.uid, i] as const));
  const equipped: OwnedItem[] = [];
  for (const slot of ['weapon', 'armor', 'relic'] as EquipSlot[]) {
    const uid = loadout[slot];
    const it = uid ? byUid.get(uid) : undefined;
    if (it) equipped.push(it);
  }
  const out: CardEffect[] = [];
  for (const it of equipped) out.push(...itemEffects(it));
  // Set bonuses — count equipped weapon+armor set pieces (relics aren't part of sets).
  const counts = new Map<string, number>();
  for (const it of equipped) {
    const def = itemDef(it.defId);
    if (def && def.slot !== 'relic' && def.setId) counts.set(def.setId, (counts.get(def.setId) ?? 0) + 1);
  }
  for (const [setId, n] of counts) {
    const set = SETS[setId];
    if (!set) continue;
    if (n >= 2) out.push(...set.bonus2);
    if (n >= 4) out.push(...set.bonus4);
  }
  return out;
}

export const SLOT_LABELS: Record<EquipSlot, string> = { weapon: 'Weapon', armor: 'Armor', relic: 'Relic' };
export function itemsForSlot(slot: EquipSlot): EquipDef[] {
  return BY_SLOT[slot];
}

// ── Collectible scoring + set status (UI read-models; pure, mythic-ready) ──────

/** Relative power weight per rarity (open map — a future 'mythic'/event tier just adds a key). */
export const RARITY_WEIGHT: Record<string, number> = {
  common: 1, rare: 2, epic: 4, legendary: 7, exotic: 9, mythic: 12,
};

/** ASSIMILATE grade labels for rarity (docs/LEXICON.md) — the DISPLAY name; the internal id (and
 *  save data) never change. common→Inert … exotic→Apex; a future 'mythic' reads 'Aberrant'. */
export const RARITY_LABELS: Record<string, string> = {
  common: 'Inert', rare: 'Active', epic: 'Virulent', legendary: 'Rampant', exotic: 'Apex', mythic: 'Aberrant',
};
export function rarityLabelOf(r: string): string {
  return RARITY_LABELS[r] ?? r.charAt(0).toUpperCase() + r.slice(1);
}

/** A single item's "gear score" — rarity weight (×10) + summed affix tiers. Drives sort + the
 *  account Equipment Score. Deterministic; UI/meta only (never touches the sim). */
export function itemScore(item: OwnedItem): number {
  const base = RARITY_WEIGHT[item.rarity] ?? 1;
  const aff = item.affixes.reduce((s, a) => s + a.tier, 0);
  return base * 10 + aff + Math.round((item.ilvl ?? 0) / 5); // ilvl a light nudge; rarity+affixes dominate
}

/** The items currently slotted (weapon/armor/relic order), skipping empty slots. */
export function equippedItems(inventory: OwnedItem[], loadout: Loadout): OwnedItem[] {
  const byUid = new Map(inventory.map((i) => [i.uid, i] as const));
  const out: OwnedItem[] = [];
  for (const slot of ['weapon', 'armor', 'relic'] as EquipSlot[]) {
    const uid = loadout[slot];
    const it = uid ? byUid.get(uid) : undefined;
    if (it) out.push(it);
  }
  return out;
}

export interface ActiveSet {
  id: string;
  name: string;
  count: number; // equipped pieces of this set (weapon + armor)
  bonus2: boolean; // 2-piece bonus active
  bonus4: boolean; // 4-piece bonus active
}

/** Set membership of the equipped weapon+armor (relics aren't set pieces) — for the Sets panel. */
export function activeSets(inventory: OwnedItem[], loadout: Loadout): ActiveSet[] {
  const counts = new Map<string, number>();
  for (const it of equippedItems(inventory, loadout)) {
    const def = itemDef(it.defId);
    if (def && def.slot !== 'relic' && def.setId) counts.set(def.setId, (counts.get(def.setId) ?? 0) + 1);
  }
  const out: ActiveSet[] = [];
  for (const [id, count] of counts) {
    const set = SETS[id];
    if (!set) continue;
    out.push({ id, name: set.name, count, bonus2: count >= 2, bonus4: count >= 4 });
  }
  return out.sort((a, b) => b.count - a.count);
}

/** Account Equipment Score — the gear score of everything equipped + a set-synergy bonus. */
export function loadoutScore(inventory: OwnedItem[], loadout: Loadout): number {
  let score = 0;
  for (const it of equippedItems(inventory, loadout)) score += itemScore(it);
  for (const s of activeSets(inventory, loadout)) score += (s.bonus2 ? 15 : 0) + (s.bonus4 ? 30 : 0);
  return score;
}
