// Central battlefield render theme — the one place to retune the game's look or
// swap placeholder silhouettes for production art. The renderer reads tokens from
// here and hardcodes no palette of its own (Part B: "UI assets are themeable,
// icon systems are data-driven").
//
// Lives in src/render so it stays isolated from the sim (src/core) and from the
// React/CSS UI theme (src/index.css) — retheming the arena touches only this file.

import type { EnemyKind, TowerKind } from '../core/types';
import type { ShapeKind } from './vfx';

/** Compose an `rgba()` string from an "r, g, b" token and an alpha. */
export function rgba(rgb: string, a: number): string {
  return `rgba(${rgb}, ${a})`;
}

/** Convert a `#rgb`/`#rrggbb` hex into an "r, g, b" token for use with rgba().
 * Lets data-driven entity colors (config) feed the alpha-composed render tokens. */
export function hexRgb(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
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
    haze: 'rgba(70, 180, 140, 0.08)',
    chevron: 'rgba(180, 120, 230, 0.20)',
    label: 'rgba(196, 150, 238, 0.78)',
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
    edge: 'rgba(120,140,170,0.18)',
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
};

export const ENEMY_SHAPE: Record<EnemyKind, ShapeKind> = {
  // swarm — small skittering blobs
  runner: 'circle', mite: 'circle', larva: 'circle',
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
};

/** Threat tier drives the unit's render treatment (rim weight, crown, glow). Data
 * here, not branched in the renderer, so reclassifying a unit is a one-line edit. */
export type EnemyTier = 'normal' | 'elite' | 'boss';
export const ENEMY_TIER: Record<EnemyKind, EnemyTier> = {
  // normal — chaff, fast, fragile specialists
  runner: 'normal', mite: 'normal', larva: 'normal',
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
};
