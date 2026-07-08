# RELEASE-GUIDE.md — publishing ASSIMILATE, step by step

The complete launch manual, written for someone who has **never published a web game**.
Follow it top to bottom; each step says where to click, what to paste, and how to know
it worked. Companion references: docs/DEPLOYMENT.md (architecture + troubleshooting),
docs/STRIPE-SETUP.md (payment detail), docs/WEBSITE.md (site/ads/analytics),
docs/PRODUCTION-READINESS.md (the scorecard).

Total time: ~2–3 hours the first time, most of it account signups and DNS waiting.

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
   npx wrangler@3 d1 create assimilate-db
   ```
   Paste the printed `database_id` into `wrangler.toml`, commit + push, then apply the
   schema: `npm run db:migrate`.
   Docs: https://developers.cloudflare.com/d1/get-started/

6. **Bind the database**: Pages project → **Settings → Functions → D1 database
   bindings** → Add: variable name **DB** → select `assimilate-db` → Save → **Redeploy**
   (Deployments → ⋯ → Retry). ✅ `https://<project>.pages.dev/api/health` shows `"db": true`.

7. **Bot protection (Turnstile)**: dashboard → **Turnstile** → **Add site** → name it,
   add `<project>.pages.dev` (add your custom domain here later too), widget mode
   **Managed** → copy both keys. Pages → **Settings → Environment variables** →
   Production (and Preview):
   - `VITE_TURNSTILE_SITE_KEY` = the site key
   - `TURNSTILE_SECRET_KEY` = the secret key (mark as Secret)
   Docs: https://developers.cloudflare.com/turnstile/get-started/

8. **Day tickets**: same env screen —
   - `DAY_TICKET_SECRET` = output of `openssl rand -hex 32` (Secret)
   - `ENVIRONMENT` = `production` (Production env) / `preview` (Preview env)
   Redeploy. ✅ `/api/health` now shows `turnstile: true, dayTickets: true`.

## Phase 2 — payments (test mode first, ALWAYS)

9. **Stripe test keys**: Stripe dashboard, **Test mode** toggle ON → **Developers →
   API keys** → copy the Secret key (`sk_test_…`) → Pages env (Preview environment):
   `STRIPE_SECRET_KEY` = it (Secret), and set `VITE_CHECKOUT_PROVIDER` = `stripe`
   (Preview). Docs: https://docs.stripe.com/keys

10. **Test webhook**: Stripe → **Developers → Webhooks → Add endpoint** →
    URL `https://<project>.pages.dev/api/stripe/webhook` → select exactly these events:
    `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
    `charge.refunded`, `charge.refund.updated` → Add → reveal **Signing secret**
    (`whsec_…`) → Pages Preview env: `STRIPE_WEBHOOK_SECRET` = it (Secret). Redeploy.
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
    HSTS). Update `og:url`-adjacent tags: `index.html` + `public/welcome/index.html`
    canonical/OG comments (search "og:url"). Add the domain to the Turnstile site (step 7).
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
    live `sk_live_…` + a NEW live webhook endpoint + its `whsec_…` → put both in the
    **Production** environment only. Set `VITE_CHECKOUT_PROVIDER=stripe` (Production).
    Redeploy production. The backend REFUSES test keys in production by design.
17. **One real purchase**: buy the $1.99 vial with a real card, verify delivery, then
    refund it from the Stripe dashboard (both sides of the money path proven live).

## Phase 5 — analytics, ads, SEO

18. **Analytics**: Pages project → **Settings → Web Analytics → Enable** (sessions/
    pageviews, cookie-free — the CSP already allows the beacon). Game-event counters
    are live automatically once D1 is bound; read them per docs/WEBSITE.md §4:
    ```bash
    npx wrangler@3 d1 execute assimilate-db --remote \\
      --command "SELECT * FROM analytics_counters ORDER BY day DESC, kind LIMIT 50"
    ```
19. **Ads** (optional, later): the game ships with the Field Research lane HIDDEN
    (`VITE_ADS_PROVIDER=none`) and site ad slots hidden. When you choose a network:
    site ads per docs/WEBSITE.md §3; rewarded studies per docs/RESEARCH.md §providers
    (adapter + env value + CSP hosts). Verify with `VITE_ADS_PROVIDER=simulated` on a
    preview first — the whole reward loop runs against the themed stub.
20. **SEO check**: share the URL in a Discord/Twitter DM to yourself — the OG card
    (og.png) should render. Validate at https://cards-dev.twitter.com/validator and
    https://developers.facebook.com/tools/debug/. Confirm `/welcome/` renders and
    links back to `/`.

## Phase 6 — launch

21. **Legal placeholders → real**: complete `/welcome/privacy.html` and
    `/welcome/terms.html` (counsel review; the skeletons state actual behavior).
22. **Final sweep**: run every box in docs/DEPLOYMENT.md §10 (deployment verification)
    against production, and skim docs/PRODUCTION-READINESS.md for open items.
23. **Fill the placeholders you're ready for**: trailer embed, newsletter form,
    Discord invite (`public/welcome/index.html` markers).
24. **Launch**: push the announcement post to `/welcome/news.html`, share the link,
    and watch Deployments + Stripe webhooks + `analytics_counters` on day one.
    Rollback safety: Pages → Deployments → ⋯ → Rollback (instant).

---

### The 60-second daily operations loop after launch

- Cloudflare: Deployments green? Web Analytics trend?
- Stripe: payments/disputes/webhook failures?
- `analytics_counters`: sessions, funnel, research usage.
- `git push` ships; every PR gets its own preview URL with the same backend wiring.
