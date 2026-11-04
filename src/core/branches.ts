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
      { tier: 2, name: 'Splinter Facets', desc: 'Each casing bursts into razor shards around the victim.', damageMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'explosion', at: 'victim', radius: 95, damage: 16, react: true, particle: 'shred' }] }] },
      { tier: 3, name: 'Deep Set', desc: 'The amber thickens — victims hold far longer.', damageMult: 1.15, impact: 'dissolve', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Freeze', amount: 2.3 } }] }] },
      { tier: 4, name: 'Warden of Giants', desc: 'It hunts bosses first, striking preserved prey with brutal force.', damageMult: 1.15, grants: [{ t: 'targeting', profile: 'bossPriority' }, { t: 'ability', components: [{ type: 'crit', chance: 0.35, mult: 2.5, damage: 20 }] }] },
      { tier: 5, name: 'Perfect Preservation', desc: 'Museum-grade: the longest hold in the game, ending in a shard nova.', damageMult: 1.3, particle: 'acid', impact: 'dissolve', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Freeze', amount: 2.8 } }, { type: 'explosion', at: 'victim', radius: 135, damage: 34, react: true, particle: 'shred' }] }, { t: 'cosmetic', id: 'reliquary' }] },
    ],
  },
  {
    id: 'chrysalis_amber', tower: 'chrysalis', name: 'Preserving Amber',
    theme: 'The grove keeper — weeping sap that slows, melts, and mires the approach.',
    tiers: [
      { tier: 1, name: 'Weeping Resin', desc: 'Each cast drenches the area around the victim in Corrosion.', particle: 'acid', sfx: 'br_sap', impact: 'acid', grants: [{ t: 'ability', components: [{ type: 'debuff', at: 'victim', radius: 140, status: { kind: 'Corrosion', amount: 1 } }] }] },
      { tier: 2, name: 'Amber Veil', desc: 'The warden watches farther; the sap spreads wider.', rangeMult: 1.12, grants: [{ t: 'ability', components: [{ type: 'debuff', at: 'victim', radius: 170, status: { kind: 'Corrosion', amount: 1 } }] }] },
      { tier: 3, name: 'Thickened Sap', desc: 'A dripping moat gathers at its roots, melting what wades in.', damageMult: 1.2, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 130, damage: 7, status: { kind: 'Corrosion', amount: 1 }, react: true, particle: 'acid' }] }] },
      { tier: 4, name: 'Golden Tomb', desc: 'Longer entombments; the sap pools farther still.', damageMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Freeze', amount: 2.0 } }, { type: 'debuff', at: 'victim', radius: 190, status: { kind: 'Corrosion', amount: 2 } }] }] },
      { tier: 5, name: 'The Amber Grove', desc: 'The whole approach mires: disrupting sap and a bursting golden bloom.', damageMult: 1.25, rangeMult: 1.15, particle: 'acid', impact: 'dissolve', grants: [{ t: 'ability', components: [{ type: 'debuff', at: 'victim', radius: 230, status: { kind: 'Disruption', amount: 1 } }, { type: 'explosion', at: 'victim', radius: 150, damage: 26, react: true, particle: 'acid' }] }, { t: 'cosmetic', id: 'grove' }] },
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
      { tier: 2, name: 'Rending Draw', desc: 'The drain strips armor plating (Fracture) from everything near the victim.', damageMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'debuff', at: 'victim', radius: 140, status: { kind: 'Fracture', amount: 2 } }] }] },
      { tier: 3, name: 'Boiling Blood', desc: 'A faster Gorge, and the backwash melts the flesh around the beam.', fireRateMult: 1.2, impact: 'acid', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 130, damage: 8, status: { kind: 'Corrosion', amount: 1 }, react: true, particle: 'acid' }] }] },
      { tier: 4, name: 'Marrow Boil', desc: 'A searing drain field engulfs the kill zone.', damageMult: 1.25, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 150, damage: 14, react: true, particle: 'bloom' }] }] },
      { tier: 5, name: 'The Devouring Star', desc: 'An unbearable ray: a devouring nova erupts from the fed-upon and acid drowns the field.', damageMult: 1.3, fireRateMult: 1.15, particle: 'bloom', impact: 'bloom', grants: [{ t: 'ability', components: [{ type: 'explosion', at: 'victim', radius: 160, damage: 38, react: true, particle: 'bloom' }, { type: 'aura', radius: 180, damage: 10, status: { kind: 'Corrosion', amount: 2 }, react: true, particle: 'acid' }] }, { t: 'cosmetic', id: 'devourstar' }] },
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
      { tier: 2, name: 'Dispersion Field', desc: 'Caustic light sprays Corrosion around the beam’s targets.', grants: [{ t: 'ability', components: [{ type: 'debuff', at: 'victim', radius: 130, status: { kind: 'Corrosion', amount: 1 } }] }] },
      { tier: 3, name: 'Triple Refraction', desc: 'A third channel melts another foe at once.', damageMult: 1.1, grants: [{ t: 'projectile', extraProjectiles: 1 }] },
      { tier: 4, name: 'Caustic Lattice', desc: 'A fourth channel; every beam drenches its target in Corrosion.', grants: [{ t: 'projectile', extraProjectiles: 1 }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Corrosion', amount: 2 } }] }] },
      { tier: 5, name: 'Prismatic Cascade', desc: 'A blooming lattice: two more channels and a drowning caustic field.', damageMult: 1.15, particle: 'dissolve', impact: 'dissolve', grants: [{ t: 'projectile', extraProjectiles: 2 }, { t: 'ability', components: [{ type: 'aura', radius: 150, status: { kind: 'Corrosion', amount: 2 }, react: true, particle: 'acid' }] }, { t: 'cosmetic', id: 'prism' }] },
    ],
  },
  // ════════════ BLIGHT SOWER (Caustic, spore-mine area denial) ════════════
  // The trap loop honours damage/splash/rate ride-alongs (rate → a faster SEEDING cadence),
  // `projectile.extraProjectiles` (+max armed mines), and `ability` grants fired AT each
  // detonation point (game.mineSystem) — an aura/debuff/explosion grant blooms where the mine
  // bursts. No pierce/targeting — the lane walks into the garden.
  {
    id: 'sower_bloom', tower: 'sower', name: 'Corrosive Bloom',
    theme: 'Fewer, monstrous detonations — a garden of horrors that dissolves whole packs.',
    tiers: [
      { tier: 1, name: 'Swollen Pods', desc: 'Detonations bloom 20% wider and hit harder.', damageMult: 1.1, particle: 'acid', sfx: 'br_acid', impact: 'acid', grants: [{ t: 'projectile', splashMult: 1.2 }] },
      { tier: 2, name: 'Caustic Marrow', desc: 'Every burst leaves a corroding wash on the survivors.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 120, damage: 6, status: { kind: 'Corrosion', amount: 1 }, react: true, particle: 'acid' }] }] },
      { tier: 3, name: 'Deep Blight', desc: 'Heavier payloads; the wash shears armor (Fracture).', damageMult: 1.2, impact: 'acid', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 130, status: { kind: 'Fracture', amount: 1 } }] }] },
      { tier: 4, name: 'Overripe', desc: 'Vast detonations — +25% blast radius.', damageMult: 1.1, grants: [{ t: 'projectile', splashMult: 1.25 }] },
      { tier: 5, name: 'The Rotting Field', desc: 'Every burst is a caustic catastrophe: a second acid nova erupts from the crater.', damageMult: 1.25, particle: 'dissolve', impact: 'dissolve', grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 140, damage: 32, react: true, particle: 'acid' }, { type: 'aura', radius: 160, status: { kind: 'Corrosion', amount: 2 }, react: true, particle: 'acid' }] }, { t: 'cosmetic', id: 'rotfield' }] },
    ],
  },
  {
    id: 'sower_thicket', tower: 'sower', name: 'Choking Thicket',
    theme: 'Saturation — more buds, faster seeding, the whole approach one continuous minefield.',
    tiers: [
      { tier: 1, name: 'Twin Buds', desc: '+1 max armed mine.', particle: 'spore', sfx: 'br_spore', impact: 'acid', grants: [{ t: 'projectile', extraProjectiles: 1 }] },
      { tier: 2, name: 'Quick Germination', desc: '+20% seeding cadence; slightly fatter blooms.', fireRateMult: 1.2, grants: [{ t: 'projectile', splashMult: 1.08 }] },
      { tier: 3, name: 'Dense Planting', desc: '+1 more bud; bursts leave a corroding trace.', grants: [{ t: 'projectile', extraProjectiles: 1 }, { t: 'ability', components: [{ type: 'aura', radius: 110, damage: 5, status: { kind: 'Corrosion', amount: 1 }, react: true, particle: 'acid' }] }] },
      { tier: 4, name: 'Rampant Growth', desc: '+25% seeding cadence, heavier payloads, wider blooms.', fireRateMult: 1.25, damageMult: 1.12, grants: [{ t: 'projectile', splashMult: 1.1 }] },
      { tier: 5, name: 'The Choking Thicket', desc: 'TWO more buds — the lane is the trap.', damageMult: 1.1, particle: 'spore', impact: 'acid', grants: [{ t: 'projectile', extraProjectiles: 2 }, { t: 'cosmetic', id: 'thicket' }] },
    ],
  },
  // ════════════ SYNAPSE SPIRE (Neural, chain arc-caster) ════════════
  // The arc honours damage/rate ride-alongs, extraProjectiles (+hops), and ability grants on the
  // cast. No pierce — the arc IS the multi-hit.
  {
    id: 'spire_storm', tower: 'spire', name: 'Stormcall',
    theme: 'One arc to end them — fewer, harder strikes that stun what they touch.',
    tiers: [
      { tier: 1, name: 'High Tension', desc: 'Arcs hit 20% harder, and the entry strike can OVERLOAD (×3).', damageMult: 1.2, particle: 'spark', sfx: 'br_storm', impact: 'spark', grants: [{ t: 'ability', components: [{ type: 'crit', chance: 0.2, mult: 3, damage: 10 }] }] },
      { tier: 2, name: 'Overload Relay', desc: 'First strikes DISRUPT the victim.', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Disruption', amount: 1.5 } }] }] },
      { tier: 3, name: 'Storm Front', desc: 'Harder arcs; a static ring chips the near field.', damageMult: 1.15, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 120, damage: 7, react: true, particle: 'spark' }] }] },
      { tier: 4, name: 'Thundering Verdict', desc: '+1 hop and heavier voltage.', damageMult: 1.15, grants: [{ t: 'projectile', extraProjectiles: 1 }] },
      { tier: 5, name: 'The Stormcall', desc: 'A detonating overload erupts from every first strike.', damageMult: 1.25, particle: 'railburst', impact: 'spark', grants: [{ t: 'ability', components: [{ type: 'explosion', at: 'victim', radius: 140, damage: 34, react: true, particle: 'spark' }] }, { t: 'cosmetic', id: 'stormcall' }] },
    ],
  },
  {
    id: 'spire_web', tower: 'spire', name: 'Synaptic Web',
    theme: 'The lightning goes ON — a web of hops that owns the whole pack.',
    tiers: [
      { tier: 1, name: 'Sixth Synapse', desc: '+1 arc hop.', particle: 'spark', sfx: 'br_psi', impact: 'spark', grants: [{ t: 'projectile', extraProjectiles: 1 }] },
      { tier: 2, name: 'Fast Relay', desc: '+20% cast cadence, and a relay spark arcs out beside the main bolt.', fireRateMult: 1.2, grants: [{ t: 'ability', components: [{ type: 'chain', jumps: 2, range: 210, damage: 9, falloff: 0.75, particle: 'spark' }] }] },
      { tier: 3, name: 'Seventh Synapse', desc: '+1 more hop; hops leave Disruption.', grants: [{ t: 'projectile', extraProjectiles: 1 }, { t: 'ability', components: [{ type: 'aura', radius: 130, status: { kind: 'Disruption', amount: 0.8 } }] }] },
      { tier: 4, name: 'Humming Grid', desc: '+25% cast cadence, hotter current — an eighth synapse joins the web.', fireRateMult: 1.25, damageMult: 1.1, grants: [{ t: 'projectile', extraProjectiles: 1 }] },
      { tier: 5, name: 'The Synaptic Web', desc: 'TWO more hops — the pack is one circuit.', damageMult: 1.1, particle: 'railburst', impact: 'spark', grants: [{ t: 'projectile', extraProjectiles: 2 }, { t: 'cosmetic', id: 'web' }] },
    ],
  },
  // ════════════ UNDERTOW POLYP (Kinetic, pull-field) ════════════
  // Displacement magnitude STACKS via extra pull auras (the branch grant currency here).
  {
    id: 'polyp_riptide', tower: 'polyp', name: 'Riptide Engine',
    theme: 'The drag becomes a verdict — deeper, harder undertows that unmake progress.',
    tiers: [
      { tier: 1, name: 'Strong Current', desc: 'A second drag current joins each pulse.', particle: 'disrupt', sfx: 'br_maw', impact: 'disrupt', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 155, pull: 20 }] }] },
      { tier: 2, name: 'Cold Depth', desc: 'The held are Disrupted (slow + vulnerable).', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 155, status: { kind: 'Disruption', amount: 0.8 } }] }] },
      { tier: 3, name: 'Deep Riptide', desc: 'A THIRD current — whole seconds stolen.', damageMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 160, pull: 26, particle: 'disrupt' }] }] },
      { tier: 4, name: 'Millstone', desc: 'The churn grinds — real damage on the held.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 165, damage: 11, react: true }] }] },
      { tier: 5, name: 'The Riptide Engine', desc: 'A monstrous drag: the wave near it simply stops arriving.', damageMult: 1.15, particle: 'dissolve', impact: 'disrupt', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 180, pull: 44, particle: 'disrupt' }] }, { t: 'cosmetic', id: 'riptide' }] },
    ],
  },
  {
    id: 'polyp_gorge', tower: 'polyp', name: 'Grinding Gorge',
    theme: 'What the tide holds, the gorge EATS — the churn becomes a killing floor.',
    tiers: [
      { tier: 1, name: 'Toothed Basin', desc: 'The churn bites: +8 damage per pulse.', particle: 'gore', sfx: 'br_gullet', impact: 'gore', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 160, damage: 8, react: true }] }] },
      { tier: 2, name: 'Shearing Stones', desc: 'Fracture shears off everything held.', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 160, status: { kind: 'Fracture', amount: 1 } }] }] },
      { tier: 3, name: 'Faster Wheel', desc: '+20% pulse cadence and a harder bite.', fireRateMult: 1.2, damageMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 165, damage: 5, react: true }] }] },
      { tier: 4, name: 'Marrow Mill', desc: 'The gorge crushes — heavy chip on the held.', damageMult: 1.15, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 170, damage: 13, react: true, particle: 'gore' }] }] },
      { tier: 5, name: 'The Grinding Gorge', desc: 'A killing floor: massive churn damage and one last deep drag.', damageMult: 1.2, particle: 'gore', impact: 'gore', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 180, damage: 16, pull: 24, react: true, particle: 'gore' }] }, { t: 'cosmetic', id: 'gorge' }] },
    ],
  },

  // ════════════ SPITFANG TURRET (Kinetic, mid-range homing autocannon) ════════════
  // The dependable damage pick — a brisk single-target autocannon. Its two paths split the classic
  // gunner fantasy: SATURATE a crowd with flechettes, or PUNCH one armoured target with a heavy slug.
  {
    id: 'spitfang_scatter', tower: 'spitfang', name: 'Flechette Storm',
    theme: 'The autocannon opens up — a widening cone of self-guiding flechettes that shreds a crowd.',
    tiers: [
      { tier: 1, name: 'Split Rounds', desc: 'Fires a second flechette; locks onto the FASTEST target.', damageMult: 1.1, particle: 'ember', sfx: 'br_scatter', impact: 'shrapnel', grants: [{ t: 'targeting', profile: 'fastest' }, { t: 'projectile', extraProjectiles: 1 }] },
      { tier: 2, name: 'Open Bolt', desc: '+2 flechettes per burst, and it spins faster.', fireRateMult: 1.2, grants: [{ t: 'projectile', extraProjectiles: 2 }] },
      { tier: 3, name: 'Serrated Tips', desc: 'Flechettes pierce 1 host and smear Corrosion — priming Shred.', damageMult: 1.1, particle: 'shrapnel', impact: 'shrapnel', grants: [{ t: 'projectile', mutators: ['pierce1'] }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Corrosion', amount: 1 } }] }] },
      { tier: 4, name: 'Saturation Net', desc: '+2 more flechettes, pierce 2; hunt the most-corrupted prey.', damageMult: 1.15, grants: [{ t: 'projectile', extraProjectiles: 2, mutators: ['pierce2'] }, { t: 'targeting', profile: 'mostCorrupted' }] },
      { tier: 5, name: 'The Flechette Storm', desc: 'A ceaseless storm: +2 flechettes, pierce 3, and vicious crits on the swarm.', damageMult: 1.25, fireRateMult: 1.2, particle: 'barbstorm', impact: 'shrapnel', grants: [{ t: 'projectile', extraProjectiles: 2, mutators: ['pierce3'] }, { t: 'ability', components: [{ type: 'crit', chance: 0.3, mult: 2.4, damage: 6 }] }, { t: 'cosmetic', id: 'flechette' }] },
    ],
  },
  {
    id: 'spitfang_slug', tower: 'spitfang', name: 'Heavy Slug',
    theme: 'One barrel, one enormous armour-piercing round — the answer to anything that walks tall.',
    tiers: [
      { tier: 1, name: 'Depleted Slug', desc: 'A heavy AP round that pierces 1; targets the TOUGHEST enemy.', damageMult: 1.2, particle: 'spark', sfx: 'br_slug', impact: 'ember', grants: [{ t: 'targeting', profile: 'highestHealth' }, { t: 'projectile', mutators: ['pierce1'] }] },
      { tier: 2, name: 'Sabot Core', desc: 'Punches through 2 hosts and Fractures the struck (armour shred).', damageMult: 1.1, grants: [{ t: 'projectile', mutators: ['pierce2'] }, { t: 'ability', components: [{ type: 'debuff', at: 'victim', radius: 90, status: { kind: 'Fracture', amount: 1 } }] }] },
      { tier: 3, name: 'Overpressure', desc: 'An overcharged round that detonates on impact — brutal crits.', damageMult: 1.2, particle: 'ember', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'crit', chance: 0.25, mult: 2, damage: 8 }] }] },
      { tier: 4, name: 'Anti-Materiel', desc: 'Pierce 3 and a longer overwatch reach.', damageMult: 1.15, rangeMult: 1.1, grants: [{ t: 'projectile', mutators: ['pierce3'] }] },
      { tier: 5, name: 'The Executioner', desc: 'A single devastating round — a massive execute crit on the toughest prey.', damageMult: 1.3, fireRateMult: 1.1, particle: 'shrapnel', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'crit', chance: 0.4, mult: 3, damage: 14 }] }, { t: 'cosmetic', id: 'slug' }] },
    ],
  },

  // ════════════ RIFT ANCHOR (Neural, void PULL field) ════════════
  // The deepest unlock — a psionic singularity. A field tower (aura grants like the Polyp); its two
  // paths split void identity: COLLAPSE holds the wave in a killing gravity, ANNIHILATE crushes it.
  {
    id: 'rift_collapse', tower: 'rift', name: 'Event Horizon',
    theme: 'The anchor deepens into a well nothing escapes — the wave is dragged in and simply stops arriving.',
    tiers: [
      { tier: 1, name: 'Deepening Well', desc: 'A second inner current drags the caught again.', particle: 'disrupt', sfx: 'br_collapse', impact: 'disrupt', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 170, pull: 24 }] }] },
      { tier: 2, name: 'Time Dilation', desc: 'The held are Disrupted (slowed + vulnerable).', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 170, status: { kind: 'Disruption', amount: 0.9 } }] }] },
      { tier: 3, name: 'Gravity Shear', desc: 'A third current, and Fracture shears everything held.', damageMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 175, pull: 26, particle: 'disrupt' }, { type: 'debuff', radius: 175, status: { kind: 'Fracture', amount: 1 } }] }] },
      { tier: 4, name: 'Singularity Grip', desc: 'A monstrous drag — whole seconds stolen from the wave.', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 180, pull: 34, particle: 'disrupt' }] }] },
      { tier: 5, name: 'The Event Horizon', desc: 'Nothing escapes: an immense well that unmakes all forward progress.', damageMult: 1.15, particle: 'dissolve', impact: 'disrupt', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 200, pull: 52, particle: 'disrupt' }] }, { t: 'cosmetic', id: 'horizon' }] },
    ],
  },
  {
    id: 'rift_annihilate', tower: 'rift', name: 'Annihilation Core',
    theme: 'The singularity is turned outward — a crushing field that grinds the caught to nothing.',
    tiers: [
      { tier: 1, name: 'Crushing Field', desc: 'The well BITES: real damage on everything held each pulse.', particle: 'disrupt', sfx: 'br_annihilate', impact: 'shred', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 175, damage: 9, react: true }] }] },
      { tier: 2, name: 'Tidal Force', desc: 'Fracture shears off everything the field grinds.', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 175, status: { kind: 'Fracture', amount: 1 } }] }] },
      { tier: 3, name: 'Accretion', desc: '+20% collapse cadence and a harder crush.', fireRateMult: 1.2, damageMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 180, damage: 6, react: true }] }] },
      { tier: 4, name: 'Neutron Press', desc: 'The core presses down — heavy chip on the held.', damageMult: 1.15, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 185, damage: 14, react: true, particle: 'disrupt' }] }] },
      { tier: 5, name: 'The Annihilation Core', desc: 'Total collapse: catastrophic crush damage and one last deep drag.', damageMult: 1.2, particle: 'dissolve', impact: 'shred', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 200, damage: 18, pull: 26, react: true, particle: 'disrupt' }] }, { t: 'cosmetic', id: 'annihilate' }] },
    ],
  },

  // ════════════ WYRMWING GLAIVE (Kinetic, returning 'arc' blade) ════════════
  // The lane-carver. Its paths split the blade's identity: RAZOR CYCLONE sharpens the cut itself
  // (a second blade, crits, shredded plating), EMBER RETURN sets the edge alight (Corrosion teeth
  // + a detonation where the blade turns). Pierce mutators are meaningless here — the arc already
  // cuts everything on its path — so both ladders spend on blades, statuses and blasts instead.
  {
    id: 'glaive_razor', tower: 'glaive', name: 'Razor Cyclone',
    theme: 'The blade is honed past reason — more edges, deeper cuts, and plating peeling off the lane.',
    tiers: [
      { tier: 1, name: 'Whetted Edge', desc: 'A keener blade that hunts the TOUGHEST body on the lane.', damageMult: 1.15, particle: 'spark', sfx: 'br_slug', impact: 'shrapnel', grants: [{ t: 'targeting', profile: 'highestHealth' }] },
      { tier: 2, name: 'Twin Glaive', desc: 'A SECOND blade per throw, carving its own line.', damageMult: 1.05, grants: [{ t: 'projectile', extraProjectiles: 1 }] },
      { tier: 3, name: 'Flaying Arc', desc: 'Every pass FRACTURES — plating peels along the whole cut.', damageMult: 1.1, particle: 'shrapnel', impact: 'shrapnel', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 130, status: { kind: 'Fracture', amount: 1 } }] }] },
      { tier: 4, name: 'Cyclone Tempo', desc: 'A faster wheel — throws come around sooner and cut farther.', fireRateMult: 1.15, rangeMult: 1.08, grants: [{ t: 'ability', components: [{ type: 'crit', chance: 0.2, mult: 2, damage: 6 }] }] },
      { tier: 5, name: 'The Razor Cyclone', desc: 'A THIRD blade and vicious crits — the lane is a lathe.', damageMult: 1.2, fireRateMult: 1.1, particle: 'barbstorm', impact: 'shrapnel', grants: [{ t: 'projectile', extraProjectiles: 1 }, { t: 'ability', components: [{ type: 'crit', chance: 0.3, mult: 2.4, damage: 8 }] }, { t: 'cosmetic', id: 'cyclone' }] },
    ],
  },
  {
    id: 'glaive_ember', tower: 'glaive', name: 'Ember Return',
    theme: 'The edge is quenched in the wyrm-forge — every cut smolders, and the turnaround DETONATES.',
    tiers: [
      { tier: 1, name: 'Quenched Edge', desc: 'The blade smolders — cuts leave Corrosion burning in the wound.', damageMult: 1.08, particle: 'ember', sfx: 'br_scatter', impact: 'ember', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Corrosion', amount: 2 } }] }] },
      { tier: 2, name: 'Cinder Wake', desc: 'The pass sears everything NEAR the cut, not just the cut.', damageMult: 1.06, grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 130, status: { kind: 'Corrosion', amount: 1 } }] }] },
      { tier: 3, name: 'Turnaround Burst', desc: 'The blade DETONATES where it wheels — a blast at the carve\'s deep end.', damageMult: 1.08, particle: 'ember', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 110, damage: 20, react: true, particle: 'ember' }] }] },
      { tier: 4, name: 'Long Furnace', desc: 'A longer, hotter carve — the corridor deepens.', rangeMult: 1.12, damageMult: 1.08, grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Corrosion', amount: 2 } }] }] },
      { tier: 5, name: 'The Ember Return', desc: 'The turnaround becomes a CATACLYSM — a wide molten blast and deep rot on the lane.', damageMult: 1.15, fireRateMult: 1.08, particle: 'dissolve', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'explosion', radius: 150, damage: 34, react: true, particle: 'ember' }, { type: 'debuff', radius: 150, status: { kind: 'Corrosion', amount: 2 } }] }, { t: 'cosmetic', id: 'emberreturn' }] },
    ],
  },

  // ════════════ DRAKE ROOST (Vital, 'summon' brood) ════════════
  // The brood engine — its branch mults shape the UNITS (damageMult = claws, fireRateMult = hatch
  // cadence, rangeMult = the hunt leash) and its 'brood' grants shape the CLUTCH: ALPHA BROOD
  // matures fewer, bigger drakes (unit-tier bumps read on the field as bigger, winged bodies);
  // SWARM CLUTCH breeds more, faster. Ability grants would never fire (the roost never casts).
  {
    id: 'roost_alpha', tower: 'roost', name: 'Alpha Brood',
    theme: 'Fewer eggs, warmer blood — the clutch matures into ember drakes, then true wyrmspawn.',
    tiers: [
      { tier: 1, name: 'Warm Blood', desc: 'The brood strikes harder and mends faster at the perch.', damageMult: 1.15, particle: 'ember', sfx: 'br_slug', impact: 'ember', grants: [{ t: 'cosmetic', id: 'alphacrest' }] },
      { tier: 2, name: 'Ember Clutch', desc: 'The clutch MATURES — drakelings hatch as EMBER DRAKES.', damageMult: 1.08, grants: [{ t: 'brood', tierBonus: 1 }] },
      { tier: 3, name: 'Deep Territory', desc: 'The brood ranges farther from the perch, hitting harder.', rangeMult: 1.12, damageMult: 1.1, grants: [{ t: 'cosmetic', id: 'alphahorns' }] },
      { tier: 4, name: 'Wyrm Blood', desc: 'The clutch matures AGAIN — the roost raises true WYRMSPAWN.', damageMult: 1.1, grants: [{ t: 'brood', tierBonus: 1 }] },
      { tier: 5, name: 'The Alpha Brood', desc: 'An apex clutch: another egg in the nest, and every wyrm strikes like a siege engine.', damageMult: 1.2, rangeMult: 1.08, particle: 'dissolve', grants: [{ t: 'brood', broodBonus: 1 }, { t: 'cosmetic', id: 'alphathrone' }] },
    ],
  },
  {
    id: 'roost_swarm', tower: 'roost', name: 'Swarm Clutch',
    theme: 'More eggs, hotter incubation — a sky of small drakes that never stops hatching.',
    tiers: [
      { tier: 1, name: 'Crowded Nest', desc: 'A THIRD egg joins the clutch.', particle: 'bloom', sfx: 'br_scatter', impact: 'bloom', grants: [{ t: 'brood', broodBonus: 1 }] },
      { tier: 2, name: 'Fevered Incubation', desc: 'Eggs hatch markedly faster.', fireRateMult: 1.2, grants: [{ t: 'cosmetic', id: 'swarmglow' }] },
      { tier: 3, name: 'Fourth Egg', desc: 'ANOTHER egg — the territory darkens with wings.', fireRateMult: 1.08, grants: [{ t: 'brood', broodBonus: 1 }] },
      { tier: 4, name: 'Pack Hunters', desc: 'The swarm matures — drakelings hatch as EMBER DRAKES.', damageMult: 1.08, grants: [{ t: 'brood', tierBonus: 1 }] },
      { tier: 5, name: 'The Swarm Clutch', desc: 'A FIFTH egg and frantic hatching — the roost blackens its own sky.', damageMult: 1.1, fireRateMult: 1.15, particle: 'barbstorm', grants: [{ t: 'brood', broodBonus: 1 }, { t: 'cosmetic', id: 'swarmsky' }] },
    ],
  },

  // ════════════ MIASMA LUNG (Viral, 'field' plague fog) ════════════
  // The zone infector. PANDEMIC ENGINE deepens the plague itself (more Infection per breath, a
  // numbing damp that Blooms); CAUSTIC SMOTHER turns the fog to acid (damage + Corrosion — the
  // Putrefy engine). Both stack extra aura breaths on the exhale cadence — no new verbs.
  {
    id: 'lung_plague', tower: 'lung', name: 'Pandemic Engine',
    theme: 'The fog stops being weather and becomes an OUTBREAK — every breath a deeper coat of plague.',
    tiers: [
      { tier: 1, name: 'Carrier Spores', desc: 'A second infectious coat rides each breath.', fireRateMult: 1.08, particle: 'infect', sfx: 'br_plague', impact: 'infect', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 245, status: { kind: 'Infection', amount: 1 } }] }] },
      { tier: 2, name: 'Rolling Fog', desc: 'The bank spreads wider and bites as it rolls.', rangeMult: 1.12, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 255, damage: 4 }] }] },
      { tier: 3, name: 'Numbing Damp', desc: 'The damp NUMBS — Disruption in the fog makes the plague BLOOM.', damageMult: 1.1, particle: 'venom', impact: 'venom', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 245, status: { kind: 'Disruption', amount: 0.7 } }] }] },
      { tier: 4, name: 'Outbreak Logic', desc: 'Faster breaths, another coat — the outbreak organizes.', fireRateMult: 1.12, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 250, status: { kind: 'Infection', amount: 1 }, particle: 'pandemic' }] }] },
      { tier: 5, name: 'The Pandemic Engine', desc: 'The fog IS the outbreak: deep plague on every body it touches.', damageMult: 1.2, fireRateMult: 1.1, particle: 'pandemic', impact: 'pandemic', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 265, status: { kind: 'Infection', amount: 2 } }] }, { t: 'cosmetic', id: 'pandemicfog' }] },
    ],
  },
  {
    id: 'lung_choke', tower: 'lung', name: 'Caustic Smother',
    theme: 'The fog turns to acid — the crowd is not infected so much as DISSOLVED where it stands.',
    tiers: [
      { tier: 1, name: 'Acrid Bite', desc: 'The fog BITES — real damage on everything it holds.', damageMult: 1.15, particle: 'acid', sfx: 'br_acid', impact: 'acid', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 240, damage: 6, react: true }] }] },
      { tier: 2, name: 'Clinging Reek', desc: 'Corrosion clings to the fogged — the rot accelerates (Putrefy).', damageMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 240, status: { kind: 'Corrosion', amount: 1 } }] }] },
      { tier: 3, name: 'Heavy Vapor', desc: 'A heavier, wider bank that wounds as it settles.', rangeMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 250, damage: 8, react: true }] }] },
      { tier: 4, name: 'Lungburn', desc: 'The acid reaches the LUNGS — deep corrosive damage inside the bank.', damageMult: 1.15, particle: 'dissolve', impact: 'dissolve', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 245, status: { kind: 'Corrosion', amount: 1.5 } }] }] },
      { tier: 5, name: 'The Smothering Bloom', desc: 'Nothing breathes in it and walks out — a dissolving, reacting shroud.', damageMult: 1.25, particle: 'dissolve', impact: 'dissolve', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 260, damage: 12, status: { kind: 'Corrosion', amount: 2 }, react: true }] }, { t: 'cosmetic', id: 'smother' }] },
    ],
  },

  // ════════════ CHITIN BELL (Resonant, 'field' toll slammer) ════════════
  // The reaction primer. FUNERAL DIRGE weds the toll to Fracture (the Shear self-engine — heavy,
  // slow, skeleton-cracking); DEAFENING CHORUS deepens the Resonance itself (faster tolls, more
  // stacks, a numbing Overtone). Both stack extra slams on the toll cadence — no new verbs.
  {
    id: 'bell_dirge', tower: 'bell', name: 'Funeral Dirge',
    theme: 'The toll turns funerary — every note cracks shells, and the resonance SHEARS what it cracked.',
    tiers: [
      { tier: 1, name: 'Leaden Tongue', desc: 'The slam CRACKS — Fracture rides every toll (Shear fuel).', damageMult: 1.15, particle: 'shred', sfx: 'br_siege', impact: 'shred', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 225, status: { kind: 'Fracture', amount: 1 } }] }] },
      { tier: 2, name: 'Grave Weight', desc: 'A heavier note — the toll lands twice.', damageMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 230, damage: 10, react: true }] }] },
      { tier: 3, name: 'Mourning Peal', desc: 'The dirge deepens — more cracks per toll, sooner.', fireRateMult: 1.08, grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 230, status: { kind: 'Fracture', amount: 1 } }] }] },
      { tier: 4, name: 'Sepulchral Boom', desc: 'The note becomes a BLOW — heavy reacting damage in the ring.', damageMult: 1.15, particle: 'railburst', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 240, damage: 14, react: true }] }] },
      { tier: 5, name: 'The Funeral Dirge', desc: 'One toll and the crowd is a reliquary — deep cracks, then the shear.', damageMult: 1.25, particle: 'railburst', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 245, status: { kind: 'Fracture', amount: 2 } }, { type: 'aura', radius: 245, damage: 16, react: true }] }, { t: 'cosmetic', id: 'dirge' }] },
    ],
  },
  {
    id: 'bell_chorus', tower: 'bell', name: 'Deafening Chorus',
    theme: 'The bell learns harmony with itself — faster tolls, deeper resonance, a note that numbs.',
    tiers: [
      { tier: 1, name: 'Choir of One', desc: 'A second resonant coat rides each toll.', fireRateMult: 1.12, particle: 'spark', sfx: 'br_amber', impact: 'spark', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 230, status: { kind: 'Resonance', amount: 1 } }] }] },
      { tier: 2, name: 'Standing Wave', desc: 'The ring widens and bites as it holds.', rangeMult: 1.12, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 240, damage: 6, react: true }] }] },
      { tier: 3, name: 'Third Harmonic', desc: 'Another harmonic — resonance stacks faster still.', fireRateMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 235, status: { kind: 'Resonance', amount: 1 } }] }] },
      { tier: 4, name: 'Numbing Overtone', desc: 'The note NUMBS — Disruption hums under the toll (Overtone fuel).', fireRateMult: 1.08, particle: 'railburst', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 235, status: { kind: 'Disruption', amount: 0.7 } }] }] },
      { tier: 5, name: 'The Deafening Chorus', desc: 'The bell sings in chords — deep resonance and a biting, reacting ring.', damageMult: 1.15, fireRateMult: 1.15, particle: 'railburst', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 250, damage: 10, status: { kind: 'Resonance', amount: 2 }, react: true }] }, { t: 'cosmetic', id: 'chorus' }] },
    ],
  },

  // ════════════ ACID LANCET (Caustic, 'homing' executioner harpoon) ════════════
  // The cull. HEADSMAN'S DRAW perfects the single stroke (crits, pierce, a third harpoon);
  // DISSOLVING POINT makes the wound the weapon (acid bursts, rot, a detonating head). extraProjectiles
  // = a second harpoon per draw; pierce mutators let the draw pass THROUGH the kill.
  {
    id: 'lancet_headsman', tower: 'lancet', name: "Headsman's Draw",
    theme: 'One draw, one monster — the stroke is honed until size stops being an argument.',
    tiers: [
      { tier: 1, name: 'Honed Head', desc: 'A keener head — vicious critical draws.', damageMult: 1.2, particle: 'spark', sfx: 'br_rail', impact: 'spark', grants: [{ t: 'ability', components: [{ type: 'crit', chance: 0.2, mult: 2, damage: 30 }] }] },
      { tier: 2, name: 'Piercing Draw', desc: 'The harpoon passes THROUGH the kill into the body behind it.', damageMult: 1.1, grants: [{ t: 'projectile', mutators: ['pierce1'] }] },
      { tier: 3, name: 'Boneseeker Sight', desc: 'It reads the joints — crueler crits, a quicker draw.', fireRateMult: 1.06, grants: [{ t: 'ability', components: [{ type: 'crit', chance: 0.25, mult: 2.2, damage: 35 }] }] },
      { tier: 4, name: 'Twin Ballista', desc: 'A SECOND harpoon per draw, hunting its own monster.', damageMult: 1.08, grants: [{ t: 'projectile', extraProjectiles: 1 }] },
      { tier: 5, name: 'The Headsman', desc: 'The stroke is perfect: massive killing crits, and the draw passes through the row.', damageMult: 1.3, particle: 'railburst', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'crit', chance: 0.35, mult: 2.5, damage: 50 }] }, { t: 'projectile', mutators: ['pierce2'] }, { t: 'cosmetic', id: 'headsman' }] },
    ],
  },
  {
    id: 'lancet_venom', tower: 'lancet', name: 'Dissolving Point',
    theme: 'The head is a vial — the cull is only the delivery, and the wound does the rest.',
    tiers: [
      { tier: 1, name: 'Bile-Dipped', desc: 'The wound MELTS wider — deeper Corrosion in the impaled.', damageMult: 1.1, particle: 'acid', sfx: 'br_acid', impact: 'acid', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Corrosion', amount: 1.5 } }] }] },
      { tier: 2, name: 'Bursting Gall', desc: 'The head BURSTS — acid sprays the bodies beside the victim.', damageMult: 1.05, grants: [{ t: 'ability', components: [{ type: 'debuff', at: 'victim', radius: 110, status: { kind: 'Corrosion', amount: 1.5 } }] }] },
      { tier: 3, name: 'Melting Quarrel', desc: 'The impact DETONATES — a dissolving blast at the wound.', damageMult: 1.08, particle: 'dissolve', impact: 'dissolve', grants: [{ t: 'ability', components: [{ type: 'explosion', at: 'victim', radius: 100, damage: 20, react: true, particle: 'acid' }] }] },
      { tier: 4, name: 'Deep Rot', desc: 'ROT rides the head — Infection festers in the wound (Putrefy fuel).', damageMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Infection', amount: 2 } }] }] },
      { tier: 5, name: 'The Dissolving Point', desc: 'The victim becomes the weapon: a wide melting blast and acid on everything near it.', damageMult: 1.2, particle: 'dissolve', impact: 'dissolve', grants: [{ t: 'ability', components: [{ type: 'explosion', at: 'victim', radius: 130, damage: 30, react: true, particle: 'dissolve' }, { type: 'debuff', at: 'victim', radius: 120, status: { kind: 'Corrosion', amount: 2 } }] }, { t: 'cosmetic', id: 'dissolvepoint' }] },
    ],
  },

  // ════════════ BASILISK MAW (Neural, 'homing' petrifier — ARENA EXCLUSIVE) ════════════
  // The stare. EVENT HORIZON perfects the STOP (deeper freezes, wider static); STONE GARDEN
  // turns the petrified into ordnance (cracks, bursts on the stone). Zero new verbs.
  {
    id: 'basilisk_horizon', tower: 'basilisk', name: 'Event Horizon',
    theme: 'The stare widens until the charge itself is a memory — nothing it watches arrives.',
    tiers: [
      { tier: 1, name: 'Second Iris', desc: 'The static spreads — Disruption around every stone.', damageMult: 1.1, particle: 'disrupt', sfx: 'br_amber', impact: 'disrupt', grants: [{ t: 'ability', components: [{ type: 'debuff', at: 'victim', radius: 80, status: { kind: 'Disruption', amount: 0.6 } }] }] },
      { tier: 2, name: 'Deep Stone', desc: 'The petrification HOLDS longer.', damageMult: 1.08, grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Freeze', amount: 0.4 } }] }] },
      { tier: 3, name: 'Wide Court', desc: 'The eye sees farther — and its static reaches with it.', rangeMult: 1.1, fireRateMult: 1.06, grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Disruption', amount: 0.4 } }] }] },
      { tier: 4, name: 'Paralytic Field', desc: 'The static becomes a FIELD — deep Disruption around the verdict.', damageMult: 1.1, particle: 'railburst', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'debuff', at: 'victim', radius: 110, status: { kind: 'Disruption', amount: 0.9 } }] }] },
      { tier: 5, name: 'The Event Horizon', desc: 'Past this line nothing moves — long stone, wide static, a colder verdict.', damageMult: 1.2, particle: 'railburst', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Freeze', amount: 0.5 } }, { type: 'debuff', at: 'victim', radius: 120, status: { kind: 'Disruption', amount: 0.8 } }] }, { t: 'cosmetic', id: 'horizon' }] },
    ],
  },
  {
    id: 'basilisk_garden', tower: 'basilisk', name: 'Stone Garden',
    theme: 'What the stare stops, the garden SHATTERS — the petrified are ordnance now.',
    tiers: [
      { tier: 1, name: 'Cracking Gaze', desc: 'The stone CRACKS — Fracture rides the bolt (Shear fuel).', damageMult: 1.12, particle: 'shred', sfx: 'br_siege', impact: 'shred', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Fracture', amount: 1 } }] }] },
      { tier: 2, name: 'Splinter Verdict', desc: 'The impact bursts — damage around the stone.', damageMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'explosion', at: 'victim', radius: 70, damage: 16 }] }] },
      { tier: 3, name: 'Heavier Sentences', desc: 'The bolt lands crueler, quicker — and cracks as it lands.', damageMult: 1.1, fireRateMult: 1.06, grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Fracture', amount: 1 } }] }] },
      { tier: 4, name: 'Shattering Stare', desc: 'Deeper cracks — and a vicious critical verdict.', damageMult: 1.1, particle: 'railburst', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'crit', chance: 0.25, mult: 2.2, damage: 30 }, { type: 'status', status: { kind: 'Fracture', amount: 1 } }] }] },
      { tier: 5, name: 'The Stone Garden', desc: 'Every statue is a bomb the next bolt sets off.', damageMult: 1.22, particle: 'railburst', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'explosion', at: 'victim', radius: 95, damage: 30 }, { type: 'status', status: { kind: 'Fracture', amount: 2 } }] }, { t: 'cosmetic', id: 'garden' }] },
    ],
  },

  // ════════════ OSSUARY CHOIR (Resonant, 'field' chord organ — ARENA EXCLUSIVE) ════════════
  // The hymn. REQUIEM ENGINE weds the chord to Fracture and weight; ETERNAL CHORUS deepens the
  // resonance and tempo. Both stack extra chords on the toll cadence — no new verbs.
  {
    id: 'ossuary_requiem', tower: 'ossuary', name: 'Requiem Engine',
    theme: 'The hymn turns funerary — every chord cracks the pallbearers and shears what it cracked.',
    tiers: [
      { tier: 1, name: 'Leaden Chord', desc: 'The chord CRACKS — Fracture rides every hymn (Shear fuel).', damageMult: 1.15, particle: 'shred', sfx: 'br_siege', impact: 'shred', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 245, status: { kind: 'Fracture', amount: 1 } }] }] },
      { tier: 2, name: 'Grave Meter', desc: 'A heavier hymn — the chord lands twice.', damageMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 250, damage: 10, react: true }] }] },
      { tier: 3, name: 'Mourning Register', desc: 'The requiem deepens — more cracks per chord, sooner.', fireRateMult: 1.08, grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 250, status: { kind: 'Fracture', amount: 1 } }] }] },
      { tier: 4, name: 'Sepulchral Chord', desc: 'The hymn becomes a BLOW — heavy reacting damage in the nave.', damageMult: 1.15, particle: 'railburst', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 260, damage: 15, react: true }] }] },
      { tier: 5, name: 'The Requiem Engine', desc: 'One chord and the yard is a reliquary — deep cracks, then the shear.', damageMult: 1.25, particle: 'railburst', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 265, status: { kind: 'Fracture', amount: 2 } }, { type: 'aura', radius: 265, damage: 17, react: true }] }, { t: 'cosmetic', id: 'requiem' }] },
    ],
  },
  {
    id: 'ossuary_chorus', tower: 'ossuary', name: 'Eternal Chorus',
    theme: 'The choir learns harmony with itself — faster hymns, deeper resonance, a nave that never falls silent.',
    tiers: [
      { tier: 1, name: 'Borrowed Throat', desc: 'A second resonant coat rides each chord.', fireRateMult: 1.12, particle: 'spark', sfx: 'br_amber', impact: 'spark', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 250, status: { kind: 'Resonance', amount: 1 } }] }] },
      { tier: 2, name: 'Standing Hymn', desc: 'The nave widens and bites as it holds.', rangeMult: 1.12, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 260, damage: 6, react: true }] }] },
      { tier: 3, name: 'Fourth Harmonic', desc: 'Another harmonic — resonance stacks faster still.', fireRateMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'aura', radius: 255, status: { kind: 'Resonance', amount: 1 } }] }] },
      { tier: 4, name: 'Numbing Psalm', desc: 'The hymn NUMBS — Disruption hums under the chord.', fireRateMult: 1.08, particle: 'railburst', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 255, status: { kind: 'Disruption', amount: 0.7 } }] }] },
      { tier: 5, name: 'The Eternal Chorus', desc: 'The choir sings in chords of chords — deep resonance and a biting, reacting nave.', damageMult: 1.15, fireRateMult: 1.15, particle: 'railburst', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 275, damage: 11, status: { kind: 'Resonance', amount: 2 }, react: true }] }, { t: 'cosmetic', id: 'eternal' }] },
    ],
  },

  // ════════════ GRISTLE WARREN (Vital, 'field' barracks) ════════════
  // The wall. MEAT WALL musters FEWER, BIGGER blockers (Sinew Hulks) and cracks what they hold;
  // SWARMING GRISTLE floods the lane with quick Gristlelings and MARKS the held for the harvest.
  // Every extra body is another `summon` component on the muster cadence — the global MINION_CAP
  // bounds the wall; the warren's gnash (aura) is what earns mastery. No new verbs.
  {
    id: 'warren_wall', tower: 'warren', name: 'Meat Wall',
    theme: 'The warren grows its walls THICKER — hulking sinew that holds the lane while the board cracks what it holds.',
    tiers: [
      { tier: 1, name: 'Gnashing Gate', desc: 'The warren BITES what its walls hold — a heavier gnash at its foot.', damageMult: 1.15, particle: 'gore', sfx: 'br_gore', impact: 'gore', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 125, damage: 8, react: true }] }] },
      { tier: 2, name: 'Sinew Hulk', desc: 'Each muster adds a SINEW HULK — a thick, slow wall that holds a heavy for half a minute.', grants: [{ t: 'ability', components: [{ type: 'summon', unit: 'gristlehulk', count: 1 }] }] },
      { tier: 3, name: 'Cracking Grip', desc: 'The held are CRACKED — Fracture around the warren (Shred / Shear fuel).', rangeMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 140, status: { kind: 'Fracture', amount: 1 } }] }] },
      { tier: 4, name: 'Bone Lattice', desc: 'A quicker muster — the walls go up faster and the gnash bites deeper.', fireRateMult: 1.12, damageMult: 1.1, particle: 'shrapnel', impact: 'shrapnel', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 135, damage: 12, react: true }] }] },
      { tier: 5, name: 'The Meat Wall', desc: 'A second Hulk per muster and a crushing, cracking gnash — nothing on foot gets past.', damageMult: 1.2, particle: 'shrapnel', impact: 'shrapnel', grants: [{ t: 'ability', components: [{ type: 'summon', unit: 'gristlehulk', count: 1 }, { type: 'debuff', radius: 150, status: { kind: 'Fracture', amount: 1 } }, { type: 'aura', radius: 150, damage: 16, react: true }] }, { t: 'cosmetic', id: 'meatwall' }] },
    ],
  },
  {
    id: 'warren_swarm', tower: 'warren', name: 'Swarming Gristle',
    theme: 'The warren breeds FAST — quick Gristlelings flood the lane, and everything they hold is marked for the harvest.',
    tiers: [
      { tier: 1, name: 'Gristleling Litter', desc: 'Each muster adds a GRISTLELING — a quick, light wall that runs to plug the gap.', fireRateMult: 1.08, particle: 'vital', sfx: 'br_vital', impact: 'vital', grants: [{ t: 'ability', components: [{ type: 'summon', unit: 'gristling', count: 1 }] }] },
      { tier: 2, name: 'Marrow Tithe', desc: 'The held are MARKED — Mark around the warren (Harvest / Ferment fuel: bursts + Biomass).', grants: [{ t: 'ability', components: [{ type: 'debuff', radius: 130, status: { kind: 'Mark', amount: 1 } }] }] },
      { tier: 3, name: 'Quickened Brood', desc: 'The litters come faster — and another Gristleling joins each muster.', fireRateMult: 1.12, grants: [{ t: 'ability', components: [{ type: 'summon', unit: 'gristling', count: 1 }] }] },
      { tier: 4, name: 'Feeding Frenzy', desc: 'The warren feeds on what its brood holds — a reacting gnash at its foot.', damageMult: 1.15, particle: 'vitalcore', impact: 'vitalcore', grants: [{ t: 'ability', components: [{ type: 'aura', radius: 130, damage: 10, react: true }] }] },
      { tier: 5, name: 'The Swarming Warren', desc: 'Another Gristleling per muster and a deep marking gnash — the lane is a larder.', damageMult: 1.2, fireRateMult: 1.08, particle: 'vitalcore', impact: 'vitalcore', grants: [{ t: 'ability', components: [{ type: 'summon', unit: 'gristling', count: 1 }, { type: 'debuff', radius: 150, status: { kind: 'Mark', amount: 1 } }, { type: 'aura', radius: 150, damage: 12, react: true }] }, { t: 'cosmetic', id: 'swarmwarren' }] },
    ],
  },

  // ════════════ TICK BATTERY (Viral, 'infest' long-reach seeder) ════════════
  // The outbreak. PATIENT ZERO deepens the plague in every host (more stacks, more hosts);
  // LEECH SWARM pairs the bite with partner statuses so each tick is a self-contained reaction
  // (Mind Rot / Putrefy / Bloom Rot). Extra ticks ride `projectile` COMPONENTS — the parasite
  // behavior ignores the extraProjectiles channel by design. Statuses tag the PRIMARY host.
  {
    id: 'tick_plague', tower: 'tick', name: 'Patient Zero',
    theme: 'Every tick is an outbreak — deeper plague in every host, and more hosts per volley.',
    tiers: [
      { tier: 1, name: 'Engorged Ticks', desc: 'Fatter ticks — the first host takes a DEEPER Infection.', damageMult: 1.15, particle: 'infect', sfx: 'br_plague', impact: 'infect', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Infection', amount: 1 } }] }] },
      { tier: 2, name: 'Fourth Host', desc: 'A FOURTH tick per volley, hunting its own host.', grants: [{ t: 'ability', components: [{ type: 'projectile', behavior: 'parasite', damage: 4, speed: 380, range: 520, count: 1 }] }] },
      { tier: 3, name: 'Fever Glands', desc: 'Quicker volleys — and the first host festers deeper still.', fireRateMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Infection', amount: 1 } }] }] },
      { tier: 4, name: 'Brood Clutch', desc: 'A FIFTH tick per volley — the outbreak starts everywhere at once.', damageMult: 1.1, particle: 'pandemic', impact: 'pandemic', grants: [{ t: 'ability', components: [{ type: 'projectile', behavior: 'parasite', damage: 5, speed: 380, range: 520, count: 1 }] }] },
      { tier: 5, name: 'Patient Zero', desc: 'Six hosts a volley and a plague that runs deep in the first — the lane is the outbreak.', damageMult: 1.2, particle: 'pandemic', impact: 'pandemic', grants: [{ t: 'ability', components: [{ type: 'projectile', behavior: 'parasite', damage: 6, speed: 380, range: 520, count: 1 }, { type: 'status', status: { kind: 'Infection', amount: 2 } }] }, { t: 'cosmetic', id: 'patientzero' }] },
    ],
  },
  {
    id: 'tick_leech', tower: 'tick', name: 'Leech Swarm',
    theme: 'The bite carries more than plague — every tick is a self-contained REACTION in the host.',
    tiers: [
      { tier: 1, name: 'Numbing Saliva', desc: 'The bite NUMBS — Disruption in the first host (Mind Rot: the plague leaps).', damageMult: 1.1, particle: 'disrupt', sfx: 'br_spore', impact: 'disrupt', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Disruption', amount: 0.8 } }] }] },
      { tier: 2, name: 'Acid Mouthparts', desc: 'The bite BURNS — Corrosion in the first host (Putrefy: acid rot).', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Corrosion', amount: 1.5 } }] }] },
      { tier: 3, name: 'Leech Tide', desc: 'A longer leap and a FOURTH tick per volley.', rangeMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'projectile', behavior: 'parasite', damage: 4, speed: 400, range: 560, count: 1 }] }] },
      { tier: 4, name: 'Siphoning Bite', desc: 'The bite DRINKS — Mark in the first host (Bloom Rot: a burst + Biomass).', damageMult: 1.1, particle: 'venom', impact: 'venom', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Mark', amount: 1 } }] }] },
      { tier: 5, name: 'The Leech Swarm', desc: 'Two more ticks a volley and a numbing, burning bite — every host reacts.', damageMult: 1.2, particle: 'venom', impact: 'venom', grants: [{ t: 'ability', components: [{ type: 'projectile', behavior: 'parasite', damage: 5, speed: 400, range: 560, count: 2 }, { type: 'status', status: { kind: 'Disruption', amount: 1 } }] }, { t: 'cosmetic', id: 'leechswarm' }] },
    ],
  },

  // ════════════ KEENING QUILL (Resonant, 'homing' armor-breaker) ════════════
  // The note. SHATTERING NOTE perfects the single crack (crits, deeper Fracture ⇒ bigger shears,
  // a second quill); KEENING CHORUS spreads it — the keen LEAPS victim to victim (the `chain`
  // verb starts at the struck mark, so the crowd beside it bleeds too).
  {
    id: 'quill_shatter', tower: 'quill', name: 'Shattering Note',
    theme: 'One note, one shell — the crack is honed until no plate on the lane survives the shear.',
    tiers: [
      { tier: 1, name: 'Tempered Quill', desc: 'A harder quill — vicious critical keens.', damageMult: 1.15, particle: 'spark', sfx: 'br_rail', impact: 'spark', grants: [{ t: 'ability', components: [{ type: 'crit', chance: 0.2, mult: 2, damage: 12 }] }] },
      { tier: 2, name: 'Hairline Fracture', desc: 'The mark is CRACKED as the note lands — every shear bursts bigger.', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Fracture', amount: 1 } }] }] },
      { tier: 3, name: 'Double Keen', desc: 'A SECOND quill per draw, cracking its own mark.', fireRateMult: 1.06, grants: [{ t: 'projectile', extraProjectiles: 1 }] },
      { tier: 4, name: 'Resonant Spur', desc: 'The quill passes THROUGH its mark — and rings deeper.', damageMult: 1.1, particle: 'railburst', impact: 'railburst', grants: [{ t: 'projectile', mutators: ['pierce1'] }, { t: 'ability', components: [{ type: 'status', status: { kind: 'Resonance', amount: 1 } }] }] },
      { tier: 5, name: 'The Shattering Note', desc: 'The perfect pitch: deep cracks, killing crits — no shell survives the shear.', damageMult: 1.25, particle: 'railburst', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Fracture', amount: 2 } }, { type: 'crit', chance: 0.3, mult: 2.2, damage: 24 }] }, { t: 'cosmetic', id: 'shatternote' }] },
    ],
  },
  {
    id: 'quill_chorus', tower: 'quill', name: 'Keening Chorus',
    theme: 'The note will not stay in one body — it LEAPS through the crowd, ringing every shell it touches.',
    tiers: [
      { tier: 1, name: 'Sympathetic Note', desc: 'The keen LEAPS to two bodies beside the mark.', fireRateMult: 1.08, particle: 'spark', sfx: 'br_storm', impact: 'spark', grants: [{ t: 'ability', components: [{ type: 'chain', jumps: 3, range: 120, damage: 10, falloff: 0.8, particle: 'spark' }] }] },
      { tier: 2, name: 'Harmonic Fletching', desc: 'Quicker draws — the chorus finds its tempo.', fireRateMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'status', status: { kind: 'Resonance', amount: 1 } }] }] },
      { tier: 3, name: 'Chord Leap', desc: 'The leap carries farther and bites harder.', damageMult: 1.1, grants: [{ t: 'ability', components: [{ type: 'chain', jumps: 4, range: 140, damage: 14, falloff: 0.8, particle: 'spark' }] }] },
      { tier: 4, name: 'Overtone Volley', desc: 'A SECOND quill per draw, starting a second chord.', damageMult: 1.08, particle: 'railburst', impact: 'railburst', grants: [{ t: 'projectile', extraProjectiles: 1 }] },
      { tier: 5, name: 'The Keening Chorus', desc: 'The whole lane rings: a long, cruel leap through every shell near the mark.', damageMult: 1.2, fireRateMult: 1.08, particle: 'railburst', impact: 'railburst', grants: [{ t: 'ability', components: [{ type: 'chain', jumps: 5, range: 160, damage: 20, falloff: 0.82, particle: 'spark' }] }, { t: 'cosmetic', id: 'keenchorus' }] },
    ],
  },
];

branchRegistry.registerAll(BRANCHES);
