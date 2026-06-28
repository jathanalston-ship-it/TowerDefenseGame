import { describe, it, expect } from 'vitest';
import { Game } from './game';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

describe('pacing: anticipation read-model (always something to look forward to)', () => {
  it('a stage run surfaces the next boss and the next cache-tier upgrade', () => {
    const a = new Game(1, NO_META).getSnapshot().anticipation;
    expect(a.length).toBeGreaterThan(0);
    expect(a.some((s) => /wave 12/i.test(s))).toBe(true); // Brood Tyrant caps the run
    expect(a.some((s) => /wave 7/i.test(s))).toBe(true); // the cache tier upgrades at 7
  });

  it('an endless run anticipates the next boss depth', () => {
    const g = new Game(99, NO_META, undefined, undefined, undefined, { mode: 'endless' });
    expect(g.getSnapshot().anticipation.some((s) => /depth/i.test(s))).toBe(true);
  });

  it('a finished run has nothing left to anticipate', () => {
    const g = new Game(1, NO_META);
    g.debugWin();
    expect(g.getSnapshot().anticipation).toEqual([]);
  });
});
