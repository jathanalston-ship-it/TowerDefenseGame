// Shared ease-out count-up hook (easeOutCubic, 0 → target) — the number-reveal animation used by
// reward summaries. One implementation for every reveal surface; add options here, not copies.

import { useEffect, useState } from 'react';

/** Animate a number 0→`target` over `ms`. `instant` (skip / reduced-motion) snaps to the value;
 *  a non-positive target renders as 0 immediately. */
export function useCountUp(target: number, { ms = 750, instant = false }: { ms?: number; instant?: boolean } = {}): number {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = (): void => setReduced(!!mq?.matches);
    update();
    mq?.addEventListener('change', update);
    return () => mq?.removeEventListener('change', update);
  }, []);
  const snap = instant || reduced || ms <= 0 || target <= 0;
  const [n, setN] = useState(snap ? Math.max(0, target) : 0);
  useEffect(() => {
    if (snap || n === Math.max(0, target)) {
      setN(Math.max(0, target));
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      const p = Math.min(1, (now - start) / ms);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // n is sampled only when the target or motion mode changes; frames must not restart the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ms, snap]);
  return snap ? Math.max(0, target) : n;
}
