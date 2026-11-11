// INFINITE WALL (config.ENDLESS_WALL — docs/ENDLESS-SCALING.md §wall): past the account's wall depth
// enemy HP compounds ×hpGrowth per depth on top of the static curve; the wall follows Campaign progress;
// it exists only in Infinite runs that pass it (the Arena / headless probes / other modes are untouched).

import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { ENDLESS_WALL, endlessWallDepth } from './config';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
type Probe = { endlessHpMult(d: number): number; endlessDamageMult(d: number): number };
const hp = (g: Game, d: number): number => (g as unknown as Probe).endlessHpMult(d);
const dmg = (g: Game, d: number): number => (g as unknown as Probe).endlessDamageMult(d);

describe('the Infinite wall', () => {
  it('follows the highest cleared Campaign stage (Stage 12 → depth 16)', () => {
    expect(endlessWallDepth(12)).toBe(ENDLESS_WALL.baseDepth + 12 * ENDLESS_WALL.perStage);
    expect(endlessWallDepth(12)).toBe(16);
    expect(endlessWallDepth(13)).toBe(endlessWallDepth(12) + ENDLESS_WALL.perStage); // each stage pushes it deeper
  });

  it('is identity up to the wall, then ×hpGrowth per depth (and damage rises) past it', () => {
    const plain = new Game(7, NO_META, undefined, 'ravager', undefined, { mode: 'endless' });
    const walled = new Game(7, NO_META, undefined, 'ravager', undefined, { mode: 'endless', endlessWall: { depth: 10 } });
    for (const d of [1, 5, 10]) expect(hp(walled, d)).toBe(hp(plain, d));
    expect(hp(walled, 12) / hp(plain, 12)).toBeCloseTo(ENDLESS_WALL.hpGrowth ** 2, 9);
    expect(hp(walled, 15) / hp(plain, 15)).toBeCloseTo(ENDLESS_WALL.hpGrowth ** 5, 9);
    expect(dmg(walled, 10)).toBe(dmg(plain, 10));
    expect(dmg(walled, 14) / dmg(plain, 14)).toBeCloseTo(1 + ENDLESS_WALL.damageGrowth * 4, 9);
  });

  it('exists only in Infinite: another mode handed the option is unchanged', () => {
    const plain = new Game(7, NO_META, undefined, 'ravager', undefined, { mode: 'bossRush' });
    const walled = new Game(7, NO_META, undefined, 'ravager', undefined, { mode: 'bossRush', endlessWall: { depth: 1 } });
    expect(hp(walled, 20)).toBe(hp(plain, 20));
  });
});
