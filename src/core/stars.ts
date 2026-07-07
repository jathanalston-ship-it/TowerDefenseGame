// Tower Star EVOLUTION (TOWER-STARS.md). A star is a MUTATION, not a multiplier: each
// unlock grants a capability — new targeting, extra projectiles, or an entirely new
// attack — that changes how the tower plays. Stars are authored per tower as DATA
// (`starPathRegistry`), so the roster scales to hundreds with zero sim branches; the
// resolver folds a tower's unlocked stars (+ the player's per-run fork picks) into a
// `ResolvedStarKit` the sim reads. The incidental stat bump still comes from the S bucket
// (`config.STAR`) — nodes here are behavior-only, so they never double-count power.
//
// Golden invariant: a fresh account has 0 stars ⇒ no path nodes apply ⇒ an empty kit ⇒
// the run is byte-identical. Pure data + a pure resolver; no Game/DOM import.

import { Registry } from './registry';
import type { AbilityComponent } from './ability';
import type { TargetingProfile } from './targeting';
import type { TowerKind } from './types';

// ── Grants: the capability a star contributes (the §3 effect language, tower-side) ──
export type StarGrant =
  | { t: 'targeting'; profile: TargetingProfile } // change who the tower shoots
  | { t: 'projectile'; extraProjectiles?: number; splashMult?: number; mutators?: string[] } // mutate the shot
  | { t: 'ability'; components: AbilityComponent[] } // an added attack/aura/chain/debuff each cast
  | { t: 'reactor'; biomassMult?: number; overchargeBonus?: number } // economy evolution (support tower)
  | { t: 'cosmetic'; id: string }; // visual mutation (renderer; shared with mastery cosmetics)

/** A UI tag for the node's headline category (drives the preview iconography). */
export type StarKind =
  | 'targeting'
  | 'projectile'
  | 'attack'
  | 'interaction'
  | 'conditional'
  | 'cosmetic'
  | 'capstone'
  | 'fork';

export interface StarNode {
  star: number; // the star level this unlocks at (1-based)
  name: string; // players say this name ("Twin Fang") — not "+6%"
  kind: StarKind;
  desc: string; // preview text: what changes, in player words
  grants: StarGrant[];
}

export interface StarForkOption {
  id: string; // stable id stored in the per-run loadout
  name: string;
  desc: string;
  grants: StarGrant[];
}

/** A fork star: choose ONE option, re-selectable per run (loadout-level, not permanent). */
export interface StarFork {
  star: number;
  name: string; // the fork's theme ("Specialization")
  desc: string;
  fork: StarForkOption[];
}

export type StarStep = StarNode | StarFork;

export interface StarPath {
  tower: TowerKind;
  steps: StarStep[]; // ascending by `star`
}

export function isFork(s: StarStep): s is StarFork {
  return (s as StarFork).fork !== undefined;
}

export const starPathRegistry = new Registry<StarPath>('starPath', {
  idOf: (p) => p.tower,
  validate: (p) => {
    const out: string[] = [];
    let prev = 0;
    for (const s of p.steps) {
      if (s.star <= prev) out.push(`steps must ascend by star (saw ${s.star} after ${prev})`);
      prev = s.star;
      if (isFork(s) && s.fork.length < 2) out.push(`fork at ★${s.star} needs ≥2 options`);
    }
    return out;
  },
});

// ── Resolution ────────────────────────────────────────────────────────────────

/** The folded capabilities the sim reads off a tower's run config. */
export interface ResolvedStarKit {
  targeting?: TargetingProfile;
  extraProjectiles: number; // additional simultaneous targets for the base attack
  splashMult: number; // multiplies projectile splash radius
  projectileMutators: string[]; // mutator ids applied to each spawned projectile (pierce …)
  extraAbilities: AbilityComponent[]; // run after the base kit each cast
  reactorBiomassMult: number; // reactor economy: biomass generation (1 = base)
  reactorOverchargeBonus: number; // reactor economy: extra overcharge to adjacent towers (0 = base)
  cosmetics: string[]; // visual mutation ids
}

export function emptyStarKit(): ResolvedStarKit {
  return { extraProjectiles: 0, splashMult: 1, projectileMutators: [], extraAbilities: [], reactorBiomassMult: 1, reactorOverchargeBonus: 0, cosmetics: [] };
}

