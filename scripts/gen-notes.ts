// CHRONICLE generator (docs/CHANGELOG-PIPELINE.md) — the one command that turns git
// history into documentation:
//
//   npm run notes            process new commits since the ledger's lastSha
//   npm run notes -- --seal  close the open release (next commits start a fresh one)
//
// Per run it:
//   1. reads changelog/ledger.json (committed machine state: lastSha, id lists, releases)
//   2. classifies every new commit (src/changelog/classify.ts — pure, unit-tested)
//   3. diffs the live content registries against the ledger → "New tower: X" majors
//   4. appends to the open (unsealed) release, keyed by commit date
//   5. regenerates every derived artifact:
//        src/changelog/releases.gen.ts → the in-game Update Briefing data
//        site/patchnotes.json          → the website /news/ data (npm run site renders it)
//        docs/HISTORY.md               → full internal chronological history
//        docs/devlog/DRAFT-*.md        → dev-blog draft every ≥10 commits or merge
//   6. writes the ledger back (lastSha = HEAD)
//
// Everything it writes is COMMITTED — deploys stay deterministic, drafts are editable
// before release, and no CI hook is required. Run it before pushing a work batch
// (pairs with `npm run handoff`).

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyCommit } from '../src/changelog/classify';
import type { Release, ReleaseEntry } from '../src/changelog/types';
import { TOWER_ORDER, HERO_ORDER, ENEMY_KINDS, HERO_DEFS, TOWER_DEFS, ENEMY_DEFS, biomeRegistry } from '../src/core/config';
import { bossRegistry } from '../src/core/boss';
import { megaBossRegistry } from '../src/core/megaboss';
import { ACHIEVEMENTS } from '../src/state/achievements';
import { SYSTEMS } from '../src/dev/systemRegistry';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = resolve(ROOT, 'changelog/ledger.json');
const git = (cmd: string): string => execSync(`git ${cmd}`, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();

// ── Ledger shapes ────────────────────────────────────────────────────────────
interface HistoryRow { sha: string; date: string; cat: string; text: string; internal: boolean; needsReview: boolean }
interface Ledger {
  lastSha: string;
  commitsSinceDraft: number;
  /** Known content ids per lane — diffed each run to detect major additions. */
  content: Record<string, string[]>;
  releases: Release[]; // oldest → newest
  history: HistoryRow[]; // every processed commit, chronological
}

/** The live content inventory: lane → id → display name. New ids become highlights. */
function contentInventory(): Record<string, Map<string, string>> {
  return {
    tower: new Map(TOWER_ORDER.map((k) => [k, TOWER_DEFS[k].name])),
    hero: new Map(HERO_ORDER.map((k) => [k, HERO_DEFS[k].name])),
    enemy: new Map(ENEMY_KINDS.map((k) => [k, ENEMY_DEFS[k].name])),
    boss: new Map(bossRegistry.active().map((d) => [d.id, d.name])),
    megaBoss: new Map(megaBossRegistry.active().map((d) => [d.id, d.name])),
    biome: new Map(biomeRegistry.active().map((d) => [d.id, d.name])),
    achievement: new Map(ACHIEVEMENTS.map((a) => [a.id, a.name])),
    system: new Map(SYSTEMS.map((s) => [s.id, s.name])),
  };
}

const LANE_LABEL: Record<string, { label: string; cat: ReleaseEntry['cat'] }> = {
  tower: { label: 'New tower', cat: 'Towers' },
  hero: { label: 'New hero', cat: 'Heroes' },
  enemy: { label: 'New enemy', cat: 'Enemies' },
  boss: { label: 'New boss', cat: 'Bosses' },
  megaBoss: { label: 'New Mega Boss', cat: 'Mega Bosses' },
  biome: { label: 'New biome', cat: 'Gameplay' },
  achievement: { label: 'New achievement', cat: 'Gameplay' },
  system: { label: 'New system', cat: 'Gameplay' },
};

// ── Git reading ──────────────────────────────────────────────────────────────
interface RawCommit { sha: string; parents: string[]; date: string; subject: string; body: string; files: string[] }

function commitsSince(lastSha: string): RawCommit[] {
  const range = lastSha ? `${lastSha}..HEAD` : 'HEAD';
  const shas = git(`rev-list --reverse ${range}`).trim().split('\n').filter(Boolean);
  return shas.map((sha) => {
    const meta = git(`show -s --format=%P%x1f%cs%x1f%s%x1f%b ${sha}`).split('\x1f');
    const files = git(`show --name-only --format= ${sha}`).trim().split('\n').filter(Boolean);
    return { sha, parents: (meta[0] ?? '').trim().split(' ').filter(Boolean), date: meta[1] ?? '', subject: (meta[2] ?? '').trim(), body: (meta[3] ?? '').trim(), files };
  });
}

// ── Release assembly ─────────────────────────────────────────────────────────
function openRelease(ledger: Ledger, date: string): Release {
  const last = ledger.releases[ledger.releases.length - 1];
  if (last && !last.sealed) {
    // AUTO-SEAL BY DATE (docs/CHANGELOG-PIPELINE.md §releases): an open release only absorbs
    // commits from its own calendar day — the first commit of a NEWER day seals it and opens a
    // fresh date-keyed release, so the site's "latest patch" header rolls forward without
    // anyone remembering `--seal` (which still works for deliberate mid-day cuts). Same-day
    // commits keep appending, exactly as before.
    if (last.date === date) return last;
    last.sealed = true;
    console.log(`Auto-sealed ${last.id} (${last.entries.length} entries) — new work is dated ${date}.`);
  }
  const sameDay = ledger.releases.filter((r) => r.date === date).length;
  const rel: Release = {
    id: `v${date.replaceAll('-', '.')}${sameDay > 0 ? `.${sameDay + 1}` : ''}`,
    date, title: 'Update', sealed: false, entries: [],
  };
  ledger.releases.push(rel);
  return rel;
}

function dedupe(entries: ReleaseEntry[]): ReleaseEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => { const k = `${e.cat}|${e.text}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// ── Derived artifacts ────────────────────────────────────────────────────────
function writeReleasesModule(releases: Release[]): void {
  const newestFirst = [...releases].reverse();
  const body = `// GENERATED by scripts/gen-notes.ts (docs/CHANGELOG-PIPELINE.md) — do not edit by hand;
// edit changelog/ledger.json (titles/entries of the UNSEALED release) and re-run \`npm run notes\`.
import type { Release } from './types';

/** Player-facing releases, newest first. */
export const RELEASES: Release[] = ${JSON.stringify(newestFirst, null, 2)};
`;
  writeFileSync(resolve(ROOT, 'src/changelog/releases.gen.ts'), body);
}

/** Project releases into the site's PatchEntry shape (site/build.ts loadPatchNotes) —
 *  the /news/ page and the Home "latest patch" card render from this on npm run site. */
function writeSiteData(releases: Release[]): void {
  const newestFirst = [...releases].reverse();
  const entries = newestFirst.map((r) => ({
    date: r.date,
    title: r.title,
    categories: [...new Set(r.entries.map((e) => e.cat))],
    items: r.entries.map((e) => ({ cat: e.cat, text: `${e.major ? '★ ' : ''}${e.text}` })),
  }));
  writeFileSync(resolve(ROOT, 'site/patchnotes.json'), JSON.stringify(entries, null, 2) + '\n');
}

function writeHistory(ledger: Ledger): void {
  const lines: string[] = [
    '# HISTORY.md — internal chronological project history',
    '',
    '> GENERATED by `npm run notes` (docs/CHANGELOG-PIPELINE.md). Every processed commit,',
    '> including internal/docs/tooling work players never see. ⚑ = flagged: the commit',
    '> message was too vague to auto-publish — rewrite it in changelog/ledger.json.',
    '',
  ];
  let day = '';
  for (const h of ledger.history) {
    if (h.date !== day) { day = h.date; lines.push(`## ${day}`, ''); }
    lines.push(`- ${h.needsReview ? '⚑ ' : ''}\`${h.sha.slice(0, 7)}\` **[${h.cat}]** ${h.text}${h.internal ? ' _(internal)_' : ''}`);
  }
  writeFileSync(resolve(ROOT, 'docs/HISTORY.md'), lines.join('\n') + '\n');
}

