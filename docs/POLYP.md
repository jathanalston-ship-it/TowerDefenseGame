# POLYP.md — the Undertow Polyp (pull-field, composed via `def.abilities`)

The roster's **displacement** tower: a rooted undertow whose every pulse **drags the caught
back up-lane** and tears active siege locks off the Hive. It denies PROGRESS, not health bars —
the second kit composed purely through the `TowerDef.abilities` seam (after the Spire), with
zero bespoke firing code.

## Mechanic

- `TOWER_DEFS.polyp` — `firing: 'field'`, Kinetic. Kit =
  `[{ type: 'aura', radius: 165, damage: 5, pull: 46, particle: 'disrupt' }]`.
- **The pull** (`ability.ts execAura`, `AuraAbility.pull`): every caught **non-boss** enemy is
  yanked `pull` px toward spawn (floor y = 24) and a **sieging enemy loses its bite lock**
  (`sieging = false`, `windup = -1`) — it must march the lost ground again. Bosses hold their
  ground (fairness: displacement never cheeses bosses).
- Field reach = `radius × rangeMult`: mastery/theme reach rungs AND the `polypFieldMult` run
  knob are live (`game.ts` cast fold: `castRangeMult *= mods.polypFieldMult`).
- **Displacement STACKS as extra pull auras** — star steps and branch tiers grant additional
  drag currents (each its own pulse payload), so investment reads as *seconds stolen per
  pulse*, the tower's identity currency.

## Gating (docs/TOWERS.md §expansion — the Coil/Siphon pattern)

DOUBLE-gated behind the deepest tower gate yet: shards drop only past **Campaign Stage 30**
(`unlockStage`), then **440** must bank (`unlockShards`) before the Tower Lab claim.

## Knobs

`RunModifiers.polypFieldMult` (mul, Power 0.3) — subject `'polyp'` (draft badges), scored in
`POWER_RELEVANT_FIELDS`, ×1 by default (golden-safe: no Polyp is ever fielded on the golden
path).

## Kit

7-step star path (`POLYP_PATH`: stacked currents, Tide Doctrine fork at 3 — Grinder chip vs
Deadweight Disruption, Apex Tide at 5 — Maelstrom deep drag vs Abyss crush, The Drowning Deep
capstone) · two branches (**Riptide Engine** — deeper, harder undertows; **Grinding Gorge** —
the churn becomes a killing floor) · mastery track (Tidewarden title) · Adaptation
`TOWER_THEMES.polyp` (Grinding Churn / Spreading Basin / Quickened Undertow / Rooted Communion)
· renderer: rooted-ring silhouette + disrupt churn pulses.

## Tests

`core/polyp.test.ts` — the double gate, the up-lane yank (with a no-polyp control run on the
same seed), the torn siege lock, determinism. Golden byte-identity is pinned by the usual
invariant (no pull aura executes on the golden path).
