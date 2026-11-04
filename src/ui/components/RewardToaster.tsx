// THE REWARD PLACARD STACK (docs/NOTIFICATIONS.md §reward-toasts) — every reward event
// renders as a miniature reveal card: LARGE art (left) · big +quantity · unit name · source
// subtitle · rarity word · optional Power / collection lines. Cards stack top-right (top
// band on phones), merge-bump when identical rewards land in a burst, and dismiss by X /
// click / swipe / Dismiss All. Rarity scales the whole presentation: t0 subtle rise, t1 rim
// glow, t2 spark burst, t3 legendary takeover (bigger card + screen accent + stinger).
// Pure presentation over the state/rewardToast queue rules; the save is already true.

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import {
  TOAST_MAX_VISIBLE, applyEvent, lifeOf, pruneCards, rewardToast, rewardTypeOf,
} from '../../state/rewardToast';
import type { RewardArt, ToastCard } from '../../state/rewardToast';
import { navBus } from '../../state/navBus';
import { audio } from '../../audio/sound';
import { CurrencyIcon } from './CurrencyIcon';
import { useCountUp } from './useCountUp';
import { rarityColorOf } from '../../core/equipment';

const RARITY_WORD: Record<string, string> = {
  common: 'COMMON', uncommon: 'UNCOMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY', exotic: 'EXOTIC', mythic: 'MYTHIC',
};

function ArtPanel({ art, rarity }: { art: RewardArt | undefined; rarity?: string }): JSX.Element {
  if (art?.kind === 'currency') return <CurrencyIcon id={art.id} size={44} pickup title="" />;
  if (art?.kind === 'gene') return <span className="rwt2-glyph" style={{ color: rarity ? `var(--r-${rarity})` : 'var(--viral)' }}>🧬</span>;
  if (art?.kind === 'container') return <span className="rwt2-glyph" style={{ color: rarity ? rarityColorOf(rarity as never) : 'var(--r-common)' }}>◈</span>;
  return <span className="rwt2-glyph" style={{ color: art?.color ?? 'var(--gold)' }}>{art?.glyph ?? '✦'}</span>;
}

/** The big quantity line counts up on merge bumps — the +425 moment reads as growth. */
function QtyLine({ qty, unitOnly }: { qty: number; unitOnly: boolean }): JSX.Element | null {
  const shown = useCountUp(qty);
  if (unitOnly) return null;
  return <span className="rwt2-qty">+{shown.toLocaleString()}</span>;
}

function Card({ card, onDismiss, onKeep }: { card: ToastCard; onDismiss: (uid: number) => void; onKeep: (uid: number) => void }): JSX.Element {
  const def = rewardTypeOf(card.type);
  const [open, setOpen] = useState(false); // a summary placard expands to its itemized lines
  const color = card.rarity ? `var(--r-${card.rarity})` : def?.art.kind === 'glyph' ? def.art.color : 'var(--gold)';
  // Swipe dismissal (mobile + mouse drags): track dx; past the threshold the card flies out.
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x0: number; on: boolean }>({ x0: 0, on: false });
  const onDown = (ev: ReactPointerEvent): void => { drag.current = { x0: ev.clientX, on: true }; };
  const onMove = (ev: ReactPointerEvent): void => { if (drag.current.on) setDx(ev.clientX - drag.current.x0); };
  const onUp = (): void => {
    if (!drag.current.on) return;
    drag.current.on = false;
    if (Math.abs(dx) > 72) onDismiss(card.uid);
    else if (Math.abs(dx) < 6) onDismiss(card.uid); // a plain click/tap dismisses too
    else setDx(0);
  };
  // The unique-item card (equipment/cosmetic/achievement) and a summary placard lead with a NAME, not a +qty.
  const unitOnly = def?.merge === 'never' && (card.qty <= 1 || card.type === 'achievement' || !!card.items);
  return (
    <article
      className={`rwt2 t${card.tier}`}
      role="status"
      style={{ ['--rw' as string]: color, transform: dx !== 0 ? `translateX(${dx}px)` : undefined, opacity: dx !== 0 ? Math.max(0.25, 1 - Math.abs(dx) / 160) : undefined } as CSSProperties}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => { drag.current.on = false; setDx(0); }}
    >
      {/* key on bumpedAt: every merge re-fires the pulse ring + keeps the card visibly alive */}
      <span key={card.bumpedAt} className="rwt2-pulse" aria-hidden />
      {card.tier >= 2 && <span key={`s${card.bumpedAt}`} className="rwt2-sparks" aria-hidden><i /><i /><i /><i /><i /><i /></span>}
      <button
        type="button"
        className="rwt2-x"
        aria-label="Dismiss notification"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onDismiss(card.uid); }}
      >✕</button>
      <span className="rwt2-art" aria-hidden><ArtPanel art={def?.art} rarity={card.rarity} /></span>
      <div className="rwt2-body">
        <span className="rwt2-src">{card.source}</span>
        <QtyLine qty={card.qty} unitOnly={unitOnly} />
        <span className="rwt2-unit">
          {card.name ?? def?.unit ?? card.type}
          {card.count > 1 && def?.merge === 'count' && <b className="rwt2-xn"> ×{card.qty}</b>}
        </span>
        {card.name && !unitOnly && <span className="rwt2-sub">{def?.unit}</span>}
        <span className="rwt2-tags">
          {card.rarity && <i className="rwt2-rarity">{RARITY_WORD[card.rarity] ?? card.rarity.toUpperCase()}</i>}
          {card.power ? <i className="rwt2-power">▲ +{Math.round(card.power)} Power</i> : null}
        </span>
        {card.collection && <span className="rwt2-coll">{card.collection}</span>}
        {card.items && (
          <>
            <button
              type="button"
              className="rwt2-expand"
              aria-expanded={open}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); onKeep(card.uid); }}
            >
              {open ? '▾ Hide' : `▸ Show all ${card.items.length}`}
            </button>
            {open && <ul className="rwt2-items">{card.items.map((it, i) => <li key={i}>{it}</li>)}</ul>}
          </>
        )}
        {card.nav && (
          <button
            type="button"
            className="rwt2-nav"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); navBus.go(card.nav!.key); onDismiss(card.uid); }}
          >
            {card.nav.label} →
          </button>
        )}
      </div>
    </article>
  );
}

