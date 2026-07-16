// ARENA AI OPPONENTS (docs/ARENA.md §ai) — procedural AI PLAYERS, not scripts. Two halves:
//
//   1. ACCOUNT GENERATION — `generateAiOpponent(seed, targetPower, divisionIndex)` builds a
//      whole plausible account: identity (name/tag), a PERSONALITY archetype (build weights +
//      tempo/aggression/greed axes), and a progression bundle (tower roster, favorite,
//      meta/tower/hero multipliers, starting genes) SCALED to the Power bracket, so
//      matchmaking fairness is structural. Seeded — no two seeds feel identical, the same
//      seed reproduces exactly (server-verifiable).
//
//   2. THE CONTROLLER — `AiController.step(game, dt)` plays a REAL Game through the SAME
//      command vocabulary a human uses (core/online.ts): places and upgrades towers by slot
//      scoring, starts waves on its own tempo, drafts gene cards by synergy, casts the hero
//      ability on threats, buys hero evolution with surplus, reacts to emergencies. It reads
//      only public sim state and emits ArenaCommands — the match layer applies + logs them,
//      so an AI match produces the SAME evidence object (command log) as a human match.
//
// Deterministic: every decision flows from the seeded rng + public game state. No DOM, no
// Math.random, no meta imports (the sim boundary stays clean).

import { Rng } from './rng';
import { HERO_ORDER, TOWER_DEFS, TOWER_ORDER } from './config';
import { HEIGHT, WIDTH, towerSlots } from './map';
import { branchesFor } from './branches';
import { STARTER_GENES } from './geneDiscovery';
import type { Game, RunOptions } from './game';
import type { CombatClass, HeroKind, MetaModifiers, TowerKind, TowerProgress, HeroProgress } from './types';
import type { ArenaCommand } from './online';

// ── Tunables ───────────────────────────────────────────────────────────────────
export const ARENA_AI = {
  /** Combat-strength curve: mult = (power / anchor)^exp, clamped. Sublinear so deep accounts
   *  don't explode; ×1 at/below the anchor so a fresh-bracket AI is a fresh account. */
  powerAnchor: 500,
  powerExp: 0.35,
  maxCombatMult: 12,
  /** Divisions at/above this may field the arena-exclusive roster (docs/ARENA.md §exclusives
   *  — deep-ladder AI showcases the seasonal crown content). */
  exclusiveMinDiv: 8,
  /** Controller think cadence bounds (seconds) — personality picks inside. */
  thinkMin: 0.35,
  thinkMax: 0.9,
  /** Biomass kept in reserve before upgrade spending (fraction of the next tower's cost). */
  upgradeReserveFrac: 1.25,
} as const;

// ── Identity ───────────────────────────────────────────────────────────────────
const AI_FORENAME = ['Vess', 'Karrow', 'Ossia', 'Dren', 'Mycel', 'Thorn', 'Halix', 'Ruin', 'Sable', 'Quill', 'Fenn', 'Ichoro', 'Brakk', 'Nyx', 'Velm', 'Corva'] as const;
const AI_EPITHET = ['the Patient', 'Broodkeeper', 'of the Deep Vats', 'Spleenripper', 'the Unmolted', 'Hivewarden', 'the Culler', 'Sporecaller', 'of the Pale Choir', 'Marrowtithe', 'the Relentless', 'Clutchmother', 'the Grafted', 'Straintamer', 'of the Last Ring', 'the Vigilant'] as const;

/** The five personality archetypes — tower-class weights + behavior axes (docs/ARENA.md §ai). */
export interface AiPersonality {
  id: 'brute' | 'economist' | 'swarmlord' | 'controller' | 'sniper';
  classWeights: Partial<Record<CombatClass, number>>;
  aggression: number; // 0..1 — forward placement, earlier ability casts
  greed: number; // 0..1 — reactor/economy priority, hero-evo spending
  tempo: number; // 0..1 — how fast waves start (1 = immediately)
}

const PERSONALITIES: readonly AiPersonality[] = [
  { id: 'brute', classWeights: { Kinetic: 4, Caustic: 2, Vital: 1 }, aggression: 0.85, greed: 0.2, tempo: 0.8 },
  { id: 'economist', classWeights: { Vital: 3, Kinetic: 2, Resonant: 1 }, aggression: 0.3, greed: 0.9, tempo: 0.35 },
  { id: 'swarmlord', classWeights: { Vital: 3, Viral: 3, Caustic: 1 }, aggression: 0.6, greed: 0.5, tempo: 0.6 },
  { id: 'controller', classWeights: { Neural: 4, Resonant: 2, Viral: 1 }, aggression: 0.4, greed: 0.4, tempo: 0.45 },
  { id: 'sniper', classWeights: { Kinetic: 3, Neural: 2, Caustic: 2 }, aggression: 0.55, greed: 0.35, tempo: 0.55 },
];

