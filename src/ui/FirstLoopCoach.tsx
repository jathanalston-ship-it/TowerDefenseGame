// THE FIRST LOOP coach (docs/TUTORIAL.md §first-loop) — renders the due beat of state/firstLoop.ts
// over the live hub: spotlight the REAL control, one short line, and wait for the player to use it
// (a capture-phase click listener observes without consuming — the click still does its job), or
// for the save to show the action happened (`done`). Explanations get a Next. Never traps:
//   · the coach steps aside while any other dialog is up (a vault reveal, the name prompt, a confirm);
//   · a control inside the narrow-shell rail drawer first points at the ☰ menu button;
//   · a missing control (the player wandered) shows "Take me there" — or, for a control that only
//     exists on a hub landing, falls back to the step that opens it;
//   · "Skip the guide" ends the whole loop at any step.

import { useEffect, useRef, useState } from 'react';
import { meta } from '../state/meta';
import { navBus } from '../state/navBus';
import { audio } from '../audio/sound';
import type { SaveData } from '../save/saveStore';
import { dueBeat } from '../state/firstLoop';
import type { CoachBeatId, CoachStep } from '../state/firstLoop';
import { Callout, Spotlight } from './tutorial/primitives';
import './FirstLoopCoach.css';

const BURGER = '.hub-burger';
const POLL_MS = 250;
const MISSING_GRACE_MS = 1200; // a landing-only control that stays gone this long → back to the step that opens it

/** First matching element that is actually on screen (a closed drawer parks its rail off-canvas). */
function onScreen(sel: string): Element | null {
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight) return el;
  }
  return null;
}

/** Rendered with a real box but scrolled out of view (a control below the fold on a short screen).
 *  A closed drawer's rail is NOT this — it is off-canvas horizontally (the ☰ step handles it). */
function belowFold(sel: string): Element | null {
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth) return el;
  }
  return null;
}

/** The hub screen on show right now (Hub.tsx marks its section with data-screen). */
const currentScreen = (): string | undefined => (document.querySelector('.hub-screen') as HTMLElement | null)?.dataset.screen;

/** Another dialog owns the screen (the coach's own bubble excluded): a dialog role, a modal, or
 *  anything portaled through the shared Popup (a cache opening, a reveal before its summary). */
function blocked(): boolean {
  for (const el of document.querySelectorAll('[role="dialog"], [aria-modal="true"], .popup-root > *')) {
    if (el.closest('.flcoach')) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return true;
  }
  return false;
}

type Aim = { mode: 'anchor' | 'burger' | 'missing'; rect: DOMRect | null };

