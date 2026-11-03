// Reusable tutorial presentation primitives (docs/TUTORIAL.md §4). Each is generic — it takes a
// measured target rect (or none) + config — and is styled in index.css (.tut-*). Reduced-motion is
// handled in CSS. These are the building blocks any future tutorial composes; none know anything
// about combat or a specific lesson.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

type Side = 'top' | 'bottom' | 'left' | 'right';

/** Spotlight — dim ALL UI except the target rect (four dim panels around a hole), with a pulsing
 * outline on the target. No rect ⇒ a full dim scrim by default; `dimWhenMissing={false}` renders
 * nothing instead (the tutorial uses it so a late-mounting/hidden target can never black out the
 * lesson — the HudTour keeps the scrim as its backdrop). The hole passes clicks through to the
 * target; the panels swallow clicks elsewhere (focuses interaction on the highlighted element). */
export function Spotlight({ rect, padding = 8, dimWhenMissing = true }: { rect: DOMRect | null; padding?: number; dimWhenMissing?: boolean }): JSX.Element | null {
  if (!rect) return dimWhenMissing ? <div className="tut-dim tut-dim-full" /> : null;
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

/** True when the rect is entirely outside the viewport — a stale anchor mid-scroll. */
function offViewport(rect: DOMRect): boolean {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw;
}

/** Animated arrow pointing at the target from `from` side. */
export function TutorialArrow({ rect, from = 'top' }: { rect: DOMRect | null; from?: Side }): JSX.Element | null {
  if (!rect) return null;
  // Never point at nothing: while the overlay auto-scrolls an off-fold target into view
  // (TutorialOverlay §reachability), an arrow at its stale position would aim off-screen.
  if (offViewport(rect)) return null;
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

/** True when a box overlaps a rect (strictly — touching edges is fine). */
function overlaps(x: number, y: number, w: number, h: number, r: DOMRect): boolean {
  return x < r.right && x + w > r.left && y < r.bottom && y + h > r.top;
}

/** Tooltip callout bubble anchored to a target side, or centered when there's no target.
 * `avoid` is a region the bubble must never cover (the lane during a wave, the draft row being
 * taught): if the anchored/centered spot overlaps it, the bubble re-seats beside it — the
 * candidate (left / right / below / above) nearest its anchor that fits the viewport and clears
 * both the region and the target. `gap` widens the target offset (room for a same-side arrow). */
export function Callout({
  rect,
  side = 'bottom',
  avoid = null,
  gap: gapProp = 14,
  children,
}: {
  rect: DOMRect | null;
  side?: Side;
  avoid?: DOMRect | null;
  gap?: number;
  children: ReactNode;
}): JSX.Element {
  // MEASURED-BOX POSITIONING (docs/RESPONSIVE-DESIGN.md §tutorial): the bubble's REAL width and
  // height are read back after render (ResizeObserver — tracks typewriter growth and wrapping)
  // and the position is computed with full viewport clamping from those exact dimensions. No
  // estimates, no transforms, no correction races: the lesson text CANNOT leave the screen at any
  // size, content length, or layout band; an extra-long lesson scrolls INSIDE the bubble.
  const selfRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 340, h: 160 });
  useEffect(() => {
    const el = selfRef.current;
    if (!el) return undefined;
    const read = (): void => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setDims((d) => (Math.abs(d.w - w) > 1 || Math.abs(d.h - h) > 1 ? { w, h } : d));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  // PHONE DOCK (docs/RESPONSIVE-DESIGN.md §tutorial): on narrow shells a floating bubble lands
  // mid-board — directly over the build slots the lesson is asking the player to tap. Instead
  // the lesson DOCKS to the viewport edge OPPOSITE its anchor (target in the top half → dock
  // bottom; toolbar/no-target steps → dock top), so the action zone is never covered. Same
  // breakpoint as the narrow-shell tutorial chrome (the objective pill retires there too).
  if (vw <= 700) {
    const anchorTop = !!rect && !offViewport(rect) && rect.top + rect.height / 2 < vh * 0.45;
    return (
      <div ref={selfRef} className={`tut-callout is-docked ${anchorTop ? 'dock-bottom' : 'dock-top'}`} role="dialog">
        {children}
      </div>
    );
  }
  const pad = 8;
  const clampX = (x: number): number => Math.max(pad, Math.min(x, vw - pad - dims.w));
  const clampY = (y: number): number => Math.max(pad, Math.min(y, vh - pad - dims.h));
  let style: CSSProperties;
  let cls: string;
  if (!rect || offViewport(rect)) {
    // No target (placeholder lessons) OR a target the overlay is still scrolling toward —
    // a centered bubble is always readable; it re-anchors the moment the target arrives.
    style = { left: clampX((vw - dims.w) / 2), top: clampY(vh * 0.46 - dims.h / 2) };
    cls = avoid ? 'side-free' : 'side-center'; // an avoiding bubble keeps the compact width
  } else {
    const gap = gapProp;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Flip when the preferred side genuinely lacks room (exact — dims are measured).
    let s: Side = side;
    if (s === 'bottom' && rect.bottom + gap + dims.h > vh - pad && rect.top - gap - dims.h >= pad) s = 'top';
    if (s === 'top' && rect.top - gap - dims.h < pad && rect.bottom + gap + dims.h <= vh - pad) s = 'bottom';
    if (s === 'left' && rect.left - gap - dims.w < pad && rect.right + gap + dims.w <= vw - pad) s = 'right';
    if (s === 'right' && rect.right + gap + dims.w > vw - pad && rect.left - gap - dims.w >= pad) s = 'left';
    style =
      s === 'top' ? { left: clampX(cx - dims.w / 2), top: clampY(rect.top - gap - dims.h) } :
      s === 'bottom' ? { left: clampX(cx - dims.w / 2), top: clampY(rect.bottom + gap) } :
      s === 'left' ? { left: clampX(rect.left - gap - dims.w), top: clampY(cy - dims.h / 2) } :
      { left: clampX(rect.right + gap), top: clampY(cy - dims.h / 2) };
    cls = `side-${s}`;
  }
  // AVOID ZONE: never cover the region the lesson is about. Candidates sit beside the region on
  // each side (aligned to the first choice's other axis), clamped; the first that fits wholly
  // on-screen and clears the region + the target, nearest the anchor, wins. Nothing fits (a
  // region wider than the shell) ⇒ keep the anchored spot — the dock contract covers phones.
  if (avoid && !offViewport(avoid)) {
    const g = 14;
    const x0 = style.left as number;
    const y0 = style.top as number;
    if (overlaps(x0, y0, dims.w, dims.h, avoid)) {
      const ax = rect && !offViewport(rect) ? rect.left + rect.width / 2 : x0 + dims.w / 2;
      const ay = rect && !offViewport(rect) ? rect.top + rect.height / 2 : y0 + dims.h / 2;
      const fits = (x: number, y: number): boolean =>
        x >= pad && y >= pad && x + dims.w <= vw - pad && y + dims.h <= vh - pad &&
        !overlaps(x, y, dims.w, dims.h, avoid) && !(rect && overlaps(x, y, dims.w, dims.h, rect));
      const cands: [number, number, Side][] = [
        [avoid.left - g - dims.w, clampY(y0), 'left'],
        [avoid.right + g, clampY(y0), 'right'],
        [clampX(x0), avoid.bottom + g, 'bottom'],
        [clampX(x0), avoid.top - g - dims.h, 'top'],
      ];
      let best: [number, number, Side] | null = null;
      let bestD = Infinity;
      for (const c of cands) {
        if (!fits(c[0], c[1])) continue;
        const d = Math.hypot(c[0] + dims.w / 2 - ax, c[1] + dims.h / 2 - ay);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best) {
        style = { left: best[0], top: best[1] };
        cls = `side-free avoid-${best[2]}`;
      }
    }
  }
  // The hard ceiling is GEOMETRIC: the box may never cross the bottom edge, so its max height is
  // whatever room exists below its computed top — airtight even while a measurement is one frame
  // stale (typewriter growth, font swaps). Taller lessons scroll INSIDE the bubble.
  const roomBelow = Math.max(96, vh - pad - (style.top as number));
  return <div ref={selfRef} className={`tut-callout ${cls}`} style={{ ...style, maxHeight: roomBelow, overflowY: 'auto', transform: 'none' }} role="dialog">{children}</div>;
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
