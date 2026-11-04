// UNLOCK TREE generator (docs/PROGRESSION-GATING.md) — renders the feature registry into
// docs/UNLOCK-TREE.md: the complete learning curve, each row with its gate, its guarantee, its
// teach link, and its design justification. Drift-tested by src/state/unlocks.test.ts.
//   npm run unlocks

import { writeFileSync } from 'node:fs';
import { FEATURES, evalCondition, unlockTimeline } from '../src/state/unlocks';
import { MECHANIC_BY_ID } from '../src/state/mechanics';
import { defaultSave } from '../src/save/saveStore';

const fresh = defaultSave();

// Stage → play-time calibration (progression simulator, `simulateAccount` 4 seeds × 40h, measured
// 2026-11: loop-faithful policy / the slower "Fresh Account" persona). Hours at which a stage is
// first cleared — the bot is frictionless, so real players sit at or past the slower figure.
// Re-measure (docs/PROGRESSION-GATING.md §timeline) when the requirement curve or economy moves.
const PACE: [stage: number, bot: number, fresh: number][] = [
  [0, 0, 0], [1, 0.05, 0.1], [2, 0.1, 0.2], [3, 0.15, 0.3], [4, 0.25, 0.5], [5, 0.3, 0.6], [6, 0.4, 0.7],
  [7, 0.5, 0.8], [8, 0.75, 0.9], [10, 0.75, 1.1], [12, 1, 1.4], [14, 1.25, 1.5], [16, 1.5, 1.75],
  [18, 1.75, 2], [20, 1.75, 2.6], [22, 2, 2.9], [24, 2.25, 5.75], [25, 6, 8.4], [26, 6.4, 8.5],
  [27, 6.4, 8.6], [28, 6.6, 9.1], [30, 7.9, 21.6],
];
function paceAt(stage: number): string {
  if (stage <= 0) return 'minute 0';
  const row = [...PACE].reverse().find(([s]) => s <= stage)!;
  const fmt = (h: number): string => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h.toFixed(h < 3 ? 1 : 0)} h`);
  return `≈ ${fmt(row[1])} · fresh ≈ ${fmt(row[2])}`;
}
const L: string[] = [];
L.push('# UNLOCK-TREE.md — the complete progression reveal timeline (GENERATED — `npm run unlocks`)');
L.push('');
L.push(`> ${FEATURES.length} features under progression gating (docs/PROGRESSION-GATING.md): every hub`);
L.push('> screen and wallet chip, in learning-curve order. "Possible" = earliest a lucky account can');
L.push('> reveal it; "guaranteed" = the campaign stage that opens it regardless of drops.');
L.push('');
L.push('| # | Feature | Kind | Requirement | Possible | Guaranteed | ≈ Play time | Teach (What\'s New) | Why this timing |');
L.push('|---|---------|------|-------------|----------|------------|-------------|--------------------|-----------------|');
for (const f of [...FEATURES].sort((a, b) => a.order - b.order)) {
  const v = evalCondition(f.condition, fresh);
  const t = unlockTimeline().find((x) => x.def.id === f.id)!;
  const teach = f.teach ? `${MECHANIC_BY_ID.get(f.teach)?.title ?? '??'} (\`${f.teach}\`)` : '—';
  L.push(`| ${f.order} | ${f.glyph} **${f.name}** \`${f.id}\` | ${f.kind} | ${v.label || 'always available'} | ${t.possibleAt === 0 ? 'start' : `S${t.possibleAt}`} | ${t.guaranteedBy === 0 ? 'start' : `S${t.guaranteedBy}`} | ${paceAt(t.guaranteedBy)} | ${teach} | ${f.because} |`);
}
L.push('');
L.push('## The worst-case walk (no drop luck — every backstop earning its keep)');
L.push('');
const byStage = new Map<number, string[]>();
for (const { def, guaranteedBy } of unlockTimeline()) {
  if (!byStage.has(guaranteedBy)) byStage.set(guaranteedBy, []);
  byStage.get(guaranteedBy)!.push(`${def.glyph} ${def.name}`);
}
for (const [stage, names] of [...byStage.entries()].sort((a, b) => a[0] - b[0])) {
  L.push(`- **${stage === 0 ? 'Minute 0' : `Stage ${stage}`}**${stage === 0 ? '' : ` (${paceAt(stage)})`} — ${names.join(' · ')}`);
}
L.push('');
writeFileSync('docs/UNLOCK-TREE.md', L.join('\n'));
console.log(`gen-unlocks: docs/UNLOCK-TREE.md regenerated (${FEATURES.length} features)`);
