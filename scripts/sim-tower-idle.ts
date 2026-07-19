// TOWER IDLE balance instrument (docs/TOWER-IDLE.md §7) — measures what the idle-posture
// layer actually contributes: per-kind engagement uptime vs preparation share, damage
// distribution across a MIXED short/long-range board, and the layer's support output
// (openers, ranging shots, biomass trickled, integrity mended), A/B'd against the legacy
// sim (RunOptions.disableIdle). Run: npm run sim:idle

import { Game } from '../src/core/game';
import { SIM_DT, TOWER_DEFS } from '../src/core/config';
import { towerSlots } from '../src/core/map';
import type { MetaModifiers, TowerKind } from '../src/core/types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
// A deliberately MIXED board: the autoplay trio + the brawler, the epidemic nest and the
// mid autocannon — short and long range side by side, so the range-value ratio is visible.
const KINDS: TowerKind[] = ['needle', 'mortar', 'reactor', 'maw', 'parasite', 'spitfang'];
const SEEDS = [1, 7, 42, 777];

interface RunReport {
  won: boolean;
  integrity: number;
  biomass: number;
  dmg: Partial<Record<TowerKind, number>>;
  engaged: Partial<Record<TowerKind, number>>; // combat-posture tick share (idle-on runs only)
  ticks: Partial<Record<TowerKind, number>>;
  openers: number;
  ranging: number;
  trickledBiomass: number;
  mended: number;
}

function run(seed: number, disableIdle: boolean): RunReport {
  const game = new Game(seed, NO_META, undefined, undefined, undefined, { disableIdle });
  const engaged: Partial<Record<TowerKind, number>> = {};
  const ticks: Partial<Record<TowerKind, number>> = {};
  let t = 0;
  let guard = 0;
  while (t < 600 && game.phase !== 'won' && game.phase !== 'lost' && guard++ < 500000) {
    if (game.phase === 'draft') {
      game.chooseCard(game.getSnapshot().draft![0].id);
      continue;
    }
    if (game.phase === 'prep') {
      let placed = 0;
      for (let i = 0; i < towerSlots.length && placed < 3; i++) {
        if (game.placeTower(KINDS[i % KINDS.length], towerSlots[i].x, towerSlots[i].y)) placed++;
      }
      game.startWave();
    }
    game.advance(SIM_DT);
    t += SIM_DT;
    if (game.phase === 'wave') {
      for (const tw of game.towers) {
        ticks[tw.kind] = (ticks[tw.kind] ?? 0) + 1;
        if (tw.prep < 0.2) engaged[tw.kind] = (engaged[tw.kind] ?? 0) + 1;
      }
    }
  }
  const acc = game.getMasteryAccrual();
  const dmg: Partial<Record<TowerKind, number>> = {};
  for (const k of KINDS) dmg[k] = Math.round(acc[k].damage);
  return {
    won: game.phase === 'won', integrity: Math.round(game.integrity), biomass: Math.round(game.biomass),
    dmg, engaged, ticks,
    openers: game.idleOpeners, ranging: game.idleRangingShots,
    trickledBiomass: Math.round(game.idleBiomass), mended: Math.round(game.idleMended),
  };
}

function aggregate(rs: RunReport[]): { wins: number; integrity: number; dmg: Record<string, number> } {
  const dmg: Record<string, number> = {};
  for (const k of KINDS) dmg[k] = rs.reduce((a, r) => a + (r.dmg[k] ?? 0), 0);
  return { wins: rs.filter((r) => r.won).length, integrity: rs.reduce((a, r) => a + r.integrity, 0), dmg };
}

const withIdle = SEEDS.map((s) => run(s, false));
const legacy = SEEDS.map((s) => run(s, true));
const A = aggregate(withIdle);
const B = aggregate(legacy);

console.log(`tower-idle balance report — mixed board (${KINDS.join('/')}), seeds ${SEEDS.join(',')}`);
console.log(`  outcome: idle ${A.wins}/${SEEDS.length} wins, Σintegrity ${A.integrity}  ·  legacy ${B.wins}/${SEEDS.length} wins, Σintegrity ${B.integrity}`);
console.log('  per-kind damage (Σ over seeds) + engagement share (idle runs):');
const totalA = Object.values(A.dmg).reduce((a, b) => a + b, 0);
const totalB = Object.values(B.dmg).reduce((a, b) => a + b, 0);
for (const k of KINDS) {
  const range = TOWER_DEFS[k].range;
  const shareA = totalA > 0 ? ((A.dmg[k] / totalA) * 100).toFixed(1) : '0';
  const shareB = totalB > 0 ? ((B.dmg[k] / totalB) * 100).toFixed(1) : '0';
  const eng = withIdle.reduce((a, r) => a + (r.engaged[k] ?? 0), 0);
  const tot = withIdle.reduce((a, r) => a + (r.ticks[k] ?? 0), 0);
  const engPct = tot > 0 ? ((eng / tot) * 100).toFixed(0) : '—';
  console.log(`    ${k.padEnd(9)} range ${String(range).padStart(3)} · dmg ${shareA.padStart(5)}% (legacy ${shareB.padStart(5)}%) · combat-posture ${engPct.padStart(3)}% of deployed ticks`);
}
const openers = withIdle.reduce((a, r) => a + r.openers, 0);
const ranging = withIdle.reduce((a, r) => a + r.ranging, 0);
const trickled = withIdle.reduce((a, r) => a + r.trickledBiomass, 0);
const mended = withIdle.reduce((a, r) => a + r.mended, 0);
console.log(`  idle layer output: ${openers} charged openers · ${ranging} ranging spores · ${trickled} biomass trickled · ${mended} integrity mended`);
// The headline the brief asks for: short-range towers must GAIN relative value with the layer on.
const shortKinds = KINDS.filter((k) => TOWER_DEFS[k].range <= 300 && TOWER_DEFS[k].range > 100);
const shortA = shortKinds.reduce((a, k) => a + A.dmg[k], 0) / Math.max(1, totalA);
const shortB = shortKinds.reduce((a, k) => a + B.dmg[k], 0) / Math.max(1, totalB);
console.log(`  short-range (≤300px) damage share: idle ${(shortA * 100).toFixed(1)}% vs legacy ${(shortB * 100).toFixed(1)}%${shortA >= shortB ? ' — short-range value HELD/ROSE ✓' : ' — REGRESSED ✗'}`);
process.exit(A.wins >= B.wins && shortA >= shortB - 0.005 ? 0 : 1);
