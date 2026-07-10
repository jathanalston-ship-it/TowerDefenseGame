# Tutorial framework

A reusable, content-agnostic system for guided, one-mechanic-at-a-time tutorials. This document
describes the ARCHITECTURE. The first consumer, the **Combat Tutorial, is now fully authored** — 10
lessons taught over a LIVE simplified game (see "Combat Tutorial — shipped" below).

## Combat Tutorial — shipped (GATED flow; audit record: docs/TUTORIAL-AUDIT.md)

Ten checkpoints (`COMBAT_TUTORIAL` in `core/tutorial.ts`) teach through play, each unlocking only
on a CONFIRMED player action (event trigger) or acknowledgement — never a timer: protect the Hive
Core → Biomass → place a Needle → survive Wave 1 → kills-became-Biomass recap → second tower →
Hero ability → Gene Card draft → tower Inspect → graduate. The Gene Card step teaches BOTH halves
of the system (GENE-EVOLUTION.md): the drafted boost is run-only, but the card joins the permanent
Gene Archive.

- **The game is gated to the lesson plan (`game.tutorialMode`).** Set only by the director, never
  on a golden run. While on: natural post-wave drafts are HELD (`endWave` skips the roll), the
  wave console's launch controls are locked (`wb-tutlock` notice), Space/F hotkeys are swallowed,
  the speed switch is hidden, auto-start is never restored from prefs, and the DraftModal is
  forced manual. The game can never outrun or desync from the lesson.
- **Director (`ui/tutorial/tutorialDirector.ts`).** Bridges the game event bus onto the abstract
  lesson signals (`tower-placed`, `hero-ability`, `card-chosen`, `wave-completed` …) — advancing
  the CURRENT step once, guarded against bursts — and scripts EVERY beat: starts each tutorial
  wave, releases the held draft via `game.openTutorialDraft()` exactly at the gene-card lesson,
  tops the bank up (`game.tutorialEnsureBiomass`) so the build lesson can't stall, and pre-selects
  the first tower for the Inspector lesson.
