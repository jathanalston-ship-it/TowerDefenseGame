# BALANCE_ARCHITECTURE.md — the foundational balance framework

> **Permanent reference — the capstone.** How ASSIMILATION's balance is architected so years of
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
| Adaptive seams | `DIRECTOR_ADAPTIVE` pinned at 0; `ECONOMY_ADAPTIVE` activated on simulator evidence (§7) | both director tests |
| Loop shape | 8 invariants: resistance, walls, never-impossible, interlock, prestige ring, unskippable modes | `progressionLoop.test.ts` |
| Economy income | factor chains ≡ legacy settles, bit-exact | `economyDirector.test.ts` |
| Economy health | positive uncapped sources; geometric sinks | `economyDirector.test.ts` |
| Loot | meter invariant (5000-fill stress + conservation), pity, catch-up bias neutrality | `lootQueue/progressionLoot` tests |
| Power | every permanent field scored or explicitly waived (bypass prevention) | power validation tests |
| Content shape | registry validation on every def; gene 100/250/500-card stress; per-def invariants | `validate.ts`, `geneStress` |
| Pacing | simulator detectors (dead progression, wall stall, spike, sink exhaustion) at CI scale; Molt cadence ≤2 by 5h / ≤10 by 30h | `progressionSim.test.ts` |
| Molt trough | Molt Imprint: first Molt untouched; a fully-bought engine dips ≤ ×5 at the cap; Molt Power preview ≡ outcome (§9.6) | `prestige.test.ts`, `prestigeView.test.ts` |
| Report instrument | molt-aware dead-zone (shared `isDeadProgression`), cohort-relative spikes, seeded loot (reproducible matrix) | `balanceReport.test.ts` |
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
| **Push-futility** (№1–3, MAJOR/High — campaign-focused players burn whole runs on under-ready frontier attempts) | Failed FRONTIER attempts now recover **partial field data**: `CAMPAIGN_REWARDS.attemptFrac` (0.25) of the stage's first-clear value, scaled by depth survived. Frontier-only (never farmable below the wall); superseded by the full first-clear. Plus **readiness surfaced** at both decision points: the Command Center deploy button switches to a calm outcome-first `Fight anyway — recommended Power not met` state (silent within `READINESS.warnBelow` of the recommendation and right after a flawless clear — docs/PROGRESSION-LOOP.md §readiness), and the deployment interstitial carries the warning line. The attempt stays allowed — informed risk. | `config.CAMPAIGN_REWARDS.attemptFrac`, `meta.finishRun` (attemptBonus), `CommandCenter`/`DeployScreen` |
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

---

## 8. Molt cadence review (2026-11 — decided on evidence: NO knob change)

**Question:** docs/PROGRESSION_REPORT.md (generated 2026-07-11) read **8 Molts at 10h** —
prestige as a per-session action. Target: ~1–2 Molts in the first 10h, then about one per
several hours (levers: `PRESTIGE.molt.minCells`, `prestigeStageReq` growth).

**Re-measured on the current economy** (§4 protocol, `simulateAccount`, seeds `1000 + i·7919`):

| Policy (4 seeds × 40h) | Molts ≤10h | Molt hours (seed 0) | Cadence after the first |
|---|---|---|---|
| Loop-faithful bot | **2 / 2 / 2 / 2** | 2.25 · 8 · 12.25 · 17.75 · 24.75 · 28.75 · 33 | ≈ one per 4–5 h |
| Fresh Account persona | **2 / 1 / 1 / 1** | 3.5 · 10 · 21.75 · 27.75 · 36.5 | ≈ one per 6–10 h |

`npm run sim:progression -- --seeds 4 --hours 100` (loop-faithful): Molts p50 **2 @10h · 10 @50h
· 19 @100h** (≈ one per 5 h across the 10→100h span); stage p50 31 / 56 / 69.

**Decision:** the target already holds — the 8-at-10h figure was stale (it predates the
2026-07 economy rounds that moved stage@10h from ~72 to ~31). `minCells` stays 12 and the
linear `firstStage 10 / +3 per Molt` gate stays; changing either would only shift the
first-Molt plateau (stage ~24, ≈2.3h bot) without serving the milestone goal. **Guardrail
instead:** the CI pacing envelope (`progressionSim.test.ts`, pinned account) now pins the
contract — **≤2 Molts by 5h and ≤10 by 30h** (was ≤6 / ≤36, loose enough to let a per-session
rhythm back in unnoticed). The reveal timeline uses the same plateau: the deep-specialization
wings (Adaptation S24, Mulligans S25+) open around the first Molt (docs/PROGRESSION-GATING.md
§timeline).

