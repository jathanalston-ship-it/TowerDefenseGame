// TOWER FORMS (docs/RENDER-PIPELINE.md, docs/TOWERS.md) — procedural bio-mechanical TURRET bodies
// that replace the flat placeholder shapes. Each kind is a rooted structure (a planted mount + a
// firing apparatus — barrel / cannon / maw / lens / antenna …) with idle motion + a FIRING recoil,
// so the arsenal reads as distinct living weapons. The tower's OTHER layers (rooting tendrils, the
// per-kind organs, mastery/adaptation/star/branch/strain evolutions) still draw over this base.
//
// Towers fire UP-field (the swarm descends), so barrels point up (−y) and recoil kicks DOWN on `fire`.
// Cosmetic + render-only (never read by the sim ⇒ golden-safe). Towers are few ⇒ always full detail.

import type { TowerKind } from '../core/types';

type Ctx = CanvasRenderingContext2D;

export type TowerForm = 'barrel' | 'cannon' | 'core' | 'nest' | 'monolith' | 'crystal' | 'maw' | 'lens' | 'pod' | 'antenna';

export const TOWER_FORM: Record<TowerKind, TowerForm> = {
  needle: 'barrel',   // a kinetic spike-barrel
  mortar: 'cannon',   // a heavy caustic mortar tube
  reactor: 'core',    // a pulsing bio-reactor (its bright core overlays)
  parasite: 'nest',   // an organic egg-nest (its churning sacs overlay)
  obelisk: 'monolith',// a tall psionic monolith (its glyph ring overlays)
  maw: 'maw',         // a ringed feeding mouth that gapes on fire
  chrysalis: 'crystal',// a faceted amber gem cluster
  effigy: 'monolith', // a gaunt violet totem spike
  coil: 'lens',       // a resonance lens emitter (its heat core overlays)
  siphon: 'lens',     // an ocular drain pod (its iris overlays)
  sower: 'pod',       // a swollen seed-pod that vents on a lob
  spire: 'antenna',   // a thin synaptic antenna, arcs off its tip
  polyp: 'maw',       // a rooted undertow mouth
};

// ── memoized colour shading (palette is per-kind — a handful of keys) ────────────────────────────
const shadeCache = new Map<string, string>();
function shade(hex: string, f: number): string {
  const key = hex + f; const hit = shadeCache.get(key); if (hit) return hit;
  const h = hex.replace('#', ''); const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { const k = 1 + f; r *= k; g *= k; b *= k; }
  const out = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`; shadeCache.set(key, out); return out;
}
const RIM = 'rgba(6,8,14,0.6)';

/** The shared planted BASE — a rooted trapezoidal mount, so every turret reads as grown into the floor. */
function mount(ctx: Ctx, x: number, y: number, r: number, c: string): void {
  ctx.beginPath();
  ctx.moveTo(x - r * 0.85, y + r * 0.9);
  ctx.lineTo(x - r * 0.6, y + r * 0.2);
  ctx.lineTo(x + r * 0.6, y + r * 0.2);
  ctx.lineTo(x + r * 0.85, y + r * 0.9);
  ctx.closePath();
  ctx.fillStyle = shade(c, -0.45); ctx.fill();
  ctx.strokeStyle = RIM; ctx.lineWidth = Math.max(1.2, r * 0.1); ctx.stroke();
}

/** A muzzle flare at (mx,my) scaled by the firing pulse — a sharp cross-spark + a hot core. */
function muzzle(ctx: Ctx, mx: number, my: number, r: number, c: string, fire: number): void {
  if (fire <= 0.02) return;
  const f = fire;
  ctx.fillStyle = `rgba(255,240,200,${0.9 * f})`;
  ctx.beginPath(); ctx.arc(mx, my, r * 0.32 * (0.6 + f), 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(${shadeToken(c, 0.4)},${0.7 * f})`; ctx.lineWidth = Math.max(1.5, r * 0.14);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a) * r * (0.4 + f * 0.6), my + Math.sin(a) * r * (0.4 + f * 0.6)); ctx.stroke(); }
}
// a lighter shade returned as an "r,g,b" token for rgba() (muzzle sparks)
function shadeToken(hex: string, f: number): string { return shade(hex, f).slice(4, -1).split(',').join(','); }

