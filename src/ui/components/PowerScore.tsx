// Power Score UI primitives (docs/POWER-SCORE.md — the display contract).
//   • PowerBadge — the always-visible live index. Subscribes to the save, so it updates the
//     instant anything changes, and ANIMATES the change: gains pulse (green), losses tick down
//     (red) — a loss never looks like a gain.
//   • PowerDelta — the "will this improve me?" preview: current → new (+diff), colored by sign.
// Both read the universal integer from meta.power(); PowerDelta's `next` is typically a
// meta.previewPower(mutator) result so upgrades advertise their effect before committing.

import { useEffect, useRef, useState } from 'react';
import { meta } from '../../state/meta';
import { formatPower } from '../../core/power';

export function PowerBadge({
  value,
  label = 'Power',
  compact = false,
}: {
  value?: number; // override the live account score (e.g. a run's live power); omitted ⇒ meta.power()
  label?: string;
  compact?: boolean;
}): JSX.Element {
  meta.use(); // re-render on any save change → the score updates live
  const score = value ?? meta.power().score;

  // Animate whenever the score changes: the number ROLLS to the new value (easeOutCubic) while
  // the badge pulses — 'up' (gain) green, 'down' (loss) red. A loss never looks like a gain.
  const prev = useRef(score);
  const [dir, setDir] = useState<'up' | 'down' | null>(null);
  const [shown, setShown] = useState(score);
  useEffect(() => {
    if (score === prev.current) { setShown(score); return; }
    const from = prev.current;
    setDir(score > from ? 'up' : 'down');
    prev.current = score;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / 600);
      setShown(Math.round(from + (score - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const clear = setTimeout(() => setDir(null), 700);
    return () => { cancelAnimationFrame(raf); clearTimeout(clear); };
  }, [score]);

  return (
    <span className={`power-badge ${compact ? 'is-compact' : ''} ${dir ? `pulse-${dir}` : ''}`} title="Power Score — your total account strength">
      <span className="power-badge-k">{label}</span>
      <span className="power-badge-v">{formatPower(shown)}</span>
    </span>
  );
}

export function PowerDelta({ current, next }: { current: number; next: number }): JSX.Element {
  const diff = Math.round(next - current);
  const sign = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  return (
    <span className={`power-delta ${sign}`} aria-label={`Power ${formatPower(current)} to ${formatPower(next)}, ${diff >= 0 ? '+' : ''}${diff}`}>
      <span className="pd-cur">{formatPower(current)}</span>
      <span className="pd-arrow" aria-hidden>→</span>
      <span className="pd-new">{formatPower(next)}</span>
      {diff !== 0 && <span className="pd-diff">({diff > 0 ? '+' : ''}{diff})</span>}
    </span>
  );
}


/** The STANDARD upgrade preview (UI-STANDARDS §11): current → new (+diff) plus the estimated
 *  combat impact as a percentage of account strength. `next` is a meta.previewPower(...) score —
 *  the REAL model, so preview always equals outcome. Renders nothing when there is no change. */
export function PowerPreview({ current, next }: { current: number; next: number }): JSX.Element | null {
  if (Math.round(next - current) === 0) return null;
  const pct = current > 0 ? ((next - current) / current) * 100 : 0;
  return (
    <span className="power-preview">
      <PowerDelta current={current} next={next} />
      <span className="pp-impact" title="Estimated combat impact — share of total account strength gained">
        ≈ {pct >= 0 ? '+' : ''}{pct.toFixed(1)}% strength
      </span>
    </span>
  );
}
