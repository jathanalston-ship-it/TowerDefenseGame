# Tutorial framework

A reusable, content-agnostic system for guided, one-mechanic-at-a-time tutorials. This document
describes the ARCHITECTURE. The first consumer, the **Combat Tutorial, is now fully authored** — 10
lessons taught over a LIVE simplified game (see "Combat Tutorial — shipped" below).

## Combat Tutorial — shipped (GATED flow; audit record: docs/TUTORIAL-AUDIT.md)

Ten checkpoints (`COMBAT_TUTORIAL` in `core/tutorial.ts`) teach through play, each unlocking only
on a CONFIRMED player action (event trigger) or acknowledgement — never a timer, in the REAL run
rhythm (wave → draft → build → wave; §onboarding-flow): protect the Hive Core → Biomass → place a
Needle → survive Wave 1 → Gene Card draft (dealt as wave 1 settles) → kills-became-Biomass recap →
second tower from the Conveyor → tower Inspect → Hero ability (wave 2 launches with the lesson, so
the cast lands on a live swarm) → graduate (finish wave 2). The encounter is **2 waves**
(`COMBAT_TUTORIAL.waves`), and the HUD says so. The Gene Card step teaches BOTH halves of the
system (GENE-EVOLUTION.md): the drafted boost is run-only, but the card joins the permanent Gene
Archive.

- **The game is gated to the lesson plan (`game.tutorialMode`).** Set only by the director, never
  on a golden run. While on: natural post-wave drafts are HELD (`endWave` skips the roll), the
  wave console's launch controls are locked (`wb-tutlock` notice), Space/F hotkeys are swallowed,
  the speed switch is hidden, auto-start is never restored from prefs, and the DraftModal is
  forced manual. The game can never outrun or desync from the lesson.
- **Director (`ui/tutorial/tutorialDirector.ts`).** Bridges the game event bus onto the abstract
  lesson signals (`tower-placed`, `hero-ability`, `card-chosen`, `wave-completed` …) — advancing
  the CURRENT step once, guarded against bursts — and scripts EVERY beat: starts each tutorial
  wave (wave 2 with the Hero-ability lesson), releases the held draft via
  `game.openTutorialDraft()` inside wave 1's settle beat (so it deals in natural order and the
  wave counter never steps back), tops the bank up (`game.tutorialEnsureBiomass`) so the build
  lesson can't stall, pre-selects the first tower for the Inspector lesson, recharges the ability
  (`game.tutorialReadyAbility`) for its lesson, and sets `game.tutorialWaves` — a HUD read-model
  override so the run length reads 2 and the host stage's finale objectives (boss / cache tiers)
  never appear. A slow caster who outlasts wave 2 graduates on reaching the final step.
