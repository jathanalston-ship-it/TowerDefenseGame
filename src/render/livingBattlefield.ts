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
function css(c: Col, a = 1): string { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
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
  ravager: 'ember', shepherd: 'flesh', overseer: 'crystal', vitriol: 'spore', revenant: 'chitin',
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
function resolveAccent(accent: string): Col | null {
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

// ══ TERRAFORM LAYER (the optimization) ═══════════════════════════════════════════════════════════
// The whole stable terrain — membrane, tubular veins, shaded blooms, edge overgrowth, permanent scars —
// is BAKED ONCE into an offscreen canvas keyed by (stage, biome, build layout, perm-scar count) and
// blitted a single time per frame. It is rebuilt only when that key changes (a stage step, a biome
// flip, a tower placed/upgraded, a boss falling) and CROSSFADES from the previous bake, so the arena
// grows instead of popping. Per-frame cost collapses from dozens of gradient allocations to one
// drawImage + a handful of cheap live accents (heartbeat beads, the nucleus organ, a combat flare).
const FLESH_BASE: Col = [50, 21, 29];
const FLESH_HI: Col = [128, 46, 62];
const FADE_SECS = 0.85; // crossfade between two bakes on a stage/build change
let curLayer: HTMLCanvasElement | null = null;
let prevLayer: HTMLCanvasElement | null = null;
let curKey = '';
let fade = 1; // 0..1 crossfade progress (1 = current bake fully shown)
let fadeAt = 0; // last `now` the fade advanced at

function clearTerraform(): void { curLayer = null; prevLayer = null; curKey = ''; fade = 1; fadeAt = 0; }

function layerKey(stage: number, biomeId: string, towers: Region[], permN: number): string {
  let k = stage + '|' + biomeId + '|p' + permN;
  for (const r of towers) k += '|' + (r.x | 0) + ',' + (r.y | 0) + ',' + motifIdx(r.motif) + ',' + Math.round(r.strength);
  return k;
}

/** Ensure the current terraform bake matches (stage, biome, layout); on a change, roll the old bake
 *  into `prevLayer` and start a crossfade to the fresh one. */
function ensureLayer(a: Assimilation, tint: Col | null, towers: Region[], biomeId: string, permN: number): void {
  const key = layerKey(a.stage, biomeId, towers, permN);
  if (key === curKey && curLayer) return;
  prevLayer = curLayer; // crossfade FROM the previous look (null on the very first bake)
  fade = prevLayer ? 0 : 1;
  curLayer = buildTerraform(a, tint, towers);
  curKey = key;
}

function buildTerraform(a: Assimilation, tint: Col | null, towers: Region[]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = WIDTH; c.height = HEIGHT;
  const g = c.getContext('2d')!;
  const tier = a.tierColor as Col;
  // Palette: dark flesh, consuming the biome accent and pulled toward the tier accent (art-direction unity).
  let base = FLESH_BASE, hi = FLESH_HI;
  if (tint) { base = mix(base, tint, 0.26); hi = mix(hi, tint, 0.3); }
  base = mix(base, tier, 0.12); hi = mix(hi, tier, 0.2);
  paintMembrane(g, a.stage, base, hi);
  paintOvergrowth(g, a.stage, hi, tier);
  const core = nucleusPoint;
  for (const t of towers) paintVein(g, core.x, core.y, t, base, hi);
  for (const t of towers) paintBloom(g, t, a.stage);
  for (const s of scars) if (s.perm) paintPermScar(g, s);
  return c;
}

/** The living membrane: multi-octave fleshy mottling behind an assimilation FRONTIER that advances from
 *  the hive (bottom) toward the spawn line (top) as the run deepens — the map is consumed, not overlaid. */
function paintMembrane(g: Ctx, stage: number, base: Col, hi: Col): void {
  const front = 0.16 + (stage / (STAGE_COUNT - 1)) * 0.96; // fraction of height reached from the bottom
  const blotch = (count: number, rMin: number, rSpan: number, salt: number, a0: number): void => {
    for (let i = 0; i < count; i++) {
      const h1 = hash01(i * 1.7 + salt), h2 = hash01(i * 3.3 + salt * 2 + 5), h3 = hash01(i * 5.1 + salt + 9);
      const x = h1 * WIDTH, y = h2 * HEIGHT;
      const belowFront = Math.max(0, front - (HEIGHT - y) / HEIGHT + 0.25); // 0 above the frontier → dense at the hive
      const dN = Math.hypot(x - nucleusPoint.x, y - nucleusPoint.y) / WIDTH;
      const dens = belowFront * 1.1 + Math.max(0, 0.34 - dN);
      if (h3 > dens) continue;
      const rr = rMin + h3 * rSpan;
      const rad = g.createRadialGradient(x, y, 0, x, y, rr);
      rad.addColorStop(0, css(mix(base, hi, h1 * 0.9), a0));
      rad.addColorStop(1, css(base, 0));
      g.fillStyle = rad; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
    }
  };
  blotch(70 + stage * 26, 26, 78, 0, 0.5); // broad soft flesh
  blotch(90 + stage * 30, 6, 20, 100, 0.32); // fine detail speckle
  // capillary filaments threading the membrane
  g.lineCap = 'round';
  for (let i = 0; i < 14 + stage * 8; i++) {
    let x = hash01(i * 8.1 + stage) * WIDTH, y = hash01(i * 2.7 + stage) * HEIGHT;
    g.strokeStyle = css(shade(hi, 0.12), 0.10 + stage * 0.012); g.lineWidth = 0.8 + hash01(i) * 0.8;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (hash01(i + k * 3.1) - 0.5) * 76; y += (hash01(i + k * 7.7) - 0.5) * 76; g.lineTo(x, y); }
    g.stroke();
  }
}

/** Edge + grid OVERGROWTH (stage ≥ 2): the infection creeps in from the screen edges and gnaws the tile
 *  lattice, so by late-game the arena no longer reads as the clean starting map. */
function paintOvergrowth(g: Ctx, stage: number, hi: Col, tier: Col): void {
  if (stage < 2) return;
  const reach = (stage - 1) / (STAGE_COUNT - 2); // 0..1
  // bottom crust rising from the hive
  const crust = HEIGHT * (0.1 + reach * 0.32);
  const grad = g.createLinearGradient(0, HEIGHT, 0, HEIGHT - crust);
  grad.addColorStop(0, css(mix(hi, tier, 0.3), 0.5)); grad.addColorStop(1, css(hi, 0));
  g.fillStyle = grad; g.fillRect(0, HEIGHT - crust, WIDTH, crust);
  // ragged frontier lip on the crust
  g.fillStyle = css(mix(hi, tier, 0.25), 0.28);
  g.beginPath(); g.moveTo(0, HEIGHT);
  for (let x = 0; x <= WIDTH; x += 18) { const yy = HEIGHT - crust + Math.sin(x * 0.06) * 10 - hash01(x) * 22 * reach; g.lineTo(x, yy); }
  g.lineTo(WIDTH, HEIGHT); g.closePath(); g.fill();
  // creeping tendrils from the side edges
  const tendrils = Math.round(6 * reach) + 2;
  g.lineCap = 'round';
  for (let i = 0; i < tendrils; i++) {
    const left = i % 2 === 0; const ey = hash01(i * 5.7) * HEIGHT;
    let x = left ? 0 : WIDTH, y = ey; let ang = left ? 0 : Math.PI;
    const len = (40 + hash01(i) * 90) * reach;
    g.strokeStyle = css(mix(hi, tier, 0.35), 0.22); g.lineWidth = 2.4 + hash01(i * 2) * 2;
    g.beginPath(); g.moveTo(x, y);
    const steps = 5;
    for (let k = 0; k < steps; k++) { ang += (hash01(i * 3 + k) - 0.5) * 0.9; const d = len / steps; x += Math.cos(ang) * d; y += Math.sin(ang) * d; g.lineTo(x, y); }
    g.stroke();
  }
  // gnaw the tile grid near the crust — chitin plates snapping onto the lattice
  if (stage >= 4) {
    g.fillStyle = css(mix(hi, tier, 0.4), 0.14);
    for (let i = 0; i < 40; i++) {
      const gx = Math.floor(hash01(i * 4.4) * (WIDTH / CELL)) * CELL;
      const gy = HEIGHT - Math.floor(hash01(i * 9.1) * (crust / CELL) + 1) * CELL;
      hexAt(g, gx + CELL / 2, gy + CELL / 2, CELL * 0.5); g.fill();
    }
  }
}

/** A tubular vein nucleus→tower: a dark casing, a bright inner core, and a couple of capillary offshoots. */
function paintVein(g: Ctx, x0: number, y0: number, t: Region, base: Col, hi: Col): void {
  const midx = (x0 + t.x) / 2 + (hash01(t.seed) - 0.5) * 46;
  const midy = (y0 + t.y) / 2 + (hash01(t.seed * 3) - 0.5) * 46;
  const hueCol = mix(hex(CORE_HUE), hex(t.hue), 0.5);
  const w = 2.2 + Math.min(3.4, t.strength * 0.3);
  g.lineCap = 'round';
  g.strokeStyle = css(shade(base, -0.2), 0.5); g.lineWidth = w + 2; // casing
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(midx, midy, t.x, t.y); g.stroke();
  g.strokeStyle = css(mix(hueCol, hi, 0.3), 0.5); g.lineWidth = w; // wall
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(midx, midy, t.x, t.y); g.stroke();
  g.strokeStyle = css(shade(hueCol, 0.5), 0.55); g.lineWidth = Math.max(0.8, w * 0.4); // bright core
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(midx, midy, t.x, t.y); g.stroke();
  // capillary offshoots at the midpoint
  for (let k = 0; k < 2; k++) {
    const ang = hash01(t.seed + k * 7) * TAU; const len = 16 + hash01(t.seed + k) * 24;
    g.strokeStyle = css(mix(hueCol, hi, 0.2), 0.3); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(midx, midy); g.lineTo(midx + Math.cos(ang) * len, midy + Math.sin(ang) * len); g.stroke();
  }
}

/** A shaded regional bloom — each motif grown out of the ground with a lit side + a shadow side (the key
 *  light matches the renderer's up-left convention, so it sits in the same world). */
function paintBloom(g: Ctx, r: Region, stage: number): void {
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
      g.strokeStyle = css(shade(col, 0.5), a0 * 0.7); g.lineWidth = 1.3;
      for (let k = 0; k < 4; k++) { const ang = hash01(r.seed + k) * TAU; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(ang) * base, Math.sin(ang) * base); g.stroke(); }
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
function hexAt(g: Ctx, x: number, y: number, r: number): void {
  g.beginPath();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); }
  g.closePath();
}
/** Permanent boss/mega crater baked into the terrain memory. */
function paintPermScar(g: Ctx, s: Scar): void {
  const rad = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
  rad.addColorStop(0, css(shade(s.hue, -0.55), 0.42)); rad.addColorStop(0.55, css(shade(s.hue, -0.3), 0.24)); rad.addColorStop(1, css(s.hue, 0));
  g.fillStyle = rad; g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill();
  g.strokeStyle = css(shade(s.hue, 0.25), 0.26); g.lineWidth = 1.6; g.beginPath(); g.arc(s.x, s.y, s.r * 0.78, 0, TAU); g.stroke();
}
function quad(a: number, b: number, c: number, t: number): number { const u = 1 - t; return u * u * a + 2 * u * t * b + t * t * c; }

