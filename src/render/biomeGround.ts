// BIOME GROUND (docs/LIVING-BATTLEFIELD.md §biome ground) — the floor each biome stands on, so a
// single screenshot says WHERE the fight is: frost-fractured slate, lava-seamed basalt, moss-cushioned
// loam, mire pools, ash drifts, chitin plates, synaptic traces, storm-scoured stone, bone fields and
// lightless pits — and the air above it (snow falls, embers rise, spores drift, sparks blink).
//
//   • DATA, NOT CODE. One `BIOME_GROUND` row per biome (palette + ground motif + obstacle rock + air).
//     A biome with no row derives a coherent one from its accent + a stable hash of its id
//     (`groundFor`), so a new biome grows a floor with ZERO code change (CLAUDE.md — scale to 100).
//   • STATIC ⇒ BAKED. The tint + motif paint once into the renderer's floor cache (and, darkened,
//     into the living gutters' periphery bake); obstacles bake into their own layer. A steady frame
//     pays one drawImage each — the old per-cell obstacle strokes are gone, so this is a net saving.
//   • DIM BY LAW. The floor is the stage, not the show: motif ink is dark relief, emissive accents
//     stay ≤ ~0.4 alpha and hair-thin, and density is edge-biased so the central lanes stay calm.
//   • Render-only. The sim never reads any of this ⇒ goldens and replays are untouched.
//   • NEUTRAL (Stage mode) has no row ⇒ the original arena floor, untouched.

import { CELL } from '../core/map';
import { THEME } from './theme';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** The ground relief vocabulary. Each motif is ONE painter below; a biome picks one. */
export type GroundMotif = 'cracks' | 'fissures' | 'moss' | 'puddles' | 'ash' | 'plates' | 'circuits' | 'scars' | 'ribs' | 'voids';
/** How the biome's air moves: drift (wander), fall (snow/rain, `wind` slants it), rise (embers), flicker (sparks). */
export type AirKind = 'drift' | 'fall' | 'rise' | 'flicker';

export interface BiomeGround {
  base: string; // ground tone laid over the arena sky (hex)
  tint: number; // its strength (0..1) — the floor's overall colour read
  motif: GroundMotif;
  density: number; // motif count multiplier
  ink: string; // dark relief (hex)
  glow: string; // emissive / highlight accent of the relief (hex)
  rock: string; // obstacle mass (hex)
  rockEdge: string; // obstacle lit rim (hex)
  rockGlow?: string; // optional emissive seam along an obstacle's foot (lava, synapse light)
  air: { kind: AirKind; color: string; count: number; speed: number; wind?: number; size: number };
}

