// LIVING GUTTERS (docs/SIGNATURE-MOMENTS.md §4 · docs/LIVING-BATTLEFIELD.md §gutters) — the biome
// continues past the board edge. On desktop the 3:4 board sits in a wide frame; the flat black on
// either side becomes PERIPHERY: the same ground, flora and assimilation veins, darkened to ≤ 35 %
// of the board's brightness and softened (a ¼-resolution bake, upscaled) so it reads as the world
// beyond the camera — never as playable space.
//
//   • A STATIC BAKE. paintGutters() runs only when its inputs change (biome, terraform stage, the
//     Assimilation Index creep bucket, tower layout, a surfaced Mega, the frame geometry) — the
//     mount (ui/LivingGutters.tsx) polls those at 4 Hz, so a steady frame costs nothing here.
//   • NO ENTITIES, EVER. Enemies, towers, projectiles and HUD markers are never painted — only the
//     ground, the Living Battlefield's terrain vocabulary (re-used, not forked: livingBattlefield.ts
//     exports its painters) and, on a Mega stage, the raid organism's limbs reaching past the frame.
//   • Coordinates are BOARD UNITS (WIDTH×HEIGHT = the sim's 720×960), extended past the edges:
//     x < 0 is the left gutter, x > WIDTH the right one. The geometry maps them onto the frame so a
//     vein crossing the seam lines up with the board at every size.
//   • Render-only ⇒ the sim, goldens and replays are untouched.

import { CELL, DEFENSE_TOP_Y, HEIGHT, WIDTH } from '../core/map';
import type { RenderState } from '../core/game';
import { THEME } from './theme';
import { SPAWN_BAND } from './renderer';
import { themedMegaColor, wardrobeKit } from './wardrobeFx';
import {
  BIOME_FLORA, STAGE_COUNT, crustGeometry, css, hash01, hex, infectionField, lipY, mix, paintEyeSocket, paintFlora,
  paintVein, resolveAccent, shade, terraformPalette,
} from './livingBattlefield';
import type { Assimilation, Col, Motif, Region, VeinSeg } from './livingBattlefield';
import { groundFor, groundSeed, paintGroundMotif, paintGroundTint } from './biomeGround';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

// ── Tunables (the whole look of the periphery lives here — docs/SIGNATURE-MOMENTS.md §4) ─────────
export const GUTTERS = {
  /** Bake resolution vs CSS px. ¼ ⇒ 1/16 of the pixels, and the browser's upscale IS the softening. */
  resScale: 0.25,
  /** Taste call (S3): the periphery is the board's look × this — capped so it never competes. */
  brightness: 0.35,
  /** Below this on every side (CSS px) the layout has no gutters ⇒ no canvas, no work. */
  minGutterPx: 24,
  /** Input poll cadence (ms) — the bake's change detector. Never per frame. */
  pollMs: 250,
  /** Crossfade between bakes (ms) — matches the board terraform's 0.85 s; instant under reduced motion. */
  fadeMs: 850,
  /** The Assimilation Index is bucketed into this many creep steps ⇒ at most this many creep re-bakes a run. */
  creepSteps: 12,
  /** At index 1 the infestation reaches this × the widest gutter (board units) — the frame is consumed. */
  creepReach: 1.1,
  /** Contact shadow just outside the board edge (board units / alpha): frames the board as a lit
   *  window and swallows the dark sliver a camera shake reveals inside the board (no seam tearing). */
  seamWidth: 26,
  seamAlpha: 0.6,
  /** The periphery dissolves into the frame over this fraction of each gutter's outer edge. */
  edgeFade: 0.16,
  /** Outbound arteries per side: base + per terraform stage (capped). */
  arteries: { base: 1, perStage: 1, max: 6 },
  /** Mega stage: static limbs per side (base + per visual tier, capped) and their root thickness. */
  limbs: { base: 2, perTier: 0.5, max: 4, width: 24 },
} as const;

