// Run-end reward sequence: reveals each banked reward one at a time with a
// count-up, building anticipation instead of dumping every number at once.
// Data-driven — the caller passes an ordered RewardLine[], so adding a reward
// type is one array entry and the sequence scales as new currencies/drops land.
// The whole thing is skippable (Skip snaps every revealed line to its final
// value). Pure presentation: the rewards are already decided upstream.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** One reward to reveal. `value` is always a number so every line count-ups uniformly. */
export interface RewardLine {
  id: string;
  label: string;
  value: number;
  icon?: ReactNode; // optional trailing currency glyph (e.g. Biomass/Genome Cores)
  accent?: string; // optional CSS color for the value
  note?: string; // optional badge (e.g. "New best!")
  format?: (n: number) => string; // defaults to a locale integer
}

const STEP_MS = 800; // gap between reveals → ~7 lines lands the run in the 5–10s window
const COUNT_MS = 700; // per-line count-up duration

/** Ease a number 0 → target (easeOutCubic). `ms <= 0` snaps instantly (used on skip). */
function useCountUp(target: number, ms: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (ms <= 0 || target <= 0) {
      setN(Math.max(0, target));
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      const p = Math.min(1, (now - start) / ms);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

function Line({ line, instant }: { line: RewardLine; instant: boolean }): JSX.Element {
  const n = useCountUp(line.value, instant ? 0 : COUNT_MS);
  const text = line.format ? line.format(n) : n.toLocaleString();
  return (
    <div className="reward-line">
      <span className="rl-label">{line.label}</span>
      {line.note && <span className="rl-note">{line.note}</span>}
      <span className="rl-value" style={line.accent ? { color: line.accent } : undefined}>
        {text}
        {line.icon}
      </span>
    </div>
  );
}

/** Reveal `lines` one at a time, then fire `onDone` once (after the last line). */
export function RewardSequence({
  lines,
  onDone,
}: {
  lines: RewardLine[];
  onDone?: () => void;
}): JSX.Element {
  // Honor the global reduced-motion preference (mirrored from index.css): the
  // count-up + stagger are JS timers a CSS media query can't reach, so collapse
  // them to an instant, fully-revealed state here.
  const reduced =
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(reduced ? lines.length : 0);
  const [skipped, setSkipped] = useState(reduced);
  const fired = useRef(false);
  const done = shown >= lines.length;

  // Reveal the next line on a fixed cadence until all are out.
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setShown((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [shown, done]);

  // Fire onDone exactly once, after the last line is revealed.
  useEffect(() => {
    if (done && !fired.current) {
      fired.current = true;
      onDone?.();
    }
  }, [done, onDone]);

  const skip = useCallback(() => {
    setSkipped(true);
    setShown(lines.length);
  }, [lines.length]);

  return (
    <div className="reward-seq">
      {lines.slice(0, shown).map((line) => (
        <Line key={line.id} line={line} instant={skipped} />
      ))}
      {!done && (
        <button className="reward-skip" onClick={skip}>
          Skip
        </button>
      )}
    </div>
  );
}
