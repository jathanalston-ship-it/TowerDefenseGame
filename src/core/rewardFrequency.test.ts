// REWARD FREQUENCY CONTRACT (docs/REWARD-FREQUENCY.md) — the permanent philosophy, run as
// a build gate: every persona's measured hour inside every band, every reward source
// classified into the interaction-verb taxonomy, and the wind-down handoff present. New
// content shifts the measured hour through the live registries/curves; drifting out of a
// band fails HERE, not in a playtest three seasons later.

import { describe, expect, it } from 'vitest';
import {
  FREQUENCY_BANDS, FREQUENCY_PERSONAS, INTERACTION_VERBS, SOURCE_VERB, measureSession,
  missionCompletesPerHour, passLevelsPerHour, personaHour, rewardFrequencyProblems,
  verbTotalityProblems, walkSession,
} from './rewardFrequency';
import { REWARD_SOURCES } from './rewardLoops';

describe('the interaction verb taxonomy', () => {
  it('is total over REWARD_SOURCES — a new reward pathway must classify itself', () => {
    expect(verbTotalityProblems()).toEqual([]);
  });
  it('names only verbs from the closed vocabulary (no invented verbs)', () => {
    for (const [id, verb] of Object.entries(SOURCE_VERB)) {
      expect(INTERACTION_VERBS, `${id} → ${verb}`).toContain(verb);
    }
    // …and carries no stale rows for sources that no longer exist.
    const live = new Set(REWARD_SOURCES.map((s) => s.id));
    for (const id of Object.keys(SOURCE_VERB)) expect(live.has(id), `stale SOURCE_VERB row '${id}'`).toBe(true);
  });
});

describe('the frequency bands (the philosophy, machine-enforced)', () => {
  it('every persona lives inside every band', () => {
    expect(rewardFrequencyProblems()).toEqual([]);
  });

  it('beat rates derive from the LIVE data (quests judged by the real defs, pass by the real curve)', () => {
    for (const p of FREQUENCY_PERSONAS) {
      expect(missionCompletesPerHour(p)).toBeGreaterThan(0.5);
      expect(passLevelsPerHour(p)).toBeGreaterThan(1);
    }
  });

  it('the WIND-DOWN handoff fills session tails (the quick-finisher lane is modeled)', () => {
    // The drought the instrument originally found: grinder sessions whose last full run
    // settles with 6-9 minutes left. The rush.freeEntry recommendation hands that tail a
    // short-mode run — the walk must show beats inside the final 6 minutes somewhere.
    const p = FREQUENCY_PERSONAS.find((x) => x.id === 'grinder-free-mid');
    expect(p).toBeDefined();
    if (!p) return;
    let tailBeats = 0;
    for (let s = 1; s <= 48; s++) {
      const beats = walkSession(p, s);
      tailBeats += beats.filter((b) => b.minute >= p.sessionMinutes - 6).length;
      expect(measureSession(beats, p.sessionMinutes).maxGapMin).toBeLessThanOrEqual(FREQUENCY_BANDS.maxGapMin);
    }
    expect(tailBeats).toBeGreaterThan(0);
  });

  it('menu fatigue stays sub-tap-and-a-half on average (the Ready Chain economy holds)', () => {
    for (const p of FREQUENCY_PERSONAS) {
      expect(personaHour(p).tapsPerInteraction).toBeLessThan(1.5);
    }
  });
});
