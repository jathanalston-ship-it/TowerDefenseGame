// Tower visual evolution (TOWER-BRANCHES.md §9) — a DATA-DRIVEN organ vocabulary so every
// branch upgrade tier visibly MUTATES the tower (growth, limbs, armor, barrels, pulsating
// biomass, glowing organs, …) and a maxed tower is instantly recognizable on the field without
// opening the inspector. This replaces the old per-branch switch ladder: a branch is now a DATA
// entry (which organs it grows, at which tier) composed by one generic renderer, so adding a
// branch — or a tower — needs no new draw code (CLAUDE.md "generalize, don't hardcode").
//
// Pure presentation: reads only a Tower's branchId/tier/position; never mutates the sim. An
// unbranched tower (tier 0) renders nothing here, so the golden look is unchanged.

import type { Tower } from '../core/types';
import { hexRgb, rgba } from './theme';
import { drawShape, glowDisc, ring, spikeCrown, pulse, easeOutCubic } from './vfx';

/** Seconds a freshly-purchased tier takes to "grow in" — the body swells to its new size and the
 *  new organ materializes over this window (driven by `now - tower.mutatedAt`). */
export const MUTATION_GROW_TIME = 0.55;

// ── Signature colors (shared with the projectile skins in renderer.ts) ───────────────────────
export const BRANCH_COLOR: Record<string, string> = {
  needle_swarm: '#c8f04a', needle_rail: '#bfe9ff',
  mortar_siege: '#ff8a3c', mortar_cauldron: '#9be84a',
  reactor_heart: '#ff6f91', reactor_brood: '#b58cff',
  parasite_apex: '#e24dff', parasite_ravager: '#d83a4a',
  obelisk_tyrant: '#9aa6ff', obelisk_mindrender: '#7cdcff',
  maw_butcher: '#ff5c5c', maw_gullet: '#5ccdd8',
  chrysalis_deepfreeze: '#ffd98a', chrysalis_amber: '#e8b04a',
  effigy_choir: '#c9a6ff', effigy_malice: '#ff7ad9',
  coil_overload: '#ffcf4d', coil_prism: '#6fe0c0',
};

/** The reusable "organ" vocabulary — each maps to a small pure drawer in PART_DRAWERS. */
export type EvoPartKind =
  | 'halo' // soft signature glow (growth read)
  | 'barbs' // orbiting venom spines
  | 'barrel' // a single rail/cannon up the lane
  | 'barrels' // a fanned battery of tubes
  | 'armor' // organic carapace plates ringing the body
  | 'biomass' // pulsating sacs/blisters
  | 'organs' // glowing organ nodes
  | 'spikes' // jutting thorns
  | 'limbs' // additional segmented limbs
  | 'tendrils' // lashing tendrils
  | 'fangs' // snapping mandible-fangs
  | 'crown' // a crown of spikes
  | 'glyphRing' // a slow rotating glyph ring
  | 'arcs' // crackling lightning
  | 'pods' // budding egg-pods
  | 'ripples' // expanding contagion rings
  | 'heart' // a beating vital organ + veins
  | 'nova'; // capstone aura pulse

/** One organ a branch grows. `at` = the tier it first appears (1..5); it then keeps growing via
 *  `per` (added to `count` for each tier above `at`). Identity color = the branch color. */
export interface EvoPart {
  at: number;
  kind: EvoPartKind;
  color?: string;
  count?: number; // base element count
  per?: number; // + count per tier above `at`
  scale?: number; // size knob (× r), kind-specific default
}

export interface BranchEvolution {
  color: string;
  growth: number; // body silhouette scale ADDED per tier (so a T5 tower is visibly larger)
  parts: EvoPart[];
}

