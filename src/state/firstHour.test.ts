// THE FIRST HOUR (docs/PROGRESSION-GATING.md §announcements, docs/GUIDED-UNLOCKS.md §field-notes) —
// a new player is taught one learnable beat at a time:
//   · the SEAL RULE — no mechanic (Help wiki or What's New) points at a screen before it reveals;
//   · PACING — at most ANNOUNCE.perBeat What's New cards per finished run, a revealed screen's own
//     briefing first (a fresh account used to get 11 at once after run 1);
//   · FIELD NOTES — in-run controls are taught mid-fight at their moment, never queued in the hub.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { meta } from './meta';
import { ANNOUNCE, MECHANICS, MECHANIC_BY_ID, isMechanicUnlocked, pacedAnnouncements, pendingAnnouncements } from './mechanics';
import { FEATURE_BY_ID, featureRevealed } from './unlocks';
import { FIELD_NOTES, FIELD_NOTE_MECHANICS, FIELD_NOTE_PACE, dueFieldNote } from './fieldNotes';
import { simulateAccount } from '../dev/progressionSim';
import { PERSONAS } from '../dev/personas';
import type { HudSnapshot } from '../core/types';
import { REPO_ROOT } from '../dev/docSync';

describe('the seal rule — never advise a sealed screen', () => {
  it('no mechanic whose nav is a gated screen unlocks before that screen reveals (fresh save)', () => {
    meta.reset();
    const s = meta.get();
    const leaks = MECHANICS.filter((m) => !m.core && m.nav && FEATURE_BY_ID.has(m.nav) && !featureRevealed(s, m.nav) && isMechanicUnlocked(m, s));
    expect(leaks.map((m) => m.id)).toEqual([]);
    // the two rows that used to leak: the stage-25 Mulligan Lab and the stage-4 Gene Archive
    expect(isMechanicUnlocked(MECHANIC_BY_ID.get('nucleus')!, s)).toBe(false);
    expect(isMechanicUnlocked(MECHANIC_BY_ID.get('gene-essence')!, s)).toBe(false);
  });
});

describe('every screen gets its guided moment', () => {
  it('a screen that opens after minute 0 teaches a NON-core lesson (so its briefing + "Show me ▸" fire on arrival)', () => {
    meta.reset();
    const s = meta.get();
    const silent = [...FEATURE_BY_ID.values()]
      .filter((f) => f.teach && !featureRevealed(s, f.id) && MECHANIC_BY_ID.get(f.teach)?.core)
      .map((f) => f.id);
    expect(silent).toEqual([]); // Tower Lab / Hero Hall / Infinite used to be silent (core lessons)
    meta.reset();
  });
});

describe('announcement pacing', () => {
  it('a beat shows at most ANNOUNCE.perBeat cards, a revealed screen’s own briefing first', () => {
    expect(ANNOUNCE.perBeat).toBe(2);
    meta.reset();
    meta.debugSetCampaignStage(8); // a deep backlog: many systems unlocked, none announced
    const s = meta.get();
    expect(pendingAnnouncements(s).length).toBeGreaterThan(ANNOUNCE.perBeat);
    const beat = pacedAnnouncements(s, 0);
    expect(beat.length).toBe(ANNOUNCE.perBeat);
    expect(pacedAnnouncements(s, 1).length).toBe(1);
    expect(pacedAnnouncements(s, 2)).toEqual([]);
    // wing briefings (FEATURES.teach of a revealed screen) lead the queue
    const lessons = new Set([...FEATURE_BY_ID.values()].filter((f) => f.teach && featureRevealed(s, f.id)).map((f) => f.teach));
    const pendingLessons = pendingAnnouncements(s).filter((m) => lessons.has(m.id));
    if (pendingLessons.length > 0) expect(lessons.has(beat[0].id)).toBe(true);
    meta.reset();
  });

  it('meta.whatsNew() spends the beat as cards are archived and refills after the next run', () => {
    meta.reset();
    meta.debugSetCampaignStage(8);
    const first = meta.whatsNew();
    expect(first.length).toBe(ANNOUNCE.perBeat);
    meta.archiveMechanics([first[0].id]);
    expect(meta.whatsNew().length).toBe(ANNOUNCE.perBeat - 1);
    meta.archiveMechanics([meta.whatsNew()[0].id]);
    expect(meta.whatsNew()).toEqual([]); // the beat is spent; the rest waits (and is in the Help wiki)
    meta.reset();
  });

  it('a real first hour (tutorial → runs): ≤ perBeat cards after every run, and the queue drains', () => {
    const perRun: number[] = [];
    const waiting: number[] = [];
    const origReset = meta.reset.bind(meta);
    const origFinish = meta.finishRun.bind(meta);
    (meta as { reset: typeof meta.reset }).reset = () => {
      origReset();
      meta.completeTutorial('combat');
      meta.grantTutorialRewards('combat');
      meta.completeHudTour();
    };
    (meta as { finishRun: typeof meta.finishRun }).finishRun = ((r: Parameters<typeof meta.finishRun>[0]) => {
      const out = origFinish(r);
      let shown = 0;
      for (let k = 0; k < 20; k++) {
        const q = meta.whatsNew();
        if (q.length === 0) break;
        meta.archiveMechanics([q[0].id]); // the player reads the card
        shown++;
      }
      perRun.push(shown);
      waiting.push(pendingAnnouncements(meta.get()).length);
      return out;
    }) as typeof meta.finishRun;
    try {
      simulateAccount(7, [2.5], PERSONAS.fresh);
    } finally {
      (meta as { reset: typeof meta.reset }).reset = origReset;
      (meta as { finishRun: typeof meta.finishRun }).finishRun = origFinish;
      meta.reset();
    }
    expect(perRun.length).toBeGreaterThan(12);
    expect(Math.max(...perRun)).toBeLessThanOrEqual(ANNOUNCE.perBeat);
    expect(perRun[0]).toBe(ANNOUNCE.perBeat); // the first run still teaches — just two things, not eleven
    expect(Math.max(...waiting)).toBeLessThanOrEqual(10); // a backlog, never a pile-up
    expect(waiting[waiting.length - 1]).toBe(0); // drained inside the window
  });
});

