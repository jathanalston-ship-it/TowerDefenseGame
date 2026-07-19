// LIVING ORGANISM framework (docs/LIVING-BATTLEFIELD.md §organisms) — "the battlefield
// should never appear motionless." A render-side-ONLY layer that gives every tower a
// continuously reacting body: an APPROACH-ALERT scalar (enemies closing in but not yet in
// range — the bridge between idle and combat), a threat BEARING the body leans toward, a
// post-shot RECOVERY settle, an environmental TREMOR fed by nearby deaths / mega-boss
// telegraphs / hive impacts, and per-kind ambient EMISSIONS + VOICE for the ambience
// director. Nothing here reads back into the sim and nothing here mutates RenderState:
// the golden contract stays byte-identical by construction.
//
// FUTURE TOWERS ARE FREE: profiles auto-derive from the tower's body form + combat class
// (formPersona/classPersona below); the per-kind OVERRIDES rows only sharpen identity.
// A new kind gets alert/lean/recovery/tremor/emissions/voice with zero new code.
import { PERF, TOWER_DEFS } from '../core/config';
import type { RenderState } from '../core/game';
import type { TowerKind } from '../core/types';
import { hexRgb, rgba } from './theme';
import { TOWER_FORM, type TowerForm } from './towerForms';
import { glowDisc } from './vfx';

/** Ambient particle family an alert/deep-idle organism sheds (drawn by the renderer). */
export type OrganismEmission = 'none' | 'spores' | 'drips' | 'sparks' | 'drones' | 'crawlers' | 'wisps';
/** Ambient murmur timbre family (audio/sound.ts `org_*` cues — quiet, throttled, never looped). */
export type OrganismVoice = 'heart' | 'breath' | 'bone' | 'acid' | 'spore' | 'chirp' | 'hum';

export interface OrganismProfile {
  /** 0..1 — how strongly the body leans/turns toward the approaching threat. */
  orient: number;
  /** 0..1 — aperture/jaw/petal opening while alert (maws gape, pods flare). */
  gape: number;
  /** 0..1 — internal pressure swell while alert (sacs bulge, ribs expand). */
  swell: number;
  /** 0..1 — idle micro-twitch amplitude. Never 0: even a calm organism breathes unevenly. */
  twitch: number;
  /** 0..1 — susceptibility to environmental shocks (how hard it flinches). */
  tremor: number;
  emission: OrganismEmission;
  voice: OrganismVoice;
}

// ── Auto-derivation: body form → baseline persona (how that anatomy behaves), then the
//    combat class tints the voice. This is the scale contract — 100 towers inherit these.
const FORM_PERSONA: Record<TowerForm, OrganismProfile> = {
  barrel:      { orient: 0.9, gape: 0.1, swell: 0.25, twitch: 0.5, tremor: 0.6, emission: 'none',     voice: 'bone' },
  cannon:      { orient: 0.7, gape: 0.2, swell: 0.5,  twitch: 0.4, tremor: 0.5, emission: 'none',     voice: 'bone' },
  gatling:     { orient: 1,   gape: 0.1, swell: 0.2,  twitch: 0.6, tremor: 0.6, emission: 'sparks',   voice: 'bone' },
  core:        { orient: 0.1, gape: 0,   swell: 0.8,  twitch: 0.45, tremor: 0.5, emission: 'wisps',   voice: 'heart' },
  nest:        { orient: 0.3, gape: 0.3, swell: 0.7,  twitch: 0.8, tremor: 0.7, emission: 'crawlers', voice: 'chirp' },
  monolith:    { orient: 0.15, gape: 0,  swell: 0.35, twitch: 0.3, tremor: 0.35, emission: 'wisps',   voice: 'hum' },
  crystal:     { orient: 0.2, gape: 0,   swell: 0.3,  twitch: 0.3, tremor: 0.3, emission: 'sparks',   voice: 'hum' },
  maw:         { orient: 0.5, gape: 1,   swell: 0.6,  twitch: 0.7, tremor: 0.8, emission: 'drips',    voice: 'breath' },
  lens:        { orient: 0.85, gape: 0.35, swell: 0.3, twitch: 0.35, tremor: 0.4, emission: 'none',   voice: 'hum' },
  pod:         { orient: 0.25, gape: 0.5, swell: 0.9, twitch: 0.6, tremor: 0.7, emission: 'spores',   voice: 'breath' },
  antenna:     { orient: 0.6, gape: 0.15, swell: 0.3, twitch: 0.5, tremor: 0.45, emission: 'sparks',  voice: 'hum' },
  singularity: { orient: 0.1, gape: 0.2,  swell: 0.5, twitch: 0.35, tremor: 0.25, emission: 'wisps',  voice: 'hum' },
};

