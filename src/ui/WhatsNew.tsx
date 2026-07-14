// "What's New?" (docs/HELP.md, docs/PROGRESSION-GATING.md §presentation) — when a permanent
// mechanic first unlocks, a concise, celebratory intro: what it is, why it matters, where to find
// it, and what it enables next. Never dumps the player into the feature — but offers the door:
// the CTA routes straight to the mechanic's hub screen via the nav bus. Each card lands with the
// unlock fanfare. On dismiss it's archived into the Help wiki (revisitable, never re-announces).
// Queued: unlocks that land together show one at a time. Rendered on the menu only.
// When the mechanic has a Guided Unlock (docs/GUIDED-UNLOCKS.md), the CTA reads "Show me ▸" and
// `onGuide` arms the anchored walkthrough right after navigation — card, door, guide: one chain.

import { useEffect } from 'react';
import { meta } from '../state/meta';
import { audio } from '../audio/sound';
import { navBus } from '../state/navBus';
import { guideFor } from '../state/guidedUnlocks';

export function WhatsNew({ onGuide }: { onGuide?: (mechId: string) => void } = {}): JSX.Element | null {
  meta.use(); // re-render as the archive changes
  const queue = meta.whatsNew();
  const m = queue.length > 0 ? queue[0] : null;
  // The unlock fanfare — once per card as it takes the stage (id-keyed, so the next card re-fires).
  useEffect(() => { if (m) audio.cue('unlock'); }, [m?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return null;
  const guide = guideFor(m.id);
  const close = (): void => meta.archiveMechanics([m.id]); // persist → re-render drops this card, shows the next
  const open = (): void => {
    const nav = m.nav;
    const id = m.id;
    close();
    if (nav) {
      navBus.go(nav);
      if (guide) onGuide?.(id);
    }
  };

  return (
    <div className="whatsnew" role="dialog" aria-label="New System Unlocked" onClick={close}>
      <div className="evo-rays" aria-hidden />
      <div className="wn-card" onClick={(e) => e.stopPropagation()}>
        <div className="wn-badge">✦ NEW SYSTEM UNLOCKED ✦</div>
        <h2 className="wn-title">{m.title}</h2>
        <div className="wn-summary">{m.summary}</div>
        {m.media && <div className="wn-media" aria-hidden>▶ {m.media}</div>}
        <div className="wn-rows">
          <div className="wn-row"><span className="wn-k">What</span><span className="wn-v">{m.what}</span></div>
          <div className="wn-row"><span className="wn-k">Why</span><span className="wn-v">{m.why}</span></div>
          <div className="wn-row"><span className="wn-k">Where</span><span className="wn-v">{m.where}</span></div>
          <div className="wn-row"><span className="wn-k">Next</span><span className="wn-v">{m.next}</span></div>
        </div>
        <div className="wn-actions">
          {m.nav && <button className="primary wn-go" onClick={open}>{guide ? 'Show me ▸' : 'Open it now ▸'}</button>}
          <button className={m.nav ? 'wn-later' : 'primary wn-go'} onClick={close}>
            Got it{queue.length > 1 ? ` · ${queue.length - 1} more` : ''} ▸
          </button>
        </div>
        <div className="wn-foot">Archived in Help — revisit any time.</div>
      </div>
    </div>
  );
}
