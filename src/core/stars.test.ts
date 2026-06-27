import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { resolveStarKit, starPathRegistry, forksOf, stepAt, isFork } from './stars';
import { SIM_DT, TOWER_ORDER } from './config';
import { DEFENSE_TOP_Y, towerSlots } from './map';
import type { MetaModifiers, TowerKind, TowerProgress } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0 };

function neutralProgress(): TowerProgress {
  const r = {} as TowerProgress;
  for (const k of TOWER_ORDER) r[k] = { damageMult: 1, fireRateMult: 1 };
  return r;
}

describe('resolveStarKit', () => {
  it('is an empty (identity) kit at 0 stars', () => {
    const kit = resolveStarKit('needle', 0);
    expect(kit).toEqual({ extraProjectiles: 0, splashMult: 1, projectileMutators: [], extraAbilities: [], reactorBiomassMult: 1, reactorOverchargeBonus: 0, cosmetics: [] });
  });

  it('folds unlocked nodes up to the owned star count', () => {
    const kit = resolveStarKit('needle', 2); // ★1 targeting + ★2 extra projectile
    expect(kit.targeting).toBe('fastest');
    expect(kit.extraProjectiles).toBe(1);
  });

  it('does not apply nodes beyond the owned star count', () => {
    const k1 = resolveStarKit('needle', 1);
    expect(k1.extraProjectiles).toBe(0); // ★2 not yet owned
  });

  it('defaults a fork to its first option when unpicked', () => {
    const kit = resolveStarKit('needle', 3); // ★3 fork defaults to "saturation" (+1 projectile)
    expect(kit.extraProjectiles).toBe(2); // ★2 (+1) + saturation (+1)
  });

  it('honors a per-run fork pick', () => {
    const kit = resolveStarKit('needle', 3, { '3': 'skirmisher' });
    expect(kit.targeting).toBe('lowestHealth'); // skirmisher overrides targeting
    expect(kit.extraProjectiles).toBe(1); // only ★2's, not saturation's
    expect(kit.extraAbilities.some((a) => a.type === 'chain')).toBe(true);
  });

  it('grants new attacks (components) at higher stars', () => {
    const kit = resolveStarKit('obelisk', 4); // ★2 aura + ★3 fork + ★4 explosion
    expect(kit.extraAbilities.length).toBeGreaterThanOrEqual(2);
    expect(kit.extraAbilities.some((a) => a.type === 'explosion')).toBe(true);
  });

  it('evolves the reactor (support) along an economy path', () => {
    expect(resolveStarKit('reactor', 1).reactorBiomassMult).toBeGreaterThan(1);
    expect(resolveStarKit('reactor', 2).reactorOverchargeBonus).toBeGreaterThan(0);
    // the ★3 "furnace" fork pours into biomass; "network" into overcharge
    expect(resolveStarKit('reactor', 3, { '3': 'network' }).reactorOverchargeBonus).toBeGreaterThan(
      resolveStarKit('reactor', 3, { '3': 'furnace' }).reactorOverchargeBonus,
    );
  });
});

describe('starPathRegistry', () => {
  it('passes its own validators (ascending stars, forks have ≥2 options)', () => {
    expect(starPathRegistry.validate()).toEqual([]);
  });

  it('authors the four attacking towers, each with two forks', () => {
    for (const t of ['needle', 'mortar', 'parasite', 'obelisk'] as TowerKind[]) {
      expect(starPathRegistry.has(t)).toBe(true);
      expect(forksOf(t).length).toBe(2);
    }
  });

  it('every step has a name + description (no placeholder gaps)', () => {
    for (const p of starPathRegistry.all()) {
      for (const s of p.steps) {
        expect(s.name.length).toBeGreaterThan(0);
        expect(s.desc.length).toBeGreaterThan(0);
        if (isFork(s)) for (const o of s.fork) expect(o.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('stepAt finds the unlock for a given star', () => {
    expect(stepAt('needle', 2)?.name).toBe('Twin Fang');
  });
});

// ── Behavioral proof: a star kit actually changes combat (not just data) ──────
/** Blanket the front rows with needles, god-mode (so the run can't end early),
 * saturate the lane, and run a fixed window — so projectile throughput is the
 * bottleneck and the kit's effect shows in the kill count. Deterministic. */
function needleKills(progress: TowerProgress, secs: number): number {
  const game = new Game(2024, NO_META, progress);
  game.god = true;
  game.debugAddBiomass(100000);
  for (const s of towerSlots) if (s.y < DEFENSE_TOP_Y + 120) game.placeTower('needle', s.x, s.y);
  game.startWave();
  game.debugSpawn('runner', 600); // overwhelm: more than the towers can clear in the window
  let t = 0;
  let guard = 0;
  while (t < secs && game.phase === 'wave' && guard++ < 40000) {
    game.advance(SIM_DT);
    t += SIM_DT;
  }
  return game.getSnapshot().kills;
}

describe('star evolution changes combat', () => {
  it('an extra-projectile kit kills more than the base tower (same seed)', () => {
    const base = neutralProgress();
    const kitted = neutralProgress();
    kitted.needle = { damageMult: 1, fireRateMult: 1, extraProjectiles: 1 }; // ★2 "Twin Fang"
    const baseKills = needleKills(base, 12);
    const kittedKills = needleKills(kitted, 12);
    expect(kittedKills).toBeGreaterThan(baseKills); // multishot → strictly more kills
  });
});
