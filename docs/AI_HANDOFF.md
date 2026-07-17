# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-17 23:43 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 4680ab8

## Summary of work completed

LOCALIZED ECONOMY REDESIGN (docs/ECONOMY.md §8, save v48). The currency registry became a
machine-enforced contract — every `CurrencyDef` now declares its ONE spend `domain` plus ≥2
`earnedFrom` sources, and `currencyProblems()` fails the build on name/color/domain collisions.
Two new wallets shipped: **Chitin** (`hiveMaterials`) now prices Hive-Production organs (was
Genome Cores; income = guaranteed hopper top-slice `IDLE.hiveMatsShare` + expedition lanes
value-swapped 1:1 from cores) and **Mulligan Tissue** (`mulliganTissue`) now prices tower graft
upgrades/ascends (was Gene Essence; income = dupe dissolves at the old numbers, an even
premium-container bleed split, and a hopper trickle carved from the essence row). Everything is
value SHIFTED, never added — `npm run sim:economy` pins organ pace parity, no migration stalls,
gene-wallet relief, and tissue adequacy. The one thing to know: the Ichor reforge,
Hive-Construction recipes, and Nucleus/Symbiote essence sinks were deliberately NOT converted.

## Files modified

- Source (18): `src/changelog/releases.gen.ts`, `src/core/config.ts`, `src/core/currencies.ts`, `src/core/expeditions.ts`, `src/core/idleHarvest.ts`, `src/core/rewardLoops.ts`, `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`, `src/net/telemetry.ts`, `src/save/saveStore.ts`, `src/state/meta.ts`, `src/state/mulliganLabModel.ts`, `src/state/rewardToast.ts`, `src/ui/ExpeditionScreen.tsx`, `src/ui/HarvestScreen.tsx`, `src/ui/MulliganLab.tsx`, `src/ui/components/CurrencyIcon.tsx`, `src/ui/components/Icon.tsx`
- Tests (5): `src/state/idleMeta.test.ts`, `src/state/mulligan.test.ts`, `src/state/mulliganLabModel.test.ts`, `src/core/currencies.test.ts`, `src/state/localizedEconomy.test.ts`
- Docs (6): `docs/DEPENDENCY_GRAPH.md`, `docs/DIL_GRAPH.md`, `docs/ECONOMY.md`, `docs/GAME-STATE.md`, `docs/HISTORY.md`, `docs/VALIDATION_REPORT.md`
- New script: `scripts/sim-localized-economy.ts` (`npm run sim:economy`)

## Systems affected (from the dependency registry)

- **analytics** — `src/net/telemetry.ts`
- **chronicle** — `src/changelog/releases.gen.ts`
- **content-infra** — `src/core/config.ts`
- **currencies** — `src/core/currencies.ts`, `src/ui/components/CurrencyIcon.tsx`
- **dev-registry** — `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`
- **expeditions** — `src/core/expeditions.ts`, `src/ui/ExpeditionScreen.tsx`
- **idle-harvest** — `src/core/idleHarvest.ts`, `src/ui/HarvestScreen.tsx`
- **meta-store** — `src/save/saveStore.ts`, `src/state/meta.ts`
- **mulligans** — `src/state/mulliganLabModel.ts`, `src/ui/MulliganLab.tsx`
- **notifications** — `src/state/rewardToast.ts`
- **reward-architecture** — `src/core/rewardLoops.ts`
- **ui-kit** — `src/ui/components/Icon.tsx`
- Consumer ring (verify, unchanged): account-level, accounts, arena, battle-pass, biomes, bosses, collection, contracts, cosmetics, cutscenes, daily-login, devtools, difficulty, directives, doctrines, engine, equipment, evolution-hq, field-research, gene-cards, genome-rank, hero-symbiotes, heroes, hive-construction, hub-shell, infestation, liveops, loot, mastery, mega-bosses, nemesis, net-backend, nucleus, onboarding, online-foundation, pil, power, premium, progression-gating, quests, run-ui, security, splice-market, towers, website

