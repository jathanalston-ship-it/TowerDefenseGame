// Biome framework (docs/BIOMES.md) — the shared ecosystem layer used by BOTH Campaign Mode
// (one fixed biome per stage) and Infinite Mode (biomes rotate as the run goes deep). A biome
// is NOT cosmetic: it is a bundle of MECHANICAL modifiers (enemy stats/behaviour, tower
// efficiency, hero performance, roster/elite/boss flavour, economy, a periodic hazard, plus
// visual/audio identity) read by the sim at fixed hook points. Pure data + helpers: no DOM,
// no sim, no Math.random. Adding a biome is one row.
//
// BALANCE CONTRACT (BIOMES.md §1): enemy stat mods are THREAT-BALANCED (every buff paired with
// an offsetting nerf) so they reshape encounters without perturbing the smooth campaign curve;
// tower mods are PER-CLASS and moderate, so a biome shifts strategy without invalidating builds.
// Stage Mode uses NEUTRAL_BIOME (identity ×1 / +0 / period 0) ⇒ byte-identical golden run.

import { biomeRegistry } from './config';
import type { EnemyDef } from './config';
import type { CombatClass, EnemyKind } from './types';
import type { BossChassis } from './boss';

export type BiomeCategory = 'swarm' | 'fast' | 'heavy' | 'special';

/** Re-voicing of the existing music drone per biome (asset-free). Own wave union so the
 *  core never imports the DOM `OscillatorType`; the audio layer maps it 1:1. */
export type DroneWave = 'sine' | 'sawtooth' | 'triangle' | 'square';
export interface BiomeAmbient {
  root: number; // drone root frequency (Hz)
  fifth: number; // the second oscillator
  cutoff: number; // lowpass cutoff (Hz)
  wave: DroneWave;
}

/** A telegraphed, periodic environmental pulse. Single data-driven mechanism (no per-biome
 *  code): active when `period > 0 && (simTime mod period) < duration`. Pure in sim time. */
export interface BiomeHazard {
  name: string;
  desc: string;
  period: number; // seconds between pulses (0 = passive biome, no pulse)
  duration: number; // pulse length (s)
  enemySpeedMult: number; // × enemy speed during the pulse (1 = none)
  towerRateMult: number; // × tower fire rate during the pulse (1 = none)
}

/** The mechanical knobs a biome declares. Identity values (×1 / +0 / {}) = NEUTRAL_BIOME. */
export interface BiomeModifiers {
  // Enemy (applied at spawn, per enemy)
  enemyHpMult: number;
  enemySpeedMult: number;
  enemyDamageMult: number;
  enemyArmorBonus: number;
  enemyRegenFrac: number; // regen as a fraction of maxHP / sec (reuses the regen system)
  bountyMult: number; // the biome's economy / "loot weighting" (both modes)
  // Towers (build-shifting, never build-breaking)
  towerClassMult: Partial<Record<CombatClass, number>>;
  towerFireRateMult: number;
  // Hero
  heroDamageMult: number;
  heroCooldownMult: number;
  // Roster / encounters
  bias: Partial<Record<BiomeCategory, number>>; // category weight × on the roster roll
  signature: EnemyKind[]; // biome-DOMINANT kinds (up-weighted + guaranteed present)
  eliteMult: number; // × elite frequency
  bossChassisBias: Partial<Record<BossChassis, number>>; // biome-flavoured boss body plan
  /** The biome's OVERALL toughness as a damage-multiple (1 = neutral) — folded into
   *  recommendedPower so a harsh region raises the player-facing bar instead of silently
   *  breaking the difficulty contract (docs/DIFFICULTY.md §contract). Authored, not derived:
   *  hazards/bias/armor interact too nonlinearly for a formula to stay honest. */
  difficulty: number;
  // Environment
  hazard: BiomeHazard;
}

export interface Biome {
  id: string;
  name: string;
  accent: string; // CSS var → background tint / particles / HUD chip
  modifierName: string; // the telegraphed name of the biome's character
  ambient: BiomeAmbient;
  mods: BiomeModifiers;
}

const NO_HAZARD: BiomeHazard = { name: '', desc: '', period: 0, duration: 0, enemySpeedMult: 1, towerRateMult: 1 };

