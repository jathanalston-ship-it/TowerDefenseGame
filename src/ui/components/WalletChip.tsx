// ROLLING WALLET CHIP (docs/REWARD-PRESENTATION.md §wallet) — the top-bar counters ROLL to
// their new value instead of snapping, and lift while gaining, so every grant is READ at the
// wallet the moment it lands (the CeremonyLayer's icon flights bump the same chip on arrival
// via its data-cur hook). One component for every single-currency chip; reduced-motion snaps.

import { useEffect, useRef, useState } from 'react';
import { CurrencyIcon } from './CurrencyIcon';
import { ChipPopover } from './ChipPopover';
import { CURRENCIES, type CurrencyId } from '../../core/currencies';
import { meta } from '../../state/meta';
import { navBus } from '../../state/navBus';
import { isOpenNav } from '../../state/unlocks';
import { navLabel, type NavKey } from '../navModel';

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

/** Where each top-bar currency is SPENT — the popover's "Spend it in … ▸" deep link (shown only
 *  once that screen is open: isOpenNav). Data, not a switch: a new chip adds one row. */
const SPENT_IN: Partial<Record<CurrencyId, NavKey>> = {
  genomeCores: 'evolution', // Permanent Upgrades + the Molt
  ichor: 'market', // the Splice Market
  ascendantCells: 'evolution', // the Ascendant tree, beside the Molt
};

/** A wallet chip is a BUTTON (docs/UI-STANDARDS.md §touch-info): tap it and it says what the
 *  currency is, where it comes from and where it goes — never a hover-only `title`. */
export function WalletChip({ cur, value, label, title }: {
  cur: CurrencyId; // also the CeremonyLayer flight target key (data-cur)
  value: number;
  label: string;
  title?: string; // extra context appended to the popover (was a hover tooltip)
}): JSX.Element {
  const { shown, rising } = useRollingNumber(value);
  const def = CURRENCIES[cur];
  const spend = SPENT_IN[cur];
  return (
    <ChipPopover
      className={`hub-cur${rising ? ' is-gaining' : ''}`}
      dataCur={cur}
      ariaLabel={`${def.name} ${value.toLocaleString()} — what is this?`}
      popLabel={def.name}
      face={<><CurrencyIcon id={cur} size={15} /> {shown.toLocaleString()} <span className="hub-cur-l">{label}</span></>}
    >
      {(close) => (
        <>
          <span className="chip-pop-h"><CurrencyIcon id={cur} size={16} title="" /> {def.name} <b>{value.toLocaleString()}</b></span>
          <span className="chip-pop-p">{def.blurb}</span>
          {title && <span className="chip-pop-p">{title}</span>}
          <span className="chip-pop-k">Earned from · {def.earnedFrom.map((s) => s.replace(/-/g, ' ')).join(' · ')}</span>
          {spend && isOpenNav(meta.get(), spend) && (
            <button type="button" className="chip-pop-go" onClick={() => { close(); navBus.go(spend); }}>
              Spend it in {navLabel(spend)} ▸
            </button>
          )}
        </>
      )}
    </ChipPopover>
  );
}
