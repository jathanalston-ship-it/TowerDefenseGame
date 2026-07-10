// RESPONSIVE DEBUG (docs/RESPONSIVE-DESIGN.md §debug) — the developer surface for the
// layout-profile system: the live profile / viewport / pointer / safe-area readout, plus a
// VISUALIZER toggle that stamps data-debug-layout on <html> so CSS paints safe-area bands,
// outlines every interactive element (touch regions), and flags anything poking past the
// viewport edge. Rendered inside the ?debug DebugPanel only — invisible in production play.

import { useState } from 'react';
import { useLayoutProfile } from '../layoutProfile';

function safeArea(): { t: string; r: string; b: string; l: string } {
  const cs = getComputedStyle(document.documentElement);
  const v = (k: string): string => cs.getPropertyValue(k).trim() || '0px';
  return { t: v('--safe-t'), r: v('--safe-r'), b: v('--safe-b'), l: v('--safe-l') };
}

export function ResponsiveDebug(): JSX.Element {
  const lp = useLayoutProfile();
  const [viz, setViz] = useState(document.documentElement.hasAttribute('data-debug-layout'));
  const sa = safeArea();
  const toggle = (): void => {
    const el = document.documentElement;
    const next = !viz;
    if (next) {
      el.setAttribute('data-debug-layout', '1');
      document.body.setAttribute('data-debug-label', `${lp.profile} ${lp.vw}×${lp.vh}`);
    } else {
      el.removeAttribute('data-debug-layout');
      document.body.removeAttribute('data-debug-label');
    }
    setViz(next);
  };
  return (
    <div className="debug-sec">
      <div className="h">📐 Responsive</div>
      <div className="debug-note">
        profile <b>{lp.profile}</b> · {lp.vw}×{lp.vh} · pointer {lp.coarse ? 'coarse (touch)' : 'fine'} ·
        safe {sa.t}/{sa.r}/{sa.b}/{sa.l}
      </div>
      <div className="debug-row">
        <button className={viz ? 'on' : ''} onClick={toggle}>
          {viz ? 'Hide' : 'Show'} layout visualizer
        </button>
      </div>
      <div className="debug-note">Visualizer: outlines tap targets, paints safe-area bands, red-flags anything past the viewport edge. Gate: npm run mobilecheck (--full for the whole matrix).</div>
    </div>
  );
}
