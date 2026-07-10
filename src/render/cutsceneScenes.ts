// CUTSCENE TABLEAUX (docs/CUTSCENES.md §painters) — the procedural set-pieces behind every
// story cutscene. Each painter is a full-screen animated scene `(ctx, w, h, t, theme)` in the
// game's own visual language (no assets), THEMED by the cutscene's palette so the library is
// reusable: a new mega's film is usually pure data over these painters. Deterministic in `t`
// (replays identical), render-only, DPR handled by the caller (ui/CutscenePlayer.tsx).

import type { CutsceneDef, CutscenePainter } from '../core/cutscenes';

type Ctx = CanvasRenderingContext2D;
export interface SceneTheme { body: string; glow: string; accent: string }

const TAU = Math.PI * 2;
const BG = '#030509';

const ease = (k: number): number => {
  const t = Math.min(1, Math.max(0, k));
  return t * t * (3 - 2 * t);
};
/** Deterministic 0..1 hash — stable scatter without RNG state. */
const h01 = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const hex2 = (c: string, i: number): number => parseInt(c.slice(i, i + 2), 16);
const rgba = (hex: string, a: number): string => `rgba(${hex2(hex, 1)},${hex2(hex, 3)},${hex2(hex, 5)},${Math.max(0, Math.min(1, a))})`;

/** Ambient dust — every tableau breathes the same air. */
function motes(ctx: Ctx, w: number, h: number, t: number, color: string, n: number, drift: number): void {
  for (let i = 0; i < n; i++) {
    const x = ((h01(i * 3.7) + t * drift * (0.4 + h01(i * 9.1) * 0.6) * 0.01) % 1 + 1) % 1 * w;
    const y = ((h01(i * 7.3) - t * 0.006 * (0.5 + h01(i * 5.9))) % 1 + 1) % 1 * h;
    ctx.fillStyle = rgba(color, 0.08 + h01(i * 1.3) * 0.16);
    ctx.fillRect(x, y, 1.4, 1.4);
  }
}

