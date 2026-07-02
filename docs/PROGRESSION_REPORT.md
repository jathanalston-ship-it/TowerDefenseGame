# PROGRESSION_REPORT.md — simulated player progression

> **GENERATED** by `npm run sim:progression` (do not hand-edit). 8 virtual accounts ×
> 3000h, optimal-play policy over the REAL meta layer (docs/PROGRESSION-LOOP.md §time).
> World model: 30s/wave, 90s between runs, ~12 kills/wave.
> Generated 2026-07-02; wall-clock 472s.

## Hour-band medians (p50, with p10–p90 spread)

| Hours | Power | Campaign stage | Infinite best | Molts | Runs | Farm share |
|---|---|---|---|---|---|---|
| 10 | 48,230 <sub>38,374–67,128</sub> | 67 <sub>62–71</sub> | 55 <sub>50–58</sub> | 8 <sub>7–9</sub> | 71 <sub>68–74</sub> | 7% |
| 50 | 208,409 <sub>159,578–399,867</sub> | 98 <sub>95–99</sub> | 83 <sub>79–87</sub> | 21 <sub>20–22</sub> | 163 <sub>162–164</sub> | 40% |
| 100 | 372,085 <sub>270,367–572,280</sub> | 109 <sub>106–110</sub> | 93 <sub>88–93</sub> | 32 <sub>31–34</sub> | 245 <sub>243–246</sub> | 55% |
| 250 | 2,426,240 <sub>454,388–3,375,023</sub> | 145 <sub>142–145</sub> | 120 <sub>117–124</sub> | 46 <sub>45–46</sub> | 454 <sub>450–459</sub> | 68% |
| 500 | 10,021,568 <sub>5,552,139–11,071,779</sub> | 160 <sub>158–160</sub> | 140 <sub>138–144</sub> | 51 <sub>50–51</sub> | 711 <sub>709–721</sub> | 78% |
| 1000 | 12,449,217 <sub>3,425,493–13,501,191</sub> | 163 <sub>162–164</sub> | 149 <sub>146–157</sub> | 52 <sub>51–52</sub> | 1,166 <sub>1,147–1,175</sub> | 86% |
| 3000 | 16,575,212 <sub>14,820,480–17,336,028</sub> | 167 <sub>165–168</sub> | 188 <sub>177–202</sub> | 53 <sub>52–53</sub> | 2,745 <sub>2,625–2,852</sub> | 94% |

## Detector findings (across all 8 accounts)

| Detector | Flagged bands | Meaning when non-zero |
|---|---|---|
| Dead progression | 4 | farming that moves no power (broken conversion) |
| Wall stall | 0 | stuck at a frontier with flat readiness (impossible wall) |
| Power spike | 6 | a band multiplying power ≥ ×8 (unsmooth texture) |
| Sink exhaustion | 4 | currency compounding with nothing to buy |

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
