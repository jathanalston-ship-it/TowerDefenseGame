// Central battlefield render theme — the one place to retune the game's look or
// swap placeholder silhouettes for production art. The renderer reads tokens from
// here and hardcodes no palette of its own (Part B: "UI assets are themeable,
// icon systems are data-driven").
//
// Lives in src/render so it stays isolated from the sim (src/core) and from the
// React/CSS UI theme (src/index.css) — retheming the arena touches only this file.

import type { EnemyKind, TowerKind } from '../core/types';
import type { BodyForm } from './enemyForms';
import type { ShapeKind } from './vfx';

// COLOUR-STRING MEMO (perf — docs/RENDER-PIPELINE.md §6): the renderer composes thousands of
// dynamic-alpha colours a frame, and formatting + parsing a fresh `rgba()` string per draw was the
// battlefield's top allocation source. Alpha is keyed at RGBA_ALPHA_STEPS (≤ 0.0005 off — well under
// one 8-bit colour level), so pulsing/fading alphas land on a bounded set of cached strings; the
// cache resets past RGBA_CACHE_MAX entries (blended status hues are the only open-ended tokens).
const RGBA_ALPHA_STEPS = 1000;
const RGBA_CACHE_MAX = 50_000;
const rgbaCache = new Map<string, Map<number, string>>();
let rgbaCached = 0;

/** Compose an `rgba()` string from an "r, g, b" token and an alpha (memoized — see above). */
export function rgba(rgb: string, a: number): string {
  const q = Math.round(a * RGBA_ALPHA_STEPS);
  let byAlpha = rgbaCache.get(rgb);
  if (byAlpha === undefined) {
    byAlpha = new Map();
    rgbaCache.set(rgb, byAlpha);
  }
  let s = byAlpha.get(q);
  if (s === undefined) {
    if (rgbaCached >= RGBA_CACHE_MAX) {
      rgbaCache.clear();
      rgbaCached = 0;
      byAlpha = new Map();
      rgbaCache.set(rgb, byAlpha);
    }
    s = `rgba(${rgb}, ${q / RGBA_ALPHA_STEPS})`;
    byAlpha.set(q, s);
    rgbaCached++;
  }
  return s;
}

const hexRgbCache = new Map<string, string>();
/** Convert a `#rgb`/`#rrggbb` hex into an "r, g, b" token for use with rgba().
 * Lets data-driven entity colors (config) feed the alpha-composed render tokens. Memoized (the
 * hot draw loops convert the same few dozen entity colours every frame). */
export function hexRgb(hex: string): string {
  const hit = hexRgbCache.get(hex);
  if (hit !== undefined) return hit;
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const out = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  if (hexRgbCache.size >= 4096) hexRgbCache.clear(); // entity colours are a finite palette; just a backstop
  hexRgbCache.set(hex, out);
  return out;
}

// ── Palette ──────────────────────────────────────────────────────────────────
// Static colors are plain strings; anything drawn with a *dynamic* alpha (pulses,
// pressure ramps) is stored as an "r, g, b" token and composed via rgba() so the
// hue stays themeable in one spot.