describe('field notes — in-run controls teach themselves at their moment', () => {
  const hud = (o: Partial<HudSnapshot>): HudSnapshot => ({
    phase: 'wave', wave: 3, biomass: 0, emergency: false, earlyCall: -1, heroEvo: { levels: {}, totalOwned: 0 }, ...o,
  }) as HudSnapshot;

  it('every note teaches a real mechanic, and those mechanics never queue in What’s New', () => {
    for (const n of FIELD_NOTES) expect(MECHANIC_BY_ID.has(n.mechanic), n.mechanic).toBe(true);
    meta.reset();
    meta.debugSetCampaignStage(8);
    const queued = pendingAnnouncements(meta.get()).map((m) => m.id);
    for (const id of FIELD_NOTE_MECHANICS) expect(queued).not.toContain(id);
    meta.reset();
  });

  it('every anchor names a control the run view actually renders', () => {
    const src = ['src/ui/GameView.tsx', 'src/ui/Hud.tsx', 'src/ui/BuildPanel.tsx'].map((f) => readFileSync(join(REPO_ROOT, f), 'utf8')).join('\n');
    for (const n of FIELD_NOTES) {
      const tut = /\[data-tut="([\w-]+)"\]/.exec(n.anchor);
      const cls = /^\.([\w-]+)$/.exec(n.anchor);
      if (n.avoid) expect(src, n.avoid).toContain('className="board"'); // the only avoid region in use: the board canvas
      if (tut) expect(src, n.anchor).toContain(`data-tut="${tut[1]}"`);
      else if (cls) expect(src, n.anchor).toMatch(new RegExp(`className=[{"\`][^\\n]*\\b${cls[1]}\\b`));
      else throw new Error(`unrecognised anchor ${n.anchor}`);
    }
  });

  it('notes fire on their moment, danger first, and wait for the run to settle', () => {
    const none = new Set<string>();
    expect(dueFieldNote(hud({ wave: 1, earlyCall: 40 }), { speed: 1 }, none)).toBeNull(); // wave 1: let the run settle
    expect(dueFieldNote(hud({ wave: 1, emergency: true }), { speed: 1 }, none)?.mechanic).toBe('emergency-defense'); // danger never waits
    expect(dueFieldNote(hud({ earlyCall: 40 }), { speed: 1 }, none)?.mechanic).toBe('early-call');
    expect(dueFieldNote(hud({}), { speed: 1 }, none)?.mechanic).toBe('game-speed');
    expect(dueFieldNote(hud({}), { speed: 2 }, none)).toBeNull(); // already using speed — nothing to teach
    expect(dueFieldNote(hud({ earlyCall: 40 }), { speed: 1 }, new Set(['early-call']))?.mechanic).toBe('game-speed'); // seen ⇒ next
    expect(FIELD_NOTE_PACE.minWave).toBeGreaterThanOrEqual(2);
  });
});
