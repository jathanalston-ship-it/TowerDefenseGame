// Boss framework — the data-driven kit that turns a flagged enemy into a phased,
// arena-shaping set-piece. A boss is still an ordinary composed `EnemyDef`
// (archetypes.ts) flagged `isBoss`, but it additionally carries a `BossProfile`:
//
//   • SILHOUETTE — a parametric shape descriptor the renderer draws (unique read).
//   • PHASES     — HP-gated stages; each can re-stat the boss, grant shields/armor,
//                  burst-summon on entry, swap its WEAKNESS, and run its own abilities.
//   • ABILITIES  — cooldown-driven verbs (summon / volley / shield / heal / enrage /
//                  hazard / suppress / surge / cloak). The sim reads each through one
//                  generic hook, so adding a boss is data, never new engine code.
//   • WEAKNESS   — a per-class damage bias (Kinetic / Caustic / Vital). This is the
//                  "test the build, not the DPS" lever: a boss that resists your one
//                  damage type forces you to bring another.
//
// MODIFIERS (BOSS_MODIFIERS) layer procedural enhancements on top of any profile —
// the seam future Stage/Endless escalation and event modifiers hang off of.
//
// This module owns boss CONTENT (the roster) + pure helpers. The runtime that steps
// phases/abilities lives in game.ts (one `bossSystem`); the global safety caps live
// in config.ts (`BOSS`). No imports from config.ts → no cycle (config imports this).

import type { CombatClass, EnemyKind } from './types';
import { defineEnemy, MOVEMENT } from './archetypes';
import type { EnemyDef } from './archetypes';
import type { BiomeId } from './biomes';

// ── Boss roster keys ─────────────────────────────────────────────────────────
// 12 launch bosses across the five faction-biomes (ENEMIES.md). Each is a distinct
// build-check, not a bigger health bar.
export type BossKind =
  | 'tyrant' // Parasites (wasteland)
  | 'progenitor'
  | 'forgemind' // Machine Cult (machine)
  | 'aegis'
  | 'reclaimer'
  | 'golden_parachute' // Corporate Security (corporate)
  | 'field_commander'
  | 'breacher_prime'
  | 'apex_rival' // Hive Organisms (bone)
  | 'lumberer_king'
  | 'dreaming_god' // Neural Aberrations (marsh)
  | 'phantom';

export const BOSS_KINDS: BossKind[] = [
  'tyrant', 'progenitor', 'forgemind', 'aegis', 'reclaimer', 'golden_parachute',
  'field_commander', 'breacher_prime', 'apex_rival', 'lumberer_king', 'dreaming_god', 'phantom',
];

// ── Damage bias (weaknesses & resistances) ───────────────────────────────────
/** Multiply incoming damage by the SOURCE combat class. >1 = weak, <1 = resistant.
 *  Kinetic = Needle / Ravager · Caustic = Mortar / Corrosion · Vital = Bulwark. */
export type DamageBias = Partial<Record<CombatClass, number>>;

/** Class rotation an `adaptive` boss resists, in phase order (mono-damage check). */
export const ADAPT_ORDER: CombatClass[] = ['Kinetic', 'Caustic', 'Vital'];

// ── Abilities (composable verbs) ─────────────────────────────────────────────
export type BossAbilityKind =
  | 'summon' // spawn adds near the boss (board pressure → tests AoE/clear)
  | 'volley' // fan of shots at the hero (tests positioning/dodging)
  | 'shield' // grant self a shield (tests burst/Shred through it)
  | 'heal' // restore HP — negated while Corroded (tests DoT/pressure)
  | 'enrage' // temporary speed burst (tests slows/CC + burst windows)
  | 'hazard' // drop a hostile ground pool (arena influence; tests hero footing)
  | 'suppress' // disable nearby towers for a time (arena influence; anti-cluster)
  | 'surge' // lunge toward the line (tests chokepoint control / hero intercept)
  | 'cloak'; // brief untargetable/invulnerable window (tests sustained, not gappy, DPS)

