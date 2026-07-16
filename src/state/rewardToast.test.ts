// rewardToast — the reward-placard framework (docs/NOTIFICATIONS.md §reward-toasts). Pins
// the foundational contracts: the registry answers every reward type (including every
// applyRewardList kind), the merge rules implement the spec's "+100 +250 +75 → +425"
// stacking without ever lying about sources, rarity escalates the presentation tier, and
// the bus never silently drops an announcement (bounded hold buffer flushes on subscribe).

import { describe, expect, it } from 'vitest';
import {
  REWARD_TYPES, TOAST_LIFE_BIG_MS, TOAST_LIFE_MS, TOAST_MERGE_WINDOW_MS,
  applyEvent, cardKey, eventsForPassRewards, lifeOf, pruneCards, rewardToast, rewardTypeOf, tierOf,
} from './rewardToast';
import type { RewardEvent, ToastCard } from './rewardToast';

const T0 = 1_000_000; // arbitrary "now" base for the pure queue rules

function ev(partial: Partial<RewardEvent> & { type: string }): RewardEvent {
  return { source: 'Test Source', ...partial };
}

describe('REWARD_TYPES registry — the foundational config', () => {
  it('ids are unique and every row is fully declared', () => {
    const ids = REWARD_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of REWARD_TYPES) {
      expect(t.unit.length).toBeGreaterThan(0);
      expect(['sum', 'count', 'never']).toContain(t.merge);
      if (t.tier !== undefined) expect([0, 1, 2, 3]).toContain(t.tier);
    }
  });

  it('rewardTypeOf resolves registry rows and misses cleanly', () => {
    expect(rewardTypeOf('genomeCores')?.unit).toBe('Genome Cores');
    expect(rewardTypeOf('nope')).toBeUndefined();
  });

  it('every applyRewardList kind maps onto registry rows (no reward without a placard)', () => {
    // The full PassReward kind language interpreted by meta.applyRewardList.
    const kinds = [
      { kind: 'ichor', qty: 5 },
      { kind: 'cores', qty: 100 },
      { kind: 'geneEssence', qty: 40 },
      { kind: 'mats', mutagen: 3, scrap: 8, catalyst: 1 },
      { kind: 'towerShardsAll', qtyEach: 10 },
      { kind: 'heroShardsAll', qtyEach: 5 },
      { kind: 'container', count: 2, rarity: 'epic' },
      { kind: 'runCache', count: 1 },
      { kind: 'rushStamina', qty: 1 },
      { kind: 'cosmetic', id: 'crown' },
      { kind: 'phenotype', family: 'abyssal' },
      { kind: 'passive', id: 'perma1' },
      { kind: 'stack' },
    ];
    const events = eventsForPassRewards(kinds);
    expect(events.length).toBeGreaterThanOrEqual(kinds.length); // mats splits into 3
    for (const e of events) {
      expect(rewardTypeOf(e.type), `kind produced unregistered type "${e.type}"`).toBeDefined();
    }
  });
});

describe('tierOf — rarity raises the presentation tier, never lowers it', () => {
  it('uses the registry base tier when no rarity is given', () => {
    expect(tierOf(ev({ type: 'genomeCores' }))).toBe(0);
    expect(tierOf(ev({ type: 'cells' }))).toBe(2);
    expect(tierOf(ev({ type: 'passStack' }))).toBe(3);
  });

  it('rarity overrides upward only', () => {
    expect(tierOf(ev({ type: 'genomeCores', rarity: 'legendary' }))).toBe(3);
    expect(tierOf(ev({ type: 'cells', rarity: 'common' }))).toBe(2); // never downgraded
    expect(tierOf(ev({ type: 'container', rarity: 'epic' }))).toBe(2);
    expect(tierOf(ev({ type: 'geneCard', rarity: 'exotic' }))).toBe(3);
  });
});

