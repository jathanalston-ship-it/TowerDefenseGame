# HIVE-PRODUCTION.md — the Hive ⇄ Harvest unification

Compressed developer summary (canonical — prefer over re-reading code). The Hive organism
(construction, docs/HIVE-CONSTRUCTION.md) and the Idle Harvest (docs/IDLE-HARVEST.md) are
ONE loop since 2026-07: **the Hive is the biological engine; the harvest is its output.**
The player never "collects idle rewards" — their Hive kept evolving while they were away.

## Architecture — the model unifies, the saves never moved

No migration: `save.hive.built` (organ ledger) and `save.idle` (production ledger) both
survive byte-identical. `src/core/hiveProduction.ts` is the unification layer:

- **ORGAN_COUPLINGS** — every construction organ feeds ONE themed production lane per built
  tier (validator-enforced: an organ with no coupling fails the suite). Spore Garden →
  rate, Lumen Polyps → offline efficiency, Marrow Forge → crafting yield, Specimen Arbor →
  shard yield, Chorus Node → collect XP, Vein Loom → rate, Membrane Observatory → rare
  weight, Symbiote Pool → +storage hours, Crown Spire → BLOOM chance, World-Womb →
  container weight.
- **HIVE_SYNERGIES** — hidden efficiencies that reveal when BOTH paired organs are FULLY
  grown (5 shipped: Forged Arteries, Tended Gardens, Beacon Watch, Lullaby of the Womb,
  Night Shift). `synergyLive(built, syn)` is the gate.
- **`hiveProductionBonus(built)`** → one `HiveProductionBonus` bundle
  (rateMult/capBonusHours/offlineBonus/rareWeightMult/containerWeightMult/craftMult/
  shardMult/bloomBonus/xpMult), clamped by **HIVE_PRODUCTION_CAPS** so data errors degrade
  gracefully. **Identity at zero** — fresh saves and goldens are byte-unchanged.

`core/idleHarvest.ts` consumes the bundle through OPTIONAL args (identity defaults):
`idleAccrual(…, hive)`, `rollIdleHarvest(…, hive)`, `idleOfflineEff(nodes, bonus)`,
`idleBloomChance(nodes, bonus)`, `idleRatePerHour(…, hiveRateMult)`. meta passes the real
bundle in `idleView()` / `collectIdleHarvest()`; every other call site is untouched.

## The guardrail still rules

Playing ALWAYS out-earns production. `hiveProduction.test.ts` re-runs the idle<active
guardrail with **every organ maxed** on top of generous node depths across the arc
(stages 10→300): the merged model must stay under a quarter of the weakest active lane.
The offline-efficiency 1.0 cap and BLOOM cap hold structure too. Constitution intact:
organs never touch COMBAT power — Power Score still never reads the hive.

## Presentation — two views of one organism

- **`ui/components/HiveOrganism.tsx`** (§organism): the shared living diagram — a central
  production sac filling toward the cap with a heartbeat while producing, organ nodes
  ringed around it (built = alive + tier pips, unbuilt = dim silhouettes), veins carrying
  resource motes to the core, gold shimmer arcs on live synergies, and the Growth ⇄
  Production tab strip (navBus). Reduced-motion stills everything.
- **HarvestScreen = "Hive Production"** (Rewards hub): organism header, the hopper, a
  Production Intelligence panel (rate, offline %, capacity, time-to-full, multiplier
  chips incl. ⬡ organism + ✦ synergies, most productive organ) and an ADAPTIVE advice line
  (brimmed → collect + grow storage · >80% → plan a harvest · else the tree's grow-next).
  Ceremony eyebrow: "HIVE PRODUCTION COMPLETE". Placards ride source "Hive Production".
- **HiveScreen = "The Hive — Growth"** (Evolution hub): organism header + organ cards now
  carry their production line (⬣) and synergy state (✦ dormant hint / LIVE). Building
  pushes "The Hive Grows" placards (the `organ` reward type) with the coupling line, and a
  second epic card when a synergy reveals.

## Extension points

- New production lane: one `CouplingTarget` + its math seam in idleHarvest (all current
  lanes already exist). New organ: one HIVE_ORGANS row + ONE coupling row. New synergy:
  one pair row. New drop: one IDLE_DROPS row (unchanged contract).
- Every major progression system already feeds the engine: campaign stage (rate growth),
  Genome Rank (+4%/rank dividend), Arena division (dividend + cap hours), Collections/
  Molts/Rush/Power (tree gates), and now the built body itself.

## Known limitations

- Organ positions in the diagram are ring-order, not spatial adjacency — synergies are
  authored PAIRS, deliberately (the organism is not a grid).
- The Growth and Production views live in different hubs (Evolution vs Rewards) by
  behavior; the organism tab strip is the bridge.
