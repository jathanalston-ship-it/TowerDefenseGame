// ADAPTATION — the Antigen specialization layer (docs/ADAPTATION.md). Mastery is EXPERIENCE;
// Adaptation is SPECIALIZATION: Antigen Points (earned from mastery Ranks, campaign depth,
// legendary containers and achievement bands — every source slow or capped, never infinitely
// farmable) are spent into a PER-TOWER tree of four branches × ten tiers. Fork tiers are
// mutually exclusive picks that carve different tower identities; keystone tiers change the
// tower's visual stage on the battlefield. Deep tiers gate on campaign stages — a late-game
// system by construction.
//
// Effects reuse the per-kind kit channel the sim already folds (meta.towerProgress →
// TowerProgress: damage/rate/range/splash/infection mults, projectile mutators, extra
// projectiles) — no new sim branches, and a unit with nothing chosen contributes NOTHING
// (the golden run is untouched). Trees are GENERATED from per-tower theme data + authored
// keystones: a future tower ships its trees by adding ONE theme row (docs §authoring) —
// zero additional programming. Heroes keep the shared three-branch tree (their per-hero
// trees are a later content pass; the shapes coexist).
//
// Pure data + pure helpers (no Game/DOM/save imports).

import { masteryRank } from './mastery';
import { TOWER_DEFS, TOWER_ORDER } from './config';
import type { TowerKind } from './types';

// ── Branches ─────────────────────────────────────────────────────────────────

/** Tower branches (the specialization axes) + the legacy shared branches heroes still use. */
export type AdaptBranch = 'predation' | 'mutation' | 'overclock' | 'symbiosis' | 'virulence' | 'resilience' | 'contagion';

export const TOWER_ADAPT_BRANCHES: AdaptBranch[] = ['predation', 'mutation', 'overclock', 'symbiosis'];
export const HERO_ADAPT_BRANCHES: AdaptBranch[] = ['virulence', 'resilience', 'contagion'];
/** @deprecated legacy alias (pre-per-tower trees) — heroes' shared shape. */
export const ADAPT_BRANCHES = HERO_ADAPT_BRANCHES;

export const ADAPT_BRANCH_META: Record<AdaptBranch, { name: string; blurb: string; color: string; icon: string }> = {
  predation: { name: 'Predation', blurb: 'Raw lethality — the strain hits harder and deeper.', color: 'var(--r-rare)', icon: '⌖' },
  mutation: { name: 'Mutation', blurb: 'Behavioral rewrites — projectiles pierce, split, and spread.', color: 'var(--viral)', icon: '◈' },
  overclock: { name: 'Overclock', blurb: 'Metabolic speed — cadence and reach overdriven.', color: 'var(--caustic)', icon: '↯' },
  symbiosis: { name: 'Symbiosis', blurb: 'The colony organism — splash, infection, and shared strength.', color: 'var(--r-epic)', icon: '❉' },
  virulence: { name: 'Virulence', blurb: 'Offense — hit harder, faster, deeper.', color: 'var(--r-rare)', icon: '⌖' },
  resilience: { name: 'Resilience', blurb: 'Survival + anti-boss — reach, pierce, staying power.', color: 'var(--r-epic)', icon: '⛨' },
  contagion: { name: 'Contagion', blurb: 'Spread + economy + synergy — the plague compounds.', color: 'var(--caustic)', icon: '❉' },
};

// ── Nodes ────────────────────────────────────────────────────────────────────

/** One adaptation node. Tiers within a branch unlock in order; FORK tiers offer exclusive
 *  siblings (picking one locks the other); deep tiers carry campaign gates and visual stages.
 *  Effect fields mirror the tower run-kit / hero mods; ABSENT fields are identity. */
export interface AdaptNode {
  id: string;
  subject: 'tower' | 'hero';
  kind?: TowerKind; // per-tower trees (absent ⇒ shared — the hero tree + legacy tower nodes)
  branch: AdaptBranch;
  tier: number; // 1-based; tier N needs a pick at tier N-1 in the same branch
  name: string;
  desc: string;
  exclusiveWith?: string[]; // fork siblings — choosing this permanently locks those (until respec)
  campaignStage?: number; // locked until the account clears this stage (late-game pacing)
  visualTier?: number; // keystones raise the tower's battlefield visual stage (1..3)
  // ── Tower kit deltas ──
  damageMult?: number;
  fireRateMult?: number;
  rangeMult?: number;
  splashMult?: number;
  infectionSpreadMult?: number;
  projectileMutator?: string;
  extraProjectiles?: number;
  // ── Hero mods deltas ──
  heroDamageMult?: number;
  heroCooldownMult?: number;
}

/** Aggregated adaptation effect (what the meta fold applies). Neutral = identity. */
export interface AdaptEffect {
  damageMult: number;
  fireRateMult: number;
  rangeMult: number;
  splashMult: number;
  infectionSpreadMult: number;
  projectileMutators: string[];
  extraProjectiles: number;
  heroDamageMult: number;
  heroCooldownMult: number;
}

export function neutralAdaptEffect(): AdaptEffect {
  return { damageMult: 1, fireRateMult: 1, rangeMult: 1, splashMult: 1, infectionSpreadMult: 1, projectileMutators: [], extraProjectiles: 0, heroDamageMult: 1, heroCooldownMult: 1 };
}

// ── Campaign gating (late-game pacing) + visual stages ──────────────────────

/** Deep tiers gate on campaign stages: adaptation depth cannot be rushed by farming alone. */
export const ADAPT_STAGE_GATES: { tier: number; stage: number }[] = [
  { tier: 4, stage: 15 },
  { tier: 7, stage: 30 },
  { tier: 10, stage: 50 },
];
export function adaptStageGate(tier: number): number {
  let gate = 0;
  for (const g of ADAPT_STAGE_GATES) if (tier >= g.tier) gate = g.stage;
  return gate;
}

// ── Per-tower tree GENERATION (a future tower = one THEME row) ───────────────

/** What each branch does for a given tower — the per-tower identity data. `step` is the
 *  per-rung magnitude of the branch's primary field; keystones override at tiers 4/7/10. */
interface BranchTheme {
  field: 'damageMult' | 'fireRateMult' | 'rangeMult' | 'splashMult' | 'infectionSpreadMult';
  step: number; // rung multiplier − 1 (e.g. 0.04 ⇒ ×1.04 per rung)
  rungName: string; // flavor stem for generated rungs
  fork4: [Partial<AdaptNode> & { name: string; desc: string }, Partial<AdaptNode> & { name: string; desc: string }];
  fork7: [Partial<AdaptNode> & { name: string; desc: string }, Partial<AdaptNode> & { name: string; desc: string }];
  capstone: Partial<AdaptNode> & { name: string; desc: string };
}

const dmgFork = (a: number, b: number): BranchTheme['fork4'] => [
  { name: 'Apex Toxin', desc: `+${Math.round(a * 100)}% damage — pure lethality.`, damageMult: 1 + a },
  { name: 'Bladed Volley', desc: 'One additional projectile per shot.', extraProjectiles: 1, damageMult: 1 + b },
];

