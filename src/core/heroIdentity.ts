// Hero identity framework (docs/HERO-FRAMEWORK.md) — the data-driven layer that turns each hero into
// a deep, distinct playstyle: Role · Passive · Trait · Scaling mechanic · Strengths · Weaknesses ·
// AI survival profile. HeroDef (config.ts) keeps the base stats + the signature Active ability; this
// adds everything else. Pure data + lookups (no DOM/sim). A new hero is one row (future expansion).
//
// GOLDEN-SAFETY (HERO-FRAMEWORK.md §4): the Ravager's mechanics are scoped to `elite` enemies (absent
// from Stage-mode authored waves), and Shepherd/Overseer are never fielded by autoplay — so the
// pinned golden outcomes never drift.

import type { HeroKind } from './types';

/** What a hero's always-on PASSIVE does mechanically (read at a fixed sim hook). */
export type HeroPassiveKind =
  | 'eliteDamage' // + hero damage vs elite enemies (Ravager)
  | 'towerAura' // innate aura: nearby towers gain fire-rate + damage (Shepherd)
  | 'vulnField' // disrupted enemies take extra damage from all sources (Overseer)
  | 'causticVuln' // CORRODED enemies take extra damage from all sources (Vitriol)
  | 'viralVuln'; // INFECTED enemies take extra damage from all sources (Revenant)

/** A hero's defining identity rule (flavour + a light mechanical lean). */
export type HeroTraitKind =
  | 'eliteHunter' // elite kills heal + briefly haste the hero (Ravager)
  | 'broodTender' // summons/pulse lean to crowd control (Shepherd)
  | 'targetHijack' // the control field drags + denies the lane (Overseer)
  | 'groundDenial' // every shell leaves a lingering acid pool (Vitriol)
  | 'plagueStrike'; // blink-strikes inject Infection that spreads on the host's death (Revenant)

/** How a hero scales WITHIN a run so it stays relevant to endgame. */
export type HeroScalingKind =
  | 'killchain' // stacking bonus vs-elite damage per elite slain this run (Ravager)
  | 'livingHive' // the tower aura strengthens per nearby tower (Shepherd)
  | 'overload' // the vulnerability field deepens with depth (Overseer)
  | 'saturation' // the Corrosion vulnerability deepens with depth (Vitriol)
  | 'virulence'; // the Infection vulnerability deepens with depth (Revenant)

/** AI repositioning profile (game.ts hero brains): aggressive never retreats (a weakness). */
export type HeroSurvival = 'aggressive' | 'cautious' | 'evasive';

export interface HeroPassive { name: string; desc: string; kind: HeroPassiveKind; amount: number }
export interface HeroTrait { name: string; desc: string; kind: HeroTraitKind }
export interface HeroScaling { name: string; desc: string; kind: HeroScalingKind; perStack: number; cap: number }

export interface HeroIdentity {
  kind: HeroKind;
  role: string;
  strengths: string[];
  weaknesses: string[];
  passive: HeroPassive;
  trait: HeroTrait;
  scaling: HeroScaling;
  survival: HeroSurvival;
}

