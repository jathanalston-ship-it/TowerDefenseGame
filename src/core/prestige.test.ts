import { describe, it, expect } from 'vitest';
import { PRESTIGE, canMolt, cellsForCycle, imprintedUpgrades, moltImprint, prestigeMult, prestigeStageReq, shardsForCells, defaultPrestige } from './prestige';

describe('MOLT currency (square-root gain)', () => {
  it('mints ⌊cellGain·√(cycleShards/cellScale)⌋ — diminishing within a cycle', () => {
    expect(cellsForCycle(0)).toBe(0);
    expect(cellsForCycle(100)).toBe(1); // 1.5·√1 = 1.5 → 1
    expect(cellsForCycle(10000)).toBe(15); // 1.5·√100 = 15
    expect(cellsForCycle(40000)).toBe(30); // 1.5·√400 = 30 → 4× the shards, only 2× the cells
  });

  it('canMolt only once a Molt is worth ≥ minCells (a MILESTONE, not a per-run action)', () => {
    // minCells 12 ⇒ cycleShards ≥ cellScale·(minCells/cellGain)² = 6,400 Cores of cycle income
    // (tuned 2026-07 from PROGRESSION_REPORT.md — minCells 1 produced a molt every ~15 minutes).
    expect(canMolt(6399)).toBe(false); // 11 cells — not yet worth shedding
    expect(canMolt(6400)).toBe(true); // 12 cells — the milestone
    expect(cellsForCycle(6400)).toBe(PRESTIGE.molt.minCells);
  });

  it('shardsForCells inverts the mint (progress-to-next-cell)', () => {
    const need = shardsForCells(1);
    expect(cellsForCycle(need)).toBeGreaterThanOrEqual(1);
    expect(cellsForCycle(need - 1)).toBe(0);
  });
});

describe('MOLT multiplier (square-root, never explosive)', () => {
  it('is ×1 at zero cells (golden-safe) and compounds with √(lifetimeCells)', () => {
    expect(prestigeMult(0)).toBe(1);
    expect(prestigeMult(100)).toBeCloseTo(2.0, 10); // 1 + 0.1·√100
    expect(prestigeMult(400)).toBeCloseTo(3.0, 10); // 1 + 0.1·√400 — 4× cells, ~2× the bonus
  });

  it('defaultPrestige is all-zero (a fresh account)', () => {
    expect(defaultPrestige()).toEqual({ cells: 0, lifetimeCells: 0, cycleShards: 0, molts: 0, nodes: {}, vows: [] });
  });
});

describe('MOLT campaign gate (Prestige is earned by campaign depth)', () => {
  it('the first Molt requires Campaign Stage 10', () => {
    expect(prestigeStageReq(0)).toBe(PRESTIGE.campaign.firstStage);
    expect(prestigeStageReq(0)).toBe(10);
  });

  it('every subsequent Molt raises the requirement — strictly increasing, LINEAR (never freezes)', () => {
    const seq = Array.from({ length: 8 }, (_, n) => prestigeStageReq(n));
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThan(seq[i - 1]);
    // LINEAR by design (PROGRESSION_REPORT.md finding: a compound gate outran the crawling deep
    // frontier and froze layer-1 at molt 46 forever). The step is constant at any depth, so
    // Molts keep cycling as long as the campaign frontier moves at all.
    expect(prestigeStageReq(1) - prestigeStageReq(0)).toBe(PRESTIGE.campaign.stagePerMolt);
    expect(prestigeStageReq(60) - prestigeStageReq(59)).toBe(PRESTIGE.campaign.stagePerMolt);
    // Deep sanity: molt 46 must stay reachable within the measured deep frontier (~stage 160).
    expect(prestigeStageReq(46)).toBeLessThan(160);
  });
});

describe('MOLT IMPRINT (the bounded trough — BALANCE_ARCHITECTURE.md §9.6)', () => {
  it('the FIRST Molt keeps nothing — it behaves exactly as the pre-Imprint Molt', () => {
    expect(moltImprint(0)).toBe(0);
    expect(imprintedUpgrades({ lethality: 10, apex: 4, runaway_lethality: 25 }, moltImprint(0))).toEqual({});
  });

  it('grows linearly with completed Molts, then holds at the cap — the dear top levels always shed', () => {
    expect(moltImprint(1)).toBeCloseTo(PRESTIGE.molt.imprintPerMolt, 12);
    expect(moltImprint(10)).toBeCloseTo(10 * PRESTIGE.molt.imprintPerMolt, 12);
    const capAt = Math.ceil(PRESTIGE.molt.imprintMax / PRESTIGE.molt.imprintPerMolt);
    for (let m = 1; m <= capAt + 20; m++) expect(moltImprint(m)).toBeGreaterThanOrEqual(moltImprint(m - 1));
    expect(moltImprint(capAt)).toBe(PRESTIGE.molt.imprintMax);
    expect(moltImprint(capAt + 500)).toBe(PRESTIGE.molt.imprintMax); // late Molts keep the bounded fraction
    expect(PRESTIGE.molt.imprintMax).toBeLessThan(1); // a Molt is always a real reset
    expect(moltImprint(-3)).toBe(0); // defensive: a corrupt negative count keeps nothing
  });

  it('keeps round(level × imprint) of every upgrade (zeros dropped, halves up, exact on clean multiples)', () => {
    expect(imprintedUpgrades({ a: 10, b: 3, c: 1, d: 0 }, 0.5)).toEqual({ a: 5, b: 2, c: 1 });
    expect(imprintedUpgrades({ a: 10, b: 7 }, 0.35)).toEqual({ a: 4, b: 2 }); // 3.5 → 4 (the float half rounds up), 2.45 → 2
    expect(imprintedUpgrades({ runaway: 41 }, 0.6)).toEqual({ runaway: 25 }); // uncapped tiers keep the same share
    expect(imprintedUpgrades({}, 0.6)).toEqual({});
  });

  it('rounds, never floors: a player who spreads levels thinly still keeps a share', () => {
    // 20 upgrades at level 2 under a 30% Imprint: a floor would keep 0 of 40 levels; rounding keeps 20.
    const spread = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`u${i}`, 2]));
    expect(Object.values(imprintedUpgrades(spread, 0.3)).reduce((x, y) => x + y, 0)).toBe(20);
    expect(imprintedUpgrades({ a: 2 }, 0.2)).toEqual({}); // below a half-level, nothing survives
  });
});
