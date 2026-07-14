// STATUS EFFECT VISUALIZATION framework (docs/COMBAT-VISUAL-STANDARDS.md §status).
//
// Every live status on a body — the four legacy fast-field statuses AND the universal
// framework list (core/status.ts) — contributes its authored fx TRAITS (hue, glow, pulse,
// overlay, particle emitters, jitter, distortion). This module MERGES those traits into ONE
// coherent presentation per body instead of stacking independent rings:
//   • hue/glow/tempo BLEND (intensity-weighted) → poison+burn reads as one sick combustion,
//     freeze+shock as frozen arcs — no combination is hand-authored, ever;
//   • overlays dedupe by kind (strongest contributor draws, union intensity);
//   • particle emitters share one BUDGET (quality-scaled), strongest first.
// Intensity scales with stacks/remaining duration, so a heavy application visibly IS heavier.
//
// COSMETIC ONLY — reads the RenderState enemy view, never mutates, all animation is
// time/id-keyed (no per-enemy state, no rng) ⇒ deterministic frames, golden-safe.

import { statusRegistry } from '../core/status';
import type { StatusOverlayKind, StatusParticleKind } from '../core/status';
import type { RenderState } from '../core/game';
import { rgba } from './theme';
import { glowDisc, pulse, ring } from './vfx';

type Ctx = CanvasRenderingContext2D;
type EnemyView = RenderState['enemies'][number];

/** Effect-management tier: 2 = full (small battles + bosses/elites always), 1 = reduced
 *  (busy field: one emitter, simplified overlays), 0 = suppressed (huge-swarm LOD). */
export type StatusFxQuality = 0 | 1 | 2;

export interface MergedStatusFx {
  intensity: number; // soft union of every contribution (0..1) — the "how afflicted" read
  rgb: string; // intensity-weighted blend of every live hue — 'r, g, b'
  glow: number; // blended under-glow strength
  pulseSpeed: number; // blended animation tempo (slow effects genuinely animate slower)
  distortion: number; // body warp amplitude
  jitter: number; // body trembling amplitude (fear/stun/shock)
  overlays: { kind: StatusOverlayKind; rgb: string; k: number }[];
  emitters: { kind: StatusParticleKind; rgb: string; k: number }[];
}

// ── Deterministic helpers (mirrors the renderer's hash01 — render NEVER touches rng) ──
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Numeric hue cache: ~16 status hues total, parsed once each.
const hueCache = new Map<string, [number, number, number]>();
function hueNums(hex: string): [number, number, number] {
  const hit = hueCache.get(hex);
  if (hit) return hit;
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  const out: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  hueCache.set(hex, out);
  return out;
}

interface Contribution { hue: string; glow: number; pulseSpeed: number; overlay: StatusOverlayKind; particles: readonly StatusParticleKind[]; distortion: number; jitter: number; k: number }

function contribute(parts: Contribution[], id: string, k: number): void {
  const d = statusRegistry.get(id);
  if (!d || k <= 0.02) return;
  const fx = d.fx;
  parts.push({ hue: fx.hue, glow: fx.glow, pulseSpeed: fx.pulseSpeed, overlay: fx.overlay, particles: fx.particles, distortion: fx.distortion ?? 0, jitter: fx.jitter ?? 0, k: Math.min(1, k) });
}

/** Merge every live status on `e` into one presentation descriptor (null = nothing active —
 *  the overwhelmingly common body pays only this early-out). */
