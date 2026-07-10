// Doctrines (docs/DOCTRINES.md) — exclusive run-start build commitments. You pick exactly ONE
// at the start of a run and it reshapes a rule for the whole run, expressed through the same
// declarative CardEffect[] that cards/relics use (folded once at construction). Exclusivity is
// the point: it forces divergent builds instead of "stack every multiplier". Pure data; the
// default 'none' has no effects, so a run without a doctrine (the golden run) is byte-identical.
// Doctrines self-register under the content registry like all content.
//
// THREE FAMILIES:
//   build    — bend the PLAYER's math (CardEffect only).
//   protocol — reshape the ENEMY WORLD (DoctrineWarp only) and pay run-end premiums.
//   pact     — a SACRIFICE and a PAYOFF: both sides at once (effects AND warp).
//
// PROGRESSION: each doctrine names a campaign `unlockStage` gate (0 = day one; the picker shows
// sealed cards with the gate — anticipation, not absence) and earns MASTERY RANKS from the
// account's per-doctrine ledgers (state/stats.ts doctrineRuns/Wins/BestWave): ranks add a small
// run-end reward premium via doctrineEconomy(id, rank). All pure data + pure functions here —
// the save-aware gating helper lives in save/derive.ts.

import type { CardEffect } from './cards';
import { Registry } from './registry';

/** WORLD-side warps (docs/MODE-IDENTITY.md §doctrines) — unlike `effects` (which shape the
 * PLAYER's build math), a warp reshapes the ENEMY WORLD: spawn counts, enemy stats, the
 * endless ramp, and run-end rewards. All optional; 'none' has no warp, and the warp path
 * draws zero RNG when absent — the golden run stays byte-identical. */
export interface DoctrineWarp {
  countMult?: number; // spawn-queue inflate (>1) or thin (<1) per wave — deterministic on runEventRng
  hpMult?: number; // per-spawn enemy HP
  bountyMult?: number; // per-spawn biomass bounty (<1 = economy drought — rated by hazard)
  damageMult?: number; // enemy contact damage (folded into the run's difficulty at construction)
  speedMult?: number; // enemy movement
  eliteChance?: number; // extra elite promotion chance per spawn (Experimental Mutation)
  scalingRateMult?: number; // ENDLESS ramp acceleration (Adaptive Evolution)
  rewardMult?: number; // run-end shards + loot quality (meta.finishRun)
  essencePerWave?: number; // run-end Gene Essence per wave survived (meta.finishRun)
}

export type DoctrineFamily = 'build' | 'protocol' | 'pact';

export interface DoctrineDef {
  id: string;
  name: string;
  blurb: string;
  /** Single-glyph identity for pickers/HUD chips (matches the nav `mono` convention). */
  icon: string;
  /** build = player math · protocol = enemy world · pact = both (a sacrifice and a payoff). */
  family: DoctrineFamily;
  /** Campaign stage that unseals it (0 = available from the first run). Gating helper:
   *  save/derive.ts isDoctrineUnlocked — pickers show sealed cards, runs never construct them. */
  unlockStage: number;
  effects: CardEffect[]; // folded into the run at construction (run-start)
  warp?: DoctrineWarp; // enemy-world reshaping (see above)
}

