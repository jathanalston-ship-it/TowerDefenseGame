// NUCLEUS MULLIGANS (docs/NUCLEUS.md) — the Hive Nucleus's own biological organ system: the
// Mulligan pillar's HIVE twin. The Nucleus owns up to three CHAMBERS; each chamber grafts THREE
// modifier ORGANS (exactly the tower-Mulligan triple) and does NOTHING until all three are filled.
// Organs are GROWN with Gene Essence (the unified gene currency), live in ONE chamber slot at a
// time (§exclusivity), and speak the EXISTING CardEffect vocabulary — a resolved Nucleus folds at
// run boot through the same apply pipeline equipment/doctrines/genes already ride, so the sim
// gains no new branch. Identity-flavored: organs are SUPPORT — economy, survivability, wave
// manipulation, enemy debuffs, hero/tower support — NEVER raw tower DPS (the registry REJECTS
// towerDamageMult; the future-organ contract).
//
// GOLDEN INVARIANT: a fresh account has an empty Nucleus ⇒ resolveNucleus returns the identity
// (active:false, effects:[], power 1, no mutations) ⇒ the run boots byte-identical and the Power
// index reads exactly POWER_BASE. Pure data + pure helpers (no Game/DOM/save).
//
// Chamber ladder (§gates): chamber 1 is free; chamber 2 demands a MEMORABLE multi-system trial;
// chamber 3 is the late-game crown (very deep campaign + genome + power + an Ichor price +
// objectives). Gates are DATA rows over a meta-assembled snapshot, so future requirements (or a
// fourth chamber) integrate by adding rows — nothing here hardcodes a system.

import { Registry } from './registry';
import { COMBAT_CLASSES } from './combatClass';
import { MULLIGAN_RARITY, levelCap } from './mulligan';
import type { MulliganRarity } from './mulligan';
import type { CardEffect } from './cards';
import type { CombatClass } from './types';

export const NUCLEUS_MARK = '⌬';
export const NUCLEUS_CHAMBERS = 3;
export const NUCLEUS_CHAMBER_SLOTS = 3; // the Mulligan triple, verbatim

// ─────────────────────────────────────────────────────────────────────────────
// Organ definitions — one registry row per organ (the future-modifier contract). Rarity is
// FIXED per organ (unlike tower pieces): it prices the grow, caps the level ladder (the same
// rarity level caps Mulligan slots use) and scales Power. Effects are authored at level 1;
// levels scale the DELTAS (never the base 1), exactly like Mulligan stat scaling.
// ─────────────────────────────────────────────────────────────────────────────
export type NucleusCategory = 'metabolic' | 'membrane' | 'dominion';
export const NUCLEUS_CATEGORY_LABEL: Record<NucleusCategory, string> = {
  metabolic: 'Metabolic', // economy — biomass, salvage, reactors
  membrane: 'Membrane', // survivability — integrity, regeneration, hero sustain
  dominion: 'Dominion', // command — wave manipulation, enemy debuffs, hero/tower support
};

/** The visible MUTATION an organ grows onto the Nucleus (render/nucleusMutations.ts draws these
 *  procedurally — a new organ picks any existing motif for free; a new motif = one draw case). */
export type NucleusMutation =
  | 'veins' // vascular webbing radiating from the heart
  | 'plating' // ossified bone-armor arcs
  | 'eyes' // blinking ocelli ring
  | 'tentacles' // slow waving feelers
  | 'pulse' // deep biomass throb halo
  | 'sacs' // budding symbiotic pods
  | 'spores' // drifting spore motes
  | 'crown'; // apex crest (adaptation sets grow this on top)
export const NUCLEUS_MUTATIONS: NucleusMutation[] = ['veins', 'plating', 'eyes', 'tentacles', 'pulse', 'sacs', 'spores', 'crown'];

export interface NucleusOrgan {
  id: string;
  name: string;
  category: NucleusCategory;
  /** Biological CLASS — the SAME six-class taxonomy towers + Mulligan modifiers share
   *  (core/combatClass.ts). Three matching classes in a chamber = a Complete Adaptation. */
  cls: CombatClass;
  rarity: MulliganRarity; // fixed — prices the grow, caps levels, scales Power
  desc: string; // what it does, in player words
  flavor: string;
  /** Level-1 effects — LIVE or BOOT CardEffects (the Nucleus always folds at run boot, so
   *  boot-only fields like integrityMult are legitimate here). towerDamageMult is BANNED. */
  effects: CardEffect[];
  mutation: NucleusMutation; // the visible growth this organ adds to the Nucleus
  powerWeight: number; // heuristic Power vehicle (rides the mulligans bucket)
}

