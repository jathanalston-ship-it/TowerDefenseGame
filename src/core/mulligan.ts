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

export const MULLIGAN_RARITY: Record<MulliganRarity, MulliganRarityTier> = {
  common: { tier: 0, label: 'Common', color: '#9fb0c3', statMult: 1.0, powerMult: 1.0, visualIntensity: 0.6, animComplexity: 1, levelCap: 5 },
  uncommon: { tier: 1, label: 'Uncommon', color: '#5fd38a', statMult: 1.35, powerMult: 1.4, visualIntensity: 0.78, animComplexity: 2, levelCap: 8 },
  rare: { tier: 2, label: 'Rare', color: '#5aa9ff', statMult: 1.75, powerMult: 1.9, visualIntensity: 0.95, animComplexity: 2, levelCap: 11 },
  epic: { tier: 3, label: 'Epic', color: '#c07bff', statMult: 2.25, powerMult: 2.6, visualIntensity: 1.12, animComplexity: 3, levelCap: 14 },
  legendary: { tier: 4, label: 'Legendary', color: '#ffb347', statMult: 2.9, powerMult: 3.6, visualIntensity: 1.3, animComplexity: 3, levelCap: 17 },
  ascendant: { tier: 5, label: 'Ascendant', color: '#ff5db1', statMult: 3.7, powerMult: 5.0, visualIntensity: 1.5, animComplexity: 4, levelCap: 20 },
};

/** Absolute upgrade ceiling (rarity caps sit at or below this) — kept generous for future Ascension. */
export const MULLIGAN_MAX_LEVEL = 20;
export const MULLIGAN_SLOTS = 3;

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
  { id: 'bone_spike', name: 'Bone Spike', category: 'offensive', baseRarity: 'common', stats: { damageMult: 1.08, projectileMutators: ['pierce1'] }, influence: { pierce: 1, damage: 0.4 }, powerWeight: 0.05, desc: 'Grows a bone lance — shots pierce one extra host.', flavor: 'A blade of ossified hunger, sharpened by every kill it remembers.' },
  { id: 'acid_gland', name: 'Acid Gland', category: 'offensive', baseRarity: 'uncommon', stats: { damageMult: 1.06, splashMult: 1.06 }, influence: { poison: 1, debuff: 0.5 }, powerWeight: 0.055, desc: 'A blister of caustic bile — corrodes what it touches.', flavor: 'It weeps constantly. The tower has learned not to mind.' },
  { id: 'rapid_synapse', name: 'Rapid Synapse', category: 'offensive', baseRarity: 'common', stats: { fireRateMult: 1.1 }, influence: { attackSpeed: 1 }, powerWeight: 0.05, desc: 'A twitching nerve cluster — the tower fires faster.', flavor: 'It fires before the thought finishes forming.' },
  { id: 'rupture_node', name: 'Rupture Node', category: 'offensive', baseRarity: 'rare', stats: { splashMult: 1.18, damageMult: 1.05 }, influence: { splash: 1, damage: 0.3 }, powerWeight: 0.07, desc: 'A swollen gland that detonates on impact — wider blasts.', flavor: 'Pressure with nowhere to go, gifted a direction.' },
  { id: 'venom_barb', name: 'Venom Barb', category: 'offensive', baseRarity: 'uncommon', stats: { damageMult: 1.07, projectileMutators: ['pierce1'] }, influence: { poison: 0.7, pierce: 0.6 }, powerWeight: 0.058, desc: 'Envenomed lances that pierce and poison.', flavor: 'The barb is the mercy. The venom is the point.' },
  { id: 'crystalline_core', name: 'Crystalline Core', category: 'offensive', baseRarity: 'epic', stats: { damageMult: 1.15 }, influence: { crit: 1, damage: 0.5 }, powerWeight: 0.085, desc: 'A faceted growth that focuses lethal critical strikes.', flavor: 'Light enters. Only violence leaves.' },
  { id: 'overload_ganglion', name: 'Overload Ganglion', category: 'offensive', baseRarity: 'rare', stats: { fireRateMult: 1.12, damageMult: 1.05 }, influence: { attackSpeed: 0.8, damage: 0.5 }, powerWeight: 0.072, desc: 'An overclocked nerve knot — faster, harder fire.', flavor: 'It runs hot enough to cook. It does not stop.' },
  { id: 'siege_carapace', name: 'Siege Carapace', category: 'offensive', baseRarity: 'epic', stats: { damageMult: 1.2 }, influence: { damage: 1 }, powerWeight: 0.09, desc: 'A heavy offensive shell — pure, brutal damage.', flavor: 'Built for one verb, conjugated forever.' },
  { id: 'shatter_lance', name: 'Shatter Lance', category: 'offensive', baseRarity: 'legendary', stats: { damageMult: 1.18, projectileMutators: ['pierce2'] }, influence: { pierce: 1, crit: 0.6, damage: 0.6 }, powerWeight: 0.12, desc: 'A crystalline lance that punches through two hosts and crits.', flavor: 'A line drawn through a crowd, in their own language.' },
  { id: 'apex_gland', name: 'Apex Predator Gland', category: 'offensive', baseRarity: 'ascendant', stats: { damageMult: 1.25, fireRateMult: 1.08 }, influence: { damage: 1, crit: 0.5, attackSpeed: 0.4 }, powerWeight: 0.16, desc: 'The pinnacle offensive organ — damage, crit, and cadence.', flavor: 'Everything it was grafted onto is now a delivery mechanism.' },
];

