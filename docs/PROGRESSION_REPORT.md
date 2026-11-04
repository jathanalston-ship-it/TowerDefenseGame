# PROGRESSION_REPORT.md — simulated player progression

> **GENERATED** by `npm run sim:progression` (do not hand-edit). 4 virtual accounts ×
> 100h, optimal-play policy over the REAL meta layer (docs/PROGRESSION-LOOP.md §time).
> World model: 30s/wave, 90s between runs, ~12 kills/wave.
> Generated 2026-11-03; wall-clock 163s.

## Hour-band medians (p50, with p10–p90 spread)

| Hours | Power | Campaign stage | Infinite best | Molts | Account level | Genome rating | Runs | Farm share |
|---|---|---|---|---|---|---|---|---|
| 10 | 44,397 <sub>28,603–62,372</sub> | 31 <sub>30–31</sub> | 67 <sub>57–68</sub> | 2 <sub>2–2</sub> | 32 <sub>32–32</sub> | 533 <sub>524–543</sub> | 46 <sub>46–47</sub> | 35% |
| 50 | 164,084 <sub>104,226–178,157</sub> | 56 <sub>55–57</sub> | 81 <sub>78–85</sub> | 10 <sub>10–10</sub> | 60 <sub>60–60</sub> | 866 <sub>855–871</sub> | 134 <sub>131–136</sub> | 59% |
| 100 | 392,005 <sub>121,542–528,249</sub> | 69 <sub>69–69</sub> | 93 <sub>90–96</sub> | 19 <sub>19–20</sub> | 79 <sub>79–79</sub> | 1,066 <sub>1,023–1,088</sub> | 218 <sub>212–218</sub> | 68% |

## Detector findings (across all 4 accounts)

| Detector | Flagged bands | Meaning when non-zero |
|---|---|---|
| Dead progression | 0 | farming that moves no power (broken conversion) |
| Wall stall | 0 | stuck at a frontier with flat readiness (impossible wall) |
| Power spike | 0 | a band multiplying power ≥ ×8 (unsmooth texture) |
| Sink exhaustion | 0 | currency compounding with nothing to buy |

## Observations for the balance milestone

- **Pacing under optimal play** is the headline number to judge: the stage/hour and molt
  cadence above assume a frictionless spender who always follows the loop directive. Real
  players run slower; the gap is the design margin.
- **Molt cadence**: molts-per-band shows how often the prestige ring cycles. If it reads like
  a per-session action rather than a milestone, raise `PRESTIGE.molt.minCells` /
  `prestigeStageReq` growth — decide on this evidence, then re-run this report.
- **Farm share** rises with hours as walls thicken (geometric bar vs logarithmic reach) —
  the loop working as designed. A farm share stuck at 0% deep would mean requirements are
  too soft; near 100% early would mean walls form too soon.
- Detector zeros above are the structural guarantees holding (no dead zones, no impossible
  walls, no sink explosions) — they are also asserted at small scale in CI
  (`src/dev/progressionSim.test.ts`).

*Scale note:* thousands of accounts = `npm run sim:progression -- --seeds 2000` (runtime
scales linearly; the policy is deterministic per seed except loot RNG).