// ── The roster: each branch grows a NEW organ at every tier 1..5 (enforced by
//    towerEvolution.test) plus its earlier organs keep swelling — so each purchase visibly
//    mutates the tower. The organ CHOICE + color is the branch identity. ─────────────────────
export const BRANCH_EVOLUTION: Record<string, BranchEvolution> = {
  // NEEDLE ───────────────────────────────────────────────────────────────────
  needle_swarm: {
    color: BRANCH_COLOR.needle_swarm, growth: 0.06,
    parts: [
      { at: 1, kind: 'halo' },
      { at: 1, kind: 'barbs', count: 4, per: 2 }, // the swarm thickens each tier
      { at: 2, kind: 'limbs', count: 2 }, // twin spinnerets
      { at: 3, kind: 'organs', count: 3 }, // venom sacs
      { at: 4, kind: 'spikes', count: 5 }, // barbed carapace
      { at: 5, kind: 'nova' }, // the thousand maw
    ],
  },
  needle_rail: {
    color: BRANCH_COLOR.needle_rail, growth: 0.05,
    parts: [
      { at: 1, kind: 'halo' },
      { at: 1, kind: 'barrel' }, // the rail, lengthening each tier
      { at: 2, kind: 'armor', count: 3 }, // armor render plating
      { at: 3, kind: 'organs', count: 3 }, // charge coils
      { at: 4, kind: 'limbs', count: 2 }, // bracing struts
      { at: 5, kind: 'nova' }, // annihilator flare
    ],
  },
  // MORTAR ───────────────────────────────────────────────────────────────────
  mortar_siege: {
    color: BRANCH_COLOR.mortar_siege, growth: 0.06,
    parts: [
      { at: 1, kind: 'halo' },
      { at: 1, kind: 'barrels', count: 2, per: 1 }, // the battery grows
      { at: 2, kind: 'armor', count: 4 },
      { at: 3, kind: 'organs', count: 3 }, // ember vents
      { at: 4, kind: 'spikes', count: 4 },
      { at: 5, kind: 'nova' }, // extinction
    ],
  },
  mortar_cauldron: {
    color: BRANCH_COLOR.mortar_cauldron, growth: 0.06,
    parts: [
      { at: 1, kind: 'halo' },
      { at: 1, kind: 'biomass', count: 3, per: 1 }, // bubbling acid sacs
      { at: 2, kind: 'armor', count: 3 }, // pot rim
      { at: 3, kind: 'organs', count: 3 }, // acid glands
      { at: 4, kind: 'limbs', count: 2 },
      { at: 5, kind: 'nova', color: '#9be84a' },
    ],
  },
  // REACTOR ──────────────────────────────────────────────────────────────────
  reactor_heart: {
    color: BRANCH_COLOR.reactor_heart, growth: 0.08,
    parts: [
      { at: 1, kind: 'heart' }, // a beating organ + veins
      { at: 2, kind: 'organs', count: 3 }, // vital nodes
      { at: 3, kind: 'biomass', count: 3, per: 1 }, // engorged sacs
      { at: 4, kind: 'limbs', count: 3 }, // vein-limbs
      { at: 5, kind: 'nova' }, // living-core nova
    ],
  },
  reactor_brood: {
    color: BRANCH_COLOR.reactor_brood, growth: 0.08,
    parts: [
      { at: 1, kind: 'pods', count: 2, per: 1 }, // the brood swells
      { at: 2, kind: 'tendrils', count: 2, per: 1 },
      { at: 3, kind: 'organs', count: 3 },
      { at: 4, kind: 'armor', count: 4 }, // chitin
      { at: 5, kind: 'nova', color: '#9be84a' }, // hive-node corrosive field
    ],
  },
  // PARASITE ─────────────────────────────────────────────────────────────────
  parasite_apex: {
    color: BRANCH_COLOR.parasite_apex, growth: 0.06,
    parts: [
      { at: 1, kind: 'ripples', count: 2, per: 1 }, // contagion waves
      { at: 2, kind: 'biomass', count: 3 }, // spore blisters
      { at: 3, kind: 'organs', count: 3 }, // infection nodes
      { at: 4, kind: 'limbs', count: 2 },
      { at: 5, kind: 'nova' }, // pandemic
    ],
  },
  parasite_ravager: {
    color: BRANCH_COLOR.parasite_ravager, growth: 0.06,
    parts: [
      { at: 1, kind: 'halo' },
      { at: 1, kind: 'fangs', count: 2, per: 1 }, // hungrier each tier
      { at: 2, kind: 'spikes', count: 4 },
      { at: 3, kind: 'armor', count: 4 }, // chitin plates
      { at: 4, kind: 'limbs', count: 2 },
      { at: 5, kind: 'nova' }, // apex predator
    ],
  },
  // OBELISK ──────────────────────────────────────────────────────────────────
  obelisk_tyrant: {
    color: BRANCH_COLOR.obelisk_tyrant, growth: 0.05,
    parts: [
      { at: 1, kind: 'glyphRing' },
      { at: 1, kind: 'crown', count: 5, per: 1 }, // the throne's crown
      { at: 2, kind: 'organs', count: 3 },
      { at: 3, kind: 'armor', count: 4 },
      { at: 4, kind: 'limbs', count: 3 }, // psionic arms
      { at: 5, kind: 'nova' }, // hive tyrant
    ],
  },
  obelisk_mindrender: {
    color: BRANCH_COLOR.obelisk_mindrender, growth: 0.05,
    parts: [
      { at: 1, kind: 'arcs', count: 2, per: 1 }, // more lightning each tier
      { at: 2, kind: 'organs', count: 3 }, // charge nodes
      { at: 3, kind: 'spikes', count: 4 }, // conductive spines
      { at: 4, kind: 'limbs', count: 2 }, // tesla arms
      { at: 5, kind: 'nova' }, // cerebral storm
    ],
  },
  // MAW ──────────────────────────────────────────────────────────────────────
  maw_butcher: {
    color: BRANCH_COLOR.maw_butcher, growth: 0.065, // the hungriest growth in the roster
    parts: [
      { at: 1, kind: 'fangs', count: 4, per: 1 }, // the rows keep serrating
      { at: 2, kind: 'limbs', count: 2 }, // feeder claws
      { at: 3, kind: 'spikes', count: 4 }, // rending fangs
      { at: 4, kind: 'organs', count: 3 }, // the gore engine
      { at: 5, kind: 'nova' }, // the ossuary
    ],
  },
  maw_gullet: {
    color: BRANCH_COLOR.maw_gullet, growth: 0.05,
    parts: [
      { at: 1, kind: 'ripples', count: 1, per: 1 }, // the undertow rings widen
      { at: 2, kind: 'tendrils', count: 3 }, // dragging cilia
      { at: 3, kind: 'fangs', count: 3 }, // swallowing rows
      { at: 4, kind: 'biomass', count: 3 }, // the riptide bladders
      { at: 5, kind: 'nova' }, // the drowning deep
    ],
  },
  // CHRYSALIS ────────────────────────────────────────────────────────────────
  chrysalis_deepfreeze: {
    color: BRANCH_COLOR.chrysalis_deepfreeze, growth: 0.05,
    parts: [
      { at: 1, kind: 'halo' }, // the amber sheen hardens
      { at: 2, kind: 'spikes', count: 4 }, // splinter facets
      { at: 3, kind: 'armor', count: 4 }, // deep-set casing
      { at: 4, kind: 'crown', count: 5 }, // warden of giants
      { at: 5, kind: 'nova' }, // perfect preservation
    ],
  },
  chrysalis_amber: {
    color: BRANCH_COLOR.chrysalis_amber, growth: 0.05,
    parts: [
      { at: 1, kind: 'biomass', count: 2, per: 1 }, // weeping resin sacs
      { at: 2, kind: 'halo' }, // the amber veil
      { at: 3, kind: 'ripples', count: 2 }, // the sap moat
      { at: 4, kind: 'pods', count: 3 }, // golden tombs
      { at: 5, kind: 'nova' }, // the amber grove
    ],
  },
  // EFFIGY ───────────────────────────────────────────────────────────────────
  effigy_choir: {
    color: BRANCH_COLOR.effigy_choir, growth: 0.045, // its power is presence, not mass
    parts: [
      { at: 1, kind: 'glyphRing' }, // sorrow sigils
      { at: 2, kind: 'ripples', count: 2, per: 1 }, // the carrying wail
      { at: 3, kind: 'tendrils', count: 3 }, // mourning shrouds
      { at: 4, kind: 'organs', count: 3 }, // the second voice
      { at: 5, kind: 'nova' }, // requiem
    ],
  },
  effigy_malice: {
    color: BRANCH_COLOR.effigy_malice, growth: 0.05,
    parts: [
      { at: 1, kind: 'spikes', count: 3, per: 1 }, // spiteful barbs
      { at: 2, kind: 'arcs', count: 2 }, // keening discharge
      { at: 3, kind: 'crown', count: 5 }, // the malice crown
      { at: 4, kind: 'organs', count: 3 }, // the doom toll
      { at: 5, kind: 'nova' }, // the black bell
    ],
  },
  // COIL ─────────────────────────────────────────────────────────────────────
  coil_overload: {
    color: BRANCH_COLOR.coil_overload, growth: 0.055,
    parts: [
      { at: 1, kind: 'glyphRing' }, // a focusing lens
      { at: 1, kind: 'barrel' }, // the emitter spire, lengthening each tier
      { at: 2, kind: 'organs', count: 3 }, // charge coils
      { at: 3, kind: 'spikes', count: 4 }, // heat vents
      { at: 4, kind: 'armor', count: 4 }, // reinforced housing
      { at: 5, kind: 'nova' }, // annihilation flare
    ],
  },
  coil_prism: {
    color: BRANCH_COLOR.coil_prism, growth: 0.05,
    parts: [
      { at: 1, kind: 'glyphRing' }, // a prism ring
      { at: 1, kind: 'organs', count: 2, per: 1 }, // refraction nodes multiply each tier
      { at: 2, kind: 'ripples', count: 2 }, // dispersion waves
      { at: 3, kind: 'limbs', count: 3 }, // prism arms
      { at: 4, kind: 'biomass', count: 3 }, // caustic sacs
      { at: 5, kind: 'nova', color: '#6fe0c0' }, // prismatic cascade
    ],
  },
};

