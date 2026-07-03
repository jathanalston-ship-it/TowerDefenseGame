// Danger-camera state machine (docs/CAMERA.md) — the anti-thrash contracts: blips are
// rejected, entry is deliberate, the hold is respected, exit is a smooth exhale, and the
// output can NEVER oscillate frame-to-frame. Plus the live-sim integration: the score
// weighs bosses over chaff, the machine ticks in every phase, and the sim never reads it.

import { describe, it, expect } from 'vitest';
import { DANGER_CAM, dangerCurve, initialDangerCamera, stepDangerCamera } from './dangerCamera';
import { Game } from './game';
import { SIM_DT } from './config';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const DT = 1 / 60;

/** Drive the machine with a score signal for `sec` seconds; returns intensity samples. */
function drive(s: ReturnType<typeof initialDangerCamera>, score: (t: number) => number, sec: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < sec; t += DT) {
    stepDangerCamera(s, score(t), DT);
    out.push(s.intensity);
  }
  return out;
}

describe('anti-thrash contracts', () => {
  it('a sub-confirmation blip NEVER reaches danger (the camera does not acknowledge it)', () => {
    const s = initialDangerCamera();
    // A hot score for less than confirmSec, then gone (enemy crossed and instantly died).
    drive(s, (t) => (t < DANGER_CAM.confirmSec * 0.6 ? 5 : 0), 2);
    expect(s.phase).toBe('calm');
    expect(s.intensity).toBeLessThan(0.03);
  });

  it('a square wave oscillating around the threshold commits ONCE and holds — no strobing', () => {
    const s = initialDangerCamera();
    let entries = 0;
    let last = s.phase;
    // 6 seconds of an enemy repeatedly entering/dying at ~2.5 Hz around the trigger.
    for (let t = 0; t < 6; t += DT) {
      const hot = Math.floor(t * 2.5) % 2 === 0;
      stepDangerCamera(s, hot ? 2.2 : 0, DT);
      if (s.phase === 'danger' && last !== 'danger') entries++;
      last = s.phase;
    }
    // The smoothed score rides the wave's MEAN (~1.1 > enter), so danger engages once and
    // the min-hold + hysteresis keep it engaged — never per-crossing.
    expect(entries).toBe(1);
    expect(s.phase).toBe('danger');
  });

  it('hysteresis: a score between exit and enter neither triggers nor releases', () => {
    const mid = (DANGER_CAM.enter + DANGER_CAM.exit) / 2;
    const calm = initialDangerCamera();
    drive(calm, () => mid, 3);
    expect(calm.phase).toBe('calm'); // below enter → never starts
    const hot = initialDangerCamera();
    drive(hot, () => 3, 2); // commit properly …
    expect(hot.phase).toBe('danger');
    drive(hot, () => mid, 6); // … then park the score in the dead band
    expect(hot.phase).toBe('danger'); // above exit → never releases
  });

  it('die-immediately-after-commit: the hold keeps danger alive, then ONE smooth exhale', () => {
    const s = initialDangerCamera();
    drive(s, () => 4, DANGER_CAM.confirmSec + 0.2); // commit
    expect(s.phase).toBe('danger');
    // Threat gone instantly; horizon covers hold + release confirmation + the full exhale.
    const trace = drive(s, () => 0, DANGER_CAM.minHoldSec + DANGER_CAM.releaseSec + 9);
    // Intensity decays monotonically once past its peak — no re-rise, no snap.
    const peak = trace.indexOf(Math.max(...trace));
    for (let i = Math.max(1, peak + 1); i < trace.length; i++) {
      expect(trace[i]).toBeLessThanOrEqual(trace[i - 1] + 1e-9);
    }
    expect(s.phase).toBe('calm');
    // The exhale is slow (release-rate bound): one frame never drops more than ~1%.
    for (let i = peak + 1; i < trace.length; i++) {
      expect(trace[i - 1] - trace[i]).toBeLessThanOrEqual(DANGER_CAM.releaseRate * DT * 1.05);
    }
  });

  it('per-frame intensity change is bounded by the attack rate — no snapping, ever', () => {
    const s = initialDangerCamera();
    let prev = 0;
    for (let t = 0; t < 3; t += DT) {
      stepDangerCamera(s, 10, DT); // worst case: maximal threat from a standing start
      expect(Math.abs(s.intensity - prev)).toBeLessThanOrEqual(DANGER_CAM.attackRate * DT + 1e-9);
      prev = s.intensity;
    }
  });

  it('threat returning mid-exhale re-arms danger without a re-confirmation flash', () => {
    const s = initialDangerCamera();
    drive(s, () => 4, DANGER_CAM.confirmSec + 0.2);
    drive(s, () => 0, DANGER_CAM.minHoldSec + 0.8); // into the exhale
    expect(s.phase).toBe('easing');
    const before = s.intensity;
    drive(s, () => 4, 0.2);
    expect(s.phase).toBe('danger');
    expect(s.intensity).toBeGreaterThanOrEqual(before - 1e-9); // rose from where it was — no reset
  });

  it('dangerCurve is a zero-derivative blend at both ends', () => {
    expect(dangerCurve(0)).toBe(0);
    expect(dangerCurve(1)).toBe(1);
    expect(dangerCurve(0.01) / 0.01).toBeLessThan(0.01); // flat entry
    expect((1 - dangerCurve(0.99)) / 0.01).toBeLessThan(0.01); // flat exit
  });
});

describe('live sim integration (render-only)', () => {
  it('weighs a deep leaker above an approacher (proximity IS threat)', () => {
    // Fresh game per probe — sequential probes would carry phase/smoothing history.
    const settled = (y: number): number => {
      const g = new Game(3, NO_META);
      g.startWave();
      g.debugSpawn('runner', 1);
      const e = g.enemies.find((x) => x.alive)!;
      e.y = y;
      e.speed = 0;
      e.hp = 99999; // the patrolling hero must not kill the probe mid-measurement
      e.maxHp = 99999;
      // Cull everything the wave itself spawns; keep only the probe enemy alive.
      for (let i = 0; i < 240; i++) {
        for (const o of g.enemies) if (o !== e) { o.hp = 0; o.alive = false; }
        g.advance(SIM_DT);
      }
      return g.dangerCam.score;
    };
    const approacher = settled(870); // in the approach band
    const leaker = settled(930); // deep in the Final Defense Zone
    expect(leaker).toBeGreaterThan(approacher);
    expect(leaker).toBeGreaterThan(DANGER_CAM.enter); // a real leaker DOES commit danger
  });

  it('ticks in every phase: the camera exhales through prep after the threat clears', () => {
    const g = new Game(5, NO_META);
    g.startWave();
    g.debugSpawn('brute', 1);
    const b = g.enemies.find((e) => e.alive)!;
    b.y = 930; b.speed = 0;
    for (let i = 0; i < 120; i++) g.advance(SIM_DT); // commit danger
    expect(g.dangerCam.phase).toBe('danger');
    expect(g.getRenderState().dangerIntensity).toBeGreaterThan(0.2);
    expect(g.getSnapshot().emergency).toBe(true); // the banner rides the committed state
    // Threat dies; even if the wave/phase winds down, the machine keeps easing every tick.
    b.hp = 0; b.alive = false;
    for (let i = 0; i < 60 * 8; i++) g.advance(SIM_DT);
    expect(g.dangerCam.intensity).toBeLessThan(0.05); // smooth exhale completed
    expect(g.getSnapshot().emergency).toBe(false);
  });
});
