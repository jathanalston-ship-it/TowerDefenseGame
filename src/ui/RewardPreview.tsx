// Reward Preview — a compact "here's what you'll likely earn" chip row, shown at the point
// of action so the player feels anticipation before committing. Pure presentation; the chip
// lists are supplied by each activity (Campaign / Infinite / Vault), keeping this generic.

import type { ReactNode } from 'react';

export interface PreviewChip {
  label: string;
  color: string;
  icon?: ReactNode; // optional currency icon; falls back to a colored dot
}

export function RewardPreview({
  heading,
  chips,
  className = '',
}: {
  heading?: string;
  chips: PreviewChip[];
  className?: string;
}): JSX.Element {
  return (
    <div className={`rwp ${className}`}>
      {heading && <span className="rwp-h">{heading}</span>}
      <span className="rwp-chips">
        {chips.map((c, i) => (
          <span className="rwp-chip" key={i} style={{ ['--rc' as string]: c.color }}>
            {c.icon ? <span className="rwp-i">{c.icon}</span> : <span className="rwp-dot" />}
            {c.label}
          </span>
        ))}
      </span>
    </div>
  );
}
