# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-12 23:09 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 0edce9a

## Summary of work completed

Two shipped arcs. (1) **Mega-boss raid targeting fix** (0fd3d2d): the raid geometry was
authored for a board that doesn't exist — organs/body band recalibrated to the real slot grid
(descent band 560–700, body band 580, validator-enforced), Siphon/Coil beams gained mega legs,
heroes gained `heroMegaRaid` seek duty. (2) **Campaign rescale** (3844852 → 933e80b → 0edce9a):
the Bio-Container meter is DORMANT until the account's first mega kill; the EHP curve is
piecewise (5%/stage 1–8, 20%/stage 9–25, 5% after — recommendedPower still derives from the
same hpMult); mega stages display an honest ×1.8 raid-premium bar; the probe-discovered
**hive-guardian override** (`megaRaidYield`) makes raid duty yield while the Core is
threatened; Boss Rush gate moved 10→9. The one thing to know: **the requirement ladder is now
a sawtooth** (raid spikes on every 10th stage) — `progressionLoop.test.ts` invariant 1 pins
its shape; don't "fix" the post-mega dip.

## Files modified

- Source (1): `src/changelog/releases.gen.ts`
- Tests (0): —
- Docs (2): `docs/BALANCE_REPORT.md`, `docs/HISTORY.md`

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`

## Power Score changes

None — no Power-relevant system touched. (The rescale changes REQUIREMENTS, not Power
income; `recommendedPowerScore` consumers all follow the new curve automatically.)

## UI changes

Surfaces in the blast radius: `App (UpdateBriefing popup)`

The chronicle batch itself is docs-only. Earlier batches this session (already pushed +
smoke-verified live): the LootMeter HUD cell hides while dormant and reveals on the first
mega kill (What's-New row `loot-meter`), and the campaign map shows the premium'd stage-10
bar — verified headless (dormant hidden / awakened present / on-screen bar == derivation).

## Documentation changes

Registry says these move with the touched systems: `docs/CHANGELOG-PIPELINE.md` — no change
needed (pipeline untouched; this batch only banks its generated artifacts). This session also
updated DIFFICULTY (§curve + §contract), MEGA-BOSS (§targeting), LOOTBOX (§meter gate),
ECONOMY_FORMULAS (loot-points dormant clause), MODE-IDENTITY/BOSS-RUSH (gate 9), GAME-STATE,
BUGFIX-LOG (rows 13–14), UNLOCK-TREE + DIL graph regens.

## Save changes

None — save layer untouched. The meter gate reads the EXISTING `megaProgress.slain` ledger
(`hasSlainMega`, save/derive.ts): no schema bump, veterans wake instantly.

## Known edge cases

- The awakening run banks its FULL backlog at settle (`finishRun` accepts
  `result.stats.megaKills` because the sim has no live events) — don't "simplify" that check
  away or the progression simulator locks forever.
- Awakened accounts carry a small megaBosses-codex Boss-Loot bonus, so exact loot-conservation
  tests price it via `collectionEconomyBonuses` (see meta.test `lootIncomeMult`).
- `megaRaidYield` derives in `megaBossSystem` and is only READ under a live mega — keep new
  raid-fire seams consulting it (DIL edge `system:mega-bosses conflictsWith system:engine`).
- The contract probe needs a FAIR pilot (mid-wave building, forward pads); a prep-only pilot
  wipes on mega stages and misleads.

## Remaining technical debt

- Non-mega deep stages just past the band exit run hot (probe: stage 28 ×1.0 lost 1-of-3,
  ~71 integrity) — recorded watch item in DIFFICULTY.md §curve; pre-existing speed/elite
  gradient, revisit with player data.
- The Fresh-persona hour numbers remain frictionless-bot inflated (documented artifact) —
  compare cohorts before/after, never bot-hours to real-hours.

## Recommended next tasks

1. Watch live stage-10 funnel data once players hit the new wall (entry: the flagged
   DIFFICULTY.md §curve watch items; tune `C.megaStagePremium` / `compGrowth` via the §4
   protocol only).
2. Consider a small in-game telegraph for the meter's dormancy (e.g. a sealed-meter teaser
   tooltip) if players ask where loot boxes went — the What's-New row covers the reveal, not
   the absence.
3. The stage-28-band heat check (above) after real data lands.

## Future expansion hooks

- `campaign.ts C.megaStagePremium` — per-stage-class bar premiums (a future raid variant can
  carry its own factor).
- `game.ts megaRaidYield` — the one flag any future raid-fire seam must consult; extendable
  to hero raid duty if heroes ever raid mid-wave.
- `hpMultFor` (campaign.ts) — additional curve segments are one constant pair away.