/** The theme table — one row per tower kind IS the tower's whole adaptation identity. */
const TOWER_THEMES: Record<TowerKind, Record<'predation' | 'mutation' | 'overclock' | 'symbiosis', BranchTheme>> = {
  needle: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Venom Gland', fork4: dmgFork(0.12, 0.02), fork7: [{ name: 'Impaling Needles', desc: 'Shots pierce two extra hosts.', projectileMutator: 'pierce2', damageMult: 1.04 }, { name: 'Saturation Fire', desc: 'Two additional projectiles.', extraProjectiles: 2 }], capstone: { name: 'Apex Predator', desc: 'The strain becomes death: +25% damage, pierce three.', damageMult: 1.25, projectileMutator: 'pierce3' } },
    mutation: { field: 'rangeMult', step: 0.02, rungName: 'Sensory Cilia', fork4: [{ name: 'Boring Proboscis', desc: 'Shots pierce one extra host.', projectileMutator: 'pierce1', damageMult: 1.02 }, { name: 'Long-Stem Spines', desc: '+10% range.', rangeMult: 1.1 }], fork7: [{ name: 'Hypersensitive Web', desc: '+14% range and +6% damage.', rangeMult: 1.14, damageMult: 1.06 }, { name: 'Splintering Tips', desc: 'One extra projectile; +4% damage.', extraProjectiles: 1, damageMult: 1.04 }], capstone: { name: 'Panopticon Bloom', desc: '+20% range; shots pierce two.', rangeMult: 1.2, projectileMutator: 'pierce2' } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Twitch Fiber', fork4: [{ name: 'Frenzied Metabolism', desc: '+12% fire rate.', fireRateMult: 1.12 }, { name: 'Measured Bursts', desc: '+6% fire rate, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Overdriven Ganglia', desc: '+15% fire rate.', fireRateMult: 1.15 }, { name: 'Twin Reflex', desc: 'One extra projectile.', extraProjectiles: 1 }], capstone: { name: 'Metabolic Storm', desc: '+20% fire rate, +10% damage.', fireRateMult: 1.2, damageMult: 1.1 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Colony Strand', fork4: [{ name: 'Communal Venom', desc: '+8% damage.', damageMult: 1.08 }, { name: 'Spore-Laced Tips', desc: '+12% splash radius.', splashMult: 1.12 }], fork7: [{ name: 'Hive Resonance', desc: '+10% damage, +6% fire rate.', damageMult: 1.1, fireRateMult: 1.06 }, { name: 'Seeding Barbs', desc: '+15% infection spread.', infectionSpreadMult: 1.15 }], capstone: { name: 'Symbiotic Apex', desc: '+15% damage, +10% splash.', damageMult: 1.15, splashMult: 1.1 } },
  },
  mortar: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Densified Shell', fork4: dmgFork(0.12, 0.02), fork7: [{ name: 'Bunker Cracker', desc: '+16% damage.', damageMult: 1.16 }, { name: 'Cluster Payload', desc: 'One extra shell.', extraProjectiles: 1 }], capstone: { name: 'Ossuary Maker', desc: '+25% damage, +12% splash.', damageMult: 1.25, splashMult: 1.12 } },
    mutation: { field: 'splashMult', step: 0.035, rungName: 'Burst Chamber', fork4: [{ name: 'Wide Craters', desc: '+14% splash radius.', splashMult: 1.14 }, { name: 'Focused Impact', desc: '+10% damage.', damageMult: 1.1 }], fork7: [{ name: 'Shattering Burst', desc: '+16% splash, +4% damage.', splashMult: 1.16, damageMult: 1.04 }, { name: 'Twin Barrage', desc: 'One extra shell; −4% splash.', extraProjectiles: 1, splashMult: 0.96 }], capstone: { name: 'Extinction Radius', desc: '+25% splash radius, +10% damage.', splashMult: 1.25, damageMult: 1.1 } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Recoil Sinew', fork4: [{ name: 'Rapid Reload', desc: '+12% fire rate.', fireRateMult: 1.12 }, { name: 'Long Lob', desc: '+10% range.', rangeMult: 1.1 }], fork7: [{ name: 'Hydraulic Slam', desc: '+15% fire rate.', fireRateMult: 1.15 }, { name: 'Orbital Arc', desc: '+14% range, +4% damage.', rangeMult: 1.14, damageMult: 1.04 }], capstone: { name: 'Ceaseless Bombardment', desc: '+20% fire rate, +8% range.', fireRateMult: 1.2, rangeMult: 1.08 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Shared Recoil', fork4: [{ name: 'Concussive Sympathy', desc: '+8% damage.', damageMult: 1.08 }, { name: 'Fragment Cloud', desc: '+12% splash.', splashMult: 1.12 }], fork7: [{ name: 'Seismic Chorus', desc: '+10% damage, +8% splash.', damageMult: 1.1, splashMult: 1.08 }, { name: 'Suppressing Field', desc: '+12% range.', rangeMult: 1.12 }], capstone: { name: 'Warcry of the Colony', desc: '+15% damage, +15% splash.', damageMult: 1.15, splashMult: 1.15 } },
  },
  reactor: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Caustic Bloom', fork4: dmgFork(0.12, 0.02), fork7: [{ name: 'Meltdown Doctrine', desc: '+16% damage.', damageMult: 1.16 }, { name: 'Twin Emitters', desc: 'One extra bolt.', extraProjectiles: 1 }], capstone: { name: 'Critical Mass', desc: '+25% damage, +10% fire rate.', damageMult: 1.25, fireRateMult: 1.1 } },
    mutation: { field: 'rangeMult', step: 0.02, rungName: 'Field Coil', fork4: [{ name: 'Extended Field', desc: '+12% range.', rangeMult: 1.12 }, { name: 'Dense Plasma', desc: '+10% damage.', damageMult: 1.1 }], fork7: [{ name: 'Arc Lattice', desc: 'Bolts pierce one extra host.', projectileMutator: 'pierce1', damageMult: 1.04 }, { name: 'Far Cascade', desc: '+14% range.', rangeMult: 1.14 }], capstone: { name: 'Fission Halo', desc: '+16% range; bolts pierce two.', rangeMult: 1.16, projectileMutator: 'pierce2' } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Surge Node', fork4: [{ name: 'Overcharge Cycle', desc: '+12% fire rate.', fireRateMult: 1.12 }, { name: 'Stable Output', desc: '+6% rate, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Redline Core', desc: '+15% fire rate.', fireRateMult: 1.15 }, { name: 'Capacitor Bank', desc: '+10% damage, +6% rate.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Perpetual Reaction', desc: '+20% fire rate, +10% damage.', fireRateMult: 1.2, damageMult: 1.1 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Power Graft', fork4: [{ name: 'Shared Current', desc: '+8% damage.', damageMult: 1.08 }, { name: 'Radiant Leak', desc: '+12% splash.', splashMult: 1.12 }], fork7: [{ name: 'Grid Harmony', desc: '+10% damage, +6% fire rate.', damageMult: 1.1, fireRateMult: 1.06 }, { name: 'Ion Fog', desc: '+12% splash, +6% range.', splashMult: 1.12, rangeMult: 1.06 }], capstone: { name: 'Reactor Communion', desc: '+15% damage, +12% splash.', damageMult: 1.15, splashMult: 1.12 } },
  },
  parasite: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Feeding Barb', fork4: dmgFork(0.12, 0.02), fork7: [{ name: 'Marrow Drinker', desc: '+16% damage.', damageMult: 1.16 }, { name: 'Paired Larvae', desc: 'One extra dart.', extraProjectiles: 1 }], capstone: { name: 'Host Breaker', desc: '+25% damage, +15% infection spread.', damageMult: 1.25, infectionSpreadMult: 1.15 } },
    mutation: { field: 'infectionSpreadMult', step: 0.04, rungName: 'Spore Sac', fork4: [{ name: 'Virulent Bloom', desc: '+18% infection spread.', infectionSpreadMult: 1.18 }, { name: 'Deep Roots', desc: '+10% damage.', damageMult: 1.1 }], fork7: [{ name: 'Pandemic Vector', desc: '+22% infection spread.', infectionSpreadMult: 1.22 }, { name: 'Burrowing Darts', desc: 'Darts pierce one extra host.', projectileMutator: 'pierce1', damageMult: 1.04 }], capstone: { name: 'Patient Zero', desc: '+30% infection spread, +10% damage.', infectionSpreadMult: 1.3, damageMult: 1.1 } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Spasm Muscle', fork4: [{ name: 'Rapid Gestation', desc: '+12% fire rate.', fireRateMult: 1.12 }, { name: 'Long Tendrils', desc: '+10% range.', rangeMult: 1.1 }], fork7: [{ name: 'Swarm Pulse', desc: '+15% fire rate.', fireRateMult: 1.15 }, { name: 'Reaching Hyphae', desc: '+12% range, +6% spread.', rangeMult: 1.12, infectionSpreadMult: 1.06 }], capstone: { name: 'Endless Brood', desc: '+20% fire rate, +12% infection spread.', fireRateMult: 1.2, infectionSpreadMult: 1.12 } },
    symbiosis: { field: 'infectionSpreadMult', step: 0.03, rungName: 'Mycelial Thread', fork4: [{ name: 'Carrier Strain', desc: '+12% infection spread.', infectionSpreadMult: 1.12 }, { name: 'Nutrient Web', desc: '+8% damage.', damageMult: 1.08 }], fork7: [{ name: 'Colony Bloom', desc: '+14% spread, +6% damage.', infectionSpreadMult: 1.14, damageMult: 1.06 }, { name: 'Choking Cloud', desc: '+12% splash.', splashMult: 1.12 }], capstone: { name: 'One Great Organism', desc: '+20% infection spread, +10% damage.', infectionSpreadMult: 1.2, damageMult: 1.1 } },
  },
  obelisk: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Neural Spike', fork4: dmgFork(0.12, 0.02), fork7: [{ name: 'Synaptic Overload', desc: '+16% damage.', damageMult: 1.16 }, { name: 'Split Signal', desc: 'One extra pulse.', extraProjectiles: 1 }], capstone: { name: 'Mind Render', desc: '+25% damage, +10% range.', damageMult: 1.25, rangeMult: 1.1 } },
    mutation: { field: 'rangeMult', step: 0.025, rungName: 'Field Antenna', fork4: [{ name: 'Broadcast Lattice', desc: '+12% range.', rangeMult: 1.12 }, { name: 'Compression Wave', desc: '+10% damage.', damageMult: 1.1 }], fork7: [{ name: 'Planet Whisper', desc: '+16% range.', rangeMult: 1.16 }, { name: 'Resonant Pierce', desc: 'Pulses pierce one extra host.', projectileMutator: 'pierce1', damageMult: 1.04 }], capstone: { name: 'Total Field', desc: '+20% range, +10% damage.', rangeMult: 1.2, damageMult: 1.1 } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Pulse Gland', fork4: [{ name: 'Staccato Pulse', desc: '+12% fire rate.', fireRateMult: 1.12 }, { name: 'Deep Hum', desc: '+6% rate, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Fever Pitch', desc: '+15% fire rate.', fireRateMult: 1.15 }, { name: 'Standing Wave', desc: '+10% range, +6% rate.', rangeMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Unbroken Signal', desc: '+20% fire rate, +8% range.', fireRateMult: 1.2, rangeMult: 1.08 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Chorus Node', fork4: [{ name: 'Shared Mind', desc: '+8% damage.', damageMult: 1.08 }, { name: 'Wide Murmur', desc: '+10% splash.', splashMult: 1.1 }], fork7: [{ name: 'Choir of One', desc: '+10% damage, +8% range.', damageMult: 1.1, rangeMult: 1.08 }, { name: 'Numbing Field', desc: '+12% splash, +6% range.', splashMult: 1.12, rangeMult: 1.06 }], capstone: { name: 'The Overmind Speaks', desc: '+15% damage, +12% range.', damageMult: 1.15, rangeMult: 1.12 } },
  },
  maw: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Grinding Molar', fork4: dmgFork(0.12, 0.02), fork7: [{ name: 'Marrow Hunger', desc: '+16% damage.', damageMult: 1.16 }, { name: 'Wider Gape', desc: '+12% bite reach.', rangeMult: 1.12 }], capstone: { name: 'Apex Appetite', desc: '+25% damage, +10% bite reach.', damageMult: 1.25, rangeMult: 1.1 } },
    mutation: { field: 'rangeMult', step: 0.02, rungName: 'Jaw Hinge', fork4: [{ name: 'Unhinged Bite', desc: '+12% bite reach.', rangeMult: 1.12 }, { name: 'Dense Enamel', desc: '+10% damage.', damageMult: 1.1 }], fork7: [{ name: 'Distended Gullet', desc: '+14% bite reach.', rangeMult: 1.14 }, { name: 'Serrated Rows', desc: '+10% damage, +4% reach.', damageMult: 1.1, rangeMult: 1.04 }], capstone: { name: 'The Open Grave', desc: '+18% bite reach, +10% damage.', rangeMult: 1.18, damageMult: 1.1 } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Snap Tendon', fork4: [{ name: 'Frenzied Gnash', desc: '+12% bite rate.', fireRateMult: 1.12 }, { name: 'Measured Chew', desc: '+6% rate, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Ceaseless Jaws', desc: '+15% bite rate.', fireRateMult: 1.15 }, { name: 'Heavy Crunch', desc: '+10% damage, +6% rate.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Feeding Frenzy', desc: '+20% bite rate, +10% damage.', fireRateMult: 1.2, damageMult: 1.1 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Carrion Bond', fork4: [{ name: 'Pack Feeder', desc: '+8% damage.', damageMult: 1.08 }, { name: 'Sweeping Bite', desc: '+8% bite reach.', rangeMult: 1.08 }], fork7: [{ name: 'Communal Feast', desc: '+10% damage, +6% rate.', damageMult: 1.1, fireRateMult: 1.06 }, { name: 'Gaping Circle', desc: '+12% bite reach.', rangeMult: 1.12 }], capstone: { name: 'The Colony Feeds', desc: '+15% damage, +10% bite reach.', damageMult: 1.15, rangeMult: 1.1 } },
  },
  chrysalis: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Caustic Resin', fork4: dmgFork(0.12, 0.02), fork7: [{ name: 'Dissolving Casing', desc: '+16% damage.', damageMult: 1.16 }, { name: 'Twin Bolt', desc: 'One extra resin bolt.', extraProjectiles: 1 }], capstone: { name: 'Reliquary of Ruin', desc: '+25% damage, +10% fire rate.', damageMult: 1.25, fireRateMult: 1.1 } },
    mutation: { field: 'rangeMult', step: 0.02, rungName: 'Amber Lens', fork4: [{ name: 'Far Warden', desc: '+12% range.', rangeMult: 1.12 }, { name: 'Heavy Sap', desc: '+10% damage.', damageMult: 1.1 }], fork7: [{ name: 'Piercing Set', desc: 'Bolts pierce one extra host.', projectileMutator: 'pierce1', damageMult: 1.04 }, { name: 'Watchful Gleam', desc: '+14% range.', rangeMult: 1.14 }], capstone: { name: 'The Long Vigil', desc: '+18% range; bolts pierce one.', rangeMult: 1.18, projectileMutator: 'pierce1' } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Sap Valve', fork4: [{ name: 'Quick Set', desc: '+12% cast rate.', fireRateMult: 1.12 }, { name: 'Steady Pour', desc: '+6% rate, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Gushing Ducts', desc: '+15% cast rate.', fireRateMult: 1.15 }, { name: 'Thick Amber', desc: '+10% damage, +6% rate.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Perpetual Pour', desc: '+20% cast rate, +10% damage.', fireRateMult: 1.2, damageMult: 1.1 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Preserving Vein', fork4: [{ name: 'Shared Sap', desc: '+8% damage.', damageMult: 1.08 }, { name: 'Wide Pour', desc: '+10% range.', rangeMult: 1.1 }], fork7: [{ name: 'Communal Set', desc: '+10% damage, +6% rate.', damageMult: 1.1, fireRateMult: 1.06 }, { name: 'Golden Reach', desc: '+12% range.', rangeMult: 1.12 }], capstone: { name: 'Grove of Amber', desc: '+15% damage, +10% range.', damageMult: 1.15, rangeMult: 1.1 } },
  },
  effigy: {
    predation: { field: 'rangeMult', step: 0.03, rungName: 'Dread Sigil', fork4: [{ name: 'Carrying Wail', desc: '+12% dread field.', rangeMult: 1.12 }, { name: 'Piercing Note', desc: '+8% field, faster pulse.', rangeMult: 1.08, fireRateMult: 1.06 }], fork7: [{ name: 'Deafening Keen', desc: '+16% dread field.', rangeMult: 1.16 }, { name: 'Urgent Chorus', desc: '+12% pulse rate.', fireRateMult: 1.12 }], capstone: { name: 'Voice of the End', desc: '+22% dread field, +8% pulse rate.', rangeMult: 1.22, fireRateMult: 1.08 } },
    mutation: { field: 'rangeMult', step: 0.02, rungName: 'Hollow Throat', fork4: [{ name: 'Long Echo', desc: '+12% dread field.', rangeMult: 1.12 }, { name: 'Quick Gasp', desc: '+10% pulse rate.', fireRateMult: 1.1 }], fork7: [{ name: 'Rolling Terror', desc: '+14% dread field.', rangeMult: 1.14 }, { name: 'Staggered Wail', desc: '+10% pulse rate, +4% field.', fireRateMult: 1.1, rangeMult: 1.04 }], capstone: { name: 'The Wide Wail', desc: '+18% dread field, +8% pulse rate.', rangeMult: 1.18, fireRateMult: 1.08 } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Keening Cord', fork4: [{ name: 'Rapid Keening', desc: '+12% pulse rate.', fireRateMult: 1.12 }, { name: 'Held Note', desc: '+6% rate, +6% field.', fireRateMult: 1.06, rangeMult: 1.06 }], fork7: [{ name: 'Shrieking Pitch', desc: '+15% pulse rate.', fireRateMult: 1.15 }, { name: 'Swelling Dirge', desc: '+10% field, +6% rate.', rangeMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Unending Scream', desc: '+20% pulse rate, +8% field.', fireRateMult: 1.2, rangeMult: 1.08 } },
    symbiosis: { field: 'rangeMult', step: 0.025, rungName: 'Mourning Thread', fork4: [{ name: 'Shared Sorrow', desc: '+8% dread field.', rangeMult: 1.08 }, { name: 'Louder Grief', desc: '+8% pulse rate.', fireRateMult: 1.08 }], fork7: [{ name: 'Grief Chorus', desc: '+10% field, +6% rate.', rangeMult: 1.1, fireRateMult: 1.06 }, { name: 'Carrying Lament', desc: '+12% dread field.', rangeMult: 1.12 }], capstone: { name: 'All Things Mourn', desc: '+15% dread field, +10% pulse rate.', rangeMult: 1.15, fireRateMult: 1.1 } },
  },
  // Marrow Siphon (Vital) — the drain beam. Damage scales the beam DPS, fire rate its pulse/ramp
  // cadence, range its lock reach; an extra "projectile" is an extra FORKED drain target (the beam
  // splits — game.beamSystem honours castExtraProjectiles). No pierce/splash — a ray has neither.
  siphon: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Gorging Vein', fork4: dmgFork(0.12, 0.02), fork7: [{ name: 'Marrow Glut', desc: '+16% beam damage.', damageMult: 1.16 }, { name: 'Split Ray', desc: 'The beam forks to one more target.', extraProjectiles: 1 }], capstone: { name: 'Insatiable Gorge', desc: '+25% beam damage, +10% ramp rate.', damageMult: 1.25, fireRateMult: 1.1 } },
    mutation: { field: 'rangeMult', step: 0.025, rungName: 'Reaching Proboscis', fork4: [{ name: 'Long Tap', desc: '+12% lock range.', rangeMult: 1.12 }, { name: 'Thick Draw', desc: '+10% beam damage.', damageMult: 1.1 }], fork7: [{ name: 'Deep Reach', desc: '+16% lock range.', rangeMult: 1.16 }, { name: 'Fed Coil', desc: '+10% damage, +4% range.', damageMult: 1.1, rangeMult: 1.04 }], capstone: { name: 'The Long Draught', desc: '+20% lock range, +10% beam damage.', rangeMult: 1.2, damageMult: 1.1 } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Pulsing Sinew', fork4: [{ name: 'Racing Gorge', desc: '+12% ramp rate.', fireRateMult: 1.12 }, { name: 'Steady Draw', desc: '+6% ramp, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Frenzied Feed', desc: '+15% ramp rate.', fireRateMult: 1.15 }, { name: 'Heavy Pull', desc: '+10% damage, +6% ramp.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Ravenous Cadence', desc: '+20% ramp rate, +10% beam damage.', fireRateMult: 1.2, damageMult: 1.1 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Marrow Bond', fork4: [{ name: 'Shared Feast', desc: '+8% beam damage.', damageMult: 1.08 }, { name: 'Wide Tap', desc: '+8% lock range.', rangeMult: 1.08 }], fork7: [{ name: 'Communal Gorge', desc: '+10% damage, +6% ramp.', damageMult: 1.1, fireRateMult: 1.06 }, { name: 'Forked Feeders', desc: 'The beam forks to one more target.', extraProjectiles: 1 }], capstone: { name: 'The Colony Drinks', desc: '+15% beam damage, +10% lock range.', damageMult: 1.15, rangeMult: 1.1 } },
  },
  // Blight Sower — the MINE GARDENER. fireRateMult = seeding cadence; splashMult = detonation
  // radius; extraProjectiles = +max armed mines; all wired via trapTowerSystem/mineSystem.
  sower: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Virulent Payload', fork4: dmgFork(0.12, 0.02), fork7: [{ name: 'Concentrated Blight', desc: '+16% detonation damage.', damageMult: 1.16 }, { name: 'Twin Buds', desc: '+1 max armed mine.', extraProjectiles: 1 }], capstone: { name: 'Extinction Bloom', desc: '+25% detonation damage, +10% blast radius.', damageMult: 1.25, splashMult: 1.1 } },
    mutation: { field: 'splashMult', step: 0.03, rungName: 'Swelling Bloom', fork4: [{ name: 'Wide Bloom', desc: '+12% blast radius.', splashMult: 1.12 }, { name: 'Dense Spores', desc: '+10% detonation damage.', damageMult: 1.1 }], fork7: [{ name: 'Field Bloom', desc: '+16% blast radius.', splashMult: 1.16 }, { name: 'Deep Roots', desc: '+10% planting reach.', rangeMult: 1.1 }], capstone: { name: 'The Blight Garden', desc: '+20% blast radius, +10% detonation damage.', splashMult: 1.2, damageMult: 1.1 } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Rapid Germination', fork4: [{ name: 'Quick Seeding', desc: '+12% seeding cadence.', fireRateMult: 1.12 }, { name: 'Steady Sowing', desc: '+6% cadence, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Sprint Cycle', desc: '+15% seeding cadence.', fireRateMult: 1.15 }, { name: 'Fat Pods', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Perpetual Harvest', desc: '+20% seeding cadence, +1 max armed mine.', fireRateMult: 1.2, extraProjectiles: 1 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Rootweave', fork4: [{ name: 'Shared Soil', desc: '+8% detonation damage.', damageMult: 1.08 }, { name: 'Creeping Roots', desc: '+8% planting reach.', rangeMult: 1.08 }], fork7: [{ name: 'Symbiotic Bloom', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }, { name: 'Third Bud', desc: '+1 max armed mine.', extraProjectiles: 1 }], capstone: { name: 'The Colony Garden', desc: '+15% detonation damage, +12% blast radius.', damageMult: 1.15, splashMult: 1.12 } },
  },
  // Synapse Spire — the chain ARC-CASTER. extraProjectiles = +arc hops; fireRateMult = cast cadence;
  // rangeMult = acquisition + hop reach. All ride the composed chain component (docs/SPIRE.md).
  spire: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Charged Synapse', fork4: dmgFork(0.12, 0.02), fork7: [{ name: 'High Voltage', desc: '+16% arc damage.', damageMult: 1.16 }, { name: 'Long Lightning', desc: '+1 arc hop.', extraProjectiles: 1 }], capstone: { name: 'The Storm Speaks', desc: '+25% arc damage, +1 hop.', damageMult: 1.25, extraProjectiles: 1 } },
    mutation: { field: 'rangeMult', step: 0.025, rungName: 'Reaching Antenna', fork4: [{ name: 'Tall Pylon', desc: '+12% arc reach.', rangeMult: 1.12 }, { name: 'Dense Current', desc: '+10% arc damage.', damageMult: 1.1 }], fork7: [{ name: 'Sky Wire', desc: '+16% arc reach.', rangeMult: 1.16 }, { name: 'Grounded Power', desc: '+10% damage, +4% reach.', damageMult: 1.1, rangeMult: 1.04 }], capstone: { name: 'Horizon Arc', desc: '+20% arc reach, +10% damage.', rangeMult: 1.2, damageMult: 1.1 } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Racing Pulse', fork4: [{ name: 'Quick Discharge', desc: '+12% cast cadence.', fireRateMult: 1.12 }, { name: 'Steady Storm', desc: '+6% cadence, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Overdriven Coil', desc: '+15% cast cadence.', fireRateMult: 1.15 }, { name: 'Heavy Charge', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Perpetual Storm', desc: '+20% cadence, +10% arc damage.', fireRateMult: 1.2, damageMult: 1.1 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Neural Weave', fork4: [{ name: 'Shared Current', desc: '+8% arc damage.', damageMult: 1.08 }, { name: 'Broad Net', desc: '+8% arc reach.', rangeMult: 1.08 }], fork7: [{ name: 'Synced Storms', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }, { name: 'Fourth Fork', desc: '+1 arc hop.', extraProjectiles: 1 }], capstone: { name: 'The Grid Awakens', desc: '+15% arc damage, +12% reach.', damageMult: 1.15, rangeMult: 1.12 } },
  },
  // Undertow Polyp — the anti-progress PULL field. rangeMult = field reach; fireRateMult = pulse
  // cadence (more drags/sec); damageMult scales its chip. Displacement magnitude rides branch grants.
  polyp: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Grinding Churn', fork4: dmgFork(0.12, 0.02), fork7: [{ name: 'Toothed Tide', desc: '+16% churn damage.', damageMult: 1.16 }, { name: 'Wide Mouth', desc: '+10% field reach.', rangeMult: 1.1 }], capstone: { name: 'The Devouring Tide', desc: '+25% churn damage, +8% reach.', damageMult: 1.25, rangeMult: 1.08 } },
    mutation: { field: 'rangeMult', step: 0.025, rungName: 'Spreading Basin', fork4: [{ name: 'Wide Basin', desc: '+12% field reach.', rangeMult: 1.12 }, { name: 'Heavy Water', desc: '+10% churn damage.', damageMult: 1.1 }], fork7: [{ name: 'Drowned Acre', desc: '+16% field reach.', rangeMult: 1.16 }, { name: 'Deep Basin', desc: '+10% damage, +4% reach.', damageMult: 1.1, rangeMult: 1.04 }], capstone: { name: 'The Whole Shore', desc: '+20% field reach, +10% damage.', rangeMult: 1.2, damageMult: 1.1 } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Quickened Undertow', fork4: [{ name: 'Rapid Drag', desc: '+12% pulse cadence.', fireRateMult: 1.12 }, { name: 'Steady Drag', desc: '+6% cadence, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Riptide', desc: '+15% pulse cadence.', fireRateMult: 1.15 }, { name: 'Crushing Cycle', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Perpetual Undertow', desc: '+20% pulse cadence, +10% damage.', fireRateMult: 1.2, damageMult: 1.1 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Rooted Communion', fork4: [{ name: 'Shared Depths', desc: '+8% churn damage.', damageMult: 1.08 }, { name: 'Long Roots', desc: '+8% field reach.', rangeMult: 1.08 }], fork7: [{ name: 'Twin Tides', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }, { name: 'Vast Basin', desc: '+12% field reach.', rangeMult: 1.12 }], capstone: { name: 'The Sea Remembers', desc: '+15% churn damage, +12% reach.', damageMult: 1.15, rangeMult: 1.12 } },
  },
  // Resonance Coil — the beam MELTER. fireRateMult speeds the resonance RAMP + pulse; extraProjectiles
  // = extra beam channels; rangeMult = beam reach (hold targets longer). All wired via beamTowerSystem.
  coil: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Overcharged Lens', fork4: dmgFork(0.12, 0.02), fork7: [{ name: 'Meltdown Focus', desc: '+16% damage.', damageMult: 1.16 }, { name: 'Split Channel', desc: 'One extra beam target.', extraProjectiles: 1 }], capstone: { name: 'Annihilation Focus', desc: '+25% damage; the beam melts one more target.', damageMult: 1.25, extraProjectiles: 1 } },
    mutation: { field: 'rangeMult', step: 0.02, rungName: 'Focusing Array', fork4: [{ name: 'Extended Emitter', desc: '+12% beam reach.', rangeMult: 1.12 }, { name: 'Tight Beam', desc: '+10% damage.', damageMult: 1.1 }], fork7: [{ name: 'Long Lens', desc: '+14% reach, +4% damage.', rangeMult: 1.14, damageMult: 1.04 }, { name: 'Prism Split', desc: 'One extra beam target.', extraProjectiles: 1 }], capstone: { name: 'Panoramic Lens', desc: '+18% reach; the beam forks to one more target.', rangeMult: 1.18, extraProjectiles: 1 } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Resonance Winding', fork4: [{ name: 'Runaway Resonance', desc: '+12% ramp & pulse rate.', fireRateMult: 1.12 }, { name: 'Tuned Cadence', desc: '+6% rate, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Redline Tuning', desc: '+15% ramp & pulse rate.', fireRateMult: 1.15 }, { name: 'Charged Lattice', desc: '+10% damage, +6% rate.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Perpetual Resonance', desc: '+20% ramp & pulse rate, +10% damage.', fireRateMult: 1.2, damageMult: 1.1 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Harmonic Graft', fork4: [{ name: 'Shared Frequency', desc: '+8% damage.', damageMult: 1.08 }, { name: 'Diffuse Beam', desc: 'One extra beam target.', extraProjectiles: 1 }], fork7: [{ name: 'Resonant Chorus', desc: '+10% damage, +6% rate.', damageMult: 1.1, fireRateMult: 1.06 }, { name: 'Wide Aperture', desc: '+12% beam reach.', rangeMult: 1.12 }], capstone: { name: 'Coil Communion', desc: '+15% damage; the beam forks to one more target.', damageMult: 1.15, extraProjectiles: 1 } },
  },
  // Spitfang Turret — the dependable single-target AUTOCANNON (homing rounds). Kinetic like needle:
  // damageMult = round punch; fireRateMult = its signature spin-up cadence; rangeMult = barrel reach;
  // extraProjectiles = twin-linked barrels; projectileMutator = piercing rounds.
  spitfang: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Hardened Slug', fork4: dmgFork(0.12, 0.02), fork7: [{ name: 'Armor-Piercing Rounds', desc: 'Shots pierce two extra hosts.', projectileMutator: 'pierce2', damageMult: 1.04 }, { name: 'Twin-Linked', desc: 'Two additional rounds per burst.', extraProjectiles: 2 }], capstone: { name: 'Executioner Rounds', desc: '+25% damage; rounds pierce three.', damageMult: 1.25, projectileMutator: 'pierce3' } },
    mutation: { field: 'rangeMult', step: 0.025, rungName: 'Extended Barrel', fork4: [{ name: 'Long Barrel', desc: '+12% range.', rangeMult: 1.12 }, { name: 'Hollow-Point', desc: '+10% damage.', damageMult: 1.1 }], fork7: [{ name: 'Marksman Optics', desc: '+16% range, +4% damage.', rangeMult: 1.16, damageMult: 1.04 }, { name: 'Splitting Shells', desc: 'One additional round.', extraProjectiles: 1 }], capstone: { name: 'Overwatch Sight', desc: '+20% range; rounds pierce two.', rangeMult: 1.2, projectileMutator: 'pierce2' } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Spun Rotor', fork4: [{ name: 'Full Auto', desc: '+12% fire rate.', fireRateMult: 1.12 }, { name: 'Controlled Bursts', desc: '+6% fire rate, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Redline Rotor', desc: '+15% fire rate.', fireRateMult: 1.15 }, { name: 'Double Feed', desc: 'One additional round.', extraProjectiles: 1 }], capstone: { name: 'Storm of Lead', desc: '+20% fire rate, +10% damage.', fireRateMult: 1.2, damageMult: 1.1 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Munitions Link', fork4: [{ name: 'Shared Magazine', desc: '+8% damage.', damageMult: 1.08 }, { name: 'Fragmentation', desc: '+12% splash radius.', splashMult: 1.12 }], fork7: [{ name: 'Battery Fire', desc: '+10% damage, +6% fire rate.', damageMult: 1.1, fireRateMult: 1.06 }, { name: 'Twin Mount', desc: 'One additional round.', extraProjectiles: 1 }], capstone: { name: 'Firing Line', desc: '+15% damage, +10% splash.', damageMult: 1.15, splashMult: 1.1 } },
  },
  // Rift Anchor — the premium void PULL field (aura). Like polyp: rangeMult = field reach;
  // fireRateMult = collapse-pulse cadence; damageMult scales its crush chip. No discrete projectiles,
  // so its forks never lean on extraProjectiles — presence, reach and cadence are its axes.
  rift: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Crushing Gravity', fork4: [{ name: 'Singular Mass', desc: '+12% crush damage.', damageMult: 1.12 }, { name: 'Tidal Shear', desc: '+8% crush damage, +6% field reach.', damageMult: 1.08, rangeMult: 1.06 }], fork7: [{ name: 'Neutron Core', desc: '+16% crush damage.', damageMult: 1.16 }, { name: 'Spaghettification', desc: '+10% damage, +8% pulse cadence.', damageMult: 1.1, fireRateMult: 1.08 }], capstone: { name: 'Event Horizon', desc: '+25% crush damage, +10% field reach.', damageMult: 1.25, rangeMult: 1.1 } },
    mutation: { field: 'rangeMult', step: 0.03, rungName: 'Warped Space', fork4: [{ name: 'Wide Well', desc: '+12% field reach.', rangeMult: 1.12 }, { name: 'Dense Core', desc: '+10% crush damage.', damageMult: 1.1 }], fork7: [{ name: 'Gravity Lens', desc: '+16% field reach.', rangeMult: 1.16 }, { name: 'Deep Warp', desc: '+10% damage, +4% reach.', damageMult: 1.1, rangeMult: 1.04 }], capstone: { name: 'Bent Horizon', desc: '+20% field reach, +10% crush damage.', rangeMult: 1.2, damageMult: 1.1 } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Rapid Collapse', fork4: [{ name: 'Fast Pulse', desc: '+12% pulse cadence.', fireRateMult: 1.12 }, { name: 'Steady Pull', desc: '+6% cadence, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Rapid Singularity', desc: '+15% pulse cadence.', fireRateMult: 1.15 }, { name: 'Heavy Collapse', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Perpetual Collapse', desc: '+20% pulse cadence, +10% crush damage.', fireRateMult: 1.2, damageMult: 1.1 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Void Communion', fork4: [{ name: 'Shared Gravity', desc: '+8% crush damage.', damageMult: 1.08 }, { name: 'Reaching Well', desc: '+8% field reach.', rangeMult: 1.08 }], fork7: [{ name: 'Twin Singularity', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }, { name: 'Vast Horizon', desc: '+12% field reach.', rangeMult: 1.12 }], capstone: { name: 'The Void Remembers', desc: '+15% crush damage, +12% field reach.', damageMult: 1.15, rangeMult: 1.12 } },
  },
  // Wyrmwing Glaive — the RETURNING blade (firing 'arc'). damageMult = per-leg cut; fireRateMult =
  // throw cadence; rangeMult = the out-leg length (a longer carve BOTH ways); extraProjectiles =
  // twin glaives; pierce is inherent to the arc (every body on the path), so no pierce mutators.
  glaive: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Honed Edge', fork4: [{ name: 'Razor Wing', desc: '+12% blade damage.', damageMult: 1.12 }, { name: 'Twin Glaive', desc: 'A second blade per throw.', extraProjectiles: 1, damageMult: 1.02 }], fork7: [{ name: 'Molten Edge', desc: '+16% blade damage.', damageMult: 1.16 }, { name: 'Heavy Carve', desc: '+10% damage, +6% throw cadence.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Wyrmfang', desc: '+25% blade damage; a second blade per throw.', damageMult: 1.25, extraProjectiles: 1 } },
    mutation: { field: 'rangeMult', step: 0.025, rungName: 'Long Wing', fork4: [{ name: 'Far Carve', desc: '+12% carve length.', rangeMult: 1.12 }, { name: 'Dense Alloy', desc: '+10% blade damage.', damageMult: 1.1 }], fork7: [{ name: 'Horizon Cut', desc: '+16% carve length.', rangeMult: 1.16 }, { name: 'Balanced Wing', desc: '+10% damage, +4% length.', damageMult: 1.1, rangeMult: 1.04 }], capstone: { name: 'The Long Return', desc: '+20% carve length, +10% blade damage.', rangeMult: 1.2, damageMult: 1.1 } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Quick Release', fork4: [{ name: 'Rapid Throw', desc: '+12% throw cadence.', fireRateMult: 1.12 }, { name: 'Measured Arc', desc: '+6% cadence, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Whirling Cycle', desc: '+15% throw cadence.', fireRateMult: 1.15 }, { name: 'Heavy Spin', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Ceaseless Return', desc: '+20% throw cadence, +10% blade damage.', fireRateMult: 1.2, damageMult: 1.1 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Wing Bond', fork4: [{ name: 'Shared Edge', desc: '+8% blade damage.', damageMult: 1.08 }, { name: 'Wide Sweep', desc: '+8% carve length.', rangeMult: 1.08 }], fork7: [{ name: 'Paired Wings', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }, { name: 'Third Blade', desc: 'A second blade per throw.', extraProjectiles: 1 }], capstone: { name: 'The Flight Eternal', desc: '+15% blade damage, +12% carve length.', damageMult: 1.15, rangeMult: 1.12 } },
  },
  // Miasma Lung — the plague FOG (firing 'field'). damageMult = the fog's chip; fireRateMult =
  // breath cadence (more coats/sec); rangeMult = the bank's spread; infectionSpreadMult = its
  // native axis (the coat leaps further). No projectiles — the fog is the payload.
  lung: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Acrid Sac', fork4: [{ name: 'Biting Fog', desc: '+12% fog damage.', damageMult: 1.12 }, { name: 'Sour Breath', desc: '+8% damage, +6% breath cadence.', damageMult: 1.08, fireRateMult: 1.06 }], fork7: [{ name: 'Dissolving Damp', desc: '+16% fog damage.', damageMult: 1.16 }, { name: 'Fevered Exhale', desc: '+10% damage, +8% breath cadence.', damageMult: 1.1, fireRateMult: 1.08 }], capstone: { name: 'The Devouring Fog', desc: '+25% fog damage, +10% bank spread.', damageMult: 1.25, rangeMult: 1.1 } },
    mutation: { field: 'infectionSpreadMult', step: 0.04, rungName: 'Spore Duct', fork4: [{ name: 'Carrier Damp', desc: '+18% infection spread.', infectionSpreadMult: 1.18 }, { name: 'Thick Vapor', desc: '+10% fog damage.', damageMult: 1.1 }], fork7: [{ name: 'Pandemic Bank', desc: '+22% infection spread.', infectionSpreadMult: 1.22 }, { name: 'Wide Drift', desc: '+12% bank spread.', rangeMult: 1.12 }], capstone: { name: 'Patient Everywhere', desc: '+30% infection spread, +8% bank spread.', infectionSpreadMult: 1.3, rangeMult: 1.08 } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Bellows Muscle', fork4: [{ name: 'Rapid Exhale', desc: '+12% breath cadence.', fireRateMult: 1.12 }, { name: 'Measured Breath', desc: '+6% cadence, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Hyperventilation', desc: '+15% breath cadence.', fireRateMult: 1.15 }, { name: 'Deep Draw', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Ceaseless Breath', desc: '+20% breath cadence, +12% infection spread.', fireRateMult: 1.2, infectionSpreadMult: 1.12 } },
    symbiosis: { field: 'infectionSpreadMult', step: 0.03, rungName: 'Mycelial Vein', fork4: [{ name: 'Shared Air', desc: '+12% infection spread.', infectionSpreadMult: 1.12 }, { name: 'Nourishing Damp', desc: '+8% fog damage.', damageMult: 1.08 }], fork7: [{ name: 'Colony Breath', desc: '+14% spread, +6% damage.', infectionSpreadMult: 1.14, damageMult: 1.06 }, { name: 'Rolling Bank', desc: '+12% bank spread.', rangeMult: 1.12 }], capstone: { name: 'One Great Breath', desc: '+20% infection spread, +10% fog damage.', infectionSpreadMult: 1.2, damageMult: 1.1 } },
  },
  // Chitin Bell — the reaction PRIMER (firing 'field'). damageMult = the toll's slam; fireRateMult
  // = toll cadence (prime + detonate sooner); rangeMult = the ring's reach. No projectiles —
  // presence, weight and tempo are its axes (mirrors the rift/polyp aura family).
  bell: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Leaden Rim', fork4: [{ name: 'Heavy Toll', desc: '+12% toll damage.', damageMult: 1.12 }, { name: 'Cracking Note', desc: '+8% damage, +6% toll cadence.', damageMult: 1.08, fireRateMult: 1.06 }], fork7: [{ name: 'Sepulchral Weight', desc: '+16% toll damage.', damageMult: 1.16 }, { name: 'Ringing Blow', desc: '+10% damage, +8% cadence.', damageMult: 1.1, fireRateMult: 1.08 }], capstone: { name: 'The Breaking Peal', desc: '+25% toll damage, +10% ring reach.', damageMult: 1.25, rangeMult: 1.1 } },
    mutation: { field: 'rangeMult', step: 0.025, rungName: 'Flared Mouth', fork4: [{ name: 'Wide Ring', desc: '+12% ring reach.', rangeMult: 1.12 }, { name: 'Dense Bronze', desc: '+10% toll damage.', damageMult: 1.1 }], fork7: [{ name: 'Carrying Toll', desc: '+16% ring reach.', rangeMult: 1.16 }, { name: 'Deep Mouth', desc: '+10% damage, +4% reach.', damageMult: 1.1, rangeMult: 1.04 }], capstone: { name: 'The Whole Valley', desc: '+20% ring reach, +10% toll damage.', rangeMult: 1.2, damageMult: 1.1 } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Quick Clapper', fork4: [{ name: 'Urgent Toll', desc: '+12% toll cadence.', fireRateMult: 1.12 }, { name: 'Steady Ring', desc: '+6% cadence, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Alarm Pitch', desc: '+15% toll cadence.', fireRateMult: 1.15 }, { name: 'Weighted Swing', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Unbroken Carillon', desc: '+20% toll cadence, +10% toll damage.', fireRateMult: 1.2, damageMult: 1.1 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Harmonic Bond', fork4: [{ name: 'Shared Note', desc: '+8% toll damage.', damageMult: 1.08 }, { name: 'Long Ring', desc: '+8% ring reach.', rangeMult: 1.08 }], fork7: [{ name: 'Chorded Toll', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }, { name: 'Vast Ring', desc: '+12% ring reach.', rangeMult: 1.12 }], capstone: { name: 'The Colony Rings', desc: '+15% toll damage, +12% ring reach.', damageMult: 1.15, rangeMult: 1.12 } },
  },
  // Acid Lancet — the EXECUTIONER harpoon (firing 'homing'). damageMult = the cull's weight;
  // fireRateMult = draw cadence; rangeMult = its reach; extraProjectiles = a second harpoon;
  // pierce mutators let the draw pass through the kill (mirrors the needle/spitfang family).
  lancet: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Pressurized Gall', fork4: dmgFork(0.12, 0.02), fork7: [{ name: 'Beheading Weight', desc: '+16% harpoon damage.', damageMult: 1.16 }, { name: 'Impaling Draw', desc: 'The harpoon pierces two extra hosts.', projectileMutator: 'pierce2', damageMult: 1.04 }], capstone: { name: 'The Perfect Stroke', desc: '+25% harpoon damage; the draw pierces three.', damageMult: 1.25, projectileMutator: 'pierce3' } },
    mutation: { field: 'rangeMult', step: 0.025, rungName: 'Long Sinew', fork4: [{ name: 'Far Cull', desc: '+12% reach.', rangeMult: 1.12 }, { name: 'Dense Bile', desc: '+10% harpoon damage.', damageMult: 1.1 }], fork7: [{ name: 'Horizon Draw', desc: '+16% reach.', rangeMult: 1.16 }, { name: 'Threaded Barb', desc: 'The harpoon pierces one extra host.', projectileMutator: 'pierce1', damageMult: 1.04 }], capstone: { name: 'The Long Sentence', desc: '+20% reach; the draw pierces two.', rangeMult: 1.2, projectileMutator: 'pierce2' } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Coiled Tendon', fork4: [{ name: 'Quick Draw', desc: '+12% draw cadence.', fireRateMult: 1.12 }, { name: 'Measured Cull', desc: '+6% cadence, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Racing Windlass', desc: '+15% draw cadence.', fireRateMult: 1.15 }, { name: 'Heavy Draw', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Ceaseless Judgment', desc: '+20% draw cadence, +10% harpoon damage.', fireRateMult: 1.2, damageMult: 1.1 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Gall Graft', fork4: [{ name: 'Shared Venom', desc: '+8% harpoon damage.', damageMult: 1.08 }, { name: 'Second Ballista', desc: 'One additional harpoon per draw.', extraProjectiles: 1 }], fork7: [{ name: 'Communal Cull', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }, { name: 'Far Judgment', desc: '+12% reach.', rangeMult: 1.12 }], capstone: { name: 'The Colony Decides', desc: '+15% harpoon damage; one additional harpoon.', damageMult: 1.15, extraProjectiles: 1 } },
  },
  // Basilisk Maw — the ARENA petrifier (docs/ARENA.md §6). Its axes are the stare: heavier
  // sentences (damage), longer sight (range), quicker judgments (cadence), shared gazes (forks).
  basilisk: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Heavier Sentence', fork4: dmgFork(0.12, 0.02), fork7: [{ name: 'Stone Verdict', desc: '+16% stare damage.', damageMult: 1.16 }, { name: 'Splinter Gaze', desc: 'The bolt pierces one extra body.', projectileMutator: 'pierce1', damageMult: 1.06 }], capstone: { name: 'The Gorgon Court', desc: '+25% stare damage; the bolt pierces two.', damageMult: 1.25, projectileMutator: 'pierce2' } },
    mutation: { field: 'rangeMult', step: 0.025, rungName: 'Longer Sight', fork4: [{ name: 'Far Stare', desc: '+12% reach.', rangeMult: 1.12 }, { name: 'Dense Calcite', desc: '+10% stare damage.', damageMult: 1.1 }], fork7: [{ name: 'Horizon Watch', desc: '+16% reach.', rangeMult: 1.16 }, { name: 'Threaded Sight', desc: 'The bolt pierces one extra body.', projectileMutator: 'pierce1', damageMult: 1.04 }], capstone: { name: 'Nothing Escapes', desc: '+20% reach; the bolt pierces two.', rangeMult: 1.2, projectileMutator: 'pierce2' } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Quicker Judgment', fork4: [{ name: 'Rapid Verdicts', desc: '+12% stare cadence.', fireRateMult: 1.12 }, { name: 'Measured Stone', desc: '+6% cadence, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Unblinking', desc: '+15% stare cadence.', fireRateMult: 1.15 }, { name: 'Heavy Lids', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'The Ceaseless Stare', desc: '+20% cadence, +10% stare damage.', fireRateMult: 1.2, damageMult: 1.1 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Shared Gaze', fork4: [{ name: 'Twin Pupils', desc: 'One additional stare per cast.', extraProjectiles: 1 }, { name: 'Communal Stone', desc: '+8% stare damage.', damageMult: 1.08 }], fork7: [{ name: 'Council of Eyes', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }, { name: 'Wider Court', desc: '+12% reach.', rangeMult: 1.12 }], capstone: { name: 'The Thousand-Eye Verdict', desc: '+15% stare damage; one additional stare.', damageMult: 1.15, extraProjectiles: 1 } },
  },
  // Ossuary Choir — the ARENA bone-organ (docs/ARENA.md §6). Its axes are the chord: louder
  // hymns (damage), a wider nave (radius rides rangeMult), faster liturgy (cadence), more voices.
  ossuary: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Louder Hymn', fork4: dmgFork(0.12, 0.02), fork7: [{ name: 'Funeral Forte', desc: '+16% chord damage.', damageMult: 1.16 }, { name: 'Grinding Harmonic', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'The Requiem Mass', desc: '+25% chord damage.', damageMult: 1.25 } },
    mutation: { field: 'rangeMult', step: 0.025, rungName: 'Wider Nave', fork4: [{ name: 'Swelling Chorus', desc: '+12% chord reach.', rangeMult: 1.12 }, { name: 'Dense Marrow', desc: '+10% chord damage.', damageMult: 1.1 }], fork7: [{ name: 'Cathedral Lungs', desc: '+16% chord reach.', rangeMult: 1.16 }, { name: 'Deep Register', desc: '+10% damage.', damageMult: 1.1 }], capstone: { name: 'The Whole Yard Sings', desc: '+20% chord reach; +8% damage.', rangeMult: 1.2, damageMult: 1.08 } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Faster Liturgy', fork4: [{ name: 'Quick Vespers', desc: '+12% chord cadence.', fireRateMult: 1.12 }, { name: 'Steady Meter', desc: '+6% cadence, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Racing Canticle', desc: '+15% chord cadence.', fireRateMult: 1.15 }, { name: 'Weighted Beat', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Perpetual Choir', desc: '+20% cadence, +10% chord damage.', fireRateMult: 1.2, damageMult: 1.1 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'More Voices', fork4: [{ name: 'Borrowed Throats', desc: '+8% chord damage.', damageMult: 1.08 }, { name: 'Wide Refrain', desc: '+10% chord reach.', rangeMult: 1.1 }], fork7: [{ name: 'Choir of Choirs', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }, { name: 'Open Nave', desc: '+12% chord reach.', rangeMult: 1.12 }], capstone: { name: 'The Last Hymn Standing', desc: '+15% chord damage; +10% reach.', damageMult: 1.15, rangeMult: 1.1 } },
  },
  // Drake Roost — the BROOD engine (firing 'summon'). damageMult = its units' claws (roostSystem
  // scales hatched drakes); fireRateMult = hatch cadence; rangeMult = the brood leash. No
  // projectiles at all — the drakes are the payload, so its axes are unit power/tempo/reach.
  roost: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Sharpened Talon', fork4: [{ name: 'Killing Claws', desc: '+12% drake damage.', damageMult: 1.12 }, { name: 'Savage Clutch', desc: '+8% drake damage, +6% hatch cadence.', damageMult: 1.08, fireRateMult: 1.06 }], fork7: [{ name: 'Apex Talons', desc: '+16% drake damage.', damageMult: 1.16 }, { name: 'Bloodline Fury', desc: '+10% damage, +8% hatch cadence.', damageMult: 1.1, fireRateMult: 1.08 }], capstone: { name: 'Wyrmmother’s Rage', desc: '+25% drake damage, +10% hatch cadence.', damageMult: 1.25, fireRateMult: 1.1 } },
    mutation: { field: 'rangeMult', step: 0.03, rungName: 'Far Perch', fork4: [{ name: 'Wide Hunt', desc: '+12% brood leash.', rangeMult: 1.12 }, { name: 'Hard Scales', desc: '+10% drake damage.', damageMult: 1.1 }], fork7: [{ name: 'High Vantage', desc: '+16% brood leash.', rangeMult: 1.16 }, { name: 'Deep Range', desc: '+10% damage, +4% leash.', damageMult: 1.1, rangeMult: 1.04 }], capstone: { name: 'Sky Dominion', desc: '+20% brood leash, +10% drake damage.', rangeMult: 1.2, damageMult: 1.1 } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Warm Clutch', fork4: [{ name: 'Quick Hatch', desc: '+12% hatch cadence.', fireRateMult: 1.12 }, { name: 'Steady Brood', desc: '+6% cadence, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Fevered Eggs', desc: '+15% hatch cadence.', fireRateMult: 1.15 }, { name: 'Strong Hatchlings', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Endless Clutch', desc: '+20% hatch cadence, +10% drake damage.', fireRateMult: 1.2, damageMult: 1.1 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Brood Bond', fork4: [{ name: 'Shared Hunt', desc: '+8% drake damage.', damageMult: 1.08 }, { name: 'Long Leash', desc: '+8% brood leash.', rangeMult: 1.08 }], fork7: [{ name: 'Pack Tactics', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }, { name: 'Vast Territory', desc: '+12% brood leash.', rangeMult: 1.12 }], capstone: { name: 'The Sky Assimilated', desc: '+15% drake damage, +12% brood leash.', damageMult: 1.15, rangeMult: 1.12 } },
  },  // Gristle Warren — the BARRACKS (firing 'field' muster). fireRateMult = muster cadence (more
  // standing walls — the real axis); rangeMult = muster reach + the gnash's radius; damageMult = the
  // gnash at its foot (the thralls themselves are MinionDef data, untouched by the tower fold).
  warren: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Gnashing Gland', fork4: [{ name: 'Cruel Gnash', desc: '+12% gnash damage.', damageMult: 1.12 }, { name: 'Hungry Warren', desc: '+8% damage, +6% muster cadence.', damageMult: 1.08, fireRateMult: 1.06 }], fork7: [{ name: 'Bone-Crushing Floor', desc: '+16% gnash damage.', damageMult: 1.16 }, { name: 'Feeding Muster', desc: '+10% damage, +8% muster cadence.', damageMult: 1.1, fireRateMult: 1.08 }], capstone: { name: 'The Devouring Gate', desc: '+25% gnash damage, +10% muster cadence.', damageMult: 1.25, fireRateMult: 1.1 } },
    mutation: { field: 'rangeMult', step: 0.025, rungName: 'Burrow Mouth', fork4: [{ name: 'Wide Muster', desc: '+12% muster reach.', rangeMult: 1.12 }, { name: 'Thick Gnash', desc: '+10% gnash damage.', damageMult: 1.1 }], fork7: [{ name: 'Deep Warrens', desc: '+16% muster reach.', rangeMult: 1.16 }, { name: 'Gristle Tunnels', desc: '+8% reach, +6% cadence.', rangeMult: 1.08, fireRateMult: 1.06 }], capstone: { name: 'The Whole Lane Burrowed', desc: '+20% muster reach, +10% muster cadence.', rangeMult: 1.2, fireRateMult: 1.1 } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Fertile Gristle', fork4: [{ name: 'Rapid Litter', desc: '+12% muster cadence.', fireRateMult: 1.12 }, { name: 'Steady Muster', desc: '+6% cadence, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Teeming Warren', desc: '+15% muster cadence.', fireRateMult: 1.15 }, { name: 'Fed Litters', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'The Endless Muster', desc: '+20% muster cadence, +10% gnash damage.', fireRateMult: 1.2, damageMult: 1.1 } },
    symbiosis: { field: 'fireRateMult', step: 0.025, rungName: 'Sinew Bond', fork4: [{ name: 'Shared Marrow', desc: '+8% muster cadence.', fireRateMult: 1.08 }, { name: 'Long Burrows', desc: '+8% muster reach.', rangeMult: 1.08 }], fork7: [{ name: 'Colony Walls', desc: '+10% cadence, +6% damage.', fireRateMult: 1.1, damageMult: 1.06 }, { name: 'Vast Warren', desc: '+12% muster reach.', rangeMult: 1.12 }], capstone: { name: 'The Hive Holds', desc: '+15% muster cadence, +12% muster reach.', fireRateMult: 1.15, rangeMult: 1.12 } },
  },
  // Tick Battery — the long-reach VIRAL seeder (firing 'infest'). damageMult = the bite;
  // infectionSpreadMult = its native axis (the outbreak leaps further); fireRateMult = volley
  // cadence; rangeMult = its reach. NO extraProjectiles/pierce rows: the parasite behavior ignores
  // both channels by design (extra ticks are star/branch components).
  tick: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Barbed Mouthparts', fork4: [{ name: 'Gorging Bite', desc: '+12% tick damage.', damageMult: 1.12 }, { name: 'Fevered Bite', desc: '+8% damage, +6% volley cadence.', damageMult: 1.08, fireRateMult: 1.06 }], fork7: [{ name: 'Bloodswollen', desc: '+16% tick damage.', damageMult: 1.16 }, { name: 'Ravenous Clutch', desc: '+10% damage, +8% cadence.', damageMult: 1.1, fireRateMult: 1.08 }], capstone: { name: 'The Gorged Battery', desc: '+25% tick damage, +10% infection spread.', damageMult: 1.25, infectionSpreadMult: 1.1 } },
    mutation: { field: 'infectionSpreadMult', step: 0.04, rungName: 'Carrier Saliva', fork4: [{ name: 'Leaping Plague', desc: '+18% infection spread.', infectionSpreadMult: 1.18 }, { name: 'Heavy Ticks', desc: '+10% tick damage.', damageMult: 1.1 }], fork7: [{ name: 'Epidemic Saliva', desc: '+22% infection spread.', infectionSpreadMult: 1.22 }, { name: 'Far Fling', desc: '+12% reach.', rangeMult: 1.12 }], capstone: { name: 'The Outbreak Walks', desc: '+30% infection spread, +8% reach.', infectionSpreadMult: 1.3, rangeMult: 1.08 } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Spring Legs', fork4: [{ name: 'Rapid Volley', desc: '+12% volley cadence.', fireRateMult: 1.12 }, { name: 'Measured Fling', desc: '+6% cadence, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Swarming Battery', desc: '+15% volley cadence.', fireRateMult: 1.15 }, { name: 'Heavy Fling', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Ceaseless Clutch', desc: '+20% volley cadence, +12% infection spread.', fireRateMult: 1.2, infectionSpreadMult: 1.12 } },
    symbiosis: { field: 'rangeMult', step: 0.025, rungName: 'Long Leap', fork4: [{ name: 'Far Hosts', desc: '+12% reach.', rangeMult: 1.12 }, { name: 'Shared Plague', desc: '+12% infection spread.', infectionSpreadMult: 1.12 }], fork7: [{ name: 'Horizon Fling', desc: '+16% reach.', rangeMult: 1.16 }, { name: 'Colony Fever', desc: '+14% spread, +6% damage.', infectionSpreadMult: 1.14, damageMult: 1.06 }], capstone: { name: 'Every Host Is Ours', desc: '+20% reach, +15% infection spread.', rangeMult: 1.2, infectionSpreadMult: 1.15 } },
  },
  // Keening Quill — the RESONANT armor-breaker (firing 'homing'). damageMult = the quill (and its
  // crit grants); fireRateMult = draw cadence (more shears/sec); rangeMult = the spotter's reach;
  // extraProjectiles = another quill (the second mark only takes the impact's Fracture).
  quill: {
    predation: { field: 'damageMult', step: 0.04, rungName: 'Tempered Bone', fork4: dmgFork(0.12, 0.02), fork7: [{ name: 'Shell-Splitter', desc: '+16% quill damage.', damageMult: 1.16 }, { name: 'Piercing Keen', desc: 'The quill pierces one extra shell.', projectileMutator: 'pierce1', damageMult: 1.04 }], capstone: { name: 'The Perfect Pitch', desc: '+25% quill damage; the quill pierces two.', damageMult: 1.25, projectileMutator: 'pierce2' } },
    mutation: { field: 'rangeMult', step: 0.025, rungName: 'Long Resonator', fork4: [{ name: 'Far Keen', desc: '+12% reach.', rangeMult: 1.12 }, { name: 'Dense Bone', desc: '+10% quill damage.', damageMult: 1.1 }], fork7: [{ name: 'Horizon Note', desc: '+16% reach.', rangeMult: 1.16 }, { name: 'Threaded Keen', desc: 'The quill pierces one extra shell.', projectileMutator: 'pierce1', damageMult: 1.04 }], capstone: { name: 'The Note Carries', desc: '+20% reach; the quill pierces two.', rangeMult: 1.2, projectileMutator: 'pierce2' } },
    overclock: { field: 'fireRateMult', step: 0.03, rungName: 'Taut Sinew', fork4: [{ name: 'Quick Draw', desc: '+12% draw cadence.', fireRateMult: 1.12 }, { name: 'Measured Keen', desc: '+6% cadence, +6% damage.', fireRateMult: 1.06, damageMult: 1.06 }], fork7: [{ name: 'Rapid Pitch', desc: '+15% draw cadence.', fireRateMult: 1.15 }, { name: 'Heavy Keen', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }], capstone: { name: 'Ceaseless Keening', desc: '+20% draw cadence, +10% quill damage.', fireRateMult: 1.2, damageMult: 1.1 } },
    symbiosis: { field: 'damageMult', step: 0.025, rungName: 'Harmonic Graft', fork4: [{ name: 'Shared Pitch', desc: '+8% quill damage.', damageMult: 1.08 }, { name: 'Second Quill', desc: 'One additional quill per draw.', extraProjectiles: 1 }], fork7: [{ name: 'Choral Keen', desc: '+10% damage, +6% cadence.', damageMult: 1.1, fireRateMult: 1.06 }, { name: 'Far Chorus', desc: '+12% reach.', rangeMult: 1.12 }], capstone: { name: 'The Colony Sings', desc: '+15% quill damage; one additional quill.', damageMult: 1.15, extraProjectiles: 1 } },
  },
};

