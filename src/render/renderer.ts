// Canvas 2D renderer. Reads the sim's RenderState and draws it; holds no game
// logic and never mutates the sim (ARCHITECTURE.md §2: renderer reads, never owns).
//
// Presentation goal: a large, open, cyberpunk bio-horror arena — a living hive
// holding a defensive line against an invading ecosystem that descends from above.
// Pressure escalates visually as the swarm nears the line / the hive weakens.

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

export interface Pointer {
  x: number;
  y: number;
}

const SPAWN_BAND = CELL * 1.4; // top "breeding membrane" the swarm pours from

// Canvas palette — mirrors the CSS design tokens (src/index.css :root) so the
// battlefield and the DOM HUD speak one color language. RGB triplets let each
// draw call pick its own alpha while keeping the hue canonical; SOLID has the
// opaque hex for fills. Environment gradients stay bespoke (their own zone).
const RGB = {
  danger: '255, 93, 115', //  --danger   #ff5d73
  kinetic: '90, 209, 255', // --kinetic  #5ad1ff
  caustic: '182, 232, 74', // --caustic  #b6e84a
  vital: '255, 122, 89', //   --vital    #ff7a59
  gold: '255, 210, 77', //    --gold     #ffd24d
} as const;
const SOLID = {
  danger: '#ff5d73', //  --danger
  success: '#3fe08a', // --success
  warn: '#ffb24d', //    --warn
  gold: '#ffd24d', //    --gold
} as const;
const rgba = (rgb: string, a: number): string => `rgba(${rgb}, ${a})`;

// Shared with the DOM UI (--font-ui) so on-canvas text matches the HUD.
const UI_FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** HP/health fill color, matching the HUD integrity thresholds (Hud.tsx). */
function hpColor(pct: number): string {
  return pct > 0.5 ? SOLID.success : pct > 0.25 ? SOLID.warn : SOLID.danger;
}

