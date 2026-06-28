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
import { ENEMY_DEFS, HERO_DEFS, PERF, TOWER_DEFS } from '../core/config';
import type { RenderState } from '../core/game';
import type { TowerFiring } from '../core/types';
import { THEME, ENEMY_SHAPE, ENEMY_TIER, TOWER_SHAPE, hexRgb, rgba } from './theme';
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
  strokeShape,
} from './vfx';

export interface Pointer {
  x: number;
  y: number;
}

const SPAWN_BAND = CELL * 1.4; // top "breeding membrane" the swarm pours from
const TOWER_R = 12; // base silhouette radius for placed towers

export function drawGame(
  ctx: CanvasRenderingContext2D,
  rs: RenderState,
  pointer: Pointer | null,
  cosmeticTiers: Partial<Record<string, number>> = {}, // per-kind mastery-rank visual tier (0 = none)
): void {
  const t = rs.time;

  // How hard is the hive being pressed right now? (enemies near/into the zone +
  // how wounded the core is) — drives the danger glow + vignette.
  let nearLine = 0;
  for (const e of rs.enemies) if (e.y > DEFENSE_TOP_Y - CELL * 2) nearLine++;
  const intRatio = rs.maxIntegrity > 0 ? rs.integrity / rs.maxIntegrity : 1;
  const pressure = Math.min(1, (nearLine / 14) * 0.7 + (1 - intRatio) * 0.7);

  drawBackground(ctx);
  drawTiles(ctx);
  drawSpawnZone(ctx, t);
  drawDefenseZone(ctx, t, pressure);
  drawObstacles(ctx);

  const occupied = new Set(rs.towers.map((tw) => tw.slot));
  drawHiveTendrils(ctx, rs, t);
  drawSlots(ctx, rs, occupied);
  drawBase(ctx, rs, t);

  for (const p of rs.pools) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = THEME.pool.fill;
    ctx.fill();
    ctx.strokeStyle = THEME.pool.edge;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawOverchargeLinks(ctx, rs);
  for (const tw of rs.towers) drawTower(ctx, tw, t, cosmeticTiers[tw.kind] ?? 0, tw.id === rs.selectedPlacedId);

  for (const p of rs.projectiles) drawProjectile(ctx, p);

  // LOD: drop per-enemy embellishments when the swarm is huge (perf headroom).
  const detail = rs.enemies.length < PERF.lodEnemyCount;
  for (const e of rs.enemies) drawEnemy(ctx, e, detail, t);

  drawParticles(ctx, rs);
  drawMinions(ctx, rs, t);
  drawHeroes(ctx, rs, cosmeticTiers);
  drawEmergency(ctx, rs, t); // Emergency Defense Mode alert (over the field, under labels)
  drawPointer(ctx, rs, pointer);

  for (const f of rs.floats) {
    ctx.globalAlpha = Math.min(1, f.life * 2);
    ctx.fillStyle = f.color;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';

  drawPressureVignette(ctx, pressure, t);
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
  for (const o of obstacleCells) {
    ctx.fillStyle = THEME.obstacle.fill;
    ctx.fillRect(o.x - CELL / 2, o.y - CELL / 2, CELL, CELL);
    ctx.strokeStyle = THEME.obstacle.edge;
    ctx.lineWidth = 1;
    ctx.strokeRect(o.x - CELL / 2 + 0.5, o.y - CELL / 2 + 0.5, CELL - 1, CELL - 1);
  }
}

function drawHiveTendrils(ctx: CanvasRenderingContext2D, rs: RenderState, t: number): void {
  // Living veins from the core feeding its grown defenses.
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
  }
}

