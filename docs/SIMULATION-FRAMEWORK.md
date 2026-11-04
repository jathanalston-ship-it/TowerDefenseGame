# SIMULATION FRAMEWORK — the permanent progression-health instrument

> **This is infrastructure, not balancing.** The framework simulates player personas over
> the REAL meta layer, measures pacing/dopamine/economy health, detects bottlenecks
> automatically, and writes `docs/BALANCE_REPORT.md`. It **never rebalances anything** —
> every finding is a candidate for human review, and changes still go through the protocol
> in docs/BALANCE_ARCHITECTURE.md §4 (propose → simulate before/after → check invariants →
> record). The instrument remains in the project permanently and runs as a regression
> gauge after every major system or content addition.

Files: `src/dev/personas.ts` (the persona roster) · `src/dev/progressionSim.ts` (the
virtual-account engine — persona-aware) · `src/dev/balanceReport.ts` (matrix runner,
bottleneck detectors, report renderer) · `scripts/sim-balance-report.ts` (`npm run
sim:report`). CI pins: `src/dev/balanceReport.test.ts` (instrument),
`src/dev/progressionSim.test.ts` (pacing envelope). Related: `npm run sim:progression`
(the single-policy hour-band pacing report, docs/PROGRESSION_REPORT.md).

---

## 1. How it works

**Real-economy principle:** virtual accounts call `meta.finishRun`, `meta.openContainer`
and the real spend APIs — there is no duplicate economy model to drift. Only the *run
itself* is modeled (the `WORLD` constants: wave length, kills, menu overhead).

**Personas are policy modulations**, never balance changes (`personas.ts`):

| Persona | Deviation from the loop-faithful optimum |
|---|---|
| Fresh | 10h horizon; 50% spend-skip; long menus |
| Average | 25% spend-skip; slightly long menus |
| Efficient | None — the historical baseline policy |
| Unlucky / Lucky | Loot-feeding kills ×0.8 / ×1.25 |
| Completionist | Deeper gene buying; heavier menus |
| Infinite-focused | Farms Infinite 60% of the time even when the campaign is ready |
| Campaign-focused | Pushes the frontier under-ready 50% of the time — **failures cost the run** |
| Hero-/Tower-focused | Off-track star buys capped per pass (neglect, not reordering — the tracks spend separate wallets) |
| Equipment-focused | Extra Infinite (35%) chasing containers |

**Measured per band** (`SimCheckpoint`): Power, campaign stage, best wave, molts,
runs/farm-runs, frontier readiness, unspent Genome Cores, **cumulative acquisitions**
(`progressSignature` — every star/upgrade/hero/molt/gene level/**Adaptation pick**/stage/
feat counts one "dopamine moment"), and **failed frontier pushes**. The virtual player
spends every wallet the game has, including Antigen (Adaptation picks in tier order) and
Tower Shards on **expansion-tower synthesis** (`unlockTower` — added 2026-11: the policy predated
the expansion roster, so 16 of 21 towers stayed locked forever, their shards read as sink
exhaustion and their ★0 slots dragged the towers Power geomean) — an unspent system would make
the deep band read emptier than the game actually is.

## 2. Bottleneck detectors (`balanceReport.ts`)

Each fires per persona-band across seeds; frequency across seeds drives severity +
confidence. Kinds: `dead-zone` (farming moves no power **and no Molt landed** — the shared
`isDeadProgression` predicate; Power is a sawtooth across Molts, so a post-Molt trough is not a
stall) · `wall-stall` (frontier +
readiness flat) · `dopamine-gap` (< 0.5 acquisitions/hour) · `sink-exhaustion` (Cores
compound unspent) · `currency-shortage` (broke AND walled) · `power-spike`
(**cohort-relative discontinuity**: a seed's band growth > 3× its cohort's median for the
same band — curve-following growth never flags, and single-seed cohorts cannot flag) ·
`grind-saturation` (> 90% farm share) · `push-futility` (≥ 3 failed pushes).

Ranking `score = frequency × bandWeight × kindWeight` — the first 50 hours weigh 1.5×
(retention shapes hardest early); structural kinds (walls, dead zones, shortages) weigh
above texture kinds (spikes, grind). Severity: critical ≥ 66% of seeds on a structural
kind; major ≥ 33%; else minor. Confidence: High ≥ 75% across ≥ 4 seeds.

Every kind carries a human-review **diagnosis** (root cause, affected systems, 2–3
candidate directions, implementation difficulty) — the `DIAGNOSIS` rule table. Candidate
directions deliberately point at the adaptive seams (`DIRECTOR_ADAPTIVE` — still weight-0;
`ECONOMY_ADAPTIVE` — activated 2026-07, BALANCE_ARCHITECTURE.md §7) where those are the right
lever: the seams exist precisely to be tuned on simulator evidence.

## 3. Running it

```
npm run sim:report                     # default: 11 personas × 5 seeds × 400h bands
npm run sim:report -- --seeds 8 --hours 1000   # heavier evidence run
```

**Reproducible (2026-11):** the policy RNG was always seeded per account; the meta loot layer
rolls `Math.random`, which `runMatrix` now pins per (seed, persona) via `withSeededLoot` — the same
code on the same matrix renders the same report, so a before/after diff measures the balance change,
not two different luck draws (common random numbers). `sim:progression` seeds the same way.

Writes `docs/BALANCE_REPORT.md`: persona table → median pacing per persona → **top-20
bottlenecks** (severity, confidence, frustration, root cause, systems, data, candidate
fixes, difficulty) → methodology + caveats. The report is GENERATED — never hand-edit;
regenerate after any change that touches progression, economy, or content volume.

## 4. Extending the instrument

- **New persona:** one row in `PERSONAS` (knobs only — if a behavior needs a new knob, add
  it to `Persona` and thread it in `simulateAccount`'s decision block).
- **New metric:** add the field to `SimCheckpoint`, fill it at the snapshot site, done —
  existing consumers ignore unknown fields.
- **New detector:** one `hit(kind, predicate, evidence)` call in `detectBottlenecks` + a
  `DIAGNOSIS` row + a `KIND_WEIGHT`/`FRUSTRATION` entry. The report picks it up unchanged.
- **New content/systems:** nothing to do — the engine drives the real meta layer, so new
  towers/heroes/cards/currencies flow through automatically. If a new system adds a spend
  API, teach `spendEverything` to buy it (one guarded loop).

## 5. Invariants (CI pins)

1. The persona roster covers the spec (fresh/average/efficient/unlucky/lucky/
   completionist/infinite/campaign/heroes/towers/equipment); `efficient` reproduces the
   historical loop-faithful policy exactly (the pacing envelope stays comparable).
2. `fresh` caps its horizon; the loop-faithful policy never fails a push; the acquisition
   ledger is monotonic. (Pacing/power comparisons are NOT CI-pinned — they belong to the
   report's multi-seed medians; the loot RNG is seeded, so those medians are reproducible.)
3. Detectors fire deterministically on synthetic pathological traces and stay silent on
   healthy ones; results sort by score.
4. Every bottleneck kind carries a complete diagnosis; the report renders report-only
   language and caps at top-20.
