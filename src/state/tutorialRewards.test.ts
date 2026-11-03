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
    expect(r1!.containers).toBe(1);
    expect(r1!.items).toBe(1);
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

describe('THE graduation payout (one reveal for the whole onboarding — docs/TUTORIAL.md §graduation)', () => {
  it('pays the tutorial + former tour ledgers together, once, as ONE summary', () => {
    meta.reset();
    meta.completeTutorial('combat');
    const before = meta.get();
    expect(meta.pendingOnboardingReward()).toEqual({ cores: 300, containers: 2, containerRarity: 'rare' }); // the Skip confirm's numbers

    const r = meta.grantOnboardingRewards();
    expect(r).not.toBeNull();
    expect(r!.cores).toBe(300); // 150 per ledger — exactly what tutorial + tour paid before the merge
    expect(r!.towerShards).toBe(30);
    expect(r!.heroShards).toBe(40);
    expect(r!.containers).toBe(2);
    expect(r!.items).toBe(2);
    expect(r!.achievement).toBe('Assimilation Protocol');
    expect(r!.powerAfter).toBeGreaterThanOrEqual(r!.powerBefore);
    const after = meta.get();
    expect(after.tutorial.rewarded).toEqual(expect.arrayContaining(['combat', 'hudtour']));
    expect(after.pendingContainers.length).toBe(before.pendingContainers.length + 2);
    expect(after.equipment.inventory.length).toBe(before.equipment.inventory.length + 2);
    const uids = after.equipment.inventory.map((i) => i.uid);
    expect(new Set(uids).size).toBe(uids.length); // same-millisecond grants never collide
    expect(meta.pendingOnboardingReward()).toBeNull(); // nothing left — a replay's Skip forfeits nothing

    // Replay → nothing re-granted, and the tour that follows pays nothing either (no 2nd card).
    expect(meta.grantOnboardingRewards()).toBeNull();
    expect(meta.completeHudTour()).toBeNull();
    expect(meta.get().shards).toBe(after.shards);
    expect(meta.get().pendingContainers.length).toBe(after.pendingContainers.length);
  });

  it('a save that already claimed one ledger is paid only the remainder', () => {
    meta.reset();
    meta.completeTutorial('combat');
    meta.grantTutorialRewards('hudtour'); // a pre-merge skipper who finished the old tour …
    const r = meta.grantOnboardingRewards(); // … then completes the trial on a replay
    expect(r!.cores).toBe(150);
    expect(r!.containers).toBe(1);
    expect(meta.grantOnboardingRewards()).toBeNull();
  });
});

describe('HUD Tour completion (pays nothing of its own — Finish and Skip are identical)', () => {
  it('a tutorial SKIPPER gets nothing from the tour, and cannot farm it', () => {
    meta.reset();
    meta.completeTutorial('combat'); // a Skip also marks the tutorial complete — but never pays
    const before = meta.get();
    expect(meta.completeHudTour()).toBeNull();
    const after = meta.get();
    expect(after.help.hudTour).toBe(true); // seen — never re-forces
    expect(after.pendingContainers.length).toBe(before.pendingContainers.length);
    expect(after.shards).toBe(before.shards);
    expect(meta.completeHudTour()).toBeNull(); // replay: idempotent
    expect(meta.pendingOnboardingReward()).not.toBeNull(); // still claimable by finishing a replay
  });

  it('a LEGACY graduate still owed the old tour grant is paid it at tour end — exactly once', () => {
    meta.reset();
    meta.completeTutorial('combat');
    meta.grantTutorialRewards('combat'); // graduated under the old two-part promise, tour pending
    const before = meta.get();
    const r = meta.completeHudTour(); // Finish or Skip — the same call, so a Skip forfeits nothing
    expect(r).not.toBeNull();
    expect(r!.cores).toBe(150);
    expect(meta.get().pendingContainers.length).toBe(before.pendingContainers.length + 1);
    expect(meta.get().tutorial.rewarded).toContain('hudtour');
    expect(meta.completeHudTour()).toBeNull(); // idempotent
    expect(meta.grantOnboardingRewards()).toBeNull(); // and a later replay owes nothing
  });
});