function vignette(ctx: Ctx, w: number, h: number, k = 0.8): void {
  const g = ctx.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.28, w / 2, h * 0.46, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(2,4,8,${k})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** A wobbling organic blob path (shared silhouette language with the boss renderer). */
function blob(ctx: Ctx, cx: number, cy: number, r: number, t: number, seed: number, wob = 0.1, points = 26): void {
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * TAU;
    const rr = r * (1 + Math.sin(a * 3 + seed + t * 0.7) * wob + Math.sin(a * 7 - seed * 2 + t * 0.4) * wob * 0.5);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.92;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// ── The painters ──────────────────────────────────────────────────────────────────────────

/** A titan silhouette buckling — limbs shear off, the mass sinks, embers rise. */
function drawBehemoth(ctx: Ctx, w: number, h: number, t: number, th: SceneTheme): void {
  const sink = ease(t / 7) * h * 0.16; // the whole mass settles over ~7s
  const cx = w * 0.52;
  const cy = h * 0.42 + sink;
  // ground haze
  const gz = ctx.createLinearGradient(0, h * 0.62, 0, h);
  gz.addColorStop(0, 'rgba(0,0,0,0)');
  gz.addColorStop(1, rgba(th.body, 0.35));
  ctx.fillStyle = gz;
  ctx.fillRect(0, h * 0.62, w, h * 0.38);
  // the body — three stacked lobes, each listing further as it falls
  for (let i = 0; i < 3; i++) {
    const lean = ease(t / (5 + i)) * (i - 1) * 0.14;
    ctx.save();
    ctx.translate(cx, cy + i * h * 0.11);
    ctx.rotate(lean);
    ctx.fillStyle = rgba(th.body, 0.85 - i * 0.18);
    blob(ctx, 0, 0, h * (0.24 - i * 0.045), t * (0.5 + i * 0.2), i * 4.2, 0.08);
    ctx.fill();
    ctx.restore();
  }
  // shearing plates — fragments drifting off the silhouette
  for (let i = 0; i < 9; i++) {
    const born = i * 0.55;
    const k = ease((t - born) / 4);
    if (k <= 0) continue;
    const a = h01(i * 11.3) * TAU;
    const x = cx + Math.cos(a) * h * (0.2 + k * 0.34);
    const y = cy + Math.sin(a) * h * 0.18 + k * h * 0.22;
    ctx.fillStyle = rgba(th.body, 0.55 * (1 - k));
    blob(ctx, x, y, h * 0.028 * (1 - k * 0.5), t, i * 7.7, 0.2, 10);
    ctx.fill();
  }
  // the dimming eye — the only light on the mass, guttering out
  const eye = Math.max(0, 1 - t / 8) * (0.55 + 0.45 * Math.sin(t * 9) * Math.exp(-t * 0.4));
  ctx.fillStyle = rgba(th.glow, 0.75 * eye);
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.03, cy - h * 0.06, 14 * (0.4 + eye), 7 * (0.4 + eye), 0, 0, TAU);
  ctx.fill();
  // rising embers
  for (let i = 0; i < 26; i++) {
    const k = ((h01(i * 5.1) + t * 0.05) % 1);
    const x = cx + (h01(i * 3.3) - 0.5) * w * 0.5;
    const y = h * 0.75 - k * h * 0.6;
    ctx.fillStyle = rgba(i % 3 === 0 ? th.accent : th.glow, 0.35 * (1 - k));
    ctx.fillRect(x, y, 2, 2);
  }
  motes(ctx, w, h, t, th.glow, 40, 1);
  vignette(ctx, w, h);
}

/** Concentric hunger — a mouth that resolves, ring by ring, into a dug tunnel. */
function drawMaw(ctx: Ctx, w: number, h: number, t: number, th: SceneTheme): void {
  const cx = w / 2;
  const cy = h * 0.46;
  const depth = ease(t / 9); // the camera slowly accepts the tunnel
  for (let i = 13; i >= 0; i--) {
    const ring = ((i / 14) + t * 0.02) % 1;
    const rr = Math.pow(ring, 1.9 - depth * 0.5) * Math.max(w, h) * 0.62 + 3;
    ctx.strokeStyle = rgba(i % 3 === 0 ? th.glow : th.body, (0.12 + ring * 0.4) * (0.5 + depth * 0.5));
    ctx.lineWidth = 1 + ring * 9;
    blob(ctx, cx, cy, rr, t * 0.6, i * 2.9, 0.05, 30);
    ctx.stroke();
  }
  // teeth — inward wedges on the outer rings, softening as the mouth becomes a road
  const teeth = 1 - depth * 0.7;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + t * 0.03;
    const r0 = Math.min(w, h) * 0.46;
    ctx.strokeStyle = rgba(th.accent, 0.3 * teeth);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.92);
    ctx.lineTo(cx + Math.cos(a) * r0 * 0.86, cy + Math.sin(a) * r0 * 0.86 * 0.92);
    ctx.stroke();
  }
  // the far light — not an exit; something at the bottom, faintly pulsing
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.8);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.1);
  g.addColorStop(0, rgba(th.glow, 0.28 * depth * (0.6 + pulse * 0.4)));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  motes(ctx, w, h, t, th.body, 34, 2);
  vignette(ctx, w, h, 0.9);
}

/** Hollow figures in a ring — song as ripples; when the film asks, they still. */
function drawChoir(ctx: Ctx, w: number, h: number, t: number, th: SceneTheme): void {
  const cx = w / 2;
  const cy = h * 0.5;
  const still = ease((t - 2.2) / 2.2); // the choir closes its mouths over the scene
  // song ripples — expanding rings that fade as the silence lands
  for (let i = 0; i < 7; i++) {
    const k = ((i / 7) + t * 0.16) % 1;
    ctx.strokeStyle = rgba(th.glow, 0.3 * (1 - k) * (1 - still));
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, k * w * 0.42, k * w * 0.18, 0, 0, TAU);
    ctx.stroke();
  }
  // the figures — hooded silhouettes in a ring, swaying, then still
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2;
    const rx = w * 0.3;
    const ry = h * 0.24;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    const sway = Math.sin(t * 1.6 + i * 1.7) * 6 * (1 - still);
    const s = h * (0.075 + h01(i * 3.1) * 0.02);
    ctx.fillStyle = rgba(th.body, 0.9);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.5 + sway * 0.3, y + s);
    ctx.quadraticCurveTo(x + sway, y - s * 1.15, x + s * 0.5 + sway * 0.3, y + s);
    ctx.closePath();
    ctx.fill();
    // the open mouth-light, guttering shut
    const open = Math.max(0, (0.5 + 0.5 * Math.sin(t * 2.2 + i)) * (1 - still));
    ctx.fillStyle = rgba(th.accent, 0.65 * open);
    ctx.beginPath();
    ctx.ellipse(x + sway * 0.6, y - s * 0.1, 3.4, 5.5 * (0.3 + open), 0, 0, TAU);
    ctx.fill();
  }
  motes(ctx, w, h, t, th.accent, 30, 1.5);
  vignette(ctx, w, h);
}

