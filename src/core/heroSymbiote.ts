// HERO SYMBIOTES (docs/HERO-SYMBIOTES.md) — the HERO wing of the Mulligan pillar, completing the
// grafted-organism trilogy: towers wear Mulligans (mulligan.ts), the Hive Nucleus grows organ
// chambers (nucleus.ts), and every CHAMPION hosts up to three SYMBIOTE SLOTS. Each slot grafts
// THREE organ SPECIES (the canonical Mulligan triple) and does NOTHING until all three seats are
// filled — a fully evolved hero carries NINE living organs. Slot I is born open; slots II/III open
// through per-hero IDENTITY TRIALS (data-driven gates, nucleus-style) plus an Ichor price — the
// deepest per-champion Ichor sink in the game.
//
// NOT equipment: gear is EXTERNAL (account-wide CardEffects → RunModifiers); a symbiote is a
// permanently grafted organism that changes HOW its host fights. The kit vocabulary below is
// BEHAVIOR VERBS ONLY — strike toxins, kill-triggered surges, ability echoes, overheal carapaces,
// brood nurture, AI rewires. By construction it has no damageMult/cooldownMult-style fields, so a
// symbiote can never be a stat-stick duplicate of Hero Equipment (the future-organ contract).
//
// GOLDEN INVARIANT: a fresh account has no symbiotes ⇒ resolveHeroSymbiote returns the identity
// (active:false, kit:null, power 1) ⇒ meta.heroProgress attaches NO symbiote field to HeroMods ⇒
// the sim is byte-identical and Power reads exactly POWER_BASE. Organs are GROWN per hero with
// Gene Essence (each graft is that hero's own organism — the catalog never scales with the
// roster); levels scale the authored DELTAS, never the base. Pure data + helpers (no Game/DOM).

import { Registry } from './registry';
import { COMBAT_CLASSES } from './combatClass';
import { MULLIGAN_RARITY, levelCap } from './mulligan';
import type { MulliganRarity } from './mulligan';
import type { CombatClass, HeroKind, HeroSymbioteKit } from './types';
import { HERO_ORDER } from './config';

export const SYMBIOTE_MARK = '⟡';
export const SYMBIOTE_SLOTS = 3; // slots per hero (I born open, II/III gated)
export const SYMBIOTE_SEATS = 3; // organ seats per slot — the Mulligan triple, verbatim

/** The behavior-verb kit — the ONLY vocabulary a symbiote may speak (types.HeroSymbioteKit;
 *  it lives with the sim types because HeroMods carries it into the run). Every verb changes
 *  how the host FIGHTS at an existing sim seam behind a presence gate. Deliberately free of
 *  raw stat fields — that is equipment's language (the no-duplication contract). */
export type SymbioteKit = HeroSymbioteKit;

/** The visible MUTATION motif an organ grows onto its host (render/heroSymbiotes.ts draws
 *  these procedurally — a new organ picks any existing motif for free). */
export type SymbioteMutation =
  | 'spines' // bladed dorsal quills
  | 'plates' // ossified armor scutes
  | 'tendrils' // slow-waving feeler whips
  | 'veins' // glowing subdermal vasculature
  | 'sacs' // budding symbiotic pods
  | 'eyes' // blinking ocelli
  | 'halo' // a resonant presence ring
  | 'crest'; // the apex crown (adaptations + resonance grow this on top)
export const SYMBIOTE_MUTATIONS: SymbioteMutation[] = ['spines', 'plates', 'tendrils', 'veins', 'sacs', 'eyes', 'halo', 'crest'];

export type SymbioteCategory = 'offensive' | 'utility' | 'biological';
export const SYMBIOTE_CATEGORIES: SymbioteCategory[] = ['offensive', 'utility', 'biological'];
export const SYMBIOTE_CATEGORY_LABEL: Record<SymbioteCategory, string> = {
  offensive: 'Offensive', // killing verbs — toxins, splinters, plague bursts
  utility: 'Utility', // tempo, control, AI rewires, footprint
  biological: 'Biological', // sustain, growth, brood, adaptation
};

export interface SymbioteOrgan {
  id: string;
  name: string;
  category: SymbioteCategory;
  /** Biological CLASS — the SAME six-class taxonomy towers/Mulligans/Nucleus share
   *  (core/combatClass.ts). Three matching classes in a slot = a Complete Hero Adaptation. */
  cls: CombatClass;
  rarity: MulliganRarity; // fixed per species (nucleus-style) — prices the graft, caps levels, scales Power
  desc: string; // what it does, in player words
  flavor: string;
  kit: SymbioteKit; // level-1 verbs; levels scale the DELTAS (never the base)
  mutation: SymbioteMutation; // the visible growth this organ adds to the host
  powerWeight: number; // heuristic Power vehicle (rides the mulligans bucket)
}

