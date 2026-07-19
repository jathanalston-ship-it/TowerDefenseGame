// MEGA BOSS framework (docs/MEGA-BOSS.md) — battlefield-scale RAID organisms, a sibling of the
// framework-boss composition in boss.ts, NOT an oversized enemy. A Mega Boss is ANCHORED across the
// top of the field (its body extends beyond the screen), never walks, and almost never touches the
// Hive directly: it manipulates everything else (enemy auras, tower suppression, economy leech,
// summons) through a modular ABILITY rotation while the player defeats it through its WEAK POINTS —
// independent gameplay objects with their own HP/armor/windows whose destruction always changes the
// fight (interrupt, stun, expose, disable), never "just bonus damage".
//
// All DATA + pure helpers: registries + validators + scheduling + the reward formula. The sim
// (game.ts megaBossSystem) owns execution; the renderer (render/megaboss.ts) owns presentation.
// No React/DOM, no Math.random — anything rolled takes an rng. A run without a Mega Boss pays
// nothing (every hook is gated on `megaBoss !== null`, every field-mod defaults neutral) — the
// golden baseline is byte-identical.

import type { EnemyKind } from './types';
import { Registry } from './registry';

// ── Ability modules — the battlefield-manipulation verbs ─────────────────────
// Reusable across every Mega Boss (future megas are assembled from this pool + weak points; adding
// a verb here + one switch arm in megaBossSystem is the ONLY code a new manipulation needs).
export type MegaAbilityKind =
  | 'haste' // enemy movement-speed aura (magnitude = mult, e.g. 1.35)
  | 'chitinize' // enemy bonus armor (magnitude = flat armor added)
  | 'eliteSurge' // spawn `count` director-style elites (addKind promoted)
  | 'brood' // spawn `count` normal adds of addKind
  | 'menders' // spawn `count` healing organisms ('mender' kind — kill-priority pressure)
  | 'shieldWeave' // grant every living enemy a front-shield (magnitude = shield HP)
  | 'dampen' // ALL towers fire slower (magnitude = fire-rate mult < 1)
  | 'suppressRange' // ALL towers lose reach (magnitude = range mult < 1)
  | 'slowShots' // projectile velocity mult < 1 (shots hang in the air)
  | 'leech' // biomass income mult < 1 (the boss drinks the economy)
  | 'jam' // hero ability cooldowns run slower (magnitude = cooldown mult > 1)
  | 'corrupt' // corrupt `count` build slots (towers there are disabled for the window)
  | 'gorge' // DEVOUR up to `count` field enemies nearest the maw, healing `magnitude` HP each
  //           (tier-scaled) — deny it by slaughtering the food first, or interrupt the meal
  | 'adapt' // learn the run's TOP-DAMAGE tower kind: that kind deals ×magnitude (<1) to this
  //           boss for `duration` — the anti-meta verb; diversify, or interrupt the lesson
  | 'cataclysm'; // the FINALE: a long, interruptible windup → `magnitude` Hive integrity damage
  //               lands if it resolves. Every mega carries one in its desperation phase.

/** One rotation entry: telegraphed (interruptible during `telegraph`), then active for `duration`.
 *  Instant verbs (brood/eliteSurge/menders/shieldWeave) fire at the end of the telegraph. */
export interface MegaAbility {
  kind: MegaAbilityKind;
  cooldown: number; // seconds between casts (rotation-owned)
  telegraph: number; // windup seconds — the counterplay window (eye interrupts land here)
  duration: number; // active seconds for aura/suppression verbs (0 for instants)
  magnitude?: number; // mult / flat amount per kind (see MegaAbilityKind comments)
  count?: number; // summon verbs: how many
  addKind?: EnemyKind; // summon verbs: what
}

/** A PASSIVE battlefield pressure — always on while its phase is active (no telegraph, no
 *  cooldown). Disabled temporarily when a 'nerve_bundle' weak point is destroyed. */
export interface MegaPassive {
  kind: Extract<MegaAbilityKind, 'haste' | 'chitinize' | 'dampen' | 'suppressRange' | 'leech' | 'jam' | 'slowShots'>;
  magnitude: number;
}

// ── Weak points — the signature mechanic ─────────────────────────────────────
export type WeakPointKind =
  | 'eye' // destroying: INTERRUPTS the current telegraph + stuns the rotation
  | 'heart' // destroying: EXPOSES the boss (takes bonus damage for a window)
  | 'parasite_sac' // destroying: halts summon verbs + weakens already-spawned adds
  | 'armored_growth' // destroying: strips the boss's armor for a window
  | 'shield_generator' // destroying: purges enemy shields + disables shieldWeave
  | 'nerve_bundle' // destroying: disables the active PASSIVE for a window
  | 'regen_organ' // destroying: cancels boss self-regeneration for a window
  | 'spore_cluster' // destroying: bursts into biomass + disables leech
  | 'energy_core' // destroying: overloads INTO your grid — temporary tower fire-rate buff
  | 'mutation_node'; // destroying: the next phase enters WEAKENED (no entry surge)

/** The consequence a destroyed weak point applies. Data, so future weak points map new effects
 *  without touching the sim switch (one arm per `effect`, reused by every kind that picks it). */
export interface WeakPointConsequence {
  effect:
    | 'interrupt' // cancel the current telegraph; `seconds` stuns the whole rotation
    | 'expose' // boss takes ×(1+frac) damage for `seconds`
    | 'haltSummons' // summon verbs disabled `seconds`; living adds lose `frac` of current HP
    | 'armorBreak' // boss armor → 0 for `seconds`
    | 'purgeShields' // all enemy shields destroyed; shieldWeave disabled `seconds`
    | 'disablePassive' // passives off for `seconds`
    | 'stopRegen' // boss regen off for `seconds`
    | 'biomassBurst' // instant +`amount` biomass; leech disabled `seconds`
    | 'towerBuff' // all towers ×(1+frac) fire rate for `seconds`
    | 'weakenPhase'; // next phase entry surge is skipped
  seconds?: number;
  frac?: number;
  amount?: number;
}

/** The per-KIND library — stats + consequence + read-at-a-glance HUD strings. Registry-driven:
 *  a future weak point is one entry here (visuals key off `kind` procedurally). */
export interface WeakPointDef {
  kind: WeakPointKind;
  name: string;
  hpFrac: number; // HP as a fraction of the boss's max HP
  armor: number; // its own armor (0 = soft burst target)
  window: number; // seconds it stays open (0 = until destroyed)
  regen: boolean; // un-destroyed points regrow after closing (destroyed ones never return)
  consequence: WeakPointConsequence;
  hudNote: string; // "what changed" callout, e.g. 'Reinforcements halted'
}

