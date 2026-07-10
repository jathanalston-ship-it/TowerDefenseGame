# PIL.md — the Public Intelligence Layer

> The DIL's public-facing extension (docs/DIL.md): the DIL is the internal brain; the **PIL keeps
> every player-facing surface — website pages, guides, blog, encyclopedia, media/screenshots,
> store listings, patch notes — synchronized with the true state of the game.** The objective:
> the website can never silently go stale. When the game changes, the public surfaces that
> depend on that change are a LOOKUP, not an investigation.

- **Code:** `src/dev/pil/pil.ts` (page registry, media manifest, graph, impact, audit),
  `scripts/pil.ts` (CLI), `src/dev/pil/pil.test.ts` (CI enforcement).
- **Written form:** `docs/PIL_REPORT.md` (generated — audit + staleness + inventories).
- **Graph:** pages and assets join the DIL graph as `page:`/`asset:` nodes;
  `page —references→ <dil node>` declares the sync contract, `asset —visualizes→ <dil node>`
  declares what a screenshot depicts.

## Query it

```
npm run pil -- impact system:towers   # the game changed HERE — which pages/assets update?
npm run pil -- audit                  # structural rot scan (exit 1 on findings)
npm run pil -- staleness              # advisory: pages whose referenced systems moved since review
npm run pil -- regen                  # rewrite docs/PIL_REPORT.md
```

## How it stays true

| Layer | Source | Freshness |
|---|---|---|
| Guide pages | `site/guides.ts` (the SAME registry the site generator renders) | automatic — a new guide auto-joins |
| Blog pages | `public/blog/*/` directories | automatic — a new post auto-joins |
| Singleton pages (home, features, FAQ, encyclopedia, legal…) | declared in `SINGLETON_PAGES` | one row per page |
| Media assets | `public/media/shots/*` auto-join + declared brand assets | automatic + curated `depicts` |
| References → game truth | DIL node ids (validated: a ghost reference FAILS CI) | enforced |

## The enforcement contract (pil.test.ts — runs in `npm test`/validate)

- Every `public/**/index.html` is registered (a new page must join the graph).
- Every page reference resolves to a live DIL node (a REMOVED system still marketed = failure).
- Every site-relative link resolves (`/play/`+`/api/` are known build outputs).
- No placeholder markers or retired terminology in shipped copy.
- Every manifest asset exists on disk; the committed report is fresh and clean.

## Workflows

- **Feature ships** → `pil -- impact <node>` lists the pages to re-read and assets to re-capture;
  update them, bump each page's `lastReviewed`, `pil -- regen`, commit.
- **Visual overhaul** → mark affected assets `stale` in the manifest (they surface in the report
  as the replacement task list); re-capture, set `capturedAt`, restore `current`.
- **New guide/blog post** → write it through the existing registries; the PIL ingests it
  automatically and the audit verifies its links/copy the same day.
- **Staleness sweep** → `pil -- staleness` compares each page's `lastReviewed` against the git
  mtimes of the systems it references — the "the game moved; re-read this page" list.

## The release lane (division of labor with Chronicle)

**Chronicle** (`npm run notes`, docs/CHANGELOG-PIPELINE.md) already owns commit history → release
truth: the in-game Update Briefing (`src/changelog/releases.gen.ts`), the website patch notes
(`site/patchnotes.json` → /news/), `docs/HISTORY.md`, and dev-blog DRAFTS every ≥10 commits.
The PIL rides on top of that single source:

- **`npm run pil -- release`** → `store/{steam,googleplay,appstore}.md`: canonical marketing copy
  (`src/dev/pil/storeCopy.ts` — tagline, descriptions, feature bullets, SEO keywords) + the latest
  Chronicle release as each store's "What's New" + the screenshot checklist from the media
  manifest. Per-store character caps are ENFORCED at generation (a paste can never be rejected).
  Written once, emitted everywhere — updating a listing is editing `storeCopy.ts` and re-running.
- **Sitemap enforcement**: gen-site writes `public/sitemap.xml`; the PIL audit fails if any
  registered page is missing from it (SEO rot is structural rot).

## Seams left open (next passes)

- **Screenshot automation**: the responsive gate's headless harness (scripts/mobilecheck.ts) can
  capture per-screen shots into `public/media/shots/` with manifest entries stamped per commit
  (they auto-join the manifest and the store checklists today).
- **Per-shot curation**: `depicts` defaults to gameplay for auto-joined shots; curate as the
  library grows so `pil -- impact` flags exactly the right captures.
