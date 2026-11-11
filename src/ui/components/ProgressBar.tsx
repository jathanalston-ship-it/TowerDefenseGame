import './ProgressBar.css';
// Reusable progress/health bar. Token-driven; used for integrity, hero HP,
// upgrade levels, etc. Pure presentation — no game logic.

interface ProgressBarProps {
  value: number;
  max: number;
  /** Fill color (token or hex). */
  color?: string;
  /** Track background override. */
  track?: string;
  /** Pixel height. */
  height?: number;
  /** Draw N-1 segment dividers (segmented bar look). */
  segments?: number;
  className?: string;
  /** Accessible label. */
  label?: string;
}

export function ProgressBar({
  value,
  max,
  color = 'var(--gold)',
  track,
  height = 8,
  segments,
  className = '',
  label,
}: ProgressBarProps): JSX.Element {
  const validMax = Number.isFinite(max) && max > 0;
  const limit = validMax ? max : 1;
  const current = validMax && Number.isFinite(value) ? Math.max(0, Math.min(value, limit)) : 0;
  const pct = current / limit;
  return (
    <div
      className={`bar ${className}`}
      style={{ height, ...(track ? { background: track } : {}) }}
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-label={label}
    >
      <div className="bar-fill" style={{ width: `${pct * 100}%`, background: color }} />
      {segments && segments > 1
        ? Array.from({ length: segments - 1 }, (_, i) => (
            <span className="bar-seg" key={i} style={{ left: `${((i + 1) / segments) * 100}%` }} />
          ))
        : null}
    </div>
  );
}
