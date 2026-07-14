// THE CLAIM POPUP (docs/NOTIFICATIONS.md §claim-popups) — one bold, unmissable receipt for
// every hub claim, replacing each screen's easy-to-miss inline strip. Center band, queued one
// at a time (never stacks), itemized lines with icons + rarity tints, an optional "view it"
// jump (navBus) to where the reward landed, and a big framing for finales/capstones. Pure
// presentation: the save is already true, and audio stays at the claim site (no double cues).

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { rewardToast } from '../../state/rewardToast';
import type { RewardToast } from '../../state/rewardToast';
import { navBus } from '../../state/navBus';

const SHOW_MS = 5000; // long enough to read an itemized receipt (loot toast is 3.2s)
const SHOW_BIG_MS = 6800;
const MAX_LINES = 7; // beyond this the receipt summarizes ("+N more") — claim-all can be long

export function RewardToaster(): JSX.Element | null {
  const [queue, setQueue] = useState<RewardToast[]>([]);

  useEffect(() => rewardToast.onToast((t) => setQueue((q) => [...q, t])), []);

  // Auto-dismiss the front toast; re-arms whenever the front changes (next in queue).
  const front = queue[0];
  const frontId = front?.id ?? -1;
  useEffect(() => {
    if (!front) return undefined;
    const t = window.setTimeout(() => setQueue((q) => q.slice(1)), front.big ? SHOW_BIG_MS : SHOW_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontId]);

  if (!front) return null;
  const accent = front.accent ?? 'var(--gold)';
  const shown = front.lines.slice(0, MAX_LINES);
  const extra = front.lines.length - shown.length;
  return (
    <div className="rwt-wrap" aria-live="polite">
      <div
        className={`rwt${front.big ? ' is-big' : ''}`}
        key={front.id}
        role="status"
        style={{ ['--rw' as string]: accent } as CSSProperties}
        onClick={() => setQueue((q) => q.slice(1))}
        title="Dismiss"
      >
        {/* The dopamine hit: one-shot burst rays + a medal ripple + a shimmer sweep, all
            re-keyed per receipt (the card's key) so chained claims re-fire every time. */}
        <span className="rwt-burst" aria-hidden><i /><i /><i /><i /><i /><i /><i /><i /></span>
        <span className="rwt-sheen" aria-hidden />
        <span className="rwt-medal" aria-hidden>{front.icon ?? shown[0]?.icon ?? '◈'}<i className="rwt-medal-ring" /></span>
        <div className="rwt-body">
          <span className="rwt-eyebrow">{front.title}</span>
          {front.name && <span className="rwt-name">{front.name}</span>}
          <div className="rwt-lines">
            {shown.map((l, i) => (
              <span
                className="rwt-line"
                key={i}
                style={{ ['--i' as string]: i, ...(l.rarity ? { color: `var(--r-${l.rarity})` } : null) } as CSSProperties}
              >
                <i aria-hidden>{l.icon}</i> {l.label}
              </span>
            ))}
            {extra > 0 && <span className="rwt-line is-more" style={{ ['--i' as string]: MAX_LINES } as CSSProperties}>+{extra} more</span>}
          </div>
          {front.nav && (
            <button
              className="rwt-nav"
              onClick={(e) => {
                e.stopPropagation();
                navBus.go(front.nav!.key);
                setQueue((q) => q.slice(1));
              }}
            >
              {front.nav.label} →
            </button>
          )}
        </div>
        {queue.length > 1 && <span className="rwt-queued" title={`${queue.length - 1} more receipt${queue.length > 2 ? 's' : ''} queued`}>+{queue.length - 1}</span>}
      </div>
    </div>
  );
}