/** Identity biome for Stage Mode (golden-safe): every read is ×1 / +0 / period 0. */
export const NEUTRAL_BIOME: Biome = {
  id: 'neutral',
  name: 'Hostile Frontier',
  accent: 'var(--kinetic)',
  modifierName: '',
  ambient: { root: 55, fifth: 82.4, cutoff: 260, wave: 'sawtooth' }, // the original drone
  mods: {
    enemyHpMult: 1, enemySpeedMult: 1, enemyDamageMult: 1, enemyArmorBonus: 0, enemyRegenFrac: 0, bountyMult: 1,
    towerClassMult: {}, towerFireRateMult: 1,
    heroDamageMult: 1, heroCooldownMult: 1,
    bias: {}, signature: [], eliteMult: 1, bossChassisBias: {}, difficulty: 1,
    hazard: NO_HAZARD,
  },
};

// ── The biomes (BIOMES.md §3). Rotation order. All stat mods are threat-balanced. ───────────
export const BIOMES: Biome[] = [
  {
    id: 'verdant', name: 'Verdant Hive', accent: 'var(--caustic)', modifierName: 'Fertile Ground',
    ambient: { root: 73.4, fifth: 110, cutoff: 420, wave: 'triangle' },
    mods: {
      enemyHpMult: 0.9, enemySpeedMult: 1.12, enemyDamageMult: 1, enemyArmorBonus: 0, enemyRegenFrac: 0, bountyMult: 1,
      towerClassMult: { Caustic: 1.1, Kinetic: 0.96 }, towerFireRateMult: 1,
      heroDamageMult: 1.05, heroCooldownMult: 1,
      bias: { swarm: 1.3, fast: 1.15 }, signature: ['mite', 'larva'], eliteMult: 0.9, bossChassisBias: { swarmlord: 3 }, difficulty: 1,
      hazard: { name: 'Spore Bloom', desc: 'The hive blooms — the swarm surges forward.', period: 18, duration: 3, enemySpeedMult: 1.18, towerRateMult: 1 },
    },
  },
  {
    id: 'necrotic', name: 'Necrotic Mire', accent: 'var(--viral)', modifierName: 'Rot',
    ambient: { root: 49, fifth: 73.4, cutoff: 200, wave: 'sawtooth' },
    mods: {
      enemyHpMult: 1.08, enemySpeedMult: 0.96, enemyDamageMult: 1, enemyArmorBonus: 0, enemyRegenFrac: 0.018, bountyMult: 1.08,
      towerClassMult: { Viral: 1.15, Vital: 0.92 }, towerFireRateMult: 1,
      heroDamageMult: 1, heroCooldownMult: 1.05,
      bias: { special: 1.6, swarm: 1.1 }, signature: ['knitter', 'revenant'], eliteMult: 1.1, bossChassisBias: { controller: 3 }, difficulty: 1.08,
      // Miasma is a PASSIVE hazard (period 0 ⇒ no pulse) — the ambient regen IS the threat; the
      // name/desc still surface on the Campaign ladder + HUD telegraph.
      hazard: { name: 'Miasma', desc: 'Rot seeps through the mire — the swarm regenerates.', period: 0, duration: 0, enemySpeedMult: 1, towerRateMult: 1 },
    },
  },
  {
    id: 'frostbound', name: 'Frostbound Reach', accent: 'var(--kinetic)', modifierName: 'Permafrost',
    ambient: { root: 65.4, fifth: 98, cutoff: 320, wave: 'sine' },
    mods: {
      enemyHpMult: 1.12, enemySpeedMult: 0.86, enemyDamageMult: 1, enemyArmorBonus: 5, enemyRegenFrac: 0, bountyMult: 1,
      towerClassMult: { Kinetic: 1.12 }, towerFireRateMult: 0.95,
      heroDamageMult: 1, heroCooldownMult: 1.06,
      bias: { heavy: 1.5 }, signature: ['golem', 'bulwark'], eliteMult: 1, bossChassisBias: { juggernaut: 3 }, difficulty: 1.22,
      hazard: { name: 'Deep Freeze', desc: 'Towers ice over — fire rate drops.', period: 20, duration: 3.5, enemySpeedMult: 1, towerRateMult: 0.85 },
    },
  },
  {
    id: 'ashen', name: 'Ashen Warrens', accent: 'var(--vital)', modifierName: 'Wildfire',
    ambient: { root: 87.3, fifth: 130.8, cutoff: 520, wave: 'sawtooth' },
    mods: {
      enemyHpMult: 0.88, enemySpeedMult: 1.15, enemyDamageMult: 1.06, enemyArmorBonus: 0, enemyRegenFrac: 0, bountyMult: 1,
      towerClassMult: { Neural: 1.08, Caustic: 0.95 }, towerFireRateMult: 1,
      heroDamageMult: 1.05, heroCooldownMult: 1,
      bias: { fast: 1.7, swarm: 1.2 }, signature: ['rusher', 'darter'], eliteMult: 1, bossChassisBias: { bruiser: 3 }, difficulty: 1.08,
      hazard: { name: 'Firestorm', desc: 'A firestorm whips the swarm into a sprint.', period: 16, duration: 3, enemySpeedMult: 1.25, towerRateMult: 1 },
    },
  },
  {
    id: 'carapace', name: 'Carapace Wastes', accent: 'var(--neural)', modifierName: 'Chitin',
    ambient: { root: 61.7, fifth: 92.5, cutoff: 300, wave: 'square' },
    mods: {
      enemyHpMult: 1.1, enemySpeedMult: 0.92, enemyDamageMult: 1, enemyArmorBonus: 6, enemyRegenFrac: 0, bountyMult: 1.05,
      towerClassMult: { Kinetic: 1.12, Caustic: 0.9 }, towerFireRateMult: 1,
      heroDamageMult: 1, heroCooldownMult: 1,
      bias: { heavy: 1.6, special: 1.3 }, signature: ['bulwark', 'warden'], eliteMult: 1, bossChassisBias: { juggernaut: 3 }, difficulty: 1.15,
      hazard: { name: 'Shellquake', desc: 'The ground heaves — towers misfire.', period: 22, duration: 4, enemySpeedMult: 1, towerRateMult: 0.9 },
    },
  },
  {
    id: 'neural', name: 'Neural Expanse', accent: 'var(--gold)', modifierName: 'Overcharge',
    ambient: { root: 98, fifth: 146.8, cutoff: 600, wave: 'triangle' },
    mods: {
      enemyHpMult: 0.94, enemySpeedMult: 1.05, enemyDamageMult: 1.1, enemyArmorBonus: 0, enemyRegenFrac: 0, bountyMult: 1.1,
      towerClassMult: { Neural: 1.12, Vital: 1.05 }, towerFireRateMult: 1,
      heroDamageMult: 1, heroCooldownMult: 0.95,
      bias: { fast: 1.2, special: 1.4 }, signature: ['wisp', 'darter'], eliteMult: 1.1, bossChassisBias: { controller: 3 }, difficulty: 1.1,
      hazard: { name: 'Static Field', desc: 'A static surge — the swarm jolts, towers stutter.', period: 14, duration: 2.5, enemySpeedMult: 1.2, towerRateMult: 0.92 },
    },
  },
  {
    // Deep volcanic siege-front: slow, armoured, HARD-HITTING bombardment — the line holds, but every
    // breach scorches. The first biome to field the `artillery` boss chassis. Threat-balanced: tankier
    // ⇒ slower. Splash/DoT (Caustic) chews the grouped siege; control (Neural) matters less vs slow tanks.
    id: 'molten', name: 'Molten Verge', accent: 'var(--molten)', modifierName: 'Eruption',
    ambient: { root: 58.3, fifth: 87.3, cutoff: 280, wave: 'sawtooth' },
    mods: {
      enemyHpMult: 1.12, enemySpeedMult: 0.88, enemyDamageMult: 1.1, enemyArmorBonus: 4, enemyRegenFrac: 0, bountyMult: 1.06,
      towerClassMult: { Caustic: 1.12, Neural: 0.95 }, towerFireRateMult: 1,
      heroDamageMult: 1, heroCooldownMult: 1.04, // heat saps the hero's abilities
      bias: { heavy: 1.5, special: 1.3 }, signature: ['brute', 'spitter'], eliteMult: 1, bossChassisBias: { artillery: 3 }, difficulty: 1.2,
      hazard: { name: 'Eruption', desc: 'A lava surge whips the slow siege into a charge.', period: 19, duration: 3, enemySpeedMult: 1.2, towerRateMult: 1 },
    },
  },
  {
    // A charged ionosphere: the ambient static OVERCLOCKS your towers (the only biome to buff global
    // fire rate) — but the storm-hardened hosts are tanky, armoured, shielded and shrug it off. A
    // different rhythm: your towers scream while a durable host grinds in. Neural (control) shines;
    // abilities come faster in the charge. Threat-balanced: the +rate is offset by tankier enemies.
    id: 'tempest', name: 'Tempest Reach', accent: 'var(--tempest)', modifierName: 'Ionstorm',
    ambient: { root: 82.4, fifth: 123.5, cutoff: 680, wave: 'square' },
    mods: {
      enemyHpMult: 1.1, enemySpeedMult: 0.94, enemyDamageMult: 1, enemyArmorBonus: 3, enemyRegenFrac: 0, bountyMult: 1.05,
      towerClassMult: { Neural: 1.05 }, towerFireRateMult: 1.08, // the charged air quickens every tower
      heroDamageMult: 1.05, heroCooldownMult: 0.96, // abilities recharge faster in the storm
      bias: { special: 1.4, heavy: 1.2 }, signature: ['warden', 'cantor'], eliteMult: 1, bossChassisBias: { controller: 3 }, difficulty: 1.12,
      hazard: { name: 'Gale', desc: 'A gale rips through — the swarm surges on the wind.', period: 17, duration: 3, enemySpeedMult: 1.15, towerRateMult: 1 },
    },
  },
  {
    id: 'ossuary', name: 'Ossuary Fields', accent: 'var(--ossuary)', modifierName: 'Bonechoke',
    ambient: { root: 49, fifth: 73.4, cutoff: 300, wave: 'triangle' }, // a hollow marrow drone
    mods: {
      enemyHpMult: 1.05, enemySpeedMult: 0.92, enemyDamageMult: 1.05, enemyArmorBonus: 6, enemyRegenFrac: 0, bountyMult: 1.1,
      towerClassMult: { Kinetic: 1.08, Vital: 0.95 }, towerFireRateMult: 1, // shattering bone favors raw impact
      heroDamageMult: 1, heroCooldownMult: 1,
      bias: { heavy: 1.4, special: 1.1 }, signature: ['warden', 'cataclyst'], eliteMult: 1.1, bossChassisBias: { juggernaut: 2, bruiser: 2 }, difficulty: 1.28,
      hazard: { name: 'Bone Storm', desc: 'Marrow dust chokes the guns — towers fire slower.', period: 20, duration: 4, enemySpeedMult: 1, towerRateMult: 0.85 },
    },
  },
  {
    id: 'umbral', name: 'Umbral Depths', accent: 'var(--umbral)', modifierName: 'Lightless',
    ambient: { root: 41.2, fifth: 61.7, cutoff: 220, wave: 'sine' }, // near-subsonic dark
    mods: {
      enemyHpMult: 1, enemySpeedMult: 1.08, enemyDamageMult: 1, enemyArmorBonus: 0, enemyRegenFrac: 0.003, bountyMult: 1.08,
      towerClassMult: { Resonant: 1.08, Caustic: 0.96 }, towerFireRateMult: 1, // resonance carries in the dark
      heroDamageMult: 1, heroCooldownMult: 1.05, // the lightless deep slows minds
      bias: { fast: 1.3, special: 1.2 }, signature: ['cystwraith', 'stratovore'], eliteMult: 1.05, bossChassisBias: { artillery: 2, controller: 2 }, difficulty: 1.3,
      hazard: { name: 'Lightless Surge', desc: 'The dark DEEPENS — the swarm pours through it.', period: 16, duration: 3, enemySpeedMult: 1.22, towerRateMult: 1 },
    },
  },
];

