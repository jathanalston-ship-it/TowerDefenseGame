// TOWER FORMS (docs/RENDER-PIPELINE.md, docs/TOWERS.md) — procedural, LIT bio-mechanical turrets.
// A full-fidelity pass: every body is volumetrically shaded (radial/linear gradients under one
// consistent key light, up-and-left), with rim light on lit edges, ambient-occlusion contact
// shadows, metallic speculars, glowing energy cores with bloom, and greeble detail (panels, bolts,
// vents, conduits). Idle motion breathes the cores; `fire` recoils the apparatus + flares the muzzle.
//
// Towers fire UP-field (the swarm descends), so barrels point up (−y) and recoil kicks DOWN on `fire`.
// The tower's OTHER layers (rooting tendrils, per-kind organs, star/branch/strain/mastery/adaptation
// evolutions) still draw OVER this base. Cosmetic + render-only ⇒ golden-safe. Towers are few (≤~12)
// ⇒ always full detail; per-frame gradient allocation is comfortably within the 60 fps budget.

import type { TowerKind } from '../core/types';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const LX = -0.4, LY = -0.92; // key light direction (up-and-left), unit-ish
const LANG = Math.atan2(LY, LX);

export type TowerForm = 'barrel' | 'cannon' | 'core' | 'nest' | 'monolith' | 'crystal' | 'maw' | 'lens' | 'pod' | 'antenna' | 'gatling' | 'singularity';

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
  spitfang: 'gatling',    // a multi-barrel kinetic autocannon
  rift: 'singularity',    // a void anchor with an accretion ring
  glaive: 'lens',     // a swept launch-ring the returning blade spins out of
  roost: 'nest',      // a clutch of biomech eggs around a warm perch
  lung: 'pod',        // a swollen breathing sac that vents fog on each exhale
  bell: 'maw',        // a ringed bronze mouth that gapes on every toll
  lancet: 'barrel',   // a long harpoon rail, drawn and loosed
  basilisk: 'lens',   // the petrifying oculus — a lidless arena eye on a calcified stalk
  ossuary: 'monolith', // the bone-organ choir — fused ribcages standing like a reliquary
};

// ── ATTACK ANTICIPATION personality (docs/COMBAT-VISUAL-STANDARDS.md §towers) ────────────────────
// How each body form WINDS UP as its next shot nears: sx/sy scale the silhouette at full windup
// (positive sx + negative sy = a compressing crouch; negative sx + positive sy = a rising flex),
// `glow` charges the muzzle. Keyed by FORM, not kind, so every future tower inherits a
// personality the moment it picks a body — no per-tower authoring at the 100-tower target.
export interface AnticipationProfile { sx: number; sy: number; glow: number }

export const FORM_ANTICIPATION: Record<TowerForm, AnticipationProfile> = {
  barrel: { sx: -0.03, sy: 0.06, glow: 0.3 }, // the spike-barrel flexes taller, coiling to spit
  cannon: { sx: 0.08, sy: -0.12, glow: 0.35 }, // the mortar tube compresses before the lob
  core: { sx: 0.04, sy: 0.04, glow: 0.2 }, // the reactor swells with the pulse it's charging
  nest: { sx: 0.05, sy: -0.05, glow: 0.2 }, // the clutch churns tighter before a birth
  monolith: { sx: -0.04, sy: 0.05, glow: 0.5 }, // the totem draws up, tip-light gathering
  crystal: { sx: 0, sy: 0, glow: 0.55 }, // the gem only brightens — stone doesn't strain
  maw: { sx: 0.07, sy: -0.09, glow: 0.15 }, // the mouth gathers into a crouch before gaping
  lens: { sx: 0, sy: 0, glow: 0.45 }, // emitters charge light, not muscle
  pod: { sx: 0.06, sy: -0.08, glow: 0.25 }, // the seed-pod squeezes down before venting
  antenna: { sx: -0.02, sy: 0.04, glow: 0.5 }, // the spire stiffens, charge racing to the tip
  gatling: { sx: 0.03, sy: -0.04, glow: 0.3 }, // the autocannon hunkers into its mount
  singularity: { sx: 0, sy: 0, glow: 0.5 }, // the void anchor only deepens — nothing to flex
};

/** Wind-up intensity [0..1] across the FINAL 30% of a tower's cooldown — the scale factor the
 *  renderer feeds the FORM_ANTICIPATION transform (the whole-body `ctx.scale` around the draw).
 *
 *  HARD [0..1] BY CONSTRUCTION (BUGFIX-LOG #16 — the "Parasite Nest fills the screen" flood):
 *  the sim's fire paths tick `cooldown -= dt` and reset only when the tower ACTS, so a tower
 *  that CANNOT act (a nest with nothing to infest, any tower through an autostart-off prep)
 *  drifts its cooldown arbitrarily far below zero — harmless to the sim (the fire gate is
 *  `> 0`), catastrophic here if extrapolated: the raw ratio grows quadratically with time and
 *  the body transform sits OUTSIDE drawTower's 2.2× radius ceiling. A past-due cooldown means
 *  exactly "fully wound up" (1) — never more. NaN-hostile inputs collapse to 0 (still still). */
