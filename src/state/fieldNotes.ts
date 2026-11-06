// FIELD NOTES (docs/GUIDED-UNLOCKS.md §field-notes) — the in-run half of "teach each system at the
// moment it matters". A handful of mechanics are CONTROLS the player meets mid-fight (game speed, Early
// Call, the Final Defense Zone, mid-run hero evolution); a hub What's New card about them after the run
// is a lecture about something already past. Instead each gets ONE short note, anchored to the control,
// the first time its moment arrives in a real (non-tutorial) run. Showing a note archives its mechanic
// into the Help wiki (help.seen), so What's New never announces it twice.
//
// DATA: a new in-run lesson is one row — the mechanic id it teaches (a MECHANICS row), the HUD control
// it points at, the line, and `when` over the live HUD snapshot (presentation only; the sim never reads
// this). Pure — no React, no meta.

import type { HudSnapshot } from '../core/types';
import { HERO_EVO_CATEGORIES, heroEvoCost, HERO_EVO } from '../core/heroEvolution';

export type FieldNoteSide = 'top' | 'bottom' | 'left' | 'right';

export interface FieldNoteDef {
  /** The MECHANICS row this note teaches (archived into help.seen when shown). */
  mechanic: string;
  /** CSS selector of the HUD control the note points at (missing ⇒ the note centres, never traps). */
  anchor: string;
  side: FieldNoteSide;
  /** A region the bubble must never cover (the board mid-fight) — it re-seats beside it. */
  avoid?: string;
  eyebrow: string;
  text: string;
  /** The note's moment, over the live HUD snapshot + the view's speed. */
  when: (hud: HudSnapshot, view: { speed: number }) => boolean;
}

/** Pacing: one note at a time, held this long (tap dismisses sooner), at least `gapMs` apart, and
 *  never before the run has settled (`minWave`). */
export const FIELD_NOTE_PACE = { holdMs: 7000, gapMs: 20_000, minWave: 2 };

const heroEvoAffordable = (h: HudSnapshot): boolean =>
  HERO_EVO_CATEGORIES.some((c) => {
    const lvl = h.heroEvo.levels[c.id] ?? 0;
    return lvl < HERO_EVO.maxLevel && h.biomass >= heroEvoCost(c, lvl, h.heroEvo.totalOwned);
  });

/** Order = priority when two moments coincide (danger first). */
export const FIELD_NOTES: FieldNoteDef[] = [
  {
    mechanic: 'emergency-defense', anchor: '[data-tut="hive-core"]', side: 'bottom', avoid: 'canvas.board', eyebrow: 'FINAL DEFENSE ZONE',
    text: 'An enemy crossed the red line — it is inside your last defense. Kill it before it reaches the Core.',
    when: (h) => h.emergency,
  },
  {
    mechanic: 'early-call', anchor: '.early-call-btn', side: 'bottom', avoid: 'canvas.board', eyebrow: 'EARLY CALL',
    text: 'Holding fine? Call the next wave now — the waves overlap, and the wait you skip pays Biomass. (Space)',
    when: (h) => h.phase === 'wave' && h.earlyCall > 0 && !h.emergency,
  },
  {
    mechanic: 'hero-evolution', anchor: '.evo-open-btn', side: 'bottom', avoid: 'canvas.board', eyebrow: 'HERO EVOLUTION',
    text: 'Your hero can evolve mid-run: open the Hero Console in your Run Build panel (E) and spend Biomass — ten axes, each up to level ten.',
    when: (h) => h.phase === 'prep' && heroEvoAffordable(h),
  },
  {
    mechanic: 'bonds-in-battle', anchor: '.bonds-strip', side: 'right', avoid: 'canvas.board', eyebrow: 'CLASS BOND',
    text: 'A bond woke: you fielded two units of one class. Four and six wake stronger tiers — Run Build shows what each class gives.',
    when: (h) => (h.bonds ?? []).some((b) => b.tier > 0),
  },
  {
    mechanic: 'game-speed', anchor: '.speed-ctl', side: 'bottom', avoid: 'canvas.board', eyebrow: 'GAME SPEED',
    text: 'The same fight, faster: tap 2× or 5×. Speed drops back to 1× by itself when danger spikes.',
    when: (h, v) => h.phase === 'wave' && h.wave >= 3 && v.speed === 1 && !h.emergency,
  },
];

/** The mechanics taught IN-RUN — What's New never queues them (they still list in the Help wiki). */
export const FIELD_NOTE_MECHANICS: ReadonlySet<string> = new Set(FIELD_NOTES.map((n) => n.mechanic));

/** The note to show now: the first unseen row whose moment is live, or null. */
export function dueFieldNote(hud: HudSnapshot, view: { speed: number }, seen: ReadonlySet<string>): FieldNoteDef | null {
  if (hud.wave < FIELD_NOTE_PACE.minWave && !hud.emergency) return null;
  for (const n of FIELD_NOTES) if (!seen.has(n.mechanic) && n.when(hud, view)) return n;
  return null;
}