/** One boss ability. Only the fields its `kind` uses are read (the rest are inert). */
export interface BossAbility {
  kind: BossAbilityKind;
  cooldown: number; // seconds between casts
  firstAt: number; // seconds after phase entry before the first cast
  enemy?: EnemyKind; // summon: which add
  count?: number; // summon: how many · volley: shots
  amount?: number; // shield: flat · heal: fraction of maxHp if ≤1, else flat
  damage?: number; // volley: per-shot · hazard: dps
  radius?: number; // hazard / suppress radius (px)
  duration?: number; // enrage / hazard / suppress / cloak seconds
  speedMult?: number; // enrage: speed multiplier while active
  dist?: number; // surge: forward distance (px)
}

// ── Phases ───────────────────────────────────────────────────────────────────
/** An HP-gated stage. Entered when hp fraction ≤ `at` (first phase `at: 1`). On
 *  entry it re-stats the boss and may burst-summon; while active it runs `abilities`
 *  and (optionally) applies a phase-local `weakness`. */
export interface BossPhase {
  at: number; // hp-fraction threshold to ENTER this phase (descending across phases)
  name: string; // shown as the phase-change tell
  speedMult?: number; // ×base speed for this phase
  damageMult?: number; // ×base contact/leak damage for this phase
  armorBonus?: number; // +armor for this phase
  shield?: number; // grant this shield on entry
  weakness?: DamageBias; // override the boss weakness while in this phase (the "adapt")
  onEnterSummon?: { enemy: EnemyKind; count: number }; // one-shot burst on entry
  abilities: BossAbility[];
}

// ── Silhouette (renderer descriptor) ─────────────────────────────────────────
export type BossForm = 'sac' | 'titan' | 'serpent' | 'mech' | 'crown' | 'walker' | 'aberration';
/** Parametric silhouette — the renderer draws `form` shaped by these params, so every
 *  boss reads as a distinct shape without a bespoke draw routine per boss. */
export interface BossSilhouette {
  form: BossForm;
  accent: string; // secondary color (eyes / trim / energy)
  spikes: number; // radial sp, horns, legs, or turrets depending on form
  eyes: number; // glowing ocelli (a quick faction/menace read)
}

// ── The profile (attached to the EnemyDef) ───────────────────────────────────
export interface BossProfile {
  title: string; // display name (mirrors EnemyDef.name)
  faction: string; // flavor grouping (codex)
  blurb: string; // the build-check this boss poses (one line)
  silhouette: BossSilhouette;
  weakness: DamageBias; // base damage bias (phases may override)
  phases: BossPhase[]; // ≥2; phases[0].at === 1
}

// ── Runtime state (one per live boss; lives on Enemy.boss) ────────────────────
export interface BossRuntime {
  phase: number; // current phase index (-1 until first bossSystem tick initializes it)
  timers: number[]; // per current-phase-ability cooldown remaining
  bonusTimers: number[]; // per modifier-granted ability cooldown remaining
  enrageUntil: number; // sim-time the enrage speed burst expires
  enrageSpeed: number; // speed multiplier while enraged
  invulnUntil: number; // sim-time a cloak window expires (untargetable)
  adds: number; // total adds summoned (capped)
  baseSpeed: number; // spawn speed (phase mults reapply from this)
  baseDamage: number; // spawn contact damage (phase mults reapply from this)
  baseArmor: number; // spawn armor (phase armor bonuses reapply from this)
  cooldownMult: number; // modifier ability-cadence scale (1 = unmodified)
  bonus: BossAbility[]; // modifier-granted abilities (active in every phase)
  adaptive: boolean; // modifier: rotate the resisted class by phase
}

export function initBossRuntime(): BossRuntime {
  return {
    phase: -1, timers: [], bonusTimers: [], enrageUntil: 0, enrageSpeed: 1, invulnUntil: 0,
    adds: 0, baseSpeed: 0, baseDamage: 0, baseArmor: 0, cooldownMult: 1, bonus: [], adaptive: false,
  };
}

/** Effective incoming-damage multiplier for a source class given the boss's current
 *  phase (and the `adaptive` modifier). Pure — game.ts calls this in applyDamage. */
