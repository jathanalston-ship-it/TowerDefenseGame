// PROJECT-WIDE REGRESSION AUDIT (npm run validate) — run after every major implementation.
// 1. Diffs the working tree (or --base <ref> / --last for HEAD~1) and maps every changed file
//    through the system registry → the impacted systems + their consumers (the blast radius).
// 2. Runs the full verification (typecheck + the entire test suite — goldens, save-compat,
//    Power, stress) and the doc-sync checks (anchors, dead paths, staleness).
// 3. Emits docs/VALIDATION_REPORT.md: a 19-area regression checklist with per-area status and
//    explicit FLAGS for docs / UI / Help / tutorials that need a human pass.
// Exit code: non-zero when the suite or a hard doc check fails.
import { execSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SYSTEMS, SYSTEM_BY_ID, systemsForFile, consumersOf, impactOf } from '../src/dev/systemRegistry';
import type { SystemDef } from '../src/dev/systemRegistry';
import { anchorProblems, deadDocPaths, REPO_ROOT } from '../src/dev/docSync';

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const range = baseIdx >= 0 ? `${args[baseIdx + 1]}...HEAD` : args.includes('--last') ? 'HEAD~1...HEAD' : null;

function changedFiles(): { files: string[]; scope: string } {
  const run = (cmd: string): string[] => execSync(cmd, { cwd: REPO_ROOT }).toString().trim().split('\n').filter(Boolean);
  if (range) return { files: run(`git diff --name-only ${range}`), scope: range };
  const wt = [...run('git diff --name-only HEAD'), ...run('git ls-files --others --exclude-standard')];
  if (wt.length > 0) return { files: [...new Set(wt)], scope: 'working tree vs HEAD' };
  return { files: run('git diff --name-only HEAD~1...HEAD'), scope: 'HEAD~1...HEAD (tree clean — auditing the last commit)' };
}

const { files, scope } = changedFiles();
const srcChanged = files.filter((f) => f.startsWith('src/') && !/\.test\./.test(f));

// ── Blast radius: directly-changed systems + one consumer ring (what breaks first). ──
const direct = new Map<string, string[]>(); // system id → changed files
for (const f of srcChanged) {
  for (const s of systemsForFile(f)) direct.set(s.id, [...(direct.get(s.id) ?? []), f]);
}
const ring = new Set<string>();
for (const id of direct.keys()) for (const c of consumersOf(id)) if (!direct.has(c.id)) ring.add(c.id);