const FIELD_LABEL: Record<BranchTheme['field'], string> = {
  damageMult: 'damage',
  fireRateMult: 'fire rate',
  rangeMult: 'range',
  splashMult: 'splash radius',
  infectionSpreadMult: 'infection spread',
};

/** Generate one tower's full tree from its theme row: 4 branches × 10 tiers, forks at 4/7
 *  (mutually exclusive siblings), campaign gates at 4/7/10, visual stages at 4/7/10. */
function genTowerTree(kind: TowerKind): AdaptNode[] {
  const themes = TOWER_THEMES[kind];
  const out: AdaptNode[] = [];
  for (const branch of TOWER_ADAPT_BRANCHES as ('predation' | 'mutation' | 'overclock' | 'symbiosis')[]) {
    const t = themes[branch];
    const mk = (tier: number, extra: Partial<AdaptNode> & { name: string; desc: string }, suffix = ''): AdaptNode => ({
      id: `${kind}.${branch}.${tier}${suffix}`,
      subject: 'tower', kind, branch, tier,
      campaignStage: adaptStageGate(tier) || undefined,
      ...extra,
    });
    for (let tier = 1; tier <= 10; tier++) {
      if (tier === 4 || tier === 7) {
        const [a, b] = tier === 4 ? t.fork4 : t.fork7;
        const idA = `${kind}.${branch}.${tier}a`;
        const idB = `${kind}.${branch}.${tier}b`;
        out.push(
          { ...mk(tier, a, 'a'), exclusiveWith: [idB], visualTier: tier === 4 ? 1 : 2 },
          { ...mk(tier, b, 'b'), exclusiveWith: [idA], visualTier: tier === 4 ? 1 : 2 },
        );
      } else if (tier === 10) {
        out.push({ ...mk(tier, t.capstone), visualTier: 3 });
      } else {
        const mult = 1 + t.step;
        out.push(mk(tier, {
          name: `${t.rungName} ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][[1, 2, 3, 5, 6, 8, 9].indexOf(tier)]}`,
          desc: `+${Math.round(t.step * 100)}% ${FIELD_LABEL[t.field]}.`,
          [t.field]: mult,
        }));
      }
    }
  }
  return out;
}

