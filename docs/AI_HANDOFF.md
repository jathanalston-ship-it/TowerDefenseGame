# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-03 02:06 UTC · **Diff scope:** HEAD~1...HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** fd8fa77

## Summary of work completed

Two tasks shipped this session. (1) **Danger Camera** (`1fcd89d`): a hysteresis-gated state
machine (`core/dangerCamera.ts`, docs/CAMERA.md) replaced the raw per-frame danger signals that
made the screen throb at the zone edge — every tension effect now keys on ONE smoothed intensity;
render-only, goldens byte-identical. (2) **Tutorial overhaul** (`fd8fa77`): full onboarding audit
(docs/TUTORIAL-AUDIT.md) then a rebuild — the game is now GATED to the lesson plan via
`game.tutorialMode` (director scripts every wave, holds/releases the draft, locks the console),
the HUD tour is an anchored what/why/when/later Field Orientation, and milestone rewards pay
mid-flow through an idempotent ledger. The one thing to know: **`game.tutorialMode` must never be
set outside the TutorialRunner path** — golden determinism relies on it defaulting false.

## Files modified

- Source (21): `src/core/game.ts`, `src/core/tutorial.ts`, `src/dev/systemRegistry.ts`, `src/index.css`, `src/save/saveStore.ts`, `src/state/mechanics.ts`, `src/state/meta.ts`, `src/state/tutorial.ts`, `src/ui/App.tsx`, `src/ui/BuildControls.tsx`, `src/ui/DraftModal.tsx`, `src/ui/GameView.tsx`, `src/ui/HelpWiki.tsx`, `src/ui/Hub.tsx`, `src/ui/Hud.tsx`, `src/ui/HudTour.tsx`, `src/ui/Toolbar.tsx`, `src/ui/TutorialRunner.tsx`, `src/ui/tutorial/TutorialOverlay.tsx`, `src/ui/tutorial/primitives.tsx`, `src/ui/tutorial/tutorialDirector.ts`
- Tests (2): `src/core/tutorialGate.test.ts`, `src/state/tutorialRewards.test.ts`
- Docs (6): `docs/DEPENDENCY_GRAPH.md`, `docs/GAME-STATE.md`, `docs/HELP.md`, `docs/TUTORIAL-AUDIT.md`, `docs/TUTORIAL.md`, `docs/VALIDATION_REPORT.md`

## Systems affected (from the dependency registry)

- **dev-registry** — `src/dev/systemRegistry.ts`
- **engine** — `src/core/game.ts`
- **gene-cards** — `src/ui/DraftModal.tsx`
- **hub-shell** — `src/ui/App.tsx`, `src/ui/Hub.tsx`
- **meta-store** — `src/save/saveStore.ts`, `src/state/meta.ts`
- **onboarding** — `src/core/tutorial.ts`, `src/state/mechanics.ts`, `src/state/tutorial.ts`, `src/ui/HelpWiki.tsx`, `src/ui/HudTour.tsx`, `src/ui/TutorialRunner.tsx`, `src/ui/tutorial/TutorialOverlay.tsx`, `src/ui/tutorial/primitives.tsx`, `src/ui/tutorial/tutorialDirector.ts`
- **run-ui** — `src/ui/BuildControls.tsx`, `src/ui/GameView.tsx`, `src/ui/Hud.tsx`, `src/ui/Toolbar.tsx`
- Consumer ring (verify, unchanged): bosses, campaign, devtools, heroes, infinite, notifications, profile, rendering

## Power Score changes

No Power formula/bucket change. `meta.grantTutorialMilestone` adds small one-time currency
grants (25 Cores / 10 Essence — currencies, not Power buckets); `tutorialRewards.test.ts` pins
idempotence. The engine diff (`game.ts`) is the tutorial gate + danger camera — Power-neutral.

## UI changes

Surfaces in the blast radius: `GameView`, `Hud`, `Toolbar`, `BuildControls`, `Inspector`, `BuildPanel`, `GeneArchive`, `DraftModal`, `gene splash`, `Hub`, `CommandCenter`, `ProgressDashboard`, `SaveManager`, `HelpWiki`, `WhatsNew`, `HudTour`, `CommandCenter (tips)`, `TutorialOverlay`, `Results`, `ALL`

Tutorial: objective pill below-HUD left; callouts anchored to the exact card and
viewport-clamped; arrow hugs its target (gap 16); wave console shows a lesson-lock notice
instead of Start Wave; speed switch hidden; milestone toast (top-left, pure-CSS lifetime);
eased canvas-focus zoom. HudTour: anchored spotlight card with What/Why/When/Later rows +
Back. HelpWiki: "Watch out" row + Field Orientation replay button. Headless coverage: full
fresh-account E2E (scratchpad tut-e2e.mjs) graduated all 10 lessons + walked the tour with
zero page errors; screenshots verified alignment.

