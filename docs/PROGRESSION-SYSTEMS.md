# PROGRESSION-SYSTEMS.md — Shards · Stars · Mastery · Loot boxes

Implementation companion to the design docs (`PROGRESSION.md`, `ECONOMY.md`,
`LOOTBOX.md`). Covers the four permanent-progression systems added on top of the
vertical slice, **how they stay deterministic**, and where to extend them. Numbers
are placeholder — the architecture is the deliverable.

> **Design lens (read before extending progression):** `PROGRESSION-PHILOSOPHY.md`
> assigns each progression layer a distinct player motivation. The redesigns it called for
> have **shipped** and supersede the stat-multiplier shapes below:
> - **Stars → evolution** (`core/stars.ts`): each star grants a capability (targeting /
>   projectile mutators / new attacks / forks), resolved into the per-tower run kit. The
>   incidental stat in `config.STAR` is now secondary. See `TOWER-STARS.md`.
> - **Mastery → identity** (`core/mastery.ts`): titles, lore, procedural ranks, in-game
>   visual halos, and sparse mechanic milestone perks — the log stat hum stays minor. See
>   `MASTERY.md`.
> - **Equipment → playstyle** (`EQUIPMENT-PHILOSOPHY.md`): the unified `grant`/`set`/`hook`
>   effect language (`cards.ts`) lets gear change attacks, hero AI, and run rules.
> - **Prestige (MOLT)** (`core/prestige.ts` + `core/ascendant.ts`): the P bucket — Ascendant
>   Cells (sqrt mint → log global ×) + a spendable Ascendant Tree. See `PROGRESSION-PHILOSOPHY §2.8`.
> - **Power Score** (`meta.powerScore()`): one account-power index over all permanent buckets.
>
> All are golden-safe (a fresh account resolves to identity). The per-system notes below
> describe the original currencies/curves, which still underpin the redesigned systems.

---

## The four systems at a glance

| System | What | Currency | Where it lives |
|---|---|---|---|
| **Tower Shards** | per-tower currency | `save.towerShards[kind]` | earned from chests |
| **Stars** | capped, shard-bought per-tower buff | spends tower shards | `save.towerStars[kind]`, `meta.buyStar` |
| **Mastery** | **infinite** per-tower buff earned by USE | none (earned) | `save.towerMasteryXp[kind]` |
| **Loot box** | run-end reward chest | grants tower/hero shards | `state/lootbox.ts`, `meta.finishRun` |
| **Loot queue** | pre-determined boxes filled by run progress | grants tower/hero shards | `core/loot.ts` + `core/lootQueue.ts`, `save.lootQueue` |

All tunables: `STAR`, `MASTERY`, `CHESTS` in `src/core/config.ts`; loot rarities (weights /
costs / reward tables / pity) + `LOOT_EARN` earn rate in `src/core/loot.ts`.

---

## The determinism contract (why golden tests still pass)

The sim is deterministic from `(seed, meta, towerProgress)`. Two rules keep these
systems from ever changing a fixed-seed outcome:

1. **Progression is frozen at run start.** `App` snapshots `meta.towerProgress()`
   (stars + mastery → per-kind `damageMult`/`fireRateMult`) and passes it into the
   `Game` constructor. It never changes mid-run. For a **fresh save it is identity**
   (`×1`), so the base game — and every golden seed — is byte-identical. The
   constructor arg is optional and defaults to identity, so the test harness
   (`autoplay`) is unaffected.

2. **Mastery accrues by pure observation.** During a run the `Game` counts per-kind
   `kills` / `damage` / `activeTime` (`masteryAccrual`). These counters **never feed
   back into combat** — damage dealt is identical whether or not we tally it. They're
   read out at run end (`getMasteryAccrual`) and banked into permanent XP by
   `meta.finishRun`. Loot uses `Math.random` (a *meta* concern, not the sim).

> Net: `npm test` — all 6 golden seeds unchanged. New unit tests cover the curves
> (`progression.test.ts`) and chest rolls (`lootbox.test.ts`).

---

## Data flow

```
run start:  save ──meta.towerProgress()──▶ TowerProgress ──▶ new Game(seed, meta, progress)
in run:     Game.applyDamage/deathSystem/towerSystem ──▶ masteryAccrual (observation only)
run end:    Game.getMasteryAccrual() ──▶ RunResult.mastery ──▶ meta.finishRun(result)
            └─ banks shards+records, converts usage→mastery XP, opens a chest (one persist)
            └─ returns RunOutcome ──▶ Results.tsx (loot reveal + mastery gains)
```

`towerProgress` is applied in `Game.towerSystem` as two extra multiplies on the
existing `dmgMult`/`rateMult` — dispatch is unchanged.

---

## How to extend

- **A new chest rarity:** add a `ChestDef` to `CHESTS` and point `RUN_CHEST` (or a
  performance-scaled selector) at it. `rollChest` + `LootReveal` already key off the
  def; `chest.chestId` drives styling (`.chest.rarity-<id>`).
- **Tune stars/mastery:** edit `STAR` / `MASTERY` in `config.ts`. The mastery curve
  is geometric (`reqGrowth`) → ever-slower but unbounded; the per-level buff is small
  and uncapped.