/** Body-silhouette scale for a branched tower (the "growth" example) — a T5 tower is visibly
 *  larger than a fresh one. Identity (1) when unbranched; a small default for an un-specced
 *  (future) branch so it still grows. */
export function evolutionGrowth(branchId: string | null, tier: number): number {
  if (!branchId || tier <= 0) return 1;
  const evo = BRANCH_EVOLUTION[branchId];
  return 1 + (evo ? evo.growth : 0.05) * tier;
}

/** Body scale that ANIMATES the swell from the previous tier to the new one over MUTATION_GROW_TIME
 *  after a purchase, so the tower visibly grows when it mutates. `sinceMutation` = now - mutatedAt
 *  (large for a long-settled or never-mutated tower ⇒ returns the full size). */
export function evolutionGrowthAnimated(branchId: string | null, tier: number, sinceMutation: number): number {
  const full = evolutionGrowth(branchId, tier);
  if (sinceMutation >= MUTATION_GROW_TIME || sinceMutation < 0) return full;
  const prev = evolutionGrowth(branchId, tier - 1);
  return prev + (full - prev) * easeOutCubic(sinceMutation / MUTATION_GROW_TIME);
}

/** A projectile/ skin's signature color (used by the renderer's skinned-projectile drawer). */
export function branchSkinColor(skin: string | undefined): string {
  return (skin && BRANCH_COLOR[skin]) || '#ffffff';
}

