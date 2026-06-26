# PROGRESSION-SYSTEMS.md — Shards · Stars · Mastery · Loot boxes

Implementation companion to the design docs (`PROGRESSION.md`, `ECONOMY.md`,
`LOOTBOX.md`). Covers the four permanent-progression systems added on top of the
vertical slice, **how they stay deterministic**, and where to extend them. Numbers
are placeholder — the architecture is the deliverable.

---

## The four systems at a glance

| System | What | Currency | Where it lives |
|---|---|---|---|
| **Tower Shards** | per-tower currency | `save.towerShards[kind]` | earned from chests |
| **Stars** | capped, shard-bought per-tower buff | spends tower shards | `save.towerStars[kind]`, `meta.buyStar` |
| **Mastery** | **infinite** per-tower buff earned by USE | none (earned) | `save.towerMasteryXp[kind]` |
| **Loot box** | run-end reward chest | grants tower/hero shards | `state/lootbox.ts`, `meta.finishRun` |

All tunables: `STAR`, `MASTERY`, `CHESTS` in `src/core/config.ts`.

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

## Known reconciliation items (placeholder → content, later)

- **Reactor stars/mastery.** The Reactor is `support` (it never fires), so its
  `damageMult`/`fireRateMult` buffs are inert today and the Tower Lab still labels a
  `+% dmg`. Architecture is correct (per-kind mods exist); the *content* fix is to map
  Reactor progression onto its real levers (biomass / overcharge) via a new `TowerMods`
  field. Tracked, not yet wired.
- **Hero shards** are earned, stored, and shown, but not yet spendable (one hero, no
  hero star/mastery tree yet) — forward-looking per the brief.
- **Milestone rewards** for mastery levels are intentionally not built (architecture
  first); `MasteryDelta.toLevel` already surfaces level-ups for a future milestone hook.
- **Star rewards** are a uniform per-star buff, not per-star unique effects — by design
  for now ("do not implement every star reward yet").
