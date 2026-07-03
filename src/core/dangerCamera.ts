// DANGER CAMERA (docs/CAMERA.md) — the state machine that turns raw battlefield threat into
// ONE smooth, deliberate 0..1 intensity every danger-mode effect keys on (vignette, zone
// glow, saturation shift, subtle zoom, HUD banner, music swell). It exists to kill
// "threshold thrashing": the old signals reacted instantly to every enemy crossing or dying
// at the zone edge, so the screen throbbed. This machine enters danger DELIBERATELY
// (confirmation window), stays briefly (minimum hold), and relaxes slowly (asymmetric
// release) — it can never oscillate frame-to-frame by construction.
//
// Pure + geometry-free: the caller (game.ts) folds enemies into a raw THREAT SCORE with
// its own world knowledge; this module only smooths and gates. Mutates a caller-owned
// state object — zero allocation per tick. Render-only by contract: nothing in the sim
// reads any of these fields, so a fixed seed's outcome is untouched (the Final Defense
// targeting override keeps its own instantaneous in-zone list — gameplay must not lag).

export type DangerPhase = 'calm' | 'rising' | 'danger' | 'easing';

export interface DangerCameraState {
  phase: DangerPhase;
  /** The one smoothed output (0..1). Effects key on this — never on raw enemy state. */
  intensity: number;
  /** Exponentially-smoothed threat score (the machine's input after de-noising). */
  score: number;
  /** Confirmation charge (s): accrues while RAW threat is present, decays while absent —
   *  a single blip drains away, a persistent flicker still accumulates. */
  confirmT: number;
  /** Seconds of minimum hold remaining once danger committed. */
  holdT: number;
  /** Release charge (s): the all-clear must ALSO persist before danger lets go. */
  releaseT: number;
}

export function initialDangerCamera(): DangerCameraState {
  return { phase: 'calm', intensity: 0, score: 0, confirmT: 0, holdT: 0, releaseT: 0 };
}

export const DANGER_CAM = {
  // ── State machine (the anti-thrash core) ──────────────────────────────────────────────
  enter: 0.9, // smoothed score to BEGIN entering danger …
  exit: 0.35, // … and the (much lower) score to be allowed to LEAVE — hysteresis
  confirmSec: 0.35, // RAW threat must persist this long before danger commits (kills blips)
  confirmDecay: 0.5, // confirmation charge drains at this ×dt while the raw threat is absent
  releaseSec: 0.5, // the all-clear must persist this long before danger releases (kills trough-dips)
  minHoldSec: 2.5, // once committed, danger holds at least this long (kills die-instantly flicker)
  // ── Smoothing rates (per second; exponential ease — soft accel/decel, never a snap) ──
  scoreSmooth: 5, // raw→smoothed score (fast enough to track a rush, slow enough to de-noise)
  attackRate: 2.0, // intensity ease-in while in danger (~0.5 s to presence)
  releaseRate: 0.6, // intensity ease-out (~2 s to relax — the cinematic exhale)
  // ── Threat model weights (used by the caller's fold — centralized here for tuning) ──
  tier: { normal: 1, elite: 2.5, boss: 6 } as Record<string, number>,
  wApproach: 0.35, // weight of an enemy AT the zone line (ramps from 0 across the approach band)
  wZone: 1.2, // weight INSIDE the Final Defense Zone …
  wCore: 1.5, // … rising to this at the Hive Core line
  hpFloor: 0.5, // a dying enemy still counts this fraction (0.5 + 0.5·hpFrac)
  // ── Output shaping ──
  baseIntensity: 0.55, // committed danger starts here …
  scaleScore: 3, // … and grows toward 1 as the smoothed score approaches this (genuine danger scales)
};

/** Advance the machine by `dt` sim-seconds against the RAW threat score for this tick.
 *  Mutates `s` in place (no allocation). Safe at any dt (pause = not called = frozen;
 *  game-speed scaling rides dt; huge dt clamps to stable exponential steps). */
export function stepDangerCamera(s: DangerCameraState, rawScore: number, dt: number): void {
  const C = DANGER_CAM;
  // De-noise the input first: an enemy dying the frame after it crossed moves the smoothed
  // score only fractionally, so the machine below never sees square waves.
  s.score += (rawScore - s.score) * Math.min(1, C.scoreSmooth * dt);

  // Confirmation charge tracks the RAW threat (not the smoothed score — the smoother's own
  // decay tail must never count as "the threat persisted"). Present → accrue; absent →
  // drain, so a lone blip bleeds away while a persistently flickering swarm still charges.
  if (rawScore >= C.exit) s.confirmT = Math.min(C.confirmSec, s.confirmT + dt);
  else s.confirmT = Math.max(0, s.confirmT - dt * C.confirmDecay);

  switch (s.phase) {
    case 'calm':
      if (s.score >= C.enter) s.phase = 'rising';
      break;
    case 'rising':
      // Deliberate entry: commit only once the raw threat has charged a full confirmation.
      // A blip that died falls back to calm — the camera never acknowledged it.
      if (s.confirmT >= C.confirmSec) {
        s.phase = 'danger';
        s.holdT = C.minHoldSec;
        s.releaseT = 0;
      } else if (s.score < C.exit && s.confirmT === 0) {
        s.phase = 'calm';
      }
      break;
    case 'danger':
      s.holdT = Math.max(0, s.holdT - dt);
      // Release needs its own confirmation: hold expired AND the all-clear (smoothed score
      // under the hysteresis floor) persisting — a 0.3 s trough between two pushes never
      // lets go, so the phase cannot bounce danger↔easing.
      if (s.holdT === 0 && s.score <= C.exit) {
        if ((s.releaseT += dt) >= C.releaseSec) s.phase = 'easing';
      } else {
        s.releaseT = 0;
      }
      break;
    case 'easing':
      // Re-arm without ceremony if the threat returns mid-exhale (the danger was already
      // established; the intensity is still elevated, so this is a glide, not a flash).
      if (s.score >= C.enter) {
        s.phase = 'danger';
        s.holdT = C.minHoldSec;
        s.releaseT = 0;
      } else if (s.intensity <= 0.02) {
        // The exhale is perceptually over (dangerCurve(0.02) ≈ 1e-4); a fresh threat now
        // deserves a fresh confirmation. Never snap intensity here — the release ease below
        // finishes the fade on its own.
        s.phase = 'calm';
      }
      break;
  }

  // ONE smoothed intensity, asymmetric: soft attack toward the danger-scaled target,
  // slower cinematic release everywhere else.
  const target = s.phase === 'danger'
    ? C.baseIntensity + (1 - C.baseIntensity) * Math.min(1, s.score / C.scaleScore)
    : 0;
  const rate = target > s.intensity ? C.attackRate : C.releaseRate;
  s.intensity += (target - s.intensity) * Math.min(1, rate * dt);
  // Settle exactly at rest once sub-perceptual — a <0.001 step, far below one release frame,
  // so the exponential tail can't linger forever.
  if (target === 0 && s.intensity < 0.001) s.intensity = 0;
}

/** Smootherstep — the blend curve effects apply on top of the eased intensity so entries
 *  and exits have zero first-derivative pop (soft acceleration AND deceleration). */
export function dangerCurve(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}