// ── Geometry (pure) ───────────────────────────────────────────────────────────────────────────────
/** Where the board sits in the bake canvas. Canvas px; kx/ky = canvas px per board unit. */
export interface GutterGeom { cw: number; ch: number; ox: number; oy: number; kx: number; ky: number }

/** Pure: the frame (padding box, CSS px) + the board's layout box inside it → bake geometry. Null when
 *  no side has a gutter worth painting (a board that fills its frame — phones never even get here). */
export function gutterGeometry(frameW: number, frameH: number, boardX: number, boardY: number, boardW: number, boardH: number): GutterGeom | null {
  if (frameW <= 0 || frameH <= 0 || boardW <= 0 || boardH <= 0) return null;
  const widest = Math.max(boardX, frameW - boardX - boardW, boardY, frameH - boardY - boardH);
  if (widest < GUTTERS.minGutterPx) return null;
  const cw = Math.max(1, Math.ceil(frameW * GUTTERS.resScale));
  const ch = Math.max(1, Math.ceil(frameH * GUTTERS.resScale));
  const sx = cw / frameW, sy = ch / frameH; // the CSS stretch maps the canvas exactly onto the frame
  return { cw, ch, ox: boardX * sx, oy: boardY * sy, kx: (boardW / WIDTH) * sx, ky: (boardH / HEIGHT) * sy };
}

export function sameGeom(a: GutterGeom | null, b: GutterGeom | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.cw === b.cw && a.ch === b.ch && Math.abs(a.ox - b.ox) < 0.01 && Math.abs(a.oy - b.oy) < 0.01
    && Math.abs(a.kx - b.kx) < 1e-5 && Math.abs(a.ky - b.ky) < 1e-5;
}

// ── Inputs (pure) ─────────────────────────────────────────────────────────────────────────────────
export interface GutterMega { defId: string; body: string; glow: string; accent: string; tier: number }
export interface GutterInput {
  terraform: boolean; // the Living Battlefield is on (dev toggle) and woken (stage ≥ 1)
  stage: number;
  progress: number;
  creep: number; // the Assimilation intensity, bucketed (0..1 in 1/creepSteps steps)
  tier: Col;
  dominant: Motif;
  towers: readonly Region[]; // the board's tower hotspots — their infection bleeds across the seam
  biomeId: string;
  biomeAccent: string;
  mega: GutterMega | null; // a SURFACED, living Mega (burrowed / dying ⇒ its limbs withdraw)
}

/** Bucket the Assimilation intensity into a creep step WITH hysteresis: the step only moves once the
 *  eased index has travelled ¾ of a step past it, so an index hovering on a boundary never flaps the
 *  bake (a re-bake every poll). `prev` = the step currently baked (null on the first bake). */
export function creepBucket(intensity: number, prev: number | null): number {
  const v = Math.min(1, Math.max(0, intensity));
  const step = 1 / GUTTERS.creepSteps;
  if (prev !== null && Math.abs(v - prev) < step * 0.75) return prev;
  return Math.round(v / step) * step;
}

/** Pure: the board's state → the periphery's inputs. `a` is the Living Battlefield's last computed
 *  assimilation (getAssimilationDebug — the exact terraform the board just drew); null before the
 *  first frame. `prevCreep` is the creep step currently baked (hysteresis — see creepBucket). */
export function gutterInputFrom(rs: Pick<RenderState, 'biome' | 'megaBoss'>, a: Assimilation | null, lbEnabled: boolean, prevCreep: number | null = null): GutterInput {
  const stage = a?.stage ?? 0;
  const m = rs.megaBoss;
  const surfaced = m !== null && m.deathT <= 0 && m.burrow < 0.5;
  return {
    terraform: lbEnabled && stage > 0,
    stage,
    progress: a?.progress ?? 0,
    creep: creepBucket(a?.intensity ?? 0, prevCreep),
    tier: a ? a.tierColor : [70, 140, 150],
    dominant: a?.dominant ?? 'flesh',
    towers: a ? a.regions.filter((r) => r.kind === 'tower') : [],
    biomeId: rs.biome.id,
    biomeAccent: rs.biome.accent,
    mega: surfaced ? { defId: m.defId, body: m.palette.body, glow: m.palette.glow, accent: m.palette.accent, tier: m.visualTier } : null,
  };
}

