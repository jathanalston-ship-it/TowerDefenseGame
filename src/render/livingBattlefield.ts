// LIVING BATTLEFIELD (docs/LIVING-BATTLEFIELD.md) — the arena visibly ASSIMILATES as a run deepens.
// A hidden "battlefield biomass" value accumulates from EVERYTHING the player builds (tower count /
// power / stars / strain / branches / mastery, mulligans, heroes + gear, gene power, kills, boss +
// mega kills, wave, biome) and maps to an evolution STAGE 0..5: clean natural terrain → an
// unmistakably ALIVE biomechanical ecosystem (breathing ground, arteries, bone, blinking eyes,
// crawling parasites). It is VISUAL STORYTELLING, never power creep:
//
//   • Render-only + DERIVED — never read by the sim, so the golden run is byte-identical (this is the
//     same contract as render/gore.ts and render/equipmentArt.ts). Inert at Stage 0 ⇒ early runs are
//     the original clean arena.
//   • DATA-DRIVEN influence profiles — each tower / mulligan axis / hero / gene archetype declares HOW
//     it mutates the ground (a motif + hue). Unknown/future content resolves to a stable hash-derived
//     profile, so NO gameplay code changes when new content is added (CLAUDE.md "generalize").
//   • REGIONAL — mutation blooms outward from towers, the nucleus, mega bodies and heavy-combat zones,
//     each in its own motif. Pooled + LOD + a cached membrane texture keep it cheap at swarm scale.

import type { RenderState } from '../core/game';
import { CELL, HEIGHT, WIDTH, nucleusPoint } from '../core/map';
import { ENEMY_DEFS } from '../core/config';
import { tierAt, tierColorAt } from '../core/assimilation';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

// ── Tunables (the whole balance of the effect lives here) ────────────────────────────────────────
const STAGE_THRESHOLDS = [0, 10, 24, 46, 80, 130] as const; // hidden biomass value → stage boundaries
export const STAGE_COUNT = 6; // stages 0..5
export const STAGE_NAMES = ['Dormant', 'Seeded', 'Spreading', 'Infested', 'Assimilated', 'Living'] as const;
const SCAR_CAP = 48; // pooled ground scars (perf ceiling)

