// MULLIGAN procedural generators (docs/MULLIGANS.md §generators) — the "biologically alive" layer.
// A Mulligan's appearance, idle animation, and projectile are NEVER hand-authored per combination:
// they are DERIVED from the resolved organism's StatProfile (the ten archetype axes) plus the two
// persisted seeds. So a new modifier — one registry row — grows a coherent new organism for free,
// and the system scales to 100 / 250 / 500+ modifiers with zero new draw code (CLAUDE.md
// "generalize, don't hardcode").
//
// Pure presentation. Reads only a resolved Mulligan (profile) + seeds; never the sim. A Mulligan is
// inactive (empty profile) on a fresh account ⇒ nothing draws ⇒ golden/renderer-safe.

import type { MulliganAxis, ResolvedMulligan, StatProfile } from '../core/mulligan';
import { MULLIGAN_AXES } from '../core/mulligan';

const TAU = Math.PI * 2;

/** Deterministic seeded RNG (mulberry32) — same seed ⇒ same organism. */
function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── The organ vocabulary — one procedural drawer per archetype axis. Each maps a stat axis to a
//    biological form (the design table in docs/MULLIGANS.md §8). ──
type OrganKind = 'spike' | 'tendril' | 'sac' | 'vein' | 'gland' | 'lance' | 'pod' | 'crystal' | 'membrane' | 'vascular';

const AXIS_ORGAN: Record<MulliganAxis, OrganKind> = {
  damage: 'spike', attackSpeed: 'tendril', debuff: 'sac', poison: 'vein', splash: 'gland',
  pierce: 'lance', support: 'pod', crit: 'crystal', slow: 'membrane', healing: 'vascular',
};
const ORGAN_HUE: Record<OrganKind, string> = {
  spike: '#ff5b4a', tendril: '#8fd0ff', sac: '#c07bff', vein: '#7de08a', gland: '#ffd15b',
  lance: '#e7ecf3', pod: '#5fe0c0', crystal: '#b9e6ff', membrane: '#9fb6d8', vascular: '#ff6f91',
};

/** One placed organ instance (derived, not authored). */
interface Organ {
  kind: OrganKind;
  angle: number; // radial placement around the tower
  size: number; // 0..1 (× tower r at draw)
  phase: number; // per-organ animation offset
  hue: string;
}

/** The full derived appearance. `motion` weights drive the idle animation. */
export interface OrganismSpec {
  organs: Organ[];
  intensity: number; // overall glow / boldness (0..~1.6, scaled by rarity via the profile magnitude)
  motion: { twitch: number; pulse: number; ooze: number; breathe: number; burst: number };
  tint: string; // dominant blended hue (also the projectile core)
}

/** Sum of profile weights (the organism's total "mass" — grows with rarity + level + count). */
function profileMass(p: StatProfile): number {
  let s = 0;
  for (const a of MULLIGAN_AXES) s += p[a];
  return s;
}

/**
 * Derive a coherent organism from a StatProfile + seed. Each axis with meaningful weight contributes
 * organs proportional to its share; the seed jitters placement/size/phase so every organism is unique
 * even for the same profile shape. Deterministic + pure.
 */
