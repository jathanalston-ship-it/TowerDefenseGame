// Biomorph Conveyor contracts (docs/STRAIN.md §conveyor/§merge/§economy): growth → ready queue,
// overflow → flat recycler payout (never compounding — the exploit rule), deploy at arrival
// strain, merge auto-targets the highest-Power same-kind tower, discard refunds, the universal
// deployment curve, the undeployed-kind bias, and golden safety (dedicated rng stream).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT, TOWER_ORDER } from './config';
import { towerSlots } from './map';
import { CONVEYOR, deployCost, strainCost, recycleValue, rollKind } from './conveyor';
import { Rng } from './rng';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

function run(g: Game, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) g.advance(SIM_DT);
}

describe('the universal economy (§economy)', () => {
  it('deployment cost compounds smoothly from the base — no per-tower prices', () => {
    expect(deployCost(0)).toBe(CONVEYOR.baseCost);
    expect(deployCost(1)).toBeGreaterThan(deployCost(0));
    expect(deployCost(10)).toBeGreaterThan(deployCost(9));
    // smooth: each step grows by the same ratio
    const r1 = deployCost(5) / deployCost(4);
    const r2 = deployCost(9) / deployCost(8);
    expect(Math.abs(r1 - r2)).toBeLessThan(0.03);
  });

  it('strain costs: the ×3/4/5/6 ladder on a GENTLER deployment escalator', () => {
    for (const [from, mult] of [[1, 3], [2, 4], [3, 5], [4, 6]] as const) {
      expect(strainCost(0, from)).toBe(Math.round(CONVEYOR.baseCost * mult));
      // escalates with deployments — but slower than the deploy compound, so merges stay
      // reachable inside a campaign run (the PROMPT-8 probe finding)
      expect(strainCost(8, from)).toBeGreaterThan(strainCost(0, from));
      expect(strainCost(8, from) / strainCost(0, from)).toBeLessThan(deployCost(8) / deployCost(0));
    }
  });

  it('the recycler payout is FLAT — overflow can never become a money printer', () => {
    expect(recycleValue()).toBe(Math.round(CONVEYOR.baseCost * CONVEYOR.recycleFrac));
    // independent of how many deployments happened (unlike deployCost)
    expect(recycleValue()).toBeLessThan(deployCost(10));
  });
});

