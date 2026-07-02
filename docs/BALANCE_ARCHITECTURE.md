# BALANCE_ARCHITECTURE.md — the foundational balance framework

> **Permanent reference — the capstone.** How ASSIMILATE's balance is architected so years of
> content land inside a stable mathematical frame instead of triggering rebalance passes.
> The four pillars each have their own deep doc; this page is the map, the guardrail
> inventory, and the change protocol. Pillars: `DIFFICULTY_DIRECTOR.md` (scaling policy),
> `ECONOMY_FORMULAS.md` (income/sinks), `PROGRESSION_FORMULAS.md` (curves),
> `PROGRESSION_REPORT.md` (simulated pacing evidence, generated).

---

## 1. The four pillars

```
                 ┌────────────────────────────┐
   content data ─▶  UNIVERSAL DIFFICULTY       │─▶ every threat/economy scalar
  (defs, curves) │  DIRECTOR (policy)          │   consumed at the owning system's site
                 └──────────────┬─────────────┘
                                │ policies
                 ┌──────────────▼─────────────┐
                 │  ADAPTIVE ECONOMY FRAMEWORK │─▶ factor-traced income per currency,
                 │  (income compositions)      │   geometric sinks, health seams
                 └──────────────┬─────────────┘
                                │ feeds
                 ┌──────────────▼─────────────┐
                 │  PROGRESSION LOOP ENGINE    │─▶ geometric bar × logarithmic reach:
                 │  (the macro-game's shape)   │   walls form, farms pay, caps gate
                 └──────────────┬─────────────┘
                                │ measured by
                 ┌──────────────▼─────────────┐
                 │  PROGRESSION SIMULATOR      │─▶ hour-band pacing + problem detectors —
                 │  (evidence, not intuition)  │   the ONLY sanctioned tuning input
                 └────────────────────────────┘
```

## 2. The guardrail inventory (all run in `npm test`)

| Axis | Guardrail | Where |
|---|---|---|
| Sim behavior | golden byte-identity, 6 seeds | `golden.test.ts` |
| Scaling policy | director ≡ legacy formulas, bit-exact, difficulty×doctrine×depth | `difficultyDirector.test.ts` |
| Adaptive seams | `DIRECTOR_ADAPTIVE`/`ECONOMY_ADAPTIVE` pinned at 0 until simulator evidence | both director tests |
| Loop shape | 8 invariants: resistance, walls, never-impossible, interlock, prestige ring, unskippable modes | `progressionLoop.test.ts` |
| Economy income | factor chains ≡ legacy settles, bit-exact | `economyDirector.test.ts` |
| Economy health | positive uncapped sources; geometric sinks | `economyDirector.test.ts` |
| Loot | meter invariant (5000-fill stress + conservation), pity, catch-up bias neutrality | `lootQueue/progressionLoot` tests |
| Power | every permanent field scored or explicitly waived (bypass prevention) | power validation tests |
| Content shape | registry validation on every def; gene 100/250/500-card stress; per-def invariants | `validate.ts`, `geneStress` |
| Pacing | simulator detectors (dead progression, wall stall, spike, sink exhaustion) at CI scale | `progressionSim.test.ts` |
| UI/identity | type/tracking/radius/motion scales enforced | `uiStandards.test.ts` |
| Docs/graph | anchors, dead paths, dependency-graph freshness | `systemRegistry.test.ts` |

## 3. Why new content fits automatically

- **+50 towers / +100 gene cards / +500 equipment**: content registers into registries with
  per-def validation; income is content-agnostic (random-kind rolls); sinks arrive with the
  content (star/gene/reforge curves); Power coverage is engine-enforced. No formula edits.
- **+20 biomes**: biome mods are per-spawn data the sim already applies; promoting a biome to
  a director factor is one input (reserved seam, `DIFFICULTY_DIRECTOR.md` §7).
- **New currencies**: one identity row (`currencies.ts`) + one income composition + one
  compounding sink (`ECONOMY_FORMULAS.md` §6 template, health pins apply automatically).
- **New modes**: one resolved difficulty + one `MODE_REWARDS` row; the directors, loop
  engine, and simulator inherit it.
- **New progression systems**: pay through a named economy factor; feed Power through a
  scored bucket; gate depth on campaign stages if it must respect the loop.

## 4. The change protocol (how balance changes happen now)

1. **Propose** — name the constant/curve (it lives in config or a director, nowhere else).
2. **Simulate** — `npm run sim:progression` before/after; read hour-band medians + detectors.
3. **Check invariants** — `npm test`: loop shape, economy health, parity suites must hold
   (parity tests are updated ONLY as part of a deliberate, simulated balance change).
4. **Record** — update the affected pillar doc; the report regenerates as evidence.

Manual "feels right" tuning is retired. A change without a simulator diff is a defect.

## 5. Findings docket — TUNING PASS APPLIED (2026-07, 8 accounts × 3000h before/after)

**Applied changes** (via §4 protocol; parity/pinned tests updated with them):

| Lever | Before | After | Why |
|---|---|---|---|
| `PRESTIGE.molt.minCells` | 1 (a molt per ~45 Cores) | **12** (≥ ~6,400 cycle Cores) | a Molt is a milestone, not a per-run action |
| `prestigeStageReq` shape | ×1.05 compound (froze at molt ~46 vs the crawling deep frontier) | **linear `+3 stages/molt`** | layer-1 must never freeze — it is the deep bridge until prestige layers 2–6 |
| `CAMPAIGN_REWARDS` | +6 Cores/stage, 150 milestone | **+4/stage, 100 milestone** | the discovery torrent was the main early accelerant (base 25 kept — onboarding intact) |

**Measured results** (medians): molts @10h **31 → 8**; molts @3000h **46-frozen → 53 and
still cycling**; sink-exhaustion bands **16 → 4** (cycling Molts consume the deep shard
pile); deep power @3000h **11.7M → 16.6M** (+42%); deep stage 161 → 167; zero wall stalls
before and after. Early stage@10h ≈ 67 is the **frictionless-bot ceiling** (instant wins,
perfect spending — real players run well below it); the requirement curve is deliberately
untouched: steepening it would deepen the content-horizon crawl.

**Watch items (open, by design):**
- Deep dead-progression bands (4) at the content horizon (~stage 165+) — the flattening the
  prestige layers 2–6 + content waves are designed to own; the report is their yardstick.
- Mid-band power texture (6 ×8+ bands, wide 250h spread) — chunky Molt batches; acceptable
  until layer-2 smooths the deep cadence.
- **Future-content compatibility:** the pacing envelope is CI-pinned
  (`progressionSim.test.ts`) — new towers/cards/equipment/currencies that re-open the molt
  spiral, freeze the gate, or soften the requirement curve fail the build; the linear molt
  gate leaves layers 2–6 to add their own gates ON TOP rather than re-shaping layer 1.
