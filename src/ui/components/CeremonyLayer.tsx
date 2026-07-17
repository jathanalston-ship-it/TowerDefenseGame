// CEREMONY LAYER (docs/REWARD-PRESENTATION.md §ceremony) — the physical moment of a reward.
// Taps the reward bus (observe-only — the toaster stays the announcer) and, for every event:
//   • a particle BURST blooms at the claim point (the last pointer-down),
//   • a currency icon FLIES from that point into its top-bar wallet chip,
//   • the chip BUMPS on arrival (the WalletChip roll makes the number move with it).
// Because every grant surface already announces on the bus, every current AND future reward
// inherits this with zero per-surface wiring. Tier-scaled (small = tiny burst + flight; big
// = denser burst), rate-limited (same-type flights fold within a window; bounded concurrency),
// pointer-events-free, and prefers-reduced-motion disables it wholesale (placards still tell).

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { rewardToast, rewardTypeOf, tierOf } from '../../state/rewardToast';
import { CurrencyIcon } from './CurrencyIcon';
import type { CurrencyId } from '../../core/currencies';

/** Reward types → the wallet chip they fly into (WalletChip data-cur / the mats chip).
 *  Types without a persistent top-bar home (shards pools, XP, items) burst only — their
 *  destination is a screen, and the placard's nav already points there. */
const FLIGHT_TARGET: Record<string, string> = {
  genomeCores: 'genomeCores',
  ichor: 'ichor',
  cells: 'ascendantCells',
  mutagen: 'mats',
  scrap: 'mats',
  catalyst: 'mats',
};

const FLY_MS = 680;
const BURST_MS = 620;
const FOLD_MS = 260; // same-type events inside this window share one flight
const MAX_FLIGHTS = 8;

interface Flight { id: number; icon: CurrencyId | null; glyph?: string; color?: string; x0: number; y0: number; x1: number; y1: number }
interface Burst { id: number; x: number; y: number; n: number; color: string }

let seq = 0;

export function CeremonyLayer(): JSX.Element | null {
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [flights, setFlights] = useState<Flight[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const pointer = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const lastFlightAt = useRef(new Map<string, number>());

  useEffect(() => {
    if (reduced) return undefined;
    // The claim point: the last pointer-down anywhere. Keyboard claims fall back to center.
    const onDown = (e: PointerEvent): void => { pointer.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('pointerdown', onDown, { capture: true, passive: true });

    const off = rewardToast.tap((e) => {
      const def = rewardTypeOf(e.type);
      const tier = tierOf(e);
      const { x, y } = pointer.current;
      const id = ++seq;
      const color = def?.art.kind === 'glyph' ? def.art.color : 'var(--gold)';
      setBursts((bs) => [...bs.slice(-6), { id, x, y, n: tier >= 2 ? 10 : tier >= 1 ? 7 : 5, color }]);
      window.setTimeout(() => setBursts((bs) => bs.filter((b) => b.id !== id)), BURST_MS);

      const targetKey = FLIGHT_TARGET[e.type];
      if (!targetKey) return;
      const now = performance.now();
      const last = lastFlightAt.current.get(e.type) ?? -1e9;
      if (now - last < FOLD_MS) return; // a burst of identical grants shares one flight
      lastFlightAt.current.set(e.type, now);
      const chip = document.querySelector(`[data-cur="${targetKey}"]`);
      if (!chip) return; // chip not revealed yet — the burst + placard still told the story
      const r = chip.getBoundingClientRect();
      const fl: Flight = {
        id,
        icon: def?.art.kind === 'currency' ? def.art.id : null,
        glyph: def?.art.kind === 'glyph' ? def.art.glyph : undefined,
        color: def?.art.kind === 'glyph' ? def.art.color : undefined,
        x0: x, y0: y, x1: r.left + r.height / 2, y1: r.top + r.height / 2,
      };
      setFlights((fs) => (fs.length >= MAX_FLIGHTS ? fs : [...fs, fl]));
      window.setTimeout(() => {
        setFlights((fs) => fs.filter((f) => f.id !== id));
        // Arrival: the chip bumps (decorative DOM class — the save is already true).
        chip.classList.add('is-bumped');
        window.setTimeout(() => chip.classList.remove('is-bumped'), 460);
      }, FLY_MS);
    });
    return () => {
      window.removeEventListener('pointerdown', onDown, { capture: true } as EventListenerOptions);
      off();
    };
  }, [reduced]);

  if (reduced || (flights.length === 0 && bursts.length === 0)) return null;
  return (
    <div className="cer-layer" aria-hidden>
      {bursts.map((b) => (
        <span key={b.id} className="cer-burst" style={{ left: b.x, top: b.y, ['--cb' as string]: b.color } as CSSProperties}>
          {Array.from({ length: b.n }, (_, i) => (
            <i key={i} style={{ ['--a' as string]: `${Math.round((i / b.n) * 360)}deg` } as CSSProperties} />
          ))}
        </span>
      ))}
      {flights.map((f) => (
        <span
          key={f.id}
          className="cer-fly"
          style={{ ['--x0' as string]: `${f.x0}px`, ['--y0' as string]: `${f.y0}px`, ['--x1' as string]: `${f.x1}px`, ['--y1' as string]: `${f.y1}px` } as CSSProperties}
        >
          {f.icon ? <CurrencyIcon id={f.icon} size={22} /> : <b style={{ color: f.color ?? 'var(--gold)' }}>{f.glyph ?? '✦'}</b>}
        </span>
      ))}
    </div>
  );
}
