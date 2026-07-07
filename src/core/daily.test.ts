// Daily Run generator invariants (docs/DAILY-RUN.md): one UTC day ⇒ one deterministic plan (the
// SAME run worldwide), the plan is complete + well-formed, the modifier framework resolves
// neutrally without modifiers, and the date helpers hold.

import { describe, it, expect } from 'vitest';
import { DAILY, TOWER_ORDER, HERO_ORDER } from './config';
import { BIOMES } from './biomes';
import {
  dailyKey, dailySeed, generateDaily, isPrevDayKey, msUntilDailyReset, pickDailyHero,
} from './daily';
import { NEUTRAL_EFFECTS, combinedEffects, dailyModifierRegistry, DAILY_MODIFIERS } from './dailyModifiers';

const KEY = '2026-07-07';

describe('daily plan — determinism + worldwide identity', () => {
  it('the same key generates the SAME plan, every time (one run worldwide)', () => {
    const a = generateDaily(KEY);
    const b = generateDaily(KEY);
    expect(a.seed).toBe(b.seed);
    expect(a.biomeId).toBe(b.biomeId);
    expect(a.modifierIds).toEqual(b.modifierIds);
    expect(a.towerPool).toEqual(b.towerPool);
    expect(a.stage.waves).toEqual(b.stage.waves);
    expect(a.stage.boss.id).toBe(b.stage.boss.id);
    expect(Object.keys(a.stage.bossWaves ?? {})).toEqual(Object.keys(b.stage.bossWaves ?? {}));
    expect(a.recommendedPower).toBe(b.recommendedPower);
  });

  it('different days roll different runs (the plan actually varies)', () => {
    const keys = Array.from({ length: 12 }, (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}`);
    const sigs = new Set(keys.map((k) => {
      const p = generateDaily(k);
      return `${p.biomeId}|${p.modifierIds.join(',')}|${p.towerPool.join(',')}`;
    }));
    expect(sigs.size).toBeGreaterThan(6); // most days are distinct fingerprints
  });
});

describe('daily plan — shape (the day contract)', () => {
  const plan = generateDaily(KEY);

  it('is a 20-wave stage with the seeded mid-boss roster + finale', () => {
    expect(plan.stage.waveCount).toBe(DAILY.waveCount);
    expect(plan.stage.waves.length).toBe(DAILY.waveCount);
    const [w7, w14] = DAILY.bossWaves;
    expect(plan.stage.bossWaves?.[w7]).toBeDefined();
    expect(plan.stage.bossWaves?.[w14]).toBeDefined();
    expect(plan.stage.boss).toBeDefined(); // the finale rides the stage boss slot (wave 20)
    expect(plan.stage.miniBoss).toBeNull(); // the roster replaces the campaign mini-boss lane
    expect(plan.stage.startBiomassBonus).toBe(0); // challenge mode — no opening aid
  });

  it('rolls a registry biome, TWO distinct registered modifiers, and a 3-tower pool', () => {
    expect(BIOMES.some((b) => b.id === plan.biomeId)).toBe(true);
    expect(plan.modifierIds.length).toBe(DAILY.modifierCount);
    expect(new Set(plan.modifierIds).size).toBe(DAILY.modifierCount); // distinct
    for (const id of plan.modifierIds) expect(dailyModifierRegistry.get(id)).toBeDefined();
    expect(plan.towerPool.length).toBe(DAILY.poolSize);
    for (const k of plan.towerPool) expect(TOWER_ORDER).toContain(k);
  });

  it('estimates difficulty + recommended power on the universal index', () => {
    expect(['Routine', 'Tense', 'Harsh', 'Brutal']).toContain(plan.difficultyEstimate.label);
    expect(plan.difficultyEstimate.scalar).toBeGreaterThan(0);
    expect(plan.recommendedPower).toBeGreaterThan(1000); // scaled off POWER_BASE at stage 12+
  });
});

describe('daily modifiers — the resolved-effects framework', () => {
  it('resolves NEUTRAL without modifiers (the golden-safety contract)', () => {
    expect(combinedEffects([])).toEqual(NEUTRAL_EFFECTS);
    expect(combinedEffects(['__unknown__'])).toEqual(NEUTRAL_EFFECTS); // stale ids never crash a boot
  });

  it('merges: mults multiply, adds add, eliteChance maxes, cadence takes the tightest', () => {
    const r = combinedEffects(['overrun', 'famine']);
    expect(r.enemySpeedMult).toBeCloseTo(DAILY.mod.enemySpeedMult, 5);
    expect(r.incomeMult).toBeCloseTo(DAILY.mod.incomeMult, 5);
    const both = combinedEffects(['infestation', 'dormancy']);
    expect(both.eliteChance).toBeCloseTo(DAILY.mod.eliteChance, 5);
    expect(both.draftEveryWaves).toBe(DAILY.mod.draftEveryWaves);
  });

  it('ships the core ten, all registered with real effects', () => {
    expect(DAILY_MODIFIERS.length).toBeGreaterThanOrEqual(10);
    for (const m of DAILY_MODIFIERS) {
      expect(dailyModifierRegistry.get(m.id)).toBeDefined();
      expect(Object.keys(m.effects).length).toBeGreaterThan(0);
      expect(m.severity).toBeGreaterThanOrEqual(1);
      expect(m.severity).toBeLessThanOrEqual(3);
    }
  });
});

describe('date helpers', () => {
  it('dailyKey/dailySeed are UTC-stable; the reset countdown is within a day', () => {
    expect(dailyKey(new Date('2026-07-07T23:59:59Z'))).toBe('2026-07-07');
    expect(dailyKey(new Date('2026-07-08T00:00:01Z'))).toBe('2026-07-08');
    expect(dailySeed(KEY)).toBe(dailySeed(KEY));
    expect(dailySeed('2026-07-08')).not.toBe(dailySeed(KEY));
    const ms = msUntilDailyReset(new Date('2026-07-07T18:00:00Z'));
    expect(ms).toBe(6 * 3600 * 1000);
  });

  it('isPrevDayKey recognises consecutive UTC days (streak continuation)', () => {
    expect(isPrevDayKey('2026-07-06', '2026-07-07')).toBe(true);
    expect(isPrevDayKey('2026-06-30', '2026-07-01')).toBe(true); // month boundary
    expect(isPrevDayKey('2026-07-05', '2026-07-07')).toBe(false);
    expect(isPrevDayKey('', '2026-07-07')).toBe(false);
  });

  it('pickDailyHero returns a roster member, stable under roster ORDER', () => {
    const seed = dailySeed(KEY);
    const a = pickDailyHero(seed, [...HERO_ORDER]);
    const b = pickDailyHero(seed, [...HERO_ORDER].reverse());
    expect(a).toBe(b); // order-independent (sorted internally)
    expect(HERO_ORDER).toContain(a);
  });
});
