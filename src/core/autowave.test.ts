import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { AUTO_START_DELAY, AUTO_START_FIRST_DELAY, SIM_DT } from './config';
import { towerSlots } from './map';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

/** Advance the sim while it sits in prep, up to a time budget; returns the seconds elapsed. */
function runPrep(g: Game, budget = AUTO_START_FIRST_DELAY + 2): number {
  let t = 0;
  while (g.phase === 'prep' && t < budget) { g.advance(SIM_DT); t += SIM_DT; }
  return t;
}

describe('auto-wave-start system', () => {
  it('is OFF by default — prep never auto-advances (the golden-safe default)', () => {
    const g = new Game(1, NO_META);
    for (let i = 0; i < 600; i++) g.advance(SIM_DT); // 10s sat in prep
    expect(g.phase).toBe('prep');
    expect(g.getSnapshot().autoStart).toBe(false);
  });

  it('armed but INACTIVE before the first action — countdown frozen, never auto-fires on an empty board', () => {
    const g = new Game(1, NO_META);
    g.setAutoStart(true);
    const a = g.getSnapshot();
    expect(a.autoStart).toBe(true);
    expect(a.autoStartWaiting).toBe(true); // drives the "Waiting for first placement…" HUD state
    expect(a.autoStartIn).toBe(0); // no countdown has begun
    for (let i = 0; i < 900; i++) g.advance(SIM_DT); // 15s — well past any auto-start delay
    expect(g.phase).toBe('prep'); // still waiting; the run never auto-fired before a placement
    expect(g.getSnapshot().autoStartWaiting).toBe(true);
  });

  it('ARMS on the first tower, then auto-fires after the (extended) first-prep delay', () => {
    const g = new Game(1, NO_META);
    g.setAutoStart(true);
    g.placeTower('needle', towerSlots[0].x, towerSlots[0].y); // first action → arm
    const a = g.getSnapshot();
    expect(a.autoStartWaiting).toBe(false);
    expect(a.autoStartIn).toBeCloseTo(AUTO_START_FIRST_DELAY, 1); // now counting (opening window)
    const t = runPrep(g);
    expect(g.phase).toBe('wave');
    expect(t).toBeGreaterThanOrEqual(AUTO_START_FIRST_DELAY - 0.2); // it waited ~the delay, not instant
  });

  it('ARMS when the player manually starts wave 1 (no tower placed)', () => {
    const g = new Game(3, NO_META);
    g.setAutoStart(true);
    expect(g.getSnapshot().autoStartWaiting).toBe(true); // armed, waiting
    g.startWave(); // manual wave 1 → arm (no tower required)
    expect(g.phase).toBe('wave');
    expect(g.getSnapshot().autoStartWaiting).toBe(false); // active for the rest of the run
  });

  it('exposes the live countdown in the HUD snapshot, ticking down (once armed)', () => {
    const g = new Game(2, NO_META);
    g.setAutoStart(true);
    g.placeTower('needle', towerSlots[0].x, towerSlots[0].y); // arm
    const a = g.getSnapshot();
    expect(a.autoStart).toBe(true);
    expect(a.autoStartIn).toBeGreaterThan(0);
    expect(a.autoStartIn).toBeLessThanOrEqual(AUTO_START_FIRST_DELAY);
    for (let i = 0; i < 60; i++) g.advance(SIM_DT); // ~1s of prep
    expect(g.getSnapshot().autoStartIn).toBeLessThan(a.autoStartIn);
  });

  it('resets the countdown for each new prep (after a draft)', () => {
    const g = new Game(3, NO_META);
    g.setAutoStart(true);
    g.placeTower('needle', towerSlots[0].x, towerSlots[0].y); // arm so wave 1 auto-starts
    let guard = 0;
    while (g.phase !== 'draft' && guard++ < 200_000) g.advance(SIM_DT); // auto-start wave 1, play it out
    expect(g.phase).toBe('draft');
    g.chooseCard(g.getSnapshot().draft![0].id);
    expect(g.phase).toBe('prep');
    expect(g.getSnapshot().autoStartIn).toBeGreaterThan(AUTO_START_DELAY - 0.05); // a fresh full countdown
  });

  it('the FIRST tower of the opening prep grants a longer setup window', () => {
    const g = new Game(1, NO_META);
    g.setAutoStart(true);
    expect(g.getSnapshot().autoStartIn).toBe(0); // frozen until the first action
    g.placeTower('needle', towerSlots[0].x, towerSlots[0].y);
    expect(g.getSnapshot().autoStartIn).toBeCloseTo(AUTO_START_FIRST_DELAY, 1); // extended on the first tower
    // A second tower does NOT re-extend (only the first triggers the longer window).
    for (let i = 0; i < 60; i++) g.advance(SIM_DT); // ~1s ticks down
    const ticked = g.getSnapshot().autoStartIn;
    g.placeTower('reactor', towerSlots[1].x, towerSlots[1].y);
    expect(g.getSnapshot().autoStartIn).toBeCloseTo(ticked, 1); // unchanged by the 2nd tower
  });

  it('later preps use the normal delay — the longer window is opening-only', () => {
    const g = new Game(3, NO_META);
    g.setAutoStart(true);
    g.placeTower('needle', towerSlots[0].x, towerSlots[0].y); // arm
    let guard = 0;
    while (g.phase !== 'draft' && guard++ < 200_000) g.advance(SIM_DT); // auto-start wave 1, play it out
    g.chooseCard(g.getSnapshot().draft![0].id);
    expect(g.waveIndex).toBeGreaterThanOrEqual(1);
    g.placeTower('mortar', towerSlots[1].x, towerSlots[1].y); // first tower of THIS prep, but a wave has started
    expect(g.getSnapshot().autoStartIn).toBeLessThanOrEqual(AUTO_START_DELAY); // no longer window
  });
});