export const WEAK_POINT_DEFS: Record<WeakPointKind, WeakPointDef> = {
  eye: { kind: 'eye', name: 'Lidless Eye', hpFrac: 0.030, armor: 0, window: 9, regen: true, consequence: { effect: 'interrupt', seconds: 5 }, hudNote: 'Ability interrupted — rotation stunned' },
  heart: { kind: 'heart', name: 'Resonant Heart', hpFrac: 0.055, armor: 8, window: 11, regen: true, consequence: { effect: 'expose', seconds: 8, frac: 0.5 }, hudNote: 'Boss EXPOSED — +50% damage taken' },
  parasite_sac: { kind: 'parasite_sac', name: 'Parasite Sac', hpFrac: 0.040, armor: 0, window: 10, regen: true, consequence: { effect: 'haltSummons', seconds: 12, frac: 0.35 }, hudNote: 'Summoning halted — brood weakened' },
  armored_growth: { kind: 'armored_growth', name: 'Armored Growth', hpFrac: 0.060, armor: 22, window: 0, regen: false, consequence: { effect: 'armorBreak', seconds: 10 }, hudNote: 'Carapace shattered — armor stripped' },
  shield_generator: { kind: 'shield_generator', name: 'Shield Generator', hpFrac: 0.045, armor: 10, window: 12, regen: true, consequence: { effect: 'purgeShields', seconds: 14 }, hudNote: 'Shields purged — weave disabled' },
  nerve_bundle: { kind: 'nerve_bundle', name: 'Nerve Bundle', hpFrac: 0.035, armor: 4, window: 10, regen: true, consequence: { effect: 'disablePassive', seconds: 12 }, hudNote: 'Passive aura severed' },
  regen_organ: { kind: 'regen_organ', name: 'Regeneration Organ', hpFrac: 0.050, armor: 6, window: 0, regen: false, consequence: { effect: 'stopRegen', seconds: 15 }, hudNote: 'Regeneration cancelled' },
  spore_cluster: { kind: 'spore_cluster', name: 'Spore Cluster', hpFrac: 0.030, armor: 0, window: 8, regen: true, consequence: { effect: 'biomassBurst', seconds: 10, amount: 120 }, hudNote: 'Biomass reclaimed — leech disabled' },
  energy_core: { kind: 'energy_core', name: 'Energy Core', hpFrac: 0.040, armor: 8, window: 9, regen: true, consequence: { effect: 'towerBuff', seconds: 8, frac: 0.3 }, hudNote: 'Core overload — towers surging' },
  mutation_node: { kind: 'mutation_node', name: 'Mutation Node', hpFrac: 0.045, armor: 6, window: 10, regen: true, consequence: { effect: 'weakenPhase' }, hudNote: 'Next mutation suppressed' },
};

export const weakPointRegistry = new Registry<WeakPointDef>('weakPoint', {
  idOf: (d) => d.kind,
  validate: (d) => {
    const out: string[] = [];
    if (!(d.hpFrac > 0 && d.hpFrac < 0.2)) out.push('hpFrac must be in (0, 0.2) — a weak point is a burst target, not a second boss');
    if (d.window < 0) out.push('window must be ≥ 0');
    if (d.consequence.effect !== 'weakenPhase' && d.consequence.effect !== 'biomassBurst' && !(d.consequence.seconds && d.consequence.seconds > 0)) out.push(`${d.kind}: consequence needs positive seconds`);
    return out;
  },
});
weakPointRegistry.registerAll(Object.values(WEAK_POINT_DEFS));

/** WHEN a weak point opens. Every Mega Boss decides its own choreography from these triggers. */
export interface WeakPointSpawn {
  kind: WeakPointKind;
  on: 'phaseEntry' | 'hpBelow' | 'timer' | 'abilityCast';
  at?: number; // hpBelow: open when boss HP frac ≤ this
  every?: number; // timer: seconds between openings
  ability?: MegaAbilityKind; // abilityCast: opens whenever this verb telegraphs
  // Anchor INSIDE the battlefield (the organ descends into tower reach on a fleshy stalk).
  x: number; // 0..1 of field width
  y: number; // absolute px from the top (must sit in MEGA.minWeakPointY..maxWeakPointY — the descent band real tower rows can reach)
}

export interface MegaPhase {
  threshold: number; // enter when hp frac ≤ this (first = 1)
  abilities: number[]; // indices into MegaBossDef.abilities active this phase
  passive?: MegaPassive; // the phase's always-on pressure (nerve bundles sever it)
  entrySurge?: { count: number; addKind: EnemyKind }; // reinforcements on phase entry (mutation_node skips)
  regenPerSec?: number; // boss self-heal per second this phase (regen_organ cancels)
  visualTier?: number; // renderer mutation stage (defaults to phase index)
}

/** The renderer's per-def ANATOMY key (render/megaboss.ts drawMotif): each motif is a small
 *  silhouette suite (crest, underside organs, maw character) layered over the shared body, so
 *  two megas never read as palette swaps. A new mega picks one (or earns a new suite). */
export type MegaMotif = 'maw' | 'choir' | 'shepherd' | 'tide' | 'tithe' | 'gorge' | 'myriad';

export interface MegaBossDef {
  id: string;
  name: string;
  title: string; // codex subtitle, e.g. 'The Buried Maw'
  lore: string; // codex flavor
  codex: string; // codex mechanics summary (what it does / how to fight it)
  hp: number; // base HP at tier 1 (scaled by assembleMegaEncounter)
  armor: number; // base armor (armored_growth strips it)
  bodyFrac: number; // fraction of field height its visible mass occupies (renderer)
  palette: { body: string; glow: string; accent: string }; // procedural visual identity
  motif: MegaMotif; // per-def anatomy suite (renderer) — silhouette identity beyond palette
  abilities: MegaAbility[];
  phases: MegaPhase[]; // ordered high→low threshold; phases[0].threshold === 1
  weakPoints: WeakPointSpawn[];
  reward: { ichor: number }; // base Ichor at tier 1 (scaled by tier + efficiency)
  themeCue: string; // arrival audio cue tag (sound.ts) — the encounter's sonic identity
}