- **Live encounter.** `TutorialRunner` hosts a real `<GameView tutorial onReady=…>` (fail-safe: a
  huge Integrity bonus so the core can't fall) + the `TutorialOverlay`. The `tutorial` flag skips
  loot banking and the auto run-end hand-off; the tutorial's Pause also freezes the SIM.
- **Non-blocking guidance + smart camera.** Board steps use an arrow + callout anchored to the
  EXACT element (`data-tut="tower-card-first"`, the ability BUTTON `[data-tut="ability"]
  .ability-btn`), pointer-through, viewport-clamped clear of the slot lattice; the objective pill
  sits below the HUD. `cue.canvasFocus` glides the battlefield view toward a board point (eased,
  ≤6 % zoom — never snaps). See §desktop-contract for the never-cover rules.
- **Rewards.** Mid-flow MILESTONES (`checkpoint.milestone` → `meta.grantTutorialMilestone`,
  ledger `save.tutorial.milestones`): +25 Genome Cores for surviving Wave 1, +10 Gene Essence at
  the first draft — celebrated by an overlay toast. First COMPLETION (gated on the store's end
  reason — a Skip never pays) pays **THE graduation** (§graduation): 300 Genome Cores + 30
  Strain Samples per tower + 40 Apex Genome + **2 rare Tutorial Bio-Containers** + 2 basic Hero
  weapons + the *Assimilation Protocol* achievement — shown ONCE, as the GRADUATION step of
  **THE COMMISSIONING** (`ui/tutorial/Commissioning.tsx`, docs/PROFILE.md §commissioning) — the
  post-tutorial account-creation ceremony that then walks designation → sigil + founding-title
  oath → the account safeguard. Replays re-teach but **never re-grant** (all ledgers), and
  never re-run the ceremony.

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
start (tap to dismiss), over the already-breathing god-mode board. **The handoff (2026-11):** on
first boot the tutorial mounts BENEATH the film, so the banner's 3.4s clock HOLDS while the film is
on screen (`InitCutscene.useIntroPlaying()` — it used to expire under the film, so players landed
straight on lesson 1); and the descent's last frame (full-screen gold bloom) no longer hard-cuts
to the dark board — App fades a 520ms `.intro-afterglow` (the bloom under the film grade's dark
bands, `onDone(dived)`) off the banner, so RELAY 7's letterbox emerges from the light. A Skip at
the pre-roll gate (dark) and reduced motion (no dive) get no afterglow. Lesson anchors, probe
selectors and the checkpoint flow are unchanged. Lessons then run as
TRANSMISSIONS: every authored callout carries an `eyebrow` uplink header (`UPLINK 01 · THE CORE` …
`FINAL UPLINK · GRADUATION`), body copy types in via the `Typewriter` primitive (~28ms/char, capped
~1.1s, tap-to-complete, reduced-motion shows it whole), the objective tracker fills an uplink
progress bar, a soft `tut_step` blip marks every COMPLETED checkpoint (never a retry), and genuine
completion lands the `tut_done` graduation stinger under the reward reveal.

## §phone — the dock contract (docs/RESPONSIVE-DESIGN.md §tutorial)

**A lesson must never cover the action it is asking for.** On narrow shells (≤700px) the
floating callout bubble is replaced by a DOCKED transmission banner (`.tut-callout.is-docked`,
`primitives.tsx`): the lesson docks to the viewport edge OPPOSITE its anchor — a target in the
top 45% (the HUD spotlights) docks the banner to the bottom; toolbar anchors and target-less
steps dock to the top, clear of the build-slot rows. Pause/Skip retire to a compact translucent
top-right row (their old bottom corner sat on the hero ability button), dropping below any
spotlight that holds the top band (`--tut-ctl-top`, set inline by the overlay). The milestone
toast rides the top-left strip. While the Gene-Card draft is up the banner COLLAPSES to its
eyebrow strip and floating side sheets stand down (`:has(.overlay .cards)`) — the draft owns the
screen. Reachability: `cue.focus` joins the auto-scroll fallback chain with a generous
late-mount window, so a surface that opens mid-step (the draft appears when its wave settles)
is still brought into view; a missing spotlight target renders NO scrim
(`dimWhenMissing={false}`) instead of blacking out the lesson.

Verified by a headless per-step geometry audit at 390×844: at every checkpoint the required
interaction surfaces (continue button / tower card + all 15 build slots / ability button + cast
zone / draft cards) are asserted unobstructed and pointer-reachable, then the full 10-checkpoint
trial is completed end-to-end. Desktop (>700px) keeps the measured floating bubble unchanged.

---

## §accuracy — the tutorial teaches the REAL game (2026-07 playtest response)

Playtest finding: testers skipped a wordy tutorial that also taught a **deployment model the
game no longer uses** (a classic full tower rail; real runs use the Biomorph Conveyor). Fixes:

- **Conveyor-native lessons.** `game.tutorialMode` no longer forks deployment: the belt ticks
  under the tutorial (the run-start FREE gift included), placement rides `deployTower` (the
  universal cost curve), and the Toolbar rails the favorite + belt exactly as in real runs.
  The old `second-tower` lesson is now **Deploy from the Conveyor** (anchored on
  `[data-tut="conveyor"]`); `graduation` no longer defers the conveyor to Help.
  Pinned by `tutorialGate.test.ts` §accuracy (belt live + identical deploy pricing).
- **Copy discipline.** Every callout is ≤2 short sentences, verb-first (the old callouts ran
  3–4 clauses; both testers stopped reading).
- **Skippers land on Campaign.** A tutorial Skip routes to the Campaign screen (one Deploy from
  the real Stage 1) instead of the bare hub — a skipper wants to play, not navigate
  (`TutorialRunner` → `navBus.go('campaign')`). Skip still marks the tutorial seen (never
  re-forced) and never pays rewards — and since 2026-11 it first confirms what it forfeits
  (§graduation).
- Stage 1's opening waves are the **Early Brood** (ENEMIES.md §early-brood) — four weak
  teaching enemies, so "figure it out on my own" is a safe, legible first hour.

---

## §onboarding-flow — one short, accurate onboarding (2026-11 pass; audit: TUTORIAL-AUDIT.md §G)

A fresh account's whole first-time path, in order — **one** reward moment:

| # | Beat | Steps | Skippable |
|---|---|---|---|
| 1 | Marketing home → **Play Free** | — | — |
| 2 | "Incoming transmission" → opening cutscene | 1 tap + film | yes (Skip) |
| 3 | Cold-open banner → **Combat Tutorial** | 10 lessons, 2 waves | yes (Skip confirm, §graduation) |
| 4 | **THE COMMISSIONING** — GRADUATION (the ONE reward reveal) → designation → identity → safeguard | 4 cards | every card |
| 5 | Hub → **THE FIRST LOOP**, beat DEPLOY (§first-loop) — replaced the passive Field Orientation for new accounts | 2 steps | yes (Skip the guide) |
| 6 | After runs 1 and 2 → first-loop beats GROW and COLLECT | 8 + 7 hands-on steps | yes |

Field Orientation (`ui/HudTour.tsx` `TOUR`) is cut from 10 stops (of 16 authored) to the four a graduate needs on
minute one, in the order they act: **Your Next Fight** (`.mc-campaign`) → **Rewards Hub**
(the Vault, where the graduation containers wait) → **Evolution Hub** (where the Cores are
spent) → **Profile & Help** (account, settings, the Field Manual, replays). Every other wing
announces itself with its own What's New card when it reveals. A combat-tutorial skipper's tour
drops the not-yet-revealed stops (typically 2 remain).

Since 2026-11-06 a NEW account does not get this tour (the first-loop coach walks the same ground
hands-on); it stays replayable from Help / Settings.

## §first-loop — walk the loop, don't describe it (2026-11-06 owner playtest)

The finding: "a LOT on the screen in one go — break up the tutorial, make the player engage
step-by-step with menu navigation and 'what's next', walk them through the loop the first once or
twice." The Combat Tutorial teaches the FIGHT; the first loop teaches the LOOP around it by having
the player do it, one real control at a time (`state/firstLoop.ts` data, `ui/FirstLoopCoach.tsx`).

| Beat | When (`totalRuns`) | Steps — each spotlights the REAL control |
|---|---|---|
| DEPLOY | 0 (right after the commissioning) | your next fight → **tap Continue Campaign** |
| GROW (needs the Tower Lab) | 1–2 | your run paid you → **open the Evolution Hub** → **open the Tower Lab** → **buy a star** → Power went up → **head home** → what to do next (the objective ledger) → **deploy Stage 2** |
| COLLECT (needs the Genetic Vault) | 2–3 | **open the Rewards Hub** → **open the Genetic Vault** → **crack a container** → **head home** → BEST MOVE → **open the Daily Bio-Cache** → that is the loop |

- **Hands-on:** a click step completes on the player's OWN click (capture listener — the click still
  does its job) or on the save change that proves it (`done`: a star bought, a container cracked, the
  cache claimed). Explanations get Next. Copy is ≤ 2 short sentences (tested).
