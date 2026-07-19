# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-19 20:50 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 45cd4f8

## Summary of work completed

DORMANT IDENTITY LAYER (user-requested follow-up to §dormancy): the buried pose is no
longer one grey mound — `drawDormantMotif` (render/megaboss.ts, called inside
`drawBurrowMound`'s save block) gives each of the seven megas its own sleeping silhouette
echoing its awake `drawMotif` anatomy: maw tusk-tips grinding through the soil, choir
spires with tolling bell-glints, the shepherd's crook + bone chimes, the tide bell riding
low with a breathing tide-ring, tithe scales + a forever-sinking bead, the gorge's
half-buried gullet still swallowing, myriad's heavy-lidded eyes drifting open to study the
field. All seven verified via a headless canvas-bitmap sweep (each visually distinct,
dormant banner true, zero page errors). Render-only; a new motif earns a case beside its
drawMotif case or falls back to the plain mound.

## Files modified

- Source (2): `src/changelog/releases.gen.ts`, `src/render/megaboss.ts`
- Tests (0): — (render-only; §dormancy laws already pin the state machine)
- Docs (2): `docs/HISTORY.md`, `docs/MEGA-BOSS.md`

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- **mega-bosses** — `src/render/megaboss.ts`
- **rendering** — `src/render/megaboss.ts`
- Consumer ring (verify, unchanged): cutscenes, hero-cinematics, living-battlefield

## Power Score changes

None — pure Canvas presentation.

## UI changes

- Battlefield only: per-motif dormant silhouettes over the shared burrow mound. No DOM/CSS
  change. Coverage: scratchpad `burrow-motifs.mjs` sweep (spawns each def in PREP — the
  dormancy tick buries it without a wave — and captures the canvas bitmap's top band,
  bypassing HUD overlays): burrow-m-<defId>.png × 7, all dormant, no page errors.

## Documentation changes

- Updated: `docs/MEGA-BOSS.md` (§dormancy gains the identity-layer paragraph),
  `docs/HISTORY.md` + `src/changelog/releases.gen.ts` (chronicle picked up 45cd4f8).
  The rest of the registry ring: no change needed.

## Save changes

None — save layer untouched.

## Known edge cases

- `drawBurrowMound` computes body/glo/acc; `drawDormantMotif` receives them — the first
  draft referenced `acc` without computing it (caught by typecheck; build = tsc + vite,
  so a green build implies a green typecheck).
- Probe trick worth keeping: spawning a mega while the run sits in PREP buries it in
  `burrowInSec` with no wave needed (`megaDormancySystem` ticks in prep), and setting
  `g.mega = null` between spawns is safe THERE because prep never casts (no megaFx
  cleanup needed) — do not reuse that shortcut mid-wave.
- Canvas-bitmap capture (`canvas.toDataURL` → crop) is the way to screenshot the field
  without the HUD DOM in front.

## Remaining technical debt

- Dormant silhouettes are single-anchor (one crook, one gullet) at fixed x positions —
  if a future map moves the ridge line or WIDTH changes, the fractions hold but the
  compositions were tuned at 720-wide world units.

## Recommended next tasks

1. HIVE INTELLIGENCE (user-queued, task #401): universal in-run best-upgrade system —
   HUD button, generic action-provider registry over every biomass sink, contextual
   ranking on top of the bestPurchase power-per-cost advisor, multi-buy to reserve,
   smart conveyor placement, action toasts, validation sim. Entry points:
   `src/state/bestPurchase` (advisor), conveyor deploy path, `docs/POWER-ADVISOR.md`.
2. Optional polish: dormant-motif micro-audio (per-family sleeping cues via the
   living-battlefield ambience director).

## Future expansion hooks

- `drawDormantMotif` — the one place a new motif adds its sleeping pose.
- `MegaBossView.burrow` remains readable by any surface (minimap dimming, music ducking).
