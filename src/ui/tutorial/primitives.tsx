// Reusable tutorial presentation primitives (docs/TUTORIAL.md §4). Each is generic — it takes a
// measured target rect (or none) + config — and is styled in index.css (.tut-*). Reduced-motion is
// handled in CSS. These are the building blocks any future tutorial composes; none know anything
// about combat or a specific lesson.

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

type Side = 'top' | 'bottom' | 'left' | 'right';

/** Spotlight — dim ALL UI except the target rect (four dim panels around a hole), with a pulsing
 * outline on the target. No rect ⇒ a full dim scrim. The hole passes clicks through to the target;
 * the panels swallow clicks elsewhere (focuses interaction on the highlighted element). */
export function Spotlight({ rect, padding = 8 }: { rect: DOMRect | null; padding?: number }): JSX.Element {
  if (!rect) return <div className="tut-dim tut-dim-full" />;
  const x = Math.max(0, rect.left - padding);
  const y = Math.max(0, rect.top - padding);
  const w = rect.width + padding * 2;
  const h = rect.height + padding * 2;
  return (
    <>
      <div className="tut-dim" style={{ left: 0, top: 0, width: '100%', height: y }} />
      <div className="tut-dim" style={{ left: 0, top: y + h, width: '100%', bottom: 0 }} />
      <div className="tut-dim" style={{ left: 0, top: y, width: x, height: h }} />
      <div className="tut-dim" style={{ left: x + w, top: y, right: 0, height: h }} />
      <div className="tut-ring" style={{ left: x, top: y, width: w, height: h }} />
    </>
  );
}

/** Animated arrow pointing at the target from `from` side. */
export function TutorialArrow({ rect, from = 'top' }: { rect: DOMRect | null; from?: Side }): JSX.Element | null {
  if (!rect) return null;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const gap = 44;
  const style: CSSProperties =
    from === 'top' ? { left: cx, top: rect.top - 16 } :
    from === 'bottom' ? { left: cx, top: rect.bottom + 8 } :
    from === 'left' ? { left: rect.left - gap, top: cy } :
    { left: rect.right + 8, top: cy };
  return <div className={`tut-arrow from-${from}`} style={style} aria-hidden>➤</div>;
}

/** Tooltip callout bubble anchored to a target side, or centered when there's no target. */
export function Callout({
  rect,
  side = 'bottom',
  children,
}: {
  rect: DOMRect | null;
  side?: Side;
  children: ReactNode;
}): JSX.Element {
  let style: CSSProperties;
  let cls: string;
  if (!rect) {
    style = { left: '50%', top: '46%', transform: 'translate(-50%, -50%)' };
    cls = 'side-center';
  } else {
    // Clamp the anchor point so the bubble (max-width 340) can never leave the viewport —
    // wide targets (the tower rail) and edge targets otherwise push it off-screen.
    const half = 178;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const cx = Math.max(half, Math.min(rect.left + rect.width / 2, vw - half));
    const cy = rect.top + rect.height / 2;
    const gap = 14;
    style =
      side === 'top' ? { left: cx, top: rect.top - gap, transform: 'translate(-50%, -100%)' } :
      side === 'bottom' ? { left: cx, top: rect.bottom + gap, transform: 'translate(-50%, 0)' } :
      side === 'left' ? { left: rect.left - gap, top: cy, transform: 'translate(-100%, -50%)' } :
      { left: rect.right + gap, top: cy, transform: 'translate(0, -50%)' };
    cls = `side-${side}`;
  }
  return <div className={`tut-callout ${cls}`} style={style} role="dialog">{children}</div>;
}

/** The temporary objective tracker — "Step X of N" + the current objective title, over an animated
 * uplink progress fill (the lesson's place in the transmission at a glance). */
export function ObjectiveTracker({ title, step, total }: { title: string; step: number; total: number }): JSX.Element {
  return (
    <div className="tut-objective">
      <span className="tut-obj-step">Step {step} of {total}</span>
      <span className="tut-obj-title">{title}</span>
      <span className="tut-obj-bar" aria-hidden>
        <i style={{ width: `${Math.round(((step - 1) / total) * 100)}%` }} />
      </span>
    </div>
  );
}

const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Typewriter — reveals text like an incoming transmission (~28ms/char, capped ~1.1s so long lessons
 * never drag), with a blinking caret while typing. Reduced motion (or a re-render of the same text)
 * shows it whole. Generic: any future tutorial callout/briefing types through this. */
export function Typewriter({ text }: { text: string }): JSX.Element {
  const [shown, setShown] = useState(reducedMotion ? text.length : 0);
  useEffect(() => {
    if (reducedMotion) { setShown(text.length); return undefined; }
    setShown(0);
    const step = Math.max(1, Math.ceil(text.length / 40)); // cap the reveal at ~40 ticks (~1.1s)
    const id = setInterval(() => {
      setShown((n) => {
        const next = Math.min(text.length, n + step);
        if (next >= text.length) clearInterval(id);
        return next;
      });
    }, 28);
    return () => clearInterval(id);
  }, [text]);
  const typing = shown < text.length;
  return (
    <span className="tut-type" onClick={typing ? () => setShown(text.length) : undefined}>
      {text.slice(0, shown)}
      {typing && <i className="tut-caret" aria-hidden>▌</i>}
    </span>
  );
}

/** The continue-prompt affordance. */
export function ContinuePrompt({ label = 'Continue', onContinue }: { label?: string; onContinue: () => void }): JSX.Element {
  return (
    <button className="tut-continue" onClick={onContinue}>
      {label} <span aria-hidden>▸</span>
    </button>
  );
}

/** Camera focus — scrolls a target selector into view when it (re)activates. Behavioral, renders
 * nothing. (In-canvas camera pan is a lesson-time hook layered on the same selector.) */
export function CameraFocus({ target }: { target: string | null | undefined }): null {
  useEffect(() => {
    if (!target) return;
    const el = document.querySelector(target);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, [target]);
  return null;
}
