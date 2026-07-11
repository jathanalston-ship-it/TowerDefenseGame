// IDLE HARVEST core contracts (docs/IDLE-HARVEST.md):
//   • accrual math — junk elapsed mints nothing, the cap clamps, overflow keeps ≤ half a
//     cap-width, and effective hours NEVER exceed wall hours (idle approaches play, never
//     passes it);
//   • the evolution tree — geometric costs, soft multipliers exactly ×1 at level 0
//     (golden-safe), gates resolving through all six progression lenses;
//   • the drop registry — the future-proofing contract (eligibility gates + weights +
//     affordability floors), deterministic rolls, the container cap, the BLOOM;
//   • THE GUARDRAIL — idle value per wall-clock hour stays FAR below active farming at every
//     progression band, including the dust-spam and deep-node worst cases. Priced with the
//     REAL roll + the real active-income curves, not a spreadsheet copy.

import { describe, expect, it } from 'vitest';
import {
  IDLE_DROPS, IDLE_NODES, IDLE_NODE_BY_ID,
  eligibleIdleDrops, idleAccrual, idleBloomChance, idleCapHours, idleGateLabel, idleGateMet,
  idleGrantValue, idleNodeCost, idleNodeGate, idleOfflineEff, idleOverflowFrac,
  idleRatePerHour, idleSoft, idleSuggestion, rollIdleHarvest,
} from './idleHarvest';
import type { IdleGateContext, IdleNodeLevels } from './idleHarvest';
import { ECON, IDLE } from './config';
import { generateStage } from './campaign';
import { coreShardIncome } from './economyDirector';
import { MODE_REWARDS } from './config';
import { Rng } from './rng';

const ctxOf = (over: Partial<IdleGateContext> = {}): IdleGateContext => ({
  stage: 0, genomeRankIndex: 1, molts: 0, rushBest: 0, collectionCompletion: 0, power: 1000, ...over,
});
const H = 3_600_000;

// ── Accrual ─────────────────────────────────────────────────────────────────────
describe('accrual — the cap clamps, junk mints nothing, idle never beats the wall clock', () => {
  it('zero / negative / NaN elapsed all fold to an empty accrual', () => {
    for (const ms of [0, -1, -1e12, NaN, Infinity * -1]) {
      const a = idleAccrual(ms, 10, {});
      expect(a.rawHours).toBe(0);
      expect(a.effHours).toBe(0);
      expect(a.budget).toBe(0);
    }
  });

  it('below the cap, effective hours equal wall hours; at the cap they clamp', () => {
    const under = idleAccrual(3 * H, 10, {});
    expect(under.rawHours).toBeCloseTo(3, 6);
    expect(under.effHours).toBeCloseTo(3, 6);
    expect(under.full).toBe(false);
    const over = idleAccrual(100 * H, 10, {});
    expect(over.capHours).toBe(IDLE.capHoursLadder[0]);
    expect(over.effHours).toBe(over.capHours); // no overflow node ⇒ hard clamp
    expect(over.full).toBe(true);
  });

  it('overflow retains a fraction of over-cap hours, never more than half a cap-width', () => {
    const nodes: IdleNodeLevels = { overflow: 30 }; // deep — the 0.5 ceiling binds
    expect(idleOverflowFrac(nodes)).toBe(0.5);
    const a = idleAccrual(1000 * H, 1, nodes);
    expect(a.overflowHours).toBeCloseTo(a.capHours * 0.5, 6);
    expect(a.effHours).toBeCloseTo(a.capHours * 1.5, 6);
  });

  it('effective hours NEVER exceed wall hours (idle approaches play, never passes it)', () => {
    const nodes: IdleNodeLevels = { overflow: 50, capacity: 12, offline: 40 };
    for (let h = 0.1; h < 400; h *= 1.7) {
      const a = idleAccrual(h * H, 50, nodes);
      expect(a.effHours).toBeLessThanOrEqual(a.rawHours + 1e-9);
      expect(a.offlineEff).toBeLessThanOrEqual(1);
    }
  });

  it('the cap ladder walks the authored rungs, then grows forever', () => {
    IDLE.capHoursLadder.forEach((hours, i) => expect(idleCapHours({ capacity: i })).toBe(hours));
    const top = IDLE.capHoursLadder[IDLE.capHoursLadder.length - 1];
    expect(idleCapHours({ capacity: 8 })).toBe(top + IDLE.capHoursBeyond);
    expect(idleCapHours({ capacity: 20 })).toBe(top + 13 * IDLE.capHoursBeyond);
  });

  it('GENOME RANK DIVIDEND: rank I (or omitted) is exactly ×1; each rank adds IDLE.rankGrowth', () => {
    // The mastery-ladder ↔ idle interlink (docs/IDLE-HARVEST.md §rank, 2026-07): the rate model
    // must stay byte-stable for fresh accounts and grow linearly with the rank index.
    expect(idleRatePerHour(10, {})).toBe(idleRatePerHour(10, {}, 1)); // omitted ≡ rank I
    expect(idleRatePerHour(10, {}, 0)).toBe(idleRatePerHour(10, {}, 1)); // junk floors to ×1
    const base = idleRatePerHour(40, {}, 1);
    expect(idleRatePerHour(40, {}, 5)).toBeCloseTo(base * (1 + IDLE.rankGrowth * 4), 10);
    expect(idleRatePerHour(40, {}, 11)).toBeCloseTo(base * (1 + IDLE.rankGrowth * 10), 10); // XI+ keeps paying
    expect(idleAccrual(10 * H, 40, {}, 5).budget).toBeCloseTo(idleAccrual(10 * H, 40, {}).budget * (1 + IDLE.rankGrowth * 4), 8);
  });

  it('offline efficiency climbs 0.7 → 1.0 and holds there', () => {
    expect(idleOfflineEff({})).toBe(IDLE.baseOfflineEff);
    expect(idleOfflineEff({ offline: 5 })).toBeCloseTo(0.85, 9);
    expect(idleOfflineEff({ offline: 10 })).toBe(1);
    expect(idleOfflineEff({ offline: 400 })).toBe(1);
  });
});

