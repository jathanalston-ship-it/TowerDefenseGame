// Central balance config — ALL tunables live here (CLAUDE.md: centralize tunables;
// ARCHITECTURE.md §6.2). Systems read these; they never inline magic numbers.
// Every value is an illustrative starting point for the vertical slice.

import type { CombatClass, EnemyKind, HeroKind, MetaModifiers, TowerFiring, TowerKind } from './types';
import type { CardUnlock, RunModNumberKey } from './cards'; // type-only (erased) — no runtime cycle
import { Registry } from './registry';
import type { AbilityComponent, AuraAbility, ParticleKind } from './ability';
import type { TargetingProfile } from './targeting';

export const SIM_DT = 1 / 60; // fixed simulation timestep (seconds)

// ── Sim tuning (movement / combat / fx) — gameplay constants, not magic numbers ──
export const MOVE = {
  separationRadius: 36, // px (was CELL*0.9); enemy spacing radius
  jitterIdScale: 0.137, // per-enemy phase offset for organic wander noise
  jitterPhase: 1.31, // y-axis noise phase multiplier
};
export const COMBAT = {
  projectileHitEpsilon: 4, // px slop for a projectile counting as "arrived"
  heroContactMargin: 28, // added to hero contactRange for the proximity query (~max enemy radius)
};
export const FX = {
  particleDrag: 0.92, // per-tick velocity damping on cosmetic particles
  floatRiseSpeed: 18, // px/sec floating-text drift
  hitFlash: 0.09, // seconds of white flash when an enemy takes a discrete hit
  dmgFloatInterval: 0.4, // min seconds between aggregated damage-number pops per enemy
  // Screen-shake ceiling (docs/CAMERA.md): camera "trauma" is presentation-only (never read by the
  // sim) and accumulates from combat cues. shakeCap is the HARD ceiling on concurrent trauma (0..1);
  // new impulses also SATURATE toward it (add `impulse·cap/(cap+current)`), so late-game event
  // density — 20 simultaneous boss deaths at wave 40 — stays readable while one death still thumps.
  shakeCap: 0.72,
};

/** Combat→Build "settle": after the FINAL enemy of a wave dies, the battlefield winds DOWN for
 * a beat — in-flight projectiles coast out and fade, acid pools + particles dissipate, the
 * red-alert eases off — before the gene-card draft / build phase, so combat lands cleanly
 * instead of snapping or freezing mid-air. Purely presentational: during the settle no
 * spawns / economy / tower fire run and NO gameplay RNG is touched, so run outcomes (and the
 * golden seeds) are unchanged — only the moment the phase flips is delayed by `duration`. */
export const SETTLE = {
  duration: 0.7, // seconds the battlefield winds down after the last kill before the draft/build
  projectileFade: 0.3, // seconds a target-less projectile coasts + fades out before it's released
};

/** IDLE POSTURE pacing (docs/TOWER-IDLE.md) — the three-state contract's global tempo. Per-tower
 *  behavior magnitudes live in core/towerIdle.ts; these are the shared easing/readiness rules.
 *  (TOWER_IDLE — the account Idle HARVEST system owns the plain IDLE name.) */
export const TOWER_IDLE = {
  riseTime: 1.2, // seconds for `prep` to ease 0→1 once nothing is engageable (the transition IN)
  fallTime: 0.35, // seconds for `prep` to snap 1→0 when combat resumes (the transition OUT)
  readyAt: 0.25, // minimum banked windup charge before an opener consumes (micro-idles don't fire)
  choirDecay: 2.5, // per-second decay rate of a received choir bonus once the song stops
  preheatRisePerSec: 0.12, // beam-heat climb toward the preheat floor while unengaged (~3s to 0.35)
  reactorSenseRadius: 340, // the Flesh Reactor's "calm neighborhood" — no enemy inside ⇒ Systolic Reserve
};

// ── Towers ────────────────────────────────────────────────────────────────
export interface TowerDef {
  kind: TowerKind;
  name: string;
  combatClass: CombatClass;
  firing: TowerFiring; // how it attacks — drives the sim dispatch (data, not code)
  cost: number;
  range: number;
  /** Minimum engagement radius (px). An enemy CLOSER than this cannot be targeted by the tower —
   *  an artillery-style DEADZONE that gives short-range towers a role. Optional; absent = 0 (no
   *  deadzone), which is identity for every non-artillery tower. Enforced in the targeting query
   *  (docs/TOWERS.md §deadzone), never in projectile flight. */
  minRange?: number;
  fireInterval: number; // seconds between actions
  damage: number;
  projectileSpeed: number; // px/sec (0 = no projectile)
  splash: number; // splash radius (0 = single target)
  color: string;
  blurb: string;
  /** Optional explicit ability kit. When omitted, it's derived from `firing` + stats
   * (see TOWER_ABILITIES) — so a NEW tower can instead compose reusable AbilityComponents
   * directly (projectile + chain + poison, …) with no sim code. */
  abilities?: AbilityComponent[];
  /** Targeting profile (data-driven). Omitted ⇒ 'closestToBase' (historical default). */
  targeting?: TargetingProfile;
  /** Tower Shards to unlock this tower in the Tower Lab (absent/0 ⇒ a STARTER, owned from the
   *  start). A locked tower accumulates its shards toward this threshold; claiming spends them,
   *  after which it joins the Biomorph Conveyor / favorite pool. Meta-owned gate — the sim only
   *  sees the resulting roster via RunOptions.unlocked (docs/TOWERS.md §expansion). */
  unlockShards?: number;
  /** Progression GATE — the highest Campaign stage that must be cleared before this locked tower's
   *  unlock shards even begin DROPPING (meta.towerShardPool gates the loot rollers). Absent / 0 ⇒ no
   *  gate (shards drop from the start, like maw/chrysalis/effigy). Pairs with unlockShards so a gated
   *  tower (Resonance Coil, Marrow Siphon) is DOUBLY gated: reach the stage, THEN grind its shards. */
  unlockStage?: number;
  /** ARENA EXCLUSIVE (docs/ARENA.md §6): acquisition is ONLY the Arena Pass level-100 crown —
   *  never a starter, never in the shard pool, never claimable in the Tower Lab. Meta's
   *  towerShardGateMet / unlockTower and saveStore's starterTowers all honor this flag. */
  arenaExclusive?: boolean;
}

export const TOWER_DEFS: Record<TowerKind, TowerDef> = {
  // Range is identity (docs/RANGE.md): each class owns a distinct vertical engagement
  // band on the ~920px-tall lane, traded against DPS / cadence / cost. Long reach pays
  // it back with low sustained DPS and/or slow cadence — never a free stat.
  needle: {
    kind: 'needle',
    name: 'Needle Spitter',
    combatClass: 'Kinetic',
    firing: 'homing',
    cost: 100,
    range: 700, // MARKSMAN — very long; opens fire shortly after enemies spawn
    fireInterval: 0.4, // fast cadence = fast Fracture stacking over the long approach
    damage: 3, // low per-shot: it CHIPS + tags the whole lane, it does not burst
    projectileSpeed: 640, // snappy enough to connect across its long reach
    splash: 0,
    color: '#5ad1ff',
    blurb: 'Very long range — peppers from afar, stacking Fracture (armor shred).',
  },
  mortar: {
    kind: 'mortar',
    name: 'Bone Mortar',
    combatClass: 'Caustic',
    firing: 'splash',
    cost: 170, // premium: full-map area denial
    range: 960, // ARTILLERY — essentially full-map; suppresses from the spawn line
    minRange: 100, // DEADZONE — shells can't be lobbed point-blank; enemies within 100px are safe
    // from the mortar (short-range towers own the last line). See docs/TOWERS.md §deadzone.
    fireInterval: 2.1, // very slow cadence is the balance for unlimited reach
    damage: 8, // softens clusters from afar — it suppresses, the kill happens down-lane
    projectileSpeed: 420, // arcs across the lane in a few seconds
    splash: 60,
    color: '#b6e84a',
    blurb: 'Full-map artillery. Slow, arcing AoE; leaves Corrosion pools (DoT + slow).',
  },
  reactor: {
    kind: 'reactor',
    name: 'Flesh Reactor',
    combatClass: 'Vital',
    firing: 'support',
    cost: 120,
    range: 90, // SUPPORT — very short; this IS the overcharge SUPPORT RADIUS (towers whose
    // centre lies within it are overcharged). 90px catches orthogonal lattice neighbours
    // (80px) and excludes diagonals (≈113px); the "+support radius" mastery widens it.
    fireInterval: 0,
    damage: 0,
    projectileSpeed: 0,
    splash: 0,
    color: '#ff7a59',
    blurb: 'Generates biomass; overcharges NEARBY towers (+dmg, +rate).',
  },
  parasite: {
    kind: 'parasite',
    name: 'Parasite Nest',
    combatClass: 'Viral',
    firing: 'infest', // homing parasite that seeds ramping, armor-ignoring Infection
    cost: 130,
    range: 280, // SKIRMISHER — medium; only reaches the mid-field when placed FORWARD
    fireInterval: 0.85,
    damage: 6, // low on impact — the ramping Infection DoT + spread is the payoff
    projectileSpeed: 360,
    splash: 0,
    color: '#e24dff',
    blurb: 'Medium range — place forward. Seeds Infection: ramping armor-ignoring DoT.',
  },
  obelisk: {
    kind: 'obelisk',
    name: 'Neural Obelisk',
    combatClass: 'Neural',
    firing: 'field', // periodic psionic pulse — no projectile; debuffs in range
    cost: 165, // premium control anchor
    range: 360, // CONTROL — very large support radius; the widest footprint in the game
    fireInterval: 1.1, // pulse cadence
    damage: 5, // token chip; its value is the Disruption (slow + vulnerability)
    projectileSpeed: 0,
    splash: 0,
    color: '#6e7bff',
    blurb: 'Wide control field — slows + makes enemies take more from ALL sources.',
  },
  // ── Expansion roster (docs/TOWERS.md §expansion): three niches the launch five don't own.
  //    Each composes the shared ability blocks directly (`abilities`) — no new firing modes. ──
  maw: {
    kind: 'maw',
    name: 'Carrion Maw',
    combatClass: 'Kinetic',
    firing: 'field', // gnash cadence — the bite is an all-in-reach cleave, no projectile
    unlockShards: 80, // locked for new profiles — the first expansion goal (straightforward brawler)
    cost: 140,
    range: 170, // BRAWLER — the shortest combat reach in the game; its range IS its jaws
    fireInterval: 1.25,
    damage: 26, // heavy per-bite — but ONLY what stands inside the jaws gets bitten
    projectileSpeed: 0,
    splash: 0,
    color: '#ff4d6b',
    blurb: 'Short-reach jaws — CLEAVES everything inside them. The last line eats well.',
    abilities: [{ type: 'aura', radius: 170, damage: 26, react: true, particle: 'shred' }],
  },
  chrysalis: {
    kind: 'chrysalis',
    name: 'Amber Chrysalis',
    combatClass: 'Caustic',
    firing: 'homing', // a resin bolt seeks the target it will encase
    unlockShards: 120, // locked — the specialist warden (mid goal)
    cost: 155,
    range: 430, // WARDEN — mid engagement; it guards the approach, not the spawn line
    fireInterval: 3.4, // very slow, deliberate casts — each one is a lockdown decision
    damage: 18,
    projectileSpeed: 520,
    splash: 0,
    color: '#ffc36e',
    blurb: 'Encases the BIGGEST threat in amber — frozen solid, briefly out of the fight.',
    targeting: 'highestHealth', // the elite-hunter identity: it always picks the monster
    abilities: [
      { type: 'projectile', behavior: 'homing', damage: 18, speed: 520, range: 430 },
      { type: 'status', status: { kind: 'Freeze', amount: 1.4 } },
    ],
  },
  effigy: {
    kind: 'effigy',
    name: 'Wailing Effigy',
    combatClass: 'Neural',
    firing: 'field', // periodic dread pulse — no projectile, no damage
    unlockShards: 150, // locked — the deepest goal (zero-damage tempo asks for game knowledge)
    cost: 150,
    range: 300, // DREAD — a crust-guard footprint; place it where the siege lands
    fireInterval: 2.6,
    damage: 0, // pure tempo: it converts nothing into damage, everything into TIME
    projectileSpeed: 0,
    splash: 0,
    color: '#b892ff',
    blurb: 'A shrieking totem — panics attackers into FLEEING the Hive. Buys time, not kills.',
    abilities: [{ type: 'debuff', radius: 300, status: { kind: 'Fear', amount: 1.6 } }],
  },
  // Resonance Coil (Resonant) — the roster's first sustained-focus MELTER. A locked, ramping BEAM
  // (firing 'beam', game.ts beamTowerSystem): while it holds ONE target its resonance HEAT climbs,
  // scaling damage up to BEAM.rampBonus× — it starts weak and melts elites/bosses that stand in it.
  // LOCKED by default (unlockShards) AND progression-gated (unlockStage): its shards only drop once
  // the campaign gate is cleared. A brand-new mechanic, so its identity is the ramp, not a stat line.
  coil: {
    kind: 'coil',
    name: 'Resonance Coil',
    combatClass: 'Resonant',
    firing: 'beam',
    unlockShards: 320, // locked: a mid-game chase, funded only AFTER the unlockStage gate is cleared
    unlockStage: 15, // Tower Shards for the Coil begin dropping once Campaign Stage 15 is cleared
    cost: 150,
    range: 340, // SKIRMISHER — a focused emitter; place FORWARD so a target stays in the beam to ramp
    fireInterval: 0.5, // beam PULSE cadence — paces star/branch procs (crit/status); the DAMAGE is continuous
    damage: 26, // base beam DPS at zero resonance; ramps to BEAM.rampBonus× on a sustained lock
    projectileSpeed: 0, // hitscan channel — no projectile
    splash: 0,
    color: '#f5b83d',
    targeting: 'highestHealth', // by default it bites the toughest thing in reach (the melt payoff)
    blurb: 'Locks a beam onto ONE target; damage RAMPS the longer it holds — melts elites & bosses.',
  },
  // ── Deep-Strain roster (docs/SIPHON.md): the second `firing: 'beam'` tower, but the OPPOSITE role
  //    to the Coil. Where the Coil is a single-target FOCUS melter (hold the toughest, hard-reset
  //    heat), the Siphon is a multi-tether HARVESTER — a Vital drain WEB that finishes the WOUNDED,
  //    gorges on VOLUME (throughput + kills, not focus), and siphons the swarm into Biomass. Its
  //    bespoke drain path is game.beamSystem. DOUBLE-gated (unlockStage + unlockShards). ──
  siphon: {
    kind: 'siphon',
    name: 'Marrow Siphon',
    combatClass: 'Vital',
    firing: 'beam', // a continuous drain ray — no projectile, no discrete shots (docs/SIPHON.md)
    unlockShards: 200, // the deepest synthesis goal — a premium, late-unlock organ
    unlockStage: 15, // its shards do not drop until Campaign Stage 15 is cleared (the gate)
    cost: 175, // premium: an economy engine that pays for itself in siphoned biomass
    range: 300, // HARVESTER — a close, hungry web; place it AT the kill-zone where the swarm dies
    fireInterval: 0.4, // a quick drain PULSE: biomass payout + granted-ability ticks (not a shot)
    damage: 22, // per-TETHER base drain (dt-scaled, continuous) BEFORE Gorge — modest per-target, wide
    projectileSpeed: 0, // no projectile — the ray is instantaneous
    splash: 0,
    color: '#ff5c8a',
    blurb: 'Splits a draining WEB across the wounded — GORGES fatter the more the lane dies, siphoning the swarm into Biomass.',
    targeting: 'lowestHealth', // the harvester identity: it FINISHES the weakest (opposite the Coil's toughest-target melt)
    abilities: [], // the beam is bespoke (game.beamSystem); star/branch grants pulse on its cadence
  },
  sower: {
    kind: 'sower',
    name: 'Blight Sower',
    combatClass: 'Caustic',
    firing: 'trap', // plants ARMED SPORE MINES up-lane instead of attacking (docs/SOWER.md)
    unlockShards: 360, // a deep synthesis goal — the third locked expansion organ
    unlockStage: 20, // its shards do not drop until Campaign Stage 20 is cleared (the gate)
    cost: 130,
    range: 300, // PLANTING reach — how far up-lane it can seed the approach
    fireInterval: 2.8, // seeding cadence: one mine grown per interval (while below its cap)
    damage: 46, // per-mine detonation damage (baked at PLANT time with that moment's mods)
    projectileSpeed: 0, // no projectile — the mines ARE the attack
    splash: 88, // detonation radius (× splash/sower mods at plant time)
    color: '#a4e04a',
    blurb: 'Seeds the approach with ARMED spore mines — pre-placed detonations that corrode everything they catch.',
    abilities: [], // the trap loop is bespoke (game.trapTowerSystem/mineSystem); star/branch grants fire AT detonations
  },
  spire: {
    kind: 'spire',
    name: 'Synapse Spire',
    combatClass: 'Neural',
    firing: 'field', // no projectile — its kit IS the attack (the first tower composed via def.abilities)
    unlockShards: 400,
    unlockStage: 25, // shards drop only past Campaign Stage 25
    cost: 150,
    range: 210, // the first arc's acquisition reach (hops leap the same span victim-to-victim)
    fireInterval: 1.15,
    damage: 30, // first-hop damage (falls off 25% per hop)
    projectileSpeed: 0,
    splash: 0,
    color: '#7c9aff',
    blurb: 'Casts a synaptic ARC that leaps victim to victim — the tighter the pack, the longer the lightning.',
    // The designed composition escape-hatch, used by a tower for the first time: the whole attack
    // is one reusable chain component (stars/branches/cards add hops via the extraProjectiles channel).
    abilities: [{ type: 'chain', jumps: 4, range: 210, damage: 30, falloff: 0.75, particle: 'spark' }],
  },
  polyp: {
    kind: 'polyp',
    name: 'Undertow Polyp',
    combatClass: 'Kinetic',
    firing: 'field',
    unlockShards: 440,
    unlockStage: 30, // the deepest tower gate yet
    cost: 140,
    range: 165, // its pulse field (identity-range: polypFieldMult/stars widen it)
    fireInterval: 1.6,
    damage: 5, // chip — the PULL is the product
    projectileSpeed: 0,
    splash: 0,
    color: '#3ec8b8',
    blurb: 'A rooted undertow that DRAGS the wave back up-lane with every pulse — progress itself becomes the resource you deny.',
    abilities: [{ type: 'aura', radius: 165, damage: 5, pull: 46, particle: 'disrupt' }],
  },
  // ── EASY EXPANSION (docs/TOWERS.md §expansion) — the gentlest gate: a straightforward single-target
  //    DPS bruiser, the reliable "just deal damage" tower a new player wants. Reuses homing firing;
  //    all upgrades ride existing channels (no new sim code / no new power field). ──
  spitfang: {
    kind: 'spitfang',
    name: 'Spitfang Turret',
    combatClass: 'Kinetic',
    firing: 'homing',
    unlockShards: 45, // the CHEAPEST unlock — a first, friendly expansion goal
    unlockStage: 3, // the EASIEST gate — its shards begin dropping right after Campaign Stage 3
    cost: 90,
    range: 380, // MID band — it holds the middle of the lane where needle can't and mortar over-reaches
    fireInterval: 0.6, // brisk, reliable cadence
    damage: 12, // solid single-target punch (vs needle's chip) — the accessible DPS pick
    projectileSpeed: 660,
    splash: 0,
    color: '#ff4f4f',
    blurb: 'A reliable mid-range autocannon — brisk, punchy single-target fire. The dependable damage pick.',
  },
  // ── HARD EXPANSION — the DEEPEST gate in the game: a premium Neural gravity well. Anchors the wave
  //    at a point and CRUSHES it with a pulling void field (aura + pull + heavy chip). Reuses the aura
  //    verb; branches lean into collapse vs annihilation. ──
  rift: {
    kind: 'rift',
    name: 'Rift Anchor',
    combatClass: 'Neural',
    firing: 'field',
    unlockShards: 640, // the MOST EXPENSIVE unlock — a deep, deliberate grind
    unlockStage: 40, // the DEEPEST gate yet (past polyp's 30) — its shards drop only past Campaign Stage 40
    cost: 175,
    range: 190, // its gravity-field radius (rangeMult/stars widen it)
    fireInterval: 1.4, // a slow, heavy collapse pulse
    damage: 20, // heavy crush on everything held — the pull denies progress while the well grinds
    projectileSpeed: 0,
    splash: 0,
    color: '#a24dff',
    blurb: 'A premium void anchor — a psionic singularity that DRAGS the wave to its heart and crushes it. The deepest unlock.',
    abilities: [{ type: 'aura', radius: 190, damage: 20, pull: 56, particle: 'disrupt' }],
  },
  // ── DRACONIC roster (docs/TOWERS.md §draconic) — the hive assimilates the sky. Two organs with
  //    NEW firing archetypes: the 'arc' returning blade and the 'summon' hero-AI brood. ──
  glaive: {
    kind: 'glaive',
    name: 'Wyrmwing Glaive',
    combatClass: 'Kinetic',
    firing: 'arc', // a RETURNING wing-blade: out to range piercing everything, then back (docs/TOWERS.md §glaive)
    unlockShards: 420, // a deep synthesis goal — sits between spire and rift
    unlockStage: 22, // its shards drop only past Campaign Stage 22
    cost: 185,
    range: 470, // the OUT-LEG length — the blade carves this far up-lane, then returns the same path
    fireInterval: 1.8, // slow, heavy throw cadence — the double-hit lane sweep is the payoff
    damage: 16, // per LEG per enemy — a full pass through a body is 2 hits (out + return)
    projectileSpeed: 400,
    splash: 0,
    color: '#ff9e4a',
    blurb: 'Hurls a returning wing-blade that carves THROUGH the lane twice — out and back, one cut per pass.',
  },
  roost: {
    kind: 'roost',
    name: 'Drake Roost',
    combatClass: 'Vital',
    firing: 'summon', // fields no attack — it INCUBATES drakelings that fight with a hero-style brain
    unlockShards: 520, // a premium late unlock — the brood engine
    unlockStage: 26, // its shards drop only past Campaign Stage 26
    cost: 200,
    range: 380, // the brood's rally LEASH — drakes engage threats within this reach of the perch
    fireInterval: 5.5, // incubation cadence: one drake hatched per interval while below the brood cap
    damage: 0, // the units carry the damage (ROOST.tiers) — the roost itself never attacks
    projectileSpeed: 0,
    splash: 0,
    color: '#e8a13d',
    blurb: 'Incubates a brood of biomech drakes — hunting units that leash to the roost, retreat to mend, and dive back in.',
    abilities: [], // the brood loop is bespoke (game.roostSystem); star/branch grants shape the brood via ROOST
  },
  // ── REACTION roster (docs/TOWERS.md §reactionTrio) — three organs whose identities live in the
  //    STATUS/reaction matrix, not a stat line. All three compose the existing ability vocabulary
  //    (aura / projectile / status) — ZERO new sim verbs — and all are locked ⇒ golden-safe. ──
  lung: {
    kind: 'lung',
    name: 'Miasma Lung',
    combatClass: 'Viral',
    firing: 'field', // a breathing sac — its exhale is the attack; explicit kit below (no derived Disruption)
    unlockShards: 240, // the SECOND Viral organ — a mid synthesis goal between siphon and coil
    unlockStage: 18, // its shards drop only past Campaign Stage 18
    cost: 145,
    range: 250, // the fog bank — everything breathing inside it catches the plague
    fireInterval: 1.5, // breath cadence — each exhale is one coat of Infection on the whole pack
    damage: 3, // token chip — the PLAGUE is the product (ramping, armor-ignoring, spreading)
    projectileSpeed: 0,
    splash: 0,
    color: '#ff6ee0',
    blurb: 'Exhales a plague fog — every breath coats EVERYTHING in reach with Infection. The Nest drills one host; the Lung poisons the crowd.',
    // The zone-infector identity: where the Parasite Nest seeds ONE host deep, the Lung shallow-coats
    // the WHOLE pack — native Infection ramp/spread does the deep work, and every fogged body is
    // reaction fuel (Virulence / Putrefy / Bloom / Rupture partners).
    abilities: [{ type: 'aura', radius: 250, damage: 3, status: { kind: 'Infection', amount: 1 }, particle: 'infect' }],
  },
  bell: {
    kind: 'bell',
    name: 'Chitin Bell',
    combatClass: 'Resonant',
    firing: 'field', // the toll is an all-in-reach slam — explicit kit below (no derived Disruption)
    unlockShards: 380, // the SECOND Resonant organ — a deep goal beside the spire
    unlockStage: 24, // its shards drop only past Campaign Stage 24
    cost: 160,
    range: 230, // the toll's reach — a heavy, medium footprint slammer
    fireInterval: 2.4, // slow, deliberate tolls — each one is a crowd slam + a resonance coat
    damage: 30, // heavy per-toll AoE — the hardest field slam in the game, paid for by the cadence
    projectileSpeed: 0,
    splash: 0,
    color: '#e8d5a3',
    blurb: 'A great chitin bell — each TOLL slams everything in reach and leaves Resonance ringing in the bodies. Prime the crowd, then pair the shatter.',
    // The mass reaction-PRIMER identity: the Coil focus-melts ONE target; the Bell coats the CROWD
    // in Resonance so any co-present status combusts (Shear with Fracture stackers, Melt with
    // Corrosion, Rupture with Infection). react:true lets the slam itself detonate what's primed.
    abilities: [{ type: 'aura', radius: 230, damage: 30, status: { kind: 'Resonance', amount: 1 }, react: true, particle: 'disrupt' }],
  },
  lancet: {
    kind: 'lancet',
    name: 'Acid Lancet',
    combatClass: 'Caustic',
    firing: 'homing', // a pressurized bile harpoon — one colossal, guided cull per draw
    unlockShards: 560, // a deep premium — the executioner sits between roost and rift
    unlockStage: 34, // its shards drop only past Campaign Stage 34 (fills the 30→40 gate gap)
    cost: 185,
    range: 620, // EXECUTIONER — near-marksman reach; it culls the fattest body on the approach
    minRange: 120, // DEADZONE — the harpoon can't be drawn point-blank; the last line belongs to brawlers
    fireInterval: 4.5, // the slowest discrete gun in the game — every draw is a beheading decision
    damage: 130, // the heaviest single hit in the roster; mediocre DPS on purpose — WHERE it lands is the value
    projectileSpeed: 820, // a harpoon, not a lob — it arrives
    splash: 0,
    color: '#eaf24d',
    blurb: 'A pressurized bile harpoon that CULLS the biggest body on the lane — one colossal strike, then a long, patient draw. The wound it leaves melts open.',
    targeting: 'highestHealth', // the executioner identity: it always takes the monster
    abilities: [
      { type: 'projectile', behavior: 'homing', damage: 130, speed: 820, range: 620 },
      { type: 'status', status: { kind: 'Corrosion', amount: 2 } }, // the melting wound — Shred/Putrefy/Melt fuel on the culled
    ],
  },
  // ── THE ARENA EXCLUSIVES (docs/ARENA.md §6) — the Pass's alternating level-100 crowns.
  //    NO other acquisition path exists: no shards, no stage gate, no market, no containers —
  //    `arenaExclusive: true` removes them from the starter set, the shard pool and the Tower
  //    Lab claim flow; meta.grantArenaExclusive is the ONLY unlock. Both are composed purely
  //    from existing verbs (TowerDef.abilities — the reaction-trio precedent): zero sim code.
  basilisk: {
    kind: 'basilisk',
    name: 'Basilisk Maw',
    combatClass: 'Neural',
    firing: 'homing', // a calcifying gaze-bolt — the petrifier (Season A's crown)
    arenaExclusive: true,
    cost: 190,
    range: 560, // a rear-line CONTROL sniper — it stops the charge you can already see
    fireInterval: 2.6, // deliberate — every stare picks the body that most needs stopping
    damage: 48, // control first, damage second: the freeze IS the value
    projectileSpeed: 900,
    splash: 0,
    color: '#b48cff',
    blurb: 'A lidless arena-bred eye on a calcified stalk. Its stare CALCIFIES — the struck body petrifies mid-stride, and the panic that follows never arrives in time.',
    // The petrifier identity: a single guided bolt that FREEZES (the engine's refractory window
    // keeps chains honest) and leaves Neural static behind — control layered on control.
    abilities: [
      { type: 'projectile', behavior: 'homing', damage: 48, speed: 900, range: 560 },
      { type: 'status', status: { kind: 'Freeze', amount: 1.1 } }, // petrify — the stare's sentence
      { type: 'status', status: { kind: 'Disruption', amount: 0.8 } }, // the static after the stone
    ],
  },
  ossuary: {
    kind: 'ossuary',
    name: 'Ossuary Choir',
    combatClass: 'Resonant',
    firing: 'field', // a bone-organ CHORD — the third Resonant voice (Season B's crown)
    arenaExclusive: true,
    cost: 210,
    range: 250, // a heavy mid-field footprint — the choir sings over the thick of it
    fireInterval: 2.8, // slow liturgical chords — each one slams, coats and DETONATES what is primed
    damage: 34, // the hardest resonant field hit — paid for by cadence and the arena grind
    projectileSpeed: 0,
    splash: 0,
    color: '#e6e0c8',
    blurb: 'A choir of fused ribcages that sings in graveyard harmonics. Every CHORD slams the crowd, rings Resonance into the bone, and detonates whatever the last chord primed.',
    // The self-sufficient resonant: like the Bell it primes, but its chord also REACTS — a solo
    // Ossuary cycles prime→detonate on its own cadence; pairing it with stackers goes nova.
    abilities: [{ type: 'aura', radius: 250, damage: 34, status: { kind: 'Resonance', amount: 1 }, react: true, particle: 'disrupt' }],
  },
  // ── ANSWER roster (docs/TOWERS.md §answers) — three organs, each the designed ANSWER to a role the
  //    board could not express: a BARRACKS that holds ground, a long-reach VIRAL seeder, and a
  //    RESONANT armor-breaker. All compose existing verbs (summon / aura / projectile / status) —
  //    zero new sim code — and all are double-gated (unlockStage + unlockShards) ⇒ golden-safe. ──
  warren: {
    kind: 'warren',
    name: 'Gristle Warren',
    combatClass: 'Vital',
    firing: 'field', // its "shot" is a MUSTER — a thrall shoulders out of the warren (explicit kit below)
    unlockShards: 110, // an early, friendly goal — the second-cheapest gated tower after the Spitfang
    unlockStage: 6, // its shards drop once Campaign Stage 6 is cleared (fills the 3→15 gate drought)
    cost: 115,
    range: 230, // the MUSTER reach — thralls only muster while a threat is inside it
    fireInterval: 4.5, // one thrall per muster; ~13 s thrall life ⇒ ~3 standing walls at steady state
    damage: 5, // the warren's own gnash (the aura below) — the THRALLS carry the real work
    projectileSpeed: 0,
    splash: 0,
    color: '#f2a07b',
    blurb: 'Musters GRISTLE THRALLS that shoulder into the lane and HOLD it — walking walls of sinew. Fliers and burrowers pass them by.',
    // The barracks identity: a body-blocking unit (MINION_DEFS.gristle — minionBlock stalls every
    // ground enemy it touches) + a short gnash at the warren's foot so the organ earns mastery.
    abilities: [
      { type: 'summon', unit: 'gristle', count: 1 },
      { type: 'aura', radius: 110, damage: 5, particle: 'gore' },
    ],
  },
  tick: {
    kind: 'tick',
    name: 'Tick Battery',
    combatClass: 'Viral',
    firing: 'infest', // engorged ticks — the parasite payload (Infection on impact), three hosts per volley
    unlockShards: 180,
    unlockStage: 10, // its shards drop once Campaign Stage 10 is cleared
    cost: 125,
    range: 520, // SEEDER — the first LONG-reach Viral organ (Nest 280 · Lung 250): it starts outbreaks far up-lane
    fireInterval: 2.6, // a slow volley: Infection caps per host (STATUS.infectionMaxStacks), so reach + host COUNT is the value, not cadence
    damage: 4, // token impact — the Infection it plants (ramping, armor-ignoring, spreading) is the product
    projectileSpeed: 380,
    splash: 0,
    color: '#cf6bf0',
    blurb: 'Flings engorged ticks at THREE different hosts far up the lane — every bite seeds Infection. The Nest drills one; the Battery starts the outbreak everywhere.',
    // The patient-zero identity: one volley = three DISTINCT hosts (count 3), each seeded with the
    // parasite payload; the native ramp + death-spread does the rest. Extra ticks ride ability grants
    // (the parasite behavior ignores the extraProjectiles channel by design).
    abilities: [{ type: 'projectile', behavior: 'parasite', damage: 4, speed: 380, range: 520, count: 3 }],
  },
  quill: {
    kind: 'quill',
    name: 'Keening Quill',
    combatClass: 'Resonant',
    firing: 'homing', // a tuned bone quill — rings its mark, then the impact cracks it
    unlockShards: 460,
    unlockStage: 28, // its shards drop once Campaign Stage 28 is cleared (fills the 26→30 gate gap)
    cost: 150,
    range: 560, // SPOTTER — long reach; it cracks the front of the wave before the rest of the board arrives
    fireInterval: 1.7,
    damage: 18,
    projectileSpeed: 760,
    splash: 0,
    color: '#9fe7e0',
    blurb: 'Fires a keening quill that RINGS its mark — the impact cracks the shell and the note SHEARS it: a true-damage burst and a window where its armor is gone for every tower.',
    // The armor-breaker identity: Resonance lands on the mark at the cast; the homing impact's native
    // Fracture + react then SHEARS it (REACTIONS.resoBurst + per Fracture stack, armor broken for
    // STATUS.shredArmorBreak s). Fracture stackers beside it make every shear bigger.
    abilities: [
      { type: 'projectile', behavior: 'homing', damage: 18, speed: 760, range: 560 },
      { type: 'status', status: { kind: 'Resonance', amount: 1 } },
    ],
  },
};

/** Resonance Beam tunables (Resonance Coil, firing 'beam'). The beam deals CONTINUOUS damage each
 *  tick (base `TowerDef.damage` as DPS) to its locked target(s), scaled by the resonance ramp: heat
 *  climbs while focus holds the SAME target and resets on a switch. Centralized so the melt curve is
 *  tuned in one place. Inert unless a Resonance Coil is fielded ⇒ golden-safe. */
