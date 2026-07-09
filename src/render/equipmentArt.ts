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
