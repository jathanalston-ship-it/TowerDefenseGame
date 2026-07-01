// Power gain toasts (docs/POWER-SCORE.md §feel) — every Power increase shows its amount AND its
// source, with the ascending power chime:   ▲ +18 Power
//                                           Tower Evolution ◈4
// Subscribes to the powerEvents bus (every strength API announces through it), queues bursts,
// caps visible toasts, auto-dismisses. Mounted once per surface (Hub + in-run HUD) — position is
// styled by the host via the wrapper class. Reduced motion honored by the CSS.

import { useEffect, useRef, useState } from 'react';
import { onPowerGain } from '../../state/powerEvents';
import type { PowerGain } from '../../state/powerEvents';
import { audio } from '../../audio/sound';

interface Toast extends PowerGain {
  key: number;
}

const VISIBLE_MS = 2600;
const MAX_VISIBLE = 3;

export function PowerToaster(): JSX.Element | null {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const off = onPowerGain((gain) => {
      const key = ++seq.current;
      audio.cue('power'); // the "you got stronger" chime rides every gain
      setToasts((ts) => {
        // Burst coalescing: a same-source gain within the window merges (adds up) instead of stacking.
        const merge = ts.find((t) => t.source === gain.source && gain.at - t.at < 400);
        if (merge) return ts.map((t) => (t === merge ? { ...t, delta: t.delta + gain.delta } : t));
        return [...ts.slice(-(MAX_VISIBLE - 1)), { ...gain, key }];
      });
      timers.push(setTimeout(() => setToasts((ts) => ts.filter((t) => t.key !== key)), VISIBLE_MS));
    });
    return () => { off(); timers.forEach(clearTimeout); };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="ptoasts" aria-live="polite">
      {toasts.map((t) => (
        <div className="ptoast" key={t.key}>
          <span className="ptoast-delta">▲ +{t.delta.toLocaleString()} Power</span>
          <span className="ptoast-src">{t.source}</span>
        </div>
      ))}
    </div>
  );
}
