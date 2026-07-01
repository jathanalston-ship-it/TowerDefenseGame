// Adaptation (docs/PROGRESSION-REDESIGN §2) — mastery becomes a DECISION, not a flat hum. A strain
// that fights the host ADAPTS: every mastery Rank grants one Antigen Point the player SPENDS into a
// three-branch tree (Virulence = offense · Resilience = survival/anti-boss · Contagion = spread /
// economy / synergy). A branch, not a bar. Nodes reuse the star/mastery kit fields, so they ride the
// existing sim wiring; a fresh unit has spent nothing ⇒ zero effects ⇒ the golden run is untouched.
//
// Pure data + pure helpers (no Game/DOM). Points come from `masteryRank(level)` — the infinite grind
// now pays out spendable choices forever.

import { masteryRank } from './mastery';

export type AdaptBranch = 'virulence' | 'resilience' | 'contagion';
export const ADAPT_BRANCHES: AdaptBranch[] = ['virulence', 'resilience', 'contagion'];
export const ADAPT_BRANCH_META: Record<AdaptBranch, { name: string; blurb: string; color: string }> = {
  virulence: { name: 'Virulence', blurb: 'Offense — hit harder, faster, deeper.', color: 'var(--r-rare)' },
  resilience: { name: 'Resilience', blurb: 'Survival + anti-boss — reach, pierce, staying power.', color: 'var(--r-epic)' },
  contagion: { name: 'Contagion', blurb: 'Spread + economy + synergy — the plague compounds.', color: 'var(--caustic)' },
};

/** One adaptation node. Tiers within a branch unlock in order (tier N needs a spend at tier N-1).
 *  Effect fields mirror the tower run-kit / hero mods; ABSENT fields are identity (golden-safe). */
export interface AdaptNode {
  id: string;
  subject: 'tower' | 'hero';
  branch: AdaptBranch;
  tier: number; // 1-based; higher tiers gate on a pick lower in the same branch
  name: string;
  desc: string;
  // ── Tower kit deltas ──
  damageMult?: number;
  fireRateMult?: number;
  rangeMult?: number;
  splashMult?: number;
  infectionSpreadMult?: number;
  projectileMutator?: string;
  extraProjectiles?: number;
  // ── Hero mods deltas ──
  heroDamageMult?: number;
  heroCooldownMult?: number;
}

/** Aggregated adaptation effect (what the meta fold applies). Neutral = identity. */
export interface AdaptEffect {
  damageMult: number;
  fireRateMult: number;
  rangeMult: number;
  splashMult: number;
  infectionSpreadMult: number;
  projectileMutators: string[];
  extraProjectiles: number;
  heroDamageMult: number;
  heroCooldownMult: number;
}

export function neutralAdaptEffect(): AdaptEffect {
  return { damageMult: 1, fireRateMult: 1, rangeMult: 1, splashMult: 1, infectionSpreadMult: 1, projectileMutators: [], extraProjectiles: 0, heroDamageMult: 1, heroCooldownMult: 1 };
}

// ── Authored nodes ───────────────────────────────────────────────────────────────
// Shared per subject (every strain / every champion sees the same tree; the CHOICES differ per unit).
// Modest magnitudes — the value is the decision, not the number. Two tiers per branch.

const TOWER_NODES: AdaptNode[] = [
  { id: 't.vir.1', subject: 'tower', branch: 'virulence', tier: 1, name: 'Envenomed', desc: '+8% strain damage.', damageMult: 1.08 },
  { id: 't.vir.2', subject: 'tower', branch: 'virulence', tier: 2, name: 'Frenzied Metabolism', desc: '+12% fire rate.', fireRateMult: 1.12 },
  { id: 't.res.1', subject: 'tower', branch: 'resilience', tier: 1, name: 'Extended Cilia', desc: '+15% engagement range.', rangeMult: 1.15 },
  { id: 't.res.2', subject: 'tower', branch: 'resilience', tier: 2, name: 'Boring Proboscis', desc: 'Shots pierce one extra host — answers armor + swarms.', projectileMutator: 'pierce1' },
  { id: 't.con.1', subject: 'tower', branch: 'contagion', tier: 1, name: 'Rupturing Spores', desc: '+15% splash radius.', splashMult: 1.15 },
  { id: 't.con.2', subject: 'tower', branch: 'contagion', tier: 2, name: 'Virulent Bloom', desc: '+25% Infection spread (Parasite) — leaps to farther hosts.', infectionSpreadMult: 1.25 },
];

