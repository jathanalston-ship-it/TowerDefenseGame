# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-19 17:54 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 093aa43

## Summary of work completed

LIVING BATTLEFIELD — ORGANISM PASS (LIVING-BATTLEFIELD.md §organisms): "the battlefield
should never appear motionless." A new render-only entity-life framework
(`src/render/organism.ts`) gives every tower approach-ANTICIPATION (alert + threat-bearing
lean while enemies close in OUTSIDE range — the presentation bridge between TOWER-IDLE
PREPARATION and COMBAT), a damped post-shot recovery settle, environmental TREMOR
(heavy deaths, hero ults, mega-boss telegraphs, hive impacts), per-kind ambient
emissions (spores/drips/sparks/drones/crawlers/wisps), and a throttled `org_*` murmur
ambience director; enemies gained gaze-at-threat glints and shield-shatter stagger.
Profiles auto-derive from body form + combat class with per-kind overrides — future
towers inherit a living body free. The one thing the next session must know: **zero
`src/core/` edits — the goldens are byte-identical by construction** (the suite ran on
an untouched sim), and `updateOrganisms` measures 2–13 µs/frame, a rounding error.

## Files modified

- Source (7): `src/audio/sound.ts`, `src/changelog/releases.gen.ts`, `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`, `src/render/renderer.ts`, `src/ui/GameView.tsx`, `src/render/organism.ts`
- Tests (1): `src/render/organism.test.ts`
- Docs (9): `docs/AI_HANDOFF.md`, `docs/COGLOAD_REPORT.md`, `docs/DEPENDENCY_GRAPH.md`, `docs/DIL_GRAPH.md`, `docs/GAME-STATE.md`, `docs/HISTORY.md`, `docs/LIVING-BATTLEFIELD.md`, `docs/TOWER-IDLE.md`, `docs/VALIDATION_REPORT.md`

## Systems affected (from the dependency registry)

- **audio** — `src/audio/sound.ts`
- **chronicle** — `src/changelog/releases.gen.ts`
- **dev-registry** — `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`
- **living-battlefield** — `src/render/organism.ts`
- **rendering** — `src/render/renderer.ts`, `src/render/organism.ts`
- **run-ui** — `src/ui/GameView.tsx`
- Consumer ring (verify, unchanged): cutscenes, hero-cinematics, pil

## Power Score changes

None — pure presentation. No modifier, no account state, no sim read-back; the power
suite is untouched and there is nothing for it to see.

## UI changes

Surfaces in the blast radius: `MusicDebug (Settings dev console)`, `(audible)`, `App (UpdateBriefing popup)`, `the battlefield itself`, `Results`, `ALL`

- **Battlefield towers**: one composed organism pose around each body (threat lean +
  capped turn, gape/swell while alert, idle micro-twitch, recovery wobble after shots,
  tremor jitter on shocks) + world-anchored per-family emissions. Beams and ground
  shadows deliberately sit OUTSIDE the pose (no swing).
- **Battlefield enemies**: eye-glint gaze toward the nearest tower ahead (mega boss
  overrides), shield-shatter stagger wobble. Fear trembling and hit flinch were already
  owned by statusFx/enemyForms — untouched.
- **Audio**: 7 new quiet `org_*` synths (heart/breath/bone/acid/spore/chirp/hum, peaks
  ≤ ~0.035) cued by the ambience director GameView polls each frame — one cue per
  ~2.6 s max, silent past ~26 enemies, calm breaths 2.5× rarer than anticipation
  murmurs. Sparse one-shots; loops are impossible by construction.
- Headless coverage: live probe (scratchpad probe-organism.ts) ran a real wave with the
  new layers — zero pageerrors, PREPARATION→COMBAT→PREPARATION chip regression held;
  screenshots org-prep/org-anticipation/org-combat captured; mobilecheck CLEAN,
  cogload budgets hold (canvas layers are outside its DOM scope by design).

## Documentation changes

- Updated this batch: `docs/LIVING-BATTLEFIELD.md` (+§Organisms — canonical for the
  entity-life layer), `docs/TOWER-IDLE.md` (§7 cross-ref: organism layer extends the
  presentation, sim contract unchanged), `docs/GAME-STATE.md` (towers row + LIVING
  ORGANISMS summary), `docs/DEPENDENCY_GRAPH.md` + `docs/DIL_GRAPH.md` (regen),
  `docs/HISTORY.md` (Chronicle), `docs/VALIDATION_REPORT.md`, `docs/COGLOAD_REPORT.md`.
- The wider registry list: no change needed — no camera, HUD, cutscene, or pipeline
  contract moved; COMBAT-VISUAL-STANDARDS' anticipation section still describes the
  pre-shot windup (unchanged); the approach-anticipation is documented at its owner
  (LIVING-BATTLEFIELD §organisms).

## Save changes

None — save layer untouched. All organism state is render-module-local and reaped with
its towers/enemies.

## Known edge cases

- **The alert band starts strictly OUTSIDE effective range** — in-range prey belongs to
  combat (attackAnticipation) and the sim's idle postures. Don't "fix" alert to include
  in-range enemies; that would double-animate engaged towers.
- **organism.ts keys state by tower id and reaps by frame-stamp** (the enemyMotion
  pattern). A new run reuses ids; `__resetOrganisms()` exists for tests but production
  relies on natural convergence (alert/tremor decay in <1 s) — fine because RenderState
  ids stay unique within a run.
- **`updateOrganisms` uses rs.time for dt** — pause freezes the layer with the rest of
  the presentation (consistent with every pulse() in the renderer).
- **Emissions are LOD-gated by the enemy-count detail flag** passed into drawTower
  (`fxDetail`); the pose itself always runs (micro-cost) so towers never go corpse-still
  even in a 300-enemy swarm.
- **The ambience director cues by profile voice, not per-tower** — two alert towers of
  the same kind produce one murmur stream, throttled globally; per-tower audio would
  stack into noise.

## Remaining technical debt

- Enemy gaze scans all towers per staggered enemy (≤27 towers — cheap today). If the
  tower cap ever grows 10×, reuse the organism layer's per-tower spatial data instead.
- The mega-boss gaze anchor assumes arena center x=360 (`updateEnemyMotion` call site);
  a future multi-lane arena should pass the mega's true x.

## Recommended next tasks

1. **Per-biome emission palettes** — tint organism emissions by biome accent (entry:
   `drawOrganismEmissions` color param at its renderer call site).
2. **Settings toggle for battlefield ambience** (entry: the `pollAmbientCue` call in
   `src/ui/GameView.tsx`'s RAF loop + the existing audio settings block) if players
   want murmur-free audio.
3. **Boss-side organism profiles** — bosses currently opt out of gaze/stagger (chassis
   theater); a per-chassis reaction row could plug into `render/bossChassis.ts`.

## Future expansion hooks

- `src/render/organism.ts` — `OVERRIDES` rows sharpen any kind's personality;
  `FORM_PERSONA`/`CLASS_VOICE` auto-cover new content; `organismProblems()` bounds it.
- `OrganismEmission`/`OrganismVoice` unions — add a family by extending the union + one
  case in `drawOrganismEmissions` / one synth in `sound.ts`.
- `ORGANISM` const — render-side pacing knobs (approach band, scan cadence, ambient
  gap/din cap) in one place.
- `battlefieldNerves()` — aggregate alert 0..1, exported for any future surface (music
  intensity, HUD tension glow) that wants the garrison's nerves as a signal.
