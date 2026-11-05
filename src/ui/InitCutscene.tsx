// INITIALIZATION SEQUENCE (docs/GAME-FEEL.md §intro) — the cold-open CINEMATIC.
// Plays ONCE on a device's very first boot, BEFORE the tutorial, and replays any time from
// Settings → Help. Its own lazy chunk (App mounts it through ui/IntroMount; the boot-side flags live in
// ui/introState). Six scenes: the signal, the swarm, the taking, the Core, the Hive ANSWERING (the
// game's real towers and swarm — the promise of the game before the tutorial), the title.
// A continuous, fully SCORED film, not a slideshow:
//
//   • PRE-ROLL GATE — "TAP TO RECEIVE" unlocks the AudioContext, so the whole film plays with
//     its score + sound design from t=0 (the browser's autoplay policy, made diegetic).
//   • MASTER TIMELINE — scenes are data with durations, staged copy LINES, and BEAT events
//     (scene-relative times → SFX cues synced to the visuals: radar pings, the crust groaning,
//     the heartbeat, the title swell). The score ('cinema') swells scene-by-scene via the
//     music intensity seam. Tap = next scene; Skip = out; the title card waits for the player.
//   • THE DESCENT — leaving the title doesn't cut: the camera DIVES from the looming nucleus
//     down a living tunnel and blooms white-gold into the next screen (the tutorial on first
//     boot) — the film literally lands you in the hive.
//
// Each scene is a full-screen PROCEDURAL canvas set-piece (render/introScenes.ts — the game's
// own visual language, no assets) under the film direction layers (render/filmDirection.ts:
// drift, punches on `impact` beats, a beat-driven mid layer, particulate foreground),
// letterboxed, film-graded, with each scene's copy on its quiet band (`copyAt`).
// Reduced motion (the OS request unless Settings → Motion overrides it) swaps the animation
// for a hand-picked still per scene (gentle CSS fades only) and skips the dive.

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { audio } from '../audio/sound';
import { music } from '../audio/music';
import { REDUCED_FRAME_T, drawDiveTransition, drawIntroFrame } from '../render/introScenes';
import type { IntroVisual } from '../render/introScenes';
import type { CutsceneBeat, CutsceneCamera, CutsceneCopyAt } from '../core/cutscenes';
import { motionPrefs, resolveMotion, systemReducedMotion } from '../state/prefs';
import { markIntroSeen, setIntroPlaying } from './introState';

/** A copy line staged onto the film at a scene-relative time (seconds). */
interface SceneLine { at: number; text: string; em?: boolean }
export interface IntroScene {
  id: string;
  eyebrow?: string;
  lines: SceneLine[];
  visual: IntroVisual;
  durMs: number; // how long the film holds this scene before cutting
  beats: CutsceneBeat[]; // `impact` beats land a camera punch (docs/CUTSCENES.md §direction)
  copyAt?: CutsceneCopyAt; // the copy's quiet region (default 'center')
  camera?: CutsceneCamera; // default: the painter's drift row (render/introScenes.ts DRIFT)
  punch?: number; // punch zoom on impact beats (default FILM.punch.zoom; 0 = none)
  eyebrowAt?: number[]; // the title's triad: each ' · '-separated eyebrow word lands at its own time (s)
  ctaAt?: number; // the title's call to action appears at this time (s)
}

/** The authored film — copy, staging and SOUND as data (edit here, not in the component).
 *  Beat times are tuned to the painters: pings ride the radar sweep (~5.7s/turn) and quicken as the
 *  scope floods, the apex rises on the second rumble, the heart thumps on the core's 1.9s cycle, the
 *  defenders erupt on `cin_erupt`, kills stream home on `cin_feed`, the triad lands word by word.
 *  `copyAt` puts the copy on each tableau's measured quiet band (never over the core's light). */