const UTILITY: MulliganModifier[] = [
  { id: 'sensory_cilia', name: 'Sensory Cilia', category: 'utility', baseRarity: 'common', stats: { rangeMult: 1.1 }, influence: { support: 0.5, slow: 0.2 }, powerWeight: 0.045, desc: 'Fine sensory hairs — the tower reaches farther.', flavor: 'It feels the wave coming three heartbeats early.' },
  { id: 'sticky_membrane', name: 'Sticky Membrane', category: 'utility', baseRarity: 'uncommon', stats: { rangeMult: 1.05, splashMult: 1.06 }, influence: { slow: 1 }, powerWeight: 0.05, desc: 'A tacky secretion that clings and slows.', flavor: 'Nothing leaves in a hurry. Nothing leaves at all.' },
  { id: 'symbiotic_pod', name: 'Symbiotic Pod', category: 'utility', baseRarity: 'rare', stats: { fireRateMult: 1.06, rangeMult: 1.06 }, influence: { support: 1 }, powerWeight: 0.065, desc: 'A budding pod that shares its strength with the host.', flavor: 'Two organisms, one appetite.' },
  { id: 'disruptor_sac', name: 'Disruptor Sac', category: 'utility', baseRarity: 'uncommon', stats: { damageMult: 1.05, rangeMult: 1.04 }, influence: { debuff: 1 }, powerWeight: 0.052, desc: 'A pulsing sac that fouls enemy defenses.', flavor: 'It hums on a frequency armor cannot ignore.' },
  { id: 'frost_vesicle', name: 'Frost Vesicle', category: 'utility', baseRarity: 'rare', stats: { splashMult: 1.12 }, influence: { slow: 0.8, splash: 0.5 }, powerWeight: 0.066, desc: 'A supercooled bladder — chilling area bursts.', flavor: 'The cold is patient. The cold always wins.' },
  { id: 'hunter_ocelli', name: 'Hunter Ocelli', category: 'utility', baseRarity: 'rare', stats: { rangeMult: 1.14, damageMult: 1.05 }, influence: { crit: 0.5, support: 0.3 }, powerWeight: 0.068, desc: 'A ring of hunting eyes — long reach and keen strikes.', flavor: 'It has already chosen where you will fall.' },
  { id: 'web_filament', name: 'Web Filament', category: 'utility', baseRarity: 'epic', stats: { fireRateMult: 1.1, rangeMult: 1.06 }, influence: { slow: 0.7, attackSpeed: 0.6 }, powerWeight: 0.085, desc: 'Living threads that snare and quicken.', flavor: 'The loom never stops. You are already in the pattern.' },
  { id: 'resonance_antenna', name: 'Resonance Antenna', category: 'utility', baseRarity: 'epic', stats: { rangeMult: 1.15, fireRateMult: 1.06 }, influence: { support: 1, slow: 0.3 }, powerWeight: 0.088, desc: 'A tuned organ that amplifies the whole tower.', flavor: 'It broadcasts a single note the battlefield obeys.' },
  { id: 'warp_anchor', name: 'Warp Anchor', category: 'utility', baseRarity: 'legendary', stats: { rangeMult: 1.12, splashMult: 1.1 }, influence: { slow: 1, debuff: 0.7 }, powerWeight: 0.115, desc: 'A gravity organ that drags and disrupts a wide field.', flavor: 'Distance is a suggestion it declines to honor.' },
  { id: 'oracle_nexus', name: 'Oracle Nexus', category: 'utility', baseRarity: 'ascendant', stats: { rangeMult: 1.18, fireRateMult: 1.08, splashMult: 1.08 }, influence: { support: 1, slow: 0.5, debuff: 0.5 }, powerWeight: 0.155, desc: 'The apex utility organ — reach, cadence, control.', flavor: 'It does not predict the wave. It authors it.' },
];