function writeDevlogDraft(ledger: Ledger, rows: HistoryRow[], date: string): string {
  const dir = resolve(ROOT, 'docs/devlog');
  mkdirSync(dir, { recursive: true });
  const pick = (cats: string[]): HistoryRow[] => rows.filter((r) => cats.includes(r.cat) && !r.needsReview);
  const bullet = (rs: HistoryRow[]): string => (rs.length ? rs.map((r) => `- ${r.text}`).join('\n') : '- _nothing this cycle_');
  const flagged = rows.filter((r) => r.needsReview);
  const md = `# DEVLOG DRAFT — ${date}

> GENERATED by \`npm run notes\` — a DRAFT pending human approval. Edit freely, then
> publish by appending an <article> to public/welcome/news.html (see
> docs/CHANGELOG-PIPELINE.md §devlog). Delete this file once published or discarded.

## Feature overview
${bullet(pick(['Gameplay', 'Heroes', 'Towers', 'Gene Cards', 'Enemies', 'Bosses', 'Mega Bosses']))}

## Developer summary
${bullet(pick(['Framework', 'Developer Tools', 'Backend', 'Website']))}

## Interesting engineering work
${bullet(pick(['Performance', 'Optimization', 'Security']))}

## Screenshots
<!-- PLACEHOLDER: capture fresh shots/gifs of the features above before publishing
     (recipe: docs/AI_HANDOFF.md — staged Hi-DPI captures). -->

## Balance commentary
${bullet(pick(['Balance']))}

## Known issues
${flagged.length ? flagged.map((r) => `- ⚑ unreviewed change: ${r.text} (\`${r.sha.slice(0, 7)}\`)`).join('\n') : '- _none flagged_'}

