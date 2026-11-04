// CHIP POPOVER (docs/UI-STANDARDS.md §touch-info) — a top-bar chip that ANSWERS on tap. A
// `title=` tooltip is hover-only, so on a phone "what is Ichor?" had no answer; every top-bar
// essential (wallet chips, the account level) is a real button that opens a small popover,
// following the Materials chip's pattern (MaterialsChip.tsx): tap toggles, a tap outside or
// Escape closes. Generic — the chip passes its face and its explanation.

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function ChipPopover({ className, dataCur, face, ariaLabel, popLabel, align = 'left', children }: {
  className: string; // the chip's own wrapper classes (e.g. `hub-cur`)
  dataCur?: string; // CeremonyLayer flight target (WalletChip) — stays on the wrapper
  face: ReactNode; // what the chip shows (icon + value + label)
  ariaLabel: string; // the button's spoken name
  popLabel: string; // the popover's dialog label
  align?: 'left' | 'right';
  children: (close: () => void) => ReactNode; // popover body (gets a closer for its links)
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent): void => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <span className={`${className} chip-pop-host`} data-cur={dataCur} ref={ref}>
      <button type="button" className="chip-pop-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={ariaLabel}>
        {face}
      </button>
      {open && (
        <span className={`chip-pop panel is-${align}`} role="dialog" aria-label={popLabel}>
          {children(() => setOpen(false))}
        </span>
      )}
    </span>
  );
}