export interface AiOpponent {
  /** Identity card facts (the hello message + HUD portrait). */
  name: string;
  personality: AiPersonality;
  power: number;
  rating: number;
  heroKind: HeroKind;
  /** Everything needed to BOOT the opponent sim (the Game constructor bundle). */
  boot: {
    meta: MetaModifiers;
    towerProgress: TowerProgress;
    heroKind: HeroKind;
    heroProgress: HeroProgress;
    opts: RunOptions;
  };
  /** The controller's decision seed (distinct stream from generation). */
  controllerSeed: number;
}

/** Sublinear combat multiplier for a Power bracket (×1 at/below the anchor). */
export function aiCombatMult(power: number): number {
  if (power <= ARENA_AI.powerAnchor) return 1;
  return Math.min(ARENA_AI.maxCombatMult, Math.pow(power / ARENA_AI.powerAnchor, ARENA_AI.powerExp));
}

function neutralTowerProgress(): TowerProgress {
  const r = {} as TowerProgress;
  for (const k of TOWER_ORDER) r[k] = { damageMult: 1, fireRateMult: 1 };
  return r;
}
function neutralHeroProgress(): HeroProgress {
  const r = {} as HeroProgress;
  for (const k of HERO_ORDER) r[k] = { damageMult: 1, cooldownMult: 1 };
  return r;
}

/** Build one full AI opponent for a bracket. Deterministic per (seed, power, division). */
export function generateAiOpponent(seed: number, targetPower: number, divisionIndex: number): AiOpponent {
  const rng = new Rng((seed ^ 0xa1b0c0de) >>> 0);
  const personality = rng.pick(PERSONALITIES);
  const name = `${rng.pick(AI_FORENAME)} ${rng.pick(AI_EPITHET)}`;

  // Roster: starters always; deeper divisions carry more of the unlockable arsenal.
  // Arena exclusives only appear at the top of the ladder (and only once the content exists).
  const rosterSize = Math.min(TOWER_ORDER.length, 4 + Math.floor(divisionIndex * 0.8) + rng.int(2));
  const starters = TOWER_ORDER.filter((k) => !TOWER_DEFS[k].unlockShards);
  const unlockable = TOWER_ORDER.filter((k) => TOWER_DEFS[k].unlockShards);
  const roster = new Set<TowerKind>(starters);
  const weighted = unlockable.map((k): readonly [TowerKind, number] => {
    const w = personality.classWeights[TOWER_DEFS[k].combatClass] ?? 0.5;
    return [k, w] as const;
  });
  let guard = 0;
  while (roster.size < rosterSize && weighted.length > 0 && guard++ < 64) {
    roster.add(rng.pickWeighted(weighted));
  }
  const unlocked = [...roster];
  // Favorite: the personality's strongest owned class, seeded.
  const favorite = rng.pick(unlocked.filter((k) => (personality.classWeights[TOWER_DEFS[k].combatClass] ?? 0) > 0).concat(unlocked.slice(0, 1)));

  // Strength: metaModifiers + per-kind progression scaled to the bracket.
  const combat = aiCombatMult(targetPower);
  const meta: MetaModifiers = {
    towerDamageMult: 1 + (combat - 1) * 0.6,
    biomassMult: 1 + (combat - 1) * 0.25 * (0.6 + personality.greed * 0.8),
    heroDamageMult: 1 + (combat - 1) * 0.5,
    integrityBonus: Math.round(Math.min(60, divisionIndex * 5)),
    bonusSlots: divisionIndex >= 8 ? 3 : divisionIndex >= 5 ? 2 : divisionIndex >= 3 ? 1 : 0,
  };
  const towerProgress = neutralTowerProgress();
  for (const k of unlocked) {
    const affinity = 0.75 + (personality.classWeights[TOWER_DEFS[k].combatClass] ?? 0.5) * 0.15;
    towerProgress[k] = {
      damageMult: 1 + (combat - 1) * 0.35 * affinity,
      fireRateMult: 1 + (combat - 1) * 0.12 * affinity,
    };
  }
  // Hero: divisions field the wider roster; the ladder floor stays on the starter.
  const heroPool = divisionIndex >= 3 ? HERO_ORDER : HERO_ORDER.slice(0, 3);
  const heroKind = rng.pick(heroPool);
  const heroProgress = neutralHeroProgress();
  heroProgress[heroKind] = {
    damageMult: 1 + (combat - 1) * 0.4,
    cooldownMult: Math.max(0.6, 1 - (combat - 1) * 0.03),
  };

  // Starting genes: seeded picks from the ungated teaching set, scaled by division.
  const geneCount = Math.min(5, Math.floor(divisionIndex / 2) + (rng.chance(0.5) ? 1 : 0));
  const genePool = [...STARTER_GENES];
  const startingGenes: string[] = [];
  for (let i = 0; i < geneCount && genePool.length > 0; i++) {
    startingGenes.push(genePool.splice(rng.int(genePool.length), 1)[0]);
  }

  const rating = Math.max(0, Math.round((divisionIndex + 0.5) * 300 + rng.range(-60, 60)));
  return {
    name,
    personality,
    power: Math.round(targetPower),
    rating,
    heroKind,
    boot: {
      meta,
      towerProgress,
      heroKind,
      heroProgress,
      opts: { mode: 'endless', unlocked, favorite, startingGenes, noMega: true },
    },
    controllerSeed: (seed ^ 0x5eed0f0e) >>> 0,
  };
}