function pulse(t: number, speed: number, lo: number, hi: number): number {
  return lo + (hi - lo) * (0.5 + 0.5 * Math.sin(t * speed));
}

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
  drawGrid(ctx);
  drawSpawnZone(ctx, t);
  drawDefenseZone(ctx, t, pressure);
  drawObstacles(ctx);

  const occupied = new Set(rs.towers.map((t2) => t2.slot));
  drawHiveTendrils(ctx, rs, t);
  drawSlots(ctx, rs, occupied);
  drawBase(ctx, rs, t);

  for (const p of rs.pools) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = rgba(RGB.caustic, 0.16);
    ctx.fill();
    ctx.strokeStyle = rgba(RGB.caustic, 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawOverchargeLinks(ctx, rs);
  for (const tw of rs.towers) drawTower(ctx, tw);

  for (const p of rs.projectiles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.kind === 'mortar' ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = p.kind === 'mortar' ? '#d6f06a' : '#aef0ff';
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
    ctx.font = `bold 14px ${UI_FONT}`;
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
  const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  g.addColorStop(0, '#0c0a16');
  g.addColorStop(0.45, '#070a10');
  g.addColorStop(0.8, '#0a0810');
  g.addColorStop(1, '#150a10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawGrid(ctx: CanvasRenderingContext2D): void {
  ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.beginPath();
    ctx.moveTo(c * CELL, 0);
    ctx.lineTo(c * CELL, HEIGHT);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.beginPath();
    ctx.moveTo(0, r * CELL);
    ctx.lineTo(WIDTH, r * CELL);
    ctx.stroke();
  }
}

function drawSpawnZone(ctx: CanvasRenderingContext2D, t: number): void {
  // A hostile "breeding membrane" the swarm pours out of along the top edge.
  const g = ctx.createLinearGradient(0, 0, 0, SPAWN_BAND);
  g.addColorStop(0, `rgba(150, 70, 220, ${pulse(t, 1.6, 0.16, 0.26)})`);
  g.addColorStop(0.6, 'rgba(70, 180, 140, 0.08)');
  g.addColorStop(1, 'rgba(70, 180, 140, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, SPAWN_BAND);

  // membrane edge
  ctx.strokeStyle = `rgba(180, 110, 230, ${pulse(t, 1.6, 0.4, 0.7)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const yb = SPAWN_BAND;
  for (let x = 0; x <= WIDTH; x += 12) {
    const yy = yb + Math.sin(x * 0.05 + t * 1.5) * 3;
    if (x === 0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  }
  ctx.stroke();

  // descending chevrons — the swarm's direction of advance
  ctx.fillStyle = 'rgba(180, 120, 230, 0.18)';
  const drift = (t * 18) % 28;
  for (let x = CELL; x < WIDTH; x += 90) {
    const y = 6 + drift;
    ctx.beginPath();
    ctx.moveTo(x - 7, y);
    ctx.lineTo(x + 7, y);
    ctx.lineTo(x, y + 7);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(190, 140, 235, 0.7)';
  ctx.font = `700 10px ${UI_FONT}`;
  ctx.fillText('▼ ENEMY SPAWN', 8, 12);
}

function drawDefenseZone(ctx: CanvasRenderingContext2D, t: number, pressure: number): void {
  const grad = ctx.createLinearGradient(0, DEFENSE_TOP_Y, 0, HEIGHT);
  grad.addColorStop(0, `rgba(255, 90, 120, ${0.04 + pressure * 0.06})`);
  grad.addColorStop(1, `rgba(255, 90, 120, ${0.12 + pressure * 0.12})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, DEFENSE_TOP_Y, WIDTH, HEIGHT - DEFENSE_TOP_Y);

  // The defensive line — a glowing energy barrier (flows + brightens under pressure).
  const glow = pulse(t, 2, 0.4, 0.7) + pressure * 0.3;
  ctx.save();
  ctx.shadowColor = 'rgba(255, 90, 120, 0.9)';
  ctx.shadowBlur = 8 + pressure * 10;
  ctx.strokeStyle = `rgba(255, ${110 - pressure * 50}, 140, ${Math.min(1, glow)})`;
  ctx.lineWidth = 2 + pressure * 1.5;
  ctx.setLineDash([14, 8]);
  ctx.lineDashOffset = -((t * 40) % 22);
  ctx.beginPath();
  ctx.moveTo(0, DEFENSE_TOP_Y);
  ctx.lineTo(WIDTH, DEFENSE_TOP_Y);
  ctx.stroke();
  ctx.restore();
  ctx.setLineDash([]);

  ctx.fillStyle = `rgba(255, 150, 165, ${0.7 + pressure * 0.3})`;
  ctx.font = `700 11px ${UI_FONT}`;
  ctx.fillText('— HOLD THE LINE —', 8, DEFENSE_TOP_Y - 6);
}

function drawObstacles(ctx: CanvasRenderingContext2D): void {
  for (const o of obstacleCells) {
    ctx.fillStyle = '#13161f';
    ctx.fillRect(o.x - CELL / 2, o.y - CELL / 2, CELL, CELL);
    ctx.strokeStyle = 'rgba(120,140,170,0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(o.x - CELL / 2 + 0.5, o.y - CELL / 2 + 0.5, CELL - 1, CELL - 1);
  }
}

function drawHiveTendrils(ctx: CanvasRenderingContext2D, rs: RenderState, t: number): void {
  // Living veins from the core feeding its grown defenses.
  const { x: cx, y: cy } = nucleusPoint;
  ctx.lineWidth = 2;
  for (const tw of rs.towers) {
    const a = pulse(t + tw.id, 2.4, 0.05, 0.16);
    ctx.strokeStyle = `rgba(255, 110, 90, ${a})`;
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

  const grad = ctx.createRadialGradient(x, y, 5, x, y, R);
  grad.addColorStop(0, 'rgba(255, 100, 120, 0.95)');
  grad.addColorStop(0.5, 'rgba(255, 90, 120, 0.35)');
  grad.addColorStop(1, 'rgba(255, 90, 120, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();

  // core body
  ctx.fillStyle = SOLID.danger;
  ctx.beginPath();
  ctx.arc(x, y, 15 * beat, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(x, y, 5 * beat, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 170, 180, 0.85)';
  ctx.font = `700 10px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('HIVE CORE', x, y + 34);
  ctx.textAlign = 'left';
}

// ── Slots / towers (placement system from the battlefield refactor) ───────────

function drawSlots(ctx: CanvasRenderingContext2D, rs: RenderState, occupied: Set<number>): void {
  const s = CELL - 12;
  for (const slot of towerSlots) {
    if (occupied.has(slot.index)) continue;
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
      ctx.font = `10px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('🔒', slot.x, slot.y + 4);
      ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = rgba(RGB.kinetic, 0.06); // buildable = kinetic cyan
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = rgba(RGB.kinetic, 0.5);
      ctx.lineWidth = 1.5;
      drawBracket(ctx, slot.x, slot.y, s);
      ctx.strokeStyle = rgba(RGB.kinetic, 0.35);
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

function drawBracket(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const h = s / 2;
  const a = 7;
  const L = [
    [-h, -h, 1, 0], [-h, -h, 0, 1],
    [h, -h, -1, 0], [h, -h, 0, 1],
    [-h, h, 1, 0], [-h, h, 0, -1],
    [h, h, -1, 0], [h, h, 0, -1],
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

function drawOverchargeLinks(ctx: CanvasRenderingContext2D, rs: RenderState): void {
  for (const t of rs.towers) {
    if (!t.overcharged) continue;
    ctx.strokeStyle = rgba(RGB.vital, 0.35);
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
    // a faint advance-trail above (they descend)
    const tg = ctx.createLinearGradient(e.x, e.y - r * 2.4, e.x, e.y);
    tg.addColorStop(0, 'rgba(0,0,0,0)');
    tg.addColorStop(1, def.color + '55');
    ctx.fillStyle = tg;
    ctx.fillRect(e.x - r * 0.5, e.y - r * 2.4, r, r * 2.4);
  }

  const drawY = flying && detail ? e.y - 4 : e.y; // lift fliers off the floor
  ctx.beginPath();
  ctx.arc(e.x, drawY, r, 0, Math.PI * 2);
  ctx.fillStyle = def.color;
  ctx.fill();

  if (detail) {
    if (e.corrosion > 0) {
      ctx.strokeStyle = rgba(RGB.caustic, 0.9); // Corrosion = caustic ring
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, drawY, r + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (e.fracture > 0) {
      ctx.strokeStyle = rgba(RGB.kinetic, Math.min(0.9, 0.25 + e.fracture * 0.12)); // Fracture = kinetic rim
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, drawY, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (e.shredFlash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.8, e.shredFlash * 2)})`;
      ctx.beginPath();
      ctx.arc(e.x, drawY, r + 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // danger aura once an enemy has pressed into the defensive zone
    if (e.y > DEFENSE_TOP_Y) {
      ctx.strokeStyle = rgba(RGB.danger, 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(e.x, drawY, r + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    const w = r * 2;
    const pct = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(e.x - w / 2, drawY - r - 7, w, 3);
    ctx.fillStyle = hpColor(pct); // match the HUD integrity palette
    ctx.fillRect(e.x - w / 2, drawY - r - 7, w * pct, 3);
  }
}

function drawHero(ctx: CanvasRenderingContext2D, rs: RenderState): void {
  const h = rs.hero;
  if (h.down) ctx.globalAlpha = 0.4;
  ctx.fillStyle = SOLID.gold; // hero = gold core (identity, matches HUD hero bar)
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
    ctx.font = `bold 12px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(h.respawn)}s`, h.x, h.y - 18);
    ctx.textAlign = 'left';
  } else {
    const w = 26;
    const pct = Math.max(0, h.hp / h.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(h.x - w / 2, h.y - 20, w, 3);
    ctx.fillStyle = SOLID.gold;
    ctx.fillRect(h.x - w / 2, h.y - 20, w * pct, 3);
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
  g.addColorStop(0, 'rgba(255, 40, 70, 0)');
  g.addColorStop(1, `rgba(255, 30, 60, ${Math.min(0.55, a)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

// ── Pointer (placement ghost / ability preview / slot info) ──────────────────

function drawPointer(ctx: CanvasRenderingContext2D, rs: RenderState, pointer: Pointer | null): void {
  if (!pointer) return;

  if (rs.armedAbility) {
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 72, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(RGB.kinetic, 0.7);
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  const slot = slotAt(pointer.x, pointer.y);
  if (!slot) return;
  const tower = rs.towers.find((tw) => tw.slot === slot.index);

  if (rs.selectedTower) {
    const def = TOWER_DEFS[rs.selectedTower];
    const locked = slot.index >= rs.unlockedSlots;
    const invalid = locked || !!tower;
    ctx.beginPath();
    ctx.arc(slot.x, slot.y, Math.max(def.range, 16), 0, Math.PI * 2);
    ctx.fillStyle = invalid ? rgba(RGB.danger, 0.05) : rgba(RGB.kinetic, 0.06);
    ctx.fill();
    ctx.strokeStyle = invalid ? rgba(RGB.danger, 0.6) : rgba(RGB.kinetic, 0.6);
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = invalid ? rgba(RGB.danger, 0.3) : rgba(RGB.kinetic, 0.35);
    ctx.fillRect(slot.x - CELL / 2 + 4, slot.y - CELL / 2 + 4, CELL - 8, CELL - 8);
    if (locked) labelAt(ctx, slot.x, slot.y - CELL / 2 - 6, 'LOCKED', SOLID.danger);
    return;
  }

  if (tower) {
    const def = TOWER_DEFS[tower.kind];
    if (def.range > 0) {
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, def.range, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(RGB.kinetic, 0.35);
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    labelAt(ctx, tower.x, tower.y - CELL / 2 - 6, def.name, def.color);
  }
}

function labelAt(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string): void {
  ctx.font = `600 11px ${UI_FONT}`;
  ctx.textAlign = 'center';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = 'rgba(8,11,17,0.85)';
  ctx.fillRect(x - w / 2, y - 12, w, 15);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}
