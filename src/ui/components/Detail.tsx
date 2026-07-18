// LAYERED DETAIL (docs/INFO-HIERARCHY.md §layers) — the sanctioned Layer-2/3 expander.
// Layer 1 shows the outcome; tapping the quiet summary chip reveals the numbers. Native
// <details> keeps it accessible (keyboard/screen-reader) with zero JS state. Use this for
// exact percentages, breakdowns, and optimization data that would otherwise confront the
// player before they asked — never for information the NEXT decision depends on (costs,
// affordability, the recommended action stay at Layer 1).

import type { ReactNode } from 'react';

export function Detail({ summary = 'details', children, className, open }: {
  /** The chip text (kept short — "details", "exact values", "tier breakdown"). */
  summary?: string;
  children: ReactNode;
  className?: string;
  /** Start expanded (rare — only when the surface is itself an expert screen). */
  open?: boolean;
}): JSX.Element {
  return (
    <details className={`dtl${className ? ` ${className}` : ''}`} open={open}>
      <summary className="dtl-s">◆ {summary}</summary>
      <div className="dtl-body">{children}</div>
    </details>
  );
}
