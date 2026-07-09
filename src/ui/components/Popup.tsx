// POPUP PORTAL — every centered prompt renders through this portal to <body>.
//
// Why it exists: panels animate in with transforms (ui-rise et al., fill 'both'), and a
// retained transform makes that ancestor the CONTAINING BLOCK for position:fixed. A modal
// rendered inline inside a tall panel then centers on the PANEL — potentially thousands
// of pixels tall — instead of the viewport, and the player scrolls away and loses it.
// Portaling to <body> guarantees viewport-centering for every popup, present and future:
// new dialogs should return their overlay through <Popup> as a matter of course.

import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

export function Popup({ children }: { children: ReactNode }): JSX.Element {
  return createPortal(children, document.body);
}
