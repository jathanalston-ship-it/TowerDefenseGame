# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-19 16:55 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 0d0ab92

## Summary of work completed

TOWER IDLE POSTURES (docs/TOWER-IDLE.md) — "a tower should never feel asleep." Every
tower now carries a continuous `prep` scalar (0..1) driven by a per-tick engagement
test; the renderer eases ALL idle/combat transition motion from it, and each of the
22 kinds has an identity secondary behavior from 7 data-driven verbs in
`src/core/towerIdle.ts` (banked openers, gestated volleys, Spore Drift ranging shots,
beam preheat, trap/brood tending, biomass/integrity trickle, damage choir).
Long-range towers bank slower for smaller payoffs (anti-range-meta corrective, no
range nerfs). The one thing the next session must know: **`RunOptions.disableIdle`
reproduces the pre-idle sim byte-exactly** (pinned by golden.test.ts GOLDEN_LEGACY);
the live GOLDEN block was deliberately re-pinned (wave/kills/won identical on all six
seeds, integrity only improved or held). Measured via the new `npm run sim:idle`:
Σintegrity 725 vs 701 legacy, short-range damage share held/rose, mortar share flat.

## Files modified

- Source (16): `src/audio/sound.ts`, `src/changelog/releases.gen.ts`, `src/core/cards.ts`, `src/core/config.ts`, `src/core/effectLanguage.ts`, `src/core/game.ts`, `src/core/sim.testutil.ts`, `src/core/types.ts`, `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`, `src/index.css`, `src/render/renderer.ts`, `src/render/towerEvolution.ts`, `src/ui/Inspector.tsx`, `src/ui/TowerCodex.tsx`, `src/core/towerIdle.ts`
- Tests (8): `src/core/expansion.test.ts`, `src/core/finaldefense.test.ts`, `src/core/golden.test.ts`, `src/core/sower.test.ts`, `src/core/strainVerbs.test.ts`, `src/core/strains.test.ts`, `src/render/towerEvolution.test.ts`, `src/core/towerIdle.test.ts`
- Docs (8): `docs/COGLOAD_REPORT.md`, `docs/DEPENDENCY_GRAPH.md`, `docs/DIL_GRAPH.md`, `docs/GAME-STATE.md`, `docs/HISTORY.md`, `docs/TOWERS.md`, `docs/VALIDATION_REPORT.md`, `docs/TOWER-IDLE.md`
- Also: `package.json` (`sim:idle` script), `scripts/sim-tower-idle.ts` (balance instrument)

## Systems affected (from the dependency registry)

- **audio** — `src/audio/sound.ts`
- **chronicle** — `src/changelog/releases.gen.ts`
- **content-infra** — `src/core/config.ts`, `src/core/types.ts`
- **dev-registry** — `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`
- **engine** — `src/core/game.ts`, `src/core/sim.testutil.ts`
- **gene-cards** — `src/core/cards.ts`, `src/core/effectLanguage.ts`
- **rendering** — `src/render/renderer.ts`, `src/render/towerEvolution.ts`
- **run-ui** — `src/ui/Inspector.tsx`
- **towers** — `src/ui/TowerCodex.tsx`, `src/core/towerIdle.ts`
- Consumer ring (verify, unchanged): arena, biomes, boss-rush, bosses, campaign, collection, contracts, currencies, cutscenes, daily, difficulty, doctrines, equipment, evolution-hq, hero-cinematics, hero-symbiotes, heroes, infinite, living-battlefield, loot, mastery, mega-bosses, meta-store, mulligans, nemesis, nucleus, onboarding, online-foundation, pil, power, premium, website

## Power Score changes

None. Idle postures are in-run flavor of towers the account already owns — account
Power stands still by design (docs/TOWER-IDLE.md §7); the untouched power suite pins
it. The only new modifier channel is `RunModifiers.towerIdleChargeMult` (default 1,
registered in effectLanguage FIELD_VOCAB) — a run-scoped hook for future cards/gear,
not an account-power source.

## UI changes

Surfaces in the blast radius: `MusicDebug (Settings dev console)`, `(audible)`, `App (UpdateBriefing popup)`, `GameView`, `Hud`, `Toolbar`, `BuildControls`, `Inspector`, `BuildPanel`, `GeneArchive`, `DraftModal`, `gene splash`, `the battlefield itself`, `Results`, `ALL`, `TowerLab`, `TowerCodex`, `StarCeremony`, `tower rail`

- **Battlefield (renderer)**: posture breathing (period/amplitude ride `prep`), a
  filling preparation ring + ready halo on banking towers, work-motes on giving
  verbs, choir filaments between the Ossuary and its beneficiaries. No layout change.
