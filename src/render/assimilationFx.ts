// ASSIMILATION SCREEN FX (docs/ASSIMILATION.md §Screen effects) — the post-process veil the master
// state drives. Drawn ONCE per frame over the finished battlefield (after the shake/zoom transform
// is restored), so it reads as the SCREEN itself becoming a living organism as the run assimilates:
// an organic vignette that tightens, a tier-tinted rim glow, drifting spores, a faint biome tint,
// and a slow heartbeat modulating it all. Everything is readability-preserving by construction
// (edge-weighted, low alpha) and cheap (no allocation, a handful of fills).
//
// Pure canvas: takes the derived AssimilationPresentation bundle (never the raw state) so the whole
// game keys off one signal. No sim reads any of this (render-only, docs/GAME_CONSTITUTION.md).

import type { AssimilationPresentation } from '../core/assimilation';

const rgba = (c: [number, number, number], a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

/** Tiny deterministic hash → [0,1) for stable-but-varied spore seeds (no per-frame allocation). */
function h01(i: number, salt: number): number {
  let h = (i * 2654435761 + salt * 40503) >>> 0;
  h ^= h >> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >> 15;
  return (h % 100000) / 100000;
}

const MAX_SPORES = 46;

/** Draw the full-screen assimilation veil. `time` is sim-seconds (drives the drift + heartbeat;
 *  a paused sim holds the frame). `w`/`h` are the logical canvas size. */
export function drawAssimilationFx(
  ctx: CanvasRenderingContext2D,
  p: AssimilationPresentation,
  time: number,
  w: number,
  h: number,
): void {
  if (p.index <= 0.001) return; // Contained baseline: nothing on screen
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

  // 4) Drifting spores — ambient motes rising through the field, density scaled by the index.
  const n = Math.round(p.spore * MAX_SPORES);
  if (n > 0) {
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < n; i++) {
      const speed = 8 + h01(i, 1) * 22;
      const x = (h01(i, 2) * w + Math.sin(time * 0.3 + i) * 14 + w) % w;
      const y = (h * (1 + h01(i, 3)) - ((time * speed) % (h * 1.2)));
      const r = 0.8 + h01(i, 4) * 1.8;
      const tw = 0.35 + 0.35 * Math.sin(time * 1.7 + i * 2.1); // twinkle
      ctx.fillStyle = rgba(p.color, (0.10 + 0.22 * p.index) * Math.max(0, tw));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.restore();
}
