// Balance report generator — runs the persona matrix (src/dev/balanceReport) and writes
// docs/BALANCE_REPORT.md (GENERATED — regenerate via `npm run sim:report`; args:
// `-- --seeds N --hours H`). REPORT-ONLY: nothing is auto-applied; every bottleneck is for
// human review (docs/SIMULATION-FRAMEWORK.md).

import { writeFileSync } from 'node:fs';
import { detectBottlenecks, renderReport, runMatrix } from '../src/dev/balanceReport';
import { PERSONAS } from '../src/dev/personas';

const arg = (name: string, fallback: number): number => {
  const ix = process.argv.indexOf(`--${name}`);
  const v = ix >= 0 ? Number(process.argv[ix + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

const SEEDS_N = arg('seeds', 5);
const HOURS = arg('hours', 400);
const BANDS = [10, 50, 150, 400, 1000].filter((b) => b <= HOURS);
const SEEDS = Array.from({ length: SEEDS_N }, (_, i) => 2000 + i * 7919);

const t0 = Date.now();
const personas = Object.values(PERSONAS);
process.stderr.write(`matrix: ${personas.length} personas × ${SEEDS_N} seeds × ${BANDS[BANDS.length - 1]}h…\n`);
const runs = runMatrix(BANDS, SEEDS, personas);
process.stderr.write(`simulated in ${Math.round((Date.now() - t0) / 1000)}s; detecting…\n`);
const bottlenecks = detectBottlenecks(runs);
const md = renderReport(runs, bottlenecks, {
  bands: BANDS, seeds: SEEDS, generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
});
writeFileSync('docs/BALANCE_REPORT.md', md);
process.stderr.write(`docs/BALANCE_REPORT.md written — ${bottlenecks.length} bottleneck signals, top ${Math.min(20, bottlenecks.length)} reported.\n`);