- **Inspector**: new `mut-idle` state chip (COMBAT/TRANSITION/PREPARATION + behavior
  name, blurb tooltip) + a behavior line in Host vitals; outside the wave phase the
  chip reads PREPARATION to match the renderer's build-phase treatment.
- **TowerCodex**: `.codex-idle` identity line (behavior name + blurb) per tower.
- **Audio**: `tprep_ready` quiet cue when a bank fills (once per idle cycle).
- Headless coverage: live probe (scratchpad probe-idle.ts) entered a real run,
  confirmed chip PREPARATION during build → COMBAT on engagement → back to
  PREPARATION post-wave, zero pageerrors; mobilecheck CLEAN, cogload budgets hold.

## Documentation changes

- Updated this batch: `docs/TOWER-IDLE.md` (NEW — canonical; incl. §9 measured
  balance findings), `docs/TOWERS.md` (idle-postures pointer), `docs/GAME-STATE.md`
  (towers row + IDLE POSTURES summary), `docs/DEPENDENCY_GRAPH.md` +
  `docs/DIL_GRAPH.md` (regen), `docs/HISTORY.md` (Chronicle), `docs/VALIDATION_REPORT.md`,
  `docs/COGLOAD_REPORT.md`.
- The wider registry list above: no change needed — no save format, no Power scale,
  no mode/economy behavior moved; tower-facing docs point at TOWER-IDLE.md via
  TOWERS.md rather than duplicating it.

## Save changes

None — save layer untouched. Tower idle fields (`prep`, `idleCharge`, `idleCd`,
`choirDmg`) are run-temporary on the Tower entity, never persisted; CURRENT_VERSION
stays 53.

## Known edge cases

- **Field/aura towers no longer pulse empty air**: the engagement test gates casts on
  a living enemy in reach outside the deadzone. Deliberate (documented in
  TOWER-IDLE.md §1) — but any future test that counts aura ticks on an empty board
  will read 0; use `{ disableIdle: true }` for legacy choreography.
- **Mechanism suites pin their own choreography with `disableIdle: true`**
  (strainVerbs, strains, sower, finaldefense, expansion — rationale comments at each
  site). New mechanism tests should follow that pattern; the composed whole is pinned
  by the goldens and towerIdle.test.ts.
- **Mortar cannot use the 'ranging' verb** (its 960 range covers the lane; its only
  idle moments have no legal ranging target either) — that's why parasite owns Spore
  Drift and mortar is windup. Don't "fix" mortar back to ranging.
- **Ossuary choir decays one tick between grants** — steady-state receiver `choirDmg`
  sits just under the configured bonus (towerIdle.test.ts asserts the band, not
  equality).
- **The Inspector chip is phase-aware**: outside `phase === 'wave'` it reports
  PREPARATION regardless of the scalar (matches the renderer's build-phase
  treatment). Tests asserting `idleState` mid-build must expect 'preparation'.

## Remaining technical debt

- The sim:idle instrument's slot-order placement leaves maw with 0 engagements on
  the mixed board (placement artifact, identical in both A/B arms — the verdict is
  unaffected). A follow-up could place per-kind boards for per-verb uptime curves.
- `TOWER_IDLE` naming: plain `IDLE` in config.ts belongs to the Idle Harvest system —
  the doc calls this out, but the near-collision remains a trap for grep-driven edits.

## Recommended next tasks

1. **Gene cards/equipment that ride the new hook** — author cards multiplying
   `towerIdleChargeMult` (entry: `src/core/cards.ts` catalog + effectLanguage
   keyword 'idle preparation speed' already registered).
2. **Per-verb achievement/statistics surfacing** — run counters exist on Game
   (`idleOpeners`, `idleRangingShots`, `idleBiomass`, `idleMended`); wire into
   Results and the achievements registry (entry: `src/core/achievements.ts`,
   `src/ui/Results.tsx`).
3. **Arena/PvP parity check** — basilisk/ossuary rows exist and validate, but no
   arena-side balance measurement was run (entry: `scripts/sim-arena-*` harnesses).

## Future expansion hooks

- `src/core/towerIdle.ts` — `IdleBehaviorDef` rows are the single tuning surface;
  `towerIdleProblems()` bounds any new row (add a verb by extending `TowerIdleVerb`
  + one accrual case in `game.towerIdlePosture`).
- `src/core/cards.ts` — `RunModifiers.towerIdleChargeMult` (default 1) is the
  card/equipment/strain seam; folded at every `chargeTime` read.
- `src/core/game.ts` — `RunOptions.disableIdle` (dev/instrument only) is the
  permanent legacy A/B seam for balance instruments.
- `src/core/types.ts` — `SelectedPlacedTower.idleState/idleName/idleBlurb` feed any
  future tooltip/HUD surface without new sim reads.
