import { describe, it, expect } from 'vitest';
import { genomeSections, effectLabel } from './evolutionHQ';
import { defaultSave } from '../save/saveStore';
import { META_UPGRADES } from '../core/config';

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
