// Canvas 2D renderer. Reads the sim's RenderState and draws it; holds no game
// logic and never mutates the sim (ARCHITECTURE.md §2: renderer reads, never owns).
//
// Presentation goal: a large, open, cyberpunk bio-horror arena — a living hive
// holding a defensive line against an invading ecosystem that descends from above.
// Pressure escalates visually as the swarm nears the line / the hive weakens.
//
// Look & feel is data-driven: the palette lives in `theme.ts`, the reusable draw
// primitives in `vfx.ts`, and per-archetype silhouettes in TOWER_SHAPE/ENEMY_SHAPE.
// Swapping a placeholder shape for a production sprite is a one-line change there —
// this file just composes those pieces.

import {
  CELL,
  COLS,
  DEFENSE_TOP_Y,
  FINAL_DEFENSE_TOP_Y,
  HEIGHT,
  ROWS,
  WIDTH,
  nucleusPoint,
  obstacleCells,
  slotAt,
  towerSlots,
} from '../core/map';
import { ENEMY_DEFS, HERO_DEFS, HERO_PHASE_FLASH, PERF, TOWER_DEFS } from '../core/config';
import type { RenderState } from '../core/game';
import type { TowerFiring, EnemyKind } from '../core/types';
import { THEME, ENEMY_SHAPE, ENEMY_TIER, ENEMY_BODY, ENEMY_VARIANT, hexRgb, rgba } from './theme';
import { drawEnemyBody } from './enemyForms';
import type { BodyForm } from './enemyForms';
import { ingestDeaths, updateGore, drawGoreFloor, drawGorePieces, goreThrob } from './gore';
import { drawTowerForm } from './towerForms';
import {
  chevronDown,
  drawShape,
  easeOutCubic,
  glowDisc,
  healthBar,
  padlock,
  pulse,
  ring,
  roundRectPath,
  spikeCrown,
} from './vfx';
import { drawTowerEvolution, evolutionGrowthAnimated, branchSkinColor } from './towerEvolution';
import { drawStarEvolution, starEvolutionGrowth } from './starEvolution';
import { drawMulliganOrganism } from './mulliganOrganism';
import type { ResolvedMulligan } from '../core/mulligan';
import { drawHeroEvolution, heroEvolutionGrowth } from './heroEvolution';
import { drawMegaBody, drawMegaOrgans, drawMegaShots, drawMegaVignette } from './megaboss';
import { bossColorOf, drawBossBody, drawBossCrown } from './bossChassis';
import { dangerCurve } from '../core/dangerCamera';
import type { CosmeticTheme } from '../core/cosmetics';

export interface Pointer {
  x: number;
  y: number;
}

const SPAWN_BAND = CELL * 1.4; // top "breeding membrane" the swarm pours from
const TOWER_R = 12; // base silhouette radius for placed towers
const MUTATE_FLASH = 0.5; // seconds the tier-purchase shockwave + flash plays at the tower
const WHITE = hexRgb('#ffffff');

// Biome accent (docs/BIOMES.md) resolved to an "r, g, b" token for rgba(). The biome carries a
// CSS var ('var(--caustic)'); the canvas can't read CSS vars, so we resolve via getComputedStyle
// once per accent and cache it. Falls back to a hex literal or kinetic blue.
const biomeRgbCache = new Map<string, string>();
function biomeRgb(accent: string): string {
  const cached = biomeRgbCache.get(accent);
  if (cached !== undefined) return cached;
  let hex = '#5ad1ff';
  const m = /var\((--[\w-]+)\)/.exec(accent);
  if (m && typeof document !== 'undefined') {
    const c = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
    if (c) hex = c;
  } else if (accent.startsWith('#')) {
    hex = accent;
  }
  const rgb = hexRgb(hex);
  biomeRgbCache.set(accent, rgb);
  return rgb;
}

/** Cheap deterministic 0..1 hash — all ambient detail keys off this (render NEVER touches rng). */
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ── Static floor cache (beauty + perf): the sky gradient, tile checker, grid lattice,
//    organic mottling, dormant hive veins and the corner vignette never change during a
//    run — render them ONCE into an offscreen layer at the ctx's device-pixel scale and
//    blit a single image per frame instead of ~400 fills + a 50-segment path stroke.
let floorCache: HTMLCanvasElement | null = null;
let floorCacheScale = 0;

function buildFloor(scale: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(WIDTH * scale));
  c.height = Math.max(1, Math.round(HEIGHT * scale));
  const g2 = c.getContext('2d')!;
  g2.scale(scale, scale);
  const [s0, s1, s2, s3] = THEME.arena.skyStops;
  const sky = g2.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, s0);
  sky.addColorStop(0.45, s1);
  sky.addColorStop(0.8, s2);
  sky.addColorStop(1, s3);
  g2.fillStyle = sky;
  g2.fillRect(0, 0, WIDTH, HEIGHT);
  g2.fillStyle = THEME.arena.tile;
  for (let r = 0; r < ROWS; r++) {
    for (let col = r % 2; col < COLS; col += 2) g2.fillRect(col * CELL, r * CELL, CELL, CELL);
  }
  // Organic mottling — hash-keyed dark blotches so the floor reads as grown chitin, not vinyl.
  for (let i = 0; i < 70; i++) {
    const bx = hash01(i * 3 + 1) * WIDTH;
    const by = hash01(i * 3 + 2) * HEIGHT;
    const br = 14 + hash01(i * 3 + 3) * 46;
    const m = g2.createRadialGradient(bx, by, 0, bx, by, br);
    m.addColorStop(0, `rgba(0,0,0,${0.05 + hash01(i * 7) * 0.06})`);
    m.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = m;
    g2.beginPath();
    g2.arc(bx, by, br, 0, Math.PI * 2);
    g2.fill();
  }
  g2.strokeStyle = THEME.arena.grid;
  g2.lineWidth = 1;
  g2.beginPath();
  for (let cc = 0; cc <= COLS; cc++) { g2.moveTo(cc * CELL, 0); g2.lineTo(cc * CELL, HEIGHT); }
  for (let rr = 0; rr <= ROWS; rr++) { g2.moveTo(0, rr * CELL); g2.lineTo(WIDTH, rr * CELL); }
  g2.stroke();
  // Dormant hive veins radiating from the nucleus (static; the LIVE tendrils draw over them).
  g2.strokeStyle = 'rgba(255,140,150,0.05)';
  g2.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.35;
    const reach = 90 + hash01(i * 13) * 150;
    g2.beginPath();
    g2.moveTo(nucleusPoint.x, nucleusPoint.y);
    g2.quadraticCurveTo(
      nucleusPoint.x + Math.cos(a) * reach * 0.5 + (hash01(i * 5) - 0.5) * 60,
      nucleusPoint.y + Math.sin(a) * reach * 0.5,
      nucleusPoint.x + Math.cos(a) * reach,
      nucleusPoint.y + Math.sin(a) * reach,
    );
    g2.stroke();
  }
  // Corner vignette — depth for free.
  const vg = g2.createRadialGradient(WIDTH / 2, HEIGHT * 0.45, HEIGHT * 0.35, WIDTH / 2, HEIGHT * 0.5, HEIGHT * 0.82);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.17)'); // gentle — the LIVE pressure vignette stacks on top
  g2.fillStyle = vg;
  g2.fillRect(0, 0, WIDTH, HEIGHT);
  return c;
}

function drawFloor(ctx: CanvasRenderingContext2D): void {
  const raw = typeof ctx.getTransform === 'function' ? (ctx.getTransform() as { a?: unknown } | null)?.a : undefined;
  const scale = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
  if (typeof document === 'undefined' || scale === 0) {
    // Headless/stubbed context (tests) — paint directly, no offscreen layer.
    drawBackground(ctx);
    drawTiles(ctx);
    return;
  }
  if (!floorCache || floorCacheScale !== scale) {
    floorCache = buildFloor(scale);
    floorCacheScale = scale;
  }
  ctx.drawImage(floorCache, 0, 0, WIDTH, HEIGHT);
}

