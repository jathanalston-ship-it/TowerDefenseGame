// Reactions IN-SIM for the two newest classes (Vital · Resonant). The data-level matrix is pinned
// in reactions.test.ts; this proves the WIRING: the Marrow Siphon actually applies Mark and the
// Resonance Coil actually applies Resonance during a live wave, and each combusts with a co-present
// status (a needle's Fracture, simulated by pinning + pre-fracturing the target). Golden-safety is
// covered by golden.test.ts — neither beam tower is ever fielded by autoplay, so the pinned sim is
// byte-identical; these reactions only exist once the gated Siphon/Coil are placed.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import { towerSlots } from './map';
import type { MetaModifiers, Tower, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

function field(game: Game, kind: TowerKind): Tower {
  game.debugAddBiomass(1_000_000);
  for (const s of towerSlots) if (game.placeTower(kind, s.x, s.y)) break;
  const t = game.towers.find((x) => x.kind === kind);
  if (!t) throw new Error(`could not place ${kind}`);
  return t;
}

// Drive a beam tower onto a pinned, pre-fractured pack and report which reaction floats appeared.
function reactionsSeen(seed: number, kind: TowerKind): Set<string> {
  const game = new Game(seed, NO_META);
  const t = field(game, kind);
  game.startWave();
  game.debugSpawn('colossus', 3); // heavy HP — survives long enough to be marked/resonated AND fractured
  const seen = new Set<string>();
  for (let i = 0; i < 600 && game.phase === 'wave'; i++) {
    // Pin the pack inside the beam's reach and keep a Fracture stack on it (as a Needle Spitter would),
    // so the beam's own status (Mark / Resonance) has a partner to combust with.
    for (const e of game.enemies) { e.x = t.x; e.y = t.y - 60; if (e.fracture < 3) e.fracture = 5; }
    game.advance(SIM_DT);
    for (const f of game.floats) seen.add(f.text);
  }
  return seen;
}

describe('Vital (Mark) reactions fire in-sim — the Marrow Siphon', () => {
  it('applies Mark on its drain and HARVESTs it against a co-present Fracture', () => {
    const seen = reactionsSeen(3, 'siphon');
    expect(seen.has('HARVEST')).toBe(true); // Mark + Fracture combusted during the wave
  });
});

describe('Resonant (Resonance) reactions fire in-sim — the Resonance Coil', () => {
  it('applies Resonance on its beam and SHEARs it against a co-present Fracture', () => {
    const seen = reactionsSeen(4, 'coil');
    expect(seen.has('SHEAR')).toBe(true); // Resonance + Fracture combusted during the wave
  });
});

describe('control — a run with no beam tower never produces Mark or Resonance', () => {
  it('a needle-only board leaves every enemy at mark=0, resonance=0 (golden-safe status space)', () => {
    const game = new Game(3, NO_META);
    field(game, 'needle');
    game.startWave();
    game.debugSpawn('brute', 4);
    for (let i = 0; i < 200 && game.phase === 'wave'; i++) game.advance(SIM_DT);
    expect(game.enemies.every((e) => e.mark === 0 && e.resonance === 0)).toBe(true);
  });
});
