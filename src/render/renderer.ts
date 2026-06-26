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
  HEIGHT,
  ROWS,
  WIDTH,
  nucleusPoint,
  obstacleCells,
  slotAt,
  towerSlots,
} from '../core/map';
import { ENEMY_DEFS, PERF, TOWER_DEFS } from '../core/config';
import type { RenderState } from '../core/game';
import { THEME, ENEMY_SHAPE, TOWER_SHAPE, rgba } from './theme';
import { drawShape, easeOutCubic, glowDisc, healthBar, pulse, ring, roundRectPath } from './vfx';

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
  for (const tw of rs.towers) drawTower(ctx, tw);

  for (const p of rs.projectiles) {
    const splash = p.behavior === 'splash';
    ctx.beginPath();
    ctx.arc(p.x, p.y, splash ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = splash ? THEME.projectile.splash : THEME.projectile.bolt;
    ctx.fill();
  }

  // LOD: drop per-enemy embellishments when the swarm is huge (perf headroom).
  const detail = rs.enemies.length < PERF.lodEnemyCount;
  for (const e of rs.enemies) drawEnemy(ctx, e, detail);

  drawParticles(ctx, rs);
  drawHero(ctx, rs);
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
  ctx.font = '700 10px system-ui, sans-serif';
  ctx.fillText('▼ ENEMY SPAWN', 8, 12);
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
      ctx.fillStyle = THEME.slot.lockedLabel;
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔒', slot.x, slot.y + 4);
      ctx.textAlign = 'left';
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

function drawTower(ctx: CanvasRenderingContext2D, t: RenderState['towers'][number]): void {
  const def = TOWER_DEFS[t.kind];
  drawShape(ctx, TOWER_SHAPE[t.kind], t.x, t.y, TOWER_R, def.color);
  if (t.kind === 'reactor') {
    drawShape(ctx, 'circle', t.x, t.y, 5, 'rgba(255,255,255,0.25)');
  }
}

// ── Enemies ──────────────────────────────────────────────────────────────────

function drawEnemy(ctx: CanvasRenderingContext2D, e: RenderState['enemies'][number], detail: boolean): void {
  const def = ENEMY_DEFS[e.kind];
  const r = def.radius;
  const flying = def.behavior.flying === true;

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
  drawShape(ctx, ENEMY_SHAPE[e.kind], e.x, drawY, r, def.color);

  if (detail) {
    if (e.corrosion > 0) ring(ctx, e.x, drawY, r + 2, THEME.enemy.corrosion, 2);
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

    // health pip — only once damaged, to keep a fresh swarm uncluttered
    const pct = Math.max(0, e.hp / e.maxHp);
    if (pct < 1) {
      const fill = pct > 0.5 ? THEME.enemy.hpHigh : pct > 0.25 ? THEME.enemy.hpMid : THEME.enemy.hpLow;
      healthBar(ctx, e.x, drawY - r - 9, r * 2, pct, THEME.enemy.hpBack, THEME.enemy.hpEdge, fill);
    }
  }
}

function drawHero(ctx: CanvasRenderingContext2D, rs: RenderState): void {
  const h = rs.hero;
  if (h.down) ctx.globalAlpha = 0.4;
  drawShape(ctx, 'diamond', h.x, h.y, 13, THEME.hero.body);
  ctx.globalAlpha = 1;

  if (h.down) {
    ctx.fillStyle = THEME.hero.down;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(h.respawn)}s`, h.x, h.y - 18);
    ctx.textAlign = 'left';
  } else {
    const pct = Math.max(0, h.hp / h.maxHp);
    healthBar(ctx, h.x, h.y - 21, 26, pct, THEME.hero.hpBack, THEME.enemy.hpEdge, THEME.hero.body);
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
    const rad = Math.max(def.range, 16);

    // range preview (filled + outlined)
    ctx.beginPath();
    ctx.arc(slot.x, slot.y, rad, 0, Math.PI * 2);
    ctx.fillStyle = rgba(tone, 0.05);
    ctx.fill();
    ring(ctx, slot.x, slot.y, rad, rgba(tone, 0.6), 1.5, [5, 4]);

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
    if (def.range > 0) {
      // subtle fill + a slowly rotating dashed range ring
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, def.range, 0, Math.PI * 2);
      ctx.fillStyle = rgba(THEME.target.range, 0.04);
      ctx.fill();
      ctx.save();
      ctx.strokeStyle = rgba(THEME.target.range, 0.4);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -((rs.time * 18) % 20);
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, def.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);
    }
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