---

## 9. Round 4 — BALANCE_REPORT №2 review (2026-11, persona matrix 11 × 5 × 400h)

The 2026-07 matrix (commit 6390559) left its findings report-only. This round ran §4 on today's
code (the 2026-11 batch: S4→S30 reveals, Boss Rush S12, the Stage 1–3 curve, 25 Rule Genes, Threat
rewards). **Every run here seeds the loot RNG** (`withSeededLoot`), so before/after columns are
common-random-number comparisons, not two luck draws.

### 9.1 The instrument was wrong first (five corrections, each tested)

| Defect | Evidence | Correction |
|---|---|---|
| Report `dead-zone` was a molt-BLIND copy of the detector (progressionSim's was fixed in §7, the report's never was) | Power is a sawtooth: each Molt resets the upgrade engine — ×3–5 at 10–50h, **×15–18 by 350h** (efficient seed 33676: 12.4M → 0.68M one run after a Molt). Unlucky 10→50h spanned 7 Molts, Campaign 150→400h 18 | one shared `isDeadProgression` (a band with a Molt is progress) |
| `power-spike` read checkpoint→checkpoint ratios — the same sawtooth, sampled at random phase | Campaign 50→150h read ×48.5 where its band PEAK grew ×13.3 (cohort ×9–15); Completionist 150→400h ×24.5 vs peak ×8.8 | `SimCheckpoint.peakPower` (highest post-run Power since the last checkpoint); spikes are peak-to-peak in both detectors; the report's pacing table picks the median seed by band peak |
| Loot RNG unseeded (`Math.random`) | two runs of the same code disagreed | `withSeededLoot` per (seed, persona) in `runMatrix` + `sim:progression` |
| The virtual player never synthesized a tower | 16 of 21 towers stayed locked for 400h with ~2,400 shards each at 120h; their ★0 slots dragged the towers Power geomean | `spendEverything` calls `unlockTower` |
| …nor spent Essence on Transcendence | the Essence wallet read as compounding with nothing to buy | first option on every maxed card |

Corrections 4–5 make the bot a truer player: the efficient cohort at 400h goes stage 136 → 151,
Molts 43 → 48, band-peak Power 12.6M → 33.6M, acquisitions 948 → 1,483. The CI envelope still holds
(≤2 Molts by 5h, ≤10 by 30h, pinned account). The loop-faithful 4 × 100h report now reads Molts
**2 @10h · 12 @50h · 24 @100h** (§8 measured 2 / 10 / 19 with the incomplete policy): still 1–2 in
the first 10h, then one per ~4h — the §8 contract holds, so no knob moves.

### 9.2 Verdict per original finding