export const THEME = {
  // The arena floor: a vertical fall from the hostile void to the warm hive.
  arena: {
    skyStops: ['#0c0a16', '#070a10', '#0a0810', '#150a10'] as const,
    grid: 'rgba(120,150,200,0.05)',
    tile: 'rgba(130,170,220,0.016)', // faint checker so the floor reads as tiles
  },
  // Top "breeding membrane" the swarm pours from.
  spawn: {
    membrane: '150, 70, 220',
    edge: '180, 110, 230',
    haze: 'rgba(140, 70, 190, 0.08)', // bruised, not fresh — the old teal-green haze read healthy
    chevron: 'rgba(180, 120, 230, 0.20)',
    label: 'rgba(196, 150, 238, 0.78)',
  },
  // THE SICK REGISTER (VISUAL_IDENTITY.md §palette) — necrotic hues the PLAYER never owns:
  // enemy flesh, infection, rot. Vital lime (#b6e84a) and healing mints belong to the hive
  // alone; anything hostile that needs a "life" color draws from here instead.
  sick: {
    bile: '#c9ad38', // necrotic amber-bile (artillery chassis, corrupt glands)
    pus: '#d6c65c', // infected secretion (enemy healers)
    sepsis: '#95a050', // olive-drab rot (molds, spore flesh)
    maggot: '#d8cfa0', // pale larval cream
    bruise: '#7a4d8e', // deep contusion violet (membrane depths)
  },
  // The defensive line + the zone the hive is protecting behind it.
  defense: {
    zone: '255, 90, 120',
    line: '255, 110, 140',
    glow: 'rgba(255, 90, 120, 0.9)',
    node: '255, 170, 185', // markers studded along the barrier
    label: '255, 150, 165',
  },
  obstacle: {
    fill: '#13161f',
    rim: '#8ca0c0', // the outcrop's lit rim (biomeGround.paintObstacles; a biome row overrides both)
  },
  // The Hive Core — wounded heartbeat at the bottom-center.
  hive: {
    tendril: '255, 110, 90',
    glow: ['rgba(255, 100, 120, 0.95)', 'rgba(255, 90, 120, 0.35)', 'rgba(255, 90, 120, 0)'] as const,
    shell: 'rgba(255, 150, 170, 0.5)', // rotating protective ring
    body: '#ff5d73',
    core: 'rgba(255,255,255,0.9)',
    label: 'rgba(255, 170, 180, 0.85)',
  },
  // Build pads where towers are placed.
  slot: {
    pad: 'rgba(90, 200, 255, 0.05)',
    padEdge: 'rgba(90, 200, 255, 0.16)',
    bracket: '90, 200, 255',
    locked: 'rgba(120,130,150,0.26)',
    lockedLabel: 'rgba(120,130,150,0.5)',
  },
  // Placement ghost + current-selection feedback.
  select: {
    valid: '120, 200, 255',
    invalid: '255, 80, 80',
    lockedLabel: '#ff8a8a',
  },
  // Targeting / range read-outs.
  target: {
    range: '120, 200, 255',
    ability: '90, 209, 255',
  },
  // Status auras + the enemy health pip.
  enemy: {
    corrosion: 'rgba(150, 220, 70, 0.9)',
    infection: '226, 77, 255', // viral boils (Parasite Nest) — alpha scales with stacks
    disrupt: '120, 135, 255', // psionic stutter (Neural Obelisk)
    fracture: '90, 209, 255',
    shred: '255, 255, 255',
    mark: '255, 120, 160', // Vital Mark (Marrow Siphon) — harvest tag; alpha scales with stacks
    resonance: '245, 184, 61', // Resonant charge (Resonance Coil) — alpha scales with stacks
    danger: '255, 70, 90',
    rim: 'rgba(6, 8, 14, 0.55)', // dark outline so a flat fill reads as a solid unit
    gloss: 'rgba(255, 255, 255, 0.22)', // top highlight (volume)
    hitFlash: '255, 255, 255', // white pop on taking damage
    hpBack: 'rgba(0,0,0,0.55)',
    hpEdge: 'rgba(0,0,0,0.35)',
    hpHigh: '#7CFC9B',
    hpMid: '#ffd24d',
    hpLow: '#ff5d73',
  },
  // The apex predator — its own visual language so a boss reads as a boss.
  boss: {
    glow: 'rgba(255, 60, 90, 0.5)',
    crown: 'rgba(255, 95, 115, 0.92)',
    ring: 'rgba(255, 150, 170, 0.65)',
    rim: 'rgba(28, 0, 8, 0.75)',
  },
  elite: {
    rim: 'rgba(255, 214, 150, 0.6)', // gilded armor edge marks the heavies
  },
  hero: {
    body: '#ffd24d',
    down: '#ff9aa8',
    hpBack: 'rgba(0,0,0,0.55)',
    halo: 'rgba(255, 210, 77, 0.26)', // ground glow under the hero
    rim: 'rgba(90, 60, 0, 0.95)', // dark edge on the core
    core: 'rgba(255, 255, 255, 0.92)', // bright inner core
    locator: '255, 210, 77', // pulsing find-me ring
    trail: '255, 210, 77', // motion afterimages
  },
  projectile: {
    splash: '#d6f06a',
    bolt: '#aef0ff',
    parasite: '#f2a0ff', // skittering viral parasite
    splashTrail: '214, 240, 106',
    boltTrail: '174, 240, 255',
    parasiteTrail: '226, 77, 255',
  },
  pool: {
    fill: 'rgba(150, 220, 70, 0.16)',
    edge: 'rgba(150, 220, 70, 0.35)',
  },
  // Neural Obelisk's psionic field (drawn under the tower so its reach reads).
  field: {
    fill: 'rgba(110, 123, 255, 0.06)',
    edge: '110, 123, 255',
  },
  overcharge: 'rgba(255, 122, 89, 0.45)',
  vignette: '255, 35, 65',
  label: 'rgba(8,11,17,0.85)', // backing plate behind floating text labels
} as const;