// ── The two authored Mega Bosses ─────────────────────────────────────────────
export const MEGA_BOSS_DEFS: Record<string, MegaBossDef> = {
  // VORAXIS — the AGGRESSION mega: it makes the horde itself lethal. Everything it does feeds the
  // wave pressure (haste, armor, elites, shields, broods); its weak points teach interrupt priority
  // (eyes during telegraphs) and burst windows (the gullet-heart exposure).
  voraxis: {
    id: 'voraxis',
    name: 'VORAXIS',
    title: 'The Buried Maw',
    lore: 'It was here before the Hive. The ridge you spawn your defenses beneath is its lower jaw; the tremor between waves is its patience running out. Voraxis does not attack — it FEEDS the attack.',
    codex: 'Anchored across the ridge. Empowers every enemy on the field (speed, armor, shields) and vomits broods of reinforcements. Interrupt its telegraphs by bursting the Lidless Eyes; crack the Armored Growths early; when the Gullet-Heart descends, commit everything — it takes +50% damage while exposed.',
    hp: 5200,
    armor: 14,
    bodyFrac: 0.32,
    palette: { body: '#7a2334', glow: '#ff5d73', accent: '#c7b27a' },
    motif: 'maw',
    abilities: [
      { kind: 'haste', cooldown: 16, telegraph: 2.2, duration: 8, magnitude: 1.35 }, // 0
      { kind: 'chitinize', cooldown: 19, telegraph: 2.4, duration: 9, magnitude: 10 }, // 1
      { kind: 'brood', cooldown: 13, telegraph: 2.0, duration: 0, count: 5, addKind: 'runner' }, // 2
      { kind: 'eliteSurge', cooldown: 26, telegraph: 3.0, duration: 0, count: 2, addKind: 'rusher' }, // 3
      { kind: 'shieldWeave', cooldown: 22, telegraph: 2.6, duration: 0, magnitude: 60 }, // 4
      { kind: 'brood', cooldown: 17, telegraph: 2.2, duration: 0, count: 3, addKind: 'lasher' }, // 5
      { kind: 'cataclysm', cooldown: 48, telegraph: 5.5, duration: 0, magnitude: 16 }, // 6 — the ridge itself bites
    ],
    phases: [
      { threshold: 1, abilities: [0, 2], visualTier: 0 }, // P1: learn the eye-interrupt
      { threshold: 0.72, abilities: [0, 1, 2], entrySurge: { count: 4, addKind: 'runner' }, visualTier: 1 },
      { threshold: 0.45, abilities: [0, 1, 3, 4], passive: { kind: 'haste', magnitude: 1.12 }, entrySurge: { count: 5, addKind: 'rusher' }, visualTier: 2 },
      { threshold: 0.18, abilities: [2, 3, 4, 5, 6], passive: { kind: 'haste', magnitude: 1.2 }, entrySurge: { count: 6, addKind: 'rusher' }, regenPerSec: 6, visualTier: 3 }, // desperation: it knits itself
    ],
    weakPoints: [
      { kind: 'eye', on: 'abilityCast', ability: 'eliteSurge', x: 0.3, y: 560 },
      { kind: 'eye', on: 'timer', every: 24, x: 0.7, y: 560 },
      { kind: 'armored_growth', on: 'phaseEntry', x: 0.5, y: 600 },
      { kind: 'parasite_sac', on: 'abilityCast', ability: 'brood', x: 0.18, y: 630 },
      { kind: 'heart', on: 'hpBelow', at: 0.45, x: 0.5, y: 670 },
      { kind: 'regen_organ', on: 'hpBelow', at: 0.18, x: 0.62, y: 640 },
    ],
    reward: { ichor: 26 },
    themeCue: 'megaMaw',
  },

  // MERIDIA — the SUPPRESSION mega: it attacks YOUR machine, not with the horde. Dampened guns,
  // shortened range, jammed heroes, a leeched economy, mender organisms knitting the wave back
  // together. Weak points teach infrastructure triage (shield generator / nerve bundles) and pay
  // the economy back (spore clusters). A completely different fight from Voraxis.
  meridia: {
    id: 'meridia',
    name: 'MERIDIA',
    title: 'The Hollow Choir',
    lore: 'A cathedral that grew instead of being built. Its spires breach the clouds beyond the field; its congregation is every enemy you failed to kill, singing in its walls. Meridia never raises a limb — it simply turns your weapons into whispers.',
    codex: 'Anchored beyond the tree line. Suppresses your defense directly: slowed fire, shortened range, jammed hero abilities, leeched biomass — while Mender organisms heal the wave. Sever the Nerve Bundles to drop its passive choir; burst Spore Clusters to reclaim your economy; the Shield Generator and the Resonant Heart are your kill windows.',
    hp: 6400,
    armor: 8,
    bodyFrac: 0.36,
    palette: { body: '#22333f', glow: '#8fd0ff', accent: '#d98cff' },
    motif: 'choir',
    abilities: [
      { kind: 'dampen', cooldown: 18, telegraph: 2.4, duration: 9, magnitude: 0.62 }, // 0
      { kind: 'suppressRange', cooldown: 21, telegraph: 2.6, duration: 8, magnitude: 0.75 }, // 1
      { kind: 'jam', cooldown: 24, telegraph: 2.8, duration: 10, magnitude: 1.8 }, // 2
      { kind: 'leech', cooldown: 16, telegraph: 2.0, duration: 10, magnitude: 0.55 }, // 3
      { kind: 'menders', cooldown: 20, telegraph: 2.4, duration: 0, count: 2, addKind: 'mender' }, // 4
      { kind: 'corrupt', cooldown: 27, telegraph: 3.0, duration: 8, count: 2 }, // 5
      { kind: 'slowShots', cooldown: 19, telegraph: 2.2, duration: 8, magnitude: 0.6 }, // 6
      { kind: 'cataclysm', cooldown: 52, telegraph: 6.0, duration: 0, magnitude: 15 }, // 7 — one note, aimed at the Core
    ],
    phases: [
      { threshold: 1, abilities: [0, 3], visualTier: 0 }, // P1: the dampen/leech duet
      { threshold: 0.75, abilities: [0, 3, 4], passive: { kind: 'dampen', magnitude: 0.92 }, visualTier: 1 },
      { threshold: 0.5, abilities: [1, 2, 4, 6], passive: { kind: 'dampen', magnitude: 0.88 }, entrySurge: { count: 4, addKind: 'knitter' }, regenPerSec: 4, visualTier: 2 },
      { threshold: 0.22, abilities: [0, 1, 2, 5, 6, 7], passive: { kind: 'suppressRange', magnitude: 0.85 }, entrySurge: { count: 5, addKind: 'warden' }, regenPerSec: 7, visualTier: 3 },
    ],
    weakPoints: [
      { kind: 'nerve_bundle', on: 'phaseEntry', x: 0.25, y: 570 },
      { kind: 'nerve_bundle', on: 'timer', every: 26, x: 0.75, y: 570 },
      { kind: 'spore_cluster', on: 'abilityCast', ability: 'leech', x: 0.4, y: 630 },
      { kind: 'shield_generator', on: 'hpBelow', at: 0.75, x: 0.6, y: 600 },
      { kind: 'energy_core', on: 'abilityCast', ability: 'dampen', x: 0.82, y: 650 },
      { kind: 'heart', on: 'hpBelow', at: 0.5, x: 0.5, y: 680 },
      { kind: 'regen_organ', on: 'hpBelow', at: 0.3, x: 0.35, y: 650 },
      { kind: 'mutation_node', on: 'hpBelow', at: 0.6, x: 0.15, y: 620 },
    ],
    reward: { ichor: 30 },
    themeCue: 'megaChoir',
  },

  // OSSIRA — the FORTIFICATION mega: it makes the HORDE unkillable. Where Voraxis feeds the wave
  // and Meridia disarms you, Ossira armors, shields and mends everything that walks beneath it —
  // an attrition fight your chip damage loses. Weak points teach ANSWER PRIORITY: the twin
  // Armored Growths are its own plating (strip it or bounce), the Shield Generator and Nerve
  // Bundle turn the flock mortal again, and the Regeneration Organ is the kill switch on its
  // deep-phase self-mending.
  ossira: {
    id: 'ossira',
    name: 'OSSIRA',
    title: 'The Pale Shepherd',
    lore: 'It does not hate you. It simply keeps its flock — and everything that crawls toward your Hive is its flock. Bone chimes hang from its crook. Where its shadow falls, nothing you shoot stays down.',
    codex: 'Anchored above the drift. Armors and shields every enemy on the field, seeds Mender organisms, and knits itself back in its deep phases. Crack the twin Armored Growths early (its own plating), sever the Nerve Bundle to drop the chitin choir, burst the Shield Generator before a weave, and DESTROY the Regeneration Organ the moment it descends — or the attrition war is unwinnable.',
    hp: 7200,
    armor: 20,
    bodyFrac: 0.34,
    palette: { body: '#4a4238', glow: '#e8d5a0', accent: '#c7b27a' },
    motif: 'shepherd',
    abilities: [
      { kind: 'chitinize', cooldown: 15, telegraph: 2.4, duration: 10, magnitude: 12 }, // 0
      { kind: 'shieldWeave', cooldown: 20, telegraph: 2.6, duration: 0, magnitude: 80 }, // 1
      { kind: 'menders', cooldown: 22, telegraph: 2.6, duration: 0, count: 2, addKind: 'mender' }, // 2
      { kind: 'brood', cooldown: 16, telegraph: 2.2, duration: 0, count: 3, addKind: 'warden' }, // 3
      { kind: 'corrupt', cooldown: 28, telegraph: 3.0, duration: 7, count: 2 }, // 4
      { kind: 'haste', cooldown: 21, telegraph: 2.4, duration: 7, magnitude: 1.22 }, // 5
      { kind: 'cataclysm', cooldown: 55, telegraph: 6.0, duration: 0, magnitude: 18 }, // 6 — the crook comes down
    ],
    phases: [
      { threshold: 1, abilities: [0, 3], visualTier: 0 }, // P1: the chitin lesson
      { threshold: 0.7, abilities: [0, 1, 3], passive: { kind: 'chitinize', magnitude: 5 }, entrySurge: { count: 3, addKind: 'bulwark' }, visualTier: 1 },
      { threshold: 0.42, abilities: [0, 1, 2, 4], passive: { kind: 'chitinize', magnitude: 8 }, entrySurge: { count: 4, addKind: 'warden' }, regenPerSec: 8, visualTier: 2 },
      { threshold: 0.16, abilities: [1, 2, 3, 5, 6], passive: { kind: 'chitinize', magnitude: 10 }, entrySurge: { count: 5, addKind: 'warden' }, regenPerSec: 14, visualTier: 3 }, // desperation: the flock stampedes
    ],
    weakPoints: [
      { kind: 'armored_growth', on: 'phaseEntry', x: 0.35, y: 590 },
      { kind: 'armored_growth', on: 'hpBelow', at: 0.7, x: 0.65, y: 590 },
      { kind: 'nerve_bundle', on: 'timer', every: 25, x: 0.2, y: 570 },
      { kind: 'shield_generator', on: 'abilityCast', ability: 'shieldWeave', x: 0.8, y: 610 },
      { kind: 'heart', on: 'hpBelow', at: 0.42, x: 0.5, y: 675 },
      { kind: 'regen_organ', on: 'hpBelow', at: 0.42, x: 0.42, y: 635 },
      { kind: 'mutation_node', on: 'hpBelow', at: 0.55, x: 0.85, y: 630 },
    ],
    reward: { ichor: 34 },
    themeCue: 'megaShepherd',
  },

  // VESPERINE — the TEMPO mega: it owns TIME. Where the others push one axis, Vesperine
  // ALTERNATES — hanging your shots in the air, then hurling the wave forward, then jamming your
  // champions — so the fight is a rhythm the player must read. Eyes rule its choreography: every
  // interrupt matters more here than anywhere (its telegraphs ARE the tempo).
  vesperine: {
    id: 'vesperine',
    name: 'VESPERINE',
    title: 'The Tidebinder',
    lore: 'A cathedral jellyfish moored in the sky, its bells tolling hours that do not exist. Time near Vesperine is a suggestion — your shots hang like flies in amber while the tide beneath it never once arrives late.',
    codex: 'Anchored in the upper dark. Alternates battlefield TEMPO: slowed projectiles, surged waves, jammed hero clocks. Its Lidless Eyes open on every major telegraph — interrupt the rhythm or be played by it. The Resonant Heart at half tide is the commit window.',
    hp: 6800,
    armor: 10,
    bodyFrac: 0.35,
    palette: { body: '#1e2a4a', glow: '#6ad4e8', accent: '#b48ae0' },
    motif: 'tide',
    abilities: [
      { kind: 'slowShots', cooldown: 15, telegraph: 2.2, duration: 8, magnitude: 0.55 }, // 0 — the amber tide
      { kind: 'haste', cooldown: 17, telegraph: 2.4, duration: 7, magnitude: 1.3 }, // 1 — the surge tide
      { kind: 'jam', cooldown: 22, telegraph: 2.8, duration: 9, magnitude: 1.7 }, // 2 — stolen hours
      { kind: 'brood', cooldown: 14, telegraph: 2.0, duration: 0, count: 4, addKind: 'darter' }, // 3 — the tide's teeth
      { kind: 'eliteSurge', cooldown: 27, telegraph: 3.0, duration: 0, count: 2, addKind: 'lasher' }, // 4
      { kind: 'suppressRange', cooldown: 20, telegraph: 2.5, duration: 7, magnitude: 0.8 }, // 5 — the horizon closes
      { kind: 'cataclysm', cooldown: 45, telegraph: 5.0, duration: 0, magnitude: 15 }, // 6 — the hour strikes
    ],
    phases: [
      { threshold: 1, abilities: [0, 3], visualTier: 0 }, // P1: learn the amber tide
      { threshold: 0.72, abilities: [0, 1, 3], visualTier: 1 }, // P2: the ALTERNATION begins
      { threshold: 0.45, abilities: [0, 1, 2, 4], passive: { kind: 'slowShots', magnitude: 0.9 }, entrySurge: { count: 4, addKind: 'darter' }, visualTier: 2 },
      { threshold: 0.18, abilities: [1, 2, 4, 5, 6], passive: { kind: 'haste', magnitude: 1.12 }, entrySurge: { count: 5, addKind: 'lasher' }, regenPerSec: 6, visualTier: 3 },
    ],
    weakPoints: [
      { kind: 'eye', on: 'abilityCast', ability: 'slowShots', x: 0.3, y: 565 },
      { kind: 'eye', on: 'abilityCast', ability: 'haste', x: 0.7, y: 565 },
      { kind: 'nerve_bundle', on: 'phaseEntry', x: 0.15, y: 600 },
      { kind: 'parasite_sac', on: 'abilityCast', ability: 'brood', x: 0.85, y: 625 },
      { kind: 'heart', on: 'hpBelow', at: 0.45, x: 0.5, y: 680 },
      { kind: 'mutation_node', on: 'hpBelow', at: 0.6, x: 0.4, y: 635 },
      { kind: 'energy_core', on: 'timer', every: 27, x: 0.62, y: 645 },
    ],
    reward: { ichor: 32 },
    themeCue: 'megaTide',
  },

  // MOLOCH-AMA — the TITHE mega: an ECONOMY PREDATOR. It barely raises the wave's teeth — it
  // eats your MEANS instead: leeched income, corrupted emplacements, elite tax-collectors. Its
  // spore clusters are the counter-ledger: burst them and the tithe flows BACK. The long game:
  // strangle it before it bankrupts you.
  moloch_ama: {
    id: 'moloch_ama',
    name: 'MOLOCH-AMA',
    title: 'The Tithe',
    lore: 'Older than hunger, it never eats what fights back — it eats what you would have built. Every drop of biomass that vanishes uncounted, every emplacement that goes quiet without a wound: the Tithe was collected.',
    codex: 'Anchored over the harvest. Drinks your economy (deep leech), corrupts your emplacements, and sends elite collectors. Its Spore Clusters hold the stolen tithe — burst them to claim it BACK (and shut the leech off); the Armored Growth guards its gullet. Kill it before the ledger kills you.',
    hp: 7600,
    armor: 16,
    bodyFrac: 0.33,
    palette: { body: '#3a2e1e', glow: '#e8b84a', accent: '#a06a30' },
    motif: 'tithe',
    abilities: [
      { kind: 'leech', cooldown: 14, telegraph: 2.0, duration: 11, magnitude: 0.5 }, // 0 — the tithe
      { kind: 'corrupt', cooldown: 24, telegraph: 2.8, duration: 8, count: 2 }, // 1 — quiet emplacements
      { kind: 'eliteSurge', cooldown: 22, telegraph: 2.6, duration: 0, count: 2, addKind: 'brute' }, // 2 — the collectors
      { kind: 'chitinize', cooldown: 18, telegraph: 2.4, duration: 9, magnitude: 8 }, // 3 — gilded hides
      { kind: 'brood', cooldown: 15, telegraph: 2.2, duration: 0, count: 4, addKind: 'runner' }, // 4
      { kind: 'dampen', cooldown: 21, telegraph: 2.6, duration: 8, magnitude: 0.72 }, // 5 — bought silence
      { kind: 'cataclysm', cooldown: 60, telegraph: 6.5, duration: 0, magnitude: 20 }, // 6 — the debt is called in
    ],
    phases: [
      { threshold: 1, abilities: [0, 4], passive: { kind: 'leech', magnitude: 0.92 }, visualTier: 0 }, // P1: the ledger opens
      { threshold: 0.7, abilities: [0, 1, 2], passive: { kind: 'leech', magnitude: 0.88 }, visualTier: 1 },
      { threshold: 0.42, abilities: [0, 1, 2, 3], passive: { kind: 'leech', magnitude: 0.85 }, entrySurge: { count: 4, addKind: 'brute' }, regenPerSec: 7, visualTier: 2 },
      { threshold: 0.16, abilities: [1, 2, 3, 5, 6], passive: { kind: 'dampen', magnitude: 0.9 }, entrySurge: { count: 5, addKind: 'warden' }, regenPerSec: 10, visualTier: 3 },
    ],
    weakPoints: [
      { kind: 'spore_cluster', on: 'abilityCast', ability: 'leech', x: 0.35, y: 610 }, // the counter-ledger
      { kind: 'spore_cluster', on: 'timer', every: 24, x: 0.65, y: 610 },
      { kind: 'armored_growth', on: 'phaseEntry', x: 0.5, y: 585 },
      { kind: 'nerve_bundle', on: 'hpBelow', at: 0.7, x: 0.82, y: 575 }, // severs the standing tithe
      { kind: 'parasite_sac', on: 'abilityCast', ability: 'eliteSurge', x: 0.18, y: 630 },
      { kind: 'heart', on: 'hpBelow', at: 0.42, x: 0.5, y: 678 },
      { kind: 'regen_organ', on: 'hpBelow', at: 0.3, x: 0.3, y: 645 },
    ],
    reward: { ichor: 36 },
    themeCue: 'megaTithe',
  },

  // SARCOPHAGE — the GLUTTONY mega: it FEEDS ON ITS OWN. It plants broods, then GORGES on them
  // to heal — the first mega whose sustain the player can starve. Kill the food before the maw
  // closes, or burst the Gorge-Eyes to interrupt the meal itself. Everything else it does
  // (haste, elites, chitin) exists to keep its larder alive long enough to swallow.
  sarcophage: {
    id: 'sarcophage',
    name: 'SARCOPHAGE',
    title: 'The Self-Devourer',
    lore: 'It was a famine once, and it survived the way famines do: by eating what it had already eaten. The larder it plants beneath the ridge is not an army. It is a meal that walks itself to the mouth.',
    codex: 'Anchored over its larder. Plants broods, then GORGES — devouring its own spawn to heal massive HP. STARVE IT: slaughter the food before the maw closes, or burst the Gorge-Eyes to interrupt the meal. Its Parasite Sac weakens fresh plantings; the Gullet-Heart at half is your commit window, and the Regeneration Organ in its last phase must die on sight.',
    hp: 7000,
    armor: 12,
    bodyFrac: 0.34,
    palette: { body: '#3a4218', glow: '#c8e64a', accent: '#e0d8a8' },
    motif: 'gorge',
    abilities: [
      { kind: 'brood', cooldown: 12, telegraph: 2.0, duration: 0, count: 5, addKind: 'runner' }, // 0 — plants the meal
      { kind: 'gorge', cooldown: 21, telegraph: 3.2, duration: 0, count: 4, magnitude: 240 }, // 1 — EATS the meal
      { kind: 'haste', cooldown: 18, telegraph: 2.4, duration: 8, magnitude: 1.28 }, // 2 — herd the food home
      { kind: 'chitinize', cooldown: 20, telegraph: 2.5, duration: 9, magnitude: 9 }, // 3 — preserve the larder
      { kind: 'eliteSurge', cooldown: 26, telegraph: 2.8, duration: 0, count: 2, addKind: 'brute' }, // 4 — fattened stock
      { kind: 'brood', cooldown: 16, telegraph: 2.2, duration: 0, count: 3, addKind: 'lasher' }, // 5
      { kind: 'cataclysm', cooldown: 50, telegraph: 5.8, duration: 0, magnitude: 17 }, // 6 — the last course
    ],
    phases: [
      { threshold: 1, abilities: [0, 1], visualTier: 0 }, // P1: learn the plant-then-eat loop
      { threshold: 0.72, abilities: [0, 1, 2], entrySurge: { count: 4, addKind: 'runner' }, visualTier: 1 },
      { threshold: 0.45, abilities: [0, 1, 3, 4], passive: { kind: 'haste', magnitude: 1.1 }, entrySurge: { count: 4, addKind: 'brute' }, visualTier: 2 },
      { threshold: 0.2, abilities: [0, 1, 4, 5, 6], passive: { kind: 'haste', magnitude: 1.16 }, entrySurge: { count: 5, addKind: 'lasher' }, regenPerSec: 5, visualTier: 3 }, // desperation: it eats faster than you kill
    ],
    weakPoints: [
      { kind: 'eye', on: 'abilityCast', ability: 'gorge', x: 0.32, y: 565 }, // interrupt the MEAL
      { kind: 'eye', on: 'timer', every: 25, x: 0.68, y: 565 },
      { kind: 'parasite_sac', on: 'abilityCast', ability: 'brood', x: 0.18, y: 625 },
      { kind: 'armored_growth', on: 'phaseEntry', x: 0.5, y: 595 },
      { kind: 'heart', on: 'hpBelow', at: 0.45, x: 0.5, y: 675 },
      { kind: 'regen_organ', on: 'hpBelow', at: 0.25, x: 0.64, y: 640 },
      { kind: 'mutation_node', on: 'hpBelow', at: 0.6, x: 0.84, y: 620 },
    ],
    reward: { ichor: 38 },
    themeCue: 'megaGorge',
  },

  // MYRIAD — the ADAPTATION mega: it learns YOU. On every adapt cast it studies the tower kind
  // that has hurt it most and grows resistant to exactly that — the anti-meta encounter that
  // punishes one-gun builds. Diversify your damage, sever the Nerve Bundles that carry the
  // lesson, or burst the Study-Eyes mid-telegraph so the answer never finishes forming.
  myriad: {
    id: 'myriad',
    name: 'MYRIAD',
    title: 'The Thousand Answers',
    lore: 'Every weapon that has ever been raised against it is remembered somewhere on its hide — a scar shaped like the wound it refused to take twice. It is not learning to fight you. It has already fought you. It is remembering the answer.',
    codex: 'Anchored in the mirror-dark. STUDIES your defense: each Adapt cast armors it against the tower kind that has damaged it most (that kind hits for less than half). DIVERSIFY your line, interrupt the Study-Eyes mid-lesson, and sever the Nerve Bundles carrying its reflex choir. The Resonant Heart at half is the window where none of its answers apply.',
    hp: 6900,
    armor: 10,
    bodyFrac: 0.35,
    palette: { body: '#332844', glow: '#c9b8ff', accent: '#8fe8d0' },
    motif: 'myriad',
    abilities: [
      { kind: 'adapt', cooldown: 19, telegraph: 2.8, duration: 12, magnitude: 0.45 }, // 0 — it studies your favorite gun
      { kind: 'dampen', cooldown: 20, telegraph: 2.4, duration: 8, magnitude: 0.7 }, // 1
      { kind: 'jam', cooldown: 23, telegraph: 2.6, duration: 9, magnitude: 1.7 }, // 2 — champions, answered
      { kind: 'slowShots', cooldown: 17, telegraph: 2.2, duration: 7, magnitude: 0.62 }, // 3
      { kind: 'brood', cooldown: 14, telegraph: 2.0, duration: 0, count: 4, addKind: 'darter' }, // 4
      { kind: 'eliteSurge', cooldown: 27, telegraph: 2.9, duration: 0, count: 2, addKind: 'lasher' }, // 5
      { kind: 'cataclysm', cooldown: 46, telegraph: 5.2, duration: 0, magnitude: 16 }, // 6 — the final answer
    ],
    phases: [
      { threshold: 1, abilities: [0, 4], visualTier: 0 }, // P1: the first lesson
      { threshold: 0.72, abilities: [0, 1, 4], passive: { kind: 'dampen', magnitude: 0.93 }, visualTier: 1 },
      { threshold: 0.45, abilities: [0, 2, 3, 5], passive: { kind: 'dampen', magnitude: 0.9 }, entrySurge: { count: 4, addKind: 'darter' }, regenPerSec: 4, visualTier: 2 },
      { threshold: 0.18, abilities: [0, 1, 2, 5, 6], passive: { kind: 'suppressRange', magnitude: 0.88 }, entrySurge: { count: 5, addKind: 'lasher' }, regenPerSec: 7, visualTier: 3 },
    ],
    weakPoints: [
      { kind: 'eye', on: 'abilityCast', ability: 'adapt', x: 0.4, y: 565 }, // interrupt the LESSON
      { kind: 'eye', on: 'timer', every: 26, x: 0.75, y: 570 },
      { kind: 'nerve_bundle', on: 'phaseEntry', x: 0.25, y: 585 }, // sever the reflex choir
      { kind: 'energy_core', on: 'abilityCast', ability: 'dampen', x: 0.85, y: 645 },
      { kind: 'heart', on: 'hpBelow', at: 0.5, x: 0.5, y: 678 },
      { kind: 'mutation_node', on: 'hpBelow', at: 0.65, x: 0.15, y: 620 },
      { kind: 'regen_organ', on: 'hpBelow', at: 0.28, x: 0.6, y: 642 },
    ],
    reward: { ichor: 40 },
    themeCue: 'megaMyriad',
  },
};

