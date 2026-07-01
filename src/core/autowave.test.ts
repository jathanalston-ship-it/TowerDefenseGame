import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { AUTO_START_DELAY, AUTO_START_FIRST_DELAY, SIM_DT } from './config';
import { towerSlots } from './map';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

describe('auto-wave-start system', () => {
  it('is OFF by default — prep never auto-advances (the golden-safe default)', () => {
    const g = new Game(1, NO_META);
    for (let i = 0; i < 600; i++) g.advance(SIM_DT); // 10s sat in prep
    expect(g.phase).toBe('prep');
    expect(g.getSnapshot().autoStart).toBe(false);
  });

  it('does not count down until the first tower is placed, then fires after the countdown', () => {
    const g = new Game(1, NO_META);
    g.setAutoStart(true);
    for (let i = 0; i < 600; i++) g.advance(SIM_DT); // 10s in the opening prep with no tower placed
    expect(g.phase).toBe('prep'); // countdown never armed → the wave never auto-started
    expect(g.getSnapshot().autoStartIn).toBe(0); // HUD shows "armed", not a ticking number

    g.placeTower('needle', towerSlots[0].x, towerSlots[0].y); // placement arms the countdown
    expect(g.getSnapshot().autoStartIn).toBeGreaterThan(0);
    let t = 0;
    while (g.phase === 'prep' && t < AUTO_START_FIRST_DELAY + 1) {
      g.advance(SIM_DT);
      t += SIM_DT;
    }
    expect(g.phase).toBe('wave');
    expect(t).toBeGreaterThanOrEqual(AUTO_START_FIRST_DELAY - 0.2); // waited ~the first-tower window
  });

  it('exposes the live countdown in the HUD snapshot, ticking down', () => {
    const g = new Game(2, NO_META);
    g.setAutoStart(true);
    g.placeTower('needle', towerSlots[0].x, towerSlots[0].y); // arm the countdown
    const a = g.getSnapshot();
    expect(a.autoStart).toBe(true);
    expect(a.autoStartIn).toBeGreaterThan(0);
    expect(a.autoStartIn).toBeLessThanOrEqual(AUTO_START_FIRST_DELAY); // opening first-tower window
    for (let i = 0; i < 60; i++) g.advance(SIM_DT); // ~1s of prep
    expect(g.getSnapshot().autoStartIn).toBeLessThan(a.autoStartIn);
  });

  it('resets the countdown for each new prep (after a draft)', () => {
    const g = new Game(3, NO_META);
    g.setAutoStart(true);
    g.placeTower('needle', towerSlots[0].x, towerSlots[0].y); // arm the opening countdown
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
    expect(g.getSnapshot().autoStartIn).toBe(0); // unarmed until the first tower is placed
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
    g.placeTower('needle', towerSlots[0].x, towerSlots[0].y); // arm the opening countdown
    let guard = 0;
    while (g.phase !== 'draft' && guard++ < 200_000) g.advance(SIM_DT); // auto-start wave 1, play it out
    g.chooseCard(g.getSnapshot().draft![0].id);
    expect(g.waveIndex).toBeGreaterThanOrEqual(1);
    const placed = g.placeTower('needle', towerSlots[1].x, towerSlots[1].y); // a placement in a later prep
    expect(placed).toBe(true); // the placement actually happened (so the assertion below is meaningful)
    expect(g.getSnapshot().autoStartIn).toBeLessThanOrEqual(AUTO_START_DELAY); // no longer window
  });
});
