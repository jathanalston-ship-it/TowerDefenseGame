// WEBSITE CONTRACT (docs/WEBSITE.md §testing) — the marketing site is generated + committed, so
// these tests make AdSense/SEO regressions impossible to ship: every page has full SEO fields,
// every internal link resolves, the sitemap is complete, no placeholder copy survives, and the
// committed public/ output cannot drift from the generator (the docs:graph pattern).

import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSite, loadPatchNotes } from './build';
import { FEATURE_WEEK_MS } from './encyclopedia';
import { allNavPaths, DOMAIN, PLAY_PATH } from './config';
import { POSTS } from './blog';
import { GUIDES } from './guides';

const site = buildSite();
const pages = [...site.entries()].filter(([p]) => p.endsWith('/') || p === '/404.html');

describe('site generation — structure', () => {
  it('generates every navigation target (no broken nav, no stub pages)', () => {
    for (const p of allNavPaths()) {
      if (p === PLAY_PATH) continue; // the game app, built by vite
      expect(site.has(p), `nav links to ${p} but it was not generated`).toBe(true);
    }
    expect(site.size).toBeGreaterThanOrEqual(35); // home+core+guides+ency+blog+news+404+sitemap
  });

  it('every internal link on every page resolves to a page or a real public asset', () => {
    const hrefs = new Set<string>();
    for (const [, html] of pages) {
      for (const m of html.matchAll(/(?:href|src|poster)="(\/[^"#?]*)/g)) hrefs.add(m[1]);
    }
    for (const url of hrefs) {
      if (site.has(url)) continue; // generated page
      if (url === PLAY_PATH) continue; // the game app
      const asFile = existsSync(join('public', url)) || existsSync(join('public', url, 'index.html'));
      expect(asFile, `broken internal link: ${url}`).toBe(true);
    }
  });

  it('every page carries full SEO fields: title, description, canonical, OG', () => {
    for (const [p, html] of pages) {
      expect(html, `${p}: missing <title>`).toMatch(/<title>[^<]{10,}<\/title>/);
      expect(html, `${p}: missing description`).toMatch(/<meta name="description" content="[^"]{40,}"/);
      expect(html, `${p}: missing canonical`).toContain(`<link rel="canonical" href="${DOMAIN}`);
      expect(html, `${p}: missing og:title`).toContain('property="og:title"');
    }
  });

  it('descriptions and titles are unique per page (no copy-paste SEO)', () => {
    const titles = pages.map(([, h]) => /<title>([^<]+)</.exec(h)![1]);
    const descs = pages.map(([, h]) => /name="description" content="([^"]+)"/.exec(h)![1]);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descs).size).toBe(descs.length);
  });

  it('no placeholder copy ships (AdSense: meaningful original content only)', () => {
    for (const [p, html] of pages) {
      expect(html, `${p}: placeholder text`).not.toMatch(/lorem ipsum|TODO|FIXME|Lorem|under construction/);
    }
  });

  it('the sitemap covers every generated page plus the game', () => {
    const sm = site.get('/sitemap.xml')!;
    for (const [p] of pages) {
      if (p === '/404.html') continue;
      expect(sm, `sitemap missing ${p}`).toContain(`<loc>${DOMAIN}${p}</loc>`);
    }
    expect(sm).toContain(`<loc>${DOMAIN}${PLAY_PATH}</loc>`);
  });

  it('structured data is valid JSON-LD where promised (home, FAQ, blog posts)', () => {
    for (const path of ['/', '/faq/', `/blog/${POSTS[0].slug}/`]) {
      const html = site.get(path)!;
      const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
      expect(m, `${path}: JSON-LD missing`).toBeTruthy();
      expect(() => JSON.parse(m![1])).not.toThrow();
    }
    expect(site.get('/faq/')!).toContain('"FAQPage"');
    expect(site.get('/')!).toContain('"VideoGame"');
  });

  it('ads are labelled containers OUTSIDE gameplay only, hidden by default', () => {
    for (const [p, html] of pages) {
      for (const m of html.matchAll(/<div class="ad-slot[^>]*>/g)) {
        expect(m[0], `${p}: ad slot must ship hidden`).toContain('hidden');
      }
      if (html.includes('ad-slot')) expect(html).toContain('Advertisement');
    }
    // The CSS must let the hidden attribute WIN (author display rules otherwise override [hidden]),
    // and dropdown menus must not inherit the top-level flex display. Both were real render bugs.
    const css = readFileSync('public/site.css', 'utf8');
    expect(css).toContain('.ad-slot[hidden]');
    expect(css).toContain('.site-nav > ul');
  });
});

describe('site generation — committed output stays in sync (run `npm run site`)', () => {
  it('public/ matches the generator byte-for-byte', () => {
    // The home page's featured picks rotate WEEKLY — regenerate at the week the committed page
    // was built in (its `data-week` stamp), so this pins content drift, not the calendar.
    const stamp = /data-week="(\d+)"/.exec(readFileSync('public/index.html', 'utf8'))?.[1];
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(stamp ? Number(stamp) * FEATURE_WEEK_MS : Date.now());
    let pinned: Map<string, string>;
    try { pinned = buildSite(); } finally { vi.useRealTimers(); }
    for (const [servedPath, content] of pinned) {
      const rel = servedPath.endsWith('/') ? servedPath + 'index.html' : servedPath;
      const file = join('public', rel);
      expect(existsSync(file), `${file} missing — run \`npm run site\``).toBe(true);
      expect(readFileSync(file, 'utf8'), `${file} drifted — run \`npm run site\``).toBe(content);
    }
  });
});

describe('blog + patch notes data contracts', () => {
  it('blog posts are complete and dated (newest rendered first by the generator)', () => {
    expect(POSTS.length).toBeGreaterThanOrEqual(5);
    const slugs = new Set<string>();
    for (const p of POSTS) {
      expect(p.slug).toMatch(/^[a-z0-9-]+$/);
      expect(slugs.has(p.slug)).toBe(false);
      slugs.add(p.slug);
      expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.title.length).toBeGreaterThan(10);
      expect(p.summary.length).toBeGreaterThan(40);
      expect(p.body.length).toBeGreaterThan(400); // real articles, not stubs
      expect(p.tags.length).toBeGreaterThan(0);
    }
    const idx = buildSite().get('/blog/')!;
    const order = [...idx.matchAll(/href="\/blog\/([a-z0-9-]+)\/"/g)].map((m) => m[1]);
    const sorted = [...POSTS].sort((a, b) => (a.date < b.date ? 1 : -1)).map((p) => p.slug);
    expect(order.filter((s, i) => order.indexOf(s) === i)).toEqual(sorted);
  });

  it('patch notes JSON is well-formed and categorized', () => {
    const notes = loadPatchNotes();
    expect(notes.length).toBeGreaterThan(3);
    for (const e of notes) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.categories.length).toBeGreaterThan(0);
      expect(e.items.length).toBeGreaterThan(0);
      for (const i of e.items) { expect(i.cat.length).toBeGreaterThan(1); expect(i.text.length).toBeGreaterThan(4); }
    }
    // newest first
    for (let i = 1; i < notes.length; i++) expect(notes[i - 1].date >= notes[i].date).toBe(true);
  });

  it('guides are real content with unique slugs', () => {
    expect(GUIDES.length).toBeGreaterThanOrEqual(16);
    const slugs = new Set(GUIDES.map((g) => g.slug));
    expect(slugs.size).toBe(GUIDES.length);
    for (const g of GUIDES) {
      const words = g.sections.flatMap((s) => s.body).join(' ').split(/\s+/).length;
      expect(words, `${g.slug} too thin`).toBeGreaterThan(120);
    }
  });
});