// ══ Draw — one cached blit + cheap live accents ══════════════════════════════════════════════════
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

  if (a.stage <= 0 && scars.length === 0) return a; // Stage 0, no history ⇒ nothing drawn

  const towers = a.regions.filter((r) => r.kind === 'tower');
  const breathe = 0.92 + 0.08 * Math.sin(now * 1.25); // the ground BREATHES (one sin, applied to the blit)
  const alpha = Math.min(0.66, a.intensity * 0.78) * breathe;

  if (typeof document === 'undefined') { // headless/stubbed (tests): cheap direct wash, no offscreen cache
    drawDirectFallback(ctx, rs, a, alpha, towers, now);
    return a;
  }
  if (a.stage <= 0) { drawLiveScars(ctx, a); return a; } // scar history only, no woken field

  let permN = 0; for (const s of scars) if (s.perm) permN++;
  ensureLayer(a, resolveAccent(rs.biome.accent), towers, rs.biome.id, permN);
  // advance the crossfade on renderer time; drop the previous bake once it has fully faded (no wasted blit)
  if (fade < 1) { const dt = Math.max(0, Math.min(0.1, now - fadeAt)); fade = Math.min(1, fade + dt / FADE_SECS); if (fade >= 1) prevLayer = null; }
  fadeAt = now;

  ctx.save();
  if (prevLayer && fade < 1) { ctx.globalAlpha = alpha * (1 - fade); ctx.drawImage(prevLayer, 0, 0); }
  ctx.globalAlpha = alpha * (prevLayer ? fade : 1);
  if (curLayer) ctx.drawImage(curLayer, 0, 0);
  ctx.restore();

  drawLiveScars(ctx, a); // fresh combat scorch, over the baked flesh
  drawVeinBeats(ctx, a, towers, now, detail); // heartbeats travelling the baked veins
  drawNucleusOrgan(ctx, a, now); // the central organ (blinks/pulses — kept live)
  drawCombatFlare(ctx, a, now); // hot mutation where the line is pressed hardest
  drawMegaBloom(ctx, a, now); // battlefield-scale bloom under a mega (rare)
  return a;
}

