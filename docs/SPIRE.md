# SPIRE.md — the Synapse Spire (chain-arc, composed via `def.abilities`)

The roster's **chain-arc** tower — and the first kit built purely through the
`TowerDef.abilities` composition seam: `deriveTowerAbilities` returns the def's own component
list, so the Spire has **zero bespoke firing code**. Each cast is one `ChainAbility` that leaps
victim to victim on a diminishing arc — the tighter the pack, the longer the lightning.

## Mechanic

- `TOWER_DEFS.spire` — `firing: 'field'`, Neural. Kit =
  `[{ type: 'chain', jumps: 4, range: 210, damage: 30, falloff: 0.75, particle: 'spark' }]`.
- **The arc** (`ability.ts execChain`): starts at the enemy nearest the Spire, then leaps
  victim-to-victim (never re-hits) within `range × rangeMult` — mastery/theme **arc reach**
  rungs are live. Damage falls off 25% per hop; a spark bites at every victim.
- **Hops are the upgrade currency**: `comp.jumps + ctx.extraProjectiles` — star steps, branch
  tiers and the `spireChainJumps` run knob all add hops through the one channel
  (`game.ts` cast fold: `castExtraProjectiles += floor(mods.spireChainJumps)`).
- The **first victim is tagged `cast.target`** (mirrors `execProjectile`), so "chain + status /
  crit" pairings compose: Stormcall's entry Disruption and overload crit ride the same cast.

## Gating (docs/TOWERS.md §expansion — the Coil/Siphon pattern)

DOUBLE-gated: shards drop only past **Campaign Stage 25** (`unlockStage`), then **400** must
bank (`unlockShards`) before the Tower Lab claim.

## Knobs

`RunModifiers.spireChainJumps` (add, Power 0.07) — subject `'spire'` (draft badges), scored in
`POWER_RELEVANT_FIELDS`, +0 by default (golden-safe: no Spire is ever fielded on the golden
path).

## Kit

7-step star path (`SPIRE_PATH`: hop climbs, Storm Doctrine fork at 3 — Tempest hop vs
Thunderhead entry-Disruption, Apex Pylon at 5 — Skywire +2 hops vs Ballast static bloom, The
Standing Storm capstone) · two branches (**Stormcall** — fewer, harder strikes: entry overload
crit, Disruption, a detonating finale; **Synaptic Web** — saturation hops + cadence + a relay
micro-arc) · mastery track (Stormcaller title) · Adaptation `TOWER_THEMES.spire` (Charged
Synapse / Reaching Antenna / Racing Pulse / Neural Weave) · renderer: diamond pylon silhouette
+ per-hop spark bites.

## Tests

`core/spire.test.ts` — the double gate, the multi-victim arc (the first damage tick exceeds any
single-victim payout), determinism. Golden byte-identity is pinned by the usual invariant
(no chain component executes on the golden path).
