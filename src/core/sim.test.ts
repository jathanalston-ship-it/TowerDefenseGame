// Headless sim verification — the deterministic core runs with no DOM/React.
// Doubles as a tiny balance smoke test (ARCHITECTURE.md §17).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT, defaultMetaModifiers, ENEMY_DEFS, WAVE_FLOW } from './config';
import { CARD_POOL } from './cards';
import { generateStage } from './stage';
import { towerSlots } from './map';
import type { TowerKind } from './types';

const NO_META = defaultMetaModifiers();

const KINDS: TowerKind[] = ['needle', 'mortar', 'reactor'];

function placeSome(game: Game, perPrep: number): void {
  let placed = 0;
  for (let i = 0; i < towerSlots.length && placed < perPrep; i++) {
    const s = towerSlots[i];
    if (game.placeTower(KINDS[i % 3], s.x, s.y)) placed++;
  }
}

interface Outcome {
  wave: number;
  kills: number;
  integrity: number;
  biomass: number;
  phase: string;
  sawShred: boolean;
}

/** Deterministic auto-player: build a few towers each prep, auto-draft, run waves. */
function autoplay(seed: number, maxSeconds = 600): Outcome {
  const game = new Game(seed, NO_META);
  let t = 0;
  let sawShred = false;
  let guard = 0;
  while (t < maxSeconds && game.phase !== 'won' && game.phase !== 'lost' && guard++ < 500000) {
    if (game.phase === 'draft') {
      const draft = game.getSnapshot().draft!;
      game.chooseCard(draft[0].id);
      continue;
    }
    if (game.phase === 'prep') {
      placeSome(game, 3);
      game.startWave();
    }
    game.advance(SIM_DT);
    t += SIM_DT;
    for (const f of game.floats) if (f.text === 'SHRED') sawShred = true;
  }
  return {
    wave: game.waveIndex,
    kills: game.kills,
    integrity: Math.round(game.integrity),
    biomass: Math.round(game.biomass),
    phase: game.phase,
    sawShred,
  };
}

describe('simulation', () => {
  it('spawns, kills, and progresses through waves', () => {
    const o = autoplay(12345);
    expect(o.kills).toBeGreaterThan(0);
    expect(o.wave).toBeGreaterThanOrEqual(3);
    expect(['won', 'lost']).toContain(o.phase);
  });

  it('triggers the Shred reaction when Fracture meets Corrosion', () => {
    expect(autoplay(777).sawShred).toBe(true);
  });

  it('is fully deterministic for a fixed seed + strategy', () => {
    expect(autoplay(2024)).toEqual(autoplay(2024));
  });

  it('stays stable (finite, terminating) with every Gene Card applied at once', () => {
    // Stacks all behavioral hooks simultaneously — bounce, spreads, cascades,
    // death-pools/bursts, cleave/double-strike — and verifies nothing NaNs or hangs.
    const game = new Game(99, NO_META);
    for (const c of CARD_POOL) game.debugApplyCard(c.id);
    let t = 0;
    let guard = 0;
    while (t < 200 && game.phase !== 'won' && game.phase !== 'lost' && guard++ < 200000) {
      if (game.phase === 'draft') {
        game.chooseCard(game.getSnapshot().draft![0].id);
        continue;
      }
      if (game.phase === 'prep') {
        placeSome(game, 4);
        game.startWave();
      }
      game.advance(SIM_DT);
      t += SIM_DT;
    }
    expect(Number.isFinite(game.integrity)).toBe(true);
    expect(Number.isFinite(game.biomass)).toBe(true);
    expect(game.waveIndex).toBeGreaterThanOrEqual(3);
  });
});

describe('game modes', () => {
  function run(config: ConstructorParameters<typeof Game>[2], maxSeconds: number, perPrep: number) {
    const game = new Game(4242, NO_META, config);
    let t = 0;
    let guard = 0;
    while (t < maxSeconds && game.phase !== 'won' && game.phase !== 'lost' && guard++ < 500000) {
      if (game.phase === 'draft') {
        game.chooseCard(game.getSnapshot().draft![0].id);
        continue;
      }
      if (game.phase === 'prep') {
        placeSome(game, perPrep);
        game.startWave();
      }
      game.advance(SIM_DT);
      t += SIM_DT;
    }
    return game;
  }

  it('plays a generated Stage to a finite, deterministic conclusion', () => {
    const stage = generateStage(4242, 3);
    const summary = () => {
      const g = run({ mode: 'stage', stage }, 600, 4);
      return { phase: g.phase, total: g.totalWaves, result: g.getResult() };
    };
    const a = summary();
    expect(['won', 'lost']).toContain(a.phase);
    expect(a.total).toBe(stage.waves.length); // finite
    expect(a.result.mode).toBe('stage');
    expect(summary()).toEqual(a); // deterministic
  });

  it('endless mode is infinite (never "won") and produces a score', () => {
    const g = run({ mode: 'endless', biome: 'wasteland' }, 90, 6);
    expect(g.totalWaves).toBe(Infinity);
    expect(g.phase).not.toBe('won'); // endless can only end in defeat
    const r = g.getResult();
    expect(r.mode).toBe('endless');
    expect(r.score).toBeGreaterThan(0);
  });

  it('a classic run is unaffected by the mode plumbing', () => {
    const g = run({ mode: 'classic' }, 600, 3);
    expect(['won', 'lost']).toContain(g.phase);
    expect(g.totalWaves).toBe(12);
  });

  it('elite spawns are buffed champions (the Wave Composer elite path)', () => {
    const g = new Game(1, NO_META);
    g.debugSpawn('runner', 1, false);
    g.debugSpawn('runner', 1, true);
    const normal = g.enemies.find((e) => !e.elite)!;
    const elite = g.enemies.find((e) => e.elite)!;
    expect(elite.maxHp).toBeGreaterThan(normal.maxHp); // buffed HP
    expect(elite.damage).toBeGreaterThan(normal.damage); // buffed damage
    expect(elite.bounty).toBeGreaterThan(normal.bounty); // richer reward
  });
});