// ── The biomes (docs/BIOMES.md §3) — tuned so each reads at a glance while the floor stays dim. ──
export const BIOME_GROUND: Readonly<Record<string, BiomeGround>> = {
  verdant: {
    base: '#1f4a14', tint: 0.2, motif: 'moss', density: 1, ink: '#061204', glow: '#a8e050',
    rock: '#141f15', rockEdge: '#7aa85a', air: { kind: 'drift', color: '#c8f08a', count: 24, speed: 4, size: 1.3 },
  },
  necrotic: {
    base: '#3a1a40', tint: 0.2, motif: 'puddles', density: 1, ink: '#0a030c', glow: '#b86ad8',
    rock: '#1a1120', rockEdge: '#946aa6', air: { kind: 'drift', color: '#c98be0', count: 18, speed: 2.5, size: 1.4 },
  },
  frostbound: {
    base: '#1c4460', tint: 0.22, motif: 'cracks', density: 1, ink: '#04101a', glow: '#cdeeff',
    rock: '#15222e', rockEdge: '#b4e0f6', air: { kind: 'fall', color: '#eaf8ff', count: 34, speed: 16, wind: 5, size: 1.3 },
  },
  ashen: {
    base: '#3a2418', tint: 0.2, motif: 'ash', density: 1, ink: '#0a0605', glow: '#ff8a48',
    rock: '#1d1512', rockEdge: '#9a7462', air: { kind: 'rise', color: '#ffa262', count: 24, speed: 14, size: 1.2 },
  },
  carapace: {
    base: '#23204a', tint: 0.2, motif: 'plates', density: 1, ink: '#07061a', glow: '#9aa2ff',
    rock: '#17162b', rockEdge: '#8a92e0', air: { kind: 'drift', color: '#b0b6ff', count: 14, speed: 2, size: 1.2 },
  },
  neural: {
    base: '#3a3010', tint: 0.17, motif: 'circuits', density: 1, ink: '#0c0902', glow: '#ffd24d',
    rock: '#1b180e', rockEdge: '#c4a452', rockGlow: '#ffd24d', air: { kind: 'flicker', color: '#ffe68a', count: 22, speed: 0.6, size: 1.2 },
  },
  molten: {
    base: '#46160c', tint: 0.22, motif: 'fissures', density: 1, ink: '#070201', glow: '#ff6a2a',
    rock: '#1c110f', rockEdge: '#c8603e', rockGlow: '#ff5a1e', air: { kind: 'rise', color: '#ff8040', count: 28, speed: 18, size: 1.3 },
  },
  tempest: {
    base: '#271c4e', tint: 0.2, motif: 'scars', density: 1, ink: '#080616', glow: '#c8a8ff',
    rock: '#18152a', rockEdge: '#a08ce0', air: { kind: 'fall', color: '#d4c2ff', count: 24, speed: 70, wind: 34, size: 1 },
  },
  ossuary: {
    base: '#38342a', tint: 0.2, motif: 'ribs', density: 1, ink: '#0a0907', glow: '#e8dfbc',
    rock: '#211f1a', rockEdge: '#dcd2ae', air: { kind: 'drift', color: '#ece4c4', count: 16, speed: 2, size: 1.3 },
  },
  umbral: {
    base: '#0a0816', tint: 0.3, motif: 'voids', density: 1, ink: '#010004', glow: '#8a6ee0',
    rock: '#110f1e', rockEdge: '#6a58a8', air: { kind: 'drift', color: '#9a86e0', count: 12, speed: 1.6, size: 1.5 },
  },
};

const MOTIFS: readonly GroundMotif[] = ['cracks', 'fissures', 'moss', 'puddles', 'ash', 'plates', 'circuits', 'scars', 'ribs', 'voids'];
const AIRS: readonly AirKind[] = ['drift', 'fall', 'rise', 'flicker'];

function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(f, 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [90, 209, 255];
}
function toHex(c: [number, number, number]): string {
  return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function mixHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a), y = hexToRgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}
