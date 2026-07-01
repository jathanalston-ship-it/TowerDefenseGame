// AI HANDOFF scaffolder (npm run handoff) — generates docs/AI_HANDOFF.md after a completed
// feature. Everything automation can know is PREFILLED from the git diff + the system registry
// (files, systems, Power/save/UI/doc surfaces); judgment sections carry TODO markers the session
// fills before committing. Pass --base <ref> to widen the diff (default: last commit if the tree
// is clean, else working tree).
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SYSTEM_BY_ID, systemsForFile, consumersOf, impactOf } from '../src/dev/systemRegistry';
import { REPO_ROOT } from '../src/dev/docSync';

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const run = (cmd: string): string[] => execSync(cmd, { cwd: REPO_ROOT }).toString().trim().split('\n').filter(Boolean);

let files: string[]; let scope: string;
if (baseIdx >= 0) { scope = `${args[baseIdx + 1]}...HEAD`; files = run(`git diff --name-only ${scope}`); }
else {
  const wt = [...run('git diff --name-only HEAD'), ...run('git ls-files --others --exclude-standard')];
  if (wt.length) { files = [...new Set(wt)]; scope = 'working tree vs HEAD'; }
  else { files = run('git diff --name-only HEAD~1...HEAD'); scope = 'HEAD~1...HEAD'; }
}
const src = files.filter((f) => f.startsWith('src/') && !/\.test\./.test(f));
const tests = files.filter((f) => /\.test\./.test(f));
const docs = files.filter((f) => f.startsWith('docs/'));

const hit = new Map<string, string[]>();
for (const f of src) for (const s of systemsForFile(f)) hit.set(s.id, [...(hit.get(s.id) ?? []), f]);
const ids = [...hit.keys()].sort();
const consumers = new Set<string>();
for (const id of ids) for (const c of consumersOf(id)) if (!hit.has(c.id)) consumers.add(c.id);
const saveTouched = files.some((f) => f.startsWith('src/save/'));
const powerTouched = ids.some((id) => SYSTEM_BY_ID.get(id)!.powerScore !== null);
const uiTouched = [...new Set(ids.flatMap((id) => { const i = impactOf(id); return [...i.uiToReview]; }))];
const docsToUpdate = [...new Set(ids.flatMap((id) => impactOf(id).docsToUpdate))];

const L: string[] = [];
L.push('# AI_HANDOFF.md — session handoff');
L.push('');
L.push('> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session');
L.push('> before committing. Read together with docs/PROJECT_STATUS.md and the latest');
L.push('> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.');
L.push('');
L.push(`- **Generated:** ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · **Diff scope:** ${scope}`);
L.push(`- **Branch:** ${run('git branch --show-current')[0] ?? '?'} · **HEAD:** ${run('git rev-parse --short HEAD')[0] ?? '?'}`);
L.push('');
L.push('## Summary of work completed');
L.push('');
L.push('TODO: 3–6 sentences — what shipped, why, and the one thing the next session must know.');
L.push('');
L.push('## Files modified');
L.push('');
L.push(`- Source (${src.length}): ${src.map((f) => `\`${f}\``).join(', ') || '—'}`);
L.push(`- Tests (${tests.length}): ${tests.map((f) => `\`${f}\``).join(', ') || '—'}`);
L.push(`- Docs (${docs.length}): ${docs.map((f) => `\`${f}\``).join(', ') || '—'}`);
L.push('');
L.push('## Systems affected (from the dependency registry)');
L.push('');
for (const id of ids) L.push(`- **${id}** — ${hit.get(id)!.map((f) => `\`${f}\``).join(', ')}`);
if (consumers.size) L.push(`- Consumer ring (verify, unchanged): ${[...consumers].sort().join(', ')}`);
if (!ids.length) L.push('- (no registered source files in this diff)');
L.push('');
L.push(`## Power Score changes\n\n${powerTouched ? 'TODO: a Power-relevant system changed — state what moved (scale, buckets, preview surfaces) and which tests pin it.' : 'None — no Power-relevant system touched.'}`);
L.push('');
L.push(`## UI changes\n\n${uiTouched.length ? `Surfaces in the blast radius: ${uiTouched.map((u) => `\`${u}\``).join(', ')}\n\nTODO: what visually/behaviorally changed; note headless-smoke coverage.` : 'None flagged by the registry.'}`);
L.push('');
L.push(`## Documentation changes\n\nRegistry says these move with the touched systems: ${docsToUpdate.map((d) => `\`${d}\``).join(', ') || '—'}\n\nTODO: confirm each was updated or record "no change needed".`);
L.push('');
L.push(`## Save changes\n\n${saveTouched ? 'TODO: src/save touched — state schema version, new fields, sanitizers, and the migration test.' : 'None — save layer untouched.'}`);
L.push('');
L.push('## Known edge cases\n\nTODO: the sharp corners the next session should not rediscover.');
L.push('');
L.push('## Remaining technical debt\n\nTODO: new debt introduced or observed (cross-reference docs/ENGINEERING-AUDIT.md §debt).');
L.push('');
L.push('## Recommended next tasks\n\nTODO: ordered, concrete, with entry points.');
L.push('');
L.push('## Future expansion hooks\n\nTODO: seams deliberately left open (name the file + symbol).');
L.push('');
writeFileSync(join(REPO_ROOT, 'docs/AI_HANDOFF.md'), L.join('\n'));
console.log('docs/AI_HANDOFF.md scaffolded — fill the TODO sections, update docs/PROJECT_STATUS.md, commit both.');