## Power Score changes

None by design — the swap changes WHICH wallet pays, never what power a purchase grants.
Mulligan Power still rides modifiers × rarity × level (`accountMulliganPower`); organ levels
never fed Power. `mulligan.test.ts` re-pins the upgrade Power bump under the Tissue wallet.

## UI changes

Harvest screen: organ costs, the wallet chip, the grow-next suggestion and the ceremony
footer all read Chitin (`CurrencyIcon id="hiveMaterials"`, olive hex-plate icon). Mulligan
Lab: wallet header shows Mulligan Tissue (rose lobed-tissue icon); `canAfford/ascendable`
read the Tissue balance. Expedition board + spoils show a Chitin chip on scavenge roads.
Vault reveals render Tissue events (Graft Bleed / Duplicate Dissolved) through the generic
currency branch. Headless smoke (scratchpad smoke-economy.mjs, dev server /play/): seeded
500 Chitin renders, an organ buy spends 500 → 440 at the printed 60 cost, and the Lab shows
the seeded 300 Tissue.

## Documentation changes

`docs/ECONOMY.md` gained §8 (the localized map, faucet math, deliberate non-conversions,
validation bars). `docs/GAME-STATE.md` gained the compressed system summary + the v48 anchor.
`docs/MULLIGANS.md`/`docs/IDLE-HARVEST.md` prose still says essence/cores in places — the
registry rows + ECONOMY.md §8 are canonical; flagged below as debt. Graphs regenerated.

## Save changes

`CURRENT_VERSION` 47 → 48. New root fields `hiveMaterials` + `mulliganTissue` (defaults 0,
floor/clamp sanitizers). Reconcile-on-load seeds fire ONLY when the field is ABSENT on an
invested save: hive `60 + 20 × Σ organ levels`, tissue `25 + 8 × Σ graft slot levels` —
pinned in `localizedEconomy.test.ts` (seeded, sanitized-not-reseeded, fresh-account-0 cases).

## Known edge cases

- The bleed split applies only to PREMIUM (epic+) containers with Mulligans unlocked —
  common/rare containers still bleed pure essence (mid-catalog tissue pace depends on it).
- `rollIdleHarvest` pushes the Chitin line LAST so a BLOOM's guaranteed rare stays
  `lines[0]` (idleHarvest.test pins that); display order is mergeIdleReceiptLines' sort.
- The registry glob test rejects `scripts/**` and `*.test.ts` in `files` — keep registry
  file lists to non-test `src/` paths.
- The Harvest screen's advice line and NodeCard use `.hv-sec-s`/`.hv-node-buy` selectors the
  smoke depends on.

## Remaining technical debt

- `docs/MULLIGANS.md` + `docs/IDLE-HARVEST.md` body prose predates the wallet swap in a few
  paragraphs (registry + ECONOMY.md §8 are the tiebreakers).
- The sim's old-run-economy income table is a documented assumption; when the analytics
  platform accumulates real cur_gain rollups, recalibrate `RUN_CORES_PER_DAY` from data.

## Recommended next tasks

1. Localize Nucleus + Hero Symbiote organ growth onto Tissue (or a sibling wallet) — the
   flagged future candidates (`src/state/meta.ts` nucleus/symbiote grow APIs).
2. Recalibrate sim assumptions from live analytics (`scripts/sim-localized-economy.ts`
   header constants) once prod rollups exist.
3. Sweep MULLIGANS.md / IDLE-HARVEST.md prose to the new wallets.

## Future expansion hooks

- `CurrencyDomain` union + `currencyProblems()` (`src/core/currencies.ts`) — a new system's
  wallet is one row; the laws hold the map.
- `IDLE.hiveMatsShare` (`src/core/config.ts`) — remote-tunable-shaped knob for the Chitin lane.
- `ExpeditionReward.chitin?` (`src/core/expeditions.ts`) — any road can haul Chitin.
- `meta.grantMulliganTissue` (`src/state/meta.ts`) — the faucet API for future Tissue sources.
