// Ready Chain (docs/HUB-FLOW.md §model) — pins the live-harvest contract: chain stops are
// claim/open actions derived from LIVE counts, watermark-INDEPENDENT (a visited-but-
// unclaimed reward never goes dark), harvest-only (no spends/browsing), urgency-ordered.

import { describe, expect, it } from 'vitest';
import { chainNavs, nextChainStop, readyChain } from './readyChain';
import { notifications } from './notifications';
import { defaultSave } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';

const withContainer = (): SaveData => ({ ...defaultSave(), pendingContainers: [{ kind: 'loot', rarity: 'rare' }] as never });

describe('readyChain — the live harvest queue', () => {
  it('a banked container is a chain stop (open class, reason-worded label)', () => {
    const chain = readyChain(withContainer());
    const vault = chain.find((n) => n.nav === 'vault');
    expect(vault, 'the vault must join the chain').toBeDefined();
    expect(vault!.kind).toBe('open');
    expect(vault!.label).toMatch(/Bio-Container/);
    expect(vault!.why.length).toBeGreaterThan(0);
  });

  it('IGNORES seen-watermarks: a visited-but-unclaimed stop stays on the chain', () => {
    const s = withContainer();
    notifications.markSeen('vault', s); // the attention lane goes dark…
    expect(notifications.badges(s).vault ?? 0).toBe(0);
    expect(readyChain(s).some((n) => n.nav === 'vault')).toBe(true); // …the chain does not
  });

  it('is harvest-only: every stop is claim/open, never spend/browse', () => {
    for (const n of readyChain(withContainer())) expect(['claim', 'open']).toContain(n.kind);
  });

  it('orders by urgency, ripest first', () => {
    const chain = readyChain(withContainer());
    for (let i = 1; i < chain.length; i++) expect(chain[i - 1].score).toBeGreaterThanOrEqual(chain[i].score);
  });

  it('nextChainStop hands FORWARD — never back to the surface being stood on', () => {
    const s = withContainer();
    const next = nextChainStop(s, 'vault');
    if (next) expect(next.nav).not.toBe('vault');
  });

  it('chainNavs is the doors/landing pulse source', () => {
    expect(chainNavs(withContainer()).has('vault')).toBe(true);
  });
});