export function deriveOrganism(profile: StatProfile, visualSeed: number): OrganismSpec {
  const mass = profileMass(profile);
  const r = rng(visualSeed);
  const organs: Organ[] = [];
  if (mass <= 0) return { organs, intensity: 0, motion: { twitch: 0, pulse: 0, ooze: 0, breathe: 0, burst: 0 }, tint: '#ffffff' };

  // Axes sorted by weight — the dominant few define the silhouette; a golden-angle walk spreads them.
  const ranked = [...MULLIGAN_AXES].filter((a) => profile[a] > 0).sort((x, y) => profile[y] - profile[x]);
  const GOLDEN = 2.399963; // radians — even, non-repeating angular spread
  let ang = r() * TAU;
  let tintR = 0, tintG = 0, tintB = 0, tintW = 0;
  for (const axis of ranked) {
    const share = profile[axis] / mass; // 0..1
    const count = Math.max(1, Math.round(1 + share * 6)); // 1..7 organs per strong axis
    const kind = AXIS_ORGAN[axis];
    const hue = ORGAN_HUE[kind];
    const [hr, hg, hb] = hexRgb(hue);
    tintR += hr * profile[axis]; tintG += hg * profile[axis]; tintB += hb * profile[axis]; tintW += profile[axis];
    for (let i = 0; i < count; i++) {
      ang += GOLDEN + (r() - 0.5) * 0.5;
      organs.push({
        kind,
        angle: ang,
        size: 0.28 + share * 0.5 + r() * 0.16,
        phase: r() * TAU,
        hue,
      });
    }
  }
  const intensity = Math.min(1.6, 0.4 + mass * 0.16);
  // Motion is a blend of archetype tendencies (docs/MULLIGANS.md §animation).
  const n = (a: MulliganAxis): number => profile[a] / mass;
  const motion = {
    twitch: n('attackSpeed'),
    pulse: n('damage') + n('splash') * 0.5,
    ooze: n('poison') + n('debuff') * 0.4,
    breathe: n('support') + n('healing'),
    burst: Math.min(n('damage'), n('crit')) * 2, // "contract then release" when both are strong
  };
  const tint = tintW > 0 ? rgbHex(tintR / tintW, tintG / tintW, tintB / tintW) : '#ffffff';
  return { organs, intensity, motion, tint };
}

// ── Drawing ──────────────────────────────────────────────────────────────────

/** Which depth slice of the organism to paint. The renderer sandwiches the tower body between a
 *  'back' and a 'front' pass so the creature visibly WRAPS its host (organs pointing up-lane sit
 *  behind the turret; the rest drape over it). 'all' (the default) is the single-pass form the
 *  Mulligan Lab's graft chamber uses. */
export type OrganismLayer = 'back' | 'front' | 'all';

/** An organ points 'back' when its angle aims up-lane (negative screen-y) — behind the body. */
function isBackOrgan(angle: number): boolean {
  return Math.sin(angle) < -0.15;
}

/**
 * Draw a resolved Mulligan's organism grafted onto a tower at (x,y) of radius r. No-op unless the
 * organism is active. `now` drives the derived idle animation; `fired` [0..1] is the tower's recoil
 * — the whole graft REACTS to its host firing (organs kick outward and flare, the aura surges).
 * Every organ is tethered to the body by living graft tissue (a tapered sinew + attachment pucker),
 * so the creature reads as grafted ONTO the tower rather than orbiting it.
 */
export function drawMulliganOrganism(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  resolved: ResolvedMulligan,
  visualSeed: number, animSeed: number,
  now: number,
  fired = 0,
  layer: OrganismLayer = 'all',
): void {
  if (!resolved.active) return;
  const spec = deriveOrganism(resolved.profile, visualSeed);
  if (spec.organs.length === 0) return;
  const m = spec.motion;
  // Global animation drivers (composed from the motion weights + the anim seed's phase).
  const ph = (animSeed % 1000) / 1000 * TAU;
  const breathe = 1 + m.breathe * 0.06 * Math.sin(now * 1.6 + ph);
  const pulse = 1 + m.pulse * 0.10 * Math.max(0, Math.sin(now * 3.4 + ph));
  const burst = m.burst > 0.02 ? 1 + m.burst * 0.14 * burstWave(now * 1.1 + ph) : 1;
  const bodyScale = breathe * pulse * burst;
  const R = r * bodyScale;
  const flare = Math.max(0, Math.min(1, fired)); // the host just fired — the graft reacts

  ctx.save();
  ctx.translate(x, y);
  // A faint containment aura reads the organism as one bound creature. Drawn on the BACK pass so
  // it halos the body from behind (never washes the turret out); it surges when the host fires.
  if (layer !== 'front') {
    const aura = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.9);
    const surge = 1 + flare * 0.9;
    aura.addColorStop(0, withAlpha(spec.tint, 0.0));
    aura.addColorStop(0.7, withAlpha(spec.tint, 0.05 * spec.intensity * surge));
    aura.addColorStop(1, withAlpha(spec.tint, 0.16 * spec.intensity * surge));
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.9, 0, TAU); ctx.fill();
  }

  for (const o of spec.organs) {
    if (layer !== 'all' && (layer === 'back') !== isBackOrgan(o.angle)) continue; // not this pass's slice
    const twitch = m.twitch > 0.02 ? (Math.sin(now * 22 + o.phase * 5) * m.twitch * 0.05) : 0;
    const ooze = m.ooze > 0.02 ? (Math.sin(now * 1.3 + o.phase) * m.ooze * 0.12) : 0;
    const a = o.angle + twitch;
    const reach = R * (1.0 + o.size * 0.55 + ooze) + flare * r * 0.2; // recoil kicks the organ outward
    const ox = Math.cos(a) * reach;
    const oy = Math.sin(a) * reach;
    const s = o.size * r * (0.6 + 0.4 * spec.intensity) * (1 + flare * 0.14);
    // GRAFT TISSUE: a living sinew tethering the organ to the host's body — the thing that makes
    // the creature read as grafted ON rather than floating debris. Anchored at the body edge.
    drawGraftSinew(ctx, a, r * 0.62, ox, oy, s, o.hue, now + o.phase, spec.intensity, m.breathe + m.ooze);
    drawOrgan(ctx, o.kind, ox, oy, a, s, o.hue, now + o.phase, spec.intensity + flare * 0.4);
  }
  ctx.restore();
}

