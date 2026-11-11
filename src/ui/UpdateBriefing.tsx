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
import { navBus } from '../state/navBus';
import { hiveIntel } from '../state/hiveIntel';
import type { Release, ReleaseEntry } from '../changelog/types';
import { RELEASES } from '../changelog/releases.gen'; // the whole history — this component is its own lazy chunk (App)
import { NOTE_CATEGORIES } from '../changelog/types';
import './UpdateBriefing.css';

/** LESS TO READ (2026-11-11 playtest): the briefing is at most BRIEF_TILES icon tiles — the
 *  newest highlights first (★ majors, then the rest in category order), each cut to a one-line
 *  headline — and a count of everything else, which lives on the full patch-notes page. */
const BRIEF_TILES = 3;

/** One glyph per release category (the tile's icon). */
const CAT_GLYPH: Record<string, string> = {
  Gameplay: '⚔', Balance: '⚖', Heroes: '♛', Towers: '▲', 'Gene Cards': '⬡', Enemies: '☠', Bosses: '☠',
  'Mega Bosses': '☠', UI: '◧', UX: '✦', Audio: '♪', Music: '♫', Visuals: '✺', Performance: '⚡',
  Optimization: '⚡', Security: '⛨', Website: '◎', Backend: '⚙', Framework: '⚙', 'Developer Tools': '⚒',
  'Bug Fixes': '✚',
};

/** A release line cut to a headline: its first clause (up to ": " / ". " / " — " / "; "), extended
 *  past a too-short lead-in ("New system: Class Bonds", not "New system"), capped at 9 words — the
 *  full sentence stays on the tile's tooltip and the patch-notes page. */
export function briefHeadline(text: string): string {
  const parts = text.split(/(: |\. | — |; )/); // delimiters kept at the odd indices
  let head = parts[0];
  for (let i = 1; head.trim().split(/\s+/).length < 3 && i + 1 < parts.length; i += 2) head += parts[i] + parts[i + 1];
  const words = head.trim().split(/\s+/);
  return words.length > 9 ? `${words.slice(0, 9).join(' ')}…` : head.trim();
}

function digest(unseen: Release[]): { tiles: ReleaseEntry[]; more: number } {
  const all = unseen.flatMap((r) => r.entries); // newest release first
  const rank = (e: ReleaseEntry): number => (e.major ? 0 : 1 + Math.max(0, (NOTE_CATEGORIES as readonly string[]).indexOf(e.cat)));
  const tiles = [...all].sort((a, b) => rank(a) - rank(b)).slice(0, BRIEF_TILES);
  return { tiles, more: all.length - tiles.length };
}

export function UpdateBriefing(): JSX.Element | null {
  meta.use();
  const { latest, unseen, optOut } = meta.patchNotesView(RELEASES);
  const fresh = meta.get().totalRuns === 0 && meta.get().patchNotes.seen === '';

  // A brand-new account baselines silently — the briefing is for RETURNING players.
  useEffect(() => {
    if (fresh && latest) meta.markPatchNotesSeen(RELEASES);
  }, [fresh, latest]);

  if (!latest || optOut || fresh || unseen.length === 0) return null;
  if (meta.whatsNew().length > 0) return null; // mechanic intros take the stage first

  const { tiles, more } = digest(unseen);
  const head = unseen[0];
  const done = (): void => { meta.markPatchNotesSeen(RELEASES); audio.cue('ui'); };
  const never = (): void => { meta.setPatchNotesOptOut(true, RELEASES); audio.cue('ui'); };
  // Returning-player bridge (docs/HIVE-INTEL.md): the briefing says what CHANGED; these two rows
  // say what to DO — the Feed's own ACT intel (banked value, best Power move), one tap away.
  const acts = hiveIntel(meta.get(), Date.now()).filter((e) => e.priority === 'act').slice(0, 2);
  const act = (nav: string): void => { done(); navBus.go(nav); };

  return (
    <div className="whatsnew ub" role="dialog" aria-label="Update briefing" onClick={done}>
      <div className="evo-rays" aria-hidden />
      <div className="wn-card ub-card" onClick={(e) => e.stopPropagation()}>
        <div className="wn-badge">⇪ UPDATE BRIEFING · {head.id}</div>
        <h2 className="wn-title">{head.title}</h2>
        <div className="ub-sub">{unseen.length > 1 ? `${unseen.length} releases since your last visit` : head.date}</div>

        <div className="ub-tiles">
          {tiles.map((e, i) => (
            <div key={e.text} className={`ub-tile${e.major ? ' is-major' : ''}`} title={e.text} style={{ ['--i' as string]: i }}>
              <span className="ub-tile-glyph" aria-hidden>{CAT_GLYPH[e.cat] ?? '✦'}</span>
              <span className="ub-tile-t">{briefHeadline(e.text)}</span>
            </div>
          ))}
        </div>
        {more > 0 && (
          <a className="ub-more" href="/news/" target="_blank" rel="noreferrer" onClick={done}>See all changes ▸</a>
        )}

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
