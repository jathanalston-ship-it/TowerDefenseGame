// Headless sim verification — the deterministic core runs with no DOM/React.
// Doubles as a tiny balance smoke test (ARCHITECTURE.md §17).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import { towerSlots } from './map';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = {
  towerDamageMult: 1,
  biomassMult: 1,
  heroDamageMult: 1,
  integrityBonus: 0,
};

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
});
