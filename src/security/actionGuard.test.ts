// The guard engine's contract (docs/SECURITY.md): token buckets, cooldowns, duplicate
// windows, the persist flood valve, the block log, and the clock-rollback detector — all
// under an injected clock. The layer is inert in Node by default; every test here opts in
// explicitly and restores the default so the rest of the suite never feels it.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  admitWrite, clockAnomalyOf, guard, guardOk, resetSecurity, securityEnabled,
  securityLog, setSecurityClock, setSecurityEnabled,
} from './actionGuard';

let now = 0;

beforeEach(() => {
  now = 1_000_000;
  setSecurityClock(() => now);
  setSecurityEnabled(true);
  resetSecurity();
});

afterEach(() => {
  setSecurityEnabled(false); // back to the Node default — no other test feels the layer
  setSecurityClock(Date.now);
  resetSecurity();
});

describe('token-bucket rate limiting', () => {
  it('allows the burst, blocks the overflow, and refills over the window', () => {
    // save.import: 3 per 30s, no cooldown, no dedupe — the clean bucket case.
    expect(guardOk('save.import')).toBe(true);
    expect(guardOk('save.import')).toBe(true);
    expect(guardOk('save.import')).toBe(true);
    const r = guard('save.import');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.block.reason).toBe('rate');
      expect(r.block.retryInMs).toBeGreaterThan(0);
    }
    now += 10_000; // one token refills (3 per 30s)
    expect(guardOk('save.import')).toBe(true);
    expect(guardOk('save.import')).toBe(false);
  });

  it('cooldown spaces accepted actions even when tokens remain', () => {
    // prestige.molt: 1 per 8s + 5s cooldown.
    expect(guardOk('prestige.molt')).toBe(true);
    now += 3000;
    const r = guard('prestige.molt');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.block.reason).toBe('cooldown');
    now += 6000; // past the cooldown; bucket refilled 9s/8s ⇒ a token exists
    expect(guardOk('prestige.molt')).toBe(true);
  });

  it('duplicate keys inside the window collapse without consuming tokens', () => {
    // market.buy: 4 per 10s, cooldown 700ms, dedupe 1500ms.
    expect(guardOk('market.buy', 'slot-a')).toBe(true);
    now += 200; // double-click
    const dup = guard('market.buy', 'slot-a');
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.block.reason).toBe('duplicate');
    now += 600; // 800ms total — past cooldown, different slot is a NEW request
    expect(guardOk('market.buy', 'slot-b')).toBe(true);
    now += 1600; // dedupe window expired — the same slot is legitimate again
    expect(guardOk('market.buy', 'slot-a')).toBe(true);
  });

  it('is inert when disabled (the Node default) and fails open for unknown ids', () => {
    setSecurityEnabled(false);
    for (let i = 0; i < 50; i++) expect(guardOk('save.import')).toBe(true);
    setSecurityEnabled(true);
    expect(securityEnabled()).toBe(true);
    expect(guardOk('not.a.registered.action')).toBe(true); // registry test makes this unshippable
  });

  it('logs every block (capped ring) with reason + retry', () => {
    for (let i = 0; i < 6; i++) guard('save.import');
    const log = securityLog();
    expect(log.length).toBe(3); // 3 accepted, 3 blocked
    expect(log.every((b) => b.id === 'save.import' && b.reason === 'rate')).toBe(true);
  });
});

describe('persist flood valve', () => {
  it('admits a human-speed write storm, coalesces a runaway one, recovers after the window', () => {
    for (let i = 0; i < 20; i++) {
      expect(admitWrite()).toBe(true);
      now += 10;
    }
    expect(admitWrite()).toBe(false); // 21st inside the rolling second coalesces
    expect(securityLog().some((b) => b.id === 'meta.persist' && b.reason === 'flood')).toBe(true);
    now += 1100; // window rolls past
    expect(admitWrite()).toBe(true);
  });
});

describe('clock-rollback detection', () => {
  it('flags a rollback beyond the slack, tolerates drift inside it', () => {
    const mark = 10_000_000;
    expect(clockAnomalyOf(mark, mark - 60_000)).toBe(false); // 1 min back — NTP/DST territory
    expect(clockAnomalyOf(mark, mark - 10 * 60_000)).toBe(true); // 10 min back — manipulation
    expect(clockAnomalyOf(0, 5)).toBe(false); // no history yet
  });
});