export const nucleusRegistry = new Registry<NucleusOrgan>('nucleusOrgan', {
  idOf: (o) => o.id,
  validate: (o) => {
    const out: string[] = [];
    if (!o.name) out.push(`${o.id}: missing name`);
    if (!o.cls || !(o.cls in COMBAT_CLASSES)) out.push(`${o.id}: missing/unknown class '${o.cls}' — every organ requires a CombatClass (docs/NUCLEUS.md §classes)`);
    if (!(o.category in NUCLEUS_CATEGORY_LABEL)) out.push(`${o.id}: unknown category '${o.category}'`);
    if (!(o.rarity in MULLIGAN_RARITY)) out.push(`${o.id}: unknown rarity '${o.rarity}'`);
    if (!NUCLEUS_MUTATIONS.includes(o.mutation)) out.push(`${o.id}: unknown mutation '${o.mutation}' — the renderer needs a known motif`);
    if (o.effects.length === 0) out.push(`${o.id}: an organ must DO something (effects required)`);
    if (o.powerWeight <= 0) out.push(`${o.id}: powerWeight must be > 0 (every organ contributes Power)`);
    for (const e of o.effects) {
      if ((e.op === 'mul' || e.op === 'add') && e.field === 'towerDamageMult') {
        out.push(`${o.id}: towerDamageMult is banned — the Nucleus is support, never raw tower DPS (docs/NUCLEUS.md §identity)`);
      }
    }
    return out;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// THE ORGAN BOOK — 30 organs: five per class (so a class adaptation is a CHOICE among organs,
// not a forced set), ten per category. Authored small (a chamber stacks three, adaptations
// stack on top) and support-flavored throughout. A new organ is ONE row here.
// ─────────────────────────────────────────────────────────────────────────────
const METABOLIC: NucleusOrgan[] = [
  { id: 'nectar_ducts', name: 'Nectar Ducts', category: 'metabolic', cls: 'Resonant', rarity: 'common', mutation: 'veins',
    effects: [{ op: 'mul', field: 'biomassMult', value: 1.05 }], powerWeight: 0.05,
    desc: '+5% biomass from every kill.', flavor: 'The Hive learned to waste nothing. Then it learned to want more.' },
  { id: 'amber_vault', name: 'Amber Vault', category: 'metabolic', cls: 'Caustic', rarity: 'rare', mutation: 'sacs',
    effects: [{ op: 'add', field: 'startBiomassBonus', value: 40 }, { op: 'mul', field: 'biomassMult', value: 1.03 }], powerWeight: 0.065,
    desc: 'Begin every run with +40 biomass banked; +3% income.', flavor: 'Sap hardens into patience. Patience hardens into an arsenal.' },
  { id: 'reactor_bloom', name: 'Reactor Bloom', category: 'metabolic', cls: 'Caustic', rarity: 'uncommon', mutation: 'pulse',
    effects: [{ op: 'mul', field: 'reactorBiomassMult', value: 1.12 }], powerWeight: 0.055,
    desc: 'Reactors pulse +12% richer.', flavor: 'It flowers only where the heat is unbearable.' },
  { id: 'reclamation_maw', name: 'Reclamation Maw', category: 'metabolic', cls: 'Caustic', rarity: 'uncommon', mutation: 'sacs',
    effects: [{ op: 'add', field: 'sellRefundFrac', value: 0.08 }], powerWeight: 0.05,
    desc: 'Reabsorbing a tower refunds +8% more.', flavor: 'Nothing is demolished. Everything is digested.' },
  { id: 'golden_marrow', name: 'Golden Marrow', category: 'metabolic', cls: 'Resonant', rarity: 'legendary', mutation: 'pulse',
    effects: [{ op: 'mul', field: 'biomassMult', value: 1.09 }, { op: 'mul', field: 'reactorBiomassMult', value: 1.08 }], powerWeight: 0.11,
    desc: '+9% biomass and +8% reactor yield — the wealth organ.', flavor: 'Cut it and it bleeds an economy.' },
  { id: 'tithe_gland', name: 'Tithe Gland', category: 'metabolic', cls: 'Viral', rarity: 'epic', mutation: 'veins',
    effects: [{ op: 'mul', field: 'biomassMult', value: 1.06 }, { op: 'add', field: 'sellRefundFrac', value: 0.05 }], powerWeight: 0.085,
    desc: '+6% biomass; +5% salvage refund.', flavor: 'Every organism in the arena pays. Most simply do not know yet.' },
];

const MEMBRANE: NucleusOrgan[] = [
  { id: 'chitin_hull', name: 'Chitin Hull', category: 'membrane', cls: 'Kinetic', rarity: 'common', mutation: 'plating',
    effects: [{ op: 'mul', field: 'integrityMult', value: 1.08 }], powerWeight: 0.05,
    desc: '+8% Hive Integrity.', flavor: 'The first wall the Hive ever grew. It remembers every dent.' },
  { id: 'marrow_weave', name: 'Marrow Weave', category: 'membrane', cls: 'Vital', rarity: 'uncommon', mutation: 'veins',
    effects: [{ op: 'add', field: 'integrityRegenPerWave', value: 10 }], powerWeight: 0.055,
    desc: 'Restore 10 Integrity each cleared wave.', flavor: 'It knits between heartbeats. It never runs out of thread.' },
  { id: 'ossified_crown', name: 'Ossified Crown', category: 'membrane', cls: 'Kinetic', rarity: 'epic', mutation: 'plating',
    effects: [{ op: 'mul', field: 'integrityMult', value: 1.1 }, { op: 'add', field: 'integrityRegenPerWave', value: 6 }], powerWeight: 0.085,
    desc: '+10% Integrity; regrow 6 each wave.', flavor: 'A skull for a building. A crown for a war.' },
  { id: 'nurse_polyps', name: 'Nurse Polyps', category: 'membrane', cls: 'Vital', rarity: 'rare', mutation: 'sacs',
    effects: [{ op: 'mul', field: 'heroHealingMult', value: 1.12 }], powerWeight: 0.06,
    desc: 'Champions heal +12% faster near the Hive’s reach.', flavor: 'A thousand small mouths, all of them gentle.' },
  { id: 'aegis_membrane', name: 'Aegis Membrane', category: 'membrane', cls: 'Kinetic', rarity: 'legendary', mutation: 'plating',
    effects: [{ op: 'mul', field: 'integrityMult', value: 1.12 }, { op: 'mul', field: 'heroMaxHpMult', value: 1.06 }], powerWeight: 0.11,
    desc: '+12% Integrity; champions toughen +6%.', flavor: 'The Hive extends its skin over everything it loves.' },
  { id: 'second_heart', name: 'Second Heart', category: 'membrane', cls: 'Vital', rarity: 'ascendant', mutation: 'pulse',
    effects: [{ op: 'add', field: 'integrityRegenPerWave', value: 14 }, { op: 'mul', field: 'heroHealingMult', value: 1.08 }, { op: 'mul', field: 'integrityMult', value: 1.05 }], powerWeight: 0.15,
    desc: 'The apex membrane organ — regeneration, sustain, and mass.', flavor: 'One beat for the war. One beat for what comes after.' },
];

const DOMINION: NucleusOrgan[] = [
  { id: 'withering_field', name: 'Withering Field', category: 'dominion', cls: 'Viral', rarity: 'rare', mutation: 'spores',
    effects: [{ op: 'mul', field: 'enemyHpRunMult', value: 0.97 }], powerWeight: 0.07,
    desc: 'Everything that enters arrives 3% weaker.', flavor: 'The air itself has chosen a side.' },
  { id: 'dread_chorus', name: 'Dread Chorus', category: 'dominion', cls: 'Neural', rarity: 'uncommon', mutation: 'eyes',
    effects: [{ op: 'add', field: 'corrosionSlowBonus', value: 0.03 }], powerWeight: 0.05,
    desc: 'Corrosion clings +3% harder — the wave drags.', flavor: 'It hums one note below hearing. Knees understand it.' },
  { id: 'synapse_lattice', name: 'Synapse Lattice', category: 'dominion', cls: 'Neural', rarity: 'epic', mutation: 'veins',
    effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.04 }, { op: 'mul', field: 'heroCooldownMult', value: 0.96 }], powerWeight: 0.09,
    desc: 'Towers cycle +4% faster; champion abilities recover 4% sooner.', flavor: 'The Hive thinks through everything it grew.' },
  { id: 'watcher_ocelli', name: 'Watcher Ocelli', category: 'dominion', cls: 'Resonant', rarity: 'uncommon', mutation: 'eyes',
    effects: [{ op: 'add', field: 'heroCritChance', value: 0.03 }, { op: 'mul', field: 'heroAggroRangeMult', value: 1.05 }], powerWeight: 0.055,
    desc: 'Champions strike keener (+3% crit) and engage wider.', flavor: 'It watches your champions fight. It takes notes.' },
  { id: 'brood_banners', name: 'Brood Banners', category: 'dominion', cls: 'Viral', rarity: 'epic', mutation: 'tentacles',
    effects: [{ op: 'add', field: 'fractureBonusStacks', value: 1 }], powerWeight: 0.085,
    desc: 'Fracture lands one extra stack — the swarm marks its prey.', flavor: 'Flags of flesh, planted in advance of the conquest.' },
  { id: 'overmind_bulb', name: 'Overmind Bulb', category: 'dominion', cls: 'Neural', rarity: 'ascendant', mutation: 'crown',
    effects: [{ op: 'mul', field: 'enemyHpRunMult', value: 0.96 }, { op: 'mul', field: 'heroCooldownMult', value: 0.95 }, { op: 'add', field: 'classResonanceBonus', value: 0.03 }], powerWeight: 0.15,
    desc: 'The apex dominion organ — the wave weakens, the army sharpens.', flavor: 'It does not command the battle. It remembers it forward.' },
];

// ── The cultivation 12 (4 per category, 2 per class → 5 per class, 10 per category) — grown
// alongside the Mulligan-family catalog expansion so chamber-building has real CHOICE beyond
// exact coverage: every class can now fill a chamber two different ways. Support-flavored
// throughout (the towerDamageMult ban stands). ──
const METABOLIC_2: NucleusOrgan[] = [
  { id: 'chime_stomach', name: 'Chime Stomach', category: 'metabolic', cls: 'Resonant', rarity: 'uncommon', mutation: 'pulse',
    effects: [{ op: 'mul', field: 'biomassMult', value: 1.04 }, { op: 'add', field: 'sellRefundFrac', value: 0.04 }], powerWeight: 0.052,
    desc: '+4% biomass; reabsorption refunds +4%.', flavor: 'Digestion in waltz time. Nothing is wasted on the off-beat.' },
  { id: 'render_vats', name: 'Render Vats', category: 'metabolic', cls: 'Caustic', rarity: 'rare', mutation: 'sacs',
    effects: [{ op: 'mul', field: 'reactorBiomassMult', value: 1.1 }, { op: 'add', field: 'sellRefundFrac', value: 0.05 }], powerWeight: 0.062,
    desc: 'Reactors run +10% richer; salvage renders +5% cleaner.', flavor: 'Everything the Hive outgrows is soup by morning.' },
  { id: 'gut_flora', name: 'Gut Flora', category: 'metabolic', cls: 'Viral', rarity: 'common', mutation: 'spores',
    effects: [{ op: 'mul', field: 'biomassMult', value: 1.04 }], powerWeight: 0.048,
    desc: '+4% biomass from every kill.', flavor: 'A trillion tiny accountants, all of them hungry.' },
  { id: 'honey_crypts', name: 'Honey Crypts', category: 'metabolic', cls: 'Vital', rarity: 'epic', mutation: 'sacs',
    effects: [{ op: 'add', field: 'startBiomassBonus', value: 60 }, { op: 'mul', field: 'biomassMult', value: 1.04 }], powerWeight: 0.085,
    desc: 'Begin every run with +60 biomass sealed away; +4% income.', flavor: 'The dead feed the vault. The vault feeds the war.' },
];
const MEMBRANE_2: NucleusOrgan[] = [
  { id: 'buttress_ribs', name: 'Buttress Ribs', category: 'membrane', cls: 'Kinetic', rarity: 'uncommon', mutation: 'plating',
    effects: [{ op: 'mul', field: 'integrityMult', value: 1.06 }, { op: 'add', field: 'integrityRegenPerWave', value: 3 }], powerWeight: 0.055,
    desc: '+6% Integrity; regrow 3 each wave.', flavor: 'Architecture the Hive dreamed while being hit.' },
  { id: 'lymphatic_moat', name: 'Lymphatic Moat', category: 'membrane', cls: 'Vital', rarity: 'rare', mutation: 'veins',
    effects: [{ op: 'add', field: 'integrityRegenPerWave', value: 8 }, { op: 'mul', field: 'heroHealingMult', value: 1.05 }], powerWeight: 0.062,
    desc: 'Regrow 8 Integrity each wave; champions mend +5% faster.', flavor: 'A circulating defense. The current always runs toward the wound.' },
  { id: 'pain_editor', name: 'Pain Editor', category: 'membrane', cls: 'Neural', rarity: 'epic', mutation: 'eyes',
    effects: [{ op: 'mul', field: 'integrityMult', value: 1.07 }, { op: 'mul', field: 'heroMaxHpMult', value: 1.05 }], powerWeight: 0.084,
    desc: '+7% Integrity; champions toughen +5%.', flavor: 'It reads every injury and publishes a kinder version.' },
  { id: 'bell_jar', name: 'Bell Jar', category: 'membrane', cls: 'Resonant', rarity: 'legendary', mutation: 'pulse',
    effects: [{ op: 'mul', field: 'integrityMult', value: 1.1 }, { op: 'add', field: 'integrityRegenPerWave', value: 6 }, { op: 'mul', field: 'heroHealingMult', value: 1.05 }], powerWeight: 0.11,
    desc: '+10% Integrity, regrow 6 each wave, +5% champion healing — the sheltering tone.', flavor: 'One sustained note, and inside it, nothing breaks.' },
];
const DOMINION_2: NucleusOrgan[] = [
  { id: 'puppet_strings', name: 'Puppet Strings', category: 'dominion', cls: 'Neural', rarity: 'rare', mutation: 'tentacles',
    effects: [{ op: 'mul', field: 'heroCooldownMult', value: 0.97 }, { op: 'mul', field: 'heroAggroRangeMult', value: 1.04 }], powerWeight: 0.063,
    desc: 'Champion abilities recover 3% sooner; champions hunt 4% wider.', flavor: 'The Hive does not command its champions. It suggests, continuously.' },
  { id: 'spite_pheromones', name: 'Spite Pheromones', category: 'dominion', cls: 'Viral', rarity: 'uncommon', mutation: 'spores',
    effects: [{ op: 'mul', field: 'enemyHpRunMult', value: 0.98 }], powerWeight: 0.056,
    desc: 'Everything that enters arrives 2% weaker.', flavor: 'The air holds a grudge on the Hive’s behalf.' },
  { id: 'war_drums', name: 'War Drums', category: 'dominion', cls: 'Kinetic', rarity: 'epic', mutation: 'plating',
    effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.03 }, { op: 'add', field: 'heroCritChance', value: 0.02 }], powerWeight: 0.083,
    desc: 'Towers cycle +3% faster; champions strike keener (+2% crit).', flavor: 'Bone stretched over hunger. The rhythm is instructions.' },
  { id: 'gravity_bile', name: 'Gravity Bile', category: 'dominion', cls: 'Caustic', rarity: 'legendary', mutation: 'tentacles',
    effects: [{ op: 'add', field: 'corrosionSlowBonus', value: 0.04 }, { op: 'mul', field: 'splashRadiusMult', value: 1.05 }], powerWeight: 0.108,
    desc: 'Corrosion clings +4% harder and blasts bloom 5% wider — the field thickens.', flavor: 'It weighs the enemy down with the Hive’s opinion of them.' },
];

