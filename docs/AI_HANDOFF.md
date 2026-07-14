# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-14 09:10 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 1d7fca5

## Summary of work completed

Shipped the **In-Run Gameplay Feel Pass** (canonical doc: `docs/COMBAT-VISUAL-STANDARDS.md`).
Centerpiece: the **Status Effect Visualization System** — every `StatusEffectDef` now carries a
MANDATORY `fx` trait block (validator-enforced), and `render/statusFx.ts` procedurally MERGES all
live statuses per body (blended hue, deduped overlays, budgeted particle emitters, intensity off
stacks/remaining, control-state body animation) so combinations like poison+burn compose without
hand-authoring. Around it: hit-confirmation sparks + status-flavored death reactions (frozen
shatter / embers / spores / dissolve) via the renderer motion tracker; form-keyed tower attack
ANTICIPATION (`FORM_ANTICIPATION` in towerForms.ts); hero ability activation/ready cues; log-capped
projectile power scaling; and `statusApplied` audio category cues (hasListeners-gated, golden-safe).
**The one thing to know:** never draw a bespoke per-status ring again — author `fx` traits and the
merge composes everything (the validator rejects a status without them).

## Files modified

- Source (11): `src/audio/sound.ts`, `src/core/config.ts`, `src/core/events.ts`, `src/core/game.ts`, `src/core/status.ts`, `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`, `src/render/renderer.ts`, `src/render/towerForms.ts`, `src/ui/GameView.tsx`, `src/render/statusFx.ts`
- Tests (2): `src/core/status.test.ts`, `src/render/statusFx.test.ts`
- Docs (6): `docs/DEPENDENCY_GRAPH.md`, `docs/DIL_GRAPH.md`, `docs/GAME-STATE.md`, `docs/PROJECT_MANIFEST.md`, `docs/VALIDATION_REPORT.md`, `docs/COMBAT-VISUAL-STANDARDS.md`

## Systems affected (from the dependency registry)

- **audio** — `src/audio/sound.ts`
- **content-infra** — `src/core/config.ts`
- **dev-registry** — `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`
- **engine** — `src/core/events.ts`, `src/core/game.ts`, `src/core/status.ts`
- **rendering** — `src/render/renderer.ts`, `src/render/towerForms.ts`, `src/render/statusFx.ts`
- **run-ui** — `src/ui/GameView.tsx`
- Consumer ring (verify, unchanged): biomes, boss-rush, bosses, campaign, collection, currencies, cutscenes, daily, difficulty, doctrines, equipment, evolution-hq, gene-cards, heroes, infinite, living-battlefield, loot, mastery, mega-bosses, meta-store, mulligans, nemesis, nucleus, onboarding, pil, power, premium, towers, website

## Power Score changes

None. All changes are presentation-side; the only core/config.ts change is a PERF render tunable
(`statusFullDetail`) and status `fx` data the sim never reads. Full suite (incl. power tests) green.

## UI changes

Surfaces in the blast radius: `MusicDebug (Settings dev console)`, `(audible)`, `GameView`, `Hud`, `Toolbar`, `BuildControls`, `Inspector`, `BuildPanel`, `the battlefield itself`, `Results`, `ALL`

The battlefield only: merged status overlays/particles on afflicted enemies, impact-spark
starbursts, flavored death echoes, tower wind-up squash/flex + muzzle charge, hero ability
burst/ready flare/standing glint, damage-scaled projectile comets. Two audio cues added
(status_dot / status_control), throttled in GameView. Verified by a headless-Chromium smoke
(preview build → skip tutorial → launch campaign → live wave; zero page errors) plus the
real-frame recording-context tests in `src/render/statusFx.test.ts`.

## Documentation changes