/** Draw a branch's evolved organs for a Tower Lab / Codex PORTRAIT (no live tower) — a thin wrapper
 *  over `drawTowerEvolution` with a synthetic, settled tower, so the encyclopedia can preview any
 *  branch+tier WITHOUT owning it (docs/TOWER-CODEX.md §3). `mutatedAt` is in the past ⇒ fully grown. */
export function drawBranchPortrait(
  ctx: CanvasRenderingContext2D, branchId: string, tier: number, x: number, y: number, r: number, now: number,
): void {
  const tw: Tower = {
    id: 0, kind: 'needle', x, y, slot: 0, cooldown: 0, overcharged: false, bornAt: -100,
    disabledUntil: 0, dampenedUntil: 0, dampenFrac: 0, branchId, tier, strain: 1, strainCd: 0, pulseCd: 0, mutatedAt: -100, movedAt: -100, beamTarget: -1, beamHeat: 0,
  };
  drawTowerEvolution(ctx, tw, now, r, BRANCH_EVOLUTION[branchId]?.color ?? '#ffffff', 0);
}

// ── The composer ─────────────────────────────────────────────────────────────────────────────
// A single reused arg object (no per-part allocation in the hot draw loop). Drawers read it.
// Exported so a SECOND consumer (star evolution, starEvolution.ts) can drive the same organ
// drawers without re-deriving the vocabulary — the shared "framework" surface.
export interface PartCtx {
  ctx: CanvasRenderingContext2D;
  x: number; y: number; id: number; r: number; now: number;
  tier: number; above: number; color: string; fired: number; part: EvoPart;
}

