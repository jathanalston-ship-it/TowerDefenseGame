# TUTORIAL-AUDIT.md — onboarding audit findings & resolutions

Full audit of every tutorial surface (2026-07): the Combat Tutorial, HUD Tour, Help wiki,
What's New, first-time flows, and replays — every issue found, and how it was fixed. The
resulting architecture is documented in docs/TUTORIAL.md; this file is the audit record.

**Method:** code audit of all surfaces + a live headless playthrough of a fresh account
(Playwright driving the real build), including a deliberate slow-player scenario.

## A. Combat Tutorial — structural

| # | Finding | Severity | Resolution |
|---|---|---|---|
| A1 | **Game/lesson desync (proven live):** the game ran unconstrained beneath the tutorial — Start Wave console, Space, auto-wave, speed switch, and drafts all interactive on any step. A player could start waves, clear them, and consume drafts while the tutorial waited on an early objective, leaving callouts describing a world that no longer existed. | CRITICAL | `game.tutorialMode` gate + director scripting: the director owns EVERY wave start, the console launch controls are held (`wb-tutlock`), Space/F hotkeys are swallowed, the speed switch is hidden, and auto-start is never restored from prefs during the tutorial. |
| A2 | **Draft race → dead end (proven by code):** wave 1 always rolled a draft at clear; a slow player still on "second tower" was forced through it (no dismiss), the guarded advance swallowed `card-chosen`, and the gene-card step later waited forever for a draft that could no longer occur. | CRITICAL | Natural post-wave drafts are SUPPRESSED in tutorialMode; the director releases one via `game.openTutorialDraft()` exactly when the gene-card lesson arrives. The lesson can no longer be consumed early or stranded. |
| A3 | **Zero-kill wave-1 dead end:** the step advanced on `enemy-killed`; a mis-placed tower + the integrity fail-safe could end wave 1 with zero kills → stuck forever (no next wave, no rescue). | HIGH | Step now advances on `wave-completed` (matching its title "Survive Wave 1") — the wave always completes; kills are taught by the following recap step. |
| A4 | Wording mismatch: "Survive Wave 1" advanced on FIRST KILL (mid-wave), then "Biomass fuels expansion" re-explained kills while the wave still ran. | MED | Same fix as A3 + recap copy rewritten in past tense ("Every kill you just made…"), so the sequence is truthful. |
| A5 | **Skip-on-last-step paid full rewards:** the runner latched "reached end" at the final checkpoint, so skipping there still granted everything. | MED | The store now records an end reason (`completed` vs `skipped`); rewards gate on `completed` only. |
| A6 | Second-tower step could stall unaffordable (slow kills + pricey first pick). | MED | Director tops the bank to 180 via `game.tutorialEnsureBiomass` on step entry (tutorial-only, never reduces). |
| A7 | A veteran replaying with Auto Gene ON would have the draft auto-picked out from under the gene-card lesson. | MED | `DraftModal forceManual` in tutorial — the lesson requires a confirmed player choice, never a timer. |
| A8 | Tutorial "Pause" paused only the LESSON — the game kept fighting under the veil. | HIGH | GameView folds the tutorial store's paused state into the sim-freeze check: Pause now stops the world. |

## B. Presentation & pointer accuracy

| # | Finding | Severity | Resolution |
|---|---|---|---|
| B1 | Placement arrow pointed at the CENTER of the tower rail (the middle card) while the copy said "Needle Spitter" (leftmost). | HIGH | New `data-tut="tower-card-first"` anchor; arrow + callout target the exact card. Arrow gap tightened (44→16 px) so it hugs its target. |
| B2 | The objective pill sat centered ON TOP of the HUD, obscuring resource cells. | MED | Repositioned below the HUD, left-aligned (`top: 96px; left: 18px`). |
| B3 | The placement callout floated over the two bottom build-slot rows — visually hiding the very slots the player had to click. | HIGH | Callout re-anchored beside the rail card with a viewport clamp in the primitive (bubble can never leave the screen or cover the slot lattice). |
| B4 | No smart camera — `CameraFocus` only scrollIntoView'd DOM. | MED | `cue.canvasFocus` + an eased canvas transform in GameView (exponential glide toward a board point, ≤6 % zoom, never snaps — same easing philosophy as docs/CAMERA.md). |
| B5 | Missing-selector spotlight fell back to a FULL-SCREEN dim that swallowed all clicks. | LOW | Inspect step now guarantees its subject (director pre-selects the first tower), and remaining full-dim steps are continue-gated. Fallback behavior documented. |

