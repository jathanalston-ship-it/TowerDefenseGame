// Regression: towers must never abandon the enemy in front of them. Two guarantees:
//   1. A lone enemy anywhere on the lane — including the extreme x-edges — is acquired by every
//      tower whose range covers it.
//   2. Emergency Defense Mode (docs/RANGE.md §4) prioritises the Final-Defense-Zone breach WITHIN
//      a tower's reach, but never YANKS a short-range tower off a nearer enemy it can hit toward a
//      breach it can't (the "towers refuse to target the last enemy" bug) — while an otherwise-idle
//      tower still gets the unlimited last-stand reach.
import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT, TOWER_DEFS } from './config';
import { towerSlots, FINAL_DEFENSE_TOP_Y, WIDTH } from './map';
import type { MetaModifiers, TowerKind, Enemy } from './types';

// 21 emplacements unlocked (bonusSlots) so inner columns can reach the map edges.
const META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 6 } as MetaModifiers;
const d = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);

/** Any observable sign that `tower(s)` engaged `e`: damage, a status, or a shot aimed at it. */
function engaged(game: Game, e: Enemy, hp0: number): boolean {
  if (e.hp < hp0) return true;
  if (e.infection > 0 || e.corrosion > 0 || e.disrupt > 0 || e.fracture > 0) return true;
  if (e.statuses !== undefined && e.statuses.length > 0) return true;
  return game.projectiles.some((p) => p.targetId === e.id);
}

/** Nearest UNLOCKED forward-ish slot to x (so the tower is as close to the target as possible). */
function nearestSlot(game: Game, x: number): { x: number; y: number } {
  const n = game.getRenderState().unlockedSlots;
  let best = towerSlots[0];
  let bd = Infinity;
  for (const s of towerSlots) {
    if (s.index >= n) continue;
    const dd = Math.abs(s.x - x) + (s.y - 740) * 0.01; // tie-break toward the forward row
    if (dd < bd) { bd = dd; best = s; }
  }
  return best;
}

const ATTACKERS: TowerKind[] = ['needle', 'mortar', 'parasite', 'obelisk', 'maw', 'chrysalis', 'effigy'];

describe('tower targeting — the enemy in front is never abandoned', () => {
  // (1) A lone enemy at the extreme edges + mid-field is acquired by an in-range tower of each kind.
  for (const kind of ATTACKERS) {
    it(`${kind} acquires a lone enemy at left-edge / center / right-edge`, () => {
      const def = TOWER_DEFS[kind];
      for (const ex of [8, WIDTH / 2, WIDTH - 8]) {
        const slot = nearestSlot(new Game(1, META), ex);
        // enemy placed straight up-lane from the tower, comfortably inside range
        const ey = Math.max(40, slot.y - Math.min(def.range * 0.55, 300));
        expect(d(slot.x, slot.y, ex, ey)).toBeLessThan(def.range); // sanity: in range
        const game = new Game(1, META);
        game.debugAddBiomass(100000);
        expect(game.placeTower(kind, slot.x, slot.y)).toBe(true);
        game.startWave();
        game.debugSpawn('tank');
        const e = game.enemies[game.enemies.length - 1];
        const hp0 = e.hp;
        let hit = false;
        for (let i = 0; i < 300; i++) {
          e.x = ex; e.y = ey; e.alive = true; e.hp = Math.min(e.hp, hp0);
          game.advance(SIM_DT);
          if (engaged(game, e, hp0)) { hit = true; break; }
        }
        expect(hit, `${kind} failed to acquire enemy at (${ex.toFixed(0)},${ey.toFixed(0)}) from (${slot.x},${slot.y})`).toBe(true);
      }
    });
  }

  // (2) THE BUG: a breach in the Final Defense Zone must not yank a short-range tower off a nearer
  //     enemy it can actually hit. Parasite (range 280); breach 640px away (unreachable); a second
  //     enemy 240px away (reachable). The parasite must engage the reachable one.
  it('an in-zone breach does NOT pull a short-range tower off a reachable enemy', () => {
    const game = new Game(1, META);
    const g = game as unknown as { spawnQueue: unknown[]; spawnedAll: boolean };
    game.debugAddBiomass(100000);
    const slot = nearestSlot(game, 40); // forward-left
    expect(game.placeTower('parasite', slot.x, slot.y)).toBe(true);
    const { x: tx, y: ty } = game.towers[0];
    game.startWave();
    game.debugSpawn('tank'); game.debugSpawn('tank');
    const breach = game.enemies[game.enemies.length - 2];
    const near = game.enemies[game.enemies.length - 1];
    game.enemies = [breach, near];
    g.spawnQueue = []; g.spawnedAll = true;
    const nearHp0 = near.hp;
    let nearEngaged = false;
    for (let i = 0; i < 240; i++) {
      breach.x = WIDTH - 40; breach.y = FINAL_DEFENSE_TOP_Y + 40; breach.alive = true; breach.hp = breach.maxHp; // in zone, ~640px away
      near.x = tx; near.y = ty - 240; near.alive = true; near.hp = Math.min(near.hp, nearHp0); // 240px away, in range
      expect(d(tx, ty, breach.x, breach.y)).toBeGreaterThan(TOWER_DEFS.parasite.range); // breach truly unreachable
      game.advance(SIM_DT);
      if (engaged(game, near, nearHp0)) { nearEngaged = true; break; }
    }
    expect(nearEngaged, 'parasite was yanked to the unreachable breach and ignored the enemy in range').toBe(true);
  });

  // (3) The unlimited last-stand reach is preserved: an OTHERWISE-IDLE short-range tower still
  //     extends to an in-zone breach it could not normally reach (mirrors finaldefense.test.ts).
  it('an idle short-range tower still reaches an in-zone breach (last stand preserved)', () => {
    const game = new Game(1, META);
    const g = game as unknown as { spawnQueue: unknown[]; spawnedAll: boolean };
    game.debugAddBiomass(100000);
    const slot = nearestSlot(game, 40);
    expect(game.placeTower('parasite', slot.x, slot.y)).toBe(true);
    const { x: tx, y: ty } = game.towers[0];
    game.startWave();
    game.debugSpawn('tank');
    const breach = game.enemies[game.enemies.length - 1];
    game.enemies = [breach];
    g.spawnQueue = []; g.spawnedAll = true;
    let reached = false;
    for (let i = 0; i < 300; i++) {
      breach.x = WIDTH - 40; breach.y = FINAL_DEFENSE_TOP_Y + 40; breach.alive = true; breach.hp = breach.maxHp;
      expect(d(tx, ty, breach.x, breach.y)).toBeGreaterThan(TOWER_DEFS.parasite.range); // out of normal range
      game.advance(SIM_DT);
      if (breach.infection > 0 || game.projectiles.some((p) => p.targetId === breach.id)) { reached = true; break; }
    }
    expect(reached, 'idle tower failed to reach the in-zone breach — last-stand reach lost').toBe(true);
  });
});
