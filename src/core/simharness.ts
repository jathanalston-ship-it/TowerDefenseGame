// Combat simulation framework (DEVELOPER-ONLY balancing tool). It runs whole battles with
// NO player — an autopilot places a configurable tower set, auto-drafts, and fights through
// the waves — then reports the metrics you need to balance content: tower DPS, hero DPS,
// enemy survival, economy generation, wave duration, and status-effect uptime. Sweeps over
// many seeds/configs so a new tower/enemy/difficulty can be tuned in seconds instead of by
// hand-playing.
//
// It is PURE OBSERVATION: it constructs its own Game instances and only READS public state
// (it never subscribes to events or mutates the sim), so it cannot perturb a deterministic
// run and is irrelevant to shipping gameplay — the golden tests are unaffected. No React/DOM;
// it lives in core/ but is imported only by tests + dev tooling, never by the app bundle.

import { Game } from './game';
import type { RunMode } from './game';
import { SIM_DT, TOWER_ORDER } from './config';
import { towerSlots } from './map';
import type { CardEffect } from './cards';
import type {
  HeroKind,
  MetaModifiers,
  StatusType,
  TowerKind,
  TowerProgress,
  HeroProgress,
} from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0 };

/** How the autopilot builds + drafts (the "player" the harness substitutes). */
export interface SimStrategy {
  towers: TowerKind[]; // cycled across the unlocked slots
  towersPerPrep: number; // how many to (try to) place each prep phase
  draftPick: number; // which drafted card index to take (clamped)
}

export const DEFAULT_STRATEGY: SimStrategy = {
  towers: ['needle', 'mortar', 'reactor'],
  towersPerPrep: 3,
  draftPick: 0,
};

/** Everything a simulated battle can be parameterized by (all optional but seed). */
export interface SimConfig {
  seed: number;
  mode?: RunMode; // 'stage' (default) or 'endless'
  difficulty?: string; // universal difficulty id (default 'standard')
  doctrine?: string; // exclusive run-start doctrine id (default 'none')
  maxSeconds?: number; // wall-clock sim budget (safety bound)
  maxWaves?: number; // stop after this many waves/depths (endless never self-terminates)
  strategy?: SimStrategy;
  meta?: MetaModifiers;
  towerProgress?: TowerProgress;
  heroKind?: HeroKind;
  heroProgress?: HeroProgress;
  runEffects?: CardEffect[]; // e.g. an equipment loadout's effects
}

/** Per-wave timing/throughput (one row per wave actually fought). */
export interface WaveMetric {
  wave: number;
  durationSec: number; // sim-seconds the wave phase lasted
  kills: number; // enemies killed during the wave
  biomassEarned: number; // biomass income during the wave
}

/** A full battle report — the balancing dashboard for one run. */
export interface SimReport {
  seed: number;
  mode: RunMode;
  difficulty: string;
  outcome: string; // final phase: 'won' | 'lost' | 'wave' (hit the budget)
  waves: number; // waves/depths reached
  durationSec: number; // total sim-seconds spent IN waves (excludes prep/draft idle)

  // Damage throughput (the core balancing levers).
  towerDamage: Record<TowerKind, number>; // total damage credited to each tower kind
  towerDps: Record<TowerKind, number>; // damage per TOWER-SECOND deployed (0 if unused)
  totalTowerDamage: number;
  towerDpsTeam: number; // all tower damage / total wave-seconds
  heroDamage: number;
  heroDps: number; // hero damage / hero active-seconds
  totalDamageDealt: number; // towers + hero + DoT (the sim's own tally)

  // Enemy survival.
  enemiesSpawned: number;
  enemiesKilled: number;
  enemiesLeaked: number; // reached the line (spawned − killed − still-alive)
  killRate: number; // killed / spawned
  avgEnemyLifetimeSec: number; // mean seconds an enemy stayed on the field

  // Economy.
  totalBiomassEarned: number;
  economyPerSec: number; // biomass income per wave-second

