# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-18 03:15 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 0205703

## Summary of work completed

LIVE EVENT FRAMEWORK (commit 0205703 — docs/LIVE-EVENTS.md, PROJECT_STATUS 18m): the
foundational rotating-identity engine. `core/liveEvents.ts` runs three independent horizons
(short 3d×3 / medium 14d×3 / major 91d×2 rings from `BP.epochMs`) that are ALWAYS
simultaneously live; `themeOwner()` (major > medium > short) owns the hub identity while the
others chip. Every package composes an EXISTING vocabulary (PassReward tracks, MissionCond
challenges, daily-modifier gameplay, LiveEventMods lane boosts, SeasonDef.music re-voicing),
so a future event is one `LIVE_EVENTS_V2` row. `liveEventProblems()` + `npm run sim:events`
(3 years walked) enforce rotation coverage, accent-distinct overlaps, and flat yearly mint
under per-day budgets. **The one thing to know: the CORE framework is complete and gated;
the consumer wiring (save v49 tokens module, meta claims, hub theming, Events UI,
notifications, liveopsMods fold) is the mapped next batch — see LIVE-EVENTS.md §4.**

## Files modified

- Source (1): `src/changelog/releases.gen.ts`
- Tests (0): —
- Docs (1): `docs/HISTORY.md`
- (Committed just prior, same batch: core/liveEvents.ts + test, scripts/sim-live-events.ts,
  docs/LIVE-EVENTS.md, registry claim, DIL edge, package.json `sim:events`.)

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- **liveops** — gained core/liveEvents.ts (the identity layer beside the multiplier
  calendar); DIL edge documents the composition + anti-inflation laws.

## Power Score changes

None — the framework grants nothing yet (claims land with the meta batch, through
applyRewardList like every other track).

## UI changes

None this batch — deliberately. The consumer seam map (LIVE-EVENTS.md §4) specifies the
hub `data-event` theming, the LiveEventsStrip extension, notifications, and the Events
surface for the wiring batch.

## Documentation changes

- `docs/LIVE-EVENTS.md` — NEW: rotation contract, package vocabulary, anti-inflation laws,
  consumer seam map (status column), launch calendar.
- `docs/CHANGELOG-PIPELINE.md` — no change needed.
- DIL_GRAPH + DEPENDENCY_GRAPH regenerated.

## Save changes

None yet — the `liveEvents` tokens/claims module is specified (window-scoped
`eventId:window` keys, stale-prune sanitizer) for the wiring batch as save v49.

## Known edge cases

- The readability validator walks the FULL ring super-cycle LCM in 3-day steps — adding
  events lengthens the walk; it stays fast (day-granular) but don't tighten the step.
- `windowMintBudget` prices in coarse core-equivalents (documented weights) — it is an
  inflation GUARD, not an economy pricing source (sim:economy owns value).
- Gameplay modifiers are daily-modifier ids by contract — `liveEventProblems()` rejects
  unknown ids, so renames in dailyModifiers.ts surface here immediately.

## Remaining technical debt

- Variant packages (enemy/boss tints/titles) are declared + validated but have no renderer
  consumer yet — the seam map marks them "declared; renderer wiring future".

## Recommended next tasks

1. THE WIRING BATCH (LIVE-EVENTS.md §4, top to bottom): save v49 `liveEvents` module →
   meta actions (creditEventChallenges at the finishRun/quest seams, claimEventMilestone,
   buyEventShopRow via applyRewardList) → `liveopsMods()` fold of active horizon mods →
   hub `data-event` + CSS vars from `themeOwner()` → event notifications (live/endingSoon)
   → LiveEventsStrip rows for the three horizons → music re-voicing hookup.
2. Events hub surface (a landing card on the play hub or the existing liveops console).
3. Renderer variant overlays (tint/title) via the visuals seam.

## Future expansion hooks

- `LiveEventDefV2.future` — namespaced bag for consumers that don't exist yet.
- Ring growth: push a row; every invariant is ring-size-derived (sim asserts this).
- `EVENT_HORIZONS` — a fourth horizon would be one record entry + ring rows.
