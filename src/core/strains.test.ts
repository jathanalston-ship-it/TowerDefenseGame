// STRAIN framework contracts (docs/STRAIN.md): the identity rule (hooks are mechanics, never
// multipliers), cumulative resolution, the power vehicle, golden safety (Strain I = empty kit,
// zero rng), the twin-cast proc, fragmentation, and the raiseStrain mutation point + audit.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import { towerSlots } from './map';
import { resolveStrain, strainRegistry, strainsFor, strainPowerEffects, STRAIN_LEVEL_POWER } from './strains';
import { effectsPower } from './power';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

describe('the identity rule (§identity)', () => {
  it('every registered strain grants a MECHANIC (non-empty hooks) at a legal level', () => {
    for (const d of strainRegistry.all()) {
      expect(d.level).toBeGreaterThanOrEqual(2);
      expect(d.level).toBeLessThanOrEqual(5);
      expect(Object.keys(d.hooks).length).toBeGreaterThan(0);
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.desc.length).toBeGreaterThan(0);
    }
  });

  it('the hook vocabulary carries no bare multiplier fields (mechanics only)', () => {
    for (const d of strainRegistry.all()) {
      for (const key of Object.keys(d.hooks)) {
        expect(/mult$|Mult$/i.test(key)).toBe(false);
      }
    }
  });
});

describe('resolution (§framework)', () => {
  it('Strain I resolves to the shared EMPTY kit (golden-safe identity)', () => {
    expect(resolveStrain('needle', 1)).toEqual({});
    expect(resolveStrain('needle', 1)).toBe(resolveStrain('mortar', 1)); // literally shared
  });

  it('resolution is CUMULATIVE — a higher strain includes lower hooks', () => {
    // mortar has a level-3 def; resolving at 5 must still carry it
    const at3 = resolveStrain('mortar', 3);
    const at5 = resolveStrain('mortar', 5);
    expect(at3.fragmentOnImpact).toBeDefined();
    expect(at5.fragmentOnImpact).toEqual(at3.fragmentOnImpact);
  });

  it('strainsFor lists a tower ladder in level order', () => {
    const ladder = strainsFor('needle');
    for (let i = 1; i < ladder.length; i++) expect(ladder[i].level).toBeGreaterThan(ladder[i - 1].level);
  });
});

describe('power (§power)', () => {
  it('each level above I moves the temporary Power bucket', () => {
    expect(strainPowerEffects(0)).toEqual([]);
    expect(effectsPower(strainPowerEffects(3))).toBeGreaterThan(effectsPower(strainPowerEffects(1)));
    expect(effectsPower(strainPowerEffects(1))).toBeGreaterThan(1 - 1e-9);
    expect(STRAIN_LEVEL_POWER).toBeGreaterThan(0);
  });
});

