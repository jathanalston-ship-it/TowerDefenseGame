// LAST KILL — the wave's final enemy LANDS (docs/SIGNATURE-MOMENTS.md §1). The view-side beat for the
// sim's `waveLastKill` presentation event:
//   0 ms         view time eases down (50 % · 35 % when a boss / the Mega fell). The sim keeps its
//                fixed-dt determinism — the VIEW only feeds it steps more slowly for a moment.
//   0 → hold     the camera nudges ≤ 4 % toward the kill (one more eased canvas transform in GameView).
//   fanfareMs    the `clear` fanfare + its short music duck (FEEL.clear) — moved here off the draft.
//   hold → out   time eases back to 100 %, the camera returns; the settle runs on → the draft deals.
// Clocked by the frame's wall dt: a paused loop doesn't tick, so the beat holds with the pause, while
// the view-only hit-stop keeps ticking it (freeze, then slow). Allocation-free per frame. Reduced
// motion (viewFeel.motion 0): no dip, no camera — the fanfare still plays. Every tunable lives in
// render/feel.ts LAST_KILL.

import { LAST_KILL } from './feel';
import type { LastKillSpec } from './feel';
import type { GameEventMap } from '../core/events';
import type { RunMode } from '../core/game';

type LastKillEvent = GameEventMap['waveLastKill'];

/** The beat this clear plays — null when the wave ENDED on a breach (no body to land on: fanfare only). */
export function lastKillSpec(ev: LastKillEvent, mode: RunMode): LastKillSpec | null {
  if (!ev.kill) return null;
  const big = ev.mega || (ev.boss && (mode !== 'bossRush' || LAST_KILL.rushBossBeat));
  return big ? LAST_KILL.boss : LAST_KILL.normal;
}

const smooth = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

export class LastKillMoment {
  private t = -1; // wall ms since the kill; < 0 = idle
  private spec: LastKillSpec | null = null;
  private k = 1; // duration scale for the game speed the beat began at (LAST_KILL.speedCompress)
  private fanfareAt = 0;
  private fanfared = true;
  private x = 0;
  private y = 0;

  /** The sim's `waveLastKill` arrived. `speed` = the game speed now (1/2/5). A run-winning clear
   *  plays no fanfare — the victory cadence owns that moment. */
  start(ev: LastKillEvent, mode: RunMode, speed: number): void {
    const s = lastKillSpec(ev, mode);
    this.spec = s;
    this.k = Math.pow(Math.max(1, speed), -LAST_KILL.speedCompress);
    this.t = 0;
    this.x = ev.x;
    this.y = ev.y;
    // A breach clear has no dip, so its fanfare rides the settle in SIM time (÷ speed) — the old
    // draft-open moment; a kill's lands on the beat in compressed wall time.
    this.fanfareAt = s ? s.fanfareMs * this.k : LAST_KILL.leakFanfareMs / Math.max(1, speed);
    this.fanfared = ev.final;
  }

  /** Advance one frame (wall ms). Returns true ONCE, on the frame the `clear` fanfare is due. */
  tick(dtMs: number): boolean {
    if (this.t < 0) return false;
    this.t += dtMs;
    let due = false;
    if (!this.fanfared && this.t >= this.fanfareAt) {
      this.fanfared = true;
      due = true;
    }
    if (this.fanfared && this.t >= (this.spec ? this.spec.outMs * this.k : 0)) this.t = -1; // the beat is over
    return due;
  }

  /** This frame's multiplier on the wall dt fed to the sim: 1 when idle; eases to the absolute floor
   *  (depth × real time, whatever the game speed) and back. motion 0 (reduced motion) ⇒ always 1. */
  rate(speed: number, motion: number): number {
    const s = this.spec;
    if (this.t < 0 || s === null || motion <= 0) return 1;
    const t = this.t;
    const inMs = s.easeInMs * this.k;
    const holdMs = s.holdMs * this.k;
    const env = t < inMs ? smooth(t / inMs) : t < holdMs ? 1 : 1 - smooth((t - holdMs) / ((s.outMs - s.holdMs) * this.k));
    const floor = Math.min(1, s.depth / Math.max(1, speed));
    return 1 - (1 - floor) * env * Math.min(1, motion);
  }

  /** This frame's camera nudge (fraction of zoom, 0 = none) — eased in to the hold, home by the end. */
  zoom(motion: number): number {
    const s = this.spec;
    if (this.t < 0 || s === null || motion <= 0) return 0;
    const holdMs = s.holdMs * this.k;
    const env = this.t < holdMs ? smooth(this.t / holdMs) : 1 - smooth((this.t - holdMs) / ((s.outMs - s.holdMs) * this.k));
    return s.zoom * env * Math.min(1, motion);
  }

  /** Compose the nudge into the board transform: scale about the kill, so the view leans toward it. */
  applyCamera(ctx: CanvasRenderingContext2D, motion: number): void {
    const z = this.zoom(motion);
    if (z < 0.0005) return;
    ctx.translate(this.x, this.y);
    ctx.scale(1 + z, 1 + z);
    ctx.translate(-this.x, -this.y);
  }

  /** True while the beat is playing (diagnostics/tests). */
  get active(): boolean {
    return this.t >= 0;
  }
}
