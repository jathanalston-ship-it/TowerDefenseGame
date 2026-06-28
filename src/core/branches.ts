// Tower Branching (TOWER-BRANCHES.md) — Bloons-style per-INSTANCE upgrade paths bought
// with Biomass during a run. Each tower offers two contrasting branches; a tower instance
// commits to ONE on the Tier-1 purchase (the lock) and climbs its 5 tiers. Branches are
// run-temporary (never persisted) and reuse the Star evolution grant vocabulary
// (`stars.ts`), resolved PER INSTANCE — so a tier is data, never a sim branch.
//
// Each tier is a MUTATION, not a stat bump: it adds capabilities (extra projectiles,
// pierce, new targeting, an on-hit/on-pulse ability, a reactor economy fold, a visual)
// via the shared kit. The modest stat ride-along (damage/fireRate/range mult) rides along
// so the five tiers ~2–3× the tower, fitting the six-figure Biomass capstone (config.BRANCH_COSTS).
//
// Golden invariant: an unbranched tower (tier 0) resolves to an empty kit ⇒ identical to a
// branch-less run. Autoplay never buys ⇒ golden byte-identical. Pure data + a pure resolver.

import { Registry } from './registry';
import type { TowerKind } from './types';
import type { StarGrant, ResolvedStarKit } from './stars';
import { emptyStarKit, applyGrant } from './stars';

export interface BranchTier {
  tier: number; // 1..5
  name: string; // players say this ("Twin Spinnerets")
  desc: string; // what changes, in player words
  damageMult?: number; // modest ride-along (default 1)
  fireRateMult?: number; // default 1
  rangeMult?: number; // default 1
  grants: StarGrant[]; // the mutation (targeting / projectile / ability / reactor / cosmetic)
}

export interface Branch {
  id: string;
  tower: TowerKind;
  name: string; // the path's identity ("Hivemind Swarm")
  theme: string; // one-line fantasy for the UI
  tiers: BranchTier[]; // exactly 5, ascending 1..5
}

/** A tower instance's resolved branch state: the star kit plus per-tier stat mults. */
export interface ResolvedBranchKit extends ResolvedStarKit {
  damageMult: number;
  fireRateMult: number;
  rangeMult: number;
}

export function emptyBranchKit(): ResolvedBranchKit {
  return { ...emptyStarKit(), damageMult: 1, fireRateMult: 1, rangeMult: 1 };
}

export const branchRegistry = new Registry<Branch>('branch', {
  idOf: (b) => b.id,
  validate: (b) => {
    const out: string[] = [];
    if (b.tiers.length !== 5) out.push('a branch needs exactly 5 tiers');
    b.tiers.forEach((t, i) => {
      if (t.tier !== i + 1) out.push(`tier[${i}] must be tier ${i + 1} (saw ${t.tier})`);
      if (t.grants.length === 0) out.push(`tier ${t.tier} has no grants (every tier must mutate)`);
    });
    return out;
  },
});

/** Fold tiers 1..`tier` of `branchId` into a kit. Empty (identity) for tier 0 / unknown. */
export function resolveBranchKit(branchId: string | null, tier: number): ResolvedBranchKit {
  const kit = emptyBranchKit();
  if (!branchId || tier <= 0) return kit;
  const b = branchRegistry.get(branchId);
  if (!b) return kit;
  for (const t of b.tiers) {
    if (t.tier > tier) break;
    if (t.damageMult) kit.damageMult *= t.damageMult;
    if (t.fireRateMult) kit.fireRateMult *= t.fireRateMult;
    if (t.rangeMult) kit.rangeMult *= t.rangeMult;
    for (const g of t.grants) applyGrant(kit, g);
  }
  return kit;
}

/** The branches available for a tower kind (the pre-lock choice; ≥1, currently 2). */
export function branchesFor(tower: TowerKind): Branch[] {
  return branchRegistry.all().filter((b) => b.tower === tower);
}

// ── Authored branches (DATA) — two contrasting paths per tower ───────────────────
// Built entirely from existing grants/components/targeting/mutators (no new sim code).
// Values are starting points (balance is a config/playtest pass); the FANTASY is the point.

