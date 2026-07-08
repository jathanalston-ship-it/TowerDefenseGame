# WEBSITE.md — marketing site, branding, ads & analytics setup

Everything outside the game itself: the landing site, brand/PWA assets, ad placements,
and the analytics stack. Deployment mechanics live in docs/DEPLOYMENT.md; the
launch-day manual is docs/RELEASE-GUIDE.md.

## 1. The marketing site (`public/welcome/`)

Static, dependency-free pages served by the same Pages deployment (zero extra infra):

| Page | Purpose |
|---|---|
| `/welcome/` | Landing: hero + CTA, trailer placeholder, real gameplay screenshots (`shots/`), features, progression pitch, Daily Run + Boss Rush, newsletter + Discord placeholders |
| `/welcome/news.html` | News & patch notes (append one `<article>` per release) |
| `/welcome/privacy.html` | Privacy Policy — honest behavioral skeleton, **must be completed by counsel before launch** |
| `/welcome/terms.html` | Terms of Service — topic skeleton, **must be completed before launch** |

The game stays at `/` (players' bookmarks, PWA start_url). Point marketing links at
`/welcome/`; optionally add a Cloudflare redirect rule from a `www.` host to it.
Placeholders to fill at launch: trailer embed, newsletter form action, Discord invite,
both legal pages, and the `og:url` canonical domain in `index.html`.

## 2. Branding / PWA

- `public/manifest.json` — installable identity (standalone, portrait, theme #0a121b).
- Icons: `favicon.svg` (source of truth) → `icon-192.png`, `icon-512.png`,
  `icon-512-maskable.png` (20% safe zone), `apple-touch-icon.png`, `favicon-32.png`.
- `public/og.png` (1200×630) — Open Graph/Twitter card, generated from the brand mark.
- `index.html` — full SEO/OG/Twitter meta + the inline **boot shell** (instant dark
  splash with the pulsing cell; React replaces it on mount). Android splash derives
  from manifest icons + background_color; a service worker is deliberately NOT shipped
  (cache-staleness risk for a live game outweighs installability prompts — revisit
  post-launch if install metrics matter).

Regenerating raster assets: the icons/OG banner were rendered headlessly from
`favicon.svg`; re-run the recipe in the repo history (or any SVG rasterizer) after a
brand change.

## 3. Display ads (site only — NEVER in gameplay)

Placement contract:
- The GAME shows no display ads anywhere. Combat is sacred; menus carry only the
  opt-in Field Research lane (docs/RESEARCH.md).
- The SITE carries modular containers: `<div class="ad-slot" data-ad-slot="…">` on the
  landing page (`landing-below-trailer`, `landing-above-signup`) and news page
  (`news-top`, `news-inline`). Future guide pages reuse the same class.
- `public/welcome/ads.js` is the single mount point: with `AD_PROVIDER = 'none'`
  (launch default) every slot hides itself — no empty boxes, no layout shift, no
  third-party requests. Wiring a network = set the provider, implement `mount`, and
  allowlist its hosts in the site CSP (`public/_headers`).
- "Loading between menu navigation" interstitials: deliberately NOT implemented —
  they violate the never-interrupt rule this project ships with. The seam, if ever
  wanted, is a menu-transition surface in `Hub.tsx`; keep it out unless data demands it.

## 4. Analytics

Three complementary, privacy-friendly layers:

1. **Cloudflare Web Analytics** (sessions, page views, countries, no cookies):
   enable per docs/DEPLOYMENT.md §4.7 — the CSP already allowlists the beacon.
2. **Aggregate game counters** (`/api/events` → D1 `analytics_counters`): per-UTC-day
   `(kind, count)` rows, no identifiers. Client kinds: `session_start`, `run_start`,
   `run_end`, `research_view/abort/claim(:id)`, `store_open`, `checkout_start(:offer)`.
   Batched + fail-soft (`src/net/events.ts`); kinds allowlisted server-side.
3. **Server-truth purchase counters** (webhook/claim bump `purchase_paid(:offer)`,
   `purchase_fulfilled`, `purchase_refunded`) — conversion is measured from money
   events the client can't fake.

Reading it (SQL over D1, e.g. `npx wrangler d1 execute assimilate-db --remote --command …`):
- **Sessions/day** `session_start` · **runs/session** `run_start ÷ session_start`
- **Store funnel** `store_open → checkout_start → purchase_paid → purchase_fulfilled`
- **Research usage** `research_view`, claim mix by `research_claim:<id>`, completion
  `research_claim ÷ research_view`
- **Retention impact**: compare `session_start` day-over-day cohorts before/after
  enabling the research lane (aggregate-level by design — no per-user tracking exists).

## 5. SEO

- Unique titles/descriptions on every page; canonical tag on the landing page.
- OG + Twitter cards on the app AND landing page (`/og.png`).
- `robots`: legal placeholders are `noindex`; game + landing are indexable by default.
- Update `og:url`/canonical when the production domain is decided (RELEASE-GUIDE step 12).