// ── per-form drawers ─────────────────────────────────────────────────────────────────────────
function barrel(ctx: Ctx, x: number, y: number, r: number, c: string, _now: number, fire: number, br: number): void {
  mount(ctx, x, y, r, c);
  const recoil = fire * r * 0.28; // kicks down into the mount
  const bx = x, by = y + recoil, len = r * 1.15, w = r * 0.34;
  ctx.fillStyle = shade(c, -0.15); ctx.strokeStyle = RIM; ctx.lineWidth = Math.max(1.2, r * 0.1);
  ctx.beginPath(); ctx.rect(bx - w, by - len, w * 2, len + r * 0.3); ctx.fill(); ctx.stroke(); // the barrel
  ctx.fillStyle = shade(c, 0.1); // a bright spike tip
  ctx.beginPath(); ctx.moveTo(bx - w, by - len); ctx.lineTo(bx, by - len - r * 0.5); ctx.lineTo(bx + w, by - len); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.1, r * 0.7 * br, r * 0.5, 0, 0, Math.PI * 2); // the housing
  ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = RIM; ctx.stroke();
  ctx.fillStyle = shade(c, 0.45); ctx.beginPath(); ctx.arc(x - r * 0.18, y - r * 0.02, r * 0.16, 0, Math.PI * 2); ctx.fill();
  muzzle(ctx, bx, by - len - r * 0.5, r, c, fire);
}

function cannon(ctx: Ctx, x: number, y: number, r: number, c: string, _now: number, fire: number, br: number): void {
  mount(ctx, x, y, r * 1.05, c);
  const recoil = fire * r * 0.34;
  const by = y + recoil;
  ctx.save(); ctx.translate(x, by); ctx.rotate(-0.16); // angled up-field
  ctx.fillStyle = shade(c, -0.25); ctx.strokeStyle = RIM; ctx.lineWidth = Math.max(1.4, r * 0.12);
  ctx.beginPath(); ctx.rect(-r * 0.42, -r * 1.15, r * 0.84, r * 1.25); ctx.fill(); ctx.stroke(); // fat tube
  ctx.fillStyle = shade(c, -0.5); ctx.beginPath(); ctx.ellipse(0, -r * 1.15, r * 0.42, r * 0.2, 0, 0, Math.PI * 2); ctx.fill(); // dark bore
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.15, r * 0.8 * br, r * 0.55, 0, 0, Math.PI * 2); // armored breech
  ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = RIM; ctx.stroke();
  ctx.fillStyle = shade(c, -0.35); ctx.lineWidth = Math.max(1, r * 0.08); ctx.strokeStyle = shade(c, -0.35);
  ctx.beginPath(); ctx.moveTo(x - r * 0.5, y + r * 0.15); ctx.lineTo(x + r * 0.5, y + r * 0.15); ctx.stroke(); // bolt seam
  const mA = -0.16; muzzle(ctx, x + Math.sin(mA) * r * 1.15, by - Math.cos(mA) * r * 1.15, r * 1.2, c, fire);
}

function core(ctx: Ctx, x: number, y: number, r: number, c: string, now: number, _fire: number, br: number): void {
  mount(ctx, x, y, r, c);
  const p = 0.9 + 0.12 * Math.sin(now * 3); // reactor throb
  for (let i = 0; i < 2; i++) { ctx.strokeStyle = `rgba(${shadeToken(c, 0.2)},${0.3 - i * 0.12})`; ctx.lineWidth = Math.max(1, r * 0.09); ctx.beginPath(); ctx.arc(x, y, r * (0.8 + i * 0.3) * p, 0, Math.PI * 2); ctx.stroke(); } // coolant rings
  ctx.beginPath(); ctx.arc(x, y, r * 0.7 * br, 0, Math.PI * 2); ctx.fillStyle = shade(c, -0.2); ctx.fill(); ctx.strokeStyle = RIM; ctx.lineWidth = Math.max(1.3, r * 0.11); ctx.stroke(); // shell
  ctx.beginPath(); ctx.arc(x, y, r * 0.4 * p, 0, Math.PI * 2); ctx.fillStyle = shade(c, 0.4); ctx.fill(); // glowing core (the white core overlays)
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + now * 0.4; ctx.fillStyle = shade(c, -0.4); ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.08, 0, Math.PI * 2); ctx.fill(); } // bolt studs
}

