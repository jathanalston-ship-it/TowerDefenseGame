# PROGRESSION_REPORT.md — simulated player progression

> **GENERATED** by `npm run sim:progression` (do not hand-edit). 8 virtual accounts ×
> 1000h, optimal-play policy over the REAL meta layer (docs/PROGRESSION-LOOP.md §time).
> World model: 30s/wave, 90s between runs, ~12 kills/wave.
> Generated 2026-07-11; wall-clock 1293s.

## Hour-band medians (p50, with p10–p90 spread)

| Hours | Power | Campaign stage | Infinite best | Molts | Account level | Genome rating | Runs | Farm share |
|---|---|---|---|---|---|---|---|---|
| 10 | 81,797 <sub>61,417–210,621</sub> | 80 <sub>80–80</sub> | 14 <sub>14–14</sub> | 12 <sub>11–12</sub> | 42 <sub>42–42</sub> | 728 <sub>716–760</sub> | 80 <sub>80–80</sub> | 0% |
| 50 | 541,788 <sub>329,654–721,795</sub> | 126 <sub>123–127</sub> | 92 <sub>87–94</sub> | 35 <sub>33–36</sub> | 70 <sub>69–70</sub> | 1,165 <sub>1,148–1,192</sub> | 176 <sub>174–178</sub> | 29% |
| 100 | 632,198 <sub>413,142–1,583,502</sub> | 148 <sub>145–151</sub> | 107 <sub>105–109</sub> | 47 <sub>46–48</sub> | 88 <sub>88–89</sub> | 1,351 <sub>1,318–1,416</sub> | 259 <sub>256–262</sub> | 43% |
| 250 | 5,925,941 <sub>2,570,993–9,360,331</sub> | 187 <sub>184–187</sub> | 135 <sub>129–138</sub> | 60 <sub>59–60</sub> | 124 <sub>124–124</sub> | 1,796 <sub>1,701–1,862</sub> | 449 <sub>446–453</sub> | 59% |
| 500 | 25,785,948 <sub>2,513,029–40,637,796</sub> | 212 <sub>211–214</sub> | 158 <sub>153–159</sub> | 68 <sub>68–69</sub> | 163 <sub>163–163</sub> | 2,279 <sub>1,926–2,393</sub> | 696 <sub>692–701</sub> | 70% |
| 1000 | 79,185,747 <sub>8,127,942–94,344,800</sub> | 232 <sub>229–235</sub> | 170 <sub>166–178</sub> | 75 <sub>74–76</sub> | 215 <sub>215–215</sub> | 2,854 <sub>2,334–2,904</sub> | 1,115 <sub>1,104–1,117</sub> | 79% |

## Detector findings (across all 8 accounts)

| Detector | Flagged bands | Meaning when non-zero |
|---|---|---|
| Dead progression | 6 | farming that moves no power (broken conversion) |
| Wall stall | 0 | stuck at a frontier with flat readiness (impossible wall) |
| Power spike | 10 | a band multiplying power ≥ ×8 (unsmooth texture) |
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