// ── Local colour helpers (self-contained — the palette is a handful of hues, gore.ts does the same) ─
type Col = [number, number, number];
const hexCache = new Map<string, Col>();
function hex(h: string): Col {
  const hit = hexCache.get(h);
  if (hit) return hit;
  const s = h.replace('#', '');
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const n = parseInt(full, 16);
  const c: Col = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  hexCache.set(h, c);
  return c;
}
// Memoized like theme.rgba (perf — docs/RENDER-PIPELINE.md §6): packed rgb → alpha at 1/1000 → string,
// so the per-frame root / scar / bead alphas stop formatting a fresh colour string per draw.
const cssCache = new Map<number, Map<number, string>>();
let cssCached = 0;
function css(c: Col, a = 1): string {
  const r = c[0] | 0, g = c[1] | 0, b = c[2] | 0;
  const q = Math.round(a * 1000);
  if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) return `rgba(${r},${g},${b},${q / 1000})`;
  const key = (r << 16) | (g << 8) | b;
  let byA = cssCache.get(key);
  if (!byA) { byA = new Map(); cssCache.set(key, byA); }
  let s = byA.get(q);
  if (s === undefined) {
    if (++cssCached > 50_000) { cssCache.clear(); cssCached = 0; }
    s = `rgba(${r},${g},${b},${q / 1000})`;
    byA.set(q, s);
  }
  return s;
}
function mix(a: Col, b: Col, t: number): Col { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function shade(c: Col, f: number): Col {
  return f >= 0 ? [c[0] + (255 - c[0]) * f, c[1] + (255 - c[1]) * f, c[2] + (255 - c[2]) * f]
    : [c[0] * (1 + f), c[1] * (1 + f), c[2] * (1 + f)];
}
/** Cheap deterministic 0..1 hash — all ambient/organic detail keys off this (render NEVER touches rng). */
function hash01(n: number): number { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function fnv(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ══ Environmental Influence Profiles (the data-driven registry) ══════════════════════════════════
// A profile is WHAT a contributor grows on the ground. Content maps to a MOTIF; a motif carries a hue.
// Curated rows below tune specific content; anything missing resolves to a stable hash motif, so a new
// tower / hero / mulligan / gene needs ZERO code here — it simply grows a coherent look for free.
export type Motif = 'vein' | 'flesh' | 'bone' | 'crystal' | 'spore' | 'root' | 'chitin' | 'ember';
const MOTIFS: Motif[] = ['vein', 'flesh', 'bone', 'crystal', 'spore', 'root', 'chitin', 'ember'];
const MOTIF_HUE: Record<Motif, string> = {
  vein: '#b23a54', flesh: '#8a3346', bone: '#d8cdb4', crystal: '#6fd0ff',
  spore: '#9be04a', root: '#7a5a3a', chitin: '#5a4a6a', ember: '#ff7a3a',
};
export interface InfluenceProfile { motif: Motif; hue: string }

const TOWER_MOTIF: Record<string, Motif> = { // the 15 authored tower kinds (docs/TOWERS.md); anything else hash-defaults
  needle: 'bone', mortar: 'ember', reactor: 'crystal', parasite: 'flesh', obelisk: 'crystal',
  maw: 'flesh', chrysalis: 'spore', effigy: 'root', coil: 'crystal', siphon: 'vein',
  sower: 'spore', spire: 'bone', polyp: 'vein', spitfang: 'chitin', rift: 'crystal',
};
const MULLIGAN_MOTIF: Record<string, Motif> = { offensive: 'ember', utility: 'crystal', biological: 'flesh' };
const HERO_MOTIF: Record<string, Motif> = {
  ravager: 'ember', shepherd: 'flesh', overseer: 'crystal', vitriol: 'spore', revenant: 'chitin', knell: 'bone',
};
const GENE_MOTIF: Record<string, Motif> = { damage: 'ember', control: 'crystal', economy: 'spore', defense: 'bone', biomass: 'vein' };

function motifDefault(id: string): Motif { return MOTIFS[fnv(id) % MOTIFS.length]; }
function profile(motif: Motif): InfluenceProfile { return { motif, hue: MOTIF_HUE[motif] }; }
/** The four public lookups — each falls back to a hash motif, so unknown/future content just works. */
export function profileForTower(kind: string): InfluenceProfile { return profile(TOWER_MOTIF[kind] ?? motifDefault('t:' + kind)); }
export function profileForMulligan(axis: string): InfluenceProfile { return profile(MULLIGAN_MOTIF[axis] ?? motifDefault('m:' + axis)); }
export function profileForHero(kind: string): InfluenceProfile { return profile(HERO_MOTIF[kind] ?? motifDefault('h:' + kind)); }
export function profileForGene(archetype: string): InfluenceProfile { return profile(GENE_MOTIF[archetype] ?? motifDefault('g:' + archetype)); }

const CORE_HUE = '#c0304e'; // the nucleus organ's crimson

// ══ Assimilation accumulator (the hidden battlefield biomass → stage) ════════════════════════════
export interface Region { x: number; y: number; strength: number; motif: Motif; hue: string; kind: 'tower' | 'core' | 'combat' | 'mega'; seed: number }
export interface Assimilation {
  value: number; // raw hidden biomass
  stage: number; // 0..5
  progress: number; // 0..1 within the current stage
  intensity: number; // 0..1 overall (stage + progress) — the master alpha for the whole effect
  regions: Region[]; // regional evolution hotspots (towers / nucleus / combat / mega)
  dominant: Motif; // the build's overall character
  dominantHue: string;
  tierColor: [number, number, number]; // the Assimilation Index tier accent — unifies terrain art-direction with the mood FX/HUD
}
/** Presence/tier maps the drawer already holds — kept loose so this module stays decoupled. */
export interface LBContext {
  power: number;
  mulligans: Partial<Record<string, unknown>>; // kind → active organism (presence only)
  heroGear: Partial<Record<string, unknown>>; // kind → gear spec (presence only)
  cosmeticTiers: Partial<Record<string, number>>; // kind → mastery rank
  starTiers: Partial<Record<string, number>>; // kind → permanent stars
}

let stageOverride: number | null = null; // dev tool: force a stage for preview (null = auto from biomass)
export function setStageOverride(n: number | null): void { stageOverride = n; }
export function getStageOverride(): number | null { return stageOverride; }
let enabled = true; // dev tool: master toggle for the whole visual layer (still computes for the readout)
export function setLivingBattlefieldEnabled(on: boolean): void { enabled = on; }
export function isLivingBattlefieldEnabled(): boolean { return enabled; }

function stageFor(value: number): { stage: number; progress: number } {
  let stage = 0;
  for (let i = 1; i < STAGE_THRESHOLDS.length; i++) if (value >= STAGE_THRESHOLDS[i]) stage = i;
  const lo = STAGE_THRESHOLDS[stage];
  const hi = STAGE_THRESHOLDS[Math.min(STAGE_THRESHOLDS.length - 1, stage + 1)];
  const progress = hi > lo ? Math.min(1, (value - lo) / (hi - lo)) : 1;
  return { stage, progress };
}

/** Fold one tower's build depth into biomass weight (count + strain + branch tier + stars + mastery + graft). */
function towerWeight(kind: string, strain: number, branchTier: number, ctx: LBContext): number {
  const stars = ctx.starTiers[kind] ?? 0;
  const mastery = ctx.cosmeticTiers[kind] ?? 0;
  const graft = ctx.mulligans[kind] ? 2 : 0;
  return 1 + Math.max(0, strain - 1) * 0.8 + branchTier * 0.5 + stars * 0.6 + mastery * 0.5 + graft;
}

/** Pure: fold the whole run into a hidden biomass value, a stage, and the regional hotspots. When the
 *  canonical Assimilation Index (docs/ASSIMILATION.md) is supplied (`masterIndex`, the live game's eased
 *  0..1 master state), the STAGE is taken from its tier ⇒ ONE source of truth drives terrain + the mood
 *  FX + HUD together. Absent (tests / spectate), the module's own biomass accumulator is the fallback.
 *  The regional hotspots (towers/nucleus/combat/mega) are always computed here — the scalar index can't
 *  carry per-tower placement. */
export function computeAssimilation(rs: RenderState, ctx: LBContext, masterIndex?: number): Assimilation {
  const regions: Region[] = [];
  const motifWeight = new Map<Motif, number>();
  let value = 0;

  for (const tw of rs.towers) {
    const w = towerWeight(tw.kind, tw.strain, tw.branchId ? tw.tier : 0, ctx);
    value += w;
    const p = ctx.mulligans[tw.kind] ? profileForMulligan('biological') : profileForTower(tw.kind); // a graft recolours its host's ground
    const pt = profileForTower(tw.kind);
    regions.push({ x: tw.x, y: tw.y, strength: w, motif: pt.motif, hue: p.hue, kind: 'tower', seed: tw.id * 2654435761 >>> 0 });
    motifWeight.set(pt.motif, (motifWeight.get(pt.motif) ?? 0) + w);
  }
  for (const h of rs.heroes) {
    const geared = ctx.heroGear[h.kind] ? 2 : 0;
    value += 1 + geared;
    const hp = profileForHero(h.kind);
    motifWeight.set(hp.motif, (motifWeight.get(hp.motif) ?? 0) + 1 + geared);
  }

  const a = rs.assimilation;
  value += a.kills * 0.02 + a.bossKills * 4 + a.megaKills * 12 + a.wave * 0.7;
  value += Math.log2(1 + Math.max(0, ctx.power)) * 1.2; // power score, log-scaled so it never dominates
  if (rs.biome.id !== 'neutral') value *= 1.08; // an active biome accelerates assimilation slightly

  // Stage: the dev override wins; else the canonical Assimilation Index tier (one source of truth);
  // else the module's own biomass thresholds (standalone fallback).
  let stage: number, progress: number, intensity: number;
  if (stageOverride != null) {
    stage = stageOverride; progress = 1; intensity = Math.min(1, (stage + 1) / STAGE_COUNT);
  } else if (masterIndex != null) {
    const r = tierAt(masterIndex); stage = r.tier.index; progress = r.progress; intensity = Math.min(1, Math.max(0, masterIndex));
  } else {
    const r = stageFor(value); stage = r.stage; progress = r.progress; intensity = Math.min(1, (stage + progress) / STAGE_COUNT);
  }

  // The nucleus is the strongest anchor once the field wakes — it grows into the run's central organ.
  regions.push({ x: nucleusPoint.x, y: nucleusPoint.y, strength: 4 + value * 0.2, motif: 'vein', hue: CORE_HUE, kind: 'core', seed: 0x9e3779b1 });
  // Heavy-combat zone: where the line is pressed hardest right now (the danger camera's focus).
  if (rs.emergency && rs.emergencyRamp > 0.05) {
    regions.push({ x: rs.emergencyFocusX, y: rs.emergencyFocusY, strength: 3 + rs.emergencyRamp * 6, motif: 'ember', hue: '#ff5d3a', kind: 'combat', seed: 0x1b873593 });
  }
  // A mega body anchors a battlefield-scale bloom across the top band.
  if (rs.megaBoss) regions.push({ x: WIDTH / 2, y: rs.megaBoss.anchorY + 30, strength: 10, motif: 'chitin', hue: rs.megaBoss.palette.accent, kind: 'mega', seed: 0xcc9e2d51 });

  let dominant: Motif = 'flesh';
  let best = -1;
  for (const [m, w] of motifWeight) if (w > best) { best = w; dominant = m; }
  // The tier accent (shared with the mood FX/HUD): exact on the live index path, approximated on the
  // fallback so the terrain still reads a coherent colour without the eased master state.
  const idx01 = stageOverride != null ? stage / (STAGE_COUNT - 1) : masterIndex != null ? masterIndex : intensity;
  const tc = tierColorAt(idx01);
  return { value, stage, progress, intensity, regions, dominant, dominantHue: MOTIF_HUE[dominant], tierColor: [tc[0], tc[1], tc[2]] };
}

let lastAssim: Assimilation | null = null;
/** The most recent computed state — for the dev overlay + GameView's subtle stage-up audio cue. */
export function getAssimilationDebug(): Assimilation | null { return lastAssim; }

// ══ Stateful ground scars + run reset (gore.ts pattern: self-heals, pooled, capped) ══════════════
interface Scar { x: number; y: number; r: number; hue: Col; life: number; max: number; perm: boolean; seed: number }
const scars: Scar[] = [];
const bossSeen = new Map<number, { x: number; y: number; hue: Col }>();
let megaWasPresent = false;
let lastScarSeq = -1;
let lastTime = 0;

export function resetLivingBattlefield(): void {
  scars.length = 0; bossSeen.clear(); megaWasPresent = false; lastScarSeq = -1; lastTime = 0; lastAssim = null;
  clearTerraform();
}

/** Update the scar pool from this frame: fading combat scars (a fraction of kills), and PERMANENT scars
 *  where a boss or the mega organism fell. Self-resets when sim time rewinds (a new run). */
function ingestScars(rs: RenderState, stage: number, dt: number): void {
  // Combat scars — only once the field has woken (stage ≥ 1), and only a hash-gated fraction of kills so
  // heavy zones darken without a scar per trash mob.
  if (stage >= 1) {
    for (const ev of rs.deathEvents) {
      if (ev.seq <= lastScarSeq) continue;
      const big = ev.bounty >= 18;
      if (!big && hash01(ev.seq * 12.9898) > 0.22) continue;
      pushScar({ x: ev.x, y: ev.y, r: big ? 16 : 9, hue: hex(ev.color), life: big ? 16 : 9, max: big ? 16 : 9, perm: false, seed: ev.seq });
    }
  }
  if (rs.deathEvents.length) lastScarSeq = rs.deathEvents[rs.deathEvents.length - 1].seq;

  // Permanent boss scars — track boss enemies by id; a boss present last frame but gone this frame FELL
  // (or breached) here and leaves a lasting mark. Zero sim change (render-side id tracking).
  const alive = new Set<number>();
  for (const e of rs.enemies) {
    if (!e.boss) continue;
    alive.add(e.id);
    bossSeen.set(e.id, { x: e.x, y: e.y, hue: hex(ENEMY_DEFS[e.kind]?.color ?? '#b23a54') });
  }
  for (const [id, at] of bossSeen) {
    if (alive.has(id)) continue;
    if (stage >= 1) pushScar({ x: at.x, y: at.y, r: 30, hue: at.hue, life: Infinity, max: 30, perm: true, seed: id });
    bossSeen.delete(id);
  }
  // Mega organism scar — a permanent battlefield-scale mark when the mega falls.
  if (rs.megaBoss) megaWasPresent = true;
  else if (megaWasPresent) {
    megaWasPresent = false;
    if (stage >= 1) pushScar({ x: WIDTH / 2, y: 90, r: 120, hue: hex('#5a2a3a'), life: Infinity, max: 120, perm: true, seed: 777 });
  }

  for (const s of scars) if (!s.perm) s.life -= dt;
  for (let i = scars.length - 1; i >= 0; i--) if (scars[i].life <= 0) scars.splice(i, 1);
}
function pushScar(s: Scar): void {
  if (scars.length >= SCAR_CAP) { // evict the oldest non-permanent scar
    let idx = -1; for (let i = 0; i < scars.length; i++) if (!scars[i].perm) { idx = i; break; }
    if (idx < 0) return; scars.splice(idx, 1);
  }
  scars.push(s);
}

/** Resolve a biome accent to a colour for adaptation. Handles `#hex` and `var(--x)` (via the DOM, cached). */
const accentCache = new Map<string, Col | null>();
export function resolveAccent(accent: string): Col | null {
  if (accentCache.has(accent)) return accentCache.get(accent)!;
  let out: Col | null = null;
  if (accent.startsWith('#')) out = hex(accent);
  else {
    const m = /var\((--[\w-]+)\)/.exec(accent);
    if (m && typeof document !== 'undefined') {
      const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
      if (v.startsWith('#')) out = hex(v);
    }
  }
  accentCache.set(accent, out);
  return out;
}
function motifIdx(m: Motif): number { return MOTIFS.indexOf(m); }

// ══ TERRAFORM SPEC (pure derive — house derive*/draw* pattern, like equipmentArt/mulliganOrganism) ═
// Everything with a POSITION is derived once into a spec: the branching vein network, terrain eye
// sites, biome flora, and the spread parameters. The bake paints from it; the live accents (beads,
// crawlers, pupils) read the SAME spec, so animation always matches the baked geometry.
export interface VeinSeg { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number; w: number; hue: string; seed: number }
export interface EyeSite { x: number; y: number; r: number; seed: number }
interface Flora { x: number; y: number; size: number; motif: Motif; seed: number }
export interface TerraformSpec {
  veins: VeinSeg[]; // greedy nearest-connected TREE (nucleus → build), so the network branches organically
  eyes: EyeSite[]; // terrain eyes (stage ≥ 4) — sockets baked, pupils live
  flora: Flora[]; // biome-flavoured micro-growth scattered through the infected zone
  front: number; // bottom-up frontier (fraction of map height consumed from the hive)
  reach: number; // 0..1 radial spread multiplier — how far mutation radiates from each hotspot
}

/** Biome → the flora that grows on assimilated ground (docs/BIOMES.md). The infection CONSUMES the
 *  biome: frozen ground sprouts ice crystal, the ossuary sprouts bone. Unknown/future biomes fall back
 *  to the build's dominant motif — one data row to curate, zero code. */
const BIOME_FLORA: Record<string, Motif> = {
  verdant: 'spore', necrotic: 'flesh', frostbound: 'crystal', ashen: 'ember', carapace: 'chitin',
  neural: 'crystal', molten: 'ember', tempest: 'crystal', ossuary: 'bone', umbral: 'vein',
};

/** The radial infection field 0..~1 at a point: mutation RADIATES from every hotspot (reach grows with
 *  stage) and pools up from the hive frontier — the two merge, so the ground visibly spreads OUTWARD
 *  from the player's build rather than tinting uniformly. */
function infectionField(x: number, y: number, regions: Region[], front: number, reach: number): number {
  const bottom = Math.max(0, front - (HEIGHT - y) / HEIGHT + 0.2);
  let radial = 0;
  for (const r of regions) {
    const rad = (66 + r.strength * 20) * (0.3 + reach * 1.1);
    const d = Math.hypot(x - r.x, y - r.y);
    if (d < rad) { const v = 1 - d / rad; if (v > radial) radial = v; }
  }
  return Math.max(bottom * 0.95, radial);
}

/** Pure: derive the full terraform spec from the assimilation state. Hash-seeded ⇒ stable per layout. */
export function deriveTerraform(a: Assimilation, biomeId: string): TerraformSpec {
  const front = 0.14 + (a.stage / (STAGE_COUNT - 1)) * 0.98;
  const reach = Math.min(1, (a.stage + a.progress) / STAGE_COUNT);
  const towers = a.regions.filter((r) => r.kind === 'tower');

  // Vein NETWORK: greedy nearest-connected tree rooted at the nucleus — each tower joins the closest
  // already-connected node, so veins branch through the build instead of star-bursting from one point.
  const nodes: { x: number; y: number }[] = [{ x: nucleusPoint.x, y: nucleusPoint.y }];
  const veins: VeinSeg[] = [];
  const pending = [...towers].sort((p, q) =>
    (Math.hypot(p.x - nucleusPoint.x, p.y - nucleusPoint.y)) - (Math.hypot(q.x - nucleusPoint.x, q.y - nucleusPoint.y)));
  for (const t of pending) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < nodes.length; i++) { const d = Math.hypot(t.x - nodes[i].x, t.y - nodes[i].y); if (d < bd) { bd = d; bi = i; } }
    const n = nodes[bi];
    const mx = (n.x + t.x) / 2, my = (n.y + t.y) / 2;
    const px = -(t.y - n.y), py = t.x - n.x; // perpendicular — bow the vein sideways
    const bow = (hash01(t.seed) - 0.5) * 0.5;
    veins.push({ x0: n.x, y0: n.y, cx: mx + px * bow, cy: my + py * bow, x1: t.x, y1: t.y,
      w: 2 + Math.min(3.4, t.strength * 0.3), hue: t.hue, seed: t.seed });
    nodes.push({ x: t.x, y: t.y });
  }

  // Terrain EYES (stage ≥ 4): sockets open across the infected midfield, edge-biased for readability.
  const eyes: EyeSite[] = [];
  if (a.stage >= 4) {
    const n = (a.stage - 3) * 3 + Math.round(a.progress * 2);
    for (let k = 0; k < n; k++) {
      const h1 = hash01(k * 17.3 + 3), h2 = hash01(k * 29.7 + 7);
      const side = k % 2 === 0 ? h1 * 0.3 : 0.7 + h1 * 0.3; // outer thirds
      const x = 24 + side * (WIDTH - 48);
      const y = HEIGHT * (0.36 + h2 * 0.5);
      if (Math.hypot(x - nucleusPoint.x, y - nucleusPoint.y) < 90) continue; // the organ owns its zone
      eyes.push({ x, y, r: 4 + hash01(k * 5.1) * 3.5, seed: k * 977 });
    }
  }

  // FLORA: motif micro-growth scattered where the infection field has taken (rejection-sampled).
  const flora: Flora[] = [];
  const floraMotif = BIOME_FLORA[biomeId] ?? a.dominant;
  const want = Math.min(160, Math.round(30 * (a.stage + a.progress)));
  for (let i = 0; i < want * 4 && flora.length < want; i++) {
    const x = hash01(i * 13.7 + 11) * WIDTH, y = hash01(i * 7.9 + 23) * HEIGHT;
    if (infectionField(x, y, a.regions, front, reach) < 0.25 + hash01(i * 3.1) * 0.3) continue;
    flora.push({ x, y, size: 2 + hash01(i * 5.3) * 4, motif: floraMotif, seed: i });
  }
  return { veins, eyes, flora, front, reach };
}

// Spec cache — recomputed only when the layout key changes; live accents read it every frame.
let spec: TerraformSpec | null = null;
let specKey = '';
function ensureSpec(a: Assimilation, biomeId: string, key: string): TerraformSpec {
  if (key !== specKey || !spec) { spec = deriveTerraform(a, biomeId); specKey = key; }
  return spec;
}

// ══ TERRAFORM BAKE (the optimization) ════════════════════════════════════════════════════════════
// The stable terrain is baked into TWO offscreen canvases keyed by (stage, biome, layout, perm scars):
//   • BASE — flesh membrane behind the infection field, feathered crust, vein casings, shaded blooms,
//     flora, eye sockets, permanent scars. Blitted with a slow breathing alpha.
//   • GLOW — vein cores, bloom glints, frontier shimmer, ember light. Blitted with a HEARTBEAT-
//     modulated alpha, so the entire network pulses as one organism for the cost of a drawImage.
// Rebuilt only when the key changes (stage step / biome flip / tower placed / boss fell) and
// CROSSFADED (~0.85s) from the previous bake, so the arena grows instead of popping.
const FLESH_BASE: Col = [50, 21, 29];
const FLESH_HI: Col = [128, 46, 62];
const FADE_SECS = 0.85;
export interface Bake { base: HTMLCanvasElement; glow: HTMLCanvasElement }
let curBake: Bake | null = null;
let prevBake: Bake | null = null;
let curKey = '';
let fade = 1; // 0..1 crossfade progress (1 = current bake fully shown)
let fadeAt = 0;

function clearTerraform(): void { curBake = null; prevBake = null; curKey = ''; fade = 1; fadeAt = 0; spec = null; specKey = ''; }

function layerKey(stage: number, biomeId: string, towers: Region[], permN: number): string {
  let k = stage + '|' + biomeId + '|p' + permN;
  for (const r of towers) k += '|' + (r.x | 0) + ',' + (r.y | 0) + ',' + motifIdx(r.motif) + ',' + Math.round(r.strength);
  return k;
}

function ensureBake(a: Assimilation, tint: Col | null, sp: TerraformSpec, key: string): void {
  if (key === curKey && curBake) return;
  prevBake = curBake;
  fade = prevBake ? 0 : 1;
  curBake = buildBake(a, tint, sp);
  curKey = key;
}

function makeCanvas(): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = WIDTH; c.height = HEIGHT;
  return [c, c.getContext('2d')!];
}