/** A procession — small strains walking one way, unhurried, choosing. */
function drawHerd(ctx: Ctx, w: number, h: number, t: number, th: SceneTheme): void {
  // destination glow at frame right — warm, yours
  const dest = ctx.createRadialGradient(w * 1.02, h * 0.5, 0, w * 1.02, h * 0.5, w * 0.5);
  dest.addColorStop(0, rgba(th.accent, 0.22));
  dest.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = dest;
  ctx.fillRect(0, 0, w, h);
  // three depth lanes of walkers
  for (let lane = 0; lane < 3; lane++) {
    const y0 = h * (0.5 + lane * 0.14);
    const scale = 0.55 + lane * 0.3;
    const speed = 0.055 + lane * 0.02;
    for (let i = 0; i < 10; i++) {
      const k = ((h01(i * 6.1 + lane * 31) + t * speed) % 1);
      const x = k * (w * 1.14) - w * 0.07;
      const bob = Math.abs(Math.sin((t * 2.4 + i) * (0.9 + lane * 0.2))) * 3.4 * scale;
      const r = h * 0.026 * scale * (0.8 + h01(i * 2.7 + lane) * 0.5);
      ctx.fillStyle = rgba(th.body, 0.5 + lane * 0.18);
      blob(ctx, x, y0 - bob, r, t * 1.4, i * 5.5 + lane * 17, 0.18, 12);
      ctx.fill();
      // a faint eye looking the way it walks
      ctx.fillStyle = rgba(th.glow, 0.5);
      ctx.fillRect(x + r * 0.45, y0 - bob - r * 0.2, 1.8, 1.8);
    }
  }
  // the empty crook-field they left, frame left — pale verticals
  for (let i = 0; i < 8; i++) {
    const x = w * 0.05 + h01(i * 9.7) * w * 0.22;
    ctx.strokeStyle = rgba(th.accent, 0.12);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, h * 0.42 + h01(i * 3.3) * h * 0.2);
    ctx.lineTo(x, h * 0.86);
    ctx.stroke();
  }
  motes(ctx, w, h, t, th.glow, 36, 2);
  vignette(ctx, w, h, 0.75);
}

/** Black water and a bound moon — the knots slipping, the surface remembering light. */
function drawTide(ctx: Ctx, w: number, h: number, t: number, th: SceneTheme): void {
  const horizon = h * 0.44;
  // the bound moon — ringed by loosening tethers
  const mx = w * 0.62;
  const my = h * 0.2;
  const loose = ease(t / 8);
  ctx.fillStyle = rgba(th.glow, 0.5);
  ctx.beginPath();
  ctx.arc(mx, my, h * 0.055, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    const sag = loose * (18 + i * 9);
    ctx.strokeStyle = rgba(th.accent, 0.4 * (1 - loose * 0.7));
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(mx - h * 0.08, my + i * 4 - 6);
    ctx.quadraticCurveTo(mx, my + sag + i * 6, mx + h * 0.08, my + i * 4 - 6);
    ctx.stroke();
  }
  // the sea — layered sine swells, brightening from below as the memory surfaces
  for (let band = 0; band < 5; band++) {
    const y0 = horizon + band * (h - horizon) * 0.2;
    ctx.fillStyle = band % 2 === 0 ? rgba(th.body, 0.5 + band * 0.1) : rgba(th.body, 0.36 + band * 0.1);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 12) {
      const yy = y0 + Math.sin(x * 0.014 + t * (0.7 + band * 0.22) + band * 2.1) * (5 + band * 3.2);
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    // remembered light — glints riding the crests, growing with `loose`
    for (let i = 0; i < 12; i++) {
      const x = ((h01(i * 7.9 + band * 13) + t * 0.02) % 1) * w;
      const yy = y0 + Math.sin(x * 0.014 + t * (0.7 + band * 0.22) + band * 2.1) * (5 + band * 3.2);
      ctx.fillStyle = rgba(th.glow, 0.4 * loose * (0.4 + h01(i * 1.7) * 0.6));
      ctx.fillRect(x, yy - 1, 3, 1.6);
    }
  }
  // the moon's road on the water
  const g = ctx.createLinearGradient(0, horizon, 0, h);
  g.addColorStop(0, rgba(th.glow, 0.2 * (0.4 + loose * 0.6)));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(mx - w * 0.055, horizon, w * 0.11, h - horizon);
  motes(ctx, w, h, t, th.glow, 24, 1);
  vignette(ctx, w, h, 0.7);
}

