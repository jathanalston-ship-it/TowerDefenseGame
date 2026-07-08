// INITIALIZATION SEQUENCE (docs/GAME-FEEL.md §intro) — the cold-open cinematic.
// Plays ONCE on a device's very first boot, BEFORE the tutorial, and replays any
// time from Settings → Help. Pure DOM/CSS staging (no assets to load — the game's
// own visual language), data-driven scenes, click-to-advance, always skippable,
// honors prefers-reduced-motion (scenes render as gentle fades).
//
// Audio note: the browser gives us no AudioContext before the first gesture, so the
// open is DELIBERATELY silent — the first tap (advance/skip) unlocks the score.

import { useEffect, useRef, useState } from 'react';
import { music } from '../audio/music';

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
  /** Visual treatment class (the CSS owns each look). */
  visual: 'signal' | 'descent' | 'veins' | 'core' | 'title';
  holdMs: number;
}

/** The authored sequence — copy + staging as DATA (edit here, not in the component). */
const SCENES: IntroScene[] = [
  { id: 'signal', eyebrow: 'DEEP CRUST RELAY 7', text: 'SIGNAL REACQUIRED — 11,204 DAYS OF SILENCE END.', visual: 'signal', holdMs: 3400 },
  { id: 'below', text: 'They came from below. Not an army — an APPETITE.', visual: 'descent', holdMs: 3600 },
  { id: 'take', text: 'Everything they touch, they take. Flesh. Steel. Thought.', visual: 'veins', holdMs: 3600 },
  { id: 'core', text: 'One organism refused to be eaten. You are its HIVE CORE — the last thing still growing back.', visual: 'core', holdMs: 4200 },
  { id: 'title', eyebrow: 'DEFEND · EVOLVE · CONSUME', text: 'ASSIMILATE', visual: 'title', holdMs: 6000 },
];

export function InitCutscene({ onDone }: { onDone: () => void }): JSX.Element {
  const [idx, setIdx] = useState(0);
  const doneRef = useRef(false);
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

  return (
    <div className="intro" role="dialog" aria-label="Initialization sequence" onClick={advance}>
      <div className={`intro-stage is-${scene.visual}`} key={scene.id}>
        <div className="intro-fx" aria-hidden />
        <div className="intro-copy">
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
