// Boss visual distinction (docs/BOSS-DESIGN.md §visual identity). Every framework boss spawns on
// the borrowed 'tyrant' enemy body, so until this module the renderer drew ALL bosses as the same
// red disc — five chassis and thirteen authored palettes collapsed into one look. Here the
// renderer resolves each boss's CHASSIS body plan (five silhouettes) and its OWN def color
// (authored palette, or the chassis family color for procedural spawns), plus a stable per-def
// marking so same-chassis/same-color bosses still read apart. Render-only: the sim never touches
// any of this, so the golden run is untouched by construction.

import { BOSS_DEFS, CHASSIS } from '../core/boss';
import type { BossChassis } from '../core/boss';
import { THEME, hexRgb, rgba } from './theme';
import { drawShape, pulse, ring, spikeCrown, strokeShape } from './vfx';

interface BossLook {
  chassis: BossChassis;
  color: string;
  mark: number; // 0 twin spots · 1 chevrons · 2 clean hide (stable per def)
}

const LOOKS = new Map<string, BossLook>();

/** Resolve (and cache) a boss's visual identity from its def id: authored lookup first, then the
 *  procedural 'proc_<chassis>_<tl>' encoding, then the bruiser fallback. */
function lookOf(defId: string): BossLook {
  let l = LOOKS.get(defId);
  if (l) return l;
  let chassis: BossChassis = 'bruiser';
  const authored = BOSS_DEFS[defId];
  if (authored) chassis = authored.chassis;
  else if (defId.startsWith('proc_')) {
    const c = defId.split('_')[1] as BossChassis;
    if (c in CHASSIS) chassis = c;
  }
  let h = 0;
  for (let i = 0; i < defId.length; i++) h = (h * 31 + defId.charCodeAt(i)) | 0;
  l = { chassis, color: authored?.color ?? CHASSIS[chassis].color, mark: Math.abs(h) % 3 };
  LOOKS.set(defId, l);
  return l;
}

/** The boss's own palette — burrow mounds, limb-buds and crowns tint with it. */
export function bossColorOf(defId: string): string {
  return lookOf(defId).color;
}

const DARK = rgba(hexRgb('#0a0d14'), 0.3); // plate/marking shade over any hide color

// ── Volumetric hide (beauty pass): lighten/darken a def color (memoized — per-def key space)
//    and build a key-lit radial fill. Bosses are ≤3 on field, so per-frame gradients are cheap.
const litCache = new Map<string, string>();
function lit(color: string, f: number): string {
  const key = color + f;
  const hit = litCache.get(key);
  if (hit) return hit;
  const [r, g, b] = hexRgb(color).split(',').map((s) => parseInt(s.trim(), 10));
  const L = (v: number): number => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f));
  const out = `rgb(${L(r)},${L(g)},${L(b)})`;
  litCache.set(key, out);
  return out;
}
/** Key-lit hide fill (up-left highlight → base → deep venous rim). */
function hideGrad(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): CanvasGradient {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.12, x, y, r * 1.18);
  g.addColorStop(0, lit(color, 0.35));
  g.addColorStop(0.55, color);
  g.addColorStop(1, lit(color, -0.42));
  return g;
}

/** Per-def hide markings — the tiebreaker when chassis AND palette collide (e.g. the
 *  Progenitor and the Brood Cyst are both violet swarmlords). */
function drawMarkings(ctx: CanvasRenderingContext2D, mark: number, x: number, y: number, r: number): void {
  if (mark === 0) {
    drawShape(ctx, 'circle', x - r * 0.34, y - r * 0.1, r * 0.14, DARK);
    drawShape(ctx, 'circle', x + r * 0.3, y + r * 0.16, r * 0.11, DARK);
  } else if (mark === 1) {
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      const oy = y - r * 0.28 + i * r * 0.34;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.4, oy);
      ctx.lineTo(x, oy + r * 0.22);
      ctx.lineTo(x + r * 0.4, oy);
      ctx.stroke();
    }
  } // 2 = clean hide
}

/** The five chassis body plans — silhouettes a player tells apart at a glance, all facing
 *  DOWN-LANE (+y, the direction of attack). Fill + rim + gloss handled here; the caller's
 *  shared boss language (glow, dashed ring, phase pips, runtime states) stays outside. */
