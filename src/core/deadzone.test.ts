// Mortar deadzone (docs/TOWERS.md §deadzone): an enemy CLOSER than the tower's minRange cannot be
// targeted by it — enforced in the targeting query, so short-range towers own the last line.
import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT, TOWER_DEFS } from './config';
import type { MetaModifiers, Enemy } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 } as MetaModifiers;

/** Does the sole tower ever engage `e` (shot aimed at it, damage, or corrosion pool DoT)? The
 *  enemy is ISOLATED (wave spawns cleared) so only shots AT it — not collateral splash meant for
 *  passers-by — count. */
function engagedWithin(kind: 'mortar', ex: number, ey: number, ticks = 260): boolean {
  const game = new Game(1, NO_META);
  const g = game as unknown as { spawnQueue: unknown[]; spawnedAll: boolean };
  game.debugAddBiomass(100000);
  game.placeTower(kind, 360, 740); // center-forward
  game.startWave();
  game.debugSpawn('tank');
  const e: Enemy = game.enemies[game.enemies.length - 1];
  game.enemies = [e];
  g.spawnQueue = []; g.spawnedAll = true;
  const hp0 = e.hp;
  for (let i = 0; i < ticks; i++) {
    e.x = ex; e.y = ey; e.alive = true; e.hp = Math.min(e.hp, hp0);
    game.advance(SIM_DT);
    // Mortar-SPECIFIC engagement (the fielded hero also roams and bites — lastHitKind isolates the
    // mortar): a shot aimed at it, its Corrosion, or a mortar-credited hit.
    if (e.lastHitKind === 'mortar' || e.corrosion > 0 || game.projectiles.some((p) => p.targetId === e.id)) return true;
  }
  return false;
}

describe('mortar deadzone (minRange)', () => {
  const min = TOWER_DEFS.mortar.minRange ?? 0;

  it('mortar has a configured deadzone', () => {
    expect(min).toBeGreaterThan(0);
  });

  it('an enemy INSIDE the deadzone is not targeted', () => {
    // 60px straight up from the tower — well inside the ~100px deadzone
    expect(engagedWithin('mortar', 360, 740 - Math.round(min * 0.6))).toBe(false);
  });

  it('an enemy just OUTSIDE the deadzone is targeted', () => {
    // 60px beyond the deadzone edge, comfortably inside the 960 range
    expect(engagedWithin('mortar', 360, 740 - (min + 60))).toBe(true);
  });

  it('other towers have no deadzone (identity)', () => {
    expect(TOWER_DEFS.needle.minRange ?? 0).toBe(0);
    expect(TOWER_DEFS.parasite.minRange ?? 0).toBe(0);
    expect(TOWER_DEFS.obelisk.minRange ?? 0).toBe(0);
  });
});
