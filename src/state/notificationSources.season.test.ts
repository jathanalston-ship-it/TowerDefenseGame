// Season Pass badge (docs/BATTLEPASS.md) — the 'season' channel lights for earned-but-unclaimed
// reward cells and mirrors the claim gates exactly (free per earned level; premium when owned;
// the free-taste premium levels count for everyone).

import { describe, expect, it } from 'vitest';
import './notificationSources'; // side-effect: registers the shipped badge sources
import { notifications } from './notifications';
import { defaultSave } from '../save/saveStore';
import { BP, xpToReach } from '../core/battlePass';

describe('season.claimable badge', () => {
  it('counts both tracks, respects premium ownership, drops as claims land', () => {
    const s = defaultSave();
    expect(notifications.badges(s).season ?? 0).toBe(0); // level 0 — silent

    expect(BP.freePremiumLevels).toContain(1); // the arithmetic below leans on the L1 taste
    s.battlePass.xp = xpToReach(3); // exactly level 3
    // 3 free cells + the level-1 premium taste.
    expect(notifications.badges(s).season).toBe(4);

    s.battlePass.premium = true; // owning the pass opens the earned premium cells too
    expect(notifications.badges(s).season).toBe(6);

    s.battlePass.claimedFree = [1, 2, 3];
    s.battlePass.claimedPremium = [1, 2];
    expect(notifications.badges(s).season).toBe(1);
  });
});