export function mergeStatusFx(e: EnemyView, quality: StatusFxQuality): MergedStatusFx | null {
  if (quality <= 0) return null;
  const hasLegacy = e.fracture > 0 || e.corrosion > 0 || e.infection > 0 || e.disrupt > 0;
  const list = e.statuses;
  const hasList = list !== undefined && list.length > 0;
  if (!hasLegacy && !hasList) return null;

  const parts: Contribution[] = [];
  // The four legacy fast-field statuses ride the SAME registry traits as the framework list.
  if (e.fracture > 0) contribute(parts, 'fracture', 0.3 + (e.fracture / 6) * 0.7);
  if (e.corrosion > 0) contribute(parts, 'corrosion', 0.4 + Math.min(1, e.corrosion / 3) * 0.6);
  if (e.infection > 0) contribute(parts, 'infection', 0.3 + (e.infection / 8) * 0.7);
  if (e.disrupt > 0) contribute(parts, 'disruption', 0.4 + Math.min(1, e.disrupt / 1.6) * 0.6);
  if (hasList) {
    for (const s of list) {
      if (s.stacks <= 0) continue; // inert refractory marker — nothing to show
      const d = statusRegistry.get(s.id);
      if (!d) continue;
      // Intensity: stacking effects scale with stacks; timed effects FADE as they run out
      // (the visual reads remaining duration); permanent/extended ones sit near full.
      let k: number;
      if (d.stack === 'stack' && d.maxStacks > 1) k = 0.35 + 0.65 * (s.stacks / d.maxStacks);
      else if (s.remaining === Infinity) k = 1;
      else if (d.stack === 'extend') k = Math.max(0.45, Math.min(1, s.remaining / ((d.baseDuration || 1) * 2)));
      else k = Math.max(0.35, Math.min(1, s.remaining / (d.baseDuration || 1)));
      contribute(parts, s.id, k);
    }
  }
  if (parts.length === 0) return null;

  // ── Blend the global channels (intensity-weighted) ──
  let wSum = 0;
  let r = 0; let g = 0; let b = 0;
  let glowU = 1; let intenU = 1; // soft unions: 1 - Π(1 - x)
  let pulseAcc = 0;
  let distortion = 0;
  let jitter = 0;
  for (const p of parts) {
    const [hr, hg, hb] = hueNums(p.hue);
    wSum += p.k;
    r += hr * p.k; g += hg * p.k; b += hb * p.k;
    pulseAcc += p.pulseSpeed * p.k;
    glowU *= 1 - p.glow * p.k;
    intenU *= 1 - p.k * 0.8;
    distortion = Math.max(distortion, p.distortion * p.k);
    jitter = Math.max(jitter, p.jitter * p.k);
  }
  const rgb = `${Math.round(r / wSum)}, ${Math.round(g / wSum)}, ${Math.round(b / wSum)}`;

  // ── Overlays: dedupe by kind — the strongest contributor keeps its own identity hue
  //    (recognizability + testability), intensity is the union of everyone sharing it. ──
  const overlays: MergedStatusFx['overlays'] = [];
  for (const p of parts) {
    const cur = overlays.find((o) => o.kind === p.overlay);
    const pRgb = hueNums(p.hue).join(', ');
    if (!cur) overlays.push({ kind: p.overlay, rgb: pRgb, k: p.k });
    else {
      if (p.k > cur.k) cur.rgb = pRgb;
      cur.k = 1 - (1 - cur.k) * (1 - p.k);
    }
  }

  // ── Particle emitters: dedupe by kind, then BUDGET (strongest first, quality-scaled). ──
  const emitters: MergedStatusFx['emitters'] = [];
  for (const p of parts) {
    for (const kind of p.particles) {
      const cur = emitters.find((o) => o.kind === kind);
      if (!cur) emitters.push({ kind, rgb: hueNums(p.hue).join(', '), k: p.k });
      else cur.k = 1 - (1 - cur.k) * (1 - p.k);
    }
  }
  emitters.sort((a, z) => z.k - a.k);
  emitters.length = Math.min(emitters.length, quality >= 2 ? 3 : 1);

  return {
    intensity: 1 - intenU,
    rgb,
    glow: 1 - glowU,
    pulseSpeed: Math.max(0.4, pulseAcc / wSum),
    distortion,
    jitter,
    overlays,
    emitters,
  };
}

/** How an afflicted body should DIE (docs/COMBAT-VISUAL-STANDARDS.md §deaths): the dominant
 *  status at the moment of death flavors the death reaction — frozen bodies shatter, burning
 *  ones collapse in embers, infested ones burst spores, corroded ones dissolve. */
export type DeathFlavor = 'shatter' | 'embers' | 'spores' | 'dissolve';

