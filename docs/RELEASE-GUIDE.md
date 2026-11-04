# RELEASE-GUIDE.md — publishing ASSIMILATION, step by step

The complete launch manual, written for someone who has **never published a web game**.
Follow it top to bottom; each step says where to click, what to paste, and how to know
it worked. Companion references: docs/DEPLOYMENT.md (architecture + troubleshooting),
docs/STRIPE-SETUP.md (payment detail), docs/WEBSITE.md (site/ads/analytics),
docs/PRODUCTION-READINESS.md (the scorecard).

Total time: ~2–3 hours the first time, most of it account signups and DNS waiting.

## The fast path (what YOU actually type/click — everything else is already done)

Repo-side work is complete: build, backend, store, site, branding, analytics, legal
drafts, tests. Your part is accounts + secrets + one command:

1. Sign up: GitHub · Cloudflare · Stripe (Phase 0).
2. Create the Pages project from the repo (step 4) — the game is live.
3. `npx wrangler@3 login` then `npm run setup-db` (creates the database, writes
   the id, applies the schema — everything except the dashboard binding, which it
   prints). Bind as `DB`, redeploy (step 6).
4. `npm run setup-secrets -- --turnstile-secret 0x… --stripe-key sk_… --webhook-secret whsec_…`
   — pushes all server secrets with wrangler (`DAY_TICKET_SECRET` is auto-generated,
   `ENVIRONMENT` already ships in wrangler.toml). Public values live in the committed
   `.env.production`: paste your Turnstile SITE key there (and later flip
   `VITE_CHECKOUT_PROVIDER=stripe`), commit + push. No dashboard forms needed;
   the dashboard env screen still works and overrides the file if you prefer it.
4b. Ads, whenever you want them: `npm run set-ads -- google --client ca-pub-…`
   (repo-side is 100% wired — the ONLY external gate is AdSense/H5 Games approval
   on your live domain). `npm run set-ads -- status` audits all four surfaces;
   preflight checks coherence too. Ships hidden until enabled.
5. `npm run set-domain -- play.yourdomain.com --contact you@yourdomain.com`
   → commit + push (fills every domain/contact string incl. the legal pages;
   the one string left for a human is `PLACEHOLDER_JURISDICTION` in terms.html).
6. `npm run preflight -- --url https://your-deployment` — it prints ✓/–/✗ with
   the exact next action for anything unfinished.
7. Test-card purchase on a preview (step 11), live purchase + refund (step 17),
   read the legal drafts once (they describe real behavior), launch (step 24).

The numbered phases below are the same journey with full detail and links.

---

## Phase 0 — accounts (free)

