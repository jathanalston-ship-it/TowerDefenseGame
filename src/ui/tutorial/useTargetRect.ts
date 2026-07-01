// Live-measure a target element (by CSS selector) so highlights / arrows / callouts track it as the
// layout shifts, the window resizes, or the page scrolls. Returns null when there's no selector or
// the target isn't in the DOM yet (late-mounting targets are picked up by the poll). Reusable by any
// tutorial presentation primitive.

import { useEffect, useState } from 'react';

export function useTargetRect(selector: string | null | undefined): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    let raf = 0;
    const measure = (): void => {
      const el = document.querySelector(selector);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    const el = document.querySelector(selector);
    if (el) ro.observe(el);
    const onScroll = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', onScroll, true); // capture — catch scroll in any container
    const poll = window.setInterval(measure, 500); // catch late-mounting / animated targets
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', onScroll, true);
      clearInterval(poll);
      cancelAnimationFrame(raf);
    };
  }, [selector]);

  return rect;
}
