# SIPHON.md — the Marrow Siphon (Deep-Strain tower) + the Deep-Strain gate

Compressed system summary (CLAUDE.md "compressed system summaries"). The Marrow Siphon is the
account's **tenth tower** and the **second `firing: 'beam'` tower** (alongside the Resonance Coil),
plus a seven-card **Deep-Strain gene set**, all locked behind a single Campaign milestone. It shares
the Coil's beam DELIVERY + the shared `towerAttackMods` fold, but is the Coil's **OPPOSITE** in role.
The Coil is a single-target FOCUS melter (hold the toughest, heat ramps on holding, **hard-resets** on
a switch — a boss deleter). The Siphon is a **Vital multi-tether HARVESTER**: it finishes the WOUNDED
(`lowestHealth`), spreads a **drain WEB** across several targets at once, gorges on **VOLUME** (feeding
throughput + kills, not focus — the Gorge never hard-resets), and siphons the swarm into **Biomass**.
Bespoke `game.beamSystem`, routed by kind in `towerSystem`; the Coil uses `beamTowerSystem`.

## The gate (`DEEP_STRAIN_STAGE = 15`, config.ts)

One milestone — clearing **Campaign Stage 15** — opens everything:

- The **5 general Deep-Strain gene cards** enter the draft (`deep_overclock`, `marrow_feast`,
  `neural_dominion`, `hollow_bastion`, `apex_ascendant`) + the **2 siphon-identity cards**
  (`gorging_instinct`, `hemophage`). All carry `CardDef.unlock = DEEP_STRAIN_STAGE`.
- The **Marrow Siphon's shards begin dropping** (before the gate its shards are *invisible* to the
  loot pool). The tower is **also shard-locked** (`unlockShards: 200`) — so it is DOUBLE-gated:
  shards can't drop until stage 15, and 200 must then bank to claim it.

**Enforcement seams** (the shared `CardUnlock` framework — cards.ts / meta.ts):
- `CardDef.unlock` is a condition DSL (`campaignStage` / `bestWave` / `towerUnlocked` / lifetime
  feats). The five general cards gate on `{ campaignStage: DEEP_STRAIN_STAGE }`; the two siphon
  identity cards gate on `{ towerUnlocked: 'siphon' }`. `draftCards(rng, n, wave, allowedTowers,
  unlockedCardIds)` drops any gated card NOT in `unlockedCardIds`; **omitted (autoplay, tests)
  excludes every gated card ⇒ the golden draft is byte-identical.** GameView passes
  `meta.unlockedCardIds()` = `unlockedCardIds(save)` (evaluates `cardUnlocked` per card).
- `TowerDef.unlockStage` + `towerShardPool(save)` (state/meta.ts, via `towerShardGateMet`) filter the
  tower-shard loot pool. Threaded into `rollChest`/`rollLoot`/`rollOne`/`openLootBoxes` as an optional
  `towerPool` (defaults to `TOWER_ORDER`). Every shard faucet is gated: container cracks
  (`openContainer`), the tutorial reward, and the premium `towerShardsAll` grant. (`debug*` helpers
  are ungated by design.) `isDeepStrainUnlocked(save)` is a convenience derive helper.

## The mechanic — a continuous drain beam (`game.beamSystem`)

Dispatched from `towerSystem`: the `firing === 'beam'` branch computes the shared `towerAttackMods`
(dmg/rate) once, then routes by kind — `siphon` → `beamSystem`, else (`coil`) → `beamTowerSystem`.
Unlike every other tower it fires **no discrete shots**:

- **Lock (a WEB, not a lock)**: picks its targets by profile (base `lowestHealth` — it finishes the
  wounded), draining `SIPHON.baseForks` (2) at once + any `extraProjectiles` forks (stars/branches).
  Same emergency-focus + deadzone path; the primary tether drives the main-ray visual.
- **Gorge = gluttony** (`Tower.beamHeat`, 0..1): NOT the Coil's focus-heat. It builds from total
  FEEDING — drain throughput (`× SIPHON.gorgeThroughputPerSec`, a floor so a lone drain still ramps)
  **plus** a per-kill bonus (`× SIPHON.gorgePerKill`), all scaled by `siphonRampMult` — and bleeds off
  SLOWLY (`gorgeDecayPerSec`). Target-agnostic: switching prey never resets it, so it rewards feeding a
  kill-rich lane. Multiplies drain up to `×(1 + SIPHON.gorgeMaxBonus)`.
- **Continuous drain**: `applyDamage(target, dps·dt, 'siphon', false)` every tick across all tethers
  (forks at `forkDamageFrac`). Kills reap through the normal `deathSystem` (bounty, mastery credit).
- **Siphon economy** (the Vital identity): a fraction of damage (`SIPHON.drainFrac ×
  siphonDrainMult`) banks in `Tower.beamBank` and pays into biomass on the `fireInterval` pulse.
- Star/branch **granted abilities** (auras/debuffs/heals) pulse on that same cadence — so upgrade
  paths reuse the shared grant vocabulary with **zero bespoke plumbing**.

## Upgrade paths (fully wired)

- **Stars** (`stars.ts` `SIPHON_PATH`): ★1 targeting (`lowestHealth` — finish the weakest) → ★2 fork →
  ★3 fork (Corroder/Render) → ★4 drain field → ★5 fork (Devourer/Leech) → ★7 Corrosion flood → ★9 capstone nova.
- **Branches** (`branches.ts`): `siphon_gorge` (Insatiable Gorge — the gorge/offense line: damage/rate +
  drain-field auras + nova, still finishing the wounded) and `siphon_well` (Bloodwell — wide forks +
  Nucleus heal + economy). `BRANCH_COSTS.siphon`.
- **Adaptation** (`adaptation.ts` `TOWER_THEMES.siphon`), **star-visual** (`starEvolution.ts`),
  **branch-visual** (`towerEvolution.ts` `BRANCH_EVOLUTION.siphon_*` + `BRANCH_COLOR`), and the
  ocular-pod + beam **renderer** flourish (`renderer.ts` `drawSiphonBeam`).

## Invariants / limits

- Run-mod fields `siphonRampMult` / `siphonDrainMult` default **neutral (×1)** and are Power-scored
  (`power.ts`) + subject-mapped to `siphon` (`cards.ts` FIELD_SUBJECT).
- Render-only `Tower.beam*` fields are absent on every non-siphon tower ⇒ golden byte-identical.
- Fixed-step sim (`SIM_DT`) keeps the dt-scaled drain deterministic.
- Tunables live in one place: `config.SIPHON`.
