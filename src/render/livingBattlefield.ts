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

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

// ── Tunables (the whole balance of the effect lives here) ────────────────────────────────────────
const STAGE_THRESHOLDS = [0, 10, 24, 46, 80, 130] as const; // hidden biomass value → stage boundaries
export const STAGE_COUNT = 6; // stages 0..5
export const STAGE_NAMES = ['Dormant', 'Seeded', 'Spreading', 'Infested', 'Assimilated', 'Living'] as const;
const SCAR_CAP = 48; // pooled ground scars (perf ceiling)
const REGION_CAP = 16; // most regional blooms drawn per frame (LOD drops this under load)

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

/** Pure: fold the whole run into a hidden biomass value, a stage, and the regional hotspots. */
export function computeAssimilation(rs: RenderState, ctx: LBContext): Assimilation {
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

  const { stage: rawStage, progress: rawProg } = stageFor(value);
  const stage = stageOverride != null ? stageOverride : rawStage;
  const progress = stageOverride != null ? 1 : rawProg;
  const intensity = Math.min(1, (stage + progress) / STAGE_COUNT);

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
  return { value, stage, progress, intensity, regions, dominant, dominantHue: MOTIF_HUE[dominant] };
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

// ══ Cached membrane (the expensive full-field flesh texture — rebuilt only when stage or biome flips) ═
let membrane: HTMLCanvasElement | null = null;
let membraneKey = '';
const MEMB_SCALE = 0.5; // soft organic wash — half-res is invisible and halves the blit cost

function buildMembrane(stage: number, tint: Col | null): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(WIDTH * MEMB_SCALE));
  c.height = Math.max(1, Math.round(HEIGHT * MEMB_SCALE));
  const g = c.getContext('2d')!;
  g.scale(MEMB_SCALE, MEMB_SCALE);
  let base: Col = [58, 26, 34]; // dark flesh
  let hi: Col = [120, 46, 60];
  if (tint) { base = mix(base, tint, 0.28); hi = mix(hi, tint, 0.34); } // biome adaptation: consume, don't overwrite
  const blotches = 40 + stage * 26;
  for (let i = 0; i < blotches; i++) {
    const h1 = hash01(i * 1.7 + stage), h2 = hash01(i * 3.3 + 5), h3 = hash01(i * 5.1 + 9);
    const x = h1 * WIDTH;
    const y = h2 * HEIGHT;
    // denser toward the bottom (the hive) and around the fixed nucleus point
    const bottom = y / HEIGHT;
    const dN = Math.hypot(x - nucleusPoint.x, y - nucleusPoint.y) / WIDTH;
    const dens = 0.35 + bottom * 0.5 + Math.max(0, 0.4 - dN);
    if (h3 > dens) continue;
    const rr = (18 + h3 * 60) * (0.6 + stage * 0.12);
    const rad = g.createRadialGradient(x, y, 0, x, y, rr);
    const col = mix(base, hi, h1);
    rad.addColorStop(0, css(col, 0.5));
    rad.addColorStop(1, css(base, 0));
    g.fillStyle = rad;
    g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
  }
  // faint capillary filaments across the membrane
  g.lineWidth = 1;
  for (let i = 0; i < 10 + stage * 6; i++) {
    const h = hash01(i * 8.1 + stage * 2);
    let x = h * WIDTH, y = hash01(i * 2.7) * HEIGHT;
    g.strokeStyle = css(shade(hi, 0.1), 0.12);
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (hash01(i + k * 3.1) - 0.5) * 70; y += (hash01(i + k * 7.7) - 0.5) * 70; g.lineTo(x, y); }
    g.stroke();
  }
  return c;
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

// ══ Draw — the whole under-entity terrain layer ══════════════════════════════════════════════════
/** Draws the living battlefield BENEATH the entities. Returns the computed assimilation (for the HUD/
 *  audio). Fully inert at Stage 0 ⇒ the original clean arena (and always render-only ⇒ golden-safe). */