// ── Legacy shared nodes (pre-per-tower saves keep their picks + refund on respec) ──

const LEGACY_TOWER_NODES: AdaptNode[] = [
  { id: 't.vir.1', subject: 'tower', branch: 'virulence', tier: 1, name: 'Envenomed', desc: '+8% strain damage.', damageMult: 1.08 },
  { id: 't.vir.2', subject: 'tower', branch: 'virulence', tier: 2, name: 'Frenzied Metabolism', desc: '+12% fire rate.', fireRateMult: 1.12 },
  { id: 't.res.1', subject: 'tower', branch: 'resilience', tier: 1, name: 'Extended Cilia', desc: '+15% engagement range.', rangeMult: 1.15 },
  { id: 't.res.2', subject: 'tower', branch: 'resilience', tier: 2, name: 'Boring Proboscis', desc: 'Shots pierce one extra host — answers armor + swarms.', projectileMutator: 'pierce1' },
  { id: 't.con.1', subject: 'tower', branch: 'contagion', tier: 1, name: 'Rupturing Spores', desc: '+15% splash radius.', splashMult: 1.15 },
  { id: 't.con.2', subject: 'tower', branch: 'contagion', tier: 2, name: 'Virulent Bloom', desc: '+25% Infection spread (Parasite) — leaps to farther hosts.', infectionSpreadMult: 1.25 },
];

