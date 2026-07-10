// CHRONICLE classifier (docs/CHANGELOG-PIPELINE.md) — turns one git commit (subject +
// body + changed files) into a categorized, player-ready note line. PURE and dependency-
// free so it is unit-testable and reusable; the generator (scripts/gen-notes.ts) is the
// only writer. Three signals, in order of trust:
//   1. conventional-commit type  (fix: → Bug Fixes, perf: → Performance, …)
//   2. scope + subject keywords  (feat(expeditions): → Gameplay, "boss" → Bosses, …)
//   3. changed-file paths        (public/welcome/ → Website, functions/ → Backend, …)
// Vague messages are never guessed into player notes: they are flagged needsReview and
// kept internal until a human rewrites them.

import type { ClassifiedCommit, NoteCategory } from './types';

export interface CommitFacts {
  subject: string;
  body: string;
  files: string[];
}

/** keyword → category, checked against scope first, then the whole subject.
 *  ORDER MATTERS (first hit wins): specific systems before generic buckets. */
const KEYWORD_RULES: [RegExp, NoteCategory][] = [
  [/mega[\s-]?boss/, 'Mega Bosses'],
  [/\bmusic\b|soundtrack|\btheme\b|melody/, 'Music'],
  [/\baudio\b|\bsound(s)?\b|\bcue(s)?\b|sfx/, 'Audio'],
  [/\bboss(es)?\b|nemesis|rush/, 'Bosses'],
  [/\bhero(es)?\b|champion|expedition/, 'Heroes'],
  [/\btower(s)?\b|mulligan|turret/, 'Towers'],
  [/\bcard(s)?\b|\bgene(s)?\b|archive|evolution/, 'Gene Cards'],
  [/\benem(y|ies)\b|creep|swarm|elite/, 'Enemies'],
  [/\bsecurity\b|csp\b|auth|lockdown/, 'Security'],
  [/\bperf(ormance)?\b|\bfps\b|allocation/, 'Performance'],
  [/optimi[sz]/, 'Optimization'],
  [/\bsite\b|website|welcome|landing|domain|seo|marketing|news page/, 'Website'],
  [/\bapi\b|backend|stripe|\bd1\b|worker|leaderboard|cloud save/, 'Backend'],
  [/\bux\b|onboarding|tutorial|tour|accessibility|a11y/, 'UX'],
  [/\bui\b|\bhud\b|menu|overlay|panel|screen|popup/, 'UI'],
  [/visual|render|beauty|\bfx\b|\bart\b|cutscene|animation|particle/, 'Visuals'],
  [/balance|\btun(e|ing)\b|\bnerf\b|\bbuff\b|economy pass/, 'Balance'],
  [/pipeline|tooling|devtool|script|registry|manifest|validator/, 'Developer Tools'],
  [/framework|refactor|architecture|migration/, 'Framework'],
  [/biome|campaign|wave|daily|infinite|infestation|progression|prestige|achievement|save|equipment|loot|contract|cosmetic|phenotype|economy|gameplay/, 'Gameplay'],
];

/** path prefix → category (the fallback when words don't decide). */
const PATH_RULES: [RegExp, NoteCategory][] = [
  [/^public\/welcome\//, 'Website'],
  [/^functions\//, 'Backend'],
  [/^scripts\//, 'Developer Tools'],
  [/^src\/render\//, 'Visuals'],
  [/^src\/audio\//, 'Audio'],
  [/^src\/ui\//, 'UI'],
  [/^src\/(core|state)\//, 'Gameplay'],
];

/** Subjects that carry no usable information — flag, never guess. */
const VAGUE = /^(wip|fix|fixes|update|updates|changes?|stuff|misc|tweak|cleanup|more|work)\.?$/i;

const CONVENTIONAL = /^(feat|fix|perf|docs|test|chore|refactor|style|build|ci|balance)(\(([^)]*)\))?!?:\s*(.+)$/;

function byKeywords(s: string): NoteCategory | null {
  for (const [re, cat] of KEYWORD_RULES) if (re.test(s)) return cat;
  return null;
}

function byPaths(files: string[]): NoteCategory | null {
  const counts = new Map<NoteCategory, number>();
  for (const f of files) {
    for (const [re, cat] of PATH_RULES) {
      if (re.test(f)) { counts.set(cat, (counts.get(cat) ?? 0) + 1); break; }
    }
  }
  let best: NoteCategory | null = null;
  let bestN = 0;
  for (const [cat, n] of counts) if (n > bestN) { best = cat; bestN = n; }
  return best;
}

/** True when the commit touches nothing a player could ever observe. */
function onlyInternalPaths(files: string[]): boolean {
  if (files.length === 0) return false;
  return files.every((f) =>
    f.startsWith('docs/') || f.startsWith('scripts/') || f.startsWith('changelog/')
    || f.startsWith('src/dev/') || /\.test\.(ts|tsx)$/.test(f)
    || /^(\.|CLAUDE|README|package(-lock)?\.json)/.test(f));
}

/** Capitalize + strip the trailing period — commit subjects become note lines.
 *  A conventional SCOPE the subject doesn't already mention is kept as a prefix
 *  ("feat(expeditions): full overhaul" → "Expeditions: full overhaul") so notes stay
 *  searchable and self-describing once the prefix is gone. */
function playerText(s: string, scope = ''): string {
  let t = s.trim().replace(/\.$/, '');
  const stem = scope.replace(/s$/, '');
  if (scope && stem && !t.toLowerCase().includes(stem)) {
    t = `${scope.charAt(0).toUpperCase() + scope.slice(1)}: ${t}`;
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function classifyCommit(c: CommitFacts): ClassifiedCommit {
  const m = CONVENTIONAL.exec(c.subject.trim());
  const type = m?.[1] ?? null;
  const scope = (m?.[3] ?? '').toLowerCase();
  const rest = (m?.[4] ?? c.subject).trim();
  const lower = `${scope} ${rest}`.toLowerCase();
  // The scope prefix is only context the subject lacks — a subject that already names a
  // system (any keyword hit on its own) self-describes and stays untouched.
  const scopeCtx = byKeywords(rest.toLowerCase()) ? '' : scope;

  // Vague subjects are unusable — keep them internal and demand a human pass.
  if (VAGUE.test(rest) || rest.length < 8) {
    return { cat: byPaths(c.files) ?? 'Framework', text: playerText(rest, scopeCtx), internal: true, needsReview: true };
  }

  // Type is the strongest signal where it maps 1:1.
  if (type === 'fix') return { cat: 'Bug Fixes', text: playerText(rest, scopeCtx), internal: false, needsReview: false };
  if (type === 'perf') return { cat: 'Performance', text: playerText(rest, scopeCtx), internal: false, needsReview: false };
  if (type === 'balance') return { cat: 'Balance', text: playerText(rest, scopeCtx), internal: false, needsReview: false };
  if (type === 'docs' || type === 'test' || type === 'ci' || type === 'build' || type === 'style') {
    return { cat: 'Developer Tools', text: playerText(rest, scopeCtx), internal: true, needsReview: false };
  }

  const cat = byKeywords(lower) ?? byPaths(c.files);
  const internal = type === 'chore' || type === 'refactor' || onlyInternalPaths(c.files);
  if (cat) return { cat, text: playerText(rest, scopeCtx), internal, needsReview: false };

  // Nothing decided the category — record it, but don't put a guess in front of players.
  return { cat: 'Framework', text: playerText(rest, scopeCtx), internal: true, needsReview: !type };
}