function drawBase(ctx: CanvasRenderingContext2D, rs: RenderState, t: number): void {
  const { x, y } = nucleusPoint;
  const intRatio = rs.maxIntegrity > 0 ? rs.integrity / rs.maxIntegrity : 1;
  // heartbeat — faster + more frantic as the hive is wounded
  const beat = pulse(t, 3 + (1 - intRatio) * 4, 0.85, 1.15);
  const R = 36 * beat;

  glowDisc(ctx, x, y, R, THEME.hive.glow[0]);

  // Emergency Defense Mode: the core flares brighter — the heart of the alarm.
  const emr = rs.emergencyRamp;
  if (emr > 0.01) {
    const flare = 0.85 + 0.15 * pulse(t, 7, 0, 1);
    glowDisc(ctx, x, y, R * (1.5 + 0.6 * emr) * flare, rgba(THEME.defense.zone, 0.5 * emr));
  }

  // a slowly rotating containment shell around the core
  ctx.save();
  ctx.strokeStyle = THEME.hive.shell;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 9]);
  ctx.lineDashOffset = -((t * 20) % 14);
  ctx.beginPath();
  ctx.arc(x, y, 23 * beat, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.setLineDash([]);

  // core body + bright nucleus
  drawShape(ctx, 'circle', x, y, 15 * beat, THEME.hive.body);
  drawShape(ctx, 'circle', x, y, 5 * beat, THEME.hive.core);

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

    // an inviting "build pad": soft plate, pulsing corner brackets, center cross.
    roundRectPath(ctx, x, y, s, s, 6);
    ctx.fillStyle = THEME.slot.pad;
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

const TOWER_GROW = 0.35; // seconds for a placed tower to scale up to full size

function drawTower(ctx: CanvasRenderingContext2D, tw: RenderState['towers'][number], now: number, tier = 0, selected = false): void {
  const def = TOWER_DEFS[tw.kind];
  const shape = TOWER_SHAPE[tw.kind];

  // grow-on-place → idle breathing → a recoil punch right after firing.
  const grow = easeOutCubic(Math.min(1, Math.max(0, (now - tw.bornAt) / TOWER_GROW)));
  if (grow <= 0.001) return;
  const breathe = pulse(now + tw.id, 2, 0.97, 1.03);
  // cooldown counts down from fireInterval → 0; it's highest right after a shot.
  const fresh = def.fireInterval > 0 ? Math.min(1, Math.max(0, (tw.cooldown / def.fireInterval - 0.7) / 0.3)) : 0;
  const r = TOWER_R * grow * breathe * (1 + fresh * 0.1);

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

  // muzzle flash above firing towers (enemies are upfield) on the recoil frames
  if (fresh > 0.01) {
    glowDisc(ctx, tw.x, tw.y - r * 0.8, r * (0.7 + fresh), def.color);
  }

  drawShape(ctx, shape, tw.x, tw.y, r, def.color);
  strokeShape(ctx, shape, tw.x, tw.y, r, 'rgba(6,8,14,0.55)', 1.5);
  drawShape(ctx, shape, tw.x, tw.y - r * 0.18, r * 0.42, 'rgba(255,255,255,0.18)'); // top gloss

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
  }

  // Mastery cosmetic: a veteran "halo" that grows with the tower's mastery RANK (MASTERY.md
  // visual mutations). Pure cosmetic — tier 0 (a fresh save) renders identically.
  if (tier > 0) {
    const a = pulse(now + tw.id, 1.6, 0.22, 0.5);
    ring(ctx, tw.x, tw.y, r * 1.7, rgba(hexRgb(def.color), a), 1.4);
    if (tier >= 2) ring(ctx, tw.x, tw.y, r * 2.05, rgba(hexRgb(def.color), a * 0.55), 1);
    const pips = Math.min(tier, 5); // orbiting rank pips
    for (let i = 0; i < pips; i++) {
      const ang = now * 0.8 + (i * Math.PI * 2) / pips;
      drawShape(ctx, 'circle', tw.x + Math.cos(ang) * r * 1.7, tw.y + Math.sin(ang) * r * 1.7, 1.7, def.color);
    }
  }

  // Branch MUTATION (TOWER-BRANCHES.md): each path grows a DISTINCT evolved silhouette that
  // escalates with tier, so two same-kind towers read differently by their path. Per-instance
  // (reads tw.branchId + tw.tier); tier 0 renders nothing (golden-safe look).
  if (tw.tier > 0) drawBranchCosmetic(ctx, tw, now, r, def.color);

  // Selection highlight (inspected tower → its Mutation panel is open).
  if (selected) {
    ring(ctx, tw.x, tw.y, r * 2.0, rgba(hexRgb('#7ce6ff'), pulse(now, 3, 0.45, 0.85)), 2, [3, 4]);
  }
}

