// Auto cloud sync — the pure cadence gate (the ticker just feeds it reality).

import { describe, expect, it } from 'vitest';
import { MIN_INTERVAL_MS, shouldAutoSync } from './autoSync';

const base = { dirty: true, named: true, online: true, now: 1_000_000_000, last: 0 };

describe('shouldAutoSync', () => {
  it('syncs when dirty + named + online + interval elapsed', () => {
    expect(shouldAutoSync(base)).toBe(true);
  });
  it('never syncs an unnamed account (no Commander, no cloud)', () => {
    expect(shouldAutoSync({ ...base, named: false })).toBe(false);
  });
  it('never syncs clean, offline, or inside the interval', () => {
    expect(shouldAutoSync({ ...base, dirty: false })).toBe(false);
    expect(shouldAutoSync({ ...base, online: false })).toBe(false);
    expect(shouldAutoSync({ ...base, last: base.now - MIN_INTERVAL_MS + 1 })).toBe(false);
  });
  it('interval boundary is inclusive', () => {
    expect(shouldAutoSync({ ...base, last: base.now - MIN_INTERVAL_MS })).toBe(true);
  });
});
