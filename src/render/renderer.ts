// Canvas 2D renderer. Reads the sim's RenderState and draws it; holds no game
// logic and never mutates the sim (ARCHITECTURE.md §2: renderer reads, never owns).

import {
  CELL,
  COLS,
  HEIGHT,
  ROWS,
  WIDTH,
  buildCells,
  buildCellAt,
  nucleusPoint,
  pathPoints,
} from '../core/map';
import { ENEMY_DEFS, TOWER_DEFS } from '../core/config';
import type { RenderState } from '../core/game';

export interface Pointer {
  x: number;
  y: number;
}

export function drawGame(
  ctx: CanvasRenderingContext2D,
  rs: RenderState,
  pointer: Pointer | null,
): void {
  // background
  ctx.fillStyle = '#080b11';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawGrid(ctx);
  drawBuildCells(ctx, rs);
  drawPath(ctx);
  drawNucleus(ctx);

  for (const p of rs.pools) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(150, 220, 70, 0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(150, 220, 70, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawOverchargeLinks(ctx, rs);

  for (const t of rs.towers) drawTower(ctx, t);

  for (const p of rs.projectiles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.kind === 'mortar' ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = p.kind === 'mortar' ? '#d6f06a' : '#aef0ff';
    ctx.fill();
  }

  for (const e of rs.enemies) drawEnemy(ctx, e);

  drawHero(ctx, rs);

  // placement ghost / range preview
  if (rs.selectedTower && pointer) {
    const cell = buildCellAt(pointer.x, pointer.y);
    if (cell) {
      const def = TOWER_DEFS[rs.selectedTower];
      const occupied = rs.towers.some((t) => t.cell === cell.index);
      ctx.beginPath();
      ctx.arc(cell.x, cell.y, Math.max(def.range, 14), 0, Math.PI * 2);
      ctx.fillStyle = occupied ? 'rgba(255,80,80,0.05)' : 'rgba(120,200,255,0.06)';
      ctx.fill();
      ctx.strokeStyle = occupied ? 'rgba(255,80,80,0.5)' : 'rgba(120,200,255,0.5)';
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = occupied ? 'rgba(255,80,80,0.35)' : 'rgba(120,200,255,0.35)';
      ctx.fillRect(cell.x - CELL / 2 + 3, cell.y - CELL / 2 + 3, CELL - 6, CELL - 6);
    }
  }

  if (rs.armedAbility && pointer) {
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 72, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(90, 209, 255, 0.7)';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const f of rs.floats) {
    ctx.globalAlpha = Math.min(1, f.life * 2);
    ctx.fillStyle = f.color;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';
}

function drawGrid(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL, 0);
    ctx.lineTo(c * CELL, HEIGHT);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL);
    ctx.lineTo(WIDTH, r * CELL);
    ctx.stroke();
  }
}

function drawBuildCells(ctx: CanvasRenderingContext2D, rs: RenderState): void {
  for (const b of buildCells) {
    const occupied = rs.towers.some((t) => t.cell === b.index);
    if (occupied) continue;
    ctx.fillStyle = 'rgba(90, 130, 180, 0.08)';
    ctx.fillRect(b.x - CELL / 2 + 4, b.y - CELL / 2 + 4, CELL - 8, CELL - 8);
  }
}

function drawPath(ctx: CanvasRenderingContext2D): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
  for (let i = 1; i < pathPoints.length; i++) ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
  ctx.strokeStyle = '#1d2433';
  ctx.lineWidth = 30;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120, 90, 160, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawNucleus(ctx: CanvasRenderingContext2D): void {
  const { x, y } = nucleusPoint;
  const grad = ctx.createRadialGradient(x, y, 4, x, y, 26);
  grad.addColorStop(0, 'rgba(255, 90, 120, 0.95)');
  grad.addColorStop(1, 'rgba(255, 90, 120, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff5d73';
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, Math.PI * 2);
  ctx.fill();
}

function drawOverchargeLinks(ctx: CanvasRenderingContext2D, rs: RenderState): void {
  for (const t of rs.towers) {
    if (!t.overcharged) continue;
    ctx.strokeStyle = 'rgba(255, 122, 89, 0.35)';
    ctx.lineWidth = 2;
    // draw a soft halo to indicate buffed
    ctx.beginPath();
    ctx.arc(t.x, t.y, 18, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawTower(ctx: CanvasRenderingContext2D, t: RenderState['towers'][number]): void {
  const def = TOWER_DEFS[t.kind];
  ctx.fillStyle = def.color;
  if (t.kind === 'needle') {
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - 12);
    ctx.lineTo(t.x + 9, t.y + 9);
    ctx.lineTo(t.x - 9, t.y + 9);
    ctx.closePath();
    ctx.fill();
  } else if (t.kind === 'mortar') {
    ctx.fillRect(t.x - 10, t.y - 10, 20, 20);
  } else {
    ctx.beginPath();
    ctx.arc(t.x, t.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: RenderState['enemies'][number]): void {
  const def = ENEMY_DEFS[e.kind];
  ctx.beginPath();
  ctx.arc(e.x, e.y, def.radius, 0, Math.PI * 2);
  ctx.fillStyle = def.color;
  ctx.fill();

  if (e.corrosion > 0) {
    ctx.strokeStyle = 'rgba(150, 220, 70, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, def.radius + 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (e.fracture > 0) {
    ctx.strokeStyle = `rgba(90, 209, 255, ${Math.min(0.9, 0.25 + e.fracture * 0.12)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, def.radius + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (e.shredFlash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.8, e.shredFlash * 2)})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, def.radius + 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // hp bar
  const w = def.radius * 2;
  const pct = Math.max(0, e.hp / e.maxHp);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(e.x - w / 2, e.y - def.radius - 7, w, 3);
  ctx.fillStyle = pct > 0.5 ? '#7CFC9B' : pct > 0.25 ? '#ffd24d' : '#ff5d73';
  ctx.fillRect(e.x - w / 2, e.y - def.radius - 7, w * pct, 3);
}

function drawHero(ctx: CanvasRenderingContext2D, rs: RenderState): void {
  const h = rs.hero;
  // leash
  ctx.strokeStyle = 'rgba(255, 210, 77, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(h.rally.x, h.rally.y, 160, 0, Math.PI * 2);
  ctx.stroke();

  if (h.down) {
    ctx.globalAlpha = 0.4;
  }
  ctx.fillStyle = '#ffd24d';
  ctx.beginPath();
  ctx.moveTo(h.x, h.y - 13);
  ctx.lineTo(h.x + 11, h.y);
  ctx.lineTo(h.x, h.y + 13);
  ctx.lineTo(h.x - 11, h.y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  if (h.down) {
    ctx.fillStyle = '#ff9aa8';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(h.respawn)}s`, h.x, h.y - 18);
    ctx.textAlign = 'left';
  } else {
    const w = 26;
    const pct = Math.max(0, h.hp / h.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(h.x - w / 2, h.y - 20, w, 3);
    ctx.fillStyle = '#ffd24d';
    ctx.fillRect(h.x - w / 2, h.y - 20, w * pct, 3);
  }
}
