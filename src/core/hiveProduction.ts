// HIVE PRODUCTION (docs/HIVE-PRODUCTION.md) — the unification of the Hive organism and the
// Idle Harvest into ONE loop: the Hive is the biological engine; the harvest is its output.
// The player never "collects idle rewards" — their Hive kept evolving while they were away.
//
// HOW THE MERGE WORKS (no save migration — the MODEL unifies two existing ledgers):
//   • The ten Idle Evolution NODES (core/idleHarvest.ts) are the Hive's PRODUCTION organs —
//     they always were (Harvest Speed = the circulatory network, Capacity = storage tissue,
//     Rare Drops = the neural cluster, Container Chance = the mutation chamber…).
//   • The ten CONSTRUCTION organs (core/hiveOrgans.ts) are its STRUCTURE — and each built
//     tier now also feeds production through a themed coupling row below (a growing body
//     produces more). Fully-grown organ PAIRS unlock hidden SYNERGIES.
//   • `hiveProductionBonus(built)` folds structure into one bonus bundle consumed by the
//     accrual/roll via OPTIONAL args (identity when omitted — every legacy call site and
//     golden is byte-unchanged; a fresh save's bundle IS the identity).
//
// CONSTITUTION note (docs/GAME_CONSTITUTION.md): organs remain outside COMBAT power — the
// Power Score never reads this file. Production is economy, exactly like the idle nodes
// the couplings feed; the idle<active guardrail (idleHarvest.test.ts) bounds the merged
// model with organs MAXED, so structure can never out-earn playing.
//
// FOUNDATIONAL: a new production lane = one COUPLING target handled in idleHarvest's math
// (they're all there already); a new organ = one row in HIVE_ORGANS + one coupling row
// here; a new synergy = one pair row. Validation below is test-enforced per row.

import { HIVE_ORGANS, hiveOrganById } from './hiveOrgans';

/** Everything structure can feed. Multipliers are ×1 identity; adders are +0 identity. */
export interface HiveProductionBonus {
  rateMult: number; // × on the core-equivalent budget rate (circulatory lanes)
  capBonusHours: number; // + storage hours (storage tissue)
  offlineBonus: number; // + offline efficiency (still hard-capped at 1.0 in the model)
  rareWeightMult: number; // × on rare-row roll weights (neural sensing)
  containerWeightMult: number; // × on container/cache roll weights (mutation chambers)
  craftMult: number; // × on the mats slice (rendering glands)
  shardMult: number; // × on shard slices (crystallizing runoff)
  bloomBonus: number; // + BLOOM chance (still capped in the model)
  xpMult: number; // × on collect XP (the Hive remembers)
}

export const HIVE_PRODUCTION_IDENTITY: HiveProductionBonus = {
  rateMult: 1, capBonusHours: 0, offlineBonus: 0, rareWeightMult: 1, containerWeightMult: 1,
  craftMult: 1, shardMult: 1, bloomBonus: 0, xpMult: 1,
};

export type CouplingTarget =
  | 'rate' | 'capHours' | 'offline' | 'rareWeight' | 'containerWeight' | 'craft' | 'shards' | 'bloom' | 'xp';

/** One organ's themed production line: `perTier` of `target` per BUILT tier. `line` is the
 *  player-facing phrasing ("Forge-light renders richer materials"). */
export interface OrganCoupling { organ: string; target: CouplingTarget; perTier: number; line: string }

/** THE COUPLING BOOK — why each structure grows the output it does is the organ's own fiction. */
export const ORGAN_COUPLINGS: readonly OrganCoupling[] = [
  { organ: 'spore_garden', target: 'rate', perTier: 0.015, line: 'Seeded spores drift into the extraction veins — base production rises.' },
  { organ: 'lumen_polyps', target: 'offline', perTier: 0.02, line: 'The lab lights itself — the unattended Hive works closer to full song.' },
  { organ: 'marrow_forge', target: 'craft', perTier: 0.03, line: 'Forge-light renders richer Mutagen, Scrap and Catalyst.' },
  { organ: 'sample_arbor', target: 'shards', perTier: 0.04, line: 'The arbor’s jars seed the runoff — Strain and Apex crystallize faster.' },
  { organ: 'chorus_node', target: 'xp', perTier: 0.05, line: 'The chorus remembers every harvest — collects feed more Account XP.' },
  { organ: 'vein_loom', target: 'rate', perTier: 0.025, line: 'Each woven vein is another production artery — throughput climbs.' },
  { organ: 'membrane_dome', target: 'rareWeight', perTier: 0.04, line: 'The observatory watches the strata — rare veins are spotted, not stumbled on.' },
  { organ: 'symbiote_pool', target: 'capHours', perTier: 2, line: 'The symbiotes tend the bladders — the Hive banks more hours before it brims.' },
  { organ: 'crown_spire', target: 'bloom', perTier: 0.015, line: 'The beacon calls the surge — BLOOM events crown more harvests.' },
  { organ: 'world_womb', target: 'containerWeight', perTier: 0.08, line: 'The womb dreams whole pods into being — containers calcify far more often.' },
];

