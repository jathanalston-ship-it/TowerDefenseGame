import { describe, it, expect } from 'vitest';
import { composePower, effectsPower, formatPower, geomean, itemRarityPower, POWER_BASE } from './power';
import type { PowerParts } from './power';

const FRESH: PowerParts = { meta: 1, towers: 1, heroes: 1, equipment: 1, temporary: 1 };

describe('composePower', () => {
  it('a fresh account reads exactly POWER_BASE', () => {
    const p = composePower(FRESH);
    expect(p.score).toBe(POWER_BASE);
    expect(p.mult).toBeCloseTo(1, 9);
  });

  it('is strictly monotonic — raising ANY contributor raises the score', () => {
    const base = composePower(FRESH).score;
    for (const k of ['meta', 'towers', 'heroes', 'equipment', 'temporary'] as (keyof PowerParts)[]) {
      const bumped = composePower({ ...FRESH, [k]: 1.1 });
      expect(bumped.score).toBeGreaterThan(base); // the "you always know if it improved you" invariant
    }
  });

  it('is multiplicative — contributors compound', () => {
    const p = composePower({ meta: 1.2, towers: 1.1, heroes: 1.0, equipment: 1.05, temporary: 1.0 });
    expect(p.mult).toBeCloseTo(1.2 * 1.1 * 1.05, 9);
    expect(p.score).toBe(Math.round(POWER_BASE * 1.2 * 1.1 * 1.05));
  });
});

describe('effectsPower (equipment + gene-card bridge)', () => {
  it('empty effects are neutral', () => {
    expect(effectsPower([])).toBe(1);
  });

  it('offense `mul` fields count fully and compound', () => {
    expect(effectsPower([{ op: 'mul', field: 'towerDamageMult', value: 1.12 }])).toBeCloseTo(1.12, 9);
    expect(
      effectsPower([
        { op: 'mul', field: 'towerDamageMult', value: 1.12 },
        { op: 'mul', field: 'heroDamageMult', value: 1.1 },
      ]),
    ).toBeCloseTo(1.12 * 1.1, 9);
  });

  it('economy is weighted lighter than raw offense', () => {
    expect(effectsPower([{ op: 'mul', field: 'biomassMult', value: 1.18 }])).toBeCloseTo(Math.pow(1.18, 0.3), 9);
  });

  it('`add` offense fields bump; utility/instant ops are ignored', () => {
    expect(effectsPower([{ op: 'add', field: 'needleExtraProjectiles', value: 2 }])).toBeCloseTo(1.16, 9);
    expect(effectsPower([{ op: 'heroHp', value: 60 }])).toBe(1); // instant, non-offense → no Power
    expect(effectsPower([{ op: 'biomass', value: 180 }])).toBe(1);
  });
});

describe('itemRarityPower + helpers', () => {
  it('rises with rarity and affix count', () => {
    expect(itemRarityPower('common', 0)).toBeCloseTo(1.03, 9);
    expect(itemRarityPower('legendary', 0)).toBeGreaterThan(itemRarityPower('rare', 0));
    expect(itemRarityPower('rare', 3)).toBeGreaterThan(itemRarityPower('rare', 0));
  });

  it('geomean roster-averages (no single unit dominates) and guards non-positive', () => {
    expect(geomean([1, 1, 1])).toBeCloseTo(1, 9);
    expect(geomean([2, 8])).toBeCloseTo(4, 9);
    expect(geomean([])).toBe(1);
    expect(geomean([0, 1])).toBeCloseTo(1, 9); // 0 guarded to 1
  });

  it('formatPower renders a thousands-separated integer', () => {
    expect(formatPower(1284)).toBe((1284).toLocaleString());
  });
});
