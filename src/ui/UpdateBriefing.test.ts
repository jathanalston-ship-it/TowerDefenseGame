// UPDATE BRIEFING headlines (2026-11-11 playtest — fewer words): a release line becomes a tile
// headline — its first clause, extended past a too-short lead-in, capped at 9 words.

import { describe, expect, it } from 'vitest';
import { briefHeadline } from './UpdateBriefing';

describe('update briefing — tile headlines', () => {
  it('takes the first clause, extends a too-short lead-in, caps long ones', () => {
    expect(briefHeadline('Hive Intelligence calls waves early: with Auto Wave on, it calls')).toBe('Hive Intelligence calls waves early');
    expect(briefHeadline('New system: Class Bonds. Field 2, 4 or 6 towers')).toBe('New system: Class Bonds');
    expect(briefHeadline('Synced accounts can list on the Auction House again: the server')).toBe('Synced accounts can list on the Auction House again');
    expect(briefHeadline('Auto Gene now drafts the recommended card after 3 seconds (was 10)')).toBe('Auto Gene now drafts the recommended card after 3…');
    expect(briefHeadline('Short')).toBe('Short');
  });
});
