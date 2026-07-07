// Resonance Coil — the beam MELTER mechanic + its progression gating. Pins the parts the golden
// test can't (the golden run never fields a coil): the beam RAMPS on a sustained lock and credits
// its damage, the Coil is meta-locked by default, and gated gene cards stay out of the default pool.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT, TOWER_ORDER } from './config';
import { towerSlots } from './map';
import { draftCards } from './cards';
import { defaultSave } from '../save/saveStore';
import { isTowerUnlocked, towerShardGateMet, unlockedCardIds } from '../state/meta';
import { Rng } from './rng';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const ALL_TOWERS = TOWER_ORDER as TowerKind[];

describe('Resonance Coil — meta lock + shard gate', () => {
  it('a fresh account does NOT own the Coil, and its shards are gated behind the campaign stage', () => {
    const save = defaultSave();
    expect(isTowerUnlocked(save, 'coil')).toBe(false); // locked by default (unlockShards)
    expect(towerShardGateMet(save, 'coil')).toBe(false); // Stage 15 not cleared ⇒ no shards drop yet
    // Clearing the gate stage opens the shard drops (but the tower is still locked until claimed).
    const cleared = { ...save, campaign: { ...save.campaign, cleared: { ...save.campaign.cleared, standard: 15 } } };
    expect(towerShardGateMet(cleared, 'coil')).toBe(true);
    expect(isTowerUnlocked(cleared, 'coil')).toBe(false);
    // A starter tower is always owned + never gated.
    expect(isTowerUnlocked(save, 'needle')).toBe(true);
    expect(towerShardGateMet(save, 'needle')).toBe(true);
  });
});

describe('Resonance Coil — beam ramp (the melter mechanic)', () => {
  // Enemies spawn at the TOP and descend; the Coil's reach is medium (340), so place it FORWARD
  // (smallest y) to hold a target in the beam. Tough hosts (tanks) stay in reach long enough to ramp.
  const forwardSlots = [...towerSlots].sort((a, b) => a.y - b.y);

  it('resonance HEAT climbs on a sustained lock and the beam credits damage to the coil', () => {
    const g = new Game(7, NO_META, undefined, 'ravager', undefined, { unlocked: ALL_TOWERS });
    g.god = true; // survive so we can observe a long channel
    g.debugAddBiomass(2000);
    let placed = false;
    for (const s of forwardSlots) if (g.placeTower('coil', s.x, s.y)) { placed = true; break; }
    expect(placed).toBe(true);
    const coil0 = g.towers.find((t) => t.kind === 'coil');
    expect(coil0?.beamTarget).toBe(-1); // idle: not channeling
    expect(coil0?.beamHeat).toBe(0);
    g.startWave();
    g.debugSpawn('tank', 8); // tough hosts the beam can hold and melt

    // Build slots sit near the base; tanks (30px/s) descend into the Coil's 340 reach over ~13s, then
    // it holds + ramps. Run long enough for the beam to bite and build real resonance.
    let maxHeat = 0;
    for (let i = 0; i < 60 * 22; i++) {
      g.advance(SIM_DT);
      for (const t of g.towers) if (t.kind === 'coil') maxHeat = Math.max(maxHeat, t.beamHeat);
    }
    expect(maxHeat).toBeGreaterThan(0.5); // the beam built real resonance on a held target
    expect(g.getMasteryAccrual().coil.damage).toBeGreaterThan(0); // the beam dealt (credited) damage
  });

  it('is fully deterministic for a fixed seed', () => {
    const run = (): number => {
      const g = new Game(42, NO_META, undefined, 'ravager', undefined, { unlocked: ALL_TOWERS });
      g.god = true;
      g.debugAddBiomass(2000);
      for (const s of forwardSlots) if (g.placeTower('coil', s.x, s.y)) break;
      g.startWave();
      g.debugSpawn('tank', 8);
      for (let i = 0; i < 60 * 20; i++) g.advance(SIM_DT);
      return Math.round(g.getMasteryAccrual().coil.damage);
    };
    expect(run()).toBe(run());
  });
});

describe('gated gene cards — draft-pool injection', () => {
  const drawIds = (unlocked?: Set<string>): Set<string> => {
    // Draw a large count with no tower filter: the pool collapses to every DRAFTABLE distinct card.
    return new Set(draftCards(new Rng(1), 200, 0, undefined, unlocked).map((c) => c.id));
  };

  it('the default pool excludes every gated card (2 Coil + 5 general)', () => {
    const ids = drawIds();
    for (const id of ['viral_bloom', 'neural_overclock', 'siege_protocol', 'overclocked_matrix', 'unstable_genome', 'harmonic_overload', 'prismatic_split']) {
      expect(ids.has(id), `default pool must exclude gated '${id}'`).toBe(false);
    }
    expect(ids.has('sharpened_needles')).toBe(true); // ungated cards are always present
  });

  it('unlocking an id injects exactly that card (and no other gated card)', () => {
    const ids = drawIds(new Set(['harmonic_overload']));
    expect(ids.has('harmonic_overload')).toBe(true); // the unlocked one is in
    expect(ids.has('prismatic_split')).toBe(false); // a still-gated one stays out
  });

  it('meta.unlockedCardIds derives the earned gated cards from the save', () => {
    const save = defaultSave();
    expect(unlockedCardIds(save)).toEqual([]); // fresh account earns none
    const deep = { ...save, campaign: { ...save.campaign, cleared: { ...save.campaign.cleared, standard: 25 } }, bestWave: 35, towerUnlocked: [...save.towerUnlocked, 'coil' as TowerKind] };
    const earned = new Set(unlockedCardIds(deep));
    expect(earned.has('viral_bloom')).toBe(true); // campaign 10
    expect(earned.has('neural_overclock')).toBe(true); // campaign 20
    expect(earned.has('siege_protocol')).toBe(true); // campaign 25
    expect(earned.has('overclocked_matrix')).toBe(true); // best wave 30
    expect(earned.has('harmonic_overload')).toBe(true); // owns the Coil
    expect(earned.has('unstable_genome')).toBe(false); // campaign 40 not reached
  });
});
