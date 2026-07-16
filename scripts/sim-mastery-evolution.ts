// MASTERY EVOLUTION balancing simulation (docs/MASTERY.md §economy) — run with
//   npx vite-node scripts/sim-mastery-evolution.ts
// Models the four player archetypes over long horizons against the REAL curves:
//   • loop pacing (XP-metered loops — loopXpRequirement) at archetype XP/hour rates
//   • where the track's VALUE sits vs where players actually reach (per-decade payout)
//   • per-loop / per-hour alternate-progression income at P2..P6 (faucet-subordination check)
//   • Ichor trickle and the Power hum vs its cap
// Pure reads of the shipped modules — no save, no sim, no writes. Re-run after any
// MASTERY / MASTERY_EVOLUTION tunable change and refresh docs/MASTERY.md §economy.

import {
  BASE_LOOP_XP, MASTERY_EVOLUTION, loopXpRequirement, masteryEvolutionPowerMult,
  masteryEvolutionTrack, p1ShardBudget,
} from '../src/core/masteryEvolution';
import type { EvolutionGrant } from '../src/core/masteryEvolution';
import { MASTERY, STAR, TOWER_ORDER } from '../src/core/config';

const f = (n: number): string =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : `${Math.round(n)}`;
const hrs = (h: number): string => (h >= 1000 ? `${(h / 1000).toFixed(1)}k h` : `${Math.round(h)} h`);

// Archetype XP/hour on ONE focused unit — assumption-based (documented, not measured):
// xpPerDamage 0.02 dominates; damage/run grows with account depth and endless pushes, and
// tower-XP multipliers (collection +25%, research boosts) lift the deeper profiles.
const ARCHETYPES = [
  { name: 'Casual (1h/day, mid-game)', xpPerHour: 12_000 },
  { name: 'Regular (evenings, good mults)', xpPerHour: 40_000 },
  { name: 'Grinder (deep endless, maxed mults)', xpPerHour: 150_000 },
  { name: 'Whale/late (everything + boosts)', xpPerHour: 500_000 },
];

console.log('══ MASTERY EVOLUTION — balancing simulation ══\n');

// ── 1. Loop pacing ────────────────────────────────────────────────────────────
console.log('── Loop pacing (XP-metered loops; loop 1 ≡ mastery levels 1..100) ──');
console.log(`base loop XP (mastery levels 1..100 on the real ×${MASTERY.reqGrowth} curve): ${f(BASE_LOOP_XP)}`);
for (let p = 0; p <= 6; p++) {
  const need = loopXpRequirement(p);
  const t = ARCHETYPES.map((a) => `${a.name.split(' ')[0]} ${hrs(need / a.xpPerHour)}`).join(' · ');
  console.log(`loop ${p + 1} (P${p + 1}): ${f(need)} XP  →  ${t}`);
}
console.log('(A LEVEL-windowed loop 2 would have cost ×83,522 loop 1 — the design this replaced.)\n');

// ── 2. Reachability vs value — where the track pays on the way to the crown ──
console.log('── P1 value distribution vs reachability (needle, the starter ladder) ──');
const track = masteryEvolutionTrack('tower', 'needle', 0);
const cumXpAt = (level: number): number => {
  let s = 0;
  for (let l = 0; l < level; l++) s += Math.round(MASTERY.baseReq * Math.pow(MASTERY.reqGrowth, l));
  return s;
};
const budget = p1ShardBudget('tower', 'needle');
let running = 0;
for (let decade = 1; decade <= 10; decade++) {
  const hi = decade * 10;
  let shards = 0;
  for (const n of track.nodes) {
    if (n.level > hi - 10 && n.level <= hi) for (const g of n.grants) if (g.kind === 'unitShards') shards += g.amount;
  }
  running += shards;
  const casualH = cumXpAt(hi) / ARCHETYPES[0].xpPerHour;
  const grinderH = cumXpAt(hi) / ARCHETYPES[2].xpPerHour;
  console.log(
    `levels ${String(hi - 9).padStart(2)}–${String(hi).padStart(3)}: ${String(shards).padStart(4)} shards` +
    ` (cum ${String(Math.round((running / budget) * 100)).padStart(3)}% of ${budget})` +
    `  reach: casual ${hrs(casualH).padStart(7)} · grinder ${hrs(grinderH).padStart(7)}`,
  );
}
const starCost = (n: number): number => {
  let total = 0;
  for (let s = 0; s < n; s++) total += Math.round(STAR.towerBaseCost * Math.pow(STAR.towerCostMult, s));
  return total;
};
console.log(`(P1 budget ${budget} shards ≈ ${budget >= starCost(5) ? '★5+' : budget >= starCost(4) ? '★4–5' : '★3–4'} cumulative on the tower ladder — never the ★10 spike.)\n`);

// ── 3. Alternate-progression income at depth (per loop AND per grinder-hour) ──
console.log('── P2+ alternate income (per loop · per grinder-hour) — faucet subordination ──');
const sumKind = (p: number, kind: EvolutionGrant['kind']): number => {
  let s = 0;
  for (const n of masteryEvolutionTrack('tower', 'needle', p).nodes) {
    for (const g of n.grants) if (g.kind === kind && 'amount' in g) s += g.amount;
  }
  return s;
};
const containers = (p: number): number =>
  masteryEvolutionTrack('tower', 'needle', p).nodes.reduce((a, n) => a + n.grants.filter((g) => g.kind === 'container').length, 0);
for (const p of [1, 2, 3, 5]) {
  const hours = loopXpRequirement(p) / ARCHETYPES[2].xpPerHour;
  const rows = (['genomeCores', 'geneEssence', 'scrap', 'mutagen', 'catalyst', 'ichor'] as const)
    .map((k) => `${k} ${sumKind(p, k)} (${(sumKind(p, k) / hours).toFixed(2)}/h)`)
    .join(' · ');
  console.log(`P${p + 1} (${hrs(hours)} grinder): ${rows} · containers ${containers(p)}`);
}
console.log('(Every per-hour rate sits far below any direct faucet — the loop enriches, never replaces.)\n');

// ── 4. Power hum ──────────────────────────────────────────────────────────────
console.log('── Power hum (masteryEvolutionPowerMult; cap +' + MASTERY_EVOLUTION.powerCap * 100 + '%) ──');
for (const loops of [1, 5, 10, 26, 60, 200]) {
  const evo = Object.fromEntries(TOWER_ORDER.slice(0, 1).map((k) => [`tower:${k}`, { claimedUpTo: 0, prestige: loops, xpAt: 0 }]));
  console.log(`${String(loops).padStart(3)} total loops → meta ×${masteryEvolutionPowerMult(evo).toFixed(3)}`);
}
console.log('\n══ done — fold the tables into docs/MASTERY.md §economy on change ══');
