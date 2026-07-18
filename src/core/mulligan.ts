// MULLIGAN SYSTEM (docs/MULLIGANS.md) — a permanent endgame progression pillar, the tower twin of
// Hero Equipment but deliberately NOT a copy: a Mulligan is a biomechanical secondary organism
// GRAFTED onto a tower, assembled by the player from genetic MODIFIERS. Every tower kind permanently
// owns ONE Mulligan with THREE slots (A/B/C); the organism does NOTHING until all three are filled
// (no partial activation). The three modifiers' STAT PROFILE then drives (a) a small sim kit that
// folds through the SAME TowerMods channels stars/mastery/adaptation already use — so there are zero
// new sim branches — and (b) a procedural APPEARANCE / ANIMATION / PROJECTILE generator, so a brand
// new modifier is ONE registry row and needs no draw code (CLAUDE.md "generalize, don't hardcode").
//
// GOLDEN INVARIANT: a fresh account has every Mulligan empty ⇒ `resolveMulligan` returns the identity
// (active:false, all mults 1, zero profile, power 1) ⇒ `towerProgress` folds a neutral kit ⇒ the sim
// is byte-identical and the Power index reads exactly POWER_BASE. Modifiers are earned/leveled from
// loot; nothing here perturbs the pinned autoplay run. Pure data + pure helpers (no Game/DOM/save).