describe('balancing tools (internal debug API)', () => {
  it('spawn-any + HP knob + enemy statistics', () => {
    const g = new Game(1, NO_META);
    g.debugHpMult = 3; // "modify health" knob
    g.debugSpawn('runner', 4);
    g.debugSpawn('warden', 1, true); // an elite
    const s = g.debugEnemyStats();
    expect(s.alive).toBe(5);
    expect(s.elites).toBe(1);
    expect(s.byKind.runner).toBe(4);
    const runner = g.enemies.find((e) => e.kind === 'runner')!;
    expect(runner.maxHp).toBe(ENEMY_DEFS.runner.hp * 3); // HP knob applied
  });

  it('debugForceWave jumps to and starts a wave', () => {
    const g = new Game(7, NO_META);
    expect(g.phase).toBe('prep');
    g.debugForceWave(4);
    expect(g.waveIndex).toBe(4);
    expect(g.phase).toBe('wave');
  });

  it('DPS readout reflects player damage only while tracking is on', () => {
    const g = new Game(3, NO_META);
    expect(g.debugDps()).toBe(0); // off by default
    g.debugTrackDps = true;
    g.debugAddBiomass(1000); // afford several damage dealers
    placeSome(g, 6);
    g.debugSpawn('runner', 20); // a sustained stream so combat stays live
    g.startWave();
    let peak = 0;
    for (let i = 0; i < 420; i++) {
      g.advance(SIM_DT); // ~7s of combat
      peak = Math.max(peak, g.debugDps()); // capture the busiest 2s window
    }
    expect(peak).toBeGreaterThan(0);
  });

  it('the debug knobs are inert at their defaults (determinism preserved)', () => {
    const g = new Game(9, NO_META);
    expect(g.debugDamageMult).toBe(1);
    expect(g.debugHpMult).toBe(1);
    expect(g.debugTrackDps).toBe(false);
    g.debugSpawn('runner', 1);
    expect(g.enemies[0].maxHp).toBe(ENEMY_DEFS.runner.hp); // no scaling at defaults
  });
});

describe('automatic wave flow', () => {
  const ticks = (g: Game, secs: number) => {
    for (let i = 0; i < Math.ceil(secs / SIM_DT); i++) g.advance(SIM_DT);
  };

  it('run start: no countdown until the first tower, then auto-starts wave 1', () => {
    const g = new Game(1, NO_META);
    expect(g.phase).toBe('prep');
    expect(g.buildCountdown).toBeLessThan(0); // unarmed
    ticks(g, 3); // waiting does nothing without a tower
    expect(g.phase).toBe('prep');
    expect(g.waveIndex).toBe(0);

    placeSome(g, 1); // place the first tower → arms the countdown
    expect(g.buildCountdown).toBeGreaterThan(0);
    ticks(g, WAVE_FLOW.buildSeconds + 0.2); // let it run out
    expect(g.phase).toBe('wave');
    expect(g.waveIndex).toBe(1); // auto-started
  });

  it('manual start begins the wave immediately + grants a biomass bonus', () => {
    const g = new Game(2, NO_META);
    placeSome(g, 1);
    const before = g.biomass;
    const seq = g.earlyBonusSeq;
    g.startWave();
    expect(g.phase).toBe('wave');
    expect(g.waveIndex).toBe(1);
    expect(g.biomass).toBe(before + WAVE_FLOW.earlyStartBonus); // bonus applied
    expect(g.earlyBonusSeq).toBe(seq + 1); // HUD-pop signal bumped
    expect(g.earlyBonus).toBe(WAVE_FLOW.earlyStartBonus);
  });

  it('between waves: the Build-Phase countdown auto-arms after the draft', () => {
    const g = new Game(3, NO_META);
    placeSome(g, 1);
    g.startWave(); // wave 1
    g.debugSkipWave();
    g.advance(SIM_DT); // checkWaveEnd → draft
    expect(g.phase).toBe('draft');
    g.chooseCard(g.getSnapshot().draft![0].id);
    expect(g.phase).toBe('prep');
    expect(g.buildCountdown).toBeGreaterThan(0); // armed immediately between waves
  });

  it('countdown duration scales with buildCountdownMult (cards/upgrades/difficulty)', () => {
    const g = new Game(4, NO_META);
    g.mods.buildCountdownMult = 0.5;
    expect(g.effectiveBuildSeconds()).toBeCloseTo(WAVE_FLOW.buildSeconds * 0.5, 5);
    placeSome(g, 1);
    expect(g.buildCountdown).toBeCloseTo(WAVE_FLOW.buildSeconds * 0.5, 1);
  });
});