/** Offerings raining into a counting pit — the tribute spilling back out. */
function drawTithe(ctx: Ctx, w: number, h: number, t: number, th: SceneTheme): void {
  const cx = w / 2;
  const pitY = h * 0.68;
  const burst = ease((t - 1.6) / 2.5); // the collector fails ~2s in; the flow REVERSES
  // the pit — a shallow ellipse of counting light
  ctx.strokeStyle = rgba(th.accent, 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, pitY, w * 0.23, h * 0.05, 0, 0, TAU);
  ctx.stroke();
  const pg = ctx.createRadialGradient(cx, pitY, 0, cx, pitY, w * 0.22);
  pg.addColorStop(0, rgba(th.glow, 0.2 + burst * 0.15));
  pg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = pg;
  ctx.fillRect(0, 0, w, h);
  // the tribute — motes falling in before the burst, ERUPTING out after
  for (let i = 0; i < 60; i++) {
    const seed = h01(i * 4.9);
    const lane = (seed - 0.5) * w * 0.42;
    if (burst <= 0 || i % 3 === 0) {
      const k = ((seed + t * 0.16) % 1);
      const y = k * pitY;
      ctx.fillStyle = rgba(th.glow, 0.4 * (1 - Math.abs(0.5 - k)));
      ctx.fillRect(cx + lane * (1 - k * 0.3), y, 2.2, 5);
    } else {
      const k = ((seed + t * 0.2) % 1);
      const y = pitY - k * h * 0.62 * burst;
      const spread = lane * (1 + k * 1.6);
      ctx.fillStyle = rgba(i % 5 === 0 ? th.accent : th.glow, 0.5 * (1 - k));
      ctx.fillRect(cx + spread, y, 2.6, 2.6 + k * 4);
    }
  }
  // the broken collector — two halves of a ring, drifting apart
  const drift = burst * w * 0.05;
  ctx.strokeStyle = rgba(th.body, 0.9);
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx - drift, h * 0.34, h * 0.13, Math.PI * 0.55, Math.PI * 1.45);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + drift, h * 0.34, h * 0.13, Math.PI * 1.55, Math.PI * 0.45);
  ctx.stroke();
  motes(ctx, w, h, t, th.accent, 30, 1.5);
  vignette(ctx, w, h);
}

