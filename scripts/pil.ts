// PIL CLI (docs/PIL.md) — the Public Intelligence Layer's query + report surface.
//   npm run pil -- impact <dilNodeId>   which public pages/assets need updating if <node> changes
//   npm run pil -- audit                structural rot scan (exit 1 on findings)
//   npm run pil -- staleness            advisory: pages whose referenced systems moved since review
//   npm run pil -- regen                rewrite docs/PIL_REPORT.md (audit + staleness + inventory)

import { writeFileSync } from 'node:fs';
import { allMediaAssets, allPublicPages, auditPublic, buildPil, publicImpact, stalenessReport } from '../src/dev/pil/pil';

const [cmd, arg] = process.argv.slice(2).filter((a) => a !== '--');

function regen(): void {
  const pages = allPublicPages();
  const assets = allMediaAssets();
  const findings = auditPublic();
  const stale = stalenessReport();
  const L: string[] = [];
  L.push('# PIL_REPORT.md — Public Intelligence Layer report (GENERATED — `npm run pil -- regen`)');
  L.push('');
  L.push(`> The public-facing sync ledger (docs/PIL.md): ${pages.length} pages · ${assets.length} assets tracked against the DIL.`);
  L.push('');
  L.push(`## Structural audit — ${findings.length === 0 ? '✅ clean' : `❌ ${findings.length} finding(s)`}`);
  for (const f of findings) L.push(`- **${f.kind}** \`${f.page}\` — ${f.detail}`);
  L.push('');
  L.push(`## Staleness (advisory) — ${stale.length} page/ref pair(s) to re-review`);
  for (const s of stale.slice(0, 40)) L.push(`- \`${s.page}\` references **${s.ref}** whose source changed ${s.sourceChanged}`);
  L.push('');
  L.push('## Page inventory');
  for (const p of pages) L.push(`- \`/${p.path.replace(/index\.html$/, '')}\` — ${p.title} → ${p.references.join(', ') || '(static)'}`);
  L.push('');
  L.push('## Media inventory');
  for (const a of assets) L.push(`- \`${a.path}\` — ${a.kind} · ${a.status} · captured ${a.capturedAt}${a.depicts.length ? ` · depicts ${a.depicts.join(', ')}` : ''}`);
  L.push('');
  writeFileSync('docs/PIL_REPORT.md', L.join('\n'));
  console.log(`pil: docs/PIL_REPORT.md regenerated (${pages.length} pages, ${assets.length} assets, ${findings.length} structural finding(s), ${stale.length} stale pair(s))`);
}

if (cmd === 'impact' && arg) {
  const g = buildPil();
  if (!g.node(arg)) {
    console.error(`pil: unknown DIL node '${arg}' (try: npm run dil -- find <text>)`);
    process.exit(1);
  }
  const { pages, assets } = publicImpact(g, arg);
  console.log(`pil impact ${arg}:`);
  console.log(`  pages needing review: ${pages.length ? pages.join(', ') : '(none)'}`);
  console.log(`  assets to re-capture: ${assets.length ? assets.join(', ') : '(none)'}`);
} else if (cmd === 'audit') {
  const findings = auditPublic();
  if (findings.length === 0) {
    console.log('pil audit: CLEAN — no unregistered pages, ghost references, broken links, placeholders, or missing assets.');
  } else {
    console.error(`pil audit: ${findings.length} finding(s)`);
    for (const f of findings) console.error(`  ✗ [${f.kind}] ${f.page} — ${f.detail}`);
    process.exit(1);
  }
} else if (cmd === 'staleness') {
  for (const s of stalenessReport()) console.log(`  ~ ${s.page} ← ${s.ref} (source changed ${s.sourceChanged})`);
} else if (cmd === 'regen') {
  regen();
} else {
  console.log('usage: npm run pil -- impact <nodeId> | audit | staleness | regen');
}