export const BEAM = {
  heatPerSec: 0.42, // resonance charge/sec while locked — ~2.4s from cold to full melt
  heatDecayPerSec: 1.1, // charge bled off/sec when the beam has no valid target
  rampBonus: 3.0, // damage bonus at full resonance: ×(1 + rampBonus) ⇒ up to ×4 on a held target
  // (The beam applies its own Resonant status — STATUS.resonancePerHit — each pulse, its entry into
  //  the reaction matrix; it no longer borrows Corrosion. See reactions.ts / docs/TOWERS.md §reactions.)
} as const;

/** Per-def invariants (shared by validate.ts and the registry's own `validate()`). */
export function towerProblems(d: TowerDef): string[] {
  const out: string[] = [];
  if (d.cost < 0) out.push('cost must be >= 0');
  // Projectile firings need somewhere to aim + something to fly; 'field' pulses
  // in-range (range only); 'support' needs neither.
  const projectileBased = d.firing === 'homing' || d.firing === 'splash' || d.firing === 'infest';
  if (projectileBased) {
    if (d.range <= 0) out.push('a projectile tower needs range > 0');
    if (d.projectileSpeed <= 0) out.push('a projectile tower needs projectileSpeed > 0');
  }
  if (d.firing === 'field' && d.range <= 0) out.push('a field tower needs range > 0');
  // A beam tower reaches out to LOCK a target (no projectile flight), so it needs range only.
  if (d.firing === 'beam' && d.range <= 0) out.push('a beam tower needs range > 0');
  // A trap tower needs planting reach AND a real detonation (its splash IS the attack).
  if (d.firing === 'trap') {
    if (d.range <= 0) out.push('a trap tower needs range > 0 (planting reach)');
    if (d.splash <= 0) out.push('a trap tower needs splash > 0 (the detonation radius)');
    if (d.damage <= 0) out.push('a trap tower needs damage > 0 (the detonation payload)');
  }
  // An arc tower's range is the blade's out-leg; the blade must actually fly.
  if (d.firing === 'arc') {
    if (d.range <= 0) out.push('an arc tower needs range > 0 (the out-leg length)');
    if (d.projectileSpeed <= 0) out.push('an arc tower needs projectileSpeed > 0');
  }
  // A summon tower needs a leash for its brood and a hatch cadence.
  if (d.firing === 'summon') {
    if (d.range <= 0) out.push('a summon tower needs range > 0 (the brood leash)');
    if (d.fireInterval <= 0) out.push('a summon tower needs fireInterval > 0 (the hatch cadence)');
  }
  return out;
}

// Towers self-register here; the iteration list is DERIVED (no hardcoded order array).
export const towerRegistry = new Registry<TowerDef>('tower', { idOf: (d) => d.kind, validate: towerProblems });
towerRegistry.registerAll(Object.values(TOWER_DEFS));
export const TOWER_ORDER = towerRegistry.ids() as TowerKind[];

/** Per-tower Biomass cost ladder for branch tiers 1..5 — the PRIMARY late-game Biomass sink
 * (TOWER-BRANCHES.md §4, ECONOMY.md "in-run Biomass curve"). Shared by both of a tower's
 * branches. Calibrated to the measured endless income curve (banked: ~7k @W15, ~30k @W20,
 * ~160k @W30, ~1M @W45) so the build→branch alternation stays meaningful: T1 ≈ 600–900 (a
 * real first commitment, affordable mid-build), T5 ≈ 160k–200k (a deep-endless capstone). A
 * single tower is ~220–275k to take 1→5; a full damage board is ~4–5M, which income only
 * reaches around wave ~55–60 — so Biomass never goes meaningless before then. */
// ── Tower Sell (docs/TOWER-MANAGEMENT.md §2). The refund FRACTION is the future-proof knob:
//    it seeds `RunModifiers.sellRefundFrac`, which any Gene Card / Equipment / Prestige perk /
//    Permanent Upgrade can raise through the normal effect pipeline. frac ≤ 1 ⇒ never exploitable. ──
export const SELL = { refundFrac: 0.75 } as const;

export const BRANCH_COSTS: Record<TowerKind, readonly [number, number, number, number, number]> = {
  needle: [600, 2800, 12000, 45000, 160000],
  mortar: [900, 3800, 15000, 55000, 200000],
  reactor: [800, 3200, 13000, 48000, 175000],
  parasite: [750, 3200, 13000, 48000, 180000],
  obelisk: [900, 3800, 15000, 55000, 200000],
  maw: [850, 3500, 14000, 52000, 190000],
  chrysalis: [900, 3800, 15000, 55000, 200000],
  effigy: [800, 3400, 14000, 50000, 185000],
  coil: [850, 3600, 14000, 52000, 190000], // premium single-target melter — sits with obelisk/mortar
  siphon: [950, 4000, 16000, 58000, 210000], // premium drain melter — the priciest capstone ladder
  sower: [820, 3500, 14000, 51000, 188000], // area-denial seeder — sits with the effigy/coil band
  spire: [900, 3800, 15000, 55000, 200000], // premium arc-caster
  polyp: [860, 3650, 14500, 53000, 195000], // the anti-progress organ
  spitfang: [600, 2700, 11500, 43000, 155000], // the accessible bruiser — the cheapest ladder (mirrors its easy unlock)
  rift: [980, 4100, 16500, 60000, 215000], // the premium void anchor — the priciest ladder (mirrors its deep gate)
  glaive: [880, 3700, 15000, 54000, 198000], // the returning blade — premium kinetic, sits with chrysalis/spire
  roost: [950, 4000, 16000, 58000, 210000], // the brood engine — premium capstone ladder (mirrors siphon)
  lung: [800, 3400, 14000, 50000, 185000], // the zone infector — sits with effigy/sower
  bell: [900, 3800, 15000, 55000, 200000], // the reaction primer — premium control band (obelisk/spire)
  lancet: [920, 3900, 15500, 56000, 205000], // the executioner — premium, just under the rift's ladder
  basilisk: [900, 3800, 15000, 55000, 200000], // the arena petrifier — crown content, obelisk-band ladder
  ossuary: [950, 4000, 16000, 58000, 210000], // the arena choir — crown content, the deep resonant ladder
  warren: [650, 2900, 12000, 45000, 165000], // the early barracks — a cheap ladder beside the spitfang's (mirrors its early gate)
  tick: [750, 3200, 13000, 48000, 180000], // the viral seeder — sits with the parasite nest
  quill: [900, 3800, 15000, 55000, 200000], // the resonant armor-breaker — premium control band (bell/spire)
};

/** Returning-blade tunables (Wyrmwing Glaive, firing 'arc' — docs/TOWERS.md §glaive).
 *  `carveReach` is the blade's cutting radius as it travels — the corridor width of the carve. */
export const GLAIVE = { carveReach: 20 } as const;

/** Spore-mine tunables (Blight Sower, firing 'trap' — docs/SOWER.md). A Sower keeps up to
 *  `maxPerTower` (+sowerExtraMines/stars) mines ARMED on the approach; each arms after `armSec`,
 *  triggers when an enemy comes within `triggerRadius`, and detonates for the tower's baked
 *  damage/blast, applying `corrosionSec` of Corrosion (the Caustic identity — feeds Shred). */
export const MINES = {
  maxPerTower: 4,
  armSec: 0.8,
  triggerRadius: 26,
  corrosionSec: 1.5,
  minSpacing: 34, // planting keeps mines apart so the field SPREADS (px)
};

// ── Enemies ───────────────────────────────────────────────────────────────
/**
 * Steering profile — how an enemy *thinks*, not just where it walks. Combined each
 * tick into a single movement vector (see Game.enemyMoveSystem). Data-driven so new
 * archetypes are a config entry, not new code.
 */
export interface EnemyBehavior {
  seek: number; // pull toward the base/line (flow field)
  avoidTowers: number; // steer out of tower kill-zones -> seek gaps (penetration)
  avoidHero: number; // >0 skirt the hero, <0 HUNT it (bends toward the champion in passing)
  separation: number; // spread from neighbours
  jitter: number; // organic wander
  flying?: boolean; // ignore ground obstacles (drift straight for the base)
  burrowing?: boolean; // ignore ground obstacles (tunnel under them)
  gait?: EnemyGait; // LOCOMOTION pattern (docs/ENEMIES.md §gaits); absent = the classic march
}

/** GAIT (docs/ENEMIES.md §gaits) — the kind's LOCOMOTION, layered over the steering blend:
 *  how the body covers ground, not where it wants to go. Every part is deterministic (phased
 *  off the body id + sim clock — no gameplay rng) and OPTIONAL: an absent part is the classic
 *  constant march (identity). Bosses ignore gaits (their identity verbs own their movement). */
export interface EnemyGait {
  /** Duty-cycle speed pulse: ×`burst` for the first `duty` of each `period` (s), ×`rest` for
   *  the remainder. AUTHOR so duty·burst + (1−duty)·rest ≈ 1 — the average pace (and the
   *  wave's arrival clock) stays the def's `speed`; only the RHYTHM changes. Enforced by the
   *  gait guardrail test (±2%). Reads as lunges / skitters / pounces / heaves. */
  pulse?: { period: number; duty: number; burst: number; rest: number };
  /** Coherent perpendicular WEAVE: a sine of frequency `freq` (rad/s) with steering weight
   *  `amp`, phased per body. Jitter scrambles; weave SNAKES — slithers, banks, wisp-swirls.
   *  Costs a little net advance (longer path), so keep amp ≤ 0.6 (guardrail-enforced). */
  weave?: { amp: number; freq: number };
  /** FLANK entry: above `untilY` the body pulls toward its side lane with steering weight
   *  `pull` (id parity splits a brood across both flanks) — it runs the edges, then cuts in.
   *  The gap-hunter read, in the path itself. */
  flank?: { pull: number; untilY: number };
}

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  armor: number;
  speed: number; // px/sec
  bounty: number; // biomass on death
  damage: number; // integrity damage at the line
  radius: number;
  color: string;
  behavior: EnemyBehavior;
  // ── Role traits (all OPTIONAL; absent = a baseline melee-at-the-line enemy). Each is read
  //    by exactly ONE gated hook in the sim, so a new enemy is pure data — and the historical
  //    seven, which set none of these, are byte-identical (the golden invariant). ──
  shieldHp?: number; // Shielded: a front shield soaked before HP
  regenPerSec?: number; // Regenerating: HP/sec self-heal while alive
  summon?: { kind: EnemyKind; count: number; interval: number }; // Summoner: periodic adds
  auraRadius?: number; // Support: aura reach (px)
  auraRegenPerSec?: number; // Support: heal allies inside the aura
  auraShield?: number; // Support: top up allies' shields inside the aura
  explodeRadius?: number; // Suicide: blast reach at the line (px)
  explodeDamage?: number; // Suicide: blast damage to the Nucleus + the hero
  siege?: { range: number; damage: number; interval: number }; // Artillery: standoff bombard
  /** Hive Siege attack profile (docs/HIVE-SIEGE.md §attack-loop) — REQUIRED so every enemy's
   *  melee cadence is an authored, role-derived decision (fast = small rapid bites, heavy =
   *  slow chunks). `windup` doubles as the FUSE for suicide kinds (explodeDamage set). */
  attack: { interval: number; windup: number };
}

/** Presentation-only: the death-SOUND timbre for an enemy, DERIVED from its role traits (a new
 *  enemy auto-classifies — no per-kind table to maintain). The sim pushes this UNDER the kept
 *  kill-streak ping, so a kill reads as body-specific IMPACT + reward. Golden-safe: a cue never
 *  touches wave/kills/integrity/biomass. */
export function enemyDeathCue(def: EnemyDef): string {
  if (def.explodeDamage) return 'edie_pop'; // suicide — a wet volatile burst
  if (def.behavior.flying) return 'edie_screech'; // flying — an airy screech
  if ((def.shieldHp ?? 0) > 0 || def.armor >= 6) return 'edie_crack'; // plated / shielded — a chitin crack
  if (def.hp >= 650) return 'edie_splat'; // heavy bruisers — a deep wet splat
  return 'edie_squelch'; // soft-bodied chaff / support / summoner
}

/** Presentation-only: the BASE firing sound for an UNBRANCHED tower (a branched tower plays its
 *  branch kit's cue instead). Keyed by the tower's firing character; beam + support kinds return ''
 *  (no per-shot cue). Golden-safe: a cue never touches wave/kills/integrity/biomass. */
export function towerFireCue(kind: TowerKind): string {
  switch (kind) {
    case 'needle': case 'spire': case 'spitfang': return 'tfire_tick'; // a sharp kinetic/synaptic snap (autocannon included — gap caught by the DIL checklist)
    case 'mortar': case 'glaive': case 'lancet': return 'tfire_thud'; // a heavy lobbed thud / a heavy blade or harpoon release
    case 'parasite': case 'maw': case 'polyp': case 'sower': case 'roost': case 'lung': case 'warren': case 'tick': return 'tfire_wet'; // a wet organic blip (the roost's is its HATCH — played by roostSystem; the lung's is its exhale; the warren's its muster; the tick's its fling)
    case 'obelisk': case 'effigy': case 'basilisk': return 'tfire_zap'; // a psionic zap / the petrifying stare's discharge
    case 'chrysalis': case 'bell': case 'quill': return 'tfire_ting'; // a crystalline ting / the bell's toll / the quill's keen
    default: return ''; // coil/siphon beams + reactor support + roost brood have their own identity
  }
}

// ~30 archetypes across 12 ROLES. Every entry trades on a distinct battlefield identity that
// forces a DIFFERENT placement decision (coverage geometry, focus vs spread, intercept timing),
// not a stat slide. The historical seven (runner/brute/tyrant/rusher/tank/flyer/burrower) keep
// their EXACT values — they carry no traits, so the golden run is byte-identical. Roles are
// documented in docs/ENEMIES.md. Colors are placeholder art (the renderer draws by color/radius).
export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  // ── SWARM — many, weak, spread; demand AoE/splash over single-target ──
  runner: {
    kind: 'runner', name: 'Skitterling', hp: 36, armor: 0, speed: 72, bounty: 11, damage: 3, radius: 10, color: '#d98cff',
    behavior: { seek: 1, avoidTowers: 0.28, avoidHero: 0.5, separation: 0.55, jitter: 0.16, gait: { pulse: { period: 0.55, duty: 0.5, burst: 1.5, rest: 0.5 }, weave: { amp: 0.22, freq: 5 } } }, // nervous scuttle-bursts
    attack: { interval: 0.9, windup: 0.35 }, // SWARM: rapid nibbles
  },
  mite: {
    kind: 'mite', name: 'Gnat Mite', hp: 14, armor: 0, speed: 96, bounty: 5, damage: 2, radius: 6, color: '#f0a0d8',
    behavior: { seek: 1.1, avoidTowers: 0.1, avoidHero: 0.6, separation: 0.7, jitter: 0.28, gait: { weave: { amp: 0.5, freq: 7.5 } } }, // a fragile SWIRLING cloud → splash-or-die
    attack: { interval: 0.9, windup: 0.3 }, // SWARM: gnat bites
  },
  // ── EARLY BROOD — four WEAK teaching variations (docs/ENEMIES.md §early-brood). All are
  //    trait-less walkers with tier-1 effective HP, so the derived campaign gate (`unlockStage`)
  //    admits them from STAGE 1 and the wave-1 unit caps accept them — the opening stages read
  //    as a varied brood instead of a Skitterling monoculture. Each teaches ONE placement lesson
  //    at newbie scale: armor exists (husk) · speed pressure (flea) · sustained-DPS wall (mold) ·
  //    coverage gaps (skulker). Golden-safe for the pinned autoplay: the scripted WAVES table
  //    never spawns them (campaign/daily generation is where they enter). ──
  husk: {
    kind: 'husk', name: 'Hollow Husk', hp: 20, armor: 1, speed: 55, bounty: 6, damage: 2, radius: 9, color: '#cfc3a8',
    behavior: { seek: 1, avoidTowers: 0.2, avoidHero: 0.3, separation: 0.5, jitter: 0.12, gait: { weave: { amp: 0.15, freq: 1.2 } } }, // a dried shell that shambles + sways — the FIRST armor read, in a harmless dose
    attack: { interval: 0.9, windup: 0.35 },
  },
  flea: {
    kind: 'flea', name: 'Itch Flea', hp: 16, armor: 0, speed: 98, bounty: 6, damage: 2, radius: 6, color: '#e8c06a',
    behavior: { seek: 1.05, avoidTowers: 0.12, avoidHero: 0.7, separation: 0.75, jitter: 0.34, gait: { pulse: { period: 0.4, duty: 0.35, burst: 2, rest: 0.46 } } }, // a POPPING speck — it hops — speed pressure before the Razor Sprinter exists
    attack: { interval: 0.9, windup: 0.3 },
  },
  mold: {
    kind: 'mold', name: 'Creeping Mold', hp: 62, armor: 0, speed: 26, bounty: 9, damage: 4, radius: 12, color: '#95a050',
    behavior: { seek: 1, avoidTowers: 0.02, avoidHero: 0.05, separation: 0.35, jitter: 0.06 }, // a slow spongy mass that creeps STRAIGHT — the first "this needs sustained fire" wall
    attack: { interval: 1.1, windup: 0.4 }, // slow chewing
  },
  skulker: {
    kind: 'skulker', name: 'Pale Skulker', hp: 24, armor: 0, speed: 80, bounty: 7, damage: 3, radius: 8, color: '#93a8bd',
    behavior: { seek: 0.85, avoidTowers: 0.85, avoidHero: 0.8, separation: 0.45, jitter: 0.2, gait: { pulse: { period: 0.7, duty: 0.45, burst: 1.4, rest: 0.67 }, flank: { pull: 0.5, untilY: 500 } } }, // a coward that HUNTS GAPS — it creeps the EDGES first (highest tower-avoidance in the weak band) — the coverage lesson
    attack: { interval: 0.9, windup: 0.32 },
  },
  larva: {
    kind: 'larva', name: 'Writhing Larva', hp: 24, armor: 0, speed: 40, bounty: 4, damage: 3, radius: 9, color: '#d8cfa0',
    behavior: { seek: 1, avoidTowers: 0.05, avoidHero: 0.1, separation: 0.5, jitter: 0.1, gait: { pulse: { period: 1.4, duty: 0.5, burst: 1.5, rest: 0.5 } } }, // slow INCHING chaff that clogs the lane
    attack: { interval: 1.1, windup: 0.4 }, // SWARM: slow chew
  },
  // ── FAST — high speed, beeline; need front-loaded DPS / static coverage ──
  rusher: {
    kind: 'rusher', name: 'Razor Sprinter', hp: 28, armor: 0, speed: 132, bounty: 9, damage: 3, radius: 8, color: '#ff5db0',
    behavior: { seek: 1.2, avoidTowers: 0, avoidHero: 0, separation: 0.2, jitter: 0.04, gait: { pulse: { period: 1.5, duty: 0.35, burst: 2.1, rest: 0.41 } } }, // SPRINT-skid-SPRINT, ignores defenses
    attack: { interval: 0.8, windup: 0.3 }, // FAST: frantic slashes
  },
  darter: {
    kind: 'darter', name: 'Synapse Darter', hp: 30, armor: 0, speed: 150, bounty: 11, damage: 3, radius: 8, color: '#ff79c0',
    behavior: { seek: 1.25, avoidTowers: 0.1, avoidHero: 0.9, separation: 0.2, jitter: 0.2, gait: { pulse: { period: 1.1, duty: 0.25, burst: 2.6, rest: 0.47 }, weave: { amp: 0.3, freq: 6 } } }, // synaptic DASHES that slip PAST the hero → static front
    attack: { interval: 0.75, windup: 0.3 }, // FAST: frantic slashes
  },
  lasher: {
    kind: 'lasher', name: 'Whip Lasher', hp: 44, armor: 0, speed: 118, bounty: 13, damage: 5, radius: 10, color: '#ff6088',
    behavior: { seek: 1.3, avoidTowers: 0, avoidHero: 0, separation: 0.15, jitter: 0.03, gait: { pulse: { period: 1.8, duty: 0.3, burst: 2, rest: 0.57 } } }, // coil-then-STRIKE charge → punishes gaps
    attack: { interval: 0.9, windup: 0.35 }, // FAST: whip flurry
  },
  // ── HEAVY — high HP/armor, slow; lean on shred + sustained focus ──
  brute: {
    kind: 'brute', name: 'Carrion Brute', hp: 150, armor: 8, speed: 42, bounty: 26, damage: 12, radius: 14, color: '#7b9cff',
    behavior: { seek: 1, avoidTowers: 0.16, avoidHero: 0.22, separation: 0.4, jitter: 0.06, gait: { pulse: { period: 2.2, duty: 0.55, burst: 1.25, rest: 0.69 } } }, // heaving lumber-steps
    attack: { interval: 1.8, windup: 0.6 }, // HEAVY: slow club swings
  },
  tank: {
    kind: 'tank', name: 'Carapace Hauler', hp: 430, armor: 18, speed: 30, bounty: 60, damage: 19, radius: 18, color: '#5fd0c6',
    behavior: { seek: 1, avoidTowers: 0.08, avoidHero: 0, separation: 0.3, jitter: 0.02 }, // soaks, unbothered
    attack: { interval: 2.2, windup: 0.8 }, // HEAVY: crushing headbutts
  },
  golem: {
    kind: 'golem', name: 'Calcified Golem', hp: 360, armor: 26, speed: 28, bounty: 55, damage: 24, radius: 17, color: '#9aa6b8',
    behavior: { seek: 1, avoidTowers: 0.06, avoidHero: 0, separation: 0.25, jitter: 0.02 }, // walking armor → Fracture/Corrosion
    attack: { interval: 2.4, windup: 0.8 }, // HEAVY: earth-shaking blows
  },
  colossus: {
    kind: 'colossus', name: 'Bonecrusher Colossus', hp: 1100, armor: 12, speed: 22, bounty: 140, damage: 60, radius: 24, color: '#6b7a55',
    behavior: { seek: 1, avoidTowers: 0.03, avoidHero: 0, separation: 0.12, jitter: 0 }, // an HP mountain → concentrated fire
    attack: { interval: 3.0, windup: 1.0 }, // COLOSSAL: devastating overheads
  },
  // ── SHIELDED — a front shield soaks before HP; burst to crack, then finish ──
  bulwark: {
    kind: 'bulwark', name: 'Aegis Drone', hp: 90, armor: 4, speed: 46, bounty: 30, damage: 11, radius: 13, color: '#7fd0ff', shieldHp: 120,
    behavior: { seek: 1, avoidTowers: 0.1, avoidHero: 0.1, separation: 0.3, jitter: 0.05 }, // 120 shield first → reward burst
    attack: { interval: 1.7, windup: 0.6 }, // SHIELDED: shield-bash rhythm
  },
  warden: {
    kind: 'warden', name: 'Bastion Warden', hp: 260, armor: 12, speed: 30, bounty: 70, damage: 21, radius: 18, color: '#5fa8d0', shieldHp: 200,
    behavior: { seek: 1, avoidTowers: 0.06, avoidHero: 0, separation: 0.25, jitter: 0.02 }, // shield + armor + HP = a triple wall
    attack: { interval: 2.2, windup: 0.75 }, // SHIELDED HEAVY: measured hammering
  },
  // ── REGENERATING — heals over time; out-DPS / burst or it never dies ──
  knitter: {
    kind: 'knitter', name: 'Flesh Knitter', hp: 130, armor: 4, speed: 60, bounty: 34, damage: 9, radius: 13, color: '#7ce0a0', regenPerSec: 26,
    behavior: { seek: 1, avoidTowers: 0.12, avoidHero: 0.2, separation: 0.3, jitter: 0.08, gait: { weave: { amp: 0.2, freq: 2.2 } } }, // drifts as it mends 26/s → needs burst DPS
    attack: { interval: 1.4, windup: 0.5 }, // REGEN: relentless picking
  },
  revenant: {
    kind: 'revenant', name: 'Bog Revenant', hp: 320, armor: 8, speed: 34, bounty: 70, damage: 16, radius: 16, color: '#4fb87a', regenPerSec: 48,
    behavior: { seek: 1, avoidTowers: 0.06, avoidHero: 0, separation: 0.2, jitter: 0.03 }, // mends 48/s → a focused kill-lane
    attack: { interval: 1.8, windup: 0.6 }, // REGEN HEAVY: grinding assault
  },
  // ── BURROWING — ignores obstacles, hunts gaps; demands even coverage ──
  burrower: {
    kind: 'burrower', name: 'Gut Tunneler', hp: 90, armor: 6, speed: 58, bounty: 22, damage: 6, radius: 12, color: '#e8a04a',
    behavior: { seek: 1, avoidTowers: 0.55, avoidHero: 0.4, separation: 0.3, jitter: 0.1, burrowing: true, gait: { pulse: { period: 1.6, duty: 0.4, burst: 1.9, rest: 0.4 } } }, // tunnels gaps in surging HEAVES
    attack: { interval: 1.2, windup: 0.45 }, // BURROW: gouging claws
  },
  molerat: {
    kind: 'molerat', name: 'Sand Stalker', hp: 70, armor: 4, speed: 78, bounty: 20, damage: 6, radius: 11, color: '#d8a850',
    behavior: { seek: 1.1, avoidTowers: 0.7, avoidHero: 0.4, separation: 0.3, jitter: 0.12, burrowing: true, gait: { pulse: { period: 1, duty: 0.45, burst: 1.8, rest: 0.35 }, flank: { pull: 0.4, untilY: 560 } } }, // fast gap-hunter that CIRCLES the flanks
    attack: { interval: 1.0, windup: 0.4 }, // BURROW: gnawing frenzy
  },
  // ── FLYING — over all obstacles; need anti-air / wide coverage ──
  flyer: {
    kind: 'flyer', name: 'Spore Drifter', hp: 60, armor: 2, speed: 64, bounty: 18, damage: 6, radius: 11, color: '#c0a3ff',
    behavior: { seek: 1, avoidTowers: 0.12, avoidHero: 0.35, separation: 0.3, jitter: 0.12, flying: true, gait: { weave: { amp: 0.4, freq: 2 } } }, // BANKS over obstacles
    attack: { interval: 1.1, windup: 0.4 }, // FLYING: diving pecks
  },
  wisp: {
    kind: 'wisp', name: 'Mind Wisp', hp: 40, armor: 0, speed: 92, bounty: 16, damage: 5, radius: 9, color: '#b0c8ff',
    behavior: { seek: 1.1, avoidTowers: 0.15, avoidHero: 0.4, separation: 0.3, jitter: 0.18, flying: true, gait: { weave: { amp: 0.55, freq: 3.2 } } }, // SWIRLING fast air → anti-air
    attack: { interval: 1.0, windup: 0.4 }, // SPECIAL: arcing stings
  },
  gargoyle: {
    kind: 'gargoyle', name: 'Bone Gargoyle', hp: 180, armor: 14, speed: 48, bounty: 48, damage: 13, radius: 15, color: '#8898b0',
    behavior: { seek: 1, avoidTowers: 0.08, avoidHero: 0.1, separation: 0.25, jitter: 0.06, flying: true, gait: { weave: { amp: 0.3, freq: 1.6 } } }, // armored air on slow heavy WINGBEATS → shred AA
    attack: { interval: 1.6, windup: 0.55 }, // ARMORED: stone talons
  },
  // ── FLYING + REGENERATING — an airborne leech that re-knits itself; burst can't out-race the
  //    heal before it re-forms, so anti-air must SUSTAIN. The first flyer with a self-heal. ──
  cystwraith: {
    kind: 'cystwraith', name: 'Cyst Wraith', hp: 140, armor: 3, speed: 66, bounty: 40, damage: 8, radius: 13, color: '#5fe0b0', regenPerSec: 28,
    behavior: { seek: 1, avoidTowers: 0.12, avoidHero: 0.35, separation: 0.3, jitter: 0.12, flying: true, gait: { pulse: { period: 1.3, duty: 0.5, burst: 1.35, rest: 0.65 }, weave: { amp: 0.45, freq: 1.4 } } }, // PHASING glide-fade air-regen → sustained AA
    attack: { interval: 1.3, windup: 0.5 }, // REGEN FLYER: leeching bites
  },
  // ── SUMMONER — spawns adds on a timer; priority-kill or drown in swarm ──
  broodmother: {
    kind: 'broodmother', name: 'Brood Matron', hp: 200, armor: 6, speed: 38, bounty: 80, damage: 13, radius: 17, color: '#e070c0',
    summon: { kind: 'mite', count: 2, interval: 3.5 },
    behavior: { seek: 1, avoidTowers: 0.1, avoidHero: 0.15, separation: 0.25, jitter: 0.06, gait: { pulse: { period: 2.4, duty: 0.5, burst: 1.3, rest: 0.7 } } }, // laboring waddle; births mites → focus it down
    attack: { interval: 2.0, windup: 0.7 }, // SUMMONER: ponderous slams (her brood is the threat)
  },
  hivecaller: {
    kind: 'hivecaller', name: 'Hive Caller', hp: 170, armor: 4, speed: 34, bounty: 85, damage: 12, radius: 16, color: '#c060a0', shieldHp: 90,
    summon: { kind: 'larva', count: 3, interval: 5 },
    behavior: { seek: 1, avoidTowers: 0.08, avoidHero: 0.1, separation: 0.25, jitter: 0.05 }, // shielded caller → crack then silence
    attack: { interval: 2.0, windup: 0.7 }, // SUMMONER: ritual strikes (the adds are the threat)
  },
  // ── SUPPORT — auras that heal/shield allies; kill the support FIRST ──
  mender: {
    kind: 'mender', name: 'Vital Mender', hp: 110, armor: 2, speed: 48, bounty: 60, damage: 4, radius: 12, color: '#d6c65c',
    auraRadius: 96, auraRegenPerSec: 18,
    behavior: { seek: 1, avoidTowers: 0.2, avoidHero: 0.5, separation: 0.35, jitter: 0.1, gait: { weave: { amp: 0.25, freq: 1.8 } } }, // bobs behind the pack, healing 18/s → kill the healer
    attack: { interval: 1.6, windup: 0.5 }, // SUPPORT: half-hearted prods (its aura is the threat)
  },
  cantor: {
    kind: 'cantor', name: 'Aegis Cantor', hp: 120, armor: 4, speed: 44, bounty: 64, damage: 4, radius: 13, color: '#7cb0f0',
    auraRadius: 104, auraShield: 60,
    behavior: { seek: 1, avoidTowers: 0.2, avoidHero: 0.45, separation: 0.35, jitter: 0.08, gait: { weave: { amp: 0.25, freq: 1.8 } } }, // bobs behind the pack, shielding 60 → silence it
    attack: { interval: 1.6, windup: 0.5 }, // SUPPORT: half-hearted prods (its aura is the threat)
  },
  // ── SUICIDE — fragile bombs that detonate at the line; intercept early ──
  bomber: {
    kind: 'bomber', name: 'Bile Bomber', hp: 50, armor: 0, speed: 104, bounty: 18, damage: 28, radius: 11, color: '#ff9a3d',
    explodeRadius: 70, explodeDamage: 28,
    behavior: { seek: 1.25, avoidTowers: 0.05, avoidHero: 0, separation: 0.2, jitter: 0.06, gait: { pulse: { period: 0.9, duty: 0.55, burst: 1.4, rest: 0.51 }, weave: { amp: 0.35, freq: 4.5 } } }, // a JINKING bombing run → kill it BEFORE the line
    attack: { interval: 1.5, windup: 0.5 }, // SUICIDE: windup = the FUSE; one burst, then gone
  },
  popper: {
    kind: 'popper', name: 'Spore Popper', hp: 90, armor: 2, speed: 40, bounty: 22, damage: 36, radius: 14, color: '#ffb84d',
    explodeRadius: 96, explodeDamage: 40,
    behavior: { seek: 1, avoidTowers: 0.1, avoidHero: 0.1, separation: 0.25, jitter: 0.05, gait: { pulse: { period: 1.8, duty: 0.5, burst: 1.3, rest: 0.7 } } }, // a SLOSHING walking mine → kill it clear
    attack: { interval: 1.5, windup: 0.65 }, // SUICIDE: windup = the FUSE; one burst, then gone
  },
  // ── BURROWING + SUICIDE — a tunnelling incendiary that skirts tower kill-zones (hunts gaps),
  //    then surfaces and detonates at the line. Demands EVEN coverage AND early interception. ──
  sapper: {
    kind: 'sapper', name: 'Cinder Sapper', hp: 80, armor: 2, speed: 70, bounty: 26, damage: 6, radius: 12, color: '#e07a30',
    explodeRadius: 84, explodeDamage: 34,
    behavior: { seek: 1.1, avoidTowers: 0.6, avoidHero: 0.1, separation: 0.25, jitter: 0.1, burrowing: true, gait: { flank: { pull: 0.6, untilY: 520 } } }, // runs the FLANKS to the gaps, then blows
    attack: { interval: 1.4, windup: 0.5 }, // SUICIDE: windup = the FUSE; one burst, then gone
  },
  // ── HEAVY + SUICIDE — a slow walking bomb: huge HP, huge blast. The wave you CANNOT let
  //    arrive — forces kill-before-the-line pressure instead of line-holding attrition. ──
  cataclyst: {
    kind: 'cataclyst', name: 'Cataclyst', hp: 330, armor: 10, speed: 26, bounty: 68, damage: 10, radius: 18, color: '#e0483a',
    explodeRadius: 120, explodeDamage: 58,
    behavior: { seek: 1, avoidTowers: 0.05, avoidHero: 0, separation: 0.3, jitter: 0.03 }, // a slow, unswerving bomb
    attack: { interval: 2.2, windup: 0.9 }, // SUICIDE: the long fuse IS the counterplay window
  },
  // ── ARTILLERY — halt short of the line and bombard the Nucleus from range ──
  siegeworm: {
    kind: 'siegeworm', name: 'Siege Maw', hp: 240, armor: 8, speed: 30, bounty: 75, damage: 9, radius: 17, color: '#c0d080',
    siege: { range: 220, damage: 6, interval: 1.6 },
    behavior: { seek: 1, avoidTowers: 0.05, avoidHero: 0, separation: 0.2, jitter: 0.02 }, // shells from 220px → reach it mid-field
    attack: { interval: 2.0, windup: 0.7 }, // ARTILLERY: melee fallback only (it standoffs)
  },
  spitter: {
    kind: 'spitter', name: 'Acid Spitter', hp: 110, armor: 2, speed: 44, bounty: 40, damage: 6, radius: 12, color: '#a0d060',
    siege: { range: 180, damage: 4, interval: 1.2 },
    behavior: { seek: 1.05, avoidTowers: 0.1, avoidHero: 0.2, separation: 0.25, jitter: 0.08, gait: { weave: { amp: 0.2, freq: 2.5 } } }, // nimble SIDLING standoff → mid-field DPS
    attack: { interval: 1.5, windup: 0.5 }, // ARTILLERY: melee fallback only (it standoffs)
  },
  // ── FLYING + ARTILLERY — bombards from the AIR: path answers don't apply AND range answers
  //    must reach altitude. The coverage puzzle squared. ──
  stratovore: {
    kind: 'stratovore', name: 'Stratovore', hp: 190, armor: 4, speed: 42, bounty: 72, damage: 8, radius: 15, color: '#9a7ce0',
    siege: { range: 260, damage: 5, interval: 1.8 },
    behavior: { seek: 1, avoidTowers: 0.15, avoidHero: 0.3, separation: 0.3, jitter: 0.1, flying: true, gait: { weave: { amp: 0.35, freq: 1.5 } } }, // rides high THERMALS, shells far
    attack: { interval: 1.6, windup: 0.6 }, // ARTILLERY FLYER: pecks if forced to the line
  },
  // ── SUMMONER + REGENERATING — a self-mending womb: chip damage can't stop the brood.
  //    Demands a real BURST answer, not attrition. ──
  broodweaver: {
    kind: 'broodweaver', name: 'Brood Weaver', hp: 240, armor: 5, speed: 33, bounty: 92, damage: 12, radius: 17, color: '#8ae06a', regenPerSec: 22,
    summon: { kind: 'larva', count: 2, interval: 4 },
    behavior: { seek: 1, avoidTowers: 0.1, avoidHero: 0.15, separation: 0.25, jitter: 0.06, gait: { weave: { amp: 0.2, freq: 1.3 } } }, // WEAVES as it waddles the swarm back
    attack: { interval: 2.0, windup: 0.7 }, // SUMMONER: slow slams (the brood is the threat)
  },
  // ── DEEP-FAUNA — fresh role FUSIONS (each reuses TWO existing gated hooks; pure data, golden-safe).
  //    A new placement puzzle apiece: a self-repairing wall, an air spawner, a durable bombarder, a
  //    double-aura keystone, a kamikaze cloud. Campaign entry-stage auto-derives from their traits
  //    (unlockStage), so they arrive STAGGERED, never all at once. ──
  zealot: {
    kind: 'zealot', name: 'Aegis Zealot', hp: 150, armor: 8, speed: 42, bounty: 50, damage: 13, radius: 14, color: '#6fe0d0', shieldHp: 130, regenPerSec: 20,
    behavior: { seek: 1, avoidTowers: 0.1, avoidHero: 0.15, separation: 0.3, jitter: 0.05, gait: { pulse: { period: 2, duty: 0.4, burst: 1.6, rest: 0.6 } } }, // zealous surges; shield soaks burst, flesh re-knits → answer with SUSTAINED shred
    attack: { interval: 1.7, windup: 0.6 }, // SHIELDED REGEN: measured bashes
  },
  carrier: {
    kind: 'carrier', name: 'Carrion Zeppelin', hp: 210, armor: 6, speed: 32, bounty: 90, damage: 9, radius: 18, color: '#b28cff', summon: { kind: 'mite', count: 2, interval: 4 },
    behavior: { seek: 1, avoidTowers: 0.1, avoidHero: 0.2, separation: 0.25, jitter: 0.08, flying: true, gait: { weave: { amp: 0.3, freq: 1.2 } } }, // a drifting ZEPPELIN sway over defenses, seeding mites behind the line → anti-air + focus
    attack: { interval: 1.8, windup: 0.6 }, // FLYING SUMMONER: ponderous (its brood is the threat)
  },
  entrencher: {
    kind: 'entrencher', name: 'Bastion Spitter', hp: 210, armor: 8, speed: 30, bounty: 76, damage: 8, radius: 16, color: '#8ac06a', regenPerSec: 22, siege: { range: 200, damage: 6, interval: 1.5 },
    behavior: { seek: 1, avoidTowers: 0.06, avoidHero: 0, separation: 0.2, jitter: 0.03 }, // parks mid-field, out-heals chip while it shells → reach it / burst it
    attack: { interval: 1.9, windup: 0.65 }, // ARTILLERY REGEN: melee fallback (it standoffs)
  },
  oracle: {
    kind: 'oracle', name: 'Hollow Oracle', hp: 150, armor: 4, speed: 40, bounty: 82, damage: 5, radius: 14, color: '#8ce0c0', auraRadius: 108, auraRegenPerSec: 16, auraShield: 50,
    behavior: { seek: 1, avoidTowers: 0.22, avoidHero: 0.5, separation: 0.35, jitter: 0.08, gait: { weave: { amp: 0.25, freq: 1.6 } } }, // drifts at the backline; heals AND shields the pack from the backline → kill the keystone FIRST
    attack: { interval: 1.6, windup: 0.5 }, // DOUBLE SUPPORT: half-hearted prods (its auras are the threat)
  },
  glutling: {
    kind: 'glutling', name: 'Bloat Cluster', hp: 26, armor: 0, speed: 106, bounty: 7, damage: 4, radius: 8, color: '#ff8a4d', explodeRadius: 52, explodeDamage: 16,
    behavior: { seek: 1.2, avoidTowers: 0.05, avoidHero: 0, separation: 0.5, jitter: 0.18, gait: { pulse: { period: 0.5, duty: 0.5, burst: 1.6, rest: 0.4 }, weave: { amp: 0.25, freq: 8 } } }, // a frantic WOBBLING cloud of bomblets → AoE it early or the swarm detonates together
    attack: { interval: 1.2, windup: 0.45 }, // SWARM SUICIDE: windup = the FUSE; one burst, then gone
  },
  // ── ELITE / APEX — premium multi-threats that fuse several roles ──
  apex: {
    kind: 'apex', name: 'Apex Predator', hp: 280, armor: 10, speed: 86, bounty: 120, damage: 15, radius: 16, color: '#ffcf5a', regenPerSec: 20,
    behavior: { seek: 1.1, avoidTowers: 0.1, avoidHero: -0.6, separation: 0.2, jitter: 0.06, gait: { pulse: { period: 2.4, duty: 0.22, burst: 2.8, rest: 0.49 } } }, // STALKS, then POUNCES — and hunts the hero
    attack: { interval: 1.3, windup: 0.45 }, // APEX: savage bite cycle
  },
  dreadnought: {
    kind: 'dreadnought', name: 'Dread Nought', hp: 520, armor: 16, speed: 26, bounty: 160, damage: 36, radius: 20, color: '#b85a5a', shieldHp: 260,
    summon: { kind: 'larva', count: 2, interval: 6 },
    behavior: { seek: 1, avoidTowers: 0.04, avoidHero: 0, separation: 0.18, jitter: 0.01 }, // shielded, larva-spewing capstone
    attack: { interval: 2.6, windup: 0.9 }, // ELITE HEAVY: siege-ram slams
  },
  tyrant: {
    kind: 'tyrant', name: 'Brood Tyrant', hp: 900, armor: 14, speed: 32, bounty: 180, damage: 63, radius: 26, color: '#ff4d6d',
    behavior: { seek: 1, avoidTowers: 0.05, avoidHero: 0, separation: 0.18, jitter: 0 },
    attack: { interval: 2.8, windup: 1.0 }, // BOSS-TIER: monumental blows
  },
  // ── PUZZLE FAUNA (docs/ENEMIES.md §puzzle) — six trait fusions, each authored around the ONE answer
  //    it demands (EA-DESIGN-AUDIT #66). Pure data: every trait rides an existing gated hook, the
  //    campaign entry stage auto-derives from the traits (they arrive staggered across stages 4–9 — clear of the pinned 1–3 onboarding curve),
  //    and the scripted WAVES table never spawns them ⇒ the pinned golden run is byte-identical. ──
  scuttler: {
    kind: 'scuttler', name: 'Chitin Scuttler', hp: 140, armor: 18, speed: 70, bounty: 32, damage: 5, radius: 11, color: '#c2a35a',
    behavior: { seek: 1.1, avoidTowers: 0.1, avoidHero: 0.3, separation: 0.4, jitter: 0.12, gait: { pulse: { period: 0.7, duty: 0.4, burst: 1.6, rest: 0.6 } } }, // a plated beetle in SKITTER-bursts: chip bounces off → armor-break (Shred/Shear) or armor-ignoring Infection
    attack: { interval: 1.0, windup: 0.35 }, // PLATED FAST: pincer snips
  },
  blightmoth: {
    kind: 'blightmoth', name: 'Blight Moth', hp: 220, armor: 3, speed: 60, bounty: 40, damage: 6, radius: 14, color: '#b8d040',
    explodeRadius: 90, explodeDamage: 36,
    behavior: { seek: 1.1, avoidTowers: 0.1, avoidHero: 0.2, separation: 0.3, jitter: 0.14, flying: true, gait: { weave: { amp: 0.4, freq: 2.0 } } }, // a slow, BLOATED airborne bomb drifting over walls + blockers → it takes real ranged DPS to intercept
    attack: { interval: 1.4, windup: 0.5 }, // SUICIDE: windup = the FUSE; one burst, then gone
  },
  borer: {
    kind: 'borer', name: 'Marrow Borer', hp: 120, armor: 6, speed: 54, bounty: 34, damage: 8, radius: 12, color: '#d88a9a', regenPerSec: 20,
    behavior: { seek: 1, avoidTowers: 0.6, avoidHero: 0.4, separation: 0.3, jitter: 0.1, burrowing: true, gait: { pulse: { period: 1.8, duty: 0.45, burst: 1.7, rest: 0.43 }, flank: { pull: 0.45, untilY: 540 } } }, // tunnels the coverage GAPS while it re-knits → Infection keeps eating it out of sight
    attack: { interval: 1.2, windup: 0.45 }, // BURROW REGEN: gnawing
  },
  shellback: {
    kind: 'shellback', name: 'Shellback Bombard', hp: 200, armor: 8, speed: 28, bounty: 82, damage: 9, radius: 17, color: '#c8a878', shieldHp: 180,
    siege: { range: 240, damage: 7, interval: 1.7 },
    behavior: { seek: 1, avoidTowers: 0.05, avoidHero: 0, separation: 0.2, jitter: 0.02 }, // a plated bombard that parks out of short reach → PULL breaks its siege lock; burst cracks the shell
    attack: { interval: 2.0, windup: 0.7 }, // ARTILLERY SHIELDED: melee fallback only (it standoffs)
  },
  wispmother: {
    kind: 'wispmother', name: 'Wisp Mother', hp: 220, armor: 4, speed: 34, bounty: 88, damage: 11, radius: 17, color: '#98a0f0',
    summon: { kind: 'wisp', count: 1, interval: 4.5 },
    behavior: { seek: 1, avoidTowers: 0.1, avoidHero: 0.15, separation: 0.25, jitter: 0.06, gait: { weave: { amp: 0.2, freq: 1.4 } } }, // a ground womb birthing FLYERS behind your line → focus her at range
    attack: { interval: 2.0, windup: 0.7 }, // SUMMONER: slow slams (the brood is the threat)
  },
  veilmoth: {
    kind: 'veilmoth', name: 'Veil Moth', hp: 90, armor: 2, speed: 58, bounty: 60, damage: 4, radius: 12, color: '#d8c8f8',
    auraRadius: 100, auraShield: 40,
    behavior: { seek: 1, avoidTowers: 0.2, avoidHero: 0.45, separation: 0.35, jitter: 0.08, flying: true, gait: { weave: { amp: 0.35, freq: 1.7 } } }, // shields the pack FROM THE AIR → kill the support first, at range
    attack: { interval: 1.6, windup: 0.5 }, // FLYING SUPPORT: half-hearted prods (its aura is the threat)
  },
};