// Combat class re-voices the murmur (a Caustic barrel hisses acid, not bone).
const CLASS_VOICE: Partial<Record<string, OrganismVoice>> = {
  Caustic: 'acid',
  Viral: 'spore',
  Vital: 'heart',
};

// ── Per-kind OVERRIDES — the identity sharpeners (docs/LIVING-BATTLEFIELD.md §organisms
//    table). Partial rows: anything omitted keeps the derived persona value.
const OVERRIDES: Partial<Record<TowerKind, Partial<OrganismProfile>>> = {
  needle:    { orient: 1, twitch: 0.6 },                                  // spindle tracks the lane, fibres tense
  mortar:    { swell: 0.7, gape: 0.3 },                                   // ribcage expands, tube dilates
  reactor:   { swell: 1, emission: 'wisps' },                             // the heart-organ overpressures
  parasite:  { emission: 'crawlers', twitch: 1, gape: 0.4 },              // broodlings surface and skitter
  obelisk:   { emission: 'wisps', twitch: 0.35 },                         // glyph-light gathers
  maw:       { gape: 1, emission: 'drips', tremor: 0.9 },                 // jaw chatters, saliva ropes
  chrysalis: { swell: 0.8, emission: 'drips', voice: 'acid' },            // amber pressure beads through the shell
  effigy:    { orient: 0.1, twitch: 0.9, voice: 'breath', emission: 'wisps' }, // the scream inhales
  coil:      { emission: 'sparks', voice: 'hum', swell: 0.5 },            // static crawls the windings
  siphon:    { orient: 0.9, gape: 0.6, voice: 'heart', emission: 'drips' }, // the iris dilates, hungry
  sower:     { emission: 'spores', twitch: 0.7, voice: 'spore' },         // seed-husks drift off the tiller
  spire:     { emission: 'sparks', voice: 'hum', twitch: 0.45 },          // arc potential snaps between tines
  polyp:     { swell: 0.85, voice: 'breath', emission: 'wisps' },         // the current inhales the water column
  spitfang:  { orient: 1, twitch: 0.65, emission: 'none' },               // belt-fed fangs index toward the lane
  rift:      { swell: 0.6, emission: 'wisps', voice: 'hum', orient: 0.05 }, // the horizon leans, space puckers
  glaive:    { orient: 0.95, emission: 'sparks', twitch: 0.5 },           // the blade whets its own orbit
  roost:     { emission: 'drones', gape: 0.5, voice: 'chirp' },           // drakelings peek from the brood-holes
  lung:      { swell: 1, gape: 0.6, voice: 'breath', emission: 'spores' }, // the deep inhale before the fog
  bell:      { twitch: 0.4, voice: 'hum', emission: 'wisps' },            // the rim rings sub-audibly
  lancet:    { orient: 1, gape: 0.25, voice: 'bone', emission: 'none' },  // the harpoon draws a bead
  basilisk:  { orient: 0.95, gape: 0.7, voice: 'hum', emission: 'none' }, // the lid peels, the eye fixes
  ossuary:   { twitch: 0.55, voice: 'bone', emission: 'wisps' },          // the choir stirs in the stacks
};

const profileCache = new Map<TowerKind, OrganismProfile>();

/** The merged organism profile for a kind (form persona → class voice → per-kind override). */
export function organismProfile(kind: TowerKind): OrganismProfile {
  const hit = profileCache.get(kind);
  if (hit) return hit;
  const base = FORM_PERSONA[TOWER_FORM[kind]];
  const cls = CLASS_VOICE[TOWER_DEFS[kind].combatClass];
  const p: OrganismProfile = { ...base, ...(cls ? { voice: cls } : {}), ...OVERRIDES[kind] };
  profileCache.set(kind, p);
  return p;
}