/** The flashback lab — glass columns, instrument lines, one growing thing. */
function drawLab(ctx: Ctx, w: number, h: number, t: number, th: SceneTheme): void {
  // cold room gradient
  const bgg = ctx.createLinearGradient(0, 0, 0, h);
  bgg.addColorStop(0, 'rgba(8,14,20,0.9)');
  bgg.addColorStop(1, 'rgba(3,5,9,1)');
  ctx.fillStyle = bgg;
  ctx.fillRect(0, 0, w, h);
  // glass columns — tall rounded tanks, faintly lit; the CENTER one holds the specimen
  for (let i = 0; i < 5; i++) {
    const x = w * (0.14 + i * 0.18);
    const tw = w * 0.075;
    const y0 = h * 0.2;
    const y1 = h * 0.82;
    const lit = i === 2 ? 0.5 + 0.2 * Math.sin(t * 1.9) : 0.16;
    ctx.strokeStyle = rgba(th.glow, 0.35);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - tw / 2, y0, tw, y1 - y0);
    const fg = ctx.createLinearGradient(0, y0, 0, y1);
    fg.addColorStop(0, rgba(th.glow, 0.05 * lit * 4));
    fg.addColorStop(1, rgba(th.glow, 0.02));
    ctx.fillStyle = fg;
    ctx.fillRect(x - tw / 2, y0, tw, y1 - y0);
    // bubbles
    for (let b = 0; b < 6; b++) {
      const k = ((h01(b * 3.1 + i * 17) + t * (0.05 + h01(b + i) * 0.05)) % 1);
      ctx.fillStyle = rgba(th.glow, 0.25 * lit * 3 * (1 - k));
      ctx.beginPath();
      ctx.arc(x + (h01(b * 7.7 + i) - 0.5) * tw * 0.5, y1 - k * (y1 - y0), 1.6, 0, TAU);
      ctx.fill();
    }
    if (i === 2) {
      // the specimen — a small nucleus, heartbeat-synced (the 1.9s cycle the score rides)
      const beat = Math.pow(Math.max(0, Math.sin((t % 1.9) / 1.9 * Math.PI)), 3);
      ctx.fillStyle = rgba(th.accent, 0.6 + beat * 0.3);
      blob(ctx, x, (y0 + y1) / 2, tw * (0.24 + beat * 0.05), t, 3.3, 0.16, 14);
      ctx.fill();
      ctx.strokeStyle = rgba(th.glow, 0.5);
      ctx.lineWidth = 1;
      for (let v = 0; v < 4; v++) {
        const a = (v / 4) * TAU + t * 0.2;
        ctx.beginPath();
        ctx.moveTo(x, (y0 + y1) / 2);
        ctx.lineTo(x + Math.cos(a) * tw * 0.4, (y0 + y1) / 2 + Math.sin(a) * tw * 0.5);
        ctx.stroke();
      }
    }
  }
  // instrument traces — a scrolling vitals line along the foot
  ctx.strokeStyle = rgba(th.accent, 0.4);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 4) {
    const ph = (x * 0.05 - t * 3.2);
    const spike = Math.max(0, Math.sin(ph)) ** 8;
    ctx.lineTo(x, h * 0.9 - spike * 16 - Math.sin(x * 0.02 + t) * 2);
  }
  ctx.stroke();
  motes(ctx, w, h, t, th.glow, 20, 0.6);
  vignette(ctx, w, h, 0.65);
}

/** Glyph rings contracting toward zero — the countdown made visible. */
function drawCountdown(ctx: Ctx, w: number, h: number, t: number, th: SceneTheme): void {
  const cx = w / 2;
  const cy = h * 0.48;
  for (let i = 0; i < 6; i++) {
    const k = 1 - ((t * 0.055 + i / 6) % 1); // rings CONTRACT
    const r = k * Math.min(w, h) * 0.52 + 8;
    ctx.strokeStyle = rgba(i % 2 === 0 ? th.glow : th.accent, 0.16 + (1 - k) * 0.4);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([Math.max(2, r * 0.09), r * 0.055]);
    ctx.lineDashOffset = t * (i % 2 === 0 ? 14 : -11);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.92, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // tally strokes orbiting — the counting itself
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU + t * 0.12;
    const rr = Math.min(w, h) * (0.3 + (i % 3) * 0.055);
    const on = h01(i * 3.7) > ((t * 0.08 + i * 0.04) % 1) ? 1 : 0.25;
    ctx.strokeStyle = rgba(th.accent, 0.4 * on);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92);
    ctx.lineTo(cx + Math.cos(a) * (rr + 9), cy + Math.sin(a) * (rr + 9) * 0.92);
    ctx.stroke();
  }
  // the zero at the center — a slow strobe deepening with time
  const z = 0.35 + 0.3 * Math.sin(t * 1.1);
  ctx.strokeStyle = rgba(th.glow, z);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 15, 20, 0, 0, TAU);
  ctx.stroke();
  motes(ctx, w, h, t, th.glow, 30, 1);
  vignette(ctx, w, h, 0.85);
}

