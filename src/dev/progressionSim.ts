// THE PROGRESSION SIMULATOR (docs/PROGRESSION-LOOP.md §time, docs/PROGRESSION_REPORT.md).
// Plays VIRTUAL ACCOUNTS against the REAL meta layer — meta.finishRun, openContainer, the
// real spend APIs (stars/upgrades/genes/equipment/prestige) — so there is no duplicate
// economy model to drift out of sync. Only the RUN ITSELF is modeled (wave counts, kills,
// durations: the WORLD constants below); everything the run FEEDS is the production code.
//
// The virtual player follows the progression-loop engine exactly (loopState): push the
// campaign frontier when the power bar is met, otherwise farm Infinite at the predicted
// frontier — the intended macro-loop, so traces measure the loop's pacing, not a bot's quirks.
//
// Dev-only (src/dev/* is never imported by app code). Consumers: progressionSim.test.ts
// (small-matrix CI guardrails) and scripts/sim-progression.ts (hour-band report generator).

import { meta } from '../state/meta';
import type { RunResult } from '../state/meta';
import { loopState } from '../state/progressionLoop';
import { ENEMY_KINDS, HERO_ORDER, META_UPGRADES, TOWER_ORDER } from '../core/config';
import type { EnemyKind, HeroKind, MasteryCount, TowerKind } from '../core/types';
import { cardRegistry } from '../core/cards';
import { itemPowerScore } from '../state/itemPower';
import { EQUIP_SLOTS, itemDef } from '../core/equipment';
import { sumValues } from '../core/math';
import { highestCampaignStage } from '../save/derive';
import type { Persona } from './personas';

/** The WORLD MODEL — the only simulated part (the run itself). Coarse, centralized,
 *  calibratable; the report states these assumptions up front. */
