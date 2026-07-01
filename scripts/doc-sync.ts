// Documentation drift report (npm run docs:check). Hard problems (anchors, dead paths) exit 1;
// staleness (code moved after its docs) prints as ranked WARNINGS — the human signal to update.
import { execSync } from 'node:child_process';
import { SYSTEMS } from '../src/dev/systemRegistry';
import { anchorProblems, deadDocPaths, REPO_ROOT } from '../src/dev/docSync';

const lastCommitTime = (paths: string[]): number => {
  if (paths.length === 0) return 0;
  try {
    const out = execSync(`git log -1 --format=%ct -- ${paths.map((p) => `'${p}'`).join(' ')}`, { cwd: REPO_ROOT }).toString().trim();
    return out ? Number(out) : 0;
  } catch { return 0; }
};

const anchors = anchorProblems();
const dead = deadDocPaths();

console.log('── doc ↔ code anchors ──');
console.log(anchors.length ? anchors.map((a) => `  ✖ ${a}`).join('\n') : '  ✓ all anchors match the live code');
console.log('── dead doc references ──');
console.log(dead.length ? dead.map((d) => `  ✖ ${d}`).join('\n') : '  ✓ every referenced path exists');

console.log('── staleness (advisory: code committed after its docs) ──');
const stale: { id: string; days: number }[] = [];
for (const s of SYSTEMS) {
  if (s.files.length === 0 || s.docs.length === 0) continue;
  const code = lastCommitTime(s.files);
  const docs = lastCommitTime(s.docs);
  if (code > docs) stale.push({ id: s.id, days: Math.round(((code - docs) / 86400) * 10) / 10 });
}
stale.sort((a, b) => b.days - a.days);
console.log(stale.length
  ? stale.map((x) => `  ⚠ ${x.id}: code is ${x.days}d newer than its docs — review ${SYSTEMS.find((s) => s.id === x.id)!.docs.join(', ')}`).join('\n')
  : '  ✓ no system\'s code is newer than its docs');

if (anchors.length || dead.length) process.exit(1);
