# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-19 20:38 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 7825b3d

## Summary of work completed

MEGA DORMANCY (user-requested): between waves the mega is frozen by design
(megaBossSystem/towerSystem only run in step's 'wave' branch) but LOOKED alive — the
"invincibility phases" impression. Now it BURROWS: `MegaRuntime.burrow` 0→1 (presentation
only, no combat number reads it) ticks in during settle+prep (`megaDormancySystem`,
`MEGA.burrowInSec` 1.4 s) and out at the next wave's first ticks (`burrowOutSec` 0.9 s,
top of megaBossSystem). Renderer recedes the mass up into the ridge and draws a breathing
mound with glow seams + periodic tremor; organs/siege arm retract; vignette fades; both
transitions play the new `megaBurrow` soil rumble. The raid banner greys out
(`MegaBannerSnapshot.dormant` at burrow ≥ 0.5, `.mega-banner.is-dormant`) and all combat
chips yield to one: `⛰ BURROWED — RESURFACES WITH THE WAVE`. The one thing to know:
`regenActive` is gated off while dormant and a frozen mid-windup telegraph is suppressed
(banner + vignette) — the grey bar must never claim activity that is not ticking.

## Files modified

- Source (8): `src/audio/sound.ts`, `src/changelog/releases.gen.ts`, `src/core/game.ts`, `src/core/megaboss.ts`, `src/core/types.ts`, `src/index.css`, `src/render/megaboss.ts`, `src/ui/GameView.tsx`
- Tests (1): `src/core/megaboss.test.ts`
- Docs (3): `docs/HISTORY.md`, `docs/MEGA-BOSS.md`, `docs/VALIDATION_REPORT.md`

## Systems affected (from the dependency registry)

- **audio** — `src/audio/sound.ts`
- **chronicle** — `src/changelog/releases.gen.ts`
- **content-infra** — `src/core/types.ts`
- **engine** — `src/core/game.ts`
- **mega-bosses** — `src/core/megaboss.ts`, `src/render/megaboss.ts`
- **rendering** — `src/render/megaboss.ts`
- **run-ui** — `src/ui/GameView.tsx`
- Consumer ring (verify, unchanged): arena, biomes, boss-rush, bosses, campaign, collection, currencies, cutscenes, daily, difficulty, doctrines, equipment, evolution-hq, gene-cards, hero-cinematics, hero-symbiotes, heroes, infinite, living-battlefield, loot, mastery, meta-store, mulligans, nemesis, nucleus, onboarding, online-foundation, power, premium, towers, website

## Power Score changes

None — `burrow` is presentation state; no Power source, bucket, or preview surface moved
(megaboss.ts's reward model untouched).

## UI changes

- Mega raid banner: `is-dormant` state — desaturated/dimmed via `--dur-3` transitions,
  grey hp fill, single `⛰ BURROWED` chip replacing all combat chips + the open-organ list
  (`.mega-chip-dormant` in index.css). NOTE: raw-duration CSS is gated — uiStandards.test
  rejects non-`--dur` transition durations (first draft used an invented `--t-med` token
  and failed the suite).
- Battlefield: body recede + burrow mound + retracting organs (render/megaboss.ts;
  `burrowOf` smoothstep, death overrides burrow).
- Audible: `megaBurrow` rumble on descent and emergence.
- Coverage: megaboss.test §dormancy + headless dist smoke (scratchpad burrow-probe.mjs —
  fight/buried/resurfaced screenshots + DOM chip/class assertions, zero page errors).

## Documentation changes

- Updated: `docs/MEGA-BOSS.md` (+§dormancy — pose, bar, death override, test coverage),
  `docs/HISTORY.md` + `src/changelog/releases.gen.ts` (chronicle picked up the probe
  commit), `docs/VALIDATION_REPORT.md` (PASS). The rest of the registry ring: no change
  needed (no balance/mode/save behavior moved — presentation only).

## Save changes

None — save layer untouched.

## Known edge cases

- The campaign DRAFT pauses `advance()` entirely, so the descent runs in two pieces:
  settle (~0.7 s of it) → frozen mid-pose behind the draft modal → completes in prep.
  Tests/probes must `chooseCard` to get past it (the §dormancy test does).
- `dormant` flips at burrow ≥ 0.5, so the banner greys during the settle beat — before
  the run's phase leaves 'wave'. That is intentional (the bar stops being attackable
  the moment combat ends).
- The dormancy tick is skipped while `deathT > 0` and `burrowOf` returns 0 during death —
  a kill on the final blow of a wave collapses on the surface, never half-buried.
- Headless dist probes: the game entry is `/play/index.html` (site owns `/`), and the
  scratchpad `serve.mjs` does not resolve directory URLs to index files.

## Remaining technical debt

- The burrow mound is a single generic pose (palette-tinted). Per-motif dormant anatomy
  (maw ridge vs choir spires…) would deepen identity — seam: `drawBurrowMound`
  (render/megaboss.ts) already receives the full MegaView.
- `megaDormancySystem`'s descent cue fires from the settle branch, which uses frame-dt
  presentation ticks; if a future mode ever skips settle entirely, the cue still fires on
  the first prep tick (same guard) — verify if settle semantics change.

## Recommended next tasks

1. Play-validate live (`npm run dev`): watch wave → burrow → prep → resurface cadence on
   campaign 10; confirm the mound reads at combat zoom and the rumble sits well in the mix.
2. Optional polish: per-motif dormant silhouettes via `drawBurrowMound`.

## Future expansion hooks

- `MEGA.burrowInSec` / `burrowOutSec` — the two pacing knobs, centralized.
- `MegaBossView.burrow` — any renderer/HUD surface can key off the pose (e.g. minimap
  dimming, music intensity ducking while buried).
