// NEMESIS — the personal hunt (docs/NEMESIS.md). A boss still standing when your Nucleus
// falls REMEMBERS you: it becomes your Nemesis and returns escalated. Escalation is a
// data-driven GRUDGE LADDER — the `slain` count (how many of your runs it has ended) maps to
// a named tier that layers deterministic combat TRAITS onto the marked spawn: not just more
// HP, but armor, heavier strikes, and faster sieges. Every value here is a PURE function of
// `slain`, so the sim reads the bundle from ctor opts and replays reproduce the hunt
// byte-for-byte; a fresh save has no nemesis, so the golden path never enters this code.
//
// This module is the single home for the hunt's math (the sim, meta rewards, and the UI all
// fold the SAME functions) — tuning lives in NEMESIS + GRUDGE_LADDER, never in call sites.

/** Global nemesis tunables — the escalation curve and its caps. */
export const NEMESIS = {
  slainCap: 50, // the grudge stops deepening here (a hunt can't run away forever)
  hpPerSlain: 0.15,
  hpCap: 2.5, // ×hp ceiling — a nemesis is a wall, never an impossible one
  bountyPerSlain: 0.1,
  bountyCap: 2, // ×bounty ceiling — revenge on the field pays, but doesn't break economy
  revengeCoresPerSlain: 60, // blood-price cores paid on the avenging kill (× slain)
  revengeCoresTierBonus: 40, // + this × grudge-tier index (deeper grudge, richer revenge)
} as const;

/** One rung of the grudge ladder. Traits are ADDITIVE up the ladder (each tier keeps the
 *  ones below it), so `nemesisTraits` folds every rung at or beneath the current `slain`. */
export interface GrudgeTier {
  at: number; // minimum `slain` to stand at this tier
  name: string; // the rival's escalation title (shown on the brand + profile)
  armorBonus: number; // flat armor added to the marked spawn
  damageMult: number; // Nucleus-damage multiplier for this rung (multiplied up the ladder)
  attackSpeedMult: number; // siege-cadence multiplier (multiplied up the ladder)
  trait: string; // human line describing what this rung adds (UI/telegraph)
}

// The ladder. Four rungs from first blood to apex predator. Kept deliberately short and
// legible — a fifth chassis or a rebalance is a row edit, not a logic change.
export const GRUDGE_LADDER: readonly GrudgeTier[] = [
  { at: 1, name: 'Marked', armorBonus: 0, damageMult: 1, attackSpeedMult: 1,
    trait: 'Returns with a vengeance — tougher, and worth more when it falls.' },
  { at: 3, name: 'Hunted', armorBonus: 8, damageMult: 1.15, attackSpeedMult: 1,
    trait: 'Scar-plated — carries new armor and strikes 15% harder.' },
  { at: 5, name: 'Reviled', armorBonus: 16, damageMult: 1.18, attackSpeedMult: 1.15,
    trait: 'Frenzied — heavier plating, +18% more force, sieges 15% faster.' },
  { at: 8, name: 'Apex Predator', armorBonus: 26, damageMult: 1.22, attackSpeedMult: 1.15,
    trait: 'Apex — an armored engine of spite: relentless assault, brutal blows.' },
];

/** The grudge-tier INDEX for a slain count (0-based into GRUDGE_LADDER). slain ≤ 0 ⇒ 0. */
export function grudgeTierOf(slain: number): number {
  let idx = 0;
  for (let i = 0; i < GRUDGE_LADDER.length; i++) {
    if (slain >= GRUDGE_LADDER[i].at) idx = i;
  }
  return idx;
}

/** The full, replay-deterministic trait bundle for a nemesis that has slain you `slain` times. */
export interface NemesisTraitBundle {
  slain: number;
  tier: number; // grudge-tier index
  tierName: string;
  hpMult: number;
  bountyMult: number;
  armorBonus: number;
  damageMult: number;
  attackSpeedMult: number;
  traits: string[]; // every rung's line up to and including the current tier (UI list)
}

/** Fold the grudge ladder for `slain` into the combat bundle the sim + UI both read. */
export function nemesisTraits(slain: number): NemesisTraitBundle {
  const s = Math.max(0, Math.min(NEMESIS.slainCap, Math.floor(slain)));
  const tier = grudgeTierOf(s);
  let armorBonus = 0;
  let damageMult = 1;
  let attackSpeedMult = 1;
  const traits: string[] = [];
  for (let i = 0; i <= tier; i++) {
    const rung = GRUDGE_LADDER[i];
    armorBonus += rung.armorBonus;
    damageMult *= rung.damageMult;
    attackSpeedMult *= rung.attackSpeedMult;
    traits.push(rung.trait);
  }
  return {
    slain: s,
    tier,
    tierName: GRUDGE_LADDER[tier].name,
    hpMult: Math.min(NEMESIS.hpCap, 1 + NEMESIS.hpPerSlain * s),
    bountyMult: Math.min(NEMESIS.bountyCap, 1 + NEMESIS.bountyPerSlain * s),
    armorBonus,
    damageMult,
    attackSpeedMult,
    traits,
  };
}

/** Deepen (or seed) the hunt after a loss to `defId`. Same boss ⇒ slain+1 (capped); a new
 *  killer replaces the hunt at 1. Pure — callers persist the result. */
export function deepenNemesis(prev: { defId: string; slain: number } | null, defId: string): { defId: string; slain: number } {
  const same = prev?.defId === defId;
  return { defId, slain: same ? Math.min(NEMESIS.slainCap, prev!.slain + 1) : 1 };
}

/** Genome Cores paid when you finally avenge a nemesis of this grudge (blood-price + tier bonus). */
export function vengeanceCores(slain: number): number {
  const s = Math.max(1, Math.min(NEMESIS.slainCap, Math.floor(slain)));
  return NEMESIS.revengeCoresPerSlain * s + NEMESIS.revengeCoresTierBonus * grudgeTierOf(s);
}