function buildBake(a: Assimilation, tint: Col | null, sp: TerraformSpec): Bake {
  const [baseC, gb] = makeCanvas();
  const [glowC, gg] = makeCanvas();
  const tier = a.tierColor as Col;
  // Palette: dark flesh, consuming the biome accent and pulled toward the tier accent (art-direction unity).
  const { base, hi } = terraformPalette(tint, tier);
  const towers = a.regions.filter((r) => r.kind === 'tower');

  paintMembrane(gb, a, sp, base, hi);
  paintCrust(gb, gg, a.stage, hi, tier);
  for (const v of sp.veins) paintVein(gb, gg, v, base, hi);
  for (const t of towers) { paintBloomBase(gb, t, a.stage); paintBloomGlow(gg, t, a.stage); }
  for (const f of sp.flora) paintFlora(gb, gg, f);
  for (const e of sp.eyes) paintEyeSocket(gb, e, base);
  for (const s of scars) if (s.perm) paintPermScar(gb, s);
  return { base: baseC, glow: glowC };
}

/** The living membrane: two octaves of fleshy mottling gated by the INFECTION FIELD, so flesh pools
 *  around every hotspot and up from the hive, merging as the run deepens — consumed, not overlaid. */
function paintMembrane(g: Ctx, a: Assimilation, sp: TerraformSpec, base: Col, hi: Col): void {
  const blotch = (count: number, rMin: number, rSpan: number, salt: number, a0: number): void => {
    for (let i = 0; i < count; i++) {
      const h1 = hash01(i * 1.7 + salt), h2 = hash01(i * 3.3 + salt * 2 + 5), h3 = hash01(i * 5.1 + salt + 9);
      const x = h1 * WIDTH, y = h2 * HEIGHT;
      if (h3 > infectionField(x, y, a.regions, sp.front, sp.reach) * 1.15) continue;
      const rr = rMin + h3 * rSpan;
      const rad = g.createRadialGradient(x, y, 0, x, y, rr);
      rad.addColorStop(0, css(mix(base, hi, h1 * 0.9), a0));
      rad.addColorStop(1, css(base, 0));
      g.fillStyle = rad; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
    }
  };
  blotch(90 + a.stage * 30, 26, 78, 0, 0.5); // broad soft flesh
  blotch(110 + a.stage * 34, 6, 20, 100, 0.32); // fine detail speckle
  // capillary filaments threading the infected ground
  g.lineCap = 'round';
  for (let i = 0; i < 14 + a.stage * 8; i++) {
    let x = hash01(i * 8.1 + a.stage) * WIDTH, y = hash01(i * 2.7 + a.stage) * HEIGHT;
    if (infectionField(x, y, a.regions, sp.front, sp.reach) < 0.15) continue;
    g.strokeStyle = css(shade(hi, 0.12), 0.10 + a.stage * 0.012); g.lineWidth = 0.8 + hash01(i) * 0.8;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (hash01(i + k * 3.1) - 0.5) * 76; y += (hash01(i + k * 7.7) - 0.5) * 76; g.lineTo(x, y); }
    g.stroke();
  }
}

