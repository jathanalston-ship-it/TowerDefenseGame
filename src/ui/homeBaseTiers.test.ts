// Evolving Home Base model (HOME-BASE.md) — pins the development curve + fixture gates, since the
// visual can't be hand-seeded past the save checksum. Invariants: monotonic growth, floored/capped
// intensity, era thresholds, and truthful per-system gates (hero chambers ⇐ heroes; ascension ⇐ Molt).

import { describe, it, expect } from 'vitest';
import { labScore, labEra, labIntensity, unlockedFixtures, labState } from './homeBaseTiers';
import { defaultSave } from '../save/saveStore';
import { HERO_ORDER, TOWER_ORDER } from '../core/config';

describe('home base tiers', () => {
  it('a fresh save is the nascent era — dim (floored) intensity, no equipment', () => {
    const s = defaultSave();
    expect(labScore(s)).toBe(0);
    expect(labEra(0)).toBe(0);
    expect(labIntensity(0)).toBe(0.12);
    expect(unlockedFixtures(s)).toEqual([]);
  });

  it('score rises monotonically with progression and materializes equipment', () => {
    const s = defaultSave();
    const before = labScore(s);
    for (const k of TOWER_ORDER) s.towerStars[k] = 10;
    expect(labScore(s)).toBeGreaterThan(before);
    expect(unlockedFixtures(s)).toContain('vats');
  });

  it('hero chambers require hero stars; ascension requires a completed Molt', () => {
    const s = defaultSave();
    for (const k of TOWER_ORDER) s.towerStars[k] = 10; // high score, but no heroes / no prestige
    expect(unlockedFixtures(s)).not.toContain('herochambers');
    expect(unlockedFixtures(s)).not.toContain('ascension');
    for (const k of HERO_ORDER) s.heroStars[k] = 3;
    expect(unlockedFixtures(s)).toContain('herochambers');
    s.prestige.lifetimeCells = 2;
    expect(unlockedFixtures(s)).toContain('ascension');
  });

  it('intensity saturates at 1 and the era climbs to ascendant on a deep account', () => {
    const s = defaultSave();
    s.prestige.lifetimeCells = 100; // far past the curve → saturates
    expect(labIntensity(labScore(s))).toBe(1);
    expect(labState(s).era).toBe(3);
  });
});
