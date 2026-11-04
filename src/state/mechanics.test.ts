import { describe, it, expect } from 'vitest';
import { defaultSave, serializeExport } from '../save/saveStore';
import { unlockedMechanics, pendingAnnouncements, isMechanicUnlocked, MECHANIC_BY_ID, WHATS_NEW_SUMMARY_AT, unlockSummaryRows } from './mechanics';
import { meta } from './meta';
import { isOpenNav } from './unlocks';

describe('mechanics registry (Help + What\'s New spine)', () => {
  it('core mechanics are always unlocked; gated ones start hidden', () => {
    const un = unlockedMechanics(defaultSave());
    expect(un.some((m) => m.id === 'towers')).toBe(true); // core
    expect(un.some((m) => m.id === 'prestige')).toBe(false); // gated at Campaign 10
    expect(un.some((m) => m.id === 'hero-slots')).toBe(false); // gated at Campaign 25
  });

  it('an unlock predicate flips on the right save signal', () => {
    const s = { ...defaultSave(), campaign: { cleared: { standard: 12 }, bestTime: {} } };
    expect(isMechanicUnlocked(MECHANIC_BY_ID.get('prestige')!, s)).toBe(true); // ≥ 10
    expect(isMechanicUnlocked(MECHANIC_BY_ID.get('hero-slots')!, s)).toBe(false); // needs 25
  });

  it('pendingAnnouncements surfaces only newly-unlocked, unseen, non-core mechanics', () => {
    const s = { ...defaultSave(), campaign: { cleared: { standard: 12 }, bestTime: {} }, help: { seen: [], primed: false, hudTour: false } };
    expect(pendingAnnouncements(s).some((m) => m.id === 'prestige')).toBe(true);
    expect(pendingAnnouncements(s).some((m) => m.core)).toBe(false); // core never announces
    const seen = { ...s, help: { ...s.help, seen: ['prestige'] } };
    expect(pendingAnnouncements(seen).some((m) => m.id === 'prestige')).toBe(false); // archived → gone
  });

  it('completing the HUD Tour archives onboarding unlocks so What\'s New never cascades', () => {
    meta.importText(serializeExport(defaultSave()));
    meta.primeHelp(); // fresh boot prime: nothing non-core unlocked yet
    meta.completeTutorial('combat');
    meta.grantOnboardingRewards(); // the graduation: shards/gear/Bio-Containers ⇒ unlocks several foundational systems
    meta.completeHudTour(); // the tour that follows archives them
    // Those were just introduced during onboarding ⇒ they must NOT queue as What's New popups.
    const announced = meta.whatsNew().map((m) => m.id);
    for (const id of ['equipment', 'containers', 'tower-stars', 'genome-core']) {
      expect(announced).not.toContain(id);
    }
    expect(meta.get().help.hudTour).toBe(true);
    expect(meta.completeHudTour()).toBeNull(); // idempotent — never re-grants or re-archives
  });

  it('primeHelp archives everything already unlocked once (existing saves never flood)', () => {
    meta.importText(serializeExport({ ...defaultSave(), campaign: { cleared: { standard: 12 }, bestTime: {} } }));
    expect(meta.whatsNew().some((m) => m.id === 'prestige')).toBe(true); // would announce pre-prime
    meta.primeHelp();
    expect(meta.get().help.primed).toBe(true);
    expect(meta.whatsNew().length).toBe(0); // all already-unlocked archived silently
    const seenCount = meta.get().help.seen.length;
    meta.primeHelp(); // idempotent
    expect(meta.get().help.seen.length).toBe(seenCount);
  });
});

// What's New batching (docs/GUIDED-UNLOCKS.md §batching): a first run unlocks a dozen systems at
// once — they land as ONE summary (glyph · name · one line · Open) instead of a dozen walls.
describe('unlock summary rows (the batched What\'s New card)', () => {
  it('a first campaign clear queues enough announcements to batch them', () => {
    const s = { ...defaultSave(), totalRuns: 1, lifetimeShards: 120, campaign: { cleared: { standard: 1 }, bestTime: {} } };
    expect(pendingAnnouncements(s).length).toBeGreaterThanOrEqual(WHATS_NEW_SUMMARY_AT);
    expect(WHATS_NEW_SUMMARY_AT).toBe(3); // "more than two" — one or two keep the full card
  });

  it('every row has a glyph, a name and a one-line hook; Open only leads somewhere open', () => {
    const s = { ...defaultSave(), totalRuns: 1, lifetimeShards: 120, campaign: { cleared: { standard: 1 }, bestTime: {} } };
    const queue = [...pendingAnnouncements(s), MECHANIC_BY_ID.get('boss-rush')!].filter(Boolean);
    const rows = unlockSummaryRows(queue, s);
    expect(rows.length).toBe(queue.length);
    for (const r of rows) {
      expect(r.glyph.length).toBeGreaterThan(0);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.line.length).toBeGreaterThan(0);
      if (r.nav) expect(isOpenNav(s, r.nav)).toBe(true);
    }
    // Boss Rush is sealed at Stage 1: its row (if listed) never offers a door into the lock.
    const rush = rows.find((r) => r.id === 'boss-rush');
    if (rush) expect(rush.nav).toBeNull();
  });
});
