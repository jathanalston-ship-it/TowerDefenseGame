// rewardToast — the claim-popup bus (docs/NOTIFICATIONS.md §claim-popups). Pins the queueing
// contract (ids, delivery, unsubscribe), the destination intelligence: the "view it" jump
// derives from receipt-line icons (single-sourced in meta.applyRewardList / rewardLabel),
// containers out-rank cosmetics out-rank essence, and an explicit nav always wins — plus the
// vocabulary layer (§vocab/§tiers/§merge): tier derivation from the loudest line, and the
// coalescing of rapid identical receipts into one rising total.

import { describe, expect, it } from 'vitest';
import { coalesce, mergeKey, navHintFor, rewardToast } from './rewardToast';
import type { RewardToast } from './rewardToast';
import { lineTier, receiptTier, tierForRarity, vocabLine } from './rewardVocab';

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

describe('reward vocabulary (docs/NOTIFICATIONS.md §vocab) — config-driven lines + tiers', () => {
  it('vocabLine formats quantity kinds and count kinds from the registry', () => {
    expect(vocabLine('cores', 12_500).label).toBe('12,500 Genome Cores');
    expect(vocabLine('container', 3, 'rare')).toMatchObject({ icon: '◈', label: '3× Rare Bio-Container', rarity: 'rare', qty: 3 });
    expect(vocabLine('cache', 2).label).toBe('2× Run Cache');
  });

  it('an unknown kind still renders (future content never crashes a receipt)', () => {
    const l = vocabLine('darkMatter', 7);
    expect(l.label).toContain('7');
    expect(l.kind).toBe('darkMatter');
  });

  it('tiers: rarity overrides the kind base; the receipt takes its loudest line', () => {
    expect(tierForRarity('legendary')).toBe('legendary');
    expect(lineTier(vocabLine('cores', 100))).toBe('common');
    expect(lineTier(vocabLine('container', 1, 'epic'))).toBe('epic');
    expect(receiptTier([vocabLine('cores', 100), vocabLine('container', 1, 'legendary')])).toBe('legendary');
    expect(receiptTier([])).toBe('common');
  });

  it('push derives the tier from the lines (and an explicit tier wins)', () => {
    const t = rewardToast.push({ title: 'T', lines: [vocabLine('container', 1, 'exotic')] });
    expect(t.tier).toBe('legendary');
    const forced = rewardToast.push({ title: 'T', tier: 'rare', lines: [vocabLine('cores', 10)] });
    expect(forced.tier).toBe('rare');
  });
});

describe('coalescing (docs/NOTIFICATIONS.md §merge) — rapid identical receipts combine', () => {
  const toast = (id: number, qty: number, over: Partial<RewardToast> = {}): RewardToast => ({
    id, title: 'Directive complete', lines: [vocabLine('cores', qty)], tier: 'common', ...over,
  });

  it('merges same-shape receipts into one rising total with a regenerated label', () => {
    const q1 = coalesce([], toast(1, 100));
    const q2 = coalesce(q1, toast(2, 250));
    const q3 = coalesce(q2, toast(3, 75));
    expect(q3).toHaveLength(1);
    expect(q3[0].lines[0].qty).toBe(425);
    expect(q3[0].lines[0].label).toBe('425 Genome Cores');
    expect(q3[0].id).toBe(3); // re-keyed to the newest push — the toaster re-fires + re-arms
  });

  it('keeps the merged receipt in its queue position (later receipts stay behind it)', () => {
    const other: RewardToast = { id: 10, title: 'Quest finale claimed', lines: [{ icon: '❖', label: 'Gilded Carapace' }] };
    const q = coalesce(coalesce([toast(1, 100)], other), toast(2, 50));
    expect(q.map((t) => t.title)).toEqual(['Directive complete', 'Quest finale claimed']);
    expect(q[0].lines[0].qty).toBe(150);
  });

  it('never merges across titles, kinds, or container rarities', () => {
    expect(coalesce([toast(1, 100)], toast(2, 50, { title: 'Other source' }))).toHaveLength(2);
    const rare: RewardToast = { id: 3, title: 'T', lines: [vocabLine('container', 1, 'rare')] };
    const epic: RewardToast = { id: 4, title: 'T', lines: [vocabLine('container', 1, 'epic')] };
    expect(coalesce([rare], epic)).toHaveLength(2); // a rare and an epic container never sum
    expect(coalesce([rare], { id: 5, title: 'T', lines: [vocabLine('container', 2, 'rare')] })).toHaveLength(1);
  });

  it('unquantified / non-mergeable lines never merge (mergeKey is null)', () => {
    const cosmetic: RewardToast = { id: 6, title: 'T', lines: [{ icon: '❖', label: 'Skin', kind: 'cosmetic', qty: 1 }] };
    expect(mergeKey(cosmetic)).toBeNull(); // cosmetics are declared non-mergeable in the registry
    const plain: RewardToast = { id: 7, title: 'T', lines: [{ icon: '⬡', label: '10 Genome Cores' }] };
    expect(mergeKey(plain)).toBeNull(); // no kind/qty stamp ⇒ legacy receipts queue as before
    expect(coalesce([cosmetic], { ...cosmetic, id: 8 })).toHaveLength(2);
  });

  it('a merged receipt re-derives its tier and keeps the loudest flags', () => {
    const a: RewardToast = { id: 1, title: 'T', lines: [vocabLine('container', 1, 'epic')], tier: 'epic' };
    const b: RewardToast = { id: 2, title: 'T', lines: [vocabLine('container', 1, 'epic')], big: true, sound: true, tier: 'epic' };
    const q = coalesce([a], b);
    expect(q[0]).toMatchObject({ big: true, sound: true, tier: 'epic' });
    expect(q[0].lines[0].label).toBe('2× Epic Bio-Container');
  });
});
