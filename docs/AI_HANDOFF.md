# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-19 00:40 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 044f787

## Summary of work completed

METABOLISM (docs/METABOLISM.md) — the recursive progression system, shipped end-to-end:
22 infinite milestone tracks over lifetime ledgers (derive-first — veterans back-fill on
load; only four ritual counters needed chokepoint writes), nice-number thresholds that
grow ×1.8/tier vs rewards ×1.35/tier (the anti-inflation invariant, machine-pinned), a
guarded batch-claim action paying through applyRewardList, and the Milestones screen in
the Rewards hub (stage-8 reveal, one attention animator, cogload-clean). The one thing
the next session must know: the module lives in `src/state/metabolism.ts`, NOT core/ —
its value() functions read whole SaveData, and core/boundaries.test forbids core→save
imports; the save SHAPE (MetabolismSave/defaultMetabolism/sanitizer) is owned by
saveStore itself (v51).

## Files modified

- Source (17): `src/changelog/releases.gen.ts`, `src/core/battlePass.ts`, `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`, `src/i18n/index.ts`, `src/index.css`, `src/save/saveStore.ts`, `src/security/registry.ts`, `src/state/mechanics.ts`, `src/state/meta.ts`, `src/state/notificationSources.ts`, `src/state/recommendations.ts`, `src/state/unlocks.ts`, `src/ui/Hub.tsx`, `src/ui/navModel.ts`, `src/state/metabolism.ts`, `src/ui/MetabolismScreen.tsx`
- Tests (1): `src/state/metabolism.test.ts`
- Scripts (2): `scripts/sim-metabolism.ts` (new — `npm run sim:metabolism`), `package.json`
- Docs (7): `docs/COGLOAD_REPORT.md`, `docs/DEPENDENCY_GRAPH.md`, `docs/DIL_GRAPH.md`, `docs/GAME-STATE.md`, `docs/HISTORY.md`, `docs/UNLOCK-TREE.md`, `docs/METABOLISM.md` (new)

## Systems affected (from the dependency registry)

- **battle-pass** — `src/core/battlePass.ts`
- **chronicle** — `src/changelog/releases.gen.ts`
- **dev-registry** — `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`
- **hub-shell** — `src/ui/Hub.tsx`, `src/ui/navModel.ts`
- **i18n** — `src/i18n/index.ts`
- **meta-store** — `src/save/saveStore.ts`, `src/state/meta.ts`
- **metabolism** — `src/state/metabolism.ts`, `src/ui/MetabolismScreen.tsx`
- **notifications** — `src/state/notificationSources.ts`, `src/state/recommendations.ts`
- **onboarding** — `src/state/mechanics.ts`
- **progression-gating** — `src/state/unlocks.ts`
- **security** — `src/security/registry.ts`
- Consumer ring (verify, unchanged): account-level, accounts, analytics, arena, contracts, cosmetics, cutscenes, daily-login, devtools, directives, expeditions, field-research, genome-rank, hero-symbiotes, hive-construction, idle-harvest, infestation, liveops, mulligans, nemesis, net-backend, nucleus, pil, profile, quests, reward-architecture, run-ui

## Power Score changes

None by design — Metabolism pays currencies/containers/season XP, never stats (the
system-registry row records powerScore 'none'). The battle-pass change is a new
PassReward kind (`mulliganTissue`), a currency grant with no Power surface.

## UI changes

New `MetabolismScreen` (nav `metabolism`, Rewards group, '✹ Milestones'): masthead ledger
+ `<Detail>` curve fold, hero Digest row (the screen's ONE attention-band animator,
`mtb-hero-breathe` 2.8s), four category sections with progress-bar-dominant track rows and
act-claim CTAs; "Digest all" batches every track. Hub routes the screen behind the
standard FeatureLocked stage-8 reveal; the rail badge and Ready Chain pick it up through
the generic notification channel. Verified: mobilecheck CLEAN (30 screens × 6 viewports),
cogload 70/70 in budget (metabolism: attn 1), full build.

## Documentation changes

`docs/METABOLISM.md` NEW (architecture, curves, interpreter contract, claim flow,
surfaces, extension contract, persona-sim gates, invariants). Regenerated:
DEPENDENCY_GRAPH, DIL_GRAPH, UNLOCK-TREE (33 features), COGLOAD_REPORT, HISTORY (notes).
`docs/GAME-STATE.md` save-schema anchor bumped to v51. All other listed docs: no change
needed (blast-radius listing only — no behavior in their systems moved).

## Save changes

`CURRENT_VERSION` 50 → 51. New field `metabolism: MetabolismSave` `{ counters:
{containersOpened, sporesAbsorbed, questsClaimed, passClaimed}, claimed: Record<trackId,
tiers> }` — shape/default/sanitizer owned by saveStore (interface exported there;
state/metabolism imports the type). Sanitizer floors counters to ints ≥ 0, keeps only
positive claimed entries; trackView clamps claimed ≤ reached at read time. Migration is
pure deep-fill (missing ⇒ defaults) — pinned by the v50→v51 round-trip tests in
`src/state/metabolism.test.ts` (old export without the field imports clean; junk sanitizes).

## Known edge cases

- The four ritual counters start at ZERO for every account at v51 — that is deliberate
  (fresh low-base ladders keep a veteran's board alive after the back-fill jackpot; the
  persona sim models this and depends on it).
- `claimMetabolism` deliberately feeds no counter — claiming milestones must not be a
  milestone (the recursion terminates).
- `grantRouletteRewards` bumps `sporesAbsorbed` by SPORES SPENT (quantity), not sessions.
- nice-rounding could flatten neighbouring thresholds on the raw ×1.8 curve; `threshold()`
  forces every step past `nice(prev × 1.8)` — the strict-increase test guards this.
- Track `value()` must read LIFETIME ledgers (`lifetimeShards`), never spendable balances
  (`shards`) — a spendable source would let claims un-reach.

## Remaining technical debt

- MetabolismScreen claims per-track; the reward placards merge, but a "Digest all" over
  many tracks fires one toast group per track — acceptable (bounded ≤22), could batch
  into a single ceremony later.
- The sim's accrual model is linear per track (documented simplification); if live pacing
  telemetry lands, feed real rates into `MID_RATES`.

## Recommended next tasks

1. Wire Metabolism into the Rewards hub LANDING page member cards (ui/HubLanding.tsx) if
   the next prominence pass wants the claimable count on the door itself.
2. Consider a collection/achievement recognition row for deep metabolism tiers (e.g.
   "reach T10 on any track") — recognition currently lives in the tracks themselves.
3. Localize the MetabolismScreen strings (inline-en today, like sibling screens).

## Future expansion hooks

- `META_TRACKS` (src/state/metabolism.ts) — a future system integrates by adding ONE
  TrackDef row; curves/claims/guard/screen/badge/recommendation are generic.
- `MetaRewardType` + `toPassRewards()` — extend alongside `PassReward` when a new
  interpreter kind lands (mulliganTissue shows the pattern).
- `bumpCounter` (state/metabolism.ts) — the single write path if a fifth unledgered verb
  ever needs a ritual counter (add the field to MetabolismSave in saveStore + one
  chokepoint call).
