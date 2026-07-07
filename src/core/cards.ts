// Gene Cards — the temporary run bucket (PROGRESSION.md §1.1, DESIGN.md §6.3).
// Cards are drafted between waves and RESET every run: they only ever mutate the
// run's RunModifiers / run state, never permanent meta. No React/DOM here.
//
// ── Architecture (built to scale to hundreds of cards) ───────────────────────
// A card is pure data: { id, name, rarity, category, description, apply }. Its
// effect lives ENTIRELY in `apply`, which mutates one shared bag — RunModifiers —
// of numeric knobs (multipliers/counters, default 1/0) and behavioral flags. The
// simulation reads that bag at a fixed set of HOOK POINTS (tower fire, projectile
// hit, on-shred, on-death, hero attack, enemy move, …). So adding a new card is
// always the same three-step move and never touches existing cards:
//   1) add a field to RunModifiers (+ its default),
//   2) read it at the relevant hook in game.ts,
//   3) append a CardDef here.
// Rarity weighting + distinct-draft logic below stay unchanged as the pool grows.
// A card may also carry an optional `gate` (a CardProgress predicate): such cards
// enter the draft pool only once the account hits a progression milestone. Gating
// is pure data (no per-card branching), so it scales with the pool like everything
// else — draftCards filters by it before rarity weighting.

import type { CardOption, CardRarity } from './types';
import type { Rng } from './rng';

/** The run "R bucket": every knob/flag a run accumulates from drafted cards. */
export interface RunModifiers {
  // ── stat knobs ──
  towerDamageMult: number;
  towerFireRateMult: number;
  splashRadiusMult: number;
  biomassMult: number;
  reactorBiomassMult: number;
  reactorOverchargeBonus: number;
  needleExtraProjectiles: number;
  mortarPoolDurationMult: number;
  poolDpsMult: number;
  fractureBonusStacks: number;
  corrosionSlowBonus: number;
  heroDamageMult: number;
  heroCooldownMult: number;
  heroSpeedMult: number;
  heroAttackRateMult: number;
  reactorAuraRadiusMult: number;
  needleBonusFracture: number;
  corrodedAmp: number; // +damage fraction to corroded enemies
  lineSlow: number; // extra slow on enemies inside the defensive zone
  adjacencyHaste: number; // +fire-rate per neighbouring tower
  buildCountdownMult: number; // scales the Build-Phase auto-start countdown (cards/upgrades)
  // ── behavioral flags / counters (modify HOW the game plays) ──
  mortarAppliesFracture: boolean;
  needleBounce: number; // needle shots ricochet to N more targets
  mortarExtraShell: number; // mortar lobs extra shells
  heroExtraStrikes: number; // hero hits this many extra times per swing
  corrosionSpread: boolean; // corroded deaths splash Corrosion to neighbours
  deathPools: boolean; // enemies leave a small acid pool on death
  deathBurst: boolean; // enemies release a damaging burst on death
  shredExplosion: boolean; // SHRED detonates an AoE
  apexKillReset: number; // kills shave this many seconds off Apex Leap
  heroLifestealOnKill: number; // hero heals this much per kill
  // ── progression-gated knobs (unlocked by account milestones; see CardProgress) ──
  integrityRegenPerWave: number; // Integrity restored each time a wave is cleared
  firstStrikeBonus: number; // +damage fraction to enemies still at full health
  executeThreshold: number; // instantly kill non-boss enemies below this HP fraction
  killFractureSplash: number; // Fracture applied to nearby enemies on every kill
  heroCorrosionAura: boolean; // the hero passively corrodes nearby enemies
}

export function defaultRunModifiers(): RunModifiers {
  return {
    towerDamageMult: 1,
    towerFireRateMult: 1,
    splashRadiusMult: 1,
    biomassMult: 1,
    reactorBiomassMult: 1,
    reactorOverchargeBonus: 0,
    needleExtraProjectiles: 0,
    mortarPoolDurationMult: 1,
    poolDpsMult: 1,
    fractureBonusStacks: 0,
    corrosionSlowBonus: 0,
    heroDamageMult: 1,
    heroCooldownMult: 1,
    heroSpeedMult: 1,
    heroAttackRateMult: 1,
    reactorAuraRadiusMult: 1,
    needleBonusFracture: 0,
    corrodedAmp: 0,
    lineSlow: 0,
    adjacencyHaste: 0,
    buildCountdownMult: 1,
    mortarAppliesFracture: false,
    needleBounce: 0,
    mortarExtraShell: 0,
    heroExtraStrikes: 0,
    corrosionSpread: false,
    deathPools: false,
    deathBurst: false,
    shredExplosion: false,
    apexKillReset: 0,
    heroLifestealOnKill: 0,
    integrityRegenPerWave: 0,
    firstStrikeBonus: 0,
    executeThreshold: 0,
    killFractureSplash: 0,
    heroCorrosionAura: false,
  };
}

