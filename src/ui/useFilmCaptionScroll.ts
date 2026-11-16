import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Give the caption pane a Tab stop only when its text needs scrolling. */
export function useFilmCaptionScroll(sceneKey: string) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      setScrollable(false);
      return;
    }
    stage.scrollTop = 0;
    const caption = stage.querySelector<HTMLElement>('.intro-copy');
    const measure = (): void => {
      const style = getComputedStyle(stage);
      const available = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      setScrollable(style.overflowY === 'auto' && (caption?.offsetHeight ?? 0) > available + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    if (caption) observer.observe(caption);
    return () => observer.disconnect();
  }, [sceneKey]);
  return { stageRef, scrollable };
}

/** Spend the scene's hold only while the film is visible and its caption pane is free. */
export function useFilmAutoAdvance(
  stageRef: RefObject<HTMLDivElement>, sceneKey: string, duration: number, onElapsed: () => void,
): void {
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || duration <= 0) return;
    let remaining = duration;
    let started: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reading = document.activeElement === stage && stage.tabIndex === 0;
    let fired = false;
    const update = (): void => {
      if (fired) return;
      if (document.hidden || reading) {
        if (started !== null) remaining = Math.max(0, remaining - (performance.now() - started));
        started = null;
        clearTimeout(timer);
      } else if (started === null) {
        started = performance.now();
        timer = setTimeout(() => {
          started = null;
          remaining = 0;
          if (document.hidden || reading) return;
          fired = true;
          onElapsed();
        }, remaining);
      }
    };
    const focusCaptions = (): void => { reading = stage.tabIndex === 0; update(); };
    const blurCaptions = (): void => { reading = false; update(); };
    document.addEventListener('visibilitychange', update);
    stage.addEventListener('focus', focusCaptions);
    stage.addEventListener('blur', blurCaptions);
    update();
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', update);
      stage.removeEventListener('focus', focusCaptions);
      stage.removeEventListener('blur', blurCaptions);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the callback belongs to this scene, not its rerenders
  }, [stageRef, sceneKey, duration]);
}