/** Content-validate a Mega Boss (registered defs fail loudly at dev boot). */
export function megaBossProblems(d: MegaBossDef): string[] {
  const out: string[] = [];
  if (d.hp <= 0) out.push('hp must be > 0');
  if (d.abilities.length === 0) out.push('a mega boss needs at least one ability');
  if (d.phases.length === 0 || d.phases[0].threshold !== 1) out.push('phases must start at threshold 1');
  for (const p of d.phases) for (const ai of p.abilities) if (ai < 0 || ai >= d.abilities.length) out.push(`phase references out-of-range ability ${ai}`);
  for (const a of d.abilities) {
    if (a.cooldown <= 0 || a.telegraph <= 0) out.push(`${a.kind} needs positive cooldown + telegraph (telegraphs ARE the counterplay)`);
    if ((a.kind === 'brood' || a.kind === 'eliteSurge' || a.kind === 'menders') && !(a.count && a.count > 0 && a.addKind)) out.push(`${a.kind} needs count + addKind`);
    if (a.kind === 'corrupt' && !(a.count && a.count > 0)) out.push('corrupt needs a slot count');
    if ((a.kind === 'haste' || a.kind === 'jam') && !(a.magnitude && a.magnitude > 1)) out.push(`${a.kind} magnitude must be > 1`);
    if ((a.kind === 'dampen' || a.kind === 'suppressRange' || a.kind === 'leech' || a.kind === 'slowShots') && !(a.magnitude && a.magnitude > 0 && a.magnitude < 1)) out.push(`${a.kind} magnitude must be in (0,1)`);
    if (a.kind === 'gorge' && !(a.count && a.count > 0 && a.magnitude && a.magnitude > 0)) out.push('gorge needs count (max devoured) + magnitude (heal per enemy)');
    if (a.kind === 'adapt' && !(a.magnitude && a.magnitude > 0 && a.magnitude < 1 && a.duration > 0)) out.push('adapt needs magnitude ∈ (0,1) + a positive duration');
    if (a.kind === 'cataclysm' && !(a.magnitude && a.magnitude > 0 && a.telegraph >= 4)) out.push('cataclysm needs magnitude (integrity damage) + telegraph ≥ 4s (it MUST be interruptible)');
  }
  // The FINALE mandate: every mega carries a cataclysm and its LAST phase can cast it — the
  // desperation beat is part of the encounter contract, not per-def taste.
  const cataIdx = d.abilities.findIndex((a) => a.kind === 'cataclysm');
  if (cataIdx < 0) out.push('every mega boss needs a cataclysm ability (the desperation finale)');
  else if (d.phases.length > 0 && !d.phases[d.phases.length - 1].abilities.includes(cataIdx)) out.push('the final phase must include the cataclysm ability');
  if (d.weakPoints.length < 2) out.push('a mega boss needs ≥ 2 weak point spawns (the signature mechanic)');
  for (const w of d.weakPoints) {
    if (!WEAK_POINT_DEFS[w.kind]) out.push(`unknown weak point kind '${w.kind}'`);
    if (w.on === 'hpBelow' && !(w.at && w.at > 0 && w.at < 1)) out.push('hpBelow trigger needs at ∈ (0,1)');
    if (w.on === 'timer' && !(w.every && w.every > 0)) out.push('timer trigger needs a positive interval');
    if (w.on === 'abilityCast' && !w.ability) out.push('abilityCast trigger needs an ability kind');
    if (w.y < MEGA.minWeakPointY || w.y > MEGA.maxWeakPointY) out.push(`weak point y ${w.y} outside tower reach band (${MEGA.minWeakPointY}..${MEGA.maxWeakPointY})`);
    if (!(w.x >= 0 && w.x <= 1)) out.push('weak point x must be 0..1 of field width');
  }
  if (!(d.reward.ichor > 0)) out.push('reward.ichor must be > 0 (every Mega Boss guarantees Ichor)');
  return out;
}

