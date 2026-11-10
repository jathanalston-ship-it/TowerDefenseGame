// UPDATE BRIEFING (docs/CHANGELOG-PIPELINE.md) — the version patch-notes popup. When the
// player's save has not seen the newest release, one celebratory, skimmable card: the
// release headline, ★ highlights (major content additions), then compact category groups.
// Distinct from WhatsNew.tsx (mechanic-unlock intros) — this one is about VERSIONS; it
// yields to that queue and renders on the menu only. Fresh accounts baseline silently
// (day-one players aren't greeted with history). "Never show again" is a permanent,
// reversible opt-out.

import { useEffect, useRef } from 'react';
import { meta } from '../state/meta';
import { audio } from '../audio/sound';
import { navBus } from '../state/navBus';
import { hiveIntel } from '../state/hiveIntel';
import type { Release, ReleaseEntry } from '../changelog/types';
import { RELEASES } from '../changelog/releases.gen'; // the whole history — this component is its own lazy chunk (App)
import { NOTE_CATEGORIES } from '../changelog/types';
import './UpdateBriefing.css';

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
  const { latest, unseen, optOut } = meta.patchNotesView(RELEASES);
  const fresh = meta.get().totalRuns === 0 && meta.get().patchNotes.seen === '';
  const dialogRef = useRef<HTMLDivElement>(null);
  const visible = !!latest && !optOut && !fresh && unseen.length > 0 && meta.whatsNew().length === 0;

  // A brand-new account baselines silently — the briefing is for RETURNING players.
  useEffect(() => {
    if (fresh && latest) meta.markPatchNotesSeen(RELEASES);
  }, [fresh, latest]);

  useEffect(() => {
    if (!visible) return;
    const previous = document.activeElement;
    dialogRef.current?.querySelector<HTMLButtonElement>('.ub-go')?.focus({ preventScroll: true });
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [visible]);

  if (!visible) return null; // mechanic intros take the stage first

  const { highlights, groups } = digest(unseen);
  const head = unseen[0];
  const done = (): void => { meta.markPatchNotesSeen(RELEASES); audio.cue('ui'); };
  const never = (): void => { meta.setPatchNotesOptOut(true, RELEASES); audio.cue('ui'); };
  // Returning-player bridge (docs/HIVE-INTEL.md): the briefing says what CHANGED; these two rows
  // say what to DO — the Feed's own ACT intel (banked value, best Power move), one tap away.
  const acts = hiveIntel(meta.get(), Date.now()).filter((e) => e.priority === 'act').slice(0, 2);
  const act = (nav: string): void => { done(); navBus.go(nav); };

  return (
    <div ref={dialogRef} className="whatsnew ub" role="dialog" aria-modal="true" aria-label="Update briefing" onClick={done}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); return; }
        if (e.key !== 'Tab') return;
        const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]'));
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }}>
      <div className="evo-rays" aria-hidden />
      <div className="wn-card ub-card" onClick={(e) => e.stopPropagation()}>
        <div className="wn-badge">⇪ UPDATE BRIEFING · {head.id}</div>
        <h2 className="wn-title">{head.title}</h2>
        <div className="ub-sub">{unseen.length > 1 ? `${unseen.length} releases since your last visit` : head.date}</div>

        {highlights.length > 0 && (
          <div className="ub-highlights" role="region" aria-label="Release highlights" tabIndex={0}>
            {highlights.map((h) => <div key={h.text} className="ub-hi">★ {h.text}</div>)}
          </div>
        )}

        <div className="ub-groups" role="region" aria-label="Release changes" tabIndex={groups.length ? 0 : undefined}>
          {groups.map(([cat, lines], i) => (
            <div key={cat} className="ub-group" style={{ ['--i' as string]: i }}>
              <span className="ub-cat">{cat}</span>
              <ul className="ub-lines">
                {lines.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </div>
          ))}
        </div>

        {acts.length > 0 && (
          <div className="ub-now" aria-label="Waiting for you now">
            <span className="ub-now-k">WAITING FOR YOU</span>
            {acts.map((e) => (
              <button key={e.id} className="ub-now-row" onClick={() => act(e.nav)} title={e.why}>
                <span aria-hidden>{e.icon}</span>
                <span className="ub-now-t">{e.what}</span>
                {e.powerGain !== undefined && <span className="ub-now-gain">+{e.powerGain}⚡</span>}
                <span className="ub-now-go">{e.action} ▸</span>
              </button>
            ))}
          </div>
        )}

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