export const DOCTRINES: Record<string, DoctrineDef> = {
  none: {
    id: 'none',
    name: 'No Doctrine',
    blurb: 'Play freely — no run-start commitment.',
    icon: '—',
    family: 'build',
    unlockStage: 0,
    effects: [],
  },
  // ── BUILD DOCTRINES — bend the player's math ──
  glasscannon: {
    id: 'glasscannon',
    name: 'Glass Doctrine',
    blurb: 'Towers hit far harder, but the Nucleus is brittle.',
    icon: '◇',
    family: 'build',
    unlockStage: 0,
    effects: [
      { op: 'mul', field: 'towerDamageMult', value: 1.5 },
      { op: 'mul', field: 'integrityMult', value: 0.55 },
    ],
  },
  swarm: {
    id: 'swarm',
    name: 'Swarm Doctrine',
    blurb: 'Go wide — every tower on the board buffs the rest.',
    icon: '⁂',
    family: 'build',
    unlockStage: 2,
    effects: [
      { op: 'add', field: 'damagePerTower', value: 0.05 },
      { op: 'mul', field: 'towerFireRateMult', value: 1.08 },
    ],
  },
  minimalist: {
    id: 'minimalist',
    name: 'Ascetic Doctrine',
    blurb: 'Go tall — fewer towers, each devastating.',
    icon: '△',
    family: 'build',
    unlockStage: 3,
    effects: [{ op: 'add', field: 'damagePerEmptySlot', value: 0.06 }],
  },
  overclock: {
    id: 'overclock',
    name: 'Overclock Doctrine',
    blurb: 'Every tower fires 35% faster — but the starved economy bleeds a quarter of all Biomass.',
    icon: '⚡',
    family: 'build',
    unlockStage: 5,
    effects: [
      { op: 'mul', field: 'towerFireRateMult', value: 1.35 },
      { op: 'mul', field: 'biomassMult', value: 0.75 },
    ],
  },
  cascade: {
    id: 'cascade',
    name: 'Cascade Doctrine',
    blurb: 'Status reactions chain into one another — pair statuses to combust.',
    icon: '⧉',
    family: 'build',
    unlockStage: 6,
    effects: [
      { op: 'add', field: 'reactionRepeats', value: 1 },
      { op: 'add', field: 'fractureBonusStacks', value: 2 },
    ],
  },
  bastion: {
    id: 'bastion',
    name: 'Bastion Doctrine',
    blurb: 'The Nucleus hardens (+60% integrity, +2 regen/wave); towers trade 15% damage. Outlast everything.',
    icon: '⛨',
    family: 'build',
    unlockStage: 7,
    effects: [
      { op: 'mul', field: 'integrityMult', value: 1.6 },
      { op: 'add', field: 'integrityRegenPerWave', value: 2 },
      { op: 'mul', field: 'towerDamageMult', value: 0.85 },
    ],
  },
  resonance: {
    id: 'resonance',
    name: 'Resonance Doctrine',
    blurb: "Your hero's class amplifies same-class towers, and a varied board pays off.",
    icon: '◈',
    family: 'build',
    unlockStage: 8,
    effects: [
      { op: 'add', field: 'classResonanceBonus', value: 0.3 },
      { op: 'add', field: 'diversityBonus', value: 0.06 },
    ],
  },
  vanguard: {
    id: 'vanguard',
    name: 'Vanguard Doctrine',
    blurb: 'The hero IS the weapon: +40% hero damage, abilities recover 20% faster; towers trade 15% damage.',
    icon: '✥',
    family: 'build',
    unlockStage: 9,
    effects: [
      { op: 'mul', field: 'heroDamageMult', value: 1.4 },
      { op: 'mul', field: 'heroCooldownMult', value: 0.8 },
      { op: 'mul', field: 'towerDamageMult', value: 0.85 },
    ],
  },
  // ── PROTOCOLS — enemy-world warps: the run itself changes shape, not just your math. ──
  swarmprotocol: {
    id: 'swarmprotocol',
    name: 'Swarm Protocol',
    blurb: 'FAR more enemies (×1.8 spawns) at little more than half health (×0.55). Rewards ×1.15 — feed the splash.',
    icon: '⁙',
    family: 'protocol',
    unlockStage: 10,
    effects: [],
    warp: { countMult: 1.8, hpMult: 0.55, rewardMult: 1.15 },
  },
  titan: {
    id: 'titan',
    name: 'Titan Protocol',
    blurb: 'Barely any enemies (×0.45 spawns) — each a monster: HP ×2.6, damage ×1.3, bounty ×2.2. Single-target rules.',
    icon: '⬢',
    family: 'protocol',
    unlockStage: 12,
    effects: [],
    warp: { countMult: 0.45, hpMult: 2.6, damageMult: 1.3, bountyMult: 2.2 },
  },
  frenzy: {
    id: 'frenzy',
    name: 'Biological Frenzy',
    blurb: 'Everything moves 35% faster — and bleeds 40% more Biomass. Reaction speed becomes the build.',
    icon: '≋',
    family: 'protocol',
    unlockStage: 14,
    effects: [{ op: 'mul', field: 'biomassMult', value: 1.4 }],
    warp: { speedMult: 1.35 },
  },
  mutation: {
    id: 'mutation',
    name: 'Experimental Mutation',
    blurb: 'Every spawn has a 25% chance to arrive ELITE (random mutations). Loot rewards ×1.3.',
    icon: '⌬',
    family: 'protocol',
    unlockStage: 16,
    effects: [],
    warp: { eliteChance: 0.25, rewardMult: 1.3 },
  },
  adaptive: {
    id: 'adaptive',
    name: 'Adaptive Evolution',
    blurb: 'The swarm evolves 50% faster with depth (Infinite ramp accelerated; +15% enemy HP & damage elsewhere). Rewards ×1.35.',
    icon: '∿',
    family: 'protocol',
    unlockStage: 18,
    effects: [],
    warp: { scalingRateMult: 1.5, hpMult: 1.15, damageMult: 1.15, rewardMult: 1.35 },
  },
  famine: {
    id: 'famine',
    name: 'Famine Protocol',
    blurb: 'The swarm starves YOU: enemies bleed barely half their Biomass (×0.55). Rewards ×1.6 — efficiency is the build.',
    icon: '◌',
    family: 'protocol',
    unlockStage: 20,
    effects: [],
    warp: { bountyMult: 0.55, rewardMult: 1.6 },
  },
  corrupted: {
    id: 'corrupted',
    name: 'Corrupted Genome',
    blurb: 'Much harder everything: HP ×1.6, damage ×1.5, spawns ×1.15, speed ×1.1 — pays +3 Gene Essence per wave and rewards ×1.5.',
    icon: '☣',
    family: 'protocol',
    unlockStage: 22,
    effects: [],
    warp: { hpMult: 1.6, damageMult: 1.5, countMult: 1.15, speedMult: 1.1, essencePerWave: 3, rewardMult: 1.5 },
  },
  velocity: {
    id: 'velocity',
    name: 'Velocity Protocol',
    blurb: 'A thinner swarm (×0.8) at breakneck speed (×1.6) — pure interception. Rewards ×1.35.',
    icon: '≫',
    family: 'protocol',
    unlockStage: 25,
    effects: [],
    warp: { speedMult: 1.6, countMult: 0.8, rewardMult: 1.35 },
  },
  overmind: {
    id: 'overmind',
    name: 'Overmind Protocol',
    blurb: 'The graduate exam: HP ×1.3, 12% elites, faster scaling AND movement. Pays +2 Essence per wave, rewards ×1.45.',
    icon: '◉',
    family: 'protocol',
    unlockStage: 30,
    effects: [],
    warp: { hpMult: 1.3, eliteChance: 0.12, scalingRateMult: 1.25, speedMult: 1.1, essencePerWave: 2, rewardMult: 1.45 },
  },
  // ── PACTS — a sacrifice AND a payoff: both sides of the ledger at once. ──
  bloodpact: {
    id: 'bloodpact',
    name: 'Pact of Blood',
    blurb: 'The Nucleus gives 30% of itself; every kill bleeds half again more Biomass (×1.5). Rewards ×1.2. Wounds pay.',
    icon: '⚉',
    family: 'pact',
    unlockStage: 15,
    effects: [{ op: 'mul', field: 'integrityMult', value: 0.7 }],
    warp: { bountyMult: 1.5, rewardMult: 1.2 },
  },
  predator: {
    id: 'predator',
    name: "Predator's Wager",
    blurb: 'Towers hit 25% harder — but 18% of every wave arrives ELITE. Rewards ×1.3. Hunt the hunters.',
    icon: '⌖',
    family: 'pact',
    unlockStage: 26,
    effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.25 }],
    warp: { eliteChance: 0.18, rewardMult: 1.3 },
  },
};