export function enemyProblems(d: EnemyDef): string[] {
  const out: string[] = [];
  if (d.hp <= 0) out.push('hp must be > 0');
  if (d.speed <= 0) out.push('speed must be > 0');
  if (d.radius <= 0) out.push('radius must be > 0');
  if (d.armor < 0) out.push('armor must be >= 0');
  return out;
}

// Enemies self-register; the canonical kind list to iterate (stats, spawns, …) is derived.
export const enemyRegistry = new Registry<EnemyDef>('enemy', { idOf: (d) => d.kind, validate: enemyProblems });
enemyRegistry.registerAll(Object.values(ENEMY_DEFS));
export const ENEMY_KINDS = enemyRegistry.ids() as EnemyKind[];

// Steering radii / cadence for enemy threat behaviour. Raw px (avoids a config<->map
// import cycle; CELL is 40, so these are ~2.4 / ~2.2 cells).
export const STEER = {
  towerAvoidRadius: 96,
  heroAvoidRadius: 88,
  jitterFreq: 0.9,
};

// ── Performance / scalability budgets (large-scale combat) ──────────────────
/** Hive Siege (docs/HIVE-SIEGE.md): the Hive Core is a COMBAT TARGET — enemies converge on
 *  it, form a crust of attack rings, and chew until killed. Geometry + crust tunables. */
export const HIVE = {
  coreRadius: 26, // the Core's body radius — the contact ring sits on its surface
  contactPad: 3, // forgiveness so arrival never oscillates on float noise
  convergeY: 800, // below this (the Final Defense line) every enemy seeks the Core ITSELF
  ringGap: 15, // px between crust rings
  ringCapacity: 13, // contact-ring capacity before arrivals lock onto the next ring out
  ringGrowth: 5, // each ring out holds this many MORE (circumference grows with radius)
  maxRings: 6, // beyond this the crust just packs (capacity, not a wall)
  crustSeparation: 42, // px/s² of neighbor push while sieging — spreads the crust along its arc
  recentWindow: 3, // seconds of integrity loss folded into hud.hiveRecentDamage
} as const;

export const PERF = {
  spatialCell: 64, // grid cell px for proximity queries (~tower-avoid radius)
  maxEnemies: 600, // soft cap on concurrent enemies (spawns skip past this)
  maxParticles: 420, // cosmetic particle budget (oldest dropped past this)
  lodEnemyCount: 220, // beyond this, the renderer drops per-enemy embellishments
  statusFullDetail: 120, // below this enemy count, status FX render at full quality (else reduced)
};

// Cosmetic combat particles (pooled). Counts kept modest to stay within budget.
export const PARTICLE = {
  death: { count: 6, speed: 70, life: 0.5, size: 2.6 },
  shred: { count: 10, speed: 130, life: 0.45, size: 2.2, color: '#fff066' },
  breach: { count: 8, speed: 90, life: 0.5, size: 2.4, color: '#ff5d73' },
  mote: { count: 4, life: 0.7, size: 2.2, color: '#b6e84a' }, // biomass motes drifting up off a kill
  infect: { count: 7, speed: 60, life: 0.55, size: 2.3, color: '#e24dff' }, // spores burst from an infected death (the spread)
  disrupt: { count: 5, speed: 40, life: 0.4, size: 2.0, color: '#9aa6ff' }, // psionic static off an obelisk pulse
  bloom: { count: 8, speed: 80, life: 0.5, size: 2.4, color: '#ffcaa0' }, // vital spores off the Shepherd's pulse
  // ── Per-branch attack signatures (TOWER-BRANCHES.md): each mutated tower sprays its own matter ──
  barb: { count: 5, speed: 150, life: 0.32, size: 1.7, color: '#c8f04a' }, // Hivemind Swarm — flung venom barbs
  spark: { count: 6, speed: 210, life: 0.28, size: 1.5, color: '#bfe9ff' }, // Railspike / Mindrender — electric discharge
  ember: { count: 7, speed: 120, life: 0.5, size: 2.2, color: '#ff8a3c' }, // Necrotic Siege — burning bone shrapnel
  acid: { count: 7, speed: 95, life: 0.6, size: 2.4, color: '#9be84a' }, // Corrosive Cauldron — caustic droplets
  vital: { count: 7, speed: 70, life: 0.7, size: 2.4, color: '#ffb3c8' }, // Symbiotic Heart — warm biomass motes
  spore: { count: 8, speed: 60, life: 0.66, size: 2.3, color: '#b58cff' }, // Brood Spire — drifting brood spores
  gore: { count: 7, speed: 135, life: 0.44, size: 2.4, color: '#d83a4a' }, // Ravager Strain — viscera spray
  // ── Branch APEX signatures (BRANCH-EVOLUTION.md §5): denser/recoloured siblings sprayed at a
  //    branch's high tiers (muzzle + impact). Tier-scaled further by EVO.muzzleGrowth at spray time. ──
  venom: { count: 8, speed: 90, life: 0.62, size: 2.2, color: '#a6f04a' }, // venom-slick caustic mist
  barbstorm: { count: 11, speed: 205, life: 0.4, size: 1.9, color: '#d8ff5a' }, // a shredding barb storm
  railburst: { count: 9, speed: 245, life: 0.3, size: 1.7, color: '#dffbff' }, // electric detonation
  shrapnel: { count: 9, speed: 165, life: 0.55, size: 2.3, color: '#ffcaa0' }, // bone shrapnel burst
  dissolve: { count: 9, speed: 80, life: 0.72, size: 2.6, color: '#b6f060' }, // fungal melt bloom
  pandemic: { count: 11, speed: 95, life: 0.66, size: 2.5, color: '#f06dff' }, // an outbreak spore burst
  vitalcore: { count: 10, speed: 115, life: 0.7, size: 2.6, color: '#ffc6d6' }, // vital-nova motes
  // ── Hero ability cast VFX (docs/HEROES.md) — SHAPES tinted per-ability by HeroAbilityDef.fxColor, so
  //    every ult / kit skill / fork upgrade reads distinctly. No fixed color ⇒ the spawn tint decides. ──
  heroSlash: { count: 8, speed: 240, life: 0.32, size: 2.6 }, // fast sharp shrapnel — Kinetic strikes
  heroBurst: { count: 16, speed: 150, life: 0.5, size: 2.8 }, // a round detonation — AoE nukes
  heroSpray: { count: 12, speed: 120, life: 0.62, size: 2.5 }, // a wide droplet fan — Caustic / pools
  heroMote: { count: 10, speed: 55, life: 0.7, size: 2.2 }, // slow floating motes — Neural control
  heroBloom: { count: 12, speed: 80, life: 0.6, size: 2.6 }, // a soft outward bloom — Vital heal / summon
  heroLance: { count: 14, speed: 300, life: 0.4, size: 2.4 }, // a piercing spear of matter — execute / focus
  // ── Reward-moment spectacle (cosmetic; never affects the pinned sim outcomes) ──
  mutate: { count: 20, speed: 175, life: 0.6, size: 2.9 }, // branch tier purchased — a big burst (tinted by tower color)
  bossfall: { count: 30, speed: 190, life: 0.95, size: 3.6, color: '#ffd24d' }, // a boss detonating into biomass
  celebrate: { count: 22, speed: 150, life: 1.1, size: 3.0, color: '#b6e84a' }, // wave-clear / extraction bloom
};

// Branch sensory ESCALATION (BRANCH-EVOLUTION.md §3a): every branch tier sprays denser, faster
// matter than the last — so a maxed tower's muzzle + impact visibly out-erupt a fresh one, for
// every branch (and every future tower) without per-tower art. Cosmetic ⇒ golden-safe.
export const EVO = {
  muzzleGrowth: 0.22, // + per tier above 1 → particle count & speed scalar (T1 ×1 … T5 ×1.88)
  impactGrowth: 0.18, // + per tier above 1 → impact-burst scalar
} as const;

// Per-wave HP/bounty growth so later waves bite (finite — slice ends at wave 12).
// These are the BASE escalation curve; the universal difficulty framework
// (difficulty.ts) layers global scalars on top of them, leaving these untouched.
export const WAVE_HP_GROWTH = 0.12; // +12% enemy HP per wave index
export const WAVE_BOUNTY_GROWTH = 0.05;

// Auto-start: when the player enables it, the next wave fires automatically after this many
// prep seconds (a visible countdown). Opt-in + off by default, so the golden run — which starts
// waves manually — is byte-identical.
export const AUTO_START_DELAY = 4; // seconds of prep before an auto-start fires the next wave

/** Draft REROLL (docs/CARDS.md §reroll): ONE paid re-deal per draft — a Biomass luxury for a
 *  dead hand, never a second draft. Cost scales gently with wave so late rerolls stay a real
 *  decision against next-prep tower money. Golden-safe: autoplay never rerolls, and the extra
 *  rng draw happens only when a player invokes it. */
export const DRAFT_REROLL = {
  base: 30, // biomass at wave 0…
  perWave: 5, // …plus this per cleared wave
};

/** DRAFT FIT (docs/CARDS.md §fit — Batch G "the grind"): every offer is weighted by how much its
 *  SUBJECT matters to THIS run, so a draft deals cards for the army you actually fight with. Read only
 *  when RunOptions.draftFit is on (the app sets it; the golden path never does ⇒ byte-identical).
 *  Fit is 0..1: tower/hero cards scale with that subject's live damage share, economy cards fade as
 *  banked Biomass piles up, global/hive cards are neutral (1). */
export const DRAFT_FIT = {
  floor: 0.15, // fit of a tower/hero card whose subject deals ~0 % of the run's damage (never 0 — a pivot stays possible)
  shareForFull: 0.4, // a subject dealing ≥ this damage share fits fully (1.0); linear below
  heroPrior: 0.15, // hero damage share assumed before any damage lands (G1 audit: the hero deals 5–25 %)
  favoritePrior: 2, // an EMPTY board counts the favorite as this many towers (it is always deployable)
  economyBankRef: 4, // economy fit = 1 / (1 + banked / (this × the next deploy cost))…
  economyFloor: 0.05, // …never below this
  recentDeals: 2, // a card offered in the last N deals…
  recentMult: 0.35, // …is dealt with this weight multiplier (no same-card carousel)
  ruleMinFit: 0.3, // THE RULE SLOT re-deals only from rule cards at least this relevant (fielded subjects)
  pickBase: 0.03, // ◆PICK score = fit × (relative Power gain + this) — a 0-Power rule/instant card still ranks by fit
  offBuild: 0.35, // the draft card flags "off-build" below this fit
} as const;

/** Which draft features a run gets (docs/CARDS.md §fit / §opening / §splice) — decided ONCE by the app
 *  from the mode + account depth (cards.ts draftFeaturesFor) and threaded as RunOptions. Never in the
 *  tutorial (the lesson is the base flow). */
export const DRAFT_FEATURES = {
  /** OPENING DRAFT: a draft before wave 1 — only where the choice decides the run: Campaign stages
   *  from `fromStage` (the rarity pools open at Campaign 8, so the deal holds real build choices). */
  opening: { modes: ['campaign'] as readonly string[], fromStage: 8 },
  /** SPLICE (Constitution rule 7 gate): unlocks once the account has cleared this Campaign stage —
   *  except on SHARED boards (the Daily), where every player gets the same rules regardless of depth. */
  splice: { fromCleared: 5, sharedBoardModes: ['daily'] as readonly string[] },
} as const;

/** SPLICE (docs/CARDS.md §splice): banked Biomass past the threshold buys an EXTRA gene-card draft
 *  (pick 1 of 3) in the build phase. The price IS the threshold: `costDeploys` × the next deploy cost
 *  (so it tracks the run's economy), × `growth` per splice already bought this run — optional, legible,
 *  and self-limiting. A recorded input (core/replay.ts) — Daily replays reproduce it. */
export const SPLICE = {
  costDeploys: 8,
  growth: 1.8, // GR2 harness (8 h acct, Infinite, 6 seeds): 1.6 → +7.2 waves (5.2 splices/run) · 1.8 → +4.5 (3.7) · 2.0 → +2.8
};
// The opening prep (before any wave) gets a longer window once the player places their first
// tower, so auto-start doesn't rush the initial build-out.
export const AUTO_START_FIRST_DELAY = 8; // seconds granted on the first tower of the opening prep

/** EARLY CALL (docs/EARLY-CALL.md): mid-wave, the player may call the NEXT wave now — the waves
 *  overlap and the skipped wait pays Biomass. A recorded input (Game.callWaveEarly in REPLAY_METHODS);
 *  opt-in per run (RunOptions.earlyCall — never the tutorial or the Arena). Auto Wave never calls
 *  early: it only launches from prep. Every drafted card the called-over wave owed is still dealt
 *  when the field clears (one per wave, back to back). */
export const EARLY_CALL = {
  minElapsed: 3, // seconds into a wave before a call is accepted (a double-tapped Start can't stack waves)
  maxAhead: 2, // waves that may be called ahead of a clear field (2 ⇒ at most three waves overlap)
  clearAllowance: 8, // seconds credited past the wave's last scheduled spawn (the walk its tail still needed)
  maxSkipSeconds: 30, // the credited skip is capped …
  biomassPerSecond: 2, // … and pays this per skipped second × the NEXT wave's bounty multiplier × the run's biomass mult
};

// ── Spawn scheduling (spawndirector.ts) ──────────────────────────────────────
// The Spawn Director owns the MECHANICS of emitting spawns (spacing/timing/pacing),
// decoupled from WHAT spawns (composition: WAVES / AI Director) and from enemy AI
// (movement). These were inline magic numbers in the spawn path; centralizing them
// here (CLAUDE.md: centralize tunables) keeps the scripted/endless queues byte-identical
// (the values equal the former literals) while making cadence a single tunable surface.
export const SPAWN = {
  // Endless (AI-Director-driven) cadence:
  endlessStartOffset: 0.5, // seconds before the first directed group spawns
  endlessIntraGroup: 0.5, // seconds between spawns WITHIN a directed group
  endlessInterGroup: 0.35, // extra offset added between consecutive groups
  // Swarm special-event burst (a mid-wave flood of chaff):
  swarmDelay: 3, // seconds into the wave the burst begins
  swarmSpacing: 0.18, // seconds between burst spawns
  swarmCount: 12, // burst size
  swarmKind: 'runner' as EnemyKind, // archetype the burst floods with
};

// ── Waves (threat-budget scripts) ─────────────────────────────────────────
export interface SpawnGroup {
  kind: EnemyKind;
  count: number; // MAY be fractional (the campaign generator spends a float threat budget) — see spawnCount
  spacing: number; // seconds between spawns in this group
  delay: number; // seconds before the group starts
  elite?: boolean; // promote this group to elites (campaign generator); absent ⇒ false (golden-safe)
}
export type WaveDef = SpawnGroup[];

/** The REAL number of enemies a group emits. `count` may be fractional (float threat budget), but
 *  you can't spawn a fraction of an enemy — so the spawner AND the Incoming preview both round it
 *  through here. Single source of truth ⇒ the UI always represents reality (never a decimal count).
 *  Integer inputs are unchanged (Math.round(n)===n), so the authored WAVES / endless queues stay
 *  byte-identical. */
export function spawnCount(count: number): number {
  return Math.max(0, Math.round(count));
}

// Each wave introduces or combines an archetype with a CLEAR role, telegraphed in
// the prep phase (Toolbar "Incoming"). The escalating mix — speed (rusher), armor
// (tank), air (flyer), tunnelling (burrower) — keeps combat varied and makes the
// towers' differences matter, instead of an undifferentiated runner/brute grind.
export const WAVES: WaveDef[] = [
  // 1 — soft intro: a trickle of Skitterlings.
  [{ kind: 'runner', count: 8, spacing: 0.9, delay: 0.5 }],
  // 2 — a bigger swarm to establish baseline DPS.
  [{ kind: 'runner', count: 12, spacing: 0.75, delay: 0.5 }],
  // 3 — first ARMOR: Carrion Brutes mixed in (rewards focus fire / shred).
  [
    { kind: 'runner', count: 10, spacing: 0.7, delay: 0.4 },
    { kind: 'brute', count: 3, spacing: 1.6, delay: 3.0 },
  ],
  // 4 — first SPEED: Razor Sprinters beeline the line, testing gap coverage.
  [
    { kind: 'rusher', count: 6, spacing: 0.7, delay: 0.5 },
    { kind: 'runner', count: 10, spacing: 0.6, delay: 2.0 },
  ],
  // 5 — first SOAK: Carapace Haulers (heavy armor → leans on Fracture+Corrosion).
  [
    { kind: 'tank', count: 3, spacing: 1.8, delay: 0.6 },
    { kind: 'runner', count: 12, spacing: 0.55, delay: 1.5 },
  ],
  // 6 — first AIR: Spore Drifters float over obstacles, demanding wide coverage.
  [
    { kind: 'flyer', count: 5, spacing: 1.1, delay: 0.5 },
    { kind: 'brute', count: 4, spacing: 1.4, delay: 2.5 },
  ],
  // 7 — speed swarm: overlapping Razor Sprinters + runners.
  [
    { kind: 'rusher', count: 10, spacing: 0.5, delay: 0.4 },
    { kind: 'runner', count: 12, spacing: 0.5, delay: 2.0 },
  ],
  // 8 — first TUNNELLERS: Gut Tunnelers slip through gaps, plus brute weight.
  [
    { kind: 'burrower', count: 5, spacing: 1.1, delay: 0.5 },
    { kind: 'brute', count: 5, spacing: 1.2, delay: 2.5 },
  ],
  // 9 — armor + air pressure together.
  [
    { kind: 'tank', count: 4, spacing: 1.6, delay: 0.5 },
    { kind: 'flyer', count: 6, spacing: 1.0, delay: 2.0 },
    { kind: 'runner', count: 12, spacing: 0.5, delay: 3.5 },
  ],
  // 10 — combined arms: speed + weight + tunnelling.
  [
    { kind: 'rusher', count: 8, spacing: 0.5, delay: 0.4 },
    { kind: 'brute', count: 6, spacing: 1.0, delay: 2.0 },
    { kind: 'burrower', count: 5, spacing: 1.0, delay: 4.0 },
  ],
  // 11 — penetration gauntlet before the boss.
  [
    { kind: 'tank', count: 5, spacing: 1.3, delay: 0.5 },
    { kind: 'rusher', count: 10, spacing: 0.45, delay: 2.0 },
    { kind: 'flyer', count: 6, spacing: 0.9, delay: 4.0 },
  ],
  // 12 — the Brood Tyrant, escorted by a mixed host.
  [
    { kind: 'tyrant', count: 1, spacing: 1, delay: 1.0 },
    { kind: 'brute', count: 8, spacing: 0.9, delay: 2.0 },
    { kind: 'flyer', count: 6, spacing: 0.9, delay: 4.0 },
    { kind: 'runner', count: 14, spacing: 0.45, delay: 6.0 },
  ],
];

export const TOTAL_WAVES = WAVES.length;

// ── Status & reaction ─────────────────────────────────────────────────────
export const STATUS = {
  fractureMaxStacks: 6,
  fractureArmorShred: 2, // armor removed per stack
  fractureDamageTakenPerStack: 0.04, // +4% damage taken per stack
  corrosionDuration: 3.0, // seconds, refreshed on re-apply
  corrosionDps: 7,
  corrosionArmorShred: 4,
  corrosionSlow: 0.25, // -25% speed while corroded
  // Shred reaction (Fracture + Corrosion):
  shredBase: 22,
  shredPerStack: 9,
  shredArmorBreak: 2.5, // seconds of zero armor
  shredFlash: 0.4,
  // Corrosion pools left by Bone Mortar:
  poolDuration: 3.5,
  poolRadiusFactor: 0.85, // pool radius relative to splash radius

  // ── Infection (Viral — Parasite Nest) ──────────────────────────────────────
  // A ramping, armor-IGNORING DoT that spreads from the dying to the living, so it
  // scales with crowd density and wave length. Distinct from Corrosion (fixed
  // pool DoT + slow): Infection grows, persists on the body, and is contagious.
  infectionOnHit: 2, // stacks applied by a parasite on impact
  infectionMaxStacks: 8, // ramp/spread cap per enemy
  infectionRampPerSec: 1, // +stacks/sec while infected (the "ramp")
  infectionDpsPerStack: 2.0, // armor-ignoring DoT per stack per second
  infectionSpreadStacks: 2, // stacks seeded onto neighbours when an infected enemy dies
  infectionSpreadTargets: 3, // how many nearby enemies the plague jumps to on death
  infectionSpreadRadius: 72, // px reach of the death-spread

  // ── Disruption (Neural — Neural Obelisk) ────────────────────────────────────
  // Control + force-multiplier: slows enemies AND marks them Vulnerable (+% damage
  // taken from EVERY source — towers, hero, pools, infection, reactions). Low direct
  // damage by design; its value is amplifying the rest of the build.
  disruptDuration: 1.6, // seconds, refreshed each pulse while in the field
  disruptSlow: 0.35, // -35% speed while disrupted
  disruptVulnerability: 0.25, // +25% damage taken from all sources while disrupted

  // ── Mark (Vital — Marrow Siphon) & Resonance (Resonant — Resonance Coil) ─────
  // Pure REACTION FUEL: capped stacks that combust with the other statuses (reactions.ts). Neither
  // carries a DoT of its own — the payoff IS the reaction. Applied only by the Siphon / Coil (gated
  // content, never fielded by autoplay), so both are 0 on the golden run ⇒ the pinned sim never sees them.
  markMax: 6, // Vital Mark stack cap
  markPerHit: 1, // Mark stacks applied per Marrow Siphon pulse
  resonanceMax: 6, // Resonant stack cap
  resonancePerHit: 1, // Resonance stacks applied per Resonance Coil pulse
};

// ── Reaction matrix (reactions.ts) — co-present statuses combust ──────────────
// Generalizes the original Shred to ALL 15 unordered pairings of the SIX statuses (Fracture,
// Corrosion, Infection, Disruption, Mark, Resonance). Shred keeps the STATUS.shred* numbers
// (unchanged) and stays first in priority. Every reaction beyond Shred needs Infection / Disruption /
// Mark / Resonance to be present — none of which the golden run (needle + mortar + Ravager) ever
// creates — so that run only ever produces Shred, byte-identical. Mark/Resonance reactions in
// particular require the Siphon/Coil, which autoplay never fields.
export const REACTIONS = {
  virulenceBase: 14, // Fracture+Infection: wounds feed the plague (true burst)
  virulencePerStack: 4,
  detonateBase: 30, // Fracture+Disruption: the destabilized shell detonates (burst)
  detonatePerStack: 12,
  putrefyBase: 26, // Corrosion+Infection: acid rot + plague acceleration (true)
  putrefyInfectAdd: 3,
  dissolveBase: 22, // Corrosion+Disruption: armor fully melts (+ a true tick)
  dissolveBreak: 3.0, // seconds of zero armor
  plagueBase: 18, // Infection+Disruption: vulnerable plague blooms + leaps
  plaguePerStack: 5,
  // Vital (Mark) — HARVEST family: render the marked affliction into a burst + Biomass (Vital = economy).
  markBurst: 20, // true-damage burst per Mark reaction
  markBiomass: 8, // Biomass returned to the hive per Mark reaction
  // Resonant (Resonance) — SHATTER family: a burst scaling with the shattered stacking status.
  resoBurst: 16, // base resonant shatter burst
  resoPerStack: 6, // + per stack of the paired stacking status (Fracture / Infection)
  // Mark + Resonance — SYNTHESIS capstone: the two newest castes combine (heavy burst + Biomass windfall).
  synthesisBurst: 40,
  synthesisBiomass: 16,
};