/** The bake signature — equal keys ⇒ an identical bake (the poll compares these; 4 Hz, never per frame).
 *  The tier colour is left out on purpose: it follows the index, which the creep bucket already keys. */
export function gutterKey(i: GutterInput): string {
  let k = `${i.biomeId}|${i.mega ? `${i.mega.defId}:${i.mega.tier}` : '-'}`;
  if (!i.terraform) return k; // a dormant field paints ground only — stage/creep/towers can't change it
  k += `|${i.stage}|${i.creep}`;
  for (const r of i.towers) k += `|${r.x | 0},${r.y | 0},${Math.round(r.strength)}`;
  return k;
}

// ── The bake ──────────────────────────────────────────────────────────────────────────────────────
interface Domain { x0: number; y0: number; x1: number; y1: number; gw: number } // board units; gw = widest side gutter

function outsideBoard(x: number, y: number, pad = 0): boolean {
  return x < -pad || x > WIDTH + pad || y < -pad || y > HEIGHT + pad;
}

/** Paint the whole periphery into `ctx` (a canvas of geom.cw × geom.ch). One-shot — the caller
 *  re-bakes only on a real input change. Never draws an entity; the board covers its own rect. */
export function paintGutters(ctx: Ctx, input: GutterInput, g: GutterGeom): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, g.cw, g.ch);
  ctx.setTransform(g.kx, 0, 0, g.ky, g.ox, g.oy);
  const d: Domain = { x0: -g.ox / g.kx, y0: -g.oy / g.ky, x1: (g.cw - g.ox) / g.kx, y1: (g.ch - g.oy) / g.ky, gw: 0 };
  d.gw = Math.max(1, -d.x0, d.x1 - WIDTH);

  paintGround(ctx, input, d);
  if (input.terraform) paintInfestation(ctx, input, d);
  if (input.mega) paintMegaLimbs(ctx, input.mega, d);
  paintDarkness(ctx, d);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** The floor's vertical fall (void → hive), the tile lattice, the spawn void + membrane haze along the
 *  top, the hive's warmth along the bottom, and the biome wash — the board's own light, continued. */
