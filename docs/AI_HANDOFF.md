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