export function bossDamageMult(prof: BossProfile, rt: BossRuntime, src: CombatClass | undefined): number {
  if (!src) return 1; // classless (reactions, card bursts) ignore weaknesses
  const idx = Math.max(0, rt.phase);
  if (rt.adaptive) return src === ADAPT_ORDER[idx % ADAPT_ORDER.length] ? 0.55 : 1.25;
  const bias = prof.phases[idx]?.weakness ?? prof.weakness;
  return bias[src] ?? 1;
}

// ── Ability factories (keep the roster readable) ─────────────────────────────
const summon = (enemy: EnemyKind, count: number, cooldown: number, firstAt = cooldown): BossAbility => ({ kind: 'summon', enemy, count, cooldown, firstAt });
const volley = (count: number, damage: number, cooldown: number, firstAt = cooldown): BossAbility => ({ kind: 'volley', count, damage, cooldown, firstAt });
const shield = (amount: number, cooldown: number, firstAt = cooldown): BossAbility => ({ kind: 'shield', amount, cooldown, firstAt });
const heal = (amount: number, cooldown: number, firstAt = cooldown): BossAbility => ({ kind: 'heal', amount, cooldown, firstAt });
const enrage = (speedMult: number, duration: number, cooldown: number, firstAt = cooldown): BossAbility => ({ kind: 'enrage', speedMult, duration, cooldown, firstAt });
const hazard = (damage: number, radius: number, duration: number, cooldown: number, firstAt = cooldown): BossAbility => ({ kind: 'hazard', damage, radius, duration, cooldown, firstAt });
const suppress = (radius: number, duration: number, cooldown: number, firstAt = cooldown): BossAbility => ({ kind: 'suppress', radius, duration, cooldown, firstAt });
const surge = (dist: number, cooldown: number, firstAt = cooldown): BossAbility => ({ kind: 'surge', dist, cooldown, firstAt });
const cloak = (duration: number, cooldown: number, firstAt = cooldown): BossAbility => ({ kind: 'cloak', duration, cooldown, firstAt });

