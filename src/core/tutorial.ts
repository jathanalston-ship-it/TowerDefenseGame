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
  /** `eyebrow` is the transmission header over the callout (the cinematic's RELAY 7 voice).
   *  `avoid` is a selector the bubble must NEVER cover — the lane while a wave runs, the draft
   *  row being taught: the presentation layer re-seats the bubble beside that region (measured,
   *  viewport-clamped), so layout changes elsewhere can't push a lesson over its own subject. */
  callout?: { eyebrow?: string; text: string; target?: string; side?: 'top' | 'bottom' | 'left' | 'right'; avoid?: string };
  focus?: string; // camera-focus target selector (scrolled into view when the checkpoint activates)
  /** Smart tutorial camera: ease the battlefield view gently toward this BOARD-space point while
   * the checkpoint is active (render-side only — GameView owns the smoothing; it never snaps). */
  canvasFocus?: { x: number; y: number; zoom: number };
}

/** One teaching step. `cue` (presentation) and `event` triggers are attached by the lesson author
 * later; the framework needs only the id, an objective title, and the advance trigger. */
export interface TutorialCheckpoint {
  id: string;
  title: string; // shown in the objective tracker
  advance: CheckpointTrigger;
  cue?: CheckpointCue;
  /** Milestone reward granted when this checkpoint is COMPLETED (small, one-time per account —
   * meta keeps the idempotence ledger, so replays never re-grant). */
  milestone?: { label: string; cores?: number; essence?: number };
}

