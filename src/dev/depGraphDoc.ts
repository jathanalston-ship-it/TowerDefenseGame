// Builds docs/DEPENDENCY_GRAPH.md from the system registry — ONE deterministic string, shared by
// the generator script (scripts/gen-depgraph.ts writes it) and the freshness test (fails when the
// committed file drifts from the registry: run `npm run docs:graph`).

import { SYSTEMS, consumersOf, impactOf } from './systemRegistry';

const list = (xs: string[]): string => (xs.length ? xs.map((x) => `\`${x}\``).join(' · ') : '—');

export function buildDependencyGraphDoc(): string {
  const out: string[] = [];
  out.push('# DEPENDENCY_GRAPH.md — "what breaks if I change this?"');
  out.push('');
  out.push('> **GENERATED — do not edit by hand.** Source of truth: `src/dev/systemRegistry.ts`.');
  out.push('> Regenerate with `npm run docs:graph`; a test fails when this file is stale.');
  out.push('> Read this BEFORE implementing a major feature: find your system, check its CONSUMERS');
  out.push('> (they break first), then walk the impact table (docs / UI / help / tutorial / save).');
  out.push('');
  out.push('## The graph (A → B means "A depends on B")');
  out.push('');
  out.push('```mermaid');
  out.push('graph TD');
  for (const s of SYSTEMS) {
    for (const d of s.dependsOn) out.push(`  ${s.id.replace(/-/g, '_')} --> ${d.replace(/-/g, '_')}`);
  }
  out.push('```');
  out.push('');
  out.push('## Impact index');
  out.push('');
  out.push('| System | Depends on | Consumers (break first) | Power Score | Save fields | Docs |');
  out.push('|---|---|---|---|---|---|');
  for (const s of SYSTEMS) {
    const consumers = consumersOf(s.id).map((c) => c.id);
    out.push(`| **${s.name}** (\`${s.id}\`) | ${list(s.dependsOn)} | ${list(consumers)} | ${s.powerScore ? '⚡ ' + s.powerScore : '—'} | ${list(s.save)} | ${list(s.docs)} |`);
  }
  out.push('');
  out.push('## Per-system detail — the full blast radius');
  for (const s of SYSTEMS) {
    const imp = impactOf(s.id);
    out.push('');
    out.push(`### ${s.name} (\`${s.id}\`)`);
    out.push('');
    out.push(`*${s.purpose}*`);
    out.push('');
    out.push(`- **Files:** ${list(s.files)}`);
    out.push(`- **Depends on:** ${list(s.dependsOn)}`);
    out.push(`- **Consumers — what breaks if you change this:** ${list(imp.consumers.map((c) => c.id))}`);
    out.push(`- **Power Score:** ${s.powerScore ?? '— (intentionally none)'}`);
    out.push(`- **Save fields:** ${list(s.save)}`);
    out.push(`- **Tutorial:** ${list(s.tutorial)} · **Help mechanics:** ${list(s.help)}`);
    out.push(`- **HUD surfaces:** ${list(s.hud)} · **UI screens:** ${list(s.ui)}`);
    out.push(`- **Collection:** ${s.collection ?? '—'} · **Achievements:** ${list(s.achievements)}`);
    out.push(`- **Localization:** ${s.localization === 'inline-en' ? 'inline English strings (no i18n layer yet — this field enumerates the surface for the day it lands)' : 'no player-facing strings'}`);
    out.push(`- **Docs to update on change:** ${list(imp.docsToUpdate)}`);
  }
  out.push('');
  out.push('---');
  out.push('*Maintained automatically: edit `src/dev/systemRegistry.ts`, run `npm run docs:graph`,');
  out.push('and the enforcement tests (`src/dev/systemRegistry.test.ts`) keep every reference real.*');
  out.push('');
  return out.join('\n');
}