/** Compose a branched tower's evolved silhouette: every organ introduced at or below its tier,
 *  drawn over the (already growth-scaled) body. `fired` is the firing recoil [0..1] (attack
 *  animation). Unknown/future branches fall back to a generic evolving look. */
export function drawTowerEvolution(
  ctx: CanvasRenderingContext2D, tw: Tower, now: number, r: number, fallbackColor: string, fired: number,
): void {
  const evo = tw.branchId ? BRANCH_EVOLUTION[tw.branchId] : undefined;
  if (!evo) { drawGenericEvolution(ctx, tw, now, r, fallbackColor); return; }
  // Grow-in: the organ introduced at the CURRENT tier materializes over MUTATION_GROW_TIME after a
  // purchase (older organs render full). `since` is large for a settled tower ⇒ growIn = 1.
  const since = now - tw.mutatedAt;
  const growIn = since >= MUTATION_GROW_TIME || since < 0 ? 1 : easeOutCubic(since / MUTATION_GROW_TIME);
  const pc: PartCtx = { ctx, x: tw.x, y: tw.y, id: tw.id, r, now, tier: tw.tier, above: 0, color: evo.color, fired, part: evo.parts[0] };
  for (const part of evo.parts) {
    if (part.at > tw.tier) continue;
    pc.part = part;
    pc.above = tw.tier - part.at;
    pc.color = part.color ?? evo.color;
    const fresh = pc.above === 0 && growIn < 1; // the just-grown organ fades + scales in
    if (fresh) { ctx.save(); ctx.globalAlpha = growIn; }
    PART_DRAWERS[part.kind](pc);
    if (fresh) ctx.restore();
  }
}

/** Future-proof fallback: a branch with no authored organs still evolves (glow + ring + spikes
 *  + capstone aura, scaling with tier) so it reads as "upgraded" without bespoke art. */
