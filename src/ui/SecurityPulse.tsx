// Blocked-action feedback (docs/SECURITY.md §feedback) — the security layer's ONLY visible
// surface: a small "hold on" pulse when a guard blocks something (double-click, spam,
// rate-limit). Throttled so even a mash storm reads as one calm nudge, and mounted once at
// the app root; legitimate play essentially never sees it.

import { useEffect, useState } from 'react';
import { onSecurityBlock } from '../security/actionGuard';

const SHOW_MS = 1400;
const THROTTLE_MS = 2500;

export function SecurityPulse(): JSX.Element | null {
  const [at, setAt] = useState(0);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    let last = 0;
    onSecurityBlock((b) => {
      if (b.reason === 'flood') return; // disk coalescing is invisible by design
      if (b.reason === 'conflict') {
        setConflict(true); // cross-tab takeover (docs/SECURITY.md §tabs) — persistent, not a pulse
        return;
      }
      const now = Date.now();
      if (now - last < THROTTLE_MS) return;
      last = now;
      setAt(now);
    });
    return () => onSecurityBlock(null);
  }, []);
  useEffect(() => {
    if (!at) return undefined;
    const id = setTimeout(() => setAt(0), SHOW_MS);
    return () => clearTimeout(id);
  }, [at]);
  if (conflict) {
    return (
      <div className="sec-pulse is-conflict" role="alert">
        ⚠ Another tab took over this save — <button className="sec-pulse-reload" onClick={() => window.location.reload()}>reload</button> to continue here
      </div>
    );
  }
  if (!at) return null;
  return (
    <div className="sec-pulse" role="status" aria-live="polite">
      ⏳ Hold on — one at a time
    </div>
  );
}
