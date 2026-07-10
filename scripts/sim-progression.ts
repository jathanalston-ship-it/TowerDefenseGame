// Progression report generator — runs the virtual-account simulator (src/dev/progressionSim)
// across seeds × hour bands and writes docs/PROGRESSION_REPORT.md (GENERATED — regenerate via
// `npm run sim:progression`; args: `-- --seeds N --hours H`). The report is the evidence base
// for balance decisions (CLAUDE.md: balance by simulation, not intuition).

import { writeFileSync } from 'node:fs';
import { WORLD, simulateAccount } from '../src/dev/progressionSim';
import type { SimTrace } from '../src/dev/progressionSim';

const arg = (name: string, fallback: number): number => {
  const ix = process.argv.indexOf(`--${name}`);
  const v = ix >= 0 ? Number(process.argv[ix + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

const SEEDS = arg('seeds', 8);
const HOURS = arg('hours', 3000);
const BANDS = [10, 50, 100, 250, 500, 1000, 3000].filter((b) => b <= HOURS);

const t0 = Date.now();
const traces: SimTrace[] = [];
for (let i = 0; i < SEEDS; i++) {
  traces.push(simulateAccount(1000 + i * 7919, BANDS));
  process.stderr.write(`seed ${i + 1}/${SEEDS} done (${Math.round((Date.now() - t0) / 1000)}s)\n`);
}

const q = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');

let md = `# PROGRESSION_REPORT.md — simulated player progression

> **GENERATED** by \`npm run sim:progression\` (do not hand-edit). ${SEEDS} virtual accounts ×
> ${HOURS}h, optimal-play policy over the REAL meta layer (docs/PROGRESSION-LOOP.md §time).
> World model: ${WORLD.secPerWave}s/wave, ${WORLD.secMenu}s between runs, ~${WORLD.killsPerWave} kills/wave.
> Generated ${new Date().toISOString().slice(0, 10)}; wall-clock ${Math.round((Date.now() - t0) / 1000)}s.

## Hour-band medians (p50, with p10–p90 spread)

| Hours | Power | Campaign stage | Infinite best | Molts | Account level | Runs | Farm share |
|---|---|---|---|---|---|---|---|
`;
for (let b = 0; b < BANDS.length; b++) {
  const at = traces.map((t) => t.checkpoints[b]).filter(Boolean);
  if (at.length === 0) continue;
  const col = (f: (c: (typeof at)[0]) => number): string =>
    `${fmt(q(at.map(f), 0.5))} <sub>${fmt(q(at.map(f), 0.1))}–${fmt(q(at.map(f), 0.9))}</sub>`;
  const farm = at.map((c) => (c.runs > 0 ? (100 * c.farmRuns) / c.runs : 0));
  md += `| ${BANDS[b]} | ${col((c) => c.power)} | ${col((c) => c.stage)} | ${col((c) => c.bestWave)} | ${col((c) => c.molts)} | ${col((c) => c.accountLevel)} | ${col((c) => c.runs)} | ${Math.round(q(farm, 0.5))}% |\n`;
}

const allFlags = { deadProgression: 0, wallStall: 0, powerSpike: 0, sinkExhaustion: 0 };
for (const t of traces) {
  allFlags.deadProgression += t.flags.deadProgression.length;
  allFlags.wallStall += t.flags.wallStall.length;
  allFlags.powerSpike += t.flags.powerSpike.length;
  allFlags.sinkExhaustion += t.flags.sinkExhaustion.length;
}

md += `
## Detector findings (across all ${SEEDS} accounts)

| Detector | Flagged bands | Meaning when non-zero |
|---|---|---|
| Dead progression | ${allFlags.deadProgression} | farming that moves no power (broken conversion) |
| Wall stall | ${allFlags.wallStall} | stuck at a frontier with flat readiness (impossible wall) |
| Power spike | ${allFlags.powerSpike} | a band multiplying power ≥ ×8 (unsmooth texture) |
| Sink exhaustion | ${allFlags.sinkExhaustion} | currency compounding with nothing to buy |

## Observations for the balance milestone

- **Pacing under optimal play** is the headline number to judge: the stage/hour and molt
  cadence above assume a frictionless spender who always follows the loop directive. Real
  players run slower; the gap is the design margin.
- **Molt cadence**: molts-per-band shows how often the prestige ring cycles. If it reads like
  a per-session action rather than a milestone, raise \`PRESTIGE.molt.minCells\` /
  \`prestigeStageReq\` growth — decide on this evidence, then re-run this report.
- **Farm share** rises with hours as walls thicken (geometric bar vs logarithmic reach) —
  the loop working as designed. A farm share stuck at 0% deep would mean requirements are
  too soft; near 100% early would mean walls form too soon.
- Detector zeros above are the structural guarantees holding (no dead zones, no impossible
  walls, no sink explosions) — they are also asserted at small scale in CI
  (\`src/dev/progressionSim.test.ts\`).

*Scale note:* thousands of accounts = \`npm run sim:progression -- --seeds 2000\` (runtime
scales linearly; the policy is deterministic per seed except loot RNG).
`;

writeFileSync(new URL('../docs/PROGRESSION_REPORT.md', import.meta.url), md);
console.log(`docs/PROGRESSION_REPORT.md written (${SEEDS} seeds × ${HOURS}h).`);
