import { describe, it, expect } from 'vitest';
import { predictBossRush, predictCampaign, predictInfinite, calibrate, defaultCalib } from './predict';
import { RUSH } from './config';
import { POWER_BASE } from './power';

describe('progress prediction (pure estimator)', () => {
  const c = defaultCalib();

  it('estimates rise with power and floor at cleared / best', () => {
    expect(predictCampaign(16, 0, 1, c).estimate).toBeGreaterThan(predictCampaign(1, 0, 1, c).estimate);
    expect(predictCampaign(1, 40, 1, c).estimate).toBeGreaterThanOrEqual(41); // one past cleared
    expect(predictInfinite(1, 100, 1, c).estimate).toBeGreaterThanOrEqual(90); // near best wave
  });

  it('harder difficulty lowers the reach', () => {
    expect(predictCampaign(8, 0, 2.6, c).estimate).toBeLessThan(predictCampaign(8, 0, 1, c).estimate);
  });

  it('confidence grows with sample count; the band tightens', () => {
    expect(predictCampaign(4, 0, 1, c).confidence).toBe('Low');
    expect(predictCampaign(4, 0, 1, { ...c, samples: 5 }).confidence).toBe('Medium');
    const hi = predictCampaign(4, 0, 1, { ...c, samples: 10 });
    expect(hi.confidence).toBe('High');
    expect(hi.high - hi.low).toBeLessThan(predictCampaign(4, 0, 1, c).high - predictCampaign(4, 0, 1, c).low);
  });

  it('calibration nudges the bias toward the actual result + bumps samples', () => {
    let x = { ...defaultCalib(), lastEstimate: 10 };
    x = calibrate(x, 20, 3); // actual 20 > estimate 10 → bias rises
    expect(x.bias).toBeGreaterThan(0);
    expect(x.samples).toBe(1);
    expect(x.lastEstimate).toBe(0); // consumed
    // No baseline noted → no calibration, just tracks power for the trend.
    const y = calibrate(defaultCalib(), 50, 5);
    expect(y.samples).toBe(0);
    expect(y.prevPowerMult).toBe(5);
  });

  it('Boss Rush reach tracks the SIZED wall (docs/BOSS-RUSH.md §wall): ~flat in Power, veteran records never inflate it', () => {
    const ref = RUSH.powerRef / POWER_BASE;
    expect(predictBossRush(ref, 0, 1, c).estimate).toBe(RUSH.predictWall);
    const strong = predictBossRush(ref * 37, 0, 1, c).estimate;
    expect(strong).toBeGreaterThanOrEqual(RUSH.predictWall); // Power still buys a little depth …
    expect(strong).toBeLessThanOrEqual(RUSH.predictWall + 2); // … never 30 waves of it
    expect(predictBossRush(ref, 36, 1, c).estimate).toBeLessThanOrEqual(RUSH.predictWall + 3); // a pre-wall record of 36
    expect(predictBossRush(ref, 12, 1, c).estimate).toBeGreaterThanOrEqual(10); // a near-model record floors it
  });

  it('self-improves: repeated results pull the estimate toward reality', () => {
    let x = defaultCalib();
    for (let i = 0; i < 12; i++) {
      x = { ...x, lastEstimate: predictCampaign(2, 0, 1, x).estimate };
      x = calibrate(x, 20, 2); // the account really reaches stage 20 every time
    }
    expect(predictCampaign(2, 0, 1, x).estimate).toBeGreaterThanOrEqual(18); // converged toward 20
  });
});