/** Context a card effect can touch: run mods + a few immediate grants. */
export interface CardContext {
  mods: RunModifiers;
  grantBiomass: (n: number) => void;
  grantIntegrity: (n: number) => void;
  healHero: (maxBonus: number) => void;
}

/** The account-progression snapshot a gated card's unlock test reads — a small
 *  subset of the save (built by `meta.cardProgress()`). Kept local to cards.ts so
 *  the sim core stays free of the meta/achievement layer. When absent (headless /
 *  tests), gated cards stay locked, preserving the deterministic draft baseline. */
export interface CardProgress {
  totalRuns: number;
  bestWave: number; // deepest classic wave reached
  bestStage: number; // highest Stage cleared
  stagesCleared: number; // lifetime Stage clears
  bestEndlessWave: number; // deepest Endless wave reached
}

/** A progression gate on a card: human `requirement` copy (for the Codex/UI) plus the
 *  predicate the unlock check runs. Ungated cards (no `gate`) are always in the pool. */
export interface CardGate {
  requirement: string;
  test: (p: CardProgress) => boolean;
}

export interface CardDef {
  id: string;
  name: string;
  rarity: CardRarity;
  category: string;
  description: string;
  apply: (ctx: CardContext) => void;
  gate?: CardGate; // progression-gated cards enter the pool only once `gate.test` passes
}

/** Is a card draftable right now? Ungated → always. Gated → only when a progress
 *  snapshot is present AND its test passes (no snapshot ⇒ locked). */
export function isCardUnlocked(def: CardDef, progress?: CardProgress): boolean {
  if (!def.gate) return true;
  return progress ? def.gate.test(progress) : false;
}

