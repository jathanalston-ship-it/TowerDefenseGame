// CUTSCENE PLAYER (docs/CUTSCENES.md §player) — the reusable film engine behind every story
// cutscene: the intro's projector language (timed copy LINES, sound-design BEATS, themed
// procedural tableaux under camera drift, letterboxed + film-graded, the 'cinema' score)
// pointed at CutsceneDef data. Plays post-Results on a first mega defeat and from the Memory
// Archive's replay. Ends on a CODA card — the memory's name + the small passive it grants —
// so the collectible moment always lands. Tap advances; Skip jumps to the coda; reduced
// motion shows one hand-picked still per scene (CSS fades carry the copy).

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { audio } from '../audio/sound';
import { scheduleCinematicBeats } from '../audio/cinematicBeats';
import { music } from '../audio/music';
import type { CutsceneDef } from '../core/cutscenes';
import { cutsceneMegaId, cutsceneStillT, drawCutsceneFrame } from '../render/cutsceneScenes';
import type { CutsceneFrameSpec } from '../render/cutsceneScenes';
import { cutsceneManualPref, motionPrefs, onMotionPrefs, resolveMotion, setCutsceneManualPref, systemReducedMotion } from '../state/prefs';
import './CutscenePlayer.css';

const FADE_MS = 850; // scene-to-scene cross-dissolve (the intro's cut length)
const CODA_MS = 6200; // how long the coda holds before auto-continue

