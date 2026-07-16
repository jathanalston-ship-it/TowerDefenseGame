// THE CLAIM POPUP (docs/NOTIFICATIONS.md §claim-popups) — one bold, unmissable receipt for
// every hub claim, replacing each screen's easy-to-miss inline strip. Center band, queued one
// at a time (never stacks), itemized lines with icons + rarity tints, an optional "view it"
// jump (navBus) to where the reward landed, and a big framing for finales/capstones.
//
// CEREMONY TIERS (docs/NOTIFICATIONS.md §tiers): the receipt's vocabulary tier (rewardVocab)
// scales the treatment — common stays subtle, rare glows, epic sprays spores, legendary adds
// a screen wash, a longer dwell and (for sound-flagged receipts) the jackpot stinger. A
// single quantified line renders the HERO placard: the big medal + the quantity as the
// headline, readable in under a second. Dismissal is everywhere: the ✕, a click, a swipe
// (docs/NOTIFICATIONS.md §dismiss), and Clear All once a real queue builds. Rapid identical
// receipts are COALESCED by the bus into one rising total (§merge). Pure presentation: the
// save is already true; audio fires only for receipts that opted in (`sound` — claim sites
// with their own cue stay single-voiced).

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { coalesce, rewardToast } from '../../state/rewardToast';
import type { RewardToast } from '../../state/rewardToast';
import { navBus } from '../../state/navBus';
import { audio } from '../../audio/sound';
import type { RewardTier } from '../../state/rewardVocab';

const SHOW_MS = 5000; // ≥5s default (docs/NOTIFICATIONS.md §dismiss) — loot toast is 3.2s
const SHOW_BIG_MS = 6800;
const SHOW_LEGENDARY_MS = 8000; // the big pull deserves its beat
const MAX_LINES = 7; // beyond this the receipt summarizes ("+N more") — claim-all can be long
const SWIPE_DISMISS_PX = 88; // horizontal travel that counts as a swipe-away
const DRAG_SUPPRESS_CLICK_PX = 8; // past this a pointer-up is a drag end, not a click

const TIER_CUE: Record<RewardTier, string> = {
  common: 'ui', // light organic click
  rare: 'reveal', // mutation pulse
  epic: 'unlock', // biological resonance
  legendary: 'jackpot', // the distinct stinger
};

function dwellFor(t: RewardToast): number {
  if (t.tier === 'legendary') return SHOW_LEGENDARY_MS;
  if (t.big) return SHOW_BIG_MS;
  if (t.tier === 'epic') return SHOW_BIG_MS;
  return SHOW_MS;
}

export function RewardToaster(): JSX.Element | null {
  const [queue, setQueue] = useState<RewardToast[]>([]);
  // Swipe-away state: dx follows the pointer; `snap` re-enables the transition on release.
  const [dx, setDx] = useState(0);
  const drag = useRef<{ startX: number; moved: boolean; active: boolean }>({ startX: 0, moved: false, active: false });

  useEffect(() => rewardToast.onToast((t) => setQueue((q) => coalesce(q, t))), []);

  const dismissFront = (): void => { setDx(0); setQueue((q) => q.slice(1)); };

  // Auto-dismiss the front toast; re-arms whenever the front changes (next in queue, or a
  // coalesced merge re-keys the front — the dwell restarts on the updated total).
  const front = queue[0];
  const frontId = front?.id ?? -1;
  useEffect(() => {
    if (!front) return undefined;
    const t = window.setTimeout(dismissFront, dwellFor(front));
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontId]);

  // Tier audio — only for receipts whose claim site has no cue of its own (§tiers).
  useEffect(() => {
    if (front?.sound) audio.cue(TIER_CUE[front.tier ?? 'common']);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontId]);

  if (!front) return null;
  const accent = front.accent ?? 'var(--gold)';
  const tier = front.tier ?? 'common';
  const shown = front.lines.slice(0, MAX_LINES);
  const extra = front.lines.length - shown.length;
  // HERO placard (§tiers): one quantified line ⇒ the quantity IS the headline. The WHAT text
  // drops when the receipt's name headline already says it (market buys label lines by name).
  const hero = front.lines.length === 1 && typeof front.lines[0].qty === 'number' ? front.lines[0] : null;
  const heroWhat = hero ? hero.label.replace(/^[\d,.]+×?\s*/, '') : '';

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    drag.current = { startX: e.clientX, moved: false, active: true };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!drag.current.active) return;
    const d = e.clientX - drag.current.startX;
    if (Math.abs(d) > DRAG_SUPPRESS_CLICK_PX) drag.current.moved = true;
    setDx(d);
  };
  const onPointerUp = (): void => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (Math.abs(dx) > SWIPE_DISMISS_PX) dismissFront();
    else setDx(0);
  };

  return (
    <div className="rwt-wrap" aria-live="polite">
      {tier === 'legendary' && <span className="rwt-screen" key={`s${front.id}`} aria-hidden />}
      <div
        className={`rwt is-t-${tier}${front.big ? ' is-big' : ''}${hero ? ' is-hero' : ''}${drag.current.active ? ' is-dragging' : ''}`}
        key={front.id}
        role="status"
        style={{ ['--rw' as string]: accent, ['--dx' as string]: `${dx}px` } as CSSProperties}
        onClick={() => { if (!drag.current.moved) dismissFront(); }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="Dismiss"
      >
        {/* The dopamine hit: one-shot burst rays + a medal ripple + a shimmer sweep, all
            re-keyed per receipt (the card's key) so chained claims re-fire every time. */}
        <span className="rwt-burst" aria-hidden><i /><i /><i /><i /><i /><i /><i /><i /></span>
        {tier === 'epic' || tier === 'legendary' ? (
          <span className="rwt-spores" aria-hidden><i /><i /><i /><i /><i /><i /></span>
        ) : null}
        <span className="rwt-sheen" aria-hidden />
        <span className="rwt-medal" aria-hidden>{front.icon ?? shown[0]?.icon ?? '◈'}<i className="rwt-medal-ring" /></span>
        <div className="rwt-body">
          <span className="rwt-eyebrow">{front.title}</span>
          {front.name && <span className="rwt-name">{front.name}</span>}
          {hero ? (
            /* WHAT · HOW MUCH · WHERE FROM, readable in under a second (§tiers). */
            <div className="rwt-hero" style={hero.rarity ? ({ color: `var(--r-${hero.rarity})` } as CSSProperties) : undefined}>
              <span className="rwt-qty">+{(hero.qty ?? 0).toLocaleString()}</span>
              {heroWhat !== front.name && <span className="rwt-what">{heroWhat}</span>}
            </div>
          ) : (
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
          )}
          {front.nav && (
            <button
              className="rwt-nav"
              onClick={(e) => {
                e.stopPropagation();
                navBus.go(front.nav!.key);
                dismissFront();
              }}
            >
              {front.nav.label} →
            </button>
          )}
        </div>
        <button
          className="rwt-x"
          aria-label="Dismiss notification"
          onClick={(e) => { e.stopPropagation(); dismissFront(); }}
        >
          ✕
        </button>
        {queue.length > 1 && <span className="rwt-queued" title={`${queue.length - 1} more receipt${queue.length > 2 ? 's' : ''} queued`}>+{queue.length - 1}</span>}
      </div>
      {queue.length > 2 && (
        <button className="rwt-clear" onClick={() => { setDx(0); setQueue([]); }}>
          Clear all ({queue.length})
        </button>
      )}
    </div>
  );
}