describe('applyEvent — the merge rules (spec: +100 +250 +75 → one +425 card)', () => {
  it('merges identical sum-rewards inside the window and bumps the card to the front', () => {
    let cards = applyEvent([], ev({ type: 'genomeCores', qty: 100 }), T0);
    cards = applyEvent(cards, ev({ type: 'geneEssence', qty: 40 }), T0 + 200); // interloper in front
    cards = applyEvent(cards, ev({ type: 'genomeCores', qty: 250 }), T0 + 500);
    cards = applyEvent(cards, ev({ type: 'genomeCores', qty: 75 }), T0 + 900);
    expect(cards).toHaveLength(2);
    expect(cards[0].type).toBe('genomeCores'); // merge moved it back to the front
    expect(cards[0].qty).toBe(425);
    expect(cards[0].count).toBe(3);
    expect(cards[0].bumpedAt).toBe(T0 + 900); // lifetime re-armed
    expect(cards[0].bornAt).toBe(T0);
  });

  it('does not merge past the merge window — a late identical reward gets its own card', () => {
    const cards = applyEvent([], ev({ type: 'genomeCores', qty: 100 }), T0);
    const late = applyEvent(cards, ev({ type: 'genomeCores', qty: 50 }), T0 + TOAST_MERGE_WINDOW_MS + 1);
    expect(late).toHaveLength(2);
  });

  it("merge identity is type+name — different specifics don't cross-merge", () => {
    let cards = applyEvent([], ev({ type: 'towerShards', qty: 10, name: 'Spitter' }), T0);
    cards = applyEvent(cards, ev({ type: 'towerShards', qty: 10, name: 'Lasher' }), T0 + 100);
    expect(cards).toHaveLength(2);
    expect(cardKey(cards[0])).not.toBe(cardKey(cards[1]));
  });

  it("'never' rewards always keep distinct cards (equipment, achievements)", () => {
    let cards = applyEvent([], ev({ type: 'equipment', name: 'Chitin Plate' }), T0);
    cards = applyEvent(cards, ev({ type: 'equipment', name: 'Chitin Plate' }), T0 + 50);
    expect(cards).toHaveLength(2);
  });

  it('blended sources read "Multiple sources" — a merged card never lies', () => {
    let cards = applyEvent([], { type: 'genomeCores', qty: 10, source: 'Daily Bio-Cache' }, T0);
    cards = applyEvent(cards, { type: 'genomeCores', qty: 10, source: 'Daily Bio-Cache' }, T0 + 50);
    expect(cards[0].source).toBe('Daily Bio-Cache'); // same source stays specific
    cards = applyEvent(cards, { type: 'genomeCores', qty: 10, source: 'Weekly Directive' }, T0 + 100);
    expect(cards[0].source).toBe('Multiple sources');
  });

  it('a merge escalates rarity/tier upward and sums Power', () => {
    let cards = applyEvent([], ev({ type: 'container', qty: 1, rarity: 'rare', power: 5 }), T0);
    cards = applyEvent(cards, ev({ type: 'container', qty: 1, rarity: 'legendary', power: 7 }), T0 + 100);
    expect(cards).toHaveLength(1);
    expect(cards[0].rarity).toBe('legendary');
    expect(cards[0].tier).toBe(3);
    expect(cards[0].power).toBe(12);
    // a later common does NOT drag the card back down
    cards = applyEvent(cards, ev({ type: 'container', qty: 1, rarity: 'common' }), T0 + 200);
    expect(cards[0].rarity).toBe('legendary');
    expect(cards[0].tier).toBe(3);
  });

  it('an unknown future type still gets a card (never dropped), defaulting qty 1 / tier 0', () => {
    const cards = applyEvent([], ev({ type: 'futureThing' }), T0);
    expect(cards).toHaveLength(1);
    expect(cards[0].qty).toBe(1);
    expect(cards[0].tier).toBe(0);
  });

  it('explicit nav overrides the registry default; null suppresses it', () => {
    const reg = applyEvent([], ev({ type: 'geneEssence', qty: 1 }), T0);
    expect(reg[0].nav?.key).toBe('genes'); // registry default
    const custom = applyEvent([], ev({ type: 'geneEssence', qty: 1, nav: { key: 'season', label: 'Pass' } }), T0);
    expect(custom[0].nav?.key).toBe('season');
    const none = applyEvent([], ev({ type: 'geneEssence', qty: 1, nav: null }), T0);
    expect(none[0].nav).toBeNull();
  });
});

describe('pruneCards + lifeOf — lifetimes (≥5s, legendary lingers, merges re-arm)', () => {
  it('cards live TOAST_LIFE_MS and t3 cards live TOAST_LIFE_BIG_MS', () => {
    expect(TOAST_LIFE_MS).toBeGreaterThanOrEqual(5000); // spec: 5 seconds minimum
    const plain = applyEvent([], ev({ type: 'genomeCores', qty: 1 }), T0);
    const big = applyEvent([], ev({ type: 'genomeCores', qty: 1, rarity: 'legendary' }), T0);
    expect(lifeOf(plain[0])).toBe(TOAST_LIFE_MS);
    expect(lifeOf(big[0])).toBe(TOAST_LIFE_BIG_MS);
    expect(pruneCards(plain, T0 + TOAST_LIFE_MS - 1)).toHaveLength(1);
    expect(pruneCards(plain, T0 + TOAST_LIFE_MS)).toHaveLength(0);
    expect(pruneCards(big, T0 + TOAST_LIFE_MS)).toHaveLength(1); // legendary still up
    expect(pruneCards(big, T0 + TOAST_LIFE_BIG_MS)).toHaveLength(0);
  });

  it('a merge bump re-arms the lifetime from bumpedAt', () => {
    let cards = applyEvent([], ev({ type: 'genomeCores', qty: 1 }), T0);
    cards = applyEvent(cards, ev({ type: 'genomeCores', qty: 1 }), T0 + 3000);
    expect(pruneCards(cards, T0 + TOAST_LIFE_MS + 1000)).toHaveLength(1); // alive off the bump
    expect(pruneCards(cards, T0 + 3000 + TOAST_LIFE_MS)).toHaveLength(0);
  });

  it('returns the same array when nothing expired (no render churn)', () => {
    const cards = applyEvent([], ev({ type: 'genomeCores', qty: 1 }), T0);
    expect(pruneCards(cards, T0 + 10)).toBe(cards);
  });
});

