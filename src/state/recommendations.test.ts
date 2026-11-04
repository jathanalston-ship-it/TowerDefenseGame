// recommendations — the "what next?" engine (docs/NOTIFICATIONS.md §recommendations).
// Pins the loop-order ranking (claims outrank spends outrank browsing), the never-empty
// guarantee (the play backstop), hub scoping, progression adaptivity (a fresh save guides
// toward play; a loaded save guides toward its waiting claims), and the derive-from-
// registries contract (an unknown notification channel still surfaces as 'browse').

import { describe, expect, it } from 'vitest';
import { recommendationsFor } from './recommendations';
import { registerNotification, notifications } from './notifications';
import { defaultSave } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';
import { isOpenNav } from './unlocks';
import { MODE_UNLOCKS } from '../core/config';

function freshSave(): SaveData {
  return defaultSave();
}

describe('recommendationsFor — ranking and guarantees', () => {
  it('a brand-new save still gets guidance (the play backstop — never a dead end)', () => {
    const recs = recommendationsFor(freshSave(), { limit: 3 });
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.why.length).toBeGreaterThan(0);
    }
    // The play action is always IN the pool (an uncapped read shows it) — it only leaves
    // a capped list when genuinely more urgent actions outrank it.
    const all = recommendationsFor(freshSave(), { limit: 50 });
    expect(all.some((r) => r.kind === 'play')).toBe(true);
  });

  it('claimable rewards outrank the play backstop (loop order: CLAIM before re-PLAY)', () => {
    const s: SaveData = { ...freshSave(), pendingContainers: [{ kind: 'loot', rarity: 'rare' }] as never };
    const recs = recommendationsFor(s, { limit: 5 });
    const vault = recs.find((r) => r.nav === 'vault');
    const play = recs.find((r) => r.kind === 'play');
    expect(vault, 'a banked container must be recommended').toBeDefined();
    expect(vault!.kind).toBe('open');
    expect(vault!.score).toBeGreaterThan(play?.score ?? 0);
    // The label is the smart-notification REASON, not a bare count.
    expect(vault!.label).toMatch(/Bio-Container/);
  });

  it('scopes to a hub: navs filter keeps only that hub, empty hubs fall back to guidance', () => {
    const s: SaveData = { ...freshSave(), pendingContainers: [{ kind: 'loot', rarity: 'rare' }] as never };
    const rewardsHub = recommendationsFor(s, { navs: ['quests', 'season', 'vault', 'expeditions', 'harvest'], limit: 3 });
    expect(rewardsHub.some((r) => r.nav === 'vault')).toBe(true);
    for (const r of rewardsHub) expect(['quests', 'season', 'vault', 'expeditions', 'harvest']).toContain(r.nav);
    // A hub with nothing actionable still returns the play guidance rather than nothing.
    const quiet = recommendationsFor(freshSave(), { navs: ['phenotypes'], limit: 3 });
    expect(quiet.length).toBeGreaterThan(0);
  });

  it('an unregistered-channel notification still surfaces (future systems recommend free)', () => {
    registerNotification({
      id: 'test.futureSystem',
      channel: 'futurescreen',
      count: (s) => (s.totalRuns >= 0 ? 2 : 0), // always 2 for any save
      reason: (_s, n) => `${n} future things ready`,
    });
    try {
      const recs = recommendationsFor(freshSave(), { limit: 10 });
      const fut = recs.find((r) => r.nav === ('futurescreen' as never));
      expect(fut).toBeDefined();
      expect(fut!.kind).toBe('browse'); // unknown channels default to browse, modest score
      expect(fut!.label).toBe('2 future things ready');
    } finally {
      // The registry has no unregister — mark the test source seen so later polls ignore it.
      notifications.markSeen('futurescreen', freshSave());
    }
  });

  it('limit caps the list and the order is score-descending', () => {
    const s: SaveData = { ...freshSave(), pendingContainers: [{ kind: 'loot', rarity: 'rare' }] as never };
    const recs = recommendationsFor(s, { limit: 2 });
    expect(recs.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < recs.length; i++) expect(recs[i - 1].score).toBeGreaterThanOrEqual(recs[i].score);
  });

  it('never recommends a sealed destination — the free gauntlet waits for Boss Rush to unlock', () => {
    // A stage-1 account: today's free Boss Rush entry COUNTS (freeDay is unset) but Boss Rush is
    // sealed until MODE_UNLOCKS.bossRush — the Mission Hub must not lead with a door that opens onto a lock.
    const s: SaveData = { ...freshSave(), campaign: { cleared: { standard: 1 }, bestTime: {} } };
    const all = recommendationsFor(s, { limit: 50 });
    expect(all.some((r) => r.nav === 'bossrush')).toBe(false);
    for (const r of all) expect(isOpenNav(s, r.nav)).toBe(true);
    // The Mission Hub's own scoped list still guides somewhere (the play backstop).
    const hub = recommendationsFor(s, { navs: ['campaign', 'infinite', 'bossrush', 'daily'], limit: 3 });
    expect(hub.length).toBeGreaterThan(0);
    expect(hub.every((r) => r.nav !== 'bossrush')).toBe(true);
    // Once the gate opens, the same source recommends the gauntlet again.
    const open: SaveData = { ...freshSave(), campaign: { cleared: { standard: MODE_UNLOCKS.bossRush }, bestTime: {} } };
    expect(recommendationsFor(open, { limit: 50 }).some((r) => r.nav === 'bossrush')).toBe(true);
  });
});
