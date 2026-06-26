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
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div
      className={`bar ${className}`}
      style={{ height, ...(track ? { background: track } : {}) }}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
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