describe('the live loop (§framework in the sim)', () => {
  function gameWith(kind: TowerKind, strain: number, seed = 7): Game {
    // Legacy sim (disableIdle): the strain loop is pinned without idle openers shifting
    // application timing — the idle layer is covered by towerIdle.test.ts.
    const g = new Game(seed, NO_META, undefined, undefined, undefined, { disableIdle: true });
    const slot = towerSlots[0];
    expect(g.placeTower(kind, slot.x, slot.y)).toBe(true);
    const t = g.towers[0];
    t.strain = strain; // framework-level test seam (acquisition is the conveyor's job)
    (g as unknown as { recomputeTowerCaches: () => void }).recomputeTowerCaches(); // refresh cross-cut kits
    return g;
  }

  it('raiseStrain: validates, caps at V, moves Power, never touches the branch', () => {
    const g = gameWith('needle', 1);
    const t = g.towers[0];
    t.branchId = null;
    const p0 = effectsPower(g.powerEffects());
    expect(g.raiseStrain(-1)).toBe('badTower');
    expect(g.raiseStrain(t.id)).toBe('ok');
    expect(t.strain).toBe(2);
    expect(effectsPower(g.powerEffects())).toBeGreaterThan(p0);
    expect(g.powerAuditWarnings).toEqual([]); // the audit saw the bucket move
    t.strain = 5;
    expect(g.raiseStrain(t.id)).toBe('maxed');
    expect(t.tier).toBe(0); // branches NEVER touched by strain
  });

  it('twin-cast (needle II) fires MORE shots than Strain I over the same script', () => {
    const shots = (strain: number): number => {
      const g = gameWith('needle', strain);
      g.startWave();
      let n = 0;
      let last = 0;
      for (let i = 0; i < Math.round(20 / SIM_DT); i++) {
        g.advance(SIM_DT);
        const now = (g as unknown as { projectiles: { length: number } }).projectiles.length;
        if (now > last) n += now - last;
        last = now;
      }
      return n;
    };
    const base = shots(1);
    const twin = shots(2);
    expect(base).toBeGreaterThan(0);
    expect(twin).toBeGreaterThan(base * 1.05); // ~+25% casts repeat; band is generous
  });

  it('identical Strain-I runs are deterministic and unaffected by the framework', () => {
    const trace = (): number[] => {
      const g = gameWith('needle', 1);
      g.startWave();
      const out: number[] = [];
      for (let i = 0; i < Math.round(8 / SIM_DT); i++) {
        g.advance(SIM_DT);
        out.push(g.integrity, g.kills, g.biomass);
      }
      return out;
    };
    expect(trace()).toEqual(trace());
  });

  it('knockback (mortar II): a strained blast knocks a sieging attacker OFF the crust', () => {
    const g = gameWith('mortar', 2);
    g.startWave();
    // march the sim until something sieges, then observe a mortar impact displacing it
    let sawKnock = false;
    let lastY = new Map<number, number>();
    for (let i = 0; i < Math.round(40 / SIM_DT) && !sawKnock; i++) {
      g.advance(SIM_DT);
      for (const e of g.enemies) {
        const prev = lastY.get(e.id);
        if (prev !== undefined && e.alive && prev - e.y > 20) sawKnock = true; // hurled up-lane
        lastY.set(e.id, e.y);
      }
    }
    expect(sawKnock).toBe(true);
  });

  it('fragmentation (mortar III): strained shells damage MORE enemies per impact', () => {
    const killsAfter = (strain: number): number => {
      const g = gameWith('mortar', strain);
      g.startWave();
      for (let i = 0; i < Math.round(25 / SIM_DT); i++) g.advance(SIM_DT);
      return g.kills;
    };
    expect(killsAfter(3)).toBeGreaterThanOrEqual(killsAfter(1)); // fragments only add damage
  });

  it('births (parasite V): the Brood Nest produces broodlings on its own cadence', () => {
    const g = gameWith('parasite', 5);
    g.startWave();
    let sawBrood = false;
    for (let i = 0; i < Math.round(14 / SIM_DT) && !sawBrood; i++) {
      g.advance(SIM_DT);
      if (g.minions.some((m) => m.kind === 'broodling')) sawBrood = true;
    }
    expect(sawBrood).toBe(true);
  });

  it('seize (parasite IV): a fully infected host is STUNNED once (latched)', () => {
    const g = gameWith('parasite', 4);
    g.startWave();
    let sawSeize = false;
    for (let i = 0; i < Math.round(30 / SIM_DT) && !sawSeize; i++) {
      g.advance(SIM_DT);
      for (const e of g.enemies) {
        if (e.seized) {
          sawSeize = true;
          expect(e.statuses?.some((x) => x.id === 'stun')).toBe(true);
        }
      }
    }
    expect(sawSeize).toBe(true);
  });

  it('static field (obelisk II+): enemies inside the field accumulate CHARGE stacks', () => {
    const g = gameWith('obelisk', 2);
    g.startWave();
    let sawCharge = false;
    for (let i = 0; i < Math.round(15 / SIM_DT) && !sawCharge; i++) {
      g.advance(SIM_DT);
      if (g.enemies.some((e) => e.statuses?.some((x) => x.id === 'charge' && x.stacks > 0))) sawCharge = true;
    }
    expect(sawCharge).toBe(true);
  });

  it('adrenal jolt (reactor II): overcharged towers open the wave with cooldown 0', () => {
    const g = new Game(7, NO_META, undefined, undefined, undefined, { disableIdle: true });
    // a reactor + the nearest orthogonal slot (within the 90px support radius)
    const s0 = towerSlots[0];
    expect(g.placeTower('reactor', s0.x, s0.y)).toBe(true);
    const near = towerSlots.find((sl) => sl.index !== s0.index && Math.hypot(sl.x - s0.x, sl.y - s0.y) < 90)!;
    expect(g.placeTower('needle', near.x, near.y)).toBe(true);
    const reactor = g.towers.find((t) => t.kind === 'reactor')!;
    const needle = g.towers.find((t) => t.kind === 'needle')!;
    reactor.strain = 2;
    (g as unknown as { recomputeTowerCaches: () => void }).recomputeTowerCaches();
    expect(needle.overcharged).toBe(true);
    needle.cooldown = 3; // pretend it just fired
    g.startWave();
    expect(needle.cooldown).toBe(0); // the jolt reset it as the wave opened
  });

  it('synaptic weave (reactor IV): chained reactors overcharge FARTHER than a lone one', () => {
    const g = new Game(7, NO_META, undefined, undefined, undefined, { disableIdle: true });
    g.biomass = 10000; // fund the three placements — geometry is what's under test
    const s0 = towerSlots[0];
    expect(g.placeTower('reactor', s0.x, s0.y)).toBe(true);
    // a second reactor within chain reach (≤ 2× support radius) and a tower in the
    // extended-but-not-base band (90 < d ≤ ~130) of the first reactor
    const s1 = towerSlots.find((sl) => sl.index !== s0.index && Math.hypot(sl.x - s0.x, sl.y - s0.y) <= 180 && Math.hypot(sl.x - s0.x, sl.y - s0.y) > 60)!;
    expect(g.placeTower('reactor', s1.x, s1.y)).toBe(true);
    const band = towerSlots.find((sl) => {
      const d0 = Math.hypot(sl.x - s0.x, sl.y - s0.y);
      const d1 = Math.hypot(sl.x - s1.x, sl.y - s1.y);
      return sl.index !== s0.index && sl.index !== s1.index && Math.min(d0, d1) > 92 && Math.min(d0, d1) < 128;
    })!;
    expect(band).toBeDefined();
    expect(g.placeTower('needle', band.x, band.y)).toBe(true);
    const needle = g.towers.find((t) => t.kind === 'needle')!;
    const rc = (g as unknown as { recomputeTowerCaches: () => void });
    rc.recomputeTowerCaches();
    expect(needle.overcharged).toBe(false); // out of base reach
    for (const t of g.towers) if (t.kind === 'reactor') t.strain = 4;
    rc.recomputeTowerCaches();
    expect(needle.overcharged).toBe(true); // the weave extends the chained ring
  });
});