function optionFor(fork: StarFork, picks: Record<string, string>): StarForkOption {
  const id = picks[String(fork.star)];
  return fork.fork.find((o) => o.id === id) ?? fork.fork[0]; // default to the first option
}

/** Fold one grant into a kit (shared by the star resolver and the branch resolver). */
export function applyGrant(kit: ResolvedStarKit, g: StarGrant): void {
  switch (g.t) {
    case 'targeting':
      kit.targeting = g.profile;
      break;
    case 'projectile':
      if (g.extraProjectiles) kit.extraProjectiles += g.extraProjectiles;
      if (g.splashMult) kit.splashMult *= g.splashMult;
      if (g.mutators) for (const m of g.mutators) kit.projectileMutators.push(m);
      break;
    case 'ability':
      for (const c of g.components) kit.extraAbilities.push(c);
      break;
    case 'reactor':
      if (g.biomassMult) kit.reactorBiomassMult *= g.biomassMult;
      if (g.overchargeBonus) kit.reactorOverchargeBonus += g.overchargeBonus;
      break;
    case 'cosmetic':
      kit.cosmetics.push(g.id);
      break;
  }
}

/**
 * Fold a tower's unlocked stars (+ per-run fork picks, keyed by star number) into a kit.
 * `forkPicks` defaults each fork to its first option. Returns an empty kit for a tower
 * with no authored path or zero stars (the golden-safe identity).
 */
export function resolveStarKit(tower: TowerKind, stars: number, forkPicks: Record<string, string> = {}): ResolvedStarKit {
  const kit = emptyStarKit();
  const path = starPathRegistry.get(tower);
  if (!path) return kit;
  for (const step of path.steps) {
    if (step.star > stars) continue;
    const grants = isFork(step) ? optionFor(step, forkPicks).grants : step.grants;
    for (const g of grants) applyGrant(kit, g);
  }
  return kit;
}

// ── Authored launch paths ───────────────────────────────────────────────────
// Behavior-only (the incidental stat is config.STAR). Built from the existing ability
// vocabulary so no new executors are needed; values are modest placeholders (balance is
// a later pass). The Flesh Reactor is support (it never fires through the tower loop), so
// its path is ECONOMY-themed (biomass + overcharge) — authored below as a 'reactor' grant.

const NEEDLE: StarPath = {
  tower: 'needle',
  steps: [
    { star: 1, name: 'Tracker', kind: 'targeting', desc: 'Locks onto the FASTEST enemy in range.', grants: [{ t: 'targeting', profile: 'fastest' }] },
    { star: 2, name: 'Twin Fang', kind: 'projectile', desc: 'Fires at a second target each shot.', grants: [{ t: 'projectile', extraProjectiles: 1 }] },
    {
      star: 3,
      name: 'Specialization',
      kind: 'fork',
      desc: 'Choose the Needle Spitter’s identity (re-pick any run).',
      fork: [
        { id: 'saturation', name: 'Saturation', desc: 'A third needle every shot — shred the swarm.', grants: [{ t: 'projectile', extraProjectiles: 1 }] },
        { id: 'skirmisher', name: 'Skirmisher', desc: 'Targets the WEAKEST, chaining to finish kills.', grants: [{ t: 'targeting', profile: 'lowestHealth' }, { t: 'ability', components: [{ type: 'chain', jumps: 2, range: 120, damage: 10, falloff: 0.6 }] }] },
      ],
    },
    { star: 4, name: 'Resonant Barbs', kind: 'interaction', desc: 'Each shot also Fractures nearby enemies (armor shred).', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 135, status: { kind: 'Fracture', amount: 1 } }] }] },
    {
      star: 5,
      name: 'Apex Frame',
      kind: 'fork',
      desc: 'Signature transformation.',
      fork: [
        { id: 'autocannon', name: 'Autocannon', desc: 'Two more needles per shot, and they punch THROUGH two foes.', grants: [{ t: 'projectile', extraProjectiles: 2, mutators: ['pierce2'] }] },
        { id: 'railspike', name: 'Railspike', desc: 'A piercing chain that arcs through a line of enemies.', grants: [{ t: 'ability', components: [{ type: 'chain', jumps: 4, range: 150, damage: 18, falloff: 0.7 }] }] },
      ],
    },
  ],
};