export const symbioteRegistry = new Registry<SymbioteOrgan>('symbioteOrgan', {
  idOf: (o) => o.id,
  validate: (o) => {
    const out: string[] = [];
    if (!o.name) out.push(`${o.id}: missing name`);
    if (!o.cls || !(o.cls in COMBAT_CLASSES)) out.push(`${o.id}: missing/unknown class '${o.cls}' — every organ requires a CombatClass (docs/HERO-SYMBIOTES.md §classes)`);
    if (!SYMBIOTE_CATEGORIES.includes(o.category)) out.push(`${o.id}: unknown category '${o.category}'`);
    if (!(o.rarity in MULLIGAN_RARITY)) out.push(`${o.id}: unknown rarity '${o.rarity}'`);
    if (!SYMBIOTE_MUTATIONS.includes(o.mutation)) out.push(`${o.id}: unknown mutation '${o.mutation}' — the renderer needs a known motif`);
    if (o.powerWeight <= 0) out.push(`${o.id}: powerWeight must be > 0 (every organ contributes Power)`);
    if (Object.keys(o.kit).length === 0) out.push(`${o.id}: an organ must DO something (a kit verb is required)`);
    const k = o.kit;
    if (k.killPlague && (k.killPlague.frac <= 0 || k.killPlague.frac > 1)) out.push(`${o.id}: killPlague.frac must be in (0,1]`);
    if (k.overhealShieldFrac !== undefined && (k.overhealShieldFrac <= 0 || k.overhealShieldFrac > 1)) out.push(`${o.id}: overhealShieldFrac must be in (0,1]`);
    if (k.abilityEchoFrac !== undefined && (k.abilityEchoFrac <= 0 || k.abilityEchoFrac >= 1)) out.push(`${o.id}: abilityEchoFrac must be in (0,1)`);
    if (k.killHaste && k.killHaste.mult <= 1) out.push(`${o.id}: killHaste.mult must exceed 1`);
    if (k.reviveSpeedMult !== undefined && k.reviveSpeedMult <= 1) out.push(`${o.id}: reviveSpeedMult must exceed 1`);
    return out;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// THE ORGAN BOOK — 54 species: nine per class, EXACTLY three per class×category cell
// (the coverage test), so every class can complete a slot adaptation THREE different ways,
// a single hero can run a mono-class triple across all three slots, and every category can
// drive a resonance. Species are host-agnostic: the catalog never grows with the hero roster.
// The `_2` arrays are the second wave — registration stays append-only after the base 36.
// ─────────────────────────────────────────────────────────────────────────────
const KINETIC: SymbioteOrgan[] = [
  { id: 'bone_lancets', name: 'Bone Lancets', category: 'offensive', cls: 'Kinetic', rarity: 'common', mutation: 'spines',
    kit: { strikeComponents: [{ type: 'projectile', behavior: 'homing', damage: 6, speed: 320, range: 200 }] }, powerWeight: 0.05,
    desc: 'Every strike sheds a homing bone splinter at a nearby host.', flavor: 'The graft keeps its own quiver. It restocks from your enemies.' },
  { id: 'ram_plates', name: 'Ram Plates', category: 'offensive', cls: 'Kinetic', rarity: 'epic', mutation: 'plates',
    kit: { strikeStatuses: [{ status: 'Fracture', amount: 1 }], killHaste: { mult: 1.25, seconds: 1.2 } }, powerWeight: 0.09,
    desc: 'Strikes Fracture armor; every kill surges the host forward.', flavor: 'Momentum, ossified. It remembers every impact fondly.' },
  { id: 'coiled_tendons', name: 'Coiled Tendons', category: 'utility', cls: 'Kinetic', rarity: 'uncommon', mutation: 'veins',
    kit: { killHaste: { mult: 1.2, seconds: 1.0 } }, powerWeight: 0.055,
    desc: 'Kills wind the springs — a burst of speed and cadence.', flavor: 'It stores violence the way amber stores light.' },
  { id: 'war_ganglion', name: 'War Ganglion', category: 'utility', cls: 'Kinetic', rarity: 'rare', mutation: 'eyes',
    kit: { survival: 'aggressive', killHaste: { mult: 1.12, seconds: 0.8 } }, powerWeight: 0.062,
    desc: 'Rewires the host to relentless aggression — it never disengages, and kills quicken it.', flavor: 'It edits one word out of the host\'s vocabulary: retreat.' },
  { id: 'ossified_lattice', name: 'Ossified Lattice', category: 'biological', cls: 'Kinetic', rarity: 'rare', mutation: 'plates',
    kit: { strikeStatuses: [{ status: 'Fracture', amount: 1 }] }, powerWeight: 0.06,
    desc: 'Bone grows into every wound the host opens — strikes Fracture.', flavor: 'It plants skeletons in other organisms. They always take root.' },
  { id: 'impact_womb', name: 'Impact Womb', category: 'biological', cls: 'Kinetic', rarity: 'legendary', mutation: 'sacs',
    kit: { strikeComponents: [{ type: 'explosion', radius: 60, damage: 9, react: true }] }, powerWeight: 0.115,
    desc: 'Every blow births a concussive shockwave around the target.', flavor: 'Each strike is pregnant with the next disaster.' },
];

const CAUSTIC: SymbioteOrgan[] = [
  { id: 'acid_ducts', name: 'Acid Ducts', category: 'offensive', cls: 'Caustic', rarity: 'common', mutation: 'veins',
    kit: { strikeStatuses: [{ status: 'Corrosion', amount: 2 }] }, powerWeight: 0.05,
    desc: 'Strikes drip deep Corrosion into every wound.', flavor: 'The host\'s knuckles weep. Its enemies dissolve.' },
  { id: 'dissolver_maw', name: 'Dissolver Maw', category: 'offensive', cls: 'Caustic', rarity: 'legendary', mutation: 'sacs',
    kit: { strikeComponents: [{ type: 'pool', radius: 40, dps: 7, seconds: 2.2 }] }, powerWeight: 0.115,
    desc: 'Every strike melts the ground beneath the victim into an acid pool.', flavor: 'Where the host fights, the map is briefly a stomach.' },
  { id: 'reek_vents', name: 'Reek Vents', category: 'utility', cls: 'Caustic', rarity: 'uncommon', mutation: 'tendrils',
    kit: { abilityRadiusMult: 1.09 }, powerWeight: 0.054,
    desc: 'The host\'s ability exhales wider — its footprint swells.', flavor: 'The smell arrives first. The smell is load-bearing.' },
  { id: 'fume_sacs', name: 'Fume Sacs', category: 'utility', cls: 'Caustic', rarity: 'rare', mutation: 'sacs',
    kit: { killPlague: { frac: 0.5, radius: 70 } }, powerWeight: 0.065,
    desc: 'Kills burst half the victim\'s afflictions onto its neighbors.', flavor: 'Every death is a bottle uncorked.' },
  { id: 'tallow_glands', name: 'Tallow Glands', category: 'biological', cls: 'Caustic', rarity: 'uncommon', mutation: 'sacs',
    kit: { reviveSpeedMult: 1.25 }, powerWeight: 0.052,
    desc: 'Rendered fat reknits the fallen host a quarter faster.', flavor: 'It keeps a candle burning inside the corpse. Rude, but effective.' },
  { id: 'solvent_heart', name: 'Solvent Heart', category: 'biological', cls: 'Caustic', rarity: 'epic', mutation: 'veins',
    kit: { strikeStatuses: [{ status: 'Corrosion', amount: 2 }], auraMult: 1.1 }, powerWeight: 0.09,
    desc: 'Strikes corrode, and the host\'s caustic presence reaches deeper.', flavor: 'A second heart that pumps regret into the enemy\'s alloys.' },
];

const VIRAL: SymbioteOrgan[] = [
  { id: 'plague_fangs', name: 'Plague Fangs', category: 'offensive', cls: 'Viral', rarity: 'uncommon', mutation: 'spines',
    kit: { strikeStatuses: [{ status: 'Infection', amount: 2 }] }, powerWeight: 0.056,
    desc: 'Every strike seeds a ramping Infection.', flavor: 'The bite is a formality. The plague was already in the room.' },
  { id: 'burst_cysts', name: 'Burst Cysts', category: 'offensive', cls: 'Viral', rarity: 'epic', mutation: 'sacs',
    kit: { killPlague: { frac: 0.7, radius: 80 } }, powerWeight: 0.09,
    desc: 'Kills detonate most of the victim\'s afflictions across the pack.', flavor: 'It considers every enemy a seed pod that hasn\'t agreed yet.' },
  { id: 'carrier_fleas', name: 'Carrier Fleas', category: 'utility', cls: 'Viral', rarity: 'rare', mutation: 'tendrils',
    kit: { strikeComponents: [{ type: 'chain', jumps: 2, range: 100, damage: 4, falloff: 0.7 }] }, powerWeight: 0.064,
    desc: 'Strikes leap to two nearby hosts — the infection travels.', flavor: 'A cloud of tiny couriers, and every letter is bad news.' },
  { id: 'mist_ovaries', name: 'Mist Ovaries', category: 'utility', cls: 'Viral', rarity: 'common', mutation: 'sacs',
    kit: { strikeComponents: [{ type: 'debuff', status: { kind: 'Infection', amount: 1 }, radius: 60 }] }, powerWeight: 0.048,
    desc: 'Every strike blooms a brief infectious mist around the target.', flavor: 'It exhales its children. They are very sociable.' },
  { id: 'gestation_sac', name: 'Gestation Sac', category: 'biological', cls: 'Viral', rarity: 'rare', mutation: 'sacs',
    kit: { summonMult: { hpMult: 1.2, damageMult: 1.15 } }, powerWeight: 0.062,
    desc: 'The host\'s summoned organisms gestate stronger and meaner.', flavor: 'It edits the brood before the brood is born.' },
  { id: 'omen_marrow', name: 'Omen Marrow', category: 'biological', cls: 'Viral', rarity: 'ascendant', mutation: 'veins',
    kit: { killPlague: { frac: 1.0, radius: 100 }, strikeStatuses: [{ status: 'Infection', amount: 1 }] }, powerWeight: 0.16,
    desc: 'The apex plague organ — strikes infect, kills detonate EVERYTHING outward.', flavor: 'It does not spread disease. It spreads inevitability.' },
];

const NEURAL: SymbioteOrgan[] = [
  { id: 'synapse_barbs', name: 'Synapse Barbs', category: 'offensive', cls: 'Neural', rarity: 'rare', mutation: 'spines',
    kit: { strikeStatuses: [{ status: 'Disruption', amount: 1.5 }] }, powerWeight: 0.064,
    desc: 'Strikes Disrupt — slowed, softened, easier prey for everything.', flavor: 'It whispers static into the enemy\'s spine.' },
  { id: 'stasis_needles', name: 'Stasis Needles', category: 'offensive', cls: 'Neural', rarity: 'legendary', mutation: 'spines',
    kit: { strikeStatuses: [{ status: 'Freeze', amount: 0.35 }] }, powerWeight: 0.112,
    desc: 'Strikes inject a heartbeat of total stasis.', flavor: 'A very small forever, administered repeatedly.' },
  { id: 'reflex_web', name: 'Reflex Web', category: 'utility', cls: 'Neural', rarity: 'uncommon', mutation: 'veins',
    kit: { survival: 'evasive', killHaste: { mult: 1.15, seconds: 0.8 } }, powerWeight: 0.055,
    desc: 'Rewires the host to evasive instincts; kills sharpen its reflexes.', flavor: 'It practices dodging in the host\'s dreams.' },
  { id: 'echo_cortex', name: 'Echo Cortex', category: 'utility', cls: 'Neural', rarity: 'epic', mutation: 'eyes',
    kit: { abilityEchoFrac: 0.3 }, powerWeight: 0.092,
    desc: 'The signature ability re-casts a 30% echo of itself.', flavor: 'A second brain that agrees enthusiastically, slightly late.' },
  { id: 'myelin_bloom', name: 'Myelin Bloom', category: 'biological', cls: 'Neural', rarity: 'common', mutation: 'veins',
    kit: { abilityRadiusMult: 1.07 }, powerWeight: 0.047,
    desc: 'The mind reaches further — the ability\'s footprint grows.', flavor: 'Thought, insulated, travels farther than it should.' },
  { id: 'dream_polyp', name: 'Dream Polyp', category: 'biological', cls: 'Neural', rarity: 'epic', mutation: 'eyes',
    kit: { abilityEchoFrac: 0.2, strikeStatuses: [{ status: 'Disruption', amount: 0.8 }] }, powerWeight: 0.088,
    desc: 'Strikes Disrupt, and the ability murmurs a 20% echo.', flavor: 'It naps through the war and fights in its sleep.' },
];

const VITAL: SymbioteOrgan[] = [
  { id: 'leech_quills', name: 'Leech Quills', category: 'offensive', cls: 'Vital', rarity: 'uncommon', mutation: 'spines',
    kit: { strikeComponents: [{ type: 'heal', self: 2 }] }, powerWeight: 0.054,
    desc: 'Every strike drinks — the host heals as it fights.', flavor: 'A thousand small mouths with one shared opinion of you.' },
  { id: 'crimson_root', name: 'Crimson Root', category: 'offensive', cls: 'Vital', rarity: 'epic', mutation: 'tendrils',
    kit: { strikeComponents: [{ type: 'aura', radius: 60, damage: 5 }, { type: 'heal', self: 2 }] }, powerWeight: 0.091,
    desc: 'Strikes lash everything nearby and feed the host.', flavor: 'It harvests in a circle. It tithes the host generously.' },
  { id: 'sap_carapace', name: 'Sap Carapace', category: 'utility', cls: 'Vital', rarity: 'rare', mutation: 'plates',
    kit: { overhealShieldFrac: 0.5 }, powerWeight: 0.063,
    desc: 'Half of all overflow healing hardens into a living shield.', flavor: 'Wasted kindness annoys it, so it invented armor made of surplus.' },
  { id: 'cocoon_glands', name: 'Cocoon Glands', category: 'utility', cls: 'Vital', rarity: 'legendary', mutation: 'sacs',
    kit: { reviveSpeedMult: 1.6 }, powerWeight: 0.11,
    desc: 'A downed host reknits dramatically faster inside its cocoon.', flavor: 'Death is reframed as a scheduled maintenance window.' },
  { id: 'brood_teats', name: 'Brood Teats', category: 'biological', cls: 'Vital', rarity: 'common', mutation: 'sacs',
    kit: { summonMult: { hpMult: 1.15, damageMult: 1.1 } }, powerWeight: 0.048,
    desc: 'The host\'s summoned organisms are nursed tougher and fiercer.', flavor: 'Everything it feeds grows up grateful and enormous.' },
  { id: 'genesis_pith', name: 'Genesis Pith', category: 'biological', cls: 'Vital', rarity: 'ascendant', mutation: 'veins',
    kit: { overhealShieldFrac: 0.4, reviveSpeedMult: 1.3 }, powerWeight: 0.158,
    desc: 'The apex vital organ — overheal armors, and the host barely stays down.', flavor: 'It remembers being the first cell. It refuses to be the last.' },
];

const RESONANT: SymbioteOrgan[] = [
  { id: 'chord_talons', name: 'Chord Talons', category: 'offensive', cls: 'Resonant', rarity: 'rare', mutation: 'spines',
    kit: { strikeComponents: [{ type: 'chain', jumps: 3, range: 120, damage: 5, falloff: 0.75 }] }, powerWeight: 0.066,
    desc: 'Strikes ring outward — harmonic arcs leap across the line.', flavor: 'Every hit is a note. The chorus is casualties.' },
  { id: 'crescendo_core', name: 'Crescendo Core', category: 'offensive', cls: 'Resonant', rarity: 'ascendant', mutation: 'halo',
    kit: { abilityEchoFrac: 0.35, abilityRadiusMult: 1.1 }, powerWeight: 0.16,
    desc: 'The apex resonant organ — the ability swells wider and answers itself.', flavor: 'It conducts the host like a symphony with a body count.' },
  { id: 'drone_membrane', name: 'Drone Membrane', category: 'utility', cls: 'Resonant', rarity: 'common', mutation: 'halo',
    kit: { auraMult: 1.08 }, powerWeight: 0.047,
    desc: 'The host\'s presence hums stronger and farther.', flavor: 'One sustained note, pitched exactly at loyalty.' },
  { id: 'beacon_frill', name: 'Beacon Frill', category: 'utility', cls: 'Resonant', rarity: 'epic', mutation: 'halo',
    kit: { auraMult: 1.14, abilityRadiusMult: 1.06 }, powerWeight: 0.09,
    desc: 'Presence and ability both broadcast wider — a living beacon.', flavor: 'Armies navigate by it. So does the argument.' },
  { id: 'hum_chamber', name: 'Hum Chamber', category: 'biological', cls: 'Resonant', rarity: 'uncommon', mutation: 'sacs',
    kit: { killHaste: { mult: 1.18, seconds: 1.0 } }, powerWeight: 0.053,
    desc: 'Every kill quickens the rhythm — the host fights on the beat.', flavor: 'It keeps tempo with a drum made of outcomes.' },
  { id: 'worldsong_organ', name: 'Worldsong Organ', category: 'biological', cls: 'Resonant', rarity: 'legendary', mutation: 'halo',
    kit: { auraMult: 1.12, abilityEchoFrac: 0.15 }, powerWeight: 0.113,
    desc: 'The presence deepens and the ability hums a soft echo.', flavor: 'The Hive taught it one song. It taught the song ambition.' },
];

// ── The second wave: one MORE species per class×category cell (2 → 3 everywhere) ────────────
const KINETIC_2: SymbioteOrgan[] = [
  { id: 'shatterhorn', name: 'Shatterhorn', category: 'offensive', cls: 'Kinetic', rarity: 'rare', mutation: 'spines',
    kit: { strikeComponents: [{ type: 'explosion', radius: 50, damage: 6 }] }, powerWeight: 0.065,
    desc: 'Every strike detonates a concussive burst around the target.', flavor: 'The horn breaks on impact. The horn is designed to break on impact.' },
  { id: 'piston_haunches', name: 'Piston Haunches', category: 'utility', cls: 'Kinetic', rarity: 'uncommon', mutation: 'plates',
    kit: { killHaste: { mult: 1.18, seconds: 0.9 } }, powerWeight: 0.054,
    desc: 'Kills compress the springs — a short surge of speed and cadence.', flavor: 'Hydraulics grown from gristle. The warranty is a threat.' },
  { id: 'living_ballast', name: 'Living Ballast', category: 'biological', cls: 'Kinetic', rarity: 'epic', mutation: 'plates',
    kit: { strikeStatuses: [{ status: 'Fracture', amount: 1 }], reviveSpeedMult: 1.15 }, powerWeight: 0.088,
    desc: 'Strikes Fracture armor, and the host\'s heavy frame reknits faster.', flavor: 'It stores mass the way misers store coin — and spends it as violence.' },
];

const CAUSTIC_2: SymbioteOrgan[] = [
  { id: 'spitfire_ducts', name: 'Spitfire Ducts', category: 'offensive', cls: 'Caustic', rarity: 'epic', mutation: 'veins',
    kit: { strikeComponents: [{ type: 'projectile', behavior: 'splash', damage: 5, speed: 300, range: 200, splash: 40 }] }, powerWeight: 0.09,
    desc: 'Every strike spits a caustic glob that bursts on arrival.', flavor: 'The host learns to salivate strategically.' },
  { id: 'slag_trail', name: 'Slag Trail', category: 'utility', cls: 'Caustic', rarity: 'rare', mutation: 'sacs',
    kit: { strikeComponents: [{ type: 'pool', radius: 30, dps: 4, seconds: 1.6 }] }, powerWeight: 0.066,
    desc: 'Strikes leave small smoldering acid slicks underfoot.', flavor: 'It never cleans up after itself. That is the entire strategy.' },
  { id: 'pickled_organs', name: 'Pickled Organs', category: 'biological', cls: 'Caustic', rarity: 'common', mutation: 'sacs',
    kit: { reviveSpeedMult: 1.15 }, powerWeight: 0.046,
    desc: 'Preserved viscera reknit the fallen host measurably faster.', flavor: 'Brined, sealed, and extremely reluctant to spoil.' },
];

const VIRAL_2: SymbioteOrgan[] = [
  { id: 'fever_spurs', name: 'Fever Spurs', category: 'offensive', cls: 'Viral', rarity: 'rare', mutation: 'spines',
    kit: { strikeStatuses: [{ status: 'Infection', amount: 1 }], killHaste: { mult: 1.15, seconds: 0.8 } }, powerWeight: 0.067,
    desc: 'Strikes infect, and every kill spikes the host\'s fever-tempo.', flavor: 'The temperature is not a symptom. It is a schedule.' },
  { id: 'whisper_phage', name: 'Whisper Phage', category: 'utility', cls: 'Viral', rarity: 'epic', mutation: 'tendrils',
    kit: { killPlague: { frac: 0.4, radius: 90 } }, powerWeight: 0.086,
    desc: 'Kills exhale a wide, quiet burst of the victim\'s afflictions.', flavor: 'It spreads rumors between immune systems. All of them true.' },
  { id: 'chrysalis_womb', name: 'Chrysalis Womb', category: 'biological', cls: 'Viral', rarity: 'legendary', mutation: 'sacs',
    kit: { summonMult: { hpMult: 1.35, damageMult: 1.25 } }, powerWeight: 0.112,
    desc: 'The host\'s summoned organisms emerge dramatically harder and hungrier.', flavor: 'Every larva gets a second draft. The editor is merciless.' },
];

const NEURAL_2: SymbioteOrgan[] = [
  { id: 'verdict_spike', name: 'Verdict Spike', category: 'offensive', cls: 'Neural', rarity: 'epic', mutation: 'spines',
    kit: { strikeStatuses: [{ status: 'Disruption', amount: 1.2 }], abilityRadiusMult: 1.05 }, powerWeight: 0.089,
    desc: 'Strikes Disrupt, and the mind\'s reach widens slightly.', flavor: 'It renders judgment through the spinal column, skipping the appeal.' },
  { id: 'premonition_knot', name: 'Premonition Knot', category: 'utility', cls: 'Neural', rarity: 'rare', mutation: 'eyes',
    kit: { abilityEchoFrac: 0.15, survival: 'cautious' }, powerWeight: 0.064,
    desc: 'The host grows careful, and its ability murmurs a 15% echo.', flavor: 'It saw this fight last week. It has notes.' },
  { id: 'axon_vines', name: 'Axon Vines', category: 'biological', cls: 'Neural', rarity: 'uncommon', mutation: 'veins',
    kit: { abilityRadiusMult: 1.08 }, powerWeight: 0.053,
    desc: 'Grafted nerve-creepers stretch the ability\'s footprint.', flavor: 'Thought takes root in the host, then keeps growing past the fence.' },
];

const VITAL_2: SymbioteOrgan[] = [
  { id: 'butcher_ivy', name: 'Butcher Ivy', category: 'offensive', cls: 'Vital', rarity: 'rare', mutation: 'tendrils',
    kit: { strikeComponents: [{ type: 'aura', radius: 52, damage: 4 }, { type: 'heal', self: 1 }] }, powerWeight: 0.066,
    desc: 'Strikes lash everything close and sip a little back.', flavor: 'It prunes the battlefield. The clippings are dinner.' },
  { id: 'amber_heart', name: 'Amber Heart', category: 'utility', cls: 'Vital', rarity: 'epic', mutation: 'sacs',
    kit: { overhealShieldFrac: 0.35, reviveSpeedMult: 1.1 }, powerWeight: 0.087,
    desc: 'Overflow healing hardens to armor, and the host rises a little sooner.', flavor: 'Everything it cannot spend, it fossilizes for later.' },
  { id: 'balm_ducts', name: 'Balm Ducts', category: 'biological', cls: 'Vital', rarity: 'uncommon', mutation: 'veins',
    kit: { overhealShieldFrac: 0.25 }, powerWeight: 0.052,
    desc: 'A quarter of overflow healing sets into a living shield.', flavor: 'It bottles mercy at the source and ages it into armor.' },
];

const RESONANT_2: SymbioteOrgan[] = [
  { id: 'tocsin_barbs', name: 'Tocsin Barbs', category: 'offensive', cls: 'Resonant', rarity: 'uncommon', mutation: 'spines',
    kit: { strikeComponents: [{ type: 'chain', jumps: 2, range: 110, damage: 4, falloff: 0.75 }] }, powerWeight: 0.056,
    desc: 'Strikes toll outward — alarm arcs leap to nearby hosts.', flavor: 'Every hit rings the bell. The bell is barbed.' },
  { id: 'lighthouse_gland', name: 'Lighthouse Gland', category: 'utility', cls: 'Resonant', rarity: 'legendary', mutation: 'halo',
    kit: { auraMult: 1.16 }, powerWeight: 0.11,
    desc: 'The host\'s presence sweeps far beyond its body.', flavor: 'It turns slowly inside the ribcage, looking for ships to ruin.' },
  { id: 'chorus_marrow', name: 'Chorus Marrow', category: 'biological', cls: 'Resonant', rarity: 'common', mutation: 'veins',
    kit: { auraMult: 1.05 }, powerWeight: 0.045,
    desc: 'The bones hum along — presence carries a little further.', flavor: 'Even its skeleton refuses to sit out the song.' },
];

symbioteRegistry.registerAll([
  ...KINETIC, ...CAUSTIC, ...VIRAL, ...NEURAL, ...VITAL, ...RESONANT,
  ...KINETIC_2, ...CAUSTIC_2, ...VIRAL_2, ...NEURAL_2, ...VITAL_2, ...RESONANT_2,
]);

/** Organs of a class / category (UI grouping, collections, the recommender). */
export function symbiotesByClass(cls: CombatClass): SymbioteOrgan[] {
  return symbioteRegistry.all().filter((o) => o.cls === cls);
}
export function symbiotesByCategory(cat: SymbioteCategory): SymbioteOrgan[] {
  return symbioteRegistry.all().filter((o) => o.category === cat);
}

// ─────────────────────────────────────────────────────────────────────────────
// Level scaling + graft/upgrade economy — Gene Essence (the unified gene currency; slot
// UNLOCKS are the Ichor sink). Kit DELTAS scale with level exactly like Mulligan/Nucleus
// deltas; strikeComponents are flat capabilities (like extraProjectiles — never scaled).
// ─────────────────────────────────────────────────────────────────────────────
export const SYMBIOTE_PER_LEVEL = 0.05; // each level adds 5% of the authored delta

export function symbioteLevelCap(o: SymbioteOrgan): number {
  return levelCap(o.rarity);
}

/** An organ's kit AT a level — amounts/fracs scale, mult deltas scale, capabilities pass. */
export function symbioteKitAt(o: SymbioteOrgan, level: number): SymbioteKit {
  const s = 1 + SYMBIOTE_PER_LEVEL * (Math.max(1, level) - 1);
  if (s === 1) return o.kit;
  const k = o.kit;
  const out: SymbioteKit = {};
  if (k.strikeStatuses) out.strikeStatuses = k.strikeStatuses.map((st) => ({ status: st.status, amount: st.amount * s }));
  if (k.strikeComponents) out.strikeComponents = k.strikeComponents;
  if (k.killPlague) out.killPlague = { frac: Math.min(1, k.killPlague.frac * s), radius: k.killPlague.radius };
  if (k.killHaste) out.killHaste = { mult: 1 + (k.killHaste.mult - 1) * s, seconds: k.killHaste.seconds };
  if (k.abilityEchoFrac !== undefined) out.abilityEchoFrac = Math.min(0.9, k.abilityEchoFrac * s);
  if (k.abilityRadiusMult !== undefined) out.abilityRadiusMult = 1 + (k.abilityRadiusMult - 1) * s;
  if (k.auraMult !== undefined) out.auraMult = 1 + (k.auraMult - 1) * s;
  if (k.overhealShieldFrac !== undefined) out.overhealShieldFrac = Math.min(1, k.overhealShieldFrac * s);
  if (k.reviveSpeedMult !== undefined) out.reviveSpeedMult = 1 + (k.reviveSpeedMult - 1) * s;
  if (k.summonMult) out.summonMult = { hpMult: 1 + (k.summonMult.hpMult - 1) * s, damageMult: 1 + (k.summonMult.damageMult - 1) * s };
  if (k.survival) out.survival = k.survival;
  return out;
}

/** Fold `add` into `into` (the resolver's merge): lists concat, fracs add (capped), mults
 *  multiply, surges keep their strongest form, the last survival rewire wins. */
export function mergeSymbioteKit(into: SymbioteKit, add: SymbioteKit): void {
  if (add.strikeStatuses) into.strikeStatuses = [...(into.strikeStatuses ?? []), ...add.strikeStatuses];
  if (add.strikeComponents) into.strikeComponents = [...(into.strikeComponents ?? []), ...add.strikeComponents];
  if (add.killPlague) {
    const cur = into.killPlague;
    into.killPlague = { frac: Math.min(1, Math.max(cur?.frac ?? 0, add.killPlague.frac)), radius: Math.max(cur?.radius ?? 0, add.killPlague.radius) };
  }
  if (add.killHaste) {
    const cur = into.killHaste;
    into.killHaste = { mult: Math.max(cur?.mult ?? 1, add.killHaste.mult), seconds: Math.max(cur?.seconds ?? 0, add.killHaste.seconds) };
  }
  if (add.abilityEchoFrac) into.abilityEchoFrac = Math.min(0.9, (into.abilityEchoFrac ?? 0) + add.abilityEchoFrac);
  if (add.abilityRadiusMult) into.abilityRadiusMult = (into.abilityRadiusMult ?? 1) * add.abilityRadiusMult;
  if (add.auraMult) into.auraMult = (into.auraMult ?? 1) * add.auraMult;
  if (add.overhealShieldFrac) into.overhealShieldFrac = Math.min(1, (into.overhealShieldFrac ?? 0) + add.overhealShieldFrac);
  if (add.reviveSpeedMult) into.reviveSpeedMult = (into.reviveSpeedMult ?? 1) * add.reviveSpeedMult;
  if (add.summonMult) {
    const cur = into.summonMult ?? { hpMult: 1, damageMult: 1 };
    into.summonMult = { hpMult: cur.hpMult * add.summonMult.hpMult, damageMult: cur.damageMult * add.summonMult.damageMult };
  }
  if (add.survival) into.survival = add.survival;
}

/** Gene Essence price to GRAFT an organ into a hero (permanent, per host — the deep sink). */
export function symbioteGraftCost(o: SymbioteOrgan): number {
  return 180 * Math.pow(2, MULLIGAN_RARITY[o.rarity].tier); // 180/360/720/1440/2880/5760
}
/** Gene Essence price for level → level+1 (the Nucleus curve, symbiote-tuned). */
export function symbioteUpgradeCost(o: SymbioteOrgan, level: number): number {
  return Math.round(32 * (MULLIGAN_RARITY[o.rarity].tier + 1) * Math.pow(1.35, Math.max(0, level - 1)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Save shape (saveStore imports these) — one state per HOST hero: grafted organs are a
// per-hero dex (species id → level); slots hold organ ids. Within a host an organ species
// occupies at most ONE seat (§exclusivity per host); other heroes grow their OWN instance.
// ─────────────────────────────────────────────────────────────────────────────
export interface HeroSymbioteState {
  unlocked: number; // slots open (1..SYMBIOTE_SLOTS; slot I is always open)
  slots: (string | null)[][]; // [slot][seat] → grafted organ id
  grown: Record<string, { level: number }>; // organ id → this host's graft level (the dex)
  /** LIFETIME ledgers (never confiscated by re-slotting): classes fully adapted on this host,
   *  resonances witnessed on this host, and whether the host ever reached full evolution. */
  adapted?: string[];
  resonated?: string[];
  evolved?: boolean;
}

export function emptyHeroSymbiote(): HeroSymbioteState {
  return {
    unlocked: 1,
    slots: Array.from({ length: SYMBIOTE_SLOTS }, () => Array.from({ length: SYMBIOTE_SEATS }, () => null)),
    grown: {},
  };
}

/** Which slot/seat currently hosts an organ on this hero (§exclusivity) — null if unseated. */
export function symbioteSeat(state: HeroSymbioteState, organId: string): { slot: number; seat: number } | null {
  for (let s = 0; s < SYMBIOTE_SLOTS; s++) {
    const row = state.slots[s];
    if (!row) continue;
    for (let i = 0; i < SYMBIOTE_SEATS; i++) if (row[i] === organId) return { slot: s, seat: i };
  }
  return null;
}

/** A slot is ACTIVE only when unlocked and all three seats hold known, GRAFTED organs. */
export function isSlotActive(state: HeroSymbioteState | undefined | null, slot: number): boolean {
  if (!state || slot >= (state.unlocked ?? 0)) return false;
  const row = state.slots?.[slot];
  if (!row || row.length < SYMBIOTE_SEATS) return false;
  for (let i = 0; i < SYMBIOTE_SEATS; i++) {
    const id = row[i];
    if (!id || !symbioteRegistry.has(id) || !state.grown[id]) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE HERO ADAPTATION (§adaptations) — the slot set bonus. Three organs of ONE class in
// an active slot ⇒ the FULL adaptation (a CAPABILITY — new mechanics, never number tweaks);
// exactly two ⇒ the MINOR one. Grants speak the same behavior-verb kit.
// ─────────────────────────────────────────────────────────────────────────────
export type SymbioteAdaptTier = 'full' | 'minor';
export const SYMBIOTE_ADAPTATION_POWER: Record<SymbioteAdaptTier, number> = { full: 0.06, minor: 0.025 };

export interface SymbioteAdaptation {
  cls: CombatClass;
  title: string;
  fullDesc: string;
  minorDesc: string;
  full: SymbioteKit;
  minor: SymbioteKit;
}

export const SYMBIOTE_ADAPTATIONS: Record<CombatClass, SymbioteAdaptation> = {
  Kinetic: {
    cls: 'Kinetic', title: 'Ballistic Physiology',
    fullDesc: 'Every blow shockwaves, and kills surge the host onward.',
    minorDesc: 'Kills briefly surge the host.',
    full: { strikeComponents: [{ type: 'explosion', radius: 52, damage: 7, react: true }], killHaste: { mult: 1.2, seconds: 1.0 } },
    minor: { killHaste: { mult: 1.12, seconds: 0.8 } },
  },
  Caustic: {
    cls: 'Caustic', title: 'Dissolving Touch',
    fullDesc: 'Strikes corrode deeply and melt the ground into acid.',
    minorDesc: 'Strikes corrode.',
    full: { strikeStatuses: [{ status: 'Corrosion', amount: 2 }], strikeComponents: [{ type: 'pool', radius: 32, dps: 4, seconds: 1.6 }] },
    minor: { strikeStatuses: [{ status: 'Corrosion', amount: 1 }] },
  },
  Viral: {
    cls: 'Viral', title: 'Pandemic Vector',
    fullDesc: 'The host\'s kills detonate the victim\'s afflictions across the pack.',
    minorDesc: 'Kills leak a share of the victim\'s afflictions.',
    full: { killPlague: { frac: 0.8, radius: 90 } },
    minor: { killPlague: { frac: 0.35, radius: 60 } },
  },
  Neural: {
    cls: 'Neural', title: 'Echoing Mind',
    fullDesc: 'The signature ability answers itself with a 25% echo.',
    minorDesc: 'The ability hums a 10% echo.',
    full: { abilityEchoFrac: 0.25 },
    minor: { abilityEchoFrac: 0.1 },
  },
  Vital: {
    cls: 'Vital', title: 'Second Genesis',
    fullDesc: 'Overflow healing armors the host, and it barely stays down.',
    minorDesc: 'The host recovers from downing faster.',
    full: { overhealShieldFrac: 0.35, reviveSpeedMult: 1.35 },
    minor: { reviveSpeedMult: 1.15 },
  },
  Resonant: {
    cls: 'Resonant', title: 'Chorus Body',
    fullDesc: 'Presence and ability both swell — the host broadcasts.',
    minorDesc: 'The host\'s presence hums stronger.',
    full: { auraMult: 1.15, abilityRadiusMult: 1.08 },
    minor: { auraMult: 1.06 },
  },
};

export interface SlotAdaptation {
  slot: number;
  cls: CombatClass;
  tier: SymbioteAdaptTier;
  adaptation: SymbioteAdaptation;
}

/** The slot's internal class match: 3-of-a-class ⇒ full, exactly 2 ⇒ minor. Null while inactive. */
export function slotAdaptation(state: HeroSymbioteState | undefined | null, slot: number): SlotAdaptation | null {
  if (!state || !isSlotActive(state, slot)) return null;
  const counts = new Map<CombatClass, number>();
  for (const id of state.slots[slot]) {
    const def = symbioteRegistry.get(id!)!;
    counts.set(def.cls, (counts.get(def.cls) ?? 0) + 1);
  }
  let best: CombatClass | null = null;
  let bn = 0;
  for (const [cls, n] of counts) if (n > bn) { bn = n; best = cls; }
  if (!best || bn < SYMBIOTE_SEATS - 1) return null;
  const tier: SymbioteAdaptTier = bn >= SYMBIOTE_SEATS ? 'full' : 'minor';
  return { slot, cls: best, tier, adaptation: SYMBIOTE_ADAPTATIONS[best] };
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-SLOT RESONANCE (§resonance) — the crown of a FULLY evolved hero (all three slots
// active). The nine organs' CATEGORY census picks the resonance: ≥6 of one category ⇒ its
// pure apex; a perfect 3/3/3 ⇒ the Trinity; anything else ⇒ the pair of the two leading
// categories. Every complete hero resonates (the crown guarantee).
// ─────────────────────────────────────────────────────────────────────────────
export const SYMBIOTE_RESONANCE_POWER = 0.06;

export interface SymbioteResonance {
  id: string;
  name: string;
  desc: string;
  flavor: string;
  kit: SymbioteKit;
}

export const SYMBIOTE_RESONANCES: SymbioteResonance[] = [
  { id: 'apex_predator', name: 'Apex Predator', desc: 'Kills surge the host and detonate the victim\'s afflictions — the hunt feeds itself.', flavor: 'The food chain has been renegotiated. Unilaterally.',
    kit: { killHaste: { mult: 1.3, seconds: 1.5 }, killPlague: { frac: 0.5, radius: 80 } } },
  { id: 'overmind_symbiont', name: 'Overmind Symbiont', desc: 'The ability swells wider and answers itself with a deep echo.', flavor: 'Two minds, one appetite, zero hesitation.',
    kit: { abilityEchoFrac: 0.2, abilityRadiusMult: 1.12 } },
  { id: 'living_bastion', name: 'Living Bastion', desc: 'Overheal armors the host, downing barely holds it, and its brood hardens.', flavor: 'A monument that bleeds, briefly, then reconsiders.',
    kit: { overhealShieldFrac: 0.35, reviveSpeedMult: 1.4, summonMult: { hpMult: 1.2, damageMult: 1.2 } } },
  { id: 'stormfront', name: 'Stormfront Organism', desc: 'Kills quicken the host while its ability reaches wider — momentum with a footprint.', flavor: 'Weather, weaponized and loyal.',
    kit: { killHaste: { mult: 1.2, seconds: 1.2 }, abilityRadiusMult: 1.08 } },
  { id: 'red_harvest', name: 'Red Harvest', desc: 'Strikes feed the host and kills seed the plague — violence composts instantly.', flavor: 'Nothing is wasted. Especially not you.',
    kit: { strikeComponents: [{ type: 'heal', self: 2 }], killPlague: { frac: 0.4, radius: 70 } } },
  { id: 'deep_symbiosis', name: 'Deep Symbiosis', desc: 'The presence swells and overflow healing armors the host — a caretaker made fortress.', flavor: 'It holds the line the way roots hold a mountain.',
    kit: { auraMult: 1.1, overhealShieldFrac: 0.25 } },
  { id: 'trinity_organism', name: 'Trinity Organism', desc: 'Perfect balance — tempo, footprint, and carapace in one organism.', flavor: 'Three answers braided into one argument.',
    kit: { killHaste: { mult: 1.1, seconds: 1.0 }, abilityRadiusMult: 1.05, overhealShieldFrac: 0.15 } },
];

const RESONANCE_BY_ID = new Map(SYMBIOTE_RESONANCES.map((r) => [r.id, r] as const));
export function resonanceById(id: string): SymbioteResonance | undefined {
  return RESONANCE_BY_ID.get(id);
}
/** Pure-category → resonance id (offensive/utility/biological), pairs, and the trinity. */
const PURE_RESONANCE: Record<SymbioteCategory, string> = { offensive: 'apex_predator', utility: 'overmind_symbiont', biological: 'living_bastion' };
const PAIR_RESONANCE: Record<string, string> = {
  'offensive+utility': 'stormfront',
  'offensive+biological': 'red_harvest',
  'utility+biological': 'deep_symbiosis',
};

/** The resonance a state's nine organs produce — null unless ALL THREE slots are active. */
export function resonanceOf(state: HeroSymbioteState | undefined | null): SymbioteResonance | null {
  if (!state) return null;
  for (let s = 0; s < SYMBIOTE_SLOTS; s++) if (!isSlotActive(state, s)) return null;
  const counts: Record<SymbioteCategory, number> = { offensive: 0, utility: 0, biological: 0 };
  for (let s = 0; s < SYMBIOTE_SLOTS; s++) {
    for (const id of state.slots[s]) counts[symbioteRegistry.get(id!)!.category]++;
  }
  const order = SYMBIOTE_CATEGORIES.slice().sort((a, b) => counts[b] - counts[a]); // stable: category order breaks ties
  if (counts[order[0]] >= 6) return RESONANCE_BY_ID.get(PURE_RESONANCE[order[0]])!;
  if (counts[order[0]] === 3 && counts[order[1]] === 3 && counts[order[2]] === 3) return RESONANCE_BY_ID.get('trinity_organism')!;
  const pairKey = [order[0], order[1]].sort((a, b) => SYMBIOTE_CATEGORIES.indexOf(a) - SYMBIOTE_CATEGORIES.indexOf(b)).join('+');
  return RESONANCE_BY_ID.get(PAIR_RESONANCE[pairKey])!;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolver — the single entry point meta's fold + Power + the renderer read. Identity when
// nothing is active (the golden-safety gate): kit null, power exactly 1.
// ─────────────────────────────────────────────────────────────────────────────
export interface ResolvedHeroSymbiote {
  active: boolean; // any slot fully grafted
  slotsActive: number; // 0..3 — also the host's visual mutation stage
  kit: SymbioteKit | null; // merged organs + adaptations + resonance (null while inactive)
  adaptations: SlotAdaptation[];
  resonance: SymbioteResonance | null;
  power: number; // ≥ 1 — rides the mulligans Power bucket; exactly 1 while inactive
  fx: SymbioteMutation[]; // every active organ's motif (renderer intensity = count)
  evolved: boolean; // all nine seats grafted
}

export function identityHeroSymbiote(): ResolvedHeroSymbiote {
  return { active: false, slotsActive: 0, kit: null, adaptations: [], resonance: null, power: 1, fx: [], evolved: false };
}

export function resolveHeroSymbiote(state: HeroSymbioteState | undefined | null): ResolvedHeroSymbiote {
  const out = identityHeroSymbiote();
  if (!state) return out;
  const kit: SymbioteKit = {};
  for (let s = 0; s < SYMBIOTE_SLOTS; s++) {
    if (!isSlotActive(state, s)) continue;
    out.active = true;
    out.slotsActive++;
    for (const id of state.slots[s]) {
      const def = symbioteRegistry.get(id!)!;
      const level = Math.max(1, state.grown[id!].level);
      mergeSymbioteKit(kit, symbioteKitAt(def, level));
      out.fx.push(def.mutation);
      out.power *= 1 + def.powerWeight * MULLIGAN_RARITY[def.rarity].powerMult * (1 + SYMBIOTE_PER_LEVEL * (level - 1));
    }
    const a = slotAdaptation(state, s);
    if (a) {
      mergeSymbioteKit(kit, a.tier === 'full' ? a.adaptation.full : a.adaptation.minor);
      out.power *= 1 + SYMBIOTE_ADAPTATION_POWER[a.tier];
      out.adaptations.push(a);
      if (a.tier === 'full') out.fx.push('crest'); // complete adaptations visibly crest
    }
  }
  const res = resonanceOf(state);
  if (res) {
    mergeSymbioteKit(kit, res.kit);
    out.power *= 1 + SYMBIOTE_RESONANCE_POWER;
    out.resonance = res;
    out.fx.push('crest');
  }
  out.evolved = out.slotsActive >= SYMBIOTE_SLOTS;
  if (out.active) out.kit = kit;
  return out;
}

/** A hero's symbiote Power multiplier (≥ 1; exactly 1 while nothing is active — golden-safe). */
export function heroSymbiotePower(state: HeroSymbioteState | undefined | null): number {
  return resolveHeroSymbiote(state).power;
}
/** Roster Power across every hero's symbiotes (each ≥ 1) — rides the mulligans bucket
 *  (the Mulligan-pillar bucket: tower organisms × Nucleus × hero symbiotes). */
export function accountSymbiotePower(states: Iterable<HeroSymbioteState | undefined>): number {
  let mult = 1;
  for (const s of states) mult *= heroSymbiotePower(s);
  return mult;
}

// ─────────────────────────────────────────────────────────────────────────────
// SLOT GATES (§gates) — per-hero identity trials, data rows over a snapshot meta assembles.
// Slot I is born open. Slot II is a MEMORABLE mid-game identity trial + a moderate Ichor
// price; slot III is the endgame crown + a steep one. Every requirement always displays
// with live progress (the anticipation rule). A future requirement axis = one row.
// ─────────────────────────────────────────────────────────────────────────────
export interface SymbioteGateSnapshot {
  kills: number; // lifetime kills BY this hero (save.heroKills)
  masteryLevel: number; // this hero's mastery level
  stars: number; // this hero's permanent stars
  campaignStage: number;
  genomeRankTier: number; // 1-based rank index (core/genomeRank.ts)
  powerScore: number;
  megasSlain: number; // distinct Mega Bosses (account)
  rushBestBoss: number; // deepest single Boss Rush (account)
  molts: number; // prestige cycles (account)
  collectionPct: number; // Bio-Dex discovery 0..1 (account)
  ichor: number; // current wallet (the unlock price)
}

export interface SymbioteGateReq {
  id: string;
  label: string;
  need: number;
  read: (s: SymbioteGateSnapshot) => number;
  fmt?: (have: number, need: number) => string;
}

export interface SymbioteGate {
  slot: number; // the slot this gate opens (1-based: 2 or 3)
  title: string; // the trial's name — identity ceremony, per host
  blurb: string;
  reqs: SymbioteGateReq[];
  ichorCost: number;
}

const pctFmt = (have: number, need: number): string => `${Math.round(have * 100)}% / ${Math.round(need * 100)}%`;
export const SYMBIOTE_ICHOR_II = 35;
export const SYMBIOTE_ICHOR_III = 180;

// Requirement-row builders — shared vocabulary so per-hero gates stay one-line rows.
const rKills = (need: number): SymbioteGateReq => ({ id: 'kills', label: `Slay ${need.toLocaleString()} enemies leading this champion`, need, read: (s) => s.kills });
const rMastery = (need: number): SymbioteGateReq => ({ id: 'mastery', label: `Reach Mastery level ${need} with this champion`, need, read: (s) => s.masteryLevel });
const rStars = (need: number): SymbioteGateReq => ({ id: 'stars', label: `Evolve this champion to ★${need}`, need, read: (s) => s.stars });
const rStage = (need: number): SymbioteGateReq => ({ id: 'campaign', label: `Reach Campaign Stage ${need}`, need, read: (s) => s.campaignStage });
const rGenome = (need: number, name: string): SymbioteGateReq => ({ id: 'genome', label: `Attain Genome Rank ${name}`, need, read: (s) => s.genomeRankTier });
const rMegas = (need: number): SymbioteGateReq => ({ id: 'megas', label: `Slay ${need} distinct Mega Bosses`, need, read: (s) => s.megasSlain });
const rRush = (need: number): SymbioteGateReq => ({ id: 'rush', label: `Fell ${need} bosses in one Boss Rush`, need, read: (s) => s.rushBestBoss });
const rMolts = (need: number): SymbioteGateReq => ({ id: 'molts', label: `Complete ${need} Molt cycle${need > 1 ? 's' : ''}`, need, read: (s) => s.molts });
const rPower = (need: number): SymbioteGateReq => ({ id: 'power', label: `Reach ${need.toLocaleString()} Power Score`, need, read: (s) => s.powerScore });
const rDex = (need: number): SymbioteGateReq => ({ id: 'collection', label: `Discover ${Math.round(need * 100)}% of the Bio-Dex`, need, read: (s) => s.collectionPct, fmt: pctFmt });

/** THE gate book — [slot II, slot III] per hero, tuned to each identity's kill economy and
 *  themed to its legend. Typed COMPLETE over HeroKind: a future hero fails the compiler until
 *  it declares its trials (the future-hero contract). */
export const HERO_SYMBIOTE_GATES: Record<HeroKind, [SymbioteGate, SymbioteGate]> = {
  ravager: [
    { slot: 2, title: 'THE RAVENING', ichorCost: SYMBIOTE_ICHOR_II,
      blurb: 'The second graft takes only in flesh that has proven its hunger — a predator the campaign itself has learned to fear.',
      reqs: [rKills(2000), rStars(2), rStage(30)] },
    { slot: 3, title: 'APEX OF THE FOOD CHAIN', ichorCost: SYMBIOTE_ICHOR_III,
      blurb: 'The final graft crowns the eater of giants. Bring it a mountain of kills and the corpses of the largest things that ever walked.',
      reqs: [rKills(16000), rStars(4), rMastery(12), rGenome(6, 'VI · Hiveborn'), rMegas(6)] },
  ],
  shepherd: [
    { slot: 2, title: 'A THOUSAND TENDED WOUNDS', ichorCost: SYMBIOTE_ICHOR_II,
      blurb: 'The second graft roots only in a caretaker — one whose flock has marched deep and come home mended.',
      reqs: [rKills(1200), rStars(2), rMastery(8), rStage(32)] },
    { slot: 3, title: 'MOTHER OF MULTITUDES', ichorCost: SYMBIOTE_ICHOR_III,
      blurb: 'The final graft answers only to a lineage — a shepherd who has died as a Hive and returned as a greater one.',
      reqs: [rKills(9000), rStars(4), rMastery(14), rGenome(6, 'VI · Hiveborn'), rMolts(1)] },
  ],
  overseer: [
    { slot: 2, title: 'THE WIDENING GAZE', ichorCost: SYMBIOTE_ICHOR_II,
      blurb: 'The second graft weaves into a mind that has mapped the war — stage after stage held under one unblinking will.',
      reqs: [rKills(1000), rStars(2), rMastery(8), rStage(34)] },
    { slot: 3, title: 'TOTAL COGNITION', ichorCost: SYMBIOTE_ICHOR_III,
      blurb: 'The final graft demands omniscience: a commander who has catalogued the enemy down to its cells.',
      reqs: [rKills(8000), rStars(4), rMastery(12), rGenome(6, 'VI · Hiveborn'), rDex(0.45)] },
  ],
  vitriol: [
    { slot: 2, title: 'SIEGE DOCTRINE', ichorCost: SYMBIOTE_ICHOR_II,
      blurb: 'The second graft sets only in artillery that has held a line — barrels worn deep by campaign after campaign.',
      reqs: [rKills(2200), rStars(2), rStage(30)] },
    { slot: 3, title: 'THE LONG BOMBARDMENT', ichorCost: SYMBIOTE_ICHOR_III,
      blurb: 'The final graft crowns endurance itself: a siege that outlasted the gauntlet\'s worst parade of monsters.',
      reqs: [rKills(17000), rStars(4), rMastery(12), rGenome(6, 'VI · Hiveborn'), rRush(10)] },
  ],
  revenant: [
    { slot: 2, title: 'DEATH\'S APPRENTICESHIP', ichorCost: SYMBIOTE_ICHOR_II,
      blurb: 'The second graft phases only into a proven assassin — a wraith the campaign\'s depths already whisper about.',
      reqs: [rKills(1800), rStars(2), rStage(32)] },
    { slot: 3, title: 'THE PERFECT HAUNTING', ichorCost: SYMBIOTE_ICHOR_III,
      blurb: 'The final graft belongs to the executioner of the great — measured against the boss gauntlet\'s deepest march.',
      reqs: [rKills(14000), rStars(4), rMastery(12), rGenome(6, 'VI · Hiveborn'), rRush(9)] },
  ],
  knell: [
    { slot: 2, title: 'THE FIRST GREAT PEAL', ichorCost: SYMBIOTE_ICHOR_II,
      blurb: 'The second graft rings true only in a bell the whole Hive has heard — a conductor of proven congregations.',
      reqs: [rKills(1100), rStars(2), rMastery(8), rStage(34)] },
    { slot: 3, title: 'THE WORLD-TOLL', ichorCost: SYMBIOTE_ICHOR_III,
      blurb: 'The final graft answers a bell that has tolled across lifetimes — through a Molt and into legend.',
      reqs: [rKills(9000), rStars(4), rMastery(13), rGenome(6, 'VI · Hiveborn'), rMolts(1)] },
  ],
  wyrm: [
    { slot: 2, title: 'FLIGHT OF EMBERS', ichorCost: SYMBIOTE_ICHOR_II,
      blurb: 'The second graft fuses only to wings that never landed — a strafe-line burned across half the campaign.',
      reqs: [rKills(2000), rStars(2), rStage(30)] },
    { slot: 3, title: 'THE SKY THAT BURNS', ichorCost: SYMBIOTE_ICHOR_III,
      blurb: 'The final graft crowns the firestorm: giants brought down mid-flight, power the heavens can measure.',
      reqs: [rKills(15000), rStars(4), rMastery(12), rGenome(6, 'VI · Hiveborn'), rMegas(5), rPower(9000)] },
  ],
  riptide: [
    { slot: 2, title: 'WHERE THE TIDE TAKES HOLD', ichorCost: SYMBIOTE_ICHOR_II,
      blurb: 'The second graft dissolves only into water that has learned to grip — a current the campaign\'s mid-depths could not swim against.',
      reqs: [rKills(1400), rStars(2), rStage(30)] },
    { slot: 3, title: 'THE DROWNING DEEP', ichorCost: SYMBIOTE_ICHOR_III,
      blurb: 'The final graft sinks only into abyssal water — a tide condensed from fallen leviathans, risen through everything that ever swam in it.',
      reqs: [rKills(11000), rStars(4), rMastery(12), rGenome(6, 'VI · Hiveborn'), rMegas(4)] },
  ],
};

// Compile-time completeness above; runtime sanity for tests + tooling.
export function symbioteGatesFor(kind: HeroKind): [SymbioteGate, SymbioteGate] {
  return HERO_SYMBIOTE_GATES[kind];
}

export interface SymbioteGateProgress {
  gate: SymbioteGate;
  rows: { req: SymbioteGateReq; have: number; met: boolean; text: string }[];
  reqsMet: boolean;
  ichorMet: boolean;
  ready: boolean; // reqsMet && ichorMet — the unlock action may fire
}

/** Evaluate a hero's slot gate against the live snapshot (UI + meta's unlock action share this). */
export function symbioteGateProgress(kind: HeroKind, slot: number, snap: SymbioteGateSnapshot): SymbioteGateProgress | null {
  const gate = HERO_SYMBIOTE_GATES[kind]?.find((g) => g.slot === slot);
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
// Save sanitizer — content is the authority: unknown hero kinds and organ ids drop, levels
// clamp to the rarity cap, seats must point at GRAFTED organs and stay exclusive per host
// (first ref wins), unlocked clamps to 1..SYMBIOTE_SLOTS. A fresh/garbage blob ⇒ {}.
// ─────────────────────────────────────────────────────────────────────────────
export function sanitizeHeroSymbiote(raw: unknown): HeroSymbioteState {
  const out = emptyHeroSymbiote();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { unlocked?: unknown; slots?: unknown; grown?: unknown; adapted?: unknown; resonated?: unknown; evolved?: unknown };
  if (typeof r.unlocked === 'number' && Number.isFinite(r.unlocked)) {
    out.unlocked = Math.max(1, Math.min(SYMBIOTE_SLOTS, Math.floor(r.unlocked)));
  }
  if (r.grown && typeof r.grown === 'object') {
    for (const [id, v] of Object.entries(r.grown as Record<string, unknown>)) {
      const def = symbioteRegistry.get(id);
      if (!def || !v || typeof v !== 'object') continue;
      const lvl = (v as { level?: unknown }).level;
      const level = typeof lvl === 'number' && Number.isFinite(lvl) ? Math.max(1, Math.min(symbioteLevelCap(def), Math.floor(lvl))) : 1;
      out.grown[id] = { level };
    }
  }
  const seen = new Set<string>();
  const rows = Array.isArray(r.slots) ? r.slots : [];
  for (let s = 0; s < SYMBIOTE_SLOTS; s++) {
    const row = Array.isArray(rows[s]) ? (rows[s] as unknown[]) : [];
    for (let i = 0; i < SYMBIOTE_SEATS; i++) {
      const id = row[i];
      if (typeof id !== 'string' || seen.has(id) || !symbioteRegistry.has(id) || !out.grown[id]) continue;
      seen.add(id);
      out.slots[s][i] = id;
    }
  }
  if (Array.isArray(r.adapted)) {
    const adapted = [...new Set(r.adapted.filter((v): v is string => typeof v === 'string' && v in COMBAT_CLASSES))];
    if (adapted.length > 0) out.adapted = adapted;
  }
  if (Array.isArray(r.resonated)) {
    const resonated = [...new Set(r.resonated.filter((v): v is string => typeof v === 'string' && RESONANCE_BY_ID.has(v)))];
    if (resonated.length > 0) out.resonated = resonated;
  }
  if (r.evolved === true) out.evolved = true;
  return out;
}

/** The whole account map: unknown hero kinds drop; heroes with garbage states sanitize. */
export function sanitizeHeroSymbiotes(raw: unknown): Partial<Record<HeroKind, HeroSymbioteState>> {
  const out: Partial<Record<HeroKind, HeroSymbioteState>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [kind, st] of Object.entries(raw as Record<string, unknown>)) {
    if (!(HERO_ORDER as readonly string[]).includes(kind)) continue;
    out[kind as HeroKind] = sanitizeHeroSymbiote(st);
  }
  return out;
}
