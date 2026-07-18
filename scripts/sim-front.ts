// THE FRONT SIMULATION (docs/INFESTATION.md §front) — npm run sim:front. Verifies the war
// layer's economy + pressure laws on the REAL registries and decay curves:
//
//   1. SPOILS BOUNDED — the whole map's one-time tier claims total a modest content prize,
//      not an income stream (core-equivalent pricing via IDLE.valuePerUnit).
//   2. TRIBUTE IS A SUPPLEMENT — a full-map hold pays a weekly tribute worth a small slice
//      of a week's active income (assumption printed), never a paycheck.
//   3. NO DEATH SPIRAL — a lapsed player loses ≤ decay + ONE incursion bite per absence,
//      and one active day of wins re-earns more than an absent day cost.
//   4. PRESSURE IS FAIR — with daily defense, held ground never net-declines from
//      incursions; targets rotate across held sectors; hotspots rotate the whole map.

import {
  ALL_SECTORS, DECAY_PER_DAY, GAIN_CAP_PER_RUN, INCURSION_BITE, REGIONS, REGION_WARPS,
  SECTOR_CAP, effectiveLevel, feedInfestation, hotspotSectorId, incursionSectorId,
  resolveIncursionBite, tierReward, tributeFor, CLAIMABLE_TIERS,
} from '../src/core/infestation';
import type { SectorState } from '../src/core/infestation';
import type { PassReward } from '../src/core/battlePass';
import { IDLE } from '../src/core/config';

// ── Assumptions (printed) ────────────────────────────────────────────────────────────────
const TOWER_ROSTER = 20; // towerShardsAll pays qtyEach × roster
const HERO_ROSTER = 10;
const WEEKLY_ACTIVE_INCOME = 7 * 400; // mid-band cores/day (sim-localized-economy's table)

