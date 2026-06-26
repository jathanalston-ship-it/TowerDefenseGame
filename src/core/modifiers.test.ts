import { describe, it, expect } from 'vitest';
import { ModifierStack, combineMult, evalModifiers } from './modifiers';

describe('modifier framework', () => {
  it('combineMult is bit-identical to the raw product (the golden-safety guarantee)', () => {
    const a = 1.12;
    const b = 1.06;
    const c = 1.35;
    expect(combineMult(a, b, c)).toBe(a * b * c);
    expect(combineMult()).toBe(1);
    expect(combineMult(2)).toBe(2);
  });

  it('evalModifiers applies (base + Σflat) × (1 + Σpercent) × ∏mult', () => {
    const mods = [
      { op: 'flat' as const, value: 5 }, // +5 Range
      { op: 'percent' as const, value: 0.1 }, // +10%
      { op: 'percent' as const, value: 0.15 }, // +15% (summed)
      { op: 'mult' as const, value: 2 },
    ];
    expect(evalModifiers(100, mods)).toBe((100 + 5) * (1 + 0.25) * 2);
  });

  it('conditional modifiers gate on the context', () => {
    const s = new ModifierStack();
    s.add({ op: 'mult', value: 2, condition: (c) => c.overcharged === true });
    expect(s.evaluate(100)).toBe(100);
    expect(s.evaluate(100, { overcharged: true })).toBe(200);
  });

  it('temporary modifiers expire after their duration ticks down', () => {
    const s = new ModifierStack();
    s.addTemporary('percent', 0.5, 2);
    expect(s.evaluate(100)).toBe(150);
    s.tick(1);
    expect(s.evaluate(100)).toBe(150); // still active
    s.tick(1.5);
    expect(s.evaluate(100)).toBe(100); // expired & removed
    expect(s.size).toBe(0);
  });

  it('runtime add / remove by id (persistent modifiers)', () => {
    const s = new ModifierStack();
    s.add({ op: 'flat', value: 10, id: 'buff' });
    expect(s.evaluate(0)).toBe(10);
    s.remove('buff');
    expect(s.evaluate(0)).toBe(0);
  });
});
