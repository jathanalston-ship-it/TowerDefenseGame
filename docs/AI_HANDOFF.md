# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-16 12:42 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** e67c20a

## Summary of work completed

The reward-toast gap batch (docs/NOTIFICATIONS.md §vocab/§tiers/§merge/§dismiss): a
config-driven reward vocabulary (`src/state/rewardVocab.ts`, one registry row per reward
kind), kind/qty-stamped receipt lines from `meta.applyRewardList`, tier derivation from the
loudest line, pure `coalesce()` merging of rapid identical receipts, and the RewardToaster
upgrade — hero placard, tier-scaled ceremony (rare halo / epic spores / legendary screen
wash + 8s dwell), tier audio for `sound`-flagged receipts, ✕/swipe/Clear-all dismissal.
Splice Market trades (the one silent reward source) now present the claim popup. The one
thing the next session must know: **a future reward type is one row in `REWARD_KINDS`** —
presentation, tier, audio and merge behavior follow automatically.

## Files modified

- Source (1): `src/changelog/releases.gen.ts`
- Tests (0): —
- Docs (2): `docs/HISTORY.md`, `docs/VALIDATION_REPORT.md`

(The batch itself is already in HEAD — see e67c20a for the 11-file diff; this scaffold's
scope caught only the post-push chronicle/validate artifacts.)

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- **notifications** (in HEAD e67c20a) — rewardVocab/rewardToast/RewardToaster/SpliceMarket

## Power Score changes

None — no Power-relevant system touched.

## UI changes

Surfaces in the blast radius: `App (RewardToaster claim popup)`, `Splice Market`.
Every receipt now carries a ceremony tier class (`is-t-*`), single quantified lines render
the HERO placard (54px medal, 26px `+qty` headline, WHAT deduped against the name line),
and dismissal is universal (click, 24px ✕, pointer swipe riding the independent `translate`
property, Clear all past two queued). Verified LIVE headlessly: a real market purchase on
the built bundle presented the card with tier class + hero placard, ✕ dismissed it, and two
spaced buys queued behind one card with the `+1` chip (spacing respects the `market.buy`
700ms anti-macro cooldown — rapid third clicks are rejected by SecurityPulse by design).

## Documentation changes

Registry says these move with the touched systems: `docs/CHANGELOG-PIPELINE.md` — no change
needed (the pipeline itself regenerated its artifacts). `docs/NOTIFICATIONS.md` gained
§vocab/§tiers/§merge/§dismiss + two coverage rows (in HEAD).

## Save changes

None — save layer untouched (receipt kinds/tiers are presentation-only; the bus is save-free).

## Known edge cases

- `applyRewardList`'s composite materials + all-shards lines are deliberately NOT
  kind-stamped: their special-form labels would be lost on merge-regeneration, so they
  queue exactly as before and never coalesce.
- The swipe-away drag rides the `translate` CSS property because the `rwt-in` entrance
  animation owns `transform` with fill `both` — moving the drag onto `transform` would be
  silently overridden. Don't "simplify" that.
- A purchase can unlock a mechanic mid-flow and fire the WhatsNew ceremony over the screen
  (headless probes must pre-seed `help.seen` with every mechanic id; the market probe does).
- Market receipts rarely coalesce in practice (slot names differ per purchase); the merge
  path's real customers are repeated quest/directive claims through `applyRewardList`.

## Remaining technical debt

None new. Probe scripts stay session-local (scratchpad) by design — the repeatable
verification contract is `rewardToast.test.ts` (18 tests) + uiStandards + mobilecheck.

## Recommended next tasks

1. Adopt `vocabLine()` at claim sites that still hand-build receipt labels (grep
   `rewardToast.push` — quests/pass/directives already inherit via applyRewardList).
2. USER DECISION (flagged, not actioned): the stage-gate divergence — the recorded
   docs/DIFFICULTY.md §curve decision KEEPS hero slot 3 @90, gene gates 15/30/50/75,
   Nucleus 40/75; the hour-parity analysis suggested 45/20, 12/18/25/40, 20/35. Five-line
   data change if wanted; do not change without the user's word.
3. If a new reward SOURCE ships (not a new kind), route it once: bespoke ceremony OR
   `rewardToast.push` — never both (single-owner rule, docs/NOTIFICATIONS.md).

## Future expansion hooks

- `src/state/rewardVocab.ts` — `REWARD_KINDS` (add a row: id/icon/name/tier/mergeable/fmt).
- `src/state/rewardToast.ts` — `RewardToastLine.kind/qty` (stamp at any source to opt into
  tiers + merging); `mergeKey()` if a future kind needs custom merge identity.
- `src/ui/components/RewardToaster.tsx` — `TIER_CUE` map (per-tier audio), `dwellFor()`.
