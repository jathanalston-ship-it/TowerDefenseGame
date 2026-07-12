// Adaptation advisor (docs/ADAPTATION.md §advisor) — the ranking is EXACT (diffs the real pure
// scorer per hypothetical pick), sorted best-gain first, honest about zero-gain behavioral
// rewrites, and only ever offers nodes the unit can actually pick with points actually free.

import { describe, expect, it } from 'vitest';
import { adaptableUnits, adaptationPicks } from './adaptationAdvisor';
import { adaptationView } from './meta';
import { powerBreakdown } from './profile';
import { defaultSave } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';

/** A save with Antigen to spend: deep campaign (+1/15 stages), container traces, achievements. */
function developed(): SaveData {
  const s = defaultSave();
  s.campaign.cleared = { standard: 30 };
  s.totalRuns = 25;
  s.antigen = 3;
  s.achievements = ['a1', 'a2', 'a3', 'a4', 'a5'];
  return s;
}

describe('adaptation advisor — exact deltas, honest ordering', () => {
  it('offers only pickable nodes on units with free points; deltas match the scorer', () => {
    const s = developed();
    const picks = adaptationPicks(s, 8);
    expect(picks.length).toBeGreaterThan(0);
    const base = powerBreakdown(s).score;
    for (const p of picks) {
      const view = adaptationView(s, p.subject, p.unit);
      expect(view.pointsAvailable).toBeGreaterThan(0);
      const nv = view.nodes.find((n) => n.node.id === p.nodeId);
      expect(nv?.canPick).toBe(true);
      expect(nv?.chosen).toBe(false);
      // The delta is EXACTLY the scorer diff for that single hypothetical pick.
      const after = powerBreakdown({
        ...s, adaptation: { ...s.adaptation, [`${p.subject}:${p.unit}`]: [...view.chosen, p.nodeId] },
      }).score;
      expect(p.powerDelta).toBe(Math.max(0, Math.round(after - base)));
    }
    // Sorted best-gain first.
    for (let i = 1; i < picks.length; i++) expect(picks[i - 1].powerDelta).toBeGreaterThanOrEqual(picks[i].powerDelta);
  });

  it('a fresh save advises quietly (no Antigen ⇒ no picks, never a crash)', () => {
    expect(adaptationPicks(defaultSave(), 8)).toEqual([]);
  });

  it('adaptableUnits lists only unlocked units and carries their free budgets', () => {
    const s = developed();
    const units = adaptableUnits(s);
    expect(units.length).toBeGreaterThan(0);
    for (const u of units) {
      expect(u.free).toBe(adaptationView(s, u.subject, u.unit).pointsAvailable);
    }
  });
});