/** Slow ambient spore motes drifting the arena — the air itself is alive. All hash-keyed. */
function drawAmbientMotes(ctx: CanvasRenderingContext2D, t: number): void {
  for (let i = 0; i < 22; i++) {
    const h = hash01(i * 11 + 4);
    const drift = ((hash01(i * 17 + 2) * WIDTH) + Math.sin(t * (0.15 + h * 0.2) + i) * 30 + t * (i % 2 ? 2.5 : -2)) % WIDTH;
    const x = drift < 0 ? drift + WIDTH : drift;
    const y = (hash01(i * 23 + 6) * HEIGHT + t * (4 + h * 7)) % HEIGHT;
    ctx.fillStyle = `rgba(190, 230, 210, ${0.05 + 0.06 * pulse(t, 0.4 + h, 0, 1)})`;
    ctx.beginPath();
    ctx.arc(x, y, 1 + h * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawGame(
  ctx: CanvasRenderingContext2D,
  rs: RenderState,
  pointer: Pointer | null,
  cosmeticTiers: Partial<Record<string, number>> = {}, // per-kind mastery-rank visual tier (0 = none)
  starTiers: Partial<Record<string, number>> = {}, // per-kind permanent STAR count → visual evolution (0 = none)
  adaptTiers: Partial<Record<string, number>> = {}, // per-kind Adaptation FORM stage (docs/ADAPTATION.md; 0 = none)
  heroStarTiers: Partial<Record<string, number>> = {}, // per-HERO permanent STAR count → visual evolution (0 = none)
  heroEvo = 0, // run-wide Hero Evolution levels bought (Hero Console) → in-run battle-dress (0 = none)
  towerSkins: Partial<Record<string, CosmeticTheme>> = {}, // equipped Phenotypes (docs/COSMETICS.md; {} = default dress)
  heroSkins: Partial<Record<string, CosmeticTheme>> = {},
  mulligans: Partial<Record<string, MulliganRender>> = {}, // per-kind resolved Mulligan organism (docs/MULLIGANS.md; {} = none)
): void {
  const t = rs.time;

  // How hard is the hive being pressed right now? Two SMOOTH components (docs/CAMERA.md):
  // the danger-camera intensity (hysteresis-gated, eased — it can never flicker when an
  // enemy blips across the zone edge) and the wounded-core ratio (changes only on a breach).
  // The old per-frame enemy count is gone — that was the source of the vignette throbbing.
  const intRatio = rs.maxIntegrity > 0 ? rs.integrity / rs.maxIntegrity : 1;
  const danger = dangerCurve(rs.dangerIntensity); // blend curve: zero-derivative entry/exit
  const pressure = Math.min(1, danger * 0.8 + (1 - intRatio) * 0.5);

  drawFloor(ctx); // cached static layer: sky, tiles, mottling, dormant veins, vignette
  drawBiomeWash(ctx, rs); // biome accent wash, under the entities (skipped for NEUTRAL/Stage)
  drawAmbientMotes(ctx, t); // drifting spores — the air is alive
  drawSpawnZone(ctx, t);
  drawDefenseZone(ctx, t, pressure);
  drawObstacles(ctx);

  const occupied = new Set(rs.towers.map((tw) => tw.slot));
  drawHiveTendrils(ctx, rs, t);
  // MEGA BOSS body (docs/MEGA-BOSS.md §visuals): the battlefield-scale organism anchored across
  // the top — UNDER every entity, so the field visibly exists beneath it. Null on ordinary runs.
  if (rs.megaBoss) drawMegaBody(ctx, rs.megaBoss, t);
  drawSlots(ctx, rs, occupied);
  drawBase(ctx, rs, t);

  // ── Corrosive ground fields (the mortar's acid, docs/TOWERS.md) — a SEETHING pond:
  //    layered toxic depths, a creeping wobble rim, hash-keyed bubbles rising + bursting
  //    into ringlets, and fume wisps. Time/id-keyed only (zero per-pool state); the final
  //    second visibly drains out instead of popping.
  for (const p of rs.pools) {
    const fade = Math.min(1, p.remaining);
    const acid = '158, 226, 60';
    const deep = '61, 100, 20';
    const g = ctx.createRadialGradient(p.x, p.y, p.radius * 0.1, p.x, p.y, p.radius);
    g.addColorStop(0, rgba(acid, 0.32 * fade));
    g.addColorStop(0.55, rgba(acid, 0.15 * fade));
    g.addColorStop(1, rgba(deep, 0.3 * fade));
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = rgba(acid, 0.5 * fade);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const rr = p.radius * (1 + 0.035 * Math.sin(a * 5 + t * 2.1 + p.id));
      const px = p.x + Math.cos(a) * rr;
      const py = p.y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ring(ctx, p.x, p.y, p.radius * 0.78, rgba(acid, 0.18 * fade), 1, [4, 7]);
    const bubbles = p.radius > 40 ? 7 : 5;
    for (let i = 0; i < bubbles; i++) {
      const h1 = hash01(p.id * 37 + i * 11);
      const h2 = hash01(p.id * 53 + i * 7);
      const cyc = (t * (0.5 + h1 * 0.5) + h2) % 1;
      const bx = p.x + Math.cos(h1 * Math.PI * 2) * h2 * p.radius * 0.75;
      const by = p.y + Math.sin(h1 * Math.PI * 2) * h2 * p.radius * 0.75 - cyc * 4;
      if (cyc < 0.8) {
        const br = (0.6 + cyc * 2.6) * (0.8 + h1);
        ctx.fillStyle = rgba(acid, (0.5 - cyc * 0.35) * fade);
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(235,255,210,${(0.5 - cyc * 0.4) * fade})`;
        ctx.beginPath();
        ctx.arc(bx - br * 0.3, by - br * 0.3, br * 0.3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const k = (cyc - 0.8) / 0.2;
        ring(ctx, bx, by, 2 + k * 5, rgba(acid, (1 - k) * 0.5 * fade), 1);
      }
    }
    for (let i = 0; i < 2; i++) {
      const h = hash01(p.id * 71 + i * 13);
      const cyc = (t * 0.35 + h) % 1;
      const fx = p.x + (h - 0.5) * p.radius * 0.9 + Math.sin(t * 1.3 + i * 2 + p.id) * 5 * cyc;
      const fy = p.y - cyc * (18 + h * 10);
      ctx.fillStyle = rgba(acid, (1 - cyc) * 0.1 * fade);
      ctx.beginPath();
      ctx.arc(fx, fy, 3 + cyc * 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Boss corruption pools (docs/BOSS-DESIGN.md §siege): sick violet ground-rot — towers
  // inside hit softer. The seething edge + fading alpha read the zone AND its lifetime.
  for (const cp of rs.corruptionPools) {
    const fade = Math.min(1, cp.t / 1.2); // last-second fade-out
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, cp.r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(hexRgb('#7a2fae'), 0.14 * fade);
    ctx.fill();
    ring(ctx, cp.x, cp.y, cp.r * pulse(t * 1.4, 3, 0.97, 1.02), rgba(hexRgb('#b64dff'), 0.5 * fade), 1.5, [5, 6]);
    ring(ctx, cp.x, cp.y, cp.r * 0.55, rgba(hexRgb('#7a2fae'), 0.3 * fade), 1);
  }

  // Blight Sower spore mines (docs/SOWER.md): armed pods dotted on the approach — a growing
  // bud (arm fuse), then a slow pulse with a faint trigger ring. Empty on every other run.
  for (const m of rs.mines) {
    const c = hexRgb(towerSkins.sower?.primary ?? TOWER_DEFS.sower.color);
    const grow = m.arm > 0 ? Math.max(0.25, 1 - m.arm / 0.8) : 1;
    const puls = m.arm > 0 ? 1 : pulse(t * 2 + m.id, 1, 0.85, 1.15);
    glowDisc(ctx, m.x, m.y, 9 * grow * puls, rgba(c, m.arm > 0 ? 0.18 : 0.3));
    drawShape(ctx, 'circle', m.x, m.y, 4.5 * grow * puls, rgba(c, m.arm > 0 ? 0.55 : 0.95));
    drawShape(ctx, 'circle', m.x, m.y - 1, 1.6 * grow, 'rgba(255,255,255,0.5)');
    if (m.arm <= 0) ring(ctx, m.x, m.y, 13 * puls, rgba(c, 0.28), 1, [3, 4]);
  }
  // ASSIMILATION gore (render/gore.ts): ingest this frame's deaths + advance the pieces, then lay the
  // settled viscera/juice DECALS on the floor (under towers + bodies). Flying pieces draw over, below.
  ingestDeaths(rs);
  updateGore(t);
  drawGoreFloor(ctx);
  drawOverchargeLinks(ctx, rs);
  for (const tw of rs.towers) {
    const fed = goreThrob(`t${tw.id}`); // XP shards just coalesced in ⇒ a satisfying feed-throb
    if (fed > 0.01) { ctx.save(); ctx.translate(tw.x, tw.y); const s = 1 + fed * 0.13; ctx.scale(s, s); ctx.translate(-tw.x, -tw.y); }
    drawTower(ctx, tw, t, cosmeticTiers[tw.kind] ?? 0, tw.id === rs.selectedPlacedId, starTiers[tw.kind] ?? 0, adaptTiers[tw.kind] ?? 0, towerSkins[tw.kind], mulligans[tw.kind]);
    if (fed > 0.01) ctx.restore();
  }
  drawLandingImpacts(ctx, rs, t); // relocation landing impact
  drawMoveOverlay(ctx, rs, t); // move-mode targets + holographic pickup

  for (const p of rs.projectiles) drawProjectile(ctx, p, p.sourceKind ? towerSkins[p.sourceKind] : undefined);
  drawEnemyShells(ctx, rs); // artillery bombardment arcs (empty array on the golden path)

  // LOD: drop per-enemy embellishments when the swarm is huge (perf headroom).
  const detail = rs.enemies.length < PERF.lodEnemyCount;
  updateEnemyMotion(rs.enemies, t); // per-id velocity + spawn age + death reaping (presentation only)
  if (detail) drawDeathEchoes(ctx, t); // fading crumples UNDER the living bodies
  for (const e of rs.enemies) drawEnemy(ctx, e, detail, t);
  drawGorePieces(ctx); // gibs + juice + coalescing streams, OVER the bodies

  // MEGA weak-point organs + raid-fire tracers — over enemies (they are the priority targets).
  if (rs.megaBoss) {
    drawMegaOrgans(ctx, rs.megaBoss, t);
    drawMegaShots(ctx, rs);
  }
  drawBeams(ctx, rs, t, towerSkins); // Resonance Coil channels (over enemies, so the melt reads on the target)
  drawParticles(ctx, rs);
  drawMinions(ctx, rs, t);
  drawHeroes(ctx, rs, cosmeticTiers, heroStarTiers, heroEvo, heroSkins);
  drawEmergency(ctx, rs, t); // Emergency Defense Mode alert (over the field, under labels)
  drawPointer(ctx, rs, pointer);

  for (const f of rs.floats) {
    ctx.globalAlpha = Math.min(1, f.life * 2);
    if (f.kind === 'crit') {
      // CRIT (docs/GAME-FEEL.md): pop-in scale (overshoot → settle), heavier type, a burst
      // ring in the first beat — critical hits should feel like small explosions.
      const age = Math.max(0, 0.7 - f.life); // floats are pushed with life 0.7
      const popIn = Math.min(1, age / 0.12);
      const scale = 1 + 0.5 * (1 - popIn) + 0.12 * Math.max(0, 1 - age * 5);
      if (age < 0.22) {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = (1 - age / 0.22) * 0.8;
        ctx.beginPath();
        ctx.arc(f.x, f.y - 4, 6 + age * 60, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = Math.min(1, f.life * 2);
      }
      ctx.fillStyle = f.color;
      ctx.font = `900 ${Math.round(17 * scale)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    } else {
      ctx.fillStyle = f.color;
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';

  drawPressureVignette(ctx, pressure, danger, t);
  if (rs.megaBoss) drawMegaVignette(ctx, rs.megaBoss, t); // the organism's screen-space presence
  drawBiomeFx(ctx, rs, t); // hazard-pulse vignette + transition flash, over everything
}

// ── Environment ──────────────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D): void {
  // Vertical depth: cold hostile sky at the top (the invading ecosystem) fading to
  // the warm, fleshy hive at the bottom.
  const [s0, s1, s2, s3] = THEME.arena.skyStops;
  const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  g.addColorStop(0, s0);
  g.addColorStop(0.45, s1);
  g.addColorStop(0.8, s2);
  g.addColorStop(1, s3);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

/** Soft accent wash UNDER the entities — the arena reads as a distinct ecosystem. Skipped for the
 *  NEUTRAL biome (Stage mode) so the original arena look is untouched. */
function drawBiomeWash(ctx: CanvasRenderingContext2D, rs: RenderState): void {
  if (rs.biome.id === 'neutral') return;
  const rgb = biomeRgb(rs.biome.accent);
  const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  g.addColorStop(0, rgba(rgb, 0.1));
  g.addColorStop(0.5, rgba(rgb, 0.04));
  g.addColorStop(1, rgba(rgb, 0.09));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

/** Biome OVERLAYS, drawn last: a breathing hazard-pulse vignette + a brief transition flash. */
function drawBiomeFx(ctx: CanvasRenderingContext2D, rs: RenderState, t: number): void {
  if (rs.biome.id === 'neutral') return;
  const rgb = biomeRgb(rs.biome.accent);
  if (rs.hazardActive) {
    const a = 0.1 + 0.06 * pulse(t, 3, 0, 1);
    const grad = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.3, WIDTH / 2, HEIGHT / 2, HEIGHT * 0.78);
    grad.addColorStop(0, rgba(rgb, 0));
    grad.addColorStop(1, rgba(rgb, a));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  if (rs.biomeFlash > 0) {
    ctx.fillStyle = rgba(rgb, 0.28 * rs.biomeFlash);
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}

function drawTiles(ctx: CanvasRenderingContext2D): void {
  // Subtle checker so the floor reads as a tiled battlefield, not a bare grid.
  ctx.fillStyle = THEME.arena.tile;
  for (let r = 0; r < ROWS; r++) {
    for (let c = r % 2; c < COLS; c += 2) {
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }
  }
  // Grid lines, batched into a single path (one stroke for the whole lattice).
  ctx.strokeStyle = THEME.arena.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 0; c <= COLS; c++) {
    ctx.moveTo(c * CELL, 0);
    ctx.lineTo(c * CELL, HEIGHT);
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.moveTo(0, r * CELL);
    ctx.lineTo(WIDTH, r * CELL);
  }
  ctx.stroke();
}

function drawSpawnZone(ctx: CanvasRenderingContext2D, t: number): void {
  // A hostile "breeding membrane" the swarm pours out of along the top edge.
  const g = ctx.createLinearGradient(0, 0, 0, SPAWN_BAND);
  g.addColorStop(0, rgba(THEME.spawn.membrane, pulse(t, 1.6, 0.16, 0.26)));
  g.addColorStop(0.6, THEME.spawn.haze);
  g.addColorStop(1, 'rgba(70, 180, 140, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, SPAWN_BAND);

  // membrane edge — a living, rippling seam
  ctx.strokeStyle = rgba(THEME.spawn.edge, pulse(t, 1.6, 0.4, 0.7));
  ctx.lineWidth = 2;
  ctx.beginPath();
  const yb = SPAWN_BAND;
  for (let x = 0; x <= WIDTH; x += 12) {
    const yy = yb + Math.sin(x * 0.05 + t * 1.5) * 3;
    if (x === 0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  }
  ctx.stroke();

  // egg-sac bumps studding the seam (ride the same ripple; each carries a dim ovum glint)
  for (let x = 24; x < WIDTH; x += 48) {
    const yy = yb + Math.sin(x * 0.05 + t * 1.5) * 3;
    ctx.fillStyle = rgba(THEME.spawn.membrane, 0.5);
    ctx.beginPath();
    ctx.arc(x, yy - 1, 3.2 + Math.sin(x * 1.7) * 1.2, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = rgba(THEME.spawn.edge, pulse(t * 1.3 + x, 2, 0.15, 0.5));
    ctx.beginPath();
    ctx.arc(x - 1, yy - 2.4, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  // spore drizzle sifting out of the membrane — the swarm's breath
  for (let i = 0; i < 10; i++) {
    const h = hash01(i * 29 + 3);
    const f = (t * (0.25 + h * 0.3) + h) % 1;
    const sx = hash01(i * 31 + 8) * WIDTH + Math.sin(t + i) * 8;
    ctx.fillStyle = rgba(THEME.spawn.edge, (1 - f) * 0.35);
    ctx.beginPath();
    ctx.arc(sx, yb + f * 46, 1.4 + h, 0, Math.PI * 2);
    ctx.fill();
  }

  // descending chevrons — the swarm's direction of advance (eased so they fall
  // with a little gravity before looping).
  ctx.fillStyle = THEME.spawn.chevron;
  const y = 6 + easeOutCubic(((t * 18) % 28) / 28) * 22;
  for (let x = CELL; x < WIDTH; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x - 7, y);
    ctx.lineTo(x + 7, y);
    ctx.lineTo(x, y + 7);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = THEME.spawn.label;
  chevronDown(ctx, 11, 5, 7, THEME.spawn.label);
  ctx.font = '700 10px system-ui, sans-serif';
  ctx.fillText('ENEMY SPAWN', 19, 12);
}

function drawDefenseZone(ctx: CanvasRenderingContext2D, t: number, pressure: number): void {
  const grad = ctx.createLinearGradient(0, DEFENSE_TOP_Y, 0, HEIGHT);
  grad.addColorStop(0, rgba(THEME.defense.zone, 0.04 + pressure * 0.06));
  grad.addColorStop(1, rgba(THEME.defense.zone, 0.12 + pressure * 0.12));
  ctx.fillStyle = grad;
  ctx.fillRect(0, DEFENSE_TOP_Y, WIDTH, HEIGHT - DEFENSE_TOP_Y);

  // The defensive line — a glowing energy barrier (flows + brightens under pressure).
  const glow = pulse(t, 2, 0.4, 0.7) + pressure * 0.3;
  ctx.save();
  ctx.shadowColor = THEME.defense.glow;
  ctx.shadowBlur = 8 + pressure * 10;
  ctx.strokeStyle = rgba(THEME.defense.line, Math.min(1, glow));
  ctx.lineWidth = 2 + pressure * 1.5;
  ctx.setLineDash([14, 8]);
  ctx.lineDashOffset = -((t * 40) % 22);
  ctx.beginPath();
  ctx.moveTo(0, DEFENSE_TOP_Y);
  ctx.lineTo(WIDTH, DEFENSE_TOP_Y);
  ctx.stroke();
  ctx.restore();
  ctx.setLineDash([]);

  // emitter nodes studded along the barrier — reads as a built line, not a stroke
  for (let x = CELL; x < WIDTH; x += 96) {
    ctx.fillStyle = rgba(THEME.defense.node, pulse(t + x, 3, 0.35, 0.85));
    ctx.beginPath();
    ctx.arc(x, DEFENSE_TOP_Y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = rgba(THEME.defense.label, 0.7 + pressure * 0.3);
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.fillText('— HOLD THE LINE —', 8, DEFENSE_TOP_Y - 6);
}

function drawObstacles(ctx: CanvasRenderingContext2D): void {
  // Chitin outcrops, not flat plates: base fill + a lit top-left bevel, a shadowed
  // bottom-right edge, and a couple of hash-keyed growth nodules per cell.
  for (const o of obstacleCells) {
    const x0 = o.x - CELL / 2;
    const y0 = o.y - CELL / 2;
    ctx.fillStyle = THEME.obstacle.fill;
    ctx.fillRect(x0, y0, CELL, CELL);
    ctx.strokeStyle = 'rgba(200,220,255,0.1)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0 + 1, y0 + CELL - 1);
    ctx.lineTo(x0 + 1, y0 + 1);
    ctx.lineTo(x0 + CELL - 1, y0 + 1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(x0 + CELL - 1, y0 + 1);
    ctx.lineTo(x0 + CELL - 1, y0 + CELL - 1);
    ctx.lineTo(x0 + 1, y0 + CELL - 1);
    ctx.stroke();
    ctx.strokeStyle = THEME.obstacle.edge;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, CELL - 1, CELL - 1);
    for (let i = 0; i < 2; i++) {
      const h1 = hash01(o.x * 7 + o.y * 13 + i * 29);
      const h2 = hash01(o.x * 11 + o.y * 3 + i * 41);
      ctx.fillStyle = `rgba(150,170,205,${0.05 + h1 * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(x0 + 8 + h1 * (CELL - 16), y0 + 8 + h2 * (CELL - 16), 3 + h2 * 4, 2 + h1 * 3, h1 * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawHiveTendrils(ctx: CanvasRenderingContext2D, rs: RenderState, t: number): void {
  // Living veins from the core feeding its grown defenses — with visible nutrient pulses
  // traveling core→tower, so the supply line READS as a supply line.
  const { x: cx, y: cy } = nucleusPoint;
  ctx.lineWidth = 2;
  for (const tw of rs.towers) {
    ctx.strokeStyle = rgba(THEME.hive.tendril, pulse(t + tw.id, 2.4, 0.05, 0.16));
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const mx = (cx + tw.x) / 2 + Math.sin(t * 1.2 + tw.id) * 6;
    const my = (cy + tw.y) / 2;
    ctx.quadraticCurveTo(mx, my, tw.x, tw.y);
    ctx.stroke();
    const u = (t * 0.45 + tw.id * 0.37) % 1;
    const iu = 1 - u;
    const bx = iu * iu * cx + 2 * iu * u * mx + u * u * tw.x;
    const by = iu * iu * cy + 2 * iu * u * my + u * u * tw.y;
    ctx.fillStyle = rgba(THEME.hive.tendril, 0.55 * Math.sin(u * Math.PI));
    ctx.beginPath();
    ctx.arc(bx, by, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBase(ctx: CanvasRenderingContext2D, rs: RenderState, t: number): void {
  const intRatio = rs.maxIntegrity > 0 ? rs.integrity / rs.maxIntegrity : 1;
  const hurt = 1 - intRatio;
  // Impact SHUDDER (docs/HIVE-SIEGE.md §feedback): every landed bite kicks hiveHitPulse; the
  // whole organism jolts and settles. Core-local translate only — never the view (CAMERA.md §8).
  const p = rs.hiveHitPulse;
  const x = nucleusPoint.x + (p > 0.01 ? Math.sin(t * 91) * 3.2 * p : 0);
  const y = nucleusPoint.y + (p > 0.01 ? Math.cos(t * 83) * 2.6 * p : 0);
  // heartbeat — faster + more frantic as the hive is wounded; below 25% it POUNDS
  const beat = pulse(t, 3 + hurt * 4 + (intRatio < 0.25 ? 3 : 0), 0.85 - hurt * 0.05, 1.15 + hurt * 0.1);
  const R = 36 * beat;

  // Warm caustic light pooling beneath the organism — grounds it in the arena.
  const lp = ctx.createRadialGradient(x, y + 14, 2, x, y + 14, 52);
  lp.addColorStop(0, rgba(hexRgb('#ff9a7a'), 0.12 + 0.05 * (beat - 0.85)));
  lp.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lp;
  ctx.beginPath();
  ctx.ellipse(x, y + 14, 52, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  glowDisc(ctx, x, y, R, THEME.hive.glow[0]);

  // Emergency Defense Mode: the core flares brighter — the heart of the alarm.
  const emr = rs.emergencyRamp;
  if (emr > 0.01) {
    const flare = 0.85 + 0.15 * pulse(t, 7, 0, 1);
    glowDisc(ctx, x, y, R * (1.5 + 0.6 * emr) * flare, rgba(THEME.defense.zone, 0.5 * emr));
  }
  // Critical condition (≤25%): emergency lighting — a red under-flicker independent of the
  // committed danger state; the organism itself is failing.
  if (intRatio <= 0.25) {
    glowDisc(ctx, x, y, R * 1.7, rgba(hexRgb('#ff3e4c'), 0.1 + 0.1 * pulse(t, 9, 0, 1)));
  }

  // a slowly rotating containment shell around the core — and a counter-rotating outer
  // lattice, so the organism reads as layered machinery of flesh
  ctx.save();
  ctx.strokeStyle = THEME.hive.shell;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 9]);
  ctx.lineDashOffset = -((t * 20) % 14);
  ctx.beginPath();
  ctx.arc(x, y, 23 * beat, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(hexRgb('#ffb4a2'), 0.22);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 11]);
  ctx.lineDashOffset = (t * 26) % 14; // opposite direction
  ctx.beginPath();
  ctx.arc(x, y, 29 * beat, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.setLineDash([]);

  // orbiting mitochondria motes — tiny satellites feeding the heart
  for (let i = 0; i < 3; i++) {
    const a = t * (0.5 + i * 0.17) + i * 2.1;
    const orbR = (27 + i * 4) * beat;
    const mx = x + Math.cos(a) * orbR;
    const my = y + Math.sin(a) * orbR * 0.8;
    glowDisc(ctx, mx, my, 3.2, rgba(hexRgb('#ffd9a0'), 0.45));
    drawShape(ctx, 'circle', mx, my, 1.3, 'rgba(255,240,220,0.9)');
  }

  // organic membrane body — two soft harmonics so the organ visibly SQUIRMS, never a hard
  // circle; shaded from a lit upper-left toward a deep venous rim
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const rr = 15 * beat * (1 + 0.06 * Math.sin(a * 3 + t * 1.7) + 0.04 * Math.sin(a * 5 - t * 2.3));
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const bodyG = ctx.createRadialGradient(x - 5, y - 6, 2, x, y, 16 * beat);
  bodyG.addColorStop(0, '#ff8ba0');
  bodyG.addColorStop(0.55, THEME.hive.body);
  bodyG.addColorStop(1, '#a5303f');
  ctx.fillStyle = bodyG;
  ctx.fill();

  // ── DAMAGE STATES (docs/HIVE-SIEGE.md §states): the shell visibly fails as integrity falls.
  //    Deterministic geometry (id-hashed angles, no rng) — stable frame to frame.
  if (intRatio < 0.98) {
    const cracks = Math.min(9, 1 + Math.floor(hurt * 9)); // hairlines → ruptures
    ctx.strokeStyle = rgba(hexRgb('#1a0d12'), 0.35 + 0.45 * hurt);
    for (let i = 0; i < cracks; i++) {
      const a = i * 2.399 + 0.7; // golden-angle spread — organic, non-repeating
      const wob = Math.sin(i * 7.31) * 0.35;
      const r0 = 4 + (i % 3) * 3;
      const r1 = 6 + (0.35 + 0.65 * hurt) * (11 + (i % 4) * 3); // deeper wounds reach further
      ctx.lineWidth = i < 3 ? 1 + hurt * 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      ctx.lineTo(x + Math.cos(a + wob * 0.3) * r1, y + Math.sin(a + wob * 0.3) * r1);
      ctx.stroke();
    }
  }
  // Open wounds + ichor seep from 50% down; severe rupture glow near collapse.
  if (intRatio < 0.5) {
    const wounds = intRatio < 0.25 ? 4 : 2;
    for (let i = 0; i < wounds; i++) {
      const a = 1.1 + i * 1.7;
      const wx = x + Math.cos(a) * 11;
      const wy = y + Math.sin(a) * 11;
      const drip = (t * 3 + i) % 1; // slow ichor pulse
      drawShape(ctx, 'circle', wx, wy, 2.5 + hurt * 2 + drip * 0.8, rgba(hexRgb('#7a1f2b'), 0.7));
      drawShape(ctx, 'circle', wx, wy + drip * 4, 1.1, rgba(hexRgb('#a83242'), 0.55 * (1 - drip)));
    }
  }
  if (intRatio <= 0.1) {
    // Near collapse: the whole body flickers — an organism losing coherence.
    glowDisc(ctx, x, y, R * (1 + 0.25 * pulse(t, 13, 0, 1)), rgba(hexRgb('#ff3e4c'), 0.18));
  }

  drawShape(ctx, 'circle', x, y, 5 * beat, THEME.hive.core);

  // Impact flash ring — expands and fades with the hit pulse.
  if (p > 0.03) {
    ring(ctx, x, y, 17 + (1 - p) * 14, rgba(hexRgb('#ffd9a0'), 0.5 * p), 1.5 + p * 2);
  }

  ctx.fillStyle = THEME.hive.label;
  ctx.font = '700 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('HIVE CORE', x, y + 34);
  ctx.textAlign = 'left';
}

/**
 * Emergency Defense Mode feedback (docs/RANGE.md §4.4). Drawn over the field, under the
 * floating labels. Everything is gated behind `emergencyRamp` (0..1, eased by the sim) so
 * the alert fades in/out instead of popping. Deliberately restrained — a soft red zone
 * wash, one animated edge line, and beams converging on the breach — NO particle bursts or
 * full-screen flashes, so the signal reads instantly without burying the battlefield.
 */
function drawEmergency(ctx: CanvasRenderingContext2D, rs: RenderState, t: number): void {
  const emr = rs.emergencyRamp;
  if (emr <= 0.01) return;
  const zoneTop = FINAL_DEFENSE_TOP_Y;

  // 1) subtle pulsing red wash over the Final Defense Zone (low alpha: units stay readable)
  ctx.fillStyle = rgba(THEME.defense.zone, (0.05 + 0.05 * pulse(t, 5, 0, 1)) * emr);
  ctx.fillRect(0, zoneTop, WIDTH, HEIGHT - zoneTop);

  // 2) an animated alert line sweeping the zone's leading edge (the "HOLD THE LINE"
  //    barrier escalating to an alarm)
  ctx.save();
  ctx.strokeStyle = rgba(THEME.defense.line, (0.5 + 0.4 * pulse(t, 4, 0, 1)) * emr);
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 10]);
  ctx.lineDashOffset = -((t * 60) % 24);
  ctx.beginPath();
  ctx.moveTo(0, zoneTop);
  ctx.lineTo(WIDTH, zoneTop);
  ctx.stroke();
  ctx.restore();
  ctx.setLineDash([]);

  // 3) targeting beams: every offensive tower converges a fading lock-on line on the
  //    deepest in-zone threat (the focus). One batched path = cheap at any tower count.
  if (emr > 0.05) {
    const fx = rs.emergencyFocusX;
    const fy = rs.emergencyFocusY;
    ctx.save();
    ctx.strokeStyle = rgba(THEME.defense.zone, 0.28 * emr);
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -((t * 120) % 14); // fast travel toward the breach
    ctx.beginPath();
    for (const tw of rs.towers) {
      const firing = TOWER_DEFS[tw.kind].firing;
      if (firing !== 'homing' && firing !== 'splash' && firing !== 'infest') continue;
      ctx.moveTo(tw.x, tw.y);
      ctx.lineTo(fx, fy);
    }
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
    // a small reticle pulsing on the focused breach
    ring(ctx, fx, fy, 11 + 3 * pulse(t, 6, 0, 1), rgba(THEME.defense.line, 0.7 * emr), 1.5);
  }
}

// ── Slots / towers (placement system from the battlefield refactor) ───────────

function drawSlots(ctx: CanvasRenderingContext2D, rs: RenderState, occupied: Set<number>): void {
  const s = CELL - 10;
  for (const slot of towerSlots) {
    if (occupied.has(slot.index)) continue;
    const locked = slot.index >= rs.unlockedSlots;
    const x = slot.x - s / 2;
    const y = slot.y - s / 2;

    if (locked) {
      roundRectPath(ctx, x, y, s, s, 6);
      ctx.strokeStyle = THEME.slot.locked;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      padlock(ctx, slot.x, slot.y, 11, THEME.slot.lockedLabel);
      continue;
    }

    // an inviting "build pad": soft plate, recessed socket shading, pulsing corner
    // brackets, center cross — reads as a machined bio-socket, not a flat square.
    roundRectPath(ctx, x, y, s, s, 6);
    ctx.fillStyle = THEME.slot.pad;
    ctx.fill();
    const ig = ctx.createRadialGradient(slot.x, slot.y, 2, slot.x, slot.y, s * 0.7);
    ig.addColorStop(0, 'rgba(0,0,0,0.2)');
    ig.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ig;
    ctx.fill();
    ctx.strokeStyle = THEME.slot.padEdge;
    ctx.lineWidth = 1;
    ctx.stroke();

    const a = pulse(rs.time + slot.index, 1.6, 0.45, 0.8);
    ctx.strokeStyle = rgba(THEME.slot.bracket, a);
    ctx.lineWidth = 1.5;
    drawCorners(ctx, slot.x, slot.y, s, 6);

    ctx.strokeStyle = rgba(THEME.slot.bracket, a * 0.7);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(slot.x - 4, slot.y);
    ctx.lineTo(slot.x + 4, slot.y);
    ctx.moveTo(slot.x, slot.y - 4);
    ctx.lineTo(slot.x, slot.y + 4);
    ctx.stroke();
  }
}

/** Short L-ticks at the four corners of a square centered at (cx,cy). */
function drawCorners(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, len: number): void {
  const h = s / 2;
  ctx.beginPath();
  ctx.moveTo(cx - h, cy - h + len); ctx.lineTo(cx - h, cy - h); ctx.lineTo(cx - h + len, cy - h);
  ctx.moveTo(cx + h - len, cy - h); ctx.lineTo(cx + h, cy - h); ctx.lineTo(cx + h, cy - h + len);
  ctx.moveTo(cx + h, cy + h - len); ctx.lineTo(cx + h, cy + h); ctx.lineTo(cx + h - len, cy + h);
  ctx.moveTo(cx - h + len, cy + h); ctx.lineTo(cx - h, cy + h); ctx.lineTo(cx - h, cy + h - len);
  ctx.stroke();
}

function drawOverchargeLinks(ctx: CanvasRenderingContext2D, rs: RenderState): void {
  for (const t of rs.towers) {
    if (!t.overcharged) continue;
    ring(ctx, t.x, t.y, pulse(rs.time + t.id, 3, 16, 19), THEME.overcharge, 2);
  }
}

// ── Tower relocation (docs/TOWER-MANAGEMENT.md §3) — move-mode targets + holographic pickup ──
function drawMoveOverlay(ctx: CanvasRenderingContext2D, rs: RenderState, t: number): void {
  if (rs.movingTowerId === null) return;
  const occupied = new Set(rs.towers.map((x) => x.slot));
  const s = CELL - 10;
  // Every VALID empty unlocked slot pulses as a landing target; occupied/locked stay disabled.
  for (const slot of towerSlots) {
    if (slot.index >= rs.unlockedSlots || occupied.has(slot.index)) continue;
    const a = pulse(t * 1.5 + slot.index, 1.4, 0.4, 0.95);
    roundRectPath(ctx, slot.x - s / 2, slot.y - s / 2, s, s, 6);
    ctx.fillStyle = rgba(THEME.select.valid, 0.1 * a);
    ctx.fill();
    ctx.strokeStyle = rgba(THEME.select.valid, a);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // The picked-up tower: a hovering holographic silhouette + a dashed pickup ring.
  const tw = rs.towers.find((x) => x.id === rs.movingTowerId);
  if (tw) {
    ring(ctx, tw.x, tw.y, 16 + 2 * pulse(t, 4, 0, 1), rgba(THEME.select.valid, 0.85), 2, [5, 4]);
    const lift = 5 + 2 * pulse(t, 3, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.5;
    glowDisc(ctx, tw.x, tw.y - lift, 13, TOWER_DEFS[tw.kind].color);
    ctx.restore();
    labelAt(ctx, tw.x, tw.y - CELL / 2 - 6, 'MOVING — tap a slot', TOWER_DEFS[tw.kind].color);
  }
}

/** Expanding impact ring right after a tower lands from a relocation (reads `movedAt`). */
function drawLandingImpacts(ctx: CanvasRenderingContext2D, rs: RenderState, t: number): void {
  for (const tw of rs.towers) {
    const age = t - tw.movedAt;
    if (age < 0 || age > 0.45) continue; // recent relocation only (movedAt = -100 when never moved)
    const k = age / 0.45;
    ring(ctx, tw.x, tw.y, 8 + k * 26, rgba(THEME.select.valid, (1 - k) * 0.8), 2.5);
  }
}

const TOWER_GROW = 0.35; // seconds for a placed tower to scale up to full size

/** The Marrow Siphon's continuous drain ray (docs/SIPHON.md). A tapered glowing beam from the organ
 *  to its locked target, thickening + whitening with the Gorge `heat` (0..1); corpuscles flow BACK
 *  along it toward the tower (the drain direction) and an impact bloom marks where it bites. Pure
 *  presentation — driven by the sim's render-only beam fields; never affects gameplay. */
function drawSiphonBeam(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, heat: number, now: number, color: string, id: number): void {
  const rgb = hexRgb(color);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len;
  const ny = dy / len;
  const width = 2 + heat * 4;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(rgb, 0.12 + heat * 0.18); // outer glow
  ctx.lineWidth = width * 2.6;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = rgba(rgb, 0.5 + heat * 0.4); // core
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  if (heat > 0.5) { // a superheated white centre once gorged
    ctx.strokeStyle = rgba('255,255,255', (heat - 0.5) * 0.9);
    ctx.lineWidth = Math.max(1, width * 0.4);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  const beads = 4; // corpuscles drawn flowing target→tower (the drain)
  for (let i = 0; i < beads; i++) {
    const f = (now * (0.6 + heat) + i / beads) % 1;
    drawShape(ctx, 'circle', x1 - nx * len * f, y1 - ny * len * f, 1.6 + heat * 1.6, rgba('255,255,255', 0.8));
  }
  glowDisc(ctx, x1, y1, 5 + heat * 8 + Math.sin(now * 12 + id) * 1.5, color); // impact bloom
  ctx.restore();
}

/** Phenotype idle AURA (docs/COSMETICS.md) — a family-keyed flourish around a themed unit.
 *  Deterministic (time/id-keyed) and cheap (≤6 ops); drawn under the unit's organ layers. */
function drawCosmeticAura(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, skin: CosmeticTheme, now: number, id: number): void {
  const pc = hexRgb(skin.primary);
  const gc = hexRgb(skin.glow);
  switch (skin.aura) {
    case 'ember': // cinders rising off the chassis
      for (let i = 0; i < 3; i++) {
        const f = (now * (0.4 + 0.2 * hash01(id * 7 + i)) + i / 3) % 1;
        ctx.fillStyle = rgba(gc, (1 - f) * 0.55);
        ctx.beginPath();
        ctx.arc(x + Math.sin((now + i * 2.1) * 1.7) * r * 0.7, y - f * r * 1.9, 1 + (1 - f) * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'frost': // a slow crystalline ring + a glint
      ring(ctx, x, y, r * 1.5 * pulse(now * 0.5 + id, 2, 0.97, 1.03), rgba(gc, 0.3), 1, [2, 6]);
      drawShape(ctx, 'diamond', x + Math.cos(now * 0.6 + id) * r * 1.5, y + Math.sin(now * 0.6 + id) * r * 1.5, 1.8, rgba(gc, 0.8));
      break;
    case 'verdant': // drifting spores
      for (let i = 0; i < 3; i++) {
        const a = now * 0.4 + (i / 3) * Math.PI * 2 + id;
        ctx.fillStyle = rgba(pc, 0.4 + 0.2 * Math.sin(now * 2 + i));
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * r * (1.3 + 0.2 * Math.sin(now + i)), y + Math.sin(a) * r * (1.1 + 0.2 * Math.cos(now + i)), 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'void': // a dark halo the light bends around + one orbiting mote
      glowDisc(ctx, x, y, r * 1.9, 'rgba(8,4,18,0.4)');
      ring(ctx, x, y, r * 1.45, rgba(pc, 0.35), 1.2, [8, 5]);
      drawShape(ctx, 'circle', x + Math.cos(-now * 0.9 + id) * r * 1.45, y + Math.sin(-now * 0.9 + id) * r * 1.45, 1.6, rgba(gc, 0.9));
      break;
    case 'gilded': // laurels of living gold — a double ring + timed glints
      ring(ctx, x, y, r * 1.4, rgba(pc, 0.45), 1.2);
      ring(ctx, x, y, r * 1.6, rgba(pc, 0.2), 1);
      if ((now + id) % 2 < 0.3) {
        const k = ((now + id) % 2) / 0.3;
        drawShape(ctx, 'diamond', x + r, y - r, 2.5 * (1 - k), rgba(gc, 1 - k));
      }
      break;
    case 'abyss': // a wound in the light — pulsing dark-red rim + a slow inner throb
      ring(ctx, x, y, r * (1.35 + 0.08 * Math.sin(now * 2.4 + id)), rgba(pc, 0.5), 1.6);
      glowDisc(ctx, x, y, r * 1.1 * pulse(now, 1.2, 0.9, 1.1), 'rgba(30,8,20,0.5)');
      break;
  }
}

/** Per-kind resolved Mulligan the renderer needs to draw its organism (docs/MULLIGANS.md). */
export interface MulliganRender { resolved: ResolvedMulligan; visualSeed: number; animSeed: number }

function drawTower(ctx: CanvasRenderingContext2D, tw: RenderState['towers'][number], now: number, tier = 0, selected = false, stars = 0, adaptTier = 0, skin?: CosmeticTheme, mulligan?: MulliganRender): void {
  const def = TOWER_DEFS[tw.kind];
  // Phenotype re-expression (docs/COSMETICS.md): the equipped skin's primary replaces the
  // def color EVERYWHERE this body paints; absent skin ⇒ the exact pre-cosmetics look.
  const kcolor = skin?.primary ?? def.color;

  // grow-on-place → idle breathing → a recoil punch right after firing.
  const grow = easeOutCubic(Math.min(1, Math.max(0, (now - tw.bornAt) / TOWER_GROW)));
  if (grow <= 0.001) return;
  // ROOTING (docs/GAME-FEEL.md): while young, bio tendrils crawl outward and sink in — the
  // tower visibly takes hold of the terrain instead of popping into place.
  const rootAge = now - tw.bornAt;
  if (rootAge < 0.8) {
    const rp = Math.min(1, rootAge / 0.8);
    const reach = (10 + 16 * easeOutCubic(rp)) * grow;
    ctx.save();
    ctx.globalAlpha = 0.65 * (1 - rp);
    ctx.strokeStyle = kcolor;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + tw.id * 1.7; // stable per tower — no flicker
      const wob = Math.sin(now * 6 + i * 2.1) * 2.5;
      ctx.beginPath();
      ctx.moveTo(tw.x + Math.cos(a) * 6, tw.y + Math.sin(a) * 6);
      ctx.quadraticCurveTo(
        tw.x + Math.cos(a) * reach * 0.6 + wob, tw.y + Math.sin(a) * reach * 0.6 - wob,
        tw.x + Math.cos(a) * reach, tw.y + Math.sin(a) * reach,
      );
      ctx.stroke();
    }
    ctx.restore();
  }
  const breathe = pulse(now + tw.id, 2, 0.97, 1.03);
  // cooldown counts down from fireInterval → 0; it's highest right after a shot.
  const fresh = def.fireInterval > 0 ? Math.min(1, Math.max(0, (tw.cooldown / def.fireInterval - 0.7) / 0.3)) : 0;
  // GROWTH (TOWER-BRANCHES.md §9): a branched tower's whole silhouette swells with its tier, so an
  // evolved tower is bigger + bolder than a fresh one — and the swell ANIMATES in over the grow-in
  // window after a purchase. Identity (×1) when unbranched ⇒ golden look.
  // Body swells with BOTH the in-run branch tier AND the permanent STAR count (docs/
  // TOWER-VISUAL-EVOLUTION.md). Both are ×1 at zero ⇒ a fresh/unbranched tower is unchanged.
  const r = TOWER_R * grow * breathe * (1 + fresh * 0.1)
    * evolutionGrowthAnimated(tw.branchId, tw.tier, now - tw.mutatedAt)
    * starEvolutionGrowth(tw.kind, stars);

  // (Range/field circles are intentionally NOT drawn permanently — they cluttered play
  // and, for the long-range towers, were near-fullscreen and uninformative. Range is now
  // shown only on placement preview + selection; see drawRangeIndicator. The Obelisk keeps
  // a faint always-on psionic shimmer for identity, but no hard range ring.)
  if (tw.kind === 'obelisk') {
    const shimmer = TOWER_R * 2.4 * grow * pulse(now + tw.id, 1.4, 0.95, 1.08);
    glowDisc(ctx, tw.x, tw.y, shimmer, rgba(THEME.field.edge, 0.05));
  }

  // grounding shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(tw.x, tw.y + r * 0.7, r * 0.85, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // muzzle flash above firing towers (enemies are upfield) on the recoil frames — a branched
  // tower's flash grows with tier (attack-animation escalation, TOWER-BRANCHES.md §9).
  if (fresh > 0.01) {
    glowDisc(ctx, tw.x, tw.y - r * 0.8, r * (0.7 + fresh + tw.tier * 0.08), skin?.glow ?? kcolor);
  }

  // Marrow Siphon (docs/SIPHON.md): the live drain ray, drawn UNDER the body so the organ sits over
  // the socket while the beam reaches out over the swarm. beamX/Y are set only while a lock is live
  // (render-only fields), so an idle siphon — and every non-siphon tower — draws nothing here.
  if (tw.kind === 'siphon' && tw.beamX !== undefined && tw.beamY !== undefined) {
    drawSiphonBeam(ctx, tw.x, tw.y - r * 0.2, tw.beamX, tw.beamY, tw.beamHeat ?? 0, now, kcolor, tw.id);
  }

  // The procedural TURRET body (render/towerForms.ts) — a rooted structure + firing apparatus that
  // recoils on `fresh` and idles with `breathe`. Replaces the flat placeholder shape; the per-kind
  // organs + all evolution layers below still draw over it.
  drawTowerForm(ctx, tw.kind, tw.x, tw.y, r, kcolor, now, fresh, breathe);
  if (skin) drawCosmeticAura(ctx, tw.x, tw.y, r, skin, now, tw.id);

  if (tw.kind === 'reactor') {
    drawShape(ctx, 'circle', tw.x, tw.y, 5 * grow * breathe, 'rgba(255,255,255,0.3)');
  } else if (tw.kind === 'parasite') {
    // a clutch of twitching egg-sacs slowly churning around a pale core
    const sacs = 4;
    for (let i = 0; i < sacs; i++) {
      const a = now * 0.6 + (i * Math.PI * 2) / sacs;
      const rr = r * 0.5;
      drawShape(ctx, 'circle', tw.x + Math.cos(a) * rr, tw.y + Math.sin(a) * rr, r * 0.22 * breathe, 'rgba(255, 200, 255, 0.55)');
    }
    drawShape(ctx, 'circle', tw.x, tw.y, r * 0.3 * breathe, 'rgba(255,255,255,0.28)');
  } else if (tw.kind === 'obelisk') {
    // orbiting glyph ring + a bright psionic core eye
    ring(ctx, tw.x, tw.y, r * 1.35, rgba(THEME.field.edge, pulse(now + tw.id, 3, 0.3, 0.6)), 1.2, [4, 5]);
    drawShape(ctx, 'diamond', tw.x, tw.y - r * 0.1, r * 0.32 * breathe, 'rgba(255,255,255,0.45)');
  } else if (tw.kind === 'coil') {
    // a focusing lens whose core EYE brightens with resonance heat (the melt "charging up"), plus a
    // slow rotating lens ring. beamHeat is 0 when idle ⇒ a cool, dim emitter.
    const heat = tw.beamHeat;
    const c = hexRgb(kcolor);
    ring(ctx, tw.x, tw.y, r * 1.25, rgba(c, 0.24 + heat * 0.5), 1.2 + heat * 1.2, [3, 4]);
    glowDisc(ctx, tw.x, tw.y, r * (0.7 + heat * 0.9), rgba(c, 0.35 + heat * 0.5));
    drawShape(ctx, 'circle', tw.x, tw.y, r * (0.26 + heat * 0.14) * breathe, rgba('255, 255, 255', 0.7 + heat * 0.25));
  } else if (tw.kind === 'siphon') {
    // a lidded ocular pod: a socket ring + a crimson iris that leans toward the locked prey and
    // dilates with the Gorge heat — a drinking pupil at its centre.
    const heat = tw.beamHeat;
    ring(ctx, tw.x, tw.y, r * 1.25, rgba(hexRgb(kcolor), 0.22 + heat * 0.4), 1.4);
    let ix = tw.x;
    let iy = tw.y - r * 0.05;
    if (tw.beamX !== undefined && tw.beamY !== undefined) {
      const a = Math.atan2(tw.beamY - tw.y, tw.beamX - tw.x);
      ix = tw.x + Math.cos(a) * r * 0.32;
      iy = tw.y + Math.sin(a) * r * 0.32;
    }
    glowDisc(ctx, ix, iy, r * (0.34 + heat * 0.16) * breathe, kcolor);
    drawShape(ctx, 'circle', ix, iy, r * 0.16 * breathe, 'rgba(10,6,10,0.85)'); // the drinking pupil
  }

  // Mastery cosmetic: a veteran "halo" that grows with the tower's mastery RANK (MASTERY.md
  // visual mutations). Pure cosmetic — tier 0 (a fresh save) renders identically.
  if (tier > 0) {
    const a = pulse(now + tw.id, 1.6, 0.22, 0.5);
    ring(ctx, tw.x, tw.y, r * 1.7, rgba(hexRgb(kcolor), a), 1.4);
    if (tier >= 2) ring(ctx, tw.x, tw.y, r * 2.05, rgba(hexRgb(kcolor), a * 0.55), 1);
    const pips = Math.min(tier, 5); // orbiting rank pips
    for (let i = 0; i < pips; i++) {
      const ang = now * 0.8 + (i * Math.PI * 2) / pips;
      drawShape(ctx, 'circle', tw.x + Math.cos(ang) * r * 1.7, tw.y + Math.sin(ang) * r * 1.7, 1.7, kcolor);
    }
  }

  // ADAPTATION form stages (docs/ADAPTATION.md §visual evolution): keystone/apex picks physically
  // rewrite the strain — a living viral membrane (stage 1), rotating antigen spikes studding it
  // (stage 2), an apex corona (stage 3). Violet = the Antigen identity hue, so an adapted strain
  // reads instantly. Stage 0 (no keystone chosen) draws nothing — the fresh look is untouched.
  if (adaptTier > 0) {
    const viral = hexRgb('#c98bff');
    const wob = pulse(now * 1.15 + tw.id, 2.2, 0.96, 1.05);
    const mr = r * 1.28 * wob;
    ring(ctx, tw.x, tw.y, mr, rgba(viral, 0.3 + adaptTier * 0.08), 1 + adaptTier * 0.4);
    if (adaptTier >= 2) {
      const spikes = 3 + adaptTier * 2;
      for (let i = 0; i < spikes; i++) {
        const a = now * 0.7 + (i * Math.PI * 2) / spikes;
        drawShape(ctx, 'diamond', tw.x + Math.cos(a) * mr, tw.y + Math.sin(a) * mr, 2.2 + adaptTier * 0.4, rgba(viral, 0.75));
      }
    }
    if (adaptTier >= 3) {
      glowDisc(ctx, tw.x, tw.y, r * 2.2 * pulse(now + tw.id, 1.1, 0.9, 1.1), rgba(viral, 0.1));
    }
  }

  // STAR EVOLUTION (docs/TOWER-VISUAL-EVOLUTION.md): the PERMANENT progression made visible — a
  // tower grows a new identity organ each generation (★1/3/5/7/9), drawn from the SAME organ
  // vocabulary as branches and tinted its class hue, so star + branch read as one organism. 0
  // stars renders nothing (golden-safe look).
  if (stars > 0) drawStarEvolution(ctx, tw, stars, r, now, kcolor, fresh);

  // Branch MUTATION (TOWER-BRANCHES.md §9): a DATA-DRIVEN evolved silhouette — every tier grows a
  // new organ (limbs / armor / barrels / biomass / organs …) so two same-kind towers read
  // differently by path AND tier. Per-instance; tier 0 renders nothing (golden-safe look).
  if (tw.tier > 0) drawTowerEvolution(ctx, tw, now, r, kcolor, fresh);

  // STRAIN organs (docs/STRAIN.md §visuals): the IN-RUN evolution ladder — each level above I
  // grows an unmistakable new structure. Strain 1 renders nothing (golden-safe look).
  if (tw.strain > 1) drawStrainOrgans(ctx, tw, now, r, kcolor);

  // MULLIGAN organism (docs/MULLIGANS.md): the biomechanical secondary creature grafted onto the
  // tower — procedurally derived from its modifiers' stat profile + seeds. Inactive (fewer than
  // three modifiers) draws NOTHING, so a fresh account renders identically (golden-safe look).
  if (mulligan) drawMulliganOrganism(ctx, tw.x, tw.y, r, mulligan.resolved, mulligan.visualSeed, mulligan.animSeed, now, fresh);

  // Mutation FLASH: a one-shot shockwave + white pop the instant a tier is purchased (driven by
  // tw.mutatedAt). A settled or unbranched tower (mutatedAt ≪ now) draws nothing.
  const sinceMut = now - tw.mutatedAt;
  if (sinceMut >= 0 && sinceMut < MUTATE_FLASH) {
    const fade = 1 - sinceMut / MUTATE_FLASH;
    const c = hexRgb(kcolor);
    ring(ctx, tw.x, tw.y, r * (1.1 + easeOutCubic(1 - fade) * 2.4), rgba(c, fade * 0.7), 1 + fade * 2.5);
    glowDisc(ctx, tw.x, tw.y, r * (1.3 + fade * 1.4), rgba(WHITE, fade * 0.5));
  }

  // Selection highlight (inspected tower → its Mutation panel is open).
  if (selected) {
    ring(ctx, tw.x, tw.y, r * 2.0, rgba(hexRgb('#7ce6ff'), pulse(now, 3, 0.45, 0.85)), 2, [3, 4]);
  }
}

// Branch cosmetics (the per-instance "evolved silhouette") now live in towerEvolution.ts as a
// data-driven organ system — see drawTowerEvolution, called from drawTower above.

/** STRAIN visual ladder (docs/STRAIN.md §visuals) — deterministic, class-tinted, escalating:
 *  II eye cluster · III chitin spines · IV animated tentacle fringe · V crowned apex organ.
 *  A Strain V tower must read across the arena. */
function drawStrainOrgans(ctx: CanvasRenderingContext2D, tw: RenderState['towers'][number], now: number, r: number, color: string): void {
  const c = hexRgb(color);
  const lvl = tw.strain;
  // II — budding eye cluster (three unblinking eyes orbit-fixed on the shell)
  for (let i = 0; i < 3; i++) {
    const a = tw.id * 1.3 + (i / 3) * Math.PI * 2;
    const ex = tw.x + Math.cos(a) * r * 0.85;
    const ey = tw.y + Math.sin(a) * r * 0.85;
    drawShape(ctx, 'circle', ex, ey, 2.6, rgba(c, 0.95));
    drawShape(ctx, 'circle', ex, ey, 1.1, 'rgba(10,6,10,0.95)');
  }
  if (lvl >= 3) {
    // III — chitin spines (a hardened crown of thorns)
    ctx.strokeStyle = rgba(c, 0.8);
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = tw.id * 0.9 + (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(tw.x + Math.cos(a) * r * 1.0, tw.y + Math.sin(a) * r * 1.0);
      ctx.lineTo(tw.x + Math.cos(a) * r * 1.45, tw.y + Math.sin(a) * r * 1.45);
      ctx.stroke();
    }
  }
  if (lvl >= 4) {
    // IV — tentacle fringe (living, writhing)
    ctx.strokeStyle = rgba(c, 0.55);
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 5; i++) {
      const a = tw.id * 2.1 + (i / 5) * Math.PI * 2 + Math.sin(now * 1.8 + i) * 0.2;
      const reach = r * (1.5 + 0.25 * Math.sin(now * 2.4 + i * 1.9));
      ctx.beginPath();
      ctx.moveTo(tw.x + Math.cos(a) * r * 0.9, tw.y + Math.sin(a) * r * 0.9);
      ctx.quadraticCurveTo(
        tw.x + Math.cos(a + 0.35) * reach * 0.7, tw.y + Math.sin(a + 0.35) * reach * 0.7,
        tw.x + Math.cos(a) * reach, tw.y + Math.sin(a) * reach,
      );
      ctx.stroke();
    }
  }
  if (lvl >= 5) {
    // V — crowned apex organ + a slow recognition aura
    glowDisc(ctx, tw.x, tw.y, r * 2.6 * pulse(now + tw.id, 0.9, 0.92, 1.08), rgba(c, 0.12));
    spikeCrown(ctx, tw.x, tw.y - r * 1.15, r * 0.55, r * 0.35, 5, rgba(c, 0.95), now * 0.4);
  }
}

/** RESONANCE BEAM channels — a live line from each Resonance Coil to its locked target, brightening
 *  and fattening with the tower's resonance HEAT (the visible "melt ramp"). Purely presentational:
 *  reads Tower.beamTarget/beamHeat + the enemy positions. No coil on the field ⇒ nothing drawn. */
function drawBeams(ctx: CanvasRenderingContext2D, rs: RenderState, now: number, towerSkins: Partial<Record<string, CosmeticTheme>> = {}): void {
  let byId: Map<number, RenderState['enemies'][number]> | null = null;
  for (const tw of rs.towers) {
    if (tw.kind !== 'coil' || (tw.beamTarget < 0 && tw.beamTarget > -1000)) continue;
    // Mega weak-point channel (docs/MEGA-BOSS.md): the lock encodes as -1000 - spec — resolve the
    // organ's live coordinates from the mega view instead of the enemy map.
    let target: { x: number; y: number } | undefined;
    if (tw.beamTarget <= -1000) {
      const spec = -1000 - tw.beamTarget;
      target = rs.megaBoss?.weakPoints.find((w) => w.spec === spec && w.state === 'open');
    } else {
      if (!byId) { byId = new Map(); for (const e of rs.enemies) if (e.alive) byId.set(e.id, e); }
      target = byId.get(tw.beamTarget);
    }
    if (!target) continue;
    const c = hexRgb(towerSkins.coil?.primary ?? TOWER_DEFS.coil.color);
    const heat = tw.beamHeat;
    const sx = tw.x;
    const sy = tw.y - 4; // muzzle sits just above the lens
    // The beam WAVERS as resonance climbs — a superheated channel, not a laser pointer.
    const midx = (sx + target.x) / 2 + Math.sin(now * 11 + tw.id) * 3 * heat;
    const midy = (sy + target.y) / 2 + Math.cos(now * 9 + tw.id) * 3 * heat;
    ctx.lineCap = 'round';
    // outer resonance glow
    ctx.strokeStyle = rgba(c, 0.16 + heat * 0.34);
    ctx.lineWidth = 2.5 + heat * 6;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(midx, midy, target.x, target.y); ctx.stroke();
    // bright inner core
    ctx.strokeStyle = rgba('255, 255, 255', 0.45 + heat * 0.45);
    ctx.lineWidth = 1 + heat * 2.2;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(midx, midy, target.x, target.y); ctx.stroke();
    ctx.lineCap = 'butt';
    // energy quanta racing down the channel toward the melt point
    for (let i = 0; i < 3; i++) {
      const f = (now * (1.2 + heat * 1.6) + i / 3) % 1;
      const iu = 1 - f;
      const px = iu * iu * sx + 2 * iu * f * midx + f * f * target.x;
      const py = iu * iu * sy + 2 * iu * f * midy + f * f * target.y;
      drawShape(ctx, 'circle', px, py, 1.3 + heat * 1.5, rgba('255, 255, 255', 0.45 + heat * 0.4));
    }
    // impact bloom that pulses harder as resonance climbs — the "melting" point
    const bloom = (5 + heat * 11) * pulse(now * 8 + tw.id, 1, 0.82, 1.18);
    glowDisc(ctx, target.x, target.y, bloom, rgba(c, 0.3 + heat * 0.45));
    if (heat > 0.4) { // molten spatter flicking off the wound once the melt takes hold
      for (let i = 0; i < 3; i++) {
        const a = hash01(Math.floor(now * 10) * 3 + i + tw.id) * Math.PI * 2;
        const d = 4 + hash01(i * 17 + tw.id) * 8 * heat;
        drawShape(ctx, 'circle', target.x + Math.cos(a) * d, target.y + Math.sin(a) * d, 1 + heat, rgba(c, 0.6 * heat));
      }
    }
  }
}

function drawProjectile(ctx: CanvasRenderingContext2D, p: RenderState['projectiles'][number], skin?: CosmeticTheme): void {
  // A target-less shot fades out (game settle / mid-combat fizzle) instead of popping.
  const fading = p.fade !== undefined && p.fade < 1;
  if (fading) ctx.globalAlpha = Math.max(0, p.fade!);
  if (p.skin && drawSkinnedProjectile(ctx, p)) {
    if (fading) ctx.globalAlpha = 1;
    return; // themed branch shot; else fall through to base
  }
  const splash = p.behavior === 'splash';
  const parasite = p.behavior === 'parasite';
  // Phenotype shot light: the firing tower's equipped theme re-tints the base comet
  // (branch skins above keep their authored identity — a branch IS an identity).
  const core = skin ? skin.glow : splash ? THEME.projectile.splash : parasite ? THEME.projectile.parasite : THEME.projectile.bolt;
  const trail = skin ? hexRgb(skin.primary) : splash ? THEME.projectile.splashTrail : parasite ? THEME.projectile.parasiteTrail : THEME.projectile.boltTrail;

  // heading toward the target point — the trail streams out behind it
  let ux = p.tx - p.x;
  let uy = p.ty - p.y;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len;
  uy /= len;
  const head = splash ? 3.7 : parasite ? 2.9 : 2.4;
  const tlen = splash ? 15 : parasite ? 9 : 13;

  // A tapered COMET trail (fading segments, fat near the head → thin) reads as speed +
  // energy far better than a single flat line; a faint wide under-glow softens the streak.
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(trail, 0.14);
  ctx.lineWidth = head * 2.2;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - ux * tlen * 0.8, p.y - uy * tlen * 0.8);
  ctx.stroke();
  for (let s = 0; s < 4; s++) {
    const f = s / 4; // 0 = nearest the head
    ctx.strokeStyle = rgba(trail, 0.5 * (1 - f));
    ctx.lineWidth = head * (1.15 - f * 0.8);
    ctx.beginPath();
    ctx.moveTo(p.x - ux * tlen * f, p.y - uy * tlen * f);
    ctx.lineTo(p.x - ux * tlen * (f + 0.28), p.y - uy * tlen * (f + 0.28));
    ctx.stroke();
  }
  ctx.lineCap = 'butt';

  // A layered glowing head: a soft halo, the core, and a white-hot leading edge. The parasite spore
  // WOBBLES (organic), the splash glob PULSES — both keyed off position so no per-projectile state.
  glowDisc(ctx, p.x, p.y, head * 2.5, rgba(trail, 0.42));
  const wob = parasite ? 1 + Math.sin((p.x + p.y) * 0.45) * 0.22 : splash ? 1 + Math.sin((p.x - p.y) * 0.3) * 0.12 : 1;
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(p.x, p.y, head * wob, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(p.x + ux * head * 0.35, p.y + uy * head * 0.35, head * 0.45, 0, Math.PI * 2); ctx.fill();
  if (fading) ctx.globalAlpha = 1;
}

/** Branch-specific projectile looks (TOWER-BRANCHES.md §9). `p.skin` is the firing tower's
 *  branchId and `p.skinTier` its tier — the shot EVOLVES with tier (bigger / more detailed), so
 *  a maxed tower's fire reads differently from a fresh splice. Returns true if it drew a themed
 *  shot, false to fall back to the base look. */
function drawSkinnedProjectile(ctx: CanvasRenderingContext2D, p: RenderState['projectiles'][number]): boolean {
  let ux = p.tx - p.x;
  let uy = p.ty - p.y;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len;
  uy /= len;
  const tier = p.skinTier ?? 1;
  const sz = 1 + (tier - 1) * 0.12; // T1 → 1.0, T5 → 1.48 (projectile growth)
  const c = hexRgb(branchSkinColor(p.skin));
  switch (p.skin) {
    case 'needle_swarm': {
      // a stubby venom barb — a short bright spine with a chitin-green tip
      ctx.strokeStyle = rgba(c, 0.6);
      ctx.lineWidth = 1.6 * sz;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x - ux * 7 * sz, p.y - uy * 7 * sz);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.lineCap = 'butt';
      drawShape(ctx, 'circle', p.x, p.y, 2.1 * sz, '#eaffb0');
      if (tier >= 4) drawShape(ctx, 'circle', p.x - ux * 4, p.y - uy * 4, 1.1, rgba(c, 0.7)); // a trailing barb
      return true;
    }
    case 'needle_rail': {
      // a long, bright coil-rail lance — longer + brighter with tier
      ctx.strokeStyle = rgba(c, 0.55);
      ctx.lineWidth = 2.6 * sz;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x - ux * (16 + tier * 3), p.y - uy * (16 + tier * 3));
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.lineCap = 'butt';
      glowDisc(ctx, p.x, p.y, 6 * sz, rgba(c, 0.7));
      drawShape(ctx, 'circle', p.x, p.y, 2.6 * sz, '#ffffff');
      return true;
    }
    case 'mortar_siege': {
      // a heavy dark shell trailing fire — fatter ordnance at higher tiers
      ctx.strokeStyle = rgba(c, 0.5);
      ctx.lineWidth = 3.4 * sz;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x - ux * 12, p.y - uy * 12);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.lineCap = 'butt';
      glowDisc(ctx, p.x, p.y, 5.5 * sz, rgba(c, 0.6));
      drawShape(ctx, 'circle', p.x, p.y, 3.4 * sz, '#3a2a20'); // dark iron shell
      drawShape(ctx, 'circle', p.x - ux * 1.2, p.y - uy * 1.2, 1.6 * sz, '#ffd08a'); // burning fuse
      return true;
    }
    case 'mortar_cauldron': {
      // a wobbling caustic glob — bigger, and it sheds droplets at high tier
      const wob = 1 + Math.sin(p.x * 0.3 + p.y * 0.3) * 0.18;
      glowDisc(ctx, p.x, p.y, 6 * wob * sz, rgba(c, 0.55));
      drawShape(ctx, 'circle', p.x, p.y, 3.6 * wob * sz, '#8fdc3e');
      drawShape(ctx, 'circle', p.x - 1, p.y - 1, 1.4 * sz, 'rgba(230,255,200,0.8)'); // highlight
      if (tier >= 4) drawShape(ctx, 'circle', p.x - ux * 5, p.y - uy * 5, 1.5, rgba(c, 0.6)); // a shed droplet
      return true;
    }
    case 'parasite_apex': {
      // a spore cluster — more spores swarm the core as it evolves
      glowDisc(ctx, p.x, p.y, 6 * sz, rgba(c, 0.5));
      drawShape(ctx, 'circle', p.x, p.y, 2.8 * sz, '#e87dff');
      const spores = 2 + tier; // 3 → 7 spores
      for (let i = 0; i < spores; i++) {
        const a = p.x * 0.2 + (i * Math.PI * 2) / spores; // deterministic-ish jitter from position
        drawShape(ctx, 'circle', p.x + Math.cos(a) * 3.4 * sz, p.y + Math.sin(a) * 3.4 * sz, 1.2, rgba(c, 0.85));
      }
      return true;
    }
    case 'parasite_ravager': {
      // a barbed gore-dart — more barbs as the strain matures
      ctx.strokeStyle = rgba(c, 0.55);
      ctx.lineWidth = 2.2 * sz;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x - ux * 9, p.y - uy * 9);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.lineCap = 'butt';
      drawShape(ctx, 'circle', p.x, p.y, 2.8 * sz, '#ff5d6c');
      const barbRows = tier >= 4 ? 2 : 1;
      for (let row = 1; row <= barbRows; row++) {
        const bx = p.x - ux * 3 * row;
        const by = p.y - uy * 3 * row;
        drawShape(ctx, 'circle', bx - uy * 2, by + ux * 2, 1.3, '#a3202e');
        drawShape(ctx, 'circle', bx + uy * 2, by - ux * 2, 1.3, '#a3202e');
      }
      return true;
    }
    case 'obelisk_tyrant': {
      // the Synaptic Lance — a crackling neural bolt; brighter + longer streak with tier
      ctx.strokeStyle = rgba(c, 0.6);
      ctx.lineWidth = 2 * sz;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x - ux * (12 + tier * 2), p.y - uy * (12 + tier * 2));
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.lineCap = 'butt';
      glowDisc(ctx, p.x, p.y, 5.5 * sz, rgba(c, 0.7));
      drawShape(ctx, 'diamond', p.x, p.y, 2.6 * sz, '#dfe4ff');
      return true;
    }
    default:
      return false;
  }
}

// ── Enemies ──────────────────────────────────────────────────────────────────

/** Artillery shells in flight (docs/ENEMIES.md §artillery) — a lobbed arc with a tracking
 *  ground shadow and a landing reticle that sharpens as the shell descends, so incoming
 *  Nucleus damage is VISIBLE and readable before it lands. */
function drawEnemyShells(ctx: CanvasRenderingContext2D, rs: RenderState): void {
  for (const s of rs.enemyShells) {
    const k = Math.min(1, Math.max(0, s.t));
    const gx = s.x + (s.targetX - s.x) * k;
    const gy = s.y + (s.targetY - s.y) * k; // ground track
    const y = gy - Math.sin(k * Math.PI) * 48; // the lob
    const c = hexRgb(s.color);
    // ground shadow under the shell
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(gx, gy, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // short trail back along the arc
    for (let i = 1; i <= 3; i++) {
      const kk = k - i * 0.045;
      if (kk <= 0) continue;
      const tx = s.x + (s.targetX - s.x) * kk;
      const ty = s.y + (s.targetY - s.y) * kk - Math.sin(kk * Math.PI) * 48;
      drawShape(ctx, 'circle', tx, ty, 2.4 - i * 0.6, rgba(c, 0.4 - i * 0.11));
    }
    glowDisc(ctx, gx, y, 7, rgba(c, 0.3));
    drawShape(ctx, 'circle', gx, y, 3.2, rgba(c, 0.95));
    // landing reticle sharpens over the impact point on the descent
    if (k > 0.55) {
      const a = (k - 0.55) / 0.45;
      ring(ctx, s.targetX, s.targetY, 12 - a * 6, rgba(hexRgb('#ff8a3d'), 0.25 + a * 0.55), 1.2, [3, 3]);
    }
  }
}

// ── Enemy MOTION tracker (presentation-only, like heroTrail) — per-id smoothed screen velocity +
//    spawn age, so bodies BANK/BOB as they move, EMERGE on spawn, and leave a crumple ECHO on death.
//    Keyed by enemy id, pruned each frame. Never read by the sim (golden-safe). ─────────────────────
interface EnemyMotion { x: number; y: number; vx: number; vy: number; spawnT: number; seen: number; kind: EnemyKind }
const enemyMotion = new Map<number, EnemyMotion>();
interface DeathEcho { form: BodyForm; x: number; y: number; r: number; color: string; seed: number; phase: number; t0: number }
const deathEchoes: DeathEcho[] = [];
let motionFrame = 0;
const EMERGE_T = 0.55; // seconds for the archetype BIRTH intro (enemyForms drawSpawnIntro) to play out
const ECHO_T = 0.3; // seconds a death crumple lingers

/** Refresh the tracker from this frame's live enemies; reap the vanished into death echoes. */
function updateEnemyMotion(enemies: RenderState['enemies'], t: number): void {
  motionFrame++;
  for (const e of enemies) {
    if (e.boss) continue; // framework bosses use the chassis renderer, not body-forms
    const m = enemyMotion.get(e.id);
    if (!m) { enemyMotion.set(e.id, { x: e.x, y: e.y, vx: 0, vy: 0, spawnT: t, seen: motionFrame, kind: e.kind }); continue; }
    const dx = e.x - m.x, dy = e.y - m.y;
    if (dx * dx + dy * dy > 40000) { // >200px jump ⇒ id reuse (new run) or a blink ⇒ re-emerge, not velocity
      m.x = e.x; m.y = e.y; m.vx = 0; m.vy = 0; m.spawnT = t; m.kind = e.kind; m.seen = motionFrame; continue;
    }
    m.vx += (dx - m.vx) * 0.35; m.vy += (dy - m.vy) * 0.35; // smoothed per-frame delta
    m.x = e.x; m.y = e.y; m.seen = motionFrame;
  }
  for (const [id, m] of enemyMotion) {
    if (m.seen === motionFrame) continue;
    if (deathEchoes.length < 48) { // a vanished enemy died — leave a fading crumple
      const def = ENEMY_DEFS[m.kind];
      deathEchoes.push({ form: ENEMY_BODY[m.kind], x: m.x, y: m.y, r: def.radius, color: def.color, seed: ENEMY_VARIANT[m.kind], phase: id, t0: t });
    }
    enemyMotion.delete(id);
  }
}

/** Draw the death crumples — the body splays + squashes flat + fades over ECHO_T. */
function drawDeathEchoes(ctx: CanvasRenderingContext2D, t: number): void {
  for (let i = deathEchoes.length - 1; i >= 0; i--) {
    const d = deathEchoes[i];
    const age = (t - d.t0) / ECHO_T;
    if (age >= 1 || age < 0) { deathEchoes.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = (1 - age) * 0.85;
    ctx.translate(d.x, d.y + age * d.r * 0.4); // sink into the floor
    ctx.scale(1 + age * 0.35, 1 - age * 0.55); // splay wide + squash flat
    drawEnemyBody(ctx, d.form, 0, 0, d.r, d.color, t, { seed: d.seed, phase: d.phase, rim: THEME.enemy.rim });
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  e: RenderState['enemies'][number],
  detail: boolean,
  t: number,
): void {
  const def = ENEMY_DEFS[e.kind];
  const r = def.radius;
  const flying = def.behavior.flying === true;
  const shape = ENEMY_SHAPE[e.kind];
  const tier = ENEMY_TIER[e.kind];

  // Siege attack animation (docs/HIVE-SIEGE.md §feedback): while winding up, the body REARS
  // BACK then LUNGES into the Core, snapping home as the hit lands. Driven purely by the
  // sim's windup timer — deterministic, no state, one translate.
  let lunged = false;
  if (e.sieging && e.windup >= 0 && e.attackWindup > 0) {
    const k = 1 - Math.max(0, e.windup) / e.attackWindup; // 0 → 1 across the windup
    const amp = k < 0.55 ? -0.35 * (k / 0.55) : (k - 0.55) / 0.45; // rear back, then strike
    const dx = nucleusPoint.x - e.x;
    const dy = nucleusPoint.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const reach = Math.min(9, r * 0.8);
    ctx.save();
    ctx.translate((dx / d) * reach * amp, (dy / d) * reach * amp);
    lunged = true;
  }

  if (detail) {
    // airborne units cast a shadow further below them; grounded units get a tight contact shadow
    // that anchors them to the floor (depth) — both cheap solid-alpha ellipses.
    if (flying) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + 9, r * 0.8, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (!e.boss) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + r * 0.82, r * 0.72, r * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // a faint advance-trail above (they descend) — solid alpha; avoids a
    // per-enemy, per-frame gradient allocation in the hot draw loop.
    ctx.fillStyle = def.color + '33';
    ctx.fillRect(e.x - r * 0.45, e.y - r * 2.2, r * 0.9, r * 2.2);
  }

  const drawY = flying && detail ? e.y - 4 : e.y; // lift fliers off the floor

  // Boss visual identity (render/bossChassis.ts): a framework boss renders in its OWN def
  // palette (not the borrowed tyrant body's) — burrow mound, crown, buds and body all tint.
  const bcol = e.boss ? bossColorOf(e.boss.defId) : def.color;

  // Burrowed boss (docs/BOSS-DESIGN.md §siege): the body is BENEATH the field — draw the
  // churning mound where it tunnels and skip everything else (it can't be seen or hit).
  if (e.boss && e.boss.burrow > 0) {
    if (detail) {
      for (let i = 0; i < 3; i++) {
        ring(ctx, e.x, e.y + r * 0.35, r * (0.5 + i * 0.35) * pulse(t * 1.6 + i, 3, 0.88, 1.12), rgba(hexRgb(bcol), 0.42 - i * 0.11), 2);
      }
      drawShape(ctx, 'circle', e.x, e.y + r * 0.35, r * 0.45 * pulse(t, 4, 0.8, 1.2), rgba(hexRgb('#40332a'), 0.85));
    }
    if (lunged) ctx.restore();
    return;
  }

  // ── Boss signature (behind the body): threat glow, spinning crown + ring — every axis
  //    scales with the phase MUTATION tier, and each tier grows NEW anatomy (§phases). ──
  if (tier === 'boss' && detail) {
    const vt = e.boss?.visualTier ?? 0;
    glowDisc(ctx, e.x, drawY, r * (2.3 + vt * 0.25) * pulse(t, 2.2, 0.92, 1.08), THEME.boss.glow);
    // NEMESIS mark (docs/NEMESIS.md): the boss hunting THIS account wears a black-red
    // counter-rotating brand — you know it the moment it crests the membrane.
    if (e.boss?.nemesis) {
      glowDisc(ctx, e.x, drawY, r * 2.9 * pulse(t, 1.4, 0.9, 1.1), 'rgba(20,2,8,0.5)');
      ring(ctx, e.x, drawY, r * (1.9 + 0.08 * Math.sin(t * 3)), rgba(hexRgb('#ff4d6d'), 0.7), 2.5, [10, 6]);
      ctx.save();
      ctx.strokeStyle = rgba(hexRgb('#2b0812'), 0.9);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 10]);
      ctx.lineDashOffset = (t * 30) % 14;
      ctx.beginPath();
      ctx.arc(e.x, drawY, r * 2.1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);
      labelAt(ctx, e.x, drawY - r * 2.5, '☠ NEMESIS', '#ff4d6d');
    }
    if (e.boss) drawBossCrown(ctx, e.boss.defId, e.x, drawY, r, vt, t); // chassis-keyed signature
    else spikeCrown(ctx, e.x, drawY, r * 1.02, r * (0.5 + vt * 0.16), 8 + vt * 3, THEME.boss.crown, t * 0.6);
    ctx.save();
    ctx.strokeStyle = THEME.boss.ring;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 7]);
    ctx.lineDashOffset = -((t * 26) % 14);
    ctx.beginPath();
    ctx.arc(e.x, drawY, r * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
    // Tier 1+: orbiting limb-buds sprout. Tier 2+: a counter-rotating second spike row.
    // Tier 3 (desperation): a wounded-red halo and a wider blood glow.
    if (vt >= 1) {
      for (let i = 0; i < 3 + vt; i++) {
        const a = (i / (3 + vt)) * Math.PI * 2 + t * 0.9;
        drawShape(ctx, 'circle', e.x + Math.cos(a) * r * 1.35, drawY + Math.sin(a) * r * 1.35, 2.5 + vt * 0.5, rgba(hexRgb(bcol), 0.75));
      }
    }
    if (vt >= 2) spikeCrown(ctx, e.x, drawY, r * 1.32, r * 0.3, 6, rgba(hexRgb(bcol), 0.5), -t * 0.8);
    if (vt >= 3) {
      ring(ctx, e.x, drawY, r * (1.72 + 0.06 * Math.sin(t * 7)), rgba(hexRgb('#ff4d6d'), 0.55), 3);
      glowDisc(ctx, e.x, drawY, r * 3.1 * pulse(t, 5, 0.9, 1.15), rgba(hexRgb('#ff4d6d'), 0.12));
    }
  }

  // ── Elite signature (beauty pass): a slow-turning thorn halo + a breathing under-glow,
  //    so an elite reads as a threat tier at a glance — well before its rim color does. ──
  if (tier === 'elite' && detail) {
    glowDisc(ctx, e.x, drawY, r * 1.8 * pulse(t + e.id, 2.4, 0.92, 1.08), rgba(hexRgb(def.color), 0.1));
    spikeCrown(ctx, e.x, drawY, r * 1.12, r * 0.26, 7, rgba(hexRgb(def.color), 0.5), t * 0.45);
  }

  // ── ROLE identity layer (docs/ENEMIES.md §visual language) — every optional trait reads
  //    on the body BEFORE it acts. Keyed off def fields the historical seven never set and
  //    LOD-gated, so the golden look and the huge-swarm frame cost are both untouched. ──
  if (detail) {
    // Support aura — the heal/shield circle IS the threat; show its true reach.
    if (def.auraRadius) {
      ring(ctx, e.x, drawY, def.auraRadius * pulse(t + e.id, 2.6, 0.97, 1.03), rgba(hexRgb(def.color), 0.14), 1, [6, 7]);
      ring(ctx, e.x, drawY, r + 4, rgba(hexRgb(def.color), pulse(t + e.id, 2.6, 0.25, 0.5)), 1.2);
    }
    // Summoner womb — swells toward each birth, releasing at the reset.
    if (def.summon && e.summonCd !== undefined) {
      const g = 1 - Math.max(0, Math.min(1, e.summonCd / def.summon.interval));
      drawShape(ctx, 'circle', e.x, drawY + r * 0.25, r * (0.3 + 0.24 * g * g), rgba(hexRgb(def.color), 0.45 + 0.35 * g));
    }
    // Artillery standoff — dug-in braces + a muzzle charge that betrays the next volley.
    if (def.siege && e.y >= Math.max(HEIGHT * (2 / 3), DEFENSE_TOP_Y - def.siege.range)) {
      ctx.strokeStyle = rgba(hexRgb(def.color), 0.55);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x - r * 0.9, drawY + r * 0.7);
      ctx.lineTo(e.x - r * 1.4, drawY + r * 1.1);
      ctx.moveTo(e.x + r * 0.9, drawY + r * 0.7);
      ctx.lineTo(e.x + r * 1.4, drawY + r * 1.1);
      ctx.stroke();
      const chg = 1 - Math.max(0, Math.min(1, (e.siegeCd ?? def.siege.interval) / def.siege.interval));
      glowDisc(ctx, e.x, drawY - r * 0.9, r * (0.3 + 0.55 * chg), rgba(hexRgb('#ffb84d'), 0.2 + 0.6 * chg * chg));
    }
    // Suicide payload — a pulsing blast-radius warning once the line is in reach.
    if (def.explodeRadius && e.y > DEFENSE_TOP_Y - def.explodeRadius) {
      ring(ctx, e.x, drawY, def.explodeRadius, rgba(hexRgb('#ff8a3d'), pulse(t * 2 + e.id, 4, 0.15, 0.4)), 1.5, [4, 4]);
    }
    // Regeneration — knitting motes rise while wounded flesh reweaves.
    if ((def.regenPerSec ?? 0) > 0 && e.hp < e.maxHp) {
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.9 + i / 3 + (e.id % 7) * 0.13) % 1;
        const mx = e.x + Math.sin((t + i * 2.1 + e.id) * 2.2) * r * 0.5;
        drawShape(ctx, 'circle', mx, drawY + r * 0.6 - ph * r * 1.8, 1.6 * (1 - ph * 0.5), rgba(hexRgb('#7ce0a0'), (1 - ph) * 0.7));
      }
    }
  }

  // body + a tier-weighted rim so it reads as a solid, threat-ranked unit. A framework boss
  // renders its CHASSIS body plan (render/bossChassis.ts — five silhouettes, own palette,
  // per-def markings) instead of the borrowed tyrant disc; at low LOD it stays a cheap flat
  // shape but keeps its own color so the identity survives zoom-out.
  const rim = tier === 'boss' ? THEME.boss.rim : tier === 'elite' ? THEME.elite.rim : THEME.enemy.rim;
  if (e.boss && detail) drawBossBody(ctx, e.boss.defId, e.x, drawY, r, t);
  // Full-detail non-boss enemies render a procedural CREATURE body (render/enemyForms.ts) — a shaded
  // silhouette + anatomy + idle animation that owns its own rim/shading, keyed by archetype so the
  // roster reads as distinct organisms. The motion tracker feeds velocity (bank + walking bob) and
  // spawn age (emerge). Low-LOD (huge swarm) + bosses fall back to the flat shape.
  else if (detail) {
    const mo = enemyMotion.get(e.id);
    const emerge = easeOutCubic(mo ? Math.min(1, (t - mo.spawnT) / EMERGE_T) : 1);
    const bodyR = r * (0.93 + (e.id % 5) * 0.028); // per-instance size jitter (body only — rings stay true)
    drawEnemyBody(ctx, ENEMY_BODY[e.kind], e.x, drawY, bodyR, def.color, t, { seed: ENEMY_VARIANT[e.kind], phase: e.id, rim, flying, vx: mo?.vx ?? 0, vy: mo?.vy ?? 0, emerge });
  }
  else drawShape(ctx, shape, e.x, drawY, r, e.boss ? bcol : def.color);
  if (detail) {

    // Shield bubble — a front-arc barrier facing the descent, alpha by remaining charge;
    // it SHATTERS visibly the instant it breaks (sim sets shieldFlash at 0-cross).
    if ((e.shield ?? 0) > 0) {
      const cap = Math.max(def.shieldHp ?? 0, e.shield as number, 60); // aura-granted shields have no def cap
      const frac = Math.min(1, (e.shield as number) / cap);
      ctx.strokeStyle = rgba(hexRgb('#7fd0ff'), 0.35 + 0.45 * frac);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(e.x, drawY, r + 4, Math.PI * 0.18, Math.PI * 0.82); // facing the line (downfield)
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(e.x, drawY, r + 7, Math.PI * 0.3, Math.PI * 0.7);
      ctx.strokeStyle = rgba(hexRgb('#7fd0ff'), 0.2 + 0.25 * frac);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if ((e.shieldFlash ?? 0) > 0) {
      const a = (e.shieldFlash as number) / 0.3;
      ring(ctx, e.x, drawY, r + 6 + (1 - a) * 14, rgba(hexRgb('#bfe9ff'), a * 0.8), 1 + a * 2);
    }

    // ── BOSS runtime (docs/BOSS-DESIGN.md) — the framework's live state ON the body, so an
    //    invulnerability window, carapace, enrage, charge and channel all read at a glance. ──
    if (e.boss) {
      const b = e.boss;
      if (b.shielded > 0) {
        // Invulnerability — a hard golden shell: attacks are wasted, and it LOOKS that way.
        ring(ctx, e.x, drawY, r * 1.22, rgba(hexRgb('#ffe9a0'), pulse(t, 6, 0.55, 0.95)), 2.5);
        ring(ctx, e.x, drawY, r * 1.22 + 4, rgba(hexRgb('#ffe9a0'), 0.25), 1);
      }
      if (b.carapace > 0 && b.carapaceT > 0) {
        // Carapace window — bone plating segments while the bonus armor holds (crack it with Fracture).
        ctx.strokeStyle = rgba(hexRgb('#c8d0dc'), 0.8);
        ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) {
          const a0 = (i / 4) * Math.PI * 2 + t * 0.3;
          ctx.beginPath();
          ctx.arc(e.x, drawY, r + 3, a0, a0 + Math.PI * 0.32);
          ctx.stroke();
        }
      }
      if (b.enrage > 0) {
        // Enrage — a deepening blood rim; each stack thickens the fury.
        const k = Math.min(1, b.enrage * 0.2);
        ring(ctx, e.x, drawY, r + 2, rgba(hexRgb('#ff4d4d'), 0.3 + 0.5 * k), 2 + k * 2);
      }
      if (b.charge > 0) {
        // Charge telegraph — the dash vector flashes downfield before it fires.
        ctx.strokeStyle = rgba(hexRgb('#ffd24d'), pulse(t, 9, 0.4, 0.9));
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(e.x, drawY + r);
        ctx.lineTo(e.x, drawY + r * 4);
        ctx.stroke();
        ctx.setLineDash([]);
        chevronDown(ctx, e.x, drawY + r * 4 + 4, 7, rgba(hexRgb('#ffd24d'), 0.9));
      }
      if (b.channel > 0) {
        // Nucleus channel — a feeding tether; sever it by breaking the channel.
        ctx.strokeStyle = rgba(hexRgb('#ff8a3d'), pulse(t, 5, 0.35, 0.7));
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 6]);
        ctx.beginPath();
        ctx.moveTo(e.x, drawY);
        ctx.lineTo(nucleusPoint.x, nucleusPoint.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (b.grip > 0) {
        // Core-crush — a thick crushing tether INTO the Nucleus; the boss is EXPOSED while
        // it squeezes (burst it off before the Integrity drains away).
        ctx.strokeStyle = rgba(hexRgb('#ff4d6d'), pulse(t, 7, 0.55, 0.95));
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(e.x, drawY);
        ctx.lineTo(nucleusPoint.x, nucleusPoint.y);
        ctx.stroke();
        ring(ctx, nucleusPoint.x, nucleusPoint.y, 14 * pulse(t, 6, 0.8, 1.25), rgba(hexRgb('#ff4d6d'), 0.85), 2.5);
        ring(ctx, e.x, drawY, r + 5, rgba(hexRgb('#ffd24d'), pulse(t, 8, 0.4, 0.8)), 2); // the EXPOSED tell
      }
    }
  }

  if (detail) {
    // white pop on taking a hit (FX.hitFlash ≈ 0.09s → normalize ×9 for alpha)
    if (e.hitFlash > 0) drawShape(ctx, shape, e.x, drawY, r, rgba(THEME.enemy.hitFlash, Math.min(0.8, e.hitFlash * 9)));
    if (e.corrosion > 0) ring(ctx, e.x, drawY, r + 2, THEME.enemy.corrosion, 2);
    if (e.infection > 0) {
      ring(ctx, e.x, drawY, r + 3, rgba(THEME.enemy.infection, Math.min(0.9, 0.3 + e.infection * 0.07)), 2);
    }
    if (e.disrupt > 0) ring(ctx, e.x, drawY, r + 5, rgba(THEME.enemy.disrupt, 0.7), 1.5, [3, 3]);
    if (e.fracture > 0) {
      ring(ctx, e.x, drawY, r + 4, rgba(THEME.enemy.fracture, Math.min(0.9, 0.25 + e.fracture * 0.12)), 2);
    }
    // Beam-tower "charge" statuses — tight inner rings that intensify with stacks (reaction fuel:
    // Mark from the Marrow Siphon, Resonance from the Resonance Coil). Neither appears on the golden path.
    if (e.mark > 0) ring(ctx, e.x, drawY, r + 1, rgba(THEME.enemy.mark, Math.min(0.9, 0.35 + e.mark * 0.09)), 2);
    if (e.resonance > 0) ring(ctx, e.x, drawY, r + 1.5, rgba(THEME.enemy.resonance, Math.min(0.9, 0.35 + e.resonance * 0.09)), 2);
    if (e.shredFlash > 0) {
      ctx.fillStyle = rgba(THEME.enemy.shred, Math.min(0.8, e.shredFlash * 2));
      ctx.beginPath();
      ctx.arc(e.x, drawY, r + 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // danger aura once an enemy has pressed into the defensive zone
    if (e.y > DEFENSE_TOP_Y) ring(ctx, e.x, drawY, r + 6, rgba(THEME.enemy.danger, 0.5), 1.5);

    // health pip — shown once damaged (always, larger, for a boss).
    const pct = Math.max(0, e.hp / e.maxHp);
    if (pct < 1 || tier === 'boss') {
      const fill = pct > 0.5 ? THEME.enemy.hpHigh : pct > 0.25 ? THEME.enemy.hpMid : THEME.enemy.hpLow;
      const bw = tier === 'boss' ? r * 2.4 : r * 2;
      const by = tier === 'boss' ? drawY - r - 16 : drawY - r - 9;
      healthBar(ctx, e.x, by, bw, pct, THEME.enemy.hpBack, THEME.enemy.hpEdge, fill);
      // Boss PHASE pips — how deep into the fight it is (fills as phases fall).
      if (e.boss && e.boss.phases > 1) {
        for (let i = 0; i < e.boss.phases; i++) {
          const px = e.x - ((e.boss.phases - 1) * 7) / 2 + i * 7;
          drawShape(ctx, 'circle', px, by + 7, 2, i <= e.boss.phase ? rgba(hexRgb('#ff4d6d'), 0.95) : 'rgba(255,255,255,0.25)');
        }
      }
    }
  }
  if (lunged) ctx.restore();
}

// Presentation-only afterimage buffer (primary hero) — never read by sim.
const heroTrail: { x: number; y: number }[] = [];
// Absorb-shield barrier tint (matches the status framework's Shield buff color).
const SHIELD_RGB = hexRgb('#9ad0ff');
const SELECT_RGB = hexRgb('#fff4c2'); // hero selection ring — warm white-gold, distinct from class tints
// Low-HP urgency tint for minions (the shared "danger" red).
const MINION_LOW_RGB = hexRgb('#ff5d73');

const HERO_SHAPE = { ravager: 'diamond', shepherd: 'hex', overseer: 'triangle', vitriol: 'square', revenant: 'circle' } as const;

function drawHeroes(ctx: CanvasRenderingContext2D, rs: RenderState, cosmeticTiers: Partial<Record<string, number>> = {}, heroStarTiers: Partial<Record<string, number>> = {}, heroEvo = 0, heroSkins: Partial<Record<string, CosmeticTheme>> = {}): void {
  for (let i = 0; i < rs.heroes.length; i++) {
    const h = rs.heroes[i];
    const fed = goreThrob(`h${h.kind}`); // XP shards just coalesced in ⇒ a feed-throb
    if (fed > 0.01) { ctx.save(); ctx.translate(h.x, h.y); const s = 1 + fed * 0.11; ctx.scale(s, s); ctx.translate(-h.x, -h.y); }
    drawHero(ctx, rs, h, i === 0, cosmeticTiers[h.kind] ?? 0, heroStarTiers[h.kind] ?? 0, heroEvo, heroSkins[h.kind]);
    if (fed > 0.01) ctx.restore();
  }
}

function drawHero(ctx: CanvasRenderingContext2D, rs: RenderState, h: RenderState['heroes'][number], primary: boolean, tier = 0, stars = 0, heroEvo = 0, skin?: CosmeticTheme): void {
  const t = rs.time;
  const def = HERO_DEFS[h.kind];
  const tint = hexRgb(skin?.primary ?? def.color); // class-colored halo/locator/trail (Phenotype re-tints)
  if (skin) drawCosmeticAura(ctx, h.x, h.y, 12, skin, t, h.kind.length);
  const shape = HERO_SHAPE[h.kind];
  const down = h.down;

  // Shepherd's vital aura / Overseer's disruption field — show the role's reach.
  if (!down && def.pulseRadius > 0) {
    const reach = def.pulseRadius * pulse(t, h.kind === 'overseer' ? 2.4 : 1.6, 0.95, 1.05);
    ring(ctx, h.x, h.y, reach, rgba(tint, pulse(t, 2, 0.1, 0.22)), 1.2, [5, 6]);
  }
  // Vitriol's siege envelope — a faint ranging ring marking the bombardment reach.
  if (!down && def.behavior === 'siege' && def.attackRange > 0) {
    ring(ctx, h.x, h.y, def.attackRange, rgba(tint, pulse(t, 1.4, 0.05, 0.12)), 1, [4, 10]);
  }
  // Revenant blink arc (behavior 'phase') — a fading spectral streak from where it teleported FROM,
  // and a dissipating after-image at the origin. phaseT / phaseFrom* are render-only fields the sim
  // sets on each blink-strike (absent on every other hero ⇒ nothing drawn).
  if (!down && (h.phaseT ?? 0) > 0 && h.phaseFromX !== undefined && h.phaseFromY !== undefined) {
    const a = Math.min(1, (h.phaseT as number) / HERO_PHASE_FLASH);
    ctx.save();
    ctx.strokeStyle = rgba(tint, 0.5 * a);
    ctx.lineWidth = 2 + 3 * a;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(h.phaseFromX, h.phaseFromY);
    ctx.lineTo(h.x, h.y);
    ctx.stroke();
    glowDisc(ctx, h.phaseFromX, h.phaseFromY, 5 + 6 * a, def.color); // the after-image dissolving
    ctx.restore();
  }

  // sample the primary hero's path into a short afterimage trail (slot-1 only)
  if (primary) {
    const last = heroTrail[heroTrail.length - 1];
    const moved = last ? Math.hypot(h.x - last.x, h.y - last.y) : Infinity;
    if (moved > 120) heroTrail.length = 0; // respawn teleport → clear
    if (moved > 3) {
      heroTrail.push({ x: h.x, y: h.y });
      if (heroTrail.length > 8) heroTrail.shift();
    } else if (heroTrail.length > 0) {
      heroTrail.shift(); // standing still → drain so the trail doesn't linger
    }
    if (!down) {
      for (let i = 0; i < heroTrail.length - 1; i++) {
        const p = heroTrail[i];
        drawShape(ctx, shape, p.x, p.y, 5 + i * 0.7, rgba(tint, (i / heroTrail.length) * 0.22));
      }
    }
  }

  ctx.globalAlpha = down ? 0.4 : 1;
  glowDisc(ctx, h.x, h.y + 4, 22, rgba(tint, 0.26)); // ground halo
  // Selection ring (docs/HERO-SELECTION.md): a bright, animated marker for the player-SELECTED hero.
  // Purely presentational — the sim keeps running while it shows (selection never pauses gameplay).
  if (rs.selectedHero === h.kind && !down) {
    const rSel = 25 + pulse(t, 2.5, 0, 2);
    ring(ctx, h.x, h.y, rSel, rgba(SELECT_RGB, pulse(t, 2.5, 0.7, 1)), 2.6);
    ring(ctx, h.x, h.y, rSel + 5, rgba(SELECT_RGB, 0.3), 1.2, [4, 7]);
  }
  if (!down) {
    // pulsing locator ring so the star unit is always findable in a swarm
    ring(ctx, h.x, h.y, 19 + pulse(t, 3, 0, 2), rgba(tint, pulse(t, 3, 0.22, 0.55)), 1.5);
    // Absorb-shield (Shepherd's Bloom): a cyan barrier ring while the pool holds.
    if (h.shield > 0) ring(ctx, h.x, h.y, 21 + pulse(t, 4, 0, 1.5), rgba(SHIELD_RGB, pulse(t, 4, 0.4, 0.75)), 2);
    // Mastery cosmetic: a veteran halo + orbiting rank pips, tier = the hero's mastery rank
    // (MASTERY.md hero visuals). Pure cosmetic — tier 0 (a fresh save) renders identically.
    if (tier > 0) {
      ring(ctx, h.x, h.y, 26, rgba(tint, pulse(t, 1.6, 0.22, 0.5)), 1.4);
      const pips = Math.min(tier, 5);
      for (let i = 0; i < pips; i++) {
        const ang = t * 0.8 + (i * Math.PI * 2) / pips;
        drawShape(ctx, shape, h.x + Math.cos(ang) * 26, h.y + Math.sin(ang) * 26, 2.4, def.color);
      }
    }
  }
  // layered core: dark rim → class-colored body → bright nucleus (reads as a hero). Permanent
  // STARS swell the body (docs/HERO-EVOLUTION.md §visuals); ★0 ⇒ grow=1 ⇒ the classic silhouette.
  const grow = heroEvolutionGrowth(h.kind, stars);
  drawShape(ctx, shape, h.x, h.y, 16 * grow, THEME.hero.rim);
  drawShape(ctx, shape, h.x, h.y, 13 * grow, def.color);
  drawShape(ctx, shape, h.x, h.y - 2, 5 * grow, THEME.hero.core);
  // Star anatomy organs + in-run Hero-Evolution battle-dress (both no-ops at ★0/evo-0 → classic look).
  drawHeroEvolution(ctx, h, stars, heroEvo, 16 * grow, t, def.color, down);
  ctx.globalAlpha = 1;

  if (down) {
    ctx.fillStyle = THEME.hero.down;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(h.respawn)}s`, h.x, h.y - 22);
    ctx.textAlign = 'left';
  } else {
    const pct = Math.max(0, h.hp / h.maxHp);
    healthBar(ctx, h.x, h.y - 25, 28, pct, THEME.hero.hpBack, THEME.enemy.hpEdge, def.color);
  }
}

// Summoned friendly units — small glowing motes that fade out over their last second.
function drawMinions(ctx: CanvasRenderingContext2D, rs: RenderState, t: number): void {
  for (const m of rs.minions) {
    if (!m.alive) continue; // destroyed this tick, culled next — don't draw the corpse
    const tint = hexRgb(m.color);
    const grow = 0.3 + 0.7 * Math.min(1, (m.maxLife - m.life) / 0.18); // pop-in over ~0.18s
    const fade = m.life < 1.2 ? Math.max(0, m.life / 1.2) : 1; // fade out as it expires
    const hpPct = Math.max(0, m.hp / m.maxHp);
    const low = hpPct <= 0.35; // urgency once it's nearly chewed through
    const r = m.radius * grow;
    const spd = low ? 8 : 4; // pulse faster when in danger
    const ringRgb = low ? MINION_LOW_RGB : tint;

    ctx.globalAlpha = fade;
    glowDisc(ctx, m.x, m.y, r + 4, rgba(tint, 0.4));
    ring(ctx, m.x, m.y, r + 2 + pulse(t, spd, 0, 1), rgba(ringRgb, pulse(t, spd, 0.3, 0.65)), 1);
    drawShape(ctx, 'circle', m.x, m.y, r, m.color);
    drawShape(ctx, 'circle', m.x, m.y - 1, r * 0.45, THEME.hero.core);
    // white shimmer while an enemy is chewing it (continuous contact → keep it gentle)
    if (m.hitFlash > 0) drawShape(ctx, 'circle', m.x, m.y, r, rgba(THEME.enemy.hitFlash, Math.min(0.35, m.hitFlash * 5)));
    ctx.globalAlpha = 1;

    // HP bar — only once damaged, so a full-health swarm stays uncluttered
    if (hpPct < 1) {
      const fill = hpPct > 0.5 ? THEME.enemy.hpHigh : hpPct > 0.25 ? THEME.enemy.hpMid : THEME.enemy.hpLow;
      healthBar(ctx, m.x, m.y - m.radius - 8, m.radius * 2, hpPct, THEME.enemy.hpBack, THEME.enemy.hpEdge, fill);
    }
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, rs: RenderState): void {
  for (const p of rs.particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** The danger-mode screen treatment (docs/CAMERA.md §channels) — deliberately RESTRAINED:
 *  a soft vignette, a faint red edge glow, a one-rect saturation dip, and an extremely
 *  subtle heartbeat swell at high danger. Everything keys on the SMOOTHED inputs (the raw
 *  sin-throb is gone), so nothing here can flicker. No shake, no flashes. */
function drawPressureVignette(ctx: CanvasRenderingContext2D, pressure: number, danger: number, t: number): void {
  if (pressure <= 0.02 && danger <= 0.02) return;
  // Heartbeat (optional, per spec): a quiet lub-dub swelling the vignette ±4% — only once
  // danger is well established, never a strobe.
  let heart = 0;
  if (danger > 0.5) {
    const ph = (t * 1.05) % 1;
    const lub = Math.max(0, Math.sin(ph * Math.PI * 2)) ** 8;
    const dub = Math.max(0, Math.sin((ph - 0.16) * Math.PI * 2)) ** 8;
    heart = (lub + 0.55 * dub) * (danger - 0.5) * 2;
  }
  const a = pressure * (0.34 + 0.04 * heart);
  const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.62, HEIGHT * 0.3, WIDTH / 2, HEIGHT * 0.62, HEIGHT * 0.75);
  g.addColorStop(0, rgba(THEME.vignette, 0));
  g.addColorStop(1, rgba(THEME.vignette, Math.min(0.5, a)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (danger > 0.03) {
    // Slight red edge glow — the danger hue bleeding in from the frame, low alpha.
    const r = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.62, HEIGHT * 0.52, WIDTH / 2, HEIGHT * 0.62, HEIGHT * 0.8);
    r.addColorStop(0, 'rgba(255, 62, 76, 0)');
    r.addColorStop(1, `rgba(255, 62, 76, ${(0.12 * danger).toFixed(3)})`);
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // Minor saturation dip — one rect through the 'saturation' blend (gray source pulls the
    // backdrop toward monochrome by its alpha). Cheap, and reads as the world tensing up.
    ctx.save();
    ctx.globalCompositeOperation = 'saturation';
    ctx.globalAlpha = 0.14 * danger;
    ctx.fillStyle = '#8a8a92';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
  }
}

// ── Range visualization (docs/RANGE.md §6) ──────────────────────────────────
// Range is shown ONLY on placement preview + selection — never permanently. The
// representation is chosen by the tower's CLASS so it actually informs on this tall,
// vertical lane, where a literal radius circle is useless once a tower reaches most of the
// map:
//   • support / field towers (reactor, obelisk) → a soft FIELD DISC (the area they affect)
//   • medium ranged towers (parasite)           → a bounded RANGE RING
//   • long-range towers (needle, mortar)        → an ENGAGEMENT FRONTIER: everything from the
//       frontier line down to the base is in reach. Effectively-infinite range collapses the
//       frontier onto the spawn edge and labels it, so a future ∞-range tower reads cleanly.
// `tone` is an "r, g, b" theme token (valid/invalid on placement; neutral on selection).
const FRONTIER_MIN_RANGE = 340; // a ranged tower wider than this draws a frontier, not a circle

function drawRangeIndicator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  range: number,
  firing: TowerFiring,
  tone: string,
  time: number,
  minRange = 0,
): void {
  if (range <= 0) return;
  if (firing === 'support' || firing === 'field') {
    drawFieldDisc(ctx, x, y, range, tone, time);
    return;
  }
  const reachesTop = !isFinite(range) || y - range <= 0; // effectively infinite up the lane
  if (range >= FRONTIER_MIN_RANGE || reachesTop) {
    drawEngagementFrontier(ctx, x, y, range, tone, time, reachesTop);
  } else {
    drawRangeRing(ctx, x, y, range, tone, time);
  }
  drawDeadzoneRing(ctx, x, y, minRange, tone, time); // artillery inner cutoff (mortar); no-op at 0
}

/** Artillery DEADZONE (docs/TOWERS.md §deadzone): a subtle INNER ring at the minimum engagement
 * radius — enemies inside it are safe from this tower. Drawn for any def with `minRange > 0`. */
function drawDeadzoneRing(ctx: CanvasRenderingContext2D, x: number, y: number, minRange: number, tone: string, time: number): void {
  if (minRange <= 0) return;
  const r = minRange * pulse(time, 2.2, 0.99, 1.01);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = rgba(tone, 0.05); // faint "no-fire" wash
  ctx.fill();
  ctx.save();
  ctx.strokeStyle = rgba(tone, 0.42);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.lineDashOffset = (time * 12) % 14;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.setLineDash([]);
}

/** Support towers: a soft filled aura showing the AREA they affect (clamped if a future
 * field is effectively infinite). */
function drawFieldDisc(ctx: CanvasRenderingContext2D, x: number, y: number, range: number, tone: string, time: number): void {
  const r = Math.min(range, Math.hypot(WIDTH, HEIGHT)) * pulse(time, 1.6, 0.98, 1.02);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = rgba(tone, 0.07);
  ctx.fill();
  ring(ctx, x, y, r, rgba(tone, 0.34), 1.5, [6, 6]);
}

/** Medium ranged towers: a clean bounded range ring (the circle is readable at this size). */
function drawRangeRing(ctx: CanvasRenderingContext2D, x: number, y: number, range: number, tone: string, time: number): void {
  ctx.beginPath();
  ctx.arc(x, y, range, 0, Math.PI * 2);
  ctx.fillStyle = rgba(tone, 0.05);
  ctx.fill();
  ctx.save();
  ctx.strokeStyle = rgba(tone, 0.5);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.lineDashOffset = -((time * 18) % 20);
  ctx.beginPath();
  ctx.arc(x, y, range, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.setLineDash([]);
}

/** Long-range towers: an engagement frontier. Everything from the frontier line DOWN to the
 * base is covered — the readable mental model for a long reach on a vertical lane. */
function drawEngagementFrontier(ctx: CanvasRenderingContext2D, x: number, y: number, range: number, tone: string, time: number, infinite: boolean): void {
  const frontierY = Math.max(0, y - range);
  // the covered approach, faintly shaded (frontier → base)
  ctx.fillStyle = rgba(tone, 0.05);
  ctx.fillRect(0, frontierY, WIDTH, HEIGHT - frontierY);
  // a thin aim line anchoring the frontier to the tower
  ctx.strokeStyle = rgba(tone, 0.25);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, frontierY);
  ctx.stroke();
  // the frontier itself — an animated leading edge of engagement
  ctx.save();
  ctx.strokeStyle = rgba(tone, 0.6);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -((time * 30) % 18);
  ctx.beginPath();
  ctx.moveTo(0, frontierY + 0.5);
  ctx.lineTo(WIDTH, frontierY + 0.5);
  ctx.stroke();
  ctx.restore();
  ctx.setLineDash([]);
  labelAt(ctx, WIDTH / 2, frontierY + 14, infinite ? 'FULL-LANE REACH ∞' : 'ENGAGEMENT LINE', rgba(tone, 0.95));
}

// ── Pointer (placement ghost / ability preview / slot info) ──────────────────

function drawPointer(ctx: CanvasRenderingContext2D, rs: RenderState, pointer: Pointer | null): void {
  if (!pointer) return;

  if (rs.armedAbility) {
    ring(ctx, pointer.x, pointer.y, 72, rgba(THEME.target.ability, 0.7), 2, [6, 4]);
    return;
  }

  const slot = slotAt(pointer.x, pointer.y);
  if (!slot) return;
  const tower = rs.towers.find((tw) => tw.slot === slot.index);

  if (rs.selectedTower) {
    const def = TOWER_DEFS[rs.selectedTower];
    const locked = slot.index >= rs.unlockedSlots;
    const invalid = locked || !!tower;
    const tone = invalid ? THEME.select.invalid : THEME.select.valid;
    // accurate, class-aware range preview (field disc / range ring / engagement frontier),
    // using the tower's EFFECTIVE range so mastery upgrades show in the preview
    drawRangeIndicator(ctx, slot.x, slot.y, rs.effectiveRanges[rs.selectedTower] ?? def.range, def.firing, tone, rs.time, def.minRange ?? 0);

    // animated selection frame on the target pad
    const sf = CELL - 8;
    roundRectPath(ctx, slot.x - sf / 2, slot.y - sf / 2, sf, sf, 6);
    ctx.strokeStyle = rgba(tone, pulse(rs.time, 4, 0.5, 0.9));
    ctx.lineWidth = 2;
    ctx.stroke();

    if (locked) labelAt(ctx, slot.x, slot.y - CELL / 2 - 6, 'LOCKED', THEME.select.lockedLabel);
    return;
  }

  // Hover highlights a tower's attack radius — UNLESS a relocation is in progress, when unrelated
  // range indicators are hidden so the board reads cleanly (docs/TOWER-MANAGEMENT.md §3/§4).
  if (tower && rs.movingTowerId === null) {
    const def = TOWER_DEFS[tower.kind];
    // selection: show the selected tower's effective range in its class-appropriate form
    drawRangeIndicator(ctx, tower.x, tower.y, rs.effectiveRanges[tower.kind] ?? def.range, def.firing, THEME.target.range, rs.time, def.minRange ?? 0);
    labelAt(ctx, tower.x, tower.y - CELL / 2 - 6, def.name, def.color);
  }
}

function labelAt(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string): void {
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const w = ctx.measureText(text).width + 12;
  roundRectPath(ctx, x - w / 2, y - 12, w, 16, 4);
  ctx.fillStyle = THEME.label;
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}