// ── The controller ─────────────────────────────────────────────────────────────
/** Plays one Game via commands. Construct per match; `step` returns the commands the AI
 *  issues this tick (the match layer applies + logs them — AI and human share one pipeline). */
export class AiController {
  private readonly rng: Rng;
  private readonly p: AiPersonality;
  private thinkIn: number;
  private readonly thinkEvery: number;
  private waveStartDelay: number;
  private prepElapsed = 0;

  constructor(seed: number, personality: AiPersonality) {
    this.rng = new Rng(seed);
    this.p = personality;
    this.thinkEvery = ARENA_AI.thinkMin + (1 - personality.tempo) * (ARENA_AI.thinkMax - ARENA_AI.thinkMin);
    this.thinkIn = this.thinkEvery;
    this.waveStartDelay = this.rollWaveDelay();
  }

  private rollWaveDelay(): number {
    // Tempo 1 ⇒ ~0.5s to launch; tempo 0 ⇒ up to ~6s of extra building time.
    return 0.5 + (1 - this.p.tempo) * (3.5 + this.rng.next() * 2.5);
  }

  /** Advance the brain by dt sim-seconds; returns the commands issued this step. */
  step(game: Game, dt: number): ArenaCommand[] {
    this.thinkIn -= dt;
    if (game.phase === 'prep') this.prepElapsed += dt;
    if (this.thinkIn > 0) return [];
    this.thinkIn = this.thinkEvery;
    const out: ArenaCommand[] = [];

    if (game.phase === 'draft') {
      const pick = this.pickDraft(game);
      if (pick) out.push({ k: 'chooseCard', cardId: pick });
      return out;
    }

    if (game.phase === 'prep') {
      this.buildPhase(game, out);
      // Launch the wave once the build satisfies the tempo (or nothing is affordable).
      if (this.prepElapsed >= this.waveStartDelay || (out.length === 0 && this.cheapestCost(game) > game.biomass)) {
        out.push({ k: 'startWave' });
        this.prepElapsed = 0;
        this.waveStartDelay = this.rollWaveDelay();
      }
      return out;
    }

    if (game.phase === 'wave') {
      this.combatPhase(game, out);
      return out;
    }
    return out;
  }

  // ── Build phase: placement + upgrades ──
  private cheapestCost(game: Game): number {
    let min = Infinity;
    for (const k of this.roster(game)) min = Math.min(min, TOWER_DEFS[k].cost);
    return min;
  }

  private roster(game: Game): TowerKind[] {
    // The sim itself gates placement to the run's unlocked roster — mirror its view.
    return TOWER_ORDER.filter((k) => game.unlockedKinds.has(k));
  }

  private buildPhase(game: Game, out: ArenaCommand[]): void {
    const occupied = new Set(game.towers.map((t) => t.slot));
    const free = towerSlots.filter((s) => !occupied.has(s.index));
    if (free.length === 0) {
      this.upgradePhase(game, out);
      return;
    }
    const kind = this.pickTowerKind(game);
    if (!kind || TOWER_DEFS[kind].cost > game.biomass) {
      this.upgradePhase(game, out);
      return;
    }
    // Slot scoring: aggression pushes toward the spawn (low y), caution hugs the Hive (high y);
    // everyone prefers the lane's heart (center x). Deterministic; small seeded jitter varies builds.
    let best = free[0];
    let bestScore = -Infinity;
    for (const s of free) {
      const cx = Math.abs(s.x - WIDTH / 2) / (WIDTH / 2); // lane-center affinity
      const fy = s.y / HEIGHT; // 0 = spawn edge … 1 = hive edge
      const forward = this.p.aggression > 0.5 ? 1 - fy : fy;
      const score = forward * 0.9 - cx * 0.6 + this.rng.next() * 0.25;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    out.push({ k: 'place', tower: kind, x: best.x, y: best.y });
    // Rich builds keep going next think; greedy ones also consider an upgrade now.
    if (game.biomass - TOWER_DEFS[kind].cost > this.cheapestCost(game) * ARENA_AI.upgradeReserveFrac) {
      this.upgradePhase(game, out);
    }
  }

  private pickTowerKind(game: Game): TowerKind | null {
    const roster = this.roster(game).filter((k) => TOWER_DEFS[k].cost <= game.biomass);
    if (roster.length === 0) return null;
    const counts = new Map<TowerKind, number>();
    for (const t of game.towers) counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);
    const weighted = roster.map((k): readonly [TowerKind, number] => {
      const classW = this.p.classWeights[TOWER_DEFS[k].combatClass] ?? 0.6;
      const variety = 1 / (1 + (counts.get(k) ?? 0)); // diminishing appetite for stacks
      const support = TOWER_DEFS[k].firing === 'support' ? 0.5 + this.p.greed * 1.5 : 1;
      return [k, Math.max(0.05, classW * variety * support)] as const;
    });
    return this.rng.pickWeighted(weighted);
  }