- **The coach owns the hub while a beat is due:** What's New, the update briefing and the reward /
  level placards wait; the beat's mechanics are archived when it completes (What's New never repeats
  the lesson). It steps aside for any other dialog or Popup (a vault reveal, the cache opening).
- **The board grows with it:** until the loop is done the Command Center holds back the live-event
  banner, Recommended, the campaign forecast, the roadmap, the feed and the dashboard, and the
  objective ledger shows two rows (`FIRST_LOOP_LEDGER_ROWS`); the Growth panel arrives after GROW.
- **Never traps:** a rail control on a narrow shell points at ☰ first; a control below the fold is
  scrolled into view; a control on another screen offers "Take me there"; a landing card whose hub has
  ONE revealed screen is skipped (the rail door opens that screen directly — `dest`); a landing-only
  control that vanishes steps back to the door that opens it; a control genuinely absent on its own screen offers
  Next; "Skip the guide" ends the whole loop.
- **Who sees it:** graduates only (the Combat Tutorial done or skipped), in each beat's run window;
  an account with ≥ `FIRST_LOOP_MAX_RUNS` (4) runs never does. Progress lives in the tutorial
  milestone ledger (`first-loop:<beat>` / `first-loop:skip`) — no save-schema change.
- **Proof:** `npm run probe:first-session` now plays the whole first loop (deploy → Stage 1 → grow →
  Stage 2 → collect) by clicking whatever the coach spotlights; `firstLoop.test.ts` pins every anchor
  against the UI source, the windows, the skip, the archive and the progressive board.