Registry says these move with the touched systems: `docs/MUSIC.md`, `docs/GAME-FEEL.md`, `docs/CUTSCENES.md`, `docs/LIVING-BATTLEFIELD.md`, `docs/CODEMAP.md`, `docs/CORE-FRAMEWORKS.md`, `docs/AUTHORING.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/POWER-SCORE.md`, `docs/POWER-AUDIT.md`, `docs/MULLIGANS.md`, `docs/PREMIUM-STORE.md`, `docs/PREMIUM-ECONOMY-REPORT.md`, `docs/TOWER-STARS.md`, `docs/TOWER-BRANCHES.md`, `docs/TOWER-LAB.md`, `docs/TOWER-CODEX.md`, `docs/TOWERS.md`, `docs/STRAIN.md`, `docs/MASTERY.md`, `docs/ADAPTATION.md`, `docs/HEROES.md`, `docs/HERO-FRAMEWORK.md`, `docs/HERO-EVOLUTION.md`, `docs/HERO-SELECTION.md`, `docs/SLOTS.md`, `docs/EQUIPMENT.md`, `docs/EQUIPMENT-PHILOSOPHY.md`, `docs/LOOTBOX.md`, `docs/LOOT-PROGRESSION.md`, `docs/REWARD-PRESENTATION.md`, `docs/GENE-EVOLUTION.md`, `docs/CARDS.md`, `docs/GENE-AUDIT-REPORT.md`, `docs/NUCLEUS.md`, `docs/COLLECTION.md`, `docs/EVOLUTION-HQ.md`, `docs/GENOME-CORE.md`, `docs/EVOLUTION-CAP.md`, `docs/ECONOMY.md`, `docs/LEXICON.md`, `docs/ECONOMY_FORMULAS.md`, `docs/DEV-RESET.md`, `docs/SCALABILITY.md`, `docs/PROJECT_MANIFEST.md`, `docs/BOSS-DESIGN.md`, `docs/MEGA-BOSS.md`, `docs/BIOMES.md`, `docs/DOCTRINES.md`, `docs/MODE-IDENTITY.md`, `docs/DIFFICULTY.md`, `docs/DIFFICULTY_DIRECTOR.md`, `docs/WEBSITE.md`, `docs/DEPLOYMENT.md`, `docs/DIL.md`, `docs/DEPENDENCY_GRAPH.md`, `docs/ENGINEERING-AUDIT.md`, `docs/GAME_CONSTITUTION.md`, `docs/PROJECT_STATUS.md`, `docs/AI_HANDOFF.md`, `docs/PIL.md`, `docs/CAMPAIGN.md`, `docs/CAMPAIGN-EVENTS.md`, `docs/STAGES.md`, `docs/ENDLESS-SCALING.md`, `docs/BOSS-RUSH.md`, `docs/DAILY-RUN.md`, `docs/NEMESIS.md`, `docs/TUTORIAL.md`, `docs/HELP.md`, `docs/TUTORIAL-AUDIT.md`, `docs/HUD.md`, `docs/READABILITY.md`, `docs/RENDER-PIPELINE.md`, `docs/TOWER-VISUAL-EVOLUTION.md`, `docs/CAMERA.md`, `docs/COMBAT-VISUAL-STANDARDS.md`

Updated: `docs/COMBAT-VISUAL-STANDARDS.md` (new, canonical), `PROJECT_MANIFEST.md` (Visual
Effects section), `GAME-STATE.md` (compressed summary), `DIL_GRAPH.md` + `DEPENDENCY_GRAPH.md`
(regenerated), `dil/knowledge.ts` (2 edges). The remainder of the registry's blast-radius list:
no change needed — no gameplay numbers, saves, modes, or economy semantics moved.

## Save changes

None — save layer untouched.

## Known edge cases

- `statusVfx.test.ts` pins the Mark/Resonance charge-ring COLORS — those two rings stay bespoke
  in `drawEnemy`; don't fold them into statusFx without updating the pinned tokens.
- The legacy four statuses (fracture/corrosion/infection/disruption) render through registry `fx`
  traits but do NOT emit `statusApplied` (only `applyEffect` does) — intentional (audio spam).
- Tower anticipation holds full wind-up while a combat-phase tower waits at cooldown 0 with no
  target in range — reads as "primed", accepted deliberately.
- Bosses skip the motion tracker (chassis renderer) ⇒ no impact sparks/death flavors on bosses;
  they have their own hit/death spectacle (gore DeathEvents, phase FX).
- DIL_GRAPH and DEPENDENCY_GRAPH both derive from docs + systemRegistry — regen BOTH after doc
  or registry edits (`npm run docs:graph` then `npm run dil -- regen`) or two sync tests fail.

## Remaining technical debt

- `mergeStatusFx` allocates small arrays per afflicted enemy per frame (afflicted bodies are a
  minority; measured acceptable) — a scratch-buffer refactor is available if profiling ever flags it.
- `distortion` is a body-scale shimmer, not a shader warp (Canvas2D limitation, documented).
- Heroes/minions carry no framework statuses yet, so the status framework has nothing to draw on
  friendlies — the seam exists when the sim grows friendly statuses.

## Recommended next tasks

1. **Chain/multi-target visualization** (COMBAT-VISUAL-STANDARDS is the standard; entry:
   `render/renderer.ts` beam/projectile passes) — ricochet/fragment/venom STRAIN payloads could
   draw brief leap arcs so bounce order reads.
2. **Boss hit feedback parity** — extend impact sparks/death flavors to chassis bosses (entry:
   `updateEnemyMotion` boss skip + `render/bossChassis.ts`).
3. **Settings exposure** — a "Combat FX intensity" slider folding into the statusFx quality tier
   (entry: `PERF.statusFullDetail`, `ui/Settings`).

## Future expansion hooks

TODO: seams deliberately left open (name the file + symbol).