// ── Tower ability kits (Part 2: towers built from reusable ability components) ──
// Each launch tower's attack is expressed as AbilityComponents executed by the shared
// ability executor (game.ts), replacing the per-firing branches. For the launch roster
// the kit is DERIVED from `firing` + stats (so behavior is byte-identical); a new tower
// may instead set `def.abilities` directly and compose blocks freely.
function deriveTowerAbilities(d: TowerDef): AbilityComponent[] {
  if (d.abilities) return d.abilities;
  switch (d.firing) {
    case 'homing':
      return [{ type: 'projectile', behavior: 'homing', damage: d.damage, speed: d.projectileSpeed, range: d.range }];
    case 'splash':
      return [{ type: 'projectile', behavior: 'splash', damage: d.damage, speed: d.projectileSpeed, range: d.range, splash: d.splash }];
    case 'infest':
      return [{ type: 'projectile', behavior: 'parasite', damage: d.damage, speed: d.projectileSpeed, range: d.range }];
    case 'field':
      // Psionic pulse: chip damage + Disruption to everything in range (no reaction —
      // matches the original field pulse). Particle only emits when it catches a target.
      return [{
        type: 'aura', radius: d.range, damage: d.damage,
        status: { kind: 'Disruption', amount: STATUS.disruptDuration }, particle: 'disrupt',
      }];
    case 'support':
      return []; // economy/aura only — no attack
    case 'beam':
      // Beam towers (Resonance Coil / Marrow Siphon): the beam DAMAGE + ramp are driven directly by
      // beamTowerSystem / beamSystem (game.ts), not by an ability component — so the base kit is empty.
      // Star/branch grants (crit/status/aura) still layer on via prog/branch extraAbilities on the pulse.
      return [];
    case 'trap':
      // Trap towers (Blight Sower): planting + detonation are bespoke (game.trapTowerSystem /
      // mineSystem) — the base kit is empty; star/branch extraAbilities fire AT each detonation.
      return [];
    case 'arc':
      // The returning blade (Wyrmwing Glaive): a projectile component with the 'arc' behavior —
      // the arc kinematics (turnaround, per-leg pierce) live in the projectile step (game.ts).
      return [{ type: 'projectile', behavior: 'arc', damage: d.damage, speed: d.projectileSpeed, range: d.range }];
    case 'summon':
      // Summon towers (Drake Roost): incubation is bespoke (game.roostSystem) — the base kit is
      // empty; star/branch grants shape the BROOD (ROOST config), not a cast.
      return [];
  }
}

export const TOWER_ABILITIES: Record<TowerKind, AbilityComponent[]> = Object.fromEntries(
  TOWER_ORDER.map((k) => [k, deriveTowerAbilities(TOWER_DEFS[k])]),
) as Record<TowerKind, AbilityComponent[]>;

// ── Heroes (autonomous battlefield units) ───────────────────────────────────
// Data-driven roster (mirrors TOWER_DEFS). Each hero is a distinct AI profile:
//   • 'dive'    — Ravager: charges the deepest threat, melee + Fracture (Kinetic).
//   • 'guard'   — Shepherd: holds the core, regenerates Integrity + vital pulse (Vital).
//   • 'control' — Overseer: floats to the densest crowd, Disruption field (Neural).
//   • 'siege'   — Vitriol: holds the rear line, bombards the deepest threat with corrosive
//                 shells that leave Corrosion pools (Caustic). The only ranged/area-denial hero.
//   • 'phase'   — Revenant: a BLINK-stalking assassin (Viral). Teleports to the biggest threat
//                 (boss → elite → highest-HP), strikes hard, and injects spreading Infection. The
//                 only single-target boss-deleter + the only Viral hero. (game.ts updatePhaseHero)
//   • 'swoop'   — Cinderwyrm: a FLYING strafer (Caustic) that never lands. Hunts the deepest
//                 threat, strikes on a fly-by, and BANKS THROUGH to the far side before wheeling
//                 back for the next pass — always moving. (game.ts updateSwoopHero)
// The Ravager's numbers are unchanged from the original single-hero build, so the
// base game (and the golden tests) play identically.
export type HeroBehavior = 'dive' | 'guard' | 'control' | 'siege' | 'phase' | 'swoop';

/** How a hero is gated. Absent on a HeroDef ⇒ always available (the launch trio). Data only
 *  (no save import — kept acyclic); state/meta.ts `isHeroUnlocked` evaluates it against a save.
 *  Each hero's gate is a DISTINCT axis: bossSlain (Vitriol) · infiniteDepth (Revenant) ·
 *  molts (Knell — born from the hive's first prestige rebirth).
 *  bossSlain counts DISTINCT chassis (save.bossesSlain is chassis-keyed): every campaign stage
 *  spawns a framework boss, so "any boss ever" is met minutes in — breadth is the real feat. */
export type HeroUnlockReq =
  | { kind: 'bossSlain'; count: number; label: string }
  | { kind: 'infiniteDepth'; wave: number; label: string }
  | { kind: 'molts'; count: number; label: string }
  | { kind: 'megaSlain'; count: number; label: string } // Riptide — the tide rises where leviathans fell
  | { kind: 'lifetimeKills'; count: number; label: string } // Carrion — fed by the mountain of your dead
  | { kind: 'arena'; label: string }; // Chimera — the Arena Pass level-100 crown; NO other path (docs/ARENA.md §6)

// ── Hero ability CINEMATICS (docs/HERO-CINEMATICS.md) — every ability cast plays a procedural
// set-piece PERFORMANCE (the Cinderwyrm's breath is a dragon swooping the lane, the Fovea's
// stare is an eye-beam). Pure DATA here: `actor` names the render-side puppet painter, `motion`
// the shared trajectory the framework computes, `impactDelay` how long the payload takes to
// LAND. The sim honors impactDelay (damage/debuff/pool resolve when the performance strikes —
// game.ts pendingImpacts); everything else about the performance is presentation-only. A cast
// with impactDelay 0 (self flourishes) resolves exactly like the pre-cinematic sim.
/** The procedural puppet a cast manifests — one per hero identity (render/abilityCinematics.ts
 *  owns the painters; config stays render-free — these are just names). */
export type CinematicActor =
  | 'beast' // Ravager — the pouncing apex predator
  | 'bloomheart' // Shepherd — a swelling flower-of-flesh
  | 'psion' // Overseer — concentric neural rings / synapse web
  | 'barrage' // Vitriol — a ballistic salvo of caustic shells
  | 'wraith' // Revenant — a ghostly phase-double
  | 'bellwave' // Knell — the tolling bell + resonance rings
  | 'serpent' // Cinderwyrm — the winged dragon itself
  | 'tide' // Riptide — a cresting wall of brine
  | 'murder' // Carrion — a converging swarm of carrion flies
  | 'gaze'; // Fovea — the vast opening eye + psionic lance
/** The shared trajectory the framework drives the actor along (from caster → impact zone). */
export type CinematicMotion =
  | 'lunge' // short arc from the caster onto the target point
  | 'swoop' // enters from the arena edge, sweeps THROUGH the target, exits beyond
  | 'dive' // folds in from high above, straight down onto the point
  | 'lob' // ballistic arc(s) from the caster to the zone
  | 'rise' // surges up out of the ground beneath the target
  | 'expand' // manifests AT the target and swells to the blast radius
  | 'converge' // a ring collapsing inward onto the point
  | 'beam' // a lance from the caster's stance to the target
  | 'blink' // fades in at the target (phase entry)
  | 'self'; // a flourish at the caster (utility self-casts)
export interface HeroCinematicDef {
  actor: CinematicActor;
  motion: CinematicMotion;
  /** Seconds between cast and the payload LANDING (damage/debuff/pool). 0 ⇒ instant resolve
   *  (self flourishes). Keep within [0, 0.6] — long enough to read, never long enough to feel
   *  unresponsive (enforced by the cinematics registry test). */
  impactDelay: number;
}

export interface HeroAbilityDef {
  name: string;
  blurb: string;
  cooldown: number;
  radius: number;
  damage: number; // AoE damage at the cast point (0 = pure utility)
  fracture: number; // Kinetic stacks applied (Ravager)
  disrupt: number; // Disruption seconds applied (Overseer)
  corrode?: number; // Corrosion seconds applied by the blast (Vitriol); absent/0 ⇒ none
  infect?: number; // Infection stacks applied by the blast (Revenant Plague Rupture); absent/0 ⇒ none
  heal: number; // Nucleus + self heal granted (Shepherd)
  shield?: number; // self-shield absorb pool granted to the caster (Shepherd Bloom); absent/0 ⇒ none
  shieldSeconds?: number; // how long that self-shield lasts (defaults alongside `shield`)
  buffStat?: string; // timed run-wide buff this ult grants (e.g. 'towerDamage'); absent ⇒ none
  buffAmount?: number; // that buff's multiplier (1.2 = +20%); absent/1 ⇒ no buff emitted
  buffSeconds?: number; // how long the run buff lasts (defaults to 5s)
  summonUnit?: string; // friendly unit (MINION_DEFS key) this ult conjures; absent ⇒ none
  summonCount?: number; // how many to summon (absent/0 ⇒ no summon emitted)
  poolRadius?: number; // lingering corrosion pool this ult drops (Vitriol); absent/0 ⇒ no pool
  poolDps?: number; // that pool's damage/sec
  poolSeconds?: number; // how long the pool lasts (defaults to 4s)
  // ── Kit-skill auto-cast (a `skills[]` entry only; ignored on the player-armed ult). ──
  castOn?: 'target' | 'self'; // 'target' = the deepest enemy in range (default); 'self' = the hero (support / self-buff)
  minEnemies?: number; // only auto-cast when ≥ this many enemies are near the aim point (default 1; 0 = always)
  particle?: ParticleKind; // the ability's cast VFX SHAPE — a particle burst spawned at the aim point
  fxColor?: string; // tints that burst — a per-ability hue, so every ability reads distinctly on screen
  cinematic?: HeroCinematicDef; // the cast's set-piece performance + payload landing delay (absent ⇒ instant burst)
}

// ── Hero ability FORKS (HEROES.md §5/★8) — the A/B star choices that UPGRADE the abilities the hero
//    already unlocked (they patch the ult / kit skills; higher stars make the abilities themselves
//    stronger or transformed, not new verbs). ──────────────────────────────────────────────────────
export interface HeroAbilityUpgrade {
  target: 'ult' | 0 | 1; // which ability to upgrade — the ult, or kit skill index 0 / 1
  name?: string; // rename the upgraded ability (e.g. Rend → "Reaving Cleave")
  mulDamage?: number; mulRadius?: number; mulCooldown?: number; // scale numbers (cooldown <1 = faster)
  addFracture?: number; addCorrode?: number; addInfect?: number; addDisrupt?: number; // deepen statuses
  addHeal?: number; addShield?: number;
  mulPoolRadius?: number; mulPoolDps?: number; // scale a pool-dropping ability (Vitriol's Mire)
  /** Scale a buff-granting ability's BONUS (buffAmount 1.3 × mulBuffAmount 1.5 ⇒ 1.45 — the
   *  ×(amount−1) part scales, so a no-buff ability stays ×1). The Knell's amplification lever. */
  mulBuffAmount?: number;
  addBuffSeconds?: number; // lengthen a buff-granting ability's window (no-op without buffStat)
  setMinEnemies?: number; // e.g. an execute fork re-focuses onto one target
  particle?: ParticleKind; fxColor?: string; // the upgraded ability's NEW visual signature (the upgrade reads on screen)
}
export interface HeroForkOption { id: string; name: string; blurb: string; upgrades: HeroAbilityUpgrade[]; }
export interface HeroForkTier { star: number; options: HeroForkOption[]; } // exactly two options (A/B)

export interface HeroDef {
  kind: HeroKind;
  name: string;
  combatClass: CombatClass;
  behavior: HeroBehavior;
  color: string;
  maxHp: number;
  speed: number; // px/sec
  attackRange: number; // 0 = no auto-attack (support/controller)
  attackInterval: number;
  attackDamage: number;
  attackFracture: number;
  attackSplash?: number; // ranged splash radius (Vitriol siege shells); absent/0 ⇒ single-target/melee
  projectileSpeed?: number; // shell travel speed for a ranged hero (Vitriol); absent ⇒ melee/no projectile
  aggroRange: number; // effectively the whole arena — heroes roam freely
  contactRange: number; // enemies this close damage the hero
  respawnTime: number;
  unlock?: HeroUnlockReq; // progression gate; absent ⇒ available from the start (the launch trio)
  // Role pulse — 'guard'/'control' emit a periodic AoE; 'dive' leaves these at 0.
  pulseInterval: number; // seconds between pulses (0 = none)
  pulseRadius: number; // AoE / field radius
  pulseDamage: number; // direct damage per pulse
  pulseDisrupt: number; // Disruption seconds applied per pulse (control)
  nucleusRegen: number; // Integrity/sec restored while alive (guard)
  ability: HeroAbilityDef;
  /** Star-gated ability KIT (HEROES.md): secondary abilities that AUTO-CAST on their own cooldown once
   *  unlocked (HERO_SKILL_STARS — ★3 unlocks skill 0, ★7 unlocks skill 1). Absent ⇒ no kit. The ult
   *  (`ability`) stays the player-armed signature; the kit is the always-on depth on top of it. */
  skills?: HeroAbilityDef[];
  /** Ability FORKS — the A/B star choices (★5, ★8) that UPGRADE the unlocked abilities (HEROES.md).
   *  Absent ⇒ no forks. Resolved per-run by `resolveHeroAbilities` against the hero's stars + picks. */
  forks?: HeroForkTier[];
  /** Hero Shards to unlock this hero from the Collection (absent/0 ⇒ a STARTER, owned from the
   *  start). A locked hero accumulates its shards toward this threshold; claiming spends them and
   *  unlocks it. Meta-only (the sim ignores it) — a data-driven gate, so a new hero is one field. */
  unlockShards?: number;
}