const MORTAR: StarPath = {
  tower: 'mortar',
  steps: [
    { star: 1, name: 'Spotter', kind: 'targeting', desc: 'Lobs at the TOUGHEST enemy in range.', grants: [{ t: 'targeting', profile: 'highestHealth' }] },
    { star: 2, name: 'Wide Payload', kind: 'projectile', desc: 'Bigger blast radius (+25%).', grants: [{ t: 'projectile', splashMult: 1.25 }] },
    {
      star: 3,
      name: 'Specialization',
      kind: 'fork',
      desc: 'Choose the Bone Mortar’s identity (re-pick any run).',
      fork: [
        { id: 'saturation', name: 'Saturation Shells', desc: 'A second shell lands each volley.', grants: [{ t: 'projectile', extraProjectiles: 1 }] },
        { id: 'acid', name: 'Concentrated Acid', desc: 'A corrosive field eats anything near the tower.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 90, damage: 6, status: { kind: 'Corrosion', amount: 1 }, react: true, particle: 'death' }] }] },
      ],
    },
    { star: 4, name: 'Contagion', kind: 'interaction', desc: 'Every volley spreads Corrosion across the field.', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 175, status: { kind: 'Corrosion', amount: 1 } }] }] },
    {
      star: 5,
      name: 'Marrow Cataclysm',
      kind: 'fork',
      desc: 'Signature transformation.',
      fork: [
        { id: 'ordnance', name: 'Heavy Ordnance', desc: 'Cataclysmic blast radius (+50%).', grants: [{ t: 'projectile', splashMult: 1.5 }] },
        { id: 'eruption', name: 'Acid Eruption', desc: 'A lane-wide corrosive detonation each volley.', grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 140, damage: 30, status: { kind: 'Corrosion', amount: 1 }, react: true, particle: 'death' }] }] },
      ],
    },
  ],
};

const PARASITE: StarPath = {
  tower: 'parasite',
  steps: [
    { star: 1, name: 'Questing', kind: 'targeting', desc: 'Seeks the MOST-infected enemy to ramp it faster.', grants: [{ t: 'targeting', profile: 'mostCorrupted' }] },
    { star: 2, name: 'Brood Split', kind: 'projectile', desc: 'Launches a second parasite each cycle.', grants: [{ t: 'projectile', extraProjectiles: 1 }] },
    {
      star: 3,
      name: 'Specialization',
      kind: 'fork',
      desc: 'Choose the Parasite Nest’s identity (re-pick any run).',
      fork: [
        { id: 'plague', name: 'Plaguebearer', desc: 'An infection aura saturates everything nearby.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 120, status: { kind: 'Infection', amount: 1 }, particle: 'infect' }] }] },
        { id: 'hatchery', name: 'Hatchery', desc: 'Swarmlings chip every enemy in range.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 130, damage: 4, react: false, particle: 'infect' }] }] },
      ],
    },
    { star: 4, name: 'Virulent', kind: 'interaction', desc: 'Each cycle spreads Infection across the field.', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 150, status: { kind: 'Infection', amount: 1 } }] }] },
    {
      star: 5,
      name: 'Total Infestation',
      kind: 'fork',
      desc: 'Signature transformation.',
      fork: [
        { id: 'pandemic', name: 'Pandemic Strain', desc: 'Two more parasites per cycle, each boring through a foe.', grants: [{ t: 'projectile', extraProjectiles: 2, mutators: ['pierce1'] }] },
        { id: 'consume', name: 'Consuming Bloom', desc: 'A heavy infection-and-damage field engulfs the area.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 160, damage: 6, status: { kind: 'Infection', amount: 2 }, react: true, particle: 'infect' }] }] },
      ],
    },
  ],
};