/** Smooth organic frontier line (sum of incommensurate sines — no per-x hash jitter, so it feathers). */
function lipY(x: number, crest: number, amp: number): number {
  return crest + Math.sin(x * 0.021 + 1.7) * amp + Math.sin(x * 0.043 + 4.2) * amp * 0.55 + Math.sin(x * 0.011 + 2.9) * amp * 1.3;
}

/** The rising bottom crust with a FEATHERED lip (three stacked fills), side tendrils, chitin plating on
 *  the tile lattice (stage ≥ 4), and a shimmer line along the lip on the glow layer — the living tide. */
function paintCrust(gb: Ctx, gg: Ctx, stage: number, hi: Col, tier: Col): void {
  if (stage < 2) return;
  const { reach, crust, crest, amp } = crustGeometry(stage);
  const grad = gb.createLinearGradient(0, HEIGHT, 0, crest);
  grad.addColorStop(0, css(mix(hi, tier, 0.3), 0.5)); grad.addColorStop(1, css(hi, 0));
  gb.fillStyle = grad; gb.fillRect(0, crest, WIDTH, crust);
  // feathered lip: three offset fills at decreasing alpha melt the tide-line into the ground
  for (let pass = 0; pass < 3; pass++) {
    const off = pass * (6 + reach * 6), al = [0.22, 0.13, 0.07][pass];
    gb.fillStyle = css(mix(hi, tier, 0.25), al);
    gb.beginPath(); gb.moveTo(0, HEIGHT);
    for (let x = 0; x <= WIDTH; x += 12) gb.lineTo(x, lipY(x, crest, amp) - off);
    gb.lineTo(WIDTH, HEIGHT); gb.closePath(); gb.fill();
  }
  // the lip GLOWS faintly — the frontier is where the organism is actively eating
  gg.strokeStyle = css(mix(shade(hi, 0.35), tier, 0.4), 0.3); gg.lineWidth = 1.6; gg.lineCap = 'round';
  gg.beginPath();
  for (let x = 0; x <= WIDTH; x += 12) { const yy = lipY(x, crest, amp); if (x === 0) gg.moveTo(x, yy); else gg.lineTo(x, yy); }
  gg.stroke();
  // creeping tendrils from the side edges
  const tendrils = Math.round(6 * reach) + 2;
  gb.lineCap = 'round';
  for (let i = 0; i < tendrils; i++) {
    const left = i % 2 === 0; const ey = hash01(i * 5.7) * HEIGHT;
    let x = left ? 0 : WIDTH, y = ey; let ang = left ? 0 : Math.PI;
    const len = (40 + hash01(i) * 90) * reach;
    gb.strokeStyle = css(mix(hi, tier, 0.35), 0.22); gb.lineWidth = 2.4 + hash01(i * 2) * 2;
    gb.beginPath(); gb.moveTo(x, y);
    for (let k = 0; k < 5; k++) { ang += (hash01(i * 3 + k) - 0.5) * 0.9; const d = len / 5; x += Math.cos(ang) * d; y += Math.sin(ang) * d; gb.lineTo(x, y); }
    gb.stroke();
  }
  if (stage >= 4) { // chitin plating snapping onto the tile lattice near the crust
    gb.fillStyle = css(mix(hi, tier, 0.4), 0.14);
    for (let i = 0; i < 40; i++) {
      const gx = Math.floor(hash01(i * 4.4) * (WIDTH / CELL)) * CELL;
      const gy = HEIGHT - Math.floor(hash01(i * 9.1) * (crust / CELL) + 1) * CELL;
      hexAt(gb, gx + CELL / 2, gy + CELL / 2, CELL * 0.5); gb.fill();
    }
  }
}

/** One vein edge: dark casing + wall on the base; the bright luminous core on the GLOW layer (it will
 *  pulse with the heartbeat), plus capillary offshoots at the midpoint. */