const BIOLOGICAL: MulliganModifier[] = [
  { id: 'green_vein', name: 'Green Vein', category: 'biological', baseRarity: 'common', stats: { damageMult: 1.06 }, influence: { poison: 1 }, powerWeight: 0.048, desc: 'Toxin-swollen veins that seep into every wound.', flavor: 'The green is not decoration. It is intent.' },
  { id: 'vascular_tissue', name: 'Vascular Tissue', category: 'biological', baseRarity: 'common', stats: { fireRateMult: 1.05, rangeMult: 1.04 }, influence: { healing: 1 }, powerWeight: 0.046, desc: 'Living vascular growth that sustains the graft.', flavor: 'It feeds the organism the organism feeds.' },
  { id: 'parasite_sac', name: 'Parasite Sac', category: 'biological', baseRarity: 'uncommon', stats: { damageMult: 1.05, splashMult: 1.06 }, influence: { debuff: 0.8, poison: 0.4 }, powerWeight: 0.052, desc: 'A brood sac that seeds weakening parasites.', flavor: 'Every host is a nursery it has not opened yet.' },
  { id: 'spore_bladder', name: 'Spore Bladder', category: 'biological', baseRarity: 'uncommon', stats: { splashMult: 1.14 }, influence: { poison: 0.8, splash: 0.6 }, powerWeight: 0.056, desc: 'A bladder that bursts into a toxic spore cloud.', flavor: 'Breathe in. That was the mistake.' },
  { id: 'regenerative_node', name: 'Regenerative Node', category: 'biological', baseRarity: 'rare', stats: { fireRateMult: 1.06, rangeMult: 1.05 }, influence: { healing: 1, support: 0.4 }, powerWeight: 0.064, desc: 'A knot of self-repairing tissue that steadies the host.', flavor: 'Cut it and it thanks you for the surface area.' },
  { id: 'toxin_reservoir', name: 'Toxin Reservoir', category: 'biological', baseRarity: 'rare', stats: { damageMult: 1.1 }, influence: { poison: 1, debuff: 0.4 }, powerWeight: 0.07, desc: 'A deep well of venom — potent, lingering poison.', flavor: 'It has never run dry. It has never tried.' },
  { id: 'symbiont_cluster', name: 'Symbiont Cluster', category: 'biological', baseRarity: 'epic', stats: { rangeMult: 1.1, fireRateMult: 1.06 }, influence: { support: 0.8, healing: 0.8 }, powerWeight: 0.084, desc: 'A colony of helper organisms bound to the host.', flavor: 'A parliament of small hungers, voting to help.' },
  { id: 'necrotic_bloom', name: 'Necrotic Bloom', category: 'biological', baseRarity: 'epic', stats: { damageMult: 1.12, splashMult: 1.08 }, influence: { poison: 1, debuff: 0.7 }, powerWeight: 0.088, desc: 'A blossom of rot that spreads decay outward.', flavor: 'It flowers only in the presence of an ending.' },
  { id: 'living_hive', name: 'Living Hive', category: 'biological', baseRarity: 'legendary', stats: { splashMult: 1.16, damageMult: 1.06 }, influence: { poison: 0.8, splash: 0.7, support: 0.6 }, powerWeight: 0.118, desc: 'A self-sustaining hive that swarms the wave.', flavor: 'Not a tower with an organism. An organism with a tower.' },
  { id: 'genesis_organ', name: 'Genesis Organ', category: 'biological', baseRarity: 'ascendant', stats: { damageMult: 1.14, fireRateMult: 1.08, splashMult: 1.08 }, influence: { poison: 0.8, healing: 0.8, support: 0.6, debuff: 0.5 }, powerWeight: 0.155, desc: 'The apex biological organ — a whole ecology in one graft.', flavor: 'It remembers being the first cell. It intends to be the last.' },
];

