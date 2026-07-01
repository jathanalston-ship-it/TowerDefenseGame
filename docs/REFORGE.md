# REFORGE.md — Diablo-style equipment improvement (no recipes)

Replaces ad-hoc "reroll / transmute" with a cohesive **Reforge** system: equipment drops naturally,
and players **improve existing pieces** through targeted operations — never combine recipes. Fully
data-driven; gradual (no giant power spikes). Documented before implementation per the brief.

Built **additively** on the existing equipment system (`equipment.ts` already has the 3 categories —
Weapons, **Armor** (confirmed present), Relics — plus rarities, a tiered affix ladder T1–T6, sets,
and effect resolution). This preserves **save compatibility** (new fields are optional) and
**golden-safety** (gear only folds into a run when EQUIPPED; autoplay uses none).

---

## 1. The item model (each piece)

An `OwnedItem` gains two optional fields; the rest is derived, so old saves load unchanged:

| Property | Source |
|---|---|
| **Base item** | `EquipDef` (the catalog entry: slot, type, base behavior, set, signature) |
| **Rarity** | `common … exotic` (drives the affix-slot count) |
| **Item Level (`ilvl`)** | **new** — set from run depth on drop; caps the affix **tier ceiling** (`maxTierForIlvl`) so power climbs gradually |
| **Power Score** | derived (`itemScore`): rarity weight + Σ affix tiers + ilvl — the one "am I stronger?" number |
| **Primary Affix** | derived — the item's defining (highest-magnitude) affix |
| **Secondary Affixes** | the remaining rolled affixes |
| **Prefix / Suffix** | `affixKind(id)` — offense affixes are **prefixes**, everything else a **suffix** (one reviewable `PREFIX_AFFIX_IDS` list; an **optional, new** `AffixDef.kind` field overrides per row for future content). The affix view splits the secondaries into prefixes + suffixes |

Per-affix **lock** is **new** (`RolledAffix.locked?`) — distinct from the item-level "keep" lock.
`itemAffixView(item) → { primary, prefixes[], suffixes[] }` is the read-model the UI + ops use.

---

## 2. The seven operations (`src/core/reforge.ts`, pure + deterministic)

Each is `(rng, item, …) → OwnedItem` (Salvage returns materials). All respect the ilvl tier ceiling,
skip **locked** affixes, and cost **materials** (Mutagen / Scrap / Catalyst — existing) from a
**data-driven cost table** scaled by rarity. Progression is gradual — Enhance is the cheap, steady
climb; Upgrade is the occasional bigger step.

| Op | Effect |
|---|---|
| **Reforge** | Reroll ALL unlocked affixes to fresh *types* + tiers (the big gamble). |
| **Upgrade** | Raise Rarity one tier → +1 affix slot (rolls a new affix). Bounded at legendary (exotics fixed). |
| **Enhance** | +1 tier to the lowest unlocked affix, capped by the ilvl ceiling — the steady, no-spike climb. |
| **Reroll** | Reroll the *tiers* of unlocked affixes (keep their types; new magnitudes). |
| **Lock Affix** | Toggle protection on one affix (shielded from Reforge / Reroll / Randomize). |
| **Randomize Affix** | Reroll ONE unlocked affix's *type* (new affix, random tier ≤ ceiling) — a targeted swap. |
| **Salvage** | Destroy the item → materials scaled by rarity + ilvl. Locked/favourite items are protected. |

Costs + magnitudes live in `REFORGE_COSTS` / `AFFIX_TIER_SCALE` — a re-tune is a data edit.

---

## 3. Gradual progression (no spikes)

- **Item Level ceiling:** `maxTierForIlvl(ilvl)` climbs slowly (ilvl 1 → cap T2, +1 tier per ~8 ilvl,
  T6 by ~ilvl 33), so early gear can't roll max magnitude — power grows with depth, not in one jump.
  It lives in `equipment.ts` (next to the tier ladder) and is re-exported by `reforge.ts`, so item
  generation can honour the ceiling with no import cycle; a missing `ilvl` (legacy gear) is uncapped.
- **Enhance** is +1 tier at a time (small, always-worthwhile) and the cheapest op; **Upgrade** (rarity)
  is the deliberate, costlier step. `AFFIX_TIER_SCALE` is bounded (T6 = ×2.0 of T1) so no affix ever
  spikes.
- Every op has a real, bounded cost, so improvement is a steady sink — not a one-shot jackpot.

---

## 4. Balanced, data-driven drops

