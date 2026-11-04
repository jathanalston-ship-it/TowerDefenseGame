// SECTION NAV (docs/UI-STANDARDS.md §long-screens) — THE one pattern for a long screen: a sticky
// row of anchor chips (every section one tap away, with its live count) over collapsible
// sections whose open/folded state each device remembers (state/prefs sectionPrefs). A screen
// declares its sections as data; it never builds its own jump rail or fold logic. Tapping a
// chip opens that section and scrolls to it; a folded section shows a one-line hint so the
// page reads as a table of contents. Bodies render only while open (heavy panels cost nothing
// folded). Works on every layout profile; portrait drops the chip row's stickiness (the back
// header owns that edge).

import { useEffect, useState, type ReactNode } from 'react';
import { sectionPrefs, setSectionPrefs } from '../../state/prefs';
import { guideBus } from '../../state/guidedUnlocks';

export interface NavSection {
  id: string; // stable within the screen — the pref key and the anchor
  title: string;
  icon?: string;
  hint?: string; // "what's in here", shown while folded
  count?: string; // live tally chip (e.g. "62%", "▲ 3") — on the chip AND the header
  accent?: string; // title color (section identity)
  /** First-visit state until this device toggles it. Prefer a data-driven default ("open when
   *  there is something to do here") over a fixed one. Default: open. */
  defaultOpen?: boolean;
  /** Extra header content beside the title (e.g. a progress bar) — non-interactive. */
  meta?: ReactNode;
  render: () => ReactNode;
}

const anchorId = (screen: string, id: string): string => `snav-${screen}-${id}`;

export function SectionNav({ screen, sections, forceOpen = false, label }: {
  screen: string; // pref namespace (the nav key)
  sections: NavSection[];
  /** Open everything regardless of prefs (e.g. while a search is active — folded hits would hide). */
  forceOpen?: boolean;
  label?: string; // the chip row's accessible name
}): JSX.Element {
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => sectionPrefs(screen));
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  // A running Field Guide may point into any section — open them all (prefs untouched).
  const [guided, setGuided] = useState(() => guideBus.isActive());
  useEffect(() => guideBus.onActive(setGuided), []);
  const isOpen = (s: NavSection): boolean => forceOpen || guided || (prefs[s.id] ?? s.defaultOpen ?? true);
  const set = (patch: Record<string, boolean>): void => setPrefs(setSectionPrefs(screen, patch));

  // Scroll AFTER the section has rendered open (a chip on a folded section opens it first).
  useEffect(() => {
    if (!scrollTo) return;
    const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(anchorId(screen, scrollTo))?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    setScrollTo(null);
  }, [scrollTo, screen]);

  const allOpen = sections.every(isOpen);
  return (
    <div className="snav">
      <nav className="snav-chips" aria-label={label ?? 'Sections'}>
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`snav-chip${isOpen(s) ? '' : ' is-folded'}`}
            onClick={() => { if (!isOpen(s)) set({ [s.id]: true }); setScrollTo(s.id); }}
          >
            {s.icon && <span aria-hidden>{s.icon}</span>} {s.title}
            {s.count && <i className="snav-chip-n">{s.count}</i>}
          </button>
        ))}
        {!forceOpen && sections.length > 1 && (
          <button
            type="button"
            className="snav-chip is-all"
            onClick={() => set(Object.fromEntries(sections.map((s) => [s.id, !allOpen])))}
          >
            {allOpen ? '⊟ Fold all' : '⊞ Open all'}
          </button>
        )}
      </nav>
      {sections.map((s) => {
        const open = isOpen(s);
        const bodyId = `${anchorId(screen, s.id)}-body`;
        return (
          <section key={s.id} id={anchorId(screen, s.id)} className={`snav-sec${open ? ' is-open' : ''}`} aria-label={s.title}>
            <button
              type="button"
              className="snav-h"
              aria-expanded={open}
              aria-controls={bodyId}
              disabled={forceOpen}
              onClick={() => set({ [s.id]: !open })}
            >
              {s.icon && <span className="snav-icon" aria-hidden>{s.icon}</span>}
              <span className="snav-tw">
                <span className="snav-title" style={s.accent ? { color: s.accent } : undefined}>{s.title}</span>
                {s.hint && !open && <span className="snav-hint">{s.hint}</span>}
              </span>
              {s.meta && <span className="snav-meta">{s.meta}</span>}
              {s.count && <span className="snav-count">{s.count}</span>}
              {!forceOpen && <span className="snav-chev" aria-hidden>{open ? '▾' : '▸'}</span>}
            </button>
            {open && <div className="snav-body" id={bodyId}>{s.render()}</div>}
          </section>
        );
      })}
    </div>
  );
}