/** The tapered sinew from the tower's edge to an organ, plus the attachment pucker where flesh
 *  meets chassis. Filled as one two-curve shape (wide at the body, thin at the organ) with a
 *  gentle perpendicular sway so the tissue visibly lives. */
function drawGraftSinew(
  ctx: CanvasRenderingContext2D,
  angle: number, anchorR: number,
  ox: number, oy: number,
  organSize: number, hue: string,
  now: number, intensity: number, liveliness: number,
): void {
  const ax = Math.cos(angle) * anchorR;
  const ay = Math.sin(angle) * anchorR;
  const dx = ox - ax, dy = oy - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  // Perpendicular sway: the sinew breathes/oozes sideways at its midpoint.
  const px = -dy / len, py = dx / len;
  const sway = Math.sin(now * 1.8) * organSize * (0.18 + liveliness * 0.25);
  const mx = ax + dx * 0.5 + px * sway;
  const my = ay + dy * 0.5 + py * sway;
  const wBase = Math.max(1.2, organSize * 0.5); // wide where it meets the body
  const wTip = Math.max(0.8, organSize * 0.18); // thin where it feeds the organ
  ctx.save();
  ctx.globalAlpha = Math.min(1, 0.5 + intensity * 0.3);
  const g = ctx.createLinearGradient(ax, ay, ox, oy);
  g.addColorStop(0, shade(hue, -0.5));
  g.addColorStop(1, shade(hue, -0.15));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(ax + px * wBase, ay + py * wBase);
  ctx.quadraticCurveTo(mx + px * (wBase + wTip) * 0.5, my + py * (wBase + wTip) * 0.5, ox + px * wTip, oy + py * wTip);
  ctx.lineTo(ox - px * wTip, oy - py * wTip);
  ctx.quadraticCurveTo(mx - px * (wBase + wTip) * 0.5, my - py * (wBase + wTip) * 0.5, ax - px * wBase, ay - py * wBase);
  ctx.closePath();
  ctx.fill();
  // Attachment pucker: flesh gripping the chassis — a dark seam ringed by the organ's hue.
  ctx.globalAlpha = Math.min(1, 0.6 + intensity * 0.3);
  ctx.fillStyle = 'rgba(8,6,12,0.75)';
  ctx.beginPath(); ctx.ellipse(ax, ay, wBase * 1.15, wBase * 0.8, angle, 0, TAU); ctx.fill();
  ctx.strokeStyle = withAlpha(hue, 0.55);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(ax, ay, wBase * 1.15, wBase * 0.8, angle, 0, TAU); ctx.stroke();
  ctx.restore();
}

/** A "contract then release" wave in [0,1): slow wind-up, fast snap. */
function burstWave(t: number): number {
  const u = (t % TAU) / TAU; // 0..1
  return u < 0.7 ? (u / 0.7) * (u / 0.7) : 1 - (u - 0.7) / 0.3;
}