export const HERO_DEFS: Record<HeroKind, HeroDef> = {
  ravager: {
    kind: 'ravager', name: 'Ravager', combatClass: 'Kinetic', behavior: 'dive', color: '#ffd24d',
    maxHp: 230, speed: 115, attackRange: 32, attackInterval: 0.55, attackDamage: 19, attackFracture: 1,
    aggroRange: 1400, contactRange: 26, respawnTime: 8,
    pulseInterval: 0, pulseRadius: 0, pulseDamage: 0, pulseDisrupt: 0, nucleusRegen: 0,
    ability: { name: 'Apex Leap', blurb: 'AoE leap that fractures enemies.', cooldown: 8, radius: 72, damage: 62, fracture: 2, disrupt: 0, heal: 0, particle: 'heroBurst', fxColor: '#ffe066', cinematic: { actor: 'beast', motion: 'lunge', impactDelay: 0.45 } },
    skills: [
      { name: 'Rend', blurb: 'A gap-close strike that bursts Fracture onto the target and everything near it.', cooldown: 5, radius: 56, damage: 36, fracture: 2, disrupt: 0, heal: 0, castOn: 'target', minEnemies: 1, particle: 'heroSlash', fxColor: '#ffb03d', cinematic: { actor: 'beast', motion: 'lunge', impactDelay: 0.3 } },
      { name: 'Cleave Wave', blurb: 'A sweeping cleave — a wide arc that fractures the whole pack.', cooldown: 11, radius: 104, damage: 24, fracture: 1, disrupt: 0, heal: 0, castOn: 'target', minEnemies: 3, particle: 'heroBurst', fxColor: '#ff8a3d', cinematic: { actor: 'beast', motion: 'lunge', impactDelay: 0.35 } },
    ],
    forks: [
      { star: 5, options: [
        { id: 'berserker', name: 'Berserker', blurb: 'Glass-cannon fury — every ability of the kit hits markedly harder.', upgrades: [{ target: 'ult', mulDamage: 1.25, fxColor: '#ff5252' }, { target: 0, mulDamage: 1.3, addFracture: 1, fxColor: '#ff5252' }, { target: 1, mulDamage: 1.2 }] },
        { id: 'juggernaut', name: 'Juggernaut', blurb: 'An unstoppable wall — the strikes widen and shatter more armor.', upgrades: [{ target: 0, mulRadius: 1.4, setMinEnemies: 2, fxColor: '#c9a227' }, { target: 1, mulRadius: 1.3, addFracture: 1, mulCooldown: 0.85 }] },
      ] },
      { star: 8, options: [
        { id: 'reaver', name: 'Reaver', blurb: 'Rend becomes a sweeping AoE cleave — trades single-target punch for reach.', upgrades: [{ target: 0, name: 'Reaving Cleave', mulRadius: 1.9, mulDamage: 0.85, setMinEnemies: 2, particle: 'heroBurst', fxColor: '#ff7a3d' }] },
        { id: 'slayer', name: 'Slayer', blurb: 'Rend becomes a single-target executioner strike — huge focused damage.', upgrades: [{ target: 0, name: "Slayer's Rend", mulDamage: 2.4, mulRadius: 0.5, setMinEnemies: 1, addFracture: 2, particle: 'heroLance', fxColor: '#ff3d3d' }] },
      ] },
    ],
  },
  shepherd: {
    kind: 'shepherd', name: 'Shepherd', combatClass: 'Vital', behavior: 'guard', color: '#ff9f6b',
    unlockShards: 60, // locked: the first Collection unlock (support role, earlier goal)
    // Tanky, slower, NO auto-attack. Guards the Nucleus, mends Integrity, and pulses
    // a short vital wave that chips enemies pressing the line.
    maxHp: 300, speed: 95, attackRange: 0, attackInterval: 0, attackDamage: 0, attackFracture: 0,
    aggroRange: 1400, contactRange: 24, respawnTime: 8,
    pulseInterval: 1.2, pulseRadius: 92, pulseDamage: 8, pulseDisrupt: 0, nucleusRegen: 1.2,
    ability: { name: 'Bloom', blurb: 'A vital bloom: heals + self-shields the Shepherd, sprouts two Vital Wisps, then an AoE burst.', cooldown: 12, radius: 110, damage: 40, fracture: 0, disrupt: 0, heal: 40, shield: 100, shieldSeconds: 6, summonUnit: 'wisp', summonCount: 2, particle: 'heroBloom', fxColor: '#8affc0', cinematic: { actor: 'bloomheart', motion: 'expand', impactDelay: 0.35 } },
    skills: [
      { name: 'Graft', blurb: 'Grafts vital tissue onto itself — a burst heal and a brief self-shield.', cooldown: 8, radius: 0, damage: 0, fracture: 0, disrupt: 0, heal: 30, shield: 60, shieldSeconds: 5, castOn: 'self', minEnemies: 0, particle: 'heroBloom', fxColor: '#7affb0', cinematic: { actor: 'bloomheart', motion: 'self', impactDelay: 0 } },
      { name: 'Flock', blurb: 'Sprouts a flock of Vital Wisps to fight beside it.', cooldown: 16, radius: 0, damage: 0, fracture: 0, disrupt: 0, heal: 0, summonUnit: 'wisp', summonCount: 2, castOn: 'self', minEnemies: 0, particle: 'heroBloom', fxColor: '#b6ff9c', cinematic: { actor: 'bloomheart', motion: 'self', impactDelay: 0 } },
    ],
    forks: [
      { star: 5, options: [
        { id: 'lifewarden', name: 'Lifewarden', blurb: 'Doubles down on protection — heals and shields swell.', upgrades: [{ target: 'ult', addHeal: 25, addShield: 50, fxColor: '#8affe0' }, { target: 0, addHeal: 20, addShield: 45 }] },
        { id: 'warcaller', name: 'Warcaller', blurb: 'Turns the caretaker militant — the bloom detonates far harder.', upgrades: [{ target: 'ult', mulDamage: 1.5, mulRadius: 1.2, fxColor: '#ffd166' }, { target: 0, mulCooldown: 0.7 }] },
      ] },
      { star: 8, options: [
        { id: 'grovemind', name: 'Grovemind', blurb: 'Graft becomes a relentless shield engine.', upgrades: [{ target: 0, name: 'Symbiosis', addShield: 90, addHeal: 15, mulCooldown: 0.7, particle: 'heroBloom', fxColor: '#6affb0' }] },
        { id: 'bloodgrove', name: 'Bloodgrove', blurb: 'Bloom turns crimson — a savage viral detonation.', upgrades: [{ target: 'ult', name: 'Crimson Bloom', mulDamage: 1.9, addInfect: 2, particle: 'heroSpray', fxColor: '#ff6b9c' }] },
      ] },
    ],
  },
  overseer: {
    kind: 'overseer', name: 'Overseer', combatClass: 'Neural', behavior: 'control', color: '#8a93ff',
    unlockShards: 100, // locked: the second Collection unlock (control role, longer goal)
    // Floats to the densest crowd. NO real damage — emits a fast Disruption field
    // (slow + vulnerability) that amplifies the rest of your build.
    maxHp: 200, speed: 108, attackRange: 0, attackInterval: 0, attackDamage: 0, attackFracture: 0,
    aggroRange: 1400, contactRange: 22, respawnTime: 9,
    pulseInterval: 0.6, pulseRadius: 110, pulseDamage: 3, pulseDisrupt: STATUS.disruptDuration, nucleusRegen: 0,
    ability: { name: 'Mass Override', blurb: 'Floods deep Disruption (slow + heavy vulnerability) and overclocks your towers (+20% damage, 5s).', cooldown: 11, radius: 132, damage: 0, fracture: 0, disrupt: 3.0, heal: 0, buffStat: 'towerDamage', buffAmount: 1.2, buffSeconds: 5, particle: 'heroMote', fxColor: '#9aa6ff', cinematic: { actor: 'psion', motion: 'expand', impactDelay: 0.4 } },
    skills: [
      { name: 'Static Field', blurb: 'Projects a psionic field that slows and destabilizes the cluster.', cooldown: 7, radius: 104, damage: 0, fracture: 0, disrupt: 2.5, heal: 0, castOn: 'target', minEnemies: 2, particle: 'heroMote', fxColor: '#8ab4ff', cinematic: { actor: 'psion', motion: 'expand', impactDelay: 0.35 } },
      { name: 'Synaptic Overload', blurb: 'Overloads the pack — a neural blast that damages AND disrupts everything caught.', cooldown: 13, radius: 124, damage: 28, fracture: 0, disrupt: 2, heal: 0, castOn: 'target', minEnemies: 2, particle: 'heroBurst', fxColor: '#6f8cff', cinematic: { actor: 'psion', motion: 'expand', impactDelay: 0.4 } },
    ],
    forks: [
      { star: 5, options: [
        { id: 'dominus', name: 'Dominus', blurb: 'Total control — the fields slow and destabilize far harder.', upgrades: [{ target: 0, addDisrupt: 1.5, mulRadius: 1.3, fxColor: '#a58bff' }, { target: 1, addDisrupt: 1.5 }] },
        { id: 'saboteur', name: 'Saboteur', blurb: 'Weaponized disruption — the neural blast now truly hurts.', upgrades: [{ target: 1, mulDamage: 1.7, fxColor: '#ff6fae' }, { target: 0, mulRadius: 1.2 }] },
      ] },
      { star: 8, options: [
        { id: 'overmind', name: 'Overmind', blurb: 'Static Field becomes a battlefield-wide dominion field.', upgrades: [{ target: 0, name: 'Dominion Field', mulRadius: 1.7, addDisrupt: 2, particle: 'heroMote', fxColor: '#a58bff' }] },
        { id: 'neurostorm', name: 'Neurostorm', blurb: 'Synaptic Overload becomes a devastating neural storm.', upgrades: [{ target: 1, name: 'Neural Storm', mulDamage: 1.9, mulRadius: 1.4, addDisrupt: 1, particle: 'heroBurst', fxColor: '#6f8cff' }] },
      ] },
    ],
  },
  vitriol: {
    // The hive's SIEGE caste (Caustic) — the only ranged / area-denial hero. Holds the rear line
    // and lobs corrosive shells at the deepest threat; each impact splashes, applies Corrosion,
    // and leaves a lingering pool. Progression-gated: bred only after the hive ASSIMILATES the
    // enemy's war-forms — three distinct Framework Boss chassis slain (a single boss kill lands
    // on stage 1's stage boss, so breadth is the feat). Numbers are centralized here (tuning clay).
    kind: 'vitriol', name: 'Vitriol', combatClass: 'Caustic', behavior: 'siege', color: '#b6e13a',
    maxHp: 210, speed: 96, attackRange: 560, attackInterval: 1.5, attackDamage: 30, attackFracture: 0, attackSplash: 62, projectileSpeed: 440,
    aggroRange: 1400, contactRange: 22, respawnTime: 9,
    pulseInterval: 0, pulseRadius: 0, pulseDamage: 0, pulseDisrupt: 0, nucleusRegen: 0,
    unlock: { kind: 'bossSlain', count: 3, label: 'Slay 3 distinct Framework Boss chassis' },
    ability: { name: 'Corrosive Cataclysm', blurb: 'Saturates the target zone: a caustic blast that heavily corrodes everything caught, then a wide acid pool that lingers.', cooldown: 12, radius: 120, damage: 70, fracture: 0, disrupt: 0, corrode: 6, heal: 0, poolRadius: 120, poolDps: 22, poolSeconds: 5, particle: 'heroSpray', fxColor: '#cdea6a', cinematic: { actor: 'barrage', motion: 'lob', impactDelay: 0.55 } },
    skills: [
      { name: 'Acid Barrage', blurb: 'A rapid salvo of corrosive shells — splash damage that douses the target in Corrosion.', cooldown: 6, radius: 84, damage: 30, fracture: 0, disrupt: 0, corrode: 4, heal: 0, castOn: 'target', minEnemies: 1, particle: 'heroSpray', fxColor: '#b6e84a', cinematic: { actor: 'barrage', motion: 'lob', impactDelay: 0.45 } },
      { name: 'Corrosive Mire', blurb: 'Floods the target zone with a wide, lingering acid mire.', cooldown: 13, radius: 0, damage: 0, fracture: 0, disrupt: 0, heal: 0, poolRadius: 104, poolDps: 18, poolSeconds: 5, castOn: 'target', minEnemies: 2, particle: 'heroSpray', fxColor: '#9be84a', cinematic: { actor: 'barrage', motion: 'lob', impactDelay: 0.5 } },
    ],
    forks: [
      { star: 5, options: [
        { id: 'corroder', name: 'Corroder', blurb: 'Deepens the acid — everything it touches rots faster.', upgrades: [{ target: 0, addCorrode: 3, mulDamage: 1.2, fxColor: '#8ae04a' }, { target: 'ult', addCorrode: 3 }] },
        { id: 'bombardier', name: 'Bombardier', blurb: 'Heavier shells — the blasts widen and hit harder.', upgrades: [{ target: 0, mulRadius: 1.4, mulDamage: 1.3, fxColor: '#d6f04a' }, { target: 'ult', mulRadius: 1.2 }] },
      ] },
      { star: 8, options: [
        { id: 'dissolver', name: 'Dissolver', blurb: 'Acid Barrage becomes an armor-melting dissolution salvo.', upgrades: [{ target: 0, name: 'Dissolution Salvo', mulDamage: 1.6, addCorrode: 4, mulRadius: 1.2, particle: 'heroBurst', fxColor: '#c6f04a' }] },
        { id: 'saturator', name: 'Saturator', blurb: 'Corrosive Mire becomes a vast, deadly acid lake.', upgrades: [{ target: 1, name: 'Endless Mire', mulPoolRadius: 1.6, mulPoolDps: 1.5, particle: 'heroSpray', fxColor: '#9be84a' }] },
      ] },
    ],
  },
  revenant: {
    // The hive's WRAITH caste (Viral) — a phase-stalking ASSASSIN, the only single-target boss-deleter.
    // It does not walk: it BLINKS (teleports) to the biggest threat (boss → elite → highest-HP), lands a
    // heavy strike, and injects Infection (ramping armor-ignoring DoT that spreads on death). Uniquely
    // progression-gated — bred only from the ENDLESS deep (reach Infinite Depth 40). Numbers are clay.
    kind: 'revenant', name: 'Revenant', combatClass: 'Viral', behavior: 'phase', color: '#6ff2c4',
    maxHp: 195, speed: 118, attackRange: 46, attackInterval: 0.7, attackDamage: 44, attackFracture: 0,
    aggroRange: 1400, contactRange: 20, respawnTime: 9,
    pulseInterval: 0, pulseRadius: 0, pulseDamage: 0, pulseDisrupt: 0, nucleusRegen: 0,
    unlock: { kind: 'infiniteDepth', wave: 40, label: 'Reach Infinite Depth 40' },
    ability: { name: 'Plague Rupture', blurb: 'Blinks to the target zone and RUPTURES it: a viral detonation that savages everything caught and injects a deep, spreading Infection.', cooldown: 12, radius: 130, damage: 66, fracture: 0, disrupt: 0, infect: 5, heal: 0, particle: 'heroBurst', fxColor: '#c86bff', cinematic: { actor: 'wraith', motion: 'blink', impactDelay: 0.35 } },
    skills: [
      { name: 'Contagion', blurb: 'Lashes the target with a viral spray — injects deep, spreading Infection.', cooldown: 6, radius: 78, damage: 30, fracture: 0, disrupt: 0, infect: 3, heal: 0, castOn: 'target', minEnemies: 1, particle: 'heroSpray', fxColor: '#e24dff', cinematic: { actor: 'wraith', motion: 'lunge', impactDelay: 0.3 } },
      { name: 'Virulent Burst', blurb: 'Ruptures the accumulated plague — a wide viral detonation that savages the pack.', cooldown: 12, radius: 108, damage: 40, fracture: 0, disrupt: 0, infect: 5, heal: 0, castOn: 'target', minEnemies: 2, particle: 'heroBurst', fxColor: '#ff5cc4', cinematic: { actor: 'wraith', motion: 'blink', impactDelay: 0.35 } },
    ],
    forks: [
      { star: 5, options: [
        { id: 'pestilent', name: 'Pestilent', blurb: 'The plague deepens — Infection bites harder and spreads more.', upgrades: [{ target: 0, addInfect: 3, mulDamage: 1.2, fxColor: '#f06dff' }, { target: 1, addInfect: 2 }] },
        { id: 'stalker', name: 'Stalker', blurb: 'The assassin sharpens — single-target strikes for lethal burst.', upgrades: [{ target: 'ult', mulDamage: 1.3, fxColor: '#ff5cc4' }, { target: 0, mulDamage: 1.4, setMinEnemies: 1 }] },
      ] },
      { star: 8, options: [
        { id: 'outbreak', name: 'Outbreak', blurb: 'Virulent Burst becomes a wide, self-sustaining outbreak.', upgrades: [{ target: 1, name: 'Outbreak', mulRadius: 1.6, addInfect: 4, particle: 'heroSpray', fxColor: '#e24dff' }] },
        { id: 'assassin', name: 'Assassin', blurb: 'Contagion becomes a lethal single-target death mark.', upgrades: [{ target: 0, name: 'Death Mark', mulDamage: 2.2, addInfect: 3, mulRadius: 0.6, setMinEnemies: 1, particle: 'heroLance', fxColor: '#c86bff' }] },
      ] },
    ],
  },
  knell: {
    // The hive's TOLLING BELL (Resonant) — the roster's amplification conductor and its sixth
    // class. Floats to the densest fight (the 'control' movement archetype — the conductor goes
    // where the choir is) and tolls damaging resonant shockwaves; its kit rides the timed
    // run-buff bus (grantRunBuff — refresh-not-stack, golden-safe when idle) as its IDENTITY,
    // where the Overseer only carries a buff rider on a disruption chassis. Progression-gated
    // on a THIRD milestone axis: cast from the carapace the hive sheds at its FIRST MOLT —
    // prestige is the game's deepest progression beat and now breeds its own war-form.
    kind: 'knell', name: 'Knell', combatClass: 'Resonant', behavior: 'control', color: '#f2e6c8',
    maxHp: 240, speed: 92, attackRange: 0, attackInterval: 0, attackDamage: 0, attackFracture: 0,
    aggroRange: 1400, contactRange: 24, respawnTime: 9,
    // The toll: real AoE chip (unlike the Overseer's 3-damage field) with only a BRIEF stagger —
    // concussion, not control. Its power is the amp windows, not the debuff.
    pulseInterval: 1.6, pulseRadius: 120, pulseDamage: 14, pulseDisrupt: 0.35, nucleusRegen: 0,
    unlock: { kind: 'molts', count: 1, label: 'Complete your first Molt' },
    ability: { name: 'Sundering Peal', blurb: 'The bell SLAMS: a massive resonant blast that staggers the pack — and for 6s the whole hive answers, every tower striking +30% harder.', cooldown: 13, radius: 140, damage: 60, fracture: 0, disrupt: 1.0, heal: 0, buffStat: 'towerDamage', buffAmount: 1.3, buffSeconds: 6, particle: 'heroBurst', fxColor: '#ffc46b', cinematic: { actor: 'bellwave', motion: 'expand', impactDelay: 0.45 } },
    skills: [
      { name: 'Tolling Strike', blurb: 'A focused toll — resonant damage that briefly staggers everything caught.', cooldown: 7, radius: 100, damage: 30, fracture: 0, disrupt: 0.6, heal: 0, castOn: 'target', minEnemies: 2, particle: 'heroBurst', fxColor: '#f2d49a', cinematic: { actor: 'bellwave', motion: 'expand', impactDelay: 0.3 } },
      { name: 'Battle Hymn', blurb: 'A sustained hum through the hive: towers strike +15% harder for 5s (refreshes, never stacks).', cooldown: 15, radius: 0, damage: 0, fracture: 0, disrupt: 0, heal: 0, buffStat: 'towerDamage', buffAmount: 1.15, buffSeconds: 5, castOn: 'self', minEnemies: 0, particle: 'heroMote', fxColor: '#ffe9b8', cinematic: { actor: 'bellwave', motion: 'self', impactDelay: 0 } },
    ],
    forks: [
      { star: 5, options: [
        { id: 'crescendo', name: 'Crescendo', blurb: 'The amp deepens — the Peal answers half again as loud, for longer.', upgrades: [{ target: 'ult', mulBuffAmount: 1.5, addBuffSeconds: 2, fxColor: '#ffd88a' }, { target: 1, mulBuffAmount: 1.4 }] },
        { id: 'dirge', name: 'Dirge', blurb: 'The toll turns funerary — heavier blasts, longer stagger.', upgrades: [{ target: 'ult', mulDamage: 1.4, addDisrupt: 0.8, fxColor: '#d8c4ff' }, { target: 0, mulDamage: 1.3 }] },
      ] },
      { star: 8, options: [
        { id: 'eternal', name: 'Eternal Hymn', blurb: 'Battle Hymn becomes a near-permanent chorus.', upgrades: [{ target: 1, name: 'Eternal Hymn', mulBuffAmount: 1.35, addBuffSeconds: 4, mulCooldown: 0.75, particle: 'heroMote', fxColor: '#fff3d0' }] },
        { id: 'requiem', name: 'Requiem', blurb: 'Tolling Strike becomes a devastating requiem.', upgrades: [{ target: 0, name: 'Requiem', mulDamage: 1.9, mulRadius: 1.3, addDisrupt: 0.6, particle: 'heroBurst', fxColor: '#ffe0a8' }] },
      ] },
    ],
  },
  wyrm: {
    // The hive's SKY caste (Caustic) — a dragon-like BIOMECH grown from assimilated war-form
    // chassis. The only FLYING hero: it never lands, never retreats — it strikes on a fly-by and
    // BANKS THROUGH to the far side, dousing the strike in Corrosion (WYRM.corrodePerStrike),
    // then wheels back for the next pass. Progression-gated: bred only after the hive assimilates
    // FIVE distinct Framework Boss chassis (the deepest bossSlain feat). Numbers are tuning clay.
    kind: 'wyrm', name: 'Cinderwyrm', combatClass: 'Caustic', behavior: 'swoop', color: '#ff8c3d',
    maxHp: 205, speed: 132, attackRange: 44, attackInterval: 0.8, attackDamage: 34, attackFracture: 0,
    aggroRange: 1400, contactRange: 20, respawnTime: 9,
    pulseInterval: 0, pulseRadius: 0, pulseDamage: 0, pulseDisrupt: 0, nucleusRegen: 0,
    unlock: { kind: 'bossSlain', count: 5, label: 'Slay 5 distinct Framework Boss chassis' },
    ability: { name: 'Pyroclastic Breath', blurb: 'Sweeps low and BREATHES: a pyroclastic blast that corrodes everything caught, leaving a firestorm that burns on.', cooldown: 12, radius: 118, damage: 58, fracture: 0, disrupt: 0, corrode: 5, heal: 0, poolRadius: 110, poolDps: 20, poolSeconds: 4, particle: 'heroSpray', fxColor: '#ffab4a', cinematic: { actor: 'serpent', motion: 'swoop', impactDelay: 0.55 } },
    skills: [
      { name: 'Wing Shear', blurb: 'A razor wing-arc across the pack — kinetic shear that cracks plating.', cooldown: 7, radius: 96, damage: 30, fracture: 1, disrupt: 0, heal: 0, castOn: 'target', minEnemies: 2, particle: 'heroSlash', fxColor: '#ffc46b', cinematic: { actor: 'serpent', motion: 'swoop', impactDelay: 0.4 } },
      { name: 'Skyfall Talon', blurb: 'Folds its wings and DIVES — a talon strike that punches deep and corrodes the wound.', cooldown: 12, radius: 52, damage: 62, fracture: 0, disrupt: 0, corrode: 3, heal: 0, castOn: 'target', minEnemies: 1, particle: 'heroLance', fxColor: '#ff7a3d', cinematic: { actor: 'serpent', motion: 'dive', impactDelay: 0.45 } },
    ],
    forks: [
      { star: 5, options: [
        { id: 'infernal', name: 'Infernal Core', blurb: 'The furnace deepens — the breath burns harder and the firestorm rages hotter.', upgrades: [{ target: 'ult', addCorrode: 3, mulPoolDps: 1.5, fxColor: '#ff6b3d' }, { target: 1, addCorrode: 2, mulDamage: 1.2 }] },
        { id: 'tempest', name: 'Tempest Wing', blurb: 'The wingspan widens — every sweep reaches farther and comes around faster.', upgrades: [{ target: 'ult', mulRadius: 1.25, fxColor: '#ffd27a' }, { target: 0, mulRadius: 1.4, mulCooldown: 0.8 }] },
      ] },
      { star: 8, options: [
        { id: 'pyre', name: 'Pyre Titan', blurb: 'The breath becomes a CATACLYSM — a vast firestorm that swallows the approach.', upgrades: [{ target: 'ult', name: 'Cataclysm Breath', mulDamage: 1.7, mulRadius: 1.3, mulPoolRadius: 1.4, particle: 'heroSpray', fxColor: '#ff5c2e' }] },
        { id: 'talonlord', name: 'Talon Lord', blurb: 'Skyfall Talon becomes an ANNIHILATING dive — a single strike that ends the target.', upgrades: [{ target: 1, name: 'Annihilating Dive', mulDamage: 2.3, addFracture: 2, mulRadius: 0.7, setMinEnemies: 1, particle: 'heroLance', fxColor: '#ffde8a' }] },
      ] },
    ],
  },
  riptide: {
    // The hive's TIDE caste (Kinetic) — the roster's ZONE-CONTROL bruiser, and its only
    // WATER-form: a translucent mass of assimilated brine that flows to the densest pack
    // (the 'control' movement archetype — the riptide forms where the swimmers are), crushes
    // it under a tidal pulse, and floods the ground with UNDERTOW pools that grind the wave
    // down where it stands. Where the Overseer disrupts and the Knell amplifies, the Riptide
    // simply DROWNS: real chassis chip + area denial, no buffs. Progression-gated on the
    // raid axis — condensed from the fluids of fallen leviathans (fell 2 distinct Mega
    // Bosses). Entirely data-driven: control movement + pulse chassis + pool/disrupt ability
    // fields are all established sim verbs (no new game.ts paths). Numbers are tuning clay.
    kind: 'riptide', name: 'Riptide', combatClass: 'Kinetic', behavior: 'control', color: '#4dc3ff',
    maxHp: 260, speed: 100, attackRange: 0, attackInterval: 0, attackDamage: 0, attackFracture: 0,
    aggroRange: 1400, contactRange: 24, respawnTime: 9,
    // The current: a fast tidal surge — real AoE chip with only a BRIEF stagger (drag, not
    // control). Faster cadence + shallower stagger than the Knell's toll; no amp windows.
    pulseInterval: 1.3, pulseRadius: 104, pulseDamage: 11, pulseDisrupt: 0.25, nucleusRegen: 0,
    unlock: { kind: 'megaSlain', count: 2, label: 'Fell 2 distinct Mega Bosses' },
    ability: { name: 'Maelstrom', blurb: 'Drags the pack into a crushing vortex: heavy tidal damage, a deep stagger — and the water STAYS, an undertow pool that drowns everything that lingers.', cooldown: 12, radius: 126, damage: 56, fracture: 0, disrupt: 1.6, heal: 0, poolRadius: 116, poolDps: 16, poolSeconds: 5, particle: 'heroBurst', fxColor: '#6fd8ff', cinematic: { actor: 'tide', motion: 'expand', impactDelay: 0.5 } },
    skills: [
      { name: 'Undertow', blurb: 'Floods the target zone — a dragging undertow pool that staggers on impact and grinds whatever stands in it.', cooldown: 8, radius: 96, damage: 18, fracture: 0, disrupt: 0.8, heal: 0, poolRadius: 100, poolDps: 14, poolSeconds: 5, castOn: 'target', minEnemies: 2, particle: 'heroSpray', fxColor: '#4db8ff', cinematic: { actor: 'tide', motion: 'rise', impactDelay: 0.4 } },
      { name: 'Breaker', blurb: 'The wave BREAKS — a wide crushing slam that staggers the whole pack.', cooldown: 12, radius: 118, damage: 34, fracture: 0, disrupt: 1.0, heal: 0, castOn: 'target', minEnemies: 3, particle: 'heroBurst', fxColor: '#8ae2ff', cinematic: { actor: 'tide', motion: 'rise', impactDelay: 0.4 } },
    ],
    forks: [
      { star: 5, options: [
        { id: 'abyss', name: 'Abyssal Pull', blurb: 'The deep claims more — the undertows drag harder and grind faster.', upgrades: [{ target: 'ult', mulPoolDps: 1.5, addDisrupt: 0.5, fxColor: '#3da2ff' }, { target: 0, mulPoolDps: 1.4, addDisrupt: 0.4 }] },
        { id: 'tsunami', name: 'Tsunami', blurb: 'The wall of water rises — the slams strike far harder and wider.', upgrades: [{ target: 'ult', mulDamage: 1.35, mulRadius: 1.15, fxColor: '#9ae8ff' }, { target: 1, mulDamage: 1.3 }] },
      ] },
      { star: 8, options: [
        { id: 'drowned', name: 'Drowned Garden', blurb: 'Undertow becomes a vast standing sea that the wave must wade through.', upgrades: [{ target: 0, name: 'Drowned Garden', mulPoolRadius: 1.6, mulPoolDps: 1.4, particle: 'heroSpray', fxColor: '#4db8ff' }] },
        { id: 'hammer', name: 'Water Hammer', blurb: 'Breaker becomes a single annihilating column of water.', upgrades: [{ target: 1, name: 'Water Hammer', mulDamage: 2.0, mulRadius: 0.7, addFracture: 2, setMinEnemies: 1, particle: 'heroLance', fxColor: '#bdf0ff' }] },
      ] },
    ],
  },
  carrion: {
    // The hive's CHARNEL caste (Vital) — death turned back into service. The hive does not bury
    // what it kills: enemies that fall near the Carrion RISE as Risen Thralls carrying a fraction
    // of their own bodies (the GRAVEBIND passive — game.raiseFromCorpse, the one new sim verb this
    // hero ships). It drifts to the densest fight (control movement — where the dead accumulate),
    // chips with a carrion-fly pulse, and its kit calls fresh thralls up between harvests. The
    // INVERSE Vital: where the Shepherd tends the living, the Carrion tends the dead.
    // Progression-gated on the corpse ledger itself: 20,000 lifetime kills. Numbers are clay.
    kind: 'carrion', name: 'Carrion', combatClass: 'Vital', behavior: 'control', color: '#7de8a8',
    maxHp: 235, speed: 98, attackRange: 0, attackInterval: 0, attackDamage: 0, attackFracture: 0,
    aggroRange: 1400, contactRange: 24, respawnTime: 9,
    // The flies: a soft charnel pulse — real chip, no stagger (its power is the risen, not the cloud).
    pulseInterval: 1.4, pulseRadius: 100, pulseDamage: 9, pulseDisrupt: 0, nucleusRegen: 0,
    unlock: { kind: 'lifetimeKills', count: 20000, label: 'Slay 20,000 enemies (lifetime)' },
    ability: { name: 'Mass Rebirth', blurb: 'The ground gives back its dead: a necrotic burst savages the pack, and three Risen Thralls claw up to fight for the hive.', cooldown: 13, radius: 120, damage: 40, fracture: 0, disrupt: 0, heal: 0, summonUnit: 'thrall', summonCount: 3, particle: 'heroBloom', fxColor: '#9fe8b0', cinematic: { actor: 'murder', motion: 'converge', impactDelay: 0.45 } },
    skills: [
      { name: 'Grave Call', blurb: 'Calls two Risen Thralls up from the charnel ground to fight beside it.', cooldown: 10, radius: 0, damage: 0, fracture: 0, disrupt: 0, heal: 0, summonUnit: 'thrall', summonCount: 2, castOn: 'self', minEnemies: 0, particle: 'heroBloom', fxColor: '#8fe8b8', cinematic: { actor: 'murder', motion: 'self', impactDelay: 0 } },
      { name: 'Funerary Feast', blurb: 'The flies descend to feed — a necrotic burst that savages the pack and mends the Carrion with what it takes.', cooldown: 12, radius: 108, damage: 28, fracture: 0, disrupt: 0, heal: 26, castOn: 'target', minEnemies: 2, particle: 'heroSpray', fxColor: '#6fd894', cinematic: { actor: 'murder', motion: 'converge', impactDelay: 0.4 } },
    ],
    forks: [
      { star: 5, options: [
        { id: 'gravelord', name: 'Gravelord', blurb: 'The rebirth deepens — the necrotic burst savages far harder and feeds the master.', upgrades: [{ target: 'ult', mulDamage: 1.4, addHeal: 20, fxColor: '#5ee89a' }, { target: 1, mulDamage: 1.3 }] },
        { id: 'procession', name: 'Procession', blurb: 'The dead answer faster — the calls come around far sooner.', upgrades: [{ target: 0, mulCooldown: 0.7, fxColor: '#b8ffd2' }, { target: 'ult', mulCooldown: 0.85 }] },
      ] },
      { star: 8, options: [
        { id: 'eternal', name: 'Eternal Procession', blurb: 'Grave Call becomes an unending cortege.', upgrades: [{ target: 0, name: 'Eternal Procession', mulCooldown: 0.6, particle: 'heroBloom', fxColor: '#b8ffd2' }] },
        { id: 'charnel', name: 'Charnel Feast', blurb: 'Funerary Feast becomes a devouring — the flies strip everything they touch.', upgrades: [{ target: 1, name: 'Charnel Feast', mulDamage: 1.9, addHeal: 28, mulRadius: 1.25, particle: 'heroSpray', fxColor: '#4fd884' }] },
      ] },
    ],
  },
  fovea: {
    // The hive's EYE caste (Neural) — the rear-line EXECUTIONER lance. A living oculus that
    // holds behind the towers (the 'siege' movement archetype, the Vitriol's brain) and projects
    // psionic lances across most of the field — slow, colossal single strikes with no splash:
    // the anti-elite answer the Ravager dives for and the Vitriol's pools can't burst. Its
    // identity rides the shared elite-hunter verbs (+damage vs elites, elite kills feed it —
    // zero new sim code). Shard-claimed: the third Collection unlock (the deep shard sink).
    kind: 'fovea', name: 'Fovea', combatClass: 'Neural', behavior: 'siege', color: '#c4b5ff',
    unlockShards: 160, // locked: the third Shard unlock — the deepest Collection goal
    // attackSplash is the shell path's IMPACT radius (fireSiegeShell routes 'splash') — 16 is a
    // pinpoint entry wound, execution-grade, nothing like the Vitriol's 62px bombardment.
    maxHp: 190, speed: 94, attackRange: 640, attackInterval: 2.4, attackDamage: 95, attackFracture: 0, attackSplash: 16, projectileSpeed: 720,
    aggroRange: 1400, contactRange: 20, respawnTime: 10,
    pulseInterval: 0, pulseRadius: 0, pulseDamage: 0, pulseDisrupt: 0, nucleusRegen: 0,
    ability: { name: 'Apex Stare', blurb: 'The eye opens fully: a single annihilating psionic lance that holds the target in the gaze — colossal damage and a deep stagger.', cooldown: 12, radius: 60, damage: 140, fracture: 0, disrupt: 2.0, heal: 0, particle: 'heroLance', fxColor: '#d8ccff', cinematic: { actor: 'gaze', motion: 'beam', impactDelay: 0.5 } },
    skills: [
      { name: 'Pinning Glare', blurb: 'A focused lance that pins the victim mid-stride — heavy damage and a long stagger.', cooldown: 7, radius: 56, damage: 44, fracture: 0, disrupt: 1.4, heal: 0, castOn: 'target', minEnemies: 1, particle: 'heroLance', fxColor: '#c9baff', cinematic: { actor: 'gaze', motion: 'beam', impactDelay: 0.35 } },
      { name: 'Panopticon', blurb: 'The gaze widens to hold the whole pack — a field of pressure that staggers everything seen.', cooldown: 13, radius: 140, damage: 18, fracture: 0, disrupt: 2.0, heal: 0, castOn: 'target', minEnemies: 3, particle: 'heroMote', fxColor: '#b0a0ff', cinematic: { actor: 'gaze', motion: 'expand', impactDelay: 0.45 } },
    ],
    forks: [
      { star: 5, options: [
        { id: 'deadeye', name: 'Deadeye', blurb: 'The focus narrows to a killing point — the lances strike far harder.', upgrades: [{ target: 'ult', mulDamage: 1.35, fxColor: '#efe8ff' }, { target: 0, mulDamage: 1.4 }] },
        { id: 'wardeneye', name: 'Warden Eye', blurb: 'The gaze widens — every look holds more of the field, longer.', upgrades: [{ target: 1, mulRadius: 1.3, addDisrupt: 0.6, fxColor: '#a89aff' }, { target: 'ult', addDisrupt: 0.8 }] },
      ] },
      { star: 8, options: [
        { id: 'terminal', name: 'Terminal Glare', blurb: 'Pinning Glare becomes a sentence — one look, one corpse.', upgrades: [{ target: 0, name: 'Terminal Glare', mulDamage: 2.2, mulRadius: 0.6, setMinEnemies: 1, particle: 'heroLance', fxColor: '#f4efff' }] },
        { id: 'allseeing', name: 'The All-Seeing', blurb: 'Panopticon becomes total surveillance — nothing moves unwatched.', upgrades: [{ target: 1, name: 'The All-Seeing', mulRadius: 1.5, addDisrupt: 1.0, particle: 'heroMote', fxColor: '#c4b5ff' }] },
      ] },
    ],
  },
  chimera: {
    // THE ARENA CHAMPION (docs/ARENA.md §6) — the proving grounds' own spliced amalgam, grown
    // from trophy-tissue of every strain that ever won there. A front-line DUELIST on the dive
    // brain (the Ravager's) whose kit is the arena's tempo in miniature: a colossal opening slam,
    // a self-stitch mid-round, a finishing cleave. Zero new sim verbs — every ability composes
    // the existing explosion/heal/status primitives. ARENA EXCLUSIVE: unlock.kind 'arena' —
    // meta.grantArenaExclusive (the Pass level-100 crown) is the ONLY path; no shards ever drop.
    kind: 'chimera', name: 'Chimera', combatClass: 'Viral', behavior: 'dive', color: '#d24dff',
    unlock: { kind: 'arena', label: 'Arena Pass — the season crown (Level 100)' },
    maxHp: 300, speed: 128, attackRange: 46, attackInterval: 0.85, attackDamage: 22, attackFracture: 1,
    aggroRange: 1400, contactRange: 26, respawnTime: 9,
    pulseInterval: 0, pulseRadius: 0, pulseDamage: 0, pulseDisrupt: 0, nucleusRegen: 0,
    ability: { name: 'Trophy Slam', blurb: 'The amalgam remembers every arena it has won: a colossal slam that infects everything caught under the landing.', cooldown: 11, radius: 130, damage: 85, fracture: 1, disrupt: 0.6, heal: 0, particle: 'heroBurst', fxColor: '#e88bff', cinematic: { actor: 'beast', motion: 'lunge', impactDelay: 0.4 } },
    skills: [
      { name: 'Splice-Stitch', blurb: 'The grafts close over the wounds — a deep self-mend woven from stolen tissue.', cooldown: 12, radius: 0, damage: 0, fracture: 0, disrupt: 0, heal: 90, castOn: 'self', minEnemies: 0, particle: 'heroBloom', fxColor: '#8bffc9', cinematic: { actor: 'beast', motion: 'self', impactDelay: 0 } },
      { name: 'Victor\'s Cleave', blurb: 'The finishing sweep — a wide infected cleave through everything in reach.', cooldown: 8, radius: 96, damage: 40, fracture: 1, disrupt: 0, heal: 0, castOn: 'target', minEnemies: 2, particle: 'heroSlash', fxColor: '#d24dff', cinematic: { actor: 'beast', motion: 'swoop', impactDelay: 0.3 } },
    ],
    forks: [
      { star: 5, options: [
        { id: 'apexgraft', name: 'Apex Graft', blurb: 'The slam grows heavier with every trophy — colossal damage.', upgrades: [{ target: 'ult', mulDamage: 1.4, fxColor: '#f2c9ff' }] },
        { id: 'regenerant', name: 'Regenerant Weave', blurb: 'The stitch deepens and quickens — the duelist refuses to fall.', upgrades: [{ target: 0, addHeal: 45, mulCooldown: 0.85, fxColor: '#a8ffd8' }] },
      ] },
      { star: 8, options: [
        { id: 'pandemic', name: 'Pandemic Slam', blurb: 'Trophy Slam becomes an outbreak — wider, and the infection runs hotter.', upgrades: [{ target: 'ult', name: 'Pandemic Slam', mulRadius: 1.35, addFracture: 1, fxColor: '#ff8bf2' }] },
        { id: 'executioner', name: 'Executioner\'s Cleave', blurb: 'The cleave narrows into a beheading arc — fewer caught, none survive.', upgrades: [{ target: 1, name: 'Executioner\'s Cleave', mulDamage: 1.9, mulRadius: 0.7, fxColor: '#ff4dd2' }] },
      ] },
    ],
  },
  myceliarch: {
    // The hive's IMMUNE caste (Viral) — the GATEKEEPER (docs/HEROES.md §myceliarch). A fungal warden
    // rooted at the Core on the 'guard' brain (the Shepherd's movement): it does not hunt — whatever
    // breaches the defense zone walks into its spore-rot. Where the Shepherd TENDS the line, the
    // Myceliarch KILLS at it: a real damaging pulse with a sticky stagger, a self-cast Sporefall
    // that seeds deep Infection in everything at the gate, and the Revenant's viralVuln passive so
    // the rot it plants softens the crowd for the whole board. Zero new sim verbs (guard brain +
    // explosion/heal/shield/status primitives). Progression-gated on the corpse ledger: the mycelium
    // grows from the hive's dead — 8,000 lifetime kills (a MILESTONE, not a Shard claim, so it never
    // joins heroShardUnlockPool and a fresh account's hero-Shard drops are unchanged).
    kind: 'myceliarch', name: 'Myceliarch', combatClass: 'Viral', behavior: 'guard', color: '#e0b070',
    unlock: { kind: 'lifetimeKills', count: 8000, label: 'Slay 8,000 enemies (lifetime)' },
    // No auto-attack (the guard brain never swings) — the PULSE is the weapon: ~12 dmg every 1.1 s
    // to everything within 104 px, plus a 0.35 s spore-stagger. Tankier and slower than the Shepherd.
    maxHp: 360, speed: 82, attackRange: 0, attackInterval: 0, attackDamage: 0, attackFracture: 0,
    aggroRange: 1400, contactRange: 26, respawnTime: 9,
    pulseInterval: 1.1, pulseRadius: 104, pulseDamage: 12, pulseDisrupt: 0.35, nucleusRegen: 0.6,
    ability: { name: 'Sporefall', blurb: 'A spore-burst erupts where the warden aims — heavy damage and deep Infection in everything caught, and the Hive drinks the rot to mend.', cooldown: 12, radius: 140, damage: 46, fracture: 0, disrupt: 0, infect: 3, heal: 20, particle: 'heroBloom', fxColor: '#e0b070', cinematic: { actor: 'bloomheart', motion: 'expand', impactDelay: 0.35 } },
    skills: [
      { name: 'Mycelial Mantle', blurb: 'Hyphae knit over the warden — a self-shield, and a rot-burst that infects everything pressing it.', cooldown: 9, radius: 90, damage: 18, fracture: 0, disrupt: 0, infect: 2, heal: 0, shield: 70, shieldSeconds: 5, castOn: 'self', minEnemies: 1, particle: 'heroSpray', fxColor: '#c8e06a', cinematic: { actor: 'bloomheart', motion: 'self', impactDelay: 0.2 } },
      { name: 'Fruiting Body', blurb: 'A fungal eruption bursts up under the deepest intruder — heavy damage and a deep Infection seed.', cooldown: 10, radius: 80, damage: 40, fracture: 0, disrupt: 0, infect: 4, heal: 0, castOn: 'target', minEnemies: 1, particle: 'heroBurst', fxColor: '#f0c060', cinematic: { actor: 'bloomheart', motion: 'rise', impactDelay: 0.3 } },
    ],
    forks: [
      { star: 5, options: [
        { id: 'bloomwarden', name: 'Bloomwarden', blurb: 'The burst becomes a canopy — wider spore-fall, and the Hive drinks deeper.', upgrades: [{ target: 'ult', mulRadius: 1.35, addHeal: 15, fxColor: '#f2d48a' }, { target: 0, mulRadius: 1.2 }] },
        { id: 'rotwarden', name: 'Rotwarden', blurb: 'The burst turns virulent — harder hits and a deeper plague in every body it touches.', upgrades: [{ target: 'ult', mulDamage: 1.25, addInfect: 2, fxColor: '#b8e04a' }, { target: 1, addInfect: 1 }] },
      ] },
      { star: 8, options: [
        { id: 'hyphalfortress', name: 'Hyphal Fortress', blurb: 'Mycelial Mantle hardens into a living bulwark — a far thicker shield, on a shorter cycle.', upgrades: [{ target: 0, name: 'Hyphal Fortress', addShield: 60, mulRadius: 1.3, mulCooldown: 0.8, particle: 'heroBloom', fxColor: '#d8f08a' }] },
        { id: 'deathcap', name: 'Deathcap', blurb: 'Fruiting Body erupts as a deathcap — a colossal toxic bloom under the deepest intruder.', upgrades: [{ target: 1, name: 'Deathcap', mulDamage: 1.6, addInfect: 2, mulCooldown: 0.85, particle: 'heroSpray', fxColor: '#ff9a5a' }] },
      ] },
    ],
  },
};

export function heroProblems(d: HeroDef): string[] {
  const out: string[] = [];
  if (d.maxHp <= 0) out.push('maxHp must be > 0');
  if (d.speed < 0) out.push('speed must be >= 0');
  if (d.ability.cooldown < 0) out.push('ability cooldown must be >= 0');
  return out;
}

// Heroes self-register; the roster list is derived (no hardcoded order array).
export const heroRegistry = new Registry<HeroDef>('hero', { idOf: (d) => d.kind, validate: heroProblems });
heroRegistry.registerAll(Object.values(HERO_DEFS));
export const HERO_ORDER = heroRegistry.ids() as HeroKind[];

// ── Hero Slot progression (HEROES.md §"Hero slot progression") — you command 1 → 2 → 3 heroes.
// One of the account's biggest long-horizon milestones, gated on CAMPAIGN depth so "the next hero
// slot" is a concrete, visible goal on the world map (not a hidden prestige side-effect). Conditions
// are DATA (evaluated in meta, which owns the save) so they're tunable in one place and the reader +
// UI stay generic; slots unlock strictly in order. Future slots (4+) are a single row. Golden-safe:
// a fresh save has exactly 1 slot ⇒ single-hero runs.
export interface HeroSlotDef {
  slot: number; // 1-based
  name: string; // the milestone's identity
  campaignStage: number; // min highest-cleared Campaign stage required to unlock (0 = from the start)
  hint: string; // player-facing unlock requirement
  blurb: string; // what fielding this slot grants (anticipation copy)
}
// Both extra slots are CAMPAIGN gates — going wide is earned by pushing the campaign, so each slot is
// a headline milestone the player can see coming on the map (HEROES.md design intent).
export const HERO_SLOTS: HeroSlotDef[] = [
  { slot: 1, name: 'Prime Avatar', campaignStage: 0,
    hint: 'Unlocked from the start.', blurb: 'Your first hero — an autonomous living weapon that patrols the line.' },
  { slot: 2, name: 'Twin Avatar', campaignStage: 25,
    hint: 'Clear Campaign Stage 25.', blurb: 'A second hero. Real synergy begins: dive + sustain, or disrupt + execute.' },
  { slot: 3, name: 'Trinity Avatar', campaignStage: 90,
    hint: 'Clear Campaign Stage 90.', blurb: 'A third hero. The full damage / sustain / control trinity across parallel lanes.' },
];
export const MAX_HERO_SLOTS = HERO_SLOTS.length;

// ── Hero ability kits (Part 2: heroes built from reusable ability components) ──
// The role pulse (guard/control) and the signature ability are AbilityComponents run
// by the shared executor — derived from the HeroDef fields so behavior is unchanged.
function heroPulseAbility(d: HeroDef): AuraAbility | null {
  if (d.pulseInterval <= 0) return null;
  return {
    type: 'aura',
    radius: d.pulseRadius,
    damage: d.pulseDamage > 0 ? d.pulseDamage : undefined,
    status: d.pulseDisrupt > 0 ? { kind: 'Disruption', amount: d.pulseDisrupt } : undefined,
    react: true,
    particle: d.behavior === 'control' ? 'disrupt' : 'bloom',
  };
}
function heroAbilityComponents(ab: HeroAbilityDef): AbilityComponent[] {
  const out: AbilityComponent[] = [];
  if (ab.heal > 0) out.push({ type: 'heal', nucleus: ab.heal, self: ab.heal });
  if ((ab.shield ?? 0) > 0) out.push({ type: 'shield', amount: ab.shield as number, seconds: ab.shieldSeconds ?? 6 });
  if (ab.damage > 0) {
    const status = ab.fracture > 0
      ? { kind: 'Fracture' as const, amount: ab.fracture }
      : (ab.corrode ?? 0) > 0
        ? { kind: 'Corrosion' as const, amount: ab.corrode as number }
        : (ab.infect ?? 0) > 0
          ? { kind: 'Infection' as const, amount: ab.infect as number }
          : undefined;
    out.push({ type: 'explosion', radius: ab.radius, damage: ab.damage, status, react: true });
    // A kit SKILL can damage AND disrupt (e.g. Overseer's Synaptic Overload). No shipped ULT sets both
    // (each is damage-only or disrupt-only), so HERO_ULT stays byte-identical — this only adds skill effects.
    if (ab.disrupt > 0) out.push({ type: 'debuff', radius: ab.radius, status: { kind: 'Disruption', amount: ab.disrupt } });
  } else if (ab.disrupt > 0) {
    // Pure control ult (Overseer Mass Override): flood Disruption, no damage/reaction.
    out.push({ type: 'debuff', radius: ab.radius, status: { kind: 'Disruption', amount: ab.disrupt } });
  }
  // Timed run-wide buff (e.g. Overseer Mass Override empowering your towers).
  if (ab.buffStat && ab.buffAmount && ab.buffAmount !== 1) {
    out.push({ type: 'buff', stat: ab.buffStat, amount: ab.buffAmount, seconds: ab.buffSeconds ?? 5 });
  }
  // Summon friendly units (e.g. Shepherd Bloom sprouting Vital Wisps).
  const summonCount = ab.summonCount ?? 0;
  if (ab.summonUnit && summonCount > 0) {
    out.push({ type: 'summon', unit: ab.summonUnit, count: summonCount });
  }
  // Drop a lingering corrosion pool (e.g. Vitriol's Corrosive Cataclysm).
  if ((ab.poolRadius ?? 0) > 0 && (ab.poolDps ?? 0) > 0) {
    out.push({ type: 'pool', radius: ab.poolRadius as number, dps: ab.poolDps as number, seconds: ab.poolSeconds ?? 4 });
  }
  return out;
}

export const HERO_PULSE: Record<HeroKind, AuraAbility | null> = Object.fromEntries(
  HERO_ORDER.map((k) => [k, heroPulseAbility(HERO_DEFS[k])]),
) as Record<HeroKind, AuraAbility | null>;
export const HERO_ULT: Record<HeroKind, AbilityComponent[]> = Object.fromEntries(
  HERO_ORDER.map((k) => [k, heroAbilityComponents(HERO_DEFS[k].ability)]),
) as Record<HeroKind, AbilityComponent[]>;

// ── Hero ability KIT (HEROES.md) — the star-gated auto-cast skills layered on top of the ult. ──
// HERO_SKILL_DEFS drives cooldowns + the HUD; HERO_SKILLS is the compiled effect payload (reuses the
// ult builder). Star thresholds unlock them one at a time; a fresh account (0 stars, the golden run)
// has NONE, so autoplay never casts a skill ⇒ the pinned sim is byte-identical.
export const HERO_SKILL_DEFS: Record<HeroKind, HeroAbilityDef[]> = Object.fromEntries(
  HERO_ORDER.map((k) => [k, HERO_DEFS[k].skills ?? []]),
) as Record<HeroKind, HeroAbilityDef[]>;
export const HERO_SKILLS: Record<HeroKind, AbilityComponent[][]> = Object.fromEntries(
  HERO_ORDER.map((k) => [k, (HERO_DEFS[k].skills ?? []).map(heroAbilityComponents)]),
) as Record<HeroKind, AbilityComponent[][]>;
export const HERO_SKILL_STARS = [3, 7] as const; // skill 0 unlocks at ★3, skill 1 at ★7
/** How many kit skills a hero with `stars` stars has unlocked (0 on a fresh account). */
export function heroSkillCount(stars: number): number {
  return HERO_SKILL_STARS.filter((s) => stars >= s).length;
}

