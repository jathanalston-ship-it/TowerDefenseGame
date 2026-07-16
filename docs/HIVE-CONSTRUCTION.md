# HIVE CONSTRUCTION — the composite long-horizon sink (`src/core/hiveOrgans.ts`)

> **MERGED (2026-07):** organs now FEED PRODUCTION — read **docs/HIVE-PRODUCTION.md**
> first (one themed coupling per organ + hidden pair synergies). Construction economy,
> fixtures, and the never-combat-power constitution below are unchanged.

The Home Base's passive growth (docs/HOME-BASE.md: `labScore` → eras 0–3 → fixtures) stays
the PREREQUISITE ladder; Hive Construction makes the next stage ACTIVE: the player **builds**
the laboratory organism's organs, each consuming a **mix of currencies**, and each built organ
**visibly layers into LabAtmosphere immediately** — the base you see behind every screen is
the payoff.

**Constitution:** organs are sidegrades — base transformation, fiction, and ambient QoL only.
**Never combat power.** Power Score never reads this system.

## The registry

An organ is one data row (`HIVE_ORGANS`): id, name, icon, fiction blurb, **era gate** (the
existing `labEra` 0–3 — construction unlocks *within* reached eras; locked eras stay visible
on the board for anticipation), a **multi-currency recipe** (≥2 currencies enforced by
`hiveOrganProblems` — the composite-sink mandate), `tiers` (1 or ×3 with geometric deepening,
`HIVE_TIER_FACTOR = 3`), fixture layers per tier, and a perk line. Ten organs ship across all
four eras (four of them ×3-tiered): Spore Garden, Lumen Polyps (era 0) · Marrow Forge,
Specimen Arbor, Chorus Node (era 1) · Vein Loom, Membrane Observatory, Symbiote Pool (era 2) ·
Crown Spire, World-Womb (era 3).

## Costs (economyDirector discipline)

A price is a **factor-traced line list**, never a bare number: `hiveCost(def, tier)` returns
`{ key, base, tierFactor, amount }` per charged currency (`amount = base × 3^(tier-1)`), and
`explainCost` renders the trace ("600 × 9 = 5,400"). Recipes draw from seven wallets:
Genome Cores (`shards`) · Gene Essence · **Strain Samples** (`towerShards`, a TOTAL) ·
**Apex Genome** (`heroShards`, a TOTAL) · mutagen · scrap · catalyst (`mats`).

**Per-kind drains:** Strain/Apex wallets are per-kind records, so a recipe charges a total
and `drainPlan` takes **greedily from the richest stacks first** (deterministic roster-order
tie-break) — kinds the player has nearly saved for an Evolution are touched last. The board
states this policy in its footer.

## The spend (ONE atomic action)

`meta.buildOrgan(id)` — guarded (`hive.build`, docs/SECURITY.md): era gate → verify EVERY
recipe line against the live wallet → plan both drains → only then ONE persist commits every
deduction + the built tier + a timeline entry. No partial spends are possible; a short lane
refuses before anything is touched (test-pinned).

## Save

`save.hive = { built: Record<organId, tier> }` (v36, additive). The sanitizer keeps real
organ ids only and clamps tiers to each def; pre-v36 saves deep-fill to `{}`.

## The payoff (fixtures + glow)

`hiveFixtures(built)` derives the fixture ids of every built tier (layers are ADDITIVE), and
`ui/homeBaseTiers.unlockedFixtures` appends them to the passive score ladder — **one generic
renderer** (LabAtmosphere's `.lab-fix .fix-<id>` divs) serves both. `hiveGlow(built)` lifts
the ambient `--lab-intensity` slightly (+0.02/tier, capped +0.16) — visual only. An empty
ledger contributes nothing (the passive lab is byte-identical to pre-feature).

## UI

**THE HIVE** (Hub → Progression → ⬡): organ cards grouped by era — locked eras visible with
their gate and live development progress; recipe chips with per-currency affordability against
the live wallet; tier pips on ×3 organs; a build ceremony (power cue + `unlock` stinger) whose
backdrop is the lab ALREADY wearing the new organ. A nav badge lights when any organ's next
tier is affordable (era met), via the standard notification source.

## Extending

New organ = one `HIVE_ORGANS` row + its `.fix-hv-*` CSS layers. Rebalance = edit recipes /
`HIVE_TIER_FACTOR`. New currencies join `RECIPE_KEYS` + the wallet map in `hiveView`/
`buildOrgan`/the badge. The registry validator and the test suite hold the contract.
