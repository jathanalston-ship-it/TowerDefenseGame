// ROLLING WALLET CHIP (docs/REWARD-PRESENTATION.md §wallet) — the top-bar counters ROLL to
// their new value instead of snapping, and lift while gaining, so every grant is READ at the
// wallet the moment it lands (the CeremonyLayer's icon flights bump the same chip on arrival
// via its data-cur hook). One component for every single-currency chip; reduced-motion snaps.

import { useEffect, useRef, useState } from 'react';
import { CurrencyIcon } from './CurrencyIcon';
import type { CurrencyId } from '../../core/currencies';

/** Animate value CHANGES prev→next (ease-out ~0.6s) — unlike useCountUp's 0→N reveal, this
 *  rolls from wherever it was, which is what a persistent wallet counter needs. */
function useRollingNumber(value: number, ms = 600): { shown: number; rising: boolean } {
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(value);
  const [rising, setRising] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (reduced || from === value) {
      setShown(value);
      return undefined;
    }
    setRising(value > from);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      const p = Math.min(1, (now - start) / ms);
      setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setRising(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, reduced]);
  return { shown, rising };
}

export function WalletChip({ cur, value, label, title }: {
  cur: CurrencyId; // also the CeremonyLayer flight target key (data-cur)
  value: number;
  label: string;
  title?: string;
}): JSX.Element {
  const { shown, rising } = useRollingNumber(value);
  return (
    <span className={`hub-cur${rising ? ' is-gaining' : ''}`} data-cur={cur} title={title}>
      <CurrencyIcon id={cur} size={15} /> {shown.toLocaleString()} <span className="hub-cur-l">{label}</span>
    </span>
  );
}