export function CutscenePlayer({ def, onDone }: { def: CutsceneDef; onDone: () => void }): JSX.Element {
  // Reduced motion = THE motionScale (OS request unless Settings → Motion overrides it): one still
  // per scene, no camera drift / punches / flashes. Preferences remain live during the film.
  const [feel, setFeel] = useState(() => resolveMotion(motionPrefs(), systemReducedMotion()));
  const reducedMotion = feel.motion === 0;
  useEffect(() => {
    let prefs = motionPrefs();
    const update = (): void => setFeel(resolveMotion(prefs, systemReducedMotion()));
    const off = onMotionPrefs(next => { prefs = next; update(); });
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    mq?.addEventListener('change', update);
    update();
    return () => { off(); mq?.removeEventListener('change', update); };
  }, []);
  const [idx, setIdx] = useState(0);
  const [coda, setCoda] = useState(false);
  const [manual, setManual] = useState(cutsceneManualPref);
  const captionId = useId();
  const codaId = useId();
  const [hidden, setHidden] = useState(() => document.hidden);
  const hiddenAt = useRef<number | null>(document.hidden ? performance.now() : null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const filmRef = useRef({
    scene: 0, startedAt: performance.now(), prev: -1, prevStartedAt: 0, beatsFired: 0,
  });
  const idxRef = useRef(0);
  idxRef.current = idx;
  const codaRef = useRef(false);
  codaRef.current = coda;
  const scene = def.scenes[idx];
  const sceneProgress = `Scene ${idx + 1} of ${def.scenes.length}`;

  useEffect(() => {
    const update = (): void => {
      const now = performance.now();
      if (document.hidden) {
        if (hiddenAt.current === null) hiddenAt.current = now;
      } else if (hiddenAt.current !== null) {
        const elapsed = now - hiddenAt.current;
        filmRef.current.startedAt += elapsed;
        filmRef.current.prevStartedAt += elapsed;
        hiddenAt.current = null;
      }
      setHidden(document.hidden);
    };
    document.addEventListener('visibilitychange', update);
    update();
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  // Keep keyboard navigation in the film, then return to the Archive's launch button.
  useEffect(() => {
    const previous = document.activeElement;
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (coda) dialog?.querySelector<HTMLButtonElement>('.cutscene-coda-continue')?.focus();
    else dialog?.focus();
  }, [coda]);

  const finish = (): void => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };
  /** Roll into the coda (the last cut, the archive stamp, the boost line). */
  const toCoda = (): void => {
    if (codaRef.current) return;
    codaRef.current = true;
    audio.cue('cin_bloom');
    setCoda(true);
  };
  const returnToScene = (): void => {
    const film = filmRef.current;
    film.prev = -1;
    film.startedAt = performance.now();
    film.beatsFired = 0;
    setCoda(false);
  };
  const advance = (): void => {
    if (codaRef.current || idxRef.current !== idx) return;
    if (idx >= def.scenes.length - 1) toCoda();
    else setIdx((current) => current === idx ? idx + 1 : current);
  };

  // The score: the film owns 'cinema' while it runs; the caller re-arms its own music after.
  useEffect(() => {
    audio.resume();
    music.play('cinema');
    music.setIntensity(0);
  }, []);
  useEffect(() => {
    music.setIntensity(coda ? 1 : def.scenes.length > 1 ? idx / (def.scenes.length - 1) : 1);
  }, [idx, coda, def.scenes.length]);

  // Auto-advance each scene after its hold; the coda auto-continues after its own hold.
  useEffect(() => {
    if (manual) return;
    let remaining = coda ? CODA_MS : scene.durMs;
    let started: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fired = false;
    const update = (): void => {
      if (fired) return;
      if (document.hidden) {
        if (started !== null) remaining = Math.max(0, remaining - (performance.now() - started));
        started = null;
        clearTimeout(timer);
      } else if (started === null) {
        started = performance.now();
        timer = setTimeout(() => {
          started = null;
          remaining = 0;
          if (document.hidden) return;
          fired = true;
          if (coda) finish(); else advance();
        }, remaining);
      }
    };
    document.addEventListener('visibilitychange', update);
    update();
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', update); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- this timer belongs to the scene captured by idx
  }, [idx, coda, scene.durMs, manual]);

  // Scene change → film clocks + the cut whoosh.
  useEffect(() => {
    const f = filmRef.current;
    if (f.scene !== idx) {
      f.prev = f.scene;
      f.prevStartedAt = f.startedAt;
      f.scene = idx;
      f.startedAt = performance.now();
      f.beatsFired = 0;
      audio.cue('cin_cut');
    }
  }, [idx]);

  useEffect(() => {
    if (hidden || coda) return undefined;
    return scheduleCinematicBeats(scene.beats, filmRef.current, (cue) => audio.cue(cue));
  }, [hidden, coda, idx, scene.beats]);

  // The projector — full-screen canvas, independent of sound cue timing.
  useEffect(() => {
    if (hidden) return undefined;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return undefined;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const size = (): void => {
      cv.width = Math.round(cv.clientWidth * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);
    };
    size();
    let raf = 0;
    // One frame spec for the whole showing, mutated per frame (no per-frame allocation).
    const prevSpec = { painter: def.scenes[0].painter, t: 0 };
    const spec: CutsceneFrameSpec = {
      painter: def.scenes[0].painter, t: 0, theme: def.palette, prev: null, fade: 1,
      scene: null, prevScene: null, megaId: cutsceneMegaId(def), motion: feel.motion, flashes: feel.flashes,
    };
    const frame = (): void => {
      if (document.hidden) return;
      const f = filmRef.current;
      const now = performance.now();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = cv.width / dpr;
      const h = cv.height / dpr;
      const cur = def.scenes[f.scene];
      spec.painter = cur.painter;
      spec.scene = cur;
      if (reducedMotion) {
        spec.t = cutsceneStillT(cur);
      } else {
        const t = (now - f.startedAt) / 1000;
        const prevScene = f.prev >= 0 ? def.scenes[f.prev] : null;
        spec.t = t;
        spec.prevScene = prevScene;
        if (prevScene) {
          prevSpec.painter = prevScene.painter;
          prevSpec.t = (now - f.prevStartedAt) / 1000;
        }
        spec.prev = prevScene ? prevSpec : null;
        spec.fade = prevScene ? Math.min(1, (now - f.startedAt) / FADE_MS) : 1;
      }
      drawCutsceneFrame(ctx, w, h, spec);
      if (codaRef.current) {
        // the coda dims the film under its card — the memory settling into the archive
        ctx.fillStyle = 'rgba(3,5,9,0.55)';
        ctx.fillRect(0, 0, w, h);
      }
      if (!reducedMotion) raf = requestAnimationFrame(frame);
    };
    const resize = (): void => {
      size();
      // Changing canvas dimensions clears it; reduced motion has no continuous loop.
      if (reducedMotion) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
    };
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the loop reads clocks from refs; reduced mode repaints per scene
  }, [hidden, feel.motion, feel.flashes, reducedMotion ? idx : null, reducedMotion ? coda : false]);

  // PORTALED to <body>: the player launches from deep screens (the Archive) where filling
  // transform animations on ancestors would otherwise capture position:fixed and cage the
  // film inside the hub column.
  return createPortal(
    <div ref={dialogRef} tabIndex={-1} className={`intro cutscene${manual ? ' is-manual' : ''}${hidden ? ' is-suspended' : ''}`} role="dialog" aria-modal="true" aria-label={`Cutscene — ${def.title}`} aria-describedby={manual && !coda ? captionId : undefined} onClick={manual ? undefined : advance}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); coda ? finish() : toCoda(); }
        if (e.key !== 'Tab') return;
        const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }}>
      <div id={captionId} className="a11y-only" aria-live="polite" aria-atomic="true">
        {manual && !coda ? `${sceneProgress}. ${scene.lines.map((line) => line.text).join(' ')}` : ''}
      </div>
      <div className={`intro-stage is-copy-${coda ? 'center' : scene.copyAt ?? 'center'}`}>
        <canvas ref={canvasRef} className="intro-canvas" aria-hidden />
        <div className="intro-grade" aria-hidden />
        <div className="intro-bar intro-bar-top" aria-hidden />
        <div className="intro-bar intro-bar-bot" aria-hidden />
        {!coda && (
          <div className="intro-copy" key={scene.id}>
            <div className="intro-eyebrow">{def.title}</div>
            {scene.lines.map((l) => (
              <p key={l.at} className={`intro-text ${l.em ? 'is-em' : ''}`} style={{ animationDelay: `${l.at}s` }}>
                {l.text}
              </p>
            ))}
          </div>
        )}
        {coda && (
          <div className="intro-copy cutscene-coda" onClick={(e) => e.stopPropagation()}>
            <div className="intro-eyebrow">◈ MEMORY ARCHIVED</div>
            <h2 id={`${codaId}-title`} className="cutscene-coda-title" style={{ color: def.palette.glow }}>{def.title}</h2>
            <p id={`${codaId}-subtitle`} className="cutscene-coda-sub">{def.subtitle}</p>
            <p id={`${codaId}-boost`} className="cutscene-coda-boost" style={{ ['--cs' as string]: def.palette.accent }}>
              <span aria-hidden>✦ </span>{def.boost.label} <small><span aria-hidden>· </span>permanent</small>
            </p>
            <div className="cutscene-coda-actions">
              {manual && <button type="button" onClick={returnToScene}>‹ Back to scene</button>}
              <button type="button" className="primary cutscene-coda-continue" aria-describedby={`${codaId}-title ${codaId}-subtitle ${codaId}-boost`} onClick={finish}>Continue ▸</button>
            </div>
          </div>
        )}
      </div>
      <div className="intro-foot">
        {manual && !coda
          ? <span className="intro-scene-progress" aria-hidden="true">{sceneProgress}</span>
          : <span className="intro-timeline" aria-hidden>
              {def.scenes.map((s, i) => (
                <i key={s.id} className={coda || i < idx ? 'done' : i === idx ? 'on' : ''} />
              ))}
            </span>}
        {!coda && (
          <div className="cutscene-controls" onClick={(e) => e.stopPropagation()}>
          <button className="intro-skip" aria-label="Read at my pace" aria-pressed={manual} title="Show all scene text and advance only when you choose" onClick={() => {
            setCutsceneManualPref(!manual);
            setManual(!manual);
          }}>
            {manual ? 'Auto-play' : 'Read at my pace'}
          </button>
          {manual && (
            <button className="intro-skip" aria-disabled={idx === 0} onClick={() => setIdx((current) => current === idx ? Math.max(0, idx - 1) : current)}>
              ‹ Previous scene
            </button>
          )}
          <button className="intro-skip" onClick={advance}>Next scene ▸</button>
          <button className="intro-skip" onClick={(e) => { e.stopPropagation(); toCoda(); }}>
            Skip
          </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
