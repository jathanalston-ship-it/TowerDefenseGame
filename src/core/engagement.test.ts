// Tests for the retention features: reward pacing (scaled chests) + the wave
// telegraph. Both are read-only / meta — they never affect the deterministic sim
// (the golden tests guard that), so these just lock the data behavior.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { WAVES, chestForWave } from './config';
import { generateStage } from './campaign';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

describe('chestForWave (reward pacing)', () => {
  it('awards a better chest the deeper a run gets', () => {
    expect(chestForWave(1)).toBe('standard');
    expect(chestForWave(6)).toBe('standard');
    expect(chestForWave(7)).toBe('rich');
    expect(chestForWave(11)).toBe('rich');
    expect(chestForWave(12)).toBe('prime');
  });
});

describe('getNextWavePreview (telegraph)', () => {
  it('aggregates the upcoming wave by kind during prep', () => {
    const g = new Game(1, NO_META);
    const preview = g.getNextWavePreview();
    expect(preview).not.toBeNull();
    const expectedRunners = WAVES[0].reduce((n, grp) => n + grp.count, 0);
    expect(preview).toEqual([{ kind: 'runner', count: expectedRunners }]);
  });

  it('the introduced archetypes actually appear across the wave scripts', () => {
    const kinds = new Set(WAVES.flat().map((g) => g.kind));
    for (const k of ['runner', 'brute', 'rusher', 'tank', 'flyer', 'burrower', 'tyrant']) {
      expect(kinds.has(k as never)).toBe(true);
    }
  });

  it('a generated campaign wave previews WHOLE integers (fractional budget counts never leak to the UI)', () => {
    // The campaign generator spends a float threat budget, so raw group counts are fractional — the
    // preview must still show whole enemies (the "x12.53491" bug), matching what actually spawns.
    for (const stageNo of [3, 12, 25]) {
      const stage = generateStage(stageNo, 'standard');
      const g = new Game(1, NO_META, undefined, 'ravager', undefined, { stage });
      const preview = g.getNextWavePreview();
      expect(preview).not.toBeNull();
      for (const e of preview!) {
        expect(Number.isInteger(e.count)).toBe(true);
        expect(e.count).toBeGreaterThan(0);
      }
    }
  });
});
