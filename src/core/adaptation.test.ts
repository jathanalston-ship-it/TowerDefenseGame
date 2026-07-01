import { describe, it, expect } from 'vitest';
import { adaptationEffect, adaptPointsEarned, canPickAdapt, neutralAdaptEffect, adaptNodesFor } from './adaptation';
import { meta } from '../state/meta';
import { defaultSave, serializeExport } from '../save/saveStore';
import { TOWER_ORDER } from './config';

describe('Adaptation — mastery becomes a decision (golden-safe)', () => {
  it('an empty pick set folds to the NEUTRAL effect (a fresh unit is byte-identical)', () => {
    expect(adaptationEffect([])).toEqual(neutralAdaptEffect());
  });

  it('grants one Antigen Point per mastery Rank (every 25 levels)', () => {
    expect(adaptPointsEarned(0)).toBe(0);
    expect(adaptPointsEarned(24)).toBe(0);
    expect(adaptPointsEarned(25)).toBe(1);
    expect(adaptPointsEarned(50)).toBe(2);
  });

  it('branch tiers unlock in order and never double-buy', () => {
    const t2 = adaptNodesFor('tower').find((n) => n.tier === 2)!;
    const t1 = adaptNodesFor('tower').find((n) => n.branch === t2.branch && n.tier === 1)!;
    expect(canPickAdapt(t2.id, [])).toBe(false); // tier 2 gated on a tier-1 pick
    expect(canPickAdapt(t1.id, [])).toBe(true);
    expect(canPickAdapt(t2.id, [t1.id])).toBe(true);
    expect(canPickAdapt(t1.id, [t1.id])).toBe(false); // already owned
  });

  it('folds a chosen node into a multiplier', () => {
    expect(adaptationEffect(['t.vir.1']).damageMult).toBeCloseTo(1.08, 5);
    expect(adaptationEffect(['h.res.1']).heroCooldownMult).toBeCloseTo(0.92, 5);
  });

  it('meta: spend refused without points; succeeds with a Rank; respec refunds', () => {
    const t = TOWER_ORDER[0];
    meta.importText(serializeExport(defaultSave()));
    expect(meta.spendAdaptation('tower', t, 't.vir.1')).toBe(false); // 0 mastery ⇒ 0 points
    meta.importText(serializeExport({ ...defaultSave(), towerMasteryXp: { ...defaultSave().towerMasteryXp, [t]: 1e9 } }));
    expect(meta.adaptation('tower', t).pointsAvailable).toBeGreaterThan(0);
    expect(meta.spendAdaptation('tower', t, 't.vir.1')).toBe(true);
    expect(meta.get().adaptation[`tower:${t}`]).toEqual(['t.vir.1']);
    expect(meta.spendAdaptation('tower', t, 't.res.2')).toBe(false); // tier-2 gated (no res tier-1)
    meta.respecAdaptation('tower', t);
    expect(meta.get().adaptation[`tower:${t}`]).toBeUndefined();
  });
});