const HERO_NODES: AdaptNode[] = [
  { id: 'h.vir.1', subject: 'hero', branch: 'virulence', tier: 1, name: 'Predatory Instinct', desc: '+10% champion damage.', heroDamageMult: 1.1 },
  { id: 'h.vir.2', subject: 'hero', branch: 'virulence', tier: 2, name: 'Apex Ferocity', desc: '+8% champion damage.', heroDamageMult: 1.08 },
  { id: 'h.res.1', subject: 'hero', branch: 'resilience', tier: 1, name: 'Rapid Synapses', desc: '−8% ability cooldown.', heroCooldownMult: 0.92 },
  { id: 'h.res.2', subject: 'hero', branch: 'resilience', tier: 2, name: 'Overclocked Neurons', desc: '−8% ability cooldown.', heroCooldownMult: 0.92 },
  { id: 'h.con.1', subject: 'hero', branch: 'contagion', tier: 1, name: 'Symbiotic Surge', desc: '+8% champion damage while active.', heroDamageMult: 1.08 },
  { id: 'h.con.2', subject: 'hero', branch: 'contagion', tier: 2, name: 'Assimilated Reflexes', desc: '−6% ability cooldown.', heroCooldownMult: 0.94 },
];

export const ADAPT_NODES: AdaptNode[] = [
  ...TOWER_ORDER.flatMap((k) => genTowerTree(k)),
  ...LEGACY_TOWER_NODES,
  ...HERO_NODES,
];
const NODE_BY_ID = new Map(ADAPT_NODES.map((n) => [n.id, n] as const));
export function adaptNode(id: string): AdaptNode | undefined { return NODE_BY_ID.get(id); }