1. **GitHub** — https://github.com/signup. Push this repository to a repo you own
   (docs/DEPLOYMENT.md §4.1 has the exact git commands if it isn't on GitHub yet).
2. **Cloudflare** — https://dash.cloudflare.com/sign-up. Free plan is enough.
3. **Stripe** — https://dashboard.stripe.com/register. Start in TEST mode; business
   verification (needed for live charges) can process while you do everything else.

## Phase 1 — deploy the game (playable URL in ~10 minutes)

4. **Create the Pages project**: Cloudflare dashboard → **Workers & Pages** →
   **Create application** → **Pages** → **Connect to Git** → authorize GitHub → pick the
   repo → **Begin setup**. Enter EXACTLY:
   - Framework preset: **Vite** · Build command: **npm run build** · Output dir: **dist**
   - Root directory: leave blank · Environment variables: none yet
   Click **Save and Deploy**, watch the build go green, open `https://<project>.pages.dev`.
   ✅ The game plays. (Store = sandbox, standings = offline note — expected: no backend yet.)
   Docs: https://developers.cloudflare.com/pages/get-started/git-integration/

5. **Create the database**: on your machine —
   ```bash
   npx wrangler@3 login
   npm run setup-db
   ```
   That creates `assimilate-db` (or finds it), writes its id into `wrangler.toml`,
   and applies the schema locally + remotely. Commit the wrangler.toml change.
   Docs: https://developers.cloudflare.com/d1/get-started/

6. **Bind the database**: Pages project → **Settings → Functions → D1 database
   bindings** → Add: variable name **DB** → select `assimilate-db` → Save → **Redeploy**
   (Deployments → ⋯ → Retry). ✅ `https://<project>.pages.dev/api/health` shows `"db": true`.

7. **Bot protection (Turnstile)**: dashboard → **Turnstile** → **Add site** → name it,
   add `<project>.pages.dev` (add your custom domain here later too), widget mode
   **Managed** → copy both keys. Then:
   - SITE key (public) → `.env.production` → `VITE_TURNSTILE_SITE_KEY=0x…` → commit + push
   - SECRET key → `npm run setup-secrets -- --turnstile-secret 0x…`
   Docs: https://developers.cloudflare.com/turnstile/get-started/

8. **Day tickets + environment**: nothing to do — `setup-secrets` auto-generates
   `DAY_TICKET_SECRET` the first time it runs, and `ENVIRONMENT` ships in
   `wrangler.toml` (`production` / `preview`). Redeploy after step 7.
   ✅ `/api/health` now shows `turnstile: true, dayTickets: true`.

## Phase 2 — payments (test mode first, ALWAYS)

9. **Stripe test keys**: Stripe dashboard, **Test mode** toggle ON → **Developers →
   API keys** → copy the Secret key (`sk_test_…`) →
   `npm run setup-secrets -- --stripe-key sk_test_… --preview` (`--preview` writes the
   preview env too, which is where test purchases run). Flip
   `VITE_CHECKOUT_PROVIDER=stripe` in `.env.production`, commit + push.
   Docs: https://docs.stripe.com/keys

10. **Test webhook**: Stripe → **Developers → Webhooks → Add endpoint** →
    URL `https://<project>.pages.dev/api/stripe/webhook` → select exactly these events:
    `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
    `charge.refunded`, `charge.refund.updated` → Add → reveal **Signing secret**
    (`whsec_…`) → `npm run setup-secrets -- --webhook-secret whsec_… --preview`. Redeploy.
    Docs: https://docs.stripe.com/webhooks

11. **Test purchases** (docs/STRIPE-SETUP.md §6 is the full script): on a PREVIEW
    deployment, buy the $1.99 vial with card `4242 4242 4242 4242` → returned to the
    game → reveal plays once → refresh: nothing doubles → cancel a second checkout →
    "nothing was charged" → refund the payment in Stripe → webhook shows 200s.
    ✅ All of docs/DEPLOYMENT.md §10's purchase checks pass on preview.

## Phase 3 — domain (optional but recommended before sharing)

12. **Custom domain**: Pages project → **Custom domains** → **Set up a custom domain**
    → enter `play.yourgame.com` (or the apex). If the domain's DNS is on Cloudflare,
    records are created automatically; otherwise add the shown CNAME at your registrar.
    **HTTPS is automatic** (certificate issues within minutes; `_headers` already sends
    HSTS). Then `npm run set-domain -- play.yourgame.com --contact you@…` rewrites every
    URL-bearing tag (og:url/canonical/robots/sitemap/legal contact) in one shot — commit
    + push. Add the domain to the Turnstile site (step 7).
    Saves are per-domain — pick the final domain BEFORE sharing widely.
    Docs: https://developers.cloudflare.com/pages/configuration/custom-domains/

13. **Caching**: nothing to configure — Pages serves `/assets/*` with the immutable
    header from `public/_headers` and compresses at the edge. (Verify in DevTools →
    Network after deploy: `cache-control: public, max-age=31536000, immutable`.)

14. **R2 / Workers**: NOT needed — this architecture deliberately uses Pages Functions
    (the Workers runtime inside Pages) + D1 only. See docs/DEPLOYMENT.md §1 for the R2
    upgrade path if save history/asset packs ever demand it.

## Phase 4 — go live with money

15. **Finish Stripe verification** (Test mode OFF): complete the business profile.
16. **Live keys**: repeat steps 9–10 in LIVE mode against the production domain —
    live `sk_live_…` + a NEW live webhook endpoint + its `whsec_…` →
    `npm run setup-secrets -- --stripe-key sk_live_… --webhook-secret whsec_…`
    (no `--preview`: production only). `.env.production` already says
    `VITE_CHECKOUT_PROVIDER=stripe` from step 9. Redeploy production.
    The backend REFUSES test keys in production by design.
17. **One real purchase**: buy the $1.99 vial with a real card, verify delivery, then
    refund it from the Stripe dashboard (both sides of the money path proven live).
18. **Paid random containers — regional compliance (HUMAN DECISION REQUIRED).** Checkout refuses SKUs that
    grant random containers/gear from the countries in the Pages env var
    `PAID_LOOTBOX_BLOCKED_COUNTRIES` (default `BE,NL`; see docs/PREMIUM-STORE.md §paid-loot-boxes), and
    the store hides them. **Open legal question:** Ichor bought with money and then spent on containers
    in-game is still arguably a paid loot box, and Ichor bundles are NOT gated by this switch. Get a legal
    decision (gate Ichor in restricted regions / odds disclosure / remove the path) BEFORE launching live
    payments in the EU.

## Phase 5 — analytics, ads, SEO

18. **Analytics**: Pages project → **Settings → Web Analytics → Enable** (sessions/
    pageviews, cookie-free — the CSP already allows the beacon). Game-event counters
    are live automatically once D1 is bound; read them per docs/WEBSITE.md §4:
    ```bash
    npx wrangler@3 d1 execute assimilate-db --remote \\
      --command "SELECT * FROM analytics_counters ORDER BY day DESC, kind LIMIT 50"
    ```
19. **Ads** (optional — everything is pre-wired; you bring the account):
    1. Sign up at https://adsense.google.com → **Add site** with your domain →
       complete the approval process (days to weeks; the game runs fine meanwhile).
    2. Copy your publisher id (Account → Account information, `ca-pub-…`).
    3. `npm run set-ads -- google --client ca-pub-…` → commit + push (CSP,
       ads.txt, site slots — all handled).
    4. Pages env (Production): `VITE_ADS_PROVIDER=google`,
       `VITE_ADS_GOOGLE_CLIENT=ca-pub-…` → redeploy.
    5. Until approval lands, in-game studies quietly report "unavailable" — test
       the full reward loop any time with `VITE_ADS_PROVIDER=simulated` on a preview.
    6. `npm run set-ads -- off` reverts everything.
    Game-focused alternates (often friendlier terms for web games): Applixir
    (https://www.applixir.com) and AdinPlay (https://www.adinplay.com) — each is one
    adapter class in `src/ads/` per docs/RESEARCH.md §providers.
19b. **Preflight**: `npm run preflight -- --url https://<your-domain>` — every ✓
    is verified, every – tells you the exact remaining step. `npm run db:backup`
    exports a timestamped D1 snapshot (run it before risky ops and on a calendar).
20. **SEO check**: share the URL in a Discord/Twitter DM to yourself — the OG card
    (og.png) should render. Validate at https://cards-dev.twitter.com/validator and
    https://developers.facebook.com/tools/debug/. Confirm `/welcome/` renders and
    links back to `/`.

## Phase 6 — launch

21. **Legal review**: the privacy policy + terms are COMPLETE drafts that state the
    software's actual behavior; `set-domain --contact` filled the contact. Read them
    once, set `PLACEHOLDER_JURISDICTION` (terms §8) with counsel, remove the
    "draft" italics lines, done.
22. **Final sweep**: run every box in docs/DEPLOYMENT.md §10 (deployment verification)
    against production, and skim docs/PRODUCTION-READINESS.md for open items.
23. **Fill the placeholders you're ready for**: trailer embed, newsletter form,
    Discord invite (`public/welcome/index.html` markers).
24. **Launch**: push the announcement post to `/welcome/news.html`, share the link,
    and watch Deployments + Stripe webhooks + `analytics_counters` on day one.
    Rollback safety: Pages → Deployments → ⋯ → Rollback (instant).

---

### The 60-second daily operations loop after launch

0. `npm run verify-leaderboard` — re-simulates today's top daily claims and hides
   any that don't reproduce (see docs/SECURITY-AUDIT.md R1). A few seconds.

- Cloudflare: Deployments green? Web Analytics trend?
- Stripe: payments/disputes/webhook failures?
- `analytics_counters`: sessions, funnel, research usage.
- `git push` ships; every PR gets its own preview URL with the same backend wiring.