function paintGround(ctx: Ctx, input: GutterInput, d: Domain): void {
  const w = d.x1 - d.x0, h = d.y1 - d.y0;
  const [s0, s1, s2, s3] = THEME.arena.skyStops;
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, s0); sky.addColorStop(0.45, s1); sky.addColorStop(0.8, s2); sky.addColorStop(1, s3);
  ctx.fillStyle = sky; ctx.fillRect(d.x0, d.y0, w, h);

  // Tile lattice continuing on the board's own CELL grid (aligned at the seam).
  ctx.strokeStyle = THEME.arena.grid; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = Math.ceil(d.x0 / CELL) * CELL; x <= d.x1; x += CELL) { ctx.moveTo(x, d.y0); ctx.lineTo(x, d.y1); }
  for (let y = Math.ceil(d.y0 / CELL) * CELL; y <= d.y1; y += CELL) { ctx.moveTo(d.x0, y); ctx.lineTo(d.x1, y); }
  ctx.stroke();

  // The biome's GROUND (biomeGround.ts) continues past the seam — same tone + relief as the board's
  // floor bake (a different seed, so it never mirrors), dimmed by paintDarkness like everything here.
  const acc = resolveAccent(input.biomeAccent);
  const ground = groundFor(input.biomeId, acc ? '#' + acc.map((v) => v.toString(16).padStart(2, '0')).join('') : '#5ad1ff');
  if (ground) {
    const R = { x0: d.x0, y0: d.y0, x1: d.x1, y1: d.y1 };
    paintGroundTint(ctx, R, ground);
    paintGroundMotif(ctx, R, ground, groundSeed(input.biomeId) + 1, WIDTH / 2, WIDTH / 2);
  }

  // THE DARK BEYOND + the breeding membrane's bruised haze (renderer drawSpawnZone, at rest).
  const dk = ctx.createLinearGradient(0, 0, 0, SPAWN_BAND * 1.6);
  dk.addColorStop(0, 'rgba(1, 3, 7, 0.66)'); dk.addColorStop(0.55, 'rgba(1, 3, 7, 0.3)'); dk.addColorStop(1, 'rgba(1, 3, 7, 0)');
  ctx.fillStyle = dk; ctx.fillRect(d.x0, d.y0, w, SPAWN_BAND * 1.6 - d.y0);
  const mem = ctx.createLinearGradient(0, 0, 0, SPAWN_BAND * 1.5);
  mem.addColorStop(0, `rgba(${THEME.spawn.membrane}, 0.2)`); mem.addColorStop(0.5, THEME.spawn.haze); mem.addColorStop(1, `rgba(${THEME.spawn.membrane}, 0)`);
  ctx.fillStyle = mem; ctx.fillRect(d.x0, d.y0, w, SPAWN_BAND * 1.5 - d.y0);

  // The hive's warmth pooling up from the bottom — feathered (no line: the defense zone is gameplay).
  const warm = ctx.createLinearGradient(0, DEFENSE_TOP_Y - CELL * 2, 0, HEIGHT);
  warm.addColorStop(0, `rgba(${THEME.defense.zone}, 0)`); warm.addColorStop(1, `rgba(${THEME.defense.zone}, 0.13)`);
  ctx.fillStyle = warm; ctx.fillRect(d.x0, DEFENSE_TOP_Y - CELL * 2, w, d.y1 - (DEFENSE_TOP_Y - CELL * 2));

  // Biome wash (renderer drawBiomeWash) — skipped for the NEUTRAL biome, exactly like the board.
  const tint = input.biomeId !== 'neutral' ? resolveAccent(input.biomeAccent) : null;
  if (tint) {
    const bw = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bw.addColorStop(0, css(tint, 0.1)); bw.addColorStop(0.5, css(tint, 0.04)); bw.addColorStop(1, css(tint, 0.09));
    ctx.fillStyle = bw; ctx.fillRect(d.x0, d.y0, w, h);
  }
  // An equipped Wardrobe battlefield theme (renderer drawWardrobeWash) — its edge tone, which is what
  // the board shows where it meets the periphery.
  const bf = wardrobeKit().battlefieldTheme;
  if (bf?.bg && bf.accent) { ctx.fillStyle = css(hex(bf.bg), 0.22); ctx.fillRect(d.x0, d.y0, w, h); }
}

/** The periphery's infection field: the board's own field continuing across the seam (tower blooms
 *  near an edge, the rising hive frontier) merged with a CREEP that spreads outward from the board
 *  edges as the Assimilation Index rises — at index 1 the whole frame is consumed. */
function peripheryField(x: number, y: number, input: GutterInput, d: Domain, front: number, reach: number): number {
  const board = infectionField(x, y, input.towers as Region[], front, reach);
  const dx = x < 0 ? -x : x > WIDTH ? x - WIDTH : 0;
  const dy = y < 0 ? -y : y > HEIGHT ? y - HEIGHT : 0;
  const dist = Math.hypot(dx, dy);
  const creepR = GUTTERS.creepReach * d.gw * input.creep;
  const wobble = 0.82 + 0.18 * Math.sin(y * 0.011 + (x < 0 ? 1.3 : 4.1)) * Math.sin(y * 0.027 + 0.7);
  const creep = creepR > 0 && dist < creepR * wobble ? (1 - dist / (creepR * wobble)) * (0.55 + 0.45 * input.creep) : 0;
  return Math.max(board, creep);
}

/** The Living Battlefield's terrain past the edge: flesh membrane + capillaries, the hive crust tide,
 *  outbound arteries, flora, closed eye sockets — the SAME painters as the board bake. */
