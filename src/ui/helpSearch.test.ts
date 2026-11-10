// Help search ranking (docs/HELP.md §search): title hits outrank body mentions.

import { describe, expect, it } from 'vitest';
import { MECHANICS } from '../state/mechanics';
import { helpMatchTier, searchMechanics } from './helpSearch';

describe('help search — best match first', () => {
  it('finds advice and locations beyond the What section', () => {
    for (const query of ['repetitive setup', 'beside speed', 'guaranteed win']) {
      expect(searchMechanics(MECHANICS, query).some((m) => m.id === 'hive-autoplay')).toBe(true);
    }
  });

  it('treats punctuation as spaces and finds words across teaching sections', () => {
    expect(searchMechanics(MECHANICS, 'run-local').map((m) => m.id)).toEqual(searchMechanics(MECHANICS, 'run local').map((m) => m.id));
    expect(searchMechanics(MECHANICS, 'repetitive countdown').some((m) => m.id === 'hive-autoplay')).toBe(true);
    expect(searchMechanics(MECHANICS, 'repetitive nonexistentword')).toEqual([]);
  });

  it('"threat" opens The Threat Ladder, not a mode that merely mentions threat', () => {
    const hits = searchMechanics(MECHANICS, 'threat');
    expect(hits[0].id).toBe('threat');
    const infinite = hits.findIndex((m) => m.id === 'infinite');
    expect(infinite, 'Infinite still matches (its body mentions threat)').toBeGreaterThan(0);
  });

  it('every hit is ranked no worse than the hit after it (title → summary → body)', () => {
    for (const q of ['gene', 'vault', 'hero', 'boss', 'core']) {
      const tiers = searchMechanics(MECHANICS, q).map((m) => helpMatchTier(m, q)!);
      expect(tiers.length, `"${q}" should match something`).toBeGreaterThan(0);
      for (let i = 1; i < tiers.length; i++) expect(tiers[i], `"${q}" rank ${i}`).toBeGreaterThanOrEqual(tiers[i - 1]);
    }
  });

  it('an empty query lists everything in registry order; a miss lists nothing', () => {
    expect(searchMechanics(MECHANICS, '  ').map((m) => m.id)).toEqual(MECHANICS.map((m) => m.id));
    expect(searchMechanics(MECHANICS, 'zzzz-no-such-mechanic')).toEqual([]);
  });
});