export function attackAnticipation(cooldown: number, fireInterval: number): number {
  if (!(fireInterval > 0)) return 0; // supports / NaN intervals never wind up
  const readiness = 1 - Math.max(0, cooldown) / (fireInterval * 0.3);
  if (!(readiness > 0)) return 0; // not yet in the window — and NaN lands here too
  const t = readiness >= 1 ? 1 : readiness;
  return t * t;
}

// ── colour: one memoized helper. `lit`>0 lightens toward white, <0 darkens; `a`<1 ⇒ rgba. ────────
const triCache = new Map<string, [number, number, number]>();
function tri(hex: string): [number, number, number] {
  const hit = triCache.get(hex); if (hit) return hit;
  const h = hex.replace('#', ''); const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16); const out: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  triCache.set(hex, out); return out;
}
const colCache = new Map<string, string>();
function C(hex: string, lit: number, a = 1): string {
  const key = `${hex}|${lit}|${a}`; const hit = colCache.get(key); if (hit) return hit;
  let [r, g, b] = tri(hex);
  if (lit >= 0) { r += (255 - r) * lit; g += (255 - g) * lit; b += (255 - b) * lit; } else { const k = 1 + lit; r *= k; g *= k; b *= k; }
  r = Math.round(r); g = Math.round(g); b = Math.round(b);
  const out = a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
  colCache.set(key, out); return out;
}
const RIM = 'rgba(4,6,12,0.7)';