mulliganRegistry.registerAll([...OFFENSIVE, ...UTILITY, ...BIOLOGICAL]);

/** All modifiers of a category (UI grouping / collections). */
export function modifiersByCategory(cat: MulliganModifier['category']): MulliganModifier[] {
  return mulliganRegistry.all().filter((m) => m.category === cat);
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
}

export function emptyMulligan(): MulliganState {
  return { slots: [null, null, null], visualSeed: 0, animSeed: 0 };
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
}

export function identityMulligan(): ResolvedMulligan {
  return { active: false, damageMult: 1, fireRateMult: 1, rangeMult: 1, splashMult: 1, extraProjectiles: 0, projectileMutators: [], profile: zeroProfile(), power: 1 };
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

export function resolveMulligan(state: MulliganState | undefined | null): ResolvedMulligan {
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
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Power — a dedicated, separately-displayed contribution (docs/POWER-SCORE §mulligans).
// It rides its own PowerParts bucket; a heuristic (like equipment rarity / branch tiers),
// NOT a FIELD_WEIGHT field, so it never touches power coverage. 1 when inactive.
// ─────────────────────────────────────────────────────────────────────────────
export function mulliganPower(state: MulliganState | undefined | null): number {
  return resolveMulligan(state).power;
}
/** Roster Power across all towers' Mulligans (each ≥ 1) — the account-level bucket. */
export function accountMulliganPower(states: Iterable<MulliganState | undefined>): number {
  let mult = 1;
  for (const s of states) mult *= mulliganPower(s);
  return mult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Upgrade economy — Gene Overflow currency. Level up within the rarity cap; ASCEND to
// bump rarity a tier (Ascension-ready). Costs rise with level + rarity.
// ─────────────────────────────────────────────────────────────────────────────
export function levelCap(rarity: MulliganRarity): number {
  return Math.min(MULLIGAN_MAX_LEVEL, MULLIGAN_RARITY[rarity].levelCap);
}
export function isMaxLevel(slot: MulliganSlot): boolean {
  return slot.level >= levelCap(slot.rarity);
}
/** Gene Overflow cost to go level → level+1 at this rarity (rounded, monotonic). */
export function upgradeCost(rarity: MulliganRarity, level: number): number {
  const r = MULLIGAN_RARITY[rarity];
  return Math.round(20 * (r.tier + 1) * Math.pow(1.35, Math.max(0, level - 1)));
}
/** Gene Overflow cost to ascend a maxed slot to the next rarity (null if already Ascendant). */
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
  // (at common) when the dex can't fill three slots by itself. Stacking is legal (the design
  // explicitly supports Rapid Synapse ×3), so draws are with replacement.
  const pool: { id: string; rarity: MulliganRarity }[] = owned.map((id) => ({ id, rarity: dex[id] }));
  if (pool.length < MULLIGAN_SLOTS) for (const id of TUTORIAL_MULLIGAN_IDS) pool.push({ id, rarity: 'common' });
  // A tiny deterministic PRNG over the daily seed — independent of the sim's rng streams.
  let h = (seed ^ 0x6d756c67) >>> 0; // 'mulg'
  const next = (): number => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 0x1_0000_0000;
  };
  const byKind: Partial<Record<string, MulliganState>> = {};
  for (const kind of kinds) {
    const slots: (MulliganSlot | null)[] = [];
    for (let i = 0; i < MULLIGAN_SLOTS; i++) {
      const pick = pool[Math.floor(next() * pool.length)];
      slots.push(makeSlot(pick.id, pick.rarity, 1));
    }
    byKind[kind] = { slots, ...seedFor(kind, slots) };
  }
  return { byKind, tutorial };
}
