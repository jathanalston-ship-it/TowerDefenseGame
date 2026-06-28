// Tower Branching (TOWER-BRANCHES.md): the per-instance upgrade framework. Pins the
// data integrity (two valid 5-tier paths per tower), the cumulative resolver, and the
// purchase/lock economy. Golden-safety (tier 0 = identity) is covered by golden.test.

import { describe, it, expect } from 'vitest';
import { branchRegistry, branchesFor, resolveBranchKit, emptyBranchKit } from './branches';
import { Game } from './game';
import { BRANCH_COSTS, SIM_DT, TOWER_ORDER } from './config';
import { towerSlots } from './map';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

describe('branch catalog', () => {
  it('every branch validates, with TWO 5-tier paths per tower', () => {
    expect(branchRegistry.validate()).toEqual([]);
    for (const k of TOWER_ORDER) {
      const bs = branchesFor(k);
      expect(bs.length, k).toBe(2); // two contrasting paths now (framework allows more)
      for (const b of bs) expect(b.tiers.map((t) => t.tier)).toEqual([1, 2, 3, 4, 5]);
    }
  });
});

describe('resolveBranchKit', () => {
  it('tier 0 / no branch is the identity kit (golden-safe)', () => {
    expect(resolveBranchKit('needle_swarm', 0)).toEqual(emptyBranchKit());
    expect(resolveBranchKit(null, 3)).toEqual(emptyBranchKit());
  });

  it('folds tiers cumulatively (tier 3 includes tiers 1–2)', () => {
    const k1 = resolveBranchKit('needle_swarm', 1);
    const k3 = resolveBranchKit('needle_swarm', 3);
    expect(k1.projectileMutators).toContain('pierce1'); // T1
    expect(k3.projectileMutators).toContain('pierce1'); // still there at T3
    expect(k3.extraProjectiles).toBeGreaterThanOrEqual(2); // +2 from T2
    expect(k3.extraAbilities.length).toBeGreaterThan(0); // status attack from T3
    expect(k3.damageMult).toBeGreaterThan(k1.damageMult); // stat ride-along compounds
  });

  it('a later targeting grant overrides an earlier one', () => {
    expect(resolveBranchKit('needle_swarm', 1).targeting).toBe('fastest'); // T1
    expect(resolveBranchKit('needle_swarm', 5).targeting).toBe('mostCorrupted'); // T4 wins
  });

  it('carries a sensory signature (particle + sfx) from the lock tier through the capstone', () => {
    // The lock tier sets the branch's attack particle/sfx; the cumulative fold keeps it at every
    // higher tier (so a maxed tower still sprays its signature). Cosmetic only — golden-safe.
    expect(resolveBranchKit('needle_swarm', 1).particle).toBe('barb');
    expect(resolveBranchKit('needle_swarm', 1).sfx).toBe('br_swarm');
    expect(resolveBranchKit('needle_swarm', 5).particle).toBe('barb'); // still set at the capstone
    expect(resolveBranchKit('needle_rail', 2).particle).toBe('spark');
    expect(resolveBranchKit('needle_rail', 2).sfx).toBe('br_rail');
    expect(resolveBranchKit('mortar_siege', 3).particle).toBe('ember');
    expect(resolveBranchKit('mortar_cauldron', 1).particle).toBe('acid');
    expect(resolveBranchKit('reactor_heart', 1).particle).toBe('vital');
    expect(resolveBranchKit('reactor_brood', 1).particle).toBe('spore');
    expect(resolveBranchKit('parasite_apex', 1).particle).toBe('infect');
    expect(resolveBranchKit('parasite_ravager', 1).particle).toBe('gore');
    expect(resolveBranchKit('obelisk_tyrant', 1).particle).toBe('disrupt');
    expect(resolveBranchKit('obelisk_mindrender', 1).particle).toBe('spark');
  });

  it('a branched obelisk (field) cues its signature on every pulse', () => {
    const game = new Game(5, NO_META);
    game.debugAddBiomass(1_000_000);
    let id = -1;
    for (const s of towerSlots) if (game.placeTower('obelisk', s.x, s.y)) { id = game.towers[game.towers.length - 1].id; break; }
    expect(game.buyBranchTier(id, 'obelisk_tyrant')).toBe('ok');
    game.drainSfx(); // drop splice
    game.startWave();
    let sawSfx = false;
    for (let i = 0; i < 900 && !sawSfx; i++) {
      game.advance(SIM_DT);
      if (game.drainSfx().includes('br_psi')) sawSfx = true;
    }
    expect(sawSfx, 'a branched obelisk should cue its psionic signature on its field pulse').toBe(true);
  });

  it('a branched reactor (support) throbs its signature on its pulse, even on an economy-only tier', () => {
    const game = new Game(4, NO_META);
    game.debugAddBiomass(1_000_000);
    let id = -1;
    for (const s of towerSlots) if (game.placeTower('reactor', s.x, s.y)) { id = game.towers[game.towers.length - 1].id; break; }
    expect(game.buyBranchTier(id, 'reactor_heart')).toBe('ok'); // T1 Engorged Sacs = economy-only (no abilities)
    game.drainSfx(); // drop splice
    game.startWave();
    let sawSfx = false;
    for (let i = 0; i < 600 && !sawSfx; i++) { // 10s ≫ the 2s support pulse
      game.advance(SIM_DT);
      if (game.drainSfx().includes('br_vital')) sawSfx = true;
    }
    expect(sawSfx, 'an economy-only Symbiotic Heart should still beat its vital cue').toBe(true);
  });

  it('an unbranched kit has no sensory signature (identity)', () => {
    expect(resolveBranchKit('needle_swarm', 0).particle).toBeUndefined();
    expect(resolveBranchKit('needle_swarm', 0).sfx).toBeUndefined();
  });
});