nucleusRegistry.registerAll([...METABOLIC, ...MEMBRANE, ...DOMINION, ...METABOLIC_2, ...MEMBRANE_2, ...DOMINION_2]);

/** Organs of a category / class (UI grouping, collections, the chamber recommender). */
export function organsByCategory(cat: NucleusCategory): NucleusOrgan[] {
  return nucleusRegistry.all().filter((o) => o.category === cat);
}
export function organsByClass(cls: CombatClass): NucleusOrgan[] {
  return nucleusRegistry.all().filter((o) => o.cls === cls);
}

// ─────────────────────────────────────────────────────────────────────────────
// Level scaling + grow/upgrade economy — Gene Essence, the unified gene currency.
// Effects scale their DELTAS with level (never the base), mirroring Mulligan statScale;
// rarity fixes the level cap via the SAME ladder Mulligan slots use (mulligan.levelCap).
// ─────────────────────────────────────────────────────────────────────────────
export const NUCLEUS_PER_LEVEL = 0.05; // each level adds 5% of the authored delta

export function organLevelCap(o: NucleusOrgan): number {
  return levelCap(o.rarity);
}

/** An organ's effects AT a level: mul deltas and add values scale linearly; flags/others pass. */
export function organEffects(o: NucleusOrgan, level: number): CardEffect[] {
  const s = 1 + NUCLEUS_PER_LEVEL * (Math.max(1, level) - 1);
  if (s === 1) return o.effects;
  return o.effects.map((e) => {
    if (e.op === 'mul') return { ...e, value: 1 + (e.value - 1) * s };
    if (e.op === 'add') return { ...e, value: e.value * s };
    return e;
  });
}

