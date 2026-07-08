// Undertow Polyp (docs/POLYP.md) — the roster's DISPLACEMENT tower (a pull-field composed
// through TowerDef.abilities): every pulse drags the caught back up-lane and tears active
// siege locks off the Hive — it denies PROGRESS, not health bars. Pins the double gate
// (stage 30 + 440 shards), the pull (an up-lane jump the same seed never produces without
// it), the broken siege, mastery attribution, and determinism. Golden safety rides the
// usual invariant: no polyp on the golden path, and polypFieldMult defaults to ×1.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT, TOWER_DEFS } from './config';
import { towerSlots, nucleusPoint } from './map';
import { defaultSave } from '../save/saveStore';
import { isTowerUnlocked, towerShardGateMet } from '../state/meta';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const ALL_TOWERS = Object.keys(TOWER_DEFS) as TowerKind[];
// The polyp guards the LAST stretch: prefer the pad nearest the Hive Core.
const rearSlots = [...towerSlots].sort(
  (a, b) =>
    Math.hypot(a.x - nucleusPoint.x, a.y - nucleusPoint.y) -
    Math.hypot(b.x - nucleusPoint.x, b.y - nucleusPoint.y),
);

describe('double gate (docs/TOWERS.md §expansion)', () => {
  it('is locked by default AND its shards are stage-gated behind Campaign 30', () => {
    const fresh = defaultSave();
    expect(TOWER_DEFS.polyp.unlockShards).toBeGreaterThan(0);
    expect(isTowerUnlocked(fresh, 'polyp')).toBe(false);
    expect(towerShardGateMet(fresh, 'polyp')).toBe(false); // stage 30 not cleared ⇒ shards can't drop
    const deep = defaultSave();
    deep.campaign.cleared.standard = TOWER_DEFS.polyp.unlockStage!;
    expect(towerShardGateMet(deep, 'polyp')).toBe(true); // gate cleared ⇒ the grind may begin
    expect(isTowerUnlocked(deep, 'polyp')).toBe(false); // …but it still needs its 440 shards
  });
});

describe('the undertow', () => {
  it('drags the caught up-lane — a backward jump the same seed never produces without it', () => {
    const sawPull = (withPolyp: boolean): boolean => {
      const g = new Game(7, NO_META, undefined, 'ravager', undefined, { unlocked: ALL_TOWERS });
      g.god = true;
      g.debugAddBiomass(2000);
      if (withPolyp) for (const s of rearSlots) if (g.placeTower('polyp', s.x, s.y)) break;
      g.startWave();
      g.debugSpawn('tank', 4);
      const prev = new Map<number, number>();
      let pulled = false;
      for (let i = 0; i < 60 * 60 && !pulled; i++) {
        g.advance(SIM_DT);
        for (const e of g.enemies) {
          const p = prev.get(e.id);
          if (p !== undefined && p - e.y > 30) pulled = true; // a one-tick up-lane YANK (pull 46 ≫ walk jitter)
          prev.set(e.id, e.y);
        }
      }
      return pulled;
    };
    expect(sawPull(true)).toBe(true); // the undertow yanks the wave backward
    expect(sawPull(false)).toBe(false); // control: no polyp ⇒ no such force exists on this seed
  });

  it('tears an ACTIVE siege lock off the Hive (the anti-progress identity)', () => {
    const g = new Game(3, NO_META, undefined, 'ravager', undefined, { unlocked: ALL_TOWERS });
    g.god = true;
    g.debugAddBiomass(2000);
    g.startWave();
    g.debugSpawn('tank', 3);
    // Let the assault reach the Hive undefended and lock on.
    let sieger = -1;
    for (let i = 0; i < 60 * 90 && sieger < 0; i++) {
      g.advance(SIM_DT);
      for (const e of g.enemies) if (e.sieging) { sieger = e.id; break; }
    }
    expect(sieger).toBeGreaterThanOrEqual(0);
    // NOW root the polyp by the core: an upcoming pulse must tear the bite loose.
    let placed = false;
    for (const s of rearSlots) if (g.placeTower('polyp', s.x, s.y)) { placed = true; break; }
    expect(placed).toBe(true);
    let freed = false;
    for (let i = 0; i < 60 * 5 && !freed; i++) {
      g.advance(SIM_DT);
      const e = g.enemies.find((x) => x.id === sieger);
      if (e && e.alive && !e.sieging) freed = true; // alive but no longer biting — dragged off
    }
    expect(freed).toBe(true);
    expect(g.getMasteryAccrual().polyp.damage).toBeGreaterThan(0); // the churn's chip credits the polyp
  });

  it('is fully deterministic for a fixed seed', () => {
    const run = (): string => {
      const g = new Game(42, NO_META, undefined, 'ravager', undefined, { unlocked: ALL_TOWERS });
      g.god = true;
      g.debugAddBiomass(2000);
      for (const s of rearSlots) if (g.placeTower('polyp', s.x, s.y)) break;
      g.startWave();
      g.debugSpawn('tank', 4);
      for (let i = 0; i < 60 * 25; i++) g.advance(SIM_DT);
      return `${g.enemies.map((e) => `${e.x.toFixed(1)},${e.y.toFixed(1)},${e.hp.toFixed(1)}`).join('|')}#${Math.round(g.getMasteryAccrual().polyp.damage)}`;
    };
    expect(run()).toBe(run());
  });
});
