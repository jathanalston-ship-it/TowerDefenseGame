// Help · Field Manual (docs/HELP.md) — a LIVING in-game wiki. It lists only UNLOCKED mechanics
// (unknown systems stay hidden), grouped by category, with search, per-entry detail (what/why/where/
// next), media placeholders, clickable UI references, and cross-links between related topics. New
// systems and archived "What's New" entries appear here automatically. Reads meta.helpMechanics().

import { useState } from 'react';
import { meta } from '../state/meta';
import { MECHANIC_BY_ID } from '../state/mechanics';
import type { MechanicCategory, MechanicDef } from '../state/mechanics';
import { guideBus, guideFor } from '../state/guidedUnlocks';
import { navBus } from '../state/navBus';
import { searchMechanics } from './helpSearch';

const CATEGORY_ORDER: MechanicCategory[] = ['Basics', 'Towers', 'Heroes', 'Progression', 'Modes', 'World'];

export function HelpWiki({ onNavigate, onReplayTour }: { onNavigate?: (nav: string) => void; onReplayTour?: () => void }): JSX.Element {
  meta.use();
  const all = meta.helpMechanics();
  const [query, setQuery] = useState('');
  const [selId, setSelId] = useState<string | null>(all[0]?.id ?? null);

  const q = query.trim().toLowerCase();
  // Searching RANKS (ui/helpSearch.ts): title hits first, then summary, then body mentions —
  // shown as one flat best-first list; the detail pane follows the top hit until you pick one.
  const filtered = searchMechanics(all, q);
  const byCat = new Map<MechanicCategory, MechanicDef[]>();
  for (const m of filtered) { const l = byCat.get(m.category) ?? []; l.push(m); byCat.set(m.category, l); }
  const sel = (q
    ? (selId && filtered.find((m) => m.id === selId)) || filtered[0]
    : (selId && all.find((m) => m.id === selId)) || filtered[0]) || null;

  return (
    <div className="panel help-wiki">
      <div className="panel-title">
        Help · Field Manual <span className="help-count">{all.length} unlocked</span>
        {onReplayTour && (
          <button className="help-tour-replay" onClick={onReplayTour} title="Re-run the anchored walkthrough of the Command Center">
            ▶ Field Orientation
          </button>
        )}
      </div>
      <div className="panel-sub">A living guide — new systems appear here the moment you unlock them.</div>
      <input className="help-search" placeholder="Search mechanics…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search Help" />

      <div className="help-body">
        <nav className="help-index" aria-label="Mechanics">
          {q && filtered.length > 0 && (
            <div className="help-cat">
              <div className="help-cat-h">{filtered.length} result{filtered.length === 1 ? '' : 's'} · best match first</div>
              {filtered.map((m) => (
                <button key={m.id} className={`help-entry ${sel?.id === m.id ? 'on' : ''}`} onClick={() => setSelId(m.id)}>{m.title}</button>
              ))}
            </div>
          )}
          {!q && CATEGORY_ORDER.filter((c) => byCat.has(c)).map((c) => (
            <div className="help-cat" key={c}>
              <div className="help-cat-h">{c}</div>
              {byCat.get(c)!.map((m) => (
                <button key={m.id} className={`help-entry ${sel?.id === m.id ? 'on' : ''}`} onClick={() => setSelId(m.id)}>{m.title}</button>
              ))}
            </div>
          ))}
          {filtered.length === 0 && <div className="hint">No mechanics match “{query}”.</div>}
        </nav>

        {sel && (
          <article className="help-detail" key={sel.id}>
            <h3 className="help-detail-title">{sel.title}</h3>
            <div className="help-detail-sum">{sel.summary}</div>
            {sel.media && <div className="help-media" aria-hidden>▶ {sel.media}</div>}
            <div className="help-rows">
              <div className="help-row"><span className="help-k">What</span><span className="help-v">{sel.what}</span></div>
              <div className="help-row"><span className="help-k">Why</span><span className="help-v">{sel.why}</span></div>
              <div className="help-row"><span className="help-k">Where</span><span className="help-v">{sel.where}</span></div>
              <div className="help-row"><span className="help-k">Next</span><span className="help-v">{sel.next}</span></div>
              {sel.mistakes && <div className="help-row is-mistake"><span className="help-k">Watch out</span><span className="help-v">{sel.mistakes}</span></div>}
            </div>
            {sel.nav && onNavigate && (
              <button className="help-goto" onClick={() => onNavigate(sel.nav!)}>Open {sel.title} ▸</button>
            )}
            {/* Field-guide replay (docs/GUIDED-UNLOCKS.md): re-teaches the wing's walkthrough —
                the milestone ledger keeps replays unpaid. */}
            {guideFor(sel.id) && (
              <button
                className="help-goto is-guide"
                onClick={() => { navBus.go(guideFor(sel.id)!.nav); guideBus.start(sel.id); }}
                title="Replay the anchored walkthrough on the screen itself"
              >
                ▶ Field guide
              </button>
            )}
            {sel.links && sel.links.some((id) => all.some((m) => m.id === id)) && (
              <div className="help-links">
                <span className="help-links-k">Related</span>
                {sel.links.filter((id) => all.some((m) => m.id === id)).map((id) => (
                  <button key={id} className="help-link" onClick={() => setSelId(id)}>{MECHANIC_BY_ID.get(id)?.title ?? id}</button>
                ))}
              </div>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