export const megaBossRegistry = new Registry<MegaBossDef>('megaBoss', {
  idOf: (d) => d.id,
  validate: megaBossProblems,
});
megaBossRegistry.registerAll(Object.values(MEGA_BOSS_DEFS));

export function megaBossDef(id: string): MegaBossDef | undefined {
  return MEGA_BOSS_DEFS[id] ?? megaBossRegistry.get(id);
}

// ── Tunables (centralized per the config convention; imported by sim + renderer) ──
export const MEGA = {
  anchorY: 130, // the body's visual center line (px from top; mass extends above/off-screen)
  // Organ descent band — calibrated to the REAL board: tower slots sit at y 740–900, and the
  // shortest combat reach (maul, 170) only connects above y≈570 from the front row. Organs
  // descend INTO this band so every emplacement can join the raid, and never below it so they
  // don't sink into the build rows.
  minWeakPointY: 560, // organs must descend at least this far so front-row towers reach them
  maxWeakPointY: 700, // …and no farther, staying clear of the build rows (slots start at 740)
  weakPointRadius: 22, // hitbox radius (px)
  weakPointRegrowSec: 16, // a closed (not destroyed) regen point reopens after this
  bodyChipMult: 0.3, // damage dealt to the BODY band (armored chip) vs weak-point damage
  bodyBandY: 580, // towers within range of this line may chip the body between windows (160px above the front row — even the shortest reach connects)
  exposeFallback: 0.5, // 'expose' frac default
  stunFloatText: 'INTERRUPTED', // shared presentation strings (HUD + floats read one source)
  // STAGGER (§functional overhaul): every destroyed weak point adds to a hidden posture meter;
  // filling it TOPPLES the organism — rotation stunned, telegraph dropped, body takes bonus
  // damage, and open organ windows FREEZE (burst them at leisure). The raid-mechanic payoff
  // for focus-fire choreography; the meter decays so it must be earned in a push.
  staggerPerWp: 0.4, // meter added per destroyed weak point (3 in a push topples it)
  staggerDecayPerSec: 0.04, // meter bleed while not staggered
  staggerDurSec: 6, // seconds toppled
  staggerDamageAmp: 0.4, // body takes ×(1+this) while staggered (stacks with a heart exposure)
  staggerFloatText: 'STAGGERED',
  // LONE SIEGE (docs/MEGA-BOSS.md §lone siege): a Mega Boss never lets the fight stall. Once the
  // wave plan is spent and the field is bare (the mega is the LAST thing standing), it TURNS ON
  // THE HIVE: its mass sinks over the build rows (every emplacement connects — siegeBodyY),
  // reinforcements escalate, and it winds up direct HIVE LASHES — telegraphed, interruptible
  // (eye interrupt / stagger), each landed blow TIGHTENING the cadence. The lash is the raid's
  // DPS-race clock: kill it, keep interrupting, or bleed out. Its own spawns never break the
  // siege — only a resumed wave plan does.
  siegeGraceSec: 8, // quiet seconds before the organism turns on the Hive
  organDroughtSec: 22, // no organ open for this long ⇒ the organism REGROWS a spent one (a persisting mega whose destructibles are all spent must never run out of counterplay)
  siegeLashEvery: 13, // opening seconds between lashes (the first arrives on the half-beat)
  siegeLashEveryMin: 8, // the cadence floor as landed blows compound
  siegeLashRamp: 0.88, // per landed lash: next interval × this
  siegeLashTelegraph: 3.2, // windup seconds — the interrupt window
  siegeLashDamage: 5, // Hive integrity per landed lash at tier 1…
  siegeLashPerTier: 2, // …+ per tier above 1 (deep encounters hit harder)
  siegeBodyY: 740, // the sieging mass hangs to the front build row — every tower reaches the body
  siegeBodyGap: 40, // …but never closer than this above a given emplacement (a chip stays a reach)
  siegeChipMult: 0.45, // reaching for the Hive EXPOSES it — body chips bite deeper than bodyChipMult
  siegeReinforceEvery: 45, // seconds of siege per reinforcement surge step…
  siegeReinforceCap: 3, // …capped (the siege pressures through the LASH, not a corpse flood)
  siegeFloatText: 'IT TURNS ON THE HIVE',
  // Encounter cadence — data, not scattered mode checks.
  campaignEvery: 10, // one Mega Boss every N campaign stages … forever (procedural scaling)
  infiniteEvery: 20, // one every N endless waves
  rushEvery: 5, // one every N Boss Rush waves
  dailyMegaOdds: 7, // 1-in-N days the Daily is replaced by the Mega variant
  // Daily Mega variant loop (docs/MEGA-BOSS.md §daily): no wave plan — the boss EVOLVES.
  dailyEvolveSec: 45, // every N seconds the boss gains an evolution stack
  dailyEvolveHaste: 0.05, // each stack: +5% enemy speed pressure
  dailyEvolveRegen: 1.5, // each stack: +regen/s
  dailyReinforceSec: 18, // reinforcement pulse cadence
  dailyReinforceBase: 3, // adds per pulse (+1 per evolution stack)
  // Reward model (docs/MEGA-BOSS.md §rewards).
  rewardEncounterMult: { campaign: 1, infinite: 1.15, bossRush: 0.7, daily: 1.6 } as Record<string, number>,
  expectedKillBase: 150, // seconds a matched-power player is EXPECTED to need at tier 1
  expectedKillPerTier: 22, // + per tier
  efficiencyExp: 0.6, // efficiency = (expected/actual)^exp, clamped below
  efficiencyMin: 0.5,
  efficiencyMax: 2.0,
} as const;