## C. Rewards & motivation

| # | Finding | Severity | Resolution |
|---|---|---|---|
| C1 | No mid-flow milestone rewards — one payout at the end. | MED | Checkpoint `milestone` data: +25 Genome Cores at "Survive Wave 1", +10 Gene Essence at the first draft; granted via an idempotent `save.tutorial.milestones` ledger (replays never re-grant), celebrated with an overlay toast. |
| C2 | HUD Tour **Skip granted the same container as Finish**. | MED | `meta.completeHudTour(grant)` split: Skip marks the tour seen (never re-forces) but only a genuine Finish pays — both idempotent. |

## D. HUD Tour ("Field Orientation")

| # | Finding | Severity | Resolution |
|---|---|---|---|
| D1 | A disembodied 13-card text carousel — nothing anchored, nothing spotlit; taught prose without location or motivation structure. | HIGH | Rebuilt as an ANCHORED tour: each stop spotlights the real element (`data-nav`/`data-tour` anchors) and teaches WHAT / WHY / WHEN / what unlocks LATER. Back/Next confirmed clicks only; graceful centered fallback when an anchor is off-DOM (mobile drawer). |
| D2 | Not replayable ("never replayable as a tutorial"). | MED | Replay from Help (header button) and Settings → both re-teach, never re-grant. |

## E. Help / mechanics registry

| # | Finding | Severity | Resolution |
|---|---|---|---|
| E1 | Registry lagged shipped systems: no entries for Adaptation/Antigen, in-run Hero Evolution, Game Speed, Emergency Defense, or the wave/build rhythm. | HIGH | Five new entries (unlock-gated, cross-linked): `wave-rhythm`, `game-speed`, `emergency-defense`, `adaptation`, `hero-evolution`. |
| E2 | No "common mistakes" teaching anywhere in Help. | MED | `MechanicDef.mistakes` field + "Watch out" row in the wiki; authored for 12+ high-traffic entries. |

## F. Edge cases verified

- **Pause / speed / auto-wave during tutorial** — locked or scripted (A1, A8).
- **Resize mid-tutorial** — `useTargetRect` observers + poll re-measure; callout clamps on-screen.
- **Account reset / fresh save** — auto-tutorial via `shouldAutoTutorial` (unchanged, retested).
- **Returning player** — never force-tutorialized (`totalRuns > 0`); replays via Settings/Help.
- **Replay economy** — completion rewards, milestones, and the tour container are all
  ledger-idempotent (`rewarded`, `milestones`, `help.hudTour`).
- **Mid-tutorial reload** — resumable progress persists (unchanged); `sanitizeProgress` clamps
  a stale checkpoint into range if the def changes shape in a future update.
- **Mobile** — tour falls back to centered cards when nav anchors are hidden in the drawer;
  combat anchors (HUD cells, rail, ability pod) exist on all shells.

## Verification

- 831 tests green, including new suites: `core/tutorialGate.test.ts` (draft hold/release,
  biomass top-up guards) and extended `state/tutorialRewards.test.ts` (milestone + tour-skip
  idempotence). Golden sims byte-identical (`tutorialMode` defaults false; nothing else reads it).
- Headless E2E on the real build: a fresh account graduates all 10 gated lessons — console
  locked, wave-completed advance, both milestone toasts, held draft released at the lesson,
  inspector pre-selected, reward reveal — then the anchored Field Orientation (Back/Next/Skip)
  with zero page errors.
