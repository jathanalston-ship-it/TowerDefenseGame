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

## 5. Current findings docket (simulated 2026-07 — 8 accounts × 3000h)

- **Early pacing is hot**: median stage 70 by hour 10 with 31 molts (a molt every ~15
  minutes) and 5 flagged early power-spike bands — the molt spiral compounds far faster than
  a milestone should. First tuning candidates: `PRESTIGE.molt.minCells`,
  `prestigeStageReq` growth, the first-clear bonus curve.
- **The deep game flattens**: stage 153 → 161 across hours 250 → 3000 (+8 stages in 2750h),
  molts frozen at 46, power +65% over the same span, farm share 94%, and **16 sink-exhaustion
  bands** — the EA-audit P0 (mid-late sinks thin out), now quantified. The designed answer is
  prestige layers 2–6 + content waves; the report is the yardstick for landing them.
- **Structure holds**: zero wall stalls across every account (never stuck), farm share rising
  4% → 94% with depth (walls thicken exactly as the loop intends), Infinite best still
  climbing at 3000h (187) — the endless record remains the deep chase.
- All tuning waits on the change protocol above — the instrument (simulator + report) now
  exists; regenerate after every candidate change.
