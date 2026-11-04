# PROGRESSION_REPORT.md — simulated player progression

> **GENERATED** by `npm run sim:progression` (do not hand-edit). 4 virtual accounts ×
> 100h, optimal-play policy over the REAL meta layer (docs/PROGRESSION-LOOP.md §time).
> World model: 30s/wave, 90s between runs, ~12 kills/wave.
> Generated 2026-11-04; wall-clock 316s.

## Hour-band medians (p50, with p10–p90 spread)

| Hours | Band-peak power | Power at checkpoint | Campaign stage | Infinite best | Molts | Account level | Genome rating | Runs | Farm share |
|---|---|---|---|---|---|---|---|---|---|
| 10 | 112,545 <sub>92,793–137,701</sub> | 58,414 <sub>31,593–99,467</sub> | 33 <sub>30–37</sub> | 67 <sub>61–68</sub> | 2 <sub>2–3</sub> | 32 <sub>32–33</sub> | 551 <sub>528–564</sub> | 47 <sub>45–51</sub> | 33% |
| 50 | 516,313 <sub>456,867–578,792</sub> | 258,198 <sub>142,159–271,088</sub> | 67 <sub>66–69</sub> | 90 <sub>87–93</sub> | 12 <sub>12–13</sub> | 61 <sub>61–61</sub> | 945 <sub>934–952</sub> | 139 <sub>138–141</sub> | 52% |
| 100 | 1,167,164 <sub>1,098,999–1,223,648</sub> | 716,123 <sub>549,943–1,079,753</sub> | 86 <sub>80–88</sub> | 105 <sub>98–105</sub> | 24 <sub>22–24</sub> | 81 <sub>81–81</sub> | 1,186 <sub>1,180–1,225</sub> | 223 <sub>214–225</sub> | 62% |

## Detector findings (across all 4 accounts)

| Detector | Flagged bands | Meaning when non-zero |
|---|---|---|
| Dead progression | 0 | farming that moves no power (broken conversion) |
| Wall stall | 0 | stuck at a frontier with flat readiness (impossible wall) |
| Power spike | 0 | a band whose PEAK Power is ≥ ×8 the previous band's peak (unsmooth texture) |
| Sink exhaustion | 0 | currency compounding with nothing to buy |

## Observations for the balance milestone

- **Pacing under optimal play** is the headline number to judge: the stage/hour and molt
  cadence above assume a frictionless spender who always follows the loop directive. Real
  players run slower; the gap is the design margin.
- **Molt cadence**: molts-per-band shows how often the prestige ring cycles. If it reads like
  a per-session action rather than a milestone, raise `PRESTIGE.molt.minCells` /
  `prestigeStageReq` growth — decide on this evidence, then re-run this report.
- **Power is a sawtooth across Molts** (each one resets the upgrade engine): read growth from the
  band-peak column; checkpoint Power lands at an arbitrary phase of the current Molt cycle.
- **Farm share** rises with hours as walls thicken (geometric bar vs logarithmic reach) —
  the loop working as designed. A farm share stuck at 0% deep would mean requirements are
  too soft; near 100% early would mean walls form too soon.
- Detector zeros above are the structural guarantees holding (no dead zones, no impossible
  walls, no sink explosions) — they are also asserted at small scale in CI
  (`src/dev/progressionSim.test.ts`).

*Scale note:* thousands of accounts = `npm run sim:progression -- --seeds 2000` (runtime
scales linearly; policy and loot RNG are both seeded per account, so the report is reproducible).