export function deathFlavorOf(e: EnemyView): { flavor: DeathFlavor; hue: string } | null {
  const list = e.statuses;
  if (list !== undefined && list.length > 0) {
    let best: { flavor: DeathFlavor; hue: string } | null = null;
    for (const s of list) {
      if (s.stacks <= 0) continue;
      if (s.id === 'freeze') return { flavor: 'shatter', hue: statusRegistry.get('freeze')!.fx.hue };
      if (s.id === 'burn') best = { flavor: 'embers', hue: statusRegistry.get('burn')!.fx.hue };
      else if (!best && s.id === 'poison') best = { flavor: 'spores', hue: statusRegistry.get('poison')!.fx.hue };
    }
    if (best) return best;
  }
  if (e.infection > 0) return { flavor: 'spores', hue: statusRegistry.get('infection')!.fx.hue };
  if (e.corrosion > 0) return { flavor: 'dissolve', hue: statusRegistry.get('corrosion')!.fx.hue };
  return null;
}

/** Control-state body transform: trembling offset (fear/stun/shock) + heat/psionic warp scale.
 *  The renderer wraps the body draw in this — a feared body visibly shakes, a burning one
 *  shimmers. Returns null when the body should draw untouched (the common case). */
export function statusBodyTransform(m: MergedStatusFx, t: number, id: number): { dx: number; dy: number; sx: number; sy: number } | null {
  if (m.jitter <= 0.03 && m.distortion <= 0.03) return null;
  const j = m.jitter * 1.7;
  const warp = m.distortion * 0.05 * Math.sin(t * 9 + id * 0.7);
  return {
    dx: j > 0.05 ? Math.sin(t * 43 + id * 1.7) * j : 0,
    dy: j > 0.05 ? Math.cos(t * 51 + id) * j * 0.7 : 0,
    sx: 1 + warp,
    sy: 1 - warp * 0.7,
  };
}

/** Under-body layer: ONE soft glow disc in the blended hue (all statuses share it). */
export function drawStatusFxUnder(ctx: Ctx, m: MergedStatusFx, x: number, y: number, r: number, t: number, id: number): void {
  if (m.glow <= 0.03) return;
  const breathe = pulse(t * m.pulseSpeed + id, 1, 0.9, 1.1);
  glowDisc(ctx, x, y, r * (1.45 + 0.55 * m.intensity) * breathe, rgba(m.rgb, 0.1 + 0.2 * m.glow));
}

/** Over-body layer: the merged overlays + budgeted particle emitters. */
export function drawStatusFxOver(ctx: Ctx, m: MergedStatusFx, x: number, y: number, r: number, t: number, id: number, quality: StatusFxQuality): void {
  for (const o of m.overlays) drawOverlay(ctx, o.kind, o.rgb, o.k, x, y, r, t, id, m.pulseSpeed);
  const perEmitter = quality >= 2 ? 3 : 2;
  for (let i = 0; i < m.emitters.length; i++) {
    const em = m.emitters[i];
    const n = Math.min(perEmitter, 1 + Math.round(em.k * (perEmitter - 1) + m.intensity));
    drawEmitter(ctx, em.kind, em.rgb, em.k, n, x, y, r, t, id + i * 31);
  }
}

// ── Overlay painters (each ≤ ~12 canvas ops, deterministic) ──────────────────────────────

