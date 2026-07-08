// Synapse Spire (docs/SPIRE.md) — the roster's chain-arc tower and the FIRST kit composed purely
// through TowerDef.abilities (no bespoke firing code): each cast is one ChainAbility that leaps
// victim to victim on a diminishing arc. Pins the double gate (stage 25 + 400 shards), the
// multi-victim arc (the FIRST damage tick already exceeds any single-victim payout), mastery
// attribution, and determinism. Golden safety rides the usual invariant: no spire is ever
// fielded on the golden path, and its run-mod knob (spireChainJumps) defaults to +0.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT, TOWER_DEFS } from './config';
import { towerSlots } from './map';
import { defaultSave } from '../save/saveStore';
import { isTowerUnlocked, towerShardGateMet } from '../state/meta';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const ALL_TOWERS = Object.keys(TOWER_DEFS) as TowerKind[];
const forwardSlots = [...towerSlots].sort((a, b) => a.y - b.y);

describe('double gate (docs/TOWERS.md §expansion)', () => {
  it('is locked by default AND its shards are stage-gated behind Campaign 25', () => {
    const fresh = defaultSave();
    expect(TOWER_DEFS.spire.unlockShards).toBeGreaterThan(0);
    expect(isTowerUnlocked(fresh, 'spire')).toBe(false);
    expect(towerShardGateMet(fresh, 'spire')).toBe(false); // stage 25 not cleared ⇒ shards can't drop
    const deep = defaultSave();
    deep.campaign.cleared.standard = TOWER_DEFS.spire.unlockStage!;
    expect(towerShardGateMet(deep, 'spire')).toBe(true); // gate cleared ⇒ the grind may begin
    expect(isTowerUnlocked(deep, 'spire')).toBe(false); // …but it still needs its 400 shards
  });
});

describe('the synaptic arc', () => {
  it('one cast leaps victim to victim — the first damage tick exceeds any single-victim hit', () => {
    const g = new Game(7, NO_META, undefined, 'ravager', undefined, { unlocked: ALL_TOWERS });
    g.god = true;
    g.debugAddBiomass(2000);
    let placed = false;
    for (const s of forwardSlots) if (g.placeTower('spire', s.x, s.y)) { placed = true; break; }
    expect(placed).toBe(true);
    g.startWave();
    g.debugSpawn('tank', 6);
    // March the pack into acquisition range and catch the very FIRST tick the spire's mastery
    // credit moves. Every hop of one cast lands on that same tick, and falloff (0.75) only
    // shrinks LATER hops — so a single connected victim can credit at most `damage`, while
    // two already pay 1.75×. A first tick beyond 1.6× proves the arc chained bodies.
    let first = 0;
    for (let i = 0; i < 60 * 60 && first === 0; i++) {
      g.advance(SIM_DT);
      first = g.getMasteryAccrual().spire.damage;
    }
    expect(first).toBeGreaterThan(TOWER_DEFS.spire.damage * 1.6); // ≥ 2 victims in ONE cast
  });

  it('is fully deterministic for a fixed seed', () => {
    const run = (): string => {
      const g = new Game(42, NO_META, undefined, 'ravager', undefined, { unlocked: ALL_TOWERS });
      g.god = true;
      g.debugAddBiomass(2000);
      for (const s of forwardSlots) if (g.placeTower('spire', s.x, s.y)) break;
      g.startWave();
      g.debugSpawn('tank', 6);
      for (let i = 0; i < 60 * 30; i++) g.advance(SIM_DT);
      return `${g.enemies.map((e) => `${e.x.toFixed(1)},${e.y.toFixed(1)},${e.hp.toFixed(1)}`).join('|')}#${Math.round(g.getMasteryAccrual().spire.damage)}`;
    };
    expect(run()).toBe(run());
  });
});
