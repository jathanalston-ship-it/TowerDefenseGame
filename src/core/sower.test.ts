// Blight Sower (docs/SOWER.md) — the roster's PRE-PLACED damage tower (firing 'trap'): it seeds
// armed spore mines up-lane instead of attacking; the wave walks into them. Pins the double gate
// (stage 20 + 360 shards), the plant → arm → detonate → Corrosion loop, the field cap, the
// sold-tower wither, and determinism. Golden safety rides the usual invariant: no sower is ever
// fielded on the golden path, and its run-mod knobs default neutral.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { MINES, SIM_DT, TOWER_DEFS } from './config';
import { towerSlots } from './map';
import { defaultSave } from '../save/saveStore';
import { isTowerUnlocked, towerShardGateMet } from '../state/meta';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const ALL_TOWERS = Object.keys(TOWER_DEFS) as TowerKind[];
const forwardSlots = [...towerSlots].sort((a, b) => a.y - b.y);

describe('double gate (docs/TOWERS.md §expansion)', () => {
  it('is locked by default AND its shards are stage-gated behind Campaign 20', () => {
    const fresh = defaultSave();
    expect(TOWER_DEFS.sower.unlockShards).toBeGreaterThan(0);
    expect(isTowerUnlocked(fresh, 'sower')).toBe(false);
    expect(towerShardGateMet(fresh, 'sower')).toBe(false); // stage 20 not cleared ⇒ shards can't drop
    const deep = defaultSave();
    deep.campaign.cleared.standard = TOWER_DEFS.sower.unlockStage!;
    expect(towerShardGateMet(deep, 'sower')).toBe(true); // gate cleared ⇒ the grind may begin
    expect(isTowerUnlocked(deep, 'sower')).toBe(false); // …but it still needs its 360 shards
  });
});

describe('the trap loop', () => {
  it('seeds mines up-lane on its cadence, up to its cap, and they detonate with Corrosion', () => {
    const g = new Game(7, NO_META, undefined, 'ravager', undefined, { unlocked: ALL_TOWERS });
    g.god = true;
    g.debugAddBiomass(2000);
    let placed = false;
    for (const s of forwardSlots) if (g.placeTower('sower', s.x, s.y)) { placed = true; break; }
    expect(placed).toBe(true);
    const sower = g.towers.find((t) => t.kind === 'sower')!;
    g.startWave();
    // Let it seed a full field before anything arrives (prep the garden).
    for (let i = 0; i < 60 * 14; i++) g.advance(SIM_DT);
    const planted = g.mines.filter((m) => m.towerId === sower.id);
    expect(planted.length).toBe(MINES.maxPerTower); // capped — never runaway
    for (const m of planted) {
      expect(m.y).toBeLessThan(sower.y); // seeded UP-LANE (on the approach)
      expect(m.blast).toBeGreaterThan(0);
      expect(m.damage).toBeGreaterThan(0);
    }
    // March tanks through the garden: mines trigger, damage lands, Corrosion sticks.
    g.debugSpawn('tank', 6);
    let corroded = false;
    let detonated = false;
    for (let i = 0; i < 60 * 30; i++) {
      g.advance(SIM_DT);
      if (g.mines.length < MINES.maxPerTower) detonated = true;
      for (const e of g.getRenderState().enemies) if (e.corrosion > 0) corroded = true;
      if (detonated && corroded) break;
    }
    expect(detonated).toBe(true); // the wave walked into the garden
    expect(corroded).toBe(true); // the Caustic identity landed (feeds Shred)
    expect(g.getMasteryAccrual().sower.damage).toBeGreaterThan(0); // detonations credit the Sower
  });

  it('a sold Sower withers its whole field (no orphaned mines)', () => {
    const g = new Game(3, NO_META, undefined, 'ravager', undefined, { unlocked: ALL_TOWERS });
    g.god = true;
    g.debugAddBiomass(2000);
    for (const s of forwardSlots) if (g.placeTower('sower', s.x, s.y)) break;
    const sower = g.towers.find((t) => t.kind === 'sower')!;
    g.startWave();
    for (let i = 0; i < 60 * 10; i++) g.advance(SIM_DT);
    expect(g.mines.length).toBeGreaterThan(0);
    g.sellTower(sower.id);
    expect(g.mines.length).toBe(0);
  });

  it('is fully deterministic for a fixed seed', () => {
    const run = (): string => {
      const g = new Game(42, NO_META, undefined, 'ravager', undefined, { unlocked: ALL_TOWERS });
      g.god = true;
      g.debugAddBiomass(2000);
      for (const s of forwardSlots) if (g.placeTower('sower', s.x, s.y)) break;
      g.startWave();
      g.debugSpawn('tank', 6);
      for (let i = 0; i < 60 * 25; i++) g.advance(SIM_DT);
      return `${g.mines.map((m) => `${m.x.toFixed(1)},${m.y.toFixed(1)}`).join('|')}#${Math.round(g.getMasteryAccrual().sower.damage)}`;
    };
    expect(run()).toBe(run());
  });
});
