// A number that smoothly tweens to its target when `value` changes (ease-out),
// for currency/score readouts. Pure presentation — never touches game state, and
// snaps instantly under prefers-reduced-motion. Animates on change only (not on
// mount) so screens settle without a flashy startup tally.

import { useEffect, useRef, useState, type CSSProperties } from 'react';

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

function reduceMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

interface CountUpProps {
  value: number;
  /** Tween duration in ms (kept short for responsiveness). */
  duration?: number;
  /** If set, the counter starts here and tallies to `value` on mount (e.g. 0 -> reward). */
  animateFrom?: number;
  className?: string;
  style?: CSSProperties;
  /** Format the rounded display number (e.g. thousands separators). */
  format?: (n: number) => string;
}

export function CountUp({ value, duration = 280, animateFrom, className, style, format }: CountUpProps): JSX.Element {
  const initial = animateFrom ?? value;
  const [display, setDisplay] = useState(initial);
  const fromRef = useRef(initial); // latest shown value (float) — lets tweens chain smoothly
  const rafRef = useRef(0);

  useEffect(() => {
    if (reduceMotion() || duration <= 0) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      const v = from + (value - from) * easeOutCubic(t);
      fromRef.current = v;
      setDisplay(v);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  const n = Math.round(display);
  return (
    <span className={className} style={style}>
      {format ? format(n) : n}
    </span>
  );
}
