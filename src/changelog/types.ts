// CHRONICLE (docs/CHANGELOG-PIPELINE.md) — shared shapes for the automated patch-note
// pipeline. One vocabulary everywhere: the generator (scripts/gen-notes.ts) writes these
// shapes, the game (UpdateBriefing) and the website (patch-notes.js) read them.

/** The standard change categories — the ONLY vocabulary patch notes may use.
 *  Order matters: it is the display order in the briefing and on the website. */
export const NOTE_CATEGORIES = [
  'Gameplay', 'Balance', 'Heroes', 'Towers', 'Gene Cards', 'Enemies', 'Bosses',
  'Mega Bosses', 'UI', 'UX', 'Audio', 'Music', 'Visuals', 'Performance',
  'Optimization', 'Security', 'Website', 'Backend', 'Framework', 'Developer Tools',
  'Bug Fixes',
] as const;

export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

/** One player-facing line of a release. */
export interface ReleaseEntry {
  cat: NoteCategory;
  text: string;
  /** Major content addition (new tower/hero/enemy/boss/biome/system) — shown as a highlight. */
  major?: boolean;
}

/** One release (a date-keyed batch of commits). Sealed releases never change. */
export interface Release {
  id: string; // "v2026.07.10" (+ ".2" suffix when a sealed release shares the date)
  date: string; // ISO day of the newest commit in the batch
  title: string; // short human headline (editable before sealing)
  sealed: boolean;
  entries: ReleaseEntry[];
}

/** A classified commit — what the classifier decides about one git commit. */
export interface ClassifiedCommit {
  cat: NoteCategory;
  /** Cleaned player-facing text derived from the subject. */
  text: string;
  /** Internal-only (docs/tests/tooling churn) — recorded in HISTORY.md, hidden from players. */
  internal: boolean;
  /** The message was too vague to trust — recorded + flagged for manual review. */
  needsReview: boolean;
}
