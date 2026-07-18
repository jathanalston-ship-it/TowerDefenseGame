# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-18 05:23 UTC · **Diff scope:** the Live Events wiring batch (2026-07-18p)
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** fdbf267 (+ the rituals commit that carries this file)

## Summary of work completed

The Live Event framework's CONSUMER batch — the queue's #347: the identity engine now
touches the player. Save **v50** adds the `liveEvents` window-scoped ledgers
(tokens/claimed/shopBought/progress; the sanitizer prunes dead windows on load);
`creditQuests` front-runs `creditEventChallenges` so every judged credit seam pays event
tokens with zero extra wiring; `claimEventMilestone`/`buyEventShopRow` (guarded:
`event.claim`/`event.buy`) pay through `applyRewardList` (repeat-safe by construction);
`liveEventLaneModsNow()` multiplies the trio's lane boosts into both liveops fold sites
(NEUTRAL under tests — the liveops FIXED_TEST_NOW convention, pinned by test);
`applyWardrobeDressing` dresses the hub root (`data-event` + `--event-*` vars) and
composes the theme owner's menu-music re-voicing with Wardrobe packs; the Command
Center's **LiveEventsPanel** is the loud-and-proud banner that unfolds into the claim
console (challenges → track → shop); DeployScreen shows the owner's `loadingLine`;
`event.claimable`/`event.endingSoon` ride channel `home` (CHANNEL_CLASS claim 87 → the
Ready Chain). One thing the next session must know: **the twin batch (The Front) took
v49 mid-flight — the ledgers were re-numbered to v50 per its coordination note; both
sets are additive and the merged tree is green.**

## Files modified

- Source: `src/save/saveStore.ts` (v50 + sanitizeLiveEvents), `src/state/meta.ts`
  (creditEventChallenges + claim/buy actions + two lane-fold sites),
  `src/core/liveEvents.ts` (liveEventLaneMods/Now), `src/ui/components/LiveEventsPanel.tsx`
  (NEW), `src/ui/CommandCenter.tsx`, `src/ui/DeployScreen.tsx`, `src/ui/Hub.tsx`
  (re-dress dep), `src/ui/wardrobeDressing.ts`, `src/state/notificationSources.ts`,
  `src/state/recommendations.ts`, `src/state/rewardToast.ts` (eventTokens row),
  `src/security/registry.ts` (event.claim/event.buy), `src/index.css`,
  `src/dev/systemRegistry.ts`, `src/dev/dil/knowledge.ts`, `src/changelog/releases.gen.ts`
- Tests: `src/state/liveEventsMeta.test.ts` (NEW — 10 tests)
- Docs: `docs/LIVE-EVENTS.md` (seam map → wired), `docs/GAME-STATE.md` (v50 anchor +
  compressed Live Events summary), `docs/DIL_GRAPH.md`, `docs/DEPENDENCY_GRAPH.md`,
  `docs/PIL_REPORT.md`, `docs/HISTORY.md`, `docs/devlog/DRAFT-2026-07-18.md`

## Systems affected (from the dependency registry)

- **liveops** — the identity engine's consumer wiring (panel file + save module claimed)
- **meta-store** — crediting seam, claim/buy actions, lane folds
- **save** — v50 `liveEvents` module + sanitizer
- **notifications / recommendations** — home-channel sources + CHANNEL_CLASS row
- **security** — two new guarded actions
- **chronicle** — releases regen

## Power Score changes

None — event rewards flow through `applyRewardList` (existing kinds); tokens are
engagement-scoped and carry no power.

## UI changes

The Command Center's first read is now the Live Events banner (theme owner headline +
sibling chips + claimable count) which expands into the per-event claim console; the hub
background tints with the owner's accent (`:root[data-event] .hub`); DeployScreen gained
the event flavor line. Verified by a live headless probe (banner + console open with the
real trio, 3 cards, 9 challenges, 33 track cells, 4 shop rows, `data-event` set) and
`npm run mobilecheck` CLEAN; uiStandards 6/6 (type + tracking on scale).

## Documentation changes

`docs/LIVE-EVENTS.md` §4 statuses flipped to wired (with the consumer names);
`docs/GAME-STATE.md` gained the ✅ BUILT compressed summary + v50 anchor;
`docs/CHANGELOG-PIPELINE.md` — no change needed (pipeline untouched, artifacts regen'd).

## Save changes

`CURRENT_VERSION = 50`: `liveEvents` `{tokens, claimed, shopBought, progress}` under
`eventId:window` keys — additive, empty on migration, fresh accounts byte-identical.
`sanitizeLiveEvents` clamps to live defs (cap/target/stock) and prunes stale windows
(wall-clock deliberate — staleness IS a function of now). v49 remains The Front's.

## Known edge cases

- The trio is ALWAYS live, so the meta-consumed lane fold pins ×1 under tests
  (`liveEventLaneModsNow`); the pure `liveEventLaneMods(now)` carries the real math —
  never call the pure one from meta without re-deriving the test story.
- A hub left idle across a UTC window flip re-dresses on the next render (any save write
  or interaction) — accepted; the banner/console recompute per render and never go stale.
- `event.endingSoon` counts only windows that still buy something (claimable milestone or
  affordable stocked shop row) — token dust below every threshold stays silent by design.
- Claims are threshold-based over tokens EARNED (never spent); the shop is the only sink.

## Remaining technical debt

- The claim console lives on home; if a dedicated Events screen ever lands, move the
  notification channel + toast nav with it (one string each).
- `eventOps` remote-config channel (accounts backend) is still contract-only — the pure
  calendar is the shipping baseline.

## Recommended next tasks

1. **#348 LANDSCAPE REFIT P1** — flip mobilecheck to landscape-only viewports + rotate
   gate BEFORE any layout work (contract-first, or CI breaks). Entry:
   `scripts/mobilecheck.ts`, `docs/RESPONSIVE-DESIGN.md`.
2. **#349 LANDSCAPE REFIT P2–P4** — screens/in-run/tutorial refit; mobile-browser vs
   iOS-app split (Capacitor shell + orientation lock).
3. **#350 Recommended-decisions prominence** — first eye-catch on every screen
   (`RecommendStrip`, Best-Purchase strips, cc-chain, NextUp).

## Future expansion hooks

- `LiveEventDefV2.gameplayModifiers` → the daily `modifierIds` boot path (App →
  GameView options) — the declared opt-in toggle seam, still unconsumed.
- `CEREMONIES` registry + `EventGameplayPackage` (hazard/pickup/tempMegaBoss/biomeTint)
  → renderer batch; `variants` → `render/wardrobeFx.ts`-style tint seam.
- `EventOpsConfig.future` + `LiveEventDefV2.future` — namespaced bags for
  community/global-boss/faction/PvP event categories.
