// The SHARED list control row (state/listOrg.ts — docs/UI-STANDARDS.md §lists): search ·
// filter chips · sort select · optional view/group toggle, one visual language on every
// long-list screen (modeled on the Gene Archive's controls, the reference implementation).
// Purely presentational — the screen owns its ListOrgState and pref persistence.

import type { ReactNode } from 'react';
import './ListControls.css';

export interface ListControlsProps {
  search?: { value: string; onChange: (v: string) => void; placeholder: string; label: string };
  chips?: { id: string; label: string; on: boolean; onToggle: () => void; title?: string }[];
  sort?: { value: string; options: { id: string; label: string }[]; onChange: (id: string) => void };
  /** Mutually-exclusive view modes (e.g. ▤ Groups / ☰ Full list). */
  views?: { value: string; options: { id: string; label: string; title?: string }[]; onChange: (id: string) => void };
  /** "N of M" readout when filters/search hide rows (pass shown === total to hide it). */
  shown?: { shown: number; total: number };
  right?: ReactNode; // surface-specific extras (badges, counters)
}

export function ListControls({ search, chips, sort, views, shown, right }: ListControlsProps): JSX.Element {
  return (
    <div className="lc-row">
      {search && (
        <input
          className="lc-search"
          type="search"
          placeholder={search.placeholder}
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          aria-label={search.label}
        />
      )}
      {chips && chips.length > 0 && (
        <div className="lc-chips">
          {chips.map((c) => (
            <button key={c.id} type="button" className={`lc-chip${c.on ? ' on' : ''}`} onClick={c.onToggle} title={c.title} aria-pressed={c.on}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      {sort && (
        <label className="lc-sort">Sort
          <select value={sort.value} onChange={(e) => sort.onChange(e.target.value)}>
            {sort.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      )}
      {views && (
        <div className="lc-views" role="group" aria-label="View">
          {views.options.map((o) => (
            <button key={o.id} type="button" className={`lc-chip${views.value === o.id ? ' on' : ''}`} onClick={() => views.onChange(o.id)} title={o.title}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      {shown && shown.shown < shown.total && <span className="lc-shown">{shown.shown}/{shown.total}</span>}
      {right}
    </div>
  );
}
