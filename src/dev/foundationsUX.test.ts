// FOUNDATIONS UX — persona simulation guardrails (docs/UX-CONSOLIDATION.md §simulation).
// The economy simulator (progressionSim) answers "does the loop pay?"; this suite answers the
// UX-consolidation brief's OTHER question: across the whole player spectrum, is the player ever
// OVERWHELMED, CONFUSED, or at a DEAD-END? It drives real simulated accounts (the persona roster)
// and runs the five Foundation models against the resulting live saves, asserting the invariants
// the pass promised: always an answer to "what now?", never a wall of notifications, never a
// screen with nothing to do. Structural — pacing is design's call (that's the report's job).

import { describe, it, expect, afterAll, vi } from 'vitest';
import { simulateAccount } from './progressionSim';
import { PERSONAS, PERSONA_IDS } from './personas';
import { meta } from '../state/meta';
import { Rng } from '../core/rng';
import { defaultSave } from '../save/saveStore';
import { missionControl } from '../state/missionControl';
import { hiveIntel } from '../state/hiveIntel';
import { evolutionRoadmap } from '../state/evolutionRoadmap';
import { advisorPlan } from '../state/powerAdvisor';
import { FEATURES } from '../state/unlocks';
import { guideFor } from '../state/guidedUnlocks';

const NOW = 1_700_000_000_000;

/** The player-experience contract, asserted against ANY save state. */
function assertNeverStranded(save: ReturnType<typeof defaultSave>, who: string): void {
  const mc = missionControl(save);
  const feed = hiveIntel(save, NOW);
  const road = evolutionRoadmap(save);
  const plan = advisorPlan(save);

  // 1. NEVER "what do I do?" — Mission Control always names a primary objective.
  expect(mc.primary.title.length, `${who}: no primary objective`).toBeGreaterThan(0);
  expect(mc.primary.nav.length, `${who}: primary objective has no destination`).toBeGreaterThan(0);

  // 2. NEVER a notification wall — the feed is capped and honest.
  expect(feed.length, `${who}: feed overflow (${feed.length})`).toBeLessThanOrEqual(6);
  for (const e of feed) {
    // every row still answers the four questions (no meaningless entry survives at any depth)
    expect(e.what.length, `${who}: feed row with no 'what'`).toBeGreaterThan(0);
    expect(e.why.length, `${who}: feed row with no 'why'`).toBeGreaterThan(0);
  }

  // 3. NEVER a blank Advisor — either affordable moves, or an honest "save up" target.
  expect(plan.moves.length > 0 || plan.saveUp !== null, `${who}: advisor has nothing to say`).toBe(true);

  // 4. NEVER a total dead-end — at least ONE actionable surface points somewhere.
  const primaryActionable = mc.primary.remaining !== 'Ready now'; // under-ready = raise Power
  const actionable = primaryActionable || mc.secondary.length > 0 || plan.moves.length > 0 || road.next !== null;
  expect(actionable, `${who}: dead-end — nothing to do on any Foundation surface`).toBe(true);
}

describe('Foundations UX — the new-player face is calm and complete', () => {
  it('a fresh account: one clear objective, a quiet feed, a visible future, a first guide', () => {
    const fresh = defaultSave();
    const mc = missionControl(fresh);
    const feed = hiveIntel(fresh, NOW);
    const road = evolutionRoadmap(fresh);

    expect(mc.primary.title.length).toBeGreaterThan(0); // "what now?" is answered from minute 0
    expect(feed.length).toBeLessThanOrEqual(2); // silence over noise — no overwhelm on the first screen
    expect(road.next).not.toBeNull(); // the future is visible…
    expect(road.next!.revealed).toBe(false); // …and it's genuinely ahead

    // The first wing the curve reveals must offer a guided walkthrough (first-contact is never cold).
    const firstTeachable = FEATURES
      .filter((f) => f.kind === 'screen' && f.teach && f.id !== 'campaign' && f.id !== 'store')
      .sort((a, b) => a.order - b.order)[0];
    expect(guideFor(firstTeachable.teach!), `first teachable wing ${firstTeachable.id} has no guide`).toBeTruthy();
  });
});

describe('Foundations UX — no persona is ever stranded', () => {
  afterAll(() => meta.reset());

  // Drive each persona through a real early-game account and check the Foundations against its
  // live end-state. Loot rolls unseeded Math.random → pin it so the matrix is reproducible.
  for (const id of PERSONA_IDS) {
    it(`${id}: the Foundations always give it something to do`, () => {
      const lootRng = new Rng(0x5eed + id.length);
      const rnd = vi.spyOn(Math, 'random').mockImplementation(() => lootRng.next());
      try {
        simulateAccount(0x100 + PERSONA_IDS.indexOf(id), [3, 10], PERSONAS[id]);
        assertNeverStranded(meta.get(), id);
      } finally {
        rnd.mockRestore();
        meta.reset();
      }
    });
  }
});

describe('Foundations UX — the feed stays bounded as an account matures', () => {
  afterAll(() => meta.reset());

  it('a deep, busy veteran still gets a capped, meaningful feed (never a scroll of noise)', () => {
    const lootRng = new Rng(0xd00d);
    const rnd = vi.spyOn(Math, 'random').mockImplementation(() => lootRng.next());
    try {
      // The completionist buys everything and plays long — the heaviest notification load.
      simulateAccount(0x999, [5, 15, 30], PERSONAS.completionist);
      const save = meta.get();
      const feed = hiveIntel(save, NOW);
      expect(feed.length).toBeLessThanOrEqual(6); // the cap holds even at the busiest
      assertNeverStranded(save, 'deep-completionist');
    } finally {
      rnd.mockRestore();
    }
  });
});
