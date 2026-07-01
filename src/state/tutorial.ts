// Tutorial session store (docs/TUTORIAL.md §2) — the reactive "state manager" for the LIVE run.
// Holds the active def + resumable progress, exposes commands mirroring the pure reducers, and
// syncs every transition to the save (via meta) so a mid-tutorial reload RESUMES. Completion /
// skip mark the tutorial permanently done and end the session. React subscribes via `use()`.

import { createStore } from './store';
import { meta } from './meta';
import {
  advance,
  currentCheckpoint,
  isComplete,
  pause,
  restartCheckpoint,
  resume,
  sanitizeProgress,
  startProgress,
  tutorialDef,
} from '../core/tutorial';
import type { TutorialCheckpoint, TutorialDef, TutorialProgress } from '../core/tutorial';

export interface TutorialSession {
  def: TutorialDef;
  progress: TutorialProgress;
}

const store = createStore<TutorialSession | null>(null);

/** Set the live session AND persist its progress (null clears the saved resume point). */
function commit(session: TutorialSession | null): void {
  store.set(session);
  meta.saveTutorialProgress(session ? session.progress : null);
}

export const tutorial = {
  use: store.use,
  get: store.get,

  /** Start a tutorial by id — RESUMES saved progress if it matches and isn't already complete,
   * otherwise starts fresh. No-op for an unknown id. */
  start(id: string): void {
    const def = tutorialDef(id);
    if (!def) return;
    const saved = sanitizeProgress(meta.tutorialState().progress, def);
    const progress =
      saved && saved.id === id && !isComplete(saved, def) ? resume(saved) : startProgress(def);
    commit({ def, progress });
  },

  /** The active checkpoint (null when no session / complete). */
  current(): TutorialCheckpoint | null {
    const s = store.get();
    return s ? currentCheckpoint(s.progress, s.def) : null;
  },

  /** Advance past the current checkpoint. Finishing the final one marks the tutorial permanently
   * complete and ends the session (completion ONLY happens here, at the end). */
  advance(): void {
    const s = store.get();
    if (!s) return;
    const next = advance(s.progress, s.def);
    if (isComplete(next, s.def)) {
      meta.completeTutorial(s.def.id);
      store.set(null);
      return;
    }
    commit({ ...s, progress: next });
  },

  /** Retry the CURRENT checkpoint (called on a tutorial loss) — never restarts the whole tutorial. */
  restartCheckpoint(): void {
    const s = store.get();
    if (s) commit({ ...s, progress: restartCheckpoint(s.progress) });
  },

  pause(): void {
    const s = store.get();
    if (s) commit({ ...s, progress: pause(s.progress) });
  },
  resume(): void {
    const s = store.get();
    if (s) commit({ ...s, progress: resume(s.progress) });
  },

  /** Skip the whole tutorial — marks it complete + ends the session. */
  skip(): void {
    const s = store.get();
    if (!s) return;
    meta.completeTutorial(s.def.id);
    store.set(null);
  },

  /** End the session WITHOUT completing (navigated away); saved progress remains for resume. */
  stop(): void {
    store.set(null);
  },
};