  // Status-effect uptime: affected-enemy-seconds / alive-enemy-seconds (0..1) per status.
  statusUptime: Record<StatusType, number>;

  perWave: WaveMetric[];
}

const STATUS_TYPES: StatusType[] = ['Fracture', 'Corrosion', 'Infection', 'Disruption'];

function zeroTowerRecord(): Record<TowerKind, number> {
  const r = {} as Record<TowerKind, number>;
  for (const k of TOWER_ORDER) r[k] = 0;
  return r;
}

/**
 * Run one battle headless and return its metrics. Deterministic: same config → same report
 * (the Game is deterministic and observation doesn't perturb it).
 */
export function simulateBattle(cfg: SimConfig): SimReport {
  const strategy = cfg.strategy ?? DEFAULT_STRATEGY;
  const mode: RunMode = cfg.mode ?? 'stage';
  const maxSeconds = cfg.maxSeconds ?? 600;
  const maxWaves = cfg.maxWaves ?? Infinity;
  const difficulty = cfg.difficulty ?? 'standard';

  const game = new Game(
    cfg.seed,
    cfg.meta ?? NO_META,
    cfg.towerProgress,
    cfg.heroKind,
    cfg.heroProgress,
    { mode, difficulty, doctrine: cfg.doctrine, runEffects: cfg.runEffects },
  );

  // ── Observation accumulators ──
  const perWave: WaveMetric[] = [];
  const seenIds = new Set<number>(); // every enemy id ever observed (spawn count)
  const spawnTime = new Map<number, number>(); // id → first-seen sim-time (lifetime)
  let prevAlive = new Set<number>(); // ids alive last sample (to detect resolutions)
  let lifetimeSum = 0;
  let lifetimeCount = 0;
  const statusSeconds: Record<StatusType, number> = { Fracture: 0, Corrosion: 0, Infection: 0, Disruption: 0 };
  let enemyAliveSeconds = 0;

  // Wave-phase edge tracking (durations + per-wave kills/biomass).
  let prevPhase = game.phase;
  let waveStart = 0;
  let waveStartKills = 0;
  let waveStartBiomass = 0;
  let waveStartIndex = 0;
  let totalWaveSeconds = 0;

  const stats0 = game.getRunStats();
  let lastBiomassEarned = stats0.biomassEarned;

  let t = 0;
  let guard = 0;
  while (
    t < maxSeconds &&
    game.phase !== 'won' &&
    game.phase !== 'lost' &&
    game.waveIndex <= maxWaves &&
    guard++ < 2_000_000
  ) {
    if (game.phase === 'draft') {
      const draft = game.getSnapshot().draft;
      if (draft && draft.length > 0) {
        const i = Math.max(0, Math.min(draft.length - 1, strategy.draftPick));
        game.chooseCard(draft[i].id);
      }
      continue;
    }
    if (game.phase === 'prep') {
      if (game.waveIndex >= maxWaves) break; // don't start a wave past the budget
      let placed = 0;
      for (let i = 0; i < towerSlots.length && placed < strategy.towersPerPrep; i++) {
        const kind = strategy.towers[i % strategy.towers.length];
        if (game.placeTower(kind, towerSlots[i].x, towerSlots[i].y)) placed++;
      }
      game.startWave();
    }

    game.advance(SIM_DT); // exactly one fixed step
    t += SIM_DT;

    // ── Sample the post-step state (read-only) ──
    if (game.phase === 'wave') {
      let alive = 0;
      const current = new Set<number>();
      for (const e of game.enemies) {
        if (!e.alive) continue;
        alive++;
        current.add(e.id);
        if (!spawnTime.has(e.id)) {
          spawnTime.set(e.id, game.time);
          seenIds.add(e.id);
        }
        if (e.fracture > 0) statusSeconds.Fracture += SIM_DT;
        if (e.corrosion > 0) statusSeconds.Corrosion += SIM_DT;
        if (e.infection > 0) statusSeconds.Infection += SIM_DT;
        if (e.disrupt > 0) statusSeconds.Disruption += SIM_DT;
      }
      enemyAliveSeconds += alive * SIM_DT;
      // Resolutions: ids alive last sample but gone now → record their lifetime.
      for (const id of prevAlive) {
        if (!current.has(id)) {
          lifetimeSum += game.time - (spawnTime.get(id) ?? game.time);
          lifetimeCount++;
        }
      }
      prevAlive = current;
    }

    // Wave-phase edges (transitions in/out of 'wave').
    if (prevPhase !== 'wave' && game.phase === 'wave') {
      waveStart = game.time;
      waveStartKills = game.kills;
      waveStartBiomass = game.getRunStats().biomassEarned;
      waveStartIndex = game.waveIndex;
    } else if (prevPhase === 'wave' && game.phase !== 'wave') {
      const biomassNow = game.getRunStats().biomassEarned;
      const dur = game.time - waveStart;
      totalWaveSeconds += dur;
      perWave.push({
        wave: waveStartIndex,
        durationSec: dur,
        kills: game.kills - waveStartKills,
        biomassEarned: biomassNow - waveStartBiomass,
      });
    }
    prevPhase = game.phase;
    lastBiomassEarned = game.getRunStats().biomassEarned;
  }

  // If we stopped mid-wave (hit the budget), close out the open wave + flush survivors.
  if (prevPhase === 'wave') {
    const dur = game.time - waveStart;
    totalWaveSeconds += dur;
    perWave.push({
      wave: waveStartIndex,
      durationSec: dur,
      kills: game.kills - waveStartKills,
      biomassEarned: lastBiomassEarned - waveStartBiomass,
    });
  }
  for (const id of prevAlive) {
    lifetimeSum += game.time - (spawnTime.get(id) ?? game.time);
    lifetimeCount++;
  }

  // ── Derive the report from the observed accumulators ──
  const mastery = game.getMasteryAccrual();
  const heroMastery = game.getHeroMasteryAccrual();
  const stats = game.getRunStats();

  const towerDamage = zeroTowerRecord();
  const towerDps = zeroTowerRecord();
  let totalTowerDamage = 0;
  for (const k of TOWER_ORDER) {
    const d = mastery[k].damage;
    towerDamage[k] = d;
    towerDps[k] = mastery[k].activeTime > 0 ? d / mastery[k].activeTime : 0;
    totalTowerDamage += d;
  }
  let heroDamage = 0;
  let heroActive = 0;
  for (const k of Object.keys(heroMastery) as HeroKind[]) {
    heroDamage += heroMastery[k].damage;
    heroActive += heroMastery[k].activeTime;
  }

  const enemiesSpawned = seenIds.size;
  const enemiesKilled = game.kills;
  const stillAlive = game.enemies.filter((e) => e.alive).length;
  const enemiesLeaked = Math.max(0, enemiesSpawned - enemiesKilled - stillAlive);

  const statusUptime: Record<StatusType, number> = { Fracture: 0, Corrosion: 0, Infection: 0, Disruption: 0 };
  for (const s of STATUS_TYPES) statusUptime[s] = enemyAliveSeconds > 0 ? statusSeconds[s] / enemyAliveSeconds : 0;

  return {
    seed: cfg.seed,
    mode,
    difficulty,
    outcome: game.phase,
    waves: game.waveIndex,
    durationSec: totalWaveSeconds,
    towerDamage,
    towerDps,
    totalTowerDamage,
    towerDpsTeam: totalWaveSeconds > 0 ? totalTowerDamage / totalWaveSeconds : 0,
    heroDamage,
    heroDps: heroActive > 0 ? heroDamage / heroActive : 0,
    totalDamageDealt: stats.damageDealt,
    enemiesSpawned,
    enemiesKilled,
    enemiesLeaked,
    killRate: enemiesSpawned > 0 ? enemiesKilled / enemiesSpawned : 0,
    avgEnemyLifetimeSec: lifetimeCount > 0 ? lifetimeSum / lifetimeCount : 0,
    totalBiomassEarned: stats.biomassEarned,
    economyPerSec: totalWaveSeconds > 0 ? stats.biomassEarned / totalWaveSeconds : 0,
    statusUptime,
    perWave,
  };
}

