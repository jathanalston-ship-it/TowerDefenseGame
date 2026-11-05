// PUBLIC INTELLIGENCE LAYER (docs/PIL.md) — the DIL's public-facing extension. The DIL is the
// internal brain; the PIL keeps every PLAYER-FACING surface (website pages, guides, blog posts,
// encyclopedia, media/screenshots, store listings, patch notes) synchronized with the true state
// of the game. Same philosophy as the DIL: registries as truth, a typed graph over them,
// generators for the written form, and CI drift tests so staleness is a build failure, not a
// discovery.
//
//   page  —references→ system/concept/mode/entity   (what game truth this page depends on)
//   asset —visualizes→ system/entity                (what a screenshot/art piece depicts)
//
// IMPACT ANALYSIS: `npm run pil -- impact <dilNodeId>` answers "the game changed HERE — which
// public surfaces need updating?" (the inverse edges make it a lookup). AUDIT: `pil -- audit`
// scans every public page for structural rot (broken internal links, placeholder text,
// deprecated terminology, ghost references). New guides/blog posts/encyclopedia pages and new
// game entities AUTO-JOIN the graph (derived from the same registries the site generator uses),
// so future content is a PIL candidate the moment it exists — no manual integration.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDil } from '../dil/nodes';
import type { DilGraph } from '../dil/graph';
import { GUIDES } from '../../../site/guides';

export const PUBLIC_ROOT = 'public';

// ── The page registry ─────────────────────────────────────────────────────────────
// Singleton pages are declared; guides/blog/encyclopedia derive automatically (a new
// guide in site/guides.ts or a new blog directory joins the graph with zero edits here).

export interface PublicPage {
  /** Stable id: 'page:<slug>' */
  id: string;
  /** Path under public/ to the page's index.html. */
  path: string;
  title: string;
  /** DIL node ids this page's CONTENT depends on — the sync contract: when one of these
   *  changes, this page is an update candidate. */
  references: string[];
  /** Last human review (YYYY-MM-DD) — the staleness clock the audit compares against. */
  lastReviewed: string;
}

// Review stamp: the date every public page was last read against the shipped game. Bump it after each
// website pass (CLAUDE.md "Website freshness"); `npm run pil -- staleness` lists what moved since.
const R = '2026-11-05';

const SINGLETON_PAGES: PublicPage[] = [
  { id: 'page:home', path: 'index.html', title: 'Home', references: ['system:towers', 'system:heroes', 'system:campaign', 'system:infinite', 'system:boss-rush', 'concept:power-score', 'system:map-layouts', 'system:gene-cards', 'system:threat', 'system:arena'], lastReviewed: R },
  { id: 'page:about', path: 'about/index.html', title: 'About', references: ['concept:determinism'], lastReviewed: R },
  { id: 'page:features', path: 'features/index.html', title: 'Features', references: ['system:towers', 'system:heroes', 'system:gene-cards', 'system:equipment', 'system:campaign', 'system:infinite', 'system:boss-rush', 'system:daily', 'system:map-layouts', 'system:threat', 'system:hive-mind', 'system:arena', 'system:onboarding', 'system:run-ui', 'system:premium'], lastReviewed: R },
  { id: 'page:faq', path: 'faq/index.html', title: 'FAQ', references: ['concept:power-score', 'system:accounts', 'system:daily', 'system:map-layouts', 'system:threat', 'system:hive-mind', 'system:premium', 'system:run-ui'], lastReviewed: R },
  { id: 'page:roadmap', path: 'roadmap/index.html', title: 'Roadmap', references: [], lastReviewed: R },
  { id: 'page:news', path: 'news/index.html', title: 'News', references: [], lastReviewed: R },
  { id: 'page:leaderboards', path: 'leaderboards/index.html', title: 'Leaderboards', references: ['system:daily', 'system:boss-rush'], lastReviewed: R },
  { id: 'page:contact', path: 'contact/index.html', title: 'Contact', references: [], lastReviewed: R },
  { id: 'page:credits', path: 'credits/index.html', title: 'Credits', references: [], lastReviewed: R },
  { id: 'page:privacy', path: 'privacy/index.html', title: 'Privacy Policy', references: ['system:accounts'], lastReviewed: R },
  { id: 'page:terms', path: 'terms/index.html', title: 'Terms', references: [], lastReviewed: R },
  { id: 'page:cookies', path: 'cookies/index.html', title: 'Cookies', references: [], lastReviewed: R },
  { id: 'page:404', path: '404.html', title: 'Not Found', references: [], lastReviewed: R },
  { id: 'page:guides-index', path: 'guides/index.html', title: 'Guides Index', references: [], lastReviewed: R },
  { id: 'page:blog-index', path: 'blog/index.html', title: 'Dev Blog Index', references: [], lastReviewed: R },
  { id: 'page:ency-enemies', path: 'encyclopedia/enemies/index.html', title: 'Enemy Encyclopedia', references: ['system:bosses', 'system:difficulty'], lastReviewed: R },
  { id: 'page:ency-biomes', path: 'encyclopedia/biomes/index.html', title: 'Biome Encyclopedia', references: ['system:biomes'], lastReviewed: R },
  { id: 'page:ency-doctrines', path: 'encyclopedia/doctrines/index.html', title: 'Doctrine Codex', references: ['system:doctrines'], lastReviewed: R },
  { id: 'page:ency-collections', path: 'encyclopedia/collections/index.html', title: 'Collections Encyclopedia', references: ['system:collection'], lastReviewed: R },
];