| 6390559 finding | Verdict | Evidence (today's code, seeded) | Decision |
|---|---|---|---|
| Dead zone — Unlucky 10→50h (107,042 → 97,672) | **Artifact** (sawtooth) | the band holds 7 Molts; band peak ×2.4–3.2 on all 5 seeds; Unlucky tracks the cohort (final 400h: stage 149 vs efficient 151, Molts 47 vs 48) | no bad-luck change — the active `ECONOMY_ADAPTIVE` catch-up (§7) + loot pity already hold it on the curve |
| Dead zones — Campaign 10→50h / 150→400h, Lucky 50→150h | **Artifact** | every flagged band contains Molts (Campaign 150→400h: 18; 7.15M → 1.26M is a post-Molt checkpoint) | detector fixed |
| Power spike — Completionist 50→150h (×9.3 vs ×2.4) + 8 other spikes | **Artifact** | Completionist band-peak growth ×4.5–5.5 across seeds vs ×4.3–7.0 for the balanced personas; no Molt-chain discontinuity, nothing flattens afterwards | no payout smoothing |
| Futile frontier pushes — Campaign, all bands (#1 MAJOR) | **Real as feel, not as pacing** | 45–53% of under-ready attempts fail ≤150h, 71% at 150→400h (post-Molt readiness ≈ 0.1) — yet the persona LEADS the cohort (stage 143 vs 103 at 150h, 203 vs 151 at 400h) | see 9.3(e) — `attemptFrac` stays 0.25; evidence now shows the failure share |
| Unlock-cadence gap — Campaign 150→400h | **Instrument** | the bot never bought towers or Transcendence, so the meter had nothing to count | resolved by corrections 4–5 (no gap in the final matrix) |
| Engorged Reactor gene levels don't move Power | **Real** (display, not model) | the fields ARE weighted (overcharge 0.1/unit, reactor biomass 0.25), but ×1.005 × `GENE_POWER_SCALE` rounds away on a young account — 52 of 504 levels tripped `[power-audit]` | per-level floor, 9.3(b) |

### 9.3 Changes and non-changes (propose → simulate → record)

- **(a) Unlucky stall — no change.** Not real (9.2). Luck 0.8 lands at stage 149 vs the efficient
  cohort's 151 at 400h (Molts 47 vs 48; band-peak Power −13%) — the catch-up seam is doing its job.
- **(b) Gene Power floor — CHANGED.** `GENE_LEVEL_POWER_FLOOR = 0.0125` (geneCards.ts): every
  Power-visible level scores ≥ ×1.0125 on its card, so `POWER_BASE × GENE_POWER_SCALE × floor > 1`
  point on any account (other parts ≥ 1). 52 levels lift; maxed library ×3.078 → **×3.092** (the
  geneArchive.test ceiling 3.2 holds; `GENE_POWER_SCALE` untouched, so no existing level's Power
  falls). No constitution exemption needed — Rule 1 holds at the displayed integer, pinned by
  geneUpgrades.test for every level of every card.
- **(c) Completionist spike — no change.** Artifact (9.2).
- **(d) Sink exhaustion — CHANGED (smallest seam).** Measured: Cores never pile (Molt consumes
  them); within 400h Genome Samples sit at or under the remaining ★ need (★ tiers past the Evolution
  Cap wait on stages 120–300 — the EA audit's "bought out in tens of hours" predates both the cap and
  Prime). Past ~400h they don't: a 1,000h Lucky probe banked **384k Samples beyond every remaining ★**
  at stage 190 (Prime opens only at ★10 = stage 300). Container opens now treat a tower's grant past
  `max(bank, towerShardNeed)` (unlock + remaining ★ ladder; 0 at ★max) as duplicates → Gene Essence —
  the existing maxed-duplicate seam generalized, direct lanes still bank (PRIME-STRAINS §economy
  unchanged). Same probe after: surplus ≤ 500, stage 190 → 193, 100h band peaks equal or higher.
- **(e) Frontier futility — no change.** `attemptFrac` 0.25 → 0.5 (Campaign, 5 seeds × 150h, same
  seeds): stage +2 at 10–50h, washing out to ±1 by 150h (143 vs 142); failure share flat
  (45% → 50% at 10–50h, 53% → 52% at 50–150h). It does not improve pacing for a persona that already out-paces the
  loop-faithful cohort; the residual is the persona's risk appetite on an informed, paid gamble.

### 9.4 Matrix headline, before → after

Columns: the 6390559 report (unseeded, July code, its median seed); today's code under the July
instrument (seeded; the four personas not re-run there read "—"); the final code + corrected instrument
(seeded). Final band 400h (Fresh 10h); `st` stage · `m` Molts · `acq` acquisitions · `peak` the
cohort-median band-peak Power over 150→400h. `docs/BALANCE_REPORT.md` was rendered from the same
seeded traces (dense checkpoints proven checkpoint-for-checkpoint identical to `runMatrix`).

| Persona (final band) | 6390559 report (median seed) | Today, July instrument (cohort median) | Final (cohort median) |
|---|---|---|---|
| fresh | st 29 · m 1 · acq 257 | st 29 · m 1 · acq 246 · peak 59k | st 29 · m 1 · acq 310 · peak 79k |
| average | st 131 · m 41 · acq 852 | st 131 · m 41 · acq 925 · peak 12.4M | st 148 · m 47 · acq 1454 · peak 29.1M |
| efficient | st 136 · m 43 · acq 879 | st 136 · m 43 · acq 948 · peak 12.6M | st 151 · m 48 · acq 1483 · peak 33.6M |
| unlucky | st 133 · m 42 · acq 862 | st 130 · m 41 · acq 969 · peak 12.3M | st 149 · m 47 · acq 1480 · peak 29.2M |
| lucky | st 139 · m 44 · acq 1025 | — | st 157 · m 50 · acq 1499 · peak 36.3M |
| completionist | st 133 · m 42 · acq 905 | st 136 · m 43 · acq 956 · peak 12.5M | st 151 · m 48 · acq 1418 · peak 34.8M |
| infinite | st 127 · m 40 · acq 862 | — | st 139 · m 44 · acq 1348 · peak 24.1M |
| campaign | st 187 · m 60 · acq 1108 · fail 275 | st 187 · m 60 · acq 1098 · peak 25.1M · fail 265 | st 203 · m 65 · acq 1772 · peak 68.1M · fail 221 |
| heroes | st 136 · m 43 · acq 935 | st 136 · m 43 · acq 993 · peak 13.1M | st 154 · m 49 · acq 1436 · peak 34.7M |
| towers | st 133 · m 42 · acq 906 | — | st 151 · m 48 · acq 1456 · peak 34.7M |
| equipment | st 130 · m 41 · acq 861 | — | st 148 · m 47 · acq 1456 · peak 29.4M |

**Signals: 17 → 9 (July instrument, 7 personas re-run) → 3.** Dead zones 4 → 3 → **0**; power spikes
9 → 3 → **0**; unlock-cadence gaps 1 → 0 → **0**; push-futility 3 → 3 → 3 (Campaign — the recorded
risk-appetite residual, now with its failure share in the evidence). The pacing jump between columns 2
and 3 is the bot becoming a truer player (towers synthesized, Essence spent), not a balance buff: the
only shipped balance changes are the gene Power floor (display-level, +0.5% on a maxed library) and
the surplus conversion (no surplus within 400h for 9 of 11 personas; Lucky/Campaign medians 36 / 72 shards).

### 9.5 Watch items (open, by design)

- ~~**The Molt trough deepens with depth**~~ — **decided in §9.6** (the Molt Imprint).
- **Essence past ~700h.** With the surplus conversion the 1,000h probe's Essence pile reaches ~2.4M
  once all 131 cards are maxed + transcended. The bot models only gene levels + Transcendence;
  nucleus organs, hero symbiotes, Mulligans and Hive organs also spend Essence, and Gene Ascension
  tiers are the reserved repeatable sink.
- **Catalyst** idles in the sim (32k at 1,000h): the bot doesn't craft, and Prime opens at stage 300.

### 9.6 Decision — the MOLT IMPRINT bounds the trough (2026-11)

**The finding, re-measured per Molt.** §9.1's ×15–18 was read off checkpoints. Instrumenting every
Molt (Power just before it; Power after that spend pass, Ascendant buys included; frontier readiness;
hours until readiness ≥ 1 again) over 4 personas × 5 seeds × 400h (seeded, the §9 seeds
`2000 + i·7919`) shows a deeper hole: efficient **×7 → ×5 → ×5 → ×19 → ×35** by Molt-hour band
(0–10 / 10–50 / 50–150 / 150–350 / 350–400h), post-Molt readiness **0.05** late, ~20h per late
Molt before the frontier is playable again. Cause: the Genome engine is re-bought every cycle from
that cycle's Cores; a deep cycle owns 100–230 levels (×35+ Power) and the Molt hands back +1–2% damage
in cells for wiping them. The campaign persona, which pushes under-ready, ate it as a 71% late
failure share (readiness 0.01 after a late Molt).

**Mechanism (smallest seam, no save field).** A Molt keeps **round(level × imprint)** of every
Genome upgrade, `imprint = min(imprintMax 0.7, imprintPerMolt 0.0125 × Molts already done)`
(`PRESTIGE.molt`; `moltImprint` / `imprintedUpgrades` in core/prestige.ts; one `moltedSave` builder
in meta.ts serves the mint and `moltPowerPreview`). 0 on the first Molt — it resets exactly as
before. Derived from `prestige.molts`, so the save is unchanged (v55). The kept levels are the cheap
bottom of each geometric ladder: late Molts keep ~2/3 of the levels but only **13–40% of the Cores**
invested (efficient 350h+: 65% / 33%), so the re-climb still costs and the Molt is still a reset.
Help (`mechanics.ts` prestige row) and the Molt Chamber (KEEPS manifest + "Power before → after" in
the confirm) say so; docs/GENOME-CORE.md §molt-imprint is the canonical rule.

**Calibration (screened, then the full matrix).** A floored level share (`⌊L × r⌋`, cap 0.6) cut
the efficient late trough to ×4–5 (one-seed screen, stage @400h +2%) but zeroes every short ladder — a player who
spreads levels thinly keeps nothing — and leaves a fully-bought engine at ×16.6. **Rounding** fixes
the first (and brings the full engine to ×9.7 at 0.6); the **0.7 cap** fixes the second (a
fully-bought engine — every capped upgrade maxed + Runaway 40 — dips ×4.3 vs ×516 under a full
reset; pinned in `prestigeView.test.ts`). The cap is reached at Molt 56 (past 400h), so
it governs the long tail, not the 400h matrix. `+0.0125/Molt` keeps the first ~10 Molts nearly
untouched (the early rush) and tracks the trough's growth with depth.

**Before → after** (cohort medians, 5 seeds each; bands are Molt hours 0–10 / 10–50 / 50–150 /
150–350 / 350–400; `front` = hours from a Molt until frontier readiness ≥ 1 again, `cycle` = hours
to the next Molt, shown for 150–350 · 350–400h):

| Persona | Trough (pre ÷ post Power) | Post-Molt readiness | front / cycle h (late) | Molts @5/30/100/400h | Stage @100/400h | Late fail share |
|---|---|---|---|---|---|---|
| efficient before | ×7.1 / 5.1 / 4.8 / **18.6 / 35.0** | 0.26 / 0.36 / 0.32 / **0.09 / 0.05** | 11.9/14.4 · **20.2/21.9** | 1 / 6 / 24 / 49 | 84 / 154 | — |
| efficient after | ×7.1 / 4.3 / 3.0 / **3.3 / 3.3** | 0.26 / 0.44 / 0.52 / **0.47 / 0.52** | 9.7/10.4 · **10.8/11.2** | 1 / 6 / 24 / 51 | 89 / 160 (+3.9%) | — |
| average before | ×6.7 / 4.6 / 4.3 / **15.5 / 33.0** | 0.20 / 0.39 / 0.35 / **0.11 / 0.05** | 12.6/13.9 · **20.2/21.1** | 1 / 6 / 21 / 47 | 80 / 148 | — |
| average after | ×6.7 / 4.2 / 2.9 / **3.4 / 3.1** | 0.20 / 0.42 / 0.54 / **0.50 / 0.48** | 9.9/11.0 · **12.9/13.4** | 1 / 6 / 21 / 50 | 79 / 159 (+7.4%) | — |
| campaign before | ×6.6 / 4.2 / 9.1 / **34.3 / 39.5** | 0.27 / 0.29 / 0.13 / **0.02 / 0.01** | 10.9/10.9 · **15.6/15.6** | 1 / 11 / 38 / 64 | 123 / 201 | 71% |
| campaign after | ×6.6 / 3.1 / 3.1 / **2.6 / 2.7** | 0.27 / 0.39 / 0.38 / **0.21 / 0.11** | 9.4/9.4 · **13.6/13.6** | 1 / 12 / 40 / 71 | 127 / 221 (+10%) | 63% |
| unlucky before | ×7.1 / 5.3 / 4.8 / **14.2 / 33.0** | 0.27 / 0.33 / 0.31 / **0.10 / 0.05** | 11.7/13.6 · **21.2/21.9** | 1 / 6 / 22 / 47 | 86 / 149 | — |
| unlucky after | ×7.1 / 4.6 / 3.1 / **3.3 / 3.1** | 0.27 / 0.39 / 0.50 / **0.45 / 0.46** | 9.7/10.6 · **12.3/12.7** | 1 / 6 / 22 / 50 | 88 / 159 (+6.7%) | — |

Cells minted barely move (efficient lifetime cells @400h 913 → 924): shorter cycles mint fewer cells
each, so the prestige multiplier keeps its meaning; band-peak Power 150→400h rises 34M → 53M because
the engine no longer restarts from zero. The CI pacing envelope's pinned account is unchanged
(1 Molt by 5h, 6 by 30h, before and after); goldens byte-identical (a fresh save never Molts).

**Reading the targets honestly.**
- *Trough ≤ ~×5 at every depth:* met from 10h on (medians ×2.6–4.6; p90 ≤ ×3.8 past 50h). The 0–10h band (Molts 1–2) stays ×7 —
  by design: the first Molt is untouched and the second keeps 1.25% (rounded: nothing on a 10-level
  ladder); those cycles are 4–6h with ~3h of rebuild. The deepening — the actual defect — is gone.
- *Late post-Molt readiness ≥ ~0.3:* met for the loop-faithful personas (0.47–0.52). The campaign
  persona reads 0.11–0.21 because it Molts already under-ready (it pushes at readiness ~0.3, the
  dip is ×2.7); its failure share falls 71% → 63%.
- *Rebuild ≤ ~half a cycle:* **as a share, no mechanism that keeps the Molt a reset can get there
  — and the data says it is the wrong ruler.** The bot Molts the moment the +3-stage gate opens, so
  every cycle is "farm back to the frontier → a short 3-stage burst → Molt": front/cycle reads
  ~0.95 before AND after, and the pre-Molt peak (which overshoots the gate) is often never regained
  before the next Molt in either world. The Imprint halves the absolute cost instead: a late Molt
  now costs **~11–13h** of frontier-less farming vs **~20–21h** — about half the old cycle — and the
  loop-faithful personas' late cycles run 11–13h instead of 21–22h.
- *Pacing:* efficient stage @400h +3.9% (Molts 49 → 51), average +7.4%, unlucky +6.7%. **Flag:**
  campaign +10% (201 → 221, Molts 64 → 71) — the persona the trough hurt most; its gain is the failure share
  falling, not a faster loop for everyone. No knob moves for it; re-check at the next matrix.

**Not regenerated here:** docs/BALANCE_REPORT.md / docs/PROGRESSION_REPORT.md still show the pre-Imprint
sawtooth (their next regeneration will read shallower post-Molt checkpoints and higher band peaks).

---

## 10. Round 5 — the grind (2026-11, audit tracks G1/G2 → GM2)

Measured with the audit harnesses (progression sim `average`/`efficient` × 3 seeds × 400h, seeded
loot; G1's real-run harness on frozen 1h–100h accounts); no save field, goldens untouched.

| Finding | Change | Before → after |
|---|---|---|
| Gear chase ends ~hour 3 (ilvl = Power-linear, capped 30; 4–6 Rampant/Apex per hour forever; T6 unreachable) | `ITEM_LEVEL_CURVE` (depth, log, uncapped) + `GEAR_RARITY_BANDS` (docs/EQUIPMENT.md §gear-chase) | Rampant+Apex/h 4–5.5 → 0–2.5 rising with depth; T6 drops 0 → ~3.5/h from 150h; upgrades/h ×1.5–5 in 3–150h, still ~0 deep (def-base dominance — next lever noted there) |
| Every Mega stage a ~day-long wall (readiness ×1.89 step) | `C.megaStagePremium` 1.8 → 1.15 after measuring mega vs mega-suppressed win rates (9/18 vs 9/18) + the Mega Hunt (docs/MEGA-BOSS.md §hunt) | dwell before S80/S90: 18.4/26.2 h → 6.1/5.8 h (average) |
| Boss Rush has no wall for real accounts | geometric `rushStrength` past wave 10, Power-sized boss HP, the column doesn't wait (docs/BOSS-RUSH.md §wall) | 8h–100h: wave 28–36 at the 30-min cap → falls at waves 7–16 (medians 9–10) in ~4–7 min |
| Pacing contract | — | stage @100h 80 → 81 / 89 → 86; @400h 159 → 160 / 160 → 169; Molts @400h 50 → 51 / 51 → 54; CI envelope (≤2 Molts by 5h, ≤10 by 30h) holds |

Watch: the efficient persona's +9 stages @400h (the premium change alone reads +9 too — a lower bar
compounds); band-peak Power reads ~30% lower at 3–250h because gear no longer front-loads, which is
the intended curve (stage pacing, not the Power number, is the contract).