export function drawBossBody(
  ctx: CanvasRenderingContext2D,
  defId: string,
  x: number,
  y: number,
  r: number,
  t: number,
): void {
  const { chassis, color, mark } = lookOf(defId);
  const rim = THEME.boss.rim;
  switch (chassis) {
    case 'bruiser': {
      // A broad wedge of muscle — hunched shoulders, a jaw that leads the charge.
      ctx.beginPath();
      ctx.moveTo(x - r * 1.16, y - r * 0.22);
      ctx.quadraticCurveTo(x, y - r * 1.02, x + r * 1.16, y - r * 0.22);
      ctx.lineTo(x + r * 0.6, y + r * 0.76);
      ctx.lineTo(x, y + r * 1.06);
      ctx.lineTo(x - r * 0.6, y + r * 0.76);
      ctx.closePath();
      ctx.fillStyle = hideGrad(ctx, x, y, r, color);
      ctx.fill();
      ctx.strokeStyle = rim;
      ctx.lineWidth = 2.25;
      ctx.stroke();
      drawShape(ctx, 'circle', x - r * 0.92, y + r * 0.1, r * 0.3, color); // knuckles
      drawShape(ctx, 'circle', x + r * 0.92, y + r * 0.1, r * 0.3, color);
      drawMarkings(ctx, mark, x, y - r * 0.05, r);
      drawShape(ctx, 'circle', x, y - r * 0.48, r * 0.36, THEME.enemy.gloss);
      break;
    }
    case 'artillery': {
      // A dug-in gun-organism — narrow hull, recoil braces, one dorsal barrel run out
      // down-lane with a visible muzzle charge riding its attack rhythm.
      ctx.strokeStyle = rgba(hexRgb(color), 0.6);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.5, y - r * 0.35);
      ctx.lineTo(x - r * 1.05, y - r * 0.95);
      ctx.moveTo(x + r * 0.5, y - r * 0.35);
      ctx.lineTo(x + r * 1.05, y - r * 0.95);
      ctx.stroke(); // braces first (behind the hull)
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.0);
      ctx.lineTo(x + r * 0.72, y - r * 0.3);
      ctx.lineTo(x + r * 0.52, y + r * 0.72);
      ctx.lineTo(x - r * 0.52, y + r * 0.72);
      ctx.lineTo(x - r * 0.72, y - r * 0.3);
      ctx.closePath();
      ctx.fillStyle = hideGrad(ctx, x, y, r, color);
      ctx.fill();
      ctx.strokeStyle = rim;
      ctx.lineWidth = 2.25;
      ctx.stroke();
      ctx.fillStyle = lit(color, -0.18);
      ctx.fillRect(x - r * 0.15, y + r * 0.3, r * 0.3, r * 0.95); // the barrel
      ctx.strokeStyle = rim;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - r * 0.15, y + r * 0.3, r * 0.3, r * 0.95);
      drawShape(ctx, 'circle', x, y + r * 1.3, r * 0.2 * pulse(t, 3.4, 0.85, 1.3), rgba(hexRgb('#ffb84d'), 0.8)); // muzzle charge
      drawMarkings(ctx, mark, x, y - r * 0.1, r * 0.9);
      drawShape(ctx, 'circle', x, y - r * 0.5, r * 0.3, THEME.enemy.gloss);
      break;
    }
    case 'swarmlord': {
      // A mother-mass — a soft core ringed by fused egg-pods, each breathing on its own beat.
      ring(ctx, x, y, r * 1.06 * pulse(t, 1.8, 0.97, 1.03), rgba(hexRgb(color), 0.35), 1.5); // membrane
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const px = x + Math.cos(a) * r * 0.78;
        const py = y + Math.sin(a) * r * 0.78;
        const pr = r * 0.32 * pulse(t * 2 + i * 1.05, 2.2, 0.88, 1.12);
        drawShape(ctx, 'circle', px, py, pr, color);
        strokeShape(ctx, 'circle', px, py, pr, rim, 1.25);
      }
      ctx.beginPath();
      ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
      ctx.fillStyle = hideGrad(ctx, x, y, r * 0.72, color);
      ctx.fill();
      strokeShape(ctx, 'circle', x, y, r * 0.72, rim, 2.25);
      drawMarkings(ctx, mark, x, y, r * 0.8);
      drawShape(ctx, 'circle', x, y - r * 0.28, r * 0.28, THEME.enemy.gloss);
      break;
    }
    case 'controller': {
      // A hooded bell and one scanning iris — control, not violence; no spikes anywhere.
      ctx.beginPath();
      ctx.arc(x, y + r * 0.18, r * 0.98, Math.PI, Math.PI * 2); // the dome
      ctx.lineTo(x + r * 0.98, y + r * 0.46);
      ctx.quadraticCurveTo(x, y + r * 0.92, x - r * 0.98, y + r * 0.46); // the skirt
      ctx.closePath();
      ctx.fillStyle = hideGrad(ctx, x, y, r, color);
      ctx.fill();
      ctx.strokeStyle = rim;
      ctx.lineWidth = 2.25;
      ctx.stroke();
      const ix = x + Math.sin(t * 1.7) * r * 0.3; // the iris scans the line below
      drawShape(ctx, 'circle', ix, y - r * 0.08, r * 0.27, rgba(hexRgb('#0a0d14'), 0.75));
      drawShape(ctx, 'circle', ix, y - r * 0.08, r * 0.15, rgba(hexRgb('#eef4ff'), 0.95));
      drawMarkings(ctx, mark, x, y + r * 0.42, r * 0.7);
      drawShape(ctx, 'circle', x - r * 0.3, y - r * 0.5, r * 0.24, THEME.enemy.gloss);
      break;
    }
    case 'juggernaut': {
      // A layered plate slab — three welded armor bands and rivets; mass as menace.
      ctx.beginPath();
      ctx.arc(x, y, r * 1.04, 0, Math.PI * 2);
      ctx.fillStyle = hideGrad(ctx, x, y, r * 1.04, color);
      ctx.fill();
      strokeShape(ctx, 'circle', x, y, r * 1.04, rim, 2.5);
      ctx.strokeStyle = DARK;
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const cy = y - r * 0.42 + i * r * 0.42;
        const half = Math.sqrt(Math.max(0, 1 - (cy - y) * (cy - y) / (r * r))) * r * 0.94;
        ctx.beginPath();
        ctx.moveTo(x - half, cy);
        ctx.lineTo(x + half, cy);
        ctx.stroke();
      }
      for (let i = 0; i < 4; i++) {
        drawShape(ctx, 'circle', x - r * 0.55 + i * r * 0.37, y - r * 0.21, 1.8, rgba(hexRgb('#eef4ff'), 0.5)); // rivets
      }
      drawMarkings(ctx, mark, x, y + r * 0.45, r * 0.7);
      drawShape(ctx, 'circle', x, y - r * 0.55, r * 0.3, THEME.enemy.gloss);
      break;
    }
  }
}