/** Gene Essence price to GROW an organ (permanent; sized as a real chamber-filling sink). */
export function organGrowCost(o: NucleusOrgan): number {
  return 150 * Math.pow(2, MULLIGAN_RARITY[o.rarity].tier); // 150/300/600/1200/2400/4800
}
/** Gene Essence price for level → level+1 (the Mulligan slot curve, nucleus-tuned). */
export function organUpgradeCost(o: NucleusOrgan, level: number): number {
  return Math.round(30 * (MULLIGAN_RARITY[o.rarity].tier + 1) * Math.pow(1.35, Math.max(0, level - 1)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Save shape (saveStore imports these) — grown organs are a sparse dex (id → level);
// chambers hold organ ids (or null). An organ id may appear in at most ONE chamber slot.
// ─────────────────────────────────────────────────────────────────────────────
export interface NucleusState {
  unlocked: number; // chambers open (1..NUCLEUS_CHAMBERS; chamber 1 is always open)
  chambers: (string | null)[][]; // [chamber][slot] → grown organ id
  grown: Record<string, { level: number }>; // organ id → permanent level (the dex)
  /** LIFETIME classes whose FULL adaptation has ever completed (the Adaptation codex —
   *  re-slotting never confiscates the credit). Recorded by meta.setNucleusSlot. */
  adapted?: string[];
}

export function emptyNucleus(): NucleusState {
  return {
    unlocked: 1,
    chambers: Array.from({ length: NUCLEUS_CHAMBERS }, () => Array.from({ length: NUCLEUS_CHAMBER_SLOTS }, () => null)),
    grown: {},
  };
}

/** Which chamber currently hosts an organ (§exclusivity) — null if unslotted. */
export function organChamber(state: NucleusState, organId: string): number | null {
  for (let c = 0; c < NUCLEUS_CHAMBERS; c++) {
    if (state.chambers[c]?.some((id) => id === organId)) return c;
  }
  return null;
}

/** A chamber is ACTIVE only when all three slots hold known, GROWN organs (no partial activation). */
export function isChamberActive(state: NucleusState | undefined | null, chamber: number): boolean {
  if (!state || chamber >= (state.unlocked ?? 0)) return false;
  const row = state.chambers?.[chamber];
  if (!row || row.length < NUCLEUS_CHAMBER_SLOTS) return false;
  for (let i = 0; i < NUCLEUS_CHAMBER_SLOTS; i++) {
    const id = row[i];
    if (!id || !nucleusRegistry.has(id) || !state.grown[id]) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASS ADAPTATIONS (§adaptations) — the chamber set bonus. Three organs of ONE class in an
// active chamber ⇒ the FULL adaptation; exactly two ⇒ the MINOR one (of the pair's class).
// Bonuses speak the same support vocabulary (never towerDamageMult) and each full set grows
// the apex CROWN mutation on the Nucleus.
// ─────────────────────────────────────────────────────────────────────────────
export type NucleusAdaptTier = 'full' | 'minor';
export const NUCLEUS_ADAPTATION_POWER: Record<NucleusAdaptTier, number> = { full: 0.06, minor: 0.025 };

export interface NucleusAdaptation {
  cls: CombatClass;
  title: string;
  fullDesc: string;
  minorDesc: string;
  full: CardEffect[];
  minor: CardEffect[];
}

export const NUCLEUS_ADAPTATIONS: Record<CombatClass, NucleusAdaptation> = {
  Kinetic: {
    cls: 'Kinetic', title: 'Fortress Physiology',
    fullDesc: 'The Hive armors itself: +10% Integrity and one extra emplacement socket.',
    minorDesc: '+6% Integrity.',
    full: [{ op: 'mul', field: 'integrityMult', value: 1.1 }, { op: 'add', field: 'bonusTowerSlots', value: 1 }],
    minor: [{ op: 'mul', field: 'integrityMult', value: 1.06 }],
  },
  Caustic: {
    cls: 'Caustic', title: 'Digestive Dominion',
    fullDesc: 'The arena becomes a stomach: +8% biomass and blasts bloom 6% wider.',
    minorDesc: '+5% biomass.',
    full: [{ op: 'mul', field: 'biomassMult', value: 1.08 }, { op: 'mul', field: 'splashRadiusMult', value: 1.06 }],
    minor: [{ op: 'mul', field: 'biomassMult', value: 1.05 }],
  },
  Viral: {
    cls: 'Viral', title: 'Endemic Saturation',
    fullDesc: 'The infection precedes the wave: enemies arrive 4% weaker and Fracture lands an extra stack.',
    minorDesc: 'Enemies arrive 2% weaker.',
    full: [{ op: 'mul', field: 'enemyHpRunMult', value: 0.96 }, { op: 'add', field: 'fractureBonusStacks', value: 1 }],
    minor: [{ op: 'mul', field: 'enemyHpRunMult', value: 0.98 }],
  },
  Neural: {
    cls: 'Neural', title: 'Overmind Synchrony',
    fullDesc: 'One will, many bodies: towers cycle 5% faster and champion abilities recover 6% sooner.',
    minorDesc: 'Champion abilities recover 4% sooner.',
    full: [{ op: 'mul', field: 'towerFireRateMult', value: 1.05 }, { op: 'mul', field: 'heroCooldownMult', value: 0.94 }],
    minor: [{ op: 'mul', field: 'heroCooldownMult', value: 0.96 }],
  },
  Vital: {
    cls: 'Vital', title: 'Immortal Root',
    fullDesc: 'The Hive refuses endings: regrow 12 Integrity each wave and champions heal 10% faster.',
    minorDesc: 'Regrow 8 Integrity each wave.',
    full: [{ op: 'add', field: 'integrityRegenPerWave', value: 12 }, { op: 'mul', field: 'heroHealingMult', value: 1.1 }],
    minor: [{ op: 'add', field: 'integrityRegenPerWave', value: 8 }],
  },
  Resonant: {
    cls: 'Resonant', title: 'Choral Abundance',
    fullDesc: 'The note that feeds: +8% biomass and the class chorus grows (+3% resonance).',
    minorDesc: '+4% biomass.',
    full: [{ op: 'mul', field: 'biomassMult', value: 1.08 }, { op: 'add', field: 'classResonanceBonus', value: 0.03 }],
    minor: [{ op: 'mul', field: 'biomassMult', value: 1.04 }],
  },
};

export interface NucleusChamberAdaptation {
  cls: CombatClass;
  tier: NucleusAdaptTier;
  adaptation: NucleusAdaptation;
}

/** The chamber's internal class match: 3-of-a-class ⇒ full, 2 ⇒ minor. Null while inactive. */
export function chamberAdaptation(state: NucleusState | undefined | null, chamber: number): NucleusChamberAdaptation | null {
  if (!state || !isChamberActive(state, chamber)) return null;
  const counts = new Map<CombatClass, number>();
  for (const id of state.chambers[chamber]) {
    const def = nucleusRegistry.get(id!)!;
    counts.set(def.cls, (counts.get(def.cls) ?? 0) + 1);
  }
  let best: CombatClass | null = null;
  let bn = 0;
  for (const [cls, n] of counts) if (n > bn) { bn = n; best = cls; }
  if (!best || bn < NUCLEUS_CHAMBER_SLOTS - 1) return null;
  const tier: NucleusAdaptTier = bn >= NUCLEUS_CHAMBER_SLOTS ? 'full' : 'minor';
  return { cls: best, tier, adaptation: NUCLEUS_ADAPTATIONS[best] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolver — the single entry point the boot fold + Power + renderer read. Identity when
// nothing is active (the golden-safety gate). Effects from every ACTIVE chamber's organs
// (at their grown level) + each chamber's adaptation bonus; mutations for the renderer.
// ─────────────────────────────────────────────────────────────────────────────
export interface ResolvedNucleus {
  active: boolean; // any chamber active
  effects: CardEffect[]; // fold at run boot (empty ⇒ byte-identical)
  power: number; // ≥ 1 — rides the mulligans Power bucket
  mutations: NucleusMutation[]; // every active organ's growth (renderer intensity = count)
  adaptations: NucleusChamberAdaptation[]; // active chamber sets (crown visuals + UI)
}

export function identityNucleus(): ResolvedNucleus {
  return { active: false, effects: [], power: 1, mutations: [], adaptations: [] };
}

export function resolveNucleus(state: NucleusState | undefined | null): ResolvedNucleus {
  const out = identityNucleus();
  if (!state) return out;
  for (let c = 0; c < NUCLEUS_CHAMBERS; c++) {
    if (!isChamberActive(state, c)) continue;
    out.active = true;
    for (const id of state.chambers[c]) {
      const def = nucleusRegistry.get(id!)!;
      const level = Math.max(1, state.grown[id!].level);
      out.effects.push(...organEffects(def, level));
      out.mutations.push(def.mutation);
      out.power *= 1 + def.powerWeight * MULLIGAN_RARITY[def.rarity].powerMult * (1 + NUCLEUS_PER_LEVEL * (level - 1));
    }
    const a = chamberAdaptation(state, c);
    if (a) {
      out.effects.push(...(a.tier === 'full' ? a.adaptation.full : a.adaptation.minor));
      out.power *= 1 + NUCLEUS_ADAPTATION_POWER[a.tier];
      out.adaptations.push(a);
      if (a.tier === 'full') out.mutations.push('crown'); // complete sets visibly crest
    }
  }
  return out;
}

/** The Nucleus's Power multiplier (≥ 1; exactly 1 while nothing is active — golden-safe). */
export function nucleusPower(state: NucleusState | undefined | null): number {
  return resolveNucleus(state).power;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAMBER GATES (§gates) — data-driven requirement rows over a snapshot meta assembles.
// Every requirement is ALWAYS displayed with live progress (the anticipation rule); a future
// requirement axis = one row (extend the snapshot + add a row — nothing else changes).
// ─────────────────────────────────────────────────────────────────────────────
export interface NucleusGateSnapshot {
  campaignStage: number;
  genomeRankTier: number; // 0-based ladder index (core/genomeRank.ts)
  powerScore: number;
  megasSlain: number; // distinct Mega Bosses
  rushBestBoss: number; // deepest single Boss Rush
  mulligansActive: number; // fully-assembled tower organisms
  masteryLevels: number; // Σ tower+hero mastery levels
  molts: number; // prestige cycles
  dailyCompletions: number;
  collectionPct: number; // Bio-Dex discovery 0..1
  ichor: number; // current wallet (chamber 3's price)
}

export interface NucleusGateReq {
  id: string;
  label: string; // player-facing requirement line
  need: number;
  read: (s: NucleusGateSnapshot) => number;
  /** Format the progress pair (defaults to integers; pct for ratios). */
  fmt?: (have: number, need: number) => string;
}

export interface NucleusGate {
  chamber: number; // the chamber this gate opens (1-based index 2..3)
  title: string; // the trial's name — memorable, ceremony-grade
  blurb: string;
  reqs: NucleusGateReq[];
  ichorCost: number; // 0 = no purchase step (chamber 2); chamber 3 pays Ichor ON TOP of reqs
}

const pct = (have: number, need: number): string => `${Math.round(have * 100)}% / ${Math.round(need * 100)}%`;

/** THE gate book. Chamber 1 is born open; these open 2 and 3. */
export const NUCLEUS_GATES: NucleusGate[] = [
  {
    chamber: 2,
    title: 'THE TRIAL OF THE SWARM',
    blurb: 'The second chamber grows only for a commander the whole Hive has learned to trust — proven across the campaign, the gauntlets, and the hunt.',
    ichorCost: 0,
    reqs: [
      { id: 'campaign', label: 'Reach Campaign Stage 40', need: 40, read: (s) => s.campaignStage },
      { id: 'genome', label: 'Attain Genome Rank IV · Mutating', need: 4, read: (s) => s.genomeRankTier },
      { id: 'megas', label: 'Slay 5 distinct Mega Bosses', need: 5, read: (s) => s.megasSlain },
      { id: 'rush', label: 'Fell 8 bosses in one Boss Rush', need: 8, read: (s) => s.rushBestBoss },
      { id: 'mulligans', label: 'Assemble 3 complete tower Mulligans', need: 3, read: (s) => s.mulligansActive },
      { id: 'daily', label: 'Complete 7 Daily Runs', need: 7, read: (s) => s.dailyCompletions },
    ],
  },
  {
    chamber: 3,
    title: 'THE APEX CHAMBER',
    blurb: 'The final chamber is the Hive’s crown — grown once, for the account that has seen the deep game, then paid for in Ichor. A late-game monument.',
    ichorCost: 300,
    reqs: [
      { id: 'campaign', label: 'Reach Campaign Stage 75', need: 75, read: (s) => s.campaignStage },
      { id: 'genome', label: 'Attain Genome Rank VII · Dominant', need: 7, read: (s) => s.genomeRankTier },
      { id: 'power', label: 'Reach 12,000 Power Score', need: 12000, read: (s) => s.powerScore },
      { id: 'megas', label: 'Slay 10 distinct Mega Bosses', need: 10, read: (s) => s.megasSlain },
      { id: 'molts', label: 'Complete 2 Molt cycles', need: 2, read: (s) => s.molts },
      { id: 'mastery', label: 'Accumulate 120 Mastery levels', need: 120, read: (s) => s.masteryLevels },
      { id: 'collection', label: 'Discover 60% of the Bio-Dex', need: 0.6, read: (s) => s.collectionPct, fmt: pct },
    ],
  },
];

export interface NucleusGateProgress {
  gate: NucleusGate;
  rows: { req: NucleusGateReq; have: number; met: boolean; text: string }[];
  reqsMet: boolean; // every requirement satisfied
  ichorMet: boolean; // wallet covers the price (true when free)
  ready: boolean; // reqsMet && ichorMet — the unlock action may fire
}

/** Evaluate a chamber's gate against the live snapshot (UI + meta's unlock action share this). */
export function nucleusGateProgress(chamber: number, snap: NucleusGateSnapshot): NucleusGateProgress | null {
  const gate = NUCLEUS_GATES.find((g) => g.chamber === chamber);
  if (!gate) return null;
  const rows = gate.reqs.map((req) => {
    const have = req.read(snap);
    const met = have >= req.need;
    const text = req.fmt ? req.fmt(have, req.need) : `${Math.floor(have).toLocaleString()} / ${req.need.toLocaleString()}`;
    return { req, have, met, text };
  });
  const reqsMet = rows.every((r) => r.met);
  const ichorMet = snap.ichor >= gate.ichorCost;
  return { gate, rows, reqsMet, ichorMet, ready: reqsMet && ichorMet };
}

// ─────────────────────────────────────────────────────────────────────────────
// Save sanitizer — content is the authority: unknown organ ids drop, levels clamp to the
// rarity cap, chamber refs must point at GROWN organs and stay exclusive (first ref wins),
// unlocked clamps to 1..NUCLEUS_CHAMBERS. Additive-safe; a fresh/garbage blob ⇒ emptyNucleus.
// ─────────────────────────────────────────────────────────────────────────────
export function sanitizeNucleus(raw: unknown): NucleusState {
  const out = emptyNucleus();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { unlocked?: unknown; chambers?: unknown; grown?: unknown };
  if (typeof r.unlocked === 'number' && Number.isFinite(r.unlocked)) {
    out.unlocked = Math.max(1, Math.min(NUCLEUS_CHAMBERS, Math.floor(r.unlocked)));
  }
  if (r.grown && typeof r.grown === 'object') {
    for (const [id, v] of Object.entries(r.grown as Record<string, unknown>)) {
      const def = nucleusRegistry.get(id);
      if (!def || !v || typeof v !== 'object') continue;
      const lvl = (v as { level?: unknown }).level;
      const level = typeof lvl === 'number' && Number.isFinite(lvl) ? Math.max(1, Math.min(organLevelCap(def), Math.floor(lvl))) : 1;
      out.grown[id] = { level };
    }
  }
  const seen = new Set<string>();
  const rows = Array.isArray(r.chambers) ? r.chambers : [];
  for (let c = 0; c < NUCLEUS_CHAMBERS; c++) {
    const row = Array.isArray(rows[c]) ? (rows[c] as unknown[]) : [];
    for (let i = 0; i < NUCLEUS_CHAMBER_SLOTS; i++) {
      const id = row[i];
      if (typeof id !== 'string' || seen.has(id) || !nucleusRegistry.has(id) || !out.grown[id]) continue;
      seen.add(id);
      out.chambers[c][i] = id;
    }
  }
  const adaptedRaw = (raw as { adapted?: unknown }).adapted;
  if (Array.isArray(adaptedRaw)) {
    const adapted = [...new Set(adaptedRaw.filter((v): v is string => typeof v === 'string' && v in COMBAT_CLASSES))];
    if (adapted.length > 0) out.adapted = adapted;
  }
  return out;
}