function paintInfestation(ctx: Ctx, input: GutterInput, d: Domain): void {
  const front = 0.14 + (input.stage / (STAGE_COUNT - 1)) * 0.98; // deriveTerraform's frontier
  const reach = Math.min(1, (input.stage + input.progress) / STAGE_COUNT);
  const tint = input.biomeId !== 'neutral' ? resolveAccent(input.biomeAccent) : null;
  const { base, hi } = terraformPalette(tint, input.tier);
  const field = (x: number, y: number): number => peripheryField(x, y, input, d, front, reach);
  const areaK = Math.max(0.2, ((d.x1 - d.x0) * (d.y1 - d.y0) - WIDTH * HEIGHT) / (WIDTH * HEIGHT)); // gutter area vs the board's
  ctx.save();
  ctx.globalAlpha = Math.min(0.66, Math.max(0.08, input.creep * 0.78)); // the board blits its base at this alpha

  // Membrane: two octaves of field-gated fleshy mottling (paintMembrane's recipe, over the periphery).
  const blotch = (count: number, rMin: number, rSpan: number, salt: number, a0: number): void => {
    for (let i = 0; i < count; i++) {
      const h1 = hash01(i * 1.7 + salt), h2 = hash01(i * 3.3 + salt * 2 + 5), h3 = hash01(i * 5.1 + salt + 9);
      const x = d.x0 + h1 * (d.x1 - d.x0), y = d.y0 + h2 * (d.y1 - d.y0);
      const rr = rMin + h3 * rSpan;
      if (!outsideBoard(x, y, -rr) || h3 > field(x, y) * 1.15) continue;
      const rad = ctx.createRadialGradient(x, y, 0, x, y, rr);
      rad.addColorStop(0, css(mix(base, hi, h1 * 0.9), a0)); rad.addColorStop(1, css(base, 0));
      ctx.fillStyle = rad; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
    }
  };
  blotch(Math.round((90 + input.stage * 30) * areaK), 26, 78, 0, 0.5);
  blotch(Math.round((110 + input.stage * 34) * areaK), 6, 20, 100, 0.32);
  ctx.lineCap = 'round';
  for (let i = 0; i < Math.round((14 + input.stage * 8) * areaK); i++) {
    let x = d.x0 + hash01(i * 8.1 + input.stage) * (d.x1 - d.x0), y = d.y0 + hash01(i * 2.7 + input.stage) * (d.y1 - d.y0);
    if (!outsideBoard(x, y) || field(x, y) < 0.15) continue;
    ctx.strokeStyle = css(shade(hi, 0.12), 0.1 + input.stage * 0.012); ctx.lineWidth = 0.8 + hash01(i) * 0.8;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (hash01(i + k * 3.1) - 0.5) * 76; y += (hash01(i + k * 7.7) - 0.5) * 76; ctx.lineTo(x, y); }
    ctx.stroke();
  }

  // The hive crust tide (paintCrust's geometry) continues across the whole frame width.
  if (input.stage >= 2) {
    const { reach: cr, crest, amp } = crustGeometry(input.stage);
    const bottom = Math.max(HEIGHT, d.y1);
    const grad = ctx.createLinearGradient(0, HEIGHT, 0, crest);
    grad.addColorStop(0, css(mix(hi, input.tier, 0.3), 0.5)); grad.addColorStop(1, css(hi, 0));
    ctx.fillStyle = grad; ctx.fillRect(d.x0, crest, d.x1 - d.x0, bottom - crest);
    const lipX0 = Math.floor(d.x0 / 12) * 12;
    for (let pass = 0; pass < 3; pass++) {
      const off = pass * (6 + cr * 6), al = [0.22, 0.13, 0.07][pass];
      ctx.fillStyle = css(mix(hi, input.tier, 0.25), al);
      ctx.beginPath(); ctx.moveTo(lipX0, bottom);
      for (let x = lipX0; x <= d.x1 + 12; x += 12) ctx.lineTo(x, lipY(x, crest, amp) - off);
      ctx.lineTo(d.x1 + 12, bottom); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = css(mix(shade(hi, 0.35), input.tier, 0.4), 0.3); ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let x = lipX0; x <= d.x1 + 12; x += 12) { const yy = lipY(x, crest, amp); if (x === lipX0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
    ctx.stroke();
  }

  // Outbound ARTERIES: the network leaves the board under the frame edge and branches out into the
  // periphery, hued by the nearest hotspot on that side (an ember-built flank glows ember).
  const n = Math.min(GUTTERS.arteries.max, GUTTERS.arteries.base + GUTTERS.arteries.perStage * input.stage);
  const len = d.gw * Math.min(1, 0.35 + input.creep * 0.75);
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const s = (side < 0 ? 0 : 97) + i * 13;
      let x = side < 0 ? 4 : WIDTH - 4;
      let y = HEIGHT * (0.22 + 0.72 * ((i + 0.3 + hash01(s) * 0.5) / n));
      if (field(side < 0 ? -8 : WIDTH + 8, y) < 0.12) continue; // only where the flank is infested
      const hue = nearestHue(input.towers, x, y);
      let ang = side < 0 ? Math.PI : 0;
      let w = 4.2 - i * 0.25;
      for (let seg = 0; seg < 4 && w > 0.9; seg++) {
        const l = (len / 4) * (0.7 + hash01(s + seg) * 0.6);
        ang += (hash01(s * 3 + seg) - 0.5) * 0.9;
        const nx = x + Math.cos(ang) * l, ny = y + Math.sin(ang) * l * 0.8;
        const bow = (hash01(s + seg * 7) - 0.5) * 0.5;
        const seg0: VeinSeg = { x0: x, y0: y, cx: (x + nx) / 2 - (ny - y) * bow, cy: (y + ny) / 2 + (nx - x) * bow, x1: nx, y1: ny, w, hue, seed: s * 31 + seg };
        paintVein(ctx, ctx, seg0, base, hi);
        x = nx; y = ny; w *= 0.72;
      }
    }
  }

  // FLORA where the field has taken (deriveTerraform's rejection sampling, over the periphery).
  const floraMotif = BIOME_FLORA[input.biomeId] ?? input.dominant;
  const want = Math.round(Math.min(160, 30 * (input.stage + input.progress)) * areaK);
  let placed = 0;
  for (let i = 0; i < want * 4 && placed < want; i++) {
    const x = d.x0 + hash01(i * 13.7 + 11) * (d.x1 - d.x0), y = d.y0 + hash01(i * 7.9 + 23) * (d.y1 - d.y0);
    if (!outsideBoard(x, y, 6) || field(x, y) < 0.25 + hash01(i * 3.1) * 0.3) continue;
    paintFlora(ctx, ctx, { x, y, size: 2 + hash01(i * 5.3) * 4, motif: floraMotif, seed: i });
    placed++;
  }

  // Closed eye sockets in the deep periphery (stage ≥ 4) — static lids; the board's eyes do the watching.
  if (input.stage >= 4) {
    for (let k = 0; k < (input.stage - 3) * 4; k++) {
      const left = k % 2 === 0;
      const x = left ? d.x0 + hash01(k * 17.3) * (-d.x0 - 30) : WIDTH + 30 + hash01(k * 17.3) * (d.x1 - WIDTH - 30);
      const y = HEIGHT * (0.3 + hash01(k * 29.7 + 7) * 0.6);
      if (!outsideBoard(x, y, 20) || field(x, y) < 0.3) continue;
      paintEyeSocket(ctx, { x, y, r: 4 + hash01(k * 5.1) * 3.5, seed: k * 977 }, base);
    }
  }
  ctx.restore();
}

