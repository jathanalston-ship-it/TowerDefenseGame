// PIL enforcement (docs/PIL.md) — public surfaces can never structurally rot:
// every real page registered, every reference resolves into the DIL, every internal
// link lands, every manifest asset exists, and the committed report stays fresh.
// Staleness (game moved since a page's review) is ADVISORY (the report), not a failure.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { allMediaAssets, allPublicPages, auditPublic, buildPil, publicImpact } from './pil';
import { SHORT_DESC, STORE_TARGETS } from './storeCopy';

describe('PIL — the public knowledge graph', () => {
  it('structural audit is clean (unregistered pages / ghost refs / broken links / placeholders / missing assets)', () => {
    const findings = auditPublic();
    expect(findings.map((f) => `[${f.kind}] ${f.page} — ${f.detail}`)).toEqual([]);
  });

  it('every page and asset joins the graph with resolving edges', () => {
    const g = buildPil();
    for (const p of allPublicPages()) {
      expect(g.node(p.id), p.id).toBeTruthy();
      for (const ref of p.references) expect(g.node(ref), `${p.id} → ${ref}`).toBeTruthy();
    }
    for (const a of allMediaAssets()) expect(g.node(a.id), a.id).toBeTruthy();
  });

  it('impact analysis answers "the game changed — which public surfaces update?"', () => {
    const g = buildPil();
    const towers = publicImpact(g, 'system:towers');
    expect(towers.pages).toContain('page:guide-towers'); // a tower change flags the tower guide
    expect(towers.pages).toContain('page:home'); // …and the marketing home
  });

  it('a NEW guide auto-joins the public graph (future content needs no manual integration)', () => {
    // Every GUIDES entry must yield a registered page — the derivation IS the integration.
    const pages = allPublicPages();
    const guidePages = pages.filter((p) => p.id.startsWith('page:guide-'));
    expect(guidePages.length).toBeGreaterThanOrEqual(15);
    for (const p of guidePages) expect(p.references[0]).toMatch(/^guide:/); // linked back to its DIL guide node
  });

  it('store bundles exist, are generated, and respect per-store caps', () => {
    for (const t of STORE_TARGETS) {
      const doc = readFileSync(`store/${t.id}.md`, 'utf-8');
      expect(doc).toContain('GENERATED');
      expect(SHORT_DESC[t.id].length).toBeLessThanOrEqual(t.shortDescMax);
      expect(doc).toContain(SHORT_DESC[t.id]); // the canonical copy IS the bundle (no drift)
    }
  });

  it('docs/PIL_REPORT.md is fresh (run `npm run pil -- regen`)', () => {
    const doc = readFileSync('docs/PIL_REPORT.md', 'utf-8');
    const pages = allPublicPages().length;
    const assets = allMediaAssets().length;
    expect(doc).toContain(`${pages} pages · ${assets} assets`);
    expect(doc).toContain('✅ clean'); // committing a report with structural findings is itself a failure
  });
});