function paintVein(gb: Ctx, gg: Ctx, v: VeinSeg, base: Col, hi: Col): void {
  const hueCol = mix(hex(CORE_HUE), hex(v.hue), 0.5);
  const path = (g: Ctx): void => { g.beginPath(); g.moveTo(v.x0, v.y0); g.quadraticCurveTo(v.cx, v.cy, v.x1, v.y1); g.stroke(); };
  gb.lineCap = 'round'; gg.lineCap = 'round';
  gb.strokeStyle = css(shade(base, -0.2), 0.5); gb.lineWidth = v.w + 2.2; path(gb); // casing
  gb.strokeStyle = css(mix(hueCol, hi, 0.3), 0.5); gb.lineWidth = v.w; path(gb); // wall
  gg.strokeStyle = css(shade(hueCol, 0.5), 0.6); gg.lineWidth = Math.max(0.9, v.w * 0.4); path(gg); // core (pulses)
  for (let k = 0; k < 2; k++) { // capillary offshoots
    const ang = hash01(v.seed + k * 7) * TAU; const len = 16 + hash01(v.seed + k) * 24;
    gb.strokeStyle = css(mix(hueCol, hi, 0.2), 0.3); gb.lineWidth = 1.2;
    gb.beginPath(); gb.moveTo(v.cx, v.cy); gb.lineTo(v.cx + Math.cos(ang) * len, v.cy + Math.sin(ang) * len); gb.stroke();
  }
}

/** A shaded regional bloom — lit up-left to match the renderer's key light. */
function paintBloomBase(g: Ctx, r: Region, stage: number): void {
  const grow = (0.6 + stage * 0.5) * (0.7 + Math.min(2.4, r.strength * 0.18));
  const base = 11 * grow;
  const a0 = 0.3 + stage * 0.05;
  const col = hex(r.hue);
  const lit = shade(col, 0.28), dark = shade(col, -0.34);
  g.save(); g.translate(r.x, r.y);
  switch (r.motif) {
    case 'bone': {
      for (let k = 0; k < 6; k++) { const ang = (k / 6) * TAU + r.seed; const len = base * (0.7 + hash01(r.seed + k) * 0.7);
        const nx = Math.cos(ang), ny = Math.sin(ang);
        g.strokeStyle = css(dark, a0); g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(nx * len, ny * len); g.stroke();
        g.strokeStyle = css(lit, a0); g.lineWidth = 1.2; g.beginPath(); g.moveTo(-0.6, -0.6); g.lineTo(nx * len - 0.6, ny * len - 0.6); g.stroke(); }
      break;
    }
    case 'crystal': {
      for (let k = 0; k < 5; k++) { const ang = (k / 5) * TAU + r.seed; const len = base * (0.6 + hash01(r.seed + k) * 0.8);
        const tx = Math.cos(ang) * len, ty = Math.sin(ang) * len;
        const bx = Math.cos(ang + 0.45) * len * 0.36, by = Math.sin(ang + 0.45) * len * 0.36;
        const cx = Math.cos(ang - 0.45) * len * 0.36, cy = Math.sin(ang - 0.45) * len * 0.36;
        g.fillStyle = css(dark, a0); g.beginPath(); g.moveTo(tx, ty); g.lineTo(bx, by); g.lineTo(cx, cy); g.closePath(); g.fill();
        g.fillStyle = css(lit, a0 * 0.9); g.beginPath(); g.moveTo(tx, ty); g.lineTo(bx, by); g.lineTo(0, 0); g.closePath(); g.fill(); }
      break;
    }
    case 'spore': {
      for (let k = 0; k < 8; k++) { const ang = hash01(r.seed + k) * TAU; const d = base * (0.25 + hash01(r.seed + k * 3) * 0.9);
        const pr = 2 + hash01(r.seed + k * 7) * 3.4; const px = Math.cos(ang) * d, py = Math.sin(ang) * d;
        g.fillStyle = css(dark, a0); g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
        g.fillStyle = css(lit, a0); g.beginPath(); g.arc(px - pr * 0.3, py - pr * 0.3, pr * 0.5, 0, TAU); g.fill(); }
      break;
    }
    case 'root': {
      for (let k = 0; k < 6; k++) { let ang = (k / 6) * TAU + r.seed; let x = 0, y = 0;
        g.strokeStyle = css(dark, a0); g.lineWidth = 2.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0);
        for (let s = 0; s < 4; s++) { ang += (hash01(r.seed + k * 5 + s) - 0.5) * 1.1; const d = base * 0.42; x += Math.cos(ang) * d; y += Math.sin(ang) * d; g.lineTo(x, y); } g.stroke(); }
      break;
    }
    case 'chitin': {
      for (let k = 0; k < 4; k++) { const ang = (k / 4) * TAU + r.seed; const d = base * 0.55;
        const px = Math.cos(ang) * d, py = Math.sin(ang) * d;
        g.fillStyle = css(dark, a0); hexAt(g, px, py, base * 0.5); g.fill();
        g.fillStyle = css(lit, a0 * 0.7); hexAt(g, px - 1, py - 1, base * 0.32); g.fill(); }
      break;
    }
    case 'ember': {
      const rad = g.createRadialGradient(0, 0, 0, 0, 0, base);
      rad.addColorStop(0, css(shade(col, 0.45), a0)); rad.addColorStop(0.6, css(col, a0 * 0.5)); rad.addColorStop(1, css(col, 0));
      g.fillStyle = rad; g.beginPath(); g.arc(0, 0, base, 0, TAU); g.fill();
      break;
    }
    default: { // vein / flesh — a shaded sac with a rim + a specular kiss
      const rad = g.createRadialGradient(-base * 0.3, -base * 0.3, base * 0.15, 0, 0, base);
      rad.addColorStop(0, css(lit, a0)); rad.addColorStop(0.7, css(col, a0 * 0.7)); rad.addColorStop(1, css(dark, 0));
      g.fillStyle = rad; g.beginPath(); g.arc(0, 0, base, 0, TAU); g.fill();
      g.strokeStyle = css(dark, a0 * 0.8); g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, base * 0.72, 0, TAU); g.stroke();
    }
  }
  g.restore();
}

/** The bloom's luminous accents on the glow layer (crystal facet glints, ember cracks, sac rims). */
function paintBloomGlow(g: Ctx, r: Region, stage: number): void {
  const grow = (0.6 + stage * 0.5) * (0.7 + Math.min(2.4, r.strength * 0.18));
  const base = 11 * grow;
  const col = hex(r.hue);
  g.save(); g.translate(r.x, r.y);
  if (r.motif === 'ember') {
    g.strokeStyle = css(shade(col, 0.5), 0.5); g.lineWidth = 1.3;
    for (let k = 0; k < 4; k++) { const ang = hash01(r.seed + k) * TAU; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(ang) * base, Math.sin(ang) * base); g.stroke(); }
  } else if (r.motif === 'crystal') {
    g.fillStyle = css(shade(col, 0.55), 0.4);
    for (let k = 0; k < 5; k++) { const ang = (k / 5) * TAU + r.seed; const len = base * (0.6 + hash01(r.seed + k) * 0.8);
      g.beginPath(); g.arc(Math.cos(ang) * len, Math.sin(ang) * len, 1.4, 0, TAU); g.fill(); }
  } else {
    g.strokeStyle = css(shade(col, 0.4), 0.28); g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, base * 0.8, 0, TAU); g.stroke();
  }
  g.restore();
}

/** One flora sprig — tiny biome-flavoured growth (a shard, a spur, a cap, a sac …). */
function paintFlora(gb: Ctx, gg: Ctx, f: Flora): void {
  const col = hex(MOTIF_HUE[f.motif]);
  const a0 = 0.3;
  const s = f.size;
  switch (f.motif) {
    case 'crystal': {
      gb.fillStyle = css(shade(col, -0.15), a0);
      gb.beginPath(); gb.moveTo(f.x, f.y - s * 1.4); gb.lineTo(f.x + s * 0.6, f.y + s * 0.4); gb.lineTo(f.x - s * 0.6, f.y + s * 0.4); gb.closePath(); gb.fill();
      gg.fillStyle = css(shade(col, 0.5), 0.35); gg.beginPath(); gg.arc(f.x, f.y - s * 1.2, 0.9, 0, TAU); gg.fill();
      break;
    }
    case 'bone': {
      gb.strokeStyle = css(col, a0); gb.lineWidth = 1.1; gb.lineCap = 'round';
      const ang = hash01(f.seed) * TAU;
      gb.beginPath(); gb.moveTo(f.x, f.y); gb.lineTo(f.x + Math.cos(ang) * s * 1.5, f.y + Math.sin(ang) * s * 1.5); gb.stroke();
      gb.beginPath(); gb.moveTo(f.x, f.y); gb.lineTo(f.x + Math.cos(ang + 2.4) * s, f.y + Math.sin(ang + 2.4) * s); gb.stroke();
      break;
    }
    case 'spore': {
      gb.fillStyle = css(shade(col, -0.2), a0); gb.beginPath(); gb.arc(f.x, f.y, s * 0.7, 0, TAU); gb.fill();
      gb.fillStyle = css(shade(col, 0.25), a0); gb.beginPath(); gb.arc(f.x - s * 0.2, f.y - s * 0.25, s * 0.35, 0, TAU); gb.fill();
      break;
    }
    case 'ember': {
      gb.fillStyle = css(shade(col, -0.3), a0); gb.beginPath(); gb.arc(f.x, f.y, s * 0.6, 0, TAU); gb.fill();
      gg.fillStyle = css(shade(col, 0.4), 0.4); gg.beginPath(); gg.arc(f.x, f.y, s * 0.35, 0, TAU); gg.fill();
      break;
    }
    case 'chitin': {
      gb.fillStyle = css(shade(col, -0.15), a0); hexAt(gb, f.x, f.y, s * 0.7); gb.fill();
      break;
    }
    case 'root': {
      gb.strokeStyle = css(col, a0); gb.lineWidth = 1.1; gb.lineCap = 'round';
      const ang = hash01(f.seed) * TAU;
      gb.beginPath(); gb.moveTo(f.x, f.y);
      gb.quadraticCurveTo(f.x + Math.cos(ang) * s, f.y + Math.sin(ang) * s, f.x + Math.cos(ang + 1) * s * 1.6, f.y + Math.sin(ang + 1) * s * 1.6);
      gb.stroke();
      break;
    }
    default: { // vein / flesh — a tiny wet sac
      gb.fillStyle = css(col, a0); gb.beginPath(); gb.arc(f.x, f.y, s * 0.55, 0, TAU); gb.fill();
      gb.fillStyle = css(shade(col, 0.35), a0); gb.beginPath(); gb.arc(f.x - s * 0.15, f.y - s * 0.18, s * 0.22, 0, TAU); gb.fill();
    }
  }
}