  private upgradePhase(game: Game, out: ArenaCommand[]): void {
    if (game.towers.length === 0) return;
    const reserve = this.cheapestCost(game) * (1 - this.p.aggression * 0.5);
    if (game.biomass <= reserve) return;
    // Branch the most-invested unbranched tower first (tier depth = the AI's power curve),
    // then deepen the lowest tier; strain-raise when flush.
    const target = [...game.towers].sort((a, b) => a.tier - b.tier || a.id - b.id)[0];
    if (!target) return;
    const branches = branchesFor(target.kind);
    if (branches.length > 0) {
      const branchId = target.branchId ?? branches[this.rng.int(branches.length)].id;
      out.push({ k: 'branch', towerId: target.id, branchId });
    }
    if (this.p.aggression + this.p.greed > 1 && this.rng.chance(0.35)) {
      out.push({ k: 'strain', towerId: target.id });
    }
    // Hero evolution: greed converts surplus into permanent in-run scaling.
    if (this.rng.chance(this.p.greed * 0.5)) {
      out.push({ k: 'heroEvo', catId: this.p.greed > 0.6 ? 'health' : 'damage' });
    }
  }

  // ── Combat phase: ability usage + threat response ──
  private combatPhase(game: Game, out: ArenaCommand[]): void {
    const snap = game.getSnapshot();
    // Cast the signature ability on real threats: an emergency breach, a boss, or a thick wave.
    const threat = snap.emergency || snap.bossBanner !== null || snap.enemiesAlive >= 10 - this.p.aggression * 5;
    if (threat && snap.hero.abilityReady && !snap.hero.down) {
      const at = this.threatFocus(game);
      if (at) out.push({ k: 'ability', x: at.x, y: at.y });
    }
    // Rally the hero onto a breach (the deepest enemy) when things get hot.
    if (snap.emergency) {
      const deepest = this.deepestEnemy(game);
      if (deepest) out.push({ k: 'rally', x: deepest.x, y: deepest.y });
    }
    // Mid-wave surplus: keep upgrading (a real player never sits on biomass).
    if (game.biomass > this.cheapestCost(game) * 3) this.upgradePhase(game, out);
  }

  /** The densest cluster of live enemies (simple deterministic centroid of the deepest five). */
  private threatFocus(game: Game): { x: number; y: number } | null {
    const live = game.enemies.filter((e) => e.alive);
    if (live.length === 0) return null;
    const deepest = [...live].sort((a, b) => b.y - a.y || a.id - b.id).slice(0, 5);
    let x = 0;
    let y = 0;
    for (const e of deepest) {
      x += e.x;
      y += e.y;
    }
    return { x: x / deepest.length, y: y / deepest.length };
  }

  private deepestEnemy(game: Game): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestY = -Infinity;
    for (const e of game.enemies) {
      if (e.alive && e.y > bestY) {
        bestY = e.y;
        best = { x: e.x, y: e.y };
      }
    }
    return best;
  }

  // ── Draft: synergy scoring over the offered cards ──
  private pickDraft(game: Game): string | null {
    const snap = game.getSnapshot();
    if (!snap.draft || snap.draft.length === 0) return null;
    const owned = new Set(game.towers.map((t) => t.kind));
    const rarityW: Record<string, number> = { common: 1, uncommon: 2, rare: 3, epic: 5, legendary: 8 };
    let best = snap.draft[0];
    let bestScore = -Infinity;
    for (const c of snap.draft) {
      let score = rarityW[c.rarity] ?? 1;
      if (c.subject.kind === 'tower' && owned.has(c.subject.tower)) score += 3;
      if (c.subject.kind === 'hero') score += this.p.aggression * 2;
      if (c.subject.kind === 'economy') score += this.p.greed * 3;
      if (c.subject.kind === 'global') score += 1.5;
      score += this.rng.next() * 0.5; // seeded taste
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best.id;
  }
}
