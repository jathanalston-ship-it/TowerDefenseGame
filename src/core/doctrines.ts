// Doctrines — exclusive run-start build commitments. You pick exactly ONE at the start of a
// run and it reshapes a rule for the whole run, expressed through the same declarative
// CardEffect[] that cards/relics use (folded once at construction). Exclusivity is the point:
// it forces divergent builds instead of "stack every multiplier". Pure data; the default
// 'none' has no effects, so a run without a doctrine (the golden run) is byte-identical.
// Doctrines self-register under the content registry like all content.

import type { CardEffect } from './cards';
import { Registry } from './registry';

/** WORLD-side warps (docs/MODE-IDENTITY.md §doctrines) — unlike `effects` (which shape the
 * PLAYER's build math), a warp reshapes the ENEMY WORLD: spawn counts, enemy stats, the
 * endless ramp, and run-end rewards. All optional; 'none' has no warp, and the warp path
 * draws zero RNG when absent — the golden run stays byte-identical. */
export interface DoctrineWarp {
  countMult?: number; // spawn-queue inflate (>1) or thin (<1) per wave — deterministic on runEventRng
  hpMult?: number; // per-spawn enemy HP
  bountyMult?: number; // per-spawn biomass bounty
  damageMult?: number; // enemy contact damage (folded into the run's difficulty at construction)
  speedMult?: number; // enemy movement
  eliteChance?: number; // extra elite promotion chance per spawn (Experimental Mutation)
  scalingRateMult?: number; // ENDLESS ramp acceleration (Adaptive Evolution)
  rewardMult?: number; // run-end shards + loot quality (meta.finishRun)
  essencePerWave?: number; // run-end Gene Essence per wave survived (meta.finishRun)
}

export interface DoctrineDef {
  id: string;
  name: string;
  blurb: string;
  effects: CardEffect[]; // folded into the run at construction (run-start)
  warp?: DoctrineWarp; // enemy-world reshaping (see above)
}

export const DOCTRINES: Record<string, DoctrineDef> = {
  none: {
    id: 'none',
    name: 'No Doctrine',
    blurb: 'Play freely — no run-start commitment.',
    effects: [],
  },
  glasscannon: {
    id: 'glasscannon',
    name: 'Glass Doctrine',
    blurb: 'Towers hit far harder, but the Nucleus is brittle.',
    effects: [
      { op: 'mul', field: 'towerDamageMult', value: 1.5 },
      { op: 'mul', field: 'integrityMult', value: 0.55 },
    ],
  },
  swarm: {
    id: 'swarm',
    name: 'Swarm Doctrine',
    blurb: 'Go wide — every tower on the board buffs the rest.',
    effects: [
      { op: 'add', field: 'damagePerTower', value: 0.05 },
      { op: 'mul', field: 'towerFireRateMult', value: 1.08 },
    ],
  },
  minimalist: {
    id: 'minimalist',
    name: 'Ascetic Doctrine',
    blurb: 'Go tall — fewer towers, each devastating.',
    effects: [{ op: 'add', field: 'damagePerEmptySlot', value: 0.06 }],
  },
  cascade: {
    id: 'cascade',
    name: 'Cascade Doctrine',
    blurb: 'Status reactions chain into one another — pair statuses to combust.',
    effects: [
      { op: 'add', field: 'reactionRepeats', value: 1 },
      { op: 'add', field: 'fractureBonusStacks', value: 2 },
    ],
  },
  resonance: {
    id: 'resonance',
    name: 'Resonance Doctrine',
    blurb: "Your hero's class amplifies same-class towers, and a varied board pays off.",
    effects: [
      { op: 'add', field: 'classResonanceBonus', value: 0.3 },
      { op: 'add', field: 'diversityBonus', value: 0.06 },
    ],
  },
  // ── PROTOCOLS — enemy-world warps: the run itself changes shape, not just your math. ──
  adaptive: {
    id: 'adaptive',
    name: 'Adaptive Evolution',
    blurb: 'The swarm evolves 50% faster with depth (Infinite ramp accelerated; +15% enemy HP & damage elsewhere). Rewards ×1.35.',
    effects: [],
    warp: { scalingRateMult: 1.5, hpMult: 1.15, damageMult: 1.15, rewardMult: 1.35 },
  },
  swarmprotocol: {
    id: 'swarmprotocol',
    name: 'Swarm Protocol',
    blurb: 'FAR more enemies (×1.8 spawns) at little more than half health (×0.55). Rewards ×1.15 — feed the splash.',
    effects: [],
    warp: { countMult: 1.8, hpMult: 0.55, rewardMult: 1.15 },
  },
  titan: {
    id: 'titan',
    name: 'Titan Protocol',
    blurb: 'Barely any enemies (×0.45 spawns) — each a monster: HP ×2.6, damage ×1.3, bounty ×2.2. Single-target rules.',
    effects: [],
    warp: { countMult: 0.45, hpMult: 2.6, damageMult: 1.3, bountyMult: 2.2 },
  },
  frenzy: {
    id: 'frenzy',
    name: 'Biological Frenzy',
    blurb: 'Everything moves 35% faster — and bleeds 40% more Biomass. Reaction speed becomes the build.',
    effects: [{ op: 'mul', field: 'biomassMult', value: 1.4 }],
    warp: { speedMult: 1.35 },
  },
  mutation: {
    id: 'mutation',
    name: 'Experimental Mutation',
    blurb: 'Every spawn has a 25% chance to arrive ELITE (random mutations). Loot rewards ×1.3.',
    effects: [],
    warp: { eliteChance: 0.25, rewardMult: 1.3 },
  },
  corrupted: {
    id: 'corrupted',
    name: 'Corrupted Genome',
    blurb: 'Much harder everything: HP ×1.6, damage ×1.5, spawns ×1.15, speed ×1.1 — pays +3 Gene Essence per wave and rewards ×1.5.',
    effects: [],
    warp: { hpMult: 1.6, damageMult: 1.5, countMult: 1.15, speedMult: 1.1, essencePerWave: 3, rewardMult: 1.5 },
  },
};

export const doctrineRegistry = new Registry<DoctrineDef>('doctrine', {
  idOf: (d) => d.id,
  validate: (d) => (d.name && d.name.trim().length > 0 ? [] : ['doctrine needs a name']),
});
doctrineRegistry.registerAll(Object.values(DOCTRINES));

export const DOCTRINE_IDS: string[] = doctrineRegistry.ids();

/** Resolve a doctrine id to its def; unknown/omitted falls back to 'none' (no effects). */
export function resolveDoctrine(id?: string): DoctrineDef {
  if (!id) return DOCTRINES.none;
  return doctrineRegistry.get(id) ?? DOCTRINES.none;
}
