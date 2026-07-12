// COLLAPSIBLE SECTIONS (docs/RESPONSIVE-DESIGN.md §mobile-shell + docs/UI_STYLE_GUIDE.md).
// `Fold` is the universal collapsible — a native <details> with a fat, self-describing summary
// row (title + one-line hint + live count) that works on EVERY layout profile; long screens
// become a scannable table of contents instead of a thousand-pixel scroll. `MobileSection`
// keeps its original contract: desktop renders children untouched (zero layout impact) and
// only the portrait profile folds. Native details/summary keeps both accessible
// (keyboard/AT) with no positioning code.

import { useState, type ReactNode } from 'react';
import { useLayoutProfile } from '../layoutProfile';

/** The always-collapsible section (all layout profiles). */
export function Fold({
  title,
  hint,
  count,
  accent,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** One line of "what's in here" for a first-time user — shown under the title while closed. */
  hint?: string;
  /** Live tally chip (e.g. "12/24") — visible while closed so state reads without opening. */
  count?: string;
  /** Optional accent color for the title (section identity). */
  accent?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="msec"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="msec-h">
        <span className="msec-body">
          <span className="msec-title" style={accent ? { color: accent } : undefined}>{title}</span>
          {hint && !open && <span className="msec-hint">{hint}</span>}
        </span>
        {count && <span className="msec-count">{count}</span>}
        <span className="msec-chev" aria-hidden>{open ? '▾' : '▸'}</span>
      </summary>
      <div className="msec-content">{children}</div>
    </details>
  );
}

/** Portrait-only collapsible: desktop renders children untouched. */
export function MobileSection(props: {
  title: string;
  hint?: string;
  count?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}): JSX.Element {
  const { profile } = useLayoutProfile();
  if (profile !== 'portrait') return <>{props.children}</>;
  return <Fold {...props} />;
}
