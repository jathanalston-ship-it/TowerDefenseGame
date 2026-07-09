// INITIALIZATION SEQUENCE (docs/GAME-FEEL.md §intro) — the cold-open cinematic.
// Plays ONCE on a device's very first boot, BEFORE the tutorial, and replays any
// time from Settings → Help. Each scene is a full-screen PROCEDURAL canvas
// set-piece (render/introScenes.ts — the game's own visual language, no assets),
// cross-faded film-style, with the copy staged over a cinematic grade. Data-driven
// scenes, click-to-advance, always skippable; prefers-reduced-motion swaps the
// animation for a hand-picked still per scene (gentle CSS fades only).
//
// Audio note: the browser gives us no AudioContext before the first gesture, so the
// open is DELIBERATELY silent — the first tap (advance/skip) unlocks the score.

import { useEffect, useRef, useState } from 'react';
import { music } from '../audio/music';
import { REDUCED_FRAME_T, drawIntroFrame } from '../render/introScenes';
import type { IntroVisual } from '../render/introScenes';

export const INTRO_SEEN_KEY = 'assimilate.introSeen';

export function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

interface IntroScene {
  id: string;
  eyebrow?: string;
  text: string;
  /** Which cinematic the canvas paints (render/introScenes.ts owns each look). */
  visual: IntroVisual;
  holdMs: number;
}

/** The authored sequence — copy + staging as DATA (edit here, not in the component). */
const SCENES: IntroScene[] = [
  { id: 'signal', eyebrow: 'DEEP CRUST RELAY 7', text: 'SIGNAL REACQUIRED — 11,204 DAYS OF SILENCE END.', visual: 'signal', holdMs: 4200 },
  { id: 'below', text: 'They came from below. Not an army — an APPETITE.', visual: 'descent', holdMs: 4600 },
  { id: 'take', text: 'Everything they touch, they take. Flesh. Steel. Thought.', visual: 'veins', holdMs: 4600 },
  { id: 'core', text: 'One organism refused to be eaten. You are its HIVE CORE — the last thing still growing back.', visual: 'core', holdMs: 5200 },
  { id: 'title', eyebrow: 'DEFEND · EVOLVE · CONSUME', text: 'ASSIMILATE', visual: 'title', holdMs: 6000 },
];

const FADE_MS = 850; // scene-to-scene cross-dissolve
const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function InitCutscene({ onDone }: { onDone: () => void }): JSX.Element {
  const [idx, setIdx] = useState(0);
  const doneRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The cinematographer's clocks: when the current scene started, and what it dissolved from.
  const filmRef = useRef<{ visual: IntroVisual; startedAt: number; prev: IntroVisual | null; prevStartedAt: number }>({
    visual: SCENES[0].visual, startedAt: performance.now(), prev: null, prevStartedAt: 0,
  });
  const scene = SCENES[idx];

  const finish = (): void => {
    if (doneRef.current) return;
    doneRef.current = true;
    try {
      localStorage.setItem(INTRO_SEEN_KEY, '1');
    } catch {
      /* storage unavailable — it simply plays again next boot */
    }
    onDone();
  };
  const advance = (): void => {
    music.play('menu'); // first gesture = audio unlock; harmless if already playing
    if (idx >= SCENES.length - 1) finish();
    else setIdx((i) => i + 1);
  };

  // Auto-advance each scene after its hold (a tap advances sooner; the last scene waits
  // for the player — a title card should never yank itself away).
  useEffect(() => {
    if (idx >= SCENES.length - 1) return undefined;
    const t = setTimeout(() => setIdx((i) => Math.min(i + 1, SCENES.length - 1)), scene.holdMs);
    return () => clearTimeout(t);
  }, [idx, scene.holdMs]);

  // Hand the scene change to the film clocks (the render loop cross-fades on its own).
  useEffect(() => {
    const f = filmRef.current;
    if (f.visual === scene.visual) return;
    f.prev = f.visual;
    f.prevStartedAt = f.startedAt;
    f.visual = scene.visual;
    f.startedAt = performance.now();
  }, [scene.visual]);

  // The projector: a DPR-capped full-screen canvas running the procedural scene painters.
  // Reduced motion: no loop — each scene paints ONE hand-picked still (CSS fades carry it).
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return undefined;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1); // cinema, not chrome — cap the cost
    const size = (): void => {
      cv.width = Math.round(cv.clientWidth * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);
    };
    size();
    window.addEventListener('resize', size);
    let raf = 0;
    const frame = (): void => {
      const f = filmRef.current;
      const now = performance.now();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = cv.width / dpr;
      const h = cv.height / dpr;
      if (reducedMotion) {
        drawIntroFrame(ctx, w, h, f.visual, REDUCED_FRAME_T[f.visual], null, 0, 1);
        return; // one still per scene — repainted only when the scene (or size) changes
      }
      const t = (now - f.startedAt) / 1000;
      const fade = f.prev ? Math.min(1, (now - f.startedAt) / FADE_MS) : 1;
      drawIntroFrame(ctx, w, h, f.visual, t, f.prev, (now - f.prevStartedAt) / 1000, fade);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reduced mode repaints per scene; the loop reads clocks from the ref
  }, [reducedMotion ? scene.visual : true]);

  return (
    <div className="intro" role="dialog" aria-label="Initialization sequence" onClick={advance}>
      <div className={`intro-stage is-${scene.visual}`}>
        <canvas ref={canvasRef} className="intro-canvas" aria-hidden />
        <div className="intro-grade" aria-hidden />
        <div className="intro-copy" key={scene.id}>
          {scene.eyebrow && <div className="intro-eyebrow">{scene.eyebrow}</div>}
          {scene.visual === 'title' ? (
            <h1 className="intro-title">{scene.text}</h1>
          ) : (
            <p className="intro-text">{scene.text}</p>
          )}
          {scene.visual === 'title' && (
            <button
              className="primary intro-begin"
              onClick={(e) => {
                e.stopPropagation();
                finish();
              }}
            >
              ▶ Begin
            </button>
          )}
        </div>
      </div>
      <div className="intro-foot">
        <span className="intro-dots" aria-hidden>
          {SCENES.map((s, i) => (
            <i key={s.id} className={i === idx ? 'on' : ''} />
          ))}
        </span>
        <button
          className="intro-skip"
          onClick={(e) => {
            e.stopPropagation();
            finish();
          }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
