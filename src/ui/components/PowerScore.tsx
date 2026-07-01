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

  // Animate whenever the score changes: 'up' (gain) pulses green, 'down' (loss) ticks red.
  const prev = useRef(score);
  const [dir, setDir] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    if (score === prev.current) return;
    setDir(score > prev.current ? 'up' : 'down');
    prev.current = score;
    const t = setTimeout(() => setDir(null), 700);
    return () => clearTimeout(t);
  }, [score]);

  return (
    <span className={`power-badge ${compact ? 'is-compact' : ''} ${dir ? `pulse-${dir}` : ''}`} title="Power Score — your total account strength">
      <span className="power-badge-k">{label}</span>
      <span className="power-badge-v">{formatPower(score)}</span>
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