function drawOrgan(ctx: CanvasRenderingContext2D, kind: OrganKind, x: number, y: number, ang: number, s: number, hue: string, now: number, intensity: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const baseA = Math.min(1, 0.55 + intensity * 0.35);
  ctx.globalAlpha = baseA;
  const glow = withAlpha(hue, 0.9);
  switch (kind) {
    case 'spike': // large offensive bone/chitin spike
    case 'lance': { // bone lance (longer, thinner)
      const len = s * (kind === 'lance' ? 2.6 : 1.7);
      const w = s * (kind === 'lance' ? 0.28 : 0.5);
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, shade(hue, -0.3)); g.addColorStop(1, shade(hue, 0.4));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, -w); ctx.lineTo(len, 0); ctx.lineTo(0, w); ctx.closePath(); ctx.fill();
      ctx.fillStyle = withAlpha('#ffffff', 0.5); ctx.beginPath(); ctx.moveTo(len * 0.5, -w * 0.2); ctx.lineTo(len, 0); ctx.lineTo(len * 0.5, w * 0.2); ctx.closePath(); ctx.fill();
      break;
    }
    case 'tendril': { // thin lashing tendril
      const len = s * 2.2;
      ctx.strokeStyle = glow; ctx.lineWidth = Math.max(1, s * 0.22); ctx.lineCap = 'round';
      const wob = Math.sin(now * 6) * s * 0.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, wob, len, wob * 0.4); ctx.stroke();
      break;
    }
    case 'sac': // parasite sac (pulsing)
    case 'gland': { // swollen gland (bigger)
      const rr = s * (kind === 'gland' ? 1.1 : 0.8) * (1 + 0.12 * Math.sin(now * 3));
      const g = ctx.createRadialGradient(-rr * 0.3, -rr * 0.3, rr * 0.1, 0, 0, rr);
      g.addColorStop(0, shade(hue, 0.5)); g.addColorStop(1, shade(hue, -0.35));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, rr, rr * 0.82, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = withAlpha('#ffffff', 0.4); ctx.beginPath(); ctx.arc(-rr * 0.3, -rr * 0.3, rr * 0.22, 0, TAU); ctx.fill();
      break;
    }
    case 'vein': // green (or hued) vein tracing
    case 'vascular': { // vascular strand (red)
      ctx.strokeStyle = glow; ctx.lineWidth = Math.max(1, s * 0.18);
      ctx.beginPath(); ctx.moveTo(-s, 0);
      for (let i = 1; i <= 4; i++) ctx.lineTo(-s + (i / 4) * s * 2.4, Math.sin(i * 1.7 + now * (kind === 'vascular' ? 4 : 1.5)) * s * 0.4);
      ctx.stroke();
      break;
    }
    case 'pod': { // symbiotic pod cluster
      for (let i = 0; i < 3; i++) {
        const px = (i - 1) * s * 0.7;
        ctx.fillStyle = shade(hue, i === 1 ? 0.3 : -0.1);
        ctx.beginPath(); ctx.arc(px, 0, s * 0.5, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'crystal': { // crystalline growth (crit)
      ctx.fillStyle = withAlpha(hue, 0.85);
      ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.lineTo(s * 0.6, 0); ctx.lineTo(0, s * 1.3); ctx.lineTo(-s * 0.6, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = withAlpha('#ffffff', 0.6); ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.lineTo(s * 0.25, 0); ctx.lineTo(0, s * 0.4); ctx.closePath(); ctx.fill();
      break;
    }
    case 'membrane': { // sticky translucent membrane
      ctx.globalAlpha = baseA * 0.5;
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.ellipse(0, 0, s * 1.3, s * 0.7, 0, 0, TAU); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

// ── Projectile generator (hook) — shape/size/colour/trail/particles/impact/sound from the profile ──

export interface MulliganProjectileSkin {
  shape: 'orb' | 'lance' | 'shard' | 'blob' | 'dart';
  size: number; // radius multiplier (1 = base)
  color: string;
  trail: number; // 0..1 trail length
  particles: number; // spawned-per-frame hint
  impact: 'burst' | 'splatter' | 'shatter' | 'pierce';
  sfx: string; // fire cue tag
}

/** Derive a coherent projectile skin from the resolved profile. Pure. */
export function deriveMulliganProjectile(resolved: ResolvedMulligan, seed: number): MulliganProjectileSkin | null {
  if (!resolved.active) return null;
  const p = resolved.profile;
  const mass = profileMass(p) || 1;
  const spec = deriveOrganism(p, seed);
  const n = (a: MulliganAxis): number => p[a] / mass;
  // Dominant axis picks the shape + impact; magnitudes pick size/trail/particles.
  const dom = [...MULLIGAN_AXES].sort((x, y) => p[y] - p[x])[0];
  const shape: MulliganProjectileSkin['shape'] =
    dom === 'pierce' ? 'lance' : dom === 'crit' ? 'shard' : dom === 'splash' || dom === 'poison' ? 'blob' : dom === 'attackSpeed' ? 'dart' : 'orb';
  const impact: MulliganProjectileSkin['impact'] =
    dom === 'pierce' ? 'pierce' : dom === 'crit' ? 'shatter' : dom === 'splash' || dom === 'poison' ? 'splatter' : 'burst';
  const sfx = dom === 'crit' ? 'tf_ting' : dom === 'splash' ? 'tf_thud' : dom === 'poison' || dom === 'debuff' ? 'tf_wet' : dom === 'support' ? 'tf_zap' : 'tf_tick';
  return {
    shape,
    size: 0.8 + n('damage') * 0.9 + n('splash') * 0.6,
    color: spec.tint,
    trail: Math.min(1, n('attackSpeed') * 1.4 + 0.15),
    particles: Math.round(n('splash') * 4 + n('poison') * 3),
    impact,
    sfx,
  };
}

/** Draw a generated projectile skin at (x,y) heading `ang`. Self-contained (dev preview + in-run). */
export function drawMulliganProjectile(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, skin: MulliganProjectileSkin, r: number, now: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const s = r * skin.size;
  if (skin.trail > 0) {
    const g = ctx.createLinearGradient(-s * (2 + skin.trail * 5), 0, 0, 0);
    g.addColorStop(0, withAlpha(skin.color, 0)); g.addColorStop(1, withAlpha(skin.color, 0.5));
    ctx.strokeStyle = g; ctx.lineWidth = s * 0.9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s * (2 + skin.trail * 5), 0); ctx.lineTo(0, 0); ctx.stroke();
  }
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.4);
  core.addColorStop(0, '#ffffff'); core.addColorStop(0.4, skin.color); core.addColorStop(1, withAlpha(skin.color, 0));
  ctx.fillStyle = core;
  switch (skin.shape) {
    case 'lance': ctx.beginPath(); ctx.moveTo(-s, -s * 0.3); ctx.lineTo(s * 1.6, 0); ctx.lineTo(-s, s * 0.3); ctx.closePath(); ctx.fill(); break;
    case 'shard': ctx.beginPath(); ctx.moveTo(0, -s * 1.2); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, s * 1.2); ctx.lineTo(-s * 0.7, 0); ctx.closePath(); ctx.fill(); break;
    case 'blob': { const w = 1 + 0.15 * Math.sin(now * 12); ctx.beginPath(); ctx.ellipse(0, 0, s * 1.1 * w, s * 0.95 / w, 0, 0, TAU); ctx.fill(); break; }
    case 'dart': ctx.beginPath(); ctx.ellipse(0, 0, s * 1.3, s * 0.5, 0, 0, TAU); ctx.fill(); break;
    default: ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ── color helpers (local, dependency-free) ───────────────────────────────────
function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function rgbHex(r: number, g: number, b: number): string {
  const c = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function withAlpha(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function shade(hex: string, amt: number): string {
  const [r, g, b] = hexRgb(hex);
  const f = amt < 0 ? 1 + amt : 1;
  const add = amt > 0 ? amt * 255 : 0;
  return rgbHex(r * f + add, g * f + add, b * f + add);
}