- **Slot-balanced drops:** `rollItemDrop` picks a **slot uniformly** (Weapon / Armor / Relic) *then* an
  item within it — so the three categories have equal representation regardless of how many items each
  category defines (previously a uniform pick over `ALL_ITEMS` favoured whichever category had the most
  entries). **Armor** is confirmed present and now drops at a full 1/3 share.
- Rarity still floors up with depth; the dropped item's `ilvl` is set from the run's wave.
- Everything is data over the registries (`WEAPONS`/`ARMOR`/`RELICS`, `AFFIXES`, `REFORGE_COSTS`), so a
  new item / affix / operation is a data row — future expansion needs no new op code.

---

## 5. Save-compat, determinism, limitations
- `ilvl` + `RolledAffix.locked` are optional → pre-Reforge saves load unchanged (helpers default them);
  `itemScore`/effects stay valid. No migration, no `CURRENT_VERSION` bump.
- Operations are deterministic in their `rng`; the meta layer uses `Math.random` (cosmetic sink, never
  the sim), so nothing touches golden.
- Prefix/Suffix is a **classification view** (not a hard generation cap) in v1 — enough to structure the
  item and drive the UI; a strict per-item prefix/suffix budget is a documented future tightening.

---

## 6. Compressed developer summary (build on this; don't re-read the code)

**Status: shipped.** Prefer this section over re-reading the implementation.

**Architecture.** `src/core/reforge.ts` holds the seven **pure, deterministic** operations plus the
cost table, op catalog, and affix read-model. It composes the additive model in `src/core/equipment.ts`
(`OwnedItem.ilvl?`, `RolledAffix.locked?`, optional `AffixDef.kind`, `maxTierForIlvl`, exported
`rollAffixes`/`rollAffixTier`). `src/state/meta.ts` is the impure seam: it charges materials (`mats`),
applies an op, and `persist`s. `src/ui/EquipmentPanel.tsx` renders a per-item **Reforge overlay**
(`.rf-box`) with the affix rows (lock/randomize) and the op bar; item cards show `iN` + Power Score `⚙`.

**Public API (core).** `enhance(rng,item)`, `reroll(rng,item)`, `reforge(rng,item)`,
`randomizeAffix(rng,item,i)`, `upgrade(rng,item)→OwnedItem|null`, `toggleAffixLock(item,i)`,
`salvageValue(item)→Mats`; `itemAffixView(item)→{primary,prefixes,suffixes}`;
`reforgeCost(op,item)`, `canAfford/spend`, `opAvailable(op,item)`; catalogs `REFORGE_OPS`,
`REFORGE_COSTS`; `maxTierForIlvl`, `powerScore` (=`itemScore`). **Meta:** `reforgeOp(uid,op)`,
`randomizeItemAffix(uid,i)`, `lockItemAffix(uid,i)`, `salvageItem(uid)`.

**Extension points.** New op = a `REFORGE_OPS` row + `REFORGE_COSTS` entry + one pure fn (+ a `meta`
case if whole-item). New affix/item = one data row in `equipment.ts`; a new offense affix joins
`PREFIX_AFFIX_IDS` (or sets `kind`). Re-tune = edit `REFORGE_COSTS` / `AFFIX_TIER_SCALE` /
`maxTierForIlvl` only.

**Invariants.** Ops skip `locked` affixes and never exceed `maxTierForIlvl(item.ilvl)`. No-ops (Upgrade
at legendary/exotic, Enhance with nothing to raise) return the same ref so `meta` skips the charge.
Legacy items (no `ilvl`) are uncapped, so pre-Reforge behaviour is byte-identical (`rollItem` with no
`ilvl`, `rollAffixes` at default max — the equipment golden/tests are unchanged). Drops are
**slot-balanced** (uniform over Weapon/Armor/Relic, then within) and stamped with `ilvl` from the wave.

**Save-compat / golden.** `ilvl` + `locked` are optional; `withDefaults` passes the inventory array
through untouched — no migration, no `CURRENT_VERSION` bump. Ops run on the meta RNG (`Math.random`),
never the sim, and gear only folds in when equipped — the autoplay golden (no gear) never drifts.

**Known limitations.** Prefix/Suffix is a classification **view**, not a hard per-item budget (future
tightening). Primary affix = highest **tier** (a magnitude proxy, not cross-affix normalised). Meta ops
use `Math.random` (cosmetic sink) — deliberate; deterministic seeding is reserved for the sim.

**UI note.** The overlay reads the reactive `meta` store, so an op re-renders the card grid and the open
overlay in place; Salvage destroys the item and collapses the overlay.