/** A scheduled encounter: the def + a strength tier. Registry-CYCLING so any future def joins the
 *  rotation automatically (stage 10 → def[0], 20 → def[1], … wrapping forever — no hardcoded count),
 *  while the tier keeps scaling, so depth raises QUALITY as the roster raises variety. */
export interface MegaEncounter {
  defId: string;
  tier: number; // ≥ 1 — scales hp/armor/regen/reward
}

function cycled(index: number): string {
  const ids = megaBossRegistry.active().map((d) => d.id);
  return ids[((index % ids.length) + ids.length) % ids.length];
}

/** Campaign: stages 10, 20, 30 … each hosts a Mega Boss encounter (null otherwise). */
export function campaignMegaFor(stage: number): MegaEncounter | null {
  if (stage < MEGA.campaignEvery || stage % MEGA.campaignEvery !== 0) return null;
  const n = stage / MEGA.campaignEvery; // 1st, 2nd, 3rd … mega of the campaign
  return { defId: cycled(n - 1), tier: n };
}

/** Endless: waves 20, 40, 60 … (null otherwise). */
export function infiniteMegaFor(wave: number): MegaEncounter | null {
  if (wave < MEGA.infiniteEvery || wave % MEGA.infiniteEvery !== 0) return null;
  const n = wave / MEGA.infiniteEvery;
  return { defId: cycled(n - 1), tier: 1 + n * 0.75 };
}