// ── Silhouette mapping (data-driven "sprites") ───────────────────────────────
// Each archetype maps to a placeholder shape. Swap an entry to restyle a unit, or
// swap drawShape() in the renderer for a sprite atlas keyed by the same kinds.

export const TOWER_SHAPE: Record<TowerKind, ShapeKind> = {
  needle: 'triangle', // sharp kinetic spike
  mortar: 'square', // heavy caustic block
  reactor: 'circle', // pulsing vital core
  parasite: 'circle', // bulbous egg-sac nest (egg speckles drawn over it)
  obelisk: 'diamond', // tall psionic monolith (orbiting glyphs drawn over it)
  maw: 'hex', // a ringed feeding mouth — the hex reads as clenched jaw plates
  chrysalis: 'diamond', // a faceted amber crystal (warm hue separates it from the obelisk)
  effigy: 'triangle', // a gaunt totem spike (violet, apex-up like a shrine)
  coil: 'hex', // a faceted resonance crystal (amber; a focusing lens + live beam drawn over it)
  siphon: 'hex', // a fleshy ocular pod — the hex reads as a lidded socket around its draining eye
  sower: 'circle', // a swollen seed-pod (blight-green; its planted mines dot the lane around it)
  spire: 'diamond', // a needle-thin synaptic antenna (violet-blue, arcs leap off its tip)
  polyp: 'circle', // a rooted undertow mouth (deep teal, the drag rings ripple around it)
  spitfang: 'triangle', // a sharp kinetic autocannon (aggressive red)
  rift: 'hex', // a faceted void anchor (deep violet, an accretion ring circles it)
  glaive: 'triangle', // a swept wing-blade launcher (ember; the returning glaive spins over the lane)
  roost: 'circle', // a clutch of biomech eggs (amber-gold; its drakes wheel around the perch)
  lung: 'circle', // a swollen breathing sac (plague-pink; its fog bank breathes around it)
  bell: 'bell', // a great chitin bell (bone-bronze; the toll rings visibly outward)
  lancet: 'diamond', // a drawn harpoon rail (sulphur; a narrow blade aimed up the lane)
  basilisk: 'diamond', // the lidless arena eye (violet; a narrow petrifying iris)
  ossuary: 'hex', // the fused-ribcage choir (bone; a heavy chambered organ)
  warren: 'square', // a squat flesh burrow-mound (raw salmon; its thralls shoulder out into the lane)
  tick: 'circle', // a cluster of engorged tick-sacs (plum; the flung ticks arc up-lane)
  quill: 'triangle', // a tall tuned bone quill (verdigris; aimed up the lane like a fork)
};

