import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import { towerSlots } from './map';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const KINDS: TowerKind[] = ['needle', 'needle'];

describe('reward visuals (cosmetic, golden-safe)', () => {
  it('clearing a wave pushes a celebratory banner float (FLAWLESS / WAVE CLEARED)', () => {
    const g = new Game(1, NO_META);
    for (let i = 0; i < KINDS.length; i++) g.placeTower(KINDS[i], towerSlots[i].x, towerSlots[i].y);
    g.startWave();
    let guard = 0;
    while (g.phase === 'wave' && guard++ < 120_000) g.advance(SIM_DT);
    // The wave resolved (to draft); the flourish float was pushed on the transition tick.
    expect(g.phase).toBe('draft');
    expect(g.floats.some((f) => f.text === 'FLAWLESS' || f.text === 'WAVE CLEARED')).toBe(true);
  });
});
