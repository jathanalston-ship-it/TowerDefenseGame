// EQUIPMENT ART (docs/EQUIPMENT.md §visuals) — the procedural visualization framework for Hero
// Equipment. Asset-free and DERIVED: an item's card illustration and a hero's in-game gear are both
// generated from item DATA (slot, weapon/armor subtype, set, rarity, affixes, item level) plus a
// deterministic per-item seed. So hundreds of future items need ZERO new art — a new item is one
// data row and grows a coherent, unique, rarity-graded illustration for free (CLAUDE.md "generalize,
// don't hardcode"). Pure presentation: no sim, no DOM — a fresh account renders the starter look and
// the golden sim is untouched (this module is never read by the sim).

import type { EquipDef, Rarity } from '../core/equipment';
import { RARITY_ORDER } from '../core/equipment';

const TAU = Math.PI * 2;

// Canvas needs LITERAL colors (the DOM's rarity `var(--r-*)` can't be parsed into a gradient stop).
// These mirror the theme's rarity hues; exotic gets a striking teal so the apex reads instantly.
const RARITY_HEX: Record<string, string> = {
  common: '#9aa7b8', uncommon: '#5fe08a', rare: '#5ad1ff', epic: '#c98bff',
  legendary: '#ffd24d', exotic: '#4dffd2', mythic: '#ff6b8b',
};
export function rarityHex(rarity: string): string {
  return RARITY_HEX[rarity] ?? '#9aa7b8';
}

/** Rarity → a visual TIER (0 common … 4 exotic/ascendant) driving effect complexity. Rarity-agnostic:
 *  an unknown/future rarity falls back to the mid tier. */
export function rarityTier(rarity: string): number {
  const i = RARITY_ORDER.indexOf(rarity as Rarity);
  return i >= 0 ? i : 2;
}

/** Deterministic seed from an item's stable id (FNV-1a) — same item ⇒ same illustration. */
export function artSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Named set hues (accents the illustration by its build family); unknown sets hash to a stable hue.
const SET_HUE: Record<string, string> = {
  apex: '#ff5b4a', caustic: '#9be84a', paralytic: '#7cdcff', resonance: '#ffcf4d',
  lifebloom: '#ff6f91', windrunner: '#8fd0ff',
};
function setHue(setId?: string): string {
  if (!setId) return '#c8d0e0';
  if (SET_HUE[setId]) return SET_HUE[setId];
  let h = 0; for (let i = 0; i < setId.length; i++) h = (h * 31 + setId.charCodeAt(i)) & 0xffff;
  return `hsl(${h % 360}, 70%, 62%)`;
}

/** The derived, cacheable illustration spec (also drives the in-game weapon form). */
export interface ItemArtSpec {
  slot: 'weapon' | 'armor' | 'relic';
  subtype: string; // weaponType / armorType / 'relic'
  rarity: string;
  tier: number;
  color: string; // rarity color (frame + effects)
  accent: string; // set hue (illustration accent)
  seed: number;
  spikes: number; // embellishment count (grows with rarity + affixes)
  living: boolean; // legendary+: breathing/organic motion
  particles: number; // orbiting particle count (epic+)
}

export function deriveItemArt(def: EquipDef, rarity: string, affixCount = 0, _ilvl?: number): ItemArtSpec {
  const tier = rarityTier(rarity);
  const subtype = def.slot === 'weapon' ? (def.weaponType ?? 'ranged') : def.slot === 'armor' ? (def.armorType ?? 'carapace') : 'relic';
  return {
    slot: def.slot,
    subtype,
    rarity,
    tier,
    color: rarityHex(rarity),
    accent: setHue(def.setId),
    seed: artSeed(def.id),
    spikes: 3 + tier + Math.min(4, affixCount),
    living: tier >= 3,
    particles: tier >= 2 ? (tier - 1) * 3 : 0,
  };
}

