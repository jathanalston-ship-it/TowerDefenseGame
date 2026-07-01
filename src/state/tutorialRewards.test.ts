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