/** The nodes a unit's tree renders: per-tower kinds get THEIR tree; heroes the shared tree.
 *  Legacy shared tower nodes surface only if the save already owns them (chosen). */
export function adaptNodesFor(subject: 'tower' | 'hero', unit?: string, chosen: readonly string[] = []): AdaptNode[] {
  if (subject === 'hero') return HERO_NODES;
  return ADAPT_NODES.filter((n) =>
    n.subject === 'tower' && (n.kind === unit || (!n.kind && chosen.includes(n.id))));
}

// ── Antigen economy (multi-source; every source slow or capped — never farmable) ──

export interface AntigenSources {
  masteryLevel: number; // this unit's mastery level
  campaignStage: number; // account's deepest cleared stage
  containerAntigen: number; // save.antigen — granted by legendary+ containers (capped at grant)
  achievementCount: number; // unlocked achievements
}

export const ANTIGEN = {
  stagePer: 15, // +1 Antigen per 15 campaign stages cleared (content-bounded)
  achievementsPer: 5, // +1 per 5 achievements …
  achievementCap: 3, // … capped
  containerCap: 4, // legendary+ containers grant at most this many lifetime
};

/** Antigen Points EARNED by a unit — mastery Ranks (the slow infinite engine) + capped
 *  account-wide bonuses. The spend budget = earned − spent. */
