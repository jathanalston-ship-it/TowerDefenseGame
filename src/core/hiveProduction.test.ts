// hiveProduction — the Hive⇄Harvest unification (docs/HIVE-PRODUCTION.md). Pins the
// contracts the merge stands on: every organ feeds production (registry-validated), the
// bundle is IDENTITY with nothing built (goldens + fresh saves byte-unchanged), caps clamp
// data errors, synergies reveal only when both organs are fully grown, and — THE guardrail —
// a maxed organism still cannot push idle earnings into active range.

import { describe, expect, it } from 'vitest';
import {
  HIVE_PRODUCTION_CAPS, HIVE_PRODUCTION_IDENTITY, HIVE_SYNERGIES, ORGAN_COUPLINGS,
  hiveProductionBonus, hiveProductionProblems, mostProductiveOrgan, synergyLive,
} from './hiveProduction';
import { HIVE_ORGANS } from './hiveOrgans';
import {
  idleAccrual, idleCapHours, idleGrantValue, rollIdleHarvest,
  type IdleGateContext, type IdleNodeLevels,
} from './idleHarvest';
import { coreShardIncome } from './economyDirector';
import { MODE_REWARDS } from './config';
import { generateStage } from './campaign';
import { Rng } from './rng';

const H = 3_600_000;
const ctxOf = (p: Partial<IdleGateContext>): IdleGateContext => ({
  stage: 1, genomeRankIndex: 1, molts: 0, rushBest: 0, collectionCompletion: 0, power: 0, ...p,
});

/** Every organ built to its tier cap — the structure ceiling. */
function maxedBuilt(): Record<string, number> {
  return Object.fromEntries(HIVE_ORGANS.map((o) => [o.id, o.tiers]));
}

describe('registry validation — every organ feeds, every synergy resolves', () => {
  it('the coupling/synergy book has no problems', () => {
    expect(hiveProductionProblems()).toEqual([]);
  });

  it('every organ has exactly one coupling (enforced by the validator, restated here)', () => {
    expect(new Set(ORGAN_COUPLINGS.map((c) => c.organ)).size).toBe(HIVE_ORGANS.length);
  });
});

describe('the bundle — identity at zero, growth per tier, caps as rails', () => {
  it('nothing built ⇒ exact identity (fresh saves and goldens are byte-unchanged)', () => {
    expect(hiveProductionBonus({})).toEqual(HIVE_PRODUCTION_IDENTITY);
  });

  it('building an organ moves ONLY its themed lane, by perTier × tiers', () => {
    const loom = ORGAN_COUPLINGS.find((c) => c.organ === 'vein_loom')!;
    const b = hiveProductionBonus({ vein_loom: 2 });
    expect(b.rateMult).toBeCloseTo(1 + loom.perTier * 2, 10);
    expect(b.capBonusHours).toBe(0);
    expect(b.containerWeightMult).toBe(1);
    const pool = hiveProductionBonus({ symbiote_pool: 1 });
    expect(pool.capBonusHours).toBe(2);
    expect(pool.rateMult).toBe(1);
  });

  it('a fully built organism stays inside every cap', () => {
    const b = hiveProductionBonus(maxedBuilt());
    expect(b.rateMult).toBeLessThanOrEqual(HIVE_PRODUCTION_CAPS.rateMult);
    expect(b.capBonusHours).toBeLessThanOrEqual(HIVE_PRODUCTION_CAPS.capBonusHours);
    expect(b.offlineBonus).toBeLessThanOrEqual(HIVE_PRODUCTION_CAPS.offlineBonus);
    expect(b.rareWeightMult).toBeLessThanOrEqual(HIVE_PRODUCTION_CAPS.rareWeightMult);
    expect(b.containerWeightMult).toBeLessThanOrEqual(HIVE_PRODUCTION_CAPS.containerWeightMult);
    expect(b.bloomBonus).toBeLessThanOrEqual(HIVE_PRODUCTION_CAPS.bloomBonus);
    // …and it is a real improvement in every lane something feeds.
    expect(b.rateMult).toBeGreaterThan(1);
    expect(b.capBonusHours).toBeGreaterThan(0);
  });

  it('junk ledgers degrade gracefully (unknown organs ignored, tiers clamped)', () => {
    const b = hiveProductionBonus({ not_an_organ: 99, vein_loom: 99 });
    const loom = ORGAN_COUPLINGS.find((c) => c.organ === 'vein_loom')!;
    expect(b.rateMult).toBeCloseTo(Math.min(1 + loom.perTier * 3, HIVE_PRODUCTION_CAPS.rateMult), 10);
  });
});