/** Guide slug → the DIL nodes that guide teaches about (its update triggers). */
const GUIDE_REFS: Record<string, string[]> = {
  'beginner': ['system:towers', 'system:gene-cards', 'system:heroes'],
  'towers': ['system:towers'],
  'gene-cards': ['system:gene-cards'],
  'power-score': ['concept:power-score'],
  'campaign': ['system:campaign'],
  'infinite': ['system:infinite'],
  'boss-rush': ['system:boss-rush'],
  'daily': ['system:daily'],
  'bosses': ['system:bosses'],
  'mega-bosses': ['system:mega-bosses'],
  'mulligans': ['system:mulligans'],
  'mastery': ['system:mastery'],
  'prestige': ['system:prestige'],
  'progression': ['system:prestige', 'system:mastery'],
  'collections': ['system:collection'],
  'doctrines': ['system:doctrines'],
  'contracts': ['system:contracts'],
  'quests': ['system:quests'],
  'account-progression': ['system:account-level', 'system:genome-rank'],
  'nemesis': ['system:nemesis'],
  'equipment': ['system:equipment'],
};

const BLOG_REFS: Record<string, string[]> = {
  'the-weekly-game': ['system:contracts', 'system:quests', 'system:account-level', 'system:genome-rank'],
  'determinism': ['concept:determinism'],
  'equipment-identity': ['system:equipment'],
  'living-battlefield': ['system:living-battlefield'],
  'mega-boss-raids': ['system:mega-bosses'],
  'opening-cinematic': ['system:onboarding'],
  'the-first-hour': ['system:onboarding', 'system:progression-gating', 'system:map-layouts', 'system:gene-cards', 'system:hive-mind', 'system:threat', 'system:run-ui', 'system:premium'],
};

