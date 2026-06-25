// Canvas 2D renderer. Reads the sim's RenderState and draws it; holds no game
// logic and never mutates the sim (ARCHITECTURE.md §2: renderer reads, never owns).

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
  drawDefenseZone(ctx);
  drawObstacles(ctx);

  const occupied = new Set(rs.towers.map((t) => t.slot));
  drawSlots(ctx, rs, occupied);
  drawBase(ctx);

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

function drawDefenseZone(ctx: CanvasRenderingContext2D): void {
  // tint the bottom defensive region
  const grad = ctx.createLinearGradient(0, DEFENSE_TOP_Y, 0, HEIGHT);
  grad.addColorStop(0, 'rgba(255, 90, 120, 0.04)');
  grad.addColorStop(1, 'rgba(255, 90, 120, 0.12)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, DEFENSE_TOP_Y, WIDTH, HEIGHT - DEFENSE_TOP_Y);

  // the defensive line itself
  ctx.strokeStyle = 'rgba(255, 90, 120, 0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 6]);
  ctx.beginPath();
  ctx.moveTo(0, DEFENSE_TOP_Y);
  ctx.lineTo(WIDTH, DEFENSE_TOP_Y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(255, 140, 160, 0.7)';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText('DEFENSIVE LINE', 8, DEFENSE_TOP_Y - 6);
}

function drawObstacles(ctx: CanvasRenderingContext2D): void {
  for (const o of obstacleCells) {
    ctx.fillStyle = '#161c27';
    ctx.fillRect(o.x - CELL / 2, o.y - CELL / 2, CELL, CELL);
    ctx.strokeStyle = 'rgba(120,140,170,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(o.x - CELL / 2 + 0.5, o.y - CELL / 2 + 0.5, CELL - 1, CELL - 1);
  }
}

function drawSlots(ctx: CanvasRenderingContext2D, rs: RenderState, occupied: Set<number>): void {
  const s = CELL - 12;
  for (const slot of towerSlots) {
    if (occupied.has(slot.index)) continue; // tower is drawn instead
    const locked = slot.index >= rs.unlockedSlots;
    const x = slot.x - s / 2;
    const y = slot.y - s / 2;
    if (locked) {
      ctx.strokeStyle = 'rgba(120,130,150,0.22)';
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, s, s);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(120,130,150,0.3)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔒', slot.x, slot.y + 4);
      ctx.textAlign = 'left';
    } else {
      // empty, buildable: an obvious bracketed node with a faint fill and a +
      ctx.fillStyle = 'rgba(90, 200, 255, 0.06)';
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = 'rgba(90, 200, 255, 0.5)';
      ctx.lineWidth = 1.5;
      drawBracket(ctx, slot.x, slot.y, s);
      ctx.strokeStyle = 'rgba(90, 200, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(slot.x - 4, slot.y);
      ctx.lineTo(slot.x + 4, slot.y);
      ctx.moveTo(slot.x, slot.y - 4);
      ctx.lineTo(slot.x, slot.y + 4);
      ctx.stroke();
    }
  }
}

/** Corner brackets around a slot — reads clearly as a placement node. */
function drawBracket(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const h = s / 2;
  const a = 7; // arm length
  const L = [
    [-h, -h, 1, 0],
    [-h, -h, 0, 1],
    [h, -h, -1, 0],
    [h, -h, 0, 1],
    [-h, h, 1, 0],
    [-h, h, 0, -1],
    [h, h, -1, 0],
    [h, h, 0, -1],
  ];
  ctx.beginPath();
  for (let i = 0; i < L.length; i += 2) {
    const [ox, oy] = L[i];
    ctx.moveTo(cx + ox, cy + oy);
    ctx.lineTo(cx + ox + L[i][2] * a, cy + oy + L[i][3] * a);
    ctx.moveTo(cx + L[i + 1][0], cy + L[i + 1][1]);
    ctx.lineTo(cx + L[i + 1][0] + L[i + 1][2] * a, cy + L[i + 1][1] + L[i + 1][3] * a);
  }
  ctx.stroke();
}

function drawBase(ctx: CanvasRenderingContext2D): void {
  const { x, y } = nucleusPoint;
  const grad = ctx.createRadialGradient(x, y, 5, x, y, 34);
  grad.addColorStop(0, 'rgba(255, 90, 120, 0.95)');
  grad.addColorStop(1, 'rgba(255, 90, 120, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff5d73';
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawOverchargeLinks(ctx: CanvasRenderingContext2D, rs: RenderState): void {
  for (const t of rs.towers) {
    if (!t.overcharged) continue;
    ctx.strokeStyle = 'rgba(255, 122, 89, 0.35)';
    ctx.lineWidth = 2;
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
  const r = def.radius;
  ctx.beginPath();
  ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
  ctx.fillStyle = def.color;
  ctx.fill();

  if (e.corrosion > 0) {
    ctx.strokeStyle = 'rgba(150, 220, 70, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (e.fracture > 0) {
    ctx.strokeStyle = `rgba(90, 209, 255, ${Math.min(0.9, 0.25 + e.fracture * 0.12)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (e.shredFlash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.8, e.shredFlash * 2)})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + 3, 0, Math.PI * 2);
    ctx.fill();
  }

  const w = r * 2;
  const pct = Math.max(0, e.hp / e.maxHp);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(e.x - w / 2, e.y - r - 7, w, 3);
  ctx.fillStyle = pct > 0.5 ? '#7CFC9B' : pct > 0.25 ? '#ffd24d' : '#ff5d73';
  ctx.fillRect(e.x - w / 2, e.y - r - 7, w * pct, 3);
}

function drawHero(ctx: CanvasRenderingContext2D, rs: RenderState): void {
  const h = rs.hero;
  if (h.down) ctx.globalAlpha = 0.4;
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

function drawPointer(ctx: CanvasRenderingContext2D, rs: RenderState, pointer: Pointer | null): void {
  if (!pointer) return;

  // ability targeting preview
  if (rs.armedAbility) {
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 72, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(90, 209, 255, 0.7)';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  const slot = slotAt(pointer.x, pointer.y);
  if (!slot) return;
  const tower = rs.towers.find((t) => t.slot === slot.index);

  // placement ghost when a tower is selected
  if (rs.selectedTower) {
    const def = TOWER_DEFS[rs.selectedTower];
    const locked = slot.index >= rs.unlockedSlots;
    const invalid = locked || !!tower;
    ctx.beginPath();
    ctx.arc(slot.x, slot.y, Math.max(def.range, 16), 0, Math.PI * 2);
    ctx.fillStyle = invalid ? 'rgba(255,80,80,0.05)' : 'rgba(120,200,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = invalid ? 'rgba(255,80,80,0.6)' : 'rgba(120,200,255,0.6)';
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = invalid ? 'rgba(255,80,80,0.3)' : 'rgba(120,200,255,0.35)';
    ctx.fillRect(slot.x - CELL / 2 + 4, slot.y - CELL / 2 + 4, CELL - 8, CELL - 8);
    if (locked) labelAt(ctx, slot.x, slot.y - CELL / 2 - 6, 'LOCKED', '#ff8a8a');
    return;
  }

  // occupied-slot info on hover
  if (tower) {
    const def = TOWER_DEFS[tower.kind];
    if (def.range > 0) {
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, def.range, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(120,200,255,0.35)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    labelAt(ctx, tower.x, tower.y - CELL / 2 - 6, def.name, def.color);
  }
}

function labelAt(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string): void {
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = 'rgba(8,11,17,0.85)';
  ctx.fillRect(x - w / 2, y - 12, w, 15);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}