// ── The roster ───────────────────────────────────────────────────────────────
// Each boss is a composed EnemyDef + a BossProfile. Numbers are tuned around Stage
// Mode progression (bosses appear on a stage's final wave; see docs/BOSSES.md).
export const BOSS_ENEMY_DEFS: Record<BossKind, EnemyDef> = {
  // ── PARASITES (wasteland) — punish single-target, reward AoE/DoT ──
  tyrant: defineEnemy('tyrant', {
    name: 'Brood Tyrant', role: 'boss', isBoss: true,
    stats: { hp: 900, armor: 14, speed: 32, bounty: 200, damage: 45, radius: 26 },
    movement: MOVEMENT.juggernaut, visual: { color: '#ff4d6d' },
    boss: {
      title: 'Brood Tyrant', faction: 'Parasites',
      blurb: 'Floods the lane with chaff — single-target alone drowns; bring AoE.',
      silhouette: { form: 'sac', accent: '#ffd24d', spikes: 6, eyes: 3 },
      weakness: { Caustic: 1.3, Kinetic: 0.85 },
      phases: [
        { at: 1, name: 'Brooding', abilities: [summon('runner', 4, 7, 4)] },
        { at: 0.5, name: 'Rupture', speedMult: 1.15, onEnterSummon: { enemy: 'splitter', count: 2 },
          abilities: [summon('runner', 5, 6, 3), enrage(1.5, 2.5, 11, 6)] },
      ],
    },
  }),
  progenitor: defineEnemy('progenitor', {
    name: 'The Progenitor', role: 'boss', isBoss: true,
    stats: { hp: 1700, armor: 12, speed: 26, bounty: 360, damage: 50, radius: 32 },
    movement: MOVEMENT.juggernaut, visual: { color: '#d98cff' },
    boss: {
      title: 'The Progenitor', faction: 'Parasites',
      blurb: 'A DPS-vs-spawn race: it births faster as it dies. AoE clear or be buried.',
      silhouette: { form: 'titan', accent: '#ffb24d', spikes: 8, eyes: 5 },
      weakness: { Caustic: 1.5, Kinetic: 0.7 },
      phases: [
        { at: 1, name: 'Gravid', abilities: [summon('runner', 5, 6, 3), hazard(8, 42, 3, 9, 5)] },
        { at: 0.6, name: 'Cleaving', speedMult: 1.1, onEnterSummon: { enemy: 'splitter', count: 3 },
          abilities: [summon('runner', 6, 5, 2.5), hazard(10, 46, 3.2, 8, 4)] },
        { at: 0.25, name: 'Dying Flood', speedMult: 1.2,
          abilities: [summon('rusher', 6, 4, 1.5), enrage(1.4, 3, 9, 3)] },
      ],
    },
  }),

  // ── MACHINE CULT (machine) — punish raw burst, reward penetration + Corrosion ──
  forgemind: defineEnemy('forgemind', {
    name: 'The Forgemind', role: 'boss', isBoss: true,
    stats: { hp: 1500, armor: 22, speed: 28, bounty: 340, damage: 46, radius: 30 },
    movement: MOVEMENT.behemoth, visual: { color: '#9fb0c0' },
    boss: {
      title: 'The Forgemind', faction: 'Machine Cult',
      blurb: 'Shields, repairs, and disables towers — needs armor-pen + Corrosion, not raw burst.',
      silhouette: { form: 'mech', accent: '#5ad1ff', spikes: 5, eyes: 3 },
      weakness: { Kinetic: 1.4, Caustic: 1.15, Vital: 0.8 },
      phases: [
        { at: 1, name: 'Sanctum', shield: 240, abilities: [suppress(150, 2.4, 10, 6), summon('warden', 1, 9, 4)] },
        { at: 0.6, name: 'Repair Choir', abilities: [heal(0.12, 7, 3), shield(200, 11, 8), summon('brute', 2, 9, 5)] },
        { at: 0.3, name: 'Forgewrath', armorBonus: 6, abilities: [suppress(170, 2.8, 8, 3), enrage(1.3, 2.5, 10, 5)] },
      ],
    },
  }),
  aegis: defineEnemy('aegis', {
    name: 'Aegis Frame', role: 'boss', isBoss: true,
    stats: { hp: 1100, armor: 18, speed: 26, bounty: 240, damage: 42, radius: 28 },
    movement: MOVEMENT.behemoth, visual: { color: '#6e9bff' },
    boss: {
      title: 'Aegis Frame', faction: 'Machine Cult',
      blurb: 'A walking shield wall — pierce/penetration cracks it; raw Vital bounces off.',
      silhouette: { form: 'crown', accent: '#5ad1ff', spikes: 7, eyes: 2 },
      weakness: { Kinetic: 1.5, Caustic: 1.1, Vital: 0.75 },
      phases: [
        { at: 1, name: 'Bulwark', shield: 280, abilities: [shield(160, 9, 7)] },
        { at: 0.45, name: 'Overload', armorBonus: 4, abilities: [suppress(150, 2.4, 9, 4), enrage(1.25, 2, 11, 6)] },
      ],
    },
  }),
  reclaimer: defineEnemy('reclaimer', {
    name: 'The Reclaimer', role: 'boss', isBoss: true,
    stats: { hp: 980, armor: 12, speed: 30, bounty: 230, damage: 38, radius: 26 },
    movement: MOVEMENT.knitter, visual: { color: '#3fe08a' },
    boss: {
      title: 'The Reclaimer', faction: 'Machine Cult',
      blurb: 'Repairs itself and shields its escorts — DoT shuts the heals off; burst alone stalls.',
      silhouette: { form: 'walker', accent: '#3fe08a', spikes: 4, eyes: 4 },
      weakness: { Caustic: 1.5, Kinetic: 0.9 },
      phases: [
        { at: 1, name: 'Mending', abilities: [heal(0.14, 6, 3), summon('warden', 1, 10, 5)] },
        { at: 0.5, name: 'Desperation', speedMult: 1.1, abilities: [heal(0.1, 5, 2.5), shield(150, 9, 6)] },
      ],
    },
  }),

  // ── CORPORATE SECURITY (corporate) — punish static play, reward heroes + spread ──
  golden_parachute: defineEnemy('golden_parachute', {
    name: '"Golden Parachute"', role: 'boss', isBoss: true,
    stats: { hp: 1400, armor: 14, speed: 30, bounty: 360, damage: 48, radius: 30 },
    movement: MOVEMENT.behemoth, visual: { color: '#ffd24d' },
    boss: {
      title: '"Golden Parachute"', faction: 'Corporate Security',
      blurb: 'A CEO mech that EMPs, deploys turrets, and airstrikes — punishes a set-and-forget cluster.',
      silhouette: { form: 'mech', accent: '#ff7a59', spikes: 6, eyes: 4 },
      weakness: { Kinetic: 1.2, Vital: 1.1, Caustic: 0.85 },
      phases: [
        { at: 1, name: 'EMP Burst', abilities: [suppress(180, 3, 8, 4), summon('spitter', 2, 10, 6)] },
        { at: 0.6, name: 'Turret Deploy', abilities: [summon('spitter', 3, 8, 4), volley(5, 12, 7, 3)] },
        { at: 0.3, name: 'Airstrike', abilities: [hazard(14, 52, 3, 6, 2), enrage(1.3, 2.5, 10, 5)] },
      ],
    },
  }),
  field_commander: defineEnemy('field_commander', {
    name: 'Field Commander', role: 'boss', isBoss: true,
    stats: { hp: 1000, armor: 12, speed: 32, bounty: 230, damage: 40, radius: 26 },
    movement: MOVEMENT.bruiser, visual: { color: '#7b9cff' },
    boss: {
      title: 'Field Commander', faction: 'Corporate Security',
      blurb: 'Calls reinforcements and rallies them — kill priority discipline beats a slow grind.',
      silhouette: { form: 'walker', accent: '#ffd24d', spikes: 5, eyes: 3 },
      weakness: { Kinetic: 1.25, Caustic: 1.0 },
      phases: [
        { at: 1, name: 'Rally', abilities: [summon('brute', 2, 8, 4)] },
        { at: 0.5, name: 'Reinforce', speedMult: 1.1, abilities: [summon('brute', 2, 7, 3), enrage(1.3, 2.5, 10, 5)] },
      ],
    },
  }),
  breacher_prime: defineEnemy('breacher_prime', {
    name: 'Breacher Prime', role: 'boss', isBoss: true,
    stats: { hp: 820, armor: 8, speed: 58, bounty: 220, damage: 44, radius: 22 },
    movement: MOVEMENT.charger, visual: { color: '#ff5db0' },
    boss: {
      title: 'Breacher Prime', faction: 'Corporate Security',
      blurb: 'Rushes the line and EMPs towers on the way — reactive CC/burst, not a static wall.',
      silhouette: { form: 'serpent', accent: '#5ad1ff', spikes: 3, eyes: 2 },
      weakness: { Caustic: 1.3, Kinetic: 1.1 },
      phases: [
        { at: 1, name: 'Breach', abilities: [suppress(120, 2.5, 7, 3), surge(140, 9, 5)] },
        { at: 0.4, name: 'Overclock', speedMult: 1.2, abilities: [suppress(130, 2.5, 6, 2), enrage(1.4, 2, 9, 4)] },
      ],
    },
  }),

  // ── HIVE ORGANISMS (bone) — punish mono-damage / burst-only, reward DoT + flexibility ──
  apex_rival: defineEnemy('apex_rival', {
    name: 'The Apex Rival', role: 'boss', isBoss: true,
    stats: { hp: 1900, armor: 14, speed: 26, bounty: 420, damage: 52, radius: 32 },
    movement: MOVEMENT.behemoth, visual: { color: '#ff6b9d' },
    boss: {
      title: 'The Apex Rival', faction: 'Hive Organisms',
      blurb: 'Mutates a new resistance each phase — only multi-type damage clears it.',
      silhouette: { form: 'titan', accent: '#3fe08a', spikes: 9, eyes: 6 },
      weakness: {}, // defined per phase (it adapts)
      phases: [
        { at: 1, name: 'Adapt: Kinetic', weakness: { Kinetic: 0.55, Caustic: 1.3, Vital: 1.3 },
          abilities: [heal(0.1, 7, 4), summon('splitter', 1, 10, 6)] },
        { at: 0.66, name: 'Adapt: Caustic', weakness: { Caustic: 0.55, Kinetic: 1.3, Vital: 1.3 },
          abilities: [heal(0.1, 6, 3), enrage(1.25, 2.5, 10, 5)] },
        { at: 0.33, name: 'Adapt: Vital', weakness: { Vital: 0.55, Kinetic: 1.3, Caustic: 1.3 }, speedMult: 1.1,
          abilities: [heal(0.08, 5, 2.5), summon('mender', 1, 9, 4)] },
      ],
    },
  }),
  lumberer_king: defineEnemy('lumberer_king', {
    name: 'Lumberer King', role: 'boss', isBoss: true,
    stats: { hp: 1300, armor: 16, speed: 24, bounty: 280, damage: 46, radius: 30 },
    movement: MOVEMENT.behemoth, visual: { color: '#e8a04a' },
    boss: {
      title: 'Lumberer King', faction: 'Hive Organisms',
      blurb: 'Regenerates out of combat — sustained DoT (Corrosion) beats burst that leaves gaps.',
      silhouette: { form: 'titan', accent: '#ffd24d', spikes: 5, eyes: 3 },
      weakness: { Caustic: 1.5, Kinetic: 0.8 },
      phases: [
        { at: 1, name: 'Lumbering', abilities: [heal(0.12, 6, 4), hazard(10, 44, 3, 10, 6), surge(120, 12, 8)] },
        { at: 0.45, name: 'Wrath', speedMult: 1.15, abilities: [heal(0.08, 5, 3), enrage(1.3, 2.5, 10, 5)] },
      ],
    },
  }),

  // ── NEURAL ABERRATIONS (marsh) — punish single-system reliance, reward redundancy + heroes ──
  dreaming_god: defineEnemy('dreaming_god', {
    name: 'The Dreaming God', role: 'boss', isBoss: true,
    stats: { hp: 1300, armor: 10, speed: 28, bounty: 380, damage: 44, radius: 30 },
    movement: MOVEMENT.brooder, visual: { color: '#c0a3ff' },
    boss: {
      title: 'The Dreaming God', faction: 'Neural Aberrations',
      blurb: 'Jams towers and phases out of reality — redundancy and the (un-jammable) hero carry.',
      silhouette: { form: 'aberration', accent: '#5ad1ff', spikes: 0, eyes: 7 },
      weakness: { Vital: 1.25, Kinetic: 1.0, Caustic: 1.0 },
      phases: [
        { at: 1, name: 'Unreality', abilities: [suppress(200, 3.5, 9, 4), summon('flyer', 2, 10, 6)] },
        { at: 0.6, name: 'Phase Shift', abilities: [cloak(1.6, 8, 4), volley(6, 14, 7, 2), suppress(180, 3, 10, 6)] },
        { at: 0.3, name: 'Nightmare', speedMult: 1.1, abilities: [cloak(1.8, 7, 3), summon('flyer', 3, 9, 4), enrage(1.25, 2, 11, 6)] },
      ],
    },
  }),
  phantom: defineEnemy('phantom', {
    name: 'The Phantom Choir', role: 'boss', isBoss: true,
    stats: { hp: 900, armor: 8, speed: 34, bounty: 220, damage: 40, radius: 24 },
    movement: MOVEMENT.floater, visual: { color: '#c7a3ff' },
    boss: {
      title: 'The Phantom Choir', faction: 'Neural Aberrations',
      blurb: 'Flickers untargetable and barrages the hero — needs sustained coverage, not one big gun.',
      silhouette: { form: 'aberration', accent: '#ff5db0', spikes: 0, eyes: 5 },
      weakness: { Vital: 1.3, Caustic: 1.1 },
      phases: [
        { at: 1, name: 'Echoing', abilities: [volley(5, 12, 6, 3), cloak(1.2, 9, 5)] },
        { at: 0.45, name: 'Discord', speedMult: 1.1, abilities: [volley(6, 13, 5, 2), suppress(130, 2.4, 9, 4)] },
      ],
    },
  }),
};