function nearestHue(towers: readonly Region[], x: number, y: number): string {
  let best = '#c0304e', bd = Infinity; // the nucleus crimson when the flank holds no tower
  for (const r of towers) { const dd = Math.hypot(r.x - x, r.y - y); if (dd < bd) { bd = dd; best = r.hue; } }
  return best;
}

/** A Mega stage: the raid organism's ridge continues across the frame top and its LIMBS reach down
 *  into the periphery — static, keyed to the mega's palette + visual tier (re-baked when it
 *  surfaces, mutates, burrows or dies). The live body on the board keeps all the motion. */
function paintMegaLimbs(ctx: Ctx, m: GutterMega, d: Domain): void {
  const body = hex(themedMegaColor(m.body)), glo = hex(themedMegaColor(m.glow)), acc = hex(themedMegaColor(m.accent));
  const baseY = 130 + 90; // MEGA.anchorY + the ridge's lower edge (megaboss drawMegaBody, at rest)
  ctx.save();
  // Ridge: three depth layers, lobed like the board's (same lobe period), spanning each gutter.
  const lobeW = (WIDTH + 180) / (6 + m.tier);
  for (let layer = 2; layer >= 0; layer--) {
    const yb = baseY - layer * 34;
    ctx.fillStyle = css(body, 0.5 + 0.5 * (0.55 + (2 - layer) * 0.225));
    for (const side of [-1, 1]) {
      const xa = side < 0 ? d.x0 - lobeW : WIDTH - 2, xb = side < 0 ? 2 : d.x1 + lobeW;
      ctx.beginPath(); ctx.moveTo(xa, d.y0 - 10); ctx.lineTo(xa, yb);
      for (let x = xa; x < xb; x += lobeW) {
        const i = Math.round((x + 90) / lobeW);
        const y = yb + Math.sin(i * 2.1 + layer) * (14 + m.tier * 3);
        ctx.quadraticCurveTo(x + lobeW * 0.5, y + 26, Math.min(xb, x + lobeW), y);
      }
      ctx.lineTo(xb, d.y0 - 10); ctx.closePath(); ctx.fill();
    }
  }
  // Limbs: tapered, jointed, rim-lit, with glowing nodules — curling outward and down.
  const n = Math.min(GUTTERS.limbs.max, Math.floor(GUTTERS.limbs.base + GUTTERS.limbs.perTier * m.tier));
  const pts: number[] = [];
  for (const side of [-1, 1]) {
    for (let j = 0; j < n; j++) {
      const s = (side < 0 ? 0 : 50) + j * 7 + m.tier;
      const rx = side < 0 ? -6 - j * d.gw * 0.2 : WIDTH + 6 + j * d.gw * 0.2;
      if (rx < d.x0 - 10 || rx > d.x1 + 10) continue;
      const ry = baseY - 18 + hash01(s) * 16;
      const reachX = d.gw * (0.3 + hash01(s + 1) * 0.45);
      const ex = rx + side * reachX, ey = ry + HEIGHT * (0.24 + hash01(s + 2) * 0.32);
      const c1x = rx + side * reachX * 0.15, c1y = ry + (ey - ry) * 0.55;
      const c2x = ex + side * reachX * 0.35, c2y = ey - (ey - ry) * 0.45;
      const w0 = GUTTERS.limbs.width + m.tier * 3 - j * 3;
      // Sample the cubic centreline; build the tapered outline from its normals.
      pts.length = 0;
      const N = 16;
      for (let q = 0; q <= N; q++) {
        const t = q / N, u = 1 - t;
        const x = u * u * u * rx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex;
        const y = u * u * u * ry + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey;
        pts.push(x, y);
      }
      ctx.beginPath();
      for (let q = 0; q <= N; q++) { const [nx, ny, hw] = limbNormal(pts, q, N, w0); if (q === 0) ctx.moveTo(pts[0] + nx * hw, pts[1] + ny * hw); else ctx.lineTo(pts[q * 2] + nx * hw, pts[q * 2 + 1] + ny * hw); }
      for (let q = N; q >= 0; q--) { const [nx, ny, hw] = limbNormal(pts, q, N, w0); ctx.lineTo(pts[q * 2] - nx * hw, pts[q * 2 + 1] - ny * hw); }
      ctx.closePath();
      ctx.fillStyle = css(body, 1); ctx.fill();
      ctx.strokeStyle = css(acc, 0.4); ctx.lineWidth = 1.6; ctx.stroke();
      // a faint vein of the mega's glow down the limb's length — the same organism as the board's mass
      ctx.strokeStyle = css(glo, 0.2); ctx.lineWidth = w0 * 0.22; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
      for (let q = 1; q <= N - 3; q++) ctx.lineTo(pts[q * 2], pts[q * 2 + 1]);
      ctx.stroke();
      // chitin joints across the limb + glowing nodules on every other joint
      for (let q = 2; q < N; q += 3) {
        const [nx, ny, hw] = limbNormal(pts, q, N, w0);
        const x = pts[q * 2], y = pts[q * 2 + 1];
        ctx.strokeStyle = css(shade(body, -0.45), 0.8); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + nx * hw, y + ny * hw); ctx.lineTo(x - nx * hw, y - ny * hw); ctx.stroke();
        if ((q / 3) % 2 < 1) {
          const gr = ctx.createRadialGradient(x, y, 0, x, y, hw * 1.4);
          gr.addColorStop(0, css(glo, 0.55)); gr.addColorStop(1, css(glo, 0));
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, hw * 1.4, 0, TAU); ctx.fill();
        }
      }
    }
  }
  ctx.restore();
}

