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

// ── The Combat Tutorial — 10 authored lessons taught THROUGH a live, simplified encounter ───────
// Each step teaches one mechanic and unlocks the next only when its objective is met (event trigger)
// or acknowledged (continue). `event` ids are the abstract lesson signals the TutorialDirector maps
// from the game's event bus (docs/TUTORIAL.md). Cues spotlight the real HUD (data-tut anchors) with a
// short callout — mechanics are taught by DOING, not by walls of text.
export const COMBAT_TUTORIAL: TutorialDef = {
  id: 'combat',
  name: 'Combat Tutorial',
  checkpoints: [
    { id: 'hive-core', title: 'Protect the Hive Core', advance: { kind: 'continue' },
      cue: { spotlight: '[data-tut="hive-core"]', callout: { text: 'This is your Hive Core. Protect it at all costs — if it falls, the run ends.', target: '[data-tut="hive-core"]', side: 'bottom' } } },
    { id: 'biomass', title: 'Biomass grows your hive', advance: { kind: 'continue' },
      cue: { spotlight: '[data-tut="biomass"]', callout: { text: 'Biomass is your in-run resource. You spend it to grow your defenses — more towers, stronger hive.', target: '[data-tut="biomass"]', side: 'bottom' } } },
    { id: 'place-needle', title: 'Place a Needle Spitter', advance: { kind: 'event', event: 'tower-placed' },
      cue: { arrow: { target: '[data-tut="tower-rail"]', from: 'bottom' }, callout: { text: 'Select the Needle Spitter below, then click a build slot on the field to place it.', target: '[data-tut="tower-rail"]', side: 'top' } } },
    { id: 'wave-1', title: 'Survive Wave 1', advance: { kind: 'event', event: 'enemy-killed' },
      cue: { callout: { text: 'Wave 1 incoming! Enemies advance toward the Hive — your towers fire on them automatically. Hold the line.' } } },
    { id: 'first-kill', title: 'Biomass fuels expansion', advance: { kind: 'continue' },
      cue: { spotlight: '[data-tut="biomass"]', callout: { text: 'Every enemy you kill drops Biomass. Biomass fuels expansion — bank it, then build.', target: '[data-tut="biomass"]', side: 'bottom' } } },
    { id: 'second-tower', title: 'Build a second tower', advance: { kind: 'event', event: 'tower-placed' },
      cue: { arrow: { target: '[data-tut="tower-rail"]', from: 'bottom' }, callout: { text: 'Different towers serve different battlefield roles. Place a second tower to layer your defense.', target: '[data-tut="tower-rail"]', side: 'top' } } },
    { id: 'hero-ability', title: 'Use your Hero ability', advance: { kind: 'event', event: 'hero-ability' },
      cue: { arrow: { target: '[data-tut="ability"]', from: 'bottom' }, callout: { text: 'Your Hero moves and fights on its own — and has an Active Ability. Trigger it once (the ability button, or Q).', target: '[data-tut="ability"]', side: 'top' } } },
    { id: 'gene-card', title: 'Draft a Gene Card', advance: { kind: 'event', event: 'card-chosen' },
      cue: { callout: { text: 'Wave cleared! Draft a Gene Card — its boost lasts only for THIS run, but the card itself joins your permanent Gene Archive, where it can be leveled forever. Pick one.' } } },
    { id: 'inspect', title: 'Inspect your towers', advance: { kind: 'continue' },
      cue: { spotlight: '.side-panel.inspector', callout: { text: 'Inspecting a tower shows its Stats and Branches, and lets you Move or Sell it. Take a look, then continue.', target: '.side-panel.inspector', side: 'left' } } },
    { id: 'graduation', title: 'Hold the line', advance: { kind: 'event', event: 'wave-completed' },
      cue: { callout: { text: 'You have the basics — towers, Biomass, your Hero, and Gene Cards. Clear one more wave to graduate.' } } },
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