// ── Procedural modifiers (future enhancement seam) ───────────────────────────
// A boss can spawn with a set of modifier ids that mutate it before combat — the
// hook Stage/Endless escalation and event mutators ride on. Each modifier folds into
// one `BossModEffect`; game.ts applies the stat scales at spawn and feeds the rest
// into the BossRuntime. Adding a modifier is one data entry.
export interface BossModEffect {
  hpMult: number;
  speedMult: number;
  bountyMult: number;
  cooldownMult: number; // <1 = abilities fire faster
  bonus: BossAbility[]; // extra abilities active in every phase
  adaptive: boolean; // rotate the resisted class by phase
  labels: string[]; // applied modifier names (UI/codex)
}

export interface BossModifier {
  id: string;
  name: string;
  description: string;
  apply: (e: BossModEffect) => void;
}

export const BOSS_MODIFIERS: BossModifier[] = [
  { id: 'colossal', name: 'Colossal', description: '+45% HP, +30% bounty.', apply: (e) => { e.hpMult *= 1.45; e.bountyMult *= 1.3; } },
  { id: 'frenzied', name: 'Frenzied', description: '+25% speed; abilities fire 20% faster.', apply: (e) => { e.speedMult *= 1.25; e.cooldownMult *= 0.8; } },
  { id: 'unstable', name: 'Unstable', description: 'Continuously sheds hostile acid pools.', apply: (e) => { e.bonus.push(hazard(11, 44, 3, 7, 3)); } },
  { id: 'vampiric', name: 'Vampiric', description: 'Periodically regenerates (Corrosion negates it).', apply: (e) => { e.bonus.push(heal(0.06, 8, 5)); } },
  { id: 'warded', name: 'Warded', description: 'Re-raises a shield over time.', apply: (e) => { e.bonus.push(shield(140, 10, 6)); } },
  { id: 'adaptive', name: 'Adaptive', description: 'Rotates which damage type it resists each phase.', apply: (e) => { e.adaptive = true; } },
];