const LIMB_N: [number, number, number] = [0, 0, 0];
/** Unit normal + half-width at sample q of a limb centreline (tapers root → tip). */
function limbNormal(pts: number[], q: number, n: number, w0: number): [number, number, number] {
  const a = Math.max(0, q - 1) * 2, b = Math.min(n, q + 1) * 2;
  const tx = pts[b] - pts[a], ty = pts[b + 1] - pts[a + 1];
  const l = Math.hypot(tx, ty) || 1;
  LIMB_N[0] = -ty / l; LIMB_N[1] = tx / l; LIMB_N[2] = Math.max(1, w0 * 0.5 * (1 - (q / n) * 0.88));
  return LIMB_N;
}

/** The 35 % cap, the seam's contact shadow, and the outer dissolve into the frame. */
function paintDarkness(ctx: Ctx, d: Domain): void {
  const w = d.x1 - d.x0, h = d.y1 - d.y0;
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgba(0,0,0,${1 - GUTTERS.brightness})`;
  ctx.fillRect(d.x0, d.y0, w, h);
  // Contact shadow hugging each board edge that has a gutter beyond it.
  const sw = GUTTERS.seamWidth, sa = GUTTERS.seamAlpha;
  const band = (gx0: number, gy0: number, gx1: number, gy1: number, rx: number, ry: number, rw: number, rh: number): void => {
    const gr = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    gr.addColorStop(0, `rgba(0,0,0,${sa})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(rx, ry, rw, rh);
  };
  if (d.x0 < 0) band(0, 0, -sw, 0, -sw, d.y0, sw, h);
  if (d.x1 > WIDTH) band(WIDTH, 0, WIDTH + sw, 0, WIDTH, d.y0, sw, h);
  if (d.y0 < 0) band(0, 0, 0, -sw, 0, -sw, WIDTH, sw);
  if (d.y1 > HEIGHT) band(0, HEIGHT, 0, HEIGHT + sw, 0, HEIGHT, WIDTH, sw);
  // Outer dissolve: the periphery fades out before the frame edge (the frame's own glow shows there).
  ctx.globalCompositeOperation = 'destination-out';
  const f = GUTTERS.edgeFade;
  const fade = (gx0: number, gx1: number, rx: number, rw: number): void => {
    const gr = ctx.createLinearGradient(gx0, 0, gx1, 0);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(rx, d.y0, rw, h);
  };
  if (d.x0 < 0) fade(d.x0, d.x0 - d.x0 * f, d.x0, -d.x0 * f);
  if (d.x1 > WIDTH) fade(d.x1, d.x1 - (d.x1 - WIDTH) * f, d.x1 - (d.x1 - WIDTH) * f, (d.x1 - WIDTH) * f);
  ctx.globalCompositeOperation = 'source-over';
}