/** The shed body drifting away from the brighter new one. */
function drawMolt(ctx: Ctx, w: number, h: number, t: number, th: SceneTheme): void {
  const drift = ease(t / 9);
  const oldX = w * (0.5 + drift * 0.24);
  const oldY = h * (0.46 + drift * 0.1);
  const newX = w * (0.5 - drift * 0.1);
  const newY = h * 0.48;
  // the husk — hollow outline, slowly rotating away, flaking
  ctx.save();
  ctx.translate(oldX, oldY);
  ctx.rotate(drift * 0.5);
  ctx.strokeStyle = rgba(th.body, 0.7 * (1 - drift * 0.5));
  ctx.lineWidth = 2;
  blob(ctx, 0, 0, h * 0.13, 0.0, 5.1, 0.12); // frozen wobble — it no longer breathes
  ctx.stroke();
  ctx.restore();
  for (let i = 0; i < 12; i++) {
    const k = ((h01(i * 8.3) + t * 0.05) % 1);
    ctx.fillStyle = rgba(th.body, 0.4 * (1 - k));
    ctx.fillRect(oldX + (h01(i * 2.9) - 0.5) * h * 0.24 + k * 30, oldY + (h01(i * 6.1) - 0.5) * h * 0.24 + k * 44, 2.4, 2.4);
  }
  // the new body — smaller, denser, breathing on the heartbeat cycle
  const beat = Math.pow(Math.max(0, Math.sin((t % 1.9) / 1.9 * Math.PI)), 3);
  const glow = ctx.createRadialGradient(newX, newY, 0, newX, newY, h * 0.22);
  glow.addColorStop(0, rgba(th.glow, 0.22 + beat * 0.12));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = rgba(th.glow, 0.8);
  blob(ctx, newX, newY, h * (0.085 + beat * 0.008), t, 2.2, 0.14);
  ctx.fill();
  ctx.fillStyle = rgba(th.accent, 0.65 + beat * 0.3);
  blob(ctx, newX, newY, h * 0.032, t * 1.3, 7.7, 0.2, 12);
  ctx.fill();
  // a thin umbilical of light between them, thinning to nothing
  ctx.strokeStyle = rgba(th.accent, 0.5 * (1 - drift));
  ctx.lineWidth = Math.max(0.5, 3 * (1 - drift));
  ctx.beginPath();
  ctx.moveTo(newX, newY);
  ctx.quadraticCurveTo((newX + oldX) / 2, Math.min(newY, oldY) - 30 * (1 - drift), oldX, oldY);
  ctx.stroke();
  motes(ctx, w, h, t, th.glow, 34, 0.8);
  vignette(ctx, w, h, 0.75);
}

/** Strata falling past the camera — the pressure of depth. */
function drawDeep(ctx: Ctx, w: number, h: number, t: number, th: SceneTheme): void {
  // rising strata bands = the camera sinking
  for (let i = 0; i < 9; i++) {
    const k = ((i / 9) + t * 0.03) % 1;
    const y = k * h * 1.3 - h * 0.15;
    const thick = 8 + h01(i * 5.3) * 26;
    ctx.fillStyle = rgba(th.body, 0.16 + h01(i * 2.1) * 0.2);
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 24) ctx.lineTo(x, y + Math.sin(x * 0.01 + i * 3.1) * 10);
    ctx.lineTo(w, y + thick);
    for (let x = w; x >= 0; x -= 24) ctx.lineTo(x, y + thick + Math.sin(x * 0.012 + i * 1.7) * 10);
    ctx.closePath();
    ctx.fill();
  }
  // sparse quiet drifters — the returning ones, sinking WITH you
  for (let i = 0; i < 10; i++) {
    const k = ((h01(i * 9.1) + t * 0.014) % 1);
    const x = h01(i * 3.9) * w;
    const y = k * h;
    ctx.fillStyle = rgba(th.glow, 0.4 * Math.sin(k * Math.PI));
    blob(ctx, x, y, 5 + h01(i * 6.3) * 6, t, i * 4.4, 0.2, 10);
    ctx.fill();
  }
  // depth shafts of light from above, failing
  for (let i = 0; i < 4; i++) {
    const x = w * (0.16 + i * 0.22);
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.7);
    g.addColorStop(0, rgba(th.glow, 0.08 * (1 - t / 30)));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 14, 0);
    ctx.lineTo(x + 14, 0);
    ctx.lineTo(x + 42, h * 0.7);
    ctx.lineTo(x - 42, h * 0.7);
    ctx.closePath();
    ctx.fill();
  }
  motes(ctx, w, h, t, th.glow, 46, 0.5);
  vignette(ctx, w, h, 0.9);
}