export const CARD_POOL: CardDef[] = [
  // ── Common ──
  { id: 'sharpened_needles', name: 'Sharpened Needles', rarity: 'common', category: 'Tower Buff', description: '+12% tower damage.', apply: (c) => { c.mods.towerDamageMult *= 1.12; } },
  { id: 'rapid_glands', name: 'Rapid Glands', rarity: 'common', category: 'Tower Buff', description: '+12% tower fire rate.', apply: (c) => { c.mods.towerFireRateMult *= 1.12; } },
  { id: 'fertile_decay', name: 'Fertile Decay', rarity: 'common', category: 'Economy', description: '+18% biomass from kills.', apply: (c) => { c.mods.biomassMult *= 1.18; } },
  { id: 'biomass_surge', name: 'Biomass Surge', rarity: 'common', category: 'Economy', description: 'Gain 180 biomass now.', apply: (c) => c.grantBiomass(180) },
  { id: 'thick_marrow', name: 'Thick Marrow', rarity: 'common', category: 'Survival', description: '+45 max & current Integrity.', apply: (c) => c.grantIntegrity(45) },
  { id: 'twin_fang', name: 'Twin Fang', rarity: 'common', category: 'Crits', description: 'Needle Spitter fires +1 extra needle.', apply: (c) => { c.mods.needleExtraProjectiles += 1; } },
  { id: 'battle_stims', name: 'Battle Stims', rarity: 'common', category: 'Hero Buff', description: '+60 hero max & current HP.', apply: (c) => c.healHero(60) },

  // ── Rare ──
  { id: 'caustic_catalyst', name: 'Caustic Catalyst', rarity: 'rare', category: 'Mutation Synergy', description: 'Bone Mortar also applies Fracture — enabling SHRED on its own.', apply: (c) => { c.mods.mortarAppliesFracture = true; } },
  { id: 'volatile_marrow', name: 'Volatile Marrow', rarity: 'rare', category: 'AoE', description: '+35% splash radius, +8% tower damage.', apply: (c) => { c.mods.splashRadiusMult *= 1.35; c.mods.towerDamageMult *= 1.08; } },
  { id: 'fracture_cascade', name: 'Fracture Cascade', rarity: 'rare', category: 'Crits', description: '+3 max Fracture stacks (deeper shred & damage).', apply: (c) => { c.mods.fractureBonusStacks += 3; } },
  { id: 'apex_adrenaline', name: 'Apex Adrenaline', rarity: 'rare', category: 'Hero Buff', description: '+35% hero damage, −22% ability cooldown.', apply: (c) => { c.mods.heroDamageMult *= 1.35; c.mods.heroCooldownMult *= 0.78; } },
  { id: 'lingering_acid', name: 'Lingering Acid', rarity: 'rare', category: 'Poison', description: 'Corrosion pools last +60% longer and tick +30% harder.', apply: (c) => { c.mods.mortarPoolDurationMult *= 1.6; c.mods.poolDpsMult *= 1.3; } },
  { id: 'overcharged_veins', name: 'Overcharged Veins', rarity: 'rare', category: 'Tower Buff', description: '+25% reactor overcharge & +30% reactor biomass.', apply: (c) => { c.mods.reactorOverchargeBonus += 0.25; c.mods.reactorBiomassMult *= 1.3; } },
  { id: 'swarm_bounty', name: 'Swarm Bounty', rarity: 'rare', category: 'Economy', description: '+28% biomass from kills.', apply: (c) => { c.mods.biomassMult *= 1.28; } },

  // ── Behavioral — these change HOW the run plays, not just the numbers ──
  { id: 'ricochet_spores', name: 'Ricochet Spores', rarity: 'rare', category: 'Kinetic', description: 'Needle shots ricochet to 1 more enemy on hit.', apply: (c) => { c.mods.needleBounce += 1; } },
  { id: 'viral_bloom', name: 'Viral Bloom', rarity: 'rare', category: 'Mutation Synergy', description: 'When a corroded enemy dies, Corrosion spreads to those nearby.', apply: (c) => { c.mods.corrosionSpread = true; } },
  { id: 'frenzy_glands', name: 'Frenzy Glands', rarity: 'rare', category: 'Hero Buff', description: 'The hero strikes one extra time each attack.', apply: (c) => { c.mods.heroExtraStrikes += 1; } },
  { id: 'acidic_remains', name: 'Acidic Remains', rarity: 'rare', category: 'Poison', description: 'Enemies leave a small Corrosion pool where they die.', apply: (c) => { c.mods.deathPools = true; } },
  { id: 'hive_lattice', name: 'Hive Lattice', rarity: 'rare', category: 'Tower Buff', description: 'Towers fire +8% faster per adjacent tower.', apply: (c) => { c.mods.adjacencyHaste += 0.08; } },
  { id: 'detonation_cascade', name: 'Detonation Cascade', rarity: 'rare', category: 'Crits', description: 'SHRED detonates for AoE damage around the target.', apply: (c) => { c.mods.shredExplosion = true; } },
  { id: 'apex_hunger', name: 'Apex Hunger', rarity: 'rare', category: 'Hero Buff', description: 'Each kill shaves 0.5s off Apex Leap.', apply: (c) => { c.mods.apexKillReset += 0.5; } },
  { id: 'sanguine_coil', name: 'Sanguine Coil', rarity: 'rare', category: 'Survival', description: 'The hero heals 3 HP on every kill.', apply: (c) => { c.mods.heroLifestealOnKill += 3; } },
  { id: 'twin_mortars', name: 'Twin Mortars', rarity: 'rare', category: 'AoE', description: 'Bone Mortar lobs a second shell at another cluster.', apply: (c) => { c.mods.mortarExtraShell += 1; } },
  { id: 'volatile_decay', name: 'Volatile Decay', rarity: 'rare', category: 'AoE', description: 'Enemies rupture on death, damaging those around them.', apply: (c) => { c.mods.deathBurst = true; } },

  { id: 'tar_membrane', name: 'Tar Membrane', rarity: 'common', category: 'Poison', description: 'Enemies are slowed while inside your defensive zone.', apply: (c) => { c.mods.lineSlow += 0.18; } },
  { id: 'brittle_rot', name: 'Brittle Rot', rarity: 'common', category: 'Poison', description: 'Corroded enemies take +15% damage from all sources.', apply: (c) => { c.mods.corrodedAmp += 0.15; } },
  { id: 'sprawling_roots', name: 'Sprawling Roots', rarity: 'common', category: 'Tower Buff', description: '+30% Flesh Reactor aura radius.', apply: (c) => { c.mods.reactorAuraRadiusMult *= 1.3; } },
  { id: 'predator_instinct', name: 'Predator Instinct', rarity: 'common', category: 'Hero Buff', description: '+18% hero move speed.', apply: (c) => { c.mods.heroSpeedMult *= 1.18; } },
  { id: 'barbed_needles', name: 'Barbed Needles', rarity: 'common', category: 'Crits', description: 'Needle Spitter applies +1 Fracture per hit.', apply: (c) => { c.mods.needleBonusFracture += 1; } },
  { id: 'adrenal_surge', name: 'Adrenal Surge', rarity: 'common', category: 'Hero Buff', description: '+20% hero attack speed.', apply: (c) => { c.mods.heroAttackRateMult *= 1.2; } },

  // ── Progression-gated — rare-tier rewards that enter the pool only once the
  //    account clears a distinct milestone (meta.cardProgress → draftCards filter).
  //    Each opens a new HOOK, so they're behavioral, not just bigger numbers. ──
  { id: 'regenerative_carapace', name: 'Regenerative Carapace', rarity: 'rare', category: 'Survival', description: 'Restore 30 Integrity each time you clear a wave.', gate: { requirement: 'Finish 5 runs', test: (p) => p.totalRuns >= 5 }, apply: (c) => { c.mods.integrityRegenPerWave += 30; } },
  { id: 'ambush_enzyme', name: 'Ambush Enzyme', rarity: 'rare', category: 'Crits', description: '+45% damage to enemies still at full health.', gate: { requirement: 'Reach wave 8', test: (p) => p.bestWave >= 8 }, apply: (c) => { c.mods.firstStrikeBonus += 0.45; } },
  { id: 'culling_instinct', name: 'Culling Instinct', rarity: 'rare', category: 'Mutation Synergy', description: 'Instantly kill non-boss enemies that drop below 10% health.', gate: { requirement: 'Clear Stage 5', test: (p) => p.bestStage >= 5 }, apply: (c) => { c.mods.executeThreshold += 0.1; } },
  { id: 'viral_payload', name: 'Viral Payload', rarity: 'rare', category: 'Mutation Synergy', description: 'Every kill spreads 2 Fracture to nearby enemies.', gate: { requirement: 'Clear 15 Stages total', test: (p) => p.stagesCleared >= 15 }, apply: (c) => { c.mods.killFractureSplash += 2; } },
  { id: 'toxic_aura', name: 'Toxic Aura', rarity: 'rare', category: 'Poison', description: 'The hero exudes Corrosion, infecting nearby enemies.', gate: { requirement: 'Reach Endless wave 20', test: (p) => p.bestEndlessWave >= 20 }, apply: (c) => { c.mods.heroCorrosionAura = true; } },
];

