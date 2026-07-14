// ASSIMILATION SCREEN FX (docs/ASSIMILATION.md §Presentation) — the post-process veil the master
// state drives. Drawn ONCE per frame over the finished battlefield (after the shake/zoom transform
// is restored), so it reads as the SCREEN itself becoming a living organism as the run assimilates:
// an organic vignette that tightens, a tier-tinted rim glow, drifting spores, membrane veins that
// surface at high tiers, a faint biome tint, all modulated by a slow cardiac envelope — and, at the
// instant the run crosses into a new evolution tier, a brief ASCENSION flourish (bloom + expanding
// ring + the tier's name). Everything is readability-preserving by construction (edge-weighted, low
// alpha) and cheap (no allocation, a handful of fills).
//
// Pure canvas: takes the derived AssimilationPresentation bundle (never the raw state) so the whole
// game keys off one signal. No sim reads any of this (render-only, docs/GAME_CONSTITUTION.md).

import type { AssimilationPresentation } from '../core/assimilation';

const rgba = (c: [number, number, number], a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

/** Tiny deterministic hash → [0,1) for stable-but-varied seeds (no per-frame allocation). */
function h01(i: number, salt: number): number {
  let h = (i * 2654435761 + salt * 40503) >>> 0;
  h ^= h >> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >> 15;
  return (h % 100000) / 100000;
}

const MAX_SPORES = 46;
const MAX_VEINS = 6;

/** Draw the full-screen assimilation veil. `time` is sim-seconds (drives the drift + heartbeat;
 *  a paused sim holds the frame). `w`/`h` are the logical canvas size. */
export function drawAssimilationFx(
  ctx: CanvasRenderingContext2D,
  p: AssimilationPresentation,
  time: number,
  w: number,
  h: number,
): void {
  if (p.index <= 0.001 && p.ascensionPulse <= 0.001) return; // Contained baseline: nothing on screen
  // Slow heartbeat: two-beat cardiac envelope (lub-dub) scaled to the tier's rate, gently
  // modulating the veil so the screen "breathes" without ever pulsing distractingly.
  const beat = 0.85 + 0.15 * Math.sin(time * p.cameraHz * Math.PI * 2);

  ctx.save();

  // 1) Faint biome tint — the whole world shifts toward the tier's hue (soft-light keeps it readable).
  if (p.saturation > 0.002) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = rgba(p.color, p.saturation * beat);
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }

  // 2) Organic vignette — edge darkening tinted toward the tier color; tightens with the index.
  const vg = ctx.createRadialGradient(w / 2, h * 0.5, h * (0.62 - 0.14 * p.index), w / 2, h * 0.5, h * 0.9);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(0.72, rgba([p.color[0] >> 2, p.color[1] >> 2, p.color[2] >> 2], p.vignette * 0.35 * beat));
  vg.addColorStop(1, rgba([Math.min(20, p.color[0] >> 3), Math.min(20, p.color[1] >> 3), Math.min(24, p.color[2] >> 3)], p.vignette * beat));
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // 3) Tier-tinted rim glow — a luminous band hugging the edges (screen blend = additive-ish light).
  if (p.glow > 0.002) {
    ctx.globalCompositeOperation = 'screen';
    const rg = ctx.createRadialGradient(w / 2, h * 0.5, h * 0.5, w / 2, h * 0.5, h * 0.92);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, rgba(p.color, p.glow * beat));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }

  // 4) Membrane veins — at high tiers the screen edges grow living tissue: a few sinuous, drifting
  // low-alpha strands rooted off-screen and reaching inward. Edge-weighted so the play area stays
  // clear; a true no-op below ~Dominance (p.vein ramps in there).
  const veinN = Math.round(p.vein * MAX_VEINS);
  if (veinN > 0) {
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    for (let i = 0; i < veinN; i++) {
      const edge = i % 2; // alternate left/right roots
      const rootX = edge === 0 ? -w * 0.04 : w * 1.04;
      const rootY = h * (0.12 + 0.76 * h01(i, 5));
      const sway = Math.sin(time * 0.4 + i * 1.7) * h * 0.05;
      const reach = w * (0.16 + 0.14 * h01(i, 6)) * (edge === 0 ? 1 : -1);
      const midX = rootX + reach;
      const midY = rootY + sway;
      const tipX = rootX + reach * 1.7;
      const tipY = rootY - sway * 0.6;
      const a = (0.05 + 0.06 * h01(i, 7)) * p.vein * beat;
      ctx.strokeStyle = rgba(p.color, a);
      ctx.lineWidth = 1 + 2.5 * h01(i, 8);
      ctx.beginPath();
      ctx.moveTo(rootX, rootY);
      ctx.quadraticCurveTo(midX, midY, tipX, tipY);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // 5) Drifting spores — ambient motes rising through the field, density scaled by the index; a few
  // brighter "cells" appear at higher tiers for depth.
  const n = Math.round(p.spore * MAX_SPORES);
  if (n > 0) {
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < n; i++) {
      const speed = 8 + h01(i, 1) * 22;
      const x = (h01(i, 2) * w + Math.sin(time * 0.3 + i) * 14 + w) % w;
      const y = (h * (1 + h01(i, 3)) - ((time * speed) % (h * 1.2)));
      const cell = h01(i, 9) < 0.18 * p.index; // a minority bloom into larger, brighter cells
      const r = (0.8 + h01(i, 4) * 1.8) * (cell ? 2.4 : 1);
      const tw = 0.35 + 0.35 * Math.sin(time * 1.7 + i * 2.1); // twinkle
      ctx.fillStyle = rgba(p.color, (0.10 + 0.22 * p.index) * (cell ? 0.7 : 1) * Math.max(0, tw));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // 6) ASCENSION flourish — the payoff for the hidden heartbeat. The instant the run crosses into a
  // higher tier the pulse is 1 and decays; the whole screen blooms in the new tier's color, a ring
  // expands from center, and the tier's NAME rises and fades. Brief, earned, unmistakable.
  if (p.ascensionPulse > 0.001) {
    const a = p.ascensionPulse; // 1 → 0
    const rise = 1 - a; // 0 → 1 progress through the flourish
    const cx = w / 2;
    const cy = h * 0.5;

    ctx.globalCompositeOperation = 'screen';
    // full-screen bloom, strongest at the crossing then fading
    ctx.fillStyle = rgba(p.color, 0.16 * a * a);
    ctx.fillRect(0, 0, w, h);
    // expanding shock ring in the tier color
    const rad = h * (0.1 + 0.52 * rise);
    ctx.lineWidth = Math.max(1, 7 * a);
    ctx.strokeStyle = rgba(p.color, 0.55 * a);
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
    // a tighter white core ring for punch
    ctx.lineWidth = Math.max(1, 2.5 * a);
    ctx.strokeStyle = rgba([255, 255, 255], 0.3 * a);
    ctx.beginPath();
    ctx.arc(cx, cy, rad * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    // Tier name — rises slightly and fades. Glow keeps it legible over any battlefield. letterSpacing
    // is newer than some TS DOM libs, so reach it through a cast (silent no-op if a runtime lacks it).
    const ls = ctx as unknown as { letterSpacing: string };
    const textA = Math.min(1, a * 1.5);
    const ty = cy - h * 0.03 - rise * h * 0.045;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ls.letterSpacing = '2px';
    ctx.font = "700 12px 'Exo 2', system-ui, sans-serif";
    ctx.fillStyle = rgba([230, 236, 240], 0.7 * textA);
    ctx.fillText('EVOLUTION TIER ' + p.ascendedTier, cx, ty - 26);
    ls.letterSpacing = '4px';
    ctx.font = "800 34px 'Chakra Petch', 'Exo 2', system-ui, sans-serif";
    ctx.shadowColor = rgba(p.color, 0.9 * textA);
    ctx.shadowBlur = 26 * a;
    ctx.fillStyle = rgba([245, 248, 250], textA);
    ctx.fillText('▲ ' + p.ascendedName.toUpperCase(), cx, ty);
    ctx.shadowBlur = 0;
    ls.letterSpacing = '0px';
  }

  ctx.restore();
}
