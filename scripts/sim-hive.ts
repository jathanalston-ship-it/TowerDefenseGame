// HIVE INTELLIGENCE validation (docs/HIVE-MIND.md §validation) — headless cohort comparison
// on REAL endless runs (no god mode: survival differences are the point).
//   • manual  — a fixed 4-tower opening, no purchases ever (the floor)
//   • hive    — same opening + one hivePulse at every prep (the button pressed each wave)
//   • mixed   — same opening + a pulse every OTHER prep
// Measured per cohort: mean survival depth, mean final live Power, biomass efficiency
// (spent/earned), actions taken, reserve violations (must be 0 — the pulse may never
// leave the wallet below the reserve it computed when it started buying).
// GATE (exit 1): hive mean depth ≥ manual mean depth, and zero reserve violations.
// Run: npm run sim:hive
import { Game } from '../src/core/game';
import { HIVE_MIND, SIM_DT } from '../src/core/config';
import { effectsPower } from '../src/core/power';
import { towerSlots } from '../src/core/map';
import type { MetaModifiers, TowerKind } from '../src/core/types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const OPENING: TowerKind[] = ['needle', 'mortar', 'coil', 'spitfang'];
const SEEDS = [3, 11, 19, 27, 35, 43];
const MAX_SIM_SEC = 900;

interface RunResult { depth: number; power: number; spent: number; earned: number; actions: number; reserveViolations: number }

function run(seed: number, pulseEvery: number): RunResult {
  const g = new Game(seed, NO_META, undefined, 'ravager', undefined, { mode: 'endless' });
  g.debugAddBiomass(600); // identical opening bank for every cohort — the comparison stays fair
  const forward = [...towerSlots].sort((a, b) => a.y - b.y);
  let placed = 0;
  for (const s of forward) if (g.placeTower(OPENING[placed], s.x, s.y) && ++placed >= OPENING.length) break;
  if (placed < OPENING.length) throw new Error(`opening incomplete: placed ${placed}/${OPENING.length}`);
  const earnedStart = g.biomass;
  let earned = earnedStart;
  let lastBio = g.biomass;
  let spent = 0;
  let actions = 0;
  let reserveViolations = 0;
  let preps = 0;
  let wasPrep = true;
  g.setAutoStart(true);
  g.startWave();
  for (let t = 0; t < MAX_SIM_SEC && g.phase !== 'lost'; t += SIM_DT) {
    // The draft PAUSES the whole sim (the mega-probe lesson, docs/MEGA-BOSS.md §feel) —
    // every headless run harness must play it or it measures the menu.
    if (g.phase === 'draft' && g.draft !== null && g.draft.length > 0) g.chooseCard(g.draft[0].id);
    const isPrep = g.phase === 'prep';
    if (isPrep && !wasPrep) {
      preps++;
      if (pulseEvery > 0 && preps % pulseEvery === 0) {
        const before = g.biomass;
        const reserve = Math.max(HIVE_MIND.reserveMin, Math.floor(before * HIVE_MIND.reserveFrac));
        const rep = g.hivePulse();
        spent += rep.spent;
        actions += rep.actions.length;
        if (rep.spent > 0 && g.biomass < Math.min(reserve, before)) reserveViolations++;
      }
    }
    wasPrep = isPrep;
    if (g.biomass > lastBio) earned += g.biomass - lastBio; // income only (spend never counts)
    lastBio = g.biomass;
    g.advance(SIM_DT);
  }
  return { depth: g.waveIndex, power: effectsPower(g.powerEffects()), spent, earned, actions, reserveViolations };
}

function cohort(name: string, pulseEvery: number): { name: string; depth: number; power: number; eff: number; actions: number; violations: number } {
  const rs = SEEDS.map((s) => run(s, pulseEvery));
  const mean = (f: (r: RunResult) => number): number => rs.reduce((a, r) => a + f(r), 0) / rs.length;
  return {
    name,
    depth: mean((r) => r.depth),
    power: mean((r) => r.power),
    eff: mean((r) => (r.earned > 0 ? r.spent / r.earned : 0)),
    actions: mean((r) => r.actions),
    violations: rs.reduce((a, r) => a + r.reserveViolations, 0),
  };
}

const manual = cohort('manual (no purchases)', 0);
const hive = cohort('hive (pulse every prep)', 1);
const mixed = cohort('mixed (every 2nd prep)', 2);

console.log(`hive intelligence cohort sim — ${SEEDS.length} endless seeds, ${MAX_SIM_SEC}s cap, 4-tower opening\n`);
for (const c of [manual, hive, mixed]) {
  console.log(`▸ ${c.name}`);
  console.log(`    mean depth ${c.depth.toFixed(1)} · mean live power ${c.power.toFixed(2)} · biomass efficiency ${(c.eff * 100).toFixed(0)}% spent`);
  console.log(`    mean actions/run ${c.actions.toFixed(1)} · reserve violations ${c.violations}`);
}
const ok = hive.depth >= manual.depth && hive.violations === 0 && mixed.violations === 0;
console.log(ok
  ? '\nPASS — the mind never makes a run worse and never raids the reserve'
  : '\nFAIL — hive underperforms manual or violated the reserve; investigate before shipping');
process.exit(ok ? 0 : 1);
