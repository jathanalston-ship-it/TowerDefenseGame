# TOWER-MANAGEMENT.md — Sell, Relocate & the Build-Phase interaction flow

In-run tower management: **Sell** (remove a tower for a partial refund), **Relocate**
(reposition a tower in Build Phase, preserving all state), and the **Build-Phase
interaction redesign** that ties them together. Documented before implementation per
the brief. This is the canonical reference — tune/extend here + at the cited code.

These are one cohesive system: they share the inspected-tower selection, the tower
lifecycle in `game.ts`, the Inspector UI, and the canvas interaction layer in
`GameView.tsx`. Sim state stays deterministic; none of this touches the golden path
(autoplay never sells/moves ⇒ byte-identical).

---

## 1. Shared interaction state (`game.ts`)

Three mutually-exclusive interaction modes already / now live on the Game:

| Field | Meaning |
|---|---|
| `selectedTower: TowerKind \| null` | a tower KIND is armed for placement |
| `selectedPlacedId: number \| null` | a placed tower is being INSPECTED |
| `movingTowerId: number \| null` | **(new)** a placed tower is PICKED UP for relocation |

Arming/selecting/picking-up one clears the others (`cancelInteractions()` clears all
three — the ESC / right-click escape hatch). The renderer + HUD read these to draw the
right affordance; no mode is ever a blocking modal.

---

## 2. Sell

### Refund model (future-proof percentage)
- **Investment** of a tower `t`:
  `TOWER_DEFS[t.kind].cost + Σ_{i=0}^{t.tier-1} BRANCH_COSTS[t.kind][i]`
  (purchase + every branch tier actually bought).
- **Refund fraction** = `mods.sellRefundFrac` (default `SELL.refundFrac = 0.75`).
  This lives in `RunModifiers`, so **any** future mechanic raises it through the
  existing effect pipeline with zero new plumbing: a **Gene Card** (`set`/`add` op),
  **Equipment / relic** (run-start effect), **Prestige perk** or **Permanent Upgrade**
  (folded into mods at construction like `towerDamageMult`). One knob, every source.
- **Refund** (rounded cleanly, each part separately so the dialog adds up):
  `towerRefund = round(frac · purchaseCost)`, `branchRefund = round(frac · branchTotal)`,
  `total = towerRefund + branchRefund`.
