// GUIDED UNLOCKS (docs/GUIDED-UNLOCKS.md — Foundation #3). Pins the coalescing contract: guides
// key off the SAME teach rows the unlock registry announces, cover EVERY taught wing on the
// learning curve automatically, anchor only declared [data-guide] marks, and honor the
// anti-wordiness contract (playtest finding: wordy = skipped).

import { describe, it, expect } from 'vitest';
import { GUIDES, guideBus, guideFor } from './guidedUnlocks';
import { FEATURES } from './unlocks';
import { MECHANIC_BY_ID } from './mechanics';

// EVERY taught screen wing must carry a guide — a future wing fails this test until its guide
// row exists. Exclusions by design: `campaign` (the Combat Tutorial + Mission Control own it)
// and the store (never guide-pushed).
const requiredTeach = FEATURES
  .filter((f) => f.kind === 'screen' && f.teach)
  .filter((f) => f.id !== 'campaign' && f.id !== 'store')
  .map((f) => ({ teach: f.teach as string, nav: f.id }));

describe('Guided Unlocks — every wing walks you through itself', () => {
  it('covers EVERY taught wing on the learning curve, derived from the unlock registry itself', () => {
    for (const r of requiredTeach) {
      const g = guideFor(r.teach);
      expect(g, `screen "${r.nav}" (teach: ${r.teach}) has no guide — add a GUIDES row`).toBeTruthy();
      expect(g!.nav).toBe(r.nav); // the guide lands on the same wing the door opens
    }
  });

  it('every guide teaches a REAL announced mechanic (no orphan guides)', () => {
    for (const g of GUIDES) {
      expect(MECHANIC_BY_ID.get(g.mech), `guide "${g.mech}" has no mechanics-registry row`).toBeTruthy();
      expect(FEATURES.some((f) => f.teach === g.mech && f.id === g.nav)).toBe(true);
    }
  });

  it('honors the anti-wordiness contract: ≤4 one-sentence steps, ≤1 practice objective', () => {
    for (const g of GUIDES) {
      expect(g.steps.length).toBeGreaterThanOrEqual(1);
      expect(g.steps.length).toBeLessThanOrEqual(4);
      expect(g.steps.filter((s) => s.interact).length).toBeLessThanOrEqual(1);
      expect(g.steps.some((s) => s.anchor)).toBe(true); // a guide that points at nothing teaches nothing
      for (const s of g.steps) {
        expect(s.title.length).toBeLessThanOrEqual(48);
        expect(s.text.length).toBeLessThanOrEqual(150);
        if (s.anchor) expect(s.anchor).toMatch(/^\[data-guide="[a-z-]+"\]$/); // declared marks only
        if (s.interact) expect(s.anchor).toBeTruthy(); // a practice objective needs a target
      }
    }
  });

  it('rewards are small welcome-package grants, and unknown mechanics have no guide', () => {
    for (const g of GUIDES) {
      expect(g.reward).toBeGreaterThanOrEqual(5);
      expect(g.reward).toBeLessThanOrEqual(25);
    }
    expect(guideFor('not-a-mechanic')).toBeNull();
  });

  it('the five Foundation instruments are CORE help rows — browsable always, never announced', () => {
    for (const id of ['mission-control', 'hive-intel', 'evolution-roadmap', 'power-advisor', 'field-guides']) {
      const m = MECHANIC_BY_ID.get(id);
      expect(m, `missing Foundation help row '${id}'`).toBeTruthy();
      expect(m!.core, `'${id}' must be core (a What's New card for the guidance layer is noise)`).toBe(true);
    }
  });
});

describe('guide-active signal — folded sections never hide a guide anchor', () => {
  it('notifies listeners on change only, and unsubscribes cleanly', () => {
    const seen: boolean[] = [];
    const off = guideBus.onActive((a) => seen.push(a));
    guideBus.setActive(true);
    guideBus.setActive(true); // no duplicate notification
    expect(guideBus.isActive()).toBe(true);
    guideBus.setActive(false);
    off();
    guideBus.setActive(true);
    guideBus.setActive(false);
    expect(seen).toEqual([true, false]);
  });
});
