// Shared headless auto-player used by the sim + golden characterization tests.
// Not a test file itself (no *.test suffix) — just the harness both import.

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

export interface AutoOutcome {
  wave: number;
  kills: number;
  integrity: number;
  biomass: number;
  phase: string;
  sawShred: boolean;
}

/** Deterministic strategy: build 3 towers each prep, auto-draft card 0, run waves. */
export function autoplay(seed: number, maxSeconds = 600): AutoOutcome {
  const game = new Game(seed, NO_META);
  let t = 0;
  let sawShred = false;
  let guard = 0;
  while (t < maxSeconds && game.phase !== 'won' && game.phase !== 'lost' && guard++ < 500000) {
    if (game.phase === 'draft') {
      game.chooseCard(game.getSnapshot().draft![0].id);
      continue;
    }
    if (game.phase === 'prep') {
      let placed = 0;
      for (let i = 0; i < towerSlots.length && placed < 3; i++) {
        if (game.placeTower(KINDS[i % 3], towerSlots[i].x, towerSlots[i].y)) placed++;
      }
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
