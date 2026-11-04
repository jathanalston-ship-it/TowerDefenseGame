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
  | 'viralVuln' // INFECTED enemies take extra damage from all sources (Revenant)
  | 'gravebind'; // enemies dying near the hero RISE as thralls (Carrion — game.raiseFromCorpse)

/** A hero's defining identity rule (flavour + a light mechanical lean). */
export type HeroTraitKind =
  | 'eliteHunter' // elite kills heal + briefly haste the hero (Ravager)
  | 'broodTender' // summons/pulse lean to crowd control (Shepherd)
  | 'targetHijack' // the control field drags + denies the lane (Overseer)
  | 'groundDenial' // every shell leaves a lingering acid pool (Vitriol)
  | 'plagueStrike' // blink-strikes inject Infection that spreads on the host's death (Revenant)
  | 'resonantToll' // the tolling pulse staggers; its peals amplify the whole hive (Knell — the stagger IS the pulse's disrupt)
  | 'strafingRun'; // fly-by strikes corrode + bank THROUGH the target — it never stops moving (Cinderwyrm)

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
  knell: {
    kind: 'knell',
    role: 'Amplification conductor — tolls damaging shockwaves in the densest fight and makes the WHOLE hive strike harder in answer.',
    strengths: ['Run-wide tower-damage peals (the amp windows)', 'Innate aura hastens + hardens nearby towers', 'Real AoE chip with a stagger'],
    weaknesses: ['No single-target burst of its own', 'Slow — the bell arrives late', 'Its value multiplies a BUILD; alone it is quiet'],
    passive: { name: 'Resonance', desc: 'Towers near the Knell gain fire rate and damage — one note the battlefield obeys.', kind: 'towerAura', amount: 0.12 },
    trait: { name: 'The Toll', desc: 'Its pulse is a damaging shockwave that briefly staggers everything caught.', kind: 'resonantToll' },
    scaling: { name: 'Congregation', desc: 'The Resonance aura strengthens for each tower standing near the bell.', kind: 'livingHive', perStack: 0.12, cap: 0.48 },
    survival: 'cautious',
  },
  wyrm: {
    kind: 'wyrm',
    role: 'Flying strafe-fighter — a biomech dragon that never lands: fly-by strikes, corroding breath, and firestorm ground denial.',
    strengths: ['Constant mobility — strikes and BANKS through, never standing in danger', 'Corrosion on every pass softens the whole lane', 'Firestorm pools deny ground'],
    weaknesses: ['No sustain or shields — it must keep moving to live', 'Never retreats (a designed recklessness)', 'Damage spread across passes — slow into one fat target'],
    passive: { name: 'Emberwake', desc: 'CORRODED enemies take extra damage from ALL sources — everything it overflies smolders.', kind: 'causticVuln', amount: 0.15 },
    trait: { name: 'Strafing Run', desc: 'Every fly-by strike douses the victim in Corrosion, and the wyrm banks THROUGH to the far side — always moving, never caught.', kind: 'strafingRun' },
    scaling: { name: 'Firestorm', desc: 'The deeper the run, the hotter its Corrosion burns (up to +30%).', kind: 'saturation', perStack: 0.015, cap: 0.3 },
    survival: 'aggressive',
  },
  carrion: {
    kind: 'carrion',
    role: 'Charnel necromancer — drifts to the densest fight and raises the fallen as Risen Thralls that fight for the hive.',
    strengths: ['Turns every kill zone into reinforcements', 'Thralls rise with a fraction of the corpse\'s own body', 'Self-sustaining army with the flies chipping on top'],
    weaknesses: ['Slow to start — it needs corpses before it has an army', 'No burst, control, or line sustain of its own', 'Thralls are mortal and capped — a clean sweep leaves it alone'],
    // The passive IS the raise (the one new sim verb this hero ships — game.raiseFromCorpse,
    // amount = a data hint only); the scaling is the shared per-wave curve the raise reads to
    // deepen thrall bodies with depth.
    passive: { name: 'Gravebind', desc: 'Enemies that die near the Carrion RISE as Risen Thralls carrying part of their own bodies.', kind: 'gravebind', amount: 0.4 },
    trait: { name: 'Charnel Tender', desc: 'Its calls and corpses lean to crowd service — the risen endure for the hive.', kind: 'broodTender' },
    scaling: { name: 'The Pile Grows', desc: 'The deeper the run, the stronger its risen stand (up to +30%).', kind: 'overload', perStack: 0.015, cap: 0.3 },
    survival: 'cautious',
  },
  fovea: {
    kind: 'fovea',
    role: 'Rear-line executioner lance — a living oculus that deletes the fattest, deepest threats with colossal single strikes.',
    strengths: ['Massive single-target execution at extreme range', 'The anti-elite specialist (+damage, feeds on their deaths)', 'Its glares stagger what they hold'],
    weaknesses: ['Slow cadence — wasted on chaff a needle could kill', 'Utterly fragile if the line collapses to its rear', 'No area presence of its own'],
    passive: { name: 'Predator\'s Focus', desc: '+40% damage to elite enemies — the eye exists for the great.', kind: 'eliteDamage', amount: 0.4 },
    trait: { name: 'Savored Kill', desc: 'Slaying an elite feeds the Fovea — it mends and quickens with every great death.', kind: 'eliteHunter' },
    scaling: { name: 'Killchain Gaze', desc: 'Each elite slain this run adds +4% elite damage (stacking, up to +60%).', kind: 'killchain', perStack: 0.04, cap: 0.6 },
    survival: 'cautious',
  },
  chimera: {
    kind: 'chimera',
    role: 'The arena-bred duelist — a spliced amalgam that dives the biggest fight, slams it flat, and stitches itself back together mid-round.',
    strengths: ['A colossal opening slam that infects everything under it', 'Self-mending — it outlasts trades other divers lose', 'The finishing cleave clears what the slam cracked'],
    weaknesses: ['Melee reach — artillery castes outrange it', 'Its mending has a cadence; burst inside the window kills it', 'No ranged presence at all'],
    passive: { name: 'Trophy Tissue', desc: '+40% damage to elite enemies — it was grown from the arena\'s champions.', kind: 'eliteDamage', amount: 0.4 },
    trait: { name: 'Victor\'s Meal', desc: 'Slaying an elite feeds the amalgam — it mends and quickens with every trophy taken.', kind: 'eliteHunter' },
    scaling: { name: 'Champion\'s Ledger', desc: 'Each elite slain this run adds +4% elite damage (stacking, up to +60%).', kind: 'killchain', perStack: 0.04, cap: 0.6 },
    survival: 'aggressive',
  },
  riptide: {
    kind: 'riptide',
    role: 'Zone-control bruiser — flows to the densest pack, crushes it under tidal pulses, and drowns the ground in undertow pools.',
    strengths: ['Real AoE chip + area denial in one chassis', 'Undertow pools grind the wave where it stands', 'Durable for a controller — the tide holds the middle'],
    weaknesses: ['No single-target burst — a fat boss wades through', 'No sustain or buffs for the line', 'Its stagger is a drag, not a lockdown'],
    // Reuses the shared sim verbs (heroVulnBonus sums every vulnField hero generically): its
    // dragging water Disrupts, so everything caught in the current takes more from ALL sources —
    // shallower than the Overseer's static (the Riptide brings real damage of its own).
    passive: { name: 'Waterlogged', desc: 'DISRUPTED enemies take extra damage from ALL sources — soaked chitin splits under every blow.', kind: 'vulnField', amount: 0.12 },
    trait: { name: 'Undertow', desc: 'Its current DRAGS — the tidal field denies the lane and scatters the advance.', kind: 'targetHijack' },
    scaling: { name: 'Rising Tide', desc: 'The deeper the run, the harder the water grips (up to +30%).', kind: 'overload', perStack: 0.015, cap: 0.3 },
    survival: 'cautious',
  },
  myceliarch: {
    kind: 'myceliarch',
    role: 'Gatekeeper — rooted at the Core, it rots whatever breaches the defense zone: a damaging spore pulse, a sticky stagger, and deep Infection at the gate.',
    strengths: ['Kills at the LAST line — real AoE pulse where leaks happen', 'Seeds deep Infection the whole board exploits', 'Tanky, self-shielding, and it mends the Hive'],
    weaknesses: ['Never leaves the gate — no reach up-lane', 'Slow — a fast leak darts past its pulse', 'Wasted when nothing breaches: a good board starves it'],
    // Reuses the shared sim verbs (heroInfectionVulnBonus sums every viralVuln hero generically):
    // the spore-rot it seeds softens what the towers are already shooting — shallower than the
    // Revenant's presence (the Myceliarch brings a real damaging pulse of its own).
    passive: { name: 'Spore Rot', desc: 'INFECTED enemies take extra damage from ALL sources — the rot it seeds at the gate softens everything still coming.', kind: 'viralVuln', amount: 0.14 },
    trait: { name: 'Sticky Spores', desc: 'Its pulse CLINGS — everything caught at the gate is briefly staggered while the rot takes hold.', kind: 'broodTender' },
    scaling: { name: 'Mycelial Bloom', desc: 'The deeper the run, the deeper its rot softens targets (up to +30%).', kind: 'virulence', perStack: 0.015, cap: 0.3 },
    survival: 'cautious',
  },
};

export function heroIdentity(kind: HeroKind): HeroIdentity {
  return HERO_IDENTITIES[kind];
}