export function FirstLoopCoach(): JSX.Element | null {
  const save = meta.use();
  const beat = dueBeat(save);
  const [pos, setPos] = useState<{ beat: CoachBeatId; i: number }>({ beat: beat?.id ?? 'deploy', i: 0 });
  const i = beat && pos.beat === beat.id ? pos.i : 0;
  const step: CoachStep | undefined = beat?.steps[i];
  const [aim, setAim] = useState<Aim>({ mode: 'missing', rect: null });
  const [hidden, setHidden] = useState(false);
  const began = useRef<SaveData>(save); // the save when this step began (`done` compares against it)
  const missingSince = useRef<number | null>(null);
  const scrolled = useRef(false); // one scroll-into-view per step (never fights the player's own scrolling)
  const advancedFrom = useRef(''); // a step advances ONCE (a click, its save change and the poll can coincide)
  const [onNav, setOnNav] = useState(false); // already on the step's screen → no "Take me there"

  const advance = (): void => {
    if (!beat) return;
    const key = `${beat.id}:${i}`;
    if (advancedFrom.current === key) return;
    advancedFrom.current = key;
    if (i >= beat.steps.length - 1) {
      meta.completeCoachBeat(beat.id);
      audio.cue('unlock');
      setPos({ beat: beat.id, i: 0 });
    } else {
      setPos({ beat: beat.id, i: i + 1 });
    }
  };

  // A new step starts measuring "did it happen" from now.
  useEffect(() => { began.current = meta.get(); missingSince.current = null; scrolled.current = false; }, [beat?.id, i]);

  // Action steps also complete when the SAVE shows the action (a purchase, a crack, a claim).
  useEffect(() => {
    if (step?.done && step.done(began.current, save)) advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save]);

  // Aim: the control on screen → spotlight it; inside a closed drawer → the ☰ button; gone → recover.
  useEffect(() => {
    if (!step) return undefined;
    const measure = (): void => {
      setHidden(blocked());
      // Already where this step leads (a one-screen hub's door opened it directly) — it's done.
      if (step.dest && currentScreen() === step.dest) { advance(); return; }
      if (!step.anchor) { setAim({ mode: 'missing', rect: null }); return; }
      const el = onScreen(step.anchor);
      if (el) { missingSince.current = null; setAim({ mode: 'anchor', rect: el.getBoundingClientRect() }); return; }
      const burger = step.rail ? onScreen(BURGER) : null;
      if (burger) { setAim({ mode: 'burger', rect: burger.getBoundingClientRect() }); return; }
      // Below the fold on a short screen: bring it into view (once per step), then spotlight it.
      const low = belowFold(step.anchor);
      if (low && !scrolled.current) { scrolled.current = true; low.scrollIntoView({ block: 'center' }); return; }
      setAim({ mode: 'missing', rect: null });
      setOnNav(!!step.nav && currentScreen() === step.nav);
      // A control that lives only on a hub landing (no nav of its own): if it stays gone, the player
      // left the landing — step back to the door that opens it.
      if (!step.nav && i > 0) {
        const now = performance.now();
        if (missingSince.current === null) missingSince.current = now;
        else if (now - missingSince.current > MISSING_GRACE_MS) { missingSince.current = null; setPos((p) => ({ ...p, i: Math.max(0, i - 1) })); }
      }
    };
    measure();
    const t = window.setInterval(measure, POLL_MS);
    window.addEventListener('resize', measure);
    return () => { clearInterval(t); window.removeEventListener('resize', measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, i]);

  // The practice objective: the player's own click inside the control completes the step. Capture
  // phase observes WITHOUT consuming — the click still lands on the control.
  useEffect(() => {
    if (!step || step.advance !== 'click' || !step.anchor) return undefined;
    const sel = step.anchor;
    const onClick = (e: MouseEvent): void => {
      if ((e.target as Element | null)?.closest?.(sel)) advance();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, i]);

  if (!beat || !step || hidden) return null;
  const total = beat.steps.length;
  const burger = aim.mode === 'burger';
  const missing = aim.mode === 'missing' && !!step.anchor;
  const title = burger ? 'Open the menu' : step.title;
  const text = burger ? 'Tap ☰ to open the menu.' : step.text;
  // A click step whose control is genuinely absent on its own screen (nothing affordable for BEST MOVE,
  // today's cache already opened) offers Next — the coach never traps.
  const showNext = step.advance === 'next' || (step.advance === 'click' && missing && !!step.nav && onNav);

  return (
    <div className="flcoach" aria-live="polite">
      {aim.rect && <Spotlight rect={aim.rect} dimWhenMissing={false} />}
      <Callout rect={aim.rect} side="bottom">
        <div className="flcoach-eyebrow">FIRST STEPS · {i + 1} / {total}</div>
        <div className="flcoach-title">{title}</div>
        <div className="flcoach-text">{text}</div>
        <div className="flcoach-btns">
          <button className="flcoach-skip" onClick={() => meta.skipFirstLoop()}>Skip the guide</button>
          {missing && step.nav && !onNav && (
            <button className="primary flcoach-go" onClick={() => navBus.go(step.nav!)}>Take me there ▸</button>
          )}
          {showNext && !missing && (
            <button className="primary flcoach-next" onClick={advance}>{i === total - 1 ? 'Finish ▸' : 'Next ▸'}</button>
          )}
          {showNext && missing && (
            <button className="primary flcoach-next" onClick={advance}>Next ▸</button>
          )}
        </div>
      </Callout>
    </div>
  );
}
