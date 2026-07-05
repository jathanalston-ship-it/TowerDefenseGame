import { describe, it, expect } from 'vitest';
import { genomeSections, effectLabel } from './evolutionHQ';
import { defaultSave } from '../save/saveStore';
import { META_UPGRADES, upgradeEffectUnits, upgradeProblems } from '../core/config';
import { upgradeCost } from './meta';

describe('Evolution HQ read-model', () => {
  it('groups every genome upgrade into a category section (none dropped)', () => {
    const secs = genomeSections(defaultSave());
    const carded = secs.reduce((n, s) => n + s.cards.length, 0);
    expect(carded).toBe(META_UPGRADES.length);
    expect(secs.every((s) => s.cards.length > 0)).toBe(true); // no empty sections rendered
  });

  it('a fresh save reads 0% everywhere, nothing spent', () => {
    for (const s of genomeSections(defaultSave())) {
      expect(s.boughtLevels).toBe(0);
      expect(s.completionPct).toBe(0);
      expect(s.coresSpent).toBe(0);
      expect(s.cards.every((c) => c.level === 0 && c.effectNow === '—' && !c.completed)).toBe(true);
    }
  });

  it('reflects owned levels — cost, completion, effect labels', () => {
    const save = { ...defaultSave(), upgrades: { lethality: 10, adaptive_targeting: 8 } };
    const combat = genomeSections(save).find((s) => s.category === 'Combat')!;
    const leth = combat.cards.find((c) => c.id === 'lethality')!;
    expect(leth.completed).toBe(true);
    expect(leth.cost).toBeNull();
    expect(leth.effectNow).toBe('+80%'); // 0.08 × 10
    expect(combat.boughtLevels).toBeGreaterThan(0);
    expect(combat.coresSpent).toBeGreaterThan(0);
  });

  it('effectLabel formats multipliers as % and flat fields as +N (and reductions negative)', () => {
    const nucleus = META_UPGRADES.find((u) => u.id === 'nucleus')!;
    expect(effectLabel(nucleus, 3)).toBe('+75'); // flat: 25 × 3 Integrity
    expect(effectLabel(META_UPGRADES.find((u) => u.id === 'lethality')!, 2)).toBe('+16%'); // 0.08 × 2
    expect(effectLabel(META_UPGRADES.find((u) => u.id === 'neural_efficiency')!, 5)).toBe('-15%'); // −0.03 × 5
    expect(effectLabel(nucleus, 0)).toBe('—'); // nothing at level 0
  });
});

describe('Runaway (infinite) tier — the uncapped Genome Core sink (docs/EVOLUTION-HQ.md §runaway)', () => {
  const runaways = META_UPGRADES.filter((u) => u.infinite === true);

  it('every category fields exactly ONE Runaway upgrade, uncapped and validator-clean', () => {
    expect(runaways.length).toBe(6);
    expect(new Set(runaways.map((u) => u.category)).size).toBe(6);
    for (const u of runaways) {
      expect(u.maxLevel).toBe(Infinity);
      expect(upgradeProblems(u)).toEqual([]);
    }
    // the validator refuses half-configured sinks in BOTH directions
    expect(upgradeProblems({ ...runaways[0], maxLevel: 5 }).length).toBeGreaterThan(0);
    expect(upgradeProblems({ ...runaways[0], infinite: undefined }).length).toBeGreaterThan(0);
    expect(upgradeProblems({ ...runaways[0], costMult: 1.05 }).length).toBeGreaterThan(0); // sinks must compound
  });

  it('sections: the sink renders LAST, never completes, stays out of completion %, counts spend', () => {
    const upgrades: Record<string, number> = {};
    for (const u of runaways) upgrades[u.id] = 9;
    for (const s of genomeSections({ ...defaultSave(), upgrades })) {
      const sink = s.cards.filter((c) => c.infinite);
      if (sink.length === 0) continue;
      expect(s.cards[s.cards.length - 1].infinite).toBe(true);
      expect(s.completionPct).toBe(0); // the capped catalog is untouched
      expect(s.endlessLevels).toBe(9);
      expect(s.coresSpent).toBeGreaterThan(0);
      for (const c of sink) {
        expect(c.completed).toBe(false);
        expect(c.cost).not.toBeNull(); // never MAX
        expect(c.spent).toBeGreaterThan(0);
      }
    }
  });

  it('diminishing returns: √level fold — every level adds LESS than the last, but never nothing', () => {
    const u = runaways.find((x) => x.effect)!;
    const at = (n: number): number => u.effect!.perLevel * upgradeEffectUnits(u, n);
    const early = at(2) - at(1);
    const mid = at(10) - at(9);
    const deep = at(101) - at(100);
    expect(early).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(deep);
    expect(deep).toBeGreaterThan(0);
    expect(effectLabel(u, 25)).toBe('+10.0%'); // 0.02 × √25, one-decimal honesty
  });

  it('the sink compounds: cost strictly rises forever, into late-game territory', () => {
    const u = runaways[0];
    for (let l = 0; l < 40; l++) expect(upgradeCost(u, l + 1)).toBeGreaterThan(upgradeCost(u, l));
    expect(upgradeCost(u, 40)).toBeGreaterThan(upgradeCost(u, 0) * 100);
  });
});
