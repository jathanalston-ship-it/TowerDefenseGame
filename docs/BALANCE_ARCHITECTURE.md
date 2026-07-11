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

---

## 6. Amendment round — BALANCE_REPORT №1 (2026-07, persona matrix 11×4×400h)

The first persona-matrix report (`docs/BALANCE_REPORT.md`, top-20) was reviewed and amended.
Changes went through the §4 protocol (named constants → simulate before/after → re-pin):

| Finding (family) | Change | Where |
|---|---|---|
| **Push-futility** (№1–3, MAJOR/High — campaign-focused players burn whole runs on under-ready frontier attempts) | Failed FRONTIER attempts now recover **partial field data**: `CAMPAIGN_REWARDS.attemptFrac` (0.25) of the stage's first-clear value, scaled by depth survived. Frontier-only (never farmable below the wall); superseded by the full first-clear. Plus **readiness surfaced** at both decision points: the Command Center deploy button switches to an explicit `Deploy Under-Powered ⚠ you/rec` state, and the deployment interstitial carries the warning line. The attempt stays allowed — informed risk. | `config.CAMPAIGN_REWARDS.attemptFrac`, `meta.finishRun` (attemptBonus), `CommandCenter`/`DeployScreen` |
| **Unlock-cadence gap 150–400h** (№4/6/14/15/16, incl. the one CRITICAL — acquisitions fell to 0.32–0.48/h) | Two-part: (a) **instrument honesty** — the virtual player now SPENDS Antigen (Adaptation picks in tier order) and `progressSignature` counts picks: the deep band's existing dopamine source was invisible to the meter; (b) **content** — a ~24-rung deep-band achievement ladder (stages 15→150, depths 25→140, molts 1→35, stars 5/7/9, Adaptation 1/12/30, lifetime kills), each with a progress bar, so authored beats span the long arc instead of ending at tutorial scales. | `dev/progressionSim.ts`, `state/achievements.ts` |
| **Power spikes** (№5/7–10/12/13/17/18 — ×8–28 "inside one band") | **Instrument correction:** the ×8 threshold ignored band width — late bands span 250h, over which the whole cohort legitimately grows many-fold; most flags were the curve, not discontinuities. The detector is now **cohort-relative**: a seed flags only when its band growth exceeds 3× its cohort's median for the same band. True molt-chain outliers (e.g. №7's ×28 vs cohort ×~10) still flag; payout smoothing itself remains deliberately deferred to prestige layers 2–6 (re-shaping layer 1 would re-open the tuned molt envelope). | `dev/balanceReport.ts` |
| **Dead zone №11** (MINOR, 25% — power *declined* while farming) | Traced to gear-swap metric variance: `spendEverything` picks by `itemPowerScore` while the Power meter values `effectsPower×rarity` — a swap can rank up on one metric and down on the other, exactly as a real player's sidegrade can. Recorded as measurement texture (the detector's farming+flat-power condition remains meaningful at higher frequencies); no change. | — (recorded here) |
| **Grind saturation** (№19/20, MINOR/Low) | No direct knob turned: the consolation + Antigen spending raise farm→power conversion, which shortens farm phases organically. Kept as a watch item against the regenerated report; the readiness-curve knob stays untouched (loop invariants). | watch item |

**Guardrails:** goldens byte-identical (all changes live in the meta/report layers); the CI
pacing envelope (`progressionSim.test.ts`) passed unmodified; the consolation contract is
pinned in `meta.test.ts` (frontier-only, depth-scaled, superseded on the clear).

---

## 7. Round 3 — ADAPTIVE SEAM ACTIVATION (2026-07-11, 8 accounts × 1000h before/after)

**The finding (regenerated PROGRESSION_REPORT, 2026-07-11):** the liveops-era systems shipped
since round 2 (Account Level rewards, quests/directives, contracts, idle harvest, transcendence)
each landed individually calibrated but collectively re-inflated the early game — molts@10h
**8 → 12** (+50% past the tuned milestone cadence), stage@10h 67 → 80, farm share 0% at 10h
(no wall forms in a first session). Deep bands showed the opposite failure: **6 dead-progression
bands** (150h+ farm income under the next geometric sink price) and a **×16 p10–p90 power
spread** at 500h (unlucky accounts falling off the curve entirely).

**Applied changes** (§4 protocol; parity/pinned tests updated with them):

| Lever | Before | After | Why |
|---|---|---|---|
| `ECONOMY_ADAPTIVE.catchUpPerPowerGap` | 0 | **0.35** | deep farm keeps out-earning the next sink; luck spread compresses |
| `ECONOMY_ADAPTIVE.aheadTaperPerPowerGap` | 0 | **0.5** | the aggregate faucet stack stops compounding into runaway cadence |
| `ECONOMY_ADAPTIVE.maxCatchUpGap / maxAheadGap` | — | **2 / 0.9** | saturation clamps: ≤×1.7 catch-up, ≥÷1.45 taper — extremes bend, never break |
| `ECONOMY_ADAPTIVE.minStage` | — | **10** | onboarding floor — fresh settles byte-identical (pinned) |
| `meta.finishRun` wiring | inputs never passed | **powerGap once per settle → both chains** | the seams were built for this; activation is the designed counter-mechanism, not a new system |
| `IDLE.rankGrowth` (Genome Rank Dividend) | — | **0.04** | interlink: the mastery ladder feeds idle (+4%/rank past I; guardrail-priced) |
| Dead-progression detector | raw checkpoint power | **molt-aware** | a mid-band Molt is permanent progress; its power trough no longer masquerades as broken conversion (the artifact behind this test's three historical seed re-pins) |

**Measured results** (8 × 1000h medians, before → after): molts@10h **12 → 8** (the round-2
target exactly); stage@10h 80 → 72 with farm share **0% → 4%** (the wall returns to session
one); dead-progression bands **6 → 0**; power spikes 10 → 8 (molt-batch texture, unchanged
philosophy); wall-stall/sink-exhaustion 0 → 0. The headline: **cohort compression** — 500h
power p10–p90 **×16.2 → ×3.6**, 1000h **×11.6 → ×1.6**, with the p10 floor at 1000h rising
8.1M → 31.3M (unlucky accounts stay on the curve) while deep reach held (stage 232 → 229).
Surfacing: the catch-up side ships on Results as **Momentum** (>×1 only); the taper is silent.

**Watch items:** power-spike bands (8) remain molt-batch texture — still deferred to prestige
layers 2+; `DIRECTOR_ADAPTIVE` (threat-side) stays 0, economy-side pacing sufficed; the persona
matrix (`npm run sim:report`) regenerates next review round against the new economy.

**Measured results** (persona matrix 11×4×400h, before → after the amendment):
signals **26 → 15**, reported **top-20 → top-15**. Median finals — Efficient power
**10.2M → 24.5M**, acquisitions **606 → 755** (Antigen picks now spent + counted + the
ladder); Campaign-Focused stage **193 → 211** with failed pushes **265 → 233** (the
consolation converts failed time into catch-up, which raises later win odds — the
self-correction predicted); Equipment-Focused acquisitions **532 → 694**. Power-spike
flags fell from 9 (mostly band-width artifacts) to 3 true cohort outliers. Residuals for
the next review round: deep-band cadence still ~0.40–0.48/h against the 0.5 threshold
(the deepest beats belong to prestige layers 2+ content — the reserved seam), and the
dead-zone entries at 25–50% frequency carry the gear-swap metric-variance caveat: the
in-game item score (`itemPowerScore`) and the Power meter's equipment fold can rank a
swap oppositely — worth a dedicated audit if frequency rises.