const OBELISK: StarPath = {
  tower: 'obelisk',
  steps: [
    { star: 1, name: 'Fixation', kind: 'targeting', desc: 'Prioritizes the biggest threat in the field.', grants: [{ t: 'targeting', profile: 'highestHealth' }] },
    { star: 2, name: 'Synaptic Static', kind: 'attack', desc: 'A second pulse layers extra Disruption.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 120, damage: 5, status: { kind: 'Disruption', amount: 1 }, particle: 'disrupt' }] }] },
    {
      star: 3,
      name: 'Specialization',
      kind: 'fork',
      desc: 'Choose the Neural Obelisk’s identity (re-pick any run).',
      fork: [
        { id: 'terror', name: 'Terror', desc: 'Crushing Disruption — deep slows and vulnerability.', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 120, status: { kind: 'Disruption', amount: 2 } }] }] },
        { id: 'hijack', name: 'Hijack', desc: 'The field burns minds for real damage.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 120, damage: 8, react: true, particle: 'disrupt' }] }] },
      ],
    },
    { star: 4, name: 'Overload', kind: 'attack', desc: 'Periodic psionic detonation rocks the field.', grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 120, damage: 14, status: { kind: 'Disruption', amount: 1 }, react: true, particle: 'disrupt' }] }] },
    {
      star: 5,
      name: 'Hive Override',
      kind: 'fork',
      desc: 'Signature transformation.',
      fork: [
        { id: 'dominator', name: 'Dominator', desc: 'A wide, punishing domination field.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 140, damage: 6, status: { kind: 'Disruption', amount: 2 }, react: true, particle: 'disrupt' }] }] },
        { id: 'override', name: 'Mass Override', desc: 'A massive override blast overwhelms a chunk of the wave.', grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 160, damage: 36, status: { kind: 'Disruption', amount: 2 }, react: true, particle: 'disrupt' }] }] },
      ],
    },
  ],
};

// Flesh Reactor (Vital) — support: it never fires, so its evolution is ECONOMY (biomass +
// overcharge), read by the reactor systems from this kit. A fresh reactor (0 stars) ⇒ ×1/+0.
const REACTOR: StarPath = {
  tower: 'reactor',
  steps: [
    { star: 1, name: 'Rich Cultures', kind: 'interaction', desc: 'Generates +15% biomass.', grants: [{ t: 'reactor', biomassMult: 1.15 }] },
    { star: 2, name: 'Conductive Veins', kind: 'interaction', desc: 'Adjacent towers overcharge harder (+8%).', grants: [{ t: 'reactor', overchargeBonus: 0.08 }] },
    {
      star: 3,
      name: 'Specialization',
      kind: 'fork',
      desc: 'Choose the Flesh Reactor’s identity (re-pick any run).',
      fork: [
        { id: 'furnace', name: 'Furnace', desc: 'Pour everything into biomass (+25%).', grants: [{ t: 'reactor', biomassMult: 1.25 }] },
        { id: 'network', name: 'Network', desc: 'Pour everything into overcharge (+12%).', grants: [{ t: 'reactor', overchargeBonus: 0.12 }] },
      ],
    },
    { star: 4, name: 'Hyperplasia', kind: 'interaction', desc: 'Generates a further +20% biomass.', grants: [{ t: 'reactor', biomassMult: 1.2 }] },
    {
      star: 5,
      name: 'Apotheosis Bloom',
      kind: 'fork',
      desc: 'Signature transformation.',
      fork: [
        { id: 'apotheosis', name: 'Apotheosis', desc: 'A surge of biomass (+40%).', grants: [{ t: 'reactor', biomassMult: 1.4 }] },
        { id: 'conduit', name: 'Conduit Engine', desc: 'Overwhelming overcharge (+20%).', grants: [{ t: 'reactor', overchargeBonus: 0.2 }] },
      ],
    },
  ],
};

// ── Expansion paths (docs/TOWERS.md §expansion) — same rhythm: ★1/2 identity, ★3 fork,
// ★4 interaction, ★5 fork, ★7 power step, ★9 capstone. Existing vocabulary only. ──