// ── color helpers ────────────────────────────────────────────────────────────
function hexRgb(hex: string): [number, number, number] {
  if (hex[0] === '#') {
    const h = hex.slice(1);
    const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  // hsl() fallback → a mid grey-blue (only set accents use hsl; good enough for a tint)
  return [140, 150, 170];
}
function rgba(hex: string, a: number): string { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function shade(hex: string, amt: number): string {
  const [r, g, b] = hexRgb(hex); const f = amt < 0 ? 1 + amt : 1; const add = amt > 0 ? amt * 255 : 0;
  const c = (n: number): number => Math.max(0, Math.min(255, Math.round(n * f + add)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

/**
 * Draw the procedural card illustration for an item into (cx,cy) at `size`. Renders a rarity-framed
 * biomechanical emblem whose FORM comes from the slot/subtype, ACCENT from the set, and EFFECTS from
 * the rarity tier: common flat · rare glow · epic orbiting particles · legendary living silhouette ·
 * exotic complex particles + floating energy. `now` (seconds) drives the animation.
 */
export function drawItemArt(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, spec: ItemArtSpec, now = 0): void {
  const r = size * 0.5;
  const r2 = rng(spec.seed);
  const rot0 = r2() * TAU;
  ctx.save();
  ctx.translate(cx, cy);

  // Panel — a rarity-tinted vignette.
  const bg = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
  bg.addColorStop(0, rgba(spec.color, 0.16));
  bg.addColorStop(0.7, 'rgba(10,8,18,0.9)');
  bg.addColorStop(1, 'rgba(6,5,12,1)');
  ctx.fillStyle = bg;
  roundRect(ctx, -r, -r, r * 2, r * 2, r * 0.16); ctx.fill();

  // Rarity aura glow (rare+), intensifying with tier.
  if (spec.tier >= 1) {
    const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 0.95);
    const pulse = 0.5 + 0.5 * Math.sin(now * 2 + spec.seed);
    glow.addColorStop(0, rgba(spec.color, (0.1 + spec.tier * 0.05) * (0.7 + 0.3 * pulse)));
    glow.addColorStop(1, rgba(spec.color, 0));
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0, TAU); ctx.fill();
  }

  // ── The emblem — a slot-specific biomechanical form, breathing when "living" (legendary+). ──
  const breath = spec.living ? 1 + 0.05 * Math.sin(now * 2.2 + spec.seed) : 1;
  ctx.save();
  ctx.scale(breath, breath);
  ctx.rotate(spec.living ? Math.sin(now * 0.6) * 0.05 : 0);
  drawEmblem(ctx, r * 0.62, spec, rot0, now);
  ctx.restore();

  // ── Orbiting particles (epic+) ──
  for (let i = 0; i < spec.particles; i++) {
    const a = rot0 + (i / Math.max(1, spec.particles)) * TAU + now * (spec.tier >= 4 ? 1.6 : 0.9);
    const rr = r * (0.7 + 0.12 * Math.sin(now * 3 + i));
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
    ctx.fillStyle = rgba(spec.color, 0.9);
    ctx.beginPath(); ctx.arc(px, py, size * (spec.tier >= 4 ? 0.03 : 0.022), 0, TAU); ctx.fill();
  }
  // ── Exotic floating energy: a slow rising motes column ──
  if (spec.tier >= 4) {
    for (let i = 0; i < 5; i++) {
      const t = (now * 0.4 + i / 5) % 1;
      const px = (r2() - 0.5) * r * 1.1;
      ctx.fillStyle = rgba(spec.color, (1 - t) * 0.6);
      ctx.beginPath(); ctx.arc(px + Math.sin(now + i) * 3, r - t * r * 1.7, size * 0.018, 0, TAU); ctx.fill();
    }
  }

  // Rarity frame + corner accents (animated sheen at premium tiers).
  ctx.lineWidth = Math.max(1.5, size * 0.03);
  ctx.strokeStyle = spec.color;
  roundRect(ctx, -r + 1, -r + 1, r * 2 - 2, r * 2 - 2, r * 0.16); ctx.stroke();
  if (spec.tier >= 3) {
    const sweep = (now * 0.5) % 1;
    ctx.save(); ctx.beginPath(); roundRect(ctx, -r, -r, r * 2, r * 2, r * 0.16); ctx.clip();
    const sh = ctx.createLinearGradient(-r + sweep * r * 2.4 - r, 0, -r + sweep * r * 2.4, 0);
    sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, rgba('#ffffff', 0.18)); sh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore();
  }
  ctx.restore();
}

/** The slot/subtype emblem (the "unique illustration" core). */
function drawEmblem(ctx: CanvasRenderingContext2D, s: number, spec: ItemArtSpec, rot: number, now: number): void {
  const col = spec.color, acc = spec.accent;
  ctx.save();
  ctx.rotate(rot);
  if (spec.slot === 'weapon') {
    // A haft + a subtype head, ringed by spent-energy spikes.
    ctx.strokeStyle = shade(acc, -0.1); ctx.lineWidth = s * 0.14; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, s * 0.9); ctx.lineTo(0, -s * 0.4); ctx.stroke();
    ctx.fillStyle = col;
    if (spec.subtype === 'melee') { ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.34, -s * 0.2); ctx.lineTo(0, -s * 0.35); ctx.lineTo(-s * 0.34, -s * 0.2); ctx.closePath(); ctx.fill(); }
    else if (spec.subtype === 'ranged') { ctx.fillRect(-s * 0.16, -s, s * 0.32, s * 0.7); ctx.fillStyle = shade(col, 0.4); ctx.beginPath(); ctx.arc(0, -s, s * 0.16, 0, TAU); ctx.fill(); }
    else { for (let i = 0; i < 3; i++) { ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = s * 0.08; ctx.beginPath(); ctx.arc(0, -s * 0.4, s * (0.2 + i * 0.14), -0.4, Math.PI + 0.4); ctx.stroke(); } }
  } else if (spec.slot === 'armor') {
    // A layered carapace shield.
    ctx.fillStyle = shade(acc, -0.2); polygon(ctx, 0, 0, s * 0.95, 6, rot); ctx.fill();
    ctx.fillStyle = shade(col, 0.1); polygon(ctx, 0, 0, s * 0.62, 6, rot); ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.35); ctx.lineWidth = s * 0.05; polygon(ctx, 0, 0, s * 0.62, 6, rot); ctx.stroke();
    if (spec.subtype === 'hide') { ctx.strokeStyle = rgba(acc, 0.8); ctx.lineWidth = s * 0.06; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * s * 0.3, -s * 0.5); ctx.quadraticCurveTo(i * s * 0.5, 0, i * s * 0.3, s * 0.5); ctx.stroke(); } }
  } else {
    // Relic — an orbital core with rings.
    ctx.strokeStyle = rgba(acc, 0.8); ctx.lineWidth = s * 0.06;
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.85, s * 0.4, now * 0.6, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.4, s * 0.85, -now * 0.5, 0, TAU); ctx.stroke();
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.4);
    core.addColorStop(0, '#ffffff'); core.addColorStop(0.4, col); core.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, TAU); ctx.fill();
  }
  // Embellishment spikes ring the emblem (count = rarity + affixes).
  ctx.fillStyle = rgba(col, 0.85);
  for (let i = 0; i < spec.spikes; i++) {
    const a = (i / spec.spikes) * TAU;
    const rr = s * 1.05;
    ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, s * 0.06, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════════
// IN-GAME HERO GEAR — the equipped loadout drawn ON the hero during gameplay, so a
// heavily-geared veteran reads as a dramatically different biomechanical warrior. Derived from the
// same item data; rarity drives the effect complexity, active sets add prestige organs (veins /
// cloak / halo / floating relics). Render-only ⇒ golden-safe (a starter with no gear draws nothing).
// ═══════════════════════════════════════════════════════════════════════════════

export interface GearAttachment { slot: 'weapon' | 'armor' | 'relic'; subtype: string; color: string; accent: string; tier: number; seed: number; }
export interface HeroGearSpec {
  attachments: GearAttachment[];
  maxTier: number; // top rarity across equipped gear → energy halo / particle intensity
  setPower: number; // active set-bonus count → prestige-organ intensity (veins/cloak/halo/relics)
  hasGear: boolean;
}

/** Derive the hero's battlefield gear from the equipped items (each `{def, rarity}`) + the count of
 *  active set bonuses. Pure + cheap; empty gear ⇒ `hasGear:false` (nothing draws). */
export function deriveHeroGear(items: { def: EquipDef; rarity: string }[], setBonuses = 0): HeroGearSpec {
  const attachments: GearAttachment[] = items.map(({ def, rarity }) => ({
    slot: def.slot,
    subtype: def.slot === 'weapon' ? (def.weaponType ?? 'ranged') : def.slot === 'armor' ? (def.armorType ?? 'carapace') : 'relic',
    color: rarityHex(rarity),
    accent: setHue(def.setId),
    tier: rarityTier(rarity),
    seed: artSeed(def.id),
  }));
  const maxTier = attachments.reduce((m, a) => Math.max(m, a.tier), 0);
  return { attachments, maxTier, setPower: Math.max(0, setBonuses), hasGear: attachments.length > 0 };
}

/**
 * Draw a hero's equipped gear at (x,y) of body-radius r. Layered back-to-front: energy halo →
 * back/relic pack → armor plates (shoulders) → orbiting relics → weapon at the side → set prestige
 * organs (veins/cloak/halo) → rarity particles. Everything idle-animated by `now`. `facing` (±1)
 * points the weapon; `tint` is the hero class hue (set-organ default).
 */
export function drawHeroGear(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spec: HeroGearSpec, now: number, tint = '#c8d0e0', facing = 1, spin = 0): void {
  if (!spec.hasGear && spec.setPower <= 0) return;
  // `spin` (radians) revolves the attachments around the hero for the inspect TURNTABLE; spin === 0
  // is the exact battlefield placement (in-game passes 0, so the live look is byte-identical).
  const turning = spin !== 0;
  ctx.save();
  ctx.translate(x, y);

  // ── Energy halo — grows with the top rarity (rare glow → exotic reactive corona). ──
  if (spec.maxTier >= 1) {
    const top = spec.attachments.find((a) => a.tier === spec.maxTier)!;
    const pulse = 0.6 + 0.4 * Math.sin(now * 2.5);
    const rad = r * (2.1 + spec.maxTier * 0.22);
    const halo = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, rad);
    halo.addColorStop(0, rgba(top.color, 0));
    halo.addColorStop(0.75, rgba(top.color, (0.05 + spec.maxTier * 0.03) * pulse));
    halo.addColorStop(1, rgba(top.color, 0));
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, rad, 0, TAU); ctx.fill();
  }

  // ── Set prestige organs — pure visual reward for build synergy. ──
  if (spec.setPower >= 1) drawVeins(ctx, r, tint, now); // organic veins tracing the body
  if (spec.setPower >= 2) drawCloak(ctx, r, tint, now, facing); // a living cloak sways behind
  if (spec.setPower >= 3) drawSetHalo(ctx, r, tint, now); // an energy halo ring of runes

  // ── Attachments (back-to-front) ──
  const armor = spec.attachments.find((a) => a.slot === 'armor');
  const relic = spec.attachments.find((a) => a.slot === 'relic');
  const weapon = spec.attachments.find((a) => a.slot === 'weapon');

  // Back/relic pack for legendary+ armor (a spined augmentation).
  if (armor && armor.tier >= 3) {
    ctx.save(); ctx.rotate(Math.sin(now * 1.5) * 0.04);
    ctx.fillStyle = shade(armor.color, -0.1);
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.4, -r * 0.2); ctx.lineTo(i * r * 0.55, -r * 1.5); ctx.lineTo(i * r * 0.25, -r * 0.2); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  // Armor shoulder plates. On the turntable they REVOLVE (front larger/brighter, back smaller/dimmer);
  // in-game (spin 0) they sit at both sides exactly as before.
  if (armor) {
    const flex = 1 + 0.05 * Math.sin(now * 3);
    const plates = turning
      ? [0, Math.PI].map((base) => { const a = base + spin; const d = (Math.sin(a) + 1) / 2; return { px: Math.cos(a) * r * 0.85, depth: d, front: d > 0.5 }; }).sort((p, q) => p.depth - q.depth)
      : [{ px: -r * 0.8, depth: 1, front: facing === -1 }, { px: r * 0.8, depth: 1, front: facing === 1 }];
    for (const pl of plates) {
      const sc = flex * (turning ? 0.7 + 0.4 * pl.depth : 1);
      ctx.save(); ctx.translate(pl.px, -r * 0.35); ctx.scale(sc, sc);
      ctx.globalAlpha = turning ? 0.5 + 0.5 * pl.depth : 1;
      ctx.fillStyle = shade(armor.color, pl.front ? 0.1 : -0.15);
      polygon(ctx, 0, 0, r * 0.5, 5, now * 0.1); ctx.fill();
      if (armor.subtype === 'hide') { ctx.strokeStyle = rgba(armor.accent, 0.7); ctx.lineWidth = r * 0.06; polygon(ctx, 0, 0, r * 0.3, 5, 0); ctx.stroke(); }
      else { ctx.fillStyle = rgba('#ffffff', 0.25); ctx.beginPath(); ctx.arc(-r * 0.1, -r * 0.1, r * 0.12, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  }
  // Orbiting relic(s) — orbit count grows with tier. The turntable spin offsets the orbit phase.
  if (relic) {
    const n = 1 + Math.floor(relic.tier / 2);
    for (let i = 0; i < n; i++) {
      const a = now * 1.2 + (i / n) * TAU + spin;
      const ox = Math.cos(a) * r * 1.7, oy = Math.sin(a) * r * 0.8 - r * 0.3;
      const glow = ctx.createRadialGradient(ox, oy, 0, ox, oy, r * 0.5);
      glow.addColorStop(0, '#ffffff'); glow.addColorStop(0.4, relic.color); glow.addColorStop(1, rgba(relic.color, 0));
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(ox, oy, r * 0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = relic.color; ctx.beginPath(); ctx.arc(ox, oy, r * 0.14, 0, TAU); ctx.fill();
    }
  }
  // Weapon at the side — swayed idle; the head is the weaponType. On the turntable it swings around
  // the hero (x by cos(spin), depth-scaled) so you see it from every angle.
  if (weapon) {
    ctx.save();
    const wDepth = turning ? (Math.sin(spin) + 1) / 2 : 1;
    const wx = turning ? Math.cos(spin) * r * 1.05 : facing * r * 0.95;
    const wSide = turning ? (Math.cos(spin) >= 0 ? 1 : -1) : facing;
    ctx.translate(wx, r * 0.15);
    ctx.scale(turning ? 0.7 + 0.4 * wDepth : 1, turning ? 0.7 + 0.4 * wDepth : 1);
    ctx.globalAlpha = turning ? 0.5 + 0.5 * wDepth : 1;
    ctx.rotate(wSide * (0.5 + Math.sin(now * 1.8) * 0.08));
    const L = r * 1.9;
    ctx.strokeStyle = shade(weapon.accent, -0.1); ctx.lineWidth = r * 0.16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, r * 0.3); ctx.lineTo(0, -L * 0.55); ctx.stroke();
    ctx.fillStyle = weapon.color;
    if (weapon.subtype === 'melee') { ctx.beginPath(); ctx.moveTo(0, -L); ctx.lineTo(r * 0.24, -L * 0.5); ctx.lineTo(0, -L * 0.6); ctx.lineTo(-r * 0.24, -L * 0.5); ctx.closePath(); ctx.fill(); }
    else if (weapon.subtype === 'ranged') { ctx.fillRect(-r * 0.14, -L, r * 0.28, L * 0.5); if (weapon.tier >= 3) { ctx.fillStyle = rgba(weapon.color, 0.6 + 0.4 * Math.sin(now * 6)); ctx.beginPath(); ctx.arc(0, -L, r * 0.18, 0, TAU); ctx.fill(); } }
    else { for (let i = 0; i < 3; i++) { ctx.strokeStyle = rgba(weapon.color, 0.9); ctx.lineWidth = r * 0.08; ctx.beginPath(); ctx.arc(0, -L * 0.55, r * (0.2 + i * 0.14), -0.5, Math.PI + 0.5); ctx.stroke(); } }
    ctx.restore();
  }

  // ── Rarity particles (epic+): motes rising off the hero. ──
  if (spec.maxTier >= 2) {
    const top = spec.attachments.find((a) => a.tier === spec.maxTier)!;
    const cnt = (spec.maxTier - 1) * 3;
    for (let i = 0; i < cnt; i++) {
      const t = (now * 0.5 + i / cnt) % 1;
      const px = Math.sin(i * 2.4 + now) * r * 1.2;
      ctx.fillStyle = rgba(top.color, (1 - t) * 0.7);
      ctx.beginPath(); ctx.arc(px, r * 0.6 - t * r * 2.4, r * (spec.maxTier >= 4 ? 0.12 : 0.08), 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

function drawVeins(ctx: CanvasRenderingContext2D, r: number, tint: string, now: number): void {
  ctx.save();
  ctx.strokeStyle = rgba(tint, 0.5 + 0.2 * Math.sin(now * 2));
  ctx.lineWidth = Math.max(1, r * 0.08);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.5, Math.cos(a) * r * 1.1 + Math.sin(now * 2 + i) * r * 0.1, Math.sin(a) * r * 1.1);
    ctx.stroke();
  }
  ctx.restore();
}
function drawCloak(ctx: CanvasRenderingContext2D, r: number, tint: string, now: number, facing: number): void {
  ctx.save();
  const sway = Math.sin(now * 1.5) * r * 0.3;
  const g = ctx.createLinearGradient(0, -r, 0, r * 2.2);
  g.addColorStop(0, rgba(tint, 0.5)); g.addColorStop(1, rgba(tint, 0.05));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-r * 0.7, -r * 0.5);
  ctx.quadraticCurveTo(-r * 1.1 + sway, r, -r * 0.8 + sway - facing * r * 0.2, r * 2.1);
  ctx.lineTo(r * 0.8 + sway - facing * r * 0.2, r * 2.1);
  ctx.quadraticCurveTo(r * 1.1 + sway, r, r * 0.7, -r * 0.5);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawSetHalo(ctx: CanvasRenderingContext2D, r: number, tint: string, now: number): void {
  ctx.save();
  ctx.translate(0, -r * 1.6);
  ctx.strokeStyle = rgba(tint, 0.7); ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.8, r * 0.3, 0, 0, TAU); ctx.stroke();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + now * 0.8; ctx.fillStyle = rgba(tint, 0.9); ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.3, r * 0.07, 0, TAU); ctx.fill(); }
  ctx.restore();
}

// ── primitive helpers ────────────────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function polygon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, n: number, rot = 0): void {
  ctx.beginPath();
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.closePath();
}