// ── Hero ability FORKS (HEROES.md §forks) — resolve a hero's EFFECTIVE abilities from its stars + the
//    player's A/B picks. Each unlocked fork tier PATCHES the ult / kit skills (the abilities upgrade
//    in place, not new verbs). 0 stars / no picks ⇒ the base kit, so the golden run is byte-identical. ─
/** Apply one fork upgrade to an ability def, returning a patched COPY (never mutates the base). */
function applyHeroUpgrade(ab: HeroAbilityDef, up: HeroAbilityUpgrade): HeroAbilityDef {
  const out: HeroAbilityDef = { ...ab };
  if (up.name) out.name = up.name;
  if (up.mulDamage) out.damage = Math.round(out.damage * up.mulDamage);
  if (up.mulRadius) out.radius = Math.round(out.radius * up.mulRadius);
  if (up.mulCooldown) out.cooldown = Math.round(out.cooldown * up.mulCooldown * 10) / 10;
  if (up.addFracture) out.fracture = out.fracture + up.addFracture;
  if (up.addDisrupt) out.disrupt = out.disrupt + up.addDisrupt;
  if (up.addCorrode) out.corrode = (out.corrode ?? 0) + up.addCorrode;
  if (up.addInfect) out.infect = (out.infect ?? 0) + up.addInfect;
  if (up.addHeal) out.heal = out.heal + up.addHeal;
  if (up.addShield) out.shield = (out.shield ?? 0) + up.addShield;
  if (up.mulPoolRadius && out.poolRadius) out.poolRadius = Math.round(out.poolRadius * up.mulPoolRadius);
  if (up.mulPoolDps && out.poolDps) out.poolDps = Math.round(out.poolDps * up.mulPoolDps);
  if (up.mulBuffAmount && out.buffAmount) out.buffAmount = Math.round((1 + (out.buffAmount - 1) * up.mulBuffAmount) * 100) / 100;
  if (up.addBuffSeconds && out.buffStat) out.buffSeconds = (out.buffSeconds ?? 5) + up.addBuffSeconds;
  if (up.setMinEnemies !== undefined) out.minEnemies = up.setMinEnemies;
  if (up.particle) out.particle = up.particle;
  if (up.fxColor) out.fxColor = up.fxColor;
  return out;
}
/** The fork option chosen for a tier (`picks` maps star→optionId); defaults to the FIRST option (A). */
export function heroForkOption(tier: HeroForkTier, picks: Record<string, string>): HeroForkOption {
  return tier.options.find((o) => o.id === picks[String(tier.star)]) ?? tier.options[0];
}
export interface ResolvedHeroKit {
  ult: HeroAbilityDef; ultComps: AbilityComponent[];
  skills: HeroAbilityDef[]; skillComps: AbilityComponent[][];
}
/** A hero's EFFECTIVE abilities: the base defs with every UNLOCKED fork tier's chosen upgrades applied,
 *  compiled to components. `stars` < the first fork star ⇒ the base kit unchanged (golden-safe). */
export function resolveHeroKit(kind: HeroKind, stars: number, picks: Record<string, string> = {}): ResolvedHeroKit {
  const def = HERO_DEFS[kind];
  let ult = def.ability;
  const skills = (def.skills ?? []).map((s) => ({ ...s }));
  for (const tier of def.forks ?? []) {
    if (stars < tier.star) continue; // fork tier not yet reached
    for (const up of heroForkOption(tier, picks).upgrades) {
      if (up.target === 'ult') ult = applyHeroUpgrade(ult, up);
      else if (skills[up.target]) skills[up.target] = applyHeroUpgrade(skills[up.target], up);
    }
  }
  return { ult, ultComps: heroAbilityComponents(ult), skills, skillComps: skills.map(heroAbilityComponents) };
}
/** The fork tiers a hero with `stars` has REACHED (for UI + selection). */
export function heroForkTiers(kind: HeroKind, stars: number): HeroForkTier[] {
  return (HERO_DEFS[kind].forks ?? []).filter((t) => stars >= t.star);
}

// In-run Biomass unlock for PRIMARY-hero AUTO-CAST (docs/HEROES.md): the fielded champions in
// slots 2+ already auto-fire their signature ability; buying this lets the primary hero do the
// same (then a free toggle). Off by default ⇒ the golden run never auto-casts. One-time purchase.
export const HERO_AUTOCAST = { cost: 220 } as const;

/** HIVE INTELLIGENCE (docs/HIVE-MIND.md) — the in-run best-upgrade executive's one tunable
 *  table. Scoring is exact power-per-cost where power exists; these knobs cover the honest
 *  heuristics (deployment strength, QoL) and the context layer. Golden-safe: nothing reads
 *  these outside a player-triggered pulse. */
export const HIVE_MIND = {
  reserveFrac: 0.1, // a pulse never spends below this fraction of current Biomass…
  reserveMin: 0, // …or below this absolute floor (0 = fraction only)
  maxActionsPerPulse: 12, // hard cap per button press (multi-buy, never a runaway loop)
  sparseBoardCount: 6, // fewer towers than this ⇒ deployments/merges get priority
  sparseDeployMult: 1.6, // …by this much ("guns first")
  bossPrepMult: 1.15, // heavy wave incoming ⇒ every strength buy matters more
  heavyHpThreshold: 320, // a previewed enemy at/above this authored HP counts as "heavy"
  deployGainScale: 0.012, // authored dps → power-comparable gain units
  supportDeployGain: 7, // no-damage organisms (auras/economy): flat pre-scale weight
  autocastGain: 0.04, // the auto-cast unlock's QoL gain (≈ a cheap branch tier)
  monoculturePenalty: 40, // slot-score penalty for stacking a kind beside itself (px units)
  adjacencyPx: 90, // lattice-neighbor radius (matches the reactor's overcharge geometry)
  minValue: 1e-6, // actions below this value are noise — never bought
  // ── The OPENING (docs/HIVE-MIND.md §opening — Batch G): G1's live S29 replay pressed the glowing
  //    button at run start and watched ~90 % of the opening Biomass go into Hero Evolution — 1 tower at
  //    wave 1, run lost at wave 3. A THIN board now holds hero purchases so Biomass saves for towers. ──
  thinBoardTowers: 6, // fewer towers than this (capped at the open slots) ⇒ the board is THIN…
  thinHoldProviders: ['heroEvo', 'autocast'] as readonly string[], // …and these purchases wait…
  thinHoldMult: 0, // …at this value multiplier (0 ⇒ below minValue ⇒ never bought, never glows)
  flierCoreBias: 1, // next wave previews FLIERS ⇒ combat organisms rank slots by nearness to the Nucleus (0 = off)
} as const;

// Revenant blink (behavior 'phase'): seconds the teleport streak/after-image lingers. The sim sets
// Hero.phaseT to this on each blink-strike + decays it; the renderer normalizes alpha by the same
// value. Purely cosmetic (render-only fields) ⇒ never perturbs the pinned sim.
export const HERO_PHASE_FLASH = 0.3;

// Revenant tunables (docs/HEROES.md). `infectPerStrike` = Infection stacks each blink-strike injects
// (its Plague Strike identity — a deep, spreading DoT on the assassinated target). Centralized clay.
export const REVENANT = { infectPerStrike: 3 } as const;

// Cinderwyrm tunables (behavior 'swoop' — docs/HEROES.md). Each fly-by strike douses the victim in
// `corrodePerStrike` seconds of Corrosion (its ember identity); after a strike the wyrm BANKS
// `bankDist` px past the target before wheeling back — the strafing pass that keeps it airborne.
export const WYRM = { corrodePerStrike: 2, bankDist: 120 } as const;

// Hero Symbiote engine tunables (docs/HERO-SYMBIOTES.md) — the kit-agnostic timings every echo/
// carapace organ shares (per-organ magnitudes live in core/heroSymbiote.ts's catalog).
export const SYMBIOTE = {
  echoDelay: 0.45, // seconds between the signature cast and its symbiote echo
  shieldSeconds: 4, // how long an overheal carapace pool persists before it lapses
} as const;

// ── Summoned friendly units (the `summon` ability primitive) ────────────────
// Data for each conjurable unit; the SummonAbility references one by id. A new unit is one
// entry here — no sim code. Minions are time-limited attackers (see types.ts Minion).
export interface MinionDef {
  id: string;
  name: string;
  hp: number; // health — enemies in contact chew through it (body-block)
  damage: number; // per attack
  attackInterval: number; // seconds between attacks
  range: number; // seek radius — the nearest enemy within it is the target
  speed: number; // px/sec
  life: number; // seconds it persists before expiring
  radius: number; // body radius (render + attack reach)
  color: string;
  /** HERO-AI brain (docs/TOWERS.md §roost): the unit fights like a hero, not a mote — deepest-
   *  threat targeting (elites first), a rally leash around its home point, retreat-to-perch when
   *  wounded + perch regen, then back in. Absent ⇒ the classic seek-nearest mote (golden-safe). */
  heroAI?: boolean;
  /** Perch regen (hp/sec) while a wounded hero-AI unit recovers at its home point. */
  perchRegen?: number;
  /** Visual archetype: 'drake' units render as winged biomechs (tier read from `tier`). */
  art?: 'drake';
  /** Visual + power tier (1..3) — drives the drake silhouette's size/wings/horns evolution. */
  tier?: number;
}
export const MINION_DEFS: Record<string, MinionDef> = {
  wisp: { id: 'wisp', name: 'Vital Wisp', hp: 30, damage: 7, attackInterval: 0.7, range: 300, speed: 130, life: 5, radius: 7, color: '#ffd0a6' },
  // STRAIN organisms (docs/STRAIN.md): the Flesh Reactor's harvester + the Parasite Nest's brood.
  harvester: { id: 'harvester', name: 'Harvester Polyp', hp: 55, damage: 5, attackInterval: 1.1, range: 220, speed: 90, life: 9, radius: 8, color: '#ffb35d' },
  broodling: { id: 'broodling', name: 'Broodling', hp: 22, damage: 6, attackInterval: 0.6, range: 160, speed: 150, life: 6, radius: 6, color: '#e24dff' },
  // ── The Drake Roost's brood ladder (docs/TOWERS.md §roost) — upgrades improve the UNITS, both
  //    functionally (hp/dmg) and visually (radius/color/tier art). `life` is effectively wave-long
  //    (all minions clear at wave end); the roost re-incubates each wave. `range` here is the
  //    unit's ATTACK acquisition reach — the roost's own range is the brood leash. ──
  // The Carrion's risen dead (docs/HEROES.md §carrion): base stats are the FLOOR — a corpse
  // raised by Gravebind rises with a fraction of ITS OWN body (game.raiseFromCorpse), so a
  // fallen brute stands back up as a wall and a mite as a spark. Ability summons use the base.
  thrall: { id: 'thrall', name: 'Risen Thrall', hp: 36, damage: 8, attackInterval: 0.8, range: 260, speed: 105, life: 9, radius: 8, color: '#9fe8b0' },
  drakeling: { id: 'drakeling', name: 'Drakeling', hp: 70, damage: 11, attackInterval: 0.65, range: 340, speed: 150, life: 999, radius: 8, color: '#ffc46b', heroAI: true, perchRegen: 14, art: 'drake', tier: 1 },
  drake: { id: 'drake', name: 'Ember Drake', hp: 150, damage: 24, attackInterval: 0.7, range: 360, speed: 145, life: 999, radius: 11, color: '#ff9e4a', heroAI: true, perchRegen: 26, art: 'drake', tier: 2 },
  wyrmspawn: { id: 'wyrmspawn', name: 'Wyrmspawn', hp: 320, damage: 50, attackInterval: 0.8, range: 380, speed: 140, life: 999, radius: 15, color: '#ff7a3d', heroAI: true, perchRegen: 45, art: 'drake', tier: 3 },
  // ── The Gristle Warren's musters (docs/TOWERS.md §answers) — BLOCKERS, not hunters: slow, thick
  //    bodies whose job is to stand in the lane (minionBlock stalls every ground enemy touching them)
  //    while the board works. Fliers and burrowers ignore them by the standing body-block rule. The
  //    ladder is unit CHOICE (stars/branches summon a different id), never a per-unit code path. ──
  gristle: { id: 'gristle', name: 'Gristle Thrall', hp: 150, damage: 6, attackInterval: 0.9, range: 230, speed: 72, life: 13, radius: 10, color: '#f2a07b' },
  gristlehulk: { id: 'gristlehulk', name: 'Sinew Hulk', hp: 360, damage: 11, attackInterval: 1.1, range: 230, speed: 58, life: 15, radius: 13, color: '#e0775a' },
  gristling: { id: 'gristling', name: 'Gristleling', hp: 60, damage: 5, attackInterval: 0.6, range: 250, speed: 110, life: 9, radius: 7, color: '#ffbfa3' },
};
export const MINION_CAP = 16; // global cap on live minions (perf + visual bound)

/** GRAVEBIND (docs/HEROES.md §carrion) — the Carrion's corpse-raising, centralized. Enemies that
 *  die within `radius` of a fielded gravebind hero RISE as Risen Thralls carrying a fraction of
 *  their own body (floored at the thrall MinionDef). Cadence + a personal thrall cap keep swarms
 *  from chain-exploding the minion pool; bosses stay down (their corpse is a trophy, not a tool).
 *  Golden-safe: the death-seam hook early-outs unless a gravebind hero is fielded. */
export const GRAVEBIND = {
  radius: 240, // corpses within this reach of the Carrion answer it
  hpFrac: 0.4, // thrall hp = max(floor, corpse maxHp × this) — the body rises diminished
  dmgFrac: 0.5, // thrall damage = max(floor, corpse damage × this)
  cadenceSec: 1.1, // min seconds between raises (a swarm wipe is not an instant army)
  maxThralls: 5, // the Carrion's own concurrent risen (global MINION_CAP still applies)
};

/** Drake Roost tunables (firing 'summon' — docs/TOWERS.md §roost). The roost keeps `brood` units
 *  fielded (hatching one per fireInterval while below the cap) and its upgrades improve the UNITS:
 *  star + branch 'brood' GRANTS raise the unit TIER (unitByTier ladder) and the brood size — one
 *  mechanism, all data (stars.ts / branches.ts); the wounded retreat at `retreatFrac` and re-engage
 *  at `reengageFrac` (perch regen on the MinionDef, scaled by the kit's regen bonus). All roost
 *  math reads THIS block — the tower def carries only cost/leash/cadence. */
export const ROOST = {
  brood: 2, // base brood size (units kept fielded per roost); 'brood' grants add to it
  unitByTier: ['drakeling', 'drake', 'wyrmspawn'] as const, // unit id per unit-tier 1..3 ('brood' tierBonus grants climb it)
  retreatFrac: 0.3, // a unit below this hp fraction breaks off and flies home
  reengageFrac: 0.85, // …and rejoins the hunt once perch regen restores it past this
} as const;

// ── Economy ───────────────────────────────────────────────────────────────
export const ECON = {
  startingBiomass: 220,
  reactorBiomassPerSec: 6,
  overchargeDamage: 0.35, // +35% damage to adjacent towers
  overchargeRate: 0.25, // +25% fire rate to adjacent towers
  baseIntegrity: 100,
  // Run-end rewards (permanent shards):
  shardsPerWave: 8,
  shardsPerKill: 0.4,
};

// ── Mode reward identity (docs/MODE-IDENTITY.md) ──────────────────────────────────────────────
// Each mode owns a lane so players ALTERNATE instead of farming one forever. Applied as
// multipliers in meta.finishRun on top of the shared formulas. 'stage' (the legacy quick-run,
// golden-pinned) is ×1 across the board, so the characterization tests never move.
export const MODE_REWARDS = {
  // Genome Cores (account currency) — Campaign-primary, biggest on a FIRST clear; Infinite gives a
  // token amount so depth can't be farmed for currency. Boss Rush's wave/kill lane is also a token —
  // its real payout is RUSH.corePerBoss (bosses defeated), so the mode rewards boss-slaying, not depth.
  // Daily's core/loot/mastery lanes sit AT-OR-BELOW campaign here (a modest base) — the mode's
  // real payout is a Phase-2 spore/cache lane keyed to the shared-seed clear, not these formulas.
  core: { campaignFirst: 1.0, campaignReplay: 0.3, endless: 0.2, stage: 1.0, bossRush: 0.25, daily: 0.3 },
  // Loot points (Loot Box Meter → Tower/Hero Shards) — Infinite is the farm; Campaign a trickle;
  // Boss Rush's base lane sits between (its per-boss bonus is the scaling lane).
  loot: { campaign: 0.35, endless: 1.0, stage: 1.0, bossRush: 0.5, daily: 0.35 },
  // Mastery XP (from use) — Infinite earns an endurance bonus, cementing it as the mastery venue.
  // Boss Rush pays a smaller intensity bonus (short runs, dense fights).
  mastery: { campaign: 1.0, endless: 1.35, stage: 1.0, bossRush: 1.2, daily: 1.0 },
};

// Mode unlock gates (docs/MODE-IDENTITY.md §gates): the secondary pillars open as Campaign
// proves the account. Enforced at the META/UI layer only (save/derive.ts helpers) — the sim
// stays ungated so tests, the tutorial, and debug tooling can construct any mode directly.
export const MODE_UNLOCKS = {
  infinite: 3, // Infinite opens after clearing Campaign Stage 3
  daily: 5, // Daily Run opens after clearing Campaign Stage 5 (docs/DAILY-RUN.md §gates)
  bossRush: 12, // Boss Rush opens after clearing Campaign Stage 12 (~1h) — re-paced 2026-11 from 9
  // so the hub reveals one pillar per beat (docs/PROGRESSION-GATING.md §timeline); the stage-10
  // wall still has two farm outlets (Infinite / Daily). Was 9 per the 2026-07 stage-gate review.
};

// Deploy-readiness presentation (docs/PROGRESSION-LOOP.md §readiness). The recommendation is a
// guide, not a gate: an account within `warnBelow` of a stage's recommended Power deploys with
// NO warning, and none directly after a flawless clear of the previous stage. Below it, the warning
// stays honest — outcome-first, never alarm. RE-ANCHORED 2026-11 (Batch G follow-up, GR1 harness,
// 8 h + 100 h accounts, ~600 Campaign runs across Power/recommended 0.24–8): with the board-aware
// live threat, Power < 70 % of recommended won 17 % (8 h) / 41 % (100 h) of runs — "you'll probably
// lose" — while 70–100 % won 78 % / 62 %. The old 0.9 cut warned (and steered Home to "Farm
// Infinite") on stages the account won ~2 times in 3.
export const READINESS = {
  warnBelow: 0.7, // Power ≥ 70% of recommended ⇒ "within reach" — no under-powered warning
};

/** Defeat debrief reads (docs/REWARD-PRESENTATION.md §debrief — Batch G). Measured on the G1/GR2
 *  harness (≈100 winning Campaign runs at 0.75/8/100 h): winning boards end with every open slot
 *  filled (median 1.00, p25 0.93) — so "typical winning board" = this share of your open slots. */
export const DEBRIEF = {
  winBoardFill: 0.9,
  thinBoardFrac: 0.6, // a board below this share of the typical winning board leads the tip ("build wider")
  lateAntiAirSec: 20, // first flier downed this long after fliers arrived (or never) ⇒ the anti-air tip
};

// Deep-Strain content gate (docs/SIPHON.md §gate): clearing Campaign Stage 15 is the SINGLE
// milestone that opens the deep roster — the five Deep-Strain gene cards enter the draft AND the
// Marrow Siphon's shards begin dropping (before this, the tower is invisible to the loot pool). A
// pure META/progression gate: the sim is handed the resulting draft/roster via RunOptions, so it
// stays ungated (autoplay with progressStage 0 drafts the historical pool ⇒ golden byte-identical).
export const DEEP_STRAIN_STAGE = 15;

// ── Marrow Siphon beam tunables (docs/SIPHON.md) — the one place its numbers live. A continuous
//    drain WEB: `damage` (TOWER_DEFS.siphon) is the per-tether base DPS. Its "Gorge" is GLUTTONY, not
//    focus — it builds from total FEEDING (drain throughput + a bonus per kill) and bleeds off slowly,
//    so switching prey never resets it (the OPPOSITE of the Coil's focus-heat). A fraction of the
//    drain returns to the Hive as biomass. ──
export const SIPHON = {
  gorgePerKill: 0.2, // Gorge (0..1) gained per enemy the drain KILLS — the harvester's momentum
  gorgeThroughputPerSec: 0.32, // Gorge gained per "second of base-DPS" drained — a floor so it always ramps while eating
  gorgeDecayPerSec: 0.25, // …bleeds off this slowly when it stops feeding (momentum lingers — NO hard reset)
  gorgeMaxBonus: 1.6, // heat 1.0 multiplies beam damage by (1 + this) — a fully-gorged ×2.6 drain
  baseForks: 2, // the drain WEB: simultaneous tethers before star/branch forks (vs the Coil's single lock)
  drainFrac: 0.06, // biomass returned per point of beam damage dealt (before card/branch scaling)
  forkDamageFrac: 0.6, // a forked tether drains this fraction of the primary (wide, not deep)
} as const;

// Infinite-mode reward GATE (docs/MODE-IDENTITY.md): an Infinite run must reach at least this
// fraction of the player's PRIOR personal-best depth (save.bestWave, pre-run) to bank ANY reward
// container — its run cache AND its loot ("exploit") boxes. Below the threshold the run qualifies
// for nothing and Results says so. This stops a Start-Run → instant-Quit loop from farming caches.
// The first-ever run (best 0 ⇒ threshold 0) always qualifies; the threshold re-bases automatically
// the moment a new personal best is set.
export const INFINITE_REWARD_QUALIFY_FRAC = 0.5;

// Campaign-exclusive "first-time completion" grants — paid once per brand-new stage clear.
// Tuned 2026-07 (BALANCE_ARCHITECTURE.md §4 protocol): the per-stage discovery payout was the
// main early-game accelerant under optimal play (PROGRESSION_REPORT.md) — trimmed ~1/3 deep
// while keeping the early onboarding payout intact (base 25 unchanged).
export const CAMPAIGN_REWARDS = {
  firstClearCore: 25, // base one-time Genome Cores for a never-cleared stage …
  firstClearCorePerStage: 4, // … + this per stage number (deeper discovery pays more)
  // The Sector Survey drip (docs/REWARD-ARCHITECTURE.md §rebalance, 2026-07): the old
  // "+100 cores every 5th stage" lump now pays as milestoneCore/milestoneEvery per stage —
  // SAME total over any milestoneEvery-stage window (the value-neutrality contract,
  // pinned by rewardLoops.test), five times the payout events. milestoneEvery still
  // marks every 5th stage for map landmarks + authored event finales — the LANDMARK
  // cadence and the MONEY cadence are deliberately decoupled.
  milestoneEvery: 5, // every Nth cleared stage is a LANDMARK (map + authored finale) …
  milestoneCore: 100, // … and this many Cores per window, paid as a per-stage survey drip
  // Failed FRONTIER attempts recover partial "field data" (BALANCE_REPORT №1-3 push-futility):
  // this fraction of the stage's first-clear value, scaled by how deep the attempt survived.
  // Frontier-only + replaced by the full first-clear once the stage falls ⇒ never farmable.
  attemptFrac: 0.25,
};

/** The per-stage Sector Survey bonus — the milestone chunk dripped evenly so every
 *  first clear pays it (Reward Frequency > Reward Quantity). Exactly
 *  milestoneCore/milestoneEvery, so any milestoneEvery-stage window totals the old lump. */
export function campaignSurveyBonus(stageNo: number): number {
  void stageNo; // flat drip today; the arg keeps the seam open for future shaping
  return CAMPAIGN_REWARDS.milestoneCore / CAMPAIGN_REWARDS.milestoneEvery;
}

// Campaign ONBOARDING (docs/DIFFICULTY_DIRECTOR.md §onboarding, docs/CAMPAIGN.md §curve): the
// first stages' finale bosses field a REDUCED boss — body (HP, contact damage, armor) and kit
// amounts × a strength that ramps linearly from `bossStrengthFloor` (stage 1) to ×1 at
// `bossFullStage`. A full-strength finale vs an opening board was a binary wall (fresh-account
// probe: flawless waves, then a boss coin-flip — the Boss Rush lesson, RUSH.strength*). Composed
// by difficultyDirector.campaignBossStrength; applied by campaign.ts generateStage.
export const CAMPAIGN_ONBOARDING = {
  bossStrengthFloor: 0.5, // stage-1 finale boss at 50% body + kit …
  bossFullStage: 5, // … ×1 from here (the first authored milestone boss is untouched)
  // …and its kit trades unanswerable SUSTAIN (an opening board cannot out-damage a heal/shield/
  // harden loop — the binary wall) for the telegraphed CORE-SHOT, which every onboarding finale
  // channels: integrity loss then grades with how long the board takes to kill it.
  sustainKinds: ['healer', 'bulwark', 'carapace', 'shieldphase'] as readonly string[],
  coreShot: { kind: 'channeler', cooldown: 15, duration: 3.5, amount: 16 } as const, // the procedural pool's channeler
  spareSlot: { kind: 'enrager', cooldown: 9, amount: 1 } as const, // a 2nd sustain slot (the kit already channels) — the pool's enrager
};

// ── Campaign OPENING safety (docs/CAMPAIGN.md §opening; Batch G grind audit) ─────────────────
// The headless audit found campaign runs DECIDED in waves 1–3 (90% of losses; median wave-1 death
// 15.9 s) by a seed coin-flip: airborne packs in wave 1 vs whatever the belt happened to deal, and a
// Mega that surfaced WITH wave 1. Generated Campaign stages only (composeStagePlan's `opening` arg —
// the Daily and the golden `stage` path never pass it), so the tension moves to waves 4+ and bosses.
export const CAMPAIGN_OPENING = {
  /** Max AIRBORNE units per opening wave (index 0 = wave 1). 0 ⇒ fliers are excluded from that
   *  wave's pool (the budget goes to ground units); n > 0 ⇒ flying groups are trimmed to n units.
   *  Waves past the list are uncapped. */
  flyingUnitCap: [0, 4] as readonly number[],
  /** The wave a Mega-hosting stage's organism surfaces with (was hard-coded to wave 1 — the
   *  0/3 Stage-30 wall: dead in ~18 s against a 2-tower board). Clamped to the stage's wave count. */
  megaArrivalWave: 3,
};

// ── Battlefield / arena ─────────────────────────────────────────────────────
// Open vertical arena (map.ts owns CELL/COLS/ROWS/WIDTH/HEIGHT). Enemies spawn
// along the TOP edge and dynamically flow toward the BOTTOM edge (the line) via a
// flow field, routing around obstacles — no predetermined path.
export const DEFENSE = {
  fraction: 0.25, // the bottom 25% of the arena is the player's defensive region
};

// The Final Defense Zone — the red last-stand band nearest the Hive Core (the inner
// part of the defensive region). An enemy inside it puts the Hive into Emergency Defense
// Mode: every offensive tower gains unlimited targeting range against in-zone enemies,
// prioritising the breach nearest the core. See docs/RANGE.md §4.
export const FINAL_DEFENSE = {
  fraction: 0.14, // bottom 14% of the arena (≈4 rows, y ≥ 800) is the Final Defense Zone
};

// Static impassable blocks (grid rects {col,row,w,h}) enemies must navigate
// around. Kept ABOVE the defensive zone and never spanning a full row, so a path
// to the line always exists.
export const OBSTACLES: { col: number; row: number; w: number; h: number }[] = [
  { col: 2, row: 5, w: 4, h: 2 },
  { col: 12, row: 6, w: 4, h: 2 },
  { col: 7, row: 10, w: 4, h: 2 },
  { col: 1, row: 13, w: 3, h: 2 },
  { col: 14, row: 13, w: 3, h: 2 },
];

// Tower-slot PROGRESSION tunables (the geometry lives in map.ts buildSlots). The map has 27
// emplacements (docs/SLOTS.md): `initialUnlocked` are free at run start; permanent unlocks
// (Shard upgrade → MetaModifiers.bonusSlots) raise the available count to `permanentMax`;
// temporary unlocks (the Reclaimed Node gene card → RunModifiers.bonusTowerSlots) add up to
// `tempMax` more for the run only. permanentMax + tempMax === the 27 total.
export const SLOTS = {
  initialUnlocked: 15, // the centre five columns × three rows — symmetric around the core
  permanentMax: 21, // the most a player can permanently unlock (initial + Shard upgrades)
  tempMax: 6, // the most temporary (run-only) slots a run can add via gene cards
};

// ── Genome Core (meta) upgrades — permanent, capped, reset on a Molt (docs/GENOME-CORE.md) ──
// The Evolution HQ groups these by `category`. An upgrade folds in via ONE of two seams:
//   • `effect`  → a field of the small MetaModifiers bundle (the legacy 5; folded at Game start).
//   • `run`     → a RunModifiers field, emitted as a CardEffect through the existing run-effects
//                 seam (meta.genomeRunEffects → bootRunEffect). Zero new sim wiring per upgrade ⇒
//                 the set scales to 50+ purely as data. Golden-safe: level 0 ⇒ no effect.
// RUNAWAY (infinite) tier: `infinite: true` + `maxLevel: Infinity` marks an UNCAPPED upgrade —
// the late-game Genome Core sink. Its cumulative effect folds at √level (diminishing returns,
// unbounded but ever-slower) while the cost keeps compounding geometrically, and every level
// still nudges the Power Score (docs/EVOLUTION-HQ.md §runaway).
export type GenomeCategory = 'Combat' | 'Economy' | 'Hero' | 'Tower' | 'Infrastructure' | 'Utility';

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  category: GenomeCategory;
  maxLevel: number;
  baseCost: number;
  costMult: number;
  /** Uncapped sink upgrade: maxLevel must be Infinity; effect folds at √level (see above). */
  infinite?: boolean;
  /** Legacy seam: each level adds `perLevel` to `stat` of MetaModifiers (mults base 1, flats 0). */
  effect?: { stat: keyof MetaModifiers; perLevel: number };
  /** Run-effect seam: each level contributes to a RunModifiers `field` — 'mul' adds `perLevel` to a
   *  base-1 multiplier (so ×(1 + perLevel·level)); 'add' adds `perLevel·level` to a flat field. */
  run?: { field: RunModNumberKey; op: 'mul' | 'add'; perLevel: number };
  /** Progression GATE (docs/EVOLUTION-HQ.md §gates): a gated upgrade is VISIBLE in the HQ but
   *  cannot be bought until the account clears its condition — the same unlock vocabulary gene
   *  cards use. Absent ⇒ purchasable from the start (every pre-expansion upgrade). */
  unlock?: CardUnlock;
}

/** The effect-units an upgrade contributes at `level`: linear for capped upgrades, √level for the
 *  Runaway (infinite) tier — the ONE place the diminishing-returns curve lives. Every fold
 *  (MetaModifiers, run-effects, labels, Power previews) must go through this. */
export function upgradeEffectUnits(def: UpgradeDef, level: number): number {
  return def.infinite ? Math.sqrt(Math.max(0, level)) : level;
}

