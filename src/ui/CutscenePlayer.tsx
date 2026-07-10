// CUTSCENE PLAYER (docs/CUTSCENES.md §player) — the reusable film engine behind every story
// cutscene: the intro's projector language (timed copy LINES, sound-design BEATS, themed
// procedural tableaux under camera drift, letterboxed + film-graded, the 'cinema' score)
// pointed at CutsceneDef data. Plays post-Results on a first mega defeat and from the Memory
// Archive's replay. Ends on a CODA card — the memory's name + the small passive it grants —
// so the collectible moment always lands. Tap advances; Skip jumps to the coda; reduced
// motion shows one hand-picked still per scene (CSS fades carry the copy).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { audio } from '../audio/sound';
import { music } from '../audio/music';
import type { CutsceneDef } from '../core/cutscenes';
import { CUTSCENE_REDUCED_T, drawCutsceneFrame } from '../render/cutsceneScenes';

const FADE_MS = 850; // scene-to-scene cross-dissolve (the intro's cut length)
const CODA_MS = 6200; // how long the coda holds before auto-continue
const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function CutscenePlayer({ def, onDone }: { def: CutsceneDef; onDone: () => void }): JSX.Element {
  const [idx, setIdx] = useState(0);
  const [coda, setCoda] = useState(false);
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

  const finish = (): void => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };
  /** Roll into the coda (the last cut, the archive stamp, the boost line). */
  const toCoda = (): void => {
    if (codaRef.current) return;
    audio.cue('cin_bloom');
    setCoda(true);
  };
  const advance = (): void => {
    if (codaRef.current) return;
    if (idxRef.current >= def.scenes.length - 1) toCoda();
    else setIdx((i) => i + 1);
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
    if (coda) {
      const t = setTimeout(finish, CODA_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(advance, scene.durMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- advance/finish are stable closures over refs
  }, [idx, coda, scene.durMs]);

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

  // The projector — full-screen canvas, beats fired as the clock crosses them.
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return undefined;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
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
      const cur = def.scenes[f.scene];
      if (reducedMotion) {
        drawCutsceneFrame(ctx, w, h, { painter: cur.painter, t: CUTSCENE_REDUCED_T[cur.painter], theme: def.palette, prev: null, fade: 1 });
        return; // one still per scene — repainted when the scene remounts the effect
      }
      const t = (now - f.startedAt) / 1000;
      if (!codaRef.current) {
        while (f.beatsFired < cur.beats.length && t >= cur.beats[f.beatsFired].at) {
          audio.cue(cur.beats[f.beatsFired].cue);
          f.beatsFired++;
        }
      }
      const prevScene = f.prev >= 0 ? def.scenes[f.prev] : null;
      drawCutsceneFrame(ctx, w, h, {
        painter: cur.painter,
        t,
        theme: def.palette,
        prev: prevScene ? { painter: prevScene.painter, t: (now - f.prevStartedAt) / 1000 } : null,
        fade: prevScene ? Math.min(1, (now - f.startedAt) / FADE_MS) : 1,
      });
      if (codaRef.current) {
        // the coda dims the film under its card — the memory settling into the archive
        ctx.fillStyle = 'rgba(3,5,9,0.55)';
        ctx.fillRect(0, 0, w, h);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the loop reads clocks from refs; reduced mode repaints per scene
  }, [reducedMotion ? idx : true]);

  // PORTALED to <body>: the player launches from deep screens (the Archive) where filling
  // transform animations on ancestors would otherwise capture position:fixed and cage the
  // film inside the hub column.
  return createPortal(
    <div className="intro cutscene" role="dialog" aria-label={`Cutscene — ${def.title}`} onClick={advance}>
      <div className="intro-stage">
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
            <h2 className="cutscene-coda-title" style={{ color: def.palette.glow }}>{def.title}</h2>
            <p className="cutscene-coda-sub">{def.subtitle}</p>
            <p className="cutscene-coda-boost" style={{ ['--cs' as string]: def.palette.accent }}>
              ✦ {def.boost.label} <small>· permanent</small>
            </p>
            <button className="primary cutscene-coda-continue" onClick={finish}>Continue ▸</button>
          </div>
        )}
      </div>
      <div className="intro-foot">
        <span className="intro-timeline" aria-hidden>
          {def.scenes.map((s, i) => (
            <i key={s.id} className={coda || i < idx ? 'done' : i === idx ? 'on' : ''} />
          ))}
        </span>
        {!coda && (
          <button className="intro-skip" onClick={(e) => { e.stopPropagation(); toCoda(); }}>
            Skip
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