// ── Run the verification suite. ──
const sh = (cmd: string, arg: string[]): { ok: boolean; tail: string } => {
  const r = spawnSync(cmd, arg, { cwd: REPO_ROOT, encoding: 'utf8', shell: false, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  return { ok: r.status === 0, tail: out.trim().split('\n').slice(-3).join('\n') };
};
console.log('validate: typecheck…');
const tc = sh('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json']);
console.log('validate: test suite (goldens / save / power / stress)…');
const tests = sh('npx', ['vitest', 'run', '--silent']);
console.log('validate: mobile layout gate (390/320px, every screen)…');
const mobile = sh('npm', ['run', 'mobilecheck']); // builds + probes; docs/RESPONSIVE-DESIGN.md
const anchors = anchorProblems();
const dead = deadDocPaths();

// ── The 19-area regression checklist (spec: every future feature verifies these). ──
const AREAS: { area: string; systems: string[]; how: string }[] = [
  { area: 'Power Score', systems: ['power'], how: 'power tests + previews == outcomes (geneArchive/powerIntegration tests)' },
  { area: 'Save compatibility', systems: ['meta-store'], how: 'saveStore migration tests + sanitizers' },
  { area: 'Campaign', systems: ['campaign'], how: 'campaign/evolutioncap tests' },
  { area: 'Infinite', systems: ['infinite'], how: 'endless scaling + draft cadence tests' },
  { area: 'Prestige', systems: ['prestige'], how: 'prestige/ascendant tests' },
  { area: 'Tutorial', systems: ['onboarding'], how: 'tutorial + tutorialRewards tests; replay the Combat Tutorial on flow changes' },
  { area: 'HUD', systems: ['run-ui'], how: 'headless smoke + goldens (snapshot shape)' },
  { area: 'Collection', systems: ['collection'], how: 'collection tests (golden-safe fresh save)' },
  { area: 'Achievements', systems: ['achievements'], how: 'achievements tests' },
  { area: 'Loot', systems: ['loot'], how: 'lootqueue/lootbox/progression-loot tests' },
  { area: 'Equipment', systems: ['equipment', 'crafting'], how: 'equipment + reforge tests' },
  { area: 'Heroes', systems: ['heroes'], how: 'hero lab/slots/evolution tests' },
  { area: 'Gene Cards', systems: ['gene-cards'], how: 'gene* test files + GENE-AUDIT-REPORT checklist' },
  { area: 'Performance', systems: ['engine', 'rendering'], how: 'geneStress (500-card timings) + feel/settle tests; watch the fixed-timestep budget' },
  { area: 'Accessibility', systems: ['run-ui', 'hub-shell'], how: 'keyboard nav (Archive grid pattern), aria-labels on new controls, reduced-motion honored' },
  { area: 'Localization', systems: [], how: 'no i18n layer yet — keep strings inline-en and registered per system (registry.localization)' },
  { area: 'Audio', systems: ['audio'], how: 'every new reward/action has an audio.cue tag' },
  { area: 'Visual Effects', systems: ['rendering'], how: 'renderer/towerEvolution tests; goldens catch sim-side particle changes' },
  { area: 'Notifications', systems: ['notifications'], how: 'notifications tests + genes-channel pattern for new channels' },
];

const impacted = (ids: string[]): 'direct' | 'consumer' | null =>
  ids.some((id) => direct.has(id)) ? 'direct' : ids.some((id) => ring.has(id)) ? 'consumer' : null;

// ── The report. ──
const L: string[] = [];
const verdictOk = tc.ok && tests.ok && mobile.ok && anchors.length === 0 && dead.length === 0;
L.push('# VALIDATION_REPORT.md — automated regression audit');
L.push('');
L.push('> GENERATED by `npm run validate` (scripts/validate.ts). Re-run after every major');
L.push('> implementation; commit the result as the audit record. Companion: docs/DEPENDENCY_GRAPH.md.');
L.push('');
L.push(`- **Date:** ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
L.push(`- **Diff scope:** ${scope} — ${files.length} file(s), ${srcChanged.length} source`);
L.push(`- **Verdict:** ${verdictOk ? '✅ PASS' : '❌ ATTENTION REQUIRED'}`);
L.push(`- **Typecheck:** ${tc.ok ? '✅ clean' : `❌\n\n\`\`\`\n${tc.tail}\n\`\`\``}`);
L.push(`- **Test suite:** ${tests.ok ? `✅ ${tests.tail.match(/Tests {2}[^\n]*/)?.[0] ?? 'green'}` : `❌\n\n\`\`\`\n${tests.tail}\n\`\`\``}`);
L.push(`- **Mobile layout gate (390/320px):** ${mobile.ok ? '✅ clean — no overflow / clipped text / sub-24px targets' : `❌\n\n\`\`\`\n${mobile.tail}\n\`\`\``}`);
L.push(`- **Doc anchors:** ${anchors.length === 0 ? '✅ docs match code values' : anchors.map((a) => `❌ ${a}`).join(' · ')}`);
L.push(`- **Doc references:** ${dead.length === 0 ? '✅ no dead paths' : dead.map((d) => `❌ ${d}`).join(' · ')}`);
L.push('');
L.push('## Blast radius (from the dependency registry)');
L.push('');
if (direct.size === 0) {
  L.push('_No registered source files changed in this scope._');
} else {
  L.push('| System | Hit | Changed files | ⚑ Docs to update | ⚑ UI to review | ⚑ Help | ⚑ Tutorial | Save fields |');
  L.push('|---|---|---|---|---|---|---|---|');
  const row = (s: SystemDef, hit: string, changed: string[]): string => {
    const imp = impactOf(s.id);
    const f = (xs: string[]): string => (xs.length ? xs.map((x) => `\`${x}\``).join('<br>') : '—');
    return `| **${s.id}** | ${hit} | ${f(changed)} | ${f(imp.docsToUpdate)} | ${f(imp.uiToReview)} | ${f(imp.helpToReview)} | ${f(imp.tutorialToReview)} | ${f(imp.saveFields)} |`;
  };
  for (const [id, changed] of [...direct.entries()].sort()) row && L.push(row(SYSTEM_BY_ID.get(id)!, 'DIRECT', changed));
  for (const id of [...ring].sort()) L.push(row(SYSTEM_BY_ID.get(id)!, 'consumer', []));
}
L.push('');
L.push('## Regression checklist (19 areas)');
L.push('');
L.push('| Area | Status | Verified by |');
L.push('|---|---|---|');
for (const a of AREAS) {
  const hit = impacted(a.systems);
  const status = a.area === 'Localization' ? 'ℹ n/a (no i18n layer)'
    : hit === 'direct' ? (tests.ok ? '⚠ IMPACTED — suite green; do the human pass' : '❌ IMPACTED + suite failing')
    : hit === 'consumer' ? (tests.ok ? '⚠ consumer of a changed system — suite green' : '❌ consumer + suite failing')
    : '✅ untouched';
  L.push(`| ${a.area} | ${status} | ${a.how} |`);
}
L.push('');
L.push('## Human follow-ups');
L.push('');
L.push('- ⚑ rows above are the docs/UI/Help/tutorial surfaces the registry says move with the');
L.push('  changed systems — check each, update or explicitly decide "no change needed".');
L.push('- Staleness advisory (code newer than docs): run `npm run docs:check`.');
L.push('- If a NEW system was added: register it in `src/dev/systemRegistry.ts` (the orphan test');
L.push('  forces this), then `npm run docs:graph`.');
L.push('');
writeFileSync(join(REPO_ROOT, 'docs/VALIDATION_REPORT.md'), L.join('\n'));
console.log(`validate: docs/VALIDATION_REPORT.md written — ${verdictOk ? 'PASS' : 'ATTENTION REQUIRED'}`);
if (!verdictOk) process.exit(1);