const BRANCHES: Branch[] = [
  // ════════════ NEEDLE SPITTER (Kinetic, long-range homing) ════════════
  {
    id: 'needle_swarm', tower: 'needle', name: 'Hivemind Swarm',
    theme: 'One spitter becomes a self-guiding needle swarm that shreds crowds.',
    tiers: [
      { tier: 1, name: 'Barbed Needles', desc: 'Needles pierce 1 enemy; lock onto the FASTEST target.', damageMult: 1.1, grants: [{ t: 'targeting', profile: 'fastest' }, { t: 'projectile', mutators: ['pierce1'] }] },
      { tier: 2, name: 'Twin Spinnerets', desc: 'Fires +2 needles per volley, faster.', fireRateMult: 1.2, grants: [{ t: 'projectile', extraProjectiles: 2 }] },
      { tier: 3, name: 'Venom Coating', desc: 'Needles smear Corrosion — enabling Shred with their Fracture.', damageMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Corrosion', amount: 1 } }] }] },
      { tier: 4, name: 'Swarm Logic', desc: '+2 more needles, pierce 2; hunt the most-corrupted prey.', damageMult: 1.15, grants: [{ t: 'projectile', extraProjectiles: 2, mutators: ['pierce2'] }, { t: 'targeting', profile: 'mostCorrupted' }] },
      { tier: 5, name: 'The Thousand Maw', desc: 'A ceaseless storm: +2 needles, pierce 3, vicious crits on prey.', damageMult: 1.25, fireRateMult: 1.2, grants: [{ t: 'projectile', extraProjectiles: 2, mutators: ['pierce3'] }, { t: 'ability', components: [{ type: 'crit', chance: 0.35, mult: 2.5, damage: 6 }] }, { t: 'cosmetic', id: 'swarm' }] },
    ],
  },
  {
    id: 'needle_rail', tower: 'needle', name: 'Apex Railspike',
    theme: 'A patient sniper that drives a single colossal spike through elites.',
    tiers: [
      { tier: 1, name: 'Hollowpoint', desc: 'Pierce 1; target the HIGHEST-health enemy.', damageMult: 1.25, grants: [{ t: 'targeting', profile: 'highestHealth' }, { t: 'projectile', mutators: ['pierce1'] }] },
      { tier: 2, name: 'Armor Render', desc: 'Each spike rips +2 Fracture; longer reach.', damageMult: 1.15, rangeMult: 1.15, grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Fracture', amount: 2 } }] }] },
      { tier: 3, name: 'Charged Shot', desc: 'Slower cadence, but each spike hits far harder and pierces 2.', damageMult: 1.9, fireRateMult: 0.65, grants: [{ t: 'projectile', mutators: ['pierce2'] }] },
      { tier: 4, name: 'Executioner', desc: 'Priority on elites; brutal critical strikes.', damageMult: 1.15, grants: [{ t: 'targeting', profile: 'elitePriority' }, { t: 'ability', components: [{ type: 'crit', chance: 0.5, mult: 3, damage: 10 }] }] },
      { tier: 5, name: 'Annihilator Rail', desc: 'Bosses first; a piercing railspike that detonates the toughest foe.', damageMult: 1.5, fireRateMult: 0.85, grants: [{ t: 'targeting', profile: 'bossPriority' }, { t: 'projectile', mutators: ['pierce3'] }, { t: 'ability', components: [{ type: 'crit', chance: 0.6, mult: 5, damage: 14 }] }, { t: 'cosmetic', id: 'rail' }] },
    ],
  },

  // ════════════ BONE MORTAR (Caustic, full-map splash + pools) ════════════
  {
    id: 'mortar_siege', tower: 'mortar', name: 'Necrotic Siege',
    theme: 'Apocalyptic bombardment — wider, heavier, more shells.',
    tiers: [
      { tier: 1, name: 'Caustic Shells', desc: '+40% blast radius.', damageMult: 1.1, grants: [{ t: 'projectile', splashMult: 1.4 }] },
      { tier: 2, name: 'Saturation Barrage', desc: 'Lobs 3 shells per volley.', fireRateMult: 1.15, grants: [{ t: 'projectile', extraProjectiles: 2 }] },
      { tier: 3, name: 'Shrapnel Bile', desc: 'Bigger blasts that Fracture the struck target.', damageMult: 1.1, grants: [{ t: 'projectile', splashMult: 1.3 }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Fracture', amount: 2 } }] }] },
      { tier: 4, name: 'Carpet Bomb', desc: '+2 more shells; saturates elite packs.', damageMult: 1.15, grants: [{ t: 'projectile', extraProjectiles: 2, splashMult: 1.3 }, { t: 'targeting', profile: 'elitePriority' }] },
      { tier: 5, name: 'Extinction Volley', desc: 'A full-map bombardment: huge blasts, critical impacts.', damageMult: 1.3, grants: [{ t: 'projectile', extraProjectiles: 3, splashMult: 1.6 }, { t: 'ability', components: [{ type: 'crit', chance: 0.3, mult: 2.5, damage: 20 }] }, { t: 'cosmetic', id: 'meteor' }] },
    ],
  },
  {
    id: 'mortar_cauldron', tower: 'mortar', name: 'Corrosive Cauldron',
    theme: 'A slow apocalypse — drowns the lane in melting, slowing acid.',
    tiers: [
      { tier: 1, name: 'Acid Reservoir', desc: 'Shells drench targets in Corrosion over a wider area.', damageMult: 1.05, grants: [{ t: 'projectile', splashMult: 1.3 }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Corrosion', amount: 2 } }] }] },
      { tier: 2, name: 'Viscous Tar', desc: 'Acid rain falls far more often.', fireRateMult: 1.3, grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Corrosion', amount: 1 } }] }] },
      { tier: 3, name: 'Dissolving Agent', desc: 'Acid strips armor (Fracture) as it melts.', damageMult: 1.1, grants: [{ t: 'projectile', splashMult: 1.2 }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Fracture', amount: 2 } }, { type: 'status', status: { kind: 'Corrosion', amount: 2 } }] }] },
      { tier: 4, name: 'Caustic Flood', desc: 'An extra shell; floods the line to hold it.', fireRateMult: 1.15, grants: [{ t: 'projectile', extraProjectiles: 1, splashMult: 1.4 }, { t: 'targeting', profile: 'closestToBase' }] },
      { tier: 5, name: 'The Great Dissolution', desc: 'The lane dissolves: stacking acid, armor-melt, and crits on the rotting.', damageMult: 1.2, fireRateMult: 1.15, grants: [{ t: 'projectile', extraProjectiles: 2, splashMult: 1.6 }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Corrosion', amount: 3 } }, { type: 'crit', chance: 0.35, mult: 2.5, damage: 16 }] }, { t: 'cosmetic', id: 'cauldron' }] },
    ],
  },

  // ════════════ FLESH REACTOR (Vital, support: economy + pulse) ════════════
  {
    id: 'reactor_heart', tower: 'reactor', name: 'Symbiotic Heart',
    theme: 'A swelling engine of biomass that empowers and mends the hive.',
    tiers: [
      { tier: 1, name: 'Engorged Sacs', desc: '+50% biomass generation.', grants: [{ t: 'reactor', biomassMult: 1.5 }, { t: 'cosmetic', id: 'engorge' }] },
      { tier: 2, name: 'Catalytic Lattice', desc: 'Floods ALL towers with a steady +12% damage charge.', grants: [{ t: 'ability', components: [{ type: 'buff', stat: 'towerDamage', amount: 1.12, seconds: 3 }] }] },
      { tier: 3, name: 'Vital Conduit', desc: 'Mends the Nucleus each pulse; +40% more biomass.', grants: [{ t: 'reactor', biomassMult: 1.4 }, { t: 'ability', components: [{ type: 'heal', nucleus: 2 }] }] },
      { tier: 4, name: 'Mitotic Surge', desc: 'A stronger empowering charge (+20% tower damage) and a steady mend.', grants: [{ t: 'ability', components: [{ type: 'buff', stat: 'towerDamage', amount: 1.2, seconds: 3 }, { type: 'heal', nucleus: 2 }] }] },
      { tier: 5, name: 'The Living Core', desc: 'A beating heart: vast biomass, a vital nova, a constant mend, and an empowering charge.', grants: [{ t: 'reactor', biomassMult: 1.6 }, { t: 'ability', components: [{ type: 'explosion', radius: 130, damage: 30, react: true, particle: 'bloom' }, { type: 'heal', nucleus: 4 }, { type: 'buff', stat: 'towerDamage', amount: 1.2, seconds: 3 }] }, { t: 'cosmetic', id: 'core' }] },
    ],
  },
  {
    id: 'reactor_brood', tower: 'reactor', name: 'Brood Spire',
    theme: 'The reactor grows teeth — birthing blockers and lashing the lane.',
    tiers: [
      { tier: 1, name: 'Spore Pods', desc: 'Buds a living blocker that fights and bodies the lane.', grants: [{ t: 'reactor', biomassMult: 1.3 }, { t: 'ability', components: [{ type: 'summon', unit: 'wisp', count: 1 }] }] },
      { tier: 2, name: 'Lashing Tendrils', desc: 'Sprouts stinging tendrils that flay nearby enemies.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 120, damage: 14, react: true, particle: 'bloom' }] }] },
      { tier: 3, name: 'Brood Mother', desc: 'Births two blockers; richer biomass.', grants: [{ t: 'reactor', biomassMult: 1.3 }, { t: 'ability', components: [{ type: 'summon', unit: 'wisp', count: 2 }] }] },
      { tier: 4, name: 'Acid Glands', desc: 'Tendrils drip Corrosion across a wider reach.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 140, damage: 18, status: { kind: 'Corrosion', amount: 2 }, react: true, particle: 'infect' }] }] },
      { tier: 5, name: 'The Hive Node', desc: 'A spawning spire: a brood of blockers and a corrosive flaying field.', grants: [{ t: 'reactor', biomassMult: 1.4 }, { t: 'ability', components: [{ type: 'summon', unit: 'wisp', count: 3 }, { type: 'aura', radius: 150, damage: 30, status: { kind: 'Corrosion', amount: 2 }, react: true, particle: 'bloom' }] }, { t: 'cosmetic', id: 'spire' }] },
    ],
  },

  // ════════════ PARASITE NEST (Viral, medium-range infest) ════════════
  {
    id: 'parasite_apex', tower: 'parasite', name: 'Viral Apex',
    theme: 'An unstoppable plague that spreads faster than it can be cleansed.',
    tiers: [
      { tier: 1, name: 'Virulent Spores', desc: 'Heavier Infection; rot the highest-health hosts.', damageMult: 1.1, grants: [{ t: 'targeting', profile: 'highestHealth' }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Infection', amount: 1 } }] }] },
      { tier: 2, name: 'Brood Parasites', desc: 'Fires +1 parasite; they pierce a host.', grants: [{ t: 'projectile', extraProjectiles: 1, mutators: ['pierce1'] }] },
      { tier: 3, name: 'Necrotic Surge', desc: 'Deep Infection on every strike; +1 parasite.', damageMult: 1.1, grants: [{ t: 'projectile', extraProjectiles: 1 }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Infection', amount: 2 } }] }] },
      { tier: 4, name: 'Hemorrhage', desc: 'Infected also Fracture and bleed under crits; hunt the most-infected.', damageMult: 1.15, grants: [{ t: 'targeting', profile: 'mostCorrupted' }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Fracture', amount: 2 } }, { type: 'crit', chance: 0.4, mult: 2.5, damage: 10 }] }] },
      { tier: 5, name: 'Pandemic Engine', desc: 'A self-sustaining plague: swarming parasites and a pulsing infection field.', damageMult: 1.2, grants: [{ t: 'projectile', extraProjectiles: 2, mutators: ['pierce2'] }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Infection', amount: 3 } }, { type: 'aura', radius: 140, status: { kind: 'Infection', amount: 1 }, particle: 'infect' }] }, { t: 'cosmetic', id: 'plague' }] },
    ],
  },
  {
    id: 'parasite_ravager', tower: 'parasite', name: 'Ravager Strain',
    theme: 'Not a plague — a predator. Focused, ramping rot that devours single hosts.',
    tiers: [
      { tier: 1, name: 'Toxic Fangs', desc: 'Hard-hitting parasites that pierce; hold the line.', damageMult: 1.25, grants: [{ t: 'targeting', profile: 'closestToBase' }, { t: 'projectile', mutators: ['pierce1'] }] },
      { tier: 2, name: 'Deep Rot', desc: 'Each strike injects a deep Infection load.', damageMult: 1.15, grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Infection', amount: 3 } }] }] },
      { tier: 3, name: 'Virulent Strike', desc: 'Faster strikes that savage hosts with crits.', fireRateMult: 1.25, grants: [{ t: 'ability', components: [{ type: 'crit', chance: 0.3, mult: 2.5, damage: 10 }] }] },
      { tier: 4, name: 'Necrosis', desc: 'Strikes Fracture and double-rot the biggest hosts.', damageMult: 1.2, grants: [{ t: 'targeting', profile: 'highestHealth' }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Fracture', amount: 2 } }, { type: 'status', status: { kind: 'Infection', amount: 2 } }] }] },
      { tier: 5, name: 'Apex Predator Strain', desc: 'A devourer: piercing fangs, massive crits, and overwhelming rot.', damageMult: 1.3, fireRateMult: 1.15, grants: [{ t: 'projectile', mutators: ['pierce2'] }, { t: 'ability', components: [{ type: 'crit', chance: 0.5, mult: 4, damage: 16 }, { type: 'status', status: { kind: 'Infection', amount: 3 } }] }, { t: 'cosmetic', id: 'ravager' }] },
    ],
  },

  // ════════════ NEURAL OBELISK (Neural, field/pulse: slow + vuln) ════════════
  {
    id: 'obelisk_tyrant', tower: 'obelisk', name: 'Psionic Tyrant',
    theme: 'Total battlefield control — a widening field that locks the swarm down.',
    tiers: [
      { tier: 1, name: 'Dread Field', desc: 'A wider field of deeper Disruption.', damageMult: 1.1, rangeMult: 1.3, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 300, status: { kind: 'Disruption', amount: 2 }, particle: 'disrupt' }] }] },
      { tier: 2, name: 'Synaptic Lance', desc: 'Snipes the strongest mind with a neural bolt.', grants: [{ t: 'targeting', profile: 'highestHealth' }, { t: 'ability', components: [{ type: 'projectile', behavior: 'homing', range: 360, count: 1, damage: 12, speed: 520 }] }] },
      { tier: 3, name: 'Mind Fracture', desc: 'Disrupted minds crack — Fractured and amplified.', damageMult: 1.15, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 320, damage: 6, status: { kind: 'Fracture', amount: 2 }, react: true, particle: 'disrupt' }] }] },
      { tier: 4, name: 'Stasis Nova', desc: 'Periodically freezes the field — a slowing, vulnerable stasis.', rangeMult: 1.15, grants: [{ t: 'ability', components: [{ type: 'debuff', status: { kind: 'Disruption', amount: 3 }, radius: 340 }] }] },
      { tier: 5, name: 'Hive Tyrant', desc: 'A throne of domination: a vast field, a psionic storm, crushing vulnerability.', damageMult: 1.2, rangeMult: 1.2, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 360, damage: 14, status: { kind: 'Disruption', amount: 3 }, react: true, particle: 'disrupt' }] }, { t: 'cosmetic', id: 'tyrant' }] },
    ],
  },
  {
    id: 'obelisk_mindrender', tower: 'obelisk', name: 'Mindrender',
    theme: 'The obelisk turns predator — a damage caster that fries the swarm.',
    tiers: [
      { tier: 1, name: 'Neural Spike', desc: 'The pulse now sears nearby minds for real damage.', damageMult: 1.15, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 280, damage: 12, react: true, particle: 'disrupt' }] }] },
      { tier: 2, name: 'Arc Synapse', desc: 'Lightning leaps between strongest enemies.', grants: [{ t: 'targeting', profile: 'highestHealth' }, { t: 'ability', components: [{ type: 'chain', jumps: 3, range: 160, damage: 14 }] }] },
      { tier: 3, name: 'Overload', desc: 'A harder-hitting field that Fractures what it fries.', damageMult: 1.2, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 300, damage: 16, status: { kind: 'Fracture', amount: 1 }, react: true, particle: 'disrupt' }] }] },
      { tier: 4, name: 'Forked Lightning', desc: 'The arc forks farther and harder.', damageMult: 1.15, grants: [{ t: 'ability', components: [{ type: 'chain', jumps: 5, range: 180, damage: 22 }] }] },
      { tier: 5, name: 'Cerebral Storm', desc: 'A standing storm: a searing field and relentless forking lightning.', damageMult: 1.3, rangeMult: 1.15, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 320, damage: 26, status: { kind: 'Disruption', amount: 2 }, react: true, particle: 'disrupt' }, { type: 'chain', jumps: 6, range: 190, damage: 30 }] }, { t: 'cosmetic', id: 'storm' }] },
    ],
  },
];

branchRegistry.registerAll(BRANCHES);