- **Live encounter.** `TutorialRunner` hosts a real `<GameView tutorial onReady=…>` (fail-safe: a
  huge Integrity bonus so the core can't fall) + the `TutorialOverlay`. The `tutorial` flag skips
  loot banking and the auto run-end hand-off; the tutorial's Pause also freezes the SIM.
- **Non-blocking guidance + smart camera.** Board steps use an arrow + callout anchored to the
  EXACT element (`data-tut="tower-card-first"`, ability pod), pointer-through, viewport-clamped
  clear of the slot lattice; the objective pill sits below the HUD. `cue.canvasFocus` glides the
  battlefield view toward a board point (eased, ≤6 % zoom — never snaps).
- **Rewards.** Mid-flow MILESTONES (`checkpoint.milestone` → `meta.grantTutorialMilestone`,
  ledger `save.tutorial.milestones`): +25 Genome Cores for surviving Wave 1, +10 Gene Essence at
  the first draft — celebrated by an overlay toast. First COMPLETION (gated on the store's end
  reason — a Skip never pays) grants Genome Cores + Tower/Hero Shards + a guaranteed **rare
  Tutorial Bio-Container** + a basic Hero weapon + the *Assimilation Protocol* achievement —
  shown by `TutorialRewardReveal`. Replays re-teach but **never re-grant** (all three ledgers).

Below is the underlying architecture (unchanged; the lessons are data + presentation props on it).

Design goals: teach through interaction (no wall of text), one mechanic per checkpoint, fully
replayable, skippable, pausable/resumable, and never a fail state. The framework is a **distinct
gameplay mode / screen**, not code baked into Campaign.

---

## Layers

```
core/tutorial.ts        pure model + reducers (no DOM/state) — checkpoints, triggers, progress
state/tutorial.ts       reactive session store — the live run; persists progress via meta
save.tutorial (meta)    permanent completion + resumable progress (cleared on Account Reset)
ui/tutorial/*           reusable PRESENTATION primitives (highlight, arrow, callout, …)
ui/TutorialRunner.tsx   the 'tutorial' screen: drives a TutorialDef through the overlay
App / Hub Settings      first-time detection, Replay entry, reset integration
```

### 1. Core model (`core/tutorial.ts`, pure)

- **`TutorialCheckpoint`** — one teaching step: `{ id, title, advance }`. Presentation cues
  (what to highlight, arrow direction, callout text) are attached by the *lesson author* later;
  the framework only needs the id, the objective title, and how the step completes.
- **`CheckpointTrigger`** — how a checkpoint advances:
  - `{ kind: 'continue' }` — the player taps Continue (the default).
  - `{ kind: 'event', event }` — a named game/sim event (the hook lessons use: "placed a tower").
  - `{ kind: 'timed', ms }` — auto-advance after a delay.
- **`TutorialDef`** — `{ id, name, checkpoints[] }`. Content is data; the runner is generic.
- **`TutorialProgress`** — `{ id, checkpoint, status, attempt }`, the resumable cursor.
- **Pure reducers** — `startProgress`, `advance`, `restartCheckpoint` (bumps `attempt` — re-runs
  the current step, never the whole tutorial), `pause`/`resume`, `skipToEnd`, `currentCheckpoint`,
  `atFinalCheckpoint`, `isComplete`. All total, all deterministic → trivially testable.

Completion is reaching the END: `isComplete` is true only once progress advances **past the final
checkpoint**. Skipping jumps to complete.

### 2. State manager (`state/tutorial.ts`, reactive)

A small `createStore` session store holding `{ def, progress } | null` for the active run, exposed
to React via `use()`. Public API mirrors the reducers as commands: `start(def)`, `advance()`,
`restartCheckpoint()`, `skip()`, `pause()`, `resume()`, `stop()`. Every transition:

- persists the live `progress` to the save (`meta.saveTutorialProgress`) so a mid-tutorial reload
  **resumes** where it left off;
- on reaching the end (or skip), calls `meta.completeTutorial(id)` — permanent — and clears the
  saved progress.

### 3. Persistence (`save.tutorial`, owned by meta)

`save.tutorial = { completed: string[]; progress: TutorialProgress | null }` (schema v12,
additive; `withDefaults` fills the default for older saves). Meta API: `tutorialState()`,
`isTutorialDone(id)`, `completeTutorial(id)`, `saveTutorialProgress(p)`.

- **First-time detection** — `meta.shouldAutoTutorial()` = combat tutorial not completed **and**
  the save looks brand-new (`totalRuns === 0`). This deliberately does **not** force the tutorial
  on existing players (who have runs) after the migration; only a fresh save or a reset qualifies.
- **Account Reset** — `meta.reset()` writes a fresh `defaultSave()`, so completion + progress are
  wiped; the reset flow re-launches the tutorial. `devReset('everything')` wipes the save too.

### 4. Presentation systems (`ui/tutorial/`, reusable)

All are generic (target a CSS selector or a `DOMRect`, take text/direction), `pointer-events`-aware,
and reduced-motion friendly — reusable by **any** future tutorial:

| Primitive | Role |
|---|---|
| `useTargetRect(selector)` | live-measures a target element (resize/scroll observers) |
| `Spotlight` | dims all UI except the target + a **pulsing outline** (highlight + dimming) |
| `TutorialArrow` | an **animated arrow** pointing at a target/direction |
| `Callout` | a **tooltip callout** bubble anchored to a target |
| `ContinuePrompt` | the **continue prompt** affordance |
| `ObjectiveTracker` | a **temporary objective tracker** ("Step X of N" + current objective) |
| `CameraFocus` | **camera focus** — scrolls/tilts focus toward a target (canvas pan is a lesson hook) |
| `TutorialOverlay` | orchestrator: reads the store, renders the current checkpoint's cues + Skip/Pause |

### 5. The tutorial mode (`ui/TutorialRunner.tsx` + App)

A dedicated `screen === 'tutorial'` (its own mode, not Campaign). The runner mounts a backdrop +
`TutorialOverlay` bound to the store, and calls back on complete/skip. **Rules** the runner
enforces: tutorial enemies use simplified behavior, no random deaths, no permanent penalties, **no
fail states** — and on a loss it calls `restartCheckpoint()` (never restarts the whole tutorial).
(These are framework guarantees; the combat lessons that exercise them are authored later.)

### 6. Entry points

- **First launch / reset** → `App` boot checks `meta.shouldAutoTutorial()` → `screen='tutorial'`.
- **Replay** → Hub **Settings → Replay Combat Tutorial** → `App` launches the tutorial; available
  once the framework exists (and always after completion).

---

## What ships now vs later

- **Now (framework):** everything above — model, store, persistence, reset/first-time detection,
  the reusable presentation primitives, the runner screen, and the Settings replay entry. The
  Combat Tutorial def exists with **placeholder** checkpoints so the whole loop is demonstrable and
  tested end-to-end.
- **Later (content):** the real combat lessons — authoring each checkpoint's highlight targets,
  arrows, callouts, and `event` advance triggers, plus the simplified tutorial encounter wired into
  the sim. No framework change required; lessons are data + presentation props.

## Cinematic presentation (the film → trial handoff)

The tutorial opens under a letterboxed COLD-OPEN banner ("DEEP CRUST RELAY 7 · UPLINK ESTABLISHED /
TRIAL ONE — HOLD THE LINE") that continues the opening cinematic's voice — shown once per session
start (tap to dismiss), over the already-breathing god-mode board. Lessons then run as
TRANSMISSIONS: every authored callout carries an `eyebrow` uplink header (`UPLINK 01 · THE CORE` …
`FINAL UPLINK · GRADUATION`), body copy types in via the `Typewriter` primitive (~28ms/char, capped
~1.1s, tap-to-complete, reduced-motion shows it whole), the objective tracker fills an uplink
progress bar, a soft `tut_step` blip marks every COMPLETED checkpoint (never a retry), and genuine
completion lands the `tut_done` graduation stinger under the reward reveal.