## Future plans
<!-- PLACEHOLDER: one or two sentences on what's next. -->
`;
  const path = resolve(dir, `DRAFT-${date}.md`);
  writeFileSync(path, md);
  return path;
}

// ── Main ─────────────────────────────────────────────────────────────────────
function main(): void {
  const seal = process.argv.includes('--seal');
  const head = git('rev-parse HEAD').trim();

  if (!existsSync(LEDGER)) {
    // First run: baseline at HEAD — history starts accruing from the NEXT commit.
    mkdirSync(dirname(LEDGER), { recursive: true });
    const content: Record<string, string[]> = {};
    for (const [lane, map] of Object.entries(contentInventory())) content[lane] = [...map.keys()];
    const ledger: Ledger = { lastSha: head, commitsSinceDraft: 0, content, releases: [], history: [] };
    writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
    writeReleasesModule([]);
    writeSiteData([]);
    writeHistory(ledger);
    console.log(`Chronicle initialized at ${head.slice(0, 7)} — content inventory snapshotted; notes accrue from the next commit.`);
    return;
  }

  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;
  const commits = commitsSince(ledger.lastSha);
  let mergeToMain = false;
  const newRows: HistoryRow[] = [];

  for (const c of commits) {
    if (c.parents.length > 1) {
      mergeToMain = mergeToMain || /merge (pull request|branch)/i.test(c.subject);
      continue; // merge commits carry no work of their own
    }
    const cls = classifyCommit({ subject: c.subject, body: c.body, files: c.files });
    const row: HistoryRow = { sha: c.sha, date: c.date, ...cls };
    newRows.push(row);
    ledger.history.push(row);
    if (!cls.internal && !cls.needsReview) {
      const rel = openRelease(ledger, c.date);
      rel.entries = dedupe([...rel.entries, { cat: cls.cat, text: cls.text }]);
    }
  }

  // Content-scale detection: anything new in the LIVE registries becomes a highlight —
  // even without fresh commits (in-progress content lands on the open release).
  const today = new Date().toISOString().slice(0, 10);
  const batchDate = commits.length > 0 ? commits[commits.length - 1].date : today;
  const inventory = contentInventory();
  for (const [lane, map] of Object.entries(inventory)) {
    const known = new Set(ledger.content[lane] ?? []);
    const fresh = [...map.entries()].filter(([id]) => !known.has(id));
    if (fresh.length > 0) {
      const rel = openRelease(ledger, batchDate);
      const { label, cat } = LANE_LABEL[lane];
      for (const [, name] of fresh) rel.entries = dedupe([{ cat, text: `${label}: ${name}`, major: true }, ...rel.entries]);
    }
    ledger.content[lane] = [...map.keys()];
  }

  // Devlog cadence: a draft every ≥10 commits, or on a merge into main.
  ledger.commitsSinceDraft += newRows.length;
  let draftPath: string | null = null;
  if ((ledger.commitsSinceDraft >= 10 || mergeToMain) && newRows.length > 0) {
    const windowRows = ledger.history.slice(-ledger.commitsSinceDraft);
    draftPath = writeDevlogDraft(ledger, windowRows, commits[commits.length - 1].date);
    ledger.commitsSinceDraft = 0;
  }

  if (seal) {
    const last = ledger.releases[ledger.releases.length - 1];
    if (last && !last.sealed) { last.sealed = true; console.log(`Sealed ${last.id} (${last.entries.length} entries).`); }
  }

  ledger.lastSha = head;
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
  writeReleasesModule(ledger.releases);
  writeSiteData(ledger.releases);
  writeHistory(ledger);

  const open = ledger.releases[ledger.releases.length - 1];
  console.log(`Processed ${commits.length} commit(s) → ${newRows.length} history row(s).`);
  if (open) console.log(`Open release ${open.id}: ${open.entries.length} player-facing entr${open.entries.length === 1 ? 'y' : 'ies'}${open.sealed ? ' (sealed)' : ''}.`);
  const flagged = newRows.filter((r) => r.needsReview).length;
  if (flagged) console.log(`⚑ ${flagged} commit(s) flagged for review — see docs/HISTORY.md.`);
  if (draftPath) console.log(`Dev-blog draft written: ${draftPath.replace(ROOT + '/', '')}`);
}

main();