- **Never refunded:** Gene Cards, permanent progression, mastery, stars, hero buffs —
  none of these are part of a tower's per-instance investment, so the formula
  structurally cannot leak them. Refund is capped at the investment (frac ≤ 1) ⇒ never
  exploitable (you can't profit by buy→sell).

### API
- `sellQuote(id): { name, kind, tier, investment, towerRefund, branchRefund, total } | null`
  — pure read-model for the confirm dialog (surfaced on `SelectedPlacedTower.sell`).
- `sellTower(id): boolean` — credits `biomass += total`, frees the slot, removes the
  tower, `recomputeTowerCaches()`, clears any selection/move referencing it, and plays
  the dissolve FX. Allowed in **prep AND wave** ("remove unwanted towers during a run");
  blocked only when the run is over.

### Despawn / no leaks
A tower owns no retained sub-objects: projectiles + acid pools are independent entities
tagged by `sourceKind` (not a tower id), so removing the tower dangles nothing — its
in-flight shots coast out and despawn naturally. Selling therefore: splices the tower
from `towers[]`, deletes its `occupied` slot, recomputes the overcharge/reactor caches,
and nulls `selectedPlacedId`/`movingTowerId` if they referenced it. The slot frees
**immediately**.

### Visuals (satisfying, never punishing)
- Tower **dissolves**: an outward burst of tower-coloured matter at its cell.
- Biomass **motes stream to the Hive Core**: green particles spawned with a velocity
  toward `nucleusPoint`, arriving in ~0.5s.
- **Refund float** `+N` rises at the tower; the HUD Biomass counter **pops** as the
  credit lands (existing gain-feedback), closing the loop.
- A unique **`dissolve`** SFX cue (wet, descending — the inverse of the `splice` graft).
- Selling **immediately closes Inspect** (`selectedPlacedId = null`).

---

## 3. Relocate (Move)

### Rules
- **Build Phase only.** `beginMove(id)` is a no-op outside `phase === 'prep'`; the
  Inspector's Move button is disabled in combat and shows
  *"Cannot relocate towers during combat."* (The gate is a single `phase` check, so a
  future "movement during combat" perk just widens that predicate — left as a seam.)
- Clicking **Move** picks the tower up (`movingTowerId = id`, clears the armed kind).
- Every **valid** empty unlocked slot highlights/pulses; occupied/locked stay disabled.
- Clicking a valid empty slot **instantly relocates** — **no biomass cost, no cooldown**.
- Clicking the tower's **own** slot, or ESC / right-click, **cancels** (drops it back).

### State preservation — relocate the OBJECT, never recreate
`moveTower(id, px, py)` mutates the **existing** `Tower` object's `slot/x/y` only and
swaps the `occupied` entry. Because it's the same object, **everything transfers for
free**: branch upgrades (`branchId`/`tier`), specialization, internal `cooldown`/
`pulseCd` timers, current targeting, visual evolution age (`bornAt`/`mutatedAt` are NOT
reset), and any per-instance buffs. A separate render-only `movedAt` timestamp drives
the **landing impact** without disturbing the grow-in/evolution animations. After a
successful move the Game re-selects the tower (`selectedPlacedId = id`) ⇒ **returns to
Inspect automatically**.

> Future-proofing: the same "relocate an existing entity to a slot/point" shape
> generalizes to **hero repositioning**, **temporary movement abilities**, and
> **teleports** — those become callers that move a different entity to a target, reusing
> the validate-slot + cache-recompute seam.

### Visuals (premium)
Picked-up tower **lifts + glows** and projects a **holographic silhouette** at its
origin; valid destination slots **pulse**; the chosen slot briefly **mutates the
ground** and the tower **lands with an impact** ring (`movedAt`). While moving,
**unrelated range indicators are hidden** (the renderer suppresses the hover-range of
other towers) so the board reads cleanly.

---

## 4. Build-Phase interaction redesign (`GameView.tsx`)

Fast, non-modal, minimal clicks. The canvas already routes a tap through `game.click`;
this extends the surrounding handlers:

| Interaction | Behaviour |
|---|---|
| **Single tap** placed tower (nothing armed) | inspect it (existing) |
| **Double-click** placed tower | open Inspect immediately (explicit fast path) |
| **Right-click** | closes any tower interaction (inspect/move/armed); only re-anchors the hero rally when there was nothing to close |
| **ESC** | `cancelInteractions()` — closes inspect, cancels move, disarms placement |
| **Hover** a tower | subtly highlights its attack radius (existing `drawPointer`) — suppressed while moving |
| **Shift** held when placing | keeps the tower KIND armed for rapid placement; without Shift, placing is one-shot (auto-disarms so you can immediately inspect/move) |
| **Sell** | closes Inspect immediately (§2) |
| **Move → place** | returns to Inspect automatically (§3) |

`game.click(px, py, { shift })` gains an options arg (Shift). Move mode is handled at
the top of `click` (a tap lands/cancels the pickup). Nothing here blocks the sim or
opens a full-screen modal — the only confirmation is the Sell dialog (a lightweight
centered popup via the existing `createPortal` pattern, dismissible by click-away/ESC).

---

## 5. Determinism & golden-safety

Sell/Move mutate sim state but are **player-initiated** and never invoked by autoplay,
so the golden run is byte-identical. The FX (particles/floats/sfx) ride the cosmetic
`fxRng` + presentation queues, never the gameplay rng. `sellTower`/`moveTower` recompute
the same caches `placeTower`/`buyBranchTier` already maintain, so overcharge adjacency
and reactor counts stay coherent.

## 6. Known limitations / future hooks
- Relocation is Build-Phase-only by a single `phase` predicate — the documented seam
  for a future "move in combat" perk.
- `sellRefundFrac` is the single extensibility point for refund-rate mechanics; a
  per-tower or per-class refund modifier would extend the quote, not the call sites.
- The Sell dissolve streams motes toward the core position; it does not path around
  obstacles (purely cosmetic).