// Self-register into the content registry (id + name); the mechanical payload lives on `Biome`.
biomeRegistry.registerAll(BIOMES.map((b) => ({ id: b.id, name: b.name })));

const BY_ID: Record<string, Biome> = {};
for (const b of BIOMES) BY_ID[b.id] = b;

/** Resolve a biome by id (NEUTRAL_BIOME for unknown ids — never throws into the sim). */
export function biomeById(id: string): Biome {
  return BY_ID[id] ?? NEUTRAL_BIOME;
}

// ── Infinite Mode rotation (BIOMES.md §5) — pure function of depth ⇒ deterministic. ─────────
export const BIOME_PERIOD = 5; // waves spent in a biome before rotating to the next
export function biomeForDepth(depth: number): Biome {
  const idx = Math.floor(Math.max(0, depth - 1) / BIOME_PERIOD) % BIOMES.length;
  return BIOMES[idx];
}

// ── Enemy classification (derived from stats ⇒ a new enemy auto-slots; future-proof). Lives
//    here because it is biome-roster logic shared by Campaign generation and the endless Director. ──
const HEAVY_HP = 280;
const HEAVY_ARMOR = 12;
const FAST_SPEED = 110;
export function categoryOf(e: EnemyDef): BiomeCategory {
  if (e.shieldHp || e.regenPerSec || e.summon || e.siege || e.explodeRadius || e.auraRadius) return 'special';
  if (e.hp >= HEAVY_HP || e.armor >= HEAVY_ARMOR) return 'heavy';
  if (e.speed >= FAST_SPEED) return 'fast';
  return 'swarm';
}

/** Is the biome's hazard pulse active at this sim time? Pure (no rng). */
export function hazardActive(b: Biome, simTime: number): boolean {
  const h = b.mods.hazard;
  return h.period > 0 && simTime % h.period < h.duration;
}