export const doctrineRegistry = new Registry<DoctrineDef>('doctrine', {
  idOf: (d) => d.id,
  validate: (d) => {
    const errs: string[] = [];
    if (!d.name || d.name.trim().length === 0) errs.push('doctrine needs a name');
    if (!d.icon) errs.push(`doctrine ${d.id} needs an icon glyph`);
    if (d.unlockStage < 0) errs.push(`doctrine ${d.id} unlockStage must be ≥ 0`);
    if (d.family === 'protocol' && !d.warp) errs.push(`protocol ${d.id} must declare a warp`);
    if (d.family === 'pact' && (!d.warp || d.effects.length === 0)) errs.push(`pact ${d.id} needs BOTH effects and a warp`);
    return errs;
  },
});
doctrineRegistry.registerAll(Object.values(DOCTRINES));

export const DOCTRINE_IDS: string[] = doctrineRegistry.ids();

/** Resolve a doctrine id to its def; unknown/omitted falls back to 'none' (no effects). */
export function resolveDoctrine(id?: string): DoctrineDef {
  if (!id) return DOCTRINES.none;
  return doctrineRegistry.get(id) ?? DOCTRINES.none;
}

// ── MASTERY RANKS — commitment pays (docs/DOCTRINES.md §mastery) ──────────────────────────────
// Rank derives from the account's per-doctrine ledgers on TWO signals, whichever is further:
// campaign WINS under the doctrine, or the deepest WAVE survived with it (so Infinite-first
// players rank up too). Pure math — meta reads the ledgers and passes the numbers in.

export const DOCTRINE_RANK_NAMES = ['Unproven', 'Initiate', 'Adept', 'Zealot', 'Exemplar'] as const;
export const DOCTRINE_RANK_MAX = DOCTRINE_RANK_NAMES.length - 1;
const RANK_WINS = [1, 3, 8, 18]; // wins reaching rank 1..4
const RANK_WAVES = [12, 20, 32, 50]; // best-wave reaching rank 1..4
/** Run-end reward premium per rank (multiplicative on the doctrine's rewardMult). */
export const DOCTRINE_RANK_REWARD_STEP = 0.04;

/** 0..4 from the account's ledgers for ONE doctrine ('none' never ranks — no commitment). */
export function doctrineRank(id: string, wins: number, bestWave: number): number {
  if (id === 'none') return 0;
  let r = 0;
  for (let i = 0; i < RANK_WINS.length; i++) if (wins >= RANK_WINS[i] || bestWave >= RANK_WAVES[i]) r = i + 1;
  return r;
}

/** The rank's run-end reward multiplier (rank 0 ⇒ ×1 — identity, golden-safe). */
export function doctrineRankBonus(rank: number): number {
  return 1 + DOCTRINE_RANK_REWARD_STEP * Math.max(0, Math.min(DOCTRINE_RANK_MAX, rank));
}

/** The next rank's thresholds (for picker progress hints); null at max rank. */
export function doctrineNextRank(rank: number): { wins: number; wave: number } | null {
  if (rank >= DOCTRINE_RANK_MAX) return null;
  return { wins: RANK_WINS[rank], wave: RANK_WAVES[rank] };
}