export function drawLivingBattlefield(ctx: Ctx, rs: RenderState, data: LBContext, now: number, detail = true): Assimilation {
  const a = computeAssimilation(rs, data);
  lastAssim = a;
  if (!enabled) return a; // dev toggle: computed (readout still live) but nothing drawn
  // Self-reset on run restart (sim time rewound), then advance scar lifetimes by elapsed SIM time (so
  // they hold while the game is paused). `now` (wall-clock seconds) drives animation; `rs.time` decay.
  if (rs.time + 0.001 < lastTime) resetLivingBattlefield();
  const simDt = Math.max(0, Math.min(0.2, rs.time - lastTime));
  lastTime = rs.time;
  ingestScars(rs, a.stage, simDt);

  if (a.stage <= 0 && scars.length === 0) return a; // Stage 0, no history ⇒ nothing drawn

  drawScars(ctx, a, now);
  if (a.stage <= 0) return a;

  drawMembrane(ctx, rs, a, now);
  drawArteries(ctx, a, now, detail);
  drawRegions(ctx, a, now, detail);
  drawNucleusOrgan(ctx, a, now);
  return a;
}

function drawMembrane(ctx: Ctx, rs: RenderState, a: Assimilation, now: number): void {
  const tint = resolveAccent(rs.biome.accent);
  const breathe = 0.9 + 0.1 * Math.sin(now * 1.3); // the ground BREATHES
  const alpha = Math.min(0.6, a.intensity * 0.7) * breathe;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (typeof document === 'undefined') { // headless/stubbed (tests): direct wash, no offscreen cache (mirrors drawFloor)
    ctx.fillStyle = css(tint ? mix([58, 26, 34], tint, 0.28) : [58, 26, 34], 0.5);
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  } else {
    const key = `${a.stage}:${rs.biome.id}`;
    if (!membrane || membraneKey !== key) { membrane = buildMembrane(a.stage, tint); membraneKey = key; }
    ctx.drawImage(membrane, 0, 0, WIDTH, HEIGHT);
  }
  ctx.restore();
}