function nest(ctx: Ctx, x: number, y: number, r: number, c: string, now: number, _fire: number, br: number): void {
  mount(ctx, x, y, r, c);
  // a lumpy organic mound of fused sacs (the churning egg-sac overlay animates on top)
  ctx.fillStyle = c; ctx.strokeStyle = RIM; ctx.lineWidth = Math.max(1.2, r * 0.1);
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 2; const rr = r * (0.72 + 0.12 * Math.sin(a * 3 + now * 0.8)) * br; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.9; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = shade(c, 0.35); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(x - r * 0.25, y - r * 0.25, r * 0.25, r * 0.18, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
}

function monolith(ctx: Ctx, x: number, y: number, r: number, c: string, now: number, _fire: number, _br: number): void {
  mount(ctx, x, y, r * 0.9, c);
  const sway = Math.sin(now * 1.2) * r * 0.03;
  ctx.beginPath(); // a tall faceted spike
  ctx.moveTo(x + sway, y - r * 1.5);
  ctx.lineTo(x + r * 0.5, y - r * 0.2);
  ctx.lineTo(x + r * 0.3, y + r * 0.5);
  ctx.lineTo(x - r * 0.3, y + r * 0.5);
  ctx.lineTo(x - r * 0.5, y - r * 0.2);
  ctx.closePath();
  ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = RIM; ctx.lineWidth = Math.max(1.3, r * 0.11); ctx.stroke();
  ctx.strokeStyle = shade(c, -0.35); ctx.lineWidth = Math.max(1, r * 0.09); // facet seam
  ctx.beginPath(); ctx.moveTo(x + sway, y - r * 1.5); ctx.lineTo(x, y + r * 0.5); ctx.stroke();
  ctx.fillStyle = shade(c, 0.5 + 0.3 * Math.sin(now * 2)); // lit apex crystal
  ctx.beginPath(); ctx.arc(x + sway, y - r * 1.2, r * 0.2, 0, Math.PI * 2); ctx.fill();
}

function crystal(ctx: Ctx, x: number, y: number, r: number, c: string, now: number, _fire: number, _br: number): void {
  mount(ctx, x, y, r * 0.85, c);
  const glow = 0.8 + 0.2 * Math.sin(now * 2.2); // a cluster of amber shards
  const shards = [[0, -1.35, 0.5], [-0.7, -0.5, 0.42], [0.7, -0.5, 0.42], [-0.3, -0.9, 0.34], [0.3, -0.9, 0.34]];
  for (const [dx, dy, sw] of shards) {
    ctx.beginPath(); ctx.moveTo(x + dx * r, y + dy * r); ctx.lineTo(x + (dx - sw) * r, y + (dy + 0.6) * r); ctx.lineTo(x + (dx + sw) * r, y + (dy + 0.6) * r); ctx.closePath();
    ctx.fillStyle = shade(c, -0.1 + 0.3 * glow); ctx.fill(); ctx.strokeStyle = RIM; ctx.lineWidth = Math.max(1, r * 0.08); ctx.stroke();
  }
  ctx.fillStyle = `rgba(${shadeToken(c, 0.6)},${glow * 0.5})`; ctx.beginPath(); ctx.arc(x, y - r * 0.5, r * 0.28, 0, Math.PI * 2); ctx.fill();
}

function maw(ctx: Ctx, x: number, y: number, r: number, c: string, now: number, fire: number, br: number): void {
  mount(ctx, x, y, r, c);
  const gape = r * (0.32 + fire * 0.35 + 0.05 * Math.sin(now * 2)); // gapes wider on fire
  ctx.beginPath(); ctx.arc(x, y, r * 0.85 * br, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = RIM; ctx.lineWidth = Math.max(1.4, r * 0.12); ctx.stroke(); // ring lip
  ctx.beginPath(); ctx.ellipse(x, y, r * 0.55, gape, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(15,6,12,0.92)'; ctx.fill(); // gullet
  ctx.fillStyle = shade(c, 0.6); // ring of teeth
  const teeth = 10;
  for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; const ir = r * 0.55, or2 = r * 0.75; ctx.beginPath(); ctx.moveTo(x + Math.cos(a - 0.12) * or2, y + Math.sin(a - 0.12) * or2); ctx.lineTo(x + Math.cos(a) * ir, y + Math.sin(a) * ir); ctx.lineTo(x + Math.cos(a + 0.12) * or2, y + Math.sin(a + 0.12) * or2); ctx.closePath(); ctx.fill(); }
}

function lens(ctx: Ctx, x: number, y: number, r: number, c: string, _now: number, _fire: number, br: number): void {
  mount(ctx, x, y, r, c);
  // a faceted crystalline emitter housing (the heat/iris organ overlays draw the live core)
  const facets = 6;
  ctx.beginPath();
  for (let i = 0; i < facets; i++) { const a = (Math.PI * 2 / facets) * i - Math.PI / 2; const px = x + Math.cos(a) * r * 0.85 * br, py = y + Math.sin(a) * r * 0.85 * br; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
  ctx.closePath(); ctx.fillStyle = shade(c, -0.25); ctx.fill(); ctx.strokeStyle = RIM; ctx.lineWidth = Math.max(1.3, r * 0.11); ctx.stroke();
  ctx.strokeStyle = shade(c, 0.2); ctx.lineWidth = Math.max(1, r * 0.07); // inner facet lines
  for (let i = 0; i < facets; i++) { const a = (Math.PI * 2 / facets) * i - Math.PI / 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85); ctx.stroke(); }
}

function pod(ctx: Ctx, x: number, y: number, r: number, c: string, now: number, fire: number, br: number): void {
  mount(ctx, x, y, r, c);
  const swell = 1 + 0.05 * Math.sin(now * 1.6); // a swollen seed-pod
  ctx.beginPath(); ctx.ellipse(x, y - r * 0.05, r * 0.72 * br, r * 0.85 * swell, 0, 0, Math.PI * 2);
  ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = RIM; ctx.lineWidth = Math.max(1.3, r * 0.11); ctx.stroke();
  ctx.strokeStyle = shade(c, -0.35); ctx.lineWidth = Math.max(1, r * 0.09); // ridges
  for (const s of [-0.35, 0, 0.35]) { ctx.beginPath(); ctx.moveTo(x + s * r, y - r * 0.8); ctx.quadraticCurveTo(x + s * r * 1.5, y, x + s * r, y + r * 0.7); ctx.stroke(); }
  // a top vent that flashes when it lobs a mine
  ctx.fillStyle = fire > 0.02 ? `rgba(180,255,120,${0.5 + fire * 0.5})` : shade(c, -0.4);
  ctx.beginPath(); ctx.ellipse(x, y - r * 0.85, r * 0.24, r * 0.14, 0, 0, Math.PI * 2); ctx.fill();
}

function antenna(ctx: Ctx, x: number, y: number, r: number, c: string, now: number, fire: number, _br: number): void {
  mount(ctx, x, y, r * 0.8, c);
  ctx.strokeStyle = shade(c, -0.1); ctx.lineWidth = Math.max(1.6, r * 0.16); ctx.lineCap = 'round'; // the thin mast
  ctx.beginPath(); ctx.moveTo(x, y + r * 0.3); ctx.lineTo(x, y - r * 1.4); ctx.stroke();
  ctx.strokeStyle = shade(c, 0.2); ctx.lineWidth = Math.max(1, r * 0.08); // cross struts
  for (const sy of [-1.1, -0.7, -0.3]) { ctx.beginPath(); ctx.moveTo(x - r * 0.3, y + sy * r); ctx.lineTo(x + r * 0.3, y + sy * r); ctx.stroke(); }
  ctx.lineCap = 'butt';
  const spark = 0.6 + 0.4 * Math.sin(now * 6); // arcing tip
  ctx.fillStyle = `rgba(${shadeToken(c, 0.6)},${spark})`; ctx.beginPath(); ctx.arc(x, y - r * 1.4, r * 0.2 + fire * r * 0.2, 0, Math.PI * 2); ctx.fill();
  if (spark > 0.85 || fire > 0.02) { ctx.strokeStyle = `rgba(${shadeToken(c, 0.5)},0.7)`; ctx.lineWidth = 1.5; for (let i = 0; i < 3; i++) { const a = Math.random() * Math.PI * 2; ctx.beginPath(); ctx.moveTo(x, y - r * 1.4); ctx.lineTo(x + Math.cos(a) * r * 0.5, y - r * 1.4 + Math.sin(a) * r * 0.5); ctx.stroke(); } }
}

const DRAWERS: Record<TowerForm, (ctx: Ctx, x: number, y: number, r: number, c: string, now: number, fire: number, br: number) => void> = {
  barrel, cannon, core, nest, monolith, crystal, maw, lens, pod, antenna,
};

/** Draw a tower's procedural turret body. `fire` (0..1) is the recoil/muzzle pulse (from `fresh`),
 *  `br` the idle breathe scale. Replaces the flat placeholder shape; other layers draw over it. */
export function drawTowerForm(ctx: Ctx, kind: TowerKind, x: number, y: number, r: number, color: string, now: number, fire: number, br: number): void {
  DRAWERS[TOWER_FORM[kind]](ctx, x, y, r, color, now, fire, br);
}