## Documentation changes

Registry says these move with the touched systems: `docs/DEPENDENCY_GRAPH.md`, `docs/ENGINEERING-AUDIT.md`, `docs/GAME_CONSTITUTION.md`, `docs/PROJECT_STATUS.md`, `docs/AI_HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/CODEMAP.md`, `docs/DESIGN.md`, `docs/CAMPAIGN.md`, `docs/MODE-IDENTITY.md`, `docs/STAGES.md`, `docs/ENDLESS-SCALING.md`, `docs/HEROES.md`, `docs/HERO-FRAMEWORK.md`, `docs/HERO-EVOLUTION.md`, `docs/HERO-SELECTION.md`, `docs/SLOTS.md`, `docs/TUTORIAL.md`, `docs/HELP.md`, `docs/TUTORIAL-AUDIT.md`, `docs/HUD.md`, `docs/READABILITY.md`, `docs/REWARD-PRESENTATION.md`, `docs/BOSS-DESIGN.md`, `docs/RENDER-PIPELINE.md`, `docs/TOWER-VISUAL-EVOLUTION.md`, `docs/GAME-FEEL.md`, `docs/CAMERA.md`, `docs/GENE-EVOLUTION.md`, `docs/CARDS.md`, `docs/GENE-AUDIT-REPORT.md`, `docs/COMMAND-CENTER.md`, `docs/HOME-BASE.md`, `docs/ONE-MORE-RUN.md`, `docs/PROGRESSION-LOOP.md`, `docs/PROFILE.md`, `docs/DEV-RESET.md`, `docs/SCALABILITY.md`, `docs/PROJECT_MANIFEST.md`, `docs/NOTIFICATIONS.md`

Updated: TUTORIAL.md (gated-flow shipped section), HELP.md (anchored tour, mistakes field,
completeHudTour(grant)), TUTORIAL-AUDIT.md (new — findings & resolutions), GAME-STATE.md
(onboarding overhaul + danger camera lines), CAMERA.md (new, prior commit), DEPENDENCY_GRAPH.md
(regenerated), VALIDATION_REPORT.md (PASS record). Others in the blast-radius list: no change
needed (no behavior they document moved).

## Save changes

Additive only, no version bump: `save.tutorial.milestones: string[]` (defaulted in
`defaultSave`, filled by `sanitizeTutorial` for older saves — same pattern as `rewarded`).
Pinned by `state/tutorialRewards.test.ts` (grant → ledger → never re-grant).

## Known edge cases

- `game.openTutorialDraft()` only fires from prep + tutorialMode (deliberate — never yanks a
  live wave into a draft); the director re-fires on `attempt` bumps.
- The tutorial swallows Space/F but leaves 1-N/Q/E/P/Esc live — the Hero Console (E) can still
  open mid-lesson (it auto-pauses; acceptable, verified).
- Tour anchors live on Hub nav buttons; on narrow shells (drawer closed) the tour falls back to
  centered cards by design.
- progressionSim.test.ts pins Math.random to the repo Rng for ONE reproducible CI account —
  luck-variance exploration belongs to `npm run sim:report`, don't "fix" the pin away.

## Remaining technical debt

- Combat tutorial anchors (`data-tut`) are stringly-typed between core/tutorial.ts and the
  UI — a rename breaks silently to the centered-callout fallback (soft failure, but worth a
  future dev-time anchor-exists check).
- HudTour copy duplicates some mechanics-registry knowledge (tour stops vs MechanicDef rows);
  acceptable now, could derive later.

## Recommended next tasks

1. Play-test the first 20 minutes by hand (tutorial → tour → first campaign stage) and tune
   milestone/copy feel — entry: `npm run dev`, fresh profile (DevTools reset).
2. Add media assets to Help entries (`MechanicDef.media` placeholders).
3. BALANCE_REPORT (9 open signals) — next balance review pass (report-only protocol).

## Future expansion hooks

- `core/tutorial.ts` `TUTORIALS` registry — future tutorials are one def each; the director's
  step-entry switch keys on checkpoint ids.
- `CheckpointCue.canvasFocus` + GameView's eased `tutCamRef` — any future lesson can glide the
  battlefield camera; same seam could serve cinematics.
- `checkpoint.milestone` — add rewards to any step; ledger keys are `tutorialId:checkpointId`.
- `MechanicDef.mistakes` — populated for 12 entries; the row renders automatically for any more.
- `DANGER_CAM` tunables + `dangerCurve` (docs/CAMERA.md §8) — new tension effects key on the
  smoothed intensity.