/** Sanity bounds for every profile row — a typo can't ship a convulsing battlefield. */
export function organismProblems(kinds: TowerKind[]): string[] {
  const out: string[] = [];
  for (const k of kinds) {
    const p = organismProfile(k);
    for (const f of ['orient', 'gape', 'swell', 'twitch', 'tremor'] as const) {
      const v = p[f];
      if (!(v >= 0 && v <= 1)) out.push(`${k}.${f} = ${v} outside [0,1]`);
    }
    if (p.twitch <= 0) out.push(`${k}.twitch must be > 0 — an organism is never motionless`);
  }
  return out;
}

// ── Runtime state (module cache, keyed by tower id — the goreThrob/enemyMotion pattern).
interface OrgState {
  alert: number;    // eased 0..1 — threat approaching outside range
  bearing: number;  // eased facing (radians; -π/2 = up-field rest)
  bearingW: number; // 0..1 weight behind the bearing (0 ⇒ relax home)
  recover: number;  // 1 → 0 damped settle after a shot
  lastCd: number;   // previous cooldown sample (fire-edge detect)
  tremor: number;   // 0..1 environmental shock, decaying
  seen: number;     // frame stamp for reaping sold/lost towers
  alertTarget?: number; // latest staggered-scan result (holds between scans)
  threatAngle?: number; // bearing of the dominant approaching threat
}
const org = new Map<number, OrgState>();
const REST_BEARING = -Math.PI / 2;

// Render-side tunables (presentation pacing/caps — deliberately NOT in core/config.ts:
// nothing here is game balance).
export const ORGANISM = {
  approachBand: 0.8,   // alert senses enemies in (range, range × (1+band)]
  alertRise: 2.5,      // /s ease toward a rising alert
  alertFall: 4,        // /s ease when the threat passes (combat takes over)
  bearingRate: 3,      // /s angular ease toward the threat
  recoverDecay: 3.2,   // /s exponential settle after a shot
  tremorDecay: 2.8,    // /s environmental shock decay
  shockRadius: 140,    // px — how far a heavy death slams neighbours
  shockMin: 0.55,      // overkill below this doesn't register (routine kills stay calm)
  scanEvery: 6,        // frames between per-tower proximity scans (staggered by id)
  scanEveryCrowded: 12, // scan cadence past the LOD line
  ambientGapMs: 2600,  // floor between ambience cues
  ambientDinCap: 26,   // enemies on field beyond which murmurs are pointless (combat covers them)
} as const;

let frame = 0;
let lastT = -1;
let lastDeathSeq = -1;
let lastCastSeq = -1;
let lastMegaPhase = -1;
let megaRumble = 0; // battlefield-wide floor while a mega telegraph winds up / phase turns

// Positional shocks are queued here and applied radially during the tower pass below.
const pendingShocks: { x: number; y: number; s: number }[] = [];
function shock(x: number, y: number, strength: number): void {
  if (pendingShocks.length < 24) pendingShocks.push({ x, y, s: Math.min(1, strength) });
}

