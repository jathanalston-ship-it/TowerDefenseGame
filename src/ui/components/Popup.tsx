// POPUP PORTAL — every centered prompt renders through this portal to <body>.
//
// Why it exists: panels animate in with transforms (ui-rise et al., fill 'both'), and a
// retained transform makes that ancestor the CONTAINING BLOCK for position:fixed. A modal
// rendered inline inside a tall panel then centers on the PANEL — potentially thousands
// of pixels tall — instead of the viewport, and the player scrolls away and loses it.
// Portaling to <body> guarantees viewport-centering for every popup, present and future:
// new dialogs should return their overlay through <Popup> as a matter of course.
//
// Dismissal (2026-11, docs/HUB-FLOW.md §back): every Popup joins the dismiss stack
// (ui/browserBack.ts) — Escape and the browser/Android Back button close the TOPMOST one.
// `onClose` wires Escape + a tap on the backdrop (the overlay element itself, not its card);
// without it, Escape is the keyboard twin of a backdrop tap — it clicks the overlay, so a popup
// whose backdrop already dismisses closes for free and a ceremony with no backdrop exit stays.
// The wrapper is `display: contents` — layout and every overlay selector are unchanged.

import { createPortal } from 'react-dom';
import { useRef, type ReactNode } from 'react';
import { useDismiss } from '../browserBack';

export function Popup({ children, onClose }: { children: ReactNode; onClose?: () => void }): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const backdrop = (): HTMLElement | null => (rootRef.current?.firstElementChild as HTMLElement | null) ?? null;
  useDismiss(() => {
    if (onClose) onClose();
    else backdrop()?.click();
  });
  return createPortal(
    <div
      className="popup-root"
      ref={rootRef}
      onClick={onClose ? (e) => { if (e.target === backdrop()) onClose(); } : undefined}
    >
      {children}
    </div>,
    document.body,
  );
}