// ── Branch cosmetics (TOWER-BRANCHES.md) ─────────────────────────────────────
// One distinct evolved silhouette per branch, escalating with tier. Each reads tw.branchId
// (the locked path) + tw.tier (1..5). Pure presentation; an unbranched tower never calls in.
// A themed branch draws its identity; anything not yet themed falls back to a generic mutation
// glow so every branched tower still reads as "evolved".

const VENOM = hexRgb('#c8f04a'); // Hivemind Swarm barb-green
const RAIL = hexRgb('#bfe9ff'); // Apex Railspike coil-white

function drawBranchCosmetic(
  ctx: CanvasRenderingContext2D,
  tw: RenderState['towers'][number],
  now: number,
  r: number,
  color: string,
): void {
  switch (tw.branchId) {
    case 'needle_swarm': return branchSwarm(ctx, tw, now, r);
    case 'needle_rail': return branchRail(ctx, tw, now, r);
    default: return drawGenericMutation(ctx, tw, now, r, color);
  }
}

/** The original path-agnostic look: a glow, a pulsing ring, jutting spikes, a capstone aura. */
function drawGenericMutation(ctx: CanvasRenderingContext2D, tw: RenderState['towers'][number], now: number, r: number, color: string): void {
  const c = hexRgb(color);
  glowDisc(ctx, tw.x, tw.y, r * (1.2 + tw.tier * 0.12), rgba(c, 0.1 + tw.tier * 0.03));
  ring(ctx, tw.x, tw.y, r * (1.5 + tw.tier * 0.12), rgba(c, pulse(now + tw.id, 2.2, 0.25, 0.55)), 1.2 + tw.tier * 0.2);
  for (let i = 0; i < tw.tier; i++) {
    const ang = now * 0.5 + (i * Math.PI * 2) / Math.max(3, tw.tier);
    const rr = r * (1.5 + tw.tier * 0.12);
    drawShape(ctx, 'diamond', tw.x + Math.cos(ang) * rr, tw.y + Math.sin(ang) * rr, 2.2 + tw.tier * 0.3, color);
  }
  if (tw.tier >= 5) ring(ctx, tw.x, tw.y, r * 2.5, rgba(c, pulse(now + tw.id, 3, 0.15, 0.45)), 1);
}

/** Hivemind Swarm — a churning cloud of venom barbs orbiting the spitter; denser each tier,
 *  with a sickly green haze and (at the capstone) a second counter-rotating shell. */
function branchSwarm(ctx: CanvasRenderingContext2D, tw: RenderState['towers'][number], now: number, r: number): void {
  glowDisc(ctx, tw.x, tw.y, r * (1.4 + tw.tier * 0.1), rgba(VENOM, 0.08 + tw.tier * 0.02));
  const barbs = 2 + tw.tier * 2; // 4 → 12 barbs
  const orbit = r * (1.5 + tw.tier * 0.06);
  for (let i = 0; i < barbs; i++) {
    const ang = now * 2.2 + (i * Math.PI * 2) / barbs;
    const bx = tw.x + Math.cos(ang) * orbit;
    const by = tw.y + Math.sin(ang) * orbit;
    // a tiny barb: a short spine pointing along its orbit tangent
    ctx.strokeStyle = rgba(VENOM, 0.85);
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx - Math.sin(ang) * 2.6, by + Math.cos(ang) * 2.6);
    ctx.lineTo(bx + Math.sin(ang) * 2.6, by - Math.cos(ang) * 2.6);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  if (tw.tier >= 5) {
    // The Thousand Maw — a second, faster, counter-spinning halo of barbs.
    for (let i = 0; i < 10; i++) {
      const ang = -now * 3.1 + (i * Math.PI * 2) / 10;
      drawShape(ctx, 'diamond', tw.x + Math.cos(ang) * orbit * 1.35, tw.y + Math.sin(ang) * orbit * 1.35, 1.8, '#e8ff9a');
    }
  }
}

/** Apex Railspike — a single heavy coil-rail extending up the lane (enemies are upfield), longer
 *  each tier, with charge coils and a bright muzzle node that flares on the firing beat. */
