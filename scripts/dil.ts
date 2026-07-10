// DIL CLI (docs/DIL.md §queries) — the Design Intelligence Layer's query surface. THIS replaces
// repository-wide searching for comprehension questions:
//
//   npm run dil -- node system:towers          # a node + every relationship, both directions
//   npm run dil -- affects concept:power-score # transitive downstream impact ("what breaks?")
//   npm run dil -- requires system:daily       # transitive upstream requirements
//   npm run dil -- who tests system:mulligans  # who <edge>s this? (tests/documents/teaches/…)
//   npm run dil -- missing system tests        # gap query: nodes of kind lacking an incoming edge
//   npm run dil -- checklist tower spitfang    # live feature-completion probes
//   npm run dil -- find siphon                 # substring search over ids/names/summaries
//   npm run dil -- regen                       # rewrite docs/DIL_GRAPH.md (drift-tested)

import { writeFileSync } from 'node:fs';
import { buildDil } from '../src/dev/dil/nodes';
import { buildDilDoc } from '../src/dev/dil/dilDoc';
import { checklistFor } from '../src/dev/dil/checklists';
import type { ChecklistKind } from '../src/dev/dil/checklists';
import type { EdgeKind, NodeKind } from '../src/dev/dil/graph';

const [cmd, a, b] = process.argv.slice(2).filter((x) => x !== '--');
const g = buildDil();

function printNode(id: string): void {
  const n = g.node(id);
  if (!n) { console.error(`no node '${id}' — try: npm run dil -- find ${id.split(':').pop()}`); process.exit(1); }
  console.log(`${n.id} [${n.kind}] — ${n.name}\n  ${n.summary}${n.at ? `\n  at: ${n.at}` : ''}\n`);
  for (const e of g.edgesOf(id)) console.log(`  ${e.direction === 'out' ? '→' : '←'} ${e.kind.padEnd(14)} ${e.other}${e.note ? `   (${e.note})` : ''}`);
}

switch (cmd) {
  case 'node': printNode(a); break;
  case 'affects': {
    console.log(`Everything affected by changing ${a} (depth-first, structural edges):\n`);
    for (const r of g.affects(a)) console.log(`  ${'  '.repeat(r.depth - 1)}${r.node.id}  (${r.via})`);
    break;
  }
  case 'requires': {
    console.log(`Everything ${a} is built on:\n`);
    for (const r of g.requires(a)) console.log(`  ${'  '.repeat(r.depth - 1)}${r.node.id}  (${r.via})`);
    break;
  }
  case 'who': {
    for (const n of g.who(a as EdgeKind, b)) console.log(`  ${n.id} — ${n.name}`);
    break;
  }
  case 'missing': {
    for (const n of g.missing(a as NodeKind, b as EdgeKind)) console.log(`  ${n.id} — ${n.name}`);
    break;
  }
  case 'checklist': {
    for (const c of checklistFor(a as ChecklistKind, b)) {
      const mark = c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : '□';
      console.log(`  ${mark} ${c.item}${c.detail ? `   (${c.detail})` : ''}`);
    }
    break;
  }
  case 'find': {
    for (const n of g.find(a)) console.log(`  ${n.id} [${n.kind}] — ${n.name}`);
    break;
  }
  case 'regen': {
    writeFileSync('docs/DIL_GRAPH.md', buildDilDoc());
    const { nodes, edges } = g.size();
    console.log(`dil: docs/DIL_GRAPH.md regenerated (${nodes} nodes, ${edges} edges)`);
    break;
  }
  default: {
    const { nodes, edges } = g.size();
    console.log(`Design Intelligence Layer — ${nodes} nodes, ${edges} edges.\nCommands: node <id> | affects <id> | requires <id> | who <edge> <id> | missing <kind> <edge> | checklist <tower|hero|enemy> <id> | find <text> | regen`);
  }
}