export const ENEMY_SHAPE: Record<EnemyKind, ShapeKind> = {
  // swarm — small skittering blobs
  runner: 'circle', mite: 'circle', larva: 'circle',
  // early brood — the weak teaching variations (husk reads as a dry plated shell; the flea is a
  // directional speck; mold a broad blob; the skulker a slinking dart)
  husk: 'hex', flea: 'triangle', mold: 'circle', skulker: 'triangle',
  // fast — directional darts
  rusher: 'triangle', darter: 'triangle', lasher: 'triangle',
  // heavy — armored bulk
  brute: 'hex', tank: 'square', golem: 'square', colossus: 'hex',
  // shielded — plated carapace
  bulwark: 'hex', warden: 'square',
  // regenerating
  knitter: 'circle', revenant: 'hex',
  // burrowing — tunnellers (color sets them apart from flyers)
  burrower: 'diamond', molerat: 'diamond',
  // flying — airborne drifters (cystwraith's regen-teal color sets it apart from the others)
  flyer: 'diamond', wisp: 'diamond', gargoyle: 'diamond', cystwraith: 'diamond',
  // summoner
  broodmother: 'hex', hivecaller: 'hex',
  // support
  mender: 'circle', cantor: 'diamond',
  // suicide (sapper is a directional charging bomb → triangle, like the bomber; the cataclyst
  // is a WALKING bomb — heavy square bulk in detonation-red)
  bomber: 'triangle', popper: 'circle', sapper: 'triangle', cataclyst: 'square',
  // artillery (the stratovore flies — diamond like the air wing, in bombard-violet)
  siegeworm: 'square', spitter: 'square', stratovore: 'diamond',
  // summoner hybrid — womb bulk
  broodweaver: 'hex',
  // deep-fauna fusions — shape reads the DOMINANT trait (wall=hex, air=diamond, siege=square, bomb=triangle)
  zealot: 'hex', carrier: 'diamond', entrencher: 'square', oracle: 'diamond', glutling: 'triangle',
  // elite / apex
  apex: 'hex', dreadnought: 'square', tyrant: 'hex',
  // puzzle fauna — shape reads the trait the COUNTER keys on (plate=hex, bomb=triangle, burrow=diamond,
  // siege=square, womb=hex, air=diamond)
  scuttler: 'hex', blightmoth: 'triangle', borer: 'diamond', shellback: 'square', wispmother: 'hex', veilmoth: 'diamond',
};

/** Threat tier drives the unit's render treatment (rim weight, crown, glow). Data
 * here, not branched in the renderer, so reclassifying a unit is a one-line edit. */
export type EnemyTier = 'normal' | 'elite' | 'boss';
export const ENEMY_TIER: Record<EnemyKind, EnemyTier> = {
  // normal — chaff, fast, fragile specialists
  runner: 'normal', mite: 'normal', larva: 'normal',
  husk: 'normal', flea: 'normal', mold: 'normal', skulker: 'normal',
  rusher: 'normal', darter: 'normal', lasher: 'normal',
  bulwark: 'normal', knitter: 'normal', burrower: 'normal', molerat: 'normal',
  flyer: 'normal', wisp: 'normal', mender: 'normal', cantor: 'normal',
  bomber: 'normal', popper: 'normal', spitter: 'normal', sapper: 'normal',
  // elite — heavies + premium specials get a gilded rim
  brute: 'elite', tank: 'elite', golem: 'elite', warden: 'elite',
  revenant: 'elite', gargoyle: 'elite', broodmother: 'elite', hivecaller: 'elite',
  siegeworm: 'elite', apex: 'elite', cystwraith: 'elite', stratovore: 'elite', broodweaver: 'elite', cataclyst: 'elite',
  // deep-fauna fusions — premium multi-trait specials
  zealot: 'elite', carrier: 'elite', entrencher: 'elite', oracle: 'elite', glutling: 'normal',
  // boss — capstones get the crown + glow + containment ring
  colossus: 'boss', dreadnought: 'boss', tyrant: 'boss',
  // puzzle fauna — the single-trait-plus specials stay normal; the multi-role keystones get the rim
  scuttler: 'normal', blightmoth: 'normal', borer: 'elite', shellback: 'elite', wispmother: 'elite', veilmoth: 'elite',
};

