// Guards the universal status-effect framework: the configurable stacking rules,
// duration/refresh/expiry, the per-tick damage/heal deltas, and the aggregated
// control/debuff state the sim reads. Pure engine — no Game needed.

import { describe, it, expect } from 'vitest';
import { applyStatus, tickStatuses, aggregate, statusRegistry, STATUS_EFFECTS } from './status';
import type { ActiveStatus } from './status';
import { validateAllContent } from './validate';
import { Game } from './game';
import { SIM_DT } from './config';
import type { MetaModifiers } from './types';

const E = STATUS_EFFECTS;

describe('status stacking rules', () => {
  it("'stack' accumulates up to maxStacks and refreshes duration", () => {
    const list: ActiveStatus[] = [];
    applyStatus(list, E.burn, 2);
    applyStatus(list, E.burn, 2);
    expect(list[0].stacks).toBe(4);
    applyStatus(list, E.burn, 10);
    expect(list[0].stacks).toBe(E.burn.maxStacks); // capped at 5
  });

  it("'refresh' resets duration without adding stacks", () => {
    const list: ActiveStatus[] = [];
    applyStatus(list, E.slow);
    list[0].remaining = 0.2;
    applyStatus(list, E.slow);
    expect(list[0].remaining).toBe(E.slow.baseDuration); // refreshed
    expect(list[0].stacks).toBe(1);
  });

  it("'extend' adds duration; 'ignore' keeps the first instance", () => {
    const ext: ActiveStatus[] = [];
    applyStatus(ext, E.poison);
    applyStatus(ext, E.poison);
    expect(ext[0].remaining).toBeCloseTo(E.poison.baseDuration * 2, 6);

    const ign: ActiveStatus[] = [];
    applyStatus(ign, E.stun);
    ign[0].remaining = 0.1;
    applyStatus(ign, E.stun); // ignored
    expect(ign[0].remaining).toBeCloseTo(0.1, 6);
  });
});

describe('status ticking', () => {
  it('deals DoT (armor-respecting vs true), heals regen, and expires', () => {
    const list: ActiveStatus[] = [];
    applyStatus(list, E.burn, 3); // 5 dps × 3 stacks, armor-respecting
    applyStatus(list, E.poison); // 6 dps, armor-ignoring
    applyStatus(list, E.regen); // 8 hp/s
    const r = tickStatuses(list, 1);
    expect(r.dotDamage).toBeCloseTo(15, 6); // burn
    expect(r.trueDamage).toBeCloseTo(6, 6); // poison ignores armor
    expect(r.heal).toBeCloseTo(8, 6); // regen

    const brief: ActiveStatus[] = [];
    applyStatus(brief, E.stun); // 1.0s
    tickStatuses(brief, 1.0);
    expect(brief.length).toBe(0); // expired & removed
  });
});

describe('status aggregate (combined control/debuff)', () => {
  it('takes the strongest slow, sums vulnerability, and flags disabled', () => {
    const list: ActiveStatus[] = [];
    applyStatus(list, E.slow); // 0.4 slow
    applyStatus(list, E.freeze); // 1.0 slow + disables
    applyStatus(list, E.fracture, 3); // +4% dmg taken × 3 stacks
    const a = aggregate(list);
    expect(a.slowPct).toBe(1); // strongest (freeze)
    expect(a.damageTakenMult).toBeCloseTo(0.12, 6); // 0.04 × 3
    expect(a.disabled).toBe(true); // freeze disables
  });
});

describe('status registry', () => {
  it('registers the catalog and passes content validation', () => {
    expect(statusRegistry.size).toBeGreaterThanOrEqual(13);
    expect(statusRegistry.has('burn')).toBe(true);
    expect(validateAllContent()).toEqual([]); // shipped status defs are valid
  });
});

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

describe('framework status integration (a NEW effect works end-to-end)', () => {
  it('Burn applied via Game.applyEffect bleeds the enemy each tick', () => {
    const game = new Game(1, NO_META);
    game.startWave();
    game.debugSpawn('runner', 1);
    game.advance(SIM_DT); // let it spawn
    const e = game.enemies[0];
    expect(e).toBeTruthy();
    game.applyEffect(e, 'burn', 3); // 5 dps × 3 stacks
    const before = e.hp;
    for (let i = 0; i < 60; i++) game.advance(SIM_DT); // ~1s
    expect(e.hp).toBeLessThan(before); // the generic engine dealt DoT — no bespoke code
  });
});
