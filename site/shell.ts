// SITE SHELL (docs/WEBSITE.md §architecture) — the one HTML template every generated page runs
// through: full SEO head (title/description/canonical/OpenGraph/Twitter/JSON-LD), the sticky
// header with grouped nav + the hot Play CTA, clearly-labelled ad slots, the living-background
// canvas, and the footer (nav groups + legal). Pure string templating — no framework, no
// hydration; the pages ARE the HTML Google and AdSense reviewers see.

import { CONTACT_EMAIL, DOMAIN, FOOTER_GROUPS, NAV, PLAY_PATH, SITE_NAME, TAGLINE } from './config';

export interface PageMeta {
  /** Served path, always with a trailing slash ('/', '/about/', '/guides/towers/'). */
  path: string;
  title: string;
  description: string;
  /** Top-level nav label to highlight. */
  section?: string;
  /** Extra JSON-LD blocks (the shell always emits the WebSite + VideoGame graph on '/'). */
  jsonLd?: object[];
  ogImage?: string;
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A clearly-labelled advertisement container (docs/WEBSITE.md §ads). Hidden entirely until a
 *  provider is wired via set-ads — no empty boxes, no layout shift, never inside gameplay. */
export function adSlot(id: string, kind: 'banner' | 'rail' | 'inline'): string {
  return `<div class="ad-slot ad-${kind}" data-ad-slot="${id}" hidden><span class="ad-label">Advertisement</span></div>`;
}

function navHtml(active?: string): string {
  const items = NAV.map((n) => {
    if ('items' in n) {
      const open = n.items.map((i) => `<li><a href="${i.path}">${esc(i.label)}</a></li>`).join('');
      const on = n.label === active ? ' is-active' : '';
      return `<li class="nav-group${on}"><button class="nav-groupbtn" aria-expanded="false">${esc(n.label)} <span aria-hidden>▾</span></button><ul class="nav-drop">${open}</ul></li>`;
    }
    const on = n.label === active ? ' class="is-active"' : '';
    return `<li${on}><a href="${n.path}">${esc(n.label)}</a></li>`;
  }).join('');
  return `
  <header class="site-head">
    <div class="shell-wrap head-row">
      <a class="brand" href="/"><img src="/favicon.svg" alt="" width="26" height="26" /> ${SITE_NAME}</a>
      <input type="checkbox" id="nav-toggle" class="nav-toggle" aria-hidden="true" />
      <label for="nav-toggle" class="nav-burger" aria-label="Menu"><span></span><span></span><span></span></label>
      <nav class="site-nav" aria-label="Site">
        <ul>${items}</ul>
        <a class="play-cta" href="${PLAY_PATH}">▶ Play Free</a>
      </nav>
    </div>
  </header>`;
}

function footerHtml(): string {
  const groups = FOOTER_GROUPS.map(
    (g) => `<div class="foot-col"><h3>${esc(g.label)}</h3><ul>${g.items.map((i) => `<li><a href="${i.path}">${esc(i.label)}</a></li>`).join('')}</ul></div>`,
  ).join('');
  return `
  <footer class="site-foot">
    ${adSlot('footer-banner', 'banner')}
    <div class="shell-wrap foot-grid">
      <div class="foot-brand">
        <a class="brand" href="/"><img src="/favicon.svg" alt="" width="30" height="30" /> ${SITE_NAME}</a>
        <p>${esc(TAGLINE)}</p>
        <p class="foot-note">Plays free in your browser. No install, no account — your hive saves on your device, with optional cloud backup.</p>
      </div>
      ${groups}
    </div>
    <div class="shell-wrap foot-legal">
      <span>© <span data-year>2026</span> ASSIMILATE. All rights reserved.</span>
      <span><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></span>
    </div>
  </footer>`;
}

/** The base JSON-LD graph: the site + the game (rich results for the brand queries). */
function baseJsonLd(): object[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: DOMAIN + '/',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'VideoGame',
      name: SITE_NAME,
      url: DOMAIN + PLAY_PATH,
      description: TAGLINE,
      genre: ['Tower Defense', 'Strategy'],
      gamePlatform: 'Web Browser',
      applicationCategory: 'Game',
      operatingSystem: 'Any',
      playMode: 'SinglePlayer',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      image: DOMAIN + '/og.png',
    },
  ];
}

/** Render one full page. `body` is the page's <main> inner HTML. */
export function page(meta: PageMeta, body: string): string {
  const url = DOMAIN + meta.path;
  const og = meta.ogImage ?? DOMAIN + '/og.png';
  const ld = [...(meta.path === '/' ? baseJsonLd() : []), ...(meta.jsonLd ?? [])];
  const ldTag = ld.length ? `<script type="application/ld+json">${JSON.stringify(ld.length === 1 ? ld[0] : ld)}</script>` : '';
  // Pages own their layout (heroes are full-bleed; article pages build their own .article-grid) —
  // the shell never wraps, or a page's grid would nest inside another and squeeze the column.
  const main = `<main id="main">${body}</main>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="theme-color" content="#070a10" />
  <title>${esc(meta.title)}</title>
  <meta name="description" content="${esc(meta.description)}" />
  <link rel="canonical" href="${url}" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  <link rel="stylesheet" href="/site.css" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(meta.title)}" />
  <meta property="og:description" content="${esc(meta.description)}" />
  <meta property="og:image" content="${og}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(meta.title)}" />
  <meta name="twitter:description" content="${esc(meta.description)}" />
  <meta name="twitter:image" content="${og}" />
  ${ldTag}
</head>
<body>
  <canvas id="bio-bg" aria-hidden="true"></canvas>
  <a class="skip-link" href="#main">Skip to content</a>
  ${navHtml(meta.section)}
  ${adSlot('header-banner', 'banner')}
  ${main}
  ${footerHtml()}
  <script src="/site.js" defer></script>
</body>
</html>
`;
}

/** Standard hero header for interior pages. */
export function pageHero(eyebrow: string, title: string, lead: string): string {
  return `<section class="page-hero"><div class="shell-wrap">
    <div class="eyebrow">${esc(eyebrow)}</div>
    <h1>${esc(title)}</h1>
    <p class="lead">${esc(lead)}</p>
  </div></section>`;
}
