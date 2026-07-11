import { describe, it, expect } from 'vitest';
import { PRESTIGE, canMolt, cellsForCycle, prestigeMult, prestigeStageReq, shardsForCells, defaultPrestige } from './prestige';

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