## §graduation — ONE payout, idempotent ledgers

`meta.grantOnboardingRewards()` runs once on the tutorial's genuine completion and pays every
onboarding ledger still unclaimed — `combat` (the tutorial's grant) and `hudtour` (the grant
the Field Orientation used to pay at its finish, which produced a SECOND identical
"Assimilation Protocol" card) — merged into ONE `TutorialRewardSummary` (counts add:
`containers`, `items`). Totals are exactly what tutorial + tour paid before the merge; the
per-ledger numbers live in `TUTORIAL_GRANT` (state/meta.ts).

- **Idempotent per ledger** (`save.tutorial.rewarded`): a replay pays nothing; a save that
  already claimed either ledger is paid only the remainder. Grant uids carry the ledger id, so
  two grants in the same millisecond never collide.
- **The tour pays nothing** — Finish and Skip call the same `completeHudTour()`. The one
  exception is a LEGACY save that graduated under the old two-part promise (`combat` paid,
  `hudtour` owed): the tour's end (either button) pays that remainder with the standalone
  `TutorialRewardReveal`. A tutorial skipper is never paid by the tour.
- **No silent forfeit.** The tutorial's *Skip Tutorial* opens a confirm naming what is lost
  (`meta.pendingOnboardingReward()` — "+300 Genome Cores, 2 rare Bio-Containers and more") and
  the way back (replay from Settings — the ledgers are still unclaimed, so a later genuine
  completion pays in full). When nothing is pending (a replay) Skip is immediate.
- The reveal shows the Power line only for a real gain (the grants are spendables).

## §desktop-contract — a lesson never covers what it teaches

Anchored to selectors, measured, viewport-clamped — never hard-coded positions, so a HUD/board
re-layout cannot push a lesson over its subject:

- **`cue.callout.avoid`** — a selector the bubble must never overlap. Every lesson shown while a
  wave runs (`wave-1`, `hero-ability`, `graduation`) — and every lesson that asks for a slot tap
  (`place-needle`, `second-tower`: the conveyor bubble used to sit on the very slot lattice it
  asked the player to tap) — avoids `canvas.board`; the draft lesson anchors BELOW
  `.overlay .cards` and avoids it. On overlap the `Callout` primitive re-seats the
  bubble BESIDE the region first (left/right, nearest the anchor; a target-less bubble rides low,
  bottom-aligned), then below/above, rejecting any seat that leaves the viewport or covers the
  target.
- **Stable size.** The `Typewriter` lays the untyped remainder out invisibly, so a bubble never
  grows mid-transmission (growth used to walk it back over the lane / its own arrow).
- **Arrow + bubble on the same side of the same target** get a 44 px gap (the arrow sits in it).
- **Pause / Skip (desktop)** take the first measured seat clear of the ability pod, the bubble,
  its arrow and spotlight — just above the pod (right-aligned), else under the objective pill. The
  old bottom-right corner sat on *Apex Leap* at 1366×768.
- **Truthful HUD.** `game.tutorialWaves` (read-model only — no sim system reads it) makes the
  snapshot report the lesson's 2 waves and no finale anticipations: "Survive 2 more waves" →
  "Final wave — finish it", no "Brood Tyrant at wave 12" / "Mutagen Vault at wave 7".

Verified live (Playwright, fresh context, 1440×900 + 1366×768): every step screenshotted with a
geometry audit — no bubble on the lane during a wave, none on a draft card, the ability arrow on
`.ability-btn` with nothing over it, controls never on the pod, wave counter sequence `[1, 2]`,
10 lessons + 4 Commissioning cards before the hub, exactly one reward card, 4 tour stops.

Typewriter accessibility and motion: the visual transmission uses resolved device/game motion preferences with live subscriptions. Reduced motion completes the current sentence; enabling motion again does not restart already-read text. A visually clipped complete sentence stays in the accessibility tree while the animated copy is aria-hidden. The invisible remainder still reserves final layout. Text changes reset the visual reveal only when motion is allowed; preference listeners and reveal timers clean up on unmount.
