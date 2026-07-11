// MOBILE SECTION (docs/RESPONSIVE-DESIGN.md §mobile-shell) — the portrait collapsible.
// Desktop renders children untouched (zero layout impact); the portrait profile wraps them in a
// native <details> with a fat, self-describing summary row (title + one-line hint + live count),
// so long screens become a scannable table of contents instead of a thousand-pixel scroll.
// Native details/summary keeps it accessible (keyboard/AT) with no positioning code.

import { useState, type ReactNode } from 'react';
import { useLayoutProfile } from '../layoutProfile';

export function MobileSection({
  title,
  hint,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** One line of "what's in here" for a first-time user — shown under the title while closed. */
  hint?: string;
  /** Live tally chip (e.g. "12/24") — visible while closed so state reads without opening. */
  count?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}): JSX.Element {
  const { profile } = useLayoutProfile();
  const [open, setOpen] = useState(defaultOpen);
  if (profile !== 'portrait') return <>{children}</>;
  return (
    <details
      className="msec"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="msec-h">
        <span className="msec-body">
          <span className="msec-title">{title}</span>
          {hint && !open && <span className="msec-hint">{hint}</span>}
        </span>
        {count && <span className="msec-count">{count}</span>}
        <span className="msec-chev" aria-hidden>{open ? '▾' : '▸'}</span>
      </summary>
      <div className="msec-content">{children}</div>
    </details>
  );
}