/** Arteries: pulsing veins from the nucleus out to each tower region, with a heartbeat travelling along. */
function drawArteries(ctx: Ctx, a: Assimilation, now: number, detail: boolean): void {
  const core = a.regions.find((r) => r.kind === 'core')!;
  const towers = a.regions.filter((r) => r.kind === 'tower');
  const max = detail ? towers.length : Math.min(6, towers.length);
  const beat = (now % 1.15) / 1.15; // shared ~1.15s heartbeat
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < max; i++) {
    const t = towers[i];
    const midx = (core.x + t.x) / 2 + Math.sin(now * 0.5 + t.seed) * 14;
    const midy = (core.y + t.y) / 2 + Math.cos(now * 0.4 + t.seed) * 14;
    const w = 0.8 + a.intensity * 2.2 + Math.min(2, t.strength * 0.18);
    ctx.strokeStyle = css(mix(hex(CORE_HUE), hex(t.hue), 0.5), 0.14 + a.intensity * 0.16);
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(core.x, core.y); ctx.quadraticCurveTo(midx, midy, t.x, t.y); ctx.stroke();
    // heartbeat pulse: a bright bead running core→tower
    const bt = (beat + hash01(t.seed)) % 1;
    const bx = quad(core.x, midx, t.x, bt), by = quad(core.y, midy, t.y, bt);
    ctx.fillStyle = css(shade(hex(t.hue), 0.4), (1 - bt) * 0.5 * (0.3 + a.intensity));
    ctx.beginPath(); ctx.arc(bx, by, 1.5 + a.intensity * 1.5, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function quad(a: number, b: number, c: number, t: number): number { const u = 1 - t; return u * u * a + 2 * u * t * b + t * t * c; }

/** Regional blooms — each hotspot grows its motif out of the ground, sized by strength × stage. */
function drawRegions(ctx: Ctx, a: Assimilation, now: number, detail: boolean): void {
  const list = a.regions.filter((r) => r.kind !== 'core');
  const cap = detail ? REGION_CAP : 8;
  const n = Math.min(cap, list.length);
  for (let i = 0; i < n; i++) drawBloom(ctx, list[i], a, now);
}

function drawBloom(ctx: Ctx, r: Region, a: Assimilation, now: number): void {
  const grow = (0.5 + a.stage * 0.5 + a.progress * 0.3) * (0.7 + Math.min(2.2, r.strength * 0.16));
  const base = 10 * grow;
  const alpha = 0.16 + a.intensity * 0.24;
  const col = hex(r.hue);
  const wob = Math.sin(now * 1.6 + r.seed) * 0.06;
  ctx.save();
  ctx.translate(r.x, r.y);
  switch (r.motif) {
    case 'bone': {
      ctx.strokeStyle = css(col, alpha + 0.1); ctx.lineWidth = 1.4;
      for (let k = 0; k < 5; k++) { const ang = (k / 5) * TAU + r.seed; const len = base * (0.7 + hash01(r.seed + k) * 0.6);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len); ctx.stroke(); }
      break;
    }
    case 'crystal': {
      ctx.fillStyle = css(shade(col, 0.1), alpha);
      for (let k = 0; k < 4; k++) { const ang = (k / 4) * TAU + wob + r.seed; const len = base * (0.6 + hash01(r.seed + k) * 0.7);
        ctx.beginPath(); ctx.moveTo(Math.cos(ang) * len, Math.sin(ang) * len);
        ctx.lineTo(Math.cos(ang + 0.4) * len * 0.4, Math.sin(ang + 0.4) * len * 0.4);
        ctx.lineTo(Math.cos(ang - 0.4) * len * 0.4, Math.sin(ang - 0.4) * len * 0.4); ctx.closePath(); ctx.fill(); }
      break;
    }
    case 'spore': {
      for (let k = 0; k < 6; k++) { const ang = hash01(r.seed + k) * TAU; const d = base * (0.3 + hash01(r.seed + k * 3) * 0.8);
        const pr = 1.5 + hash01(r.seed + k * 7) * 3 + Math.sin(now * 2 + k) * 0.6;
        ctx.fillStyle = css(col, alpha); ctx.beginPath(); ctx.arc(Math.cos(ang) * d, Math.sin(ang) * d, pr, 0, TAU); ctx.fill(); }
      break;
    }
    case 'root': {
      ctx.strokeStyle = css(col, alpha); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      for (let k = 0; k < 5; k++) { let ang = (k / 5) * TAU + r.seed; let x = 0, y = 0; ctx.beginPath(); ctx.moveTo(0, 0);
        for (let s = 0; s < 3; s++) { const step = base * 0.5; ang += (hash01(r.seed + k * 5 + s) - 0.5) * 1.2; x += Math.cos(ang) * step; y += Math.sin(ang) * step; ctx.lineTo(x, y); } ctx.stroke(); }
      break;
    }
    case 'chitin': {
      ctx.fillStyle = css(shade(col, -0.1), alpha);
      for (let k = 0; k < 3; k++) { const ang = (k / 3) * TAU + wob; const d = base * 0.5;
        hexPath(ctx, Math.cos(ang) * d, Math.sin(ang) * d, base * 0.5); ctx.fill(); }
      break;
    }
    case 'ember': {
      const puls = 0.7 + 0.3 * Math.sin(now * 3 + r.seed);
      const rad = ctx.createRadialGradient(0, 0, 0, 0, 0, base);
      rad.addColorStop(0, css(shade(col, 0.3), alpha * puls)); rad.addColorStop(1, css(col, 0));
      ctx.fillStyle = rad; ctx.beginPath(); ctx.arc(0, 0, base, 0, TAU); ctx.fill();
      ctx.strokeStyle = css(shade(col, 0.4), alpha * 0.6 * puls); ctx.lineWidth = 1;
      for (let k = 0; k < 3; k++) { const ang = hash01(r.seed + k) * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang) * base, Math.sin(ang) * base); ctx.stroke(); }
      break;
    }
    default: { // vein / flesh — a breathing translucent sac with a rim
      const rr = base * (1 + wob);
      const rad = ctx.createRadialGradient(0, 0, rr * 0.2, 0, 0, rr);
      rad.addColorStop(0, css(shade(col, 0.15), alpha)); rad.addColorStop(1, css(col, 0));
      ctx.fillStyle = rad; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.fill();
      ctx.strokeStyle = css(col, alpha * 0.8); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, rr * 0.7, 0, TAU); ctx.stroke();
    }
  }
  ctx.restore();
}
function hexPath(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.closePath();
}