/** One pass per frame, BEFORE the tower draw loop. Reads rs, never writes it. */
export function updateOrganisms(rs: RenderState): void {
  frame++;
  const t = rs.time;
  const dt = lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - lastT));
  lastT = t;
  const detail = rs.enemies.length < PERF.lodEnemyCount;
  const scanEvery = detail ? ORGANISM.scanEvery : ORGANISM.scanEveryCrowded;

  // Environmental feeds → pending shock pulses (positional) + the global mega rumble.
  for (const d of rs.deathEvents) {
    if (d.seq <= lastDeathSeq) continue;
    lastDeathSeq = d.seq;
    if (d.overkill >= ORGANISM.shockMin || d.bounty >= 24) shock(d.x, d.y, 0.35 + d.overkill * 0.45);
  }
  for (const c of rs.castEvents) {
    if (c.seq <= lastCastSeq) continue;
    lastCastSeq = c.seq;
    if (c.slot === 'ult') shock(c.x, c.y, 0.5); // a hero ultimate makes nearby organs pulse
  }
  if (rs.megaBoss) {
    const m = rs.megaBoss;
    if (m.phase !== lastMegaPhase) { megaRumble = Math.max(megaRumble, 0.85); lastMegaPhase = m.phase; } // the roar
    const tele = m.telegraph ? 0.25 + m.telegraph.frac * 0.35 : 0.12; // the whole biome braces
    megaRumble = Math.max(megaRumble * Math.exp(-dt * 1.6), tele);
  } else {
    lastMegaPhase = -1;
    megaRumble *= Math.exp(-dt * 1.6);
  }
  const hivePulse = rs.hiveHitPulse * 0.3; // core impacts shudder the garrison floor

  const recoverK = Math.exp(-dt * ORGANISM.recoverDecay);
  const tremorK = Math.exp(-dt * ORGANISM.tremorDecay);

  for (const tw of rs.towers) {
    let st = org.get(tw.id);
    if (!st) {
      st = { alert: 0, bearing: REST_BEARING, bearingW: 0, recover: 0, lastCd: tw.cooldown, tremor: 0, seen: frame };
      org.set(tw.id, st);
    }
    st.seen = frame;

    // Fire edge: the cooldown JUMPS up when a shot releases → arm the recovery settle.
    const def = TOWER_DEFS[tw.kind];
    if (def.fireInterval > 0 && tw.cooldown > st.lastCd + def.fireInterval * 0.4) st.recover = 1;
    st.lastCd = tw.cooldown;
    st.recover *= recoverK;

    // Environmental tremor: positional pulses + the mega/hive floors.
    for (const p of pendingShocks) {
      const d = Math.hypot(p.x - tw.x, p.y - tw.y);
      if (d < ORGANISM.shockRadius) st.tremor = Math.min(1, st.tremor + p.s * (1 - d / ORGANISM.shockRadius));
    }
    st.tremor = Math.max(st.tremor * tremorK, megaRumble * 0.5, hivePulse);

    // Staggered approach scan: the O(T×E) proximity pass runs ~1/scanEvery frames per tower.
    if ((frame + tw.id) % scanEvery === 0) {
      const range = rs.effectiveRanges[tw.kind] ?? def.range;
      const outer = range * (1 + ORGANISM.approachBand);
      let best = 0;
      let bx = 0;
      let by = 0;
      for (const e of rs.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - tw.x, e.y - tw.y);
        if (d <= range) { best = 0; bx = e.x; by = e.y; break; } // in range ⇒ combat owns the body (alert exhales)
        if (d < outer) {
          const closeness = 1 - (d - range) / (outer - range);
          if (closeness > best) { best = closeness; bx = e.x; by = e.y; }
        }
      }
      st.alertTarget = best;
      if (bx !== 0 || by !== 0) st.threatAngle = Math.atan2(by - tw.y, bx - tw.x);
    }

    // Ease alert toward its target (rise deliberate, fall fast — combat snaps the body over).
    const target = st.alertTarget ?? 0;
    const rate = target > st.alert ? ORGANISM.alertRise : ORGANISM.alertFall;
    st.alert += (target - st.alert) * Math.min(1, dt * rate);

    // Bearing: lean toward the threat while one exists; relax home when calm.
    const want = st.threatAngle ?? REST_BEARING;
    const wantW = Math.max(st.alert, target > 0 ? 0.3 : 0);
    st.bearingW += (wantW - st.bearingW) * Math.min(1, dt * 2.5);
    let da = want - st.bearing;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    st.bearing += da * Math.min(1, dt * ORGANISM.bearingRate);
  }
  pendingShocks.length = 0;

  // Reap organisms whose towers are gone (sold/destroyed) — the enemyMotion pattern.
  if (org.size > rs.towers.length) {
    for (const [id, st] of org) if (st.seen !== frame) org.delete(id);
  }
}

/** The per-tower organism state for the draw pass (undefined until first update). */
export function organismOf(id: number): Readonly<OrgState> | undefined {
  return org.get(id);
}

/** Approach-alert 0..1 for a tower (0 until the layer has seen it) — the emission driver. */
export function organismAlert(id: number): number {
  return org.get(id)?.alert ?? 0;
}

/** Aggregate battlefield nerves 0..1 (max tower alert) — the ambience director's pressure read. */
export function battlefieldNerves(): number {
  let n = 0;
  for (const [, st] of org) n = Math.max(n, st.alert);
  return n;
}

/** The composed pose for a body: one transform the renderer applies around the whole tower
 *  draw. Subtlety is enforced HERE (amplitude caps), not at every call site. */
