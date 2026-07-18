# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-18 05:16 UTC · **Diff scope:** feature commit `4c63715` + rituals delta
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 4c63715

## Summary of work completed

THE FRONT (save v49): the Infestation map overhauled from a passive bonus board into the
territory war — one-time **tier spoils** per sector (high-watermark `tierClaims` ledger,
region-themed localized wallets via `applyRewardList`, new PassReward kind `hiveMats`),
weekly **regional tribute** (ISO-week watermark scaled by held tiers), a daily **hotspot**
(feeds ×1.5), daily **incursions** with lazy BOUNDED resolution (≤ ONE bite per return —
`lastIncursionDay` cursor), and **Deploy** (session-scoped region warp → `RunOptions.sectorWarp`
at the single director fold; absent ⇒ byte-identical). The screen moved to the PLAY hub
(stage-8 reveal); the Command Center board collapsed to the one-line `FrontStrip`.
Entrenchment now also grants +1 expedition slot (`expeditionSlotsFor`, capped).
The one thing the next session must know: **the war layer's budgets are law** — retune
`tierReward`/`tributeFor`/incursion knobs ONLY with `npm run sim:front` green.

## Files modified

- Source: `src/core/infestation.ts` (§front block), `src/core/battlePass.ts` (hiveMats kind),
  `src/core/expeditions.ts` (expeditionSlotsFor), `src/core/game.ts` (sectorWarp fold),
  `src/core/rewardLoops.ts` (front_claims row), `src/core/rewardFrequency.ts` (front_claims verb),
  `src/state/meta.ts` (frontView/claimFrontTier/claimFrontTribute/pollFront + finishRun
  hotspot/defense/incursion), `src/state/frontDeploy.ts` (NEW), `src/save/saveStore.ts` (v49),
  `src/security/registry.ts` (front.claim guard), `src/ui/FrontScreen.tsx` (NEW),
  `src/ui/CommandCenter.tsx`, `src/ui/Hub.tsx`, `src/ui/GameView.tsx`, `src/ui/navModel.ts`,
  `src/i18n/index.ts`, `src/state/unlocks.ts` (stage-8 reveal), `src/state/mechanics.ts`,
  `src/state/notificationSources.ts` (front.war), `src/dev/systemRegistry.ts`,
  `src/dev/dil/knowledge.ts`, `src/index.css` (THE FRONT block)
- Tests: `src/state/front.test.ts` (NEW, 12) · Sim: `scripts/sim-front.ts` (NEW, `npm run sim:front`)
- Docs: `docs/INFESTATION.md` (§front), `docs/GAME-STATE.md` (v49 anchor + system summary),
  regen'd DIL_GRAPH / DEPENDENCY_GRAPH / UNLOCK-TREE / PIL_REPORT / VALIDATION_REPORT / HISTORY

## Systems affected (from the dependency registry)

- **infestation** — the whole §front war layer (see docs/INFESTATION.md §front)
- **currencies / battle-pass** — new PassReward kind `hiveMats` pays the Chitin wallet
- **expeditions** — entrenchment perk (`expeditionSlotsFor`, both view + start gate)
- **engine (golden-safe)** — `RunOptions.sectorWarp` at the one director fold; absent ⇒ identity
- **hub-shell** — PLAY-hub screen (nav `infestation`, stage-8 FEATURES beat), FrontStrip,
  `front.war` notification source; **security** — `front.claim` guard (both claim APIs)
- **reward-architecture** — `front_claims` loop row + `'claim'` verb in the frequency instrument

## Power Score changes

None — the Front pays wallets/shards/containers only; no new Power lane.

## Save changes

v48 → **v49**: `infestation` gains `tierClaims` (sector → highest tier paid), `tributeWeeks`
(region → weekKey), `defenses` (dayKey → defended sector, newest-14 ring), `lastIncursionDay`
(cursor). All empty on old saves — purely additive; fresh accounts byte-identical.
(Merged cleanly over the parallel batch's additive `bioSpores` v48 field.)

## UI changes

The Front screen (PLAY hub): hotspot/incursion chips + defend button, the living board,
spoils cards, tribute cards, deploy cards, NextUp handoff when nothing is claimable.
Command Center: `FrontStrip` one-liner (region bars, hotspot, INCURSION warn, claim badge)
replaces the old full-height board — the clutter fix the user asked for. Headless smoke
(scratchpad smoke-front.mjs pattern): strip on home, stage-8 reveal in PLAY landing, claim
pays 40+90 Chitin + watermark + card leaves rail, deploy pins `fringe_meadow` and hands
off to the Mission Hub — 14/14 PASS.

## Documentation changes

`docs/INFESTATION.md` §front (tiers/claims/tribute/hotspot/incursions/deploy/SATURATED_AT
rationale + extension points) — updated. `docs/GAME-STATE.md` infestation summary rewritten
(compressed system summary) + version anchor 49. DIL: 4 new knowledge edges (spoils→currencies,
deploy→golden-test, surfaces→hub-shell, perk→expeditions). No change needed:
CHANGELOG-PIPELINE.md, REWARD-ARCHITECTURE.md, REWARD-FREQUENCY.md (row + verb slot in).

## Known edge cases

- **`SATURATED_AT = 99.5`, not 100** — lazy decay made exact-100 transiently unreachable
  (a cap-written sector decays below 100 in seconds). Don't "fix" it back.
- Incursion resolution is DELIBERATELY bounded to yesterday — resolving the whole absence
  would be a death spiral; sim-front pins the ≤ decay + ONE bite law.
- The deploy warp is session-scoped and consumed ONCE (`frontDeploy.consumeWarp`), and
  GameView passes it only when `!daily && !tutorial`; Arena boots elsewhere. Never persist it.
- `tierReward`/`tributeFor` numbers are budget-fitted: spoils 14,720/15,000 core-eq,
  tribute 400/420 — small raises WILL trip `npm run sim:front` (that's the point).
- The reveal sits at **stage 8** because it is the guaranteed timeline's only open beat
  (reveal-pacing law: ≤3 per stage + non-regressing order). Moving it means re-running unlocks.

## Remaining technical debt

- The Front's headless smoke seeds overlays away field-by-field (introSeen, profileName,
  patchNotes.optOut, genomeRank.celebrated) + a generic dialog-dismiss loop; a shared
  "seeded interactive boot" helper for smokes would stop the whack-a-mole (observed, not new).
- `REGION_WARPS` deploys `r.sectors[0].id` per region card — a per-sector picker is a
  deliberate follow-up seam, not built.

## Recommended next tasks

1. Play-loop polish: a Front timeline event ('⛬' entries exist) surfaced in the Profile
   timeline view — entry point `src/state/profile.ts`.
2. Front achievements (first claim / full-region tribute / 7 defended incursions) —
   pure predicates over `save.infestation`, entry `src/state/achievements.ts`.
3. Standing user-side ops: prod D1 migrations 0006/0007/0008, DEV_KEY + MOD_KEY secrets,
  Turnstile SITE key (unchanged from prior handoffs).

## Future expansion hooks

- `src/core/infestation.ts` `tierReward`/`tributeFor` default arms — a 5th region joins the
  war with one REGIONS row + optional REGION_WARPS entry.
- `src/state/frontDeploy.ts` — the session-warp seam generalizes to any "next run rides a
  modifier" feature (consume-once contract already golden-safe).
- `resolveIncursionBite`'s `defenses` ring — raid/siege variants can widen the ledger
  without a save bump (record shape already sanitized).