/** A closed terrain-eye socket (the lid) baked into the base — the live pass draws the watching pupil. */
function paintEyeSocket(g: Ctx, e: EyeSite, base: Col): void {
  g.save(); g.translate(e.x, e.y); g.rotate((hash01(e.seed) - 0.5) * 0.6);
  g.fillStyle = css(shade(base, -0.35), 0.55);
  g.beginPath(); g.ellipse(0, 0, e.r * 1.5, e.r * 0.95, 0, 0, TAU); g.fill();
  g.strokeStyle = css(shade(base, 0.18), 0.4); g.lineWidth = 1.1;
  g.beginPath(); g.ellipse(0, 0, e.r * 1.5, e.r * 0.95, 0, 0, TAU); g.stroke();
  g.restore();
}

/** Permanent boss/mega crater baked into the terrain memory. */
function paintPermScar(g: Ctx, s: Scar): void {
  const rad = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
  rad.addColorStop(0, css(shade(s.hue, -0.55), 0.42)); rad.addColorStop(0.55, css(shade(s.hue, -0.3), 0.24)); rad.addColorStop(1, css(s.hue, 0));
  g.fillStyle = rad; g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill();
  g.strokeStyle = css(shade(s.hue, 0.25), 0.26); g.lineWidth = 1.6; g.beginPath(); g.arc(s.x, s.y, s.r * 0.78, 0, TAU); g.stroke();
}
function hexAt(g: Ctx, x: number, y: number, r: number): void {
  g.beginPath();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); }
  g.closePath();
}
function quad(a: number, b: number, c: number, t: number): number { const u = 1 - t; return u * u * a + 2 * u * t * b + t * t * c; }

// ══ Draw — two cached blits + living accents ═════════════════════════════════════════════════════
/** Draws the living battlefield BENEATH the entities. Returns the computed assimilation (for the HUD/
 *  audio). Fully inert at Stage 0 ⇒ the original clean arena (and always render-only ⇒ golden-safe). */
export function drawLivingBattlefield(ctx: Ctx, rs: RenderState, data: LBContext, now: number, detail = true, masterIndex?: number): Assimilation {
  const a = computeAssimilation(rs, data, masterIndex);
  lastAssim = a;
  if (!enabled) return a; // dev toggle: computed (readout still live) but nothing drawn
  // Self-reset on run restart (sim time rewound), then advance scar lifetimes by elapsed SIM time (so
  // they hold while the game is paused). `now` (renderer time) drives animation + the crossfade.
  if (rs.time + 0.001 < lastTime) resetLivingBattlefield();
  const simDt = Math.max(0, Math.min(0.2, rs.time - lastTime));
  lastTime = rs.time;
  ingestScars(rs, a.stage, simDt);

  const towers = a.regions.filter((r) => r.kind === 'tower');
  if (a.stage <= 0 && scars.length === 0 && towers.length === 0) return a; // truly untouched field

  // ROOTING — the invasion starts at PLACEMENT, not at stage 1: every socket bleeds a small
  // root system into the floor from the moment its tower exists, so the player watches the
  // arena begin to belong to them inside the first wave. Hands off to the woken terraform
  // (attenuates with intensity; gone by mid-Spreading). Drawn in BOTH the DOM and headless
  // paths — it is part of the field's identity, not an embellishment.
  drawTowerRoots(ctx, a, towers, now, detail);

  if (a.stage <= 0 && scars.length === 0) return a; // rooted but unscarred, unwoken

  let permN = 0; for (const s of scars) if (s.perm) permN++;
  const key = layerKey(a.stage, a.stage > 0 ? rs.biome.id : 'x', towers, permN);
  const sp = ensureSpec(a, rs.biome.id, key);

  // One shared heartbeat: a soft lub each ~1.15s. Drives the glow layer, the beads and the organ.
  const phase = (now % 1.15) / 1.15;
  const beat = Math.pow(Math.max(0, Math.sin(phase * Math.PI)), 3);
  const breathe = 0.92 + 0.08 * Math.sin(now * 1.25);
  const alpha = Math.min(0.66, a.intensity * 0.78) * breathe;

  if (typeof document === 'undefined') { // headless/stubbed (tests): cheap direct wash, no offscreen cache
    drawDirectFallback(ctx, rs, a, alpha, sp, now);
    return a;
  }
  if (a.stage <= 0) { drawLiveScars(ctx, a); return a; } // scar history only, no woken field

  ensureBake(a, resolveAccent(rs.biome.accent), sp, key);
  // advance the crossfade on renderer time; drop the previous bake once it has fully faded
  if (fade < 1) { const dt = Math.max(0, Math.min(0.1, now - fadeAt)); fade = Math.min(1, fade + dt / FADE_SECS); if (fade >= 1) prevBake = null; }
  fadeAt = now;

  const glowAlpha = Math.min(0.85, a.intensity * (0.5 + 0.45 * beat)); // the network pulses as one organism
  ctx.save();
  if (prevBake && fade < 1) {
    ctx.globalAlpha = alpha * (1 - fade); ctx.drawImage(prevBake.base, 0, 0);
    ctx.globalAlpha = glowAlpha * (1 - fade); ctx.drawImage(prevBake.glow, 0, 0);
  }
  const k = prevBake ? fade : 1;
  if (curBake) {
    ctx.globalAlpha = alpha * k; ctx.drawImage(curBake.base, 0, 0);
    ctx.globalAlpha = glowAlpha * k; ctx.drawImage(curBake.glow, 0, 0);
  }
  ctx.restore();

  drawLiveScars(ctx, a); // fresh combat scorch, over the baked flesh
  drawVeinBeats(ctx, a, sp, now, detail); // nutrient beads travelling the baked network
  if (detail) drawVeinCrawlers(ctx, a, sp, now); // parasites crawling the veins (under entities ⇒ correct occlusion)
  drawTerrainEyes(ctx, rs, a, sp, now, detail); // the ground WATCHES — pupils track the swarm
  drawNucleusOrgan(ctx, a, now); // the central organ (blinks/pulses — kept live)
  drawCombatFlare(ctx, a, now); // hot mutation where the line is pressed hardest
  drawMegaBloom(ctx, a, now); // battlefield-scale bloom under a mega (rare)
  return a;
}

/** VICTORY WASH (docs/SIGNATURE-MOMENTS.md §2): the SAME terraform bake, painted as this board looks
 *  once fully assimilated (Living stage, full reach — every tower, the nucleus and the frontier
 *  merged) and tinted toward `accent` (`#hex` or `var(--x)`). One-off at run end; render/runOutro.ts
 *  reveals it outward from the Hive Core. Null headless (no offscreen canvas). */
export function bakeAssimilatedBoard(a: Assimilation, biomeId: string, accent: string): Bake | null {
  if (typeof document === 'undefined') return null;
  const full: Assimilation = { ...a, stage: STAGE_COUNT - 1, progress: 1, intensity: 1 };
  return buildBake(full, resolveAccent(accent), deriveTerraform(full, biomeId));
}

