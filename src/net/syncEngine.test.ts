// The sync engine's PURE decision core (docs/ACCOUNTS.md §sync). The runtime just
// feeds it reality, so these few rows ARE the synchronization policy:
// offline-first, auto-pull when clean, auto-push when ahead, and a conflict the
// moment both sides have a claim — never a silent overwrite in either direction.

import { describe, expect, it } from 'vitest';
import { decideSync } from './syncEngine';

const base = { online: true, dirty: false, cloudRev: null as number | null, lastSyncedRev: 0, localMeaningful: false };

describe('decideSync', () => {
  it('offline ⇒ always noop (offline play is first-class, never blocked)', () => {
    expect(decideSync({ ...base, online: false, dirty: true, cloudRev: 5 })).toBe('noop');
  });

  it('fresh device + cloud save ⇒ pull (the "continue on any platform" moment)', () => {
    expect(decideSync({ ...base, cloudRev: 3 })).toBe('pull');
  });

  it('local changes + no cloud movement ⇒ push (silent upload)', () => {
    expect(decideSync({ ...base, dirty: true })).toBe('push'); // no slot yet
    expect(decideSync({ ...base, dirty: true, cloudRev: 4, lastSyncedRev: 4 })).toBe('push'); // slot where we left it
  });

  it('both sides moved ⇒ conflict (never silently pick a winner)', () => {
    expect(decideSync({ ...base, dirty: true, cloudRev: 6, lastSyncedRev: 4 })).toBe('conflict');
  });

  it('sign-in onto a device with an existing life ⇒ conflict even when not dirty', () => {
    expect(decideSync({ ...base, cloudRev: 9, lastSyncedRev: 0, localMeaningful: true })).toBe('conflict');
    // …but a truly fresh install pulls silently:
    expect(decideSync({ ...base, cloudRev: 9, lastSyncedRev: 0, localMeaningful: false })).toBe('pull');
  });

  it('clean + cloud where we left it ⇒ noop (nothing to do, no traffic)', () => {
    expect(decideSync({ ...base, cloudRev: 4, lastSyncedRev: 4 })).toBe('noop');
    expect(decideSync(base)).toBe('noop');
  });
});
