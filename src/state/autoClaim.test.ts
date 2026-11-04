// AUTO-CLAIM (docs/NOTIFICATIONS.md §auto-claim) — chores → decisions: no-choice rewards on
// REVEALED systems settle in one pass at run end, announce as ONE summary (captured, not a toast
// per claim), leave finales/big moments to the player, and switch off from Settings.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meta } from './meta';
import { autoClaimSettled } from './autoClaim';
import { rewardToast } from './rewardToast';
import type { RewardEvent } from './rewardToast';
import { QUESTS } from '../core/quests';
import { xpToReach } from '../core/battlePass';
import './notificationSources';
import { notifications } from './notifications';

const T0 = QUESTS.epochMs + 3_600_000;
let toasted: RewardEvent[] = [];
let off: () => void = () => {};

beforeEach(() => {
  meta.reset();
  off = rewardToast.onReward((e) => toasted.push(e)); // flushes anything held from earlier suites
  toasted = [];
});
afterEach(() => { off(); vi.unstubAllGlobals(); });

describe('autoClaimSettled', () => {
  it('waits for the Quest Board to reveal, then claims every earned mission in one silent batch', () => {
    meta.creditQuests({ type: 'containers', n: 3 }, T0); // earns two missions (weekly + story)
    expect(autoClaimSettled(T0)).toBeNull(); // stage 0 — the board is sealed: progress banks
    meta.debugSetCampaignStage(7); // the Quest Board reveals
    const coresBefore = meta.get().shards;
    const report = autoClaimSettled(T0);
    expect(report).not.toBeNull();
    expect(report!.claims).toBe(2);
    expect(report!.events.length).toBeGreaterThan(0);
    expect(meta.get().quests.weekly.claimed.length + meta.get().quests.main.claimed.length).toBe(2);
    expect(meta.get().shards).toBeGreaterThanOrEqual(coresBefore);
    // ONE summary, not a toast per claim: only tier-3 big moments still placard.
    expect(toasted.length).toBe(report!.ceremonies.length);
    // Nothing claimable remains ⇒ the badge holds only real decisions (none here).
    expect(notifications.badges(meta.get()).quests ?? 0).toBe(0);
    expect(autoClaimSettled(T0)).toBeNull(); // idempotent: a second pass finds nothing
  });

  it('claims earned Season Pass levels once the pass has revealed', () => {
    meta.grantPassXp('test', xpToReach(3));
    expect(autoClaimSettled()).toBeNull(); // sealed until stage 10
    meta.debugSetCampaignStage(10);
    const report = autoClaimSettled();
    expect(report?.claims).toBeGreaterThanOrEqual(3); // three free levels (+ the level-1 premium taste)
    expect(meta.battlePass().claimableFree.length).toBe(0);
  });

  it('respects the Settings switch: off ⇒ nothing is claimed, the badge stays a manual claim', () => {
    vi.stubGlobal('localStorage', { getItem: () => '0', setItem: () => {} });
    meta.debugSetCampaignStage(10);
    meta.grantPassXp('test', xpToReach(2));
    expect(autoClaimSettled()).toBeNull();
    expect(meta.battlePass().claimableFree.length).toBe(2);
  });
});