/** Aggregate metrics across a seed sweep — the balancing summary (means over runs). */
export interface SimAggregate {
  runs: number;
  winRate: number;
  avgWaves: number;
  avgDurationSec: number;
  avgKillRate: number;
  avgEnemyLifetimeSec: number;
  avgEconomyPerSec: number;
  avgTowerDpsTeam: number;
  avgHeroDps: number;
  avgTowerDps: Record<TowerKind, number>;
  avgStatusUptime: Record<StatusType, number>;
}

/** Run `simulateBattle` over many seeds with a shared base config and average the metrics.
 * This is the "rapid balancing" entry point: vary one knob, sweep, compare aggregates. */
export function sweepSeeds(seeds: number[], base: Omit<SimConfig, 'seed'> = {}): SimAggregate {
  const reports = seeds.map((seed) => simulateBattle({ ...base, seed }));
  const n = reports.length || 1;
  const sum = (f: (r: SimReport) => number): number => reports.reduce((a, r) => a + f(r), 0);

  const avgTowerDps = zeroTowerRecord();
  for (const k of TOWER_ORDER) avgTowerDps[k] = sum((r) => r.towerDps[k]) / n;
  const avgStatusUptime: Record<StatusType, number> = { Fracture: 0, Corrosion: 0, Infection: 0, Disruption: 0 };
  for (const s of STATUS_TYPES) avgStatusUptime[s] = sum((r) => r.statusUptime[s]) / n;

  return {
    runs: reports.length,
    winRate: sum((r) => (r.outcome === 'won' ? 1 : 0)) / n,
    avgWaves: sum((r) => r.waves) / n,
    avgDurationSec: sum((r) => r.durationSec) / n,
    avgKillRate: sum((r) => r.killRate) / n,
    avgEnemyLifetimeSec: sum((r) => r.avgEnemyLifetimeSec) / n,
    avgEconomyPerSec: sum((r) => r.economyPerSec) / n,
    avgTowerDpsTeam: sum((r) => r.towerDpsTeam) / n,
    avgHeroDps: sum((r) => r.heroDps) / n,
    avgTowerDps,
    avgStatusUptime,
  };
}