import { Registry } from './registry';
import { REFORGE_RARITY, reforgeModById } from './mulliganReforge';
import { COMBAT_CLASSES } from './combatClass';
import type { CombatClass } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Rarity ladder — six tiers. Rarity is a PER-SLOT property (a modifier can sit at
// Common on one tower and Legendary on another): it scales stats, Power, the upgrade
// ceiling, and the VISUAL/ANIMATION intensity the generator reads. Ascendant is the
// Ascension-ready apex (docs/MULLIGANS.md §rarity).
// ─────────────────────────────────────────────────────────────────────────────
export type MulliganRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'ascendant';
export const MULLIGAN_RARITY_ORDER: MulliganRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ascendant'];

export interface MulliganRarityTier {
  tier: number; // 0..5 (index in the ladder)
  label: string;
  color: string; // UI + generator hue bias
  statMult: number; // scales every stat DELTA (a ×1.10 at Common becomes ×(1+0.10·statMult))
  powerMult: number; // scales the Power contribution of a slot at this rarity
  visualIntensity: number; // generator: organ size / count / glow (0..1+)
  animComplexity: number; // generator: number of concurrent animation channels
  levelCap: number; // upgrade ceiling at this rarity (future-proofed by MULLIGAN_MAX_LEVEL)
}

// Colors mirror the global rarity tokens (src/index.css :root --r-*), so a Legendary modifier
// wears the same gold as Legendary equipment/genes and Ascendant reads at the mythic register.
// Raw hex (not var()) because the canvas generators and inline chip styles consume them directly.
export const MULLIGAN_RARITY: Record<MulliganRarity, MulliganRarityTier> = {
  common: { tier: 0, label: 'Common', color: '#9aa7b8', statMult: 1.0, powerMult: 1.0, visualIntensity: 0.6, animComplexity: 1, levelCap: 5 },
  uncommon: { tier: 1, label: 'Uncommon', color: '#5fe08a', statMult: 1.35, powerMult: 1.4, visualIntensity: 0.78, animComplexity: 2, levelCap: 8 },
  rare: { tier: 2, label: 'Rare', color: '#5ad1ff', statMult: 1.75, powerMult: 1.9, visualIntensity: 0.95, animComplexity: 2, levelCap: 11 },
  epic: { tier: 3, label: 'Epic', color: '#c98bff', statMult: 2.25, powerMult: 2.6, visualIntensity: 1.12, animComplexity: 3, levelCap: 14 },
  legendary: { tier: 4, label: 'Legendary', color: '#ffd24d', statMult: 2.9, powerMult: 3.6, visualIntensity: 1.3, animComplexity: 3, levelCap: 17 },
  ascendant: { tier: 5, label: 'Ascendant', color: '#ff6b8b', statMult: 3.7, powerMult: 5.0, visualIntensity: 1.5, animComplexity: 4, levelCap: 20 },
};

/** ⊛ — the Mulligan system's canonical mark (nav, Inspector chips, reveal pulls). Modifier
 *  upgrades spend **Gene Essence** (`save.geneEssence`, `CURRENCIES.geneEssence`) — the SAME
 *  currency Gene Cards level with — so there is no separate Mulligan wallet to track. */
export const MULLIGAN_MARK = '⊛';

/** Absolute upgrade ceiling (rarity caps sit at or below this) — kept generous for future Ascension. */
export const MULLIGAN_MAX_LEVEL = 20;
export const MULLIGAN_SLOTS = 3;

/** The duplicate-dissolve law (docs/MULLIGANS.md §localized): a piece the account already
 *  owns converts to Mulligan Tissue at these rates — the container pull AND an Auction
 *  House delivery of an owned piece both pay through this one table. */
export const DUP_TISSUE: Record<MulliganRarity, number> = { common: 30, uncommon: 50, rare: 90, epic: 160, legendary: 280, ascendant: 500 };

export function rarityAtLeast(a: MulliganRarity, b: MulliganRarity): boolean {
  return MULLIGAN_RARITY[a].tier >= MULLIGAN_RARITY[b].tier;
}
export function nextRarity(r: MulliganRarity): MulliganRarity | null {
  const i = MULLIGAN_RARITY[r].tier;
  return i < MULLIGAN_RARITY_ORDER.length - 1 ? MULLIGAN_RARITY_ORDER[i + 1] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Archetype axes — the procedural vocabulary. Every modifier declares an `influence`
// over these ten; the generator combines the three slots' influences into ONE organism
// (visual), ONE idle animation, and ONE projectile skin. Adding an axis is additive;
// adding a modifier is one registry row. (docs/MULLIGANS.md §generators)
// ─────────────────────────────────────────────────────────────────────────────
export type MulliganAxis =
  | 'damage' // large offensive spikes
  | 'attackSpeed' // many thin tendrils
  | 'debuff' // parasite sacs
  | 'poison' // green veins
  | 'splash' // swollen glands
  | 'pierce' // bone lances
  | 'support' // symbiotic pods
  | 'crit' // crystalline growth
  | 'slow' // sticky membranes
  | 'healing'; // vascular tissue
export const MULLIGAN_AXES: MulliganAxis[] = ['damage', 'attackSpeed', 'debuff', 'poison', 'splash', 'pierce', 'support', 'crit', 'slow', 'healing'];

/** An aggregated archetype vector (the generators' only input beyond the seeds). */
export type StatProfile = Record<MulliganAxis, number>;
export function zeroProfile(): StatProfile {
  const p = {} as StatProfile;
  for (const a of MULLIGAN_AXES) p[a] = 0;
  return p;
}
/** The dominant axis of a profile (drives the organism's primary body plan). '' when empty. */
export function dominantAxis(p: StatProfile): MulliganAxis | '' {
  let best: MulliganAxis | '' = '';
  let bv = 0;
  for (const a of MULLIGAN_AXES) if (p[a] > bv) { bv = p[a]; best = a; }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sim kit — the SUBSET of TowerMods channels a Mulligan may touch. Deliberately small
// and drawn ENTIRELY from existing channels, so folding a resolved Mulligan into
// `towerProgress` adds no sim branch and an empty Mulligan is byte-identical.
// ─────────────────────────────────────────────────────────────────────────────
export interface MulliganStats {
  damageMult?: number; // ride-along on the tower's damage
  fireRateMult?: number; // ride-along on cadence
  rangeMult?: number; // engagement / field reach
  splashMult?: number; // blast radius
  extraProjectiles?: number; // additional simultaneous targets (integer, unscaled by level)
  projectileMutators?: string[]; // pierce1 / pierce2 (existing, sim-handled ids only)
}

export interface MulliganModifier {
  id: string;
  name: string;
  category: 'offensive' | 'utility' | 'biological';
  /** Biological CLASS (docs/MULLIGANS.md §classes) — the SAME taxonomy towers use
   *  (TowerDef.combatClass). Drives class chrome, host synergy and ADAPTATIONS; the
   *  registry REJECTS a modifier without one (the future-modifier contract). */
  cls: CombatClass;
  desc: string; // what it does, in player words
  flavor: string; // atmosphere
  baseRarity: MulliganRarity; // the rarity it typically DROPS at (floor for loot + collections)
  stats: MulliganStats; // deltas at Common / level 1 (rarity + level scale them)
  influence: Partial<StatProfile>; // archetype weights the generators read
  powerWeight: number; // flat Power vehicle (per docs/POWER-SCORE — a heuristic, like equipment rarity)
}

export const mulliganRegistry = new Registry<MulliganModifier>('mulligan', {
  idOf: (m) => m.id,
  validate: (m) => {
    const out: string[] = [];
    if (!m.name) out.push(`${m.id}: missing name`);
    if (!m.cls || !(m.cls in COMBAT_CLASSES)) out.push(`${m.id}: missing/unknown class '${m.cls}' — every modifier requires a CombatClass (docs/MULLIGANS.md §classes)`);
    if (Object.keys(m.influence).length === 0) out.push(`${m.id}: an influence is required (the generator needs it)`);
    if (m.powerWeight <= 0) out.push(`${m.id}: powerWeight must be > 0 (every modifier contributes Power)`);
    for (const mut of m.stats.projectileMutators ?? []) {
      if (!/^pierce[123]$/.test(mut)) out.push(`${m.id}: unknown projectile mutator '${mut}'`);
    }
    return out;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// The launch 30 — 10 offensive · 10 utility · 10 biological. Each supports MULTIPLE
// archetypes (mixing + stacking both matter; there is no single "best" triple). Stats are
// authored at Common/L1; rarity + level scale the deltas. (docs/MULLIGANS.md §catalog)
// ─────────────────────────────────────────────────────────────────────────────
const OFFENSIVE: MulliganModifier[] = [
  { id: 'bone_spike', name: 'Bone Spike', category: 'offensive', cls: 'Kinetic', baseRarity: 'common', stats: { damageMult: 1.08, projectileMutators: ['pierce1'] }, influence: { pierce: 1, damage: 0.4 }, powerWeight: 0.05, desc: 'Grows a bone lance — shots pierce one extra host.', flavor: 'A blade of ossified hunger, sharpened by every kill it remembers.' },
  { id: 'acid_gland', name: 'Acid Gland', category: 'offensive', cls: 'Caustic', baseRarity: 'uncommon', stats: { damageMult: 1.06, splashMult: 1.06 }, influence: { poison: 1, debuff: 0.5 }, powerWeight: 0.055, desc: 'A blister of caustic bile — corrodes what it touches.', flavor: 'It weeps constantly. The tower has learned not to mind.' },
  { id: 'rapid_synapse', name: 'Rapid Synapse', category: 'offensive', cls: 'Neural', baseRarity: 'common', stats: { fireRateMult: 1.1 }, influence: { attackSpeed: 1 }, powerWeight: 0.05, desc: 'A twitching nerve cluster — the tower fires faster.', flavor: 'It fires before the thought finishes forming.' },
  { id: 'rupture_node', name: 'Rupture Node', category: 'offensive', cls: 'Caustic', baseRarity: 'rare', stats: { splashMult: 1.18, damageMult: 1.05 }, influence: { splash: 1, damage: 0.3 }, powerWeight: 0.07, desc: 'A swollen gland that detonates on impact — wider blasts.', flavor: 'Pressure with nowhere to go, gifted a direction.' },
  { id: 'venom_barb', name: 'Venom Barb', category: 'offensive', cls: 'Viral', baseRarity: 'uncommon', stats: { damageMult: 1.07, projectileMutators: ['pierce1'] }, influence: { poison: 0.7, pierce: 0.6 }, powerWeight: 0.058, desc: 'Envenomed lances that pierce and poison.', flavor: 'The barb is the mercy. The venom is the point.' },
  { id: 'crystalline_core', name: 'Crystalline Core', category: 'offensive', cls: 'Resonant', baseRarity: 'epic', stats: { damageMult: 1.15 }, influence: { crit: 1, damage: 0.5 }, powerWeight: 0.085, desc: 'A faceted growth that focuses lethal critical strikes.', flavor: 'Light enters. Only violence leaves.' },
  { id: 'overload_ganglion', name: 'Overload Ganglion', category: 'offensive', cls: 'Neural', baseRarity: 'rare', stats: { fireRateMult: 1.12, damageMult: 1.05 }, influence: { attackSpeed: 0.8, damage: 0.5 }, powerWeight: 0.072, desc: 'An overclocked nerve knot — faster, harder fire.', flavor: 'It runs hot enough to cook. It does not stop.' },
  { id: 'siege_carapace', name: 'Siege Carapace', category: 'offensive', cls: 'Kinetic', baseRarity: 'epic', stats: { damageMult: 1.2 }, influence: { damage: 1 }, powerWeight: 0.09, desc: 'A heavy offensive shell — pure, brutal damage.', flavor: 'Built for one verb, conjugated forever.' },
  { id: 'shatter_lance', name: 'Shatter Lance', category: 'offensive', cls: 'Kinetic', baseRarity: 'legendary', stats: { damageMult: 1.18, projectileMutators: ['pierce2'] }, influence: { pierce: 1, crit: 0.6, damage: 0.6 }, powerWeight: 0.12, desc: 'A crystalline lance that punches through two hosts and crits.', flavor: 'A line drawn through a crowd, in their own language.' },
  { id: 'apex_gland', name: 'Apex Predator Gland', category: 'offensive', cls: 'Kinetic', baseRarity: 'ascendant', stats: { damageMult: 1.25, fireRateMult: 1.08 }, influence: { damage: 1, crit: 0.5, attackSpeed: 0.4 }, powerWeight: 0.16, desc: 'The pinnacle offensive organ — damage, crit, and cadence.', flavor: 'Everything it was grafted onto is now a delivery mechanism.' },
];

const UTILITY: MulliganModifier[] = [
  { id: 'sensory_cilia', name: 'Sensory Cilia', category: 'utility', cls: 'Resonant', baseRarity: 'common', stats: { rangeMult: 1.1 }, influence: { support: 0.5, slow: 0.2 }, powerWeight: 0.045, desc: 'Fine sensory hairs — the tower reaches farther.', flavor: 'It feels the wave coming three heartbeats early.' },
  { id: 'sticky_membrane', name: 'Sticky Membrane', category: 'utility', cls: 'Neural', baseRarity: 'uncommon', stats: { rangeMult: 1.05, splashMult: 1.06 }, influence: { slow: 1 }, powerWeight: 0.05, desc: 'A tacky secretion that clings and slows.', flavor: 'Nothing leaves in a hurry. Nothing leaves at all.' },
  { id: 'symbiotic_pod', name: 'Symbiotic Pod', category: 'utility', cls: 'Vital', baseRarity: 'rare', stats: { fireRateMult: 1.06, rangeMult: 1.06 }, influence: { support: 1 }, powerWeight: 0.065, desc: 'A budding pod that shares its strength with the host.', flavor: 'Two organisms, one appetite.' },
  { id: 'disruptor_sac', name: 'Disruptor Sac', category: 'utility', cls: 'Neural', baseRarity: 'uncommon', stats: { damageMult: 1.05, rangeMult: 1.04 }, influence: { debuff: 1 }, powerWeight: 0.052, desc: 'A pulsing sac that fouls enemy defenses.', flavor: 'It hums on a frequency armor cannot ignore.' },
  { id: 'frost_vesicle', name: 'Frost Vesicle', category: 'utility', cls: 'Neural', baseRarity: 'rare', stats: { splashMult: 1.12 }, influence: { slow: 0.8, splash: 0.5 }, powerWeight: 0.066, desc: 'A supercooled bladder — chilling area bursts.', flavor: 'The cold is patient. The cold always wins.' },
  { id: 'hunter_ocelli', name: 'Hunter Ocelli', category: 'utility', cls: 'Resonant', baseRarity: 'rare', stats: { rangeMult: 1.14, damageMult: 1.05 }, influence: { crit: 0.5, support: 0.3 }, powerWeight: 0.068, desc: 'A ring of hunting eyes — long reach and keen strikes.', flavor: 'It has already chosen where you will fall.' },
  { id: 'web_filament', name: 'Web Filament', category: 'utility', cls: 'Neural', baseRarity: 'epic', stats: { fireRateMult: 1.1, rangeMult: 1.06 }, influence: { slow: 0.7, attackSpeed: 0.6 }, powerWeight: 0.085, desc: 'Living threads that snare and quicken.', flavor: 'The loom never stops. You are already in the pattern.' },
  { id: 'resonance_antenna', name: 'Resonance Antenna', category: 'utility', cls: 'Resonant', baseRarity: 'epic', stats: { rangeMult: 1.15, fireRateMult: 1.06 }, influence: { support: 1, slow: 0.3 }, powerWeight: 0.088, desc: 'A tuned organ that amplifies the whole tower.', flavor: 'It broadcasts a single note the battlefield obeys.' },
  { id: 'warp_anchor', name: 'Warp Anchor', category: 'utility', cls: 'Neural', baseRarity: 'legendary', stats: { rangeMult: 1.12, splashMult: 1.1 }, influence: { slow: 1, debuff: 0.7 }, powerWeight: 0.115, desc: 'A gravity organ that drags and disrupts a wide field.', flavor: 'Distance is a suggestion it declines to honor.' },
  { id: 'oracle_nexus', name: 'Oracle Nexus', category: 'utility', cls: 'Resonant', baseRarity: 'ascendant', stats: { rangeMult: 1.18, fireRateMult: 1.08, splashMult: 1.08 }, influence: { support: 1, slow: 0.5, debuff: 0.5 }, powerWeight: 0.155, desc: 'The apex utility organ — reach, cadence, control.', flavor: 'It does not predict the wave. It authors it.' },
];

const BIOLOGICAL: MulliganModifier[] = [
  { id: 'green_vein', name: 'Green Vein', category: 'biological', cls: 'Viral', baseRarity: 'common', stats: { damageMult: 1.06 }, influence: { poison: 1 }, powerWeight: 0.048, desc: 'Toxin-swollen veins that seep into every wound.', flavor: 'The green is not decoration. It is intent.' },
  { id: 'vascular_tissue', name: 'Vascular Tissue', category: 'biological', cls: 'Vital', baseRarity: 'common', stats: { fireRateMult: 1.05, rangeMult: 1.04 }, influence: { healing: 1 }, powerWeight: 0.046, desc: 'Living vascular growth that sustains the graft.', flavor: 'It feeds the organism the organism feeds.' },
  { id: 'parasite_sac', name: 'Parasite Sac', category: 'biological', cls: 'Viral', baseRarity: 'uncommon', stats: { damageMult: 1.05, splashMult: 1.06 }, influence: { debuff: 0.8, poison: 0.4 }, powerWeight: 0.052, desc: 'A brood sac that seeds weakening parasites.', flavor: 'Every host is a nursery it has not opened yet.' },
  { id: 'spore_bladder', name: 'Spore Bladder', category: 'biological', cls: 'Caustic', baseRarity: 'uncommon', stats: { splashMult: 1.14 }, influence: { poison: 0.8, splash: 0.6 }, powerWeight: 0.056, desc: 'A bladder that bursts into a toxic spore cloud.', flavor: 'Breathe in. That was the mistake.' },
  { id: 'regenerative_node', name: 'Regenerative Node', category: 'biological', cls: 'Vital', baseRarity: 'rare', stats: { fireRateMult: 1.06, rangeMult: 1.05 }, influence: { healing: 1, support: 0.4 }, powerWeight: 0.064, desc: 'A knot of self-repairing tissue that steadies the host.', flavor: 'Cut it and it thanks you for the surface area.' },
  { id: 'toxin_reservoir', name: 'Toxin Reservoir', category: 'biological', cls: 'Viral', baseRarity: 'rare', stats: { damageMult: 1.1 }, influence: { poison: 1, debuff: 0.4 }, powerWeight: 0.07, desc: 'A deep well of venom — potent, lingering poison.', flavor: 'It has never run dry. It has never tried.' },
  { id: 'symbiont_cluster', name: 'Symbiont Cluster', category: 'biological', cls: 'Vital', baseRarity: 'epic', stats: { rangeMult: 1.1, fireRateMult: 1.06 }, influence: { support: 0.8, healing: 0.8 }, powerWeight: 0.084, desc: 'A colony of helper organisms bound to the host.', flavor: 'A parliament of small hungers, voting to help.' },
  { id: 'necrotic_bloom', name: 'Necrotic Bloom', category: 'biological', cls: 'Viral', baseRarity: 'epic', stats: { damageMult: 1.12, splashMult: 1.08 }, influence: { poison: 1, debuff: 0.7 }, powerWeight: 0.088, desc: 'A blossom of rot that spreads decay outward.', flavor: 'It flowers only in the presence of an ending.' },
  { id: 'living_hive', name: 'Living Hive', category: 'biological', cls: 'Viral', baseRarity: 'legendary', stats: { splashMult: 1.16, damageMult: 1.06 }, influence: { poison: 0.8, splash: 0.7, support: 0.6 }, powerWeight: 0.118, desc: 'A self-sustaining hive that swarms the wave.', flavor: 'Not a tower with an organism. An organism with a tower.' },
  { id: 'genesis_organ', name: 'Genesis Organ', category: 'biological', cls: 'Vital', baseRarity: 'ascendant', stats: { damageMult: 1.14, fireRateMult: 1.08, splashMult: 1.08 }, influence: { poison: 0.8, healing: 0.8, support: 0.6, debuff: 0.5 }, powerWeight: 0.155, desc: 'The apex biological organ — a whole ecology in one graft.', flavor: 'It remembers being the first cell. It intends to be the last.' },
];

// ── The expansion 15 (5 per category) — grew the catalog with the roster so every tower
// could host a full organism with zero piece-sharing (each piece lives on ONE tower at a
// time — §exclusivity). The ratio contract now lives in CATALOG_PER_TOWER below. ──
const OFFENSIVE_2: MulliganModifier[] = [
  { id: 'marrow_cannon', name: 'Marrow Cannon', category: 'offensive', cls: 'Kinetic', baseRarity: 'rare', stats: { damageMult: 1.12, splashMult: 1.05 }, influence: { damage: 0.8, splash: 0.5 }, powerWeight: 0.07, desc: 'A bone mortar grown mid-graft — heavy, wide hits.', flavor: 'It was a femur once. It has ambitions now.' },
  { id: 'twitch_fiber', name: 'Twitch Fiber', category: 'offensive', cls: 'Neural', baseRarity: 'common', stats: { fireRateMult: 1.08, rangeMult: 1.03 }, influence: { attackSpeed: 1, support: 0.2 }, powerWeight: 0.048, desc: 'Fast-twitch muscle bundles — quicker cycling.', flavor: 'It practices between shots. There is no between.' },
  { id: 'ember_sac', name: 'Ember Sac', category: 'offensive', cls: 'Caustic', baseRarity: 'uncommon', stats: { damageMult: 1.09 }, influence: { damage: 0.6, poison: 0.4 }, powerWeight: 0.056, desc: 'A smoldering chemical bladder — burning payloads.', flavor: 'Warm to the touch. Do not touch.' },
  { id: 'lance_array', name: 'Lance Array', category: 'offensive', cls: 'Kinetic', baseRarity: 'epic', stats: { damageMult: 1.08, fireRateMult: 1.05, projectileMutators: ['pierce1'] }, influence: { pierce: 0.8, attackSpeed: 0.5 }, powerWeight: 0.086, desc: 'A rack of ossified lances — piercing volleys.', flavor: 'Six spears, one argument.' },
  { id: 'carnage_engine', name: 'Carnage Engine', category: 'offensive', cls: 'Kinetic', baseRarity: 'legendary', stats: { damageMult: 1.16, fireRateMult: 1.06 }, influence: { damage: 0.9, crit: 0.5, attackSpeed: 0.3 }, powerWeight: 0.118, desc: 'A self-feeding violence loop — damage begets damage.', flavor: 'It idles at a murder. It does not idle long.' },
];
const UTILITY_2: MulliganModifier[] = [
  { id: 'echo_bulb', name: 'Echo Bulb', category: 'utility', cls: 'Resonant', baseRarity: 'common', stats: { rangeMult: 1.06, fireRateMult: 1.03 }, influence: { support: 0.7, debuff: 0.2 }, powerWeight: 0.046, desc: 'A resonant bulb that sharpens the tower\'s senses.', flavor: 'It hears the shot land before the shot leaves.' },
  { id: 'gravemind_knot', name: 'Gravemind Knot', category: 'utility', cls: 'Neural', baseRarity: 'uncommon', stats: { rangeMult: 1.08, splashMult: 1.04 }, influence: { debuff: 0.8, slow: 0.4 }, powerWeight: 0.054, desc: 'A knotted neural mass that unsettles the wave.', flavor: 'It thinks about you. That is the weapon.' },
  { id: 'prism_lens', name: 'Prism Lens', category: 'utility', cls: 'Resonant', baseRarity: 'rare', stats: { rangeMult: 1.1, damageMult: 1.05 }, influence: { crit: 0.8, support: 0.3 }, powerWeight: 0.068, desc: 'A crystalline eye that finds the killing angle.', flavor: 'Every refraction is a decision.' },
  { id: 'tremor_bell', name: 'Tremor Bell', category: 'utility', cls: 'Caustic', baseRarity: 'epic', stats: { splashMult: 1.12, rangeMult: 1.06 }, influence: { splash: 0.8, slow: 0.5 }, powerWeight: 0.086, desc: 'A subsonic organ — wide, staggering impacts.', flavor: 'You do not hear it. Your bones do.' },
  { id: 'chrono_polyp', name: 'Chrono Polyp', category: 'utility', cls: 'Neural', baseRarity: 'legendary', stats: { fireRateMult: 1.12, rangeMult: 1.08 }, influence: { attackSpeed: 0.8, slow: 0.6, support: 0.4 }, powerWeight: 0.116, desc: 'A time-dilating growth — the tower lives faster.', flavor: 'It budgets your seconds. It skims a fee.' },
];
const BIOLOGICAL_2: MulliganModifier[] = [
  { id: 'marrow_leech', name: 'Marrow Leech', category: 'biological', cls: 'Vital', baseRarity: 'common', stats: { damageMult: 1.05, fireRateMult: 1.03 }, influence: { healing: 0.7, poison: 0.3 }, powerWeight: 0.047, desc: 'A feeding leech that returns strength to the host.', flavor: 'A fair trade, assessed by the leech.' },
  { id: 'cyst_garden', name: 'Cyst Garden', category: 'biological', cls: 'Viral', baseRarity: 'uncommon', stats: { splashMult: 1.08, rangeMult: 1.03 }, influence: { poison: 0.6, splash: 0.5 }, powerWeight: 0.054, desc: 'A bed of bursting cysts — spreading toxin pockets.', flavor: 'Something is always ripening.' },
  { id: 'plague_heart', name: 'Plague Heart', category: 'biological', cls: 'Viral', baseRarity: 'rare', stats: { damageMult: 1.08, splashMult: 1.06 }, influence: { poison: 0.9, debuff: 0.3 }, powerWeight: 0.069, desc: 'A second heart that pumps pestilence.', flavor: 'Two beats: one for the host, one for the harvest.' },
  { id: 'mother_polyp', name: 'Mother Polyp', category: 'biological', cls: 'Vital', baseRarity: 'epic', stats: { rangeMult: 1.08, fireRateMult: 1.07 }, influence: { support: 0.7, healing: 0.6, splash: 0.3 }, powerWeight: 0.087, desc: 'A brooding polyp that nurtures the whole graft.', flavor: 'Everything it touches, it raises.' },
  { id: 'wombworks', name: 'Wombworks', category: 'biological', cls: 'Vital', baseRarity: 'legendary', stats: { damageMult: 1.08, fireRateMult: 1.08, rangeMult: 1.06 }, influence: { healing: 0.8, support: 0.6, poison: 0.4 }, powerWeight: 0.12, desc: 'A living factory — the organism improves itself.', flavor: 'Version two is already gestating.' },
];

// ── The draconic 6 (2 per category) — kept the catalog at three pieces per tower as the
// roster grew to seventeen (Wyrmwing Glaive + Drake Roost). Sky-caste flavor throughout. ──
const OFFENSIVE_3: MulliganModifier[] = [
  { id: 'wing_razor', name: 'Wing Razor', category: 'offensive', cls: 'Kinetic', baseRarity: 'rare', stats: { damageMult: 1.1, projectileMutators: ['pierce1'] }, influence: { pierce: 0.9, attackSpeed: 0.4 }, powerWeight: 0.07, desc: 'A swept alar blade — cutting edges that pass through.', flavor: 'The wing remembers flight. The edge remembers everything else.' },
  { id: 'furnace_heart', name: 'Furnace Heart', category: 'offensive', cls: 'Caustic', baseRarity: 'epic', stats: { damageMult: 1.14, fireRateMult: 1.04 }, influence: { damage: 0.8, poison: 0.5 }, powerWeight: 0.088, desc: 'A smoldering draconic core — every strike lands hotter.', flavor: 'It beats twice a second. Both beats are furnaces.' },
];
const UTILITY_3: MulliganModifier[] = [
  { id: 'updraft_gland', name: 'Updraft Gland', category: 'utility', cls: 'Resonant', baseRarity: 'uncommon', stats: { rangeMult: 1.09, fireRateMult: 1.03 }, influence: { support: 0.7, attackSpeed: 0.4 }, powerWeight: 0.055, desc: 'A thermal organ — the host rides its own rising heat.', flavor: 'It exhales, and the tower stands a little taller.' },
  { id: 'watch_perch', name: 'Watch Perch', category: 'utility', cls: 'Neural', baseRarity: 'rare', stats: { rangeMult: 1.12, damageMult: 1.04 }, influence: { support: 0.6, crit: 0.5 }, powerWeight: 0.067, desc: 'A raptor vantage — long sight and chosen kills.', flavor: 'Nothing crosses the territory unnoticed. Nothing crosses twice.' },
];
const BIOLOGICAL_3: MulliganModifier[] = [
  { id: 'ember_marrow', name: 'Ember Marrow', category: 'biological', cls: 'Caustic', baseRarity: 'uncommon', stats: { damageMult: 1.07, splashMult: 1.05 }, influence: { poison: 0.7, damage: 0.4 }, powerWeight: 0.056, desc: 'Bone that burns from within — heat seeps into every wound.', flavor: 'Snap it open and the light gets out.' },
  { id: 'clutch_womb', name: 'Clutch Womb', category: 'biological', cls: 'Vital', baseRarity: 'epic', stats: { fireRateMult: 1.08, rangeMult: 1.06 }, influence: { healing: 0.7, support: 0.7 }, powerWeight: 0.086, desc: 'A warm brooding chamber — the graft tends its own eggs.', flavor: 'Every shell it warms hatches owing it something.' },
];

// ── The abundance 51 (17 per category) — the catalog's ratio moves from exact coverage
// (3 pieces per tower: every seat fillable, zero spare) to CHOICE (6 per tower: two full
// alternative organisms per tower, so decking the roster leaves real builds to pick between
// and the loot chase keeps paying after full coverage). Sized against the Mulligan-family
// slot surface (tower seats + Nucleus chambers + Hero Symbiote slots all speak this pillar).
// Per-category count stays a roster multiple (now 2×) — the §exclusivity math generalized. ──
const OFFENSIVE_4: MulliganModifier[] = [
  { id: 'gore_flail', name: 'Gore Flail', category: 'offensive', cls: 'Kinetic', baseRarity: 'common', stats: { damageMult: 1.07, fireRateMult: 1.03 }, influence: { damage: 0.7, attackSpeed: 0.3 }, powerWeight: 0.049, desc: 'A wet, weighted lash — heavier, quicker blows.', flavor: 'It keeps count of every swing. It is never satisfied with the number.' },
  { id: 'flint_knuckle', name: 'Flint Knuckle', category: 'offensive', cls: 'Kinetic', baseRarity: 'uncommon', stats: { damageMult: 1.09, projectileMutators: ['pierce1'] }, influence: { pierce: 0.7, damage: 0.5 }, powerWeight: 0.057, desc: 'A knapped bone fist — shots crack through one extra host.', flavor: 'Stone-age engineering, revised by something with opinions.' },
  { id: 'ballista_spur', name: 'Ballista Spur', category: 'offensive', cls: 'Kinetic', baseRarity: 'legendary', stats: { damageMult: 1.15, projectileMutators: ['pierce2'] }, influence: { pierce: 1, damage: 0.7 }, powerWeight: 0.118, desc: 'A siege-grade bone limb — heavy bolts that punch through two hosts.', flavor: 'It was grown for a war between larger things. It settles for yours.' },
  { id: 'caustic_quill', name: 'Caustic Quill', category: 'offensive', cls: 'Caustic', baseRarity: 'common', stats: { damageMult: 1.05, splashMult: 1.05 }, influence: { poison: 0.6, splash: 0.4 }, powerWeight: 0.048, desc: 'A dripping spine — small burns that spread.', flavor: 'One drop per victim. It budgets beautifully.' },
  { id: 'boiler_gland', name: 'Boiler Gland', category: 'offensive', cls: 'Caustic', baseRarity: 'rare', stats: { splashMult: 1.14, damageMult: 1.04 }, influence: { splash: 0.9, poison: 0.4 }, powerWeight: 0.068, desc: 'A pressurized acid boiler — wider, hotter detonations.', flavor: 'The whistle is not a safety feature. It is a promise.' },
  { id: 'magma_bladder', name: 'Magma Bladder', category: 'offensive', cls: 'Caustic', baseRarity: 'epic', stats: { splashMult: 1.12, damageMult: 1.08 }, influence: { splash: 0.8, damage: 0.6 }, powerWeight: 0.088, desc: 'A molten reservoir — blasts that scorch and shove.', flavor: 'It swallowed a furnace and kept the appetite.' },
  { id: 'rabid_stinger', name: 'Rabid Stinger', category: 'offensive', cls: 'Viral', baseRarity: 'uncommon', stats: { damageMult: 1.08, fireRateMult: 1.04 }, influence: { poison: 0.6, attackSpeed: 0.5 }, powerWeight: 0.056, desc: 'A frothing barb — faster, fouler strikes.', flavor: 'It bites first and diagnoses later.' },
  { id: 'blight_lance', name: 'Blight Lance', category: 'offensive', cls: 'Viral', baseRarity: 'rare', stats: { damageMult: 1.09, projectileMutators: ['pierce1'] }, influence: { poison: 0.8, pierce: 0.5 }, powerWeight: 0.069, desc: 'A rotting spear that passes through — and leaves something behind.', flavor: 'The wound closes. The argument does not.' },
  { id: 'pandemic_engine', name: 'Pandemic Engine', category: 'offensive', cls: 'Viral', baseRarity: 'ascendant', stats: { damageMult: 1.2, fireRateMult: 1.1 }, influence: { poison: 1, debuff: 0.6, attackSpeed: 0.5 }, powerWeight: 0.155, desc: 'The apex contagion organ — relentless, accelerating infection.', flavor: 'It does not spread. It SCHEDULES.' },
  { id: 'storm_ganglion', name: 'Storm Ganglion', category: 'offensive', cls: 'Neural', baseRarity: 'uncommon', stats: { fireRateMult: 1.09 }, influence: { attackSpeed: 0.9, debuff: 0.2 }, powerWeight: 0.054, desc: 'A crackling nerve storm — the tower fires in flurries.', flavor: 'Its thoughts arrive in volleys.' },
  { id: 'mirror_cortex', name: 'Mirror Cortex', category: 'offensive', cls: 'Neural', baseRarity: 'epic', stats: { fireRateMult: 1.1, damageMult: 1.06 }, influence: { attackSpeed: 0.7, crit: 0.5 }, powerWeight: 0.087, desc: 'A reflective brain-fold — every shot rehearsed twice.', flavor: 'It watches itself work. It applauds.' },
  { id: 'lobotomy_needle', name: 'Lobotomy Needle', category: 'offensive', cls: 'Neural', baseRarity: 'rare', stats: { damageMult: 1.1 }, influence: { crit: 0.7, debuff: 0.4 }, powerWeight: 0.068, desc: 'A surgical spike that finds the seam in anything.', flavor: 'Precision is just cruelty with a diploma.' },
  { id: 'chime_fangs', name: 'Chime Fangs', category: 'offensive', cls: 'Resonant', baseRarity: 'common', stats: { damageMult: 1.06, rangeMult: 1.04 }, influence: { crit: 0.4, support: 0.4 }, powerWeight: 0.047, desc: 'Ringing teeth — strikes that carry a killing note.', flavor: 'Every bite is in tune. That is the unsettling part.' },
  { id: 'anthem_horn', name: 'Anthem Horn', category: 'offensive', cls: 'Resonant', baseRarity: 'epic', stats: { extraProjectiles: 1 }, influence: { support: 0.7, damage: 0.4 }, powerWeight: 0.09, desc: 'A war-horn organ — a second voice strikes one extra target.', flavor: 'The song has a verse for everyone present.' },
  { id: 'shrike_chorus', name: 'Shrike Chorus', category: 'offensive', cls: 'Resonant', baseRarity: 'legendary', stats: { damageMult: 1.12, fireRateMult: 1.06 }, influence: { crit: 0.8, attackSpeed: 0.5, support: 0.3 }, powerWeight: 0.116, desc: 'A choir of impaling notes — keen, quick, merciless.', flavor: 'It harmonizes exclusively in sharps.' },
  { id: 'artery_thorn', name: 'Artery Thorn', category: 'offensive', cls: 'Vital', baseRarity: 'uncommon', stats: { damageMult: 1.08 }, influence: { healing: 0.5, damage: 0.5 }, powerWeight: 0.055, desc: 'A blood-fed spine — the graft grows stronger on every wound it opens.', flavor: 'It considers your enemies a nutrition plan.' },
  { id: 'predatory_bloom', name: 'Predatory Bloom', category: 'offensive', cls: 'Vital', baseRarity: 'rare', stats: { damageMult: 1.07, fireRateMult: 1.05 }, influence: { healing: 0.6, attackSpeed: 0.5 }, powerWeight: 0.067, desc: 'A flower with reflexes — living tempo and living hunger.', flavor: 'It opens for the sun and closes on whatever lands.' },
];
const UTILITY_4: MulliganModifier[] = [
  { id: 'gaze_polyp', name: 'Gaze Polyp', category: 'utility', cls: 'Neural', baseRarity: 'common', stats: { rangeMult: 1.08 }, influence: { slow: 0.4, support: 0.4 }, powerWeight: 0.047, desc: 'An unblinking watcher — the tower sees farther.', flavor: 'It has never once looked away. Ask it anything.' },
  { id: 'torpor_gland', name: 'Torpor Gland', category: 'utility', cls: 'Neural', baseRarity: 'rare', stats: { rangeMult: 1.08, splashMult: 1.06 }, influence: { slow: 0.9 }, powerWeight: 0.066, desc: 'A sleep-heavy secretion — the wave wades through syrup.', flavor: 'It exhales Sunday afternoons.' },
  { id: 'null_lattice', name: 'Null Lattice', category: 'utility', cls: 'Neural', baseRarity: 'legendary', stats: { rangeMult: 1.1, fireRateMult: 1.08 }, influence: { debuff: 0.9, slow: 0.6 }, powerWeight: 0.114, desc: 'A silencing mesh — wide reach, quick cycling, unraveling defenses.', flavor: 'It edits the enemy out of their own plans.' },
  { id: 'tuning_whisker', name: 'Tuning Whisker', category: 'utility', cls: 'Resonant', baseRarity: 'common', stats: { rangeMult: 1.07, fireRateMult: 1.02 }, influence: { support: 0.6 }, powerWeight: 0.046, desc: 'A fine antenna — the host holds a longer note.', flavor: 'It trembles at frequencies only ambition uses.' },
  { id: 'beacon_polyp', name: 'Beacon Polyp', category: 'utility', cls: 'Resonant', baseRarity: 'uncommon', stats: { rangeMult: 1.1 }, influence: { support: 0.7, crit: 0.3 }, powerWeight: 0.055, desc: 'A glowing marker organ — longer reach, chosen kills.', flavor: 'Everything it lights up is a suggestion.' },
  { id: 'chorale_bulb', name: 'Chorale Bulb', category: 'utility', cls: 'Resonant', baseRarity: 'ascendant', stats: { rangeMult: 1.14, fireRateMult: 1.08, damageMult: 1.05 }, influence: { support: 1, crit: 0.5, slow: 0.4 }, powerWeight: 0.152, desc: 'The apex support organ — reach, cadence, and a note that bites.', flavor: 'A congregation in a single cell.' },
  { id: 'midwife_pod', name: 'Midwife Pod', category: 'utility', cls: 'Vital', baseRarity: 'uncommon', stats: { fireRateMult: 1.05, rangeMult: 1.05 }, influence: { support: 0.6, healing: 0.5 }, powerWeight: 0.053, desc: 'A tending pod — the graft is kept quick and well.', flavor: 'It fusses. The tower pretends to mind.' },
  { id: 'verdant_socket', name: 'Verdant Socket', category: 'utility', cls: 'Vital', baseRarity: 'rare', stats: { fireRateMult: 1.07, splashMult: 1.05 }, influence: { healing: 0.7, splash: 0.3 }, powerWeight: 0.065, desc: 'A green-wet joint — smoother cycling, fuller blasts.', flavor: 'Where it roots, machinery forgets to rust.' },
  { id: 'root_anchor', name: 'Root Anchor', category: 'utility', cls: 'Vital', baseRarity: 'epic', stats: { rangeMult: 1.12, fireRateMult: 1.05 }, influence: { support: 0.8, healing: 0.5 }, powerWeight: 0.086, desc: 'A deep taproot — the host stands taller and reaches farther.', flavor: 'It grips the world like the world might wander off.' },
  { id: 'counterweight_bone', name: 'Counterweight Bone', category: 'utility', cls: 'Kinetic', baseRarity: 'uncommon', stats: { damageMult: 1.05, rangeMult: 1.06 }, influence: { damage: 0.4, support: 0.4 }, powerWeight: 0.054, desc: 'A balancing femur — steadier, longer throws.', flavor: 'Physics accepted the graft as a colleague.' },
  { id: 'trebuchet_tendon', name: 'Trebuchet Tendon', category: 'utility', cls: 'Kinetic', baseRarity: 'epic', stats: { rangeMult: 1.13, damageMult: 1.05 }, influence: { damage: 0.5, support: 0.6 }, powerWeight: 0.087, desc: 'A siege sinew — the host hurls its violence much farther.', flavor: 'It remembers castles. Fondly. In pieces.' },
  { id: 'fume_hood', name: 'Fume Hood', category: 'utility', cls: 'Caustic', baseRarity: 'common', stats: { splashMult: 1.08 }, influence: { splash: 0.5, slow: 0.3 }, powerWeight: 0.047, desc: 'A venting cowl — every burst breathes a little wider.', flavor: 'It exhales what the tower is too polite to.' },
  { id: 'acrid_veil', name: 'Acrid Veil', category: 'utility', cls: 'Caustic', baseRarity: 'rare', stats: { splashMult: 1.1, rangeMult: 1.05 }, influence: { slow: 0.6, poison: 0.4 }, powerWeight: 0.066, desc: 'A hanging chemical mist — wider bursts that sting and slow.', flavor: 'Walking through it is a decision you make once.' },
  { id: 'dissolving_lens', name: 'Dissolving Lens', category: 'utility', cls: 'Caustic', baseRarity: 'epic', stats: { rangeMult: 1.1, splashMult: 1.08 }, influence: { poison: 0.6, splash: 0.6 }, powerWeight: 0.085, desc: 'An acid-ground optic — it focuses corrosion at range.', flavor: 'It sees you clearly. Then, gradually, less of you.' },
  { id: 'vector_cilia', name: 'Vector Cilia', category: 'utility', cls: 'Viral', baseRarity: 'uncommon', stats: { fireRateMult: 1.06, rangeMult: 1.04 }, influence: { debuff: 0.5, attackSpeed: 0.4 }, powerWeight: 0.054, desc: 'Carrier hairs — quicker cycles, weaker victims.', flavor: 'They wave hello. It is not a greeting.' },
  { id: 'quarantine_web', name: 'Quarantine Web', category: 'utility', cls: 'Viral', baseRarity: 'rare', stats: { rangeMult: 1.09, splashMult: 1.05 }, influence: { slow: 0.7, debuff: 0.5 }, powerWeight: 0.067, desc: 'A containment weave — the wave is held where it sickens.', flavor: 'Nothing inside is going anywhere. That is the treatment.' },
  { id: 'carrier_swarm', name: 'Carrier Swarm', category: 'utility', cls: 'Viral', baseRarity: 'legendary', stats: { fireRateMult: 1.1, rangeMult: 1.08 }, influence: { debuff: 0.7, poison: 0.5, attackSpeed: 0.4 }, powerWeight: 0.115, desc: 'A cloud of couriers — fast delivery of very bad news.', flavor: 'Each one carries a letter. All the letters are the same.' },
];
const BIOLOGICAL_4: MulliganModifier[] = [
  { id: 'lesion_garden', name: 'Lesion Garden', category: 'biological', cls: 'Viral', baseRarity: 'common', stats: { damageMult: 1.05, splashMult: 1.04 }, influence: { poison: 0.7 }, powerWeight: 0.047, desc: 'A cultivated bed of open sores — rot that keeps blooming.', flavor: 'It weeds out the healthy tissue.' },
  { id: 'carrion_maw', name: 'Carrion Maw', category: 'biological', cls: 'Viral', baseRarity: 'rare', stats: { damageMult: 1.09, splashMult: 1.05 }, influence: { poison: 0.7, debuff: 0.5 }, powerWeight: 0.068, desc: 'A scavenging mouth — every wound is a meal begun.', flavor: 'It never kills anything. It just starts lunch early.' },
  { id: 'patient_zero', name: 'Patient Zero', category: 'biological', cls: 'Viral', baseRarity: 'legendary', stats: { damageMult: 1.1, fireRateMult: 1.07 }, influence: { poison: 1, debuff: 0.5 }, powerWeight: 0.116, desc: 'The origin organ — infection with a genealogy.', flavor: 'Every plague on the field calls it grandmother.' },
  { id: 'cradle_membrane', name: 'Cradle Membrane', category: 'biological', cls: 'Vital', baseRarity: 'common', stats: { fireRateMult: 1.04, rangeMult: 1.03 }, influence: { healing: 0.8 }, powerWeight: 0.046, desc: 'A swaddling film — the graft is kept warm and working.', flavor: 'It hums lullabies at a cellular level.' },
  { id: 'sinew_graft', name: 'Sinew Graft', category: 'biological', cls: 'Vital', baseRarity: 'uncommon', stats: { damageMult: 1.06, fireRateMult: 1.04 }, influence: { healing: 0.5, damage: 0.4 }, powerWeight: 0.054, desc: 'Living cord wound through the host — strength that repairs itself.', flavor: 'Tear it and it takes notes.' },
  { id: 'heartwood_core', name: 'Heartwood Core', category: 'biological', cls: 'Vital', baseRarity: 'epic', stats: { fireRateMult: 1.08, rangeMult: 1.07 }, influence: { healing: 0.9, support: 0.5 }, powerWeight: 0.086, desc: 'An old-growth heart — deep rings of patient vigor.', flavor: 'Count the rings. Each one is a war it outlived.' },
  { id: 'eden_spore', name: 'Eden Spore', category: 'biological', cls: 'Vital', baseRarity: 'ascendant', stats: { damageMult: 1.12, fireRateMult: 1.09, rangeMult: 1.06 }, influence: { healing: 1, support: 0.7, poison: 0.4 }, powerWeight: 0.154, desc: 'The apex vital seed — a whole garden waiting in one cell.', flavor: 'Plant it anywhere and somewhere becomes an ecosystem with a grudge.' },
  { id: 'bile_comb', name: 'Bile Comb', category: 'biological', cls: 'Caustic', baseRarity: 'uncommon', stats: { splashMult: 1.1 }, influence: { poison: 0.5, splash: 0.5 }, powerWeight: 0.055, desc: 'A honeycomb of acids — cells that burst in sequence.', flavor: 'The bees left. The chemistry stayed.' },
  { id: 'smelter_polyp', name: 'Smelter Polyp', category: 'biological', cls: 'Caustic', baseRarity: 'rare', stats: { damageMult: 1.08, splashMult: 1.07 }, influence: { splash: 0.7, damage: 0.4 }, powerWeight: 0.067, desc: 'A digesting furnace — it renders armor into weather.', flavor: 'Everything melts at SOME temperature. It collects those numbers.' },
  { id: 'tar_lung', name: 'Tar Lung', category: 'biological', cls: 'Caustic', baseRarity: 'epic', stats: { splashMult: 1.12, rangeMult: 1.05 }, influence: { slow: 0.6, splash: 0.6, poison: 0.3 }, powerWeight: 0.085, desc: 'A breathing pitch-sac — wide black bursts that cling.', flavor: 'Its exhale sticks around. Literally. Indefinitely.' },
  { id: 'keel_bone', name: 'Keel Bone', category: 'biological', cls: 'Kinetic', baseRarity: 'common', stats: { damageMult: 1.06 }, influence: { damage: 0.6, pierce: 0.3 }, powerWeight: 0.048, desc: 'A ship-spine graft — the host hits with hull-weight.', flavor: 'Something enormous swam with this once. It misses the momentum.' },
  { id: 'anvil_carapace', name: 'Anvil Carapace', category: 'biological', cls: 'Kinetic', baseRarity: 'rare', stats: { damageMult: 1.1, projectileMutators: ['pierce1'] }, influence: { pierce: 0.7, damage: 0.5 }, powerWeight: 0.069, desc: 'Forge-hard plating — blows that carry through.', flavor: 'It was born quenched.' },
  { id: 'thought_moss', name: 'Thought Moss', category: 'biological', cls: 'Neural', baseRarity: 'uncommon', stats: { rangeMult: 1.06, fireRateMult: 1.04 }, influence: { debuff: 0.5, slow: 0.4 }, powerWeight: 0.053, desc: 'A creeping cognitive felt — it thinks ON the tower, slowly, everywhere.', flavor: 'Given a century it would finish its sentence.' },
  { id: 'dreaming_tumor', name: 'Dreaming Tumor', category: 'biological', cls: 'Neural', baseRarity: 'legendary', stats: { fireRateMult: 1.09, rangeMult: 1.08 }, influence: { debuff: 0.8, slow: 0.6, support: 0.3 }, powerWeight: 0.114, desc: 'A sleeping mind-mass — its nightmares leak into the lane.', flavor: 'Do not wake it. The dream is the weapon.' },
  { id: 'psalm_kelp', name: 'Psalm Kelp', category: 'biological', cls: 'Resonant', baseRarity: 'uncommon', stats: { rangeMult: 1.07, fireRateMult: 1.03 }, influence: { support: 0.6, healing: 0.3 }, powerWeight: 0.053, desc: 'Swaying hymn-fronds — the host keeps a steadier rhythm.', flavor: 'It sings underwater songs to dry land, and the land listens.' },
  { id: 'tide_organ', name: 'Tide Organ', category: 'biological', cls: 'Resonant', baseRarity: 'rare', stats: { rangeMult: 1.1, splashMult: 1.05 }, influence: { support: 0.6, slow: 0.5 }, powerWeight: 0.066, desc: 'A pipework of currents — reach that comes in waves.', flavor: 'It practices patience twice a day, forever.' },
  { id: 'cathedral_polyp', name: 'Cathedral Polyp', category: 'biological', cls: 'Resonant', baseRarity: 'epic', stats: { rangeMult: 1.11, fireRateMult: 1.06 }, influence: { support: 0.9, crit: 0.4 }, powerWeight: 0.087, desc: 'A vaulted living chamber — every shot leaves consecrated.', flavor: 'It grew its own acoustics. The reverb is load-bearing.' },
];

// ── The reaction 18 (6 per category) — the catalog keeps its 6-per-tower ratio as the roster
// grows to twenty (Miasma Lung + Chitin Bell + Acid Lancet). Fog, toll and cull flavor. ──
const OFFENSIVE_5: MulliganModifier[] = [
  { id: 'fog_bore', name: 'Fog Bore', category: 'offensive', cls: 'Viral', baseRarity: 'common', stats: { damageMult: 1.06, rangeMult: 1.03 }, influence: { poison: 0.6, damage: 0.3 }, powerWeight: 0.048, desc: 'A misting drill — soft wounds that never close.', flavor: 'It makes holes the weather can use.' },
  { id: 'plague_bellows', name: 'Plague Bellows', category: 'offensive', cls: 'Viral', baseRarity: 'epic', stats: { fireRateMult: 1.08, damageMult: 1.06 }, influence: { poison: 0.8, attackSpeed: 0.5 }, powerWeight: 0.087, desc: 'A pumping infection organ — every cycle exhales harm.', flavor: 'In, out. The out is the problem.' },
  { id: 'knell_hammer', name: 'Knell Hammer', category: 'offensive', cls: 'Resonant', baseRarity: 'rare', stats: { damageMult: 1.11, splashMult: 1.04 }, influence: { damage: 0.7, splash: 0.4 }, powerWeight: 0.069, desc: 'A tolling striker — blows that ring through the pack.', flavor: 'It only knows downbeats.' },
  { id: 'shear_tine', name: 'Shear Tine', category: 'offensive', cls: 'Resonant', baseRarity: 'uncommon', stats: { damageMult: 1.07, projectileMutators: ['pierce1'] }, influence: { crit: 0.5, pierce: 0.5 }, powerWeight: 0.056, desc: 'A vibrating prong — strikes that split what they touch.', flavor: 'It finds the fault line in everything. Everything has one.' },
  { id: 'headsman_barb', name: 'Headsman Barb', category: 'offensive', cls: 'Caustic', baseRarity: 'legendary', stats: { damageMult: 1.17, fireRateMult: 1.04 }, influence: { damage: 0.9, crit: 0.6 }, powerWeight: 0.117, desc: "An executioner's hook — heavier, crueler strokes.", flavor: 'One stroke, it insists. It is willing to be wrong twice.' },
  { id: 'bile_piston', name: 'Bile Piston', category: 'offensive', cls: 'Caustic', baseRarity: 'uncommon', stats: { damageMult: 1.08, splashMult: 1.04 }, influence: { poison: 0.5, damage: 0.5 }, powerWeight: 0.056, desc: 'A pressurized acid ram — driven, dissolving impacts.', flavor: 'Pressure is patience with a deadline.' },
];
const UTILITY_5: MulliganModifier[] = [
  { id: 'miasma_hood', name: 'Miasma Hood', category: 'utility', cls: 'Viral', baseRarity: 'common', stats: { rangeMult: 1.06, splashMult: 1.04 }, influence: { slow: 0.4, poison: 0.4 }, powerWeight: 0.047, desc: 'A fog-holding cowl — the bank drifts wider.', flavor: 'It keeps the weather on retainer.' },
  { id: 'vector_bloom', name: 'Vector Bloom', category: 'utility', cls: 'Viral', baseRarity: 'epic', stats: { rangeMult: 1.1, fireRateMult: 1.06 }, influence: { debuff: 0.7, support: 0.5 }, powerWeight: 0.086, desc: 'A signal flower for contagion — farther, faster delivery.', flavor: 'It advertises. The plague answers.' },
  { id: 'resonant_keel', name: 'Resonant Keel', category: 'utility', cls: 'Resonant', baseRarity: 'rare', stats: { rangeMult: 1.09, damageMult: 1.05 }, influence: { support: 0.6, crit: 0.4 }, powerWeight: 0.067, desc: 'A tuned spine — the host holds its note farther out.', flavor: 'It steers by harmony.' },
  { id: 'silence_fermata', name: 'Silence Fermata', category: 'utility', cls: 'Resonant', baseRarity: 'legendary', stats: { rangeMult: 1.1, fireRateMult: 1.07 }, influence: { debuff: 0.8, slow: 0.6 }, powerWeight: 0.115, desc: 'A held rest — the wave hesitates inside it.', flavor: 'The pause is scored. The orchestra is you.' },
  { id: 'rangefinder_stalk', name: 'Rangefinder Stalk', category: 'utility', cls: 'Caustic', baseRarity: 'uncommon', stats: { rangeMult: 1.1 }, influence: { support: 0.6, crit: 0.3 }, powerWeight: 0.055, desc: 'A measuring eye-stalk — the cull is computed early.', flavor: 'It knows the distance to everything it dislikes.' },
  { id: 'gallows_frame', name: 'Gallows Frame', category: 'utility', cls: 'Kinetic', baseRarity: 'rare', stats: { rangeMult: 1.08, damageMult: 1.06 }, influence: { damage: 0.5, support: 0.5 }, powerWeight: 0.068, desc: 'A braced execution mount — steadier, heavier draws.', flavor: 'Built once, used often.' },
];
const BIOLOGICAL_5: MulliganModifier[] = [
  { id: 'spore_gill', name: 'Spore Gill', category: 'biological', cls: 'Viral', baseRarity: 'uncommon', stats: { splashMult: 1.07, fireRateMult: 1.03 }, influence: { poison: 0.6, splash: 0.4 }, powerWeight: 0.054, desc: 'A breathing gill-slit — every breath seeds the air.', flavor: 'It filters nothing. That is the function.' },
  { id: 'pandemic_root', name: 'Pandemic Root', category: 'biological', cls: 'Viral', baseRarity: 'legendary', stats: { damageMult: 1.09, rangeMult: 1.08 }, influence: { poison: 0.9, debuff: 0.5 }, powerWeight: 0.115, desc: 'A taproot into the outbreak itself — reach that infects.', flavor: 'Follow it down far enough and you find the first cough.' },
  { id: 'bronze_chitin', name: 'Bronze Chitin', category: 'biological', cls: 'Resonant', baseRarity: 'common', stats: { damageMult: 1.05, rangeMult: 1.04 }, influence: { support: 0.5, damage: 0.4 }, powerWeight: 0.047, desc: 'Bell-metal plating — the body rings when struck.', flavor: 'Armor that answers back.' },
  { id: 'chime_marrow', name: 'Chime Marrow', category: 'biological', cls: 'Resonant', baseRarity: 'epic', stats: { fireRateMult: 1.09, rangeMult: 1.05 }, influence: { support: 0.7, attackSpeed: 0.5 }, powerWeight: 0.086, desc: 'Hollow singing bone — the host keeps perfect time.', flavor: 'Its skeleton is a carillon.' },
  { id: 'gall_bladderwort', name: 'Gall Bladderwort', category: 'biological', cls: 'Caustic', baseRarity: 'rare', stats: { damageMult: 1.08, splashMult: 1.06 }, influence: { poison: 0.7, splash: 0.4 }, powerWeight: 0.067, desc: 'A carnivorous acid plant — it digests before the bite.', flavor: 'It grows teeth as a formality.' },
  { id: 'culling_eye', name: 'Culling Eye', category: 'biological', cls: 'Neural', baseRarity: 'epic', stats: { damageMult: 1.07, rangeMult: 1.08 }, influence: { crit: 0.7, support: 0.4 }, powerWeight: 0.087, desc: "A judge's eye grown into the graft — it picks what dies next.", flavor: 'It has a list. You are the pen.' },
];

// ── The arena 12 (4 per category) — the catalog keeps its 6-per-tower ratio as the roster
// grows to twenty-two (Basilisk Maw + Ossuary Choir, the Pass crowns). Stare + hymn flavor. ──
const OFFENSIVE_6: MulliganModifier[] = [
  { id: 'gorgon_lens', name: 'Gorgon Lens', category: 'offensive', cls: 'Neural', baseRarity: 'rare', stats: { damageMult: 1.09, rangeMult: 1.05 }, influence: { crit: 0.6, slow: 0.5 }, powerWeight: 0.068, desc: 'A petrifying optic — strikes that land like verdicts.', flavor: 'It looked at a river once. The river is still deciding.' },
  { id: 'victors_fang', name: "Victor's Fang", category: 'offensive', cls: 'Kinetic', baseRarity: 'epic', stats: { damageMult: 1.13, fireRateMult: 1.04 }, influence: { damage: 0.8, crit: 0.5 }, powerWeight: 0.088, desc: 'A trophy tooth from the proving grounds — heavier, prouder blows.', flavor: 'It has already won. It is just showing you how.' },
  { id: 'requiem_pipe', name: 'Requiem Pipe', category: 'offensive', cls: 'Resonant', baseRarity: 'uncommon', stats: { damageMult: 1.07, splashMult: 1.05 }, influence: { splash: 0.6, support: 0.4 }, powerWeight: 0.056, desc: 'A bone flue that plays through every impact.', flavor: 'Each note is a casualty report, sung ahead of schedule.' },
  { id: 'arena_spur', name: 'Arena Spur', category: 'offensive', cls: 'Viral', baseRarity: 'legendary', stats: { damageMult: 1.14, fireRateMult: 1.06 }, influence: { damage: 0.8, poison: 0.5, attackSpeed: 0.4 }, powerWeight: 0.117, desc: 'A grafted champion-claw — the killing tempo of the pit.', flavor: 'It fights in rounds. It has never needed the second one.' },
];
const UTILITY_6: MulliganModifier[] = [
  { id: 'stone_iris', name: 'Stone Iris', category: 'utility', cls: 'Neural', baseRarity: 'uncommon', stats: { rangeMult: 1.08, splashMult: 1.04 }, influence: { slow: 0.7, debuff: 0.3 }, powerWeight: 0.055, desc: 'A calcified pupil — what it watches, hesitates.', flavor: 'Blink first. It will not.' },
  { id: 'nave_bracket', name: 'Nave Bracket', category: 'utility', cls: 'Resonant', baseRarity: 'rare', stats: { rangeMult: 1.1, fireRateMult: 1.04 }, influence: { support: 0.8, crit: 0.3 }, powerWeight: 0.067, desc: 'A vaulting rib-brace — the host sings over a wider yard.', flavor: 'Architecture, but ambitious about it.' },
  { id: 'judges_bench', name: "Judge's Bench", category: 'utility', cls: 'Kinetic', baseRarity: 'epic', stats: { rangeMult: 1.11, damageMult: 1.05 }, influence: { support: 0.6, damage: 0.5 }, powerWeight: 0.086, desc: 'A raised firing seat — longer sight, weightier sentences.', flavor: 'All rise. Most fall.' },
  { id: 'colosseum_gate', name: 'Colosseum Gate', category: 'utility', cls: 'Vital', baseRarity: 'common', stats: { rangeMult: 1.06, fireRateMult: 1.03 }, influence: { support: 0.6, healing: 0.3 }, powerWeight: 0.047, desc: 'A living arena arch — the graft holds its ground longer.', flavor: 'Everything that enters is a contestant. It keeps the score.' },
];
const BIOLOGICAL_6: MulliganModifier[] = [
  { id: 'trophy_marrow', name: 'Trophy Marrow', category: 'biological', cls: 'Vital', baseRarity: 'rare', stats: { damageMult: 1.07, fireRateMult: 1.05 }, influence: { healing: 0.7, damage: 0.4 }, powerWeight: 0.067, desc: 'Bone from a thousand victors — strength that remembers winning.', flavor: 'Every splinter has a title to defend.' },
  { id: 'petrified_heart', name: 'Petrified Heart', category: 'biological', cls: 'Neural', baseRarity: 'epic', stats: { damageMult: 1.06, rangeMult: 1.08 }, influence: { slow: 0.7, debuff: 0.5 }, powerWeight: 0.086, desc: 'A heart the stare caught mid-beat — its stillness is contagious.', flavor: 'It stopped. Politely, everything near it tries to match.' },
  { id: 'chorister_gland', name: 'Chorister Gland', category: 'biological', cls: 'Resonant', baseRarity: 'uncommon', stats: { fireRateMult: 1.06, rangeMult: 1.04 }, influence: { support: 0.7, attackSpeed: 0.3 }, powerWeight: 0.054, desc: 'A grafted singing organ — the host keeps liturgical time.', flavor: 'It hums while it works. The hum is the work.' },
  { id: 'pit_ichor', name: 'Pit Ichor', category: 'biological', cls: 'Caustic', baseRarity: 'legendary', stats: { damageMult: 1.11, splashMult: 1.07 }, influence: { poison: 0.8, splash: 0.6 }, powerWeight: 0.116, desc: 'Blood of the arena floor — everything it splashes has already lost.', flavor: 'The pit keeps a little of everyone. This is the little.' },
];

mulliganRegistry.registerAll([...OFFENSIVE, ...UTILITY, ...BIOLOGICAL, ...OFFENSIVE_2, ...UTILITY_2, ...BIOLOGICAL_2, ...OFFENSIVE_3, ...UTILITY_3, ...BIOLOGICAL_3, ...OFFENSIVE_4, ...UTILITY_4, ...BIOLOGICAL_4, ...OFFENSIVE_5, ...UTILITY_5, ...BIOLOGICAL_5, ...OFFENSIVE_6, ...UTILITY_6, ...BIOLOGICAL_6]);

/** The catalog-ratio contract (content-integrity tests): pieces per tower in the roster.
 *  3 = exact coverage (every seat fillable under §exclusivity, zero spare); the catalog now
 *  ships at 6 — TWO full alternative organisms per tower, so a decked roster still has real
 *  build choices and the loot chase keeps paying. Adding a tower forces 6 new pieces
 *  (2 per category — per-category count stays CATALOG_PER_TOWER/3 × roster). */
export const CATALOG_PER_TOWER = 6;

// ── Progress gate (§gate): the whole pillar unlocks after slaying THREE distinct Mega
// Bosses (save.megaProgress.slain). Accounts that already hold pieces are grandfathered. ──
export const MULLIGAN_GATE_MEGAS = 3;

/** All modifiers of a category (UI grouping / collections). */
export function modifiersByCategory(cat: MulliganModifier['category']): MulliganModifier[] {
  return mulliganRegistry.all().filter((m) => m.category === cat);
}

/** All modifiers of a biological class (class chrome, collections, the recommender). */
export function modifiersByClass(cls: CombatClass): MulliganModifier[] {
  return mulliganRegistry.all().filter((m) => m.cls === cls);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASS ADAPTATIONS (docs/MULLIGANS.md §adaptations) — the set bonus. A completed organism
// compares its three modifiers' classes against the HOST tower's class: all three match ⇒ the
// FULL adaptation (a capability, not just numbers); exactly two ⇒ the MINOR adaptation
// (numbers only). Bonuses speak the EXISTING MulliganStats vocabulary and reinforce each
// class's identity — no new sim branches, golden-safe by the same inactive⇒identity gate.
// Hybrids stay viable: three strong mismatched grafts still beat two weak matched ones.
// ─────────────────────────────────────────────────────────────────────────────
export type AdaptationTier = 'full' | 'minor';

export interface ClassAdaptation {
  cls: CombatClass;
  /** The ceremony name — "COMPLETE CLASS ADAPTATION · KINETIC SYNCHRONIZED". */
  title: string;
  fullDesc: string;
  minorDesc: string;
  full: MulliganStats;
  minor: MulliganStats;
}

/** Power multiplier bonus for an active adaptation (rides the mulligans Power bucket). */
export const ADAPTATION_POWER: Record<AdaptationTier, number> = { full: 0.06, minor: 0.025 };

export const CLASS_ADAPTATIONS: Record<CombatClass, ClassAdaptation> = {
  Kinetic: {
    cls: 'Kinetic', title: 'Ossified Momentum',
    fullDesc: 'Every shot punches through one additional host, and hits land 10% harder.',
    minorDesc: 'Hits land 6% harder.',
    full: { damageMult: 1.1, projectileMutators: ['pierce1'] },
    minor: { damageMult: 1.06 },
  },
  Caustic: {
    cls: 'Caustic', title: 'Runaway Dissolution',
    fullDesc: 'Detonations bloom 22% wider and bite 4% deeper — packs dissolve together.',
    minorDesc: 'Detonations bloom 10% wider.',
    full: { splashMult: 1.22, damageMult: 1.04 },
    minor: { splashMult: 1.1 },
  },
  Viral: {
    cls: 'Viral', title: 'Epidemic Cadence',
    fullDesc: 'The infection cycles 10% faster and wounds fester 6% deeper — contagion outruns the cure.',
    minorDesc: 'The infection cycles 6% faster.',
    full: { fireRateMult: 1.1, damageMult: 1.06 },
    minor: { fireRateMult: 1.06 },
  },
  Neural: {
    cls: 'Neural', title: 'Synaptic Overreach',
    fullDesc: 'The lattice sees 10% farther and thinks 8% faster — control arrives before the wave does.',
    minorDesc: 'The lattice sees 6% farther.',
    full: { rangeMult: 1.1, fireRateMult: 1.08 },
    minor: { rangeMult: 1.06 },
  },
  Vital: {
    cls: 'Vital', title: 'Perpetual Bloom',
    fullDesc: 'The organism sustains a relentless tempo — 6% faster, 6% farther, 4% harder, forever.',
    minorDesc: 'The organism quickens by 5%.',
    full: { fireRateMult: 1.06, rangeMult: 1.06, damageMult: 1.04 },
    minor: { fireRateMult: 1.05 },
  },
  Resonant: {
    cls: 'Resonant', title: 'Harmonic Chorus',
    fullDesc: 'A harmonic echo strikes one additional target, and the note carries 5% farther.',
    minorDesc: 'The note carries 8% farther.',
    full: { extraProjectiles: 1, rangeMult: 1.05 },
    minor: { rangeMult: 1.08 },
  },
};

export interface AdaptationView {
  hostClass: CombatClass;
  matches: number; // filled slots whose class matches the host (0..3, counts even while inactive)
  tier: AdaptationTier | null; // full (3/3) / minor (2/3) — only while the organism is ACTIVE
  adaptation: ClassAdaptation; // the host class's definition (UI reads titles/descs from here)
}

/** The host-synergy read: how close is this organism to the host's Complete Class Adaptation? */
export function adaptationOf(state: MulliganState | undefined | null, hostClass: CombatClass): AdaptationView {
  let matches = 0;
  for (const slot of state?.slots ?? []) {
    const def = slot ? mulliganRegistry.get(slot.id) : undefined;
    if (def && def.cls === hostClass) matches++;
  }
  const active = isMulliganActive(state);
  const tier: AdaptationTier | null = active && matches >= MULLIGAN_SLOTS ? 'full' : active && matches === MULLIGAN_SLOTS - 1 ? 'minor' : null;
  return { hostClass, matches, tier, adaptation: CLASS_ADAPTATIONS[hostClass] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-slot save shape (the slot permanently remembers its modifier, rarity, level) +
// the owning Mulligan (three slots + the generated seeds). Defined here so the module
// owns its types; saveStore imports them. Empty slots are `null`.
// ─────────────────────────────────────────────────────────────────────────────
export interface MulliganSlot {
  id: string; // modifier id (mulliganRegistry)
  rarity: MulliganRarity;
  level: number; // ≥ 1, ≤ MULLIGAN_RARITY[rarity].levelCap
}
export interface MulliganState {
  slots: (MulliganSlot | null)[]; // length MULLIGAN_SLOTS
  visualSeed: number; // deterministic organism generation
  animSeed: number; // deterministic animation phase generation
  /** §reforge (v29): the first wheel spin permanently binds this organism to its host —
   *  no unequip, no re-slotting, ever. */
  locked?: boolean;
  /** §reforge (v29): rolled reforge mod ids by slot (1–3 usable — reforgeSlotCount). */
  reforges?: (string | null)[];
}

export function emptyMulligan(): MulliganState {
  return { slots: [null, null, null], visualSeed: 0, animSeed: 0 };
}

/** §exclusivity — a piece lives on ONE tower at a time: find which tower currently hosts a
 *  modifier id (the equip pipeline moves it, the sanitizer enforces it). Null if unhosted. */
export function modifierHost(mulligans: Record<string, MulliganState | undefined>, modId: string): string | null {
  for (const [kind, st] of Object.entries(mulligans)) {
    if (st?.slots?.some((s) => s?.id === modId)) return kind;
  }
  return null;
}

/** §reforge — usable wheel slots (1–3) from the COMBINED rarity of the three grafts:
 *  humble organisms gamble once, apex organisms three times. 0 while inactive. */
export function reforgeSlotCount(state: MulliganState | undefined | null): number {
  if (!isMulliganActive(state)) return 0;
  const sum = state!.slots.reduce((a, s) => a + (s ? MULLIGAN_RARITY[s.rarity].tier : 0), 0); // 0..15
  return sum >= 10 ? 3 : sum >= 5 ? 2 : 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scaling — rarity × level both grow the stat DELTAS (never the base 1, so an empty or
// low investment stays gentle) and the Power. Level scaling is linear and future-proofed
// to MULLIGAN_MAX_LEVEL; rarity caps how far a slot may climb.
// ─────────────────────────────────────────────────────────────────────────────
const PER_LEVEL = 0.06; // each level adds 6% of a delta's Common magnitude (× rarity.statMult)

/** The multiplier applied to a stat DELTA for a given rarity + level. */
export function statScale(rarity: MulliganRarity, level: number): number {
  const r = MULLIGAN_RARITY[rarity];
  const lv = Math.max(1, level);
  return r.statMult * (1 + PER_LEVEL * (lv - 1));
}

/** A slot's effective sim stats (base deltas scaled by rarity + level). */
export function effectiveStats(slot: MulliganSlot): MulliganStats {
  const def = mulliganRegistry.get(slot.id);
  if (!def) return {};
  const s = statScale(slot.rarity, slot.level);
  const scaleMult = (v: number | undefined): number | undefined => (v === undefined ? undefined : 1 + (v - 1) * s);
  return {
    damageMult: scaleMult(def.stats.damageMult),
    fireRateMult: scaleMult(def.stats.fireRateMult),
    rangeMult: scaleMult(def.stats.rangeMult),
    splashMult: scaleMult(def.stats.splashMult),
    extraProjectiles: def.stats.extraProjectiles, // integer capability — flat, not scaled
    projectileMutators: def.stats.projectileMutators,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolver — the single entry point the sim + Power + generators read. Identity unless
// ALL THREE slots are filled with known modifiers (the "no partial activation" rule and
// the golden-safety gate in one place).
// ─────────────────────────────────────────────────────────────────────────────
export interface ResolvedMulligan {
  active: boolean;
  damageMult: number;
  fireRateMult: number;
  rangeMult: number;
  splashMult: number;
  extraProjectiles: number;
  projectileMutators: string[];
  profile: StatProfile; // aggregated archetype vector (generators)
  power: number; // ≥ 1 Power multiplier contribution
  /** Host-class set bonus (docs/MULLIGANS.md §adaptations) — null when no host class was
   *  given (legacy callers) or nothing activated. Drives the evolved visual + UI badges. */
  adaptation: { cls: CombatClass; tier: AdaptationTier } | null;
}

export function identityMulligan(): ResolvedMulligan {
  return { active: false, damageMult: 1, fireRateMult: 1, rangeMult: 1, splashMult: 1, extraProjectiles: 0, projectileMutators: [], profile: zeroProfile(), power: 1, adaptation: null };
}

/** True only when every slot holds a known modifier — the activation gate. */
export function isMulliganActive(state: MulliganState | undefined | null): boolean {
  if (!state || !state.slots || state.slots.length < MULLIGAN_SLOTS) return false;
  for (let i = 0; i < MULLIGAN_SLOTS; i++) {
    const s = state.slots[i];
    if (!s || !mulliganRegistry.has(s.id)) return false;
  }
  return true;
}

export function resolveMulligan(state: MulliganState | undefined | null, hostClass?: CombatClass): ResolvedMulligan {
  const out = identityMulligan();
  if (!isMulliganActive(state)) return out; // <3 filled ⇒ identity (golden-safe)
  out.active = true;
  for (let i = 0; i < MULLIGAN_SLOTS; i++) {
    const slot = state!.slots[i]!;
    const def = mulliganRegistry.get(slot.id)!;
    const es = effectiveStats(slot);
    if (es.damageMult) out.damageMult *= es.damageMult;
    if (es.fireRateMult) out.fireRateMult *= es.fireRateMult;
    if (es.rangeMult) out.rangeMult *= es.rangeMult;
    if (es.splashMult) out.splashMult *= es.splashMult;
    if (es.extraProjectiles) out.extraProjectiles += es.extraProjectiles;
    if (es.projectileMutators) out.projectileMutators.push(...es.projectileMutators);
    // Profile: influence × rarity intensity × a gentle level ramp — mixing AND stacking both move it.
    const r = MULLIGAN_RARITY[slot.rarity];
    const w = r.visualIntensity * (1 + 0.04 * (Math.max(1, slot.level) - 1));
    for (const axis of MULLIGAN_AXES) {
      const inf = def.influence[axis];
      if (inf) out.profile[axis] += inf * w;
    }
    out.power *= 1 + def.powerWeight * r.powerMult * (1 + PER_LEVEL * (Math.max(1, slot.level) - 1));
  }
  // §reforge — rolled mods fold their TOWER-LOCAL stats through the same channels (global
  // passives are folded account-side by meta.mulliganGlobalEffects, never here). Only slots
  // the composition actually grants count; unknown ids are ignored (sanitizer parity).
  const usable = reforgeSlotCount(state);
  for (let i = 0; i < usable; i++) {
    const rf = state!.reforges?.[i] ? reforgeModById(state!.reforges![i]!) : undefined;
    if (!rf) continue;
    const s = rf.stats;
    if (s?.damageMult) out.damageMult *= s.damageMult;
    if (s?.fireRateMult) out.fireRateMult *= s.fireRateMult;
    if (s?.rangeMult) out.rangeMult *= s.rangeMult;
    if (s?.splashMult) out.splashMult *= s.splashMult;
    if (s?.extraProjectiles) out.extraProjectiles += s.extraProjectiles;
    if (s?.projectileMutators) out.projectileMutators.push(...s.projectileMutators);
    out.power *= 1 + REFORGE_RARITY[rf.rarity].power;
  }
  // §adaptations — the host-class set bonus folds through the SAME channels, last (order is
  // cosmetic: everything multiplies). Capability grants (pierce, echo targets) are FULL-only.
  if (hostClass) {
    const a = adaptationOf(state, hostClass);
    if (a.tier) {
      const bonus = a.tier === 'full' ? a.adaptation.full : a.adaptation.minor;
      if (bonus.damageMult) out.damageMult *= bonus.damageMult;
      if (bonus.fireRateMult) out.fireRateMult *= bonus.fireRateMult;
      if (bonus.rangeMult) out.rangeMult *= bonus.rangeMult;
      if (bonus.splashMult) out.splashMult *= bonus.splashMult;
      if (bonus.extraProjectiles) out.extraProjectiles += bonus.extraProjectiles;
      if (bonus.projectileMutators) out.projectileMutators.push(...bonus.projectileMutators);
      out.power *= 1 + ADAPTATION_POWER[a.tier];
      out.adaptation = { cls: hostClass, tier: a.tier };
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Power — a dedicated, separately-displayed contribution (docs/POWER-SCORE §mulligans).
// It rides its own PowerParts bucket; a heuristic (like equipment rarity / branch tiers),
// NOT a FIELD_WEIGHT field, so it never touches power coverage. 1 when inactive.
// ─────────────────────────────────────────────────────────────────────────────
export function mulliganPower(state: MulliganState | undefined | null, hostClass?: CombatClass): number {
  return resolveMulligan(state, hostClass).power;
}
/** Roster Power across all towers' Mulligans (each ≥ 1) — the account-level bucket.
 *  Pairs carry the HOST class so Adaptation bonuses score (docs/MULLIGANS.md §adaptations). */
export function accountMulliganPower(pairs: Iterable<readonly [MulliganState | undefined, CombatClass]>): number {
  let mult = 1;
  for (const [s, cls] of pairs) mult *= mulliganPower(s, cls);
  return mult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Upgrade economy — spends Gene Essence (the unified gene currency, shared with Gene Card
// levels). Level up within the rarity cap; ASCEND to bump rarity a tier (Ascension-ready).
// Costs rise with level + rarity.
// ─────────────────────────────────────────────────────────────────────────────
export function levelCap(rarity: MulliganRarity): number {
  return Math.min(MULLIGAN_MAX_LEVEL, MULLIGAN_RARITY[rarity].levelCap);
}
export function isMaxLevel(slot: MulliganSlot): boolean {
  return slot.level >= levelCap(slot.rarity);
}
/** Gene Essence cost to go level → level+1 at this rarity (rounded, monotonic). */
export function upgradeCost(rarity: MulliganRarity, level: number): number {
  const r = MULLIGAN_RARITY[rarity];
  return Math.round(20 * (r.tier + 1) * Math.pow(1.35, Math.max(0, level - 1)));
}
/** Gene Essence cost to ascend a maxed slot to the next rarity (null if already Ascendant). */
export function ascendCost(rarity: MulliganRarity): number | null {
  const nxt = nextRarity(rarity);
  if (!nxt) return null;
  return Math.round(400 * Math.pow(2.1, MULLIGAN_RARITY[rarity].tier));
}

// ─────────────────────────────────────────────────────────────────────────────
// Loot roll — a rarity draw for a discovered modifier (weighted toward common). Pure
// (takes a [0,1) roll), so the caller owns the RNG. (docs/MULLIGANS.md §loot)
// ─────────────────────────────────────────────────────────────────────────────
const RARITY_DROP_WEIGHT: Record<MulliganRarity, number> = { common: 48, uncommon: 26, rare: 15, epic: 8, legendary: 2.6, ascendant: 0.4 };
export function rollRarity(roll: number, luck = 1): MulliganRarity {
  // luck (>1) skews toward higher tiers by de-weighting common.
  const weights = MULLIGAN_RARITY_ORDER.map((r, i) => RARITY_DROP_WEIGHT[r] * Math.pow(luck, i));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = Math.max(0, Math.min(0.999999, roll)) * total;
  for (let i = 0; i < weights.length; i++) { acc -= weights[i]; if (acc < 0) return MULLIGAN_RARITY_ORDER[i]; }
  return 'common';
}

/** Build a slot from a modifier id at a rarity (level 1) — dev tooling / equip pipeline. */
export function makeSlot(id: string, rarity: MulliganRarity, level = 1): MulliganSlot | null {
  if (!mulliganRegistry.has(id)) return null;
  return { id, rarity, level: Math.max(1, Math.min(levelCap(rarity), Math.floor(level))) };
}
/** Deterministic organism/animation seeds from the SLOT COMPOSITION (kind + each id:rarity), so a
 *  given triple always grows the same organism — "mixing produces a different organism than stacking"
 *  falls out for free — while the seeds still persist (a future reroll can override them). FNV-1a. */
export function seedFor(kind: string, slots: (MulliganSlot | null)[]): { visualSeed: number; animSeed: number } {
  let h = 2166136261;
  const mix = (s: string): void => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } };
  mix(kind);
  for (const s of slots) mix(s ? `${s.id}:${s.rarity}` : '_');
  const visualSeed = h >>> 0;
  h ^= 0x9e3779b9; h = Math.imul(h, 2654435761);
  return { visualSeed, animSeed: h >>> 0 };
}

/** Assemble a full Mulligan from three ids at one rarity/level (tests + dev tools). Seeds derive
 *  from the composition so equal triples reproduce (deterministic). */
export function assembleMulligan(ids: [string, string, string], rarity: MulliganRarity = 'common', level = 1, kind = 'needle'): MulliganState {
  const slots = ids.map((id) => makeSlot(id, rarity, level));
  return { slots, ...seedFor(kind, slots) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily Run assignment (docs/MULLIGANS.md §daily) — the day's towers arrive with
// PRE-ASSEMBLED organisms drawn ONLY from the player's own discovered modifiers
// (the dex, at each modifier's discovered rarity, level 1). A dex too thin to fill
// three slots tops up from the loaner TUTORIAL trio — so a graft-less account still
// meets the system on the daily, fully active, at the gentlest tuning. Seeded by the
// day, so a rerun of the same daily fields identical organisms worldwide per-account.
// ─────────────────────────────────────────────────────────────────────────────

/** The loaner trio a thin dex borrows on dailies — three authored commons (the tutorial). */
export const TUTORIAL_MULLIGAN_IDS: [string, string, string] = ['bone_spike', 'rapid_synapse', 'sensory_cilia'];

export interface DailyMulliganAssignment {
  byKind: Partial<Record<string, MulliganState>>;
  tutorial: boolean; // true when loaner modifiers (an empty dex) are in play
}

export function dailyMulliganAssignment(
  seed: number,
  kinds: readonly string[],
  dex: Record<string, MulliganRarity>,
): DailyMulliganAssignment {
  const owned = Object.keys(dex).filter((id) => mulliganRegistry.has(id));
  const tutorial = owned.length === 0;
  // The draw pool: discovered modifiers at their dex rarity, padded with the tutorial trio
  // (at common) when the dex can't fill three slots by itself. Pieces are EXCLUSIVE
  // (§exclusivity), so a tower never wears the same piece twice; across towers the day
  // deals from the pool without replacement while it lasts (a 3×towers dex fills every
  // tower uniquely), then reshuffles — thin accounts still field full organisms.
  const pool: { id: string; rarity: MulliganRarity }[] = owned.map((id) => ({ id, rarity: dex[id] }));
  if (pool.length < MULLIGAN_SLOTS) for (const id of TUTORIAL_MULLIGAN_IDS) pool.push({ id, rarity: 'common' });
  // A tiny deterministic PRNG over the daily seed — independent of the sim's rng streams.
  let h = (seed ^ 0x6d756c67) >>> 0; // 'mulg'
  const next = (): number => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 0x1_0000_0000;
  };
  let deck: { id: string; rarity: MulliganRarity }[] = [];
  const draw = (exclude: Set<string>): { id: string; rarity: MulliganRarity } => {
    // Deal from the shuffled deck, skipping ids this tower already wears; reshuffle when dry.
    for (let guard = 0; guard < 2; guard++) {
      const i = deck.findIndex((p) => !exclude.has(p.id));
      if (i >= 0) return deck.splice(i, 1)[0];
      deck = pool.slice();
      for (let j = deck.length - 1; j > 0; j--) { const k = Math.floor(next() * (j + 1)); [deck[j], deck[k]] = [deck[k], deck[j]]; }
    }
    return deck.splice(0, 1)[0] ?? pool[0]; // pool < 3 distinct ids — tolerate the repeat
  };
  const byKind: Partial<Record<string, MulliganState>> = {};
  for (const kind of kinds) {
    const slots: (MulliganSlot | null)[] = [];
    const worn = new Set<string>();
    for (let i = 0; i < MULLIGAN_SLOTS; i++) {
      const pick = draw(worn);
      worn.add(pick.id);
      slots.push(makeSlot(pick.id, pick.rarity, 1));
    }
    byKind[kind] = { slots, ...seedFor(kind, slots) };
  }
  return { byKind, tutorial };
}