/** ROOTING (stage-0 invasion): a per-tower root system — mottled stain + wobbled tendrils
 *  crawling out of the socket seams, deterministic per region seed, pulsing on the slow
 *  breath. Alpha-capped and cheap (≤5 curves/tower, 3 under LOD); attenuates as the staged
 *  terraform wakes so the bake takes over without a seam. */
function drawTowerRoots(ctx: Ctx, a: Assimilation, towers: Region[], now: number, detail: boolean): void {
  if (towers.length === 0) return;
  const hand = Math.max(0, 1 - a.intensity * 2.2); // 1 on a fresh field → 0 by ~stage 2
  if (hand <= 0.03) return;
  const breathe = 0.9 + 0.1 * Math.sin(now * 1.1);
  ctx.save();
  ctx.lineCap = 'round';
  for (const r of towers) {
    const grow = Math.min(1, 0.45 + r.strength * 0.12); // deeper organisms root wider
    const alpha = 0.3 * hand * grow * breathe;
    const hue = hex(r.hue);
    const stainR = 26 + grow * 14;
    const g = ctx.createRadialGradient(r.x, r.y, 2, r.x, r.y, stainR);
    g.addColorStop(0, css(shade(hue, 0.5), alpha));
    g.addColorStop(0.7, css(shade(hue, 0.32), alpha * 0.5));
    g.addColorStop(1, css(shade(hue, 0.28), 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(r.x, r.y, stainR, 0, TAU); ctx.fill();
    const n = detail ? 5 : 3;
    ctx.strokeStyle = css(shade(hue, 0.48), Math.min(0.5, alpha * 1.5));
    for (let i = 0; i < n; i++) {
      const h1 = hash01(r.seed * 7 + i * 13);
      const h2 = hash01(r.seed * 11 + i * 29);
      const ang = h1 * TAU + Math.sin(now * 0.4 + i) * 0.05; // roots quest, barely
      const len = (18 + h2 * 22) * grow;
      const mx = r.x + Math.cos(ang) * len * 0.55 + (h2 - 0.5) * 10;
      const my = r.y + Math.sin(ang) * len * 0.55 + (h1 - 0.5) * 10;
      const ex = r.x + Math.cos(ang) * len;
      const ey = r.y + Math.sin(ang) * len;
      ctx.lineWidth = 1 + grow;
      ctx.beginPath();
      ctx.moveTo(r.x + Math.cos(ang) * 8, r.y + Math.sin(ang) * 8);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
      // root-tip nodule — a slow bud, the promise of the woken field
      ctx.fillStyle = css(shade(hue, 0.58), Math.min(0.6, alpha * (1.1 + 0.5 * Math.sin(now * 1.3 + i + (r.seed % 7)))));
      ctx.beginPath(); ctx.arc(ex, ey, 1.2 + grow, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

/** Nutrient beads running along the vein NETWORK edges toward the build — synced to the heartbeat. */
function drawVeinBeats(ctx: Ctx, a: Assimilation, sp: TerraformSpec, now: number, detail: boolean): void {
  const max = detail ? sp.veins.length : Math.min(6, sp.veins.length);
  const beatT = (now % 1.15) / 1.15;
  ctx.save();
  for (let i = 0; i < max; i++) {
    const v = sp.veins[i];
    const bt = (beatT + hash01(v.seed)) % 1;
    const bx = quad(v.x0, v.cx, v.x1, bt), by = quad(v.y0, v.cy, v.y1, bt);
    const glow = (1 - bt) * (0.35 + a.intensity * 0.4);
    ctx.fillStyle = css(shade(hex(v.hue), 0.5), glow);
    ctx.beginPath(); ctx.arc(bx, by, 1.6 + a.intensity * 1.8, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/** Tiny parasites crawling ALONG the vein network (stage ≥ 3) — the infrastructure is inhabited. Drawn
 *  under the entities, so they slip beneath towers at the endpoints (correct occlusion). */
function drawVeinCrawlers(ctx: Ctx, a: Assimilation, sp: TerraformSpec, now: number): void {
  if (a.stage < 3 || sp.veins.length === 0) return;
  const n = Math.min(8, sp.veins.length * 2);
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const v = sp.veins[i % sp.veins.length];
    const dir = i % 2 === 0 ? 1 : -1; // some crawl outward, some crawl home
    const speed = 0.05 + hash01(i * 3.7) * 0.05;
    let t = (now * speed + hash01(i * 9.3)) % 1;
    if (dir < 0) t = 1 - t;
    const x = quad(v.x0, v.cx, v.x1, t), y = quad(v.y0, v.cy, v.y1, t);
    const t2 = Math.min(1, Math.max(0, t + dir * 0.02));
    const x2 = quad(v.x0, v.cx, v.x1, t2), y2 = quad(v.y0, v.cy, v.y1, t2);
    const wig = Math.sin(now * 6 + i * 2.1) * 1.5;
    ctx.strokeStyle = css([172, 66, 88], 0.34 * a.intensity);
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo((x + x2) / 2 + wig, (y + y2) / 2 - wig, x2, y2); ctx.stroke();
  }
  ctx.restore();
}

/** The terrain eyes open and WATCH: each pupil tracks the nearest enemy (idle wander when none, or
 *  under LOD). Sockets are baked; this draws only the moving parts — sclera, iris, lid. */
function drawTerrainEyes(ctx: Ctx, rs: RenderState, a: Assimilation, sp: TerraformSpec, now: number, detail: boolean): void {
  if (sp.eyes.length === 0) return;
  ctx.save();
  for (const e of sp.eyes) {
    const h = hash01(e.seed);
    const cyc = (now * 0.22 + h) % 1;
    const open = Math.min(1, Math.abs(cyc - 0.5) * 9); // brief blink once per cycle
    if (open < 0.1) continue;
    // pupil target: the nearest enemy within its gaze (LOD: idle wander instead of a scan)
    let dx = Math.cos(now * 0.4 + e.seed) * 0.5, dy = Math.sin(now * 0.3 + e.seed) * 0.5;
    if (detail) {
      let bd = 260 * 260;
      for (const en of rs.enemies) {
        const ddx = en.x - e.x, ddy = en.y - e.y; const d2 = ddx * ddx + ddy * ddy;
        if (d2 < bd) { bd = d2; const d = Math.sqrt(d2) || 1; dx = ddx / d; dy = ddy / d; }
      }
    }
    const look = e.r * 0.32;
    ctx.globalAlpha = 0.5 * Math.min(1, a.intensity * 1.6);
    ctx.fillStyle = css([236, 226, 214], open);
    ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 1.15, e.r * 0.7 * open, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = css([150, 40, 52], open);
    ctx.beginPath(); ctx.arc(e.x + dx * look, e.y + dy * look * 0.6, e.r * 0.42, 0, TAU); ctx.fill();
    ctx.fillStyle = css([16, 6, 10], open);
    ctx.beginPath(); ctx.arc(e.x + dx * look, e.y + dy * look * 0.6, e.r * 0.2, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** Fading combat scorch — cheap two-arc fills (no per-frame gradients). Permanent scars are baked. */
function drawLiveScars(ctx: Ctx, a: Assimilation): void {
  const master = a.stage <= 0 ? 0.4 : 0.55 + a.intensity * 0.4;
  for (const s of scars) {
    if (s.perm) continue; // baked into the layer
    const life = Math.min(1, s.life / s.max);
    const rr = s.r * (0.6 + life * 0.4);
    ctx.fillStyle = css(shade(s.hue, -0.4), 0.24 * life * master);
    ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, TAU); ctx.fill();
    ctx.fillStyle = css(shade(s.hue, -0.1), 0.16 * life * master);
    ctx.beginPath(); ctx.arc(s.x, s.y, rr * 0.55, 0, TAU); ctx.fill();
  }
}

/** The nucleus organ: spreading roots, pulsing sacs, blinking eyes, a heartbeat ring — one location, so
 *  kept live (cheap) and gradient-free. */
function drawNucleusOrgan(ctx: Ctx, a: Assimilation, now: number): void {
  const { x, y } = nucleusPoint;
  const s = a.stage + a.progress;
  const beat = 1 + 0.05 * Math.sin(now * 5.2);
  const col = hex(CORE_HUE);
  ctx.save();
  ctx.translate(x, y); ctx.scale(beat, beat);
  const roots = 6 + Math.floor(s * 2);
  ctx.strokeStyle = css(shade(col, 0.2), 0.14 + a.intensity * 0.2); ctx.lineWidth = 1.6 + a.intensity * 2; ctx.lineCap = 'round';
  for (let k = 0; k < roots; k++) {
    let ang = (k / roots) * TAU + Math.sin(now * 0.3 + k) * 0.1; let px = 0, py = 0;
    const len = (18 + s * 14) * (0.6 + hash01(k * 3.3) * 0.7);
    ctx.beginPath(); ctx.moveTo(0, 0);
    for (let seg = 1; seg <= 3; seg++) { ang += Math.sin(now * 0.6 + k + seg) * 0.18; const d = len / 3; px += Math.cos(ang) * d; py += Math.sin(ang) * d; ctx.lineTo(px, py); }
    ctx.stroke();
  }
  const sacs = Math.floor(s);
  for (let k = 0; k < sacs; k++) {
    const ang = (k / Math.max(1, sacs)) * TAU + now * 0.2; const d = 14 + (k % 3) * 6;
    const pr = 4 + 2 * Math.sin(now * 2 + k); const sx = Math.cos(ang) * d, sy = Math.sin(ang) * d;
    ctx.fillStyle = css(col, 0.3 * a.intensity); ctx.beginPath(); ctx.arc(sx, sy, pr + 2, 0, TAU); ctx.fill();
    ctx.fillStyle = css(shade(col, 0.4), 0.35 * a.intensity); ctx.beginPath(); ctx.arc(sx - pr * 0.3, sy - pr * 0.3, pr * 0.5, 0, TAU); ctx.fill();
  }
  if (a.stage >= 3) { // blinking eyes — the core watches
    const eyes = a.stage - 1;
    for (let k = 0; k < eyes; k++) {
      const ang = hash01(k * 9.1) * TAU; const d = 10 + hash01(k * 2.2) * 12;
      const ex = Math.cos(ang) * d, ey = Math.sin(ang) * d;
      const open = Math.max(0, Math.sin(now * 0.8 + k * 2));
      if (open < 0.12) continue;
      ctx.fillStyle = css([240, 230, 220], 0.55 * open); ctx.beginPath(); ctx.ellipse(ex, ey, 3, 3 * open, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = css([20, 8, 12], 0.9 * open); ctx.beginPath(); ctx.arc(ex, ey, 1.3, 0, TAU); ctx.fill();
    }
  }
  const pr = (now % 1.15) / 1.15;
  ctx.strokeStyle = css(col, (1 - pr) * 0.26 * a.intensity); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 8 + pr * (20 + s * 6), 0, TAU); ctx.stroke();
  ctx.restore();
}

/** A hot, pulsing mutation glow where the line is pressed hardest right now (the danger-camera focus). */
function drawCombatFlare(ctx: Ctx, a: Assimilation, now: number): void {
  const r = a.regions.find((rg) => rg.kind === 'combat');
  if (!r) return;
  const puls = 0.7 + 0.3 * Math.sin(now * 4);
  const rr = 26 + r.strength * 3;
  const rad = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, rr);
  rad.addColorStop(0, css(hex(r.hue), 0.22 * puls * a.intensity)); rad.addColorStop(1, css(hex(r.hue), 0));
  ctx.fillStyle = rad; ctx.beginPath(); ctx.arc(r.x, r.y, rr, 0, TAU); ctx.fill();
}

/** A battlefield-scale bloom under a live mega organism (rare; drawn live since a mega comes and goes). */
function drawMegaBloom(ctx: Ctx, a: Assimilation, now: number): void {
  const r = a.regions.find((rg) => rg.kind === 'mega');
  if (!r) return;
  const puls = 0.85 + 0.15 * Math.sin(now * 1.6);
  const rad = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, 220);
  rad.addColorStop(0, css(hex(r.hue), 0.14 * puls * a.intensity)); rad.addColorStop(1, css(hex(r.hue), 0));
  ctx.fillStyle = rad; ctx.beginPath(); ctx.ellipse(r.x, r.y, 220, 120, 0, 0, TAU); ctx.fill();
}

/** Headless / stubbed-context fallback (tests, jsdom): a cheap direct wash + the spec's vein network as
 *  straight segments, so the draw path still executes end-to-end without an offscreen canvas. */
function drawDirectFallback(ctx: Ctx, rs: RenderState, a: Assimilation, alpha: number, sp: TerraformSpec, now: number): void {
  if (a.stage <= 0 && scars.length === 0) return;
  const tint = resolveAccent(rs.biome.accent);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = css(tint ? mix(FLESH_BASE, tint, 0.26) : FLESH_BASE, 0.5);
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.restore();
  drawLiveScars(ctx, a);
  if (a.stage <= 0) return;
  ctx.save(); ctx.lineCap = 'round';
  for (const v of sp.veins) {
    ctx.strokeStyle = css(mix(hex(CORE_HUE), hex(v.hue), 0.5), 0.2 + a.intensity * 0.2); ctx.lineWidth = v.w;
    ctx.beginPath(); ctx.moveTo(v.x0, v.y0); ctx.lineTo(v.x1, v.y1); ctx.stroke();
    ctx.fillStyle = css(hex(v.hue), 0.24); ctx.beginPath(); ctx.arc(v.x1, v.y1, 6 + a.stage * 2, 0, TAU); ctx.fill();
  }
  ctx.restore();
  drawVeinBeats(ctx, a, sp, now, true);
  drawTerrainEyes(ctx, rs, a, sp, now, false);
  drawNucleusOrgan(ctx, a, now);
}

// ══ Ambient life (OVER the entities — pure atmosphere, stage-gated so it never clutters readability) ═
/** Drifting spores and the rare floating eye — only at deep stages, low alpha, LOD-gated, edge-biased
 *  so the play-critical centre stays readable. (Crawling parasites live UNDER the entities, on the
 *  vein network — see drawVeinCrawlers.) */
export function drawLivingBattlefieldAmbient(ctx: Ctx, a: Assimilation, now: number, detail = true): void {
  if (a.stage < 3 || !detail) return;
  const count = Math.min(10, (a.stage - 2) * 3);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const speed = 0.05 + hash01(i * 3.1) * 0.06;
    const py = (hash01(i * 7.7) + now * speed) % 1;
    const x = 20 + hash01(i * 2.3) * (WIDTH - 40);
    const y = py * HEIGHT;
    const edge = Math.min(1, Math.min(x, WIDTH - x) / (WIDTH * 0.32)); // fade toward centre — protect readability
    const alpha = 0.11 * (1 - edge * 0.7) * a.intensity;
    if (alpha < 0.01) continue;
    if (i % 2 === 0) { // drifting spore
      ctx.fillStyle = css([155, 224, 74], alpha); ctx.beginPath(); ctx.arc(x, y, 1.5 + hash01(i) * 1.5, 0, TAU); ctx.fill();
    } else { // floating eye
      const open = Math.max(0, Math.sin(now * 0.6 + i * 2));
      if (open < 0.2) continue;
      ctx.fillStyle = css([235, 225, 215], alpha * 1.6 * open); ctx.beginPath(); ctx.ellipse(x, y, 2.5, 2.5 * open, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = css([20, 8, 12], alpha * 2.4 * open); ctx.beginPath(); ctx.arc(x, y, 1, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}


// ══ Shared terrain vocabulary (the LIVING GUTTERS reuse it — render/gutters.ts, docs/SIGNATURE-MOMENTS.md §4) ═
/** The terraform palette: dark flesh consuming the biome accent, pulled toward the tier accent
 *  (art-direction unity). One source for the board bake and the periphery bake. */
export function terraformPalette(tint: Col | null, tier: Col): { base: Col; hi: Col } {
  let base = FLESH_BASE, hi = FLESH_HI;
  if (tint) { base = mix(base, tint, 0.26); hi = mix(hi, tint, 0.3); }
  base = mix(base, tier, 0.12); hi = mix(hi, tier, 0.2);
  return { base, hi };
}
/** The rising hive crust for a stage (stage ≥ 2): reach 0..1, crust depth, crest line, lip amplitude. */
export function crustGeometry(stage: number): { reach: number; crust: number; crest: number; amp: number } {
  const reach = (stage - 1) / (STAGE_COUNT - 2);
  const crust = HEIGHT * (0.1 + reach * 0.32);
  return { reach, crust, crest: HEIGHT - crust, amp: 8 + reach * 12 };
}
// The painters + field the periphery continues past the board edge (coordinate-explicit, so they
// paint anywhere — the gutters call them at x < 0 / x > WIDTH).
export type { Col };
export { hex, css, mix, shade, hash01, infectionField, lipY, paintVein, paintFlora, paintEyeSocket, BIOME_FLORA }; // resolveAccent: exported at its declaration