/** Hidden efficiencies: BOTH organs fully grown ⇒ the combination reveals itself. */
export interface HiveSynergyDef {
  id: string;
  a: string; // organ id (must be fully built)
  b: string; // organ id (must be fully built)
  name: string;
  target: CouplingTarget;
  amount: number;
  note: string; // the revealed fiction
}

export const HIVE_SYNERGIES: readonly HiveSynergyDef[] = [
  { id: 'forged_arteries', a: 'marrow_forge', b: 'vein_loom', name: 'Forged Arteries', target: 'rate', amount: 0.05,
    note: 'Bone-smithed conduit never clogs — the loom threads forge-tempered veins.' },
  { id: 'tended_gardens', a: 'spore_garden', b: 'symbiote_pool', name: 'Tended Gardens', target: 'craft', amount: 0.05,
    note: 'The symbiotes farm the spore beds — richer render feedstock every cycle.' },
  { id: 'beacon_watch', a: 'membrane_dome', b: 'crown_spire', name: 'Beacon Watch', target: 'rareWeight', amount: 0.08,
    note: 'The spire lights what the dome watches — nothing rare escapes the sky.' },
  { id: 'womb_lullaby', a: 'chorus_node', b: 'world_womb', name: 'Lullaby of the Womb', target: 'bloom', amount: 0.02,
    note: 'The chorus sings the womb through its dreams — it blooms in its sleep.' },
  { id: 'night_shift', a: 'lumen_polyps', b: 'sample_arbor', name: 'Night Shift', target: 'offline', amount: 0.03,
    note: 'Under polyp-light the arbor keeps cataloguing — the night crew never rests.' },
];

/** A synergy is LIVE when both organs are fully grown (built to their tier cap). */
export function synergyLive(built: Record<string, number>, syn: HiveSynergyDef): boolean {
  const a = hiveOrganById(syn.a);
  const b = hiveOrganById(syn.b);
  if (!a || !b) return false;
  return (built[a.id] ?? 0) >= a.tiers && (built[b.id] ?? 0) >= b.tiers;
}

/** Safety rails: structure ENRICHES production, it never becomes it. The guardrail suite
 *  re-prices the whole model with organs maxed against these bounds. */
export const HIVE_PRODUCTION_CAPS = {
  rateMult: 1.35,
  capBonusHours: 12,
  offlineBonus: 0.15, // idleOfflineEff still hard-caps the SUM at 1.0
  rareWeightMult: 1.6,
  containerWeightMult: 1.6,
  craftMult: 1.35,
  shardMult: 1.35,
  bloomBonus: 0.05, // idleBloomChance still hard-caps the SUM at 0.25 + this
  xpMult: 1.5,
} as const;

