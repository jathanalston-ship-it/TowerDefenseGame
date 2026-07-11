# PROGRESSION_REPORT.md — simulated player progression

> **GENERATED** by `npm run sim:progression` (do not hand-edit). 8 virtual accounts ×
> 1000h, optimal-play policy over the REAL meta layer (docs/PROGRESSION-LOOP.md §time).
> World model: 30s/wave, 90s between runs, ~12 kills/wave.
> Generated 2026-07-11; wall-clock 1076s.

## Hour-band medians (p50, with p10–p90 spread)

| Hours | Power | Campaign stage | Infinite best | Molts | Account level | Genome rating | Runs | Farm share |
|---|---|---|---|---|---|---|---|---|
| 10 | 71,974 <sub>45,653–160,505</sub> | 72 <sub>70–76</sub> | 51 <sub>46–59</sub> | 8 <sub>7–9</sub> | 40 <sub>39–41</sub> | 703 <sub>690–736</sub> | 75 <sub>73–78</sub> | 4% |
| 50 | 376,916 <sub>134,593–401,884</sub> | 118 <sub>112–119</sub> | 88 <sub>85–91</sub> | 27 <sub>26–28</sub> | 68 <sub>67–68</sub> | 1,088 <sub>1,048–1,093</sub> | 175 <sub>171–179</sub> | 33% |
| 100 | 544,427 <sub>321,584–1,033,942</sub> | 130 <sub>130–133</sub> | 98 <sub>93–99</sub> | 41 <sub>41–42</sub> | 86 <sub>86–86</sub> | 1,267 <sub>1,237–1,314</sub> | 254 <sub>251–260</sub> | 49% |
| 250 | 3,370,456 <sub>1,140,744–7,694,263</sub> | 178 <sub>178–181</sub> | 130 <sub>128–135</sub> | 57 <sub>57–58</sub> | 124 <sub>123–124</sub> | 1,700 <sub>1,609–1,811</sub> | 463 <sub>456–469</sub> | 62% |
| 500 | 26,404,478 <sub>7,831,378–28,057,099</sub> | 205 <sub>205–208</sub> | 154 <sub>152–157</sub> | 66 <sub>66–67</sub> | 162 <sub>162–162</sub> | 2,264 <sub>2,056–2,277</sub> | 715 <sub>709–718</sub> | 71% |
| 1000 | 34,462,217 <sub>31,339,617–49,787,445</sub> | 229 <sub>229–229</sub> | 168 <sub>165–172</sub> | 74 <sub>74–74</sub> | 215 <sub>215–215</sub> | 2,595 <sub>2,574–2,698</sub> | 1,146 <sub>1,136–1,149</sub> | 80% |

## Detector findings (across all 8 accounts)

| Detector | Flagged bands | Meaning when non-zero |
|---|---|---|
| Dead progression | 0 | farming that moves no power (broken conversion) |
| Wall stall | 0 | stuck at a frontier with flat readiness (impossible wall) |
| Power spike | 8 | a band multiplying power ≥ ×8 (unsmooth texture) |
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