/** Pretty one-screen summary of a report (dev console / CI artifact). */
export function formatReport(r: SimReport): string {
  const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
  const n2 = (v: number): string => v.toFixed(1);
  const lines: string[] = [];
  lines.push(`── Sim ${r.mode}/${r.difficulty} seed ${r.seed} → ${r.outcome} @ wave ${r.waves} (${n2(r.durationSec)}s) ──`);
  lines.push(`enemies: ${r.enemiesSpawned} spawned · ${r.enemiesKilled} killed · ${r.enemiesLeaked} leaked · kill-rate ${pct(r.killRate)} · avg life ${n2(r.avgEnemyLifetimeSec)}s`);
  lines.push(`economy: ${Math.round(r.totalBiomassEarned)} biomass · ${n2(r.economyPerSec)}/s`);
  lines.push(`damage : towers ${Math.round(r.totalTowerDamage)} (${n2(r.towerDpsTeam)} dps) · hero ${Math.round(r.heroDamage)} (${n2(r.heroDps)} dps) · total ${Math.round(r.totalDamageDealt)}`);
  const dps = TOWER_ORDER.filter((k) => r.towerDamage[k] > 0).map((k) => `${k} ${n2(r.towerDps[k])}`);
  if (dps.length) lines.push(`per-tower dps/s deployed: ${dps.join(' · ')}`);
  lines.push(`status uptime: ${STATUS_TYPES.map((s) => `${s} ${pct(r.statusUptime[s])}`).join(' · ')}`);
  return lines.join('\n');
}
