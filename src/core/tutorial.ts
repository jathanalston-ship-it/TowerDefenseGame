// Tutorial framework — pure model + reducers (docs/TUTORIAL.md). Content-agnostic: a tutorial is a
// data-driven list of CHECKPOINTS, each teaching one mechanic and advancing on a TRIGGER. No DOM,
// no state, no lesson content — just the total, deterministic transitions the session store and the
// presentation layer drive. The Combat Tutorial def here is PLACEHOLDER scaffolding (real lessons
// are authored later against these same seams).

/** How a checkpoint completes. `continue` (tap) is the default; `event` is the lesson hook (a named
 * game/sim signal like "tower-placed"); `timed` auto-advances. */
export type CheckpointTrigger =
  | { kind: 'continue' }
  | { kind: 'event'; event: string }
  | { kind: 'timed'; ms: number };

/** Presentation cues for a checkpoint — ALL optional, attached by the lesson author later. The
 * overlay renders whichever are present (defaulting to a centered callout of the title), so the
 * reusable primitives are fully wired even before any lesson content exists. */
export interface CheckpointCue {
  spotlight?: string; // CSS selector to highlight (dims the rest + pulses an outline)
  arrow?: { target: string; from?: 'top' | 'bottom' | 'left' | 'right' };
  callout?: { text: string; target?: string; side?: 'top' | 'bottom' | 'left' | 'right' };
  focus?: string; // camera-focus target selector (scrolled into view when the checkpoint activates)
}

/** One teaching step. `cue` (presentation) and `event` triggers are attached by the lesson author
 * later; the framework needs only the id, an objective title, and the advance trigger. */
export interface TutorialCheckpoint {
  id: string;
  title: string; // shown in the objective tracker
  advance: CheckpointTrigger;
  cue?: CheckpointCue;
}

export interface TutorialDef {
  id: string;
  name: string;
  checkpoints: TutorialCheckpoint[];
}

export type TutorialStatus = 'active' | 'paused';

/** The resumable cursor. `attempt` bumps on restartCheckpoint so the presentation layer re-runs the
 * CURRENT step's setup (used when a tutorial run is lost — never restart the whole tutorial). */
export interface TutorialProgress {
  id: string; // tutorial def id
  checkpoint: number; // current checkpoint index (=== checkpoints.length ⇒ complete)
  status: TutorialStatus;
  attempt: number;
}

export function startProgress(def: TutorialDef): TutorialProgress {
  return { id: def.id, checkpoint: 0, status: 'active', attempt: 0 };
}

/** The current checkpoint, or null once complete. */
export function currentCheckpoint(p: TutorialProgress, def: TutorialDef): TutorialCheckpoint | null {
  return def.checkpoints[p.checkpoint] ?? null;
}

export function isComplete(p: TutorialProgress, def: TutorialDef): boolean {
  return p.checkpoint >= def.checkpoints.length;
}

export function atFinalCheckpoint(p: TutorialProgress, def: TutorialDef): boolean {
  return p.checkpoint === def.checkpoints.length - 1;
}

/** Advance to the next checkpoint (clamped to complete). Completion happens by advancing PAST the
 * final checkpoint, so completion only fires once the last step is actually finished. */
export function advance(p: TutorialProgress, def: TutorialDef): TutorialProgress {
  if (isComplete(p, def)) return p;
  return { ...p, checkpoint: p.checkpoint + 1, attempt: 0, status: 'active' };
}

/** Re-run the CURRENT checkpoint (loss / retry) — same index, bumped attempt, never a full reset. */
export function restartCheckpoint(p: TutorialProgress): TutorialProgress {
  return { ...p, attempt: p.attempt + 1, status: 'active' };
}

export function pause(p: TutorialProgress): TutorialProgress {
  return p.status === 'paused' ? p : { ...p, status: 'paused' };
}

export function resume(p: TutorialProgress): TutorialProgress {
  return p.status === 'active' ? p : { ...p, status: 'active' };
}

/** Jump straight to complete (Skip). */
export function skipToEnd(p: TutorialProgress, def: TutorialDef): TutorialProgress {
  return { ...p, checkpoint: def.checkpoints.length, status: 'active', attempt: 0 };
}

/** Coerce a loaded (possibly stale/partial/hostile) value into valid progress for `def`, or null.
 * Clamps the checkpoint into range so a def that lost checkpoints can't strand a save. */
export function sanitizeProgress(raw: unknown, def?: TutorialDef): TutorialProgress | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Partial<TutorialProgress>;
  if (typeof o.id !== 'string') return null;
  const max = def && def.id === o.id ? def.checkpoints.length : Number.MAX_SAFE_INTEGER;
  const checkpoint = typeof o.checkpoint === 'number' && isFinite(o.checkpoint) ? Math.max(0, Math.min(max, Math.floor(o.checkpoint))) : 0;
  return {
    id: o.id,
    checkpoint,
    status: o.status === 'paused' ? 'paused' : 'active',
    attempt: typeof o.attempt === 'number' && isFinite(o.attempt) && o.attempt >= 0 ? Math.floor(o.attempt) : 0,
  };
}

// ── The Combat Tutorial (PLACEHOLDER scaffolding — real lessons authored later) ─────────────────
// Enough checkpoints to exercise the whole framework end-to-end (start → steps → final → complete)
// via the default `continue` trigger. Each will later gain highlight targets, callouts, and `event`
// triggers as the actual combat lessons are written.
export const COMBAT_TUTORIAL: TutorialDef = {
  id: 'combat',
  name: 'Combat Tutorial',
  checkpoints: [
    { id: 'welcome', title: 'Welcome to the Hive', advance: { kind: 'continue' } },
    { id: 'lesson-placeholder-1', title: 'Lesson coming soon', advance: { kind: 'continue' } },
    { id: 'lesson-placeholder-2', title: 'Lesson coming soon', advance: { kind: 'continue' } },
    { id: 'complete', title: 'Ready to assimilate', advance: { kind: 'continue' } },
  ],
};

/** Registry of tutorials by id (open for future tutorials — one entry each). */
export const TUTORIALS: Record<string, TutorialDef> = {
  [COMBAT_TUTORIAL.id]: COMBAT_TUTORIAL,
};

export function tutorialDef(id: string): TutorialDef | undefined {
  return TUTORIALS[id];
}
