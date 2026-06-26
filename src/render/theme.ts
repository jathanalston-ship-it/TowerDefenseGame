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
    splashTrail: '214, 240, 106',
    boltTrail: '174, 240, 255',
  },
  pool: {
    fill: 'rgba(150, 220, 70, 0.16)',
    edge: 'rgba(150, 220, 70, 0.35)',
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
};

export const ENEMY_SHAPE: Record<EnemyKind, ShapeKind> = {
  runner: 'circle', // small skittering blob
  brute: 'hex', // armored bulk
  tyrant: 'hex', // boss carapace
  rusher: 'triangle', // fast directional dart
  tank: 'square', // blocky carapace hauler
  flyer: 'diamond', // airborne drifter
  burrower: 'diamond', // tunneller (color sets it apart from the flyer)
};

/** Threat tier drives the unit's render treatment (rim weight, crown, glow). Data
 * here, not branched in the renderer, so reclassifying a unit is a one-line edit. */
export type EnemyTier = 'normal' | 'elite' | 'boss';
export const ENEMY_TIER: Record<EnemyKind, EnemyTier> = {
  runner: 'normal',
  rusher: 'normal',
  flyer: 'normal',
  burrower: 'normal',
  brute: 'elite', // armored heavies get a gilded rim
  tank: 'elite',
  tyrant: 'boss', // the apex predator: crown + glow + containment ring
};