export interface TutorialDef {
  id: string;
  name: string;
  checkpoints: TutorialCheckpoint[];
  /** The scripted encounter's wave count — the HUD reports THIS as the run length (and drops the
   *  host stage's finale objectives) so the lesson never advertises waves it won't play. */
  waves?: number;
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

// ── The Combat Tutorial — 10 authored lessons taught THROUGH a live, simplified encounter ───────
// Each step teaches one mechanic and unlocks the next ONLY on a confirmed player action (event
// trigger) or acknowledgement (continue) — never a timer. The live game is GATED to the lessons
// (game.tutorialMode): the director starts every wave and releases the held draft exactly when its
// lesson arrives, so the callouts can never describe a world that has moved on without them.
// Copy teaches PURPOSE (why a system matters), not just where a button is.
// COPY DISCIPLINE (playtest 2026-07: "too wordy — both testers skipped"): every callout is ≤2
// short sentences, verb-first, and describes EXACTLY the world on screen. The lessons run on the
// REAL deployment model — the favorite card + the Biomorph Conveyor — never a tutorial-only rail.
// NATURAL ORDER (onboarding pass 2026-11, docs/TUTORIAL-AUDIT.md §G): the lessons follow the real
// run rhythm — wave → draft → build → wave — so the wave counter only ever climbs, and the Hero
// Ability is taught DURING wave 2 with enemies on the field (a cast in an empty build phase did
// nothing visible). Every lesson shown while a wave runs `avoid`s the lane.
const LANE = 'canvas.board';
const ABILITY_BUTTON = '[data-tut="ability"] .ability-btn';
export const COMBAT_TUTORIAL: TutorialDef = {
  id: 'combat',
  name: 'Combat Tutorial',
  waves: 2,
  checkpoints: [
    { id: 'hive-core', title: 'Protect the Hive Core', advance: { kind: 'continue' },
      cue: { spotlight: '[data-tut="hive-core"]', canvasFocus: { x: 480, y: 880, zoom: 1.05 },
        callout: { eyebrow: 'UPLINK 01 · THE CORE', text: 'This is your Hive Core — your one life. If its integrity falls, the run ends.', target: '[data-tut="hive-core"]', side: 'bottom' } } },
    { id: 'biomass', title: 'Biomass grows your hive', advance: { kind: 'continue' },
      cue: { spotlight: '[data-tut="biomass"]',
        callout: { eyebrow: 'UPLINK 02 · FUEL', text: 'Biomass is this run’s fuel — enemies drop it, you spend it. Everything you grow comes from this counter.', target: '[data-tut="biomass"]', side: 'bottom' } } },
    { id: 'place-needle', title: 'Deploy your Needle Spitter', advance: { kind: 'event', event: 'tower-placed' },
      cue: { arrow: { target: '[data-tut="tower-card-first"]', from: 'top' }, canvasFocus: { x: 480, y: 780, zoom: 1.03 },
        callout: { eyebrow: 'UPLINK 03 · FIRST GROWTH', text: 'The starred card is your FAVORITE — always available, every run. Select it, then click a glowing slot on the field.', target: '[data-tut="tower-card-first"]', side: 'top' } } },
    { id: 'wave-1', title: 'Survive Wave 1', advance: { kind: 'event', event: 'wave-completed' },
      milestone: { label: 'The line holds', cores: 25 },
      cue: { callout: { eyebrow: 'UPLINK 04 · CONTACT', text: 'Wave 1 incoming. Your towers aim and fire on their own — hold the line.', avoid: LANE } } },
    { id: 'gene-card', title: 'Draft a Gene Card', advance: { kind: 'event', event: 'card-chosen' },
      milestone: { label: 'First strain isolated', essence: 10 },
      // The draft deals as wave 1 settles (natural order). focus: the reachability scroll brings
      // the row into view the moment it mounts; the bubble sits BELOW the row, never on a card.
      cue: { focus: '.overlay .cards',
        callout: { eyebrow: 'UPLINK 05 · EVOLUTION', text: 'Every cleared wave deals a Gene Card. The boost lasts this run; the card joins your permanent Archive. Pick one.', target: '.overlay .cards', side: 'bottom', avoid: '.overlay .cards' } } },
    { id: 'first-kill', title: 'Kills became Biomass', advance: { kind: 'continue' },
      cue: { spotlight: '[data-tut="biomass"]',
        callout: { eyebrow: 'UPLINK 06 · THE LOOP', text: 'Every kill in Wave 1 paid Biomass — kills fund growth, growth brings bigger kills. That loop is the whole run.', target: '[data-tut="biomass"]', side: 'bottom' } } },
    { id: 'second-tower', title: 'Deploy from the Conveyor', advance: { kind: 'event', event: 'tower-placed' },
      cue: { arrow: { target: '[data-tut="conveyor"]', from: 'top' },
        callout: { eyebrow: 'UPLINK 07 · THE CONVEYOR', text: 'New organisms GROW on the Biomorph Conveyor beside your favorite — your first is ready, free. Deploy it (or your favorite again) onto a second slot.', target: '[data-tut="conveyor"]', side: 'top' } } },
    { id: 'inspect', title: 'Inspect your towers', advance: { kind: 'continue' },
      cue: { spotlight: '.side-panel.inspector',
        callout: { eyebrow: 'UPLINK 08 · KNOW YOUR STRAIN', text: 'Tap any placed tower to open this Inspector — stats, Mastery, and (deeper in) Branch mutations. Look around, then continue.', target: '.side-panel.inspector', side: 'left' } } },
    { id: 'hero-ability', title: 'Use your Hero ability', advance: { kind: 'event', event: 'hero-ability' },
      // The director launches wave 2 as this lesson opens — the cast lands on a live swarm.
      cue: { arrow: { target: ABILITY_BUTTON, from: 'top' },
        callout: { eyebrow: 'UPLINK 09 · THE HERO', text: 'Wave 2 is here. Your Hero fights on its own — its Ability is yours: arm it (button or Q), then click on the swarm.', target: ABILITY_BUTTON, side: 'top', avoid: LANE } } },
    { id: 'graduation', title: 'Hold the line', advance: { kind: 'event', event: 'wave-completed' },
      cue: { callout: { eyebrow: 'FINAL UPLINK · GRADUATION', text: 'You know the loop — build, evolve, hold. Finish Wave 2 on your own.', avoid: LANE } } },
  ],
};

/** Abstract lesson signals a checkpoint can wait on (the TutorialDirector maps the game event bus
 *  onto these). Kept as a union so authoring a step against a non-existent signal is a type error. */
export type TutorialEvent = 'tower-placed' | 'enemy-killed' | 'hero-ability' | 'card-chosen' | 'wave-completed' | 'wave-started';

/** Registry of tutorials by id (open for future tutorials — one entry each). */
export const TUTORIALS: Record<string, TutorialDef> = {
  [COMBAT_TUTORIAL.id]: COMBAT_TUTORIAL,
};

export function tutorialDef(id: string): TutorialDef | undefined {
  return TUTORIALS[id];
}