function branchRail(ctx: CanvasRenderingContext2D, tw: RenderState['towers'][number], now: number, r: number): void {
  const len = r * (1.6 + tw.tier * 0.5); // the barrel grows with tier
  const tipX = tw.x;
  const tipY = tw.y - len;
  // the rail barrel
  ctx.strokeStyle = rgba(RAIL, 0.85);
  ctx.lineWidth = 2 + tw.tier * 0.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tw.x, tw.y);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.lineCap = 'butt';
  // charge coils along the rail
  const coils = Math.min(tw.tier, 4);
  for (let i = 1; i <= coils; i++) {
    const cy = tw.y - (len * i) / (coils + 1);
    ring(ctx, tw.x, cy, 3 + tw.tier * 0.3, rgba(RAIL, 0.5), 1.2);
  }
  // muzzle charge node — pulses (a charged-shot tell)
  const charge = pulse(now + tw.id, tw.tier >= 3 ? 1.2 : 2.4, 0.6, 1.3);
  glowDisc(ctx, tipX, tipY, (2.5 + tw.tier * 0.7) * charge, rgba(RAIL, 0.7));
  if (tw.tier >= 5) glowDisc(ctx, tipX, tipY, (5 + tw.tier) * charge, rgba(RAIL, 0.3)); // Annihilator flare
}

function drawProjectile(ctx: CanvasRenderingContext2D, p: RenderState['projectiles'][number]): void {
  if (p.skin && drawSkinnedProjectile(ctx, p)) return; // themed branch shot; else fall through to base
  const splash = p.behavior === 'splash';
  const parasite = p.behavior === 'parasite';
  const core = splash ? THEME.projectile.splash : parasite ? THEME.projectile.parasite : THEME.projectile.bolt;
  const trail = splash ? THEME.projectile.splashTrail : parasite ? THEME.projectile.parasiteTrail : THEME.projectile.boltTrail;

  // heading toward the target point — the trail streams out behind it
  let ux = p.tx - p.x;
  let uy = p.ty - p.y;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len;
  uy /= len;
  const trailLen = splash ? 11 : parasite ? 8 : 9;

  ctx.strokeStyle = rgba(trail, 0.5);
  ctx.lineWidth = splash ? 3 : 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p.x - ux * trailLen, p.y - uy * trailLen);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.lineCap = 'butt';

  glowDisc(ctx, p.x, p.y, splash ? 7 : 5, rgba(trail, 0.6));
  drawShape(ctx, 'circle', p.x, p.y, splash ? 3.5 : parasite ? 2.6 : 2.3, core);
}

/** Branch-specific projectile looks (TOWER-BRANCHES.md). `p.skin` is the firing tower's
 *  branchId. Returns true if it drew a themed shot, false to fall back to the base look. */
function drawSkinnedProjectile(ctx: CanvasRenderingContext2D, p: RenderState['projectiles'][number]): boolean {
  let ux = p.tx - p.x;
  let uy = p.ty - p.y;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len;
  uy /= len;
  switch (p.skin) {
    case 'needle_swarm': {
      // a stubby venom barb: a short bright spine with a chitin-green tip
      ctx.strokeStyle = rgba(VENOM, 0.6);
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x - ux * 7, p.y - uy * 7);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.lineCap = 'butt';
      drawShape(ctx, 'circle', p.x, p.y, 2.1, '#eaffb0');
      return true;
    }
    case 'needle_rail': {
      // a long, bright coil-rail lance with a sharp leading node and a long streak
      ctx.strokeStyle = rgba(RAIL, 0.55);
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x - ux * 18, p.y - uy * 18);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.lineCap = 'butt';
      glowDisc(ctx, p.x, p.y, 6, rgba(RAIL, 0.7));
      drawShape(ctx, 'circle', p.x, p.y, 2.6, '#ffffff');
      return true;
    }
    default:
      return false;
  }
}

// ── Enemies ──────────────────────────────────────────────────────────────────

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

  if (detail) {
    // airborne units cast a shadow on the arena floor below them
    if (flying) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + 9, r * 0.8, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // a faint advance-trail above (they descend) — solid alpha; avoids a
    // per-enemy, per-frame gradient allocation in the hot draw loop.
    ctx.fillStyle = def.color + '33';
    ctx.fillRect(e.x - r * 0.45, e.y - r * 2.2, r * 0.9, r * 2.2);
  }

  const drawY = flying && detail ? e.y - 4 : e.y; // lift fliers off the floor

  // ── Boss signature (behind the body): threat glow, spinning crown + ring ──
  if (tier === 'boss' && detail) {
    glowDisc(ctx, e.x, drawY, r * 2.3 * pulse(t, 2.2, 0.92, 1.08), THEME.boss.glow);
    spikeCrown(ctx, e.x, drawY, r * 1.02, r * 0.5, 8, THEME.boss.crown, t * 0.6);
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
  }

  // body + a tier-weighted rim so it reads as a solid, threat-ranked unit
  drawShape(ctx, shape, e.x, drawY, r, def.color);
  if (detail) {
    const rim = tier === 'boss' ? THEME.boss.rim : tier === 'elite' ? THEME.elite.rim : THEME.enemy.rim;
    strokeShape(ctx, shape, e.x, drawY, r, rim, tier === 'normal' ? 1.5 : 2.25);
    drawShape(ctx, shape, e.x, drawY - r * 0.32, r * 0.4, THEME.enemy.gloss); // sheen = volume
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
    }
  }
}

