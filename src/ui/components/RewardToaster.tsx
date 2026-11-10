// THE REWARD PLACARD STACK (docs/NOTIFICATIONS.md §reward-toasts) — every reward event
// renders as a miniature reveal card: LARGE art (left) · big +quantity · unit name · source
// subtitle · rarity word · optional Power / collection lines. Cards stack top-right (top
// band on phones), merge-bump when identical rewards land in a burst, and dismiss by X /
// click / swipe / Dismiss All. Rarity scales the whole presentation: t0 subtle rise, t1 rim
// glow, t2 spark burst, t3 legendary takeover (bigger card + screen accent + stinger).
// Pure presentation over the state/rewardToast queue rules; the save is already true.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import {
  TOAST_MAX_VISIBLE, applyEvent, lifeOf, pruneCards, rewardToast, rewardTypeOf,
} from '../../state/rewardToast';
import type { RewardArt, ToastCard } from '../../state/rewardToast';
import { navBus } from '../../state/navBus';
import { meta } from '../../state/meta';
import { presentRewardEvent } from '../../state/rewardVisibility';
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
  return <><span className="rwt2-qty" aria-hidden="true">+{shown.toLocaleString()}</span><span className="a11y-only">+{qty.toLocaleString()}</span></>;
}

function Card({ card, onDismiss, onReading }: { card: ToastCard; onDismiss: (uid: number, restoreFocus?: boolean) => void; onReading: (uid: number, reading: boolean) => void }): JSX.Element {
  const def = rewardTypeOf(card.type);
  const [open, setOpen] = useState(false); // a summary placard expands to its itemized lines
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reading = hovered || focused || open;
  useEffect(() => {
    onReading(card.uid, reading);
    return () => { if (reading) onReading(card.uid, false); };
  }, [card.uid, reading, onReading]);
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
      onPointerEnter={(e) => { if (e.pointerType !== 'touch') setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}
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
              onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
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
            onClick={(e) => { e.stopPropagation(); navBus.go(card.nav!.key); onDismiss(card.uid, false); }}
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
  const stackRef = useRef<HTMLDivElement>(null);
  const dismissedFocus = useRef<HTMLElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const removed = dismissedFocus.current;
    dismissedFocus.current = null;
    if (!removed || removed.isConnected || document.activeElement !== document.body) return;
    const next = stackRef.current?.querySelector<HTMLButtonElement>('.rwt2-x');
    if (next) next.focus({ preventScroll: true });
    else if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
  }, [cards]);
  const lastCueAt = useRef(0);
  const reading = useRef(new Set<number>());
  const grace = useRef(new Map<number, number>());
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const visibleIds = useRef<number[]>([]);
  const pinnedIds = useRef<number[]>([]);
  const onReading = useCallback((uid: number, active: boolean): void => {
    if (active === reading.current.has(uid)) return;
    if (active) {
      if (!reading.current.size) pinnedIds.current = [...visibleIds.current];
      reading.current.add(uid);
    } else {
      reading.current.delete(uid);
      const card = cardsRef.current.find((c) => c.uid === uid);
      if (card) grace.current.set(uid, Date.now() + lifeOf(card));
      if (!reading.current.size) pinnedIds.current = [];
    }
    setCards((cs) => [...cs]);
  }, []);
  // Presentation deadlines stay separate from bumpedAt, which owns merge windows and FX.
  const prune = useCallback((cs: ToastCard[], now: number): ToastCard[] => {
    for (const [uid, until] of grace.current) if (until <= now) grace.current.delete(uid);
    const alive = new Set(pruneCards(cs, now).map((c) => c.uid));
    const next = cs.filter((c) => alive.has(c.uid) || reading.current.has(c.uid) || (grace.current.get(c.uid) ?? 0) > now);
    return next.length === cs.length ? cs : next;
  }, []);

  // Subscribe to the bus; each event folds through the pure queue rules. Arrival audio is
  // tier-keyed and rate-limited (a burst clicks once, not eight times); merges tick softly.
  // `held` (an unlock announcement is up) keeps the bus unsubscribed, so arrivals wait in its
  // hold buffer and flush — coalesced — the moment the announcement clears.
  useEffect(() => held ? undefined : rewardToast.onReward((raw) => {
    // Player-facing gate (state/rewardVisibility.ts): a kind whose system hasn't revealed banks
    // silently; secondary crafting wallets toast as one grouped Materials card.
    const e = presentRewardEvent(meta.get(), raw);
    if (!e) return;
    setCards((cs) => {
      const next = applyEvent(prune(cs, Date.now()), e, Date.now());
      const merged = next.length === cs.length; // same count ⇒ the event merged into a card
      const now = performance.now();
      if (now - lastCueAt.current > 200) {
        lastCueAt.current = now;
        const tier = next[0]?.tier ?? 0;
        audio.cue(merged ? 'toast0' : tier >= 3 ? 'jackpot' : (`toast${Math.min(2, tier)}` as 'toast0' | 'toast1' | 'toast2'));
      }
      return next;
    });
  }), [held, prune]);

  // Lifetime prune tick (lifetimes re-arm on merge bumps, so a fixed timer per card is wrong).
  useEffect(() => {
    if (cards.length === 0) return undefined;
    const id = window.setInterval(() => setCards((cs) => prune(cs, Date.now())), 250);
    return () => window.clearInterval(id);
  }, [cards.length > 0, prune]);

  if (cards.length === 0) return null;
  // New arrivals must not push a focused/expanded card out of the visible stack.
  const pinned = pinnedIds.current.flatMap((uid) => cards.filter((c) => c.uid === uid));
  const visible = [...pinned, ...cards.filter((c) => !pinnedIds.current.includes(c.uid))].slice(0, TOAST_MAX_VISIBLE);
  visibleIds.current = visible.map((c) => c.uid);
  const queued = cards.length - visible.length;
  const dismiss = (uid: number, restoreFocus = true): void => {
    const active = document.activeElement;
    if (restoreFocus && active instanceof HTMLElement && stackRef.current?.contains(active)) dismissedFocus.current = active;
    setCards((cs) => cs.filter((c) => c.uid !== uid));
  };
  const hasApex = visible.some((c) => c.tier >= 3);
  return (
    <div className="rwt2-wrap" ref={stackRef}
      onFocusCapture={(event) => {
        const from = event.relatedTarget;
        if (from instanceof HTMLElement && from.isConnected && !event.currentTarget.contains(from)) previousFocus.current = from;
      }}>
      {/* The legendary takeover: a one-shot screen accent behind the stack (reduced-motion: none) */}
      {hasApex && <span key={visible.find((c) => c.tier >= 3)?.uid} className="rwt2-accent" aria-hidden />}
      {visible.map((c) => <Card key={c.uid} card={c} onDismiss={dismiss} onReading={onReading} />)}
      {(queued > 0 || cards.length > 2) && (
        <div className="rwt2-foot">
          {queued > 0 && <span className="rwt2-more">+{queued} more</span>}
          <button type="button" className="rwt2-clear" onClick={() => {
            const active = document.activeElement;
            if (active instanceof HTMLElement && stackRef.current?.contains(active)) dismissedFocus.current = active;
            setCards([]);
          }}>Dismiss All ✕</button>
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