/** Heartbeat beads running nucleus→tower along the baked veins — the network pulses with the core. */
function drawVeinBeats(ctx: Ctx, a: Assimilation, towers: Region[], now: number, detail: boolean): void {
  const max = detail ? towers.length : Math.min(6, towers.length);
  const beat = (now % 1.15) / 1.15;
  const core = nucleusPoint;
  ctx.save();
  for (let i = 0; i < max; i++) {
    const t = towers[i];
    const midx = (core.x + t.x) / 2 + (hash01(t.seed) - 0.5) * 46;
    const midy = (core.y + t.y) / 2 + (hash01(t.seed * 3) - 0.5) * 46;
    const bt = (beat + hash01(t.seed)) % 1;
    const bx = quad(core.x, midx, t.x, bt), by = quad(core.y, midy, t.y, bt);
    const glow = (1 - bt) * (0.35 + a.intensity * 0.4);
    ctx.fillStyle = css(shade(hex(t.hue), 0.5), glow);
    ctx.beginPath(); ctx.arc(bx, by, 1.6 + a.intensity * 1.8, 0, TAU); ctx.fill();
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

/** Headless / stubbed-context fallback (tests, jsdom): a cheap direct wash + simple veins/blooms so the
 *  draw path still executes end-to-end without an offscreen canvas (mirrors renderer.ts drawFloor). */
function drawDirectFallback(ctx: Ctx, rs: RenderState, a: Assimilation, alpha: number, towers: Region[], now: number): void {
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
  for (const t of towers) {
    ctx.strokeStyle = css(mix(hex(CORE_HUE), hex(t.hue), 0.5), 0.2 + a.intensity * 0.2); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(nucleusPoint.x, nucleusPoint.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    ctx.fillStyle = css(hex(t.hue), 0.24); ctx.beginPath(); ctx.arc(t.x, t.y, 6 + a.stage * 2, 0, TAU); ctx.fill();
  }
  ctx.restore();
  drawVeinBeats(ctx, a, towers, now, true);
  drawNucleusOrgan(ctx, a, now);
}

// ══ Ambient life (OVER the entities — pure atmosphere, stage-gated so it never clutters readability) ═
/** A few crawling parasites, drifting spores and a rare floating eye — only at deep stages, low alpha,
 *  LOD-gated. Kept sparse + edge-biased so the play-critical centre stays readable. */
export function drawLivingBattlefieldAmbient(ctx: Ctx, a: Assimilation, now: number, detail = true): void {
  if (a.stage < 3 || !detail) return;
  const count = Math.min(12, (a.stage - 2) * 4);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const speed = 0.05 + hash01(i * 3.1) * 0.06;
    const py = (hash01(i * 7.7) + now * speed) % 1;
    const x = 20 + hash01(i * 2.3) * (WIDTH - 40);
    const y = py * HEIGHT;
    const edge = Math.min(1, Math.min(x, WIDTH - x) / (WIDTH * 0.32)); // fade toward centre — protect readability
    const alpha = 0.11 * (1 - edge * 0.7) * a.intensity;
    if (alpha < 0.01) continue;
    const kind = i % 3;
    if (kind === 0) { // drifting spore
      ctx.fillStyle = css([155, 224, 74], alpha); ctx.beginPath(); ctx.arc(x, y, 1.5 + hash01(i) * 1.5, 0, TAU); ctx.fill();
    } else if (kind === 1) { // crawling parasite
      const wig = Math.sin(now * 4 + i) * 3;
      ctx.strokeStyle = css([160, 60, 80], alpha * 1.4); ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.quadraticCurveTo(x, y + wig, x + 3, y); ctx.stroke();
    } else { // floating eye
      const open = Math.max(0, Math.sin(now * 0.6 + i * 2));
      if (open < 0.2) continue;
      ctx.fillStyle = css([235, 225, 215], alpha * 1.6 * open); ctx.beginPath(); ctx.ellipse(x, y, 2.5, 2.5 * open, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = css([20, 8, 12], alpha * 2.4 * open); ctx.beginPath(); ctx.arc(x, y, 1, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}