/** Boss Rush: waves 5, 10, 15 … the mega joins the siege column (null otherwise). */
export function rushMegaFor(wave: number): MegaEncounter | null {
  if (wave < MEGA.rushEvery || wave % MEGA.rushEvery !== 0) return null;
  const n = wave / MEGA.rushEvery;
  return { defId: cycled(n - 1), tier: 0.8 + n * 0.5 };
}

/** Tier-scaled runtime stats. Sub-linear armor so deep encounters stay crackable. */
export function megaStatsFor(def: MegaBossDef, tier: number): { hp: number; armor: number; regenMult: number } {
  const t = Math.max(1, tier);
  return {
    hp: Math.round(def.hp * (0.6 + 0.4 * t)),
    armor: Math.round(def.armor + Math.sqrt(t - 1) * 6),
    regenMult: 1 + (t - 1) * 0.25,
  };
}

// ── Rewards (docs/MEGA-BOSS.md §rewards) ─────────────────────────────────────
/** The kill time a player of `powerScore` is EXPECTED to post against `recommendedPower` content.
 *  Overpowered accounts are expected to kill FASTER — so raw Power alone cannot max the payout;
 *  only beating your own expectation does. */
export function megaExpectedKillSec(tier: number, powerScore: number, recommendedPower: number): number {
  const base = MEGA.expectedKillBase + MEGA.expectedKillPerTier * Math.max(0, tier - 1);
  const ratio = Math.max(0.25, Math.min(4, recommendedPower / Math.max(1, powerScore)));
  return base * Math.sqrt(ratio);
}

/** Efficiency ∈ [min, max]: 1 at expectation, > 1 for outperforming it. Sub-linear so slightly
 *  fast kills pay a little more and stalling is never optimal (slow ⇒ < 1, floored). */
export function megaKillEfficiency(expectedSec: number, actualSec: number): number {
  if (!(actualSec > 0)) return MEGA.efficiencyMax;
  const raw = Math.pow(expectedSec / actualSec, MEGA.efficiencyExp);
  return Math.max(MEGA.efficiencyMin, Math.min(MEGA.efficiencyMax, raw));
}

/** The guaranteed Ichor payout: base × tier growth × encounter multiplier × efficiency. */
export function megaBossIchor(def: MegaBossDef, tier: number, encounter: keyof typeof MEGA.rewardEncounterMult | string, efficiency: number): number {
  const encMult = MEGA.rewardEncounterMult[encounter] ?? 1;
  return Math.max(1, Math.round(def.reward.ichor * (0.7 + 0.3 * Math.max(1, tier)) * encMult * efficiency));
}

// ── Sim runtime state (owned + driven by game.ts megaBossSystem; declared here so the
//    renderer/HUD/tests share one shape). Plain data — serializes into RenderState untouched. ──

