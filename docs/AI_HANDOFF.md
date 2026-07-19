# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-19 20:02 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** cdcec46

## Summary of work completed

FIGHT-TIMELINE PROBE (user-requested): `npm run sim:mega` (scripts/sim-mega-feel.ts) runs
five REAL mega fights across campaign/infinite/boss-rush and measures the HP bar's truth —
uptime, longest flat stretch (+ regen attribution), organ cadence, rotation, per-phase
pacing, kill vs reward bar. **Verdict: no rebuild warranted** — all modes measure healthy
(kills 34–61 s fight time, uptime 69–80 %, flat ≤ 2.7 s, organ gap 4–10.5 s). The one thing
the next session must know: the first probe draft read a phantom "585 s campaign stall"
that was actually the BETWEEN-WAVE DRAFT — `paused` includes `'draft'` and
megaBossSystem/towerSystem only run in the `'wave'` branch, so any campaign instrument must
drive `chooseCard`/`startWave` and measure fight time only (now a DIL edge). Also shipped
the ORGAN DROUGHT VALVE (`MEGA.organDroughtSec` 22 s, `megaOrganDrought`): a persisting
mega whose destructibles are all spent regrows one organ round-robin ("IT REGROWS") so
campaign can never run out of counterplay — the spent-organ pathology is real even though
the measured stall was not.

## Files modified

- Source (4): `src/changelog/releases.gen.ts`, `src/core/game.ts`, `src/core/megaboss.ts`, `src/dev/dil/knowledge.ts`
- Tests (1): `src/core/megaboss.test.ts`
- Docs (4): `docs/DIL_GRAPH.md`, `docs/HISTORY.md`, `docs/MEGA-BOSS.md`, `docs/VALIDATION_REPORT.md`
- New instrument: `scripts/sim-mega-feel.ts` (+ `sim:mega` npm script)

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- **dev-registry** — `src/dev/dil/knowledge.ts`
- **engine** — `src/core/game.ts`
- **mega-bosses** — `src/core/megaboss.ts`
- Consumer ring (verify, unchanged): arena, audio, boss-rush, bosses, campaign, cutscenes, daily, hero-cinematics, heroes, infinite, living-battlefield, nemesis, onboarding, online-foundation, pil, rendering, run-ui

## Power Score changes

None — `organDroughtSec` is fight-pacing only and the new `MegaRuntime` fields
(`lastOrganOpenAt`, `droughtRotor`) are runtime state; no Power source, bucket, or preview
surface moved. (megaboss.ts is power-adjacent via the reward model, which is untouched —
`megaExpectedKillSec` is only READ by the probe.)

## UI changes

None — no component/CSS change. Player-visible additions are in-sim presentation only:
the "IT REGROWS — <ORGAN>" float + `wpOpen` cue when the drought valve fires. Coverage:
megaboss.test §organ drought valve (2 laws) + the probe's five headless fights.

## Documentation changes

- Updated: `docs/MEGA-BOSS.md` (+§feel — probe model, thresholds, measured numbers,
  drought valve, the draft-freeze harness lesson), `docs/DIL_GRAPH.md` (regen; +1
  mega-bosses↔campaign conflictsWith edge), `docs/HISTORY.md` + `src/changelog/releases.gen.ts`
  (chronicle), `docs/VALIDATION_REPORT.md` (PASS). The rest of the registry ring: no change
  needed (no mode/hero/UI behavior moved).

## Save changes

None — save layer untouched.

## Known edge cases

- The valve deliberately REGROWS destroyed organs (fresh hp/window) — "destroyed specs
  never return" now has exactly one exception, drought recovery; the scar ledger
  (wpDestroyed/wpKinds) still counts every rupture. Lore cover: "IT REGROWS".
- Voraxis' Armored Growth (`window: 0`, until-destroyed) can sit open indefinitely on a
  passive board — the valve correctly stays silent then (§valve law 2: rotor never moves
  while anything is open).
- The probe's campaign thresholds (flat ≤ 26 s / uptime ≥ 30 %) are looser than continuous
  (≤ 12 s / ≥ 50 %) because guns split between defense duty and the raid mid-wave —
  measured headroom is large (1.2 s / 80 %).
- `sim:mega` exits 1 on threshold breach — safe for CI, but it runs real fights (~40 s);
  it is NOT part of `npm run validate` by design.

## Remaining technical debt

- The probe's board is fixed (10 forward towers, ravager, god). A weak-board sweep (3–5
  towers, no hero) would characterize the valve's firing envelope empirically; today only
  the unit tests exercise it.
- `mega.deathT > 0` ticks are excluded from fight time but the death sequence is measured
  on the wall clock — fine while death runs un-gated in every mode; revisit if a mode ever
  pauses mid-collapse.

## Recommended next tasks

1. Play-validate campaign-10 Voraxis live (`npm run dev`) — confirm the between-wave
   freeze reads as intentional now that the fight itself measures healthy; if it still
   feels like "invincibility", the fix is presentation (e.g. a dormant/burrowed pose
   during prep), not sim.
2. Optional: weak-board probe run (entry: `scripts/sim-mega-feel.ts` BOARD/`placed >= 10`)
   to watch the drought valve fire in a real fight.

## Future expansion hooks

- `scripts/sim-mega-feel.ts` `runs[]` — add any def/tier/mode/seed as a one-liner; THRESH
  is the single feel contract.
- `MEGA.organDroughtSec` — the one knob for drought cadence; `megaOrganDrought` (game.ts)
  is the seam for smarter regrowth policies (e.g. prefer non-heart organs, tier-scaled hp).