function css(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

const derived = new Map<string, BiomeGround>();
/** The ground for a biome: its authored row, else a stable derivation from its accent (hex) + id.
 *  `null` for NEUTRAL — Stage mode keeps the original arena floor. */
export function groundFor(biomeId: string, accentHex: string): BiomeGround | null {
  if (biomeId === 'neutral') return null;
  const row = BIOME_GROUND[biomeId];
  if (row) return row;
  const key = biomeId + '|' + accentHex;
  const hit = derived.get(key);
  if (hit) return hit;
  const h = strHash(biomeId);
  const g: BiomeGround = {
    base: mixHex(accentHex, '#000000', 0.72), tint: 0.18, motif: MOTIFS[h % MOTIFS.length], density: 1,
    ink: mixHex(accentHex, '#000000', 0.94), glow: mixHex(accentHex, '#ffffff', 0.2),
    rock: mixHex(accentHex, '#0b0c12', 0.86), rockEdge: mixHex(accentHex, '#ffffff', 0.15),
    air: { kind: AIRS[(h >>> 4) % AIRS.length], color: mixHex(accentHex, '#ffffff', 0.4), count: 18, speed: 6, size: 1.3 },
  };
  derived.set(key, g);
  return g;
}

// ── Bake-time painters (run once per bake — allocation here is fine; never per frame) ────────────
export interface GroundRect { x0: number; y0: number; x1: number; y1: number }

/** Deterministic bake RNG (mulberry32) — the same biome always grows the same floor. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The ground TONE over the arena sky — slightly stronger toward the warm bottom. */
export function paintGroundTint(g: Ctx, R: GroundRect, spec: BiomeGround): void {
  const grad = g.createLinearGradient(0, R.y0, 0, R.y1);
  grad.addColorStop(0, css(spec.base, spec.tint * 0.7));
  grad.addColorStop(1, css(spec.base, spec.tint));
  g.fillStyle = grad;
  g.fillRect(R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0);
}

type Painter = (g: Ctx, R: GroundRect, s: BiomeGround, r: () => number, n: number, keep: (x: number) => boolean) => void;

function polyline(g: Ctx, pts: number[]): void {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
}
/** A jagged random walk from (x,y) heading `a` — returns flat [x0,y0,x1,y1,…]. */
function walk(r: () => number, x: number, y: number, a: number, segs: number, len: number, jag: number): number[] {
  const pts = [x, y];
  for (let i = 0; i < segs; i++) {
    a += (r() - 0.5) * jag;
    x += Math.cos(a) * len * (0.6 + r() * 0.8);
    y += Math.sin(a) * len * (0.6 + r() * 0.8);
    pts.push(x, y);
  }
  return pts;
}
function strokeTwice(g: Ctx, pts: number[], ink: string, w: number, glint: string, gw: number): void {
  g.lineCap = 'round'; g.lineJoin = 'round';
  polyline(g, pts); g.strokeStyle = ink; g.lineWidth = w; g.stroke();
  g.save(); g.translate(-0.7, -0.7);
  polyline(g, pts); g.strokeStyle = glint; g.lineWidth = gw; g.stroke();
  g.restore();
}
function blob(g: Ctx, r: () => number, x: number, y: number, rad: number, squash: number, verts = 11): void {
  g.beginPath();
  for (let i = 0; i <= verts; i++) {
    const a = (i / verts) * TAU;
    const k = rad * (0.75 + r() * 0.4);
    const px = x + Math.cos(a) * k, py = y + Math.sin(a) * k * squash;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
}

const PAINTERS: Record<GroundMotif, Painter> = {
  // Frostbound — fracture stars in the permafrost (dark crack + a hair of rime light) + rime patches.
  cracks(g, R, s, r, n, keep) {
    for (let i = 0; i < n * 0.7; i++) {
      const x = R.x0 + r() * (R.x1 - R.x0), y = R.y0 + r() * (R.y1 - R.y0);
      if (!keep(x)) continue;
      g.fillStyle = css(s.glow, 0.03 + r() * 0.03);
      blob(g, r, x, y, 18 + r() * 40, 0.6); g.fill();
    }
    for (let i = 0; i < n; i++) {
      const x = R.x0 + r() * (R.x1 - R.x0), y = R.y0 + r() * (R.y1 - R.y0);
      if (!keep(x)) continue;
      const arms = 3 + Math.floor(r() * 3);
      for (let k = 0; k < arms; k++) {
        const pts = walk(r, x, y, r() * TAU, 3 + Math.floor(r() * 4), 7 + r() * 9, 0.9);
        strokeTwice(g, pts, css(s.ink, 0.7), 1.6, css(s.glow, 0.28), 0.9);
        if (r() < 0.5) { // a hairline branch off the arm
          const m = 2 * (1 + Math.floor(r() * (pts.length / 2 - 1)));
          strokeTwice(g, walk(r, pts[m - 2], pts[m - 1], r() * TAU, 2, 6, 0.8), css(s.ink, 0.5), 1, css(s.glow, 0.18), 0.6);
        }
      }
    }
  },
  // Molten — long lava-seamed fissures crossing the basalt (dark split, a soft heat bloom, a hot core).
  fissures(g, R, s, r, n, keep) {
    for (let i = 0; i < n * 3; i++) {
      const x = R.x0 + r() * (R.x1 - R.x0), y = R.y0 + r() * (R.y1 - R.y0);
      if (!keep(x)) continue;
      g.fillStyle = css(s.ink, 0.16 + r() * 0.14);
      blob(g, r, x, y, 10 + r() * 26, 0.55); g.fill();
    }
    for (let i = 0; i < n; i++) {
      const left = r() < 0.5;
      const x = left ? R.x0 - 10 : R.x1 + 10, y = R.y0 + r() * (R.y1 - R.y0);
      const pts = walk(r, x, y, (left ? 0 : Math.PI) + (r() - 0.5) * 0.7, 8 + Math.floor(r() * 8), 18 + r() * 10, 0.75);
      g.lineCap = 'round'; g.lineJoin = 'round';
      polyline(g, pts); g.strokeStyle = css(s.glow, 0.06); g.lineWidth = 9; g.stroke();
      polyline(g, pts); g.strokeStyle = css(s.ink, 0.7); g.lineWidth = 4.5; g.stroke();
      polyline(g, pts); g.strokeStyle = css(s.glow, 0.34); g.lineWidth = 1.3; g.stroke();
      for (let k = 2; k < pts.length; k += 6) { // hot spots where the seam gapes
        if (!keep(pts[k])) continue;
        g.fillStyle = css(s.glow, 0.32);
        g.beginPath(); g.arc(pts[k], pts[k + 1], 1.4 + r() * 1.2, 0, TAU); g.fill();
      }
    }
  },
  // Verdant — moss cushions (dark mound, lighter crown) with a few glowing spore pods.
  moss(g, R, s, r, n, keep) {
    const top = mixHex(s.base, s.glow, 0.35);
    for (let i = 0; i < n * 1.4; i++) {
      const x = R.x0 + r() * (R.x1 - R.x0), y = R.y0 + r() * (R.y1 - R.y0);
      if (!keep(x)) continue;
      const dots = 5 + Math.floor(r() * 5);
      for (let k = 0; k < dots; k++) {
        const dx = (r() - 0.5) * 22, dy = (r() - 0.5) * 12, rr = 2 + r() * 4;
        g.fillStyle = css(s.ink, 0.42);
        g.beginPath(); g.arc(x + dx, y + dy + 1, rr, 0, TAU); g.fill();
        g.fillStyle = css(top, 0.26);
        g.beginPath(); g.arc(x + dx - 0.6, y + dy - 0.6, rr * 0.6, 0, TAU); g.fill();
      }
      if (r() < 0.55) {
        g.fillStyle = css(s.glow, 0.3);
        g.beginPath(); g.arc(x + (r() - 0.5) * 16, y + (r() - 0.5) * 8, 1.1 + r() * 0.8, 0, TAU); g.fill();
      }
    }
  },
  // Necrotic — stagnant mire pools: a dark sunk blob, a faint sheen rim, a couple of dead bubbles.
  puddles(g, R, s, r, n, keep) {
    for (let i = 0; i < n; i++) {
      const x = R.x0 + r() * (R.x1 - R.x0), y = R.y0 + r() * (R.y1 - R.y0);
      if (!keep(x)) continue;
      const rad = 14 + r() * 30;
      g.fillStyle = css(s.ink, 0.5);
      blob(g, r, x, y, rad, 0.58, 13); g.fill();
      g.strokeStyle = css(s.glow, 0.22); g.lineWidth = 1; g.stroke();
      g.strokeStyle = css(s.glow, 0.2); g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(x - rad * 0.2, y - rad * 0.12, rad * 0.45, rad * 0.16, -0.15, Math.PI * 1.1, Math.PI * 1.7); g.stroke();
      for (let k = 0; k < 2; k++) {
        g.strokeStyle = css(s.glow, 0.16); g.lineWidth = 0.8;
        g.beginPath(); g.arc(x + (r() - 0.5) * rad, y + (r() - 0.5) * rad * 0.4, 1.2 + r() * 1.8, 0, TAU); g.stroke();
      }
    }
  },
  // Ashen — wind-laid ash drifts, scorch blots and a scatter of dying embers.
  ash(g, R, s, r, n, keep) {
    const ash = mixHex(s.base, '#8a8480', 0.6);
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = R.x0 + r() * (R.x1 - R.x0), y = R.y0 + r() * (R.y1 - R.y0);
      if (!keep(x)) continue;
      const len = 50 + r() * 120, a = 0.32 + (r() - 0.5) * 0.2;
      g.strokeStyle = css(ash, 0.07 + r() * 0.04); g.lineWidth = 6 + r() * 8;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 - 6, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
    for (let i = 0; i < n * 0.6; i++) {
      const x = R.x0 + r() * (R.x1 - R.x0), y = R.y0 + r() * (R.y1 - R.y0);
      if (!keep(x)) continue;
      g.fillStyle = css(s.ink, 0.32);
      blob(g, r, x, y, 6 + r() * 12, 0.7, 9); g.fill();
    }
    for (let i = 0; i < n * 1.6; i++) {
      const x = R.x0 + r() * (R.x1 - R.x0), y = R.y0 + r() * (R.y1 - R.y0);
      if (!keep(x)) continue;
      g.fillStyle = css(s.glow, 0.22 + r() * 0.25);
      g.beginPath(); g.arc(x, y, 0.7 + r() * 0.9, 0, TAU); g.fill();
    }
  },
  // Carapace — an irregular chitin-plate lattice (gaps, jitter) with a sheen on each plate's lit edge.
  plates(g, R, s, r, n, keep) {
    const size = 30 / Math.sqrt(Math.max(0.3, n / 14));
    const hx = size * 1.5, hy = size * Math.sqrt(3);
    for (let col = Math.floor(R.x0 / hx) - 1; col * hx < R.x1 + hx; col++) {
      for (let row = Math.floor(R.y0 / hy) - 1; row * hy < R.y1 + hy; row++) {
        const cx = col * hx + (r() - 0.5) * 4;
        const cy = row * hy + (col & 1 ? hy / 2 : 0) + (r() - 0.5) * 4;
        if (r() < 0.38 || !keep(cx)) continue;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU, rr = size * (0.86 + r() * 0.1);
          if (k === 0) g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        g.closePath();
        g.fillStyle = css(s.glow, 0.018); g.fill();
        g.strokeStyle = css(s.ink, 0.42); g.lineWidth = 1.6; g.stroke();
        g.strokeStyle = css(s.glow, 0.07); g.lineWidth = 1;
        g.beginPath(); g.moveTo(cx + Math.cos(Math.PI) * size * 0.8, cy); g.lineTo(cx + Math.cos(Math.PI * 4 / 3) * size * 0.8, cy + Math.sin(Math.PI * 4 / 3) * size * 0.8); g.lineTo(cx + Math.cos(Math.PI * 5 / 3) * size * 0.8, cy + Math.sin(Math.PI * 5 / 3) * size * 0.8); g.stroke();
      }
    }
  },
  // Neural — synaptic traces: 45°-bent conduits ending in node pads, a thin gold signal along each.
  circuits(g, R, s, r, n, keep) {
    for (let i = 0; i < n; i++) {
      let x = R.x0 + r() * (R.x1 - R.x0), y = R.y0 + r() * (R.y1 - R.y0);
      if (!keep(x)) continue;
      let dir = Math.floor(r() * 8);
      const pts = [x, y];
      const legs = 2 + Math.floor(r() * 4);
      for (let k = 0; k < legs; k++) {
        const a = (dir / 8) * TAU, len = 18 + r() * 46;
        x += Math.cos(a) * len; y += Math.sin(a) * len;
        pts.push(x, y);
        dir = (dir + (r() < 0.5 ? 1 : 7)) % 8;
      }
      g.lineCap = 'round'; g.lineJoin = 'round';
      polyline(g, pts); g.strokeStyle = css(s.ink, 0.5); g.lineWidth = 3.2; g.stroke();
      polyline(g, pts); g.strokeStyle = css(s.glow, 0.26); g.lineWidth = 0.9; g.stroke();
      for (const k of [0, pts.length - 2]) {
        g.fillStyle = css(s.ink, 0.6);
        g.beginPath(); g.arc(pts[k], pts[k + 1], 3.2, 0, TAU); g.fill();
        g.strokeStyle = css(s.glow, 0.34); g.lineWidth = 1;
        g.beginPath(); g.arc(pts[k], pts[k + 1], 2.4, 0, TAU); g.stroke();
      }
    }
  },
  // Tempest — storm-scoured streaks raked by the gale + forked lightning scars burnt into the stone.
  scars(g, R, s, r, n, keep) {
    g.lineCap = 'round';
    for (let i = 0; i < n * 3; i++) {
      const x = R.x0 + r() * (R.x1 - R.x0), y = R.y0 + r() * (R.y1 - R.y0);
      if (!keep(x)) continue;
      const len = 60 + r() * 160, a = 1.15 + (r() - 0.5) * 0.12;
      g.strokeStyle = css(s.glow, 0.045 + r() * 0.03); g.lineWidth = 1 + r() * 1.4;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
    for (let i = 0; i < n; i++) {
      const x = R.x0 + r() * (R.x1 - R.x0), y = R.y0 + r() * (R.y1 - R.y0);
      if (!keep(x)) continue;
      const pts = walk(r, x, y, Math.PI / 2 + (r() - 0.5) * 1.2, 6 + Math.floor(r() * 5), 9, 1.3);
      strokeTwice(g, pts, css(s.ink, 0.65), 2.2, css(s.glow, 0.3), 0.9);
      const m = 2 * (1 + Math.floor(r() * (pts.length / 2 - 2)));
      strokeTwice(g, walk(r, pts[m], pts[m + 1], r() * TAU, 3, 7, 1.2), css(s.ink, 0.5), 1.4, css(s.glow, 0.14), 0.6);
    }
  },
  // Ossuary — half-buried rib cages (paired arcs) and a scatter of bone shards.
  ribs(g, R, s, r, n, keep) {
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = R.x0 + r() * (R.x1 - R.x0), y = R.y0 + r() * (R.y1 - R.y0);
      if (!keep(x)) continue;
      const a = r() * TAU, ribs = 3 + Math.floor(r() * 3), span = 14 + r() * 12;
      const ux = Math.cos(a), uy = Math.sin(a);
      for (let k = 0; k < ribs; k++) {
        const ox = x + ux * k * 7, oy = y + uy * k * 7;
        const len = span * (1 - Math.abs(k - (ribs - 1) / 2) * 0.18);
        g.beginPath();
        g.moveTo(ox - uy * len, oy + ux * len);
        g.quadraticCurveTo(ox + ux * 6, oy + uy * 6, ox + uy * len, oy - ux * len);
        g.strokeStyle = css(s.ink, 0.38); g.lineWidth = 3.4; g.stroke();
        g.strokeStyle = css(s.glow, 0.2); g.lineWidth = 1.8; g.stroke();
      }
    }
    for (let i = 0; i < n * 2.5; i++) {
      const x = R.x0 + r() * (R.x1 - R.x0), y = R.y0 + r() * (R.y1 - R.y0);
      if (!keep(x)) continue;
      g.fillStyle = css(s.glow, 0.07 + r() * 0.06);
      g.beginPath(); g.ellipse(x, y, 2 + r() * 4, 1 + r() * 1.4, r() * TAU, 0, TAU); g.fill();
    }
  },
  // Umbral — lightless pits: a sunk void, a deeper heart, a faint violet lip and hairline cracks.
  voids(g, R, s, r, n, keep) {
    for (let i = 0; i < n; i++) {
      const x = R.x0 + r() * (R.x1 - R.x0), y = R.y0 + r() * (R.y1 - R.y0);
      if (!keep(x)) continue;
      const rad = 10 + r() * 26;
      for (let k = 0; k < 4; k++) {
        const pts = walk(r, x, y, r() * TAU, 3, rad * 0.45, 0.8);
        polyline(g, pts); g.strokeStyle = css(s.ink, 0.45); g.lineWidth = 1; g.stroke();
      }
      g.fillStyle = css(s.ink, 0.62);
      blob(g, r, x, y, rad, 0.68); g.fill();
      g.strokeStyle = css(s.glow, 0.2); g.lineWidth = 1; g.stroke();
      g.fillStyle = css(s.ink, 0.55);
      g.beginPath(); g.ellipse(x, y + rad * 0.06, rad * 0.45, rad * 0.3, 0, 0, TAU); g.fill();
    }
  },
};

/** Motif counts per board-area (WIDTH×HEIGHT) at density 1. */
const MOTIF_COUNT: Record<GroundMotif, number> = {
  cracks: 20, fissures: 7, moss: 30, puddles: 13, ash: 26, plates: 14, circuits: 17, scars: 9, ribs: 11, voids: 11,
};

/** Paint the biome's ground relief into `R` (board units). `centreX`/`halfW` bias it to the edges so
 *  the central lanes stay calm (a gutter rect sits wholly outside ⇒ always kept). */
export function paintGroundMotif(g: Ctx, R: GroundRect, spec: BiomeGround, seed: number, centreX: number, halfW: number): void {
  const area = Math.max(0, (R.x1 - R.x0) * (R.y1 - R.y0)) / (720 * 960);
  const n = Math.round(MOTIF_COUNT[spec.motif] * spec.density * area);
  if (n <= 0) return;
  const r = rng(seed);
  const keep = (x: number): boolean => r() < 0.4 + 0.6 * Math.min(1, Math.abs(x - centreX) / halfW);
  g.save();
  PAINTERS[spec.motif](g, R, spec, r, n, keep);
  g.restore();
}

/** Stable per-biome bake seed. */
export function groundSeed(biomeId: string): number {
  return strHash(biomeId) ^ 0x9e3779b9;
}

// ── Obstacles — merged biome outcrops (baked) ───────────────────────────────────────────────────
/** Paint the layout's blocked cells as ONE solid outcrop mass per cluster: a contact shadow, the rock
 *  body (no per-cell seams — the old look read as a UI table), a lit rim on outer top/left edges, a
 *  shadowed rim on bottom/right, a few surface nodules, and an optional emissive foot seam. `spec`
 *  null ⇒ the classic chitin palette (NEUTRAL). Works on any ctx (bake or direct, for headless). */
export function paintObstacles(g: Ctx, cells: readonly { x: number; y: number }[], spec: BiomeGround | null): void {
  if (cells.length === 0) return;
  const rock = spec?.rock ?? THEME.obstacle.fill;
  const edge = spec?.rockEdge ?? THEME.obstacle.rim;
  const key = (c: number, r: number): number => c * 1000 + r;
  const set = new Set<number>();
  for (const o of cells) set.add(key(Math.floor(o.x / CELL), Math.floor(o.y / CELL)));
  const has = (c: number, r: number): boolean => set.has(key(c, r));
  // Outer sides only, each a jagged crust line bulging OUTWARD (0.5–4 px, hash-stable; corners exact
  // so neighbours meet). All sides wind clockwise ⇒ one nonzero fill unions them with the cells.
  // side: [ax, ay, bx, by, nx, ny, kind] — kind 0 top, 1 right, 2 bottom, 3 left.
  const sides: number[][] = [];
  for (const o of cells) {
    const c = Math.floor(o.x / CELL), r = Math.floor(o.y / CELL);
    const x0 = c * CELL, y0 = r * CELL, x1 = x0 + CELL, y1 = y0 + CELL;
    if (!has(c, r - 1)) sides.push([x0, y0, x1, y0, 0, -1, 0]);
    if (!has(c + 1, r)) sides.push([x1, y0, x1, y1, 1, 0, 1]);
    if (!has(c, r + 1)) sides.push([x1, y1, x0, y1, 0, 1, 2]);
    if (!has(c - 1, r)) sides.push([x0, y1, x0, y0, -1, 0, 3]);
  }
  const crust = (sd: number[]): number[] => {
    const [ax, ay, bx, by, nx, ny] = sd;
    const pts = [ax, ay];
    for (let i = 1; i < 4; i++) {
      const out = 0.5 + hsh(ax * 3.1 + ay * 7.7 + i * 13.3) * 3.5;
      pts.push(ax + (bx - ax) * (i / 4) + nx * out, ay + (by - ay) * (i / 4) + ny * out);
    }
    pts.push(bx, by);
    return pts;
  };
  const crusts = sides.map(crust);
  const trace = (): void => {
    g.beginPath();
    for (const o of cells) g.rect(o.x - CELL / 2, o.y - CELL / 2, CELL, CELL);
    for (const p of crusts) { g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); }
  };
  g.save();
  // contact shadow — the same silhouette, offset down-right
  g.save(); g.translate(4, 5); trace(); g.fillStyle = 'rgba(0,0,0,0.4)'; g.fill(); g.restore();
  // the rock body — ONE fill (no per-cell seams; the old look read as a UI table)
  trace(); g.fillStyle = rock; g.fill();
  // a soft lit band along every exposed top face
  g.beginPath();
  for (const sd of sides) if (sd[6] === 0) g.rect(sd[0], sd[1], CELL, CELL * 0.35);
  g.fillStyle = css(edge, 0.05); g.fill();
  // surface grain / nodules (hash-keyed per cell ⇒ stable)
  for (const o of cells) {
    for (let i = 0; i < 3; i++) {
      const h1 = hsh(o.x * 7 + o.y * 13 + i * 29), h2 = hsh(o.x * 11 + o.y * 3 + i * 41);
      g.fillStyle = i === 2 ? 'rgba(0,0,0,0.22)' : css(edge, 0.04 + h1 * 0.05);
      g.beginPath();
      g.ellipse(o.x - CELL / 2 + 7 + h1 * (CELL - 14), o.y - CELL / 2 + 7 + h2 * (CELL - 14), 2.5 + h2 * 4, 1.6 + h1 * 2.6, h1 * 3, 0, TAU);
      g.fill();
    }
  }
  // rims along the crust: lit on top/left faces, shadowed on bottom/right — the cluster reads as one mass
  const rim = (kinds: readonly number[], style: string, w: number, dx = 0, dy = 0): void => {
    g.beginPath();
    for (let k = 0; k < sides.length; k++) {
      if (!kinds.includes(sides[k][6])) continue;
      const p = crusts[k];
      g.moveTo(p[0] + dx, p[1] + dy);
      for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] + dx, p[i + 1] + dy);
    }
    g.strokeStyle = style; g.lineWidth = w; g.stroke();
  };
  g.lineCap = 'round'; g.lineJoin = 'round';
  rim([0, 3], css(edge, 0.38), 1.4);
  rim([1, 2], 'rgba(0,0,0,0.55)', 1.8);
  if (spec?.rockGlow) rim([2], css(spec.rockGlow, 0.34), 1.2, 0, 2); // an emissive seam where the outcrop meets the ground
  g.restore();
}