// ── The three identities (placeholder numbers — balance is a later pass) ─────────────────────
export const HERO_IDENTITIES: Record<HeroKind, HeroIdentity> = {
  ravager: {
    kind: 'ravager',
    role: 'Aggressive frontline hunter — dives the deadliest targets and exists to delete elites & bosses.',
    strengths: ['Deletes elites & bosses', 'High mobility', 'Frontline burst'],
    weaknesses: ['Fragile — no self-sustain', 'No tower or crowd support', 'Overextends into danger'],
    passive: { name: 'Apex Predator', desc: '+50% damage to elite enemies.', kind: 'eliteDamage', amount: 0.5 },
    trait: { name: 'Bloodthirst', desc: 'Slaying an elite heals the Ravager and briefly boosts its speed.', kind: 'eliteHunter' },
    scaling: { name: 'Killchain', desc: 'Each elite slain this run adds +4% elite damage (stacking, up to +60%).', kind: 'killchain', perStack: 0.04, cap: 0.6 },
    survival: 'aggressive',
  },
  shepherd: {
    kind: 'shepherd',
    role: 'Summoner-support — sustains the line, empowers nearby towers, and births organisms.',
    strengths: ['Buffs nearby towers', 'Heals the Nucleus', 'Summons + crowd control'],
    weaknesses: ['Low personal damage', 'Slow', 'Reliant on positioning near towers'],
    passive: { name: 'Symbiosis', desc: 'Towers near the Shepherd gain fire rate and damage.', kind: 'towerAura', amount: 0.15 },
    trait: { name: 'Brood Tender', desc: 'Its vital pulse also slows enemies; its summons endure.', kind: 'broodTender' },
    scaling: { name: 'Living Hive', desc: 'The Symbiosis aura strengthens for each tower nearby (up to +60%).', kind: 'livingHive', perStack: 0.15, cap: 0.6 },
    survival: 'cautious',
  },
  overseer: {
    kind: 'overseer',
    role: 'Battlefield controller — denies ground, debuffs crowds, manipulates targeting, amplifies your build.',
    strengths: ['Area denial', 'Deep debuffs (slow + vulnerability)', 'Amplifies all damage on a marked crowd'],
    weaknesses: ['Almost no direct damage', 'Needs a build to capitalize', 'Fragile'],
    passive: { name: 'Neural Static', desc: 'Enemies in its Disruption field take extra damage from ALL sources.', kind: 'vulnField', amount: 0.2 },
    trait: { name: 'Hijack', desc: 'The field drags enemies — denying the lane and scattering their advance.', kind: 'targetHijack' },
    scaling: { name: 'Overload', desc: 'The vulnerability field deepens the deeper the run (up to +40%).', kind: 'overload', perStack: 0.02, cap: 0.4 },
    survival: 'evasive',
  },
  vitriol: {
    kind: 'vitriol',
    role: 'Ranged siege artillery — holds the rear line and saturates the field with corrosive bombardment and acid pools.',
    strengths: ['Safe ranged DPS', 'Area denial (Corrosion pools)', 'Melts armor + softens the whole field'],
    weaknesses: ['No sustain, control, or burst', 'Fragile if the line collapses to its rear', 'Damage-over-time — slow vs single burst threats'],
    passive: { name: 'Solvent Rounds', desc: 'CORRODED enemies take extra damage from ALL sources — the bombardment softens everything it touches.', kind: 'causticVuln', amount: 0.18 },
    trait: { name: 'Ground Denial', desc: 'Every shell leaves a lingering acid pool that melts armor and chokes the lane.', kind: 'groundDenial' },
    scaling: { name: 'Saturation', desc: 'The deeper the run, the more its Corrosion softens targets (up to +30%).', kind: 'saturation', perStack: 0.015, cap: 0.3 },
    survival: 'cautious',
  },
  revenant: {
    kind: 'revenant',
    role: 'Phase-stalking assassin — BLINKS to the biggest threat (boss → elite → highest-HP) and deletes it with heavy, spreading Infection.',
    strengths: ['Deletes single elites & bosses', 'Teleport mobility — reaches anything, anywhere', 'Amplifies all Infection damage on the field'],
    weaknesses: ['Fragile — a glass assassin', 'No crowd clear, control, or sustain for the line', 'Wasted on a swarm — it wants ONE fat target'],
    passive: { name: 'Virulent Presence', desc: 'INFECTED enemies take extra damage from ALL sources — everything the Revenant touches rots faster.', kind: 'viralVuln', amount: 0.18 },
    trait: { name: 'Plague Strike', desc: 'Its blink-strikes inject a deep Infection; an infected host bursts the plague to its neighbors on death.', kind: 'plagueStrike' },
    scaling: { name: 'Virulence', desc: 'The deeper the run, the more its Infection softens targets (up to +30%).', kind: 'virulence', perStack: 0.015, cap: 0.3 },
    survival: 'evasive',
  },
};

export function heroIdentity(kind: HeroKind): HeroIdentity {
  return HERO_IDENTITIES[kind];
}
