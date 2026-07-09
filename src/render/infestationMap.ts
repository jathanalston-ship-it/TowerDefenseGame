// INFESTATION TERRITORY MAP (docs/INFESTATION.md §map) — the living hive-map canvas.
// Four REGIONS laid out as organic lobes, each holding four SECTOR cells. A cell's
// creeping infestation fills its blob (accent-tinted, veined) proportional to its LIVE
// level; the pinned target pulses, the next feed destination wears a reticle, saturated
// cells glow, and an entrenched region breathes an overdrive aura. Everything is
// deterministic (hash-seeded organic geometry, cached per canvas size) and animated only
// by time — a frame pays for motion, not layout. Render-only; the board component drives
// it from meta.infestationView() and overlays a11y buttons using the shared layout.

import { hexRgb, rgba } from './theme';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

const h01 = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** One sector cell's placed geometry (region-relative resolved to canvas px). */
export interface CellLayout {
  sectorId: string;
  regionId: string;
  cx: number;
  cy: number;
  r: number; // blob radius
  seed: number; // stable organic-shape seed
}

export interface MapLayout {
  cells: CellLayout[];
  regions: { id: string; cx: number; cy: number; rx: number; ry: number; label: { x: number; y: number } }[];
  w: number;
  h: number;
}

// The map reads as a 2×2 arrangement of region lobes (pushed toward the corners so the four
// never collide), each region's four sectors in a small diamond around the lobe center.
// Fractions are of the canvas, so it scales cleanly; the constants keep cell circles
// non-overlapping and ≥ a tappable size (guarded by the layout test).
const REGION_CENTERS = [
  { fx: 0.28, fy: 0.28 }, { fx: 0.72, fy: 0.28 },
  { fx: 0.28, fy: 0.72 }, { fx: 0.72, fy: 0.72 },
];
const SECTOR_OFFSETS = [
  { dx: 0, dy: -0.62 }, { dx: 0.62, dy: 0.05 },
  { dx: -0.02, dy: 0.62 }, { dx: -0.62, dy: -0.02 },
];

/** Resolve the deterministic layout for a canvas size + the ordered regions/sectors.
 *  `regionIds` and `sectorIdsByRegion` come from the caller (core REGIONS order). */
export function infestationLayout(
  w: number, h: number,
  regions: { id: string; sectorIds: string[] }[],
): MapLayout {
  const lobeR = Math.min(w, h) * 0.2;
  const cellR = lobeR * 0.32;
  const cells: CellLayout[] = [];
  const regionOut: MapLayout['regions'] = [];
  regions.forEach((region, ri) => {
    const c = REGION_CENTERS[ri % REGION_CENTERS.length];
    const cx = w * c.fx;
    const cy = h * c.fy;
    regionOut.push({ id: region.id, cx, cy, rx: lobeR * 1.2, ry: lobeR * 1.15, label: { x: cx, y: cy - lobeR * 1.16 } });
    region.sectorIds.forEach((sectorId, si) => {
      const o = SECTOR_OFFSETS[si % SECTOR_OFFSETS.length];
      cells.push({
        sectorId, regionId: region.id,
        cx: cx + o.dx * lobeR, cy: cy + o.dy * lobeR, r: cellR,
        seed: ri * 41.3 + si * 7.7 + 3.1,
      });
    });
  });
  return { cells, regions: regionOut, w, h };
}

/** Trace an organic blob path (hash-wobbled circle) for a cell — call inside a path build. */
function blobPath(ctx: Ctx, cx: number, cy: number, r: number, seed: number, t: number, breathe: number): void {
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const wob = 1 + (h01(seed + i * 1.7) - 0.5) * 0.28 + Math.sin(t * 0.8 + i + seed) * 0.03 * breathe;
    const px = cx + Math.cos(a) * r * wob;
    const py = cy + Math.sin(a) * r * wob;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
}

