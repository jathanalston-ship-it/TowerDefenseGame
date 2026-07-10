// Cross-tab write arbitration (docs/SECURITY.md §tabs): the newest writing tab owns the
// save; a foreign writer mark latches this tab STALE exactly once and stays latched.

import { afterEach, describe, expect, it } from 'vitest';
import { foreignWriter, initTabArbiter, onWriterMark, resetTabArbiter, tabId, tabIsStale } from './tabArbiter';

afterEach(() => {
  resetTabArbiter();
  initTabArbiter(null);
});

describe('foreignWriter — whose mark is this?', () => {
  it('own marks and absent marks are not foreign; other tabs are', () => {
    expect(foreignWriter(null, 'me')).toBe(false); // nobody has written yet
    expect(foreignWriter('', 'me')).toBe(false);
    expect(foreignWriter('me:12345', 'me')).toBe(false);
    expect(foreignWriter('other:12345', 'me')).toBe(true);
    expect(foreignWriter('meX:12345', 'me')).toBe(true); // prefix collision is NOT a match — the ':' seals the id
    expect(foreignWriter(`${tabId()}:999`)).toBe(false); // default self id is this module's tab
  });
});

describe('onWriterMark — the stale latch', () => {
  it('a foreign mark latches stale and fires the takeover notice exactly once', () => {
    let fired = 0;
    initTabArbiter(() => fired++);
    expect(tabIsStale()).toBe(false);
    onWriterMark(`${tabId()}:1`); // our own write echoes back — never stale
    expect(tabIsStale()).toBe(false);
    onWriterMark('intruder:2');
    expect(tabIsStale()).toBe(true);
    expect(fired).toBe(1);
    onWriterMark('intruder:3'); // further foreign writes don't re-fire
    onWriterMark('third-tab:4');
    expect(fired).toBe(1);
    expect(tabIsStale()).toBe(true); // latched — only resetTabArbiter (tests) releases
  });
});