// ── shading primitives ───────────────────────────────────────────────────────────────────────
/** A volumetric sphere/dome: radial gradient with the highlight offset toward the key light. */
function orb(ctx: Ctx, x: number, y: number, r: number, hex: string, litAmt = 0.6): void {
  const hx = x + LX * r * 0.5, hy = y + LY * r * 0.5;
  const g = ctx.createRadialGradient(hx, hy, r * 0.05, x, y, r * 1.02);
  g.addColorStop(0, C(hex, litAmt));
  g.addColorStop(0.5, C(hex, 0.02));
  g.addColorStop(1, C(hex, -0.5));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
/** A bright arc of rim light on the light-facing edge — the single biggest "it's 3D" cue. */
function rim(ctx: Ctx, x: number, y: number, r: number, hex: string, a = 0.6): void {
  ctx.strokeStyle = C(hex, 0.75, a); ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.beginPath(); ctx.arc(x, y, r * 0.95, LANG - 1.15, LANG + 1.15); ctx.stroke();
}
/** A soft additive-looking bloom disc. */
function bloom(ctx: Ctx, x: number, y: number, r: number, hex: string, a: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, C(hex, 0.2, a)); g.addColorStop(0.6, C(hex, 0, a * 0.4)); g.addColorStop(1, C(hex, 0, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
/** A glowing energy core: outer bloom + a white-hot centre grading to the hue. */
function energyCore(ctx: Ctx, x: number, y: number, r: number, hex: string, intensity: number): void {
  bloom(ctx, x, y, r * 2.4, hex, 0.5 * intensity);
  const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${0.95 * intensity})`);
  g.addColorStop(0.45, C(hex, 0.35));
  g.addColorStop(1, C(hex, -0.2));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
/** Fill an already-built path with a vertical light→dark gradient + a dark rim; returns nothing. */
function bevelFill(ctx: Ctx, hex: string, yTop: number, yBot: number, lw: number): void {
  const g = ctx.createLinearGradient(0, yTop, 0, yBot);
  g.addColorStop(0, C(hex, 0.5)); g.addColorStop(0.5, C(hex, 0.0)); g.addColorStop(1, C(hex, -0.42));
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = RIM; ctx.lineWidth = lw; ctx.stroke();
}
/** A shaded metallic bar (vertical) with an off-centre specular streak. */
function metalBar(ctx: Ctx, x: number, yTop: number, yBot: number, w: number, hex: string): void {
  const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
  g.addColorStop(0, C(hex, -0.45)); g.addColorStop(0.32, C(hex, 0.15)); g.addColorStop(0.46, C(hex, 0.65));
  g.addColorStop(0.6, C(hex, 0.05)); g.addColorStop(1, C(hex, -0.48));
  ctx.fillStyle = g; ctx.beginPath(); ctx.rect(x - w, yTop, w * 2, yBot - yTop); ctx.fill();
  ctx.strokeStyle = RIM; ctx.lineWidth = Math.max(1, w * 0.28); ctx.stroke();
}
/** The shared planted BASE — an AO contact shadow + a shaded riveted plinth grown into the floor. */
function mount(ctx: Ctx, x: number, y: number, r: number, hex: string): void {
  const sg = ctx.createRadialGradient(x, y + r * 0.9, 0, x, y + r * 0.9, r * 1.35);
  sg.addColorStop(0, 'rgba(0,0,0,0.4)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(x, y + r * 0.9, r * 1.25, r * 0.5, 0, 0, TAU); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - r * 0.92, y + r * 0.98); ctx.lineTo(x - r * 0.64, y + r * 0.16);
  ctx.lineTo(x + r * 0.64, y + r * 0.16); ctx.lineTo(x + r * 0.92, y + r * 0.98); ctx.closePath();
  bevelFill(ctx, hex, y + r * 0.16, y + r * 0.98, Math.max(1.2, r * 0.09));
  ctx.strokeStyle = C(hex, 0.35, 0.5); ctx.lineWidth = Math.max(1, r * 0.05); // top edge highlight
  ctx.beginPath(); ctx.moveTo(x - r * 0.62, y + r * 0.17); ctx.lineTo(x + r * 0.62, y + r * 0.17); ctx.stroke();
  for (const bx of [-0.72, 0.72]) { ctx.fillStyle = C(hex, -0.5); ctx.beginPath(); ctx.arc(x + bx * r, y + r * 0.62, r * 0.075, 0, TAU); ctx.fill(); ctx.fillStyle = C(hex, 0.4, 0.6); ctx.beginPath(); ctx.arc(x + bx * r - r * 0.02, y + r * 0.6, r * 0.03, 0, TAU); ctx.fill(); }
}

// ── per-form drawers ─────────────────────────────────────────────────────────────────────────
function barrel(ctx: Ctx, x: number, y: number, r: number, c: string, _now: number, fire: number, br: number): void {
  mount(ctx, x, y, r, c);
  const recoil = fire * r * 0.3;
  const by = y + recoil, len = r * 1.2, w = r * 0.32;
  metalBar(ctx, x, by - len, by + r * 0.28, w, c); // the machined barrel
  ctx.fillStyle = C(c, -0.6); ctx.beginPath(); ctx.ellipse(x, by - len, w, r * 0.1, 0, 0, TAU); ctx.fill(); // dark bore
  ctx.beginPath(); ctx.moveTo(x - w * 1.15, by - len + r * 0.06); ctx.lineTo(x, by - len - r * 0.5); ctx.lineTo(x + w * 1.15, by - len + r * 0.06); ctx.closePath(); // spike tip
  bevelFill(ctx, c, by - len - r * 0.5, by - len, Math.max(1, r * 0.07));
  orb(ctx, x, y + r * 0.06, r * 0.66 * br, c); rim(ctx, x, y + r * 0.06, r * 0.66 * br, c, 0.55); // housing
  ctx.fillStyle = C(c, -0.55); ctx.beginPath(); ctx.arc(x, y + r * 0.06, r * 0.2, 0, TAU); ctx.fill(); // recessed port
  bloom(ctx, x, y + r * 0.06, r * 0.35, c, 0.25 + fire * 0.4); // breech glow
  muzzle(ctx, x, by - len - r * 0.5, r, c, fire);
}

function cannon(ctx: Ctx, x: number, y: number, r: number, c: string, _now: number, fire: number, br: number): void {
  mount(ctx, x, y, r * 1.08, c);
  const recoil = fire * r * 0.36;
  const by = y + recoil;
  ctx.save(); ctx.translate(x, by); ctx.rotate(-0.15);
  const g = ctx.createLinearGradient(-r * 0.5, 0, r * 0.5, 0); // fat tube, cross-lit
  g.addColorStop(0, C(c, -0.5)); g.addColorStop(0.4, C(c, 0.25)); g.addColorStop(0.5, C(c, 0.6)); g.addColorStop(0.62, C(c, 0.05)); g.addColorStop(1, C(c, -0.52));
  ctx.fillStyle = g; ctx.beginPath(); ctx.rect(-r * 0.44, -r * 1.2, r * 0.88, r * 1.35); ctx.fill(); ctx.strokeStyle = RIM; ctx.lineWidth = Math.max(1.4, r * 0.1); ctx.stroke();
  for (const yy of [-0.95, -0.55]) { ctx.strokeStyle = C(c, -0.35); ctx.lineWidth = Math.max(1, r * 0.09); ctx.beginPath(); ctx.moveTo(-r * 0.44, yy * r); ctx.lineTo(r * 0.44, yy * r); ctx.stroke(); } // reinforcing bands
  ctx.fillStyle = C(c, -0.62); ctx.beginPath(); ctx.ellipse(0, -r * 1.2, r * 0.44, r * 0.16, 0, 0, TAU); ctx.fill(); // dark bore
  bloom(ctx, 0, -r * 1.2, r * 0.5, c, fire * 0.6); // heat
  ctx.restore();
  orb(ctx, x, y + r * 0.18, r * 0.82 * br, c); rim(ctx, x, y + r * 0.18, r * 0.82 * br, c, 0.5); // armored breech
  muzzle(ctx, x + Math.sin(-0.15) * r * 1.2, by - Math.cos(-0.15) * r * 1.2, r * 1.25, c, fire);
}

function core(ctx: Ctx, x: number, y: number, r: number, c: string, now: number, _fire: number, br: number): void {
  mount(ctx, x, y, r, c);
  const p = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(now * 3)); // reactor throb
  const shell = ctx.createRadialGradient(x + LX * r * 0.4, y + LY * r * 0.4, r * 0.1, x, y, r * 0.82 * br); // dark metallic shell
  shell.addColorStop(0, C(c, -0.15)); shell.addColorStop(1, C(c, -0.62));
  ctx.fillStyle = shell; ctx.beginPath(); ctx.arc(x, y, r * 0.82 * br, 0, TAU); ctx.fill();
  ctx.strokeStyle = RIM; ctx.lineWidth = Math.max(1.3, r * 0.1); ctx.stroke();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + now * 0.3; ctx.fillStyle = C(c, -0.6); ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.68, y + Math.sin(a) * r * 0.68, r * 0.075, 0, TAU); ctx.fill(); ctx.fillStyle = C(c, 0.5, 0.5); ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.68 - r * 0.02, y + Math.sin(a) * r * 0.68 - r * 0.02, r * 0.03, 0, TAU); ctx.fill(); } // bolts
  ctx.strokeStyle = C(c, 0.4, 0.35 + 0.25 * p); ctx.lineWidth = Math.max(1, r * 0.06); // containment window ring
  ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, TAU); ctx.stroke();
  energyCore(ctx, x, y, r * 0.4 * p, c, 0.85); // the plasma core (the white overlay adds on top)
  rim(ctx, x, y, r * 0.82 * br, c, 0.4);
}

function nest(ctx: Ctx, x: number, y: number, r: number, c: string, now: number, _fire: number, br: number): void {
  mount(ctx, x, y, r, c);
  bloom(ctx, x, y, r * 1.3, c, 0.2 + 0.08 * Math.sin(now * 1.5)); // subsurface glow
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * TAU; const rr = r * (0.74 + 0.1 * Math.sin(a * 3 + now * 0.8)) * br; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.92; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
  ctx.closePath();
  const g = ctx.createRadialGradient(x + LX * r * 0.4, y + LY * r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, C(c, 0.45)); g.addColorStop(0.55, C(c, 0.0)); g.addColorStop(1, C(c, -0.4));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = RIM; ctx.lineWidth = Math.max(1.2, r * 0.09); ctx.stroke();
  ctx.strokeStyle = C(c, -0.35, 0.7); ctx.lineWidth = Math.max(1, r * 0.06); // pulsing veins
  for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.5, x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.6); ctx.stroke(); }
  ctx.fillStyle = C(c, 0.55, 0.4); ctx.beginPath(); ctx.ellipse(x - r * 0.28, y - r * 0.3, r * 0.22, r * 0.14, -0.4, 0, TAU); ctx.fill(); // membrane sheen
}

function monolith(ctx: Ctx, x: number, y: number, r: number, c: string, now: number, _fire: number, _br: number): void {
  mount(ctx, x, y, r * 0.9, c);
  bloom(ctx, x, y - r * 1.15, r * 0.7, c, 0.35 + 0.15 * Math.sin(now * 2)); // apex glow behind
  const sway = Math.sin(now * 1.1) * r * 0.03;
  const facesL: [number, number][] = [[x + sway, y - r * 1.5], [x - 0.06 * r, y + r * 0.5], [x - r * 0.42, y - r * 0.15]];
  const facesR: [number, number][] = [[x + sway, y - r * 1.5], [x + r * 0.42, y - r * 0.15], [x - 0.06 * r, y + r * 0.5]];
  ctx.beginPath(); facesL.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
  ctx.fillStyle = C(c, 0.28); ctx.fill(); ctx.strokeStyle = RIM; ctx.lineWidth = Math.max(1.2, r * 0.09); ctx.stroke(); // lit face
  ctx.beginPath(); facesR.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
  ctx.fillStyle = C(c, -0.32); ctx.fill(); ctx.stroke(); // shadowed face
  ctx.strokeStyle = C(c, 0.6, 0.35 + 0.3 * Math.sin(now * 2.4)); ctx.lineWidth = Math.max(1, r * 0.05); // glowing glyph seam
  ctx.beginPath(); ctx.moveTo(x + sway, y - r * 1.3); ctx.lineTo(x, y + r * 0.3); ctx.stroke();
  energyCore(ctx, x + sway, y - r * 1.22, r * 0.18, c, 0.9); // lit apex crystal
}

function crystal(ctx: Ctx, x: number, y: number, r: number, c: string, now: number, _fire: number, _br: number): void {
  mount(ctx, x, y, r * 0.85, c);
  bloom(ctx, x, y - r * 0.5, r * 1.1, c, 0.22 + 0.1 * Math.sin(now * 2.2)); // inner refraction glow
  const shards: [number, number, number][] = [[0, -1.4, 0.5], [-0.72, -0.5, 0.42], [0.72, -0.5, 0.42], [-0.32, -0.95, 0.32], [0.32, -0.95, 0.32]];
  for (const [dx, dy, sw] of shards) {
    const tipY = y + dy * r, baseY = y + (dy + 0.62) * r;
    ctx.beginPath(); ctx.moveTo(x + dx * r, tipY); ctx.lineTo(x + (dx - sw) * r, baseY); ctx.lineTo(x + (dx + sw) * r, baseY); ctx.closePath();
    const g = ctx.createLinearGradient(0, tipY, 0, baseY);
    g.addColorStop(0, C(c, 0.6)); g.addColorStop(0.5, C(c, 0.05)); g.addColorStop(1, C(c, -0.4));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = RIM; ctx.lineWidth = Math.max(1, r * 0.07); ctx.stroke();
    ctx.strokeStyle = C(c, 0.8, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + dx * r, tipY); ctx.lineTo(x + (dx - sw * 0.4) * r, (tipY + baseY) / 2); ctx.stroke(); // caustic edge
  }
  energyCore(ctx, x, y - r * 0.5, r * 0.24, c, 0.7 + 0.2 * Math.sin(now * 3)); // core glint
}

function maw(ctx: Ctx, x: number, y: number, r: number, c: string, now: number, fire: number, br: number): void {
  mount(ctx, x, y, r, c);
  const gape = r * (0.32 + fire * 0.35 + 0.05 * Math.sin(now * 2));
  orb(ctx, x, y, r * 0.9 * br, c, 0.4); // fleshy lip ring, wet-shaded
  const gg = ctx.createRadialGradient(x, y, 0, x, y, gape * 1.4); // deep gullet
  gg.addColorStop(0, 'rgba(2,0,2,1)'); gg.addColorStop(0.7, C(c, -0.75)); gg.addColorStop(1, C(c, -0.55));
  ctx.fillStyle = gg; ctx.beginPath(); ctx.ellipse(x, y, r * 0.56, gape, 0, 0, TAU); ctx.fill();
  bloom(ctx, x, y, gape * 1.3, c, 0.3 + fire * 0.4); // throat glow
  const teeth = 11;
  for (let i = 0; i < teeth; i++) { const a = (i / teeth) * TAU; const ir = r * 0.54, or2 = r * 0.78; ctx.beginPath(); ctx.moveTo(x + Math.cos(a - 0.12) * or2, y + Math.sin(a - 0.12) * or2); ctx.lineTo(x + Math.cos(a) * ir, y + Math.sin(a) * ir); ctx.lineTo(x + Math.cos(a + 0.12) * or2, y + Math.sin(a + 0.12) * or2); ctx.closePath(); ctx.fillStyle = i % 2 ? C(c, 0.65) : C(c, 0.45); ctx.fill(); } // fangs
  rim(ctx, x, y, r * 0.9 * br, c, 0.55);
  ctx.fillStyle = C(c, 0.7, 0.5); ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.4, r * 0.16, r * 0.09, -0.5, 0, TAU); ctx.fill(); // wet highlight
}

function lens(ctx: Ctx, x: number, y: number, r: number, c: string, _now: number, _fire: number, br: number): void {
  mount(ctx, x, y, r, c);
  const facets = 6, rr = r * 0.86 * br;
  ctx.beginPath();
  for (let i = 0; i < facets; i++) { const a = (TAU / facets) * i - Math.PI / 2; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
  ctx.closePath();
  const g = ctx.createRadialGradient(x + LX * r * 0.4, y + LY * r * 0.4, r * 0.1, x, y, rr);
  g.addColorStop(0, C(c, 0.3)); g.addColorStop(0.6, C(c, -0.2)); g.addColorStop(1, C(c, -0.55));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = RIM; ctx.lineWidth = Math.max(1.3, r * 0.1); ctx.stroke();
  ctx.strokeStyle = C(c, 0.35, 0.6); ctx.lineWidth = Math.max(1, r * 0.05); // facet seams catching light
  for (let i = 0; i < facets; i++) { const a = (TAU / facets) * i - Math.PI / 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); ctx.stroke(); }
  bloom(ctx, x, y, r * 0.7, c, 0.28); // lens has an inner light (the heat/iris organ overlays the live core)
}

function pod(ctx: Ctx, x: number, y: number, r: number, c: string, now: number, fire: number, br: number): void {
  mount(ctx, x, y, r, c);
  bloom(ctx, x, y, r * 1.2, c, 0.18); // subsurface
  const swell = 1 + 0.05 * Math.sin(now * 1.6);
  const bx = r * 0.72 * br, byr = r * 0.86 * swell;
  ctx.beginPath(); ctx.ellipse(x, y - r * 0.05, bx, byr, 0, 0, TAU);
  const g = ctx.createRadialGradient(x + LX * r * 0.4, y - r * 0.05 + LY * r * 0.4, r * 0.1, x, y - r * 0.05, byr);
  g.addColorStop(0, C(c, 0.5)); g.addColorStop(0.55, C(c, 0.0)); g.addColorStop(1, C(c, -0.42));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = RIM; ctx.lineWidth = Math.max(1.3, r * 0.1); ctx.stroke();
  ctx.strokeStyle = C(c, -0.4); ctx.lineWidth = Math.max(1, r * 0.08); // ridges
  for (const s of [-0.4, 0, 0.4]) { ctx.beginPath(); ctx.moveTo(x + s * r * 0.8, y - r * 0.8); ctx.quadraticCurveTo(x + s * r * 1.5, y, x + s * r * 0.8, y + r * 0.68); ctx.stroke(); }
  const vent = fire > 0.02;
  bloom(ctx, x, y - r * 0.85, r * (0.4 + fire * 0.5), vent ? '#b6ff78' : c, vent ? 0.6 : 0.15);
  ctx.fillStyle = vent ? C('#b6ff78', 0.3, 0.6 + fire * 0.4) : C(c, -0.45); ctx.beginPath(); ctx.ellipse(x, y - r * 0.85, r * 0.24, r * 0.13, 0, 0, TAU); ctx.fill();
}

function antenna(ctx: Ctx, x: number, y: number, r: number, c: string, now: number, fire: number, _br: number): void {
  mount(ctx, x, y, r * 0.8, c);
  metalBar(ctx, x, y - r * 1.45, y + r * 0.3, r * 0.09, c); // the mast
  ctx.strokeStyle = C(c, 0.25); ctx.lineWidth = Math.max(1.2, r * 0.09); ctx.lineCap = 'round'; // insulator struts
  for (const sy of [-1.15, -0.75, -0.35]) { ctx.beginPath(); ctx.moveTo(x - r * 0.32, y + sy * r); ctx.lineTo(x + r * 0.32, y + sy * r); ctx.stroke(); }
  ctx.lineCap = 'butt';
  const spark = 0.55 + 0.45 * Math.sin(now * 6); // energy climbing to the tip
  ctx.strokeStyle = C(c, 0.6, spark * 0.6); ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.beginPath(); ctx.moveTo(x, y + r * 0.2); ctx.lineTo(x, y - r * 1.4); ctx.stroke();
  energyCore(ctx, x, y - r * 1.42, r * 0.16 + fire * r * 0.16, c, 0.7 + spark * 0.3); // arcing tip
  // deterministic crackle — re-rolls ~14×/s (render never touches Math.random)
  if (spark > 0.8 || fire > 0.02) { ctx.strokeStyle = C(c, 0.7, 0.7); ctx.lineWidth = 1.4; const seed = Math.floor(now * 14); for (let i = 0; i < 3; i++) { const a = ((Math.sin((seed * 3 + i) * 127.1) * 43758.5453) % 1) * TAU; ctx.beginPath(); ctx.moveTo(x, y - r * 1.42); ctx.lineTo(x + Math.cos(a) * r * 0.5, y - r * 1.42 + Math.sin(a) * r * 0.5); ctx.stroke(); } }
}

/** A muzzle flare — a hot core + a directional cross-spark, scaled by the firing pulse. */
function muzzle(ctx: Ctx, mx: number, my: number, r: number, c: string, fire: number): void {
  if (fire <= 0.02) return;
  const f = fire;
  bloom(ctx, mx, my, r * (0.6 + f * 0.9), '#ffe6b0', 0.8 * f);
  ctx.fillStyle = `rgba(255,245,215,${0.95 * f})`; ctx.beginPath(); ctx.arc(mx, my, r * 0.28 * (0.6 + f), 0, TAU); ctx.fill();
  ctx.strokeStyle = C(c, 0.5, 0.7 * f); ctx.lineWidth = Math.max(1.5, r * 0.13);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a) * r * (0.45 + f * 0.7), my + Math.sin(a) * r * (0.45 + f * 0.7)); ctx.stroke(); }
}

function gatling(ctx: Ctx, x: number, y: number, r: number, c: string, now: number, fire: number, br: number): void {
  mount(ctx, x, y, r, c);
  const recoil = fire * r * 0.26, by = y + recoil, n = 4;
  for (let i = 0; i < n; i++) { // a fan of spinning barrels
    const bx = x + (i - (n - 1) / 2) * r * 0.36;
    metalBar(ctx, bx, by - r * 1.15, by + r * 0.05, r * 0.13, c);
    ctx.fillStyle = C(c, -0.62); ctx.beginPath(); ctx.ellipse(bx, by - r * 1.15, r * 0.13, r * 0.05, 0, 0, TAU); ctx.fill(); // bore
  }
  const sweep = ((now * 3) % 1) * n - 0.5; // a sheen sweeping across the rotating cluster
  ctx.fillStyle = C(c, 0.65, 0.4); ctx.beginPath(); ctx.ellipse(x + (sweep - (n - 1) / 2) * r * 0.36, by - r * 0.5, r * 0.1, r * 0.5, 0, 0, TAU); ctx.fill();
  orb(ctx, x, y + r * 0.12, r * 0.6 * br, c); rim(ctx, x, y + r * 0.12, r * 0.6 * br, c, 0.55); // hub
  ctx.fillStyle = C(c, -0.55); ctx.beginPath(); ctx.arc(x, y + r * 0.12, r * 0.22, 0, TAU); ctx.fill();
  ctx.fillStyle = C(c, 0.55, 0.7); ctx.beginPath(); ctx.arc(x - r * 0.08, y + r * 0.04, r * 0.08, 0, TAU); ctx.fill();
  bloom(ctx, x, y + r * 0.12, r * 0.4, c, 0.2 + fire * 0.4);
  if (fire > 0.02) { muzzle(ctx, x - r * 0.18, by - r * 1.15, r * 0.85, c, fire); muzzle(ctx, x + r * 0.18, by - r * 1.15, r * 0.8, c, fire * 0.8); }
}

function singularity(ctx: Ctx, x: number, y: number, r: number, c: string, now: number, fire: number, br: number): void {
  mount(ctx, x, y, r, c);
  const pull = 0.5 + 0.5 * Math.sin(now * 2); // gravitic breathe
  bloom(ctx, x, y, r * 1.8 * br, c, 0.32 + fire * 0.3); // the pulling field
  for (let i = 0; i < 10; i++) { // accretion disc — motes spiralling in
    const a = (i / 10) * TAU + now * 1.2;
    const rr = r * (0.55 + 0.35 * ((i * 0.37 + now * 0.5) % 1));
    ctx.fillStyle = C(c, 0.55, 0.85 * (1 - (rr / r - 0.55) / 0.35 * 0.6));
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.5, r * 0.06, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = C(c, 0.4, 0.5 + pull * 0.3); ctx.lineWidth = Math.max(1.5, r * 0.1); // disc plane
  ctx.beginPath(); ctx.ellipse(x, y, r * 0.9 * br, r * 0.42 * br, 0, 0, TAU); ctx.stroke();
  ctx.strokeStyle = C(c, 0.85, 0.8); ctx.lineWidth = Math.max(1.5, r * 0.09); // event-horizon rim
  ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, TAU); ctx.stroke();
  const cg = ctx.createRadialGradient(x, y, 0, x, y, r * 0.4); // the void core
  cg.addColorStop(0, `rgba(255,255,255,${0.55 + fire * 0.45})`); cg.addColorStop(0.28, C(c, -0.1)); cg.addColorStop(1, 'rgba(2,0,6,1)');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, TAU); ctx.fill();
}

const DRAWERS: Record<TowerForm, (ctx: Ctx, x: number, y: number, r: number, c: string, now: number, fire: number, br: number) => void> = {
  barrel, cannon, core, nest, monolith, crystal, maw, lens, pod, antenna, gatling, singularity,
};

/** Draw a tower's LIT procedural turret body. `fire` (0..1) is the recoil/muzzle pulse (from `fresh`),
 *  `br` the idle breathe scale. Replaces the flat placeholder shape; other layers draw over it. */
export function drawTowerForm(ctx: Ctx, kind: TowerKind, x: number, y: number, r: number, color: string, now: number, fire: number, br: number): void {
  DRAWERS[TOWER_FORM[kind]](ctx, x, y, r, color, now, fire, br);
}

// ── PER-KIND SIGNATURES (VISUAL_IDENTITY.md §silhouette) — one unmistakable idle organ for each
// kind that SHARES its body form with another tower, so form-mates never read as hue-swaps at
// gameplay zoom (needle/lancet, parasite/roost, obelisk/effigy, coil/siphon/glaive, sower/lung,
// maw/polyp/bell). The five original organ-bearers (reactor/parasite/obelisk/coil/siphon) keep
// their organs in the renderer ladder; kinds with a unique form need nothing. Future form-sharers
// add a case here. Cosmetic + render-only ⇒ golden-safe.
export function drawTowerSignature(ctx: Ctx, kind: TowerKind, x: number, y: number, r: number, color: string, now: number, fire: number, br: number, id: number): void {
  switch (kind) {
    case 'effigy': { // gaunt totem: strung vertebrae charms swaying from the shoulders
      for (const s of [-1, 1]) {
        const ax = x + s * r * 0.56, ay = y - r * 0.34;
        const sw = Math.sin(now * 1.8 + s * 2.1 + id) * r * 0.14;
        ctx.strokeStyle = C(color, 0.1, 0.6); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax + sw * 0.5, ay + r * 0.3, ax + sw, ay + r * 0.6); ctx.stroke();
        ctx.fillStyle = 'rgba(226,232,240,0.75)';
        for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(ax + sw * (i / 3) * 0.9, ay + r * 0.58 * (i / 3), r * 0.065, 0, TAU); ctx.fill(); }
      }
      break;
    }
    case 'polyp': { // undertow fronds: kelp tendrils curling inward over the mouth — the pull made visible
      ctx.strokeStyle = C(color, 0.25, 0.6);
      ctx.lineWidth = Math.max(1, r * 0.09);
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.4;
        const bx = x + Math.cos(a) * r * 0.82, by = y + Math.sin(a) * r * 0.82;
        const sway = Math.sin(now * 2.2 + i * 1.7 + id) * r * 0.16;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + sway, by - r * 0.5, x + Math.cos(a) * r * 0.25 + sway, y + Math.sin(a) * r * 0.25 - r * 0.52);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      break;
    }
    case 'bell': { // the clapper: a yoke bar + a hanging pendulum bob — a bell you can SEE toll
      ctx.strokeStyle = C(color, 0.3, 0.75);
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 0.44); ctx.lineTo(x + r * 0.5, y - r * 0.44); ctx.stroke();
      const sw = Math.sin(now * 2.6 + id) * r * (0.14 + fire * 0.3);
      ctx.lineWidth = Math.max(1, r * 0.07);
      ctx.beginPath(); ctx.moveTo(x, y - r * 0.44); ctx.quadraticCurveTo(x + sw * 0.4, y - r * 0.05, x + sw, y + r * 0.28); ctx.stroke();
      ctx.fillStyle = `rgba(255,214,140,${0.7 + fire * 0.3})`;
      ctx.beginPath(); ctx.arc(x + sw, y + r * 0.3, r * 0.15 * br, 0, TAU); ctx.fill();
      break;
    }
    case 'lancet': { // harpoon rig: back-swept tip barbs + a slack retrieval cable down to the winch
      const tipY = y - r * 1.66 + fire * r * 0.3;
      ctx.fillStyle = C(color, 0.35, 0.9);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x, tipY + r * 0.18);
        ctx.lineTo(x + s * r * 0.3, tipY + r * 0.52);
        ctx.lineTo(x + s * r * 0.06, tipY + r * 0.44);
        ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = C(color, 0.15, 0.45); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, tipY + r * 0.2); ctx.quadraticCurveTo(x + r * 0.36, y - r * 0.55, x + r * 0.2, y + r * 0.12); ctx.stroke();
      break;
    }
    case 'roost': { // the perch: a Y-branch rising off the clutch with a folded-wing fledgling on watch
      ctx.strokeStyle = C(color, -0.1, 0.8);
      ctx.lineWidth = Math.max(1.2, r * 0.11);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + r * 0.3, y - r * 0.05);
      ctx.quadraticCurveTo(x + r * 0.46, y - r * 0.65, x + r * 0.34, y - r * 1.02);
      ctx.moveTo(x + r * 0.4, y - r * 0.68);
      ctx.lineTo(x + r * 0.66, y - r * 0.98);
      ctx.stroke();
      ctx.lineCap = 'butt';
      const hop = Math.abs(Math.sin(now * 1.4 + id)) * r * 0.05;
      ctx.fillStyle = 'rgba(235,225,240,0.85)';
      ctx.beginPath(); ctx.ellipse(x + r * 0.34, y - r * 1.16 - hop, r * 0.12, r * 0.18, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = C(color, 0.2, 0.8);
      ctx.beginPath(); ctx.ellipse(x + r * 0.38, y - r * 1.12 - hop, r * 0.07, r * 0.12, 0.5, 0, TAU); ctx.fill(); // folded wing
      break;
    }
    case 'lung': { // bronchi: paired air-stubs flaring on the sac's own breath + spiracles that brighten on the exhale
      const ex = 0.5 + 0.5 * Math.sin(now * 1.6); // matches the pod drawer's swell beat
      ctx.lineCap = 'round';
      for (const s of [-1, 1]) {
        ctx.strokeStyle = C(color, 0.2, 0.5 + ex * 0.3);
        ctx.lineWidth = Math.max(1.4, r * (0.15 + ex * 0.05));
        ctx.beginPath();
        ctx.moveTo(x + s * r * 0.4, y - r * 0.6);
        ctx.quadraticCurveTo(x + s * r * 0.72, y - r * 0.95, x + s * r * 0.58, y - r * 1.18);
        ctx.stroke();
        ctx.fillStyle = C(color, 0.4, 0.4 + 0.4 * ex);
        ctx.beginPath(); ctx.arc(x + s * r * 0.58, y - r * 1.2, r * (0.07 + 0.05 * ex), 0, TAU); ctx.fill();
      }
      ctx.lineCap = 'butt';
      ctx.fillStyle = C(color, 0.3, 0.25 + 0.45 * ex);
      for (let i = 0; i < 3; i++) {
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * r * 0.68, y - r * 0.15 + i * r * 0.3, r * 0.05, 0, TAU); ctx.fill(); }
      }
      break;
    }
    case 'glaive': { // the docked blade: a crescent chakram hovering over the launch ring between throws
      const hover = Math.sin(now * 1.9 + id) * r * 0.07;
      const by = y - r * 0.74 + hover;
      bloom(ctx, x, by, r * 0.5, color, 0.25);
      ctx.save();
      ctx.translate(x, by);
      ctx.rotate(now * 0.6 + id);
      ctx.strokeStyle = C(color, 0.35, 0.9);
      ctx.lineWidth = Math.max(1.6, r * 0.13);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0.35, Math.PI - 0.35); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.42, Math.PI + 0.35, TAU - 0.35); ctx.stroke();
      ctx.restore();
      break;
    }
  }
}