export const META_UPGRADES: UpgradeDef[] = [
  // ── Legacy (MetaModifiers seam) ─────────────────────────────────────────────
  { id: 'lethality', name: 'Lethal Spores', description: '+8% tower damage per level', category: 'Combat', maxLevel: 10, baseCost: 30, costMult: 1.55, effect: { stat: 'towerDamageMult', perLevel: 0.08 } },
  { id: 'metabolism', name: 'Rich Biomass', description: '+10% in-run biomass income per level', category: 'Economy', maxLevel: 10, baseCost: 30, costMult: 1.55, effect: { stat: 'biomassMult', perLevel: 0.1 } },
  { id: 'nucleus', name: 'Reinforced Nucleus', description: '+25 max Integrity per level', category: 'Infrastructure', maxLevel: 10, baseCost: 25, costMult: 1.5, effect: { stat: 'integrityBonus', perLevel: 25 } },
  { id: 'apex', name: 'Apex Genome', description: '+10% hero damage per level', category: 'Hero', maxLevel: 10, baseCost: 35, costMult: 1.55, effect: { stat: 'heroDamageMult', perLevel: 0.1 } },
  // Permanent tower slots (docs/SLOTS.md): each level unlocks one more emplacement forever,
  // raising the run-start count from SLOTS.initialUnlocked (15) toward SLOTS.permanentMax (21).
  { id: 'emplacements', name: 'Hive Emplacements', description: '+1 permanent tower slot per level', category: 'Infrastructure', maxLevel: 6, baseCost: 40, costMult: 1.6, effect: { stat: 'bonusSlots', perLevel: 1 } },

  // ── Combat (run-effect seam) ────────────────────────────────────────────────
  { id: 'adaptive_targeting', name: 'Adaptive Targeting', description: '+4% tower fire rate per level', category: 'Combat', maxLevel: 8, baseCost: 40, costMult: 1.55, run: { field: 'towerFireRateMult', op: 'mul', perLevel: 0.04 } },
  { id: 'aggressive_evolution', name: 'Aggressive Evolution', description: '+5% splash radius per level', category: 'Combat', maxLevel: 6, baseCost: 45, costMult: 1.55, run: { field: 'splashRadiusMult', op: 'mul', perLevel: 0.05 } },
  { id: 'overclocked_synapses', name: 'Overclocked Synapses', description: 'Execute non-elites below +0.8% max HP per level', category: 'Combat', maxLevel: 5, baseCost: 60, costMult: 1.6, run: { field: 'executeThreshold', op: 'add', perLevel: 0.008 } },

  // ── Economy (run-effect seam) ───────────────────────────────────────────────
  { id: 'rapid_assimilation', name: 'Rapid Assimilation', description: '+6% Flesh Reactor biomass per level', category: 'Economy', maxLevel: 8, baseCost: 35, costMult: 1.5, run: { field: 'reactorBiomassMult', op: 'mul', perLevel: 0.06 } },
  { id: 'expanded_biomass', name: 'Expanded Biomass Storage', description: '+15 starting biomass per level', category: 'Economy', maxLevel: 8, baseCost: 30, costMult: 1.5, run: { field: 'startBiomassBonus', op: 'add', perLevel: 15 } },
  { id: 'recycling_matrix', name: 'Recycling Matrix', description: '+3% tower sell refund per level', category: 'Economy', maxLevel: 5, baseCost: 40, costMult: 1.5, run: { field: 'sellRefundFrac', op: 'add', perLevel: 0.03 } },

  // ── Hero (run-effect seam) ──────────────────────────────────────────────────
  { id: 'enhanced_genetics', name: 'Enhanced Genetics', description: '+7% hero max HP per level', category: 'Hero', maxLevel: 8, baseCost: 35, costMult: 1.55, run: { field: 'heroMaxHpMult', op: 'mul', perLevel: 0.07 } },
  { id: 'neural_efficiency', name: 'Neural Efficiency', description: '−3% hero ability cooldown per level', category: 'Hero', maxLevel: 5, baseCost: 45, costMult: 1.6, run: { field: 'heroCooldownMult', op: 'mul', perLevel: -0.03 } },
  { id: 'symbiotic_growth', name: 'Symbiotic Growth', description: '+3% hero lifesteal per level', category: 'Hero', maxLevel: 5, baseCost: 45, costMult: 1.6, run: { field: 'heroLifestealFrac', op: 'add', perLevel: 0.03 } },
  { id: 'reactive_armor', name: 'Reactive Armor', description: '+5% hero thorns per level', category: 'Hero', maxLevel: 5, baseCost: 40, costMult: 1.55, run: { field: 'heroThornsFrac', op: 'add', perLevel: 0.05 } },
  { id: 'predatory_instinct', name: 'Predatory Instinct', description: '+6% hero aggro range per level', category: 'Hero', maxLevel: 5, baseCost: 35, costMult: 1.5, run: { field: 'heroAggroRangeMult', op: 'mul', perLevel: 0.06 } },

  // ── Tower (run-effect seam) ─────────────────────────────────────────────────
  { id: 'hive_intelligence', name: 'Hive Intelligence', description: '+0.3% tower damage per active tower, per level', category: 'Tower', maxLevel: 6, baseCost: 45, costMult: 1.55, run: { field: 'damagePerTower', op: 'add', perLevel: 0.003 } },
  { id: 'corrosive_saturation', name: 'Corrosive Saturation', description: '+5% acid-pool damage per level', category: 'Tower', maxLevel: 6, baseCost: 40, costMult: 1.5, run: { field: 'poolDpsMult', op: 'mul', perLevel: 0.05 } },

  // ── Infrastructure (run-effect seam) ────────────────────────────────────────
  { id: 'reinforced_lattice', name: 'Reinforced Lattice', description: '+5% max Integrity (multiplicative) per level', category: 'Infrastructure', maxLevel: 6, baseCost: 35, costMult: 1.5, run: { field: 'integrityMult', op: 'mul', perLevel: 0.05 } },

  // ── Utility (run-effect seam) ───────────────────────────────────────────────
  { id: 'genetic_stability', name: 'Genetic Stability', description: '−2% enemy HP scaling per level', category: 'Utility', maxLevel: 5, baseCost: 55, costMult: 1.65, run: { field: 'enemyHpRunMult', op: 'mul', perLevel: -0.02 } },
  { id: 'adaptive_reflexes', name: 'Adaptive Reflexes', description: '+4% hero move speed per level', category: 'Utility', maxLevel: 5, baseCost: 35, costMult: 1.5, run: { field: 'heroSpeedMult', op: 'mul', perLevel: 0.04 } },

  // ── RUNAWAY tier — one UNCAPPED sink per category (docs/EVOLUTION-HQ.md §runaway) ──
  // Cumulative effect = perLevel × √level (diminishing, unbounded); cost compounds forever.
  // perLevel values are deliberately small: at level 25 a Runaway ≈ one capped upgrade's early
  // levels, and every buy still moves the Power Score.
  { id: 'runaway_lethality', name: 'Runaway Lethality', description: 'Tower damage grows without limit — +2% × √level', category: 'Combat', maxLevel: Infinity, baseCost: 200, costMult: 1.16, infinite: true, effect: { stat: 'towerDamageMult', perLevel: 0.02 } },
  { id: 'runaway_metabolism', name: 'Runaway Metabolism', description: 'Biomass income grows without limit — +2% × √level', category: 'Economy', maxLevel: Infinity, baseCost: 180, costMult: 1.15, infinite: true, effect: { stat: 'biomassMult', perLevel: 0.02 } },
  { id: 'runaway_genome', name: 'Runaway Genome', description: 'Hero damage grows without limit — +2% × √level', category: 'Hero', maxLevel: Infinity, baseCost: 200, costMult: 1.16, infinite: true, effect: { stat: 'heroDamageMult', perLevel: 0.02 } },
  { id: 'runaway_synchrony', name: 'Runaway Synchrony', description: 'Hive link deepens without limit — +0.08% damage per active tower × √level', category: 'Tower', maxLevel: Infinity, baseCost: 220, costMult: 1.15, infinite: true, run: { field: 'damagePerTower', op: 'add', perLevel: 0.0008 } },
  { id: 'runaway_ossification', name: 'Runaway Ossification', description: 'The Nucleus thickens without limit — +10 max Integrity × √level', category: 'Infrastructure', maxLevel: Infinity, baseCost: 160, costMult: 1.15, infinite: true, effect: { stat: 'integrityBonus', perLevel: 10 } },
  { id: 'runaway_reflexes', name: 'Runaway Reflexes', description: 'Champion reflexes sharpen without limit — +1.2% hero speed × √level', category: 'Utility', maxLevel: Infinity, baseCost: 170, costMult: 1.15, infinite: true, run: { field: 'heroSpeedMult', op: 'mul', perLevel: 0.012 } },

  // ════════════════ Expansion — 30 CAPPED Genome-Core sinks (deeper build levers) ════════════════
  // Each targets a Power-scored RunModifiers field ⇒ every purchase raises Power; magnitudes are
  // deliberately MODEST (a fully-maxed axis is a single-digit-% swing, never a spike) and costs
  // escalate so the tier is a long-horizon SINK, not a cheap-breadth power dump. The runaway (∞) tier
  // stays exactly the six above (docs/EVOLUTION-HQ.md §runaway — one uncapped sink per category); this
  // block is all CAPPED depth. Balanced against the five-persona premium guardrail (Whale/F2P ≤ ×1.6).
  // ── Combat ──
  { id: 'barbed_genome', name: 'Barbed Genome', description: '+1 max Fracture stack per level (deeper armor shred)', category: 'Combat', maxLevel: 3, baseCost: 80, costMult: 1.6, run: { field: 'fractureBonusStacks', op: 'add', perLevel: 1 } },
  { id: 'cascade_genome', name: 'Cascade Genome', description: 'Status reactions re-fire once more (a rare capstone)', category: 'Combat', maxLevel: 1, baseCost: 255, costMult: 1.9, run: { field: 'reactionRepeats', op: 'add', perLevel: 1 } },
  { id: 'resonant_command', name: 'Resonant Command', description: "+2% damage for towers matching your hero's class, per level", category: 'Combat', maxLevel: 4, baseCost: 80, costMult: 1.6, run: { field: 'classResonanceBonus', op: 'add', perLevel: 0.02 } },
  { id: 'diverse_arsenal', name: 'Diverse Arsenal', description: '+2% tower damage per DISTINCT tower class fielded, per level', category: 'Combat', maxLevel: 4, baseCost: 80, costMult: 1.6, run: { field: 'diversityBonus', op: 'add', perLevel: 0.02 } },
  { id: 'void_lattice', name: 'Void Lattice', description: '+0.4% tower damage per EMPTY build slot, per level', category: 'Combat', maxLevel: 4, baseCost: 90, costMult: 1.6, run: { field: 'damagePerEmptySlot', op: 'add', perLevel: 0.004 } },
  { id: 'multi_spinneret', name: 'Multi-Spinneret', description: 'Needle Spitter fires +1 extra needle (a rare capstone)', category: 'Combat', maxLevel: 1, baseCost: 240, costMult: 1.9, run: { field: 'needleExtraProjectiles', op: 'add', perLevel: 1 } },
  { id: 'siege_saturation', name: 'Siege Saturation', description: '+3% splash radius per level (a deeper AoE sink)', category: 'Combat', maxLevel: 4, baseCost: 95, costMult: 1.6, run: { field: 'splashRadiusMult', op: 'mul', perLevel: 0.03 } },
  // ── Tower identities ──
  { id: 'virulent_strain', name: 'Virulent Strain', description: '+3% Parasite Infection damage per level', category: 'Tower', maxLevel: 5, baseCost: 72, costMult: 1.55, run: { field: 'parasiteInfectionMult', op: 'mul', perLevel: 0.03 } },
  { id: 'neural_dominion', name: 'Neural Dominion', description: '+1.5% Disruption vulnerability per level', category: 'Tower', maxLevel: 4, baseCost: 80, costMult: 1.55, run: { field: 'obeliskVulnerabilityBonus', op: 'add', perLevel: 0.015 } },
  { id: 'overcharge_grid', name: 'Overcharge Grid', description: '+0.02 Flesh Reactor overcharge per level', category: 'Tower', maxLevel: 4, baseCost: 80, costMult: 1.55, run: { field: 'reactorOverchargeBonus', op: 'add', perLevel: 0.02 } },
  { id: 'gaping_maw', name: 'Gaping Maw', description: '+3% Carrion Maw bite reach per level', category: 'Tower', maxLevel: 4, baseCost: 72, costMult: 1.55, run: { field: 'mawCleaveRadiusMult', op: 'mul', perLevel: 0.03 } },
  { id: 'deep_amber', name: 'Deep Amber', description: '+3.5% Amber Chrysalis encasement duration per level', category: 'Tower', maxLevel: 4, baseCost: 72, costMult: 1.55, run: { field: 'chrysalisFreezeDurationMult', op: 'mul', perLevel: 0.035 } },
  { id: 'eternal_wail', name: 'Eternal Wail', description: '+3.5% Wailing Effigy panic duration per level', category: 'Tower', maxLevel: 4, baseCost: 72, costMult: 1.55, run: { field: 'effigyDreadDurationMult', op: 'mul', perLevel: 0.035 } },
  { id: 'harmonic_overtuning', name: 'Harmonic Overtuning', description: '+3.5% Resonance Coil beam ramp per level', category: 'Tower', maxLevel: 4, baseCost: 80, costMult: 1.6, run: { field: 'coilRampMult', op: 'mul', perLevel: 0.035 } },
  { id: 'prismatic_conduits', name: 'Prismatic Conduits', description: 'Resonance Coil beam forks to +1 more target (a rare capstone)', category: 'Tower', maxLevel: 1, baseCost: 240, costMult: 1.9, run: { field: 'coilBeamTargets', op: 'add', perLevel: 1 } },
  // ── Hero ──
  { id: 'predators_eye', name: "Predator's Eye", description: '+2% hero crit chance per level', category: 'Hero', maxLevel: 4, baseCost: 80, costMult: 1.6, run: { field: 'heroCritChance', op: 'add', perLevel: 0.02 } },
  { id: 'savage_instinct', name: 'Savage Instinct', description: '+10% hero crit damage per level', category: 'Hero', maxLevel: 3, baseCost: 90, costMult: 1.6, run: { field: 'heroCritDamageBonus', op: 'add', perLevel: 0.10 } },
  { id: 'frenzied_metabolism', name: 'Frenzied Metabolism', description: '+2% hero attack speed per level', category: 'Hero', maxLevel: 4, baseCost: 90, costMult: 1.6, run: { field: 'heroAttackSpeedMult', op: 'mul', perLevel: 0.02 } },
  { id: 'expansive_mind', name: 'Expansive Mind', description: '+3.5% hero ability radius per level', category: 'Hero', maxLevel: 4, baseCost: 72, costMult: 1.55, run: { field: 'heroAbilityRadiusMult', op: 'mul', perLevel: 0.035 } },
  { id: 'regenerative_biology', name: 'Regenerative Biology', description: '+6% hero healing received per level', category: 'Hero', maxLevel: 4, baseCost: 64, costMult: 1.5, run: { field: 'heroHealingMult', op: 'mul', perLevel: 0.06 } },
  { id: 'chitin_plating', name: 'Chitin Plating', description: '+2% hero contact-damage reduction per level', category: 'Hero', maxLevel: 4, baseCost: 72, costMult: 1.55, run: { field: 'heroArmor', op: 'add', perLevel: 0.02 } },
  { id: 'warlord_resonance', name: 'Warlord Resonance', description: '+2% damage to towers near your hero, per level', category: 'Hero', maxLevel: 4, baseCost: 80, costMult: 1.6, run: { field: 'heroTowerDamageAura', op: 'add', perLevel: 0.02 } },
  { id: 'quickening_aura', name: 'Quickening Aura', description: '+2% fire rate to towers near your hero, per level', category: 'Hero', maxLevel: 4, baseCost: 80, costMult: 1.6, run: { field: 'heroTowerHasteAura', op: 'add', perLevel: 0.02 } },
  // ── Infrastructure / support ──
  { id: 'last_bastion_meta', name: 'Last Bastion Doctrine', description: '+4% Last Stand tower damage while the Nucleus is low, per level', category: 'Infrastructure', maxLevel: 4, baseCost: 80, costMult: 1.6, run: { field: 'lastStandMult', op: 'mul', perLevel: 0.04 } },
  { id: 'sclerotic_hull', name: 'Sclerotic Hull', description: '+3% max Integrity (multiplicative) per level', category: 'Infrastructure', maxLevel: 5, baseCost: 72, costMult: 1.55, run: { field: 'integrityMult', op: 'mul', perLevel: 0.03 } },
  // ── Utility (trade-off + tempo levers) ──
  { id: 'genetic_purge', name: 'Genetic Purge', description: '−1.2% enemy HP scaling per level', category: 'Utility', maxLevel: 4, baseCost: 96, costMult: 1.65, run: { field: 'enemyHpRunMult', op: 'mul', perLevel: -0.012 } },
  { id: 'synaptic_overclock', name: 'Synaptic Overclock', description: '−1.5% hero ability cooldown per level', category: 'Utility', maxLevel: 4, baseCost: 88, costMult: 1.6, run: { field: 'heroCooldownMult', op: 'mul', perLevel: -0.015 } },
  { id: 'kinetic_priming', name: 'Kinetic Priming', description: '+3% hero move speed per level', category: 'Utility', maxLevel: 4, baseCost: 64, costMult: 1.5, run: { field: 'heroSpeedMult', op: 'mul', perLevel: 0.03 } },
  // ── Economy ──
  { id: 'enzyme_cascade', name: 'Enzyme Cascade', description: '+4% Flesh Reactor biomass per level', category: 'Economy', maxLevel: 5, baseCost: 64, costMult: 1.5, run: { field: 'reactorBiomassMult', op: 'mul', perLevel: 0.04 } },
  { id: 'seed_vault', name: 'Seed Vault', description: '+15 starting biomass per level', category: 'Economy', maxLevel: 5, baseCost: 64, costMult: 1.5, run: { field: 'startBiomassBonus', op: 'add', perLevel: 15 } },

  // ════════════════ Deep Genome tier — 30 more CAPPED sinks (20 open + 10 progression-GATED) ════════════════
  // The long-horizon expansion: 20 premium-priced deepeners on proven axes + fresh levers, and 10
  // upgrades behind UNIQUE progression gates (`unlock` — the gene-card vocabulary, purchase-enforced
  // in meta.buyUpgrade, rendered locked in the HQ). All Power-scored; the runaway six stay the only
  // infinite sinks. Balanced against the five-persona premium guardrails (Whale/F2P ≤ ×1.6).
  // ── Open tier (20) ──
  { id: 'deep_lethality', name: 'Deep Lethality', description: '+4% tower damage per level (stacks with Lethal Spores)', category: 'Combat', maxLevel: 5, baseCost: 195, costMult: 1.7, effect: { stat: 'towerDamageMult', perLevel: 0.04 } },
  { id: 'deep_metabolism', name: 'Deep Metabolism', description: '+5% biomass income per level (stacks with Rich Biomass)', category: 'Economy', maxLevel: 5, baseCost: 180, costMult: 1.7, effect: { stat: 'biomassMult', perLevel: 0.05 } },
  { id: 'deep_cadence', name: 'Deep Cadence', description: '+2% tower fire rate per level', category: 'Combat', maxLevel: 4, baseCost: 195, costMult: 1.7, run: { field: 'towerFireRateMult', op: 'mul', perLevel: 0.02 } },
  { id: 'hardened_nucleus', name: 'Hardened Nucleus', description: '+40 max Integrity per level', category: 'Infrastructure', maxLevel: 5, baseCost: 142, costMult: 1.6, effect: { stat: 'integrityBonus', perLevel: 40 } },
  { id: 'executioners_edge', name: "Executioner's Edge", description: 'Execute non-elites below +0.4% max HP per level', category: 'Combat', maxLevel: 4, baseCost: 150, costMult: 1.65, run: { field: 'executeThreshold', op: 'add', perLevel: 0.004 } },
  { id: 'hive_synergy', name: 'Hive Synergy', description: '+0.2% tower damage per active tower, per level', category: 'Tower', maxLevel: 4, baseCost: 150, costMult: 1.65, run: { field: 'damagePerTower', op: 'add', perLevel: 0.002 } },
  { id: 'splash_doctrine', name: 'Splash Doctrine', description: '+2.5% splash radius per level', category: 'Combat', maxLevel: 4, baseCost: 142, costMult: 1.6, run: { field: 'splashRadiusMult', op: 'mul', perLevel: 0.025 } },
  { id: 'corrosive_mastery', name: 'Corrosive Mastery', description: '+4% acid-pool damage per level', category: 'Tower', maxLevel: 5, baseCost: 117, costMult: 1.55, run: { field: 'poolDpsMult', op: 'mul', perLevel: 0.04 } },
  { id: 'viral_mastery', name: 'Viral Mastery', description: '+4% Infection damage per level (stacks with Virulent Strain)', category: 'Tower', maxLevel: 5, baseCost: 117, costMult: 1.55, run: { field: 'parasiteInfectionMult', op: 'mul', perLevel: 0.04 } },
  { id: 'neural_mastery', name: 'Neural Mastery', description: '+1.2% Disruption vulnerability per level', category: 'Tower', maxLevel: 4, baseCost: 128, costMult: 1.6, run: { field: 'obeliskVulnerabilityBonus', op: 'add', perLevel: 0.012 } },
  { id: 'glacial_mastery', name: 'Glacial Mastery', description: '+3% Amber encasement duration per level', category: 'Tower', maxLevel: 4, baseCost: 117, costMult: 1.55, run: { field: 'chrysalisFreezeDurationMult', op: 'mul', perLevel: 0.03 } },
  { id: 'dread_mastery', name: 'Dread Mastery', description: '+3% Effigy panic duration per level', category: 'Tower', maxLevel: 4, baseCost: 117, costMult: 1.55, run: { field: 'effigyDreadDurationMult', op: 'mul', perLevel: 0.03 } },
  { id: 'maw_mastery', name: 'Maw Mastery', description: '+2.5% Carrion Maw bite reach per level', category: 'Tower', maxLevel: 4, baseCost: 117, costMult: 1.55, run: { field: 'mawCleaveRadiusMult', op: 'mul', perLevel: 0.025 } },
  { id: 'crimson_pact', name: 'Crimson Pact', description: '+2% hero lifesteal per level', category: 'Hero', maxLevel: 4, baseCost: 135, costMult: 1.6, run: { field: 'heroLifestealFrac', op: 'add', perLevel: 0.02 } },
  { id: 'aegis_pact', name: 'Aegis Pact', description: '+3% hero thorns per level', category: 'Hero', maxLevel: 4, baseCost: 120, costMult: 1.55, run: { field: 'heroThornsFrac', op: 'add', perLevel: 0.03 } },
  { id: 'first_strike_doctrine', name: 'First-Strike Doctrine', description: '+6% damage to full-health enemies, per level', category: 'Combat', maxLevel: 4, baseCost: 142, costMult: 1.6, run: { field: 'fullHealthDamageBonus', op: 'add', perLevel: 0.06 } },
  { id: 'reactor_mastery', name: 'Reactor Mastery', description: '+4% Flesh Reactor biomass per level', category: 'Economy', maxLevel: 4, baseCost: 128, costMult: 1.55, run: { field: 'reactorBiomassMult', op: 'mul', perLevel: 0.04 } },
  { id: 'quartermaster', name: 'Quartermaster', description: '+2% tower sell refund per level', category: 'Economy', maxLevel: 3, baseCost: 105, costMult: 1.5, run: { field: 'sellRefundFrac', op: 'add', perLevel: 0.02 } },
  { id: 'warcry_lattice', name: 'Warcry Lattice', description: "+1.5% damage for towers matching your hero's class, per level", category: 'Combat', maxLevel: 4, baseCost: 142, costMult: 1.6, run: { field: 'classResonanceBonus', op: 'add', perLevel: 0.015 } },
  { id: 'swift_champion', name: 'Swift Champion', description: '+2.5% hero move speed per level', category: 'Utility', maxLevel: 4, baseCost: 105, costMult: 1.5, run: { field: 'heroSpeedMult', op: 'mul', perLevel: 0.025 } },
  // ── Gated tier (10) — each behind a UNIQUE progression gate ──
  { id: 'gorge_doctrine', name: 'Gorge Doctrine', description: '+4% Marrow Siphon ramp per level', category: 'Tower', maxLevel: 4, baseCost: 142, costMult: 1.6, run: { field: 'siphonRampMult', op: 'mul', perLevel: 0.04 }, unlock: { kind: 'towerUnlocked', tower: 'siphon' } },
  { id: 'bloodletting', name: 'Bloodletting', description: '+6% Marrow Siphon biomass return per level', category: 'Economy', maxLevel: 4, baseCost: 128, costMult: 1.55, run: { field: 'siphonDrainMult', op: 'mul', perLevel: 0.06 }, unlock: { kind: 'totalBiomass', biomass: 100000 } },
  { id: 'garden_doctrine', name: 'Garden Doctrine', description: '+4% Blight Sower blast radius per level', category: 'Tower', maxLevel: 4, baseCost: 142, costMult: 1.6, run: { field: 'sowerBlastRadiusMult', op: 'mul', perLevel: 0.04 }, unlock: { kind: 'towerUnlocked', tower: 'sower' } },
  { id: 'seedbank', name: 'Seedbank', description: 'Every Blight Sower keeps +1 more mine armed, per level', category: 'Tower', maxLevel: 2, baseCost: 225, costMult: 1.8, run: { field: 'sowerExtraMines', op: 'add', perLevel: 1 }, unlock: { kind: 'campaignStage', stage: 30 } },
  { id: 'resonant_overdrive', name: 'Resonant Overdrive', description: '+4% Resonance Coil ramp per level (stacks with Overtuning)', category: 'Tower', maxLevel: 4, baseCost: 150, costMult: 1.65, run: { field: 'coilRampMult', op: 'mul', perLevel: 0.04 }, unlock: { kind: 'towerUnlocked', tower: 'coil' } },
  { id: 'veterans_arsenal', name: "Veteran's Arsenal", description: '+3% tower damage per level', category: 'Combat', maxLevel: 5, baseCost: 165, costMult: 1.65, effect: { stat: 'towerDamageMult', perLevel: 0.03 }, unlock: { kind: 'totalRuns', runs: 15 } },
  { id: 'cullers_creed', name: "Culler's Creed", description: 'Execute non-elites below +0.5% max HP per level', category: 'Combat', maxLevel: 3, baseCost: 180, costMult: 1.7, run: { field: 'executeThreshold', op: 'add', perLevel: 0.005 }, unlock: { kind: 'lifetimeKills', kills: 10000 } },
  { id: 'slayers_focus', name: "Slayer's Focus", description: '+1.5% hero crit chance per level', category: 'Hero', maxLevel: 4, baseCost: 142, costMult: 1.6, run: { field: 'heroCritChance', op: 'add', perLevel: 0.015 }, unlock: { kind: 'bossesSlain', bosses: 4 } },
  { id: 'abyssal_doctrine', name: 'Abyssal Doctrine', description: '−0.8% enemy HP scaling per level', category: 'Utility', maxLevel: 4, baseCost: 165, costMult: 1.7, run: { field: 'enemyHpRunMult', op: 'mul', perLevel: -0.008 }, unlock: { kind: 'bestWave', wave: 40 } },
  { id: 'legend_carver', name: 'Legend Carver', description: '+12% hero crit damage per level', category: 'Hero', maxLevel: 3, baseCost: 165, costMult: 1.65, run: { field: 'heroCritDamageBonus', op: 'add', perLevel: 0.12 }, unlock: { kind: 'campaignStage', stage: 45 } },
];

export function upgradeProblems(d: UpgradeDef): string[] {
  const out: string[] = [];
  if (d.maxLevel <= 0) out.push('maxLevel must be > 0');
  if (d.infinite === true && Number.isFinite(d.maxLevel)) out.push('infinite upgrades must have maxLevel Infinity');
  if (d.infinite !== true && !Number.isFinite(d.maxLevel)) out.push('capped upgrades must have a finite maxLevel');
  if (d.baseCost <= 0) out.push('baseCost must be > 0');
  if (d.costMult < 1) out.push('costMult should be >= 1');
  if (d.infinite === true && d.costMult < 1.1) out.push('infinite upgrades need a compounding costMult (>= 1.1) — they are sinks');
  if (!d.effect === !d.run) out.push('exactly one of effect | run must be set');
  return out;
}

export const upgradeRegistry = new Registry<UpgradeDef>('upgrade', { idOf: (d) => d.id, validate: upgradeProblems });
upgradeRegistry.registerAll(META_UPGRADES);

// ── Tower progression: shards → stars, plus infinite mastery ────────────────
// Per-tower permanent growth, kept SEPARATE from the global Genome Cores economy:
//   • Tower Shards (per kind)  — currency earned from run-end chests.
//   • Stars (per kind)         — bought with tower shards; small, capped buff.
//   • Mastery (per kind)       — earned by USE (kills/damage/uptime); INFINITE,
//                                ever-slower, tiny permanent buff per level.
// All numbers here are PLACEHOLDER starting points — the architecture is the
// deliverable, not the balance. Bonuses are identity at level/star 0 so a fresh
// save plays exactly like the base game (golden-test invariant).

/** Star upgrades: capped, shard-bought, modest per-star buff. */
export const STAR = {
  maxStars: 10, // heroes: ★0..★10 — ★3/★7 unlock the ability kit, ★5/★8 are the A/B ability FORKS (HEROES.md), ★6-10 ascension power
  maxTowerStars: 10, // towers: ★0..★10 — ★1-5 unlock evolutions (stars.ts); ★6-10 are ASCENSION power
  // tiers. Milestones at 3/5/7/10★ are the long-term goal; a steep cost curve gates the late grind.
  // TWO SEPARATE shard ladders (docs/SHARD-ECONOMY.md): Tower Shards drive the long ★10 PRIMARY
  // grind; Hero Shards a short ★5 ladder fed by rarer drops. Smooth exponential — no spikes.
  towerBaseCost: 10, // Tower Shards for ★1; ×towerCostMult per star → 10,20,40,…,5120 (★10 = 10,230 total)
  towerCostMult: 2.0,
  heroBaseCost: 8, // Hero Shards for ★1; gentler curve → 8,14,26,47,84 (★5 = 179 total)
  heroCostMult: 1.8,
  damagePerStar: 0.06, // +6% tower damage per star (placeholder)
  fireRatePerStar: 0.03, // +3% fire rate per star (placeholder)
};
/** Star levels that earn a celebratory MILESTONE moment in the upgrade ceremony (TowerLab). */
export const STAR_MILESTONES: readonly number[] = [3, 5, 7, 10];

/** PRIME STRAINS (docs/PRIME-STRAINS.md) — the per-unit INFINITE ladder past max Stars. Each
 *  repeatable level spends the unit's own shard lane (Strain Samples / Apex Genome) on a steeply
 *  GEOMETRIC cost curve for a small DIMINISHING damage bonus, and cross-links the material
 *  economy: deep levels also consume Catalyst. Closed forms live in core/prime.ts:
 *  · cost(L→L+1) = round(finalStarCost × costMult × costGrowth^L)
 *  · mult(L)     = 1 + bonusPerLevel × softCapLevels × ln(1 + L / softCapLevels) — exactly 1 at
 *    L0 (golden-safe), slope +0.5%/level at the start, unbounded but logarithmic (the honest
 *    "diminishing" curve: each level past ~softCapLevels is worth about half the first). */
export const PRIME = {
  costMult: 1.0, // Prime L1 costs the ladder's FINAL star price — the grind simply continues
  costGrowth: 1.4, // geometric growth per level (requirement: ≥ 1.35)
  bonusPerLevel: 0.005, // +0.5% damage-equivalent at the start of the curve
  softCapLevels: 40, // L₀ — the easing scale of the log curve
  /** Deep levels ALSO spend Catalyst (the Armory's rare material): buying a TARGET level ≥ `from`
   *  consumes that tier's Catalyst. Ascending; the highest matching row applies. */
  catalystTiers: [
    { from: 6, catalyst: 1 },
    { from: 26, catalyst: 2 },
  ] as readonly { from: number; catalyst: number }[],
};

/** IDLE HARVEST (docs/IDLE-HARVEST.md) — the Hive keeps harvesting while the player is away.
 *  PHILOSOPHY: idle reduces friction, never replaces play — the value model is calibrated so a
 *  fully-invested idle hour stays well under an active hour (§simulation guardrail test). All
 *  closed forms live in core/idleHarvest.ts; these are the tunables. */
export const IDLE = {
  baseCoresPerHour: 5, // the value budget (core-equivalents/h) at campaign stage 1, before nodes
  stageGrowth: 0.02, // +2%/cleared campaign stage — idle scales WITH progression, at a fraction of the run economy's 5%
  rankGrowth: 0.04, // GENOME RANK DIVIDEND: +4%/rank past I — the mastery ladder feeds the harvest (rank VIII ≈ +28%; guardrail-bounded)
  baseOfflineEff: 0.7, // the unattended Hive harvests at 70% — the Offline Efficiency node closes the gap
  capHoursLadder: [8, 10, 12, 16, 24, 36, 48, 72] as readonly number[], // Harvest Capacity levels 0..7
  capHoursBeyond: 12, // each Capacity level past the ladder adds this many hours (infinite)
  softScaleL0: 50, // the log-easing scale shared by every ×-multiplier node (see prime's curve)
  minCollectMinutes: 5, // below this the hopper is "still warming" — no collect (keeps receipts meaningful)
  // Arrival ceremony threshold, lowered 30 → 20 (docs/REWARD-ARCHITECTURE.md §rebalance):
  // a returning session greets a ripe hopper more often. Pure presentation frequency —
  // accrual math and yields are untouched (remote-tunable via ui.arrivalMinMinutes).
  ceremonyMinutes: 20,
  maxContainersPerCollect: 2, // hard fairness cap on container-class drops in ONE collect
  bloomBudgetMult: 2, // a Special-Events BLOOM doubles the collect's budget + guarantees a rare
  // Clock-integrity bound (docs/IDLE-HARVEST.md §integrity): a FUTURE accrual anchor freezes
  // idle until real time passes it (backward tamper never double-pays — the anchor is monotone);
  // stranded anchors clamp to now + this window, so a legitimately wrong device clock costs at
  // most this much frozen idle while tamper cycles stay throttled to the same window.
  tamperFreezeMaxHours: 48,
  /** CHITIN LANE (docs/ECONOMY.md §localized) — the guaranteed share of every harvest budget
   *  paid as Chitin, the Hive-Production build currency. A TOP-SLICE, not new value: the slice
   *  comes out of the same core-equivalent budget before the weighted drop roll, so the hopper's
   *  total value is unchanged — its composition shifts toward the currency that grows the Hive
   *  itself. Sized (with the expedition chitin lanes) for organ-pace parity with the old
   *  cores-priced tree (scripts/sim-localized-economy.ts pins it). */
  hiveMatsShare: 0.3,
  /** Value model — core-equivalents per unit of each drop kind. The budget is priced in cores;
   *  every grant spends its slice through these rates, so the idle<active guardrail can price a
   *  whole harvest and future drops stay calibrated by giving them a rate here. */
  valuePerUnit: {
    cores: 1, mats: 2.5, essence: 1.2, towerShard: 3, heroShard: 5,
    mulligan: 60, container: 350, runCache: 250, ichor: 40,
    hiveMats: 1, tissue: 1.2, // Chitin ↔ core parity; Tissue prices like the essence it replaced
  } as Record<string, number>,
};

/** Campaign EVOLUTION CAP (docs/EVOLUTION-CAP.md) — the highest Star tier a tower may be evolved
 *  to is gated by CAMPAIGN progress, not Tower Shards alone. Clearing each `stage` permanently
 *  unlocks evolving towers up to `maxStar` account-wide — "a new generation of biological
 *  mutation." Ascending; the last row's `maxStar` is the absolute cap. Shards are the FUEL,
 *  Campaign is the PERMISSION: both must be satisfied to buy a star. */
export const EVOLUTION_CAPS: readonly { stage: number; maxStar: number }[] = [
  { stage: 1, maxStar: 2 }, // a fresh account can still evolve to ★2 (default below this row)
  { stage: 10, maxStar: 3 }, // ★3 = specialization fork opens
  { stage: 25, maxStar: 4 },
  { stage: 50, maxStar: 5 }, // ★5 = fully-evolved base form
  { stage: 80, maxStar: 6 }, // ★6+ = ascension band
  { stage: 120, maxStar: 7 },
  { stage: 170, maxStar: 8 },
  { stage: 230, maxStar: 9 },
  { stage: 300, maxStar: 10 }, // apex organism
];

/** The Evolution Cap for a given highest-cleared Campaign stage: the `maxStar` of the last
 *  EVOLUTION_CAPS row with `stage ≤ highest` (defaults to the first row so a fresh account, 0
 *  cleared, can reach ★2). Pure; the single source of truth shared by the UI + the buy-path. */
export function campaignStarCap(highestStageCleared: number): number {
  let cap = EVOLUTION_CAPS[0].maxStar;
  for (const e of EVOLUTION_CAPS) if (highestStageCleared >= e.stage) cap = e.maxStar;
  return cap;
}

/** The next EVOLUTION_CAPS row that raises the cap above `maxStar` (null once at the absolute
 *  cap) — drives the "Reach Campaign Stage N to evolve to ★X" preview. */
export function nextEvolutionUnlock(maxStar: number): { stage: number; maxStar: number } | null {
  for (const e of EVOLUTION_CAPS) if (e.maxStar > maxStar) return e;
  return null;
}

/** STAR MUTATION TIERS (docs/TOWER-VISUAL-EVOLUTION.md) — the shared *generation* taxonomy: a
 *  tower visibly mutates every two stars. Used by BOTH the visual-evolution renderer and the
 *  Tower Lab's "upcoming visual mutation" preview, so the look and the label never drift. `at` =
 *  the star the generation begins; it persists until the next tier's `at`. */
export const STAR_MUTATION_TIERS: readonly { at: number; name: string; desc: string }[] = [
  { at: 1, name: 'Base Organism', desc: 'The unmutated base form.' },
  { at: 3, name: 'Minor Mutation', desc: 'Additional limbs, glowing veins, armor growth, a new firing organ.' },
  { at: 5, name: 'Large Mutation', desc: 'A larger, more aggressive silhouette and improved projectiles.' },
  { at: 7, name: 'Advanced Mutation', desc: 'Animated biological structures, larger attack effects, organic movement.' },
  { at: 9, name: 'Ultimate Organism', desc: 'A fully evolved, prestige-level silhouette with legendary effects.' },
];

/** The STAR_MUTATION_TIERS generation a tower of `star` is currently in (the last row with
 *  `at ≤ star`; the Base Organism for ★0–2). */
export function starMutationTier(star: number): { at: number; name: string; desc: string } {
  let t = STAR_MUTATION_TIERS[0];
  for (const m of STAR_MUTATION_TIERS) if (star >= m.at) t = m;
  return t;
}

/** The next STAR_MUTATION_TIERS generation above `star` (null once at the Ultimate tier) — drives
 *  the "upcoming visual mutation" preview on a locked star. */
export function nextStarMutationTier(star: number): { at: number; name: string; desc: string } | null {
  for (const m of STAR_MUTATION_TIERS) if (m.at > star) return m;
  return null;
}

