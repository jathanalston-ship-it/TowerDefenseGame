import { describe, it, expect } from 'vitest';
import {
  HERO_EVO, HERO_EVO_CATEGORIES, HERO_EVO_BY_ID, HERO_CRIT_BASE,
  deriveHeroEvoMods, heroEvoCost, heroEvoEffects, heroEvoValue, heroEvoTotalOwned, heroEvoEffectLabel,
  NEUTRAL_HERO_EVO,
} from './heroEvolution';
import { effectsPower } from './power';

describe('hero evolution — data', () => {
  it('exposes exactly the 10 launch axes, each with a unique id and a real field', () => {
    expect(HERO_EVO_CATEGORIES).toHaveLength(10);
    const ids = new Set(HERO_EVO_CATEGORIES.map((c) => c.id));
    expect(ids.size).toBe(10);
    for (const c of HERO_EVO_CATEGORIES) {
      expect(HERO_EVO_BY_ID[c.id]).toBe(c);
      expect(['mul', 'add']).toContain(c.op);
      expect(c.baseCost).toBeGreaterThan(0);
    }
  });
});

describe('hero evolution — cost model (progressive, no exponential spikes)', () => {
  const dmg = HERO_EVO_BY_ID.damage;

  it('level 1 of a fresh category costs its base', () => {
    expect(heroEvoCost(dmg, 0, 0)).toBe(dmg.baseCost);
  });

  it('cost rises with the category level (strictly, same total owned)', () => {
    let prev = 0;
    for (let lvl = 0; lvl < HERO_EVO.maxLevel; lvl++) {
      const c = heroEvoCost(dmg, lvl, 0);
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
  });

  it('every purchase ANYWHERE raises all future costs (the global ramp)', () => {
    expect(heroEvoCost(dmg, 0, 8)).toBeGreaterThan(heroEvoCost(dmg, 0, 0));
  });

  it('is LINEAR, not exponential — maxing a category stays affordable', () => {
    const ratio = heroEvoCost(dmg, HERO_EVO.maxLevel - 1, 0) / heroEvoCost(dmg, 0, 0);
    expect(ratio).toBeLessThan(8); // ≈ 1 + 0.6·9 = 6.4×, nowhere near 2^9
  });
});

describe('hero evolution — derivation', () => {
  it('no purchases ⇒ the neutral bundle (golden-safe)', () => {
    expect(deriveHeroEvoMods({})).toEqual(NEUTRAL_HERO_EVO);
  });

  it('folds mul / add / inverse axes correctly', () => {
    expect(deriveHeroEvoMods({ damage: 5 }).damageMult).toBeCloseTo(1.5, 10); // +10%·5
    expect(deriveHeroEvoMods({ cooldown: 10 }).cooldownMult).toBeCloseTo(0.6, 10); // −4%·10 (inverse)
    expect(deriveHeroEvoMods({ critchance: 10 }).critChance).toBeCloseTo(0.3, 10);
    expect(deriveHeroEvoMods({ armor: 10 }).armor).toBeCloseTo(0.3, 10);
    expect(deriveHeroEvoMods({ critdamage: 10 }).critDamageBonus).toBeCloseTo(1.5, 10); // crit ×3.0
  });

  it('heroEvoTotalOwned sums all category levels', () => {
    expect(heroEvoTotalOwned({ damage: 3, armor: 2, health: 1 })).toBe(6);
  });

  it('labels read cleanly (incl. the inverse cooldown and the crit-damage multiplier)', () => {
    expect(heroEvoEffectLabel(HERO_EVO_BY_ID.damage, 5)).toBe('+50%');
    expect(heroEvoEffectLabel(HERO_EVO_BY_ID.cooldown, 5)).toBe('−20%');
    expect(heroEvoEffectLabel(HERO_EVO_BY_ID.critdamage, 0)).toBe(`×${HERO_CRIT_BASE.toFixed(2)}`);
    expect(heroEvoEffectLabel(HERO_EVO_BY_ID.health, 0)).toBe('—');
  });
});

describe('hero evolution — Power Score integration (no exceptions)', () => {
  it('nothing bought ⇒ neutral (1) temporary power', () => {
    expect(effectsPower(heroEvoEffects({}))).toBe(1);
  });

  it('EVERY category individually raises Power when leveled', () => {
    for (const c of HERO_EVO_CATEGORIES) {
      const p = effectsPower(heroEvoEffects({ [c.id]: 1 }));
      expect(p, `${c.id} must move Power`).toBeGreaterThan(1);
    }
  });

  it('Power rises monotonically as a category deepens', () => {
    let prev = 1;
    for (let lvl = 1; lvl <= HERO_EVO.maxLevel; lvl++) {
      const p = effectsPower(heroEvoEffects({ damage: lvl }));
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
  });

  it('heroEvoValue is neutral at level 0 for every op', () => {
    for (const c of HERO_EVO_CATEGORIES) {
      expect(heroEvoValue(c, 0)).toBe(c.op === 'mul' ? 1 : 0);
    }
  });
});
