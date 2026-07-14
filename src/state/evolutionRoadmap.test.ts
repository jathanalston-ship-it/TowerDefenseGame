// EVOLUTION ROADMAP (docs/ROADMAP.md — Foundation #4). Pins the coalescing contract: nodes
// derive from the SAME registry that gates the nav (the roadmap can never disagree with the
// doors), authored learning-curve order, honest stage distances off the luck-proof backbone,
// and Power numbers that match the campaign's own recommendation at the gate.

import { describe, it, expect } from 'vitest';
import { evolutionRoadmap } from './evolutionRoadmap';
import { FEATURES, featureRevealed } from './unlocks';
import { recommendedPowerScore } from '../core/campaign';
import { defaultSave } from '../save/saveStore';

describe('Evolution Roadmap — the whole future on one rail', () => {
  it('walks EVERY screen on the learning curve, in authored order', () => {
    const m = evolutionRoadmap(defaultSave());
    const screens = FEATURES.filter((f) => f.kind === 'screen');
    expect(m.nodes.length).toBe(screens.length); // nothing hidden — depth stays visible
    for (let i = 1; i < m.nodes.length; i++) {
      const a = FEATURES.find((f) => f.id === m.nodes[i - 1].id)!;
      const b = FEATURES.find((f) => f.id === m.nodes[i].id)!;
      expect(a.order).toBeLessThanOrEqual(b.order);
    }
  });

  it('agrees with the doors: revealed === featureRevealed for every node', () => {
    const fresh = defaultSave();
    const mid = { ...fresh, campaign: { ...fresh.campaign, cleared: { standard: 8 } }, totalRuns: 9 };
    for (const save of [fresh, mid]) {
      for (const n of evolutionRoadmap(save).nodes) {
        expect(n.revealed).toBe(featureRevealed(save, n.id));
        if (!n.revealed) expect(n.requirement.length).toBeGreaterThan(0); // the ask is always spelled out
      }
    }
  });

  it('distances are honest stages-ahead and Power matches the campaign at the gate', () => {
    const m = evolutionRoadmap(defaultSave());
    for (const n of m.nodes.filter((x) => !x.revealed && x.stagesAhead > 0)) {
      expect(n.powerAtUnlock).toBe(recommendedPowerScore(n.stagesAhead, 'standard')); // here=0 ⇒ gate stage
      expect(n.stagesAhead).toBeGreaterThan(0);
    }
  });

  it('progress: deeper accounts conquer more; the headline is the first upcoming node', () => {
    const fresh = evolutionRoadmap(defaultSave());
    const base = defaultSave();
    const deep = evolutionRoadmap({ ...base, campaign: { ...base.campaign, cleared: { standard: 12 } }, totalRuns: 20 });
    expect(deep.conquered).toBeGreaterThan(fresh.conquered);
    expect(fresh.next).not.toBeNull();
    expect(fresh.next!.revealed).toBe(false);
    expect(fresh.nodes.findIndex((n) => n.id === fresh.next!.id)).toBe(fresh.conquered === 0 ? 0 : fresh.nodes.findIndex((n) => !n.revealed));
  });
});
