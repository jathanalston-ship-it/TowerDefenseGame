# AI_HANDOFF.md — continuous player-experience work

## Active goal
Improve usability, accessibility, graphics, sound, animations and cutscenes without changing gameplay or introducing regressions. Owner authorizes verified deployments roughly hourly, with website notes every time. Goal remains active; do not mark it complete based on this batch.

## Current checkpoint
Branch: codex/hive-autoplay. Production is still 6ace805f (Hive Intelligence, deployed 2026-11-10 02:28 UTC). Current uncommitted batch: Memories at Your Pace, v2026.11.09.2. No upstream changes at release preparation.

## Changes
- Opening and story films: opt-in manual reading, native Next controls, Escape, focus containment/restoration, visible keyboard title action, 44px controls; resized reduced-motion stills repaint. Opening descent ignores repeat exit requests.
- Motion settings: live OS changes update hub motion/flash attributes and settings UI; explicit player overrides and stored shake strength preserved; listeners cleaned up. Sound/motion switches have stable accessible names.
- HUD: ability timer distinguishes cooldown from hero recovery; ring uses effective cooldown. Wave/gene controls show HIVE when managed, retaining readable disabled status.
- Website: generated homepage/patch notes reflect the batch. Design graph and public inventory regenerated after full-suite freshness failures.

## Verification
Production build and strict typecheck pass. Full suite: 3146 passing, two generated-doc freshness failures; regenerated DIL/PIL and all 13 tests in those files pass (all 3148 suite tests now accounted for). Direct Chrome smoke checks cover cinematic reading/timing, keyboard focus, reduced-motion rotation, 320px title layout, normal descent, OS preference changes/override/cleanup, hero states and 12/24s cooldown fraction. Focused cinematic, motion, HUD and site tests pass. Full mobile layout gate PASS: 27 nav screens and live runs across nine viewports. All test/build/browser processes completed; preview servers stopped.

## Invariants and limitations
Simulation, balance, save schema, rewards and audio mix unchanged. Reading mode holds text advancement, not the soundtrack or animated artwork. Re-enabling auto-play restarts the scene hold. Existing reward reveal players are separate from these story/intro changes. Full-screen 320x568 run-board limitation predates this work; do not claim all mobile layouts are solved.

## Local verification artifacts
Workspace parent: cutscene-check.cjs, intro-check.cjs, intro-dive-check.cjs, motion-check.cjs, hud-feedback-check.cjs and screenshots. chrome-probe-compat.cjs adapts the installed Chrome to Playwright's old headless launch flag without modifying repository scripts. Repository logs: experience-tests.log, experience-build.log, experience-mobile.log (ignored).

## Next
Finish release verification, commit/deploy the coherent batch and verify live assets and website notes. Continue with gameplay understanding, settings discoverability and reward/audio/animation feedback. Keep scope broad and evidence-driven; preserve gameplay.

## Next batch: clearer reward screen
Previous experience batch deployed as 3cc51a8349c7c9aabb09bf1d6abe86f53ec92e1f; Actions run 42746874975 succeeded and public assets/notes matched. New local RewardReveal changes: category clicks no longer nudge sequence; pending stat cues wait across milestone pause and resume once; post-run radios gain arrow/Home/End and roving Tab navigation. Browser harness ../reward-check.cjs verifies pause/resume audio, category isolation, skip, keyboard wrapping and next-stage choice forwarding. Website notes v2026.11.09.3 prepared for next roughly-hourly deployment.

Field Manual follow-up: expanded normalized search over all teaching fields, all-word fallback after phrase ranks, best-result reset when query changes, related-topic filter clearing and focus transfer, active-topic aria-current. helpSearch.test.ts 5 tests PASS; ../help-check.cjs verifies actual search/related/focus behavior in Chrome. Notes added to v2026.11.09.3.

Portrait follow-up: TowerPortrait now pauses off-screen/hidden, responds live to device reduced-motion, and retains elapsed animation time on resume. ../portrait-check.cjs measured zero offscreen frames, visible resume, reduced-motion still pixels, motion restoration and unmount cleanup. Same artwork, no gameplay changes. Notes added to current next-release ledger.

Wallet follow-up: useRollingNumber now tracks the rendered integer rather than the last target; interrupted grants/spends remain continuous. Reduced-motion snap clears gaining state. ../wallet-check.cjs controls RAF to verify overlapping grants, spending, exact final value and reduced-motion. Notes included in next batch.

ChipPopover follow-up: focus-on-open, Escape containment/restoration, natural focus-out close, popup ARIA association and action-close restoration. ../popover-check.cjs passes keyboard and pointer focus checks. Updated current release notes.

Count-up follow-up: shared hook honors live OS reduced motion for toasts/vault totals, preserves completed values on restoring motion, handles zero duration. ../count-check.cjs PASS. Beginning full regression/build validation for next batch.

Clarity batch full suite PASS: 353 files/3150 tests; production build PASS. Next confirmed visual issue: components/HeroPortrait.tsx maintains a local CLASS_GLYPH table missing Resonant; use core/combatClass.ts COMBAT_CLASSES in the next visual pass. Keep roughly-hourly cadence; last deployed release remains 3cc51a83.
Clarity mobile gate PASS across all nine standard viewports. All validation processes completed and probe server stopped. Batch ready as a local checkpoint; proceed with next visual pass before the next approximately-hourly release.