/** The nucleus grows into the run's central ORGAN: spreading roots, pulsing sacs, blinking eyes, a heartbeat. */
function drawNucleusOrgan(ctx: Ctx, a: Assimilation, now: number): void {
  const { x, y } = nucleusPoint;
  const s = a.stage + a.progress; // 0..~5.x continuous growth
  const beat = 1 + 0.05 * Math.sin(now * 5.2); // fast heartbeat scale
  const col = hex(CORE_HUE);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(beat, beat);
  // roots reaching outward (length grows with the run)
  const roots = 6 + Math.floor(s * 2);
  ctx.strokeStyle = css(col, 0.12 + a.intensity * 0.18); ctx.lineWidth = 1.5 + a.intensity * 2; ctx.lineCap = 'round';
  for (let k = 0; k < roots; k++) {
    let ang = (k / roots) * TAU + Math.sin(now * 0.3 + k) * 0.1; let px = 0, py = 0;
    const len = (18 + s * 14) * (0.6 + hash01(k * 3.3) * 0.7);
    ctx.beginPath(); ctx.moveTo(0, 0);
    for (let seg = 1; seg <= 3; seg++) { ang += Math.sin(now * 0.6 + k + seg) * 0.18; const d = len / 3; px += Math.cos(ang) * d; py += Math.sin(ang) * d; ctx.lineTo(px, py); }
    ctx.stroke();
  }
  // organ sacs
  const sacs = Math.floor(s);
  for (let k = 0; k < sacs; k++) {
    const ang = (k / Math.max(1, sacs)) * TAU + now * 0.2; const d = 14 + (k % 3) * 6;
    const pr = 4 + 2 * Math.sin(now * 2 + k);
    const rad = ctx.createRadialGradient(Math.cos(ang) * d, Math.sin(ang) * d, 0, Math.cos(ang) * d, Math.sin(ang) * d, pr + 4);
    rad.addColorStop(0, css(shade(col, 0.2), 0.4 * a.intensity)); rad.addColorStop(1, css(col, 0));
    ctx.fillStyle = rad; ctx.beginPath(); ctx.arc(Math.cos(ang) * d, Math.sin(ang) * d, pr + 4, 0, TAU); ctx.fill();
  }
  // blinking eyes (stage ≥ 3) — the core watches
  if (a.stage >= 3) {
    const eyes = a.stage - 1;
    for (let k = 0; k < eyes; k++) {
      const ang = hash01(k * 9.1) * TAU; const d = 10 + hash01(k * 2.2) * 12;
      const ex = Math.cos(ang) * d, ey = Math.sin(ang) * d;
      const open = Math.max(0, Math.sin(now * 0.8 + k * 2)); // slow blink
      if (open < 0.12) continue;
      ctx.fillStyle = css([240, 230, 220], 0.5 * open); ctx.beginPath(); ctx.ellipse(ex, ey, 3, 3 * open, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = css([20, 8, 12], 0.9 * open); ctx.beginPath(); ctx.arc(ex, ey, 1.3, 0, TAU); ctx.fill();
    }
  }
  // heartbeat ring
  const pr = ((now % 1.15) / 1.15);
  ctx.strokeStyle = css(col, (1 - pr) * 0.25 * a.intensity); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 8 + pr * (20 + s * 6), 0, TAU); ctx.stroke();
  ctx.restore();
}

/** Ground scars — permanent boss/mega craters + fading combat scorch (drawn under everything). */
function drawScars(ctx: Ctx, a: Assimilation, now: number): void {
  const master = a.stage <= 0 ? 0.4 : 0.6 + a.intensity * 0.4; // faint if the field is barely awake
  for (const s of scars) {
    const life = s.perm ? 1 : Math.min(1, s.life / s.max);
    const puls = s.perm ? 0.9 + 0.1 * Math.sin(now * 1.5 + s.seed) : 1;
    const rr = s.r * (s.perm ? 1 : 0.6 + life * 0.4) * puls;
    const rad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rr);
    rad.addColorStop(0, css(shade(s.hue, -0.4), 0.28 * life * master));
    rad.addColorStop(0.6, css(shade(s.hue, -0.2), 0.16 * life * master));
    rad.addColorStop(1, css(s.hue, 0));
    ctx.fillStyle = rad; ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, TAU); ctx.fill();
    if (s.perm) { // permanent scars keep a biomechanical rim
      ctx.strokeStyle = css(shade(s.hue, 0.2), 0.2 * master); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, rr * 0.8, 0, TAU); ctx.stroke();
    }
  }
}

// ══ Ambient life (OVER the entities — pure atmosphere, stage-gated so it never clutters readability) ═
/** A few crawling parasites, drifting spores and a rare floating eye — only at deep stages, low alpha,
 *  LOD-gated. Kept sparse + edge-biased so the play-critical centre stays readable. */
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
    const alpha = 0.10 * (1 - edge * 0.7) * a.intensity;
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

void CELL; // reserved for future cell-aligned terraforming; kept imported for map-scale intent
