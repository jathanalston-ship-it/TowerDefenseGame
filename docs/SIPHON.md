# SIPHON.md — the Marrow Siphon (Deep-Strain tower) + the Deep-Strain gate

Compressed system summary (CLAUDE.md "compressed system summaries"). The Marrow Siphon is the
account's **ninth tower** and its **first genuinely new delivery mode** (`firing: 'beam'`), plus a
seven-card **Deep-Strain gene set**, all locked behind a single Campaign milestone.

## The gate (`DEEP_STRAIN_STAGE = 15`, config.ts)

One milestone — clearing **Campaign Stage 15** — opens everything:

- The **5 general Deep-Strain gene cards** enter the draft (`deep_overclock`, `marrow_feast`,
  `neural_dominion`, `hollow_bastion`, `apex_ascendant`) + the **2 siphon-identity cards**
  (`gorging_instinct`, `hemophage`). All carry `CardDef.unlock = DEEP_STRAIN_STAGE`.
- The **Marrow Siphon's shards begin dropping** (before the gate its shards are *invisible* to the
  loot pool). The tower is **also shard-locked** (`unlockShards: 200`) — so it is DOUBLE-gated:
  shards can't drop until stage 15, and 200 must then bank to claim it.

**Enforcement seams:**
- `draftCards(rng, n, wave, allowedTowers, progressStage)` drops any card whose `unlock >
  progressStage`. `progressStage` is threaded RunOptions → Game → draft; **omitted/0 (autoplay,
  tests) excludes every gated card ⇒ the golden draft is byte-identical.** GameView passes
  `highestCampaignStage(save)`.
- `TowerDef.shardGateStage` + `eligibleTowerShardPool(save)` (state/meta.ts) filter the tower-shard
  loot pool. Threaded into `rollChest`/`rollLoot`/`rollOne`/`openLootBoxes` as an optional
  `towerPool` (defaults to `TOWER_ORDER`). Every shard faucet is gated: container cracks
  (`openContainer`), the tutorial reward, and the premium `towerShardsAll` grant. (`debug*` helpers
  are ungated by design.) `isDeepStrainUnlocked(save)` is the derive helper.

## The mechanic — a continuous drain beam (`game.beamSystem`)

Dispatched from `towerSystem` (`if (def.firing === 'beam') { this.beamSystem(...); continue; }`).
Unlike every other tower it fires **no discrete shots**:

- **Lock**: picks ONE target by its targeting profile (base `highestHealth`), plus `forks` extra
  targets from `extraProjectiles` (stars/branches). Uses the same emergency-focus + deadzone path.
- **Gorge ramp** (`Tower.beamHeat`, 0..1): builds while HELD on the same target
  (`SIPHON.gorgeRampPerSec × siphonRampMult × rateMult`), decays on switch/no-target. Multiplies
  beam damage up to `×(1 + SIPHON.gorgeMaxBonus)` — the anti-boss identity: commitment = melt.
- **Continuous drain**: `applyDamage(target, dps·dt, 'siphon', false)` every tick (forks at
  `forkDamageFrac`). Kills reap through the normal `deathSystem` (bounty, mastery credit).
- **Siphon economy** (the Vital identity): a fraction of damage (`SIPHON.drainFrac ×
  siphonDrainMult`) banks in `Tower.beamBank` and pays into biomass on the `fireInterval` pulse.
- Star/branch **granted abilities** (auras/debuffs/heals) pulse on that same cadence — so upgrade
  paths reuse the shared grant vocabulary with **zero bespoke plumbing**.

## Upgrade paths (fully wired)

- **Stars** (`stars.ts` `SIPHON_PATH`): ★1 targeting → ★2 fork → ★3 fork (Corroder/Render) → ★4
  drain field → ★5 fork (Devourer/Leech) → ★7 Corrosion flood → ★9 capstone nova.
- **Branches** (`branches.ts`): `siphon_gorge` (Insatiable Gorge — single-target melter, damage/rate
  + auras + nova) and `siphon_well` (Bloodwell — wide forks + Nucleus heal + economy). `BRANCH_COSTS.siphon`.
- **Adaptation** (`adaptation.ts` `TOWER_THEMES.siphon`), **star-visual** (`starEvolution.ts`),
  **branch-visual** (`towerEvolution.ts` `BRANCH_EVOLUTION.siphon_*` + `BRANCH_COLOR`), and the
  ocular-pod + beam **renderer** flourish (`renderer.ts` `drawSiphonBeam`).

## Invariants / limits

- Run-mod fields `siphonRampMult` / `siphonDrainMult` default **neutral (×1)** and are Power-scored
  (`power.ts`) + subject-mapped to `siphon` (`cards.ts` FIELD_SUBJECT).
- Render-only `Tower.beam*` fields are absent on every non-siphon tower ⇒ golden byte-identical.
- Fixed-step sim (`SIM_DT`) keeps the dt-scaled drain deterministic.
- Tunables live in one place: `config.SIPHON`.
