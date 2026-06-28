// Flesh Reactor overcharge is a true SUPPORT RADIUS (docs/RANGE.md §8), not lattice
// adjacency: a tower whose centre lies within the reactor's effective range is overcharged.
// At base 90px that catches orthogonal lattice neighbours (80px) and excludes diagonals
// (~113px); the "+support radius" mastery (Mycelial Network) widens the reach to the diagonals.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { towerSlots } from './map';
import { towerProgress } from '../state/meta';
import { defaultSave } from '../save/saveStore';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

const slot = (col: number, row: number) => towerSlots.find((s) => s.col === col && s.row === row)!;
const reactorAt = slot(5, 20); // forward-left (an initially-unlocked centre column)
const ortho = slot(7, 20); // same row, next column → 80px away
const diag = slot(7, 22); // one row down + one column over → ~113px away

/** Build a board (reactor + a tower at `ortho` + a tower at `diag`) and report overcharge. */
function overcharge(prog?: ReturnType<typeof towerProgress>): { ortho: boolean; diag: boolean } {
  const game = new Game(7, NO_META, prog);
  game.debugAddBiomass(10000);
  game.placeTower('reactor', reactorAt.x, reactorAt.y);
  game.placeTower('needle', ortho.x, ortho.y);
  game.placeTower('needle', diag.x, diag.y);
  const oc = (s: typeof ortho) => game.towers.find((t) => t.slot === s.index)!.overcharged;
  return { ortho: oc(ortho), diag: oc(diag) };
}

describe('Flesh Reactor support radius', () => {
  it('overcharges towers within its base radius (orthogonal), not beyond (diagonal)', () => {
    const r = overcharge();
    expect(r.ortho).toBe(true); // 80px ≤ 90
    expect(r.diag).toBe(false); // ~113px > 90
  });

  it('the "+support radius" mastery widens the reach to farther towers', () => {
    const vet = towerProgress({ ...defaultSave(), towerMasteryXp: { ...defaultSave().towerMasteryXp, reactor: 1e9 } });
    expect(vet.reactor.rangeMult).toBeGreaterThan(1); // Mycelial Network folded in
    const r = overcharge(vet);
    expect(r.ortho).toBe(true);
    expect(r.diag).toBe(true); // ~113px now within the widened radius (90 × 1.3 = 117)
  });
});