const fails: string[] = [];
const bar = (ok: boolean, label: string): void => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`);
  if (!ok) fails.push(label);
};

/** Core-equivalent value of a reward list (valuePerUnit rates + roster fan-out). */
function valueOf(rs: PassReward[]): number {
  return rs.reduce((s, r) => {
    switch (r.kind) {
      case 'cores': return s + r.qty;
      case 'hiveMats': return s + r.qty * (IDLE.valuePerUnit.hiveMats ?? 1);
      case 'towerShardsAll': return s + r.qtyEach * TOWER_ROSTER * (IDLE.valuePerUnit.towerShard ?? 3);
      case 'heroShardsAll': return s + r.qtyEach * HERO_ROSTER * (IDLE.valuePerUnit.heroShard ?? 5);
      case 'container': return s + r.count * (IDLE.valuePerUnit.container ?? 350);
      default: return s;
    }
  }, 0);
}

console.log('THE FRONT SIMULATION — spoils, tribute, pressure\n');
console.log(`assumptions: roster ${TOWER_ROSTER} towers / ${HERO_ROSTER} heroes · weekly active income ~${WEEKLY_ACTIVE_INCOME} core-eq\n`);

// Law 1 — one-time spoils across the ENTIRE map.
{
  let total = 0;
  for (const r of REGIONS) for (const s of r.sectors) for (const t of CLAIMABLE_TIERS) total += valueOf(tierReward(r.id, t));
  void ALL_SECTORS; // (16 sectors iterated above via regions)
  console.log(`full-map one-time spoils: ${total.toFixed(0)} core-eq`);
  bar(total <= 15_000, `spoils bounded: full-map one-time total ${total.toFixed(0)} ≤ 15,000 core-eq (a content prize, not income)`);
}

// Law 2 — tribute at FULL hold is a supplement.
{
  const weekly = REGIONS.reduce((s, r) => s + valueOf(tributeFor(r.id, 16)), 0);
  const share = weekly / WEEKLY_ACTIVE_INCOME;
  console.log(`full-hold weekly tribute: ${weekly.toFixed(0)} core-eq (${(share * 100).toFixed(1)}% of weekly active income)`);
  bar(share <= 0.15, `tribute is a supplement (${(share * 100).toFixed(1)}% ≤ 15%)`);
}

// Law 3 — the lapsed player: 14 days away from a mid hold, then one active day back.
{
  const day0 = Date.UTC(2026, 6, 1);
  const dk = (d: number): string => new Date(day0 + d * 86_400_000).toISOString().slice(0, 10);
  let sectors: Record<string, SectorState | undefined> = {
    reach_spine: { level: 90, updatedAt: day0 }, reach_quarry: { level: 60, updatedAt: day0 },
    basin_cortex: { level: 45, updatedAt: day0 },
  };
  const startTotal = 90 + 60 + 45;
  // 14 absent days — the cursor rule resolves only ONE unresolved day on return.
  const returnAt = day0 + 14 * 86_400_000;
  const bite = resolveIncursionBite(sectors, dk(13), {}, returnAt);
  sectors = bite.sectors;
  const afterAbsence = ALL_SECTORS.reduce((s, x) => s + effectiveLevel(sectors[x.id], returnAt), 0);
  const lost = startTotal - afterAbsence;
  const maxLoss = 3 * 14 * DECAY_PER_DAY + INCURSION_BITE; // full-rate decay on 3 sectors + one bite
  console.log(`lapse: ${startTotal} → ${afterAbsence.toFixed(1)} after 14 days away (lost ${lost.toFixed(1)}, bound ${maxLoss})`);
  bar(lost <= maxLoss + 1e-6, `no death spiral: 14-day loss ${lost.toFixed(1)} ≤ decay + ONE bite (${maxLoss})`);
  // One return day: three wins at the run cap feed back more than one absent day cost.
  let back = sectors;
  for (let i = 0; i < 3; i++) back = feedInfestation(back, 'reach_spine', GAIN_CAP_PER_RUN, returnAt).sectors;
  const afterPlay = ALL_SECTORS.reduce((s, x) => s + effectiveLevel(back[x.id], returnAt), 0);
  bar(afterPlay - afterAbsence >= lost / 14 * 3, `recovery: one session (+${(afterPlay - afterAbsence).toFixed(0)}) outpaces days of loss`);
}

// Law 4 — pressure fairness + rotation over 60 played days.
{
  const day0 = Date.UTC(2026, 6, 1);
  let sectors: Record<string, SectorState | undefined> = Object.fromEntries(
    REGIONS[1].sectors.map((s) => [s.id, { level: 80, updatedAt: day0 }]));
  const defenses: Record<string, string> = {};
  const incTargets = new Set<string>();
  const hotTargets = new Set<string>();
  let defendedAll = true;
  for (let d = 0; d < 60; d++) {
    const now = day0 + d * 86_400_000;
    const key = new Date(now).toISOString().slice(0, 10);
    hotTargets.add(hotspotSectorId(key));
    // resolve yesterday (always defended in this persona), then play: defend today + feed.
    if (d > 0) {
      const y = new Date(now - 86_400_000).toISOString().slice(0, 10);
      const res = resolveIncursionBite(sectors, y, defenses, now);
      if (res.bitten) defendedAll = false;
      sectors = res.sectors;
    }
    const inc = incursionSectorId(key, sectors, now);
    if (inc) { incTargets.add(inc); defenses[key] = inc; sectors = feedInfestation(sectors, inc, 20, now).sectors; }
  }
  const endTotal = REGIONS[1].sectors.reduce((s, x) => s + effectiveLevel(sectors[x.id], day0 + 60 * 86_400_000), 0);
  console.log(`defended 60 days: region total ${endTotal.toFixed(0)}/400 · incursion targets ${incTargets.size} · hotspot coverage ${hotTargets.size}/16`);
  bar(defendedAll, 'daily defense means NO bite ever lands');
  bar(endTotal >= 320, `held ground holds under daily play (${endTotal.toFixed(0)} ≥ 320/400)`);
  bar(incTargets.size >= 2, `incursions rotate across held sectors (${incTargets.size} ≥ 2)`);
  bar(hotTargets.size >= 10, `hotspots rotate the map (${hotTargets.size}/16 sectors in 60 days)`);
}

// Structural — every deploy warp pairs hazard-up with reward-up (identity has a price + a payoff).
{
  const hazardKeys = ['countMult', 'hpMult', 'speedMult'] as const;
  const rewardKeys = ['bountyMult', 'rewardMult'] as const;
  const ok = REGIONS.every((r) => {
    const w = REGION_WARPS[r.id]?.warp ?? {};
    return hazardKeys.some((k) => (w[k] ?? 1) > 1) && rewardKeys.some((k) => (w[k] ?? 1) > 1);
  });
  bar(ok, 'every region warp pairs a hazard with a payoff');
}

if (fails.length > 0) {
  console.error(`\nFAILED ${fails.length} Front law(s).`);
  process.exit(1);
}
console.log('\nALL FRONT LAWS PASS — spoils bounded, tribute supplemental, pressure fair, war rotates.');