export const SCENES: IntroScene[] = [
  {
    id: 'signal', eyebrow: 'DEEP CRUST RELAY 7', visual: 'signal', durMs: 7600,
    lines: [
      { at: 0.7, text: 'SIGNAL REACQUIRED.' },
      { at: 2.6, text: '11,204 days of silence end.', em: true },
    ],
    beats: [
      { at: 0.15, cue: 'cin_ping' }, { at: 1.6, cue: 'cin_alarm', impact: true }, { at: 2.9, cue: 'cin_ping' },
      { at: 4.2, cue: 'cin_ping' }, { at: 5.2, cue: 'cin_ping' }, { at: 5.9, cue: 'cin_ping' }, { at: 6.4, cue: 'cin_ping' },
      { at: 6.8, cue: 'cin_ping' }, { at: 7.1, cue: 'cin_shriek', impact: true },
    ],
  },
  {
    // the crust splits and the game's own swarm climbs out; the apex rises past the lens on the rumble
    id: 'below', visual: 'descent', durMs: 8200, copyAt: 'upper',
    lines: [
      { at: 0.8, text: 'They came from below.' },
      { at: 3.4, text: 'Not an army — an APPETITE.', em: true },
    ],
    beats: [
      { at: 0.1, cue: 'cin_rumble' }, { at: 2.2, cue: 'cin_shriek' }, { at: 3.6, cue: 'cin_rumble', impact: true },
      { at: 5.0, cue: 'cin_shriek', impact: true }, { at: 6.4, cue: 'cin_shriek' }, { at: 7.5, cue: 'cin_shriek' },
    ],
  },
  {
    id: 'take', visual: 'veins', durMs: 8000, copyAt: 'upper',
    lines: [
      { at: 0.8, text: 'Everything they touch, they take.' },
      { at: 3.4, text: 'Flesh. Steel. Thought.', em: true },
    ],
    beats: [
      { at: 0.3, cue: 'cin_creep' }, { at: 2.2, cue: 'cin_snap', impact: true }, { at: 3.6, cue: 'cin_creep' },
      { at: 5.0, cue: 'cin_snap', impact: true }, { at: 6.2, cue: 'cin_creep' }, { at: 7.2, cue: 'cin_snap' },
    ],
  },
  {
    // the copy sits BELOW the Hive Core — the core is the brightest light in the film
    id: 'core', visual: 'core', durMs: 8600, copyAt: 'lower',
    lines: [
      { at: 0.9, text: 'One organism refused to be eaten.' },
      { at: 3.6, text: 'You are its HIVE CORE —' },
      { at: 5.4, text: 'the last thing still growing back.', em: true },
    ],
    // the heartbeat cue rides the painter's 1.9s double-thump cycle
    beats: [
      { at: 0.2, cue: 'cin_heart' }, { at: 2.1, cue: 'cin_heart' }, { at: 4.0, cue: 'cin_heart' },
      { at: 4.6, cue: 'cin_bloom', impact: true }, { at: 5.9, cue: 'cin_heart' }, { at: 7.8, cue: 'cin_heart' }, { at: 8.3, cue: 'cin_bloom' },
    ],
  },
  {
    // THE TURN — the game's promise before the tutorial: real towers erupt along the line, the swarm
    // breaks on it, every kill streams home to the Core. The swarm pours down from the top, so the copy
    // sits on the upper band ABOVE the kill zone (the shroud the swarm emerges from).
    id: 'answer', visual: 'answer', durMs: 9600, copyAt: 'upper',
    lines: [
      { at: 0.7, text: 'So it grew teeth.' },
      { at: 4.2, text: 'Everything that falls becomes its next mutation.', em: true },
    ],
    beats: [
      { at: 0.2, cue: 'cin_heart' }, { at: 0.9, cue: 'cin_erupt', impact: true }, { at: 1.75, cue: 'cin_erupt', impact: true },
      { at: 2.4, cue: 'cin_shriek' }, { at: 3.9, cue: 'cin_feed' }, { at: 4.8, cue: 'cin_rumble' }, { at: 5.4, cue: 'cin_feed' },
      { at: 6.5, cue: 'cin_feed' }, { at: 7.4, cue: 'cin_bloom', impact: true }, { at: 8.6, cue: 'cin_heart' },
    ],
  },
  {
    // the wordmark resolves letter by letter, then the triad lands word by word on its own beats
    id: 'title', eyebrow: 'DEFEND · EVOLVE · CONSUME', visual: 'title', durMs: 0, // 0 = waits for the player
    eyebrowAt: [1.6, 2.05, 2.5], ctaAt: 3.1,
    lines: [{ at: 0.6, text: 'ASSIMILATION', em: true }],
    beats: [
      { at: 0.55, cue: 'cin_title', impact: true },
      { at: 1.6, cue: 'cin_erupt' }, { at: 2.05, cue: 'cin_bloom' }, { at: 2.5, cue: 'cin_feed' },
    ],
  },
];

