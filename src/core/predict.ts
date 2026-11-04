// Progress prediction (docs/PREDICTION.md) — a pure, self-calibrating estimator of how far an account
// is expected to reach in Campaign (stage) and Infinite (wave), from its strength signals. It gives
// intelligent ESTIMATES, never guarantees: a base model over Power Score + history, corrected by a
// learned per-mode bias that quietly improves as real results come in. No DOM/save/sim imports.

import { POWER_BASE } from './power';
import { RUSH } from './config';

/** Persisted, self-improving calibration for one prediction channel (campaign | infinite). */
export interface PredictCalib {
  bias: number; // additive correction learned from (actual − estimate); 0 for a fresh account
  samples: number; // how many runs have calibrated this channel (drives confidence)
  lastEstimate: number; // the estimate shown at the last run's START (compared at run end)
  prevPowerMult: number; // account power at the last calibration (drives the trend arrow)
}

export function defaultCalib(): PredictCalib {
  return { bias: 0, samples: 0, lastEstimate: 0, prevPowerMult: 1 };
}

export type Confidence = 'Low' | 'Medium' | 'High';
export type Trend = 'up' | 'stable' | 'down';

export interface Prediction {
  estimate: number; // the headline "≈ N"
  low: number; // range band (confidence-scaled)
  high: number;
  confidence: Confidence;
  trend: Trend;
}

// Tunables (placeholder balance; the calibration bias corrects the base over time).
const POW_TO_STAGE = 6; // stages per doubling of power
const POW_TO_WAVE = 9; // infinite waves per doubling of power
const LEARN_RATE = 0.35; // how fast the bias tracks new results

/** log2(1 + x), guarded ≥ 0. The universal "how many doublings of power" axis. */
function doublings(powerMult: number): number {
  return Math.max(0, Math.log2(1 + Math.max(0, powerMult)));
}

function confidenceOf(samples: number): Confidence {
  return samples >= 8 ? 'High' : samples >= 3 ? 'Medium' : 'Low';
}

/** Band half-width as a fraction of the estimate — wider when we've seen fewer results. */
function bandFrac(conf: Confidence): number {
  return conf === 'High' ? 0.08 : conf === 'Medium' ? 0.16 : 0.28;
}

function trendOf(powerMult: number, prevPowerMult: number): Trend {
  if (powerMult > prevPowerMult * 1.02) return 'up'; // getting stronger since last time
  if (powerMult < prevPowerMult * 0.98) return 'down';
  return 'stable';
}

function assemble(raw: number, floor: number, calib: PredictCalib, powerMult: number): Prediction {
  const estimate = Math.max(floor, Math.round(raw + calib.bias));
  const conf = confidenceOf(calib.samples);
  const half = Math.max(1, Math.round(estimate * bandFrac(conf)));
  return {
    estimate,
    low: Math.max(floor, estimate - half),
    high: estimate + half,
    confidence: conf,
    trend: trendOf(powerMult, calib.prevPowerMult),
  };
}

/** Estimated deepest Campaign STAGE the account can expect to reach. Floors at "one past what you've
 *  already cleared" (you can always push a little further), then adds the power-driven reach. */
export function predictCampaign(powerMult: number, clearedStage: number, difficultyMult: number, calib: PredictCalib): Prediction {
  const reach = (POW_TO_STAGE * doublings(powerMult)) / Math.max(1, difficultyMult);
  const raw = Math.max(clearedStage + 1, 4 + reach);
  return assemble(raw, clearedStage + 1, calib, powerMult);
}

/** Estimated Infinite WAVE the account can expect to hold to. Floors near your best wave so far. */
export function predictInfinite(powerMult: number, bestWave: number, difficultyMult: number, calib: PredictCalib): Prediction {
  const reach = (POW_TO_WAVE * doublings(powerMult)) / Math.max(1, difficultyMult);
  const raw = Math.max(bestWave * 0.9, 5 + reach);
  return assemble(raw, 1, calib, powerMult);
}

/** Estimated Boss Rush WAVE (docs/BOSS-RUSH.md). Wave N fields N bosses, so depth is far
 *  shallower than Infinite — a compressed reach curve with the same self-calibration. */
export function predictBossRush(powerMult: number, rushBestWave: number, difficultyMult: number, calib: PredictCalib): Prediction {
  // The column is SIZED to the account (docs/BOSS-RUSH.md §wall), so reach is the measured reference
  // wall plus a sliver per doubling of Power over the reference account (fit, not derived).
  const rel = Math.max(1, (powerMult * POWER_BASE) / RUSH.powerRef);
  const reach = RUSH.predictWall + (RUSH.predictPerDoubling * Math.log2(rel)) / Math.max(1, difficultyMult);
  // A record near the model floors the estimate (a pre-wall veteran record never inflates it).
  const raw = Math.max(reach, Math.min(rushBestWave, reach + 3) * 0.9);
  return assemble(raw, 1, calib, powerMult);
}

/** Fold a finished run's ACTUAL result into the calibration: nudge the bias toward the error and bump
 *  the sample count. `estimateAtStart` is the estimate the player saw before the run (calib.lastEstimate).
 *  Idempotent-ish: only meaningful when a baseline was noted. Returns the new calibration. */
export function calibrate(calib: PredictCalib, actual: number, powerMult: number): PredictCalib {
  if (calib.lastEstimate <= 0) return { ...calib, prevPowerMult: powerMult }; // no baseline noted → just track power
  const err = actual - calib.lastEstimate;
  return {
    bias: calib.bias + err * LEARN_RATE,
    samples: calib.samples + 1,
    lastEstimate: 0, // consumed
    prevPowerMult: powerMult,
  };
}
