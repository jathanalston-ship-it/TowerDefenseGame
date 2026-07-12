// Power gain toasts (docs/POWER-SCORE.md §feel) — every Power increase shows its amount AND its
// source, with the ascending power chime:   ▲ +18 Power
//                                           Tower Evolution ◈4
// Subscribes to the powerEvents bus (every strength API announces through it), queues bursts,
// caps visible toasts, auto-dismisses. CHAINED gains never go quiet: a same-source repeat merges
// additively and REMOUNTS its toast (key carries `hits`), so the pop animation and the exit clock
// restart on every hit — and the audio side escalates instead of muting (sound.ts power chain).
// Mounted once per surface (Hub + in-run HUD) — position is styled by the host via the wrapper
// class. Reduced motion honored by the CSS.

import { useEffect, useRef, useState } from 'react';
import { onPowerGain } from '../../state/powerEvents';
import type { PowerGain } from '../../state/powerEvents';
import { audio } from '../../audio/sound';

interface Toast extends PowerGain {
  key: number;
  hits: number; // merge count — keys the node so every merge re-pops the animation
  expireAt: number; // wall-clock removal — refreshed by merges (the LAST hit gets a full life)
}

const VISIBLE_MS = 2600;
const MAX_VISIBLE = 3;
const MERGE_MS = 1200; // same-source gains inside this window add up instead of stacking

export function PowerToaster(): JSX.Element | null {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const off = onPowerGain((gain) => {
      audio.cue('power'); // the "you got stronger" chime rides every gain (chained ⇒ ascending)
      setToasts((ts) => {
        const merge = ts.find((t) => t.source === gain.source && gain.at - t.at < MERGE_MS);
        if (merge) {
          return ts.map((t) => (t === merge
            ? { ...t, delta: t.delta + gain.delta, at: gain.at, hits: t.hits + 1, expireAt: gain.at + VISIBLE_MS }
            : t));
        }
        return [...ts.slice(-(MAX_VISIBLE - 1)), { ...gain, key: ++seq.current, hits: 0, expireAt: gain.at + VISIBLE_MS }];
      });
    });
    // One sweeper instead of per-gain timers — merges refresh expireAt without timer bookkeeping.
    const sweep = window.setInterval(() => {
      const now = Date.now();
      setToasts((ts) => (ts.some((t) => t.expireAt <= now) ? ts.filter((t) => t.expireAt > now) : ts));
    }, 250);
    return () => { off(); window.clearInterval(sweep); };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="ptoasts" aria-live="polite">
      {toasts.map((t) => (
        // hits in the key: a merge REMOUNTS the node — the pop-in replays and the CSS exit
        // clock restarts, so a burst reads as pop… POP… POP, never as a silent number edit.
        <div className="ptoast" key={`${t.key}:${t.hits}`}>
          <span className="ptoast-delta">▲ +{t.delta.toLocaleString()} Power{t.hits > 0 ? ` ×${t.hits + 1}` : ''}</span>
          <span className="ptoast-src">{t.source}</span>
        </div>
      ))}
    </div>
  );
}
