# Power Score — the universal strength index

Power Score is ASSIMILATE's single, always-visible measure of account strength. It exists to
answer one question at a glance, everywhere: **did that make me stronger?** Every permanent and
temporary upgrade folds into it, so the player never has to reason about whether a Star, an item,
or a gene card mattered — the number moves.

It is a **feedback and balancing index, not the literal sim damage number.** Its defining
invariant is monotonicity: _any_ upgrade strictly raises it.

Implementation: `src/core/power.ts` (pure) + `meta.power()` / `meta.powerWith()` (state).

---

## Formula

```
PowerScore = round( POWER_BASE × meta × towers × heroes × equipment × temporary )
POWER_BASE = 1000        # a fresh account (all multipliers = 1) reads exactly 1000
```

Each factor is a multiplier ≥ 1 on a fresh account. The composition is **multiplicative** on
purpose:

- **Every system scales every other.** A Star is worth more Power when your meta bucket is high,
  which mirrors how the systems actually compound in a run.
- **Any single increase strictly raises the total** (the core invariant) — never a wash.

A fresh account reads `1000`; a typical single upgrade moves it by a readable handful of points
(e.g. `1284 → 1297 (+13)`), which is why the base is 1000 rather than 1.

### Contributors (every listed system maps to exactly one bucket)

| Bucket | Contains | Source |
|---|---|---|
| `meta` | Permanent meta upgrades **and Prestige** (the compounding P bucket + Ascendant Tree) | `metaModifiers(save).towerDamageMult` |
| `towers` | Tower **Stars** + Tower **Mastery**, geomean-averaged across the roster | `towerProgress(save)` |
| `heroes` | Hero **Stars** + Hero **Mastery**, geomean-averaged across the roster | `heroProgress(save)` |
| `equipment` | The equipped loadout: offense effects × each piece's rarity/affix index | `equipmentPower(save)` |
| `temporary` | In-run buffs: **Gene Cards** + **Tower Branch** upgrades (1 outside a run) | `meta.powerWith(effects)` |

**Future systems** attach by adding their multiplier to the relevant bucket (or a new one) — no
call site changes, because everything downstream reads the composed score.

### The `effectsPower` bridge

Equipment loadouts and gene cards are both `CardEffect[]`. `effectsPower(effects)` folds either
into one offense multiplier, so temporary and permanent gear count on the **same footing**:

- `mul` on an offense field compounds, **weighted**: raw offense (`towerDamageMult`,
  `heroDamageMult`, `towerFireRateMult`) counts fully; economy (`biomassMult`) at 0.3; everything
  else (utility, flags, instants) contributes **0** — it does not move Power.
- `add` on a designated offense field bumps (e.g. `+1` extra projectile ≈ +8%).

`itemRarityPower(rarity, affixCount)` adds a small flat index per equipped piece (rarity 1..5 →
+3%..+15%, +1% per affix) so even a pure-utility item reads as a gain when equipped.

Roster buckets use the **geometric mean** so one maxed tower/hero can't dominate the index.

---

## Display contract

Power Score is a primary feedback system, so:

- **Always visible** on the Main Menu, HUD, Profile, Run Summary, the Tower / Hero / Equipment
  screens, Gene Draft, loot summaries, upgrade screens, and both Campaign & Infinite.
- **Updates live** and **animates on change**: positive changes pulse (green); negative changes
  animate differently (red, a downward tick) so a loss never looks like a gain.
- **Upgrade previews show the delta.** Any actionable upgrade renders `current → new (+diff)` so
  the player knows _before_ committing whether it improves them.

UI primitives: `PowerBadge` (animated value) and `PowerDelta` (`current → new (+diff)`).

---

## Balancing role

Power Score is a first-class **balancing input**, not just a display. Systems that may reference it:

- **Progression-aware loot** — drop-quality windows, catch-up, and pity keyed off account
  strength (see `docs/LOOT-PROGRESSION.md`).
- **Enemy scaling / recommendation** — "recommended power" per campaign stage compares against
  the account damage multiple (`meta.powerScore().score`, the `meta × towers × heroes` sub-index),
  while the universal integer index (`meta.power().score`) is the player-facing feedback number.
- **Future**: loot quality, matchmaking-style recommendations, and pity systems.

---

## Assumptions & limitations

- **Index, not sim truth.** Power Score is a monotonic, comparable index. It intentionally does
  **not** equal a run's exact damage output — statuses, reactions, targeting, and positioning are
  out of scope. It answers "stronger or not," reliably and cheaply.
- **Two related numbers.** `meta.power().score` is the universal integer (folds equipment +
  temporary). `meta.powerScore().score` is the narrower account **damage multiple** (meta × towers
  × heroes) retained for recommended-power readiness checks, which were calibrated against it.
  Unifying readiness onto the universal index is a safe future step.
- **Weights are tunable.** `FIELD_WEIGHT`, `ADD_POWER`, `itemRarityPower`, and `POWER_BASE` are
  the levers; changing them re-scales the index without touching any consumer.
