import { describe, it, expect } from 'vitest';
import { meta } from './meta';

describe('tutorial completion rewards (idempotent on replay)', () => {
  it('grants the one-time payout exactly once', () => {
    meta.reset();
    meta.completeTutorial('combat');
    const before = meta.get();

    const r1 = meta.grantTutorialRewards('combat');
    expect(r1).not.toBeNull();
    expect(r1!.cores).toBeGreaterThan(0);
    const afterFirst = meta.get();
    // At least the cores land (the tutorial_complete achievement also pays its own reward on top).
    expect(afterFirst.shards).toBeGreaterThanOrEqual(before.shards + r1!.cores);
    expect(afterFirst.lifetimeShards).toBeGreaterThanOrEqual(before.lifetimeShards + r1!.cores);
    expect(afterFirst.tutorial.rewarded).toContain('combat');
    expect(afterFirst.equipment.inventory.length).toBe(before.equipment.inventory.length + 1); // 1 gear piece
    expect(afterFirst.pendingContainers.length).toBe(before.pendingContainers.length + 1); // 1 container
    expect(r1!.powerAfter).toBeGreaterThanOrEqual(r1!.powerBefore); // visible Power Score increase
    expect(r1!.achievement).toBe('Assimilation Protocol'); // achievement unlocked

    // Replay from Settings → NO duplicate permanent rewards.
    const r2 = meta.grantTutorialRewards('combat');
    expect(r2).toBeNull();
    expect(meta.get().shards).toBe(afterFirst.shards);
    expect(meta.get().equipment.inventory.length).toBe(afterFirst.equipment.inventory.length);
    expect(meta.get().pendingContainers.length).toBe(afterFirst.pendingContainers.length);
  });
});

describe('mid-lesson milestone rewards (idempotent per checkpoint)', () => {
  it('grants each milestone exactly once, keyed tutorial:checkpoint', () => {
    meta.reset();
    const before = meta.get();
    const m1 = meta.grantTutorialMilestone('combat', 'wave-1', { cores: 25 });
    expect(m1).toEqual({ cores: 25, essence: 0 });
    const after1 = meta.get();
    expect(after1.shards).toBe(before.shards + 25);
    expect(after1.tutorial.milestones).toContain('combat:wave-1');

    // A replayed lesson (same key) never re-grants; a DIFFERENT checkpoint still can.
    expect(meta.grantTutorialMilestone('combat', 'wave-1', { cores: 25 })).toBeNull();
    expect(meta.get().shards).toBe(after1.shards);
    const m2 = meta.grantTutorialMilestone('combat', 'gene-card', { essence: 10 });
    expect(m2).toEqual({ cores: 0, essence: 10 });
    expect(meta.get().geneEssence).toBe(after1.geneEssence + 10);
  });
});

describe('HUD Tour completion (skip is seen, never paid)', () => {
  it('a skip marks the tour done without the container; a later finish cannot double-dip', () => {
    meta.reset();
    meta.completeTutorial('combat');
    const before = meta.get();
    expect(meta.completeHudTour(false)).toBeNull(); // skip: no grant …
    const after = meta.get();
    expect(after.help.hudTour).toBe(true); // … but it never re-forces
    expect(after.pendingContainers.length).toBe(before.pendingContainers.length);
    expect(meta.completeHudTour(true)).toBeNull(); // already done — a replay finish grants nothing
  });

  it('a genuine finish grants the one-time container', () => {
    meta.reset();
    meta.completeTutorial('combat');
    const before = meta.get();
    const r = meta.completeHudTour(true);
    expect(r).not.toBeNull();
    expect(meta.get().pendingContainers.length).toBe(before.pendingContainers.length + 1);
    expect(meta.completeHudTour(true)).toBeNull(); // idempotent
  });
});
