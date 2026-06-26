// Biome framework. A biome is pure data — a visual palette + lighting, an enemy
// spawn weighting, obstacle-generation tendencies, favored environmental modifiers,
// and ambient settings. Biomes feel mechanically different WITHOUT unique enemies:
// the difference comes from which existing archetypes they favor, what the arena
// looks like, and which modifiers they roll. Adding a biome = one entry here.

import type { EnemyKind } from './types';

export type BiomeId = 'wasteland' | 'corporate' | 'marsh' | 'bone' | 'machine';

/** RGB triplet "r, g, b" string fragment (used as `rgba(${t}, a)` by the renderer). */
export type Rgb = readonly [number, number, number];

export interface BiomePalette {
  /** 4 vertical gradient stops, hostile sky (top) → fleshy floor (bottom). */
  sky: readonly [string, string, string, string];
  membrane: Rgb; // top spawn membrane
  fog: Rgb; // drifting fog banks
  light: Rgb; // warm uplight from the core
  veins: Rgb; // subsurface veins
  defense: Rgb; // defensive-zone tint + line
  grid: string; // defensive-zone grid line color (rgba string)
}

export type ObstacleStyle = 'scattered' | 'blocky' | 'columns' | 'organic';

export interface BiomeDef {
  id: BiomeId;
  name: string;
  blurb: string;
  palette: BiomePalette;
  lighting: number; // 0..1 ambient brightness (darker biomes dim the atmosphere)
  /** Relative spawn weights per enemy kind (missing kinds never spawn here). */
  enemyWeights: Partial<Record<EnemyKind, number>>;
  obstacleStyle: ObstacleStyle;
  obstacleDensity: number; // 0..1 → how many obstacle blocks the generator places
  favoredModifiers: readonly string[]; // EnvModifier ids this biome rolls more often
  ambient: { motes: number; fog: number; pulse: number }; // renderer ambient scale (0..1.5)
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  // Swarm biome — many fast, fragile things + splitters. Punishes single-target.
  wasteland: {
    id: 'wasteland',
    name: 'Infested Wasteland',
    blurb: 'Endless skittering swarms and bursting sacs.',
    palette: {
      sky: ['#0c0a16', '#070a10', '#0a0810', '#150a10'],
      membrane: [150, 70, 220],
      fog: [120, 140, 170],
      light: [255, 110, 90],
      veins: [255, 122, 89],
      defense: [255, 90, 120],
      grid: 'rgba(120,200,255,0.06)',
    },
    lighting: 1,
    enemyWeights: { runner: 6, rusher: 4, splitter: 2.5, brute: 1.5, mender: 1 },
    obstacleStyle: 'scattered',
    obstacleDensity: 0.45,
    favoredModifiers: ['frenzied', 'overgrowth', 'bloom'],
    ambient: { motes: 1.2, fog: 0.8, pulse: 1 },
  },
  // Order & armor — slow, shielded, heavy. Rewards sustained fire / armor shred.
  corporate: {
    id: 'corporate',
    name: 'Corporate Ruins',
    blurb: 'Sleek security columns and shielded enforcers.',
    palette: {
      sky: ['#0a0e16', '#070b12', '#080d14', '#0c1016'],
      membrane: [90, 160, 230],
      fog: [110, 150, 190],
      light: [90, 160, 230],
      veins: [120, 170, 230],
      defense: [255, 100, 120],
      grid: 'rgba(120,200,255,0.09)',
    },
    lighting: 1.1,
    enemyWeights: { warden: 4, brute: 3, runner: 2, tank: 1.5, spitter: 1 },
    obstacleStyle: 'columns',
    obstacleDensity: 0.6,
    favoredModifiers: ['power-surge', 'fragile-core', 'armored-horde'],
    ambient: { motes: 0.5, fog: 0.5, pulse: 0.7 },
  },
  // Murk & range — foggy, ranged spitters + fliers + healers. Rewards coverage.
  marsh: {
    id: 'marsh',
    name: 'Neural Marsh',
    blurb: 'Fog-choked wetland of drifting spores and spitters.',
    palette: {
      sky: ['#0a0c16', '#08101a', '#091410', '#0c1410'],
      membrane: [110, 90, 220],
      fog: [90, 160, 150],
      light: [90, 130, 160],
      veins: [110, 200, 180],
      defense: [255, 90, 130],
      grid: 'rgba(110,200,180,0.07)',
    },
    lighting: 0.8,
    enemyWeights: { spitter: 4, flyer: 3, mender: 2.5, runner: 2, burrower: 1.5 },
    obstacleStyle: 'organic',
    obstacleDensity: 0.5,
    favoredModifiers: ['dense-fog', 'corrosive-air', 'overgrowth'],
    ambient: { motes: 1.4, fog: 1.5, pulse: 1.1 },
  },
  // Dense & tough — a forest of bone columns, brutes and tanks. Rewards AoE lanes.
  bone: {
    id: 'bone',
    name: 'Bone Forest',
    blurb: 'A petrified forest crawling with heavy bone-beasts.',
    palette: {
      sky: ['#0e0a0c', '#0a0808', '#100a0a', '#160b0a'],
      membrane: [210, 180, 150],
      fog: [160, 150, 135],
      light: [255, 120, 90],
      veins: [230, 150, 120],
      defense: [255, 90, 110],
      grid: 'rgba(220,200,180,0.07)',
    },
    lighting: 0.95,
    enemyWeights: { brute: 4, tank: 2, warden: 2, splitter: 2, runner: 2 },
    obstacleStyle: 'columns',
    obstacleDensity: 0.8,
    favoredModifiers: ['armored-horde', 'overgrowth', 'reinforced'],
    ambient: { motes: 0.7, fog: 0.7, pulse: 0.8 },
  },
  // Industrial & grinding — gunmetal hulks, tanks and wardens. Rewards focus-fire.
  machine: {
    id: 'machine',
    name: 'Machine Graveyard',
    blurb: 'Rusting industrial sprawl of armored hulks.',
    palette: {
      sky: ['#0c0d10', '#08090c', '#100c09', '#140d08'],
      membrane: [255, 140, 60],
      fog: [120, 130, 140],
      light: [255, 140, 60],
      veins: [255, 150, 80],
      defense: [255, 110, 90],
      grid: 'rgba(255,160,90,0.06)',
    },
    lighting: 1.05,
    enemyWeights: { tank: 4, warden: 3, brute: 2.5, rusher: 1.5, spitter: 1 },
    obstacleStyle: 'blocky',
    obstacleDensity: 0.7,
    favoredModifiers: ['power-surge', 'magnetized', 'fragile-core'],
    ambient: { motes: 0.6, fog: 0.6, pulse: 0.9 },
  },
};

export const BIOME_IDS = Object.keys(BIOMES) as BiomeId[];

/** The classic fixed-map palette (used by Classic mode + as the renderer default). */
export const DEFAULT_PALETTE: BiomePalette = BIOMES.wasteland.palette;
