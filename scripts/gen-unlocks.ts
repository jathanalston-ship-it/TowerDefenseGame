// UNLOCK TREE generator (docs/PROGRESSION-GATING.md) — renders the feature registry into
// docs/UNLOCK-TREE.md: the complete learning curve, each row with its gate, its guarantee, its
// teach link, and its design justification. Drift-tested by src/state/unlocks.test.ts.
//   npm run unlocks

import { writeFileSync } from 'node:fs';
import { FEATURES, evalCondition, unlockTimeline } from '../src/state/unlocks';
import { MECHANIC_BY_ID } from '../src/state/mechanics';
import { defaultSave } from '../src/save/saveStore';

const fresh = defaultSave();
const L: string[] = [];
L.push('# UNLOCK-TREE.md — the complete progression reveal timeline (GENERATED — `npm run unlocks`)');
L.push('');
L.push(`> ${FEATURES.length} features under progression gating (docs/PROGRESSION-GATING.md): every hub`);
L.push('> screen and wallet chip, in learning-curve order. "Possible" = earliest a lucky account can');
L.push('> reveal it; "guaranteed" = the campaign stage that opens it regardless of drops.');
L.push('');
L.push('| # | Feature | Kind | Requirement | Possible | Guaranteed | Teach (What\'s New) | Why this timing |');
L.push('|---|---------|------|-------------|----------|------------|--------------------|-----------------|');
for (const f of [...FEATURES].sort((a, b) => a.order - b.order)) {
  const v = evalCondition(f.condition, fresh);
  const t = unlockTimeline().find((x) => x.def.id === f.id)!;
  const teach = f.teach ? `${MECHANIC_BY_ID.get(f.teach)?.title ?? '??'} (\`${f.teach}\`)` : '—';
  L.push(`| ${f.order} | ${f.glyph} **${f.name}** \`${f.id}\` | ${f.kind} | ${v.label || 'always available'} | ${t.possibleAt === 0 ? 'start' : `S${t.possibleAt}`} | ${t.guaranteedBy === 0 ? 'start' : `S${t.guaranteedBy}`} | ${teach} | ${f.because} |`);
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
  L.push(`- **${stage === 0 ? 'Minute 0' : `Stage ${stage}`}** — ${names.join(' · ')}`);
}
L.push('');
writeFileSync('docs/UNLOCK-TREE.md', L.join('\n'));
console.log(`gen-unlocks: docs/UNLOCK-TREE.md regenerated (${FEATURES.length} features)`);