const MAW: StarPath = {
  tower: 'maw',
  steps: [
    { star: 1, name: 'Grinding Rows', kind: 'attack', desc: 'An inner ring of teeth chews what presses closest.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 100, damage: 6, react: true, particle: 'shred' }] }] },
    { star: 2, name: 'Wide Gape', kind: 'interaction', desc: 'Bites strip armor plating (Fracture) from everything held.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 170, status: { kind: 'Fracture', amount: 1 }, particle: 'shred' }] }] },
    {
      star: 3, name: 'Feeding Habit', kind: 'fork', desc: 'Choose the Maw’s appetite (re-pick any run).',
      fork: [
        { id: 'crusher', name: 'Crusher', desc: 'Each bite ends in a concussive crunch.', grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 110, damage: 14, react: true, particle: 'shred' }] }] },
        { id: 'dragnet', name: 'Dragnet', desc: 'A dragging undertow Disrupts everything near the jaws.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 190, damage: 3, status: { kind: 'Disruption', amount: 1 }, particle: 'disrupt' }] }] },
      ],
    },
    { star: 4, name: 'Bone Mulch', kind: 'attack', desc: 'A second grinding ring — nothing survives the middle.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 130, damage: 9, react: true, particle: 'shred' }] }] },
    {
      star: 5, name: 'Apex Gullet', kind: 'fork', desc: 'Signature transformation.',
      fork: [
        { id: 'abattoir', name: 'Abattoir', desc: 'A massive rending crunch with every bite.', grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 150, damage: 26, react: true, particle: 'shred' }] }] },
        { id: 'maelstrom', name: 'Maelstrom', desc: 'The undertow becomes a drowning current.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 210, damage: 7, status: { kind: 'Disruption', amount: 2 }, react: true, particle: 'disrupt' }] }] },
      ],
    },
    { star: 7, name: 'Carrion Reek', kind: 'interaction', desc: 'The stench of the feast weakens armor across a wide ring.', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 220, status: { kind: 'Fracture', amount: 2 } }] }] },
    { star: 9, name: 'The Endless Hunger', kind: 'capstone', desc: 'Everything near it is food: a devastating crunch and deep shredding.', grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 180, damage: 40, react: true, particle: 'shred' }, { type: 'aura', radius: 200, status: { kind: 'Fracture', amount: 1 }, particle: 'shred' }] }, { t: 'cosmetic', id: 'hunger' }] },
  ],
};

const CHRYSALIS: StarPath = {
  tower: 'chrysalis',
  steps: [
    { star: 1, name: 'Harder Set', kind: 'attack', desc: 'Encasements hold noticeably longer.', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Freeze', amount: 1.7 } }] }] },
    { star: 2, name: 'Weeping Sap', kind: 'interaction', desc: 'Each cast drips Corrosion around the victim.', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 130, status: { kind: 'Corrosion', amount: 1 } }] }] },
    {
      star: 3, name: 'Curation', kind: 'fork', desc: 'Choose what the Warden preserves (re-pick any run).',
      fork: [
        { id: 'splinter', name: 'Splinter', desc: 'Casings burst into razor shards.', grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 95, damage: 14, react: true, particle: 'shred' }] }] },
        { id: 'longwatch', name: 'Long Watch', desc: 'Farther reach; the sap spreads wider.', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 170, status: { kind: 'Corrosion', amount: 1 } }] }] },
      ],
    },
    { star: 4, name: 'Amber Bite', kind: 'attack', desc: 'Bolts hit far harder on the way in.', grants: [{ t: 'ability', components: [{ type: 'crit', chance: 0.3, mult: 2.2, damage: 10 }] }] },
    {
      star: 5, name: 'Reliquary Frame', kind: 'fork', desc: 'Signature transformation.',
      fork: [
        { id: 'vice', name: 'Vice', desc: 'It hunts the true monsters first.', grants: [{ t: 'targeting', profile: 'bossPriority' }, { t: 'ability', components: [{ type: 'crit', chance: 0.4, mult: 2.6, damage: 16 }] }] },
        { id: 'tomb', name: 'Tomb', desc: 'The deepest hold — victims stay preserved.', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Freeze', amount: 2.4 } }] }] },
      ],
    },
    { star: 7, name: 'Golden Moat', kind: 'interaction', desc: 'A melting sap moat gathers at its roots.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 130, damage: 6, status: { kind: 'Corrosion', amount: 1 }, react: true, particle: 'acid' }] }] },
    { star: 9, name: 'The Perfect Collection', kind: 'capstone', desc: 'Every specimen preserved: the hardest set, ending in a shard nova.', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Freeze', amount: 2.6 } }, { type: 'explosion', radius: 140, damage: 30, react: true, particle: 'shred' }] }, { t: 'cosmetic', id: 'collection' }] },
  ],
};

const EFFIGY: StarPath = {
  tower: 'effigy',
  steps: [
    { star: 1, name: 'Carrying Wail', kind: 'attack', desc: 'The dread leaves minds Disrupted (slow + vulnerability).', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 300, status: { kind: 'Disruption', amount: 1 } }] }] },
    { star: 2, name: 'Cutting Note', kind: 'attack', desc: 'The wail begins to wound — psychic damage in its field.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 240, damage: 5, react: true, particle: 'disrupt' }] }] },
    {
      star: 3, name: 'Timbre', kind: 'fork', desc: 'Choose the Effigy’s voice (re-pick any run).',
      fork: [
        { id: 'dirge', name: 'Dirge', desc: 'The cut deepens — terror that wounds.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 250, damage: 8, react: true, particle: 'disrupt' }] }] },
        { id: 'lament', name: 'Lament', desc: 'A second dread wave rolls farther out.', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 340, status: { kind: 'Fear', amount: 1.3 } }] }] },
      ],
    },
    { star: 4, name: 'Sorrow Sink', kind: 'interaction', desc: 'The field saps will — heavier Disruption layers on.', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 300, status: { kind: 'Disruption', amount: 1 } }] }] },
    {
      star: 5, name: 'Icon of Dread', kind: 'fork', desc: 'Signature transformation.',
      fork: [
        { id: 'bell', name: 'The Bell', desc: 'A tolling psychic blast rocks the crust.', grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 210, damage: 22, react: true, particle: 'disrupt' }] }] },
        { id: 'chorus', name: 'The Chorus', desc: 'The dread carries across the whole approach.', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 380, status: { kind: 'Fear', amount: 1.5 } }] }] },
      ],
    },
    { star: 7, name: 'Feast of Panic', kind: 'attack', desc: 'The wail cuts deeper into every mind it reaches.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 280, damage: 9, react: true, particle: 'disrupt' }] }] },
    { star: 9, name: 'All Things End', kind: 'capstone', desc: 'The final note: a crushing toll and dread without horizon.', grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 250, damage: 38, react: true, particle: 'disrupt' }, { type: 'debuff', radius: 380, status: { kind: 'Disruption', amount: 2 } }] }, { t: 'cosmetic', id: 'end' }] },
  ],
};

