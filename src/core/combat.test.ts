import { describe, expect, it } from 'vitest';
import { damageAfter, effectiveArmor, fractureCap, shredBurst, shredReady } from './combat';
import { STATUS } from './config';

describe('combat rules math', () => {
  it('effectiveArmor is zero while armor-broken', () => {
    expect(effectiveArmor({ baseArmor: 10, fracture: 0, corrosion: 0 }, true)).toBe(0);
  });

  it('effectiveArmor: fracture + corrosion shred armor, floored at 0', () => {
    expect(effectiveArmor({ baseArmor: 10, fracture: 0, corrosion: 0 }, false)).toBe(10);
    expect(effectiveArmor({ baseArmor: 10, fracture: 2, corrosion: 0 }, false)).toBe(
      Math.max(0, 10 - 2 * STATUS.fractureArmorShred),
    );
    expect(effectiveArmor({ baseArmor: 10, fracture: 0, corrosion: 1 }, false)).toBe(
      Math.max(0, 10 - STATUS.corrosionArmorShred),
    );
    expect(effectiveArmor({ baseArmor: 1, fracture: 99, corrosion: 1 }, false)).toBe(0);
  });

  it('damageAfter = raw × vulnMult − armor, floored at 1', () => {
    expect(damageAfter(10, 1, 3)).toBe(7);
    expect(damageAfter(5, 1, 100)).toBe(1); // floor
    expect(damageAfter(10, 1.5, 0)).toBe(15); // vulnerability multiplier
  });

  it('fractureCap adds the run bonus to the base cap', () => {
    expect(fractureCap(0)).toBe(STATUS.fractureMaxStacks);
    expect(fractureCap(3)).toBe(STATUS.fractureMaxStacks + 3);
  });

  it('shredReady needs both statuses; shredBurst scales with fracture', () => {
    expect(shredReady(0, 5)).toBe(false);
    expect(shredReady(1, 0)).toBe(false);
    expect(shredReady(1, 0.1)).toBe(true);
    expect(shredBurst(0)).toBe(STATUS.shredBase);
    expect(shredBurst(4)).toBe(STATUS.shredBase + STATUS.shredPerStack * 4);
  });
});
