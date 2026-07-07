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
import type { ParticleKind } from './ability';
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
  // ── Sensory mutation (TOWER-BRANCHES.md §1): every tier visibly/audibly changes the tower.
  //    Cosmetic only (FX rng + sfx queue) ⇒ never perturbs the pinned sim. Cumulative fold:
  //    the highest purchased tier that sets one wins (a capstone can escalate the signature). ──
  particle?: ParticleKind; // sprayed at the muzzle on every attack/pulse
  sfx?: string; // sound cue tag on every attack/pulse (audio/sound.ts)
  impact?: ParticleKind; // burst sprayed where this tier's SHOT LANDS (branch-flavoured hit; BRANCH-EVOLUTION.md §3c)
}

export interface Branch {
  id: string;
  tower: TowerKind;
  name: string; // the path's identity ("Hivemind Swarm")
  theme: string; // one-line fantasy for the UI
  tiers: BranchTier[]; // exactly 5, ascending 1..5
}

/** A tower instance's resolved branch state: the star kit plus per-tier stat mults and the
 * folded sensory signature (the attack particle/sfx of the highest tier that sets one). */
export interface ResolvedBranchKit extends ResolvedStarKit {
  damageMult: number;
  fireRateMult: number;
  rangeMult: number;
  particle?: ParticleKind; // muzzle spray on attack (undefined ⇒ none)
  sfx?: string; // attack sound cue (undefined ⇒ none)
  impact?: ParticleKind; // branch-flavoured burst where the shot lands (undefined ⇒ generic hit)
}