const MOD_BY_ID = new Map(BOSS_MODIFIERS.map((m) => [m.id, m]));

/** Fold a list of modifier ids into a single effect (unknown ids ignored). */
export function applyBossModifiers(ids: readonly string[] | undefined): BossModEffect {
  const e: BossModEffect = { hpMult: 1, speedMult: 1, bountyMult: 1, cooldownMult: 1, bonus: [], adaptive: false, labels: [] };
  if (!ids) return e;
  for (const id of ids) {
    const m = MOD_BY_ID.get(id);
    if (m) { m.apply(e); e.labels.push(m.name); }
  }
  return e;
}

// ── Biome → boss selection (Stage Mode + Endless) ────────────────────────────
// Each faction-biome fields a flagship (deep stages / Endless surges) plus shallow
// mini-bosses. Deterministic from (biome, stageNumber) — no RNG draw, so wiring boss
// selection never perturbs the wave RNG stream (stage determinism preserved).
const BIOME_BOSSES: Record<BiomeId, { shallow: BossKind[]; deep: BossKind }> = {
  wasteland: { shallow: ['tyrant'], deep: 'progenitor' },
  machine: { shallow: ['aegis', 'reclaimer'], deep: 'forgemind' },
  corporate: { shallow: ['field_commander', 'breacher_prime'], deep: 'golden_parachute' },
  bone: { shallow: ['lumberer_king'], deep: 'apex_rival' },
  marsh: { shallow: ['phantom'], deep: 'dreaming_god' },
};

/** The boss a stage of the given biome + depth fields (deep ⇒ the flagship). */
export function bossForBiome(biome: BiomeId, stageNumber: number): BossKind {
  const set = BIOME_BOSSES[biome];
  if (stageNumber >= 5) return set.deep;
  const pool = set.shallow;
  return pool[stageNumber % pool.length];
}

/** The flagship boss for a biome (Endless surges escalate straight to it). */
export function flagshipBoss(biome: BiomeId): BossKind {
  return BIOME_BOSSES[biome].deep;
}
