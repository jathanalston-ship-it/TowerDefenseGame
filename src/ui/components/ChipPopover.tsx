// CHIP POPOVER (docs/UI-STANDARDS.md §touch-info) — a top-bar chip that ANSWERS on tap. A
// `title=` tooltip is hover-only, so on a phone "what is Ichor?" had no answer; every top-bar
// essential (wallet chips, the account level) is a real button that opens a small popover,
// following the Materials chip's pattern (MaterialsChip.tsx): tap toggles, a tap outside,
// Escape, a scroll or a resize closes. The popover is FIXED-positioned under the chip so the
// narrow shells' horizontally-scrolling top bar (overflow-x: auto) can never clip it.

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const POP_MAX_W = 300; // matches .chip-pop max-width — the clamp keeps it on-screen

export function ChipPopover({ className, dataCur, face, ariaLabel, popLabel, children }: {
  className: string; // the chip's own wrapper classes (e.g. `hub-cur`)
  dataCur?: string; // CeremonyLayer flight target (WalletChip) — stays on the wrapper
  face: ReactNode; // what the chip shows (icon + value + label)
  ariaLabel: string; // the button's spoken name
  popLabel: string; // the popover's dialog label
  children: (close: () => void) => ReactNode; // popover body (gets a closer for its links)
}): JSX.Element {
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const popId = useId();
  const open = pos !== null;
  const close = useCallback((): void => {
    if (popRef.current?.contains(document.activeElement)) buttonRef.current?.focus({ preventScroll: true });
    setPos(null);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    popRef.current?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent): void => { if (!ref.current?.contains(e.target as Node)) setPos(null); };
    const onFocus = (e: FocusEvent): void => { if (!ref.current?.contains(e.target as Node)) setPos(null); };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('focusin', onFocus);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('focusin', onFocus);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open, close]);
  const toggle = (): void => {
    if (open) { setPos(null); return; }
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - POP_MAX_W - 8));
    setPos({ top: Math.round(r.bottom + 6), left: Math.round(left) });
  };
  return (
    <span className={`${className} chip-pop-host`} data-cur={dataCur} ref={ref}>
      <button ref={buttonRef} type="button" className="chip-pop-btn" onClick={toggle} aria-haspopup="dialog" aria-controls={open ? popId : undefined} aria-expanded={open} aria-label={ariaLabel}>
        {face}
      </button>
      {pos && (
        <span ref={popRef} id={popId} tabIndex={-1} className="chip-pop panel" role="dialog" aria-label={popLabel} style={pos}>
          {children(close)}
        </span>
      )}
    </span>
  );
}
