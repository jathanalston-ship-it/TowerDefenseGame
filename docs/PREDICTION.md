# Progress Prediction

An intelligent, self-calibrating estimate of how far an account can expect to reach — **estimates,
never guarantees**. Shown on the Campaign and Infinite screens; it makes progression goals legible
without removing player agency.

## Model (`core/predict.ts`, pure)

The account's **Power Score multiple** is the universal strength axis. The base estimate is
`floor + reach`, where `reach = K · log2(1 + powerMult) / difficultyMult` (K = 6 stages / 9 waves per
power doubling), floored at "one past your deepest clear" (campaign) or "near your best wave"
(infinite). Harder difficulty lowers the reach.

- **Confidence** (`Low`/`Medium`/`High`) grows with the number of calibration samples; the range band
  tightens with it.
- **Trend** (`↑ Improving` / `→ Stable` / `↓ Underpowered`) compares current power to the power at the
  last calibration.
- **Recommendations** (≤2, `meta` `predictionRecommendations`): surface the weakest lever —
  "Campaign progression recommended", "Tower Stars will significantly improve success", "Equipment
  quality is below expected", "Consider Prestiging". Guidance, never a command.

## Self-improvement

Per-mode calibration lives on the save (`prediction.{campaign,infinite}` — additive, golden-safe):
`{ bias, samples, lastEstimate, prevPowerMult }`.

1. On run START the Play screen calls `meta.notePredictionBaseline(mode, difficulty)`, storing the
   shown estimate.
2. On run END `finishRun` calls `calibrate(...)`: `bias += (actual − lastEstimate) · LEARN_RATE`,
   `samples++`. The base model's error is corrected over time, so predictions **quietly get more
   accurate** the more you play (unit-pinned in `predict.test.ts`).

## Signals considered
Power Score, Tower Stars + Mastery, Hero strength, Equipment, Prestige, permanent upgrades (all folded
into Power Score), difficulty, and **historical performance** (deepest cleared / best wave + the
learned bias). Pure over `SaveData` — never touches the sim, so goldens stay byte-identical.

## Visual
`ui/PredictionPanel.tsx` — a futuristic readout: `≈ N`, a confidence chip, a trend arrow, an animated
range band with a pulsing estimate marker, and the recommendation list.
