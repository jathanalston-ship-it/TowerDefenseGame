# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-02 08:46 UTC · **Diff scope:** session commits `37f0d9c..3724a84`
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 3724a84

## Summary of work completed

The BALANCE-ARCHITECTURE arc, six commits: (1) first-discovery NEW badges through the
container reveal chain; (2) the Bio-Container meter rebuilt after finding the pinned-full
latch bug (effect-cleanup cancelled the un-pop timer — BUGFIX-LOG #10): the fill is now a
truthful pure read of `save.lootQueue` with an overlay-only earn ceremony, verified live
headless; (3) the Universal Difficulty Director — every scaling policy in one module with
bit-exact parity to the legacy formulas (goldens untouched); (4) the progression loop engine
+ LoopDirective surfacing with 8 enforced invariants; (5) the progression simulator (virtual
accounts over the REAL meta layer) + `npm run sim:progression` hour-band report; (6) the
adaptive economy framework (factor-traced income chains) and the four permanent balance docs.
**The one thing to know:** balance changes now go through the change protocol
(`BALANCE_ARCHITECTURE.md` §4) — simulate first, never tune the parity-pinned constants or
the weight-0 adaptive seams from intuition.

## Files modified

- Source: `core/difficultyDirector.ts` (new), `core/economyDirector.ts` (new),
  `state/progressionLoop.ts` (new), `dev/progressionSim.ts` (new), `scripts/sim-progression.ts`
  (new), `core/game.ts`, `core/campaign.ts`, `core/config.ts`, `core/events.ts`,
  `state/meta.ts`, `state/lootbox.ts`, `state/vaultReveal.ts`, `ui/LootMeter.tsx`,
  `ui/LootToaster.tsx`, `ui/VaultReveal.tsx`, `ui/NextGoalBanner.tsx`, `ui/Results.tsx`,
  `ui/CampaignScreen.tsx`, `ui/InfiniteScreen.tsx`, `index.css`, `dev/systemRegistry.ts`
- Tests (new): `difficultyDirector.test.ts`, `economyDirector.test.ts`,
  `progressionLoop.test.ts`, `progressionSim.test.ts`; extended: `lootQueue.test.ts`,
  `vaultReveal.test.ts`
- Docs (new): `BALANCE_ARCHITECTURE.md`, `DIFFICULTY_DIRECTOR.md`, `ECONOMY_FORMULAS.md`,
  `PROGRESSION_FORMULAS.md`, `PROGRESSION-LOOP.md`, `PROGRESSION_REPORT.md` (generated);
  updated: `LOOTBOX.md` (§meter + §opening-flow), `BUGFIX-LOG.md` (#10), boards + manifest +
  GAME-STATE (compressed summary) + dependency graph.

## Systems affected (from the dependency registry)

engine (director wiring — value-identical) · difficulty (now owns the Director) · campaign ·
infinite · loot (meter contract) · currencies/economy (framework) · hub-shell (loop engine +
directive) · meta-store (settle chains).

## Power Score changes

None — no scored field moved; `accountPowerParts` is now exported (read-only consumer:
the loop engine).

## UI changes

LootMeter (truthful fill + ceremony), LootToaster (vault count + next box), VaultReveal
(NEW badges), LoopDirective on Results/CampaignScreen/InfiniteScreen. All uiStandards-clean.

## Documentation changes

All registry-mapped docs updated (see Files); `docs:graph` regenerated twice; validation
report regenerated (PASS).

## Known edge cases

- The parity suites (director/economy) reproduce legacy formulas VERBATIM — a deliberate
  balance change must update test + code together, with a simulator diff attached.
- `Income.total()` applies factors left-to-right; re-associating the chain breaks bit-parity.
- The simulator's `spendEverything` salvages non-equipped gear each cycle — required to keep
  long simulations from crawling on inventory clones (and it models real play).
- `syncRunLoot` now self-heals an owed front (progress ≥ cost) — only reachable via
  legacy/tampered saves; do not "optimize" the `owed` check away.

## Remaining technical debt

- Giant files unchanged (game.ts / meta.ts / index.css — ENGINEERING-AUDIT §4).
- The simulator's world model is coarse (WORLD constants); calibrate against real sim
  harness runs when pacing decisions get close.
- Loop engine has no per-attempt fail history (no "breakthrough" pseudo-state).

## Recommended next tasks

1. **Balance tuning pass** (PROJECT_STATUS milestone 1): molt cadence + first-clear curve,
   through `BALANCE_ARCHITECTURE.md` §4, using `npm run sim:progression` before/after.
   Entry: `core/config.ts` PRESTIGE / CAMPAIGN_REWARDS; evidence: `PROGRESSION_REPORT.md`.
2. Wire `AdaptiveInputs` (powerRatio from the loop engine) into GameView → createDirector —
   the seam exists; weights stay 0 until the tuning pass.
3. Card Ascension gameplay wire (backend done).

## Future expansion hooks

- `difficultyDirector.ts`: reserved factors (biome bands, boss presence, prestige tier,
  seasonal) — one input + one factor each (§7 of its doc).
- `economyDirector.ts`: `ECONOMY_ADAPTIVE` seams; add currencies as new income chains.
- `progressionSim.ts`: CLI scale (`-- --seeds 2000`); WORLD constants are the calibration
  surface.