function drawOverlay(ctx: Ctx, kind: StatusOverlayKind, rgb: string, k: number, x: number, y: number, r: number, t: number, id: number, tempo: number): void {
  switch (kind) {
    case 'rim': {
      // The breathing edge-ring — the classic status read, tempo carrying the effect's speed.
      ring(ctx, x, y, (r + 2.5) * pulse(t * tempo + id, 1, 0.97, 1.05), rgba(rgb, 0.3 + 0.5 * k), 1.4 + k * 1.2);
      break;
    }
    case 'veins': {
      // Infection webbing crawling the silhouette — heavier stacks reach further and thicken.
      ctx.strokeStyle = rgba(rgb, 0.35 + 0.45 * k);
      ctx.lineWidth = 1 + k;
      const veins = k > 0.6 ? 4 : 3;
      for (let i = 0; i < veins; i++) {
        const a = id * 1.3 + (i / veins) * Math.PI * 2 + Math.sin(t * 0.7 + i) * 0.15;
        const reach = r * (0.75 + 0.45 * k);
        const bend = Math.sin(t * 1.6 + i * 2.1 + id) * r * 0.22;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(
          x + Math.cos(a) * reach * 0.55 - Math.sin(a) * bend,
          y + Math.sin(a) * reach * 0.55 + Math.cos(a) * bend,
          x + Math.cos(a) * reach, y + Math.sin(a) * reach,
        );
        ctx.stroke();
      }
      if (k > 0.55) { // heavy infestation: pustule nodes at the vein tips
        ctx.fillStyle = rgba(rgb, 0.75);
        for (let i = 0; i < 2; i++) {
          const a = id * 1.3 + (i / veins) * Math.PI * 2;
          const reach = r * (0.75 + 0.45 * k);
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * reach, y + Math.sin(a) * reach, 1.4 + k, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'casing': {
      // A translucent solid shell (freeze/shield) — the body is visibly ENCASED.
      ctx.beginPath();
      ctx.arc(x, y, r * 1.12, 0, Math.PI * 2);
      ctx.fillStyle = rgba(rgb, 0.12 + 0.16 * k);
      ctx.fill();
      ring(ctx, x, y, r * 1.12, rgba(rgb, 0.4 + 0.4 * k), 1.5);
      // two glinting facet highlights
      ctx.strokeStyle = rgba('255, 255, 255', 0.25 + 0.3 * k);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.85, -2.2, -1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r * 0.6, 0.6, 1.1);
      ctx.stroke();
      break;
    }
    case 'cracks': {
      // Armor damage: fracture lines radiating from the core, deeper as k climbs.
      ctx.strokeStyle = rgba(rgb, 0.45 + 0.4 * k);
      ctx.lineWidth = 1 + k * 0.6;
      const cracks = 3 + Math.round(k * 3);
      for (let i = 0; i < cracks; i++) {
        const a = i * 2.399 + id * 0.7; // golden-angle spread — organic, stable
        const wob = (hash01(id * 13 + i * 7) - 0.5) * 0.5;
        const r1 = r * (0.45 + 0.55 * k);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2);
        ctx.lineTo(x + Math.cos(a + wob) * r1, y + Math.sin(a + wob) * r1);
        ctx.stroke();
      }
      break;
    }
    case 'halo': {
      // Control/buff mark: a dashed orbit ring — unmissable at a glance, tempo-keyed.
      ctx.save();
      ctx.strokeStyle = rgba(rgb, 0.35 + 0.45 * k);
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 6]);
      ctx.lineDashOffset = -((t * 14 * tempo) % 10);
      ctx.beginPath();
      ctx.arc(x, y, r + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);
      break;
    }
  }
}

// ── Particle emitters (deterministic — time/id-keyed cycles, no state, no rng) ────────────