- **A new mastery signal:** count it in the `Game` into `masteryAccrual`, add a weight
  to `MASTERY`, fold it in `meta.finishRun`. Keep it observation-only.
- **Star/mastery effects beyond damage/rate:** extend `TowerMods` + `towerProgress`
  and read the field in the relevant system.

---

## Reconciliation items — RESOLVED by the redesigns

These earlier placeholders have since shipped:

- **Reactor stars** — now an **economy** path: a `reactor` star grant carries
  biomass/overcharge multipliers (`core/stars.ts`) the reactor systems read
  (`core/ascendant`-style fold in `game.economySystem` + overcharge). No longer inert.
- **Hero shards** — spendable on hero **Stars** (`meta.buyHeroStar`), and all three heroes
  earn infinite **Mastery** (`HeroLab`).
- **Mastery milestone rewards** — built: titles, lore, procedural ranks, in-game visual
  halos, and sparse **mechanic perks** (`core/mastery.ts`; `meta.finishRun` unlocks them).
- **Star rewards** — now **unique per-star evolution** (targeting / projectile mutators /
  granted attacks / forks), not a uniform buff (`core/stars.ts`, `TOWER-STARS.md`).

Still open: per-star *balance* tuning (numbers are placeholder); a formal bucket resolver
(`PROGRESSION-PHILOSOPHY §3F`); deeper prestige layers (`PROGRESSION.md §5.2`).

---

## Loot queue + rarity framework (compressed summary)

A second loot track layered on the run-end chest: a meter that is **always filling toward a
box whose rarity is already decided**, with the box queued after it also visible — so "the
next loot box is determined before the current meter completes" (LOOTBOX.md anticipation).

**Architecture (two pure core modules + reward roller + save/meta/UI seams):**
- `core/loot.ts` — the rarity framework. Six tiers (`common`…`mythic`) are **data** on a
  `Registry<RarityDef>` (`rarityRegistry`); each def carries `weight`, `cost`, a per-rarity
  `reward` table, optional `eventOnly`, and an optional `pity` ceiling. `rollRarity` sums
  the pool's weights and walks a uniform draw — **no probability is ever hardcoded**. Pity
  is a pure reducer (`updatePity`/`pityRemaining`); a met ceiling forces the due tier.
  `LOOT_EARN` (points/wave, points/kill) and `LOOT_QUEUE_DEPTH` live here.
- `core/lootQueue.ts` — queue mechanics over the framework. `LootQueueState =
  { progress, queue[], pity }`. `addProgress(state, points, rng)` awards every box the
  points cover, slides the pre-rolled next forward, rolls a fresh pity-aware tail, and
  conserves points. `defaultLootQueue()` is **seeded-deterministic** (so `defaultSave()`
  stays comparable); `sanitizeLootQueue()` repairs loaded saves (drops unknown rarities,
  clamps progress, rebuilds pity, re-pads to depth).
- `state/lootbox.ts` — `rollLoot(rarityDef, rng)` rolls a rarity's reward table into the
  same `ChestResult` the chest reveal uses (shares `rollTable` with `rollChest`, so chest
  behavior is byte-identical).

**Public APIs:** `rollRarity`, `lootPool`, `costOf`, `emptyPity`/`updatePity`/`pityRemaining`
(loot.ts); `defaultLootQueue`, `sanitizeLootQueue`, `addProgress` (lootQueue.ts); `rollLoot`
(lootbox.ts); `meta.lootQueue()`, `meta.syncRunLoot(wave, kills)`, `meta.debugAddLootPoints(n)`;
`RunOutcome.loot = { queue, awarded: {rarity, chest}[] }`.

**Seams:** loot banks **LIVE** during a run — the HUD loop calls `meta.syncRunLoot(wave, kills)`
each throttle tick, which banks the delta into `save.lootQueue` (pure progress is in-memory via
`store.set`; a completed box rolls its shards and `persist`s, and is remembered for the reveal).
`meta.finishRun` then banks only the **remainder** (`floor(wave·pointsPerWave + kills·pointsPerKill)
− already-banked`) so nothing double-counts, and reveals the live + final boxes together; it
persists `save.lootQueue` (schema **v4**, additive migration via `sanitizeLootQueue`). `LootMeter`
reads the live `save.lootQueue` directly (front box + progress + pre-determined next). `Results`
animates each awarded box (`LootReveal` takes `title`/`color`).

**Golden-safe:** loot is a **meta** concern using `Math.random`; the sim is untouched
(`game.ts` unchanged — `syncRunLoot` only *reads* the run's `wave`/`kills` from React and never
feeds back into the sim). All 6 golden seeds byte-identical.

**Extend:** a new rarity (incl. event-exclusive) is a `rarityRegistry.register` data edit;
tune odds via `weight`, pacing via `cost`/`LOOT_EARN`, pity via the `pity` ceiling. Enable an
event tier by passing its id to `rollRarity({ events })` / `lootPool(events)`.

**Known limitations:** boxes open at **run end** (meter can read "ready" mid-run), matching
the existing reward model — no mid-run awarding. Pity is wired and tested but tuned to only
catch genuine streaks. No event content ships (framework only, by brief). The full rarity-
scaled reveal *ceremony* (LOOTBOX.md §2–7) is not built — `LootReveal` colors by rarity but
does not yet scale duration/FX per tier.