/** One genome diverging into two — the kinship reveal (a helix that splits). */
function drawVeinsplit(ctx: Ctx, w: number, h: number, t: number, th: SceneTheme): void {
  const cx = w / 2;
  const split = ease((t - 2.5) / 4); // the strand tears apart mid-scene
  const amp = h * 0.05;
  for (let strand = 0; strand < 2; strand++) {
    const dir = strand === 0 ? -1 : 1;
    const off = dir * split * w * 0.16;
    const color = strand === 0 ? th.glow : th.accent;
    ctx.strokeStyle = rgba(color, 0.75);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let y = 0; y <= h; y += 6) {
      const ph = y * 0.02 + t * 1.1 + strand * Math.PI;
      const x = cx + off * Math.min(1, y / (h * 0.4)) + Math.sin(ph) * amp;
      if (y === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // rungs — connecting while joined, SNAPPING where the split has reached
  for (let y = 0; y <= h; y += 26) {
    const ph = y * 0.02 + t * 1.1;
    const reach = Math.min(1, y / (h * 0.4)) * split;
    const x1 = cx - reach * w * 0.16 + Math.sin(ph) * amp;
    const x2 = cx + reach * w * 0.16 + Math.sin(ph + Math.PI) * amp;
    const broken = reach > 0.35;
    ctx.strokeStyle = rgba(th.body, broken ? 0.25 : 0.6);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (broken) {
      ctx.moveTo(x1, y);
      ctx.lineTo(x1 + (x2 - x1) * 0.32, y + 3);
      ctx.moveTo(x2, y);
      ctx.lineTo(x2 - (x2 - x1) * 0.32, y - 3);
    } else {
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
    }
    ctx.stroke();
  }
  // two nuclei forming at the diverged ends — the same light in both
  if (split > 0.55) {
    const a = (split - 0.55) / 0.45;
    for (const dir of [-1, 1]) {
      const x = cx + dir * w * 0.16;
      ctx.fillStyle = rgba(dir < 0 ? th.glow : th.accent, 0.6 * a);
      blob(ctx, x, h * 0.78, h * 0.045 * a, t, dir * 3.3, 0.16, 12);
      ctx.fill();
    }
  }
  motes(ctx, w, h, t, th.glow, 28, 0.9);
  vignette(ctx, w, h, 0.8);
}

/** The vast thing below — a horizon-wide root mass, one slow regard. */
function drawRoot(ctx: Ctx, w: number, h: number, t: number, th: SceneTheme): void {
  const topY = h * 0.58;
  // the mass — a dark landmass of overlapping lobes across the whole frame
  for (let i = 0; i < 8; i++) {
    const x = w * (i / 7);
    const r = h * (0.18 + h01(i * 4.1) * 0.1);
    ctx.fillStyle = rgba(th.body, 0.8);
    blob(ctx, x, topY + r * 0.8, r, t * 0.3, i * 6.6, 0.06);
    ctx.fill();
  }
  ctx.fillStyle = rgba(th.body, 0.95);
  ctx.fillRect(0, topY + h * 0.14, w, h);
  // root filaments reaching UP from the mass — patient, testing
  for (let i = 0; i < 14; i++) {
    const x0 = h01(i * 5.9) * w;
    const reach = h * (0.1 + h01(i * 3.3) * 0.16) * (0.75 + 0.25 * Math.sin(t * 0.5 + i));
    ctx.strokeStyle = rgba(th.glow, 0.22);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x0, topY + h * 0.1);
    ctx.quadraticCurveTo(x0 + Math.sin(t * 0.4 + i * 2) * 26, topY - reach * 0.5, x0 + Math.sin(t * 0.3 + i) * 40, topY - reach);
    ctx.stroke();
  }
  // the regard — one vast eye-light opening a sliver along the mass, on a slow cycle
  const gaze = Math.pow(Math.max(0, Math.sin(t * 0.32)), 6);
  if (gaze > 0.01) {
    const gx = w * 0.5;
    const gy = topY + h * 0.1;
    const gw = w * 0.3 * (0.5 + gaze * 0.5);
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gw);
    g.addColorStop(0, rgba(th.glow, 0.5 * gaze));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(gx, gy, gw, gw * 0.16, 0, 0, TAU);
    ctx.fill();
  }
  // pressure ripples in the dark above it
  for (let i = 0; i < 4; i++) {
    const k = ((i / 4) + t * 0.05) % 1;
    ctx.strokeStyle = rgba(th.accent, 0.1 * (1 - k));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(w / 2, topY + h * 0.08, k * w * 0.5, k * h * 0.12, 0, Math.PI, TAU);
    ctx.stroke();
  }
  motes(ctx, w, h, t, th.accent, 40, 0.5);
  vignette(ctx, w, h, 0.9);
}