function drawEmitter(ctx: Ctx, kind: StatusParticleKind, rgb: string, k: number, n: number, x: number, y: number, r: number, t: number, id: number): void {
  switch (kind) {
    case 'spores': // drifting biological motes orbiting off the body
      for (let i = 0; i < n; i++) {
        const h = hash01(id * 7 + i * 13);
        const cyc = (t * (0.35 + h * 0.3) + h) % 1;
        const a = h * Math.PI * 2 + t * 0.6;
        const d = r * (0.6 + cyc * 0.9);
        ctx.fillStyle = rgba(rgb, (1 - cyc) * (0.4 + 0.3 * k));
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d - cyc * 4, 1 + h + k * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'droplets': // liquid beading off the shell and falling
      for (let i = 0; i < n; i++) {
        const h = hash01(id * 11 + i * 17);
        const cyc = (t * (0.55 + h * 0.4) + h) % 1;
        const dx = (h - 0.5) * r * 1.5;
        ctx.fillStyle = rgba(rgb, (1 - cyc) * (0.5 + 0.3 * k));
        ctx.beginPath();
        ctx.arc(x + dx, y - r * 0.3 + cyc * (r + 7), 1 + k * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'flames': // licks rising off the body, flicker-keyed
      for (let i = 0; i < n; i++) {
        const h = hash01(id * 5 + i * 19);
        const cyc = (t * (1.1 + h * 0.7) + h) % 1;
        const fx = x + (h - 0.5) * r * 1.2 + Math.sin(t * 7 + i * 2) * 2 * cyc;
        const fy = y - r * 0.4 - cyc * (r * 1.1 + k * 5);
        const sz = (2 + k * 1.5) * (1 - cyc * 0.6);
        ctx.fillStyle = rgba(rgb, (1 - cyc) * (0.5 + 0.35 * k));
        ctx.beginPath();
        ctx.arc(fx, fy, sz, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba('255, 240, 190', (1 - cyc) * 0.4);
        ctx.beginPath();
        ctx.arc(fx, fy - sz * 0.6, sz * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'arcs': { // crackling jagged discharges across the rim (frame-quantized flicker)
      const seed = Math.floor(t * 11);
      ctx.lineWidth = 1.2;
      for (let i = 0; i < Math.min(n, 2); i++) {
        const a0 = hash01(seed * 3 + i * 29 + id) * Math.PI * 2;
        const a1 = a0 + 0.9 + hash01(seed * 7 + i * 31) * 1.3;
        const mx = x + Math.cos((a0 + a1) / 2) * r * (1.15 + hash01(seed + i) * 0.35);
        const my = y + Math.sin((a0 + a1) / 2) * r * (1.15 + hash01(seed * 5 + i) * 0.35);
        ctx.strokeStyle = rgba(rgb, 0.45 + 0.4 * k);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
        ctx.lineTo(mx, my);
        ctx.lineTo(x + Math.cos(a1) * r, y + Math.sin(a1) * r);
        ctx.stroke();
        ctx.strokeStyle = rgba('255, 255, 255', 0.35 * k);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a0) * r * 0.9, y + Math.sin(a0) * r * 0.9);
        ctx.lineTo(mx, my);
        ctx.stroke();
      }
      break;
    }
    case 'crystals': // slow orbiting shards — the freeze/slow identity
      for (let i = 0; i < n; i++) {
        const a = t * 0.5 + (i / n) * Math.PI * 2 + id;
        const d = r * 1.25;
        const cx = x + Math.cos(a) * d;
        const cy = y + Math.sin(a) * d * 0.85;
        const sz = 1.6 + k * 1.2;
        ctx.fillStyle = rgba(rgb, 0.55 + 0.35 * k);
        ctx.beginPath();
        ctx.moveTo(cx, cy - sz);
        ctx.lineTo(cx + sz * 0.7, cy);
        ctx.lineTo(cx, cy + sz);
        ctx.lineTo(cx - sz * 0.7, cy);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'smoke': // curling wisps rising and expanding
      for (let i = 0; i < n; i++) {
        const h = hash01(id * 3 + i * 23);
        const cyc = (t * (0.3 + h * 0.25) + h) % 1;
        ctx.fillStyle = rgba(rgb, (1 - cyc) * (0.18 + 0.15 * k));
        ctx.beginPath();
        ctx.arc(x + (h - 0.5) * r + Math.sin(t * 1.3 + i * 2.2) * 4 * cyc, y - r * 0.6 - cyc * (r * 1.6), 2 + cyc * (3 + k * 2), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'motes': // bright rising sparks (buffs / stun stars)
      for (let i = 0; i < n; i++) {
        const h = hash01(id * 9 + i * 27);
        const cyc = (t * (0.8 + h * 0.5) + h) % 1;
        const a = (1 - cyc) * (0.6 + 0.3 * k);
        ctx.fillStyle = rgba(rgb, a);
        const mx = x + Math.sin(t * 2.2 + i * 2.6 + id) * r * 0.7;
        const my = y - cyc * (r * 1.4 + 6);
        ctx.beginPath();
        ctx.arc(mx, my, 1.2 + k * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba('255, 255, 255', a * 0.6);
        ctx.beginPath();
        ctx.arc(mx, my, 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
  }
}