export interface MegaWeakPoint {
  spec: number; // index into MegaBossDef.weakPoints (one live instance per spec)
  kind: WeakPointKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  armor: number;
  state: 'open' | 'closed' | 'destroyed';
  window: number; // seconds left open (0 = until destroyed)
  regrow: number; // closed + regen: seconds until it reopens
  emergeT: number; // 0..1 opening animation progress (render)
  hitFlash: number; // seconds of hit-flash left (render)
}

/** One applied ability effect with a lifetime (aura verbs). Instant verbs never enter this list. */
export interface MegaActiveEffect {
  kind: MegaAbilityKind;
  until: number; // sim-time expiry
  magnitude: number;
}

export interface MegaRuntime {
  defId: string;
  tier: number;
  encounter: 'campaign' | 'infinite' | 'bossRush' | 'daily';
  hp: number;
  maxHp: number;
  armor: number; // live (armorBreak zeroes it for a window)
  baseArmor: number;
  phase: number;
  abilityCd: number[]; // per MegaBossDef.abilities
  telegraph: { ability: number; t: number; total: number } | null;
  active: MegaActiveEffect[];
  stunned: number; // rotation frozen (eye interrupt)
  exposedUntil: number;
  exposedFrac: number;
  summonsOffUntil: number;
  passiveOffUntil: number;
  regenOffUntil: number;
  leechOffUntil: number;
  weaveOffUntil: number;
  armorOffUntil: number;
  towerBuffUntil: number;
  towerBuffFrac: number;
  weakenNextPhase: boolean;
  weakPoints: MegaWeakPoint[];
  hpTriggered: boolean[]; // per weakPoints spec: hpBelow specs already fired
  timerT: number[]; // per weakPoints spec: countdown for 'timer' specs
  spawnedAt: number;
  integrityAtSpawn: number;
  // STAGGER posture (§functional overhaul): meter 0..1, the toppled window, and the count.
  stagger: number;
  staggeredUntil: number;
  staggers: number;
  // ADAPT bookkeeping: per-tower-kind damage this encounter (the verb learns the argmax) and
  // the live adaptation window. Empty/neutral unless the verb exists on the def.
  dmgByKind: Record<string, number>;
  adaptKind: string | null;
  adaptUntil: number;
  adaptMult: number;
  // LONE SIEGE (docs/MEGA-BOSS.md §lone siege): time spent as the last thing standing, the
  // countdown to the next Hive Lash, the live windup (0 = none), and landed-lash count (the
  // escalation exponent). All reset the moment a wave plan resumes.
  siegeT: number;
  lashT: number;
  lashWindup: number;
  lashes: number;
  /** Sim-time an organ last OPENED — the drought valve's clock (docs/MEGA-BOSS.md §feel). */
  lastOrganOpenAt: number;
  /** Round-robin cursor so drought regrowth cycles the def's specs deterministically. */
  droughtRotor: number;
  // Encounter statistics (RunStats + collection + achievements).
  wpDestroyed: number;
  wpKinds: WeakPointKind[];
  interrupts: number;
  abilitiesCast: number;
  deathT: number; // > 0: the death sequence is playing (renderer); removed when it expires
  // Daily Mega variant (docs/MEGA-BOSS.md §daily).
  evolveStacks: number;
  evolveT: number;
  reinforceT: number;
}

/** Boot a runtime from a def + encounter (pure — the sim stamps times/integrity after). */
export function createMegaRuntime(def: MegaBossDef, enc: MegaEncounter, encounter: MegaRuntime['encounter']): MegaRuntime {
  const stats = megaStatsFor(def, enc.tier);
  return {
    defId: def.id,
    tier: enc.tier,
    encounter,
    hp: stats.hp,
    maxHp: stats.hp,
    armor: stats.armor,
    baseArmor: stats.armor,
    phase: 0,
    abilityCd: def.abilities.map((a) => a.cooldown * 0.5), // first casts arrive at half-cooldown (an opening beat, not an instant wall)
    telegraph: null,
    active: [],
    stunned: 0,
    exposedUntil: 0,
    exposedFrac: 0,
    summonsOffUntil: 0,
    passiveOffUntil: 0,
    regenOffUntil: 0,
    leechOffUntil: 0,
    weaveOffUntil: 0,
    armorOffUntil: 0,
    towerBuffUntil: 0,
    towerBuffFrac: 0,
    weakenNextPhase: false,
    weakPoints: [],
    hpTriggered: def.weakPoints.map(() => false),
    timerT: def.weakPoints.map((w) => (w.on === 'timer' ? (w.every ?? 0) : 0)),
    spawnedAt: 0,
    integrityAtSpawn: 0,
    stagger: 0,
    staggeredUntil: 0,
    staggers: 0,
    dmgByKind: {},
    adaptKind: null,
    adaptUntil: 0,
    adaptMult: 1,
    siegeT: 0,
    lashT: 0,
    lashWindup: 0,
    lashes: 0,
    lastOrganOpenAt: 0,
    droughtRotor: 0,
    wpDestroyed: 0,
    wpKinds: [],
    interrupts: 0,
    abilitiesCast: 0,
    deathT: 0,
    evolveStacks: 0,
    evolveT: 0,
    reinforceT: 0,
  };
}

/** The battlefield-manipulation fold the sim reads at its chokepoints. NEUTRAL when no Mega Boss
 *  is active (every field ×1 / +0 ⇒ IEEE-exact identity ⇒ the golden run is byte-identical). */
export interface MegaFieldFx {
  enemyHaste: number; // × enemy movement speed
  enemyArmorAdd: number; // + flat armor on damage application
  towerRate: number; // × tower fire rate (dampen … towerBuff)
  towerRange: number; // × tower range
  projSpeed: number; // × projectile velocity
  biomass: number; // × biomass income
  heroCd: number; // × hero ability cooldowns
}

export const NEUTRAL_MEGA_FX: Readonly<MegaFieldFx> = {
  enemyHaste: 1, enemyArmorAdd: 0, towerRate: 1, towerRange: 1, projSpeed: 1, biomass: 1, heroCd: 1,
};

/** Fold the runtime's active effects + passive + daily evolution into the field fx. Pure. */
export function foldMegaFx(def: MegaBossDef, rt: MegaRuntime, now: number, out: MegaFieldFx): void {
  out.enemyHaste = 1; out.enemyArmorAdd = 0; out.towerRate = 1; out.towerRange = 1;
  out.projSpeed = 1; out.biomass = 1; out.heroCd = 1;
  const apply = (kind: MegaAbilityKind, magnitude: number): void => {
    switch (kind) {
      case 'haste': out.enemyHaste *= magnitude; break;
      case 'chitinize': out.enemyArmorAdd += magnitude; break;
      case 'dampen': out.towerRate *= magnitude; break;
      case 'suppressRange': out.towerRange *= magnitude; break;
      case 'slowShots': out.projSpeed *= magnitude; break;
      case 'leech': if (now >= rt.leechOffUntil) out.biomass *= magnitude; break;
      case 'jam': out.heroCd *= magnitude; break;
      default: break; // instant verbs never fold
    }
  };
  for (const a of rt.active) if (now < a.until) apply(a.kind, a.magnitude);
  const passive = def.phases[rt.phase]?.passive;
  if (passive && now >= rt.passiveOffUntil) apply(passive.kind, passive.magnitude);
  if (rt.evolveStacks > 0) out.enemyHaste *= 1 + MEGA.dailyEvolveHaste * rt.evolveStacks; // daily evolution pressure
  if (now < rt.towerBuffUntil) out.towerRate *= 1 + rt.towerBuffFrac; // energy-core overload window
}
