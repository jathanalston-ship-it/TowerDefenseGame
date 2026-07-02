// Hold-to-repeat purchasing (docs/RESPONSIVE-DESIGN.md §touch) — the framework primitive
// behind every "buy" button: click buys once; HOLDING (mouse or touch) repeats with a gentle
// ramp; releasing, leaving, or a failed buy stops the run instantly (the overspend guard —
// a purchase that returns false halts repetition so a drained wallet never queues buys).
// Desktop keeps its shortcuts at the call site (e.g. shift-click multi-buy).

import { useEffect, useRef } from 'react';

const START_DELAY_MS = 420; // hold intent — a normal click never double-fires
const REPEAT_FLOOR_MS = 70; // ramps down to this (satisfying, never uncontrollable)
const RAMP = 0.92;

export interface PressRepeatHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

/** `fire(step)` performs ONE purchase attempt; return false to stop a hold (can't afford /
 * maxed). `step` counts 0,1,2… within a single hold — call sites can escalate feedback. */
export function usePressRepeat(fire: (step: number) => boolean): PressRepeatHandlers {
  const timer = useRef<number | null>(null);
  const fireRef = useRef(fire);
  fireRef.current = fire;

  const stop = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const schedule = (step: number, delay: number): void => {
    timer.current = window.setTimeout(() => {
      if (!fireRef.current(step)) { stop(); return; }
      schedule(step + 1, Math.max(REPEAT_FLOOR_MS, (step === 1 ? 170 : delay) * RAMP));
    }, delay);
  };

  return {
    onPointerDown: (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      stop();
      if (!fireRef.current(0)) return; // the click itself
      schedule(1, START_DELAY_MS); // first repeat lands after the hold-intent delay, then ramps
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onContextMenu: (e) => e.preventDefault(), // long-press must not open the context menu
  };
}
