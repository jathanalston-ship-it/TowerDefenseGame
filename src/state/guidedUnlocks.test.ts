// GUIDED UNLOCKS (docs/GUIDED-UNLOCKS.md — Foundation #3). Pins the coalescing contract: guides
// key off the SAME teach rows the unlock registry announces, cover the entire new-player window
// (every screen guaranteed by stage 4) automatically, anchor only declared [data-guide] marks,
// and honor the anti-wordiness contract (playtest finding: wordy = skipped).

import { describe, it, expect } from 'vitest';
import { GUIDES, guideFor } from './guidedUnlocks';
import { FEATURES, guaranteedByStage } from './unlocks';
import { MECHANIC_BY_ID } from './mechanics';

// The new-player window: screens the learning curve GUARANTEES by campaign stage 4. `campaign`
// is owned by the Combat Tutorial + Mission Control; the store is never guide-pushed.
const requiredTeach = FEATURES
  .filter((f) => f.kind === 'screen' && f.teach && guaranteedByStage(f.condition) <= 4)
  .filter((f) => f.id !== 'campaign' && f.id !== 'store')
  .map((f) => ({ teach: f.teach as string, nav: f.id }));

describe('Guided Unlocks — every early wing walks you through itself', () => {
  it('covers the ENTIRE new-player window, derived from the unlock registry itself', () => {
    for (const r of requiredTeach) {
      const g = guideFor(r.teach);
      expect(g, `screen "${r.nav}" (teach: ${r.teach}) unlocks by stage 4 but has no guide`).toBeTruthy();
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
});