const HERO_NODES: AdaptNode[] = [
  { id: 'h.vir.1', subject: 'hero', branch: 'virulence', tier: 1, name: 'Predatory Instinct', desc: '+10% champion damage.', heroDamageMult: 1.1 },
  { id: 'h.vir.2', subject: 'hero', branch: 'virulence', tier: 2, name: 'Apex Ferocity', desc: '+8% champion damage.', heroDamageMult: 1.08 },
  { id: 'h.res.1', subject: 'hero', branch: 'resilience', tier: 1, name: 'Rapid Synapses', desc: '−8% ability cooldown.', heroCooldownMult: 0.92 },
  { id: 'h.res.2', subject: 'hero', branch: 'resilience', tier: 2, name: 'Overclocked Neurons', desc: '−8% ability cooldown.', heroCooldownMult: 0.92 },
  { id: 'h.con.1', subject: 'hero', branch: 'contagion', tier: 1, name: 'Symbiotic Surge', desc: '+8% champion damage while active.', heroDamageMult: 1.08 },
  { id: 'h.con.2', subject: 'hero', branch: 'contagion', tier: 2, name: 'Assimilated Reflexes', desc: '−6% ability cooldown.', heroCooldownMult: 0.94 },
];

export const ADAPT_NODES: AdaptNode[] = [...TOWER_NODES, ...HERO_NODES];
const NODE_BY_ID = new Map(ADAPT_NODES.map((n) => [n.id, n] as const));
export function adaptNode(id: string): AdaptNode | undefined { return NODE_BY_ID.get(id); }

/** The nodes available for a subject, grouped/ordered by branch then tier. */
export function adaptNodesFor(subject: 'tower' | 'hero'): AdaptNode[] {
  return ADAPT_NODES.filter((n) => n.subject === subject);
}

/** How many Antigen Points a unit has EARNED (one per mastery Rank — every 25 levels). */
export function adaptPointsEarned(masteryLevel: number): number {
  return masteryRank(masteryLevel);
}

/** Whether `nodeId` can be picked given the already-chosen set (branch tiers unlock in order, and
 *  a node is never double-bought). Does NOT check point budget — the meta layer does that. */
export function canPickAdapt(nodeId: string, chosen: readonly string[]): boolean {
  const node = adaptNode(nodeId);
  if (!node || chosen.includes(nodeId)) return false;
  if (node.tier <= 1) return true;
  // A higher tier needs SOME pick at the tier directly below it in the same branch.
  return ADAPT_NODES.some((n) => n.subject === node.subject && n.branch === node.branch && n.tier === node.tier - 1 && chosen.includes(n.id));
}

/** Fold a chosen node set into one aggregated effect (multiplicative mults, summed mutators). */
export function adaptationEffect(chosen: readonly string[]): AdaptEffect {
  const e = neutralAdaptEffect();
  for (const id of chosen) {
    const n = NODE_BY_ID.get(id);
    if (!n) continue;
    if (n.damageMult) e.damageMult *= n.damageMult;
    if (n.fireRateMult) e.fireRateMult *= n.fireRateMult;
    if (n.rangeMult) e.rangeMult *= n.rangeMult;
    if (n.splashMult) e.splashMult *= n.splashMult;
    if (n.infectionSpreadMult) e.infectionSpreadMult *= n.infectionSpreadMult;
    if (n.projectileMutator) e.projectileMutators.push(n.projectileMutator);
    if (n.extraProjectiles) e.extraProjectiles += n.extraProjectiles;
    if (n.heroDamageMult) e.heroDamageMult *= n.heroDamageMult;
    if (n.heroCooldownMult) e.heroCooldownMult *= n.heroCooldownMult;
  }
  return e;
}
