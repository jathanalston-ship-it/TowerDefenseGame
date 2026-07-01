import { describe, it, expect } from 'vitest';
import { defaultSave, serializeExport } from '../save/saveStore';
import { unlockedMechanics, pendingAnnouncements, isMechanicUnlocked, MECHANIC_BY_ID } from './mechanics';
import { meta } from './meta';

describe('mechanics registry (Help + What\'s New spine)', () => {
  it('core mechanics are always unlocked; gated ones start hidden', () => {
    const un = unlockedMechanics(defaultSave());
    expect(un.some((m) => m.id === 'towers')).toBe(true); // core
    expect(un.some((m) => m.id === 'prestige')).toBe(false); // gated at Campaign 10
    expect(un.some((m) => m.id === 'hero-slots')).toBe(false); // gated at Campaign 25
  });

  it('an unlock predicate flips on the right save signal', () => {
    const s = { ...defaultSave(), campaign: { cleared: { standard: 12 } } };
    expect(isMechanicUnlocked(MECHANIC_BY_ID.get('prestige')!, s)).toBe(true); // ≥ 10
    expect(isMechanicUnlocked(MECHANIC_BY_ID.get('hero-slots')!, s)).toBe(false); // needs 25
  });

  it('pendingAnnouncements surfaces only newly-unlocked, unseen, non-core mechanics', () => {
    const s = { ...defaultSave(), campaign: { cleared: { standard: 12 } }, help: { seen: [], primed: false, hudTour: false } };
    expect(pendingAnnouncements(s).some((m) => m.id === 'prestige')).toBe(true);
    expect(pendingAnnouncements(s).some((m) => m.core)).toBe(false); // core never announces
    const seen = { ...s, help: { ...s.help, seen: ['prestige'] } };
    expect(pendingAnnouncements(seen).some((m) => m.id === 'prestige')).toBe(false); // archived → gone
  });

  it('completing the HUD Tour archives onboarding unlocks so What\'s New never cascades', () => {
    meta.importText(serializeExport(defaultSave()));
    meta.primeHelp(); // fresh boot prime: nothing non-core unlocked yet
    meta.completeHudTour(); // grants shards/gear/a Bio-Container ⇒ unlocks several foundational systems
    // Those were just introduced during onboarding ⇒ they must NOT queue as What's New popups.
    const announced = meta.whatsNew().map((m) => m.id);
    for (const id of ['equipment', 'containers', 'tower-stars', 'genome-core']) {
      expect(announced).not.toContain(id);
    }
    expect(meta.get().help.hudTour).toBe(true);
    expect(meta.completeHudTour()).toBeNull(); // idempotent — never re-grants or re-archives
  });

  it('primeHelp archives everything already unlocked once (existing saves never flood)', () => {
    meta.importText(serializeExport({ ...defaultSave(), campaign: { cleared: { standard: 12 } } }));
    expect(meta.whatsNew().some((m) => m.id === 'prestige')).toBe(true); // would announce pre-prime
    meta.primeHelp();
    expect(meta.get().help.primed).toBe(true);
    expect(meta.whatsNew().length).toBe(0); // all already-unlocked archived silently
    const seenCount = meta.get().help.seen.length;
    meta.primeHelp(); // idempotent
    expect(meta.get().help.seen.length).toBe(seenCount);
  });
});