describe('synergies — hidden efficiencies reveal at full growth of BOTH organs', () => {
  it('a synergy is dormant until both partners are fully grown', () => {
    const syn = HIVE_SYNERGIES.find((s) => s.id === 'forged_arteries')!;
    expect(synergyLive({}, syn)).toBe(false);
    expect(synergyLive({ marrow_forge: 3 }, syn)).toBe(false);
    expect(synergyLive({ marrow_forge: 3, vein_loom: 2 }, syn)).toBe(false); // loom is 3-tiered
    expect(synergyLive({ marrow_forge: 3, vein_loom: 3 }, syn)).toBe(true);
  });

  it('a live synergy adds its amount on top of the couplings', () => {
    const syn = HIVE_SYNERGIES.find((s) => s.id === 'forged_arteries')!;
    const without = hiveProductionBonus({ marrow_forge: 3, vein_loom: 2 });
    const withSyn = hiveProductionBonus({ marrow_forge: 3, vein_loom: 3 });
    const loom = ORGAN_COUPLINGS.find((c) => c.organ === 'vein_loom')!;
    expect(withSyn.rateMult - without.rateMult).toBeCloseTo(loom.perTier + syn.amount, 10);
  });
});

describe('accrual/roll integration — the optional arg is a real feed, never a regression', () => {
  it('idleAccrual with the maxed bundle banks more (rate, cap, offline) than without', () => {
    const nodes: IdleNodeLevels = { speed: 10, capacity: 3 };
    const plain = idleAccrual(48 * H, 30, nodes, 3);
    const fed = idleAccrual(48 * H, 30, nodes, 3, 1, 0, hiveProductionBonus(maxedBuilt()));
    expect(fed.capHours).toBeGreaterThan(plain.capHours);
    expect(fed.ratePerHour).toBeGreaterThan(plain.ratePerHour);
    expect(fed.offlineEff).toBeGreaterThan(plain.offlineEff);
    expect(fed.offlineEff).toBeLessThanOrEqual(1); // the 1.0 cap holds structure too
    expect(fed.budget).toBeGreaterThan(plain.budget);
  });

  it('mostProductiveOrgan names a built organ (and null on an empty body)', () => {
    expect(mostProductiveOrgan({})).toBeNull();
    const top = mostProductiveOrgan(maxedBuilt());
    expect(top).not.toBeNull();
    expect(top!.name.length).toBeGreaterThan(0);
  });
});

// ── THE guardrail, re-run with the organism MAXED — structure enriches, never out-earns ──
describe('guardrail with a fully built Hive — idle still < active at every band', () => {
  function idleValuePerWallHour(stage: number, nodes: IdleNodeLevels, rawHours: number, ctx: IdleGateContext): number {
    const hive = hiveProductionBonus(maxedBuilt());
    const acc = idleAccrual(rawHours * H, stage, nodes, ctx.genomeRankIndex, 1, 0, hive);
    let sum = 0;
    const N = 300;
    for (let seed = 1; seed <= N; seed++) {
      const r = new Rng(seed * 2654435761 + stage);
      const roll = rollIdleHarvest(acc, nodes, ctx, () => r.next(), hive);
      for (const line of roll.lines) sum += idleGrantValue(line.grant);
    }
    return sum / N / rawHours;
  }

  function activeFloorPerHour(stage: number): number {
    const run = coreShardIncome({
      wave: 12, kills: 200,
      prestigeShardGainMult: 1, prestigeCoreGainMult: 1,
      stageRewardMult: generateStage(stage).rewardMult,
      endlessRewardMult: 1, modeCoreMult: MODE_REWARDS.core.campaignReplay, doctrineRewardMult: 1,
    }).total();
    return run * 2;
  }

  it('holds across the arc with organs maxed on top of generous nodes', () => {
    const bands: [number, number][] = [[10, 5], [50, 25], [100, 50], [300, 120]];
    for (const [stage, L] of bands) {
      const nodes: IdleNodeLevels = {
        speed: L, rare: L, containers: L, craft: L, shards: L, xp: L,
        offline: Math.min(L, 10), capacity: Math.min(L, 10), overflow: Math.min(L, 10), events: Math.min(L, 25),
      };
      const ctx = ctxOf({ stage, genomeRankIndex: 8, molts: 10, rushBest: 30, collectionCompletion: 0.6, power: 1e9 });
      const capH = idleCapHours(nodes, hiveProductionBonus(maxedBuilt()).capBonusHours);
      const idle = idleValuePerWallHour(stage, nodes, capH, ctx);
      const active = activeFloorPerHour(stage);
      expect(idle, `stage ${stage} · maxed hive: idle ${idle.toFixed(1)}/h vs active floor ${active.toFixed(1)}/h`)
        .toBeLessThan(active * 0.25);
    }
  });
});
