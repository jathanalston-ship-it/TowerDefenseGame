# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-04 04:36 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 760d97a

## Summary of work completed

Early-campaign difficulty contract (player report: "can't get past campaign stage 1 at 1700/1000
recommended power"). Wave generation was restructured around the contract ">rec ≈ no damage ·
=rec ≈ chip/boss damage · ≤0.75 ≈ bad time": EHP-based speed-aware threat costs, per-wave
unit/leak-damage caps + an elite-frequency ramp on wave progress, a constant wave-1 budget anchor,
mini-bosses gated to stage ≥ 4, flat leak damage (campaign `dmgGrowth: 0`), and `recommendedPower`
redefined as `hpMult × biome-toughness ratchet × variant` so time-to-kill at ×1.0 is
stage-invariant by construction. Mortars now LEAD their shots (predictive aim — the "tracking
feels slow" half of the report), which required a deliberate golden re-pin (biomass-only drift).
The one thing to know: the contract is calibrated **empirically** — re-run the scratchpad
autopilot probe (stages 1–24 × ratios 0.75/1.0/1.25/1.7 of recommendedPower) after ANY change to
campaign scaling, wave composition, enemy stats, or tower balance (see DIFFICULTY.md §contract).

## Files modified

- Source (4): `src/core/ability.ts`, `src/core/biomes.ts`, `src/core/campaign.ts`, `src/core/game.ts`
- Tests (2): `src/core/golden.test.ts`, `src/dev/progressionSim.test.ts`
- Docs (6): `docs/BIOMES.md`, `docs/BUGFIX-LOG.md`, `docs/CAMPAIGN.md`, `docs/DIFFICULTY.md`, `docs/GAME-STATE.md`, `docs/VALIDATION_REPORT.md`

## Systems affected (from the dependency registry)

- **biomes** — `src/core/biomes.ts`
- **campaign** — `src/core/campaign.ts`
- **engine** — `src/core/ability.ts`, `src/core/game.ts`
- Consumer ring (verify, unchanged): bosses, gene-cards, heroes, infinite, loot, onboarding, prestige, rendering, run-ui, towers

## Power Score changes

The Power SCALE is untouched (meta.powerScore unchanged); what moved is the campaign's
**recommendedPower index** it is compared against: now `hpMult(1.05^s) × biome ratchet ×
variant` (was `√(hp×dmg)` growth). Displayed recommended scores rise at biome-region borders
(e.g. stage 12: 1710 → 2087; stage 24: 3072 → 3747). `progressionLoop.test.ts` pins the
strictly-rising invariant; the ratchet keeps it monotone across soft regions.

## UI changes

None authored — the same CampaignScreen/HUD surfaces simply display the new recommended scores
and the regenerated stages. Headless smoke (`scratchpad/camp-live.mjs`): campaign deploy → prep →
towers placed → wave cleared at 100/100 integrity, zero page/console errors, screenshot verified.

## Documentation changes

- `docs/CAMPAIGN.md` — §3/§4/§5 formulas rewritten to the new model; new **§grace** (5b) table.
- `docs/DIFFICULTY.md` — new **§contract** (the ratio table, how it holds, probe protocol).
- `docs/BIOMES.md` — `difficulty` modifier row (authored toughness, ratcheted into the index).
- `docs/BUGFIX-LOG.md` — row 11 (symptom → root cause → fix for the stage-1 wall).
- `docs/GAME-STATE.md` — difficulty-contract line under Modes & progression.
- Others in the registry ring: no change needed (endless scaling, towers, heroes untouched).

## Save changes

None — save layer untouched.

## Known edge cases

- `golden.test.ts` was **deliberately re-pinned** (mortar lead): wave/kills/integrity/phase
  identical on all 6 seeds, biomass ±~1%. Any FURTHER drift is unintended.
- The lead only engages for non-homing shots with a live target (`ability.ts` now passes the
  target through for 'splash'); splash flight stays positional — nothing on that path reads
  `targetId` (mortarImpact even reports `targetId: -1`).
- Elite groups: exploders never roll elite; elite frequency is 0 at wave 1 (ramp `t/0.35`).
- Mini-bosses never spawn before stage 4 (`C.mbMinStage`) — a wave-3 summoner vs a 2-tower
  opening build was an unanswerable wipe (probe finding, stage 1 seed 33).
- `unlockStage` tiers by **effectiveHp** (hp + 12·regen + 6·armor + shield), so regen/armor
  bruisers (knitter/revenant/apex) arrive stages later than their raw HP suggests.

## Remaining technical debt

- The calibration instrument (`scratchpad/stage1probe.ts` + `stage5diag.ts`) lives in the
  session scratchpad — it should graduate into `src/dev/` as a maintained probe next time it's
  needed (it re-derives the autopilot each session otherwise).
- The probe autopilot is a fixed-strategy player (no ability casts, draft[0] picks, no meta
  slots/integrity at high ratios) — deep-stage ×0.75 reads easier than a real stalled account's
  experience; don't over-tune deep stages against it.
- `C.budgetCap`/`C.stageBudgetGrowth` are live tuning seams currently at identity (growth 0).

## Recommended next tasks

1. Graduate the difficulty probe into `src/dev/difficultyProbe.ts` with a thin CLI
   (`npm run probe -- --stage 8`), sharing the autopilot with `progressionSim`.
2. Watch real-play feedback on mid-band ×1.0 chip (stages 8–16 average ~20–35 integrity) —
   if it still reads harsh, the next lever is `C.dmgCapRamp` (slower heavy-leaker entry), not
   budgets.
3. Consider surfacing the biome ratchet on the campaign map (a "region toughness" chip at
   region borders) — the data is already in `BIOMES[i].mods.difficulty`.

## Future expansion hooks

- `BiomeModifiers.difficulty` (`src/core/biomes.ts`) — authored per-region toughness; new
  biomes declare it and `recommendedPower` folds it in automatically.
- `threatCost` / `effectiveHp` (`src/core/campaign.ts`) — the single place unit threat is
  priced; new enemy traits (e.g. teleport) get a term here, not a special case in composition.
- `C.unitCap*/dmgCap*` (`src/core/campaign.ts`) — the per-wave granularity ramp; tune these to
  reshape how fast heavies/leak-punishers enter a stage.
- `stageStartAid` / `budgetGrace` / `paceGrace` (`src/core/campaign.ts`) — the §grace window,
  all constants in `C`.
