// HIVE CALL (docs/HIVE-MIND.md §hive-call): with Auto Wave on, on solved content, the hive calls the
// next wave early when its forecast says the board holds with a wide margin. Pins the forecast's
// rules (pure), the wiring (OFF unless Auto Wave AND the automation gate are on — golden-safe and
// fail-closed), that a strong board gets called through the real Early Call path, never into a
// boss wave, and deterministically.

import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { HIVE_CALL, hiveCallForecast } from './hivemind';
import type { HiveCallRead } from './hivemind';
import { DIRECTOR, SIM_DT } from './config';
import { towerSlots } from './map';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

const READ: HiveCallRead = {
  coreTouched: false, integrityFrac: 1, kills: 20, spawnedFrac: 0.9, deepest: 0.15, front: 0,
  remainingHp: 200, waveHp: 1000, boss: false,
};

describe('hive call — the forecast', () => {
  it('a board that kills high on the field calls; the margin is the allowed stretch over the projected one', () => {
    const f = hiveCallForecast(READ);
    const load = (READ.remainingHp + READ.waveHp * HIVE_CALL.nextWaveGrowth) / READ.waveHp;
    expect(f.projected).toBeCloseTo(READ.deepest * load, 10); // front 0: the whole depth scales
    expect(f.margin).toBeCloseTo(HIVE_CALL.safeShare / f.projected, 10);
    expect(f.call).toBe(true);
    expect(f.hold).toBeNull();
  });

  it('holds when enemies already get deep, when the wave is mostly still to come, or the read is thin', () => {
    expect(hiveCallForecast({ ...READ, deepest: 0.45 }).hold).toBe('too-deep'); // 0.45 × 1.5 = 0.675 > 0.6
    expect(hiveCallForecast({ ...READ, deepest: 0.25 }).call).toBe(true); // 0.25 × 1.5 = 0.375 — fine on a light field…
    expect(hiveCallForecast({ ...READ, deepest: 0.3, remainingHp: 900 }).hold).toBe('too-deep'); // 0.3 is fine light, not with a heavy field alive (× 2.2 = 0.66)
    expect(hiveCallForecast({ ...READ, spawnedFrac: 0.4 }).hold).toBe('too-early');
    expect(hiveCallForecast({ ...READ, kills: 2 }).hold).toBe('too-early');
  });

  it('never calls into or over a boss, after any Core damage, or on a wounded Core', () => {
    expect(hiveCallForecast({ ...READ, boss: true }).hold).toBe('boss');
    expect(hiveCallForecast({ ...READ, coreTouched: true }).hold).toBe('core-touched');
    expect(hiveCallForecast({ ...READ, integrityFrac: 0.5 }).hold).toBe('core-low');
  });

  it('only the distance past FIRST CONTACT scales with load — a mid-field kill zone that kills on contact calls', () => {
    // Towers reach only from 30 % down: enemies dying at 35 % are dying on contact (excess 0.05).
    expect(hiveCallForecast({ ...READ, front: 0.3, deepest: 0.35 }).call).toBe(true);
    // The same front, but enemies survive to 60 %: 0.3 past contact × 1.5 load = 0.45 > 60 % of the 0.7 left.
    expect(hiveCallForecast({ ...READ, front: 0.3, deepest: 0.6 }).hold).toBe('too-deep');
    // Nothing covers the path: never.
    expect(hiveCallForecast({ ...READ, front: 1, deepest: 0.9 }).call).toBe(false);
  });

  it('an instant kill zone still reads a floor depth (never divides by zero)', () => {
    const f = hiveCallForecast({ ...READ, deepest: 0 });
    expect(f.projected).toBeGreaterThan(0);
    expect(Number.isFinite(f.margin)).toBe(true);
  });
});

// A board strong enough that the first waves die near the spawn row.
const STRONG: TowerKind[] = ['needle', 'mortar', 'coil', 'spitfang', 'needle', 'mortar', 'coil', 'spitfang', 'needle', 'mortar'];
function strongEndless(seed: number, opts: { automationAllowed: boolean; autoWave: boolean }): Game {
  const g = new Game(seed, NO_META, undefined, 'ravager', undefined, { mode: 'endless', automationAllowed: opts.automationAllowed, earlyCall: true });
  g.debugAddBiomass(6000);
  const forward = [...towerSlots].sort((a, b) => a.y - b.y);
  let placed = 0;
  for (const s of forward) if (g.placeTower(STRONG[placed], s.x, s.y) && ++placed >= STRONG.length) break;
  g.setAutoStart(opts.autoWave);
  g.startWave();
  return g;
}
/** Play to `seconds` of sim time: drafts take the first card, the hive pulses each prep, and with
 *  Auto Wave off the harness starts each wave itself. Returns every hive call seen. */
function play(g: Game, seconds: number, autoWave: boolean): { wave: number; margin: number }[] {
  const calls: { wave: number; margin: number }[] = [];
  let wasPrep = false;
  for (let t = 0; t < seconds && g.phase !== 'lost'; t += SIM_DT) {
    if (g.phase === 'draft' && g.draft && g.draft.length > 0) g.chooseCard(g.draft[0].id);
    const c = g.getSnapshot().hiveCall;
    if (c && (calls.length === 0 || calls[calls.length - 1].wave !== c.wave)) calls.push({ wave: c.wave, margin: c.margin });
    const isPrep = g.phase === 'prep';
    if (isPrep && !wasPrep) {
      g.hivePulse();
      if (!autoWave) g.startWave();
    }
    wasPrep = isPrep;
    g.advance(SIM_DT);
  }
  return calls;
}

describe('hive call — in the sim', () => {
  it('is OFF unless Auto Wave AND the automation gate are both on (fail-closed, golden-safe)', () => {
    expect(play(strongEndless(3, { automationAllowed: false, autoWave: true }), 120, true)).toEqual([]);
    expect(play(strongEndless(3, { automationAllowed: true, autoWave: false }), 120, false)).toEqual([]);
    expect(new Game(3, NO_META).getSnapshot().hiveCall).toBeNull();
  });

  it('a strong board gets called early through the real Early Call — never into a boss wave', () => {
    const g = strongEndless(3, { automationAllowed: true, autoWave: true });
    const calls = play(g, 150, true);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.margin).toBeGreaterThanOrEqual(1); // only comfortable forecasts call
      expect(c.wave % DIRECTOR.bossEvery).not.toBe(0); // the director's boss cadence (Standard)
    }
    expect(g.getSnapshot().hiveCall!.bonus).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic: the same seed calls the same waves', () => {
    const a = play(strongEndless(11, { automationAllowed: true, autoWave: true }), 150, true);
    const b = play(strongEndless(11, { automationAllowed: true, autoWave: true }), 150, true);
    expect(a).toEqual(b);
  });
});
