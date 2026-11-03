// SITE BUILDER (docs/WEBSITE.md §architecture) — assembles every page of the marketing site as
// a pure map of { servedPath → html/xml }. scripts/gen-site.ts writes it into public/ (committed);
// site/gen.test.ts runs it in-memory to enforce the contract (all links resolve, SEO fields on
// every page, sitemap complete, no placeholder text) and that the committed output hasn't drifted.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMAIN, PLAY_PATH, SITE_NAME, TAGLINE, allNavPaths } from './config';
import { adSlot, esc, page, pageHero } from './shell';
import { GUIDES } from './guides';
import { POSTS } from './blog';
import {
  biomeCount, biomeEncyclopedia, bossCount, bossGallery, doctrineCodex, doctrineCount,
  enemyCompendium, enemyCount, featuredHero, featuredTower, featuredWeek, heroCount, heroTable, towerCount, towerTable,
} from './encyclopedia';
import {
  aboutPage, contactPage, cookiesPage, creditsPage, faqPage, featuresPage, homePage,
  leaderboardsPage, privacyPage, roadmapPage, termsPage,
} from './pages';

export interface PatchEntry { date: string; title: string; categories: string[]; items: { cat: string; text: string }[] }

export function loadPatchNotes(root = process.cwd()): PatchEntry[] {
  try {
    return JSON.parse(readFileSync(join(root, 'site/patchnotes.json'), 'utf8')) as PatchEntry[];
  } catch {
    return [];
  }
}

const fmtDate = (iso: string): string =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

function breadcrumb(items: { name: string; path: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: DOMAIN + it.path })),
  };
}

