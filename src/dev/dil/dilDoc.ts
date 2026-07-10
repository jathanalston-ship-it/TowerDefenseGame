// DIL DOC GENERATOR (docs/DIL.md §artifacts) — renders the living graph into docs/DIL_GRAPH.md:
// stats, the domain indexes, mermaid architecture maps, the gap report, and the full node
// directory with BIDIRECTIONAL edges. Committed + drift-tested (the docs:graph pattern), so the
// written brain can never lag the built one. Humans skim the doc; agents query the CLI.

import { buildDil } from './nodes';
import { DilGraph, EDGE_INVERSE } from './graph';
import type { DilNode, NodeKind } from './graph';
import { allAutoFailures } from './checklists';

const KIND_ORDER: NodeKind[] = ['concept', 'currency', 'system', 'mode', 'tower', 'hero', 'enemy', 'boss', 'megaboss', 'biome', 'music', 'tutorial', 'help', 'guide', 'achievement', 'doc', 'test'];
const KIND_LABEL: Record<NodeKind, string> = {
  concept: 'Concepts', currency: 'Currencies', system: 'Systems', mode: 'Modes', tower: 'Towers', hero: 'Heroes',
  enemy: 'Enemies', boss: 'Bosses', megaboss: 'Mega Bosses', biome: 'Biomes', music: 'Music', tutorial: 'Tutorials',
  help: 'Help Topics', guide: 'Site Guides', achievement: 'Achievements', doc: 'Documentation', test: 'Tests',
};

/** The domain INDEXES — each is just a query over the graph (nodes referenced, never duplicated). */
function indexes(g: DilGraph): string {
  const idx: [string, DilNode[]][] = [
    ['Gameplay Index', [...g.byKind('tower'), ...g.byKind('hero'), ...g.byKind('enemy'), ...g.byKind('boss'), ...g.byKind('megaboss'), ...g.byKind('biome')]],
    ['Progression Index', g.allNodes().filter((n) => g.edgesOf(n.id).some((e) => e.kind === 'gates' || e.kind === 'gatedBy' || e.other === 'concept:progression-gates'))],
    ['Economy / Reward Index', [...g.byKind('currency'), ...g.allNodes().filter((n) => g.edgesOf(n.id).some((e) => e.kind === 'rewards'))]],
    ['Power Score Index', g.who('provides', 'concept:power-score')],
    ['Audio Index', [...g.byKind('music'), ...g.who('tests', 'system:audio').slice(0, 0), ...g.allNodes().filter((n) => n.kind === 'system' && g.edgesOf(n.id).some((e) => e.other === 'system:audio'))]],
    ['Teaching Index', [...g.byKind('tutorial'), ...g.byKind('help'), ...g.byKind('guide')]],
    ['Testing Index', g.byKind('system').filter((s) => g.who('tests', s.id).length > 0)],
    ['Developer Tooling Index', g.allNodes().filter((n) => n.id === 'system:devtools' || n.id === 'system:dev-registry' || n.id === 'system:website')],
  ];
  return idx.map(([title, nodes]) => {
    const uniq = [...new Map(nodes.map((n) => [n.id, n])).values()];
    return `### ${title}\n\n${uniq.slice(0, 60).map((n) => `\`${n.id}\``).join(' · ')}${uniq.length > 60 ? ` · …${uniq.length - 60} more` : ''}`;
  }).join('\n\n');
}

/** Mermaid maps for the domains people actually whiteboard. */
function maps(g: DilGraph): string {
  const mk = (title: string, ids: string[], kinds: string[]): string => {
    const set = new Set(ids);
    const lines: string[] = [];
    for (const e of g.edges) {
      if (!set.has(e.from) || !set.has(e.to) || !kinds.includes(e.kind)) continue;
      lines.push(`  ${e.from.replace(/[:-]/g, '_')}["${g.node(e.from)!.name}"] -->|${e.kind}| ${e.to.replace(/[:-]/g, '_')}["${g.node(e.to)!.name}"]`);
    }
    return `### ${title}\n\n\`\`\`mermaid\ngraph LR\n${[...new Set(lines)].join('\n')}\n\`\`\``;
  };
  const systems = g.byKind('system').map((n) => n.id);
  const econ = [...g.byKind('currency').map((n) => n.id), ...systems];
  return [
    mk('Economy & Rewards Map', econ, ['rewards', 'consumes', 'modifies']),
    mk('Power Score Map', ['concept:power-score', ...systems], ['provides', 'displays']),
    mk('Determinism Map', ['concept:determinism', 'concept:replays', 'concept:daily-seed', 'concept:golden-test', ...systems], ['dependsOn', 'consumes', 'provides', 'tests']),
    mk('Presentation Couplings Map', systems.concat(['concept:power-score']), ['visualizes', 'modifies', 'triggers']),
  ].join('\n\n');
}