const RARE_CHANCE = 0.32;

/** Draft `count` distinct cards, rarity-weighted, from the pool currently UNLOCKED
 *  for `progress` (ungated cards always; gated cards once their milestone is met).
 *  Omitting `progress` yields the ungated baseline — identical to the pre-gating
 *  draft, so headless/tests stay deterministic. */
export function draftCards(rng: Rng, count = 3, progress?: CardProgress): CardDef[] {
  const available = CARD_POOL.filter((c) => isCardUnlocked(c, progress));
  const byRarity: Record<CardRarity, CardDef[]> = {
    common: available.filter((c) => c.rarity === 'common'),
    rare: available.filter((c) => c.rarity === 'rare'),
  };
  const chosen: CardDef[] = [];
  const used = new Set<string>();
  let guard = 0;
  while (chosen.length < count && guard++ < 100) {
    const rarity: CardRarity = rng.chance(RARE_CHANCE) ? 'rare' : 'common';
    const pool = byRarity[rarity].filter((c) => !used.has(c.id));
    const fallback = available.filter((c) => !used.has(c.id));
    const source = pool.length > 0 ? pool : fallback;
    if (source.length === 0) break;
    const card = rng.pick(source);
    used.add(card.id);
    chosen.push(card);
  }
  return chosen;
}

export function cardToOption(def: CardDef): CardOption {
  return {
    id: def.id,
    name: def.name,
    rarity: def.rarity,
    description: def.description,
    category: def.category,
  };
}