export interface MapDrawState {
  levels: Record<string, number>; // sectorId → live 0..100
  accents: Record<string, string>; // regionId → hex accent
  entrenched: Record<string, boolean>; // regionId → overdrive
  fractions: Record<string, number>; // regionId → 0..1 (aura strength)
  pinnedSectors: Set<string>; // resolved: which cells show the pin (sector- or region-pin)
  feedsInto: string; // the one sector the next run feeds → reticle
  flashes: Record<string, number>; // sectorId → 0..1 recent-feed flash (decays in the loop)
}

/** Paint the whole map for one frame. Opaque base fill; safe to call every rAF. */
export function drawInfestationMap(ctx: Ctx, layout: MapLayout, s: MapDrawState, t: number): void {
  const { w, h } = layout;
  // Deep hive substrate — a mottled dark ground with a faint breathing sheen.
  const bg = ctx.createRadialGradient(w / 2, h * 0.5, 10, w / 2, h * 0.5, Math.max(w, h) * 0.7);
  bg.addColorStop(0, '#0b1017');
  bg.addColorStop(1, '#05070b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Region lobes — a soft accent membrane under the cells; brighter as the region fills;
  // an entrenched region pulses an overdrive halo.
  for (const region of layout.regions) {
    const accent = s.accents[region.id] ?? '#7fe07a';
    const c = hexRgb(accent);
    const frac = s.fractions[region.id] ?? 0;
    const halo = ctx.createRadialGradient(region.cx, region.cy, region.rx * 0.2, region.cx, region.cy, region.rx);
    const base = 0.04 + frac * 0.1;
    const pulse = s.entrenched[region.id] ? base + 0.06 * (0.5 + 0.5 * Math.sin(t * 2.2)) : base;
    halo.addColorStop(0, rgba(c, pulse));
    halo.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(region.cx, region.cy, region.rx, region.ry, 0, 0, TAU);
    ctx.fill();
    // The entrenched ring — a hard biomechanical border when overdriving.
    if (s.entrenched[region.id]) {
      ctx.strokeStyle = rgba(c, 0.3 + 0.15 * Math.sin(t * 2.2));
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(region.cx, region.cy, region.rx * 0.98, region.ry * 0.98, 0, 0, TAU);
      ctx.stroke();
    }
  }

  // Mycelial links — thin threads from each region center to its cells, brightening with fill.
  for (const cell of layout.cells) {
    const region = layout.regions.find((r) => r.id === cell.regionId)!;
    const lvl = (s.levels[cell.sectorId] ?? 0) / 100;
    const c = hexRgb(s.accents[cell.regionId] ?? '#7fe07a');
    ctx.strokeStyle = rgba(c, 0.06 + lvl * 0.22);
    ctx.lineWidth = 0.8 + lvl * 1.6;
    ctx.beginPath();
    ctx.moveTo(region.cx, region.cy);
    const mx = (region.cx + cell.cx) / 2 + Math.sin(t * 0.6 + cell.seed) * 3;
    const my = (region.cy + cell.cy) / 2 + Math.cos(t * 0.5 + cell.seed) * 3;
    ctx.quadraticCurveTo(mx, my, cell.cx, cell.cy);
    ctx.stroke();
  }

  // The cells themselves — organic blobs whose infestation fills from within.
  for (const cell of layout.cells) {
    const accent = s.accents[cell.regionId] ?? '#7fe07a';
    const c = hexRgb(accent);
    const lvl = Math.max(0, Math.min(1, (s.levels[cell.sectorId] ?? 0) / 100));
    const flash = s.flashes[cell.sectorId] ?? 0;
    const saturated = lvl >= 0.9995;
    const breathe = 0.4 + lvl * 0.9;

    // Empty husk — the dormant cell wall.
    ctx.save();
    ctx.beginPath();
    blobPath(ctx, cell.cx, cell.cy, cell.r, cell.seed, t, breathe);
    ctx.closePath();
    ctx.fillStyle = '#0c141d';
    ctx.fill();
    ctx.strokeStyle = rgba(c, 0.22 + lvl * 0.3);
    ctx.lineWidth = 1;
    ctx.stroke();

    // Infestation fill — a radial bloom scaled by level, clipped to the blob, veined.
    if (lvl > 0.01) {
      ctx.clip();
      const fillR = cell.r * (0.35 + lvl * 0.95);
      const bloom = ctx.createRadialGradient(cell.cx, cell.cy, 1, cell.cx, cell.cy, fillR);
      const core = saturated ? 0.9 : 0.35 + lvl * 0.45;
      bloom.addColorStop(0, rgba(c, core));
      bloom.addColorStop(0.6, rgba(c, core * 0.5));
      bloom.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = bloom;
      ctx.fillRect(cell.cx - cell.r * 1.4, cell.cy - cell.r * 1.4, cell.r * 2.8, cell.r * 2.8);
      // Creeping veins — a few hash-placed threads that lengthen with level + writhe with time.
      const veins = 3 + Math.round(lvl * 4);
      ctx.strokeStyle = rgba(c, 0.35 + lvl * 0.4);
      ctx.lineWidth = 0.9;
      ctx.lineCap = 'round';
      for (let i = 0; i < veins; i++) {
        const a = h01(cell.seed + i * 2.3) * TAU + Math.sin(t * 0.5 + i) * 0.1;
        const len = fillR * (0.5 + h01(cell.seed + i) * 0.5);
        ctx.beginPath();
        ctx.moveTo(cell.cx, cell.cy);
        ctx.quadraticCurveTo(
          cell.cx + Math.cos(a) * len * 0.5 + Math.sin(t + i) * 2,
          cell.cy + Math.sin(a) * len * 0.5,
          cell.cx + Math.cos(a) * len, cell.cy + Math.sin(a) * len,
        );
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    ctx.restore();

    // Saturated nucleus — a bright pulsing pip; the "locked-in" tell.
    if (saturated) {
      const p = 0.7 + 0.3 * Math.sin(t * 3 + cell.seed);
      ctx.fillStyle = rgba(c, 0.9 * p);
      ctx.beginPath();
      ctx.arc(cell.cx, cell.cy, cell.r * 0.16, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.5 * p})`;
      ctx.beginPath();
      ctx.arc(cell.cx, cell.cy, cell.r * 0.07, 0, TAU);
      ctx.fill();
    }

    // Recent-feed flash — an expanding ring that erupts when a run just fed this cell.
    if (flash > 0.01) {
      ctx.strokeStyle = rgba(c, 0.7 * flash);
      ctx.lineWidth = 1.5 * flash + 0.5;
      ctx.beginPath();
      ctx.arc(cell.cx, cell.cy, cell.r * (1 + (1 - flash) * 0.6), 0, TAU);
      ctx.stroke();
    }

    // Pinned tell — a rotating dashed ring around the pinned cell(s).
    if (s.pinnedSectors.has(cell.sectorId)) {
      ctx.save();
      ctx.translate(cell.cx, cell.cy);
      ctx.rotate(t * 0.6);
      ctx.strokeStyle = rgba(c, 0.85);
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, cell.r * 1.22, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Feed reticle — the ONE sector the next run lands on (when not the pinned one already).
    if (cell.sectorId === s.feedsInto && !s.pinnedSectors.has(cell.sectorId)) {
      const p = 0.5 + 0.5 * Math.sin(t * 2.4);
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.35 * p})`;
      ctx.lineWidth = 1;
      const tick = cell.r * 1.3;
      for (let q = 0; q < 4; q++) {
        const a = q * (TAU / 4) + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(cell.cx + Math.cos(a) * tick * 0.7, cell.cy + Math.sin(a) * tick * 0.7);
        ctx.lineTo(cell.cx + Math.cos(a) * tick, cell.cy + Math.sin(a) * tick);
        ctx.stroke();
      }
    }
  }
}

/** The reduced-motion still: one representative frame (t chosen so pulses read mid-swing). */
export const REDUCED_MAP_T = 0.9;

/** Advance the per-sector feed-flash ledger toward 0 (the loop owns this; dt in seconds). */
export function decayFlashes(flashes: Record<string, number>, dt: number): void {
  for (const k of Object.keys(flashes)) {
    flashes[k] = Math.max(0, flashes[k] - dt * 0.8);
    if (flashes[k] <= 0) delete flashes[k];
  }
}
