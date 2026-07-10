// PIL CLI (docs/PIL.md) — the Public Intelligence Layer's query + report surface.
//   npm run pil -- impact <dilNodeId>   which public pages/assets need updating if <node> changes
//   npm run pil -- audit                structural rot scan (exit 1 on findings)
//   npm run pil -- staleness            advisory: pages whose referenced systems moved since review
//   npm run pil -- regen                rewrite docs/PIL_REPORT.md (audit + staleness + inventory)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { allMediaAssets, allPublicPages, auditPublic, buildPil, publicImpact, stalenessReport } from '../src/dev/pil/pil';
import { DESCRIPTION_LONG, FEATURE_BULLETS, GAME_NAME, SEO_KEYWORDS, SHORT_DESC, STORE_TARGETS, TAGLINE } from '../src/dev/pil/storeCopy';

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
} else if (cmd === 'release') {
  // STORE BUNDLES (docs/PIL.md §stores): the latest Chronicle release (site/patchnotes.json)
  // + the canonical store copy → one reviewed .md per storefront. Written ONCE, emitted
  // everywhere; character caps enforced per store so a paste can never be rejected.
  interface Patch { date: string; title: string; items: { cat: string; text: string }[] }
  const latest = (JSON.parse(readFileSync('site/patchnotes.json', 'utf-8')) as Patch[])[0];
  const shots = allMediaAssets().filter((a) => a.kind === 'screenshot');
  mkdirSync('store', { recursive: true });
  for (const t of STORE_TARGETS) {
    const whatsNewFull = `${latest.title} (${latest.date})\n` + latest.items.map((i) => `• [${i.cat}] ${i.text}`).join('\n');
    const whatsNew = whatsNewFull.length > t.whatsNewMax ? `${whatsNewFull.slice(0, t.whatsNewMax - 1)}…` : whatsNewFull;
    const shortDesc = SHORT_DESC[t.id];
    if (shortDesc.length > t.shortDescMax) {
      console.error(`pil release: ${t.label} short description exceeds ${t.shortDescMax} chars (${shortDesc.length}) — fix src/dev/pil/storeCopy.ts`);
      process.exit(1);
    }
    const L = [
      `# ${GAME_NAME} — ${t.label} listing (GENERATED — 'npm run pil -- release'; edit src/dev/pil/storeCopy.ts)`,
      '',
      `## Tagline`, TAGLINE, '',
      `## Short description (${shortDesc.length}/${t.shortDescMax})`, shortDesc, '',
      '## Long description', DESCRIPTION_LONG, '',
      '## Feature bullets', ...FEATURE_BULLETS.map((b) => `- ${b}`), '',
      `## What's new (${whatsNew.length}/${t.whatsNewMax})`, '```', whatsNew, '```', '',
      '## SEO / store keywords', SEO_KEYWORDS.join(', '), '',
      '## Screenshot checklist (from the PIL media manifest)',
      ...(shots.length ? shots.map((s) => `- [${s.status === 'current' ? 'x' : ' '}] ${s.path} (captured ${s.capturedAt})`) : ['- [ ] capture gameplay screenshots into public/media/shots/ (they auto-join the manifest)']),
      '',
    ];
    writeFileSync(`store/${t.id}.md`, L.join('\n'));
  }
  console.log(`pil release: store/{${STORE_TARGETS.map((t) => t.id).join(',')}}.md regenerated from '${latest.title}' + storeCopy.ts`);
} else if (cmd === 'regen') {
  regen();
} else {
  console.log('usage: npm run pil -- impact <nodeId> | audit | staleness | release | regen');
}