export interface OrganismPose {
  dx: number; // lean offset px
  dy: number;
  rot: number; // lean rotation (radians, capped ±0.09)
  scaleX: number;
  scaleY: number;
}
export function organismPose(kind: TowerKind, id: number, r: number, now: number): OrganismPose {
  const st = org.get(id);
  if (!st) return { dx: 0, dy: 0, rot: 0, scaleX: 1, scaleY: 1 };
  const p = organismProfile(kind);
  const alert = st.alert;
  // Threat lean: a couple of px toward the bearing + a capped rotation "turn".
  const lean = p.orient * alert * st.bearingW;
  const dx = Math.cos(st.bearing) * lean * r * 0.12;
  const dy = Math.sin(st.bearing) * lean * r * 0.08;
  const rot = (st.bearing - REST_BEARING) * Math.min(0.14, p.orient * 0.14) * alert * st.bearingW;
  // Pressure swell + aperture gape (asymmetric scale), tension micro-twitch, recovery wobble,
  // environmental tremor jitter — all small, all summed into one scale pair.
  const swell = 1 + p.swell * alert * 0.05;
  const gapeY = 1 + p.gape * alert * 0.05;
  const twitch = p.twitch * (0.004 + alert * 0.004) * Math.sin(now * 11 + id * 2.6);
  const wobble = st.recover > 0.02 ? Math.sin((1 - st.recover) * 14) * st.recover * 0.024 : 0;
  const tremX = st.tremor > 0.02 ? Math.sin(now * 37 + id * 3.1) * st.tremor * p.tremor * r * 0.05 : 0;
  const tremY = st.tremor > 0.02 ? Math.cos(now * 41 + id * 1.7) * st.tremor * p.tremor * r * 0.035 : 0;
  return {
    dx: dx + tremX,
    dy: dy + tremY,
    rot: Math.max(-0.09, Math.min(0.09, rot)),
    scaleX: swell * (1 + twitch + wobble),
    scaleY: swell * gapeY * (1 - twitch + wobble),
  };
}