/** Chassis-keyed threat crowns — the spinning signature over each body plan. Same vt growth
 *  contract as the generic crown (§phases: every mutation tier grows NEW anatomy). */
export function drawBossCrown(
  ctx: CanvasRenderingContext2D,
  defId: string,
  x: number,
  y: number,
  r: number,
  vt: number,
  t: number,
): void {
  const { chassis, color } = lookOf(defId);
  const c = rgba(hexRgb(color), 0.85);
  switch (chassis) {
    case 'bruiser': // jagged and FAST — an aggression halo
      spikeCrown(ctx, x, y, r * 1.02, r * (0.55 + vt * 0.18), 9 + vt * 3, c, t * 0.95);
      break;
    case 'artillery': // four long stabilizer fins, slow traverse
      spikeCrown(ctx, x, y, r * 1.05, r * (0.72 + vt * 0.2), 4 + vt, c, t * 0.3);
      break;
    case 'swarmlord': // a dense ring of birth-buds
      spikeCrown(ctx, x, y, r * 1.0, r * (0.3 + vt * 0.1), 14 + vt * 4, c, t * 0.5);
      break;
    case 'controller': { // NO spikes — smooth counter-rotating command rings + an orbiting lens
      ring(ctx, x, y, r * (1.18 + vt * 0.08), c, 1.5, [3, 9]);
      ring(ctx, x, y, r * (1.34 + vt * 0.08), rgba(hexRgb(color), 0.45), 1, [2, 12]);
      const a = t * 0.8;
      drawShape(ctx, 'circle', x + Math.cos(a) * r * 1.26, y + Math.sin(a) * r * 1.26, 2.5 + vt, c);
      break;
    }
    case 'juggernaut': // six massive plates, grinding slowly
      spikeCrown(ctx, x, y, r * 1.04, r * (0.5 + vt * 0.15), 6, c, t * 0.22);
      break;
  }
}