/** Fold a built ledger (+ live synergies) into one bonus bundle. Pure; identity at zero. */
export function hiveProductionBonus(built: Record<string, number>): HiveProductionBonus {
  const out = { ...HIVE_PRODUCTION_IDENTITY };
  const add = (target: CouplingTarget, amount: number): void => {
    switch (target) {
      case 'rate': out.rateMult += amount; break;
      case 'capHours': out.capBonusHours += amount; break;
      case 'offline': out.offlineBonus += amount; break;
      case 'rareWeight': out.rareWeightMult += amount; break;
      case 'containerWeight': out.containerWeightMult += amount; break;
      case 'craft': out.craftMult += amount; break;
      case 'shards': out.shardMult += amount; break;
      case 'bloom': out.bloomBonus += amount; break;
      case 'xp': out.xpMult += amount; break;
    }
  };
  for (const c of ORGAN_COUPLINGS) {
    const def = hiveOrganById(c.organ);
    if (!def) continue;
    const tiers = Math.min(built[c.organ] ?? 0, def.tiers);
    if (tiers > 0) add(c.target, c.perTier * tiers);
  }
  for (const syn of HIVE_SYNERGIES) if (synergyLive(built, syn)) add(syn.target, syn.amount);
  // Clamp to the caps — data errors degrade gracefully instead of breaking the guardrail.
  out.rateMult = Math.min(out.rateMult, HIVE_PRODUCTION_CAPS.rateMult);
  out.capBonusHours = Math.min(out.capBonusHours, HIVE_PRODUCTION_CAPS.capBonusHours);
  out.offlineBonus = Math.min(out.offlineBonus, HIVE_PRODUCTION_CAPS.offlineBonus);
  out.rareWeightMult = Math.min(out.rareWeightMult, HIVE_PRODUCTION_CAPS.rareWeightMult);
  out.containerWeightMult = Math.min(out.containerWeightMult, HIVE_PRODUCTION_CAPS.containerWeightMult);
  out.craftMult = Math.min(out.craftMult, HIVE_PRODUCTION_CAPS.craftMult);
  out.shardMult = Math.min(out.shardMult, HIVE_PRODUCTION_CAPS.shardMult);
  out.bloomBonus = Math.min(out.bloomBonus, HIVE_PRODUCTION_CAPS.bloomBonus);
  out.xpMult = Math.min(out.xpMult, HIVE_PRODUCTION_CAPS.xpMult);
  return out;
}

/** The organ (or live synergy) contributing the single largest production line — the stats
 *  panel's "most productive organ". Null when nothing is built. */
export function mostProductiveOrgan(built: Record<string, number>): { name: string; line: string } | null {
  let best: { name: string; line: string; score: number } | null = null;
  for (const c of ORGAN_COUPLINGS) {
    const def = hiveOrganById(c.organ);
    if (!def) continue;
    const tiers = Math.min(built[c.organ] ?? 0, def.tiers);
    if (tiers <= 0) continue;
    // Normalize adders vs multipliers roughly: hours count 2%/h, chances 100%=1.
    const score = c.target === 'capHours' ? c.perTier * tiers * 0.02 : c.perTier * tiers;
    if (!best || score > best.score) best = { name: def.name, line: c.line, score };
  }
  for (const syn of HIVE_SYNERGIES) {
    if (!synergyLive(built, syn)) continue;
    const score = syn.target === 'capHours' ? syn.amount * 0.02 : syn.amount;
    if (!best || score > best.score) best = { name: syn.name, line: syn.note, score };
  }
  return best ? { name: best.name, line: best.line } : null;
}

// ── Registry validation (test-enforced per row, content-registry pattern) ───────────────────

export function hiveProductionProblems(): string[] {
  const out: string[] = [];
  const organIds = new Set(HIVE_ORGANS.map((o) => o.id));
  const coupled = new Set<string>();
  for (const c of ORGAN_COUPLINGS) {
    if (!organIds.has(c.organ)) out.push(`coupling for unknown organ '${c.organ}'`);
    if (coupled.has(c.organ)) out.push(`organ '${c.organ}' has more than one coupling (one themed line each)`);
    coupled.add(c.organ);
    if (!(c.perTier > 0)) out.push(`coupling '${c.organ}' perTier must be positive`);
    if (!c.line || c.line.length < 12) out.push(`coupling '${c.organ}' needs its player-facing line`);
  }
  for (const o of HIVE_ORGANS) if (!coupled.has(o.id)) out.push(`organ '${o.id}' has no production coupling — a structure that feeds nothing breaks the merged fantasy`);
  const synIds = new Set<string>();
  for (const s of HIVE_SYNERGIES) {
    if (synIds.has(s.id)) out.push(`duplicate synergy id '${s.id}'`);
    synIds.add(s.id);
    if (!organIds.has(s.a) || !organIds.has(s.b)) out.push(`synergy '${s.id}' names unknown organs`);
    if (s.a === s.b) out.push(`synergy '${s.id}' must pair two DIFFERENT organs`);
    if (!(s.amount > 0)) out.push(`synergy '${s.id}' amount must be positive`);
  }
  return out;
}