export function antigenEarned(src: AntigenSources): number {
  return (
    masteryRank(src.masteryLevel) +
    Math.floor(Math.max(0, src.campaignStage) / ANTIGEN.stagePer) +
    Math.min(ANTIGEN.containerCap, Math.max(0, src.containerAntigen)) +
    Math.min(ANTIGEN.achievementCap, Math.floor(Math.max(0, src.achievementCount) / ANTIGEN.achievementsPer))
  );
}

/** @deprecated mastery-only budget (pre multi-source). Kept for older call sites/tests. */
export function adaptPointsEarned(masteryLevel: number): number {
  return masteryRank(masteryLevel);
}

// ── Picking rules ─────────────────────────────────────────────────────────────

/** Whether `nodeId` can be picked: not owned, tier ladder satisfied, campaign gate met, and
 *  no EXCLUSIVE sibling already chosen. Point budget is the meta layer's check. */
export function canPickAdapt(nodeId: string, chosen: readonly string[], campaignStage = Infinity): boolean {
  const node = adaptNode(nodeId);
  if (!node || chosen.includes(nodeId)) return false;
  if (node.campaignStage && campaignStage < node.campaignStage) return false;
  if (node.exclusiveWith?.some((id) => chosen.includes(id))) return false;
  if (node.tier <= 1) return true;
  // A higher tier needs SOME pick at the tier directly below it in the same branch (same tree).
  return ADAPT_NODES.some((n) =>
    n.subject === node.subject && n.kind === node.kind && n.branch === node.branch &&
    n.tier === node.tier - 1 && chosen.includes(n.id));
}