/** Infinite mastery: signals → XP, an ever-growing requirement curve, tiny buff. */
export const MASTERY = {
  // XP earned per signal while a tower is deployed (placeholder weights).
  xpPerKill: 4,
  xpPerDamage: 0.02,
  xpPerActiveSecond: 1,
  // Requirement curve — XP for the (n+1)-th level grows geometrically, so levels
  // come ever more slowly but NEVER stop (supports "increase forever").
  baseReq: 100, // XP from level 0 → 1
  reqGrowth: 1.12, // +12% required per level (compounding)
  // Permanent reward per mastery level: small, unbounded (milestones come later).
  damagePerLevel: 0.004, // +0.4% tower damage per level
};

// ── Loot boxes (run-end reward chests) ──────────────────────────────────────
// Expandable to multiple chest rarities later; one is defined today. A chest is a
// number of independent reward "rolls"; each roll grants tower shards, or (small
// chance) hero shards. Duplicate protection is intentionally not modelled yet.
/** Reveal flare tiers (shared with equipment's Rarity literals). */
export type LootRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'exotic';
export type MaterialKind = 'mutagen' | 'scrap' | 'catalyst';

/** One reward pool a chest roll can land in — DATA-DRIVEN so a new reward system is
 * added here, not in roller code. Future pools (cosmetic/relic/event) are real
 * shapes; a chest simply gives them weight once that content exists. */
export type PoolSpec =
  | { pool: 'tower'; range: [number, number] }
  | { pool: 'hero'; range: [number, number] }
  | { pool: 'material'; mats: MaterialKind[]; range: [number, number] }
  | { pool: 'equipment'; wave: number } // equipment quality scales with `wave`
  | { pool: 'cosmetic'; ids: string[] } // future seam
  | { pool: 'relic'; ids: string[] } // future seam
  | { pool: 'event'; currency: string; range: [number, number] }; // future seam

/** A weighted entry in a chest's loot table. `rarity` = the reveal flare for items
 * from this pool (equipment overrides with its own rolled rarity). */
export interface WeightedPool {
  weight: number;
  rarity?: LootRarity;
  spec: PoolSpec;
}

export interface ChestDef {
  id: string;
  name: string;
  rarity: string; // chest tier id (standard → rich → prime)
  rolls: number; // independent reward pulls revealed in sequence
  pools: WeightedPool[]; // weighted reward table — tiers emphasize different pools
}

// Each tier emphasizes different reward pools (the rarity → reward-pool mapping):
//   standard = tower-shard floor; rich = adds equipment + materials; prime = leans
//   hard into equipment + hero + premium materials. Pools are data — retuning the
//   reward economy is a weight edit, and a new reward system is a new pool entry.
export const CHESTS: Record<string, ChestDef> = {
  standard: {
    id: 'standard',
    name: 'Biomass Cache',
    rarity: 'standard',
    rolls: 4,
    pools: [
      { weight: 6, rarity: 'common', spec: { pool: 'tower', range: [2, 5] } },
      { weight: 2, rarity: 'rare', spec: { pool: 'hero', range: [1, 1] } },
      { weight: 3, rarity: 'common', spec: { pool: 'material', mats: ['scrap', 'mutagen'], range: [1, 2] } },
    ],
  },
  rich: {
    id: 'rich',
    name: 'Mutagen Vault',
    rarity: 'rich',
    rolls: 5,
    // Shards + materials only — EQUIPMENT no longer drops per-roll here; it comes from the single
    // power-scaled container roll (EQUIP_DROP_CHANCE) so a container yields at most one item.
    pools: [
      { weight: 6, rarity: 'rare', spec: { pool: 'tower', range: [3, 7] } },
      { weight: 3, rarity: 'rare', spec: { pool: 'hero', range: [1, 2] } },
      { weight: 3, rarity: 'rare', spec: { pool: 'material', mats: ['scrap', 'mutagen', 'catalyst'], range: [1, 3] } },
    ],
  },
  prime: {
    id: 'prime',
    name: 'Apex Reliquary',
    rarity: 'prime',
    rolls: 6,
    // Shards + materials only — see `rich` (equipment is the single power-scaled container roll).
    pools: [
      { weight: 5, rarity: 'epic', spec: { pool: 'tower', range: [5, 10] } },
      { weight: 4, rarity: 'epic', spec: { pool: 'hero', range: [1, 2] } },
      { weight: 3, rarity: 'epic', spec: { pool: 'material', mats: ['catalyst', 'mutagen'], range: [2, 4] } },
    ],
  },
};

// Chests self-register; lookups (rollChest, chestForWave) resolve by id via the registry.
export const chestRegistry = new Registry<ChestDef>('chest', {
  idOf: (d) => d.id,
  validate: (d) => (d.rolls > 0 ? [] : ['rolls must be > 0']),
});
chestRegistry.registerAll(Object.values(CHESTS));

/** Default chest (debug / fallback). */
export const RUN_CHEST = 'standard';

/** Probability that cracking a container ALSO yields equipment (docs/EQUIPMENT.md). At most ONE item
 *  per container; its item level + rarity band follow the account's DEPTH (ITEM_LEVEL_CURVE). Centralized tunable. */
export const EQUIP_DROP_CHANCE = 0.5;

/** THE GEAR CHASE (docs/EQUIPMENT.md §gear-chase, 2026-11): a container drop's ITEM LEVEL derives from the
 *  account's DEPTH — the deepest cleared Campaign stage, or Infinite's best wave × `infiniteWeight` when
 *  that reads deeper — on a LOG curve with NO cap: ilvl = 1 + perLn × ln(1 + depth / depthScale).
 *  Stage 10 ≈ i10 · 30 ≈ i20 · 60 ≈ i27 · 100 ≈ i33 (T6 affixes, maxTierForIlvl) · 150 ≈ i38 · 300 ≈ i47:
 *  every band of play raises the ceiling and the curve never flattens into a wall. Replaced the
 *  Power-linear ilvl that capped at 30 by ≈ hour 3 and froze the chase (BALANCE_ARCHITECTURE §10). */
export const ITEM_LEVEL_CURVE = { perLn: 13.5, depthScale: 10, infiniteWeight: 0.5 };

/** Rarity odds per ITEM-LEVEL BAND (docs/EQUIPMENT.md §gear-chase). A row covers item levels from
 *  `fromIlvl` up to the next row (8-level bands = the affix-tier ceilings). `common…legendary` are
 *  RELATIVE weights; `exotic` is the ABSOLUTE chance the drop is an Apex (hand-designed fixed item).
 *  Deeper bands lift the rare tail without ever making Rampant/Apex routine (≈ 1 per hour mid-game,
 *  ≈ 2 per hour deep — was 4–6 per hour in EVERY band). One row per band; append to extend. */
export const GEAR_RARITY_BANDS: readonly { fromIlvl: number; common: number; rare: number; epic: number; legendary: number; exotic: number }[] = [
  { fromIlvl: 1, common: 70, rare: 26, epic: 4, legendary: 0, exotic: 0 },
  { fromIlvl: 9, common: 56, rare: 32, epic: 10, legendary: 2, exotic: 0.005 },
  { fromIlvl: 17, common: 45, rare: 34, epic: 16.5, legendary: 4.5, exotic: 0.01 },
  { fromIlvl: 25, common: 37, rare: 35, epic: 21, legendary: 7, exotic: 0.015 },
  { fromIlvl: 33, common: 31, rare: 34, epic: 25, legendary: 10, exotic: 0.025 },
  { fromIlvl: 41, common: 27, rare: 33, epic: 28, legendary: 12, exotic: 0.03 },
];

/** Crafting-material drop from a container (docs/EQUIPMENT.md §Materials) — the SECONDARY source,
 *  deliberately below EQUIP_DROP_CHANCE so equipment stays the primary crafting feeder. At most one
 *  material stack per container. `catalyst` is the RARE material (extremely uncommon), pity-protected:
 *  after `rarePity` containers without one, the next drop is a guaranteed catalyst. All tunables here. */
export const MATERIAL_DROP = {
  baseChance: 0.3, // chance a container yields a common material (mutagen/scrap)
  chancePerRarity: 0.04, // + per container-rarity tier (common=0 … exotic=+0.16)
  chanceCap: 0.55,
  commonRange: [1, 2] as [number, number], // base common-material quantity (small)
  commonBonusPerScale: 1.4, // + up to this × the progression scale (power+stage+rarity), rounded
  commonMax: 6, // hard cap on a common stack
  rareBaseChance: 0.03, // catalyst chance WHEN a material drops — extremely uncommon
  rarePowerDiv: 9000, // + power/ this
  rareStageDiv: 260, // + stage/ this
  rareChancePerRarity: 0.02, // + per container-rarity tier
  rareChanceCap: 0.18,
  rarePity: 22, // containers without a catalyst → the next material is a guaranteed catalyst
  rareHighScale: 2.2, // a catalyst yields 2 (not 1) once the progression scale clears this
  powerScaleDiv: 2600, // progression scale = 1 + power/this + …
  stageScaleDiv: 55, //                         + stage/this
} as const;

/** Reward pacing: deeper runs earn a better chest, pulling "one more run". */
export function chestForWave(wave: number): string {
  if (wave >= 12) return 'prime'; // full extraction
  if (wave >= 7) return 'rich'; // cleared the mid-game
  return 'standard';
}

// Heroes that can receive hero shards — derived from the registry, not hand-listed.
export const HERO_IDS: string[] = heroRegistry.ids();
export const HERO_LABELS: Record<string, string> = Object.fromEntries(
  heroRegistry.all().map((d) => [d.kind, d.name]),
);

// ── Boss framework (boss.ts) ────────────────────────────────────────────────
export const BOSS = {
  baseHp: 1600, // × BossDef.hpMult → boss HP
  baseArmor: 14, // armor of a boss whose def sets none (every procedural boss)
  addCap: 28, // fairness cap on a spawner boss's concurrent adds (uses the global maxEnemies too)
  chargeSpeedMult: 2.6, // charger module: movement multiplier during a telegraphed dash
  gripExposeMult: 1.25, // corecrush counterplay: damage TAKEN while gripping the Nucleus (burst it off)
};

// ── Boss Rush (docs/BOSS-RUSH.md) — the third pillar: wave N deploys N procedural bosses ──────
// The escort chaff rides the endless intensity curves; the bosses themselves scale by Threat
// Level (assembleBoss quality: modules/phases/HP/damage), so depth raises QUALITY as the count
// raises pressure. Rewards are keyed to bosses defeated (meta.finishRun), not depth survived.
export const RUSH = {
  bossTlBase: 2, // Threat Level of wave 1's boss
  bossTlPerWave: 3.2, // + per wave — bosses assemble stronger as their number grows (probe-tuned: shallow curves let built accounts cruise past wave 15)
  bossStagger: 2.6, // seconds between boss deployments inside a wave (a readable siege COLUMN, not a wall)
  escortKeepEvery: 2, // keep every Nth scheduled escort spawn — the chaff is a screen, the bosses ARE the wave
  draftEvery: 2, // Gene Card draft cadence: every 2nd cleared wave (denser than deep Infinite, leaner than Campaign)
  corePerBoss: 3, // run-end Genome Cores per boss defeated — the mode's primary payout lane …
  lootPerBoss: 27, // … + loot points per boss defeated (secondary lane; both scale ~N² with depth). ×1.5 with
  // THE WALL (§wall, 2026-11): runs now end at waves 8–12 in minutes instead of stalling for 30 — per-minute
  // pay holds the old band without the stalemate farm (docs/BOSS-RUSH.md §wall table).
  // Strength curve (probe-tuned; THE WALL 2026-11, docs/BOSS-RUSH.md §wall): boss HP + contact
  // damage × (base + perWave·(min(N, geoFromWave) − 1)) × geoGrowth^max(0, N − geoFromWave).
  // Waves 1–3 field REDUCED bosses (a stage-finale boss vs an opening board is a coin-flip wipe);
  // the linear climb reaches ×2.2 at wave 10, then the column grows GEOMETRICALLY — the old ×2.6
  // cap let built accounts cruise to wave 30+ at full integrity until the 30-minute cap.
  strengthBase: 0.4, // wave 1 bosses at 40% …
  strengthPerWave: 0.2, // … +20%/wave → ×1.0 at wave 4 → ×2.2 at wave 10 …
  geoFromWave: 10, // … then GEOMETRIC past this wave …
  geoGrowth: 1.25, // … ×1.25 per wave, uncapped (HP; contact damage still stops at damageCap)
  // Sized to the ACCOUNT (§wall): boss HP × S^t, S = clamp((Power Score / powerRef)^powerExp,
  // powerScaleMin, ∞), t ramping 0 → 1 across waves powerRampFrom → powerRampTo (geometric blend):
  // the opening duels stay the warm-up every account breezes, the column catches up to the account by
  // wave 10, then the geometric climb walls it. powerRef ≈ the median account at the Stage-12 unlock
  // (progression sim: ~15k at ~1h) so a fresh gauntlet reads the probe-tuned curve; powerExp < 1 keeps
  // Power meaningful — a 37× account goes a few waves deeper, not 30. RunOptions.rushPower carries
  // the Power the run starts at.
  powerRef: 15000,
  powerExp: 0.75,
  powerScaleMin: 0.5,
  powerRampFrom: 4,
  powerRampTo: 10,
  // THE COLUMN DOESN'T WAIT (§wall): this long after a wave's LAST boss deploys, the next column
  // marches in on top of whatever still stands (no prep, no draft) — a board that can't keep pace
  // is buried instead of stalling a 30-minute stalemate.
  columnGraceSec: 28,
  // The Boss Rush PREDICTION (core/predict.ts predictBossRush), fit to the §wall measurement (real runs,
  // 5 progression-sim accounts × 5 seeds): the sized column walls every account near wave 10, Power
  // buying only a sliver more — reach ≈ predictWall + predictPerDoubling × log2(Power / powerRef).
  predictWall: 10,
  predictPerDoubling: 0.15,
  // The rush-short qualify gate keys to min(record, qualifyRecordCap): a pre-wall veteran record
  // (wave 30+ under the old uncapped-stall curve) must not lock the gauntlet's containers forever.
  qualifyRecordCap: 14,
  // Stamina (docs/BOSS-RUSH.md §stamina): the gauntlet's session pacing. Lazy-computed —
  // nothing ticks; the value derives from (stored value, updatedAt) on read.
  staminaMax: 100, // regen ceiling …
  staminaOverflowMax: 120, // … grants (market packs) may overflow to this hard cap
  staminaCost: 20, // per gauntlet entry (the FIRST entry of each day is free)
  staminaRegenSec: 180, // +1 stamina per 3 minutes
  damageCap: 1.5, // contact damage stops climbing here — deep walls should be OUT-TANKED-then-out-DPSed, not one-shot roulette (keeps account power meaningful, probe)
  openingBiomass: 170, // extra starting biomass — the hive fortifies BEFORE the first column (a boss duel needs a real board, probe-verified)
  bossBounty: 95, // FLAT biomass per rush boss — TL-scaled bounty made every difficulty lever self-funding (the column paid for the board that kills it); flat pay ⇒ income grows with N, costs grow with N×TL ⇒ a real wall forms (probe)
};

/** Boss Rush column strength at a depth (docs/BOSS-RUSH.md §wall) — the linear ease-in to
 *  RUSH.geoFromWave, then ×geoGrowth per wave. The ONE formula the sim (game.startBossRushWave)
 *  and the docs read. Pure. */
export function rushStrength(depth: number): number {
  const n = Math.max(1, depth);
  return (RUSH.strengthBase + RUSH.strengthPerWave * (Math.min(n, RUSH.geoFromWave) - 1)) * Math.pow(RUSH.geoGrowth, Math.max(0, n - RUSH.geoFromWave));
}

// ── Daily Run (docs/DAILY-RUN.md) — the fourth pillar: one deterministic seed per UTC day
// generates the SAME 20-wave run worldwide. A rolled biome, a seeded boss roster/order, TWO
// gameplay modifiers, and a 3-tower trial Conveyor pool rolled from the FULL registry. No
// difficulty selector — one shared ruleset. Centralized tunables so a daily is data, not code;
// dailyModifiers.ts reads its magnitude numbers from DAILY.mod (never inline literals). Golden-
// safe by construction: the sim only ever sees these values through the neutral ResolvedEffects
// (mults 1 / adds 0) unless a run boots in 'daily' mode with modifier ids.
export const DAILY = {
  waveCount: 20, // win by clearing wave 20 (finite, like Campaign — no endless extension)
  bossWaves: [7, 14, 20] as const, // two mid-bosses + the finale (order comes from the seed)
  poolSize: 3, // trial-tower Conveyor pool kinds (duplicates allowed — independent rolls)
  modifierCount: 2, // TWO distinct gameplay modifiers per day
  unlockStage: 5, // Campaign stage that opens the Daily pillar (MODE_UNLOCKS.daily)
  // Scaling: an effective campaign-stage band (drives roster gating + HP/reward scaling via the
  // campaign machinery) and a rolled HP-scaling scalar — the day-to-day difficulty variance.
  stageMin: 12,
  stageMax: 20,
  waveScalingMin: 0.9,
  waveScalingMax: 1.25,
  musicTrackCount: 3, // seeded combat/boss track index the audio layer maps (core stores a plain number)
  // Clear reward (docs/DAILY-RUN.md §rewards) — Genome Cores paid ONCE per day on the first clear;
  // a consecutive-day streak adds a capped kicker (streak day 2 ⇒ +1×bonus, …).
  reward: {
    clearCores: 45,
    streakBonus: 8, // extra cores per consecutive streak day beyond the first
    streakBonusCap: 5, // the kicker stops growing past 5 streak days (45 + 40 = 85/day at cap)
  },
  // ── Modifier magnitudes (read by dailyModifiers.ts) — tuned dramatic-but-clearable ──
  mod: {
    enemySpeedMult: 1.3, // #1 Overrun
    heroDamageMult: 2.0, // #2 Blood Frenzy — double damage …
    heroDrainFrac: 0.02, // … but drain 2% of hero max-HP per second
    incomeMult: 0.65, // #3 Famine — ~-35% biomass income
    towerRangeMult: 0.75, // #4 Myopia — ~-25% tower range
    branchCostMult: 1.5, // #5 Scarcity — +50% branch-tier cost
    enemyArmorAdd: 8, // #6 Ironhide — flat armor add
    draftEveryWaves: 3, // #7 Dormancy — gene cards draft every 3 waves
    eliteChance: 0.12, // #8 Infestation — per-spawn elite promotion chance
    towerRateMult: 1.35, // #9 Overclock — +attack speed …
    towerDamageMult: 0.75, // … −damage trade
    hiveRegenFrac: 0.01, // #10 Regeneration — the friendly one: +1% max-integrity per second
  },
} as const;

// ── AI Director / run modes (director.ts) ───────────────────────────────────
// The Director generates Endless waves from a threat budget; Stage mode stays the
// authored WAVES (so the golden run is untouched). Tunables are illustrative.
export const DIRECTOR = {
  baseBudget: 12, // threat points spent on wave 1 of endless
  budgetGrowth: 0.16, // +16% budget per depth — the EARLY population ramp …
  budgetCap: 150, // … CAPPED here (~depth 18): the battlefield population plateaus, then HP/elites
  // scale, NOT count (docs/ENDLESS-SCALING.md). Stops the biomass snowball that rode hordes to 50+.
  eliteChanceBase: 0.08, // elite promotion chance, rises with depth
  eliteChancePerDepth: 0.015,
  bossEvery: 5, // a (mini)boss caps every N endless waves
  swarmEvery: 4, // a swarm-event wave every N waves
  swarmMinDepth: 6, // no floods before the board exists (siege combat makes them lethal, not leaky)
  ehpBase: 120, ehpPerDepth: 55, // endless roster gate: max effective HP a depth may field (docs/HIVE-SIEGE.md §balance)
  eliteHpMult: 3, // an elite-promoted enemy's HP / damage / bounty multipliers
  eliteDmgMult: 1.5,
  eliteBountyMult: 3,
  // threat cost per archetype (cheaper = more of them in a wave). New roles cost more so the
  // Director fields fewer of them; anything omitted falls back to 2 (see Director.spend).
  cost: {
    runner: 1, mite: 0.6, larva: 0.7,
    rusher: 1.2, darter: 1.4, lasher: 1.5,
    brute: 3, tank: 4, golem: 4.5, colossus: 14,
    bulwark: 3.5, warden: 6,
    knitter: 3, revenant: 5,
    burrower: 2.4, molerat: 2.6,
    flyer: 2.2, wisp: 2, gargoyle: 4.5,
    broodmother: 7, hivecaller: 7,
    mender: 5, cantor: 5,
    bomber: 2.5, popper: 2.8,
    siegeworm: 6, spitter: 3.5,
    apex: 10, dreadnought: 16, tyrant: 20,
    // puzzle fauna (docs/ENEMIES.md §puzzle) — priced like their trait-family neighbours
    scuttler: 3, blightmoth: 3, borer: 4, shellback: 6.5, wispmother: 7.5, veilmoth: 5.5,
  } as Record<string, number>,
  // ── Deep-composition policy (docs/ENDLESS-SCALING.md §deep-tilt) — ENDLESS ONLY. Gated by the
  //    Director's `deepTilt` flag (set only for mode 'endless'; Boss Rush + shallow endless are
  //    UNTOUCHED). Past `heavyCapMinDepth` the wave's HEAVY-class budget share is CAPPED and
  //    decays with depth, so deep waves tilt toward FAST + mid bodies IN NUMBERS (pressure through
  //    pace) instead of a wall of 2–3 geometric-HP sponges. The wave still fields SOME heavies
  //    (up to the cap) — the boss is the intended durable centerpiece (ENDLESS.bossStrength*). ──
  heavyKinds: ['brute', 'tank', 'golem', 'colossus', 'warden', 'revenant', 'dreadnought', 'tyrant', 'gargoyle', 'siegeworm', 'zealot', 'carrier', 'entrencher', 'shellback'] as EnemyKind[],
  heavyCapMinDepth: 20, // below this the cap is INACTIVE ⇒ shallow endless == baseline (and the director test's depth 1/9 budget check is unaffected)
  heavyBudgetFracBase: 0.5, // at heavyCapMinDepth heavies may take ≤50% of the threat budget …
  heavyBudgetFracMin: 0.2, // … decaying to a ≥20% floor deep — still SOME heavies (elites inflate HP share above this), never a sponge wall
  heavyBudgetDecayPerDepth: 0.02, // −2 percentage-points of heavy budget share per depth past heavyCapMinDepth
  // When the heavy budget is spent, the remainder buys from the shape's NON-heavy kinds — or this
  // SPEEDIER, high-HP / high-damage pool when the shape is all-heavy (armored/elite). This is the
  // "pace, not sponge" tilt: apex (fast bruiser) + rushers/darters/lashers + mid bodies in numbers.
  deepFastPool: ['rusher', 'darter', 'lasher', 'apex', 'molerat', 'flyer', 'bomber'] as EnemyKind[],
};

// Endless INTENSITY curves (docs/ENDLESS-SCALING.md). Applied ONLY in endless mode — Stage keeps
// its own linear hpMultFor/bountyMultFor, so the golden run is byte-identical. Health is geometric
// (the PRIMARY wall, once the population caps); damage + speed rise gradually; bounty lags HP so
// deep enemies are biomass-inefficient (income falls on long runs instead of snowballing).
export const ENDLESS = {
  hpGrowth: 1.12, // × enemy HP per depth (geometric → eventually outpaces any fixed DPS)
  damageGrowth: 0.07, // +7% enemy damage per depth (linear) — deep LEAKS genuinely threaten integrity (was 0.05; ×3.7 at depth 40)
  speedGrowth: 0.014, // +1.4% enemy speed per depth — deep waves press through PACE, not sponge (was 0.004)
  speedCap: 1.85, // … clamped at +85% so pathing/animation stays readable (was 1.5) — speed keeps climbing meaningfully into deep waves (≈+55% at depth 40, cap ≈ depth 66)
  bountyGrowth: 0.03, // +3% per-enemy biomass per depth (slower than HP → diminishing income)
  // Procedural boss depth-durability (docs/ENDLESS-SCALING.md §boss). Endless bosses ride the
  // shared spawnProceduralBoss `strengthScale` param (× def.hpMult; contact damage × min(RUSH.damageCap,·)).
  // Boss HP otherwise only scales +5%/TL (assembleBoss quality, ×3 at depth 40) while the trash wall
  // is geometric (×83) — so a depth-40 boss was out-tanked by its own elite escort. This curve is ≈1
  // at the first boss depth and grows so a deep boss is a REAL fight. Boss Rush passes its OWN ramp
  // (RUSH.strength*) at its call site and is UNTOUCHED.
  bossFirstDepth: 5, // the first procedural boss depth (mirrors DIRECTOR.bossEvery) — strength is ×1 here
  bossStrengthPerDepth: 0.14, // +14% boss HP per depth past the first boss …
  bossStrengthCap: 6, // … up to ×6 (a durable centerpiece; calibrated against the endless probe's boss-TTK)
};

/** INFINITE SQUEEZE (docs/ENDLESS-SCALING.md §squeeze — Batch G grind audit): Infinite was flawless
 *  for ~48 waves, then ONE wave wiped the Core. Two levers turn the cliff into attrition, Infinite
 *  only (RunOptions.squeeze — the Arena and headless probes that omit it are unchanged):
 *  • the PRESSURE BAND — a flawless wave past `fromDepth` raises enemy HP pressure ×(1+rise) (to
 *    `cap`); a wave that drains ≥ `easeAt` of max integrity eases it ×(1−ease) (down to `floor`), so
 *    a comfortable board meets the wall sooner and a bleeding one limps on instead of being kicked;
 *  • the BREACH CEILING — once one wave has drained `waveLossCap` of max integrity, further enemy
 *    hits that wave land at ×`overflowMult` (the Core braces), so the end takes several waves. */
export const ENDLESS_SQUEEZE = {
  fromDepth: 10, // the band starts measuring here (the opening depths stay a pure build-up)
  rise: 0.04, // ×(1+rise) enemy HP pressure per flawless wave …
  cap: 1.4, // … up to this (the first fit's ×2 cost ~20 depths of record on a 100 h board; ×1.6 still ~15)
  easeAt: 0.1, // a wave that drains ≥ this share of max integrity …
  ease: 0.2, // … eases the pressure ×(1−ease) …
  floor: 0.85, // … down to this: a bleeding board limps on a few waves (records hold; the end is a squeeze)
  waveLossCap: 0.34, // per-wave breach ceiling (share of max integrity) …
  overflowMult: 0.1, // … past it, enemy hits land at this fraction (0.2 still let one collapse wipe 303 in a wave)
};

// ── Infinite depth-camping taper (docs/MODE-IDENTITY.md §anti-grind, docs/ENDLESS-SCALING.md §taper) ──
// ENDLESS ONLY. Loot-meter and Mastery-XP accrual earn FULL value through `startWave`, then a smooth
// exponential decay toward `floor` — so camping ever deeper stops out-earning simply re-running. The
// curve is identity (×1) at or below startWave, so shallow endless + every other mode are UNCHANGED.
export const ENDLESS_TAPER = {
  startWave: 30, // full value (×1) through here …
  floor: 0.25, // … then decaying toward this residual floor (never zero — deep still pays a little) …
  halfLife: 15, // … halving the above-floor part every this many waves past startWave
};

/** Per-wave diminishing-returns factor for DEEP endless farming. 1.0 through `startWave`, then a
 *  smooth exponential decay toward `floor`. Endless ONLY; identity (×1) for wave ≤ startWave. */
export function endlessTaper(wave: number): number {
  const { startWave, floor, halfLife } = ENDLESS_TAPER;
  if (wave <= startWave) return 1;
  return floor + (1 - floor) * Math.pow(0.5, (wave - startWave) / halfLife);
}

/** Σ endlessTaper(w) for w = 1..wave — the "effective wave count" (tapered). Closed form: a flat run
 *  of 1s to startWave + a floor line + a geometric tail. Strictly increasing ⇒ a monotonic meter. */
export function endlessTaperedWaveSum(wave: number): number {
  const { startWave, floor, halfLife } = ENDLESS_TAPER;
  if (wave <= startWave) return Math.max(0, wave);
  const n = wave - startWave; // waves past the taper start
  const r = Math.pow(0.5, 1 / halfLife); // per-wave decay ratio ∈ (0,1)
  const geo = (r * (1 - Math.pow(r, n))) / (1 - r); // Σ_{j=1}^{n} r^j
  return startWave + floor * n + (1 - floor) * geo;
}

/** The one loot multiplier applied to endless run income (live meter AND run-end) — the AVERAGE
 *  per-wave taper, S(wave)/wave. Identity ≤ startWave; falls toward `floor` deep. Using the average
 *  keeps the live meter smooth + monotonic while the per-wave increment still ∝ endlessTaper(wave). */
export function endlessLootTaper(wave: number): number {
  return wave > 0 ? endlessTaperedWaveSum(wave) / wave : 1;
}

// ── Universal Difficulty Director: ADAPTIVE factor weights (docs/DIFFICULTY_DIRECTOR.md) ──
// Player-relative scaling seams composed into the director's threat/reward chains. Balance
// changes must come from the progression simulator / harness, not intuition; tuning them is a
// data edit here, ever. The STATIC boot-time path stays an exact ×1 (IEEE-754 identity, golden-
// safe) because nothing supplies AdaptiveInputs.powerRatio.
export const DIRECTOR_ADAPTIVE = {
  // ACTIVATED 2026-11 on harness evidence (docs/DIFFICULTY_DIRECTOR.md §6a — the Batch G grind
  // audit): fed with the run's LIVE board power on Campaign waves ≥ liveFromWave + boss bodies.
  threatPerPowerRatio: 0.3, // ×(1 + w·(powerRatio−1)) on enemy HP/damage curves
  rewardPerPerformance: 0, // ×(1 + w·recentPerformance) on bounty/reward curves
  // LIVE board power: a Campaign run whose app passes RunOptions.livePowerBase (account Power ÷
  // the stage's recommended Power) re-feeds the seam at every wave launch with that × the run's
  // temporary Power (cards, Hero Evolution, branches, strains — ×60–90 by a 12-wave finale) — the
  // snowball that made waves 4+ a formality meets a real finale. Upward only (never props a weak
  // board up). Harness sweeps (docs/DIFFICULTY_DIRECTOR.md §6a): v1 HP+pace caps 16/16 made a
  // winning 100 h run ×2.7 longer (the live HP was the slog); caps 3/4 fixed length but frontier wins
  // hit 87 / 82 %. v2 adds the BOARD term + a SPEED share: w 0.3 / cap 8 brings frontier wins back to
  // 73 / 59 % with matched-pair run time ×1.01 (8 h) and on par with v1 at 100 h.
  liveFromWave: 4, // waves before this are the opening (untouched — the opening build answers them)
  liveFromStage: 4, // Stages 1–3 keep their onboarding curve (docs/CAMPAIGN.md §curve — campaignCurve.test), like the answer gift
  liveCap: 8, // the live multiplier on chaff waves never exceeds this
  // …and lands three ways: HP × m^(1−p−s), spawn PACE × m^p, enemy SPEED × m^s. Pace-heavy (p 0.75)
  // proved EASIER (area boards love clumps); HP-only is a slog; speed adds threat while SHORTENING waves.
  livePaceShare: 0.2,
  liveSpeedShare: 0.5, // s — the speed part of the live multiplier …
  liveSpeedCeiling: 1.85, // … bounded so stage × live enemy speed never exceeds this (= ENDLESS.speedCap, the readability cap)
  liveBossCap: 4, // a BOSS body takes the whole live multiplier (no pace split — it can't be paced or pulled) up to this
  // BOARD term (§7): the live ratio also counts towers fielded vs an opening build — the Power Score's
  // temporary bucket never sees board growth (2 → 18 towers). (fielded / opening)^exp, floored at 1.
  liveBoardOpening: 3, // the opening build: 2 deploys + the run-start gift (docs/CAMPAIGN.md §grace)
  liveBoardExp: 1, // 0 = board term off; 1 = board power ∝ towers fielded
  // v3: DRAFTED cards in the live ratio ^ this (0 ⇒ excluded — a stronger pick must not also raise the
  // threat; Hero Evolution, branches and strains — Biomass investment — still count).
  liveCardExp: 1,
  // v3 COMPOSITION: up to this share of a live wave's groups is promoted to ELITE (fewer-but-stronger,
  // the campaign's own elite rule) — the threat lands as concentrated bodies that leak chip damage.
  liveEliteShare: 0,
};

// ── Adaptive Economy Framework: income-seam weights (docs/ECONOMY_FORMULAS.md) ──
// Catch-up boosts a behind-the-curve account's settle income; the ahead-taper cools a
// runaway one. Shipped at 0; ACTIVATED 2026-07 on progression-simulator evidence
// (BALANCE_ARCHITECTURE.md §7 round 3): the post-liveops faucet stack ran the optimal-play
// early game ~+50% past the tuned molt cadence while deep bands starved (dead-progression
// zones where farm income fell under the next geometric sink price, and a ×16 p10–p90 deep
// power spread). The seam is the designed counter-mechanism: it reads the account's distance
// from its OWN frontier bar, so it cools runaways and feeds stragglers with one dial each.
// Tune ONLY on regenerated simulator evidence (docs/PROGRESSION_REPORT.md).
export const ECONOMY_ADAPTIVE = {
  catchUpPerPowerGap: 0.35, // ×(1 + w·gap) when the account is BEHIND its frontier's power bar
  aheadTaperPerPowerGap: 0.5, // ÷(1 + w·|gap|) when far AHEAD of it
  maxCatchUpGap: 2, // gap clamp — catch-up saturates at ×(1 + w·this) (extreme comeback stays bounded)
  maxAheadGap: 0.9, // |gap| clamp — the taper saturates at ÷(1 + w·this) (never starves a snowball outright)
  minStage: 10, // onboarding floor: below this cleared stage the seam is OFF (fresh settles byte-identical)
};

// ── Future content registry: biomes (framework only — no content yet) ────────
// Towers/enemies/heroes/cards/upgrades/chests self-register above; bosses + equipment
// own registries in their modules (boss.ts / equipment.ts). Biomes have no content yet,
// so their registry stands ready for self-registration (STAGES.md / LIVING-HIVE.md).
export interface BiomeDef {
  id: string;
  name: string;
}
export const biomeRegistry = new Registry<BiomeDef>('biome', { idOf: (d) => d.id });
