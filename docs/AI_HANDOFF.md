# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-18 00:21 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** eaf734f

## Summary of work completed

REWARD FREQUENCY ENGINEERING (commit eaf734f — docs/REWARD-FREQUENCY.md, PROJECT_STATUS
17l): the brief's "maximize meaningful interactions/hour without raising values" became a
machine-enforced philosophy. `core/rewardFrequency.ts` walks six personas' sessions
minute-by-minute with beat rates DERIVED from live data (real weekly quests via
`missionCredit`, the real BP curve, the measured Ready-Chain tap economy) and gates the
bands in the test suite. The instrument found ONE real drought — long-run personas' 7–9
minute session tails — fixed value-neutrally by surfacing the already-existing free daily
gauntlet entry (`rush.freeEntry` notification + `bossrush` play-lane recommendation at
score 34, so it fires exactly when the claim chain is spent). The one thing to know:
**every new REWARD_SOURCES row must also name its verb in SOURCE_VERB** or
`verbTotalityProblems()` fails the build. The working-tree diff this scaffold saw is the
Chronicle regen only.

## Files modified

- Source (1): `src/changelog/releases.gen.ts`
- Tests (0): —
- Docs (2): `docs/HISTORY.md`, `docs/devlog/DRAFT-2026-07-18.md`
- (Committed just prior, same batch: core/rewardFrequency.ts + test,
  scripts/sim-reward-frequency.ts, notificationSources, recommendations, registry, DIL,
  package.json `sim:frequency`, docs/REWARD-FREQUENCY.md.)

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- **reward-architecture** — core/rewardFrequency.ts joins its files; the frequency
  contract DIL edge documents the SOURCE_VERB + value-neutrality rules.
- **notifications** — `rush.freeEntry` source; `bossrush` CHANNEL_CLASS 'play' row.

## Power Score changes

None — the initiative is rhythm-only; no grant, rate, or total changed anywhere
(§6 balancing log in REWARD-FREQUENCY.md records every decision at value delta 0).

## UI changes

No layout changes. Behavioral: the bossrush hub door/badge lights while today's free
gauntlet entry is unused, and Recommended-Now/NextUp can hand a spent session tail to it
(kind 'play', score 34 — below every claim/open/upgrade by design). Existing surfaces
render it; mobilecheck unaffected (no CSS/DOM changes).

## Documentation changes

- `docs/REWARD-FREQUENCY.md` — NEW: the philosophy, bands table, measured baseline,
  finding→redesign, per-surface review, balancing-decisions log, inheritance contract.
- `docs/CHANGELOG-PIPELINE.md` — no change needed (pipeline untouched).
- DIL_GRAPH + DEPENDENCY_GRAPH regenerated.

## Save changes

None.

## Known edge cases

- `personaHour` takes max-over-trials for maxGap/peak (worst case, not average) — bands
  are strict; a flaky beat-rate change shows up as an intermittent band failure, which is
  intended (fix the rhythm, not the test).
- The wind-down models tails ≥5.5 min; shorter tails cannot arithmetically breach the
  6-min gap ceiling (documented in §6).
- `SOURCE_VERB` has a stale-row guard too — deleting a REWARD_SOURCES row requires
  removing its verb row (both directions enforced).

## Remaining technical debt

- The walk's in-run cadences (draft ≈2.6min, meter fill 0.55/run) are documented
  assumptions mirroring config-scale numbers — recalibrate from analytics FlowFold
  rollups when production data exists (same hook as the economy sim's income table).

## Recommended next tasks

1. Feed live analytics into the persona shapes (`FREQUENCY_PERSONAS` facts) once
   cur_gain/session rollups accumulate — the instrument then measures REAL cohorts.
2. Consider a `daily.run` quick-finisher source beside `rush.freeEntry` (the daily run is
   the second short-form mode; same two-line pattern).
3. A Results-screen "tail chip" (UI): when the recommendation layer's top rec is the
   quick finisher, show it on Results directly — one fewer hop to the wind-down.

## Future expansion hooks

- `SOURCE_VERB` + `verbTotalityProblems()` (core/rewardFrequency.ts) — new pathway = one
  registry row + one verb row, automatically measured.
- `FREQUENCY_BANDS` — the tunable contract; raise floors as content density grows.
- `walkSession` beat cadences — swap documented assumptions for analytics-derived rates.