// NOTE: particle/sfx are intentionally left UNSET here so `resolveBranchKit(x, 0)` is deep-equal
// to a fresh kit (the golden-safe identity asserted in branches.test.ts).
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
    if (t.particle) kit.particle = t.particle; // last (highest) tier that sets a signature wins
    if (t.sfx) kit.sfx = t.sfx;
    if (t.impact) kit.impact = t.impact; // …per channel — muzzle / sound / impact mature independently
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
      { tier: 1, name: 'Barbed Needles', desc: 'Needles pierce 1 enemy; lock onto the FASTEST target.', damageMult: 1.1, particle: 'barb', sfx: 'br_swarm', impact: 'barb', grants: [{ t: 'targeting', profile: 'fastest' }, { t: 'projectile', mutators: ['pierce1'] }] },
      { tier: 2, name: 'Twin Spinnerets', desc: 'Fires +2 needles per volley, faster.', fireRateMult: 1.2, grants: [{ t: 'projectile', extraProjectiles: 2 }] },
      { tier: 3, name: 'Venom Coating', desc: 'Needles smear Corrosion — enabling Shred with their Fracture.', damageMult: 1.1, particle: 'venom', impact: 'venom', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Corrosion', amount: 1 } }] }] },
      { tier: 4, name: 'Swarm Logic', desc: '+2 more needles, pierce 2; hunt the most-corrupted prey.', damageMult: 1.15, grants: [{ t: 'projectile', extraProjectiles: 2, mutators: ['pierce2'] }, { t: 'targeting', profile: 'mostCorrupted' }] },
      { tier: 5, name: 'The Thousand Maw', desc: 'A ceaseless storm: +2 needles, pierce 3, vicious crits on prey.', damageMult: 1.25, fireRateMult: 1.2, particle: 'barbstorm', impact: 'barbstorm', grants: [{ t: 'projectile', extraProjectiles: 2, mutators: ['pierce3'] }, { t: 'ability', components: [{ type: 'crit', chance: 0.35, mult: 2.5, damage: 6 }] }, { t: 'cosmetic', id: 'swarm' }] },
    ],
  },
  {
    id: 'needle_rail', tower: 'needle', name: 'Apex Railspike',
    theme: 'A patient sniper that drives a single colossal spike through elites.',
    tiers: [
      { tier: 1, name: 'Hollowpoint', desc: 'Pierce 1; target the HIGHEST-health enemy.', damageMult: 1.25, particle: 'spark', sfx: 'br_rail', impact: 'spark', grants: [{ t: 'targeting', profile: 'highestHealth' }, { t: 'projectile', mutators: ['pierce1'] }] },
      { tier: 2, name: 'Armor Render', desc: 'Each spike rips +2 Fracture; longer reach.', damageMult: 1.15, rangeMult: 1.15, grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Fracture', amount: 2 } }] }] },
      { tier: 3, name: 'Charged Shot', desc: 'Slower cadence, but each spike hits far harder and pierces 2.', damageMult: 1.9, fireRateMult: 0.65, impact: 'railburst', grants: [{ t: 'projectile', mutators: ['pierce2'] }] },
      { tier: 4, name: 'Executioner', desc: 'Priority on elites; brutal critical strikes.', damageMult: 1.15, grants: [{ t: 'targeting', profile: 'elitePriority' }, { t: 'ability', components: [{ type: 'crit', chance: 0.5, mult: 3, damage: 10 }] }] },
      { tier: 5, name: 'Annihilator Rail', desc: 'Bosses first; a piercing railspike that detonates the toughest foe.', damageMult: 1.5, fireRateMult: 0.85, particle: 'railburst', impact: 'railburst', grants: [{ t: 'targeting', profile: 'bossPriority' }, { t: 'projectile', mutators: ['pierce3'] }, { t: 'ability', components: [{ type: 'crit', chance: 0.6, mult: 5, damage: 14 }] }, { t: 'cosmetic', id: 'rail' }] },
    ],
  },

  // ════════════ BONE MORTAR (Caustic, full-map splash + pools) ════════════
  {
    id: 'mortar_siege', tower: 'mortar', name: 'Necrotic Siege',
    theme: 'Apocalyptic bombardment — wider, heavier, more shells.',
    tiers: [
      { tier: 1, name: 'Caustic Shells', desc: '+40% blast radius.', damageMult: 1.1, particle: 'ember', sfx: 'br_siege', impact: 'ember', grants: [{ t: 'projectile', splashMult: 1.4 }] },
      { tier: 2, name: 'Saturation Barrage', desc: 'Lobs 3 shells per volley.', fireRateMult: 1.15, grants: [{ t: 'projectile', extraProjectiles: 2 }] },
      { tier: 3, name: 'Shrapnel Bile', desc: 'Bigger blasts that Fracture the struck target.', damageMult: 1.1, impact: 'shrapnel', grants: [{ t: 'projectile', splashMult: 1.3 }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Fracture', amount: 2 } }] }] },
      { tier: 4, name: 'Carpet Bomb', desc: '+2 more shells; saturates elite packs.', damageMult: 1.15, grants: [{ t: 'projectile', extraProjectiles: 2, splashMult: 1.3 }, { t: 'targeting', profile: 'elitePriority' }] },
      { tier: 5, name: 'Extinction Volley', desc: 'A full-map bombardment: huge blasts, critical impacts.', damageMult: 1.3, particle: 'shrapnel', impact: 'shrapnel', grants: [{ t: 'projectile', extraProjectiles: 3, splashMult: 1.6 }, { t: 'ability', components: [{ type: 'crit', chance: 0.3, mult: 2.5, damage: 20 }] }, { t: 'cosmetic', id: 'meteor' }] },
    ],
  },
  {
    id: 'mortar_cauldron', tower: 'mortar', name: 'Corrosive Cauldron',
    theme: 'A slow apocalypse — drowns the lane in melting, slowing acid.',
    tiers: [
      { tier: 1, name: 'Acid Reservoir', desc: 'Shells drench targets in Corrosion over a wider area.', damageMult: 1.05, particle: 'acid', sfx: 'br_acid', impact: 'acid', grants: [{ t: 'projectile', splashMult: 1.3 }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Corrosion', amount: 2 } }] }] },
      { tier: 2, name: 'Viscous Tar', desc: 'Acid rain falls far more often.', fireRateMult: 1.3, grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Corrosion', amount: 1 } }] }] },
      { tier: 3, name: 'Dissolving Agent', desc: 'Acid strips armor (Fracture) as it melts.', damageMult: 1.1, impact: 'dissolve', grants: [{ t: 'projectile', splashMult: 1.2 }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Fracture', amount: 2 } }, { type: 'status', status: { kind: 'Corrosion', amount: 2 } }] }] },
      { tier: 4, name: 'Caustic Flood', desc: 'An extra shell; floods the line to hold it.', fireRateMult: 1.15, grants: [{ t: 'projectile', extraProjectiles: 1, splashMult: 1.4 }, { t: 'targeting', profile: 'closestToBase' }] },
      { tier: 5, name: 'The Great Dissolution', desc: 'The lane dissolves: stacking acid, armor-melt, and crits on the rotting.', damageMult: 1.2, fireRateMult: 1.15, particle: 'dissolve', impact: 'dissolve', grants: [{ t: 'projectile', extraProjectiles: 2, splashMult: 1.6 }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Corrosion', amount: 3 } }, { type: 'crit', chance: 0.35, mult: 2.5, damage: 16 }] }, { t: 'cosmetic', id: 'cauldron' }] },
    ],
  },

  // ════════════ FLESH REACTOR (Vital, support: economy + pulse) ════════════
  {
    id: 'reactor_heart', tower: 'reactor', name: 'Symbiotic Heart',
    theme: 'A swelling engine of biomass that empowers and mends the hive.',
    tiers: [
      { tier: 1, name: 'Engorged Sacs', desc: '+50% biomass generation.', particle: 'vital', sfx: 'br_vital', impact: 'vital', grants: [{ t: 'reactor', biomassMult: 1.5 }, { t: 'cosmetic', id: 'engorge' }] },
      { tier: 2, name: 'Catalytic Lattice', desc: 'Floods ALL towers with a steady +12% damage charge.', grants: [{ t: 'ability', components: [{ type: 'buff', stat: 'towerDamage', amount: 1.12, seconds: 3 }] }] },
      { tier: 3, name: 'Vital Conduit', desc: 'Mends the Nucleus each pulse; +40% more biomass.', grants: [{ t: 'reactor', biomassMult: 1.4 }, { t: 'ability', components: [{ type: 'heal', nucleus: 2 }] }] },
      { tier: 4, name: 'Mitotic Surge', desc: 'A stronger empowering charge (+20% tower damage) and a steady mend.', grants: [{ t: 'ability', components: [{ type: 'buff', stat: 'towerDamage', amount: 1.2, seconds: 3 }, { type: 'heal', nucleus: 2 }] }] },
      { tier: 5, name: 'The Living Core', desc: 'A beating heart: vast biomass, a vital nova, a constant mend, and an empowering charge.', particle: 'vitalcore', impact: 'vitalcore', grants: [{ t: 'reactor', biomassMult: 1.6 }, { t: 'ability', components: [{ type: 'explosion', radius: 130, damage: 30, react: true, particle: 'bloom' }, { type: 'heal', nucleus: 4 }, { type: 'buff', stat: 'towerDamage', amount: 1.2, seconds: 3 }] }, { t: 'cosmetic', id: 'core' }] },
    ],
  },
  {
    id: 'reactor_brood', tower: 'reactor', name: 'Brood Spire',
    theme: 'The reactor grows teeth — birthing blockers and lashing the lane.',
    tiers: [
      { tier: 1, name: 'Spore Pods', desc: 'Buds a living blocker that fights and bodies the lane.', particle: 'spore', sfx: 'br_spore', impact: 'spore', grants: [{ t: 'reactor', biomassMult: 1.3 }, { t: 'ability', components: [{ type: 'summon', unit: 'wisp', count: 1 }] }] },
      { tier: 2, name: 'Lashing Tendrils', desc: 'Sprouts stinging tendrils that flay nearby enemies.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 120, damage: 14, react: true, particle: 'bloom' }] }] },
      { tier: 3, name: 'Brood Mother', desc: 'Births two blockers; richer biomass.', grants: [{ t: 'reactor', biomassMult: 1.3 }, { t: 'ability', components: [{ type: 'summon', unit: 'wisp', count: 2 }] }] },
      { tier: 4, name: 'Acid Glands', desc: 'Tendrils drip Corrosion across a wider reach.', particle: 'acid', impact: 'acid', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 140, damage: 18, status: { kind: 'Corrosion', amount: 2 }, react: true, particle: 'infect' }] }] },
      { tier: 5, name: 'The Hive Node', desc: 'A spawning spire: a brood of blockers and a corrosive flaying field.', grants: [{ t: 'reactor', biomassMult: 1.4 }, { t: 'ability', components: [{ type: 'summon', unit: 'wisp', count: 3 }, { type: 'aura', radius: 150, damage: 30, status: { kind: 'Corrosion', amount: 2 }, react: true, particle: 'bloom' }] }, { t: 'cosmetic', id: 'spire' }] },
    ],
  },

  // ════════════ PARASITE NEST (Viral, medium-range infest) ════════════
  {
    id: 'parasite_apex', tower: 'parasite', name: 'Viral Apex',
    theme: 'An unstoppable plague that spreads faster than it can be cleansed.',
    tiers: [
      { tier: 1, name: 'Virulent Spores', desc: 'Heavier Infection; rot the highest-health hosts.', damageMult: 1.1, particle: 'infect', sfx: 'br_plague', impact: 'infect', grants: [{ t: 'targeting', profile: 'highestHealth' }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Infection', amount: 1 } }] }] },
      { tier: 2, name: 'Brood Parasites', desc: 'Fires +1 parasite; they pierce a host.', grants: [{ t: 'projectile', extraProjectiles: 1, mutators: ['pierce1'] }] },
      { tier: 3, name: 'Necrotic Surge', desc: 'Deep Infection on every strike; +1 parasite.', damageMult: 1.1, grants: [{ t: 'projectile', extraProjectiles: 1 }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Infection', amount: 2 } }] }] },
      { tier: 4, name: 'Hemorrhage', desc: 'Infected also Fracture and bleed under crits; hunt the most-infected.', damageMult: 1.15, grants: [{ t: 'targeting', profile: 'mostCorrupted' }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Fracture', amount: 2 } }, { type: 'crit', chance: 0.4, mult: 2.5, damage: 10 }] }] },
      { tier: 5, name: 'Pandemic Engine', desc: 'A self-sustaining plague: swarming parasites and a pulsing infection field.', damageMult: 1.2, particle: 'pandemic', impact: 'pandemic', grants: [{ t: 'projectile', extraProjectiles: 2, mutators: ['pierce2'] }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Infection', amount: 3 } }, { type: 'aura', radius: 140, status: { kind: 'Infection', amount: 1 }, particle: 'infect' }] }, { t: 'cosmetic', id: 'plague' }] },
    ],
  },
  {
    id: 'parasite_ravager', tower: 'parasite', name: 'Ravager Strain',
    theme: 'Not a plague — a predator. Focused, ramping rot that devours single hosts.',
    tiers: [
      { tier: 1, name: 'Toxic Fangs', desc: 'Hard-hitting parasites that pierce; hold the line.', damageMult: 1.25, particle: 'gore', sfx: 'br_gore', impact: 'gore', grants: [{ t: 'targeting', profile: 'closestToBase' }, { t: 'projectile', mutators: ['pierce1'] }] },
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
      { tier: 1, name: 'Dread Field', desc: 'A wider field of deeper Disruption.', damageMult: 1.1, rangeMult: 1.3, particle: 'disrupt', sfx: 'br_psi', impact: 'disrupt', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 300, status: { kind: 'Disruption', amount: 2 }, particle: 'disrupt' }] }] },
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
      { tier: 1, name: 'Neural Spike', desc: 'The pulse now sears nearby minds for real damage.', damageMult: 1.15, particle: 'spark', sfx: 'br_storm', impact: 'spark', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 280, damage: 12, react: true, particle: 'disrupt' }] }] },
      { tier: 2, name: 'Arc Synapse', desc: 'Lightning leaps between strongest enemies.', grants: [{ t: 'targeting', profile: 'highestHealth' }, { t: 'ability', components: [{ type: 'chain', jumps: 3, range: 160, damage: 14 }] }] },
      { tier: 3, name: 'Overload', desc: 'A harder-hitting field that Fractures what it fries.', damageMult: 1.2, impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 300, damage: 16, status: { kind: 'Fracture', amount: 1 }, react: true, particle: 'disrupt' }] }] },
      { tier: 4, name: 'Forked Lightning', desc: 'The arc forks farther and harder.', damageMult: 1.15, grants: [{ t: 'ability', components: [{ type: 'chain', jumps: 5, range: 180, damage: 22 }] }] },
      { tier: 5, name: 'Cerebral Storm', desc: 'A standing storm: a searing field and relentless forking lightning.', damageMult: 1.3, rangeMult: 1.15, particle: 'railburst', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 320, damage: 26, status: { kind: 'Disruption', amount: 2 }, react: true, particle: 'disrupt' }, { type: 'chain', jumps: 6, range: 190, damage: 30 }] }, { t: 'cosmetic', id: 'storm' }] },
    ],
  },

  // ════════════ CARRION MAW (Kinetic, short-reach cleave) ════════════
  {
    id: 'maw_butcher', tower: 'maw', name: "Butcher's Row",
    theme: 'Pure carnage — the jaws grow, the bites crush, the crust becomes a grinder.',
    tiers: [
      { tier: 1, name: 'Serrated Rows', desc: 'An inner grinding ring chews whatever presses closest.', damageMult: 1.15, particle: 'shred', sfx: 'br_maw', impact: 'shred', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 90, damage: 9, react: true, particle: 'shred' }] }] },
      { tier: 2, name: 'Double Snap', desc: 'Bites land faster, each ending in a concussive crunch.', fireRateMult: 1.2, grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 110, damage: 12, react: true, particle: 'shred' }] }] },
      { tier: 3, name: 'Rending Fangs', desc: 'Every bite rips armor plating loose (Fracture).', damageMult: 1.15, impact: 'gore', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 170, status: { kind: 'Fracture', amount: 2 }, particle: 'shred' }] }] },
      { tier: 4, name: 'Gore Engine', desc: 'Heavier, faster jaws; the crunch deepens.', damageMult: 1.2, fireRateMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 130, damage: 20, react: true, particle: 'shred' }] }] },
      { tier: 5, name: 'The Ossuary', desc: 'Everything near it is meat: a massive crunch and armor stripped to bone.', damageMult: 1.35, particle: 'gore', impact: 'gore', grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 170, damage: 44, react: true, particle: 'shred' }, { type: 'aura', radius: 180, status: { kind: 'Fracture', amount: 1 }, particle: 'shred' }] }, { t: 'cosmetic', id: 'ossuary' }] },
    ],
  },
  {
    id: 'maw_gullet', tower: 'maw', name: 'Tidal Gullet',
    theme: 'A patient undertow — it drags, slows, and swallows the crust whole.',
    tiers: [
      { tier: 1, name: 'Sucking Undertow', desc: 'A wide, dragging current disrupts everything near the jaws.', particle: 'disrupt', sfx: 'br_gullet', impact: 'disrupt', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 190, damage: 4, status: { kind: 'Disruption', amount: 1 }, particle: 'disrupt' }] }] },
      { tier: 2, name: 'Tenderizing Slam', desc: 'The current softens shells (Fracture) as it pulls.', fireRateMult: 1.15, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 190, status: { kind: 'Fracture', amount: 1 }, particle: 'disrupt' }] }] },
      { tier: 3, name: 'Swallow Whole', desc: 'Bigger gulps — the bite hits far harder.', damageMult: 1.25, grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 120, damage: 16, react: true, particle: 'shred' }] }] },
      { tier: 4, name: 'Riptide Maw', desc: 'The undertow widens and deepens — prey cannot leave.', rangeMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 220, damage: 6, status: { kind: 'Disruption', amount: 2 }, react: true, particle: 'disrupt' }] }] },
      { tier: 5, name: 'The Drowning Deep', desc: 'A drowning tide: a vast disrupting current and a crushing swallow.', damageMult: 1.25, rangeMult: 1.15, particle: 'disrupt', impact: 'gore', grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 190, damage: 32, status: { kind: 'Disruption', amount: 2 }, react: true, particle: 'disrupt' }] }, { t: 'cosmetic', id: 'gullet' }] },
    ],
  },

  // ════════════ AMBER CHRYSALIS (Caustic, single-target encasement) ════════════
  {
    id: 'chrysalis_deepfreeze', tower: 'chrysalis', name: 'Deep Freeze',
    theme: 'The perfect specimen jar — longer, harder encasements that end in splinters.',
    tiers: [
      { tier: 1, name: 'Quickset Resin', desc: 'Encasements set harder and hold longer.', damageMult: 1.1, particle: 'acid', sfx: 'br_amber', impact: 'acid', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Freeze', amount: 1.8 } }] }] },
      { tier: 2, name: 'Splinter Facets', desc: 'Each casing bursts into razor shards around the victim.', damageMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 95, damage: 16, react: true, particle: 'shred' }] }] },
      { tier: 3, name: 'Deep Set', desc: 'The amber thickens — victims hold far longer.', damageMult: 1.15, impact: 'dissolve', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Freeze', amount: 2.3 } }] }] },
      { tier: 4, name: 'Warden of Giants', desc: 'It hunts bosses first, striking preserved prey with brutal force.', damageMult: 1.15, grants: [{ t: 'targeting', profile: 'bossPriority' }, { t: 'ability', components: [{ type: 'crit', chance: 0.35, mult: 2.5, damage: 20 }] }] },
      { tier: 5, name: 'Perfect Preservation', desc: 'Museum-grade: the longest hold in the game, ending in a shard nova.', damageMult: 1.3, particle: 'acid', impact: 'dissolve', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Freeze', amount: 2.8 } }, { type: 'explosion', radius: 135, damage: 34, react: true, particle: 'shred' }] }, { t: 'cosmetic', id: 'reliquary' }] },
    ],
  },
  {
    id: 'chrysalis_amber', tower: 'chrysalis', name: 'Preserving Amber',
    theme: 'The grove keeper — weeping sap that slows, melts, and mires the approach.',
    tiers: [
      { tier: 1, name: 'Weeping Resin', desc: 'Each cast drenches the area around the victim in Corrosion.', particle: 'acid', sfx: 'br_sap', impact: 'acid', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 140, status: { kind: 'Corrosion', amount: 1 } }] }] },
      { tier: 2, name: 'Amber Veil', desc: 'The warden watches farther; the sap spreads wider.', rangeMult: 1.12, grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 170, status: { kind: 'Corrosion', amount: 1 } }] }] },
      { tier: 3, name: 'Thickened Sap', desc: 'A dripping moat gathers at its roots, melting what wades in.', damageMult: 1.2, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 130, damage: 7, status: { kind: 'Corrosion', amount: 1 }, react: true, particle: 'acid' }] }] },
      { tier: 4, name: 'Golden Tomb', desc: 'Longer entombments; the sap pools farther still.', damageMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Freeze', amount: 2.0 } }, { type: 'debuff', radius: 190, status: { kind: 'Corrosion', amount: 2 } }] }] },
      { tier: 5, name: 'The Amber Grove', desc: 'The whole approach mires: disrupting sap and a bursting golden bloom.', damageMult: 1.25, rangeMult: 1.15, particle: 'acid', impact: 'dissolve', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 230, status: { kind: 'Disruption', amount: 1 } }, { type: 'explosion', radius: 150, damage: 26, react: true, particle: 'acid' }] }, { t: 'cosmetic', id: 'grove' }] },
    ],
  },

  // ════════════ WAILING EFFIGY (Neural, dread field — pure tempo) ════════════
  {
    id: 'effigy_choir', tower: 'effigy', name: 'Choir of Sorrow',
    theme: 'The dread carries — wider, layered, until the whole crust hears it.',
    tiers: [
      { tier: 1, name: 'Sorrow Carries', desc: 'The wail reaches farther and leaves minds Disrupted.', rangeMult: 1.12, particle: 'disrupt', sfx: 'br_choir', impact: 'disrupt', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 300, status: { kind: 'Disruption', amount: 1 } }] }] },
      { tier: 2, name: 'Second Voice', desc: 'The pulse quickens — panic comes in rounds.', fireRateMult: 1.2, grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 240, status: { kind: 'Disruption', amount: 1 } }] }] },
      { tier: 3, name: 'Dirge of Rot', desc: 'The note begins to CUT — psychic damage rides the wail.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 260, damage: 7, react: true, particle: 'disrupt' }] }] },
      { tier: 4, name: 'Chorus Swell', desc: 'A second panic wave rolls even farther out.', rangeMult: 1.15, grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 330, status: { kind: 'Fear', amount: 1.4 } }] }] },
      { tier: 5, name: 'Requiem', desc: 'The full choir: a crushing psychic toll and dread across the whole approach.', fireRateMult: 1.15, rangeMult: 1.1, particle: 'disrupt', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 240, damage: 30, react: true, particle: 'disrupt' }, { type: 'debuff', radius: 350, status: { kind: 'Disruption', amount: 2 } }] }, { t: 'cosmetic', id: 'requiem' }] },
    ],
  },
  {
    id: 'effigy_malice', tower: 'effigy', name: 'Totem of Malice',
    theme: 'The scream turns predatory — terror that wounds as it scatters.',
    tiers: [
      { tier: 1, name: 'Spiteful Note', desc: 'The wail cuts — psychic damage in a tight ring.', particle: 'disrupt', sfx: 'br_malice', impact: 'spark', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 220, damage: 8, react: true, particle: 'disrupt' }] }] },
      { tier: 2, name: 'Malice Focus', desc: 'Faster keening, a wider wound.', fireRateMult: 1.15, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 240, damage: 8, react: true, particle: 'disrupt' }] }] },
      { tier: 3, name: 'Terror Harvest', desc: 'It feeds on panic — the cut deepens and the dread lingers.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 250, damage: 11, react: true, particle: 'disrupt' }, { type: 'debuff', radius: 250, status: { kind: 'Fear', amount: 1.3 } }] }] },
      { tier: 4, name: 'Doom Toll', desc: 'A tolling psychic blast rocks the crust.', grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 210, damage: 26, react: true, particle: 'disrupt' }] }] },
      { tier: 5, name: 'The Black Bell', desc: 'Every toll is a catastrophe: massive psychic ruin and rolling dread.', fireRateMult: 1.2, particle: 'railburst', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 260, damage: 46, react: true, particle: 'disrupt' }, { type: 'aura', radius: 260, damage: 12, status: { kind: 'Disruption', amount: 1 }, react: true, particle: 'disrupt' }] }, { t: 'cosmetic', id: 'bell' }] },
    ],
  },

  // ════════════ MARROW SIPHON (Vital, continuous drain beam) ════════════
  // The beam honours damage/rate/range ride-alongs (rate → a FASTER Gorge ramp), `targeting` (its
  // lock), `projectile.extraProjectiles` (extra FORKED drain targets), and `ability` grants pulsed on
  // its cadence (game.beamSystem). No pierce/crit/single-target status — a ray has no projectile.
  {
    id: 'siphon_gorge', tower: 'siphon', name: 'Insatiable Gorge',
    theme: 'A ravenous tide — it finishes the wounded and gorges FATTER the more the lane dies around it.',
    tiers: [
      { tier: 1, name: 'Ravenous Draw', desc: 'The beam runs hotter and hunts the WEAKEST — finishing what the swarm started.', damageMult: 1.2, particle: 'bloom', sfx: 'br_siphon', impact: 'bloom', grants: [{ t: 'targeting', profile: 'lowestHealth' }] },
      { tier: 2, name: 'Rending Draw', desc: 'The drain strips armor plating (Fracture) from everything near the victim.', damageMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 140, status: { kind: 'Fracture', amount: 2 } }] }] },
      { tier: 3, name: 'Boiling Blood', desc: 'A faster Gorge, and the backwash melts the flesh around the beam.', fireRateMult: 1.2, impact: 'acid', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 130, damage: 8, status: { kind: 'Corrosion', amount: 1 }, react: true, particle: 'acid' }] }] },
      { tier: 4, name: 'Marrow Boil', desc: 'A searing drain field engulfs the kill zone.', damageMult: 1.25, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 150, damage: 14, react: true, particle: 'bloom' }] }] },
      { tier: 5, name: 'The Devouring Star', desc: 'An unbearable ray: a devouring nova erupts from the fed-upon and acid drowns the field.', damageMult: 1.3, fireRateMult: 1.15, particle: 'bloom', impact: 'bloom', grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 160, damage: 38, react: true, particle: 'bloom' }, { type: 'aura', radius: 180, damage: 10, status: { kind: 'Corrosion', amount: 2 }, react: true, particle: 'acid' }] }, { t: 'cosmetic', id: 'devourstar' }] },
    ],
  },
  {
    id: 'siphon_well', tower: 'siphon', name: 'Bloodwell',
    theme: 'The organ swells into a well of the hive — forking rays that drink the swarm and mend the Nucleus.',
    tiers: [
      { tier: 1, name: 'Branching Feelers', desc: 'The beam forks to a second target.', particle: 'vital', sfx: 'br_well', impact: 'bloom', grants: [{ t: 'projectile', extraProjectiles: 1 }] },
      { tier: 2, name: 'Vital Return', desc: 'Every pulse channels siphoned life back into the Nucleus.', grants: [{ t: 'ability', components: [{ type: 'heal', nucleus: 2 }] }] },
      { tier: 3, name: 'Spreading Roots', desc: 'A third fork; the drain leaves Corrosion where it feeds.', impact: 'acid', grants: [{ t: 'projectile', extraProjectiles: 1 }, { t: 'ability', components: [{ type: 'aura', radius: 150, damage: 6, status: { kind: 'Corrosion', amount: 1 }, react: true, particle: 'acid' }] }] },
      { tier: 4, name: 'Transfusion', desc: 'A stronger mend, and a draining field chips the whole cluster.', grants: [{ t: 'ability', components: [{ type: 'heal', nucleus: 3 }, { type: 'aura', radius: 150, damage: 9, react: true, particle: 'bloom' }] }] },
      { tier: 5, name: 'The Bloodwell', desc: 'A well of the hive: four forking rays, a constant mend, and a wide melting drain.', particle: 'vitalcore', impact: 'bloom', grants: [{ t: 'projectile', extraProjectiles: 1 }, { t: 'ability', components: [{ type: 'heal', nucleus: 4 }, { type: 'aura', radius: 170, damage: 12, status: { kind: 'Corrosion', amount: 1 }, react: true, particle: 'bloom' }] }, { t: 'cosmetic', id: 'bloodwell' }] },
    ],
  },
  // ════════════ RESONANCE COIL (Resonant, ramping single-target beam) ════════════
  {
    id: 'coil_overload', tower: 'coil', name: 'Overcharge Lattice',
    theme: 'All power to one point — a runaway beam that deletes elites and bosses.',
    tiers: [
      { tier: 1, name: 'Focusing Array', desc: 'Bites the single biggest threat and melts +10% harder.', damageMult: 1.1, particle: 'spark', sfx: 'br_storm', impact: 'spark', grants: [{ t: 'targeting', profile: 'highestHealth' }] },
      { tier: 2, name: 'Overtuned Emitter', desc: 'Faster resonance build; the beam rips Fracture as it melts.', fireRateMult: 1.25, grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Fracture', amount: 2 } }] }] },
      { tier: 3, name: 'Meltdown Core', desc: 'Overheating criticals savage the held target.', damageMult: 1.2, grants: [{ t: 'ability', components: [{ type: 'crit', chance: 0.35, mult: 3, damage: 18 }] }] },
      { tier: 4, name: 'Executioner Beam', desc: 'Locks bosses first; devastating critical resonance.', damageMult: 1.15, grants: [{ t: 'targeting', profile: 'bossPriority' }, { t: 'ability', components: [{ type: 'crit', chance: 0.5, mult: 3.5, damage: 24 }] }] },
      { tier: 5, name: 'Annihilation Lens', desc: 'A singularity of focus: crushing crits and deep armor-melt vaporize anything it holds.', damageMult: 1.35, fireRateMult: 1.15, particle: 'railburst', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'crit', chance: 0.6, mult: 5, damage: 30 }, { type: 'status', status: { kind: 'Fracture', amount: 3 } }] }, { t: 'cosmetic', id: 'singularity' }] },
    ],
  },
  {
    id: 'coil_prism', tower: 'coil', name: 'Refraction Prism',
    theme: 'One beam becomes many — a splitting lattice that melts the whole crowd.',
    tiers: [
      { tier: 1, name: 'Split Prism', desc: 'The beam forks to a second target and reaches farther.', damageMult: 1.05, rangeMult: 1.1, particle: 'acid', sfx: 'br_acid', impact: 'acid', grants: [{ t: 'projectile', extraProjectiles: 1 }] },
      { tier: 2, name: 'Dispersion Field', desc: 'Caustic light sprays Corrosion around the beam’s targets.', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 130, status: { kind: 'Corrosion', amount: 1 } }] }] },
      { tier: 3, name: 'Triple Refraction', desc: 'A third channel melts another foe at once.', damageMult: 1.1, grants: [{ t: 'projectile', extraProjectiles: 1 }] },
      { tier: 4, name: 'Caustic Lattice', desc: 'A fourth channel; every beam drenches its target in Corrosion.', grants: [{ t: 'projectile', extraProjectiles: 1 }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Corrosion', amount: 2 } }] }] },
      { tier: 5, name: 'Prismatic Cascade', desc: 'A blooming lattice: two more channels and a drowning caustic field.', damageMult: 1.15, particle: 'dissolve', impact: 'dissolve', grants: [{ t: 'projectile', extraProjectiles: 2 }, { t: 'ability', components: [{ type: 'aura', radius: 150, status: { kind: 'Corrosion', amount: 2 }, react: true, particle: 'acid' }] }, { t: 'cosmetic', id: 'prism' }] },
    ],
  },
];

branchRegistry.registerAll(BRANCHES);