// Marrow Siphon (Vital, firing 'beam') — the drain ray. `extraProjectiles` FORKS the beam to more
// targets; `ability` grants pulse on the beam's cadence (game.beamSystem); `targeting` picks what it
// fastens onto. No projectile mutators — a continuous ray has nothing to pierce. Its economy identity
// (biomass siphon) is bespoke; the path SHARPENS the drain and widens it into a field.
const SIPHON_PATH: StarPath = {
  tower: 'siphon',
  steps: [
    { star: 1, name: 'Scavenger’s Instinct', kind: 'targeting', desc: 'Fastens onto the WEAKEST prey first — it finishes the wounded and gorges on the kill.', grants: [{ t: 'targeting', profile: 'lowestHealth' }] },
    { star: 2, name: 'Split Ray', kind: 'projectile', desc: 'The beam forks to a second target.', grants: [{ t: 'projectile', extraProjectiles: 1 }] },
    {
      star: 3,
      name: 'Feeding Habit',
      kind: 'fork',
      desc: 'Choose what the drain does to the flesh around it (re-pick any run).',
      fork: [
        { id: 'corroder', name: 'Corroder', desc: 'The beam’s backwash melts everything near the victim.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 120, damage: 5, status: { kind: 'Corrosion', amount: 1 }, react: true, particle: 'acid' }] }] },
        { id: 'render', name: 'Render', desc: 'The drain strips armor plating (Fracture) from the fed-upon.', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 150, status: { kind: 'Fracture', amount: 1 } }] }] },
      ],
    },
    { star: 4, name: 'Sympathetic Drain', kind: 'interaction', desc: 'A draining field chips every host near the beam.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 130, damage: 7, react: true, particle: 'bloom' }] }] },
    {
      star: 5,
      name: 'Apex Organ',
      kind: 'fork',
      desc: 'Signature transformation.',
      fork: [
        { id: 'devourer', name: 'Devourer', desc: 'A THIRD fork and a heavier drain field — it eats the whole line.', grants: [{ t: 'projectile', extraProjectiles: 1 }, { t: 'ability', components: [{ type: 'aura', radius: 150, damage: 10, react: true, particle: 'bloom' }] }] },
        { id: 'leech', name: 'Leech Field', desc: 'A wide melting bloom saturates everything it touches.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 170, damage: 8, status: { kind: 'Corrosion', amount: 2 }, react: true, particle: 'acid' }] }] },
      ],
    },
    { star: 7, name: 'Marrow Flood', kind: 'interaction', desc: 'The gorging spreads — Corrosion floods a wide ring each pulse.', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 200, status: { kind: 'Corrosion', amount: 2 } }] }] },
    { star: 9, name: 'The Insatiable', kind: 'capstone', desc: 'A fourth fork and a devouring nova — nothing near it keeps its marrow.', grants: [{ t: 'projectile', extraProjectiles: 1 }, { t: 'ability', components: [{ type: 'explosion', radius: 160, damage: 34, react: true, particle: 'bloom' }, { type: 'aura', radius: 190, status: { kind: 'Corrosion', amount: 1 }, particle: 'acid' }] }, { t: 'cosmetic', id: 'insatiable' }] },
  ],
};