/** Build the whole site. Returns servedPath → file contents ('/about/' ⇒ public/about/index.html). */
export function buildSite(root = process.cwd()): Map<string, string> {
  const out = new Map<string, string>();
  const patches = loadPatchNotes(root);
  const posts = [...POSTS].sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first, enforced

  // ── Home ──
  out.set('/', page(
    { path: '/', title: `${SITE_NAME} — Bio-Horror Tower Defense · Play Free in Your Browser`, description: `${TAGLINE} ${towerCount()} evolving towers, ${heroCount()} heroes, Mega Boss raids and a living battlefield — free in your browser, no install.`, section: 'Home' },
    homePage({
      latestPost: posts[0],
      latestPatch: patches[0] ? { date: fmtDate(patches[0].date), title: patches[0].title, categories: patches[0].categories } : null,
      counts: { towers: towerCount(), heroes: heroCount(), enemies: enemyCount(), biomes: biomeCount(), bosses: bossCount(), doctrines: doctrineCount() },
      featuredTower: featuredTower(),
      featuredHero: featuredHero(),
      featuredWeek: featuredWeek(),
    }),
  ));

  // ── Core static pages ──
  const statics: { path: string; title: string; desc: string; section?: string; hero: [string, string, string]; body: string; jsonLd?: object[] }[] = [
    { path: '/about/', title: `About ${SITE_NAME} — What It Is and Why It's Different`, desc: 'What ASSIMILATION is, what makes it different, and the state of the game — a free, deterministic bio-horror tower defense.', section: 'Game', hero: ['THE GAME', 'About ASSIMILATION', 'A tower defense where you are the thing growing.'], body: aboutPage() },
    { path: '/features/', title: `${SITE_NAME} Features — Every System in Depth`, desc: 'Combat, four tower evolution layers, heroes with equipment, the permanent game, four modes and a fully procedural presentation.', section: 'Game', hero: ['THE SYSTEMS', 'Features', 'Everything the hive grows — combat, evolution, progression, presentation.'], body: featuresPage() },
    { path: '/roadmap/', title: `${SITE_NAME} Roadmap — What's Growing Next`, desc: 'Current development priorities: deeper rosters, community features, Steam release and mobile builds.', section: 'Game', hero: ['THE FUTURE', 'Roadmap', 'What is live, what is next, and what is on the horizon.'], body: roadmapPage() },
    { path: '/contact/', title: `Contact ${SITE_NAME}`, desc: 'Bug reports, feedback, press and business contact for ASSIMILATION.', section: 'Game', hero: ['STUDIO', 'Contact', 'We read everything — replay codes make bug reports gold.'], body: contactPage() },
    { path: '/credits/', title: `${SITE_NAME} Credits`, desc: 'The team and technology behind ASSIMILATION.', hero: ['STUDIO', 'Credits', 'Who and what the hive is made of.'], body: creditsPage() },
    { path: '/leaderboards/', title: `${SITE_NAME} Leaderboards — Daily Runs & Records`, desc: 'How the daily leaderboard works, replay verification, and where the standings live.', section: 'News', hero: ['COMPETITION', 'Leaderboards', 'One daily seed, worldwide — verified by deterministic replay.'], body: leaderboardsPage() },
    { path: '/privacy/', title: `${SITE_NAME} Privacy Policy`, desc: 'What data ASSIMILATION stores, where your save lives, and your rights.', hero: ['LEGAL', 'Privacy Policy', 'Your save is yours. The short version really is short.'], body: privacyPage() },
    { path: '/terms/', title: `${SITE_NAME} Terms of Service`, desc: 'The terms covering the ASSIMILATION game and website.', hero: ['LEGAL', 'Terms of Service', 'The reasonable rules of the hive.'], body: termsPage() },
    { path: '/cookies/', title: `${SITE_NAME} Cookie Policy`, desc: 'Exactly what storage and cookies the site and game use, and your controls.', hero: ['LEGAL', 'Cookie Policy', 'Local saves, cookie-free analytics, and labelled ads with consent.'], body: cookiesPage() },
  ];
  for (const s of statics) {
    out.set(s.path, page(
      { path: s.path, title: s.title, description: s.desc, section: s.section, jsonLd: [breadcrumb([{ name: 'Home', path: '/' }, { name: s.hero[1], path: s.path }]), ...(s.jsonLd ?? [])] },
      pageHero(...s.hero) + `<div class="shell-wrap"><div class="article-grid"><div class="article">${s.body}</div><aside class="article-rail">${adSlot('article-rail', 'rail')}</aside></div></div>`,
    ));
  }

  // ── FAQ (with FAQPage schema) ──
  const faq = faqPage();
  out.set('/faq/', page(
    {
      path: '/faq/', title: `${SITE_NAME} FAQ — Saves, Offline Play, Dailies & More`, description: 'Answers to the most common questions: is it free, where saves live, offline play, determinism, dailies, Steam and mobile.', section: 'Game',
      jsonLd: [{
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: faq.qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })),
      }],
    },
    pageHero('QUESTIONS', 'Frequently Asked Questions', 'Saves, offline play, fairness, platforms — the ten we hear most.')
    + `<div class="shell-wrap"><div class="article-grid"><div class="article">${faq.html}</div><aside class="article-rail">${adSlot('article-rail', 'rail')}</aside></div></div>`,
  ));

  // ── Guides ──
  const cats = ['Getting Started', 'Combat', 'Progression', 'Modes'] as const;
  const guideCards = cats.map((c) => {
    const cards = GUIDES.filter((g) => g.category === c).map((g) =>
      `<div class="card"><div class="k">${esc(g.category)}</div><h3><a href="/guides/${g.slug}/">${esc(g.title)}</a></h3><p>${esc(g.summary)}</p></div>`).join('');
    return `<h2>${c}</h2><div class="card-grid">${cards}</div>`;
  }).join('');
  out.set('/guides/', page(
    { path: '/guides/', title: `${SITE_NAME} Guides — Strategy for Every System`, description: `${GUIDES.length} original guides: towers, heroes, bosses, progression, and every mode — written for real decisions, kept current with the live game.`, section: 'Guides' },
    pageHero('THE LIBRARY', 'Guides', 'Original strategy for every system — kept current with the live build.')
    + `<div class="shell-wrap section">${guideCards}</div>`,
  ));
  for (const g of GUIDES) {
    const body = g.sections.map((s) => {
      const table = s.dataTable === 'towers' ? towerTable() : s.dataTable === 'heroes' ? heroTable() : '';
      return `<h2>${esc(s.h)}</h2>${s.body.map((p) => `<p>${p}</p>`).join('')}${table}`;
    }).join(adSlot(`guide-${g.slug}-inline`, 'inline'));
    out.set(`/guides/${g.slug}/`, page(
      { path: `/guides/${g.slug}/`, title: `${g.title} · ${SITE_NAME} Guides`, description: g.summary, section: 'Guides', jsonLd: [breadcrumb([{ name: 'Home', path: '/' }, { name: 'Guides', path: '/guides/' }, { name: g.title, path: `/guides/${g.slug}/` }])] },
      pageHero(g.category.toUpperCase(), g.title, g.summary)
      + `<div class="shell-wrap"><div class="article-grid"><div class="article">${body}</div><aside class="article-rail">${adSlot('article-rail', 'rail')}</aside></div></div>`,
    ));
  }

  // ── Encyclopedias (generated from live game data) ──
  const ency: { path: string; title: string; desc: string; hero: [string, string, string]; body: string }[] = [
    { path: '/encyclopedia/enemies/', title: `Enemy Compendium — All ${enemyCount()} Strains · ${SITE_NAME}`, desc: `Every enemy strain in the live build — ${enemyCount()} organisms with stats, roles and traits, grouped by threat.`, hero: ['ENCYCLOPEDIA', 'Enemy Compendium', `All ${enemyCount()} strains in the live build, with authored stats and threat roles.`], body: enemyCompendium() },
    { path: '/encyclopedia/biomes/', title: `Biome Encyclopedia — ${biomeCount()} Ecosystems · ${SITE_NAME}`, desc: `The ${biomeCount()} biomes that warp the rules: modifiers, hazards and character, straight from the game data.`, hero: ['ENCYCLOPEDIA', 'Biome Encyclopedia', 'Ecosystems that rewrite the rules — modifiers and hazards from the live data.'], body: biomeEncyclopedia() },
    { path: '/encyclopedia/doctrines/', title: `Doctrine Codex — All ${doctrineCount()} Run Commitments · ${SITE_NAME}`, desc: `Every Doctrine in the live build: ${doctrineCount()} exclusive run-start commitments across Build, Protocol and Pact families, with their unlock gates.`, hero: ['ENCYCLOPEDIA', 'Doctrine Codex', `All ${doctrineCount()} run commitments — three families, straight from the live registry.`], body: doctrineCodex() + `<p style="margin-top:18px"><a class="btn-ghost" href="/guides/doctrines/">How to play them — the Doctrine Guide →</a></p>` },
    { path: '/encyclopedia/collections/', title: `Collection Records · ${SITE_NAME}`, desc: 'The account-wide record: what collections track, the rank ladder, and the permanent bonuses completion pays.', hero: ['ENCYCLOPEDIA', 'Collection Records', 'Bronze to Ascendant — what the hive remembers, and what it pays.'], body: `
      <h2>What is recorded</h2><p>Strains assimilated, bosses felled, biomes survived, gene cards archived, equipment catalogued, organisms assembled — every category climbs a rank ladder as it completes.</p>
      <h2>The rank ladder</h2><p>Unranked → Bronze → Silver → Gold → Platinum → Diamond → Ascendant. Each rank pays a permanent account bonus, making completion a real progression path — the details live in the in-game Collection screen, which always reflects your own record.</p>
      <h2>Boss trophies</h2><p>${bossGallery()}</p>` },
  ];
  for (const e of ency) {
    out.set(e.path, page(
      { path: e.path, title: e.title, description: e.desc, section: 'Encyclopedia', jsonLd: [breadcrumb([{ name: 'Home', path: '/' }, { name: e.hero[1], path: e.path }])] },
      pageHero(...e.hero) + `<div class="shell-wrap section">${e.body}</div>${adSlot('ency-footer', 'banner')}`,
    ));
  }

  // ── Dev Blog ──
  const tagSet = [...new Set(posts.flatMap((p) => p.tags))];
  const postRows = posts.map((p) => `
    <div class="post-row" data-search="${esc((p.title + ' ' + p.summary + ' ' + p.tags.join(' ') + ' ' + p.category).toLowerCase())}">
      <div class="t-date">${fmtDate(p.date)}<br /><span class="cat-pill">${esc(p.category)}</span></div>
      <div><h3><a href="/blog/${p.slug}/">${esc(p.title)}</a></h3><p>${esc(p.summary)}</p>
      <div class="tagrow">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div></div>
    </div>`).join('');
  out.set('/blog/', page(
    { path: '/blog/', title: `${SITE_NAME} Dev Blog — How the Hive Is Built`, description: 'Development deep-dives: systems design, procedural art and audio, balance and engineering — from the team building ASSIMILATION.', section: 'News' },
    pageHero('DEV BLOG', 'How the Hive Is Built', 'Systems, art, audio and engineering — deep dives from development.')
    + `<div class="shell-wrap section">
      <div class="search-box"><input type="search" placeholder="Search posts… (title, tag, topic)" aria-label="Search posts" data-search-input /></div>
      <p>${tagSet.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</p>
      <div class="post-list">${postRows}</div>
      <p class="search-empty">No posts match that search.</p>
    </div>${adSlot('blog-footer', 'banner')}`,
  ));
  for (const p of posts) {
    out.set(`/blog/${p.slug}/`, page(
      {
        path: `/blog/${p.slug}/`, title: `${p.title} · ${SITE_NAME} Dev Blog`, description: p.summary, section: 'News',
        jsonLd: [
          { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, description: p.summary, datePublished: p.date, author: { '@type': 'Organization', name: SITE_NAME }, publisher: { '@type': 'Organization', name: SITE_NAME }, mainEntityOfPage: DOMAIN + `/blog/${p.slug}/`, image: DOMAIN + '/og.png' },
          breadcrumb([{ name: 'Home', path: '/' }, { name: 'Dev Blog', path: '/blog/' }, { name: p.title, path: `/blog/${p.slug}/` }]),
        ],
      },
      pageHero(`${p.category.toUpperCase()} · ${fmtDate(p.date)}`, p.title, p.summary)
      + `<div class="shell-wrap"><div class="article-grid"><div class="article">${p.body}
        <p style="margin-top:30px">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</p>
        <p><a href="/blog/">← All devlogs</a> · <a href="${PLAY_PATH}">Play ASSIMILATION free →</a></p>
      </div><aside class="article-rail">${adSlot('article-rail', 'rail')}</aside></div></div>`,
    ));
  }

  // ── Patch notes (generated from the development history) ──
  const patchItems = patches.map((e) => `
    <li data-search="${esc((e.title + ' ' + e.categories.join(' ') + ' ' + e.items.map((i) => i.text).join(' ')).toLowerCase())}">
      <span class="t-date">${fmtDate(e.date)}</span>
      <h3>${esc(e.title)}</h3>
      <p>${e.categories.map((c) => `<span class="cat-pill">${esc(c)}</span>`).join('')}</p>
      <ul>${e.items.map((i) => `<li><b>${esc(i.cat)}:</b> ${esc(i.text)}</li>`).join('')}</ul>
    </li>`).join('');
  out.set('/news/', page(
    { path: '/news/', title: `${SITE_NAME} Patch Notes — The Full Change History`, description: 'Every update, categorized and searchable — generated straight from the development history, newest first.', section: 'News' },
    pageHero('PATCH NOTES', 'The Change History', 'Generated straight from development — categorized, searchable, newest first.')
    + `<div class="shell-wrap section">
      <div class="search-box"><input type="search" placeholder="Search patches… (system, fix, feature)" aria-label="Search patch notes" data-search-input /></div>
      <ul class="timeline">${patchItems}</ul>
      <p class="search-empty">No patches match that search.</p>
    </div>${adSlot('news-footer', 'banner')}`,
  ));

  // ── 404 ──
  out.set('/404.html', page(
    { path: '/404.html', title: `Page Not Found · ${SITE_NAME}`, description: 'This path has not been assimilated. Find the game, guides and news from here.' },
    pageHero('SIGNAL LOST', 'This page has not been assimilated', 'The path you followed does not exist — but the hive is close.')
    + `<div class="shell-wrap section"><div class="hero-ctas" style="justify-content:flex-start">
      <a class="btn-primary" href="/">← Home</a><a class="btn-ghost" href="${PLAY_PATH}">Play the game</a><a class="btn-ghost" href="/guides/">Read the guides</a>
    </div></div>`,
  ));

  // ── sitemap.xml (every served page; /play/ included) ──
  const urls = [...out.keys()].filter((p) => p !== '/404.html').concat([PLAY_PATH]);
  const pri = (p: string): string => (p === '/' ? '1.0' : p === PLAY_PATH ? '0.9' : p.startsWith('/guides/') || p.startsWith('/blog/') ? '0.7' : '0.6');
  out.set('/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.sort().map((u) => `  <url><loc>${DOMAIN}${u}</loc><changefreq>weekly</changefreq><priority>${pri(u)}</priority></url>`).join('\n')}\n</urlset>\n`);

  // Sanity: every nav path must exist (the test enforces this too, but fail loud at build time).
  for (const p of allNavPaths()) {
    if (p !== PLAY_PATH && !out.has(p)) throw new Error(`nav links to ${p} but no page was generated for it`);
  }
  return out;
}