function hsh(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ── The biome's air (per frame — allocation-free) ───────────────────────────────────────────────
const airStyle = new Map<string, string>();
/** Drift the biome's ambient particles over the floor (under the entities). `t` is frozen by the
 *  caller under reduced motion; `lod` halves the count under a big swarm. Zero allocation: one cached
 *  fillStyle per biome, alpha via globalAlpha. */
export function drawBiomeAir(ctx: Ctx, spec: BiomeGround, t: number, lod: boolean, W: number, H: number): void {
  const a = spec.air;
  let style = airStyle.get(a.color);
  if (style === undefined) { style = css(a.color, 1); airStyle.set(a.color, style); }
  const n = lod ? a.count >> 1 : a.count;
  ctx.save();
  ctx.fillStyle = style;
  for (let i = 0; i < n; i++) {
    const h = hsh(i * 11 + 4), h2 = hsh(i * 17 + 2), h3 = hsh(i * 23 + 6);
    let x: number, y: number, alpha: number;
    if (a.kind === 'fall') {
      const sp = a.speed * (0.6 + h * 0.8);
      y = (h3 * H + t * sp) % H;
      x = ((h2 * W + Math.sin(t * 0.7 + i) * 10 + (y / H) * (a.wind ?? 0) * 3) % W + W) % W;
      alpha = 0.1 + 0.1 * h;
    } else if (a.kind === 'rise') {
      const life = (t * a.speed * (0.6 + h * 0.8) / H + h3) % 1; // 0 at the floor → 1 burnt out
      y = H * (1 - life * 0.75) - h3 * 40;
      x = ((h2 * W + Math.sin(t * 1.3 + i * 2.1) * 14) % W + W) % W;
      alpha = (1 - life) * (0.16 + 0.14 * (0.5 + 0.5 * Math.sin(t * 9 + i * 3.7)));
    } else if (a.kind === 'flicker') {
      const ph = t * a.speed + h;
      const cyc = Math.floor(ph);
      const f = ph - cyc;
      x = hsh(i * 31 + cyc * 7.3) * W;
      y = hsh(i * 37 + cyc * 3.1) * H;
      alpha = Math.max(0, Math.sin(f * Math.PI)) ** 3 * 0.32;
    } else {
      const d = (h2 * W + Math.sin(t * (0.15 + h * 0.2) + i) * 30 + t * a.speed * (i % 2 ? 1 : -1)) % W;
      x = d < 0 ? d + W : d;
      y = (h3 * H + t * a.speed * 1.4 * (0.5 + h)) % H;
      alpha = 0.06 + 0.07 * (0.5 + 0.5 * Math.sin(t * (0.4 + h) * 2));
    }
    if (alpha <= 0.004) continue;
    ctx.globalAlpha = alpha;
    const sz = a.size * (0.7 + h * 0.7);
    if (a.kind === 'fall' && (a.wind ?? 0) > 12) { // wind-driven streaks (storm rain), not dots
      ctx.fillRect(x, y, sz * 0.8, sz * 7);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, sz, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}