/** The tower's battlefield VISUAL stage from its chosen set (0..3 — keystones raise it). */
export function adaptVisualTier(chosen: readonly string[]): number {
  let tier = 0;
  for (const id of chosen) {
    const v = NODE_BY_ID.get(id)?.visualTier ?? 0;
    if (v > tier) tier = v;
  }
  return tier;
}

/** Fold a chosen node set into one aggregated effect (multiplicative mults, summed mutators). */
export function adaptationEffect(chosen: readonly string[]): AdaptEffect {
  const e = neutralAdaptEffect();
  for (const id of chosen) {
    const n = NODE_BY_ID.get(id);
    if (!n) continue;
    if (n.damageMult) e.damageMult *= n.damageMult;
    if (n.fireRateMult) e.fireRateMult *= n.fireRateMult;
    if (n.rangeMult) e.rangeMult *= n.rangeMult;
    if (n.splashMult) e.splashMult *= n.splashMult;
    if (n.infectionSpreadMult) e.infectionSpreadMult *= n.infectionSpreadMult;
    if (n.projectileMutator) e.projectileMutators.push(n.projectileMutator);
    if (n.extraProjectiles) e.extraProjectiles += n.extraProjectiles;
    if (n.heroDamageMult) e.heroDamageMult *= n.heroDamageMult;
    if (n.heroCooldownMult) e.heroCooldownMult *= n.heroCooldownMult;
  }
  return e;
}

/** Respec pricing (docs/ADAPTATION.md): identity changes are allowed but not free — Genome
 *  Cores scaling with the picks refunded, gated behind campaign stage 10. */
export const ADAPT_RESPEC = { corePerPick: 20, stageGate: 10 };
export function respecCost(picks: number): number {
  return ADAPT_RESPEC.corePerPick * Math.max(0, picks);
}

// Self-check at module load (cheap; the full invariants live in adaptation.test.ts): every
// tower ships 4 branches × 12 nodes, ids unique, forks symmetric.
if (ADAPT_NODES.length !== new Set(ADAPT_NODES.map((n) => n.id)).size) {
  throw new Error('adaptation: duplicate node ids');
}
for (const k of TOWER_ORDER) {
  const mine = ADAPT_NODES.filter((n) => n.kind === k);
  if (mine.length !== TOWER_ADAPT_BRANCHES.length * 12) {
    throw new Error(`adaptation: ${k} tree malformed (${mine.length} nodes; expected ${TOWER_ADAPT_BRANCHES.length * 12})`);
  }
}
// TOWER_DEFS is imported for the theme table's kind-keying contract; referencing it keeps the
// dependency explicit for the registry graph.
void TOWER_DEFS;