/** The gap report — the graph's own to-do radar (missing docs/tests + checklist failures). */
function gaps(g: DilGraph): string {
  const rows: string[] = [];
  const undocumented = g.missing('system', 'documents');
  if (undocumented.length) rows.push(`- **Systems with no doc:** ${undocumented.map((n) => `\`${n.id}\``).join(', ')}`);
  const untested = g.missing('system', 'tests');
  if (untested.length) rows.push(`- **Systems with no test:** ${untested.map((n) => `\`${n.id}\``).join(', ')}`);
  const unloved = g.byKind('doc').filter((d) => g.edgesOf(d.id).length === 0);
  if (unloved.length) rows.push(`- **Docs referenced by no system (review for retirement):** ${unloved.slice(0, 20).map((n) => `\`${n.name}\``).join(', ')}${unloved.length > 20 ? ` · …${unloved.length - 20} more` : ''}`);
  const fails = allAutoFailures();
  if (fails.length) rows.push(`- **Checklist FAILURES (shipped content missing integration):** ${fails.map((f) => `${f.kind}:${f.id} → ${f.item}`).join('; ')}`);
  return rows.length ? rows.join('\n') : '_No structural gaps detected — every system documented + tested, every shipped entity passes its auto checklist._';
}

export function buildDilDoc(): string {
  const g = buildDil();
  const { nodes, edges } = g.size();
  const problems = g.validate();

  const directory = KIND_ORDER.map((kind) => {
    const list = g.byKind(kind);
    if (list.length === 0) return '';
    // Docs + tests get a compact one-line treatment (they're leaves); everything else is full.
    if (kind === 'doc' || kind === 'test' || kind === 'achievement' || kind === 'help' || kind === 'enemy') {
      return `## ${KIND_LABEL[kind]} (${list.length})\n\n${list.map((n) => {
        const rel = g.edgesOf(n.id).filter((e) => e.direction === 'out').map((e) => `${e.kind} \`${e.other}\``).slice(0, 3).join(', ');
        return `- \`${n.id}\` — ${n.summary}${rel ? ` _(${rel})_` : ''}`;
      }).join('\n')}`;
    }
    return `## ${KIND_LABEL[kind]} (${list.length})\n\n${list.map((n) => {
      const views = g.edgesOf(n.id);
      const out = views.filter((e) => e.direction === 'out').map((e) => `  - ${e.kind} → \`${e.other}\`${e.note ? ` — ${e.note}` : ''}`);
      const inc = views.filter((e) => e.direction === 'in').map((e) => `  - ${e.kind} ← \`${e.other}\`${e.note ? ` — ${e.note}` : ''}`);
      // Cap incoming lists (a currency can have 40 enemies rewarding it) — the CLI has the full set.
      const incShown = inc.length > 12 ? [...inc.slice(0, 12), `  - _…${inc.length - 12} more (query: \`npm run dil -- node ${n.id}\`)_`] : inc;
      return `### \`${n.id}\` — ${n.name}\n\n${n.summary}${n.at ? `\n\n_at: ${n.at}_` : ''}\n\n${[...out, ...incShown].join('\n') || '_no edges_'}`;
    }).join('\n\n')}`;
  }).filter(Boolean).join('\n\n');

  return `# DIL_GRAPH.md — the Design Intelligence Layer (GENERATED — \`npm run dil -- regen\`)

> **The project's brain** (docs/DIL.md). ${nodes} nodes · ${edges} edges, built from the live
> registries + curated knowledge (src/dev/dil/). **Query it instead of searching the repo:**
> \`npm run dil -- node <id>\` · \`affects <id>\` · \`requires <id>\` · \`missing <kind> <edge>\` ·
> \`checklist tower <kind>\` · \`find <text>\`. Edge kinds are bidirectional (${Object.keys(EDGE_INVERSE).length} kinds).
${problems.length ? `\n> ⚠ INTEGRITY: ${problems.join('; ')}\n` : ''}
## Gap report (the graph's own radar)

${gaps(g)}

## Indexes

${indexes(g)}

## Architecture maps

${maps(g)}

${directory}
`;
}