/** Every public page — declared singletons + auto-derived guides/blog entries. */
export function allPublicPages(): PublicPage[] {
  const pages = [...SINGLETON_PAGES];
  for (const g of GUIDES) {
    pages.push({
      id: `page:guide-${g.slug}`,
      path: `guides/${g.slug}/index.html`,
      title: g.title,
      references: [`guide:${g.slug}`, ...(GUIDE_REFS[g.slug] ?? [])],
      lastReviewed: R,
    });
  }
  const blogDir = join(PUBLIC_ROOT, 'blog');
  if (existsSync(blogDir)) {
    for (const slug of readdirSync(blogDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
      pages.push({
        id: `page:blog-${slug}`,
        path: `blog/${slug}/index.html`,
        title: `Dev Blog — ${slug}`,
        references: BLOG_REFS[slug] ?? [],
        lastReviewed: R,
      });
    }
  }
  return pages;
}

// ── The media manifest ────────────────────────────────────────────────────────────
// Every marketing/media asset with WHAT it depicts. A visual change to a depicted system
// makes its assets replacement candidates (`pil -- screenshots`). Assets under
// public/media/shots auto-join; named brand assets are declared.

export interface MediaAsset {
  id: string; // 'asset:<name>'
  path: string; // under public/
  kind: 'screenshot' | 'icon' | 'og' | 'logo';
  depicts: string[]; // DIL node ids
  capturedAt: string; // YYYY-MM-DD (freshness clock)
  status: 'current' | 'stale' | 'archived';
}

const BRAND_ASSETS: MediaAsset[] = [
  { id: 'asset:og', path: 'og.png', kind: 'og', depicts: [], capturedAt: R, status: 'current' },
  { id: 'asset:favicon', path: 'favicon.svg', kind: 'icon', depicts: [], capturedAt: R, status: 'current' },
  { id: 'asset:icon-512', path: 'icon-512.png', kind: 'icon', depicts: [], capturedAt: R, status: 'current' },
];

export function allMediaAssets(): MediaAsset[] {
  const out = [...BRAND_ASSETS];
  const shots = join(PUBLIC_ROOT, 'media', 'shots');
  if (existsSync(shots)) {
    for (const f of readdirSync(shots).filter((f) => /\.(png|jpg|webp)$/i.test(f))) {
      out.push({
        id: `asset:shot-${f.replace(/\.[a-z]+$/i, '')}`,
        path: `media/shots/${f}`,
        kind: 'screenshot',
        depicts: ['system:run-ui'], // default: gameplay; curate per-shot as the library grows
        capturedAt: R,
        status: 'current',
      });
    }
  }
  return out;
}

// ── The public graph (DIL + public surfaces) ─────────────────────────────────────

export function buildPil(): DilGraph {
  const g = buildDil();
  for (const p of allPublicPages()) {
    g.addNode({ id: p.id, kind: 'page', name: p.title, summary: `Public page /${p.path.replace(/index\.html$/, '')}`, at: `${PUBLIC_ROOT}/${p.path}` });
    for (const ref of p.references) if (g.node(ref)) g.addEdge(p.id, 'references', ref);
  }
  for (const a of allMediaAssets()) {
    g.addNode({ id: a.id, kind: 'asset', name: a.path, summary: `${a.kind} (${a.status}, captured ${a.capturedAt})`, at: `${PUBLIC_ROOT}/${a.path}` });
    for (const d of a.depicts) if (g.node(d)) g.addEdge(a.id, 'visualizes', d);
  }
  return g;
}

// ── Impact analysis ───────────────────────────────────────────────────────────────

/** "The game changed at <nodeId> — which public surfaces need updating?" */
export function publicImpact(g: DilGraph, nodeId: string): { pages: string[]; assets: string[] } {
  return {
    pages: g.who('references', nodeId).filter((n) => n.kind === 'page').map((n) => n.id),
    assets: g.who('visualizes', nodeId).filter((n) => n.kind === 'asset').map((n) => n.id),
  };
}

// ── The audit (structural rot detection) ─────────────────────────────────────────

export interface PilFinding { page: string; kind: string; detail: string }

const PLACEHOLDER_RX = /\bTODO\b|LOREM IPSUM|\bPLACEHOLDER\b|XXX-/i; // unambiguous markers only ('coming soon' is legitimate marketing copy)
/** Terminology the LEXICON retired — public copy must never regress to it. */
const DEPRECATED_TERMS = ['Save Slot', 'Account Name'];

export function auditPublic(): PilFinding[] {
  const findings: PilFinding[] = [];
  const g = buildPil();
  const pages = allPublicPages();
  const registered = new Set(pages.map((p) => p.path));

  // 1) Completeness: every real page is registered (a NEW page must join the graph).
  const walk = (dir: string): string[] =>
    readdirSync(join(PUBLIC_ROOT, dir), { withFileTypes: true }).flatMap((d) => {
      const rel = dir ? `${dir}/${d.name}` : d.name;
      if (d.isDirectory()) return walk(rel);
      return /(^|\/)index\.html$|^404\.html$/.test(rel) ? [rel] : [];
    });
  for (const path of walk('')) {
    if (!registered.has(path)) findings.push({ page: path, kind: 'unregistered-page', detail: 'exists in public/ but not in the PIL page registry' });
  }

  for (const p of pages) {
    const full = join(PUBLIC_ROOT, p.path);
    if (!existsSync(full)) {
      findings.push({ page: p.path, kind: 'missing-file', detail: 'registered but not on disk' });
      continue;
    }
    const html = readFileSync(full, 'utf-8');
    // 2) Ghost references: a page claiming a DIL node that no longer exists = removed system
    //    still marketed. Hard structural rot.
    for (const ref of p.references) if (!g.node(ref)) findings.push({ page: p.path, kind: 'ghost-reference', detail: `references '${ref}' which is not in the DIL` });
    // 3) Broken internal links (site-relative hrefs must resolve to a registered page or file).
    for (const m of html.matchAll(/href="(\/[^"#?]*)["#?]/g)) {
      if (/^\/(play|api)(\/|$)/.test(m[1])) continue; // build-output/serverless paths — real in dist, absent in public/
      const target = m[1].replace(/\/$/, '/index.html').replace(/^\//, '');
      if (target === 'index.html' || target === '') continue;
      const t = target.endsWith('.html') || /\.[a-z0-9]+$/i.test(target) ? target : `${target}/index.html`;
      if (!existsSync(join(PUBLIC_ROOT, t)) && !existsSync(join(PUBLIC_ROOT, target))) {
        findings.push({ page: p.path, kind: 'broken-link', detail: `href="${m[1]}" resolves to nothing in public/` });
      }
    }
    // 4) Placeholder + deprecated copy.
    // Strip the HTML placeholder= ATTRIBUTE (search inputs) before scanning — only shipped COPY counts.
    const copy = html.replace(/placeholder="[^"]*"/gi, '');
    if (PLACEHOLDER_RX.test(copy)) findings.push({ page: p.path, kind: 'placeholder', detail: 'placeholder marker present in shipped copy' });
    for (const term of DEPRECATED_TERMS) if (html.includes(term)) findings.push({ page: p.path, kind: 'deprecated-term', detail: `uses retired terminology '${term}'` });
  }

  // 5) SEO: every registered page is in the committed sitemap (gen-site writes it;
  //    a page missing from it is invisible to crawlers — structural rot).
  const sitemapPath = join(PUBLIC_ROOT, 'sitemap.xml');
  if (existsSync(sitemapPath)) {
    const sitemap = readFileSync(sitemapPath, 'utf-8');
    for (const p2 of pages) {
      if (p2.path === '404.html') continue; // deliberately unlisted
      const url = `/${p2.path.replace(/index\.html$/, '')}`;
      if (!sitemap.includes(`${url}</loc>`)) findings.push({ page: p2.path, kind: 'sitemap-missing', detail: `${url} not in public/sitemap.xml (npm run site regenerates)` });
    }
  }

  // 6) Manifest assets exist on disk.
  for (const a of allMediaAssets()) {
    if (!existsSync(join(PUBLIC_ROOT, a.path))) findings.push({ page: a.path, kind: 'missing-asset', detail: `manifest asset '${a.id}' not on disk` });
  }
  return findings;
}

/** Staleness report (advisory, not a hard failure): pages whose referenced systems' source
 *  files changed after the page's last review — "the game moved; re-read this page". */
export function stalenessReport(): { page: string; ref: string; sourceChanged: string }[] {
  const g = buildPil();
  const out: { page: string; ref: string; sourceChanged: string }[] = [];
  for (const p of allPublicPages()) {
    const reviewed = new Date(p.lastReviewed).getTime();
    for (const ref of p.references) {
      const node = g.node(ref);
      const at = node?.at?.split(/[ →]/)[0];
      if (!at || !existsSync(at)) continue;
      const mtime = statSync(at).mtimeMs;
      if (mtime > reviewed + 86_400_000) out.push({ page: p.path, ref, sourceChanged: new Date(mtime).toISOString().slice(0, 10) });
    }
  }
  return out;
}