// Presentation-only afterimage buffer (primary hero) — never read by sim.
const heroTrail: { x: number; y: number }[] = [];
// Absorb-shield barrier tint (matches the status framework's Shield buff color).
const SHIELD_RGB = hexRgb('#9ad0ff');
// Low-HP urgency tint for minions (the shared "danger" red).
const MINION_LOW_RGB = hexRgb('#ff5d73');

const HERO_SHAPE = { ravager: 'diamond', shepherd: 'hex', overseer: 'triangle' } as const;

function drawHeroes(ctx: CanvasRenderingContext2D, rs: RenderState, cosmeticTiers: Partial<Record<string, number>> = {}): void {
  for (let i = 0; i < rs.heroes.length; i++) drawHero(ctx, rs, rs.heroes[i], i === 0, cosmeticTiers[rs.heroes[i].kind] ?? 0);
}

function drawHero(ctx: CanvasRenderingContext2D, rs: RenderState, h: RenderState['heroes'][number], primary: boolean, tier = 0): void {
  const t = rs.time;
  const def = HERO_DEFS[h.kind];
  const tint = hexRgb(def.color); // class-colored halo/locator/trail
  const shape = HERO_SHAPE[h.kind];
  const down = h.down;

  // Shepherd's vital aura / Overseer's disruption field — show the role's reach.
  if (!down && def.pulseRadius > 0) {
    const reach = def.pulseRadius * pulse(t, h.kind === 'overseer' ? 2.4 : 1.6, 0.95, 1.05);
    ring(ctx, h.x, h.y, reach, rgba(tint, pulse(t, 2, 0.1, 0.22)), 1.2, [5, 6]);
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
  // layered core: dark rim → class-colored body → bright nucleus (reads as a hero)
  drawShape(ctx, shape, h.x, h.y, 16, THEME.hero.rim);
  drawShape(ctx, shape, h.x, h.y, 13, def.color);
  drawShape(ctx, shape, h.x, h.y - 2, 5, THEME.hero.core);
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

function drawPressureVignette(ctx: CanvasRenderingContext2D, pressure: number, t: number): void {
  if (pressure <= 0.02) return;
  const a = pressure * (0.35 + 0.1 * Math.sin(t * 6)); // throb when pressed hard
  const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.62, HEIGHT * 0.3, WIDTH / 2, HEIGHT * 0.62, HEIGHT * 0.75);
  g.addColorStop(0, rgba(THEME.vignette, 0));
  g.addColorStop(1, rgba(THEME.vignette, Math.min(0.55, a)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
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
    drawRangeIndicator(ctx, slot.x, slot.y, rs.effectiveRanges[rs.selectedTower] ?? def.range, def.firing, tone, rs.time);

    // animated selection frame on the target pad
    const sf = CELL - 8;
    roundRectPath(ctx, slot.x - sf / 2, slot.y - sf / 2, sf, sf, 6);
    ctx.strokeStyle = rgba(tone, pulse(rs.time, 4, 0.5, 0.9));
    ctx.lineWidth = 2;
    ctx.stroke();

    if (locked) labelAt(ctx, slot.x, slot.y - CELL / 2 - 6, 'LOCKED', THEME.select.lockedLabel);
    return;
  }

  if (tower) {
    const def = TOWER_DEFS[tower.kind];
    // selection: show the selected tower's effective range in its class-appropriate form
    drawRangeIndicator(ctx, tower.x, tower.y, rs.effectiveRanges[tower.kind] ?? def.range, def.firing, THEME.target.range, rs.time);
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