// ── The evolution tree ──────────────────────────────────────────────────────────
describe('the evolution tree — infinite, soft-scaled, gated through six lenses', () => {
  it('soft scaling is exactly ×1 at level 0 (golden-safe) and sublinear forever', () => {
    expect(idleSoft(0, 0.05)).toBe(1);
    expect(idleSoft(1, 0.05)).toBeGreaterThan(1);
    // log easing: level 100 pays well under the linear 1 + per·L
    expect(idleSoft(100, 0.05)).toBeLessThan(1 + 0.05 * 100);
    expect(idleSoft(200, 0.05)).toBeGreaterThan(idleSoft(100, 0.05));
  });

  it('node costs are geometric and strictly rising', () => {
    const speed = IDLE_NODE_BY_ID.speed;
    expect(idleNodeCost(speed, 0)).toBe(speed.baseCost);
    expect(idleNodeCost(speed, 1)).toBe(Math.round(speed.baseCost * speed.costGrowth));
    for (let l = 0; l < 30; l++) expect(idleNodeCost(speed, l + 1)).toBeGreaterThan(idleNodeCost(speed, l));
  });

  it('all six gate lenses resolve and label themselves', () => {
    const table: [ReturnType<typeof Object.freeze> & Parameters<typeof idleGateMet>[1], Partial<IdleGateContext>][] = [
      [{ kind: 'campaign', stage: 10 }, { stage: 10 }],
      [{ kind: 'genomeRank', rank: 4 }, { genomeRankIndex: 4 }],
      [{ kind: 'molts', count: 2 }, { molts: 2 }],
      [{ kind: 'rushBest', bosses: 5 }, { rushBest: 5 }],
      [{ kind: 'collection', completion: 0.2 }, { collectionCompletion: 0.2 }],
      [{ kind: 'power', score: 100000 }, { power: 100000 }],
    ];
    for (const [req, met] of table) {
      expect(idleGateMet(ctxOf(), req), req.kind).toBe(false);
      expect(idleGateMet(ctxOf(met), req), req.kind).toBe(true);
      expect(idleGateLabel(req).length).toBeGreaterThan(0);
    }
  });

  it('a gated level returns its first unmet gate; a met gate opens the level', () => {
    const speed = IDLE_NODE_BY_ID.speed; // atLevel 10 wants campaign stage 25
    expect(idleNodeGate(speed, 9, ctxOf({ stage: 1 }))).toBeNull();
    expect(idleNodeGate(speed, 10, ctxOf({ stage: 24 }))).toEqual({ kind: 'campaign', stage: 25 });
    expect(idleNodeGate(speed, 10, ctxOf({ stage: 25 }))).toBeNull();
    // every node's deepest authored gate eventually binds on a fresh context
    for (const def of IDLE_NODES) {
      const deepest = def.gates[def.gates.length - 1];
      if (!deepest) continue;
      expect(idleNodeGate(def, deepest.atLevel, ctxOf({ power: 0, genomeRankIndex: 0 })), def.id).not.toBeNull();
    }
  });

  it('the suggestion points at the cheapest ungated node', () => {
    const s = idleSuggestion({}, 10_000, ctxOf({ stage: 1 }));
    expect(s?.kind).toBe('buy');
    if (s?.kind === 'buy') {
      expect(s.node.id).toBe('speed'); // baseCost 60 is the cheapest ungated opener
      expect(s.cost).toBe(60);
    }
  });
});

