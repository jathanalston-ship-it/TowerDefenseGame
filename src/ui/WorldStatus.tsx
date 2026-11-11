// World Status — the Command Center's living centerpiece (docs/COMMAND-CENTER.md §world).
// A canvas organism that IS the account: a breathing hive nucleus whose size and mood grow
// with the development era, one orbiting organelle per strain (tinted its class hue, swollen
// by its Stars, ringed at Adaptation FORM stages), a drifting DNA helix, and a spore field
// whose density follows the lab intensity — so a veteran's world visibly seethes where a
// fresh account's barely stirs. Pure presentation over the ws prop (a slice of the home
// view-model — the numbers themselves live in the command strip, never repeated here); the
// motion is one rAF canvas that dies with the component, pauses while the tab is hidden,
// and renders a single still frame under prefers-reduced-motion.

import { useEffect, useRef } from 'react';
import type { WorldStatusView } from './homeModel';
import { motionPrefs, onMotionPrefs, resolveMotion } from '../state/prefs';

const TAU = Math.PI * 2;

function hexRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
const rgba = (c: { r: number; g: number; b: number }, a: number): string => `rgba(${c.r},${c.g},${c.b},${a})`;

const VIRAL = hexRgb('#c98bff');
const MEMBRANE = hexRgb('#7ce6a0');

interface Spore { x: number; y: number; r: number; vy: number; vx: number; a: number }

function drawWorld(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, ws: WorldStatusView, spores: Spore[], animate: boolean): void {
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.5;
  const cy = h * 0.52;

  // DNA helix band — two counter-phased strands with rungs, drifting slowly left.
  const amp = h * 0.16;
  const drift = t * 24;
  ctx.lineWidth = 1;
  for (let s = 0; s < 2; s++) {
    ctx.strokeStyle = rgba(VIRAL, 0.1 + 0.08 * ws.intensity);
    ctx.beginPath();
    for (let x = -8; x <= w + 8; x += 6) {
      const y = cy + Math.sin((x + drift) * 0.022 + s * Math.PI) * amp;
      x === -8 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(VIRAL, 0.07 + 0.06 * ws.intensity);
  for (let x = -8; x <= w + 8; x += 26) {
    const y1 = cy + Math.sin((x + drift) * 0.022) * amp;
    const y2 = cy + Math.sin((x + drift) * 0.022 + Math.PI) * amp;
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
  }

  // Spore field — density follows the account's development intensity.
  for (const p of spores) {
    if (animate) { p.y += p.vy; p.x += p.vx; }
    if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
    if (p.x < -4) p.x = w + 4; else if (p.x > w + 4) p.x = -4;
    ctx.fillStyle = rgba(MEMBRANE, p.a * (0.35 + 0.65 * ws.intensity));
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
  }

  // The nucleus — a wobbling membrane blob that grows with the era; molts add faint shells.
  const base = h * (0.16 + ws.era * 0.03);
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * TAU;
    const wob = 1 + 0.06 * Math.sin(a * 3 + t * 1.3) + 0.04 * Math.sin(a * 5 - t * 0.9);
    const r = base * wob;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.88;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  const grad = ctx.createRadialGradient(cx, cy, base * 0.2, cx, cy, base * 1.15);
  grad.addColorStop(0, rgba(MEMBRANE, 0.28 + 0.1 * ws.era));
  grad.addColorStop(1, rgba(MEMBRANE, 0.04));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = rgba(MEMBRANE, 0.5);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Readiness iris — the organism's intent.
  const iris = hexRgb(ws.ready ? '#ffd24d' : '#5ad1ff');
  ctx.fillStyle = rgba(iris, 0.5 + 0.2 * Math.sin(t * 2.2));
  ctx.beginPath(); ctx.arc(cx, cy, base * 0.22, 0, TAU); ctx.fill();
  for (let m = 0; m < Math.min(ws.molts, 5); m++) {
    ctx.strokeStyle = rgba(VIRAL, 0.16 - m * 0.02);
    ctx.beginPath(); ctx.arc(cx, cy, base * (1.28 + m * 0.14), 0, TAU); ctx.stroke();
  }

  // Organelles — one per strain, orbiting; size = stars, FORM stages ring them in viral violet.
  ws.organs.forEach((o, i) => {
    const oa = t * (0.22 + i * 0.03) + (i * TAU) / ws.organs.length;
    const orbit = base * (1.55 + (i % 3) * 0.22);
    const x = cx + Math.cos(oa) * orbit * 1.35;
    const y = cy + Math.sin(oa) * orbit * 0.62;
    const c = hexRgb(o.color);
    const r = 3 + Math.min(10, o.stars) * 0.55;
    ctx.fillStyle = rgba(c, 0.85);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.4, 0, TAU); ctx.fill();
    for (let f = 0; f < o.form; f++) {
      ctx.strokeStyle = rgba(VIRAL, 0.55 - f * 0.12);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r + 2.5 + f * 2.2, 0, TAU); ctx.stroke();
    }
  });
}

export function WorldStatus({ ws }: { ws: WorldStatusView }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef(ws);
  const paintStillRef = useRef<(() => void) | null>(null);
  wsRef.current = ws;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let spores: Spore[] = [];
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let prefs = motionPrefs();
    let still = resolveMotion(prefs, media?.matches ?? false).motion === 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = (): void => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const n = Math.round(24 + 60 * wsRef.current.intensity);
      spores = Array.from({ length: n }, () => ({
        x: Math.random() * rect.width, y: Math.random() * rect.height,
        r: 0.6 + Math.random() * 1.6, vy: -(0.06 + Math.random() * 0.22), vx: (Math.random() - 0.5) * 0.08,
        a: 0.25 + Math.random() * 0.5,
      }));
      if (still && !document.hidden) frame(performance.now()); // re-render at the new size
    };
    const t0 = performance.now();
    const frame = (now: number): void => {
      const rect = canvas.getBoundingClientRect();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawWorld(ctx, rect.width, rect.height, still ? 0 : (now - t0) / 1000, wsRef.current, spores, !still);
    };
    const tick = (now: number): void => {
      frame(now);
      raf = requestAnimationFrame(tick);
    };
    const play = (): void => {
      still = resolveMotion(prefs, media?.matches ?? false).motion === 0;
      cancelAnimationFrame(raf);
      if (document.hidden) return;
      if (still) frame(performance.now()); // one composed frame, no loop
      else raf = requestAnimationFrame(tick);
    };
    // A hidden tab burns no frames — the organism sleeps with the player.
    const onVis = (): void => { play(); };
    paintStillRef.current = () => { if (still && !document.hidden) frame(performance.now()); };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(canvas);
    const offPrefs = onMotionPrefs((next) => { prefs = next; play(); });
    media?.addEventListener('change', play);
    play();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      offPrefs();
      media?.removeEventListener('change', play);
      document.removeEventListener('visibilitychange', onVis);
      paintStillRef.current = null;
    };
  }, []);

  useEffect(() => { paintStillRef.current?.(); }, [ws]);

  return (
    <div className={`cc-world is-era${ws.era}`} aria-label="World status">
      <canvas ref={canvasRef} className="cc-world-canvas" aria-hidden />
      <div className="cc-world-head">
        <span className="cc-world-eyebrow">◉ WORLD STATUS</span>
        <span className="cc-world-era">{ws.eraName} ORGANISM</span>
        <span className={`cc-world-ready ${ws.ready ? 'is-go' : ''}`}>{ws.readiness}</span>
      </div>
      <div className="cc-world-foot">Next descent · {ws.frontierBiome}</div>
    </div>
  );
}