describe('purchase + lock economy (Game)', () => {
  const place = (game: Game, kind: TowerKind): number => {
    game.debugAddBiomass(1_000_000);
    for (const s of towerSlots) if (game.placeTower(kind, s.x, s.y)) return game.towers[game.towers.length - 1].id;
    throw new Error('no free slot');
  };

  it('Tier 1 locks the branch, spends Biomass, climbs 1→5, and rejects switching / maxing', () => {
    const game = new Game(2, NO_META);
    const id = place(game, 'needle');
    const before = game.biomass;

    expect(game.buyBranchTier(id, 'needle_swarm')).toBe('ok');
    expect(game.biomass).toBe(before - BRANCH_COSTS.needle[0]); // Tier-1 cost spent
    const t = game.towers.find((x) => x.id === id)!;
    expect(t.branchId).toBe('needle_swarm');
    expect(t.tier).toBe(1);

    expect(game.buyBranchTier(id, 'needle_rail')).toBe('locked'); // the other path is closed off

    for (let tier = 2; tier <= 5; tier++) expect(game.buyBranchTier(id, 'needle_swarm')).toBe('ok');
    expect(t.tier).toBe(5);
    expect(game.buyBranchTier(id, 'needle_swarm')).toBe('maxed');
  });

  it('rejects a tier the player cannot afford', () => {
    const game = new Game(2, NO_META);
    const id = place(game, 'needle');
    game.debugAddBiomass(-game.biomass); // drain to 0
    expect(game.buyBranchTier(id, 'needle_swarm')).toBe('poor');
  });

  it('locking a branch cues the splice sound + a mutation burst', () => {
    const game = new Game(3, NO_META);
    const id = place(game, 'needle');
    game.drainSfx(); // clear the place cue from setup
    const partsBefore = game.particles.length;
    expect(game.buyBranchTier(id, 'needle_swarm')).toBe('ok');
    expect(game.drainSfx()).toContain('splice'); // the commitment moment
    expect(game.particles.length).toBeGreaterThan(partsBefore); // mutation burst at the tower
  });

  it('a branched needle fires SKINNED shots, sprays its particle, and cues its sfx (sensory mutation)', () => {
    const game = new Game(3, NO_META);
    const id = place(game, 'needle');
    expect(game.buyBranchTier(id, 'needle_swarm')).toBe('ok');
    game.drainSfx(); // drop the splice cue; we now want the per-shot firing cue
    game.startWave();
    let sawSkin = false;
    let sawSfx = false;
    for (let i = 0; i < 2400 && !(sawSkin && sawSfx); i++) {
      game.advance(SIM_DT);
      if (!sawSkin && game.projectiles.some((p) => p.skin === 'needle_swarm')) sawSkin = true;
      if (!sawSfx && game.drainSfx().includes('br_swarm')) sawSfx = true;
    }
    expect(sawSkin, 'a branched needle should tag its projectiles with its branch skin').toBe(true);
    expect(sawSfx, 'a branched needle should cue its firing sfx').toBe(true);
  });

  it('branchOptions offers both paths pre-lock, only the committed one after', () => {
    const game = new Game(2, NO_META);
    const id = place(game, 'mortar');
    expect(game.branchOptions(id).length).toBe(2);
    expect(game.buyBranchTier(id, 'mortar_siege')).toBe('ok');
    const after = game.branchOptions(id);
    expect(after.length).toBe(1);
    expect(after[0].branchId).toBe('mortar_siege');
    expect(after[0].locked).toBe(true);
  });
});
