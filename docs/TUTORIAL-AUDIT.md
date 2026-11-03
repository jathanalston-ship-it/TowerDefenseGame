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

---

## G. Onboarding pass — 2026-11-03 (fresh-account headless playtest)

**Method:** a fresh-context Playwright walk of the whole first-time path (marketing → Play Free →
transmission/cutscene → all 10 lessons with real clicks → Commissioning → Field Orientation) at
1440×900 and 1366×768, screenshotting every step and auditing geometry (bubble vs lane / draft
cards / ability button, arrow target, control seats, HUD wave text). Architecture:
docs/TUTORIAL.md §onboarding-flow, §graduation, §desktop-contract.

| # | Finding | Severity | Resolution |
|---|---|---|---|
| G1 | **Two identical reward cards.** The Commissioning paid the tutorial grant; the 10-stop Field Orientation then paid a second "Assimilation Protocol" card (`completeHudTour → grantTutorialRewards('hudtour')`). Skipping the tour silently forfeited it. | HIGH | ONE graduation: `meta.grantOnboardingRewards()` pays both ledgers as one summary at tutorial completion (same totals); the tour pays nothing (Finish ≡ Skip). Legacy saves owed `hudtour` are paid it at tour end either way; every ledger stays idempotent. |
| G2 | The Field Orientation was 10 stops of WHAT/WHY/WHEN/LATER right after a 4-card ceremony. | MED | Cut to 4 stops in act order: next fight → rewards → spend → profile & help. Other wings keep their What's New cards. |
| G3 | The tutorial's Skip silently forfeited the graduation. | MED | Skip opens a confirm naming the cost (`pendingOnboardingReward`) and the replay route; a replay (nothing pending) skips at once. |
| G4 | Wave-1 callout (no target → centered) sat ON the lane during combat. | HIGH | `cue.callout.avoid = canvas.board`: the bubble re-seats beside the lane (measured, clamped); same for the ability + graduation lessons, and for both slot-tap lessons (the conveyor bubble sat on the very slot lattice it asked the player to tap). |
| G5 | The draft lesson's centered bubble covered the middle draft card. | HIGH | Anchored below `.overlay .cards` with the row as its avoid zone. |
| G6 | The ability arrow pointed at the pod's centre — onto the tutorial's own Pause button. At 1366×768 the Pause/Skip pills also sat ON *Apex Leap* (a click on the ability paused the trial). | HIGH | Arrow + bubble target `[data-tut="ability"] .ability-btn` from above (44 px arrow gap); desktop controls take a measured seat clear of the pod / bubble / arrow / spotlight. |
| G7 | The ability was taught in the build phase — the cast hit an empty field. | MED | Lesson order follows the real rhythm: the ability lesson launches wave 2 (and recharges the ability), graduation finishes it. |
| G8 | HUD claimed a 12-wave run: "/12", "Survive 11 more waves", "Brood Tyrant at wave 12", "Mutagen Vault at wave 7" — the lesson ends after wave 2. | MED | `game.tutorialWaves` read-model (`COMBAT_TUTORIAL.waves = 2`): "/2", "Survive 2 more waves" → "Final wave — finish it", no finale anticipations. Sim untouched (goldens byte-identical). |
| G9 | Wave counter stepped BACK (2/12 → 1/12) when the held draft opened from the build phase. | LOW | The draft now deals inside wave 1's settle beat (`openTutorialDraft` accepts the settle window), so the order is wave → draft → build; counter sequence `[1, 2]`. |
| G10 | Callouts grew while typing — a lane-avoiding bubble crept back over the lane, a top-anchored one over its arrow. | LOW | `Typewriter` reserves the untyped remainder invisibly; bubbles have their final size from frame one. |
| G11 | Commissioning SAFEGUARD offered "Continue as Guest" AND "Play in Guest Mode" side by side (near-identical wording; the latter discards the graduate's progress at browser close). | MED | One "Continue as Guest" + a one-line note (saved on this device; add an account from Profile any time). Session-only Guest Mode stays on the WelcomeGate. |
| G12 | Graduation reveal read "Power Score 1,005 → 1,005". | LOW | The Power line shows only for a real gain. |

**Verification:** `state/tutorialRewards.test.ts` (one-summary graduation, remainder-only,
legacy tour remainder, skipper gets nothing from the tour, same-ms uid uniqueness),
`core/tutorialGate.test.ts` (settle-window draft keeps the displayed wave at 1, `tutorialWaves`
read-model, `tutorialReadyAbility` gate), `core/tutorial.test.ts` (natural order, `avoid` on
every in-wave lesson, ability arrow on the button), `dev/tutorialAnchors.test.ts` (avoid
selectors resolve). Live: both viewports — 0 bubble/lane, bubble/card, control/pod overlaps;
1 reward card; 10 lessons + 4 Commissioning cards before the hub; 4 tour stops; skipper path
shows the confirm, lands, 2-stop tour, no reward card.
