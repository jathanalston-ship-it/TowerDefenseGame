// UPDATE BRIEFING (docs/CHANGELOG-PIPELINE.md) — the version patch-notes popup. When the
// player's save has not seen the newest release, one celebratory, skimmable card: the
// release headline, ★ highlights (major content additions), then compact category groups.
// Distinct from WhatsNew.tsx (mechanic-unlock intros) — this one is about VERSIONS; it
// yields to that queue and renders on the menu only. Fresh accounts baseline silently
// (day-one players aren't greeted with history). "Never show again" is a permanent,
// reversible opt-out.

import { useEffect } from 'react';
import { meta } from '../state/meta';
import { audio } from '../audio/sound';
import type { Release, ReleaseEntry } from '../changelog/types';
import { NOTE_CATEGORIES } from '../changelog/types';

/** Collapse the unseen releases into one skimmable briefing: highlights first, then
 *  entries grouped in the standard category order, capped so the card never scrolls far. */
function digest(unseen: Release[]): { highlights: ReleaseEntry[]; groups: [string, string[]][] } {
  const all = unseen.flatMap((r) => r.entries);
  const highlights = all.filter((e) => e.major);
  const byCat = new Map<string, string[]>();
  for (const e of all) {
    if (e.major) continue;
    const list = byCat.get(e.cat) ?? [];
    if (list.length < 4) list.push(e.text); // ≤4 lines per category — skim, don't scroll
    byCat.set(e.cat, list);
  }
  const groups = NOTE_CATEGORIES.filter((c) => byCat.has(c)).map((c) => [c, byCat.get(c)!] as [string, string[]]);
  return { highlights, groups };
}

export function UpdateBriefing(): JSX.Element | null {
  meta.use();
  const { latest, unseen, optOut } = meta.patchNotesView();
  const fresh = meta.get().totalRuns === 0 && meta.get().patchNotes.seen === '';

  // A brand-new account baselines silently — the briefing is for RETURNING players.
  useEffect(() => {
    if (fresh && latest) meta.markPatchNotesSeen();
  }, [fresh, latest]);

  if (!latest || optOut || fresh || unseen.length === 0) return null;
  if (meta.whatsNew().length > 0) return null; // mechanic intros take the stage first

  const { highlights, groups } = digest(unseen);
  const head = unseen[0];
  const done = (): void => { meta.markPatchNotesSeen(); audio.cue('ui'); };
  const never = (): void => { meta.setPatchNotesOptOut(true); audio.cue('ui'); };

  return (
    <div className="whatsnew ub" role="dialog" aria-label="Update briefing" onClick={done}>
      <div className="evo-rays" aria-hidden />
      <div className="wn-card ub-card" onClick={(e) => e.stopPropagation()}>
        <div className="wn-badge">⇪ UPDATE BRIEFING · {head.id}</div>
        <h2 className="wn-title">{head.title}</h2>
        <div className="ub-sub">{unseen.length > 1 ? `${unseen.length} releases since your last visit` : head.date}</div>

        {highlights.length > 0 && (
          <div className="ub-highlights">
            {highlights.map((h) => <div key={h.text} className="ub-hi">★ {h.text}</div>)}
          </div>
        )}

        <div className="ub-groups">
          {groups.map(([cat, lines], i) => (
            <div key={cat} className="ub-group" style={{ ['--i' as string]: i }}>
              <span className="ub-cat">{cat}</span>
              <ul className="ub-lines">
                {lines.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </div>
          ))}
        </div>

        <div className="ub-actions">
          <button className="primary ub-go" onClick={done}>Continue ▸</button>
          <a className="ub-link" href="/news/" target="_blank" rel="noreferrer" onClick={done}>Full patch notes</a>
          <a className="ub-link" href="/blog/" target="_blank" rel="noreferrer" onClick={done}>Dev blog</a>
          <button className="ub-never" onClick={never}>Never show again</button>
        </div>
      </div>
    </div>
  );
}
