// Headless sim verification — the deterministic core runs with no DOM/React.
// Doubles as a tiny balance smoke test (ARCHITECTURE.md §17).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT, defaultMetaModifiers } from './config';
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
});