// ── The drop registry (the future-proofing contract) ────────────────────────────
describe('the drop registry — gates, weights, affordability floors', () => {
  it('rows are unique, weighted, and every rare row is progression-gated', () => {
    expect(new Set(IDLE_DROPS.map((d) => d.id)).size).toBe(IDLE_DROPS.length);
    for (const d of IDLE_DROPS) {
      expect(d.weight, d.id).toBeGreaterThan(0);
      if (d.rare) expect(d.minCampaign !== undefined || d.minGenomeRank !== undefined, `${d.id} rare ⇒ gated`).toBe(true);
    }
    // Bio-Roulette spores stay rush-exclusive — never an idle drop (docs/IDLE-HARVEST.md §registry).
    expect(IDLE_DROPS.some((d) => d.id === 'spores')).toBe(false);
  });

  it('eligibility rides minCampaign AND minGenomeRank', () => {
    expect(eligibleIdleDrops(ctxOf({ stage: 1 })).map((d) => d.id)).toEqual(['cores']);
    const mid = eligibleIdleDrops(ctxOf({ stage: 12, genomeRankIndex: 3 })).map((d) => d.id);
    expect(mid).toContain('mulligan');
    expect(mid).not.toContain('ichor'); // stage 20 + rank 5
    expect(eligibleIdleDrops(ctxOf({ stage: 25, genomeRankIndex: 4 })).map((d) => d.id)).not.toContain('ichor'); // rank still short
    expect(eligibleIdleDrops(ctxOf({ stage: 25, genomeRankIndex: 5 })).map((d) => d.id)).toContain('ichor');
  });

  it('rolls are deterministic from the seed and respect the container cap', () => {
    const ctx = ctxOf({ stage: 40, genomeRankIndex: 5 });
    const nodes: IdleNodeLevels = { containers: 40, rare: 40, capacity: 4 };
    const acc = idleAccrual(24 * H, 40, nodes);
    const roll = (seed: number) => rollIdleHarvest(acc, nodes, ctx, (() => { const r = new Rng(seed); return () => r.next(); })());
    expect(JSON.stringify(roll(7))).toBe(JSON.stringify(roll(7)));
    expect(JSON.stringify(roll(7))).not.toBe(JSON.stringify(roll(8)));
    for (let seed = 1; seed <= 200; seed++) {
      const lines = roll(seed).lines;
      const containers = lines.filter((l) => l.dropId === 'container' || l.dropId === 'runCache').length;
      expect(containers).toBeLessThanOrEqual(IDLE.maxContainersPerCollect);
    }
  });

  it('a BLOOM doubles the budget and leads with a rare line (when one is affordable)', () => {
    const ctx = ctxOf({ stage: 60, genomeRankIndex: 6 });
    const nodes: IdleNodeLevels = { events: 25, speed: 60, capacity: 5 }; // bloom chance at its 0.25 cap
    expect(idleBloomChance(nodes)).toBe(0.25);
    const acc = idleAccrual(36 * H, 60, nodes);
    let bloomSeen = false;
    for (let seed = 1; seed <= 60 && !bloomSeen; seed++) {
      const r = new Rng(seed);
      const res = rollIdleHarvest(acc, nodes, ctx, () => r.next());
      if (!res.bloom) continue;
      bloomSeen = true;
      expect(res.budget).toBeCloseTo(acc.budget * IDLE.bloomBudgetMult, 6);
      expect(res.lines[0]?.rare).toBe(true);
    }
    expect(bloomSeen).toBe(true);
  });

  it('xp pays per effective hour and grows with the Idle XP node', () => {
    const acc = idleAccrual(10 * H, 10, {});
    const r1 = new Rng(3); const r2 = new Rng(3);
    const plain = rollIdleHarvest(acc, {}, ctxOf({ stage: 10 }), () => r1.next());
    const boosted = rollIdleHarvest(acc, { xp: 30 }, ctxOf({ stage: 10 }), () => r2.next());
    expect(plain.xp).toBeGreaterThan(0);
    expect(boosted.xp).toBeGreaterThan(plain.xp);
  });
});

