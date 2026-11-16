import { useLayoutEffect, useRef, useState } from 'react';

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
