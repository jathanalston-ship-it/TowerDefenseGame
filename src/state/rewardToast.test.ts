// rewardToast — the claim-popup bus (docs/NOTIFICATIONS.md §claim-popups). Pins the queueing
// contract (ids, delivery, unsubscribe) and the destination intelligence: the "view it" jump
// derives from receipt-line icons (single-sourced in meta.applyRewardList / rewardLabel),
// containers out-rank cosmetics out-rank essence, and an explicit nav always wins.

import { describe, expect, it } from 'vitest';
import { navHintFor, rewardToast } from './rewardToast';
import type { RewardToast } from './rewardToast';

describe('navHintFor — destination derivation', () => {
  it('routes containers to the Vault (both bio-container and run-cache icons)', () => {
    expect(navHintFor([{ icon: '◈', label: '1× epic Bio-Container' }])?.key).toBe('vault');
    expect(navHintFor([{ icon: '⬢', label: '1× Run Cache' }])?.key).toBe('vault');
  });

  it('routes cosmetics and phenotypes to the Wardrobe screen', () => {
    expect(navHintFor([{ icon: '❖', label: 'Reaper’s Wake' }])?.key).toBe('phenotypes');
    expect(navHintFor([{ icon: '🧬', label: 'Abyssal Phenotype' }])?.key).toBe('phenotypes');
  });

  it('routes gene essence to the Gene Archive', () => {
    expect(navHintFor([{ icon: '⌬', label: '40 Gene Essence' }])?.key).toBe('genes');
  });

  it('prioritizes the container over cosmetics and essence in a mixed receipt', () => {
    const hint = navHintFor([
      { icon: '⌬', label: '40 Gene Essence' },
      { icon: '❖', label: 'Reaper’s Wake' },
      { icon: '◈', label: '1× legendary Bio-Container' },
    ]);
    expect(hint?.key).toBe('vault');
  });

  it('returns null when nothing routes (plain currency)', () => {
    expect(navHintFor([{ icon: '⬡', label: '120 Genome Cores' }])).toBeNull();
  });
});

describe('rewardToast bus', () => {
  it('delivers pushes to subscribers with monotonic ids and derived nav', () => {
    const got: RewardToast[] = [];
    const off = rewardToast.onToast((t) => got.push(t));
    const a = rewardToast.push({ title: 'Mission rewards claimed', lines: [{ icon: '◈', label: '1× rare Bio-Container' }] });
    const b = rewardToast.push({ title: 'Directive complete', lines: [{ icon: '⬡', label: '60 Genome Cores' }] });
    off();
    expect(got.map((t) => t.id)).toEqual([a.id, b.id]);
    expect(b.id).toBeGreaterThan(a.id);
    expect(got[0].nav?.key).toBe('vault'); // derived
    expect(got[1].nav).toBeNull(); // nothing to route to
  });

  it('an explicit nav (including null) suppresses derivation', () => {
    const t = rewardToast.push({
      title: 'Milestone reward claimed',
      nav: null, // claimed IN the wardrobe — no jump offered
      lines: [{ icon: '❖', label: 'Gilded Carapace' }],
    });
    expect(t.nav).toBeNull();
    const t2 = rewardToast.push({
      title: 'Custom route',
      nav: { key: 'season', label: 'Open the Season Pass' },
      lines: [{ icon: '◈', label: 'container' }],
    });
    expect(t2.nav?.key).toBe('season');
  });

  it('pushing with no subscriber is safe (emits are dropped, not queued)', () => {
    expect(() => rewardToast.push({ title: 'Quiet', lines: [] })).not.toThrow();
  });

  it('unsubscribe stops delivery', () => {
    const got: RewardToast[] = [];
    const off = rewardToast.onToast((t) => got.push(t));
    off();
    rewardToast.push({ title: 'After off', lines: [] });
    expect(got).toHaveLength(0);
  });
});