// Resonance Coil (Resonant) — the beam MELTER. Stars are behavior-only: for the beam, projectile
// `extraProjectiles` = extra simultaneous beam CHANNELS (they ride the same resonance heat), and
// `ability` grants fire on the beam's PULSE cadence aimed at the locked target. The path leans into
// its identity — deeper single-target melt (crits, armor-shred) with a spread FORK for crowd melt.
const COIL: StarPath = {
  tower: 'coil',
  steps: [
    { star: 1, name: 'Bifurcated Lens', kind: 'projectile', desc: 'The beam splits — it now sears a SECOND target at once.', grants: [{ t: 'projectile', extraProjectiles: 1 }] },
    { star: 2, name: 'Searing Coil', kind: 'interaction', desc: 'The beam rips Fracture into its target — armor shred that pairs with its Corrosion (Shred).', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Fracture', amount: 1 } }] }] },
    {
      star: 3,
      name: 'Specialization',
      kind: 'fork',
      desc: 'Choose the Resonance Coil’s identity (re-pick any run).',
      fork: [
        { id: 'overload', name: 'Overload', desc: 'Focus the melt: brutal critical resonance on the held target.', grants: [{ t: 'ability', components: [{ type: 'crit', chance: 0.3, mult: 2.5, damage: 14 }] }] },
        { id: 'diffusion', name: 'Diffusion', desc: 'Spread the melt: the beam forks to a THIRD target.', grants: [{ t: 'projectile', extraProjectiles: 1 }] },
      ],
    },
    { star: 4, name: 'Corrosive Bloom', kind: 'attack', desc: 'Resonance blooms — Corrosion sprays to enemies around the beam’s target.', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 120, status: { kind: 'Corrosion', amount: 1 } }] }] },
    {
      star: 5,
      name: 'Apex Frame',
      kind: 'fork',
      desc: 'Signature transformation.',
      fork: [
        { id: 'singularity', name: 'Singularity Lens', desc: 'A boss-deleter: devastating crits and deep Fracture on the melting target.', grants: [{ t: 'ability', components: [{ type: 'crit', chance: 0.5, mult: 4, damage: 22 }, { type: 'status', status: { kind: 'Fracture', amount: 2 } }] }] },
        { id: 'prism', name: 'Prism Array', desc: 'The beam fans wide — two MORE channels melt the crowd at once.', grants: [{ t: 'projectile', extraProjectiles: 2 }] },
      ],
    },
  ],
};

starPathRegistry.registerAll([NEEDLE, MORTAR, PARASITE, OBELISK, REACTOR, MAW, CHRYSALIS, EFFIGY, COIL, SIPHON_PATH]);

/** The fork steps of a tower's path (for the loadout UI). */
export function forksOf(tower: TowerKind): StarFork[] {
  return (starPathRegistry.get(tower)?.steps ?? []).filter(isFork);
}

/** The step a given star unlocks (for the star-screen preview), or undefined. */
export function stepAt(tower: TowerKind, star: number): StarStep | undefined {
  return starPathRegistry.get(tower)?.steps.find((s) => s.star === star);
}
