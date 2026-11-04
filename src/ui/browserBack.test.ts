// Browser/Android Back + Escape decisions (docs/HUB-FLOW.md §back) — the pure half of
// ui/browserBack.ts. Pins: a live run is PAUSED (never exited), transitional screens hold, an open
// layer closes before the hub moves, a ceremony is never navigated underneath, the hub root lets
// the browser leave, and a guard entry exists exactly while Back has an in-game meaning.

import { describe, expect, it } from 'vitest';
import { backStep, hasOpenLayer, dismissTop, wantsGuard, type BackState } from './browserBack';

const hub = (o: Partial<BackState> = {}): BackState => ({ phase: 'menu', layerOpen: false, modal: false, hubAtRoot: false, ...o });

describe('backStep — what one Back press means', () => {
  it('a live run (the tutorial included) opens the Pause sheet — Back never exits a run', () => {
    expect(backStep(hub({ phase: 'run' }))).toBe('pause');
    // …even with the hub "at root" underneath and a layer registered: the run owns Back.
    expect(backStep(hub({ phase: 'run', hubAtRoot: true, layerOpen: true }))).toBe('pause');
  });

  it('deploy / results / roulette / an arena match HOLD — nothing is navigated or lost', () => {
    expect(backStep(hub({ phase: 'other' }))).toBe('hold');
    expect(backStep(hub({ phase: 'other', hubAtRoot: true }))).toBe('hold');
  });

  it('in the hub an open layer closes first (topmost), then the hub walks its history', () => {
    expect(backStep(hub({ layerOpen: true }))).toBe('dismiss');
    expect(backStep(hub({ layerOpen: true, hubAtRoot: true }))).toBe('dismiss');
    expect(backStep(hub())).toBe('hub-back');
  });

  it('a ceremony / What\'s New on screen is never navigated underneath', () => {
    expect(backStep(hub({ modal: true }))).toBe('hold');
  });

  it('at the hub root the browser does its normal thing (previous page / close the PWA)', () => {
    expect(backStep(hub({ hubAtRoot: true }))).toBe('leave');
  });
});

describe('wantsGuard — the same-URL guard entry exists exactly while Back means something', () => {
  it('arms off the root, during runs/overlays, and under an open layer', () => {
    expect(wantsGuard(hub())).toBe(true);
    expect(wantsGuard(hub({ hubAtRoot: true, phase: 'run' }))).toBe(true);
    expect(wantsGuard(hub({ hubAtRoot: true, phase: 'other' }))).toBe(true);
    expect(wantsGuard(hub({ hubAtRoot: true, layerOpen: true }))).toBe(true);
  });

  it('stands down at a quiet hub root (Back must leave, not dead-end) — a passing ceremony never arms one', () => {
    expect(wantsGuard(hub({ hubAtRoot: true }))).toBe(false);
    expect(wantsGuard(hub({ hubAtRoot: true, modal: true }))).toBe(false);
  });
});

describe('the dismiss stack', () => {
  it('starts empty: dismissTop is a no-op that reports nothing closed', () => {
    expect(hasOpenLayer()).toBe(false);
    expect(dismissTop()).toBe(false);
  });
});
