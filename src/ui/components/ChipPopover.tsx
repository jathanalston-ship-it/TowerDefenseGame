// CHIP POPOVER (docs/UI-STANDARDS.md §touch-info) — a top-bar chip that ANSWERS on tap. A
// `title=` tooltip is hover-only, so on a phone "what is Ichor?" had no answer; every top-bar
// essential (wallet chips, the account level) is a real button that opens a small popover,
// following the Materials chip's pattern (MaterialsChip.tsx): tap toggles, a tap outside,
// Escape, a scroll or a resize closes. The popover is FIXED-positioned under the chip so the
// narrow shells' horizontally-scrolling top bar (overflow-x: auto) can never clip it.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

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
  const open = pos !== null;
  useEffect(() => {
    if (!open) return undefined;
    const close = (): void => setPos(null);
    const onDown = (e: PointerEvent): void => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close(); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);
  const toggle = (): void => {
    if (open) { setPos(null); return; }
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - POP_MAX_W - 8));
    setPos({ top: Math.round(r.bottom + 6), left: Math.round(left) });
  };
  return (
    <span className={`${className} chip-pop-host`} data-cur={dataCur} ref={ref}>
      <button type="button" className="chip-pop-btn" onClick={toggle} aria-expanded={open} aria-label={ariaLabel}>
        {face}
      </button>
      {pos && (
        <span className="chip-pop panel" role="dialog" aria-label={popLabel} style={pos}>
          {children(() => setPos(null))}
        </span>
      )}
    </span>
  );
}