// ── The projector surface (mirrors introScenes' frame contract) ───────────────────────────

export const CUTSCENE_PAINTERS: Record<CutscenePainter, (ctx: Ctx, w: number, h: number, t: number, th: SceneTheme) => void> = {
  behemoth: drawBehemoth,
  maw: drawMaw,
  choir: drawChoir,
  herd: drawHerd,
  tide: drawTide,
  tithe: drawTithe,
  lab: drawLab,
  countdown: drawCountdown,
  molt: drawMolt,
  deep: drawDeep,
  veinsplit: drawVeinsplit,
  root: drawRoot,
};

/** Slow per-painter camera drift (the intro's Ken Burns language). */
const DRIFT: Record<CutscenePainter, { zoom: number; dx: number; dy: number }> = {
  behemoth: { zoom: 0.05, dx: 0, dy: 0.012 },
  maw: { zoom: 0.07, dx: 0, dy: 0 },
  choir: { zoom: 0.04, dx: 0.008, dy: 0 },
  herd: { zoom: 0.03, dx: 0.018, dy: 0 },
  tide: { zoom: 0.035, dx: -0.01, dy: 0.004 },
  tithe: { zoom: 0.045, dx: 0, dy: 0.008 },
  lab: { zoom: 0.05, dx: 0.006, dy: 0 },
  countdown: { zoom: 0.06, dx: 0, dy: 0 },
  molt: { zoom: 0.04, dx: -0.012, dy: 0 },
  deep: { zoom: 0.03, dx: 0, dy: -0.02 },
  veinsplit: { zoom: 0.05, dx: 0, dy: 0.006 },
  root: { zoom: 0.055, dx: 0, dy: 0.01 },
};

const easeK = (k: number): number => ease(Math.min(1, k));

function applyDrift(ctx: Ctx, w: number, h: number, p: CutscenePainter, t: number): void {
  const d = DRIFT[p];
  const k = Math.min(1, t / 9);
  const z = 1 + d.zoom * easeK(k);
  ctx.translate(w / 2 + d.dx * w * k, h / 2 + d.dy * h * k);
  ctx.scale(z, z);
  ctx.translate(-w / 2, -h / 2);
}

export interface CutsceneFrameSpec {
  painter: CutscenePainter;
  t: number;
  theme: SceneTheme;
  prev: { painter: CutscenePainter; t: number } | null;
  fade: number; // 0..1 dissolve from prev
}

/** Paint one film frame: the current tableau under its drift, cross-dissolving from the
 *  previous one (the intro's cut language, themed). Opaque — fills the canvas each call. */
export function drawCutsceneFrame(ctx: Ctx, w: number, h: number, s: CutsceneFrameSpec): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  if (s.prev && s.fade < 1) {
    ctx.save();
    applyDrift(ctx, w, h, s.prev.painter, s.prev.t);
    CUTSCENE_PAINTERS[s.prev.painter](ctx, w, h, s.prev.t, s.theme);
    ctx.restore();
    ctx.fillStyle = `rgba(3,5,9,${ease(s.fade)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = ease(s.fade);
  }
  ctx.save();
  applyDrift(ctx, w, h, s.painter, s.t);
  CUTSCENE_PAINTERS[s.painter](ctx, w, h, s.t, s.theme);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** The hand-picked beauty frame per painter — reduced-motion stills + Archive thumbnails. */
export const CUTSCENE_REDUCED_T: Record<CutscenePainter, number> = {
  behemoth: 4.2, maw: 5.5, choir: 3.4, herd: 4.0, tide: 5.2, tithe: 3.6,
  lab: 2.4, countdown: 4.4, molt: 5.8, deep: 4.6, veinsplit: 6.2, root: 3.2,
};

/** One still of a cutscene's OPENING tableau — the Memory Archive's card art. */
export function drawCutsceneStill(ctx: Ctx, w: number, h: number, def: CutsceneDef): void {
  const p = def.scenes[0].painter;
  drawCutsceneFrame(ctx, w, h, { painter: p, t: CUTSCENE_REDUCED_T[p], theme: def.palette, prev: null, fade: 1 });
}
