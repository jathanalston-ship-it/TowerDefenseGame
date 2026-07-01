// "What's New?" (docs/HELP.md) — when a permanent mechanic first unlocks, a concise, celebratory
// intro: what it is, why it matters, where to find it, and what it enables next. Never dumps the
// player into the feature. On dismiss it's archived into the Help wiki (so it's revisitable and never
// re-announces). Queued: unlocks that land together show one at a time. Rendered on the menu only.

import { meta } from '../state/meta';

export function WhatsNew(): JSX.Element | null {
  meta.use(); // re-render as the archive changes
  const queue = meta.whatsNew();
  if (queue.length === 0) return null;
  const m = queue[0];
  const close = (): void => meta.archiveMechanics([m.id]); // persist → re-render drops this card, shows the next

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
        <button className="primary wn-go" onClick={close}>
          Got it{queue.length > 1 ? ` · ${queue.length - 1} more` : ''} ▸
        </button>
        <div className="wn-foot">Archived in Help — revisit any time.</div>
      </div>
    </div>
  );
}
