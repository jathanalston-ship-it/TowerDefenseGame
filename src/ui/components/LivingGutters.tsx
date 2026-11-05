// LIVING GUTTERS mount (docs/SIGNATURE-MOMENTS.md §4) — the periphery canvases BEHIND the board.
// Desktop only: phones (the landscape/portrait run layouts) have no gutters, so nothing mounts and
// nothing runs. The painter is render/gutters.ts; this file only measures the frame, polls the
// bake's inputs at 4 Hz and crossfades between two STATIC bakes — zero work per frame.

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Game } from '../../core/game';
import { getAssimilationDebug, isLivingBattlefieldEnabled } from '../../render/livingBattlefield';
import { GUTTERS, gutterGeometry, gutterInputFrom, gutterKey, paintGutters, sameGeom } from '../../render/gutters';
import type { GutterGeom, GutterInput } from '../../render/gutters';
import { useLayoutProfile } from '../layoutProfile';
import { isDebugEnabled } from '../../debug/debug';
import './LivingGutters.css';

/** Measurement counters for headless perf probes (exposed as `__gutters` under ?debug only). */
export const gutterStats = { bakes: 0, bakeMs: 0, lastBakeMs: 0, polls: 0, pollMs: 0 };

export function LivingGutters({ game, boardRef }: { game: Game; boardRef: RefObject<HTMLCanvasElement> }): JSX.Element | null {
  const { profile } = useLayoutProfile();
  const [geom, setGeom] = useState<GutterGeom | null>(null);
  const aRef = useRef<HTMLCanvasElement>(null);
  const bRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef(0); // which of the two canvases is showing
  // The Living Battlefield keeps its last computed terrain in module state — until this board draws its
  // first frame that is the PREVIOUS run's. Anything still identical to it at mount is ignored.
  const staleRef = useRef(getAssimilationDebug());

  // Measure the frame (the board's positioned parent) and the board's layout box — on mount and on
  // every resize of either (panel collapse, window resize). Layout boxes ignore the outro's CSS zoom.
  useEffect(() => {
    const board = boardRef.current;
    const frame = board?.parentElement;
    if (profile !== 'desktop' || !board || !frame) { setGeom(null); return; }
    let raf = 0;
    const measure = (): void => {
      const g = gutterGeometry(frame.clientWidth, frame.clientHeight, board.offsetLeft, board.offsetTop, board.offsetWidth, board.offsetHeight);
      setGeom((prev) => (sameGeom(prev, g) ? prev : g));
    };
    const schedule = (): void => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', schedule);
      return () => { window.removeEventListener('resize', schedule); cancelAnimationFrame(raf); };
    }
    const ro = new ResizeObserver(schedule);
    ro.observe(frame);
    ro.observe(board);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [profile, boardRef]);

  // Bake. New geometry ⇒ repaint the live canvas in place (no fade). New CONTENT (the 4 Hz poll's key
  // changed: stage / creep / biome / towers / mega) ⇒ bake the hidden canvas and crossfade (CSS
  // opacity, compositor-only; instant under reduced motion). The faded bake's store is then freed.
  useEffect(() => {
    const cvs = [aRef.current, bRef.current];
    if (!geom || !cvs[0] || !cvs[1]) return;
    const live = (): HTMLCanvasElement => cvs[liveRef.current]!;
    const idle = (): HTMLCanvasElement => cvs[1 - liveRef.current]!;
    if (isDebugEnabled()) (globalThis as { __gutters?: typeof gutterStats }).__gutters = gutterStats;
    idle().classList.remove('is-on');
    idle().width = 0; idle().height = 0;
    let key = '';
    let creep: number | null = null; // the creep step currently baked (hysteresis)
    let release = 0;
    const paint = (cv: HTMLCanvasElement, input: GutterInput): void => {
      const t0 = performance.now();
      if (cv.width !== geom.cw || cv.height !== geom.ch) { cv.width = geom.cw; cv.height = geom.ch; }
      const ctx = cv.getContext('2d');
      if (ctx) paintGutters(ctx, input, geom);
      gutterStats.bakes++;
      gutterStats.lastBakeMs = performance.now() - t0;
      gutterStats.bakeMs += gutterStats.lastBakeMs;
    };
    const poll = (): void => {
      const t0 = performance.now();
      const lb = getAssimilationDebug();
      const input = gutterInputFrom(game.getRenderState(), lb !== staleRef.current ? lb : null, isLivingBattlefieldEnabled(), creep);
      const k = gutterKey(input);
      if (k !== key) {
        creep = input.creep;
        if (key === '') {
          paint(live(), input);
          live().classList.add('is-on');
        } else {
          window.clearTimeout(release);
          const old = live();
          paint(idle(), input);
          liveRef.current = 1 - liveRef.current;
          live().classList.add('is-on');
          old.classList.remove('is-on');
          release = window.setTimeout(() => { old.width = 0; old.height = 0; }, GUTTERS.fadeMs + 100);
        }
        key = k;
      }
      gutterStats.polls++;
      gutterStats.pollMs += performance.now() - t0;
    };
    poll();
    const id = window.setInterval(poll, GUTTERS.pollMs);
    return () => { window.clearInterval(id); window.clearTimeout(release); };
  }, [geom, game]);

  if (!geom) return null;
  const style = { transitionDuration: `${GUTTERS.fadeMs}ms` };
  return (
    <>
      <canvas ref={aRef} className="gutters" width={0} height={0} style={style} aria-hidden />
      <canvas ref={bRef} className="gutters" width={0} height={0} style={style} aria-hidden />
    </>
  );
}