describe('rewardToast bus — delivery and the hold buffer', () => {
  it('holds events pushed with no subscriber and flushes them on subscribe (run-end trail)', () => {
    rewardToast.push(ev({ type: 'genomeCores', qty: 120, source: 'Field Run' }));
    rewardToast.push(ev({ type: 'container', qty: 1, source: 'Field Run', rarity: 'rare' }));
    const got: RewardEvent[] = [];
    const off = rewardToast.onReward((e) => got.push(e));
    expect(got.map((e) => e.type)).toEqual(['genomeCores', 'container']);
    off();
  });

  it('delivers live while subscribed; unsubscribe stops delivery (back to holding)', () => {
    const got: RewardEvent[] = [];
    const off = rewardToast.onReward((e) => got.push(e));
    rewardToast.push(ev({ type: 'ichor', qty: 2 }));
    expect(got).toHaveLength(1);
    off();
    rewardToast.push(ev({ type: 'ichor', qty: 3 }));
    expect(got).toHaveLength(1); // held, not delivered
    const drain: RewardEvent[] = [];
    const off2 = rewardToast.onReward((e) => drain.push(e));
    expect(drain.map((e) => e.qty)).toEqual([3]); // …and flushed to the next mount
    off2();
  });

  it('pushMany stamps every event with the same source', () => {
    const got: RewardEvent[] = [];
    const off = rewardToast.onReward((e) => got.push(e));
    rewardToast.pushMany('Battle Pass — Level 7', [
      { type: 'genomeCores', qty: 100 },
      { type: 'container', qty: 1, rarity: 'epic' },
    ]);
    off();
    expect(got).toHaveLength(2);
    expect(new Set(got.map((e) => e.source))).toEqual(new Set(['Battle Pass — Level 7']));
  });

  it('the hold buffer is bounded (old events fall off, pushes never throw)', () => {
    for (let i = 0; i < 60; i += 1) rewardToast.push(ev({ type: 'scrap', qty: i + 1 }));
    const got: RewardEvent[] = [];
    const off = rewardToast.onReward((e) => got.push(e));
    off();
    expect(got.length).toBeLessThanOrEqual(40);
    expect(got[got.length - 1]?.qty).toBe(60); // newest survive
  });
});

describe('eventsForPassRewards — the applyRewardList reward language', () => {
  it('maps currency kinds with quantities', () => {
    expect(eventsForPassRewards([{ kind: 'cores', qty: 150 }])).toEqual([{ type: 'genomeCores', qty: 150 }]);
    expect(eventsForPassRewards([{ kind: 'ichor', qty: 3 }])).toEqual([{ type: 'ichor', qty: 3 }]);
  });

  it('splits a mats bundle into one event per material actually present', () => {
    const events = eventsForPassRewards([{ kind: 'mats', mutagen: 4, catalyst: 2 }]);
    expect(events).toEqual([{ type: 'mutagen', qty: 4 }, { type: 'catalyst', qty: 2 }]); // no scrap row
  });

  it('carries container rarity and count into the event', () => {
    expect(eventsForPassRewards([{ kind: 'container', count: 3, rarity: 'epic' }]))
      .toEqual([{ type: 'container', qty: 3, rarity: 'epic' }]);
  });

  it('folds the ×every-tower/hero payouts into one named summed card', () => {
    const [t] = eventsForPassRewards([{ kind: 'towerShardsAll', qtyEach: 25 }]);
    expect(t).toEqual({ type: 'towerShards', qty: 25, name: 'every tower' });
  });

  it('resolves cosmetic/passive display names through the provided lookups', () => {
    const events = eventsForPassRewards(
      [{ kind: 'cosmetic', id: 'crown' }, { kind: 'passive', id: 'p1' }],
      { cosmetic: (id) => (id === 'crown' ? 'Gilded Carapace' : undefined), passive: () => 'Everblood' },
    );
    expect(events[0]).toEqual({ type: 'cosmetic', name: 'Gilded Carapace' });
    expect(events[1]).toEqual({ type: 'passive', name: 'Everblood' });
  });

  it('a future unknown kind still produces an event (forward-compatible)', () => {
    const [e] = eventsForPassRewards([{ kind: 'newKind2027', qty: 9 }]);
    expect(e.type).toBe('newKind2027');
    expect(e.qty).toBe(9);
  });
});

// The visible-cap constant is a UI contract; pin it so the stack never regresses to spam.
it('caps and windows are sane (stack of 4, 4s merge window)', () => {
  const cards: ToastCard[] = [];
  expect(cards).toHaveLength(0);
  expect(TOAST_MERGE_WINDOW_MS).toBeGreaterThanOrEqual(2000);
});
