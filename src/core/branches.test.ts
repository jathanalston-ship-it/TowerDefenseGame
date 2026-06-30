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

  it('every branch carries a FULL sensory signature — muzzle + sound + impact — at every tier', () => {
    // BRANCH-EVOLUTION.md §3: the lock tier sets all three channels and the cumulative fold keeps
    // each defined at every higher tier, so a branched tower always sprays matter, plays a cue, and
    // lands a flavoured impact — no tier renders/sounds generic. Cosmetic only ⇒ golden-safe.
    for (const k of TOWER_ORDER) {
      for (const b of branchesFor(k)) {
        for (let tier = 1; tier <= 5; tier++) {
          const kit = resolveBranchKit(b.id, tier);
          expect(kit.particle, `${b.id} t${tier} muzzle particle`).toBeDefined();
          expect(kit.sfx, `${b.id} t${tier} sound cue`).toBeDefined();
          expect(kit.impact, `${b.id} t${tier} impact burst`).toBeDefined();
        }
      }
    }
  });

  it('the sensory signature MATURES along a branch — not frozen at the lock tier', () => {
    // A path evolves its matter as it climbs (organic barb → venom → barb-storm; the railspike's
    // charged shot starts to detonate) so a maxed tower reads differently from a fresh splice.
    expect(resolveBranchKit('needle_swarm', 1).particle).toBe('barb');
    expect(resolveBranchKit('needle_swarm', 3).particle).toBe('venom');
    expect(resolveBranchKit('needle_swarm', 5).particle).toBe('barbstorm');
    expect(resolveBranchKit('mortar_cauldron', 1).particle).toBe('acid');
    expect(resolveBranchKit('mortar_cauldron', 5).particle).toBe('dissolve');
    expect(resolveBranchKit('parasite_apex', 5).particle).toBe('pandemic');
    expect(resolveBranchKit('reactor_heart', 5).particle).toBe('vitalcore');
    // the impact channel matures INDEPENDENTLY of the muzzle (Charged Shot detonates from T3).
    expect(resolveBranchKit('needle_rail', 1).impact).toBe('spark');
    expect(resolveBranchKit('needle_rail', 3).impact).toBe('railburst');
    // the sound cue tag is the branch identity (held across tiers; the audio layer deepens it by tier).
    expect(resolveBranchKit('needle_swarm', 1).sfx).toBe('br_swarm');
    expect(resolveBranchKit('needle_swarm', 5).sfx).toBe('br_swarm');
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

  it('an unbranched kit has no sensory signature on ANY channel (identity)', () => {
    const k0 = resolveBranchKit('needle_swarm', 0);
    expect(k0.particle).toBeUndefined();
    expect(k0.sfx).toBeUndefined();
    expect(k0.impact).toBeUndefined(); // impact is unset at tier 0 too ⇒ deep-equal the empty kit
    expect(k0).toEqual(emptyBranchKit());
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

// The inspection ENTRY POINT: a canvas click must open a placed tower's Mutation panel. The
// build tool stays armed for repeat placement, so this only works if an occupied-slot click is
// routed to inspection rather than a doomed placement (the bug: the armed tool shadowed inspect).
describe('click routing → tower inspection', () => {
  const s0 = towerSlots[0];

  it('clicking a placed tower inspects it even while a build tool is still armed', () => {
    const game = new Game(2, NO_META);
    game.debugAddBiomass(1000);
    game.selectTower('needle');
    expect(game.placeTower('needle', s0.x, s0.y)).toBe(true);
    expect(game.selectedTower).toBe('needle'); // still armed (repeat-placement default)
    game.click(s0.x, s0.y); // click the placed tower — must inspect, not misfire a placement
    expect(game.getSnapshot().selectedPlaced?.id).toBe(game.towers[0].id);
  });

  it('with a build tool armed, clicking an EMPTY slot still places (repeat placement intact)', () => {
    const game = new Game(2, NO_META);
    game.debugAddBiomass(1000);
    game.selectTower('needle');
    game.click(s0.x, s0.y); // empty slot → places
    expect(game.towers.length).toBe(1);
    expect(game.getSnapshot().selectedPlaced).toBeNull(); // placed, not inspected
  });

  it('clicking a placed tower with nothing armed inspects it', () => {
    const game = new Game(2, NO_META);
    game.debugAddBiomass(1000);
    game.placeTower('needle', s0.x, s0.y);
    game.click(s0.x, s0.y);
    expect(game.getSnapshot().selectedPlaced?.id).toBe(game.towers[0].id);
  });
});