function drawGenericEvolution(ctx: CanvasRenderingContext2D, tw: Tower, now: number, r: number, color: string): void {
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

const n = (p: PartCtx, dflt: number): number => (p.part.count ?? dflt) + p.above * (p.part.per ?? 0);

// ── Organ drawers — one per EvoPartKind. Small, pure, parameterized by the branch color. ──────
// Exported as the shared organ vocabulary: both branch (BRANCH_EVOLUTION) and star
// (STAR_EVOLUTION) evolution compose these, so a new organ benefits both with no draw-code fork.
export const PART_DRAWERS: Record<EvoPartKind, (p: PartCtx) => void> = {
  halo: ({ ctx, x, y, r, tier, color }) => {
    glowDisc(ctx, x, y, r * (1.4 + tier * 0.1), rgba(hexRgb(color), 0.08 + tier * 0.02));
  },

  barbs: (p) => {
    const { ctx, x, y, r, now, color } = p;
    const count = n(p, 4);
    const orbit = r * (1.5 + p.tier * 0.06);
    const col = rgba(hexRgb(color), 0.85);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const ang = now * 2.2 + (i * Math.PI * 2) / count;
      const bx = x + Math.cos(ang) * orbit;
      const by = y + Math.sin(ang) * orbit;
      ctx.beginPath();
      ctx.moveTo(bx - Math.sin(ang) * 2.6, by + Math.cos(ang) * 2.6);
      ctx.lineTo(bx + Math.sin(ang) * 2.6, by - Math.cos(ang) * 2.6);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    if (p.tier >= 5) for (let i = 0; i < 10; i++) { // capstone counter-shell
      const ang = -now * 3.1 + (i * Math.PI * 2) / 10;
      drawShape(ctx, 'diamond', x + Math.cos(ang) * orbit * 1.35, y + Math.sin(ang) * orbit * 1.35, 1.8, color);
    }
  },

  barrel: (p) => {
    const { ctx, x, y, r, now, id, tier, fired, color } = p;
    const c = hexRgb(color);
    const len = r * (1.4 + tier * 0.4);
    const tipY = y - len;
    ctx.strokeStyle = rgba(c, 0.85);
    ctx.lineWidth = 2 + tier * 0.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, tipY);
    ctx.stroke();
    ctx.lineCap = 'butt';
    const coils = Math.min(tier, 4);
    for (let i = 1; i <= coils; i++) ring(ctx, x, (y - (len * i) / (coils + 1)), 3 + tier * 0.3, rgba(c, 0.5), 1.2);
    const charge = pulse(now + id, tier >= 3 ? 1.2 : 2.4, 0.6, 1.3) + fired; // brightens on the firing beat
    glowDisc(ctx, x, tipY, (2.5 + tier * 0.7) * charge, rgba(c, 0.7));
  },

  barrels: (p) => {
    const { ctx, x, y, r, now, id, fired, color } = p;
    const tubes = n(p, 2);
    const c = hexRgb(color);
    const spread = 0.6;
    for (let i = 0; i < tubes; i++) {
      const frac = tubes === 1 ? 0.5 : i / (tubes - 1);
      const ang = -Math.PI / 2 + (frac - 0.5) * spread * 2;
      const bx = x + Math.cos(ang) * r * 0.5;
      const by = y + Math.sin(ang) * r * 0.5;
      const mx = x + Math.cos(ang) * (r * 0.5 + r * 1.2);
      const my = y + Math.sin(ang) * (r * 0.5 + r * 1.2);
      ctx.strokeStyle = 'rgba(40,30,24,0.85)';
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(mx, my);
      ctx.stroke();
      glowDisc(ctx, mx, my, 2.4 * (pulse(now + id + i, 3, 0.7, 1.3) + fired), rgba(c, 0.85));
    }
    ctx.lineCap = 'butt';
  },

  armor: (p) => {
    const { ctx, x, y, r, now, color } = p;
    const plates = n(p, 4);
    const c = hexRgb(color);
    ctx.strokeStyle = rgba(c, 0.6);
    ctx.lineWidth = r * 0.34;
    ctx.lineCap = 'butt';
    const seg = (Math.PI * 2 / plates) * 0.62; // gapped carapace plating
    for (let i = 0; i < plates; i++) {
      const a0 = (i * Math.PI * 2) / plates + now * 0.05;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.05, a0 - seg / 2, a0 + seg / 2);
      ctx.stroke();
    }
  },

  biomass: (p) => {
    const { ctx, x, y, r, now, id, color } = p;
    const sacs = n(p, 3);
    const c = hexRgb(color);
    for (let i = 0; i < sacs; i++) {
      const ang = (i * Math.PI * 2) / sacs + now * 0.3;
      const orbit = r * (0.8 + (i % 2) * 0.32);
      const throb = pulse(now + id + i, 2.2, 0.78, 1.24);
      const px = x + Math.cos(ang) * orbit;
      const py = y + Math.sin(ang) * orbit;
      drawShape(ctx, 'circle', px, py, r * 0.32 * throb, rgba(c, 0.5));
      drawShape(ctx, 'circle', px - r * 0.08, py - r * 0.08, r * 0.12 * throb, 'rgba(255,255,255,0.55)');
    }
  },

  organs: (p) => {
    const { ctx, x, y, r, now, id, color } = p;
    const nodes = n(p, 3);
    const c = hexRgb(color);
    for (let i = 0; i < nodes; i++) {
      const ang = now * 0.6 + (i * Math.PI * 2) / nodes;
      const orbit = r * 1.15;
      const pul = pulse(now + id + i * 0.7, 2.6, 0.55, 1.05);
      const px = x + Math.cos(ang) * orbit;
      const py = y + Math.sin(ang) * orbit;
      glowDisc(ctx, px, py, r * 0.32 * pul, rgba(c, 0.55));
      drawShape(ctx, 'circle', px, py, r * 0.16, rgba(c, 0.95));
    }
  },

  spikes: (p) => {
    const { ctx, x, y, r, now, color } = p;
    const spikes = n(p, 4);
    ctx.fillStyle = rgba(hexRgb(color), 0.85);
    for (let i = 0; i < spikes; i++) {
      const a = (i * Math.PI * 2) / spikes + now * 0.12;
      const w = 0.13;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a - w) * r * 0.85, y + Math.sin(a - w) * r * 0.85);
      ctx.lineTo(x + Math.cos(a) * r * 1.55, y + Math.sin(a) * r * 1.55);
      ctx.lineTo(x + Math.cos(a + w) * r * 0.85, y + Math.sin(a + w) * r * 0.85);
      ctx.closePath();
      ctx.fill();
    }
  },

  limbs: (p) => {
    const { ctx, x, y, r, now, color } = p;
    const limbs = n(p, 2);
    const c = hexRgb(color);
    ctx.strokeStyle = rgba(c, 0.7);
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    for (let i = 0; i < limbs; i++) {
      const base = (i * Math.PI * 2) / limbs + (limbs % 2 ? 0 : Math.PI / limbs);
      const flex = Math.sin(now * 2 + i) * 0.18;
      const jx = x + Math.cos(base) * r * 1.15;
      const jy = y + Math.sin(base) * r * 1.15;
      const fx = x + Math.cos(base + flex) * r * 1.85;
      const fy = y + Math.sin(base + flex) * r * 1.85;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(base) * r * 0.5, y + Math.sin(base) * r * 0.5);
      ctx.lineTo(jx, jy);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      drawShape(ctx, 'circle', jx, jy, 1.6, rgba(c, 0.85));
    }
    ctx.lineCap = 'butt';
  },

  tendrils: (p) => {
    const { ctx, x, y, r, now, color } = p;
    const tendrils = n(p, 2);
    ctx.strokeStyle = rgba(hexRgb(color), 0.5);
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (let i = 0; i < tendrils; i++) {
      const base = (i * Math.PI * 2) / tendrils;
      const whip = Math.sin(now * 2.5 + i * 1.3) * 0.5;
      const reach = r * (1.6 + p.tier * 0.12);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(base) * reach * 0.5, y + Math.sin(base) * reach * 0.5 - 4,
        x + Math.cos(base + whip) * reach, y + Math.sin(base + whip) * reach);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  },

  fangs: (p) => {
    const { ctx, x, y, r, now, color } = p;
    const pairs = n(p, 2);
    const snap = (Math.sin(now * 4) * 0.5 + 0.5) * 0.5;
    ctx.strokeStyle = rgba(hexRgb(color), 0.9);
    ctx.lineWidth = 2 + p.tier * 0.2;
    ctx.lineCap = 'round';
    for (let q = 0; q < pairs; q++) {
      const axis = (q * Math.PI) / pairs + now * 0.3;
      for (const side of [-1, 1]) {
        const a = axis + side * (0.25 + snap);
        const reach = r * (1.5 + p.tier * 0.12);
        const cx = x + Math.cos(axis) * reach * 0.7 - side * Math.sin(axis) * reach * 0.3;
        const cy = y + Math.sin(axis) * reach * 0.7 + side * Math.cos(axis) * reach * 0.3;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(axis) * r * 0.3, y + Math.sin(axis) * r * 0.3);
        ctx.quadraticCurveTo(cx, cy, x + Math.cos(a) * reach, y + Math.sin(a) * reach);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
  },

  crown: (p) => {
    const { ctx, x, y, r, now, tier, color } = p;
    spikeCrown(ctx, x, y, r * 0.9, r * (0.4 + tier * 0.1), n(p, 5), rgba(hexRgb(color), 0.8), now * 0.4);
  },

  glyphRing: (p) => {
    const { ctx, x, y, r, now, tier, color } = p;
    const ringR = r * (1.8 + tier * 0.18);
    ctx.save();
    ctx.strokeStyle = rgba(hexRgb(color), 0.5);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 7]);
    ctx.lineDashOffset = -((now * 16) % 13);
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
  },

  arcs: (p) => {
    const { ctx, x, y, r, now, fired, color } = p;
    const arcs = n(p, 2);
    const reach = r * (1.6 + p.tier * 0.18);
    ctx.strokeStyle = rgba(hexRgb(color), 0.85 + fired * 0.15);
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    const flick = Math.floor(now * 18);
    for (let i = 0; i < arcs; i++) {
      const ang = (i * Math.PI * 2) / arcs + Math.sin(flick * 0.7 + i) * 0.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      let px = x;
      let py = y;
      const segs = 3 + (p.tier >= 4 ? 1 : 0);
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const jit = (((flick * 13 + i * 7 + s * 31) % 17) / 17 - 0.5) * r * 0.7;
        px = x + Math.cos(ang) * reach * t - Math.sin(ang) * jit;
        py = y + Math.sin(ang) * reach * t + Math.cos(ang) * jit;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      drawShape(ctx, 'circle', px, py, 1.4, rgba(hexRgb(color), 0.9));
    }
    ctx.lineCap = 'butt';
  },

  pods: (p) => {
    const { ctx, x, y, r, now, color } = p;
    const pods = n(p, 2);
    const c = hexRgb(color);
    for (let i = 0; i < pods; i++) {
      const ang = now * 0.4 + (i * Math.PI * 2) / pods;
      const orbit = r * (0.9 + (i % 2) * 0.3);
      const px = x + Math.cos(ang) * orbit + Math.sin(now * 6 + i) * 0.8;
      const py = y + Math.sin(ang) * orbit;
      drawShape(ctx, 'circle', px, py, r * 0.24 + p.tier * 0.2, rgba(c, 0.8));
      drawShape(ctx, 'circle', px - 0.8, py - 0.8, 1.1, 'rgba(235,225,255,0.7)');
    }
  },

  ripples: (p) => {
    const { ctx, x, y, r, now, color } = p;
    const rings = n(p, 2);
    const c = hexRgb(color);
    const speed = 0.5 + p.tier * 0.1;
    for (let i = 0; i < rings; i++) {
      const ph = (now * speed + i / rings) % 1;
      ring(ctx, x, y, r * (1.1 + ph * (1.4 + p.tier * 0.15)), rgba(c, (1 - ph) * 0.5), 1.4);
    }
  },

  heart: (p) => {
    const { ctx, x, y, r, now, id, tier, color } = p;
    const c = hexRgb(color);
    const beat = heartbeat(now, id);
    const swell = 1 + beat * (0.16 + tier * 0.03);
    glowDisc(ctx, x, y, r * (1.5 + tier * 0.12) * swell, rgba(c, 0.12 + beat * 0.12));
    const veins = 3 + tier;
    ctx.strokeStyle = rgba(c, 0.4 + beat * 0.3);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < veins; i++) {
      const ang = (i * Math.PI * 2) / veins + Math.sin(now * 0.5 + i) * 0.1;
      const reach = r * (1.3 + tier * 0.1) * swell;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(ang) * r * 0.4, y + Math.sin(ang) * r * 0.4);
      ctx.lineTo(x + Math.cos(ang) * reach, y + Math.sin(ang) * reach);
      ctx.stroke();
    }
    drawShape(ctx, 'circle', x, y, r * 0.62 * swell, rgba(c, 0.55));
    drawShape(ctx, 'circle', x - r * 0.12, y - r * 0.12, r * 0.22 * swell, 'rgba(255,220,230,0.7)');
  },

  nova: (p) => {
    const { ctx, x, y, r, now, id, color } = p;
    const c = hexRgb(color);
    const pul = pulse(now + id, 2.5, 0, 1);
    glowDisc(ctx, x, y, r * 1.9, rgba(c, 0.07));
    ring(ctx, x, y, r * (2 + pul * 0.8), rgba(c, (1 - pul) * 0.45 + 0.12), 1.6);
  },
};

/** A double-thump heartbeat envelope in [0,1] (a "lub-dub" near the start of each period). */
function heartbeat(now: number, id: number, period = 0.95): number {
  const ph = ((now + id) % period) / period;
  const lub = Math.exp(-Math.pow(ph / 0.06, 2));
  const dub = Math.exp(-Math.pow((ph - 0.17) / 0.07, 2)) * 0.7;
  return Math.min(1, lub + dub);
}