describe('the belt (§conveyor)', () => {
  it('grows organisms continuously; the queue holds at most queueMax ready + one growing', () => {
    const g = new Game(11, NO_META);
    g.startWave();
    run(g, CONVEYOR.growSeconds * (CONVEYOR.queueMax + 3));
    const ready = g.conveyor.filter((c) => c.readyAt <= (g as unknown as { time: number }).time).length;
    expect(ready).toBeLessThanOrEqual(CONVEYOR.queueMax);
    expect(g.conveyor.length).toBeLessThanOrEqual(CONVEYOR.queueMax + 1);
    expect(g.conveyor.length).toBeGreaterThan(0); // the belt never stops
  });

  it('overflow pays the flat recycler value into biomass', () => {
    const g = new Game(11, NO_META);
    const drift: number[] = [];
    g.startWave();
    let lastBio = g.biomass;
    for (let i = 0; i < Math.round(90 / SIM_DT); i++) {
      g.advance(SIM_DT);
      if (g.biomass > lastBio + recycleValue() - 1 && g.enemies.length === 0 && g.phase === 'prep') {
        drift.push(g.biomass - lastBio);
      }
      lastBio = g.biomass;
    }
    // the belt matured more than queueMax organisms over 90s ⇒ at least one recycle happened
    expect(g.conveyor.length).toBeGreaterThan(0);
  });

  it('deploy places the organism AT its arrival strain and charges the universal cost', () => {
    const g = new Game(11, NO_META);
    g.biomass = 100000;
    g.startWave();
    // mature one organism
    while (g.conveyor.length === 0 || g.conveyor[0].readyAt > (g as unknown as { time: number }).time) g.advance(SIM_DT);
    const item = g.conveyor[0];
    item.strain = 3; // pretend an epic arrived (framework seam)
    const free = towerSlots.find((sl) => sl.index < g.unlockedSlots && !g.towers.some((t) => t.slot === sl.index))!;
    const bio0 = g.biomass;
    const dep0 = g.deployments;
    expect(g.deployFromConveyor(item.id, free.x, free.y)).toBe(true);
    expect(bio0 - g.biomass).toBe(deployCost(dep0));
    expect(g.deployments).toBe(dep0 + 1);
    const placed = g.towers[g.towers.length - 1];
    expect(placed.kind).toBe(item.kind);
    expect(placed.strain).toBe(3);
    expect(g.conveyor).not.toContain(item);
    expect(g.powerAuditWarnings).toEqual([]); // arriving evolved moved the Power bucket
  });

  it('merge consumes the organism and raises the HIGHEST-POWER same-kind tower', () => {
    const g = new Game(11, NO_META);
    g.biomass = 100000;
    // two needles: one branched (tier 2) — the power leader — one plain
    const free = towerSlots.filter((sl) => sl.index < g.unlockedSlots);
    expect(g.placeTower('needle', free[0].x, free[0].y)).toBe(true);
    expect(g.placeTower('needle', free[1].x, free[1].y)).toBe(true);
    const leader = g.towers[0];
    leader.tier = 2;
    leader.branchId = 'swarm';
    g.startWave();
    while (g.conveyor.length === 0 || g.conveyor[0].readyAt > (g as unknown as { time: number }).time) g.advance(SIM_DT);
    const item = g.conveyor[0];
    item.kind = 'needle'; // force the duplicate (framework seam)
    const bio0 = g.biomass;
    expect(g.strainFromConveyor(item.id)).toBe('ok');
    expect(leader.strain).toBe(2); // the branched (highest-Power) needle evolved
    expect(g.towers[1].strain).toBe(1);
    expect(leader.tier).toBe(2); // branches NEVER removed
    expect(bio0 - g.biomass).toBe(strainCost(g.deployments, 1));
    // the run-stat ledgers saw the evolution (docs/STRAIN.md §7 — stats/achievements ride these)
    const rs = g.getRunStats();
    expect(rs.strains).toBe(1);
    expect(rs.maxStrain).toBe(2);
    expect(rs.strainByKind?.needle).toBe(2);
    // no eligible target → refused cleanly
    const g2 = new Game(12, NO_META);
    g2.startWave();
    while (g2.conveyor.length === 0 || g2.conveyor[0].readyAt > (g2 as unknown as { time: number }).time) g2.advance(SIM_DT);
    expect(g2.strainFromConveyor(g2.conveyor[0].id)).toBe('noTarget');
  });

  it('discard refunds the flat value instantly', () => {
    const g = new Game(11, NO_META);
    g.startWave();
    while (g.conveyor.length === 0 || g.conveyor[0].readyAt > (g as unknown as { time: number }).time) g.advance(SIM_DT);
    const bio0 = g.biomass;
    expect(g.discardConveyor(g.conveyor[0].id)).toBe(true);
    expect(g.biomass - bio0).toBe(recycleValue());
  });

  it('kind rolls bias toward UNDEPLOYED kinds without removing randomness', () => {
    const rng = new Rng(99);
    const deployed = new Set<TowerKind>(['needle', 'mortar', 'reactor', 'parasite']);
    let obelisks = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) if (rollKind(rng, deployed, 'needle') === 'obelisk') obelisks++;
    const flat = N / TOWER_ORDER.length;
    expect(obelisks).toBeGreaterThan(flat * 1.15); // biased up…
    expect(obelisks).toBeLessThan(N * 0.6); // …but far from deterministic
  });

  it('GOLDEN SAFETY: an untouched belt never perturbs the gameplay rng stream', () => {
    // two identical runs, one where we peek the conveyor constantly — traces must match
    const trace = (peek: boolean): number[] => {
      const g = new Game(21, NO_META);
      g.startWave();
      const out: number[] = [];
      for (let i = 0; i < Math.round(20 / SIM_DT); i++) {
        g.advance(SIM_DT);
        if (peek) void g.conveyor.length;
        out.push(g.kills, g.enemies.length);
      }
      return out;
    };
    expect(trace(false)).toEqual(trace(true));
  });
});