const WORDMARK = 'ASSIMILATION';
const FADE_MS = 850; // scene-to-scene cross-dissolve
const DIVE_MS = 1500; // the descent transition out of the film

type Phase = 'gate' | 'film' | 'dive';

/** `onDone(dived)` — true when the film left through the DESCENT (its last frame is the gold
 *  bloom, so the caller can fade an afterglow out instead of cutting to the next screen). */
export function InitCutscene({ onDone }: { onDone: (dived?: boolean) => void }): JSX.Element {
  const [phase, setPhase] = useState<Phase>('gate');
  useEffect(() => { setIntroPlaying(true); return () => setIntroPlaying(false); }, []);
  // Reduced motion = THE motionScale (OS request unless Settings → Motion overrides it): stills,
  // no camera drift / punches / flashes, no dive. Resolved once per showing.
  const [feel] = useState(() => resolveMotion(motionPrefs(), systemReducedMotion()));
  const reducedMotion = feel.motion === 0;
  const [idx, setIdx] = useState(0);
  const doneRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The cinematographer's clocks: current scene start, what it dissolved from, fired beats, dive start.
  const filmRef = useRef({
    visual: SCENES[0].visual as IntroVisual, startedAt: performance.now(), prev: null as IntroVisual | null, prevStartedAt: 0,
    beatsFired: 0, diveAt: 0, scene: 0, prevScene: -1,
  });
  const phaseRef = useRef<Phase>('gate');
  phaseRef.current = phase;
  const idxRef = useRef(0);
  idxRef.current = idx;
  const scene = SCENES[idx];

  /** Leave through the DESCENT (reduced motion / not-yet-started exit immediately). */
  const finish = (): void => {
    if (doneRef.current) return;
    markIntroSeen();
    if (reducedMotion || phaseRef.current !== 'film') {
      doneRef.current = true;
      onDone();
      return;
    }
    filmRef.current.diveAt = performance.now();
    audio.cue('cin_dive');
    setPhase('dive');
  };

  /** The pre-roll tap: unlock audio, roll the score, start the film at t=0. */
  const receive = (): void => {
    audio.cue('cin_ping'); // the unlock gesture is itself the first contact
    music.play('cinema');
    music.setIntensity(0);
    filmRef.current.startedAt = performance.now();
    setPhase('film');
  };

  const advance = (): void => {
    if (phaseRef.current !== 'film') return;
    if (idxRef.current >= SCENES.length - 1) finish();
    else setIdx((i) => i + 1);
  };

  // Auto-advance each scene after its hold (a tap advances sooner; the title — durMs 0 — waits).
  useEffect(() => {
    if (phase !== 'film' || scene.durMs === 0) return undefined;
    const t = setTimeout(() => setIdx((i) => Math.min(i + 1, SCENES.length - 1)), scene.durMs);
    return () => clearTimeout(t);
  }, [phase, idx, scene.durMs]);

  // Scene change → film clocks + cut whoosh + score swell (the intensity seam walks 0 → 1).
  useEffect(() => {
    if (phase !== 'film') return;
    const f = filmRef.current;
    if (f.visual !== scene.visual) {
      f.prev = f.visual;
      f.prevStartedAt = f.startedAt;
      f.visual = scene.visual;
      f.prevScene = f.scene;
      f.scene = idx;
      f.startedAt = performance.now();
      f.beatsFired = 0;
      audio.cue('cin_cut');
    }
    music.setIntensity(idx / (SCENES.length - 1));
  }, [phase, idx, scene.visual]);

  // The projector: a DPR-capped full-screen canvas running the procedural scene painters, firing
  // the scene's sound-design BEATS as the clock crosses them, and painting the dive on exit.
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
        drawIntroFrame(ctx, w, h, f.visual, REDUCED_FRAME_T[f.visual], null, 0, 1, SCENES[f.scene], null, 0, false);
        return; // one still per scene — repainted only when the scene (or size) changes
      }
      const t = (now - f.startedAt) / 1000;
      if (phaseRef.current === 'film') {
        // fire this scene's beats as the clock crosses them (idx order == time order)
        const beats = SCENES[idxRef.current].beats;
        while (f.beatsFired < beats.length && t >= beats[f.beatsFired].at) {
          audio.cue(beats[f.beatsFired].cue);
          f.beatsFired++;
        }
      }
      const fade = f.prev ? Math.min(1, (now - f.startedAt) / FADE_MS) : 1;
      drawIntroFrame(ctx, w, h, f.visual, t, f.prev, (now - f.prevStartedAt) / 1000, fade,
        SCENES[f.scene], f.prevScene >= 0 ? SCENES[f.prevScene] : null, feel.motion, feel.flashes);
      if (phaseRef.current === 'dive') {
        const dt = (now - f.diveAt) / DIVE_MS;
        drawDiveTransition(ctx, w, h, dt);
        if (dt >= 1 && !doneRef.current) {
          doneRef.current = true;
          onDone(true);
          return;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reduced mode repaints per scene; the loop reads clocks from refs.
    // `phase` IS a dep: the gate and the film are separate JSX trees, so the canvas REMOUNTS on
    // gate→film — the projector must rebind to the new element.
  }, [phase, reducedMotion ? scene.visual : true]);

  // ── Pre-roll gate: the one tap the browser needs, staged as the transmission arriving ──
  if (phase === 'gate') {
    return (
      <div className="intro" role="dialog" aria-label="Initialization sequence" onClick={receive}>
        <div className="intro-stage is-signal">
          <canvas ref={canvasRef} className="intro-canvas" aria-hidden />
          <div className="intro-grade" aria-hidden />
          <div className="intro-gate">
            <div className="intro-gate-glyph" aria-hidden>⬢</div>
            <div className="intro-eyebrow">INCOMING TRANSMISSION</div>
            <button className="intro-receive" onClick={(e) => { e.stopPropagation(); receive(); }}>
              TAP TO RECEIVE
            </button>
            <button
              className="intro-skip intro-gate-skip"
              onClick={(e) => { e.stopPropagation(); markIntroSeen(); doneRef.current = true; onDone(); }}
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  const diving = phase === 'dive';
  return (
    <div className="intro" role="dialog" aria-label="Initialization sequence" onClick={advance}>
      <div className={`intro-stage is-${scene.visual} is-copy-${scene.copyAt ?? 'center'} ${diving ? 'is-diving' : ''}`}>
        <canvas ref={canvasRef} className="intro-canvas" aria-hidden />
        <div className="intro-grade" aria-hidden />
        <div className="intro-bar intro-bar-top" aria-hidden />
        <div className="intro-bar intro-bar-bot" aria-hidden />
        <div className="intro-copy" key={scene.id}>
          {scene.eyebrow && scene.id !== 'title' && <div className="intro-eyebrow">{scene.eyebrow}</div>}
          {scene.id === 'title' ? (
            <>
              {/* The wordmark resolves glyph by glyph (each its own slice of the gradient), then a
                  glint crosses it letter by letter; the triad lands word by word on the film's beats. */}
              <h1 className="intro-title" aria-label={WORDMARK} style={{ '--n': WORDMARK.length } as CSSProperties}>
                {[...WORDMARK].map((ch, i) => (
                  <span key={i} aria-hidden data-c={ch} style={{ '--i': i } as CSSProperties}>{ch}</span>
                ))}
              </h1>
              {scene.eyebrow && (
                <div className="intro-triad">
                  {scene.eyebrow.split(' · ').map((word, i) => (
                    <span key={word} style={{ animationDelay: `${scene.eyebrowAt?.[i] ?? 1 + i * 0.4}s` }}>{word}</span>
                  ))}
                </div>
              )}
              <button
                className="intro-begin"
                style={{ animationDelay: `${scene.ctaAt ?? 1}s` }}
                onClick={(e) => {
                  e.stopPropagation();
                  finish();
                }}
              >
                <span aria-hidden>▾</span> Descend
              </button>
            </>
          ) : (
            scene.lines.map((l) => (
              <p key={l.at} className={`intro-text ${l.em ? 'is-em' : ''}`} style={{ animationDelay: `${l.at}s` }}>
                {l.text}
              </p>
            ))
          )}
        </div>
      </div>
      <div className={`intro-foot ${diving ? 'is-diving' : ''}`}>
        <span className="intro-timeline" aria-hidden>
          {SCENES.map((s, i) => (
            <i key={s.id} className={i < idx ? 'done' : i === idx ? 'on' : ''} />
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
