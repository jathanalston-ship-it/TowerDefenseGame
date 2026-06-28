# SLOTS.md — Tower-Slot Progression

How the player's set of buildable tower emplacements grows — permanently (across
runs, via Shards) and temporarily (within a run, via a Gene Card) — and how that
plugs into the wider progression model (`PROGRESSION.md`).

> **Status:** shipped. Geometry lives in `src/core/map.ts` (`buildSlots`); the
> tunable ceilings live in `src/core/config.ts` (`SLOTS`). Numbers are tuning
> clay; the **structure** (two buckets + a capped getter) is the durable part.

---

## 1. The board: 27 symmetric, centre-out emplacements

The defensive region holds **exactly 27** tower slots — a 9-wide × 3-deep
lattice. Two invariants make the layout fair and the progression legible:

- **Symmetry.** The nine columns (`x = 40,120,…,680`) are mirror-symmetric about
  the **Hive Core** (`x = 360`): four left, a centre, four right. No side is
  favoured. (The earlier lattice was symmetric about `x = 380`, leaving 4 left /
  5 right of the core — the "favours the right" bug this rework fixed.)
- **Centre-out unlock order.** `slot.index` is *unlock priority*. Slots are
  emitted nearest-the-core first, then outward in **mirror pairs** (bottom row
  first). So **any** available-count is left-right balanced — unlocking the
  next slot always adds the most central one still locked, keeping the live
  board symmetric whatever granted it.

Index → tier mapping (priority order):

| Indices | Columns (from core) | Tier | Source |
|---|---|---|---|
| `0–14` | centre 5 (`±0,±80,±160`) | **Initial** (15) | free at run start |
| `15–20` | next ring (`±240`) | **Permanent** (→21) | Shard upgrade |
| `21–26` | outer edges (`±320`) | **Temporary** (→27) | Gene Card |

The split is a *capacity* story, not a positional reservation: a temporary
unlock still fills the lowest free index (most central), so the visible board
never develops a lopsided gap.

---

## 2. The two buckets

Slot count is the sum of two independent, separately-capped sources — the same
permanent-vs-run split the rest of progression uses (`PROGRESSION-PHILOSOPHY.md`).

### Permanent — Hive Emplacements (Shards, persists forever)

- A capped **meta upgrade** (`META_UPGRADES` id `emplacements`): `maxLevel = 6`,
  `baseCost 40`, `costMult 1.6` — **cost climbs with every purchase**.
- Each level folds `+1` into `MetaModifiers.bonusSlots` (the generic
  `metaModifiers()` reducer — no special-case code).
- Persists in the saved upgrade ladder (`save.upgrades.emplacements`), so it is
  bought once and kept forever. Surfaces in the **MetaShop** automatically (that
  UI maps over `META_UPGRADES`).
- Raises the **run-start** count from `SLOTS.initialUnlocked` (15) toward
  `SLOTS.permanentMax` (21).

### Temporary — Reclaimed Node (Gene Card, run-only)

- A **`CardDef`** in `CARD_POOL` (id `reclaimed_node`) whose single declarative
  effect is `{ op: 'add', field: 'bonusTowerSlots', value: 1 }`.
- Drafted between waves; folds into `RunModifiers.bonusTowerSlots`, which **resets
  every run** (the R bucket is never persisted). Appears in the draft
  automatically (drafts sample the card registry).
- Adds up to `SLOTS.tempMax` (6) more slots **for the current run only**.

---

## 3. The arithmetic (one place)

`Game.unlockedSlots` is a **getter**, so it always reflects live card draws:

```ts
permanentSlots = min(SLOTS.permanentMax, SLOTS.initialUnlocked + meta.bonusSlots) // frozen at construction
get unlockedSlots = min(towerSlots.length,
                        permanentSlots + min(SLOTS.tempMax, mods.bonusTowerSlots))
```

- `permanentSlots` is computed once in the constructor from saved meta.
- The temporary term is re-clamped on every read, so drafting a Reclaimed Node
  mid-run raises the count immediately.
- `permanentMax (21) + tempMax (6) === towerSlots.length (27)`, so the outer
  `min(27, …)` is a guard, not a real ceiling — the buckets already sum to 27.
- `placeTower` gates on `slot.index >= unlockedSlots`; the renderer draws any
  slot at or past that index as **locked**. Both read the single getter.

A fresh run with no meta and no cards has `bonusSlots = 0` and
`bonusTowerSlots = 0` → exactly 15 slots — the golden-safe neutral.

---

## 4. Future-proofing (additional slot mechanics)

New slot sources plug into a bucket — **never** the gate or the geometry:

- **Permanent source** (e.g. a prestige perk, an achievement reward): fold `+n`
  into `MetaModifiers.bonusSlots`. Capped at `permanentMax` by the constructor.
- **Temporary source** (e.g. an in-run event, a boss drop, a relic): add to
  `RunModifiers.bonusTowerSlots`, or call `Game.unlockSlots(n)` — the public hook
  that bumps that bucket. Capped at `tempMax` by the getter.
- **More physical slots:** widen `buildSlots` (keep the column list symmetric
  about `x = 360` and emit centre-out) and raise `SLOTS.permanentMax` /
  `SLOTS.tempMax` so they still sum to the new total.

Because every consumer reads the `unlockedSlots` getter, no call site changes
when a new source is added — you touch a bucket and a cap, nothing else.

---

## 5. Known limitations / tuning notes

- **Reclaimed Node rarity/weight** (`rare`) and the **emplacement cost curve**
  are starting points; they belong to balance, not structure, and can be retuned
  in `config.ts` without touching the wiring.
- **No numeric HUD counter** for "X / 27 slots" — the locked/unlocked slot
  rendering is the current feedback. A counter is an easy future add (read the
  snapshot's `unlockedSlots`).
- The 21/6 capacity split is deliberate (permanent should out-weigh run-only).
  Re-balancing it is a one-line `SLOTS` edit, provided the two still sum to the
  physical slot count.