export function RewardToaster({ held = false }: { held?: boolean } = {}): JSX.Element | null {
  const [cards, setCards] = useState<ToastCard[]>([]);
  const lastCueAt = useRef(0);

  // Subscribe to the bus; each event folds through the pure queue rules. Arrival audio is
  // tier-keyed and rate-limited (a burst clicks once, not eight times); merges tick softly.
  // `held` (an unlock announcement is up) keeps the bus unsubscribed, so arrivals wait in its
  // hold buffer and flush — coalesced — the moment the announcement clears.
  useEffect(() => held ? undefined : rewardToast.onReward((e) => {
    setCards((cs) => {
      const next = applyEvent(pruneCards(cs, Date.now()), e, Date.now());
      const merged = next.length === cs.length; // same count ⇒ the event merged into a card
      const now = performance.now();
      if (now - lastCueAt.current > 200) {
        lastCueAt.current = now;
        const tier = next[0]?.tier ?? 0;
        audio.cue(merged ? 'toast0' : tier >= 3 ? 'jackpot' : (`toast${Math.min(2, tier)}` as 'toast0' | 'toast1' | 'toast2'));
      }
      return next;
    });
  }), [held]);

  // Lifetime prune tick (lifetimes re-arm on merge bumps, so a fixed timer per card is wrong).
  useEffect(() => {
    if (cards.length === 0) return undefined;
    const id = window.setInterval(() => setCards((cs) => pruneCards(cs, Date.now())), 250);
    return () => window.clearInterval(id);
  }, [cards.length > 0]);

  if (cards.length === 0) return null;
  const visible = cards.slice(0, TOAST_MAX_VISIBLE);
  const queued = cards.length - visible.length;
  const dismiss = (uid: number): void => setCards((cs) => cs.filter((c) => c.uid !== uid));
  // Reading an expanded summary re-arms its lifetime (it never expires mid-read).
  const keep = (uid: number): void => setCards((cs) => cs.map((c) => (c.uid === uid ? { ...c, bumpedAt: Date.now() } : c)));
  const hasApex = visible.some((c) => c.tier >= 3);
  return (
    <div className="rwt2-wrap" aria-live="polite">
      {/* The legendary takeover: a one-shot screen accent behind the stack (reduced-motion: none) */}
      {hasApex && <span key={visible.find((c) => c.tier >= 3)?.uid} className="rwt2-accent" aria-hidden />}
      {visible.map((c) => <Card key={c.uid} card={c} onDismiss={dismiss} onKeep={keep} />)}
      {(queued > 0 || cards.length > 2) && (
        <div className="rwt2-foot">
          {queued > 0 && <span className="rwt2-more">+{queued} more</span>}
          <button type="button" className="rwt2-clear" onClick={() => setCards([])}>Dismiss All ✕</button>
        </div>
      )}
    </div>
  );
}

/** Compute a card's remaining life fraction (exported for a future progress ring; also keeps
 *  lifeOf referenced from the UI layer so the rules module stays the single authority). */
export function lifeFractionOf(card: ToastCard, now: number): number {
  return Math.max(0, 1 - (now - card.bumpedAt) / lifeOf(card));
}