export const WORLD = {
  secPerWave: 30, // average prep+combat length of one wave (1× speed)
  secMenu: 90, // between-run overhead (vault opens, spending, loadout fiddling)
  killsPerWave: 12, // average enemies destroyed per wave
  cardsPerRun: 4, // gene cards drafted per run (feeds uniqueCards → gene upgrades)
  // Campaign stage shape — mirrors core/campaign C (baseWaves 6, +1 every 4 stages, cap 14).
  campaignWaves: (stage: number): number => Math.min(14, 6 + Math.floor((stage - 1) / 4)),
  campaignRewardMult: (stage: number): number => 1 + 0.05 * (stage - 1), // mirrors C.rewardGrowth
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function emptyCount(): MasteryCount {
  return { kills: 0, damage: 0, activeTime: 0 };
}

/** Synthesize the RunResult a real run of this shape would report. */
function makeResult(opts: {
  rng: () => number;
  waves: number;
  kills: number;
  won: boolean;
  endless: boolean;
  stage?: number;
  hero: HeroKind;
}): RunResult {
  const mastery = {} as Record<TowerKind, MasteryCount>;
  for (const k of TOWER_ORDER) mastery[k] = emptyCount();
  // Kills spread over a 3-tower core build (weighted), like real play.
  const core = [...TOWER_ORDER].sort(() => opts.rng() - 0.5).slice(0, 3);
  for (let i = 0; i < core.length; i++) {
    const share = i === 0 ? 0.5 : i === 1 ? 0.3 : 0.2;
    const k = core[i];
    mastery[k] = {
      kills: Math.round(opts.kills * share),
      damage: Math.round(opts.kills * share * 25),
      activeTime: opts.waves * WORLD.secPerWave,
    };
  }
  const heroMastery = {} as Record<HeroKind, MasteryCount>;
  for (const k of HERO_ORDER) heroMastery[k] = emptyCount();
  heroMastery[opts.hero] = { kills: Math.round(opts.kills * 0.15), damage: Math.round(opts.kills * 6), activeTime: opts.waves * WORLD.secPerWave };
  const killsByEnemy = {} as Record<EnemyKind, number>;
  for (const k of ENEMY_KINDS) killsByEnemy[k] = 0;
  killsByEnemy[ENEMY_KINDS[0]] = opts.kills;
  const towerBuilds = {} as Record<TowerKind, number>;
  for (const k of TOWER_ORDER) towerBuilds[k] = core.includes(k) ? 2 : 0;
  const pool = cardRegistry.active();
  const cardIds: string[] = [];
  for (let i = 0; i < WORLD.cardsPerRun; i++) cardIds.push(pool[Math.floor(opts.rng() * pool.length)].id);
  return {
    wave: opts.waves,
    kills: opts.kills,
    won: opts.won,
    endless: opts.endless,
    campaignStage: opts.stage,
    difficulty: 'standard',
    rewardMult: opts.stage ? WORLD.campaignRewardMult(opts.stage) : undefined,
    durationSec: opts.waves * WORLD.secPerWave,
    mastery,
    heroMastery,
    stats: {
      kills: opts.kills,
      wave: opts.waves,
      won: opts.won,
      biomassEarned: opts.kills * 6,
      damageDealt: opts.kills * 30,
      killsByEnemy,
      towerBuilds,
      cardIds,
      heroId: opts.hero,
    },
  };
}

/** Greedy spend pass — the virtual player converts every farmable currency into permanent
 *  power through the REAL purchase APIs (each guards caps/funds itself). Tower and hero
 *  tracks spend SEPARATE wallets, so persona `focus` models neglect, not ordering: an
 *  off-track gets a small per-pass buy cap (banked shards convert slower — what a focused
 *  player actually does). `balanced` reproduces the historical policy exactly. */
function spendEverything(focus: Persona['focus'] = 'balanced'): void {
  const guard = (fn: () => boolean, cap = 200): void => {
    for (let i = 0; i < cap && fn(); i++) { /* buy until refused */ }
  };
  for (const e of meta.heroCollection()) if (!e.unlocked && e.canUnlock) meta.unlockHero(e.kind);
  const towerCap = focus === 'heroes' ? 4 : 20;
  const heroCap = focus === 'towers' ? 4 : 20;
  for (const k of TOWER_ORDER) guard(() => meta.buyStar(k), towerCap);
  for (const k of HERO_ORDER) guard(() => meta.buyHeroStar(k), heroCap);
  for (const u of META_UPGRADES) guard(() => meta.buyUpgrade(u.id), 40);
  guard(() => meta.buyGeneSlot(), 6);
  const owned = meta.get().stats.uniqueCards;
  for (const id of owned) guard(() => meta.upgradeGene(id), focus === 'completionist' ? 24 : 12);
  // Equip the strongest item per slot on every hero (shared best — coarse but honest), then
  // SALVAGE everything weaker — what a real player does, and it keeps the save bounded so
  // long simulations don't crawl on ever-growing inventory clones.
  const inv = meta.get().equipment.inventory;
  const keep = new Set<string>();
  for (const slot of EQUIP_SLOTS) {
    let best: { uid: string; score: number } | null = null;
    for (const it of inv) {
      const d = itemDef(it.defId);
      if (!d || d.slot !== slot) continue;
      const score = itemPowerScore(it);
      if (!best || score > best.score) best = { uid: it.uid, score };
    }
    if (best) {
      keep.add(best.uid);
      for (const h of HERO_ORDER) if (meta.isHeroUnlocked(h)) meta.equip(h, slot, best.uid);
    }
  }
  for (const it of inv) if (!keep.has(it.uid)) meta.salvageItem(it.uid);
  if (meta.molt()) {
    for (const n of meta.ascendantNodes().nodes) guard(() => meta.buyAscendantNode(n.id), 10);
  }
}

export interface SimCheckpoint {
  hours: number;
  power: number;
  stage: number; // highest campaign stage cleared
  bestWave: number;
  molts: number;
  runs: number;
  farmRuns: number; // runs spent farming Infinite (the loop's farm share)
  readiness: number; // frontier readiness at the checkpoint
  unspentShards: number; // sink-exhaustion signal (Genome Cores with nothing to buy)
  unlocks: number; // cumulative ACQUISITIONS (stars/upgrades/heroes/molts/genes/stages/feats) — the dopamine ledger
  failedPushes: number; // cumulative under-ready campaign attempts that FAILED (persona frustration)
}

/** One integer that counts every meaningful acquisition on the account — each +1 is one
 *  "dopamine moment" (a star, an upgrade level, a hero, a molt, a gene level, a stage, a
 *  feat). Band deltas measure unlock cadence; a flat signature is a dead zone. */
export function progressSignature(): number {
  const s = meta.get();
  const geneLv = Object.values(meta.geneLevels()).reduce((a, b) => a + b, 0);
  return (
    sumValues(s.towerStars) + sumValues(s.heroStars) + sumValues(s.upgrades) +
    sumValues(s.prestige.nodes) + s.heroUnlocked.length + s.prestige.molts +
    (s.geneSlots - 1) + geneLv + s.achievements.length + highestCampaignStage(s)
  );
}

export interface SimFlags {
  deadProgression: string[]; // bands where farming ran but power barely moved
  wallStall: string[]; // bands stuck at the same frontier for the whole band while farming
  powerSpike: string[]; // single-band power jumps far beyond the loop's normal texture
  sinkExhaustion: string[]; // bands where unspent currency kept compounding
}

export interface SimTrace {
  seed: number;
  checkpoints: SimCheckpoint[];
  flags: SimFlags;
}

/** Simulate one account for `hours` of play, snapshotting at each band. Drives the REAL
 *  meta singleton (reset first) — accounts are sequential, never concurrent. Omitting
 *  `persona` reproduces the historical loop-faithful policy EXACTLY (the pinned pacing
 *  envelope); a persona modulates decisions/luck/spending (docs/SIMULATION-FRAMEWORK.md). */
export function simulateAccount(seed: number, bands: number[], persona?: Persona): SimTrace {
  meta.reset();
  const rng = mulberry32(seed);
  const hero = HERO_ORDER[0];
  const totalHours = bands[bands.length - 1];
  const luck = persona?.luck ?? 1;
  const menuSec = persona?.menuSec ?? WORLD.secMenu;
  let secs = 0;
  let runs = 0;
  let farmRuns = 0;
  let failedPushes = 0;
  const checkpoints: SimCheckpoint[] = [];
  let bandIx = 0;

  while (secs < totalHours * 3600) {
    const save = meta.get();
    const ls = loopState(save);
    // Persona deviations from the intended macro-loop: farm when told to advance
    // (infinite-lovers), or push the frontier under-ready (impatient campaigners).
    let phase: 'advance' | 'farm' | 'push-early' =
      ls.phase === 'advance-campaign' ? 'advance' : 'farm';
    if (persona) {
      if (phase === 'advance' && rng() < persona.farmAnyway) phase = 'farm';
      else if (phase === 'farm' && rng() < persona.pushRisk) phase = 'push-early';
    }
    let result: RunResult;
    if (phase === 'advance') {
      const stage = ls.frontierStage;
      const waves = WORLD.campaignWaves(stage);
      const kills = Math.round(waves * WORLD.killsPerWave * (0.9 + rng() * 0.2) * luck);
      result = makeResult({ rng, waves, kills, won: true, endless: false, stage, hero });
    } else if (phase === 'push-early') {
      // Under-ready attempt: win chance tracks readiness; a loss burns most of the run's
      // time for no stage credit — the wall-frustration model for campaign-focused players.
      const stage = ls.frontierStage;
      const waves = WORLD.campaignWaves(stage);
      const won = rng() < Math.max(0.1, Math.min(0.95, ls.readiness));
      if (!won) failedPushes++;
      const played = won ? waves : Math.max(2, Math.round(waves * 0.6));
      const kills = Math.round(played * WORLD.killsPerWave * (0.9 + rng() * 0.2) * luck);
      result = makeResult({ rng, waves: played, kills, won, endless: false, stage, hero });
    } else {
      farmRuns++;
      // Farm at the predicted frontier ±12% — short runs would fail the qualify gate.
      const depth = Math.max(5, Math.round(ls.farmDepth * (0.88 + rng() * 0.24)));
      const kills = Math.round(depth * WORLD.killsPerWave * (0.9 + rng() * 0.2) * luck);
      result = makeResult({ rng, waves: depth, kills, won: false, endless: true, hero });
    }
    meta.syncRunLoot(result.wave, result.kills); // live loot banking, like a real run
    meta.finishRun(result);
    while (meta.openContainer()) { /* crack the whole stockpile */ }
    if (!persona || rng() >= persona.spendSkip) spendEverything(persona?.focus);
    runs++;
    secs += result.wave * WORLD.secPerWave + menuSec;

    while (bandIx < bands.length && secs >= bands[bandIx] * 3600) {
      const s2 = meta.get();
      const ls2 = loopState(s2);
      checkpoints.push({
        hours: bands[bandIx],
        power: Math.round(meta.power().score),
        stage: ls2.frontierStage - 1,
        bestWave: s2.bestWave,
        molts: s2.prestige.molts,
        runs,
        farmRuns,
        readiness: Number(ls2.readiness.toFixed(3)),
        unspentShards: s2.shards,
        unlocks: progressSignature(),
        failedPushes,
      });
      bandIx++;
    }
  }

  return { seed, checkpoints, flags: detectProblems(checkpoints) };
}

/** Problem detectors — the automated read of a trace (dead zones, walls, spikes, sinks). */
export function detectProblems(cps: SimCheckpoint[]): SimFlags {
  const flags: SimFlags = { deadProgression: [], wallStall: [], powerSpike: [], sinkExhaustion: [] };
  for (let i = 1; i < cps.length; i++) {
    const a = cps[i - 1];
    const b = cps[i];
    const band = `${a.hours}h→${b.hours}h`;
    const farmed = b.farmRuns > a.farmRuns;
    if (farmed && b.power < a.power * 1.01) flags.deadProgression.push(band);
    if (farmed && b.stage === a.stage && b.readiness <= a.readiness + 0.005) flags.wallStall.push(band);
    if (b.power > a.power * 8) flags.powerSpike.push(band);
    if (a.unspentShards > 5000 && b.unspentShards > a.unspentShards * 2) flags.sinkExhaustion.push(band);
  }
  return flags;
}
