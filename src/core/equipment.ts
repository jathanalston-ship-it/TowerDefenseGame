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

/** Bounded magnitude ladder for affix tiers T1..T6 (the reroll chase — never unbounded). */
export const AFFIX_TIER_SCALE = [0, 1, 1.18, 1.36, 1.58, 1.8, 2.0];
export const MAX_AFFIX_TIER = 6;

// ── Affixes (behavioral, drawn by slot bias) ─────────────────────────────────
export interface AffixDef {
  id: string;
  name: string;
  bias: EquipSlot | 'any';
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
  { id: 'fertile', name: 'Fertile', bias: 'relic', effects: [{ op: 'mul', field: 'biomassMult', value: 1.08 }] },
  { id: 'flush', name: 'Flush', bias: 'relic', effects: [{ op: 'add', field: 'startBiomassBonus', value: 60 }] },
  { id: 'corrosive', name: 'Corrosive', bias: 'relic', effects: [{ op: 'mul', field: 'poolDpsMult', value: 1.1 }] },
  { id: 'reactive', name: 'Reactive', bias: 'any', effects: [{ op: 'mul', field: 'reactorBiomassMult', value: 1.1 }] },
  { id: 'twinned', name: 'Twinned', bias: 'any', effects: [{ op: 'add', field: 'needleExtraProjectiles', value: 1 }] },
];

const AFFIX_BY_ID = new Map(AFFIXES.map((a) => [a.id, a] as const));
export function affixDef(id: string): AffixDef | undefined {
  return AFFIX_BY_ID.get(id);
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
}

// 20 WEAPONS — re-author offense (extra projectiles, on-hit status, splash, hero kit).
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
];

// 20 ARMOR — survivability + passives + tower-facing auras.
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
];

// 20 RELICS — rule-benders, usually with a trade-off (paired upside/downside).
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
}
export interface OwnedItem {
  uid: string;
  defId: string;
  rarity: Rarity;
  affixes: RolledAffix[];
}
export interface Loadout {
  weapon: string | null; // OwnedItem.uid
  armor: string | null;
  relic: string | null;
}

type Rng = () => number;
const pick = <T>(rng: Rng, a: readonly T[]): T => a[Math.floor(rng() * a.length)];
const randTier = (rng: Rng): number => 1 + Math.floor(rng() * MAX_AFFIX_TIER);

/** Roll N affixes biased to the slot (no duplicates), each at a random tier. */
function rollAffixes(rng: Rng, slot: EquipSlot, n: number): RolledAffix[] {
  const pool = AFFIXES.filter((a) => a.bias === slot || a.bias === 'any');
  const out: RolledAffix[] = [];
  const used = new Set<string>();
  let guard = 0;
  while (out.length < n && guard++ < 50) {
    const a = pick(rng, pool);
    if (used.has(a.id)) continue;
    used.add(a.id);
    out.push({ affixId: a.id, tier: randTier(rng) });
  }
  return out;
}

let uidSeq = 0;
function newUid(): string {
  return `it_${Date.now().toString(36)}_${(uidSeq++).toString(36)}`;
}

/** Create an owned instance of a definition at a rarity (rolls affixes for the tier). */
export function rollItem(rng: Rng, def: EquipDef, rarity: Rarity): OwnedItem {
  const fixed: Rarity = def.exotic ? 'exotic' : rarity;
  return { uid: newUid(), defId: def.id, rarity: fixed, affixes: rollAffixes(rng, def.slot, RARITY_AFFIXES[fixed]) };
}

/** A run-end drop: a random item with rarity weighted by how deep the run got. */
export function rollItemDrop(rng: Rng, wave: number): OwnedItem {
  const def = pick(rng, ALL_ITEMS);
  if (def.exotic) return rollItem(rng, def, 'exotic');
  // deeper → better floor
  const roll = rng() + Math.min(0.35, wave * 0.03);
  const rarity: Rarity = roll > 1.15 ? 'legendary' : roll > 0.9 ? 'epic' : roll > 0.55 ? 'rare' : 'common';
  return rollItem(rng, def, rarity);
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