// ── THE GUARDRAIL — playing always out-earns idling ─────────────────────────────
// Idle value per WALL-CLOCK hour (measured with the real roll + real unit prices) must stay far
// below ACTIVE farming at the same band. The active ruler is deliberately the WEAKEST honest
// lane: campaign REPLAY cores only (MODE_REWARDS.core.campaignReplay), a modest run (the stage's
// live rewardMult via generateStage), a lazy 2 runs/hour, and NONE of active play's other
// faucets (loot meter, essence, shard drops, quests, XP). Beating a quarter of THAT floor is a
// balance regression.
describe('THE guardrail — idle < active at every band, including worst cases', () => {
  /** Mean idle value of one collect, per wall-clock hour, over many seeded rolls. Prices the
   *  FULL rate model including the Genome Rank dividend (ctx carries the band's rank). */
  function idleValuePerWallHour(stage: number, nodes: IdleNodeLevels, rawHours: number, ctx: IdleGateContext): number {
    const acc = idleAccrual(rawHours * H, stage, nodes, ctx.genomeRankIndex);
    let sum = 0;
    const N = 300;
    for (let seed = 1; seed <= N; seed++) {
      const r = new Rng(seed * 2654435761 + stage);
      const roll = rollIdleHarvest(acc, nodes, ctx, () => r.next());
      for (const line of roll.lines) sum += idleGrantValue(line.grant);
    }
    return sum / N / rawHours;
  }

  /** The weakest active lane: replay cores/hour at a stage (2 modest runs, live reward curve). */
  function activeFloorPerHour(stage: number): number {
    const run = coreShardIncome({
      wave: 12, kills: 200,
      prestigeShardGainMult: 1, prestigeCoreGainMult: 1,
      stageRewardMult: generateStage(stage).rewardMult,
      endlessRewardMult: 1, modeCoreMult: MODE_REWARDS.core.campaignReplay, doctrineRewardMult: 1,
    }).total();
    return run * 2;
  }

  it('holds across the whole arc — early, mid, deep, and end-game bands', () => {
    // [stage, node depth] — node depths GENEROUS for the band (as if every gate was cleared
    // the moment it opened and cores went idle-first).
    const bands: [number, number][] = [[10, 5], [50, 25], [100, 50], [300, 120], [1000, 200]];
    for (const [stage, L] of bands) {
      const nodes: IdleNodeLevels = {
        speed: L, rare: L, containers: L, craft: L, shards: L, xp: L,
        offline: Math.min(L, 10), capacity: Math.min(L, 10), overflow: Math.min(L, 10), events: Math.min(L, 25),
      };
      const ctx = ctxOf({ stage, genomeRankIndex: 8, molts: 10, rushBest: 30, collectionCompletion: 0.6, power: 1e9 });
      // Optimal cadence: collect right AT the cap (below it, value/wall-hour is flat; past it,
      // the clamp dilutes) — so this IS the per-wall-hour ceiling for the band.
      const idle = idleValuePerWallHour(stage, nodes, idleCapHours(nodes), ctx);
      const active = activeFloorPerHour(stage);
      expect(idle, `stage ${stage} · nodes L${L}: idle ${idle.toFixed(1)}/h vs active floor ${active.toFixed(1)}/h`)
        .toBeLessThan(active * 0.25);
    }
  });

  it('dust-spam (collecting every warm-up window) cannot beat the honest cadence into active range', () => {
    // The exploit the affordability floors kill: 5-minute collects × 12/hour. Without minValue,
    // fixed-price container/cache/mulligan lines would mint full value from near-zero budgets.
    const nodes: IdleNodeLevels = { speed: 25, rare: 25, containers: 25, offline: 10 };
    const ctx = ctxOf({ stage: 30, genomeRankIndex: 4, molts: 3, rushBest: 10, collectionCompletion: 0.3, power: 1e7 });
    const dust = idleValuePerWallHour(30, nodes, IDLE.minCollectMinutes / 60, ctx);
    expect(dust, `dust spam pays ${dust.toFixed(1)}/h`).toBeLessThan(activeFloorPerHour(30) * 0.25);
    // …and spamming must not out-earn simply letting the hopper fill (no cadence exploit).
    const honest = idleValuePerWallHour(30, nodes, idleCapHours(nodes), ctx);
    expect(dust).toBeLessThan(Math.max(honest * 3, 40));
  });

  it('long-term stability: the share decays with stage, and node depth alone cannot force a crossover', () => {
    const share = (stage: number, L: number): number => {
      const nodes: IdleNodeLevels = { speed: L, shards: L, craft: L, offline: 10, capacity: 8 };
      const ctx = ctxOf({ stage, genomeRankIndex: 9, molts: 20, rushBest: 40, collectionCompletion: 0.8, power: 1e12 });
      return idleValuePerWallHour(stage, nodes, idleCapHours(nodes), ctx) / activeFloorPerHour(stage);
    };
    // At FIXED node depth the share decays with stage (idle grows 0.02/stage vs active 0.05).
    expect(share(2000, 50)).toBeLessThan(share(100, 50));
    // Node depth's contribution is LOG-bounded: even L500 — a cost of ~60×1.35⁵⁰⁰ cores, far
    // beyond any reachable economy — cannot push idle past active at deep stages. The true
    // crossover sits near L≈100,000 (soft·boost ≈ 53), i.e. unreachable by construction.
    expect(share(2000, 500)).toBeLessThan(0.8);
  });

  it('the budget is the ruler: rate × hours × efficiency, and the roll pays in its vicinity', () => {
    // Value conservation sanity: a meaningful harvest's mean payout lands NEAR its budget —
    // node slice-boosts can raise it, fixed-price underpay can lower it, but never runaway.
    const nodes: IdleNodeLevels = { capacity: 3 };
    const ctx = ctxOf({ stage: 40, genomeRankIndex: 5 });
    const acc = idleAccrual(16 * H, 40, nodes);
    let sum = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = new Rng(seed);
      for (const line of rollIdleHarvest(acc, nodes, ctx, () => r.next()).lines) sum += idleGrantValue(line.grant);
    }
    const mean = sum / 300;
    expect(mean).toBeGreaterThan(acc.budget * 0.5);
    expect(mean).toBeLessThan(acc.budget * 2.5);
  });

  it('the idle rate itself grows slower than the active reward curve (structural, not tuned)', () => {
    // Config-drift tripwire: idle stage growth must stay STRICTLY below campaign reward growth,
    // or the shares above eventually cross far past the tested bands.
    const idleGrowth = IDLE.stageGrowth;
    const activeGrowth = generateStage(101).rewardMult - generateStage(100).rewardMult;
    expect(idleGrowth).toBeLessThan(activeGrowth + 1e-9);
    // …and the base rate is a trickle against the run-end shard anchor.
    expect(IDLE.baseCoresPerHour).toBeLessThanOrEqual(ECON.shardsPerWave);
  });
});