// ── Creature BODY FORMS (render/enemyForms.ts) — the procedural silhouette each kind renders as at
//    full detail (the flat ENEMY_SHAPE above is the low-LOD fallback + the bestiary icon). Grouped by
//    archetype; per-kind colour + ENEMY_VARIANT drive the variation within a form. ──
export const ENEMY_BODY: Record<EnemyKind, BodyForm> = {
  // swarm — soft segmented larvae
  runner: 'grub', mite: 'grub', larva: 'grub',
  // early brood — husk wears a dry beetle shell, the flea/skulker are darts, the mold a soft polyp
  husk: 'beetle', flea: 'dart', mold: 'polyp', skulker: 'dart',
  // fast — sleek arrowheads
  rusher: 'dart', darter: 'dart', lasher: 'dart',
  // heavy — domed armoured carapaces (colossus = a colossal beetle juggernaut)
  brute: 'beetle', tank: 'beetle', golem: 'beetle', colossus: 'beetle',
  // shielded — front-plated shells
  bulwark: 'crab', warden: 'crab',
  // regenerating — pulsating knit-sacs
  knitter: 'polyp', revenant: 'polyp',
  // burrowing — clawed tunnellers
  burrower: 'mole', molerat: 'mole',
  // flying — flapping winged drifters (stratovore/carrier fly ⇒ moth reads their dominant trait)
  flyer: 'moth', wisp: 'moth', gargoyle: 'moth', cystwraith: 'moth', stratovore: 'moth', carrier: 'moth',
  // summoner — embryo-laden egg-sacs
  broodmother: 'broodsac', hivecaller: 'broodsac', broodweaver: 'broodsac',
  // support — floating healing anemones
  mender: 'frond', cantor: 'frond', oracle: 'frond',
  // suicide — volatile unstable bulbs
  bomber: 'bulb', popper: 'bulb', sapper: 'bulb', cataclyst: 'bulb', glutling: 'bulb',
  // artillery — dug-in bombards with a raised barrel
  siegeworm: 'mortar', spitter: 'mortar', entrencher: 'mortar',
  // shielded + regen fusion — a plated shell (regen shows as a trait VFX)
  zealot: 'crab',
  // elite / apex — fanged bruiser mass
  apex: 'maw', dreadnought: 'maw', tyrant: 'maw',
  // puzzle fauna (appended — ENEMY_ACCENT round-robins by declaration order, so earlier kinds keep
  // their accents): a plated beetle, two moths (bomb + veil), a clawed tunneller, a dug-in bombard,
  // and an embryo-laden womb
  scuttler: 'beetle', blightmoth: 'moth', borer: 'mole', shellback: 'mortar', wispmother: 'broodsac', veilmoth: 'moth',
};

/** Stable per-kind structural variant (feature counts) — so variants within a form differ in build,
 *  not just hue. A cheap string hash: deterministic, computed once. */
function variantOf(kind: string): number {
  let h = 0;
  for (let i = 0; i < kind.length; i++) h = (Math.imul(h, 31) + kind.charCodeAt(i)) >>> 0;
  return h;
}
export const ENEMY_VARIANT: Record<EnemyKind, number> = Object.fromEntries(
  (Object.keys(ENEMY_BODY) as EnemyKind[]).map((k) => [k, variantOf(k)]),
) as Record<EnemyKind, number>;

/** Silhouette-accent slot (0/1/2) per kind — ROUND-ROBIN within each form family in declaration
 *  order, so same-form kinds always land on different accents (a raw hash lets siblings collide).
 *  Drawers key their seed-accent ladder off this (enemyForms §silhouette accents); a future kind
 *  automatically takes its family's next free slot just by being declared. */
export const ENEMY_ACCENT: Record<EnemyKind, number> = (() => {
  const counts = new Map<string, number>();
  const out = {} as Record<EnemyKind, number>;
  for (const k of Object.keys(ENEMY_BODY) as EnemyKind[]) {
    const form = ENEMY_BODY[k];
    const n = counts.get(form) ?? 0;
    counts.set(form, n + 1);
    out[k] = n % 3;
  }
  return out;
})();
