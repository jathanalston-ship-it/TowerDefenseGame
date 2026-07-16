# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-16 (updated post-convergence) · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** the reward placard framework

## Summary of work completed

TWO parallel sessions implemented the same reward-toast spec on this branch the same day;
the branch CONVERGED on the placard framework (docs/NOTIFICATIONS.md §reward-toasts +
§reward-registry): every reward announces as a per-reward placard reveal from the
`REWARD_TYPES` registry in `src/state/rewardToast.ts` — large art, big `+qty`, source
subtitle, rarity tiers t0–t3, 4s merge window, X/click/swipe/Dismiss-All, hold buffer for
run-end grants. Pushes live at `meta.ts` grant seams ONLY (applyRewardList returns events);
achievements ride a headless save-diff watcher. The earlier vocabulary layer
(`rewardVocab.ts`, receipt-line coalescing, SpliceMarket UI-side pushes) was REMOVED in the
convergence — its Splice-Market coverage carried over as grant-seam placards in
`meta.buyMarketSlot`/`buyIchorOffer`. The one thing the next session must know: **a future
reward type is one row in `REWARD_TYPES`** — art, tier, merge rule and nav follow; a new
claim surface pushes `rewardToast.pushMany(source, events)` at its grant seam, never from a
screen.

## Files modified

The placard framework commit (17 files): `state/rewardToast.ts` + test (rewritten),
`ui/components/RewardToaster.tsx` (rewritten), `state/meta.ts` (13+ grant seams),
`ui/AchievementToaster.tsx` (headless), `audio/sound.ts` (toast0/1/2), `index.css`
(`.rwt2-*`), QuestBoard/BattlePassScreen/Wardrobe/DirectivesCard (legacy pushes removed),
docs (NOTIFICATIONS/GAME-STATE/DIL edge). Convergence removed `state/rewardVocab.ts` and
the SpliceMarket UI push.

## Systems affected (from the dependency registry)

- **notifications** — rewardToast/RewardToaster/AchievementToaster + every claim seam in meta

## Power Score changes

None — no Power-relevant system touched.

## UI changes

The placard stack (top-right; top band ≤480px) replaces the receipt popup. Verified LIVE
headlessly on desktop + 390px: two exchange buys merged into one +647 card, harvest collect
stacked achievement placards over the ceremony with the "+5 more" queue chip and Dismiss
All, mobile placard in-viewport in the top band, click/X dismissal.

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

1. USER DECISION (flagged, not actioned): the stage-gate divergence — the recorded
   docs/DIFFICULTY.md §curve decision KEEPS hero slot 3 @90, gene gates 15/30/50/75,
   Nucleus 40/75; the hour-parity analysis suggested 45/20, 12/18/25/40, 20/35. Five-line
   data change if wanted; do not change without the user's word.
2. If a new reward SOURCE ships (not a new type), route it once: dedicated full-screen
   ceremony OR grant-seam placards — never both (coverage table, docs/NOTIFICATIONS.md
   §reward-toasts).

## Future expansion hooks

- `src/state/rewardToast.ts` — `REWARD_TYPES` (a new reward type is one row:
  id/unit/art/merge/tier/nav); `eventsForPassRewards` for new applyRewardList kinds.
- `src/ui/components/RewardToaster.tsx` — tier classes t0–t3, arrival cue map,
  `lifeFractionOf` (exported seam for a future progress ring).
