// POWER ADVISOR (docs/POWER-ADVISOR.md — Foundation #5): the cross-system "fastest Power now"
// plan. Pins: exact-advisor provenance (every move carries a real powerDelta + an executable
// AtlasAction), ranking (descending gain), honesty (totals only count moves the player can
// afford THIS second; the save-up target is surfaced but never summed), and the fresh-account
// shape (an empty plan, never a fabricated one).

import { describe, it, expect } from 'vitest';
import { advisorPlan } from './powerAdvisor';
import { defaultSave } from '../save/saveStore';

describe('Power Advisor — the cross-system plan', () => {
  it('a funded account gets a ranked, affordable, executable plan', () => {
    const s = { ...defaultSave(), shards: 800 }; // Genome Cores fund Evolution HQ purchases
    const plan = advisorPlan(s, 5);
    expect(plan.moves.length).toBeGreaterThan(0);
    for (const m of plan.moves) {
      expect(m.affordable).toBe(true); // the plan NEVER lists moves the player can't take now
      expect(m.powerDelta).toBeGreaterThan(0); // real scorer diffs only
      expect(m.nav.length).toBeGreaterThan(0); // every row is a jump shortcut
      expect(m.action.type).toMatch(/^(purchase|adapt|equip)$/); // guarded executable payload
    }
    for (let i = 1; i < plan.moves.length; i++) {
      expect(plan.moves[i - 1].powerDelta).toBeGreaterThanOrEqual(plan.moves[i].powerDelta); // ranked
    }
    expect(plan.totalGain).toBe(plan.moves.reduce((n, m) => n + m.powerDelta, 0)); // honest sum
    expect(plan.estMinutes).toBeGreaterThanOrEqual(1);
  });

  it('a fresh, broke account gets an EMPTY plan plus a save-up target — never fabricated gains', () => {
    const plan = advisorPlan(defaultSave(), 5);
    expect(plan.moves).toEqual([]); // nothing affordable ⇒ nothing promised
    expect(plan.totalGain).toBe(0);
    expect(plan.saveUp).not.toBeNull(); // …but the thing worth banking for is named
    expect(plan.saveUp!.affordable).toBe(false);
    expect(plan.saveUp!.powerDelta).toBeGreaterThan(0);
  });

  it('respects k and stays deterministic', () => {
    const s = { ...defaultSave(), shards: 800 };
    expect(advisorPlan(s, 1).moves.length).toBeLessThanOrEqual(1);
    expect(JSON.stringify(advisorPlan(s, 5))).toBe(JSON.stringify(advisorPlan(s, 5)));
  });
});
