# PROGRESSION_REPORT.md — simulated player progression

> **GENERATED** by `npm run sim:progression` (do not hand-edit). 8 virtual accounts ×
> 3000h, optimal-play policy over the REAL meta layer (docs/PROGRESSION-LOOP.md §time).
> World model: 30s/wave, 90s between runs, ~12 kills/wave.
> Generated 2026-07-02; wall-clock 477s.

## Hour-band medians (p50, with p10–p90 spread)

| Hours | Power | Campaign stage | Infinite best | Molts | Runs | Farm share |
|---|---|---|---|---|---|---|
| 10 | 58,550 <sub>37,719–145,112</sub> | 70 <sub>66–70</sub> | 55 <sub>53–60</sub> | 31 <sub>30–31</sub> | 73 <sub>71–73</sub> | 4% |
| 50 | 398,264 <sub>240,532–676,283</sub> | 114 <sub>114–114</sub> | 93 <sub>87–95</sub> | 40 <sub>40–40</sub> | 172 <sub>170–174</sub> | 34% |
| 100 | 1,904,951 <sub>181,199–2,322,179</sub> | 133 <sub>133–140</sub> | 111 <sub>106–113</sub> | 43 <sub>43–44</sub> | 251 <sub>247–255</sub> | 47% |
| 250 | 7,097,288 <sub>6,300,736–7,624,574</sub> | 153 <sub>151–154</sub> | 135 <sub>132–137</sub> | 45 <sub>45–45</sub> | 421 <sub>419–425</sub> | 64% |
| 500 | 8,578,354 <sub>7,344,710–9,077,492</sub> | 156 <sub>153–157</sub> | 139 <sub>136–144</sub> | 46 <sub>45–46</sub> | 661 <sub>657–665</sub> | 76% |
| 1000 | 10,093,081 <sub>9,413,811–10,607,937</sub> | 159 <sub>158–160</sub> | 147 <sub>144–151</sub> | 46 <sub>46–46</sub> | 1,115 <sub>1,103–1,126</sub> | 86% |
| 3000 | 11,722,874 <sub>11,346,416–12,051,602</sub> | 161 <sub>161–162</sub> | 187 <sub>167–191</sub> | 46 <sub>46–46</sub> | 2,783 <sub>2,653–2,806</sub> | 94% |

## Detector findings (across all 8 accounts)

| Detector | Flagged bands | Meaning when non-zero |
|---|---|---|
| Dead progression | 1 | farming that moves no power (broken conversion) |
| Wall stall | 0 | stuck at a frontier with flat readiness (impossible wall) |
| Power spike | 5 | a band multiplying power ≥ ×8 (unsmooth texture) |
| Sink exhaustion | 16 | currency compounding with nothing to buy |

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
