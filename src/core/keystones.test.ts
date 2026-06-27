import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { defaultRunModifiers } from './cards';
import type { CardEffect, RunModifiers } from './cards';
import { RELICS } from './equipment';
import { simulateBattle } from './simharness';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0 };

/** Fold a declarative effect list into run modifiers (mirrors the Game's run-start fold). */
function fold(effects: CardEffect[]): RunModifiers {
  const m = defaultRunModifiers() as unknown as Record<string, number | boolean>;
  for (const e of effects) {
    if (e.op === 'mul') (m[e.field] as number) *= e.value;
    else if (e.op === 'add') (m[e.field] as number) += e.value;
    else if (e.op === 'flag') m[e.field] = true;
  }
  return m as unknown as RunModifiers;
}
const relic = (id: string): CardEffect[] => RELICS.find((r) => r.id === id)!.base;

describe('keystones', () => {
  it('default run modifiers are neutral (the golden-safety invariant)', () => {
    const m = defaultRunModifiers();
    expect(m.executeThreshold).toBe(0);
    expect(m.lastStandThreshold).toBe(0);
    expect(m.lastStandMult).toBe(1);
    expect(m.damagePerEmptySlot).toBe(0);
    expect(m.damagePerTower).toBe(0);
    expect(m.reactionRepeats).toBe(0);
    expect(m.enemyHpRunMult).toBe(1);
  });

  it('the six rule-bender relics resolve to their real keystone effects', () => {
    expect(fold(relic('r_executioner')).executeThreshold).toBe(0.15);
    const ls = fold(relic('r_laststand'));
    expect(ls.lastStandThreshold).toBe(0.25);
    expect(ls.lastStandMult).toBe(3);
    expect(fold(relic('r_famine')).damagePerEmptySlot).toBe(0.04);
    expect(fold(relic('r_swarm')).damagePerTower).toBe(0.03);
    const hv = fold(relic('r_hivemind'));
    expect(hv.reactionRepeats).toBe(1);
    expect(hv.enemyHpRunMult).toBeCloseTo(1.1);
    expect(fold(relic('r_cascade')).reactionRepeats).toBe(1);
  });

  it('enemyHpRunMult scales spawned enemy HP exactly', () => {
    const g = new Game(1, NO_META, undefined, undefined, undefined, { runEffects: [{ op: 'mul', field: 'enemyHpRunMult', value: 2 }] });
    g.debugSpawn('runner', 1);
    const g0 = new Game(1, NO_META);
    g0.debugSpawn('runner', 1);
    expect(g.enemies[0].maxHp).toBeCloseTo(2 * g0.enemies[0].maxHp);
  });

  it('the Famine keystone (damage per empty slot) changes a real run', () => {
    const base = simulateBattle({ seed: 7, maxWaves: 6 });
    const famine = simulateBattle({ seed: 7, maxWaves: 6, runEffects: [{ op: 'add', field: 'damagePerEmptySlot', value: 0.5 }] });
    expect(famine).not.toEqual(base);
    expect(famine.totalTowerDamage).toBeGreaterThan(base.totalTowerDamage);
  });

  it('the Executioner keystone changes a real run (culls low-HP hosts)', () => {
    const base = simulateBattle({ seed: 42, maxWaves: 6 });
    const exec = simulateBattle({ seed: 42, maxWaves: 6, runEffects: [{ op: 'add', field: 'executeThreshold', value: 0.2 }] });
    expect(exec).not.toEqual(base);
  });
});
