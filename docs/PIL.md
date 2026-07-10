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

## Seams left open (next passes)

- **Release pipeline**: single-source `releases.ts` → patch-notes page + in-game What's New +
  per-store "what's new"/description bundles + SEO keywords (no duplicate writing).
- **Blog cadence**: `pil -- blog-draft` scaffolding a draft from the git log since the last release.
- **Screenshot automation**: the responsive gate's headless harness (scripts/mobilecheck.ts) can
  capture per-screen shots into `public/media/shots/` with manifest entries stamped per commit.
- **Store listings**: Steam/Google Play/App Store copy as data files under the same audit.