// ── Ambient EMISSIONS (docs/LIVING-BATTLEFIELD.md §organisms): the per-family particle
//    language, drawn by the renderer per tower. Deterministic trig of (now, id, i) — zero
//    allocations, zero retained state — and amplitude rides `life` (max of alert and
//    deep-idle), so combat exhales them and stillness never fully sets in.
export function drawOrganismEmissions(
  ctx: CanvasRenderingContext2D,
  kind: TowerKind,
  id: number,
  x: number,
  y: number,
  r: number,
  color: string,
  now: number,
  life: number,
): void {
  const p = organismProfile(kind);
  if (p.emission === 'none' || life < 0.12) return;
  const rgb = hexRgb(color);
  switch (p.emission) {
    case 'spores': { // tiny spore motes lift off the cap and disperse
      for (let i = 0; i < 3; i++) {
        const ph = (now * 0.32 + id * 0.29 + i * 0.37) % 1;
        const a = id * 2.1 + i * 2.4 + Math.sin(now * 0.7 + i) * 0.6;
        glowDisc(ctx, x + Math.cos(a) * r * (0.4 + ph * 0.9), y - r * (0.5 + ph * 1.4), 1.8 * (1 - ph) + 0.4, rgba(rgb, 0.34 * (1 - ph) * life));
      }
      break;
    }
    case 'drips': { // a bead swells at the aperture, ropes down, lets go
      const ph = (now * 0.55 + id * 0.41) % 1;
      const grow = Math.min(1, ph / 0.6);
      const fall = ph > 0.6 ? (ph - 0.6) / 0.4 : 0;
      const bx = x + Math.sin(id * 3.7) * r * 0.22;
      glowDisc(ctx, bx, y + r * (0.35 + fall * 1.1), (0.8 + grow * 1.3) * (1 - fall * 0.5), rgba(rgb, 0.4 * (1 - fall) * life));
      break;
    }
    case 'sparks': { // brief static glints crawling the surface
      for (let i = 0; i < 2; i++) {
        const ph = (now * 1.7 + id * 0.53 + i * 0.5) % 1;
        if (ph > 0.22) continue; // mostly dark — glints, not a glitter loop
        const a = Math.floor(now * 1.7 + id * 0.53 + i * 0.5) * 2.39996 + id; // hops each cycle
        glowDisc(ctx, x + Math.cos(a) * r * 0.7, y - r * 0.2 + Math.sin(a) * r * 0.55, 1.4, rgba(rgb, 0.55 * (1 - ph / 0.22) * life));
      }
      break;
    }
    case 'drones': { // a drakeling peeks from the brood-hole, hovers, ducks back
      const cyc = (now * 0.21 + id * 0.47) % 1;
      const out = cyc < 0.25 ? cyc / 0.25 : cyc < 0.75 ? 1 : (1 - cyc) / 0.25; // emerge—hover—retreat
      if (out > 0.05) {
        const ha = id * 1.9 + Math.floor(now * 0.21 + id * 0.47) * 1.3;
        const hx = x + Math.cos(ha) * r * 0.55;
        const hy = y - r * (0.5 + out * 0.55) + Math.sin(now * 6 + id) * 1.2 * out;
        glowDisc(ctx, hx, hy, 2 * out, rgba(rgb, 0.5 * out * life));
        ctx.fillStyle = rgba(rgb, 0.75 * out * life);
        ctx.fillRect(hx - 1, hy - 1, 2, 2); // the wingbody speck over its glow
      }
      break;
    }
    case 'crawlers': { // broodlings skitter along the rooted base
      for (let i = 0; i < 2; i++) {
        const ph = (now * (0.5 + i * 0.17) + id * 0.71 + i * 0.5) % 1;
        const a = ph * Math.PI * 2 + id;
        const jit = Math.sin(now * 13 + i * 5 + id) * 0.8; // skitter, not glide
        ctx.fillStyle = rgba(rgb, 0.55 * life);
        ctx.fillRect(x + Math.cos(a) * r * 0.85 + jit - 1, y + r * 0.55 + Math.sin(a) * r * 0.22 - 1, 2, 2);
      }
      break;
    }
    case 'wisps': { // soft lumen motes spiral up the body
      for (let i = 0; i < 2; i++) {
        const ph = (now * 0.26 + id * 0.33 + i * 0.5) % 1;
        const a = ph * Math.PI * 3 + id + i * Math.PI;
        glowDisc(ctx, x + Math.cos(a) * r * (0.6 - ph * 0.25), y + r * 0.3 - ph * r * 1.5, 1.9 * (1 - ph * 0.6), rgba(rgb, 0.3 * (1 - ph) * life));
      }
      break;
    }
  }
}

// ── Ambience director (docs/LIVING-BATTLEFIELD.md §organisms/audio): sparse, quiet,
//    layered one-shots — never loops. GameView polls once per frame and cues the tag.
let lastCueAtMs = 0;
let cueRotor = 0;
export function pollAmbientCue(rs: RenderState, nowMs: number): string | null {
  if (nowMs - lastCueAtMs < ORGANISM.ambientGapMs) return null;
  if (rs.enemies.length > ORGANISM.ambientDinCap) return null; // combat din owns the mix
  // Candidates: the alert towers first (anticipation murmurs), else a deep-idle breather.
  const alert: TowerKind[] = [];
  const calm: TowerKind[] = [];
  for (const tw of rs.towers) {
    const st = org.get(tw.id);
    if (!st) continue;
    if (st.alert > 0.35) alert.push(tw.kind);
    else if ((tw.prep ?? 0) > 0.9) calm.push(tw.kind);
  }
  const pool = alert.length > 0 ? alert : calm;
  if (pool.length === 0) return null;
  // Calm breaths are rarer than anticipation murmurs (idle must stay unobtrusive).
  if (alert.length === 0 && nowMs - lastCueAtMs < ORGANISM.ambientGapMs * 2.5) return null;
  const kind = pool[cueRotor++ % pool.length];
  lastCueAtMs = nowMs;
  return `org_${organismProfile(kind).voice}`;
}

/** Test/dev hook: drop all runtime state (fresh battlefield). */
export function __resetOrganisms(): void {
  org.clear();
  frame = 0;
  lastT = -1;
  lastDeathSeq = -1;
  lastCastSeq = -1;
  lastMegaPhase = -1;
  megaRumble = 0;
  pendingShocks.length = 0;
  lastCueAtMs = 0;
  cueRotor = 0;
}
