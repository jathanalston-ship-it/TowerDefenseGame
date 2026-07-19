# DEPLOYMENT.md — Production deployment (Cloudflare Pages + Functions)

Step-by-step instructions to put ASSIMILATION online, written for someone who has
**never deployed on Cloudflare before**. The game is a **static SPA** (React +
TypeScript + Vite) with a **thin serverless backend** (Cloudflare Pages
Functions + D1) for exactly the things a client must never decide alone:
payment verification, purchase fulfillment, cloud save, day authority, and
leaderboards. **Gameplay simulation stays 100% client-side and fully playable
offline** — every backend lane fails soft.

---

## 1. Architecture

```
                        ┌──────────────────────────────┐
                        │        Cloudflare CDN        │
  Player's browser ───▶ │  Pages (static dist/)        │
  · the whole game      │  _headers: CSP, HSTS, cache  │
  · deterministic sim   │  Web Analytics (optional)    │
  · localStorage saves  └──────────┬───────────────────┘
        │                          │ same-origin /api/*
        │                          ▼
        │               ┌──────────────────────────────┐      ┌─────────────┐
        │               │   Pages Functions (Workers)  │ ───▶ │ Cloudflare  │
        └── /api/* ───▶ │  /api/store/checkout ─┐      │      │     D1      │
                        │  /api/store/claim     │      │      │ purchases   │
             Turnstile  │  /api/stripe/webhook ◀┼──────┼──┐   │ fulfillments│
             (invisible │  /api/save            │      │  │   │ cloud_saves │
              bot gate) │  /api/daily/seed      │      │  │   │ leaderboard │
                        │  /api/leaderboard/*   │      │  │   │ rate_limits │
                        │  /api/health          │      │  │   └─────────────┘
                        └───────────┬───────────┘      │  │
                                    │ create/retrieve  │  │ signed webhooks
                                    ▼ session          │  │ (HMAC verified)
                        ┌──────────────────────────────┐  │
                        │        Stripe Checkout        │─┘
                        │ (hosted page — full redirect; │
                        │  card data never touches us)  │
                        └──────────────────────────────┘
```

Design rules this deployment follows:

- **Lowest cost**: everything runs on Cloudflare free tiers (Pages, Functions,
  D1, Turnstile, Web Analytics). Stripe charges per transaction only. R2 is
  deliberately NOT used — cloud saves are ≤256 KB JSON and live in D1; R2 is
  the documented upgrade path if save blobs or downloadable asset packs ever
  outgrow that.
- **No gameplay on the server**: the sim is deterministic and client-side; the
  backend only owns money, backups, day identity, and score claims.
- **Fail-soft**: with zero backend configuration the game still builds, runs,
  and plays offline (the store falls back to its sandbox stub, standings show a
  quiet offline note).
- **Fast cold starts**: the Functions bundle is dependency-free (hand-rolled
  Stripe REST client over `fetch` + WebCrypto; no SDK), so a cold Worker start
  is single-digit milliseconds of JS.

## 2. Directory structure

```
<repo root>/
├─ package.json            npm scripts (build / deploy / db:migrate)
├─ package-lock.json       committed — reproducible installs (npm ci)
├─ .node-version           pins Node 20 for Pages builds
├─ .env.example            every env var documented (copy → .env.local)
├─ wrangler.toml           Pages/Functions + D1 binding for local dev & CLI
├─ index.html              Vite entry
├─ vite.config.ts          build: hashed assets, vendor chunk, source maps
├─ public/
│  ├─ _headers             CSP + security headers + immutable asset caching
│  └─ _redirects           front door (/ → /welcome/ 302) + SPA fallback (/* → /index.html 200; game at /play)
├─ migrations/
│  └─ 0001…0004_*.sql      D1 schema + migrations (0004 = accounts/sessions/reset_tokens
│                          + cloud_saves rev/meta — docs/ACCOUNTS.md)
│     0001_init.sql        base schema (purchases/fulfillments/webhook_events/
│                          cloud_saves/leaderboard/rate_limits)
├─ functions/              Cloudflare Pages Functions (file-routed /api/*)
│  ├─ tsconfig.json        workers-typed, strict
│  ├─ lib/                 env, http, crypto, stripeApi, stripeWebhook,
│  │                       turnstile, rateLimit, validate, purchases, testkit
│  ├─ api/
│  │  ├─ health.ts         GET  /api/health
│  │  ├─ save.ts           GET/PUT /api/save
│  │  ├─ daily/seed.ts     GET  /api/daily/seed
│  │  ├─ store/checkout.ts POST /api/store/checkout
│  │  ├─ store/claim.ts    POST /api/store/claim
│  │  ├─ store/history.ts  GET  /api/store/history
│  │  ├─ stripe/webhook.ts POST /api/stripe/webhook
│  │  └─ leaderboard/      submit.ts · top.ts
│  ├─ purchases.test.ts    the failure-mode suite (see §8)
│  └─ backend.test.ts      save/daily/leaderboard suite
├─ src/                    the game (sim core, UI, state) — unchanged model
│  ├─ core/premium.ts      THE offer catalog — client display AND server truth
│  ├─ core/hash.ts         shared seed primitive (client daily == server daily)
│  └─ net/                 client side of every lane (identity, checkout,
│                          cloudSave, leaderboard, turnstile) — all fail-soft
└─ dist/                   build output (Pages serves this)
```

## 3. Environment variables

Client variables ship in the bundle (public) and live in the COMMITTED
`.env.production` (a Pages dashboard variable of the same name overrides the file).
Server variables are secrets: `npm run setup-secrets` pushes them with
`wrangler pages secret put` (add `--preview` to mirror the preview env); locally they
go in `.dev.vars` (gitignored). `ENVIRONMENT` needs no setup — it ships in
`wrangler.toml` (`[vars]` production / `[env.preview.vars]` preview).

| Variable | Side | Required | Purpose |
|---|---|---|---|
| `VITE_CHECKOUT_PROVIDER` | client | for real store | `sandbox` (default — dev stub) or `stripe` |
| `VITE_TURNSTILE_SITE_KEY` | client | recommended | Turnstile site key (public) |
| `VITE_ARENA_RELAY_URL` | client | for human PvP | `wss://` arena relay (ONLINE-FOUNDATION.md §relay); unset ⇒ every Arena queue resolves to the AI opponent. Device override: `assimilate.relayUrl` |
| `STRIPE_SECRET_KEY` | server | for real store | `sk_live_…` (production) / `sk_test_…` (preview) |
| `STRIPE_WEBHOOK_SECRET` | server | for real store | `whsec_…` from the webhook endpoint |
| `TURNSTILE_SECRET_KEY` | server | recommended | Turnstile secret; absent ⇒ bot checks skipped |
| `DAY_TICKET_SECRET` | server | recommended | random 32+ bytes hex (`openssl rand -hex 32`) |
| `MOD_KEY` | server | for auction moderation | secret for `/api/auction/flags` (docs/AUCTION-HOUSE.md §6); absent ⇒ lane closed (503) |
| `DEV_KEY` | server | for the dev analytics app | secret for `/api/dev/*` (docs/ANALYTICS.md §devapp); absent ⇒ dev API closed (503) |
| `ENVIRONMENT` | server | recommended | `production` / `preview` — production refuses `sk_test_` keys |

Rules: **never** put a secret in a `VITE_` variable; never commit real values;
production and preview get **different** Stripe keys (live vs test mode).

## 4. First-time setup (one-time, ~20 minutes)

1. **Repo on GitHub** — commit everything including `package-lock.json`.
2. **Pages project** — dash.cloudflare.com → Workers & Pages → Create →
   Pages → Connect to Git → pick the repo. Build settings:

   | Setting | Value |
   |---|---|
   | Framework preset | Vite |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | *(blank)* |

   Node is pinned by `.node-version`. Save and deploy — the game is live
   (static + functions; backend lanes stay dormant until configured).
3. **D1 database** — locally: `npx wrangler@3 login`, then
   `npx wrangler@3 d1 create assimilate-db`. Paste the printed `database_id`
   into `wrangler.toml`. Apply the schema: `npm run db:migrate`. Then bind it
   to Pages: project → Settings → Functions → **D1 database bindings** → add
   binding, variable name **`DB`**, select `assimilate-db`. Redeploy.
4. **Turnstile** — dash → Turnstile → Add site (your domains, Managed mode).
   Put the **site key** in the Pages env as `VITE_TURNSTILE_SITE_KEY` and the
   **secret key** as `TURNSTILE_SECRET_KEY`.
5. **Stripe** — follow **docs/STRIPE-SETUP.md** (keys, webhook, test cards).
6. **Day tickets** — set `DAY_TICKET_SECRET` to `openssl rand -hex 32` output.
7. **Web Analytics** (optional) — Pages project → Settings → **Web Analytics**
   → Enable. Zero code; the CSP in `public/_headers` already allows the beacon.
8. **Custom domain** (optional) — Pages → Custom domains. Note: localStorage
   saves are domain-scoped; pick the final domain before sharing widely.

## 5. Everyday deployment

- `git push` to the production branch → Pages builds (`npm ci` +
  `npm run build` = typecheck (app + functions) + Vite) and deploys atomically.
  Every other branch/PR gets an isolated preview URL with the same functions.
- **CI production contract (`.github/workflows/deploy.yml`)** — a green run MEANS
  production changed: the job (1) PATCHes the Pages project's `production_branch` to the
  deploying branch on every run (the create-time `--production-branch` flag only counts on
  the first-ever deploy — a project born under another branch silently turns every later
  deploy into a hash-URL *preview* while production sits frozen; this happened once and is
  now structurally impossible to miss), (2) stamps `dist/version.json` with the commit
  SHA, and (3) polls the LIVE production host (subdomain resolved from the API) until it
  serves that exact SHA — mismatch after 5 minutes fails the workflow. `GET
  /version.json` on production is also the human check for "did my deploy land?".
- CLI alternative: `npm run deploy` (wrangler direct upload).
- Schema changes: add `migrations/000N_*.sql` → `npm run db:migrate`
  (`db:migrate:local` for the local dev database).
- Local full-stack dev: `npm run dev` (game only, sandbox store) or
  `npm run dev:full` (build + `wrangler pages dev dist` = static + functions +
  local D1; put dev secrets in `.dev.vars`).
- Rollback: Pages → Deployments → ⋯ → Rollback (static + functions revert
  together; D1 is append-mostly and migrations are additive). Code-level:
  `git revert <sha> && git push` redeploys the previous behavior. Data-level:
  `npm run db:backup` exports every table to timestamped JSON — restore by
  replaying the export with `wrangler d1 execute` (schema never drops columns,
  so old exports stay loadable). Secrets: re-run `npm run setup-secrets`
  (rotation is one command; takes effect next deploy).

## 6. Build pipeline facts (verified)

| Concern | State |
|---|---|
| Production build | `npm run build` — tsc strict (app + functions) then Vite |
| Tree shaking / minification | Vite/Rollup + esbuild defaults (ES2020 target) |
| Code splitting | stable `vendor` chunk (react) + lazy `DebugPanel`; the game ships as one app chunk on purpose (everything is needed at boot; more slicing = waterfalls, not wins) |
| Asset hashing / versioning | all bundles content-hashed under `/assets/*` |
| Browser caching | `_headers`: `/assets/*` immutable 1y; HTML short-cache; `/api/*` no-store |
| Compression | Cloudflare serves Brotli/gzip at the edge automatically |
| Source maps | emitted (`sourcemap: true`) — client has no secrets; production errors stay debuggable |
| Env vars | typed via `src/vite-env.d.ts`; secrets never in the bundle (grep `sk_live` in `dist/` — nothing) |
| Reproducibility | `package-lock.json` + `.node-version` + `npm ci`; no build-time timestamps |
| Cold starts | functions bundle is dependency-free; D1 is the only binding |

## 7. Backend endpoints (the complete surface)

| Endpoint | Purpose | Protections |
|---|---|---|
| `POST /api/store/checkout` | create a Stripe Checkout Session for one catalog offer | origin check, rate limit, Turnstile, server-side price + offer caps |
| `POST /api/stripe/webhook` | Stripe events → purchases/refunds | HMAC signature + 5-min tolerance, event-id dedupe, catalog amount check |
| `POST /api/store/claim` | verify + fulfill exactly once | rate limit, id validation, player binding, fulfillments PK idempotency |
| `GET /api/store/history` | receipts for support/restore | rate limit, sync-token auth (falls back to UUID scope pre-cloud-slot) |
| `PUT/GET/DELETE /api/save` | versioned cloud save (rev + meta headline; `baseRev` ⇒ 409 conflict contract; `?meta=1` probe) | token hash (TOFU) OR account session, size cap, envelope check, rate limit |
| `POST /api/account/guest` | formalize the device identity as a Guest Account | TOFU token claim, rate limit |
| `POST /api/account/register` | email/password account — always a guest UPGRADE (same account_id keeps saves + purchases) | PBKDF2-SHA256 (210k), email uniqueness, password policy, rate limit 6/h |
| `POST /api/account/login` | cross-device sign-in → 90-day opaque session | uniform errors (no enumeration), rate limit 10/10min |
| `POST /api/account/logout` | revoke one session | rate limit |
| `GET/POST /api/account/me` | account view + cloud headline / profile + monotonic playtime | session or token auth, rate limit |
| `POST /api/account/password` | change password (requires current) + session rotation | rate limit 6/10min |
| `POST /api/account/reset` | password reset request/confirm (single-use 30-min tokens) | email seam (`RESET_EMAIL_WEBHOOK`, unset ⇒ 503), rate limit 5/h |
| `GET /api/daily/seed` | day authority + HMAC day ticket | rate limit (the seed itself is public by design) |
| `POST /api/leaderboard/submit` | score claim | origin, rate limit, Turnstile, bounds, day ticket, keep-best upsert |
| `GET /api/leaderboard/top` | standings | rate limit |
| `GET /api/health` | deploy smoke check | booleans only, no values |

## 8. Purchases (the money path)

```
click buy → confirm modal → POST /api/store/checkout (Turnstile, caps, price
from src/core/premium.ts — the client never sends an amount)
  → redirect to Stripe Checkout (hosted; card data never touches us)
    → webhook: signature-verified, deduped, catalog-checked → purchases row
    → return URL: /?checkout=success&session_id=…
      → POST /api/store/claim → fulfillments PK decides the ONE winner
        → meta.applyVerifiedPurchase(offerId, receiptId) applies grants ONCE
          (claimedReceipts ledger) → reveal ceremony + timeline entry
```

Exactly-once is enforced **three times independently**: Stripe idempotency key
on session creation, the `fulfillments` primary key on the server, and the
`claimedReceipts` ledger on the client. Interruption recovery: the pending
checkout is persisted BEFORE redirect and re-claimed on every boot until it
resolves (paid → delivered; expired/refunded → cleared). Refunds flip the
purchase row via webhook and claims stop granting immediately.

Automated failure-mode suite (`functions/purchases.test.ts`,
`functions/backend.test.ts`, `src/state/verifiedPurchase.test.ts`): cancelled
payment, failed payment, duplicate webhook, different-event same-session,
forged/stale signatures, refund, claim-before-webhook (network interruption),
double click / second tab / refresh / power loss replays, amount tampering,
player mismatch, offer caps, rate limiting, input validation, hostile names.
Manual test flow with Stripe test cards: docs/STRIPE-SETUP.md §6.

## 9. Production checklist

- [ ] Pages project builds green from a fresh clone (`npm ci && npm run build`)
- [ ] D1 created, `migrations/` applied, binding `DB` attached to Pages
- [ ] `STRIPE_SECRET_KEY` = **live** key in production env only
- [ ] Webhook endpoint added in Stripe (live mode) + `STRIPE_WEBHOOK_SECRET` set
- [ ] `VITE_CHECKOUT_PROVIDER=stripe` set on production (preview can stay sandbox or test-mode)
- [ ] Turnstile site + both keys configured
- [ ] `DAY_TICKET_SECRET` set (random, unique per environment)
- [ ] `ENVIRONMENT=production` set on production env (test-key refusal)
- [ ] Web Analytics enabled (optional)
- [ ] Custom domain attached + HTTPS active (automatic)
- [ ] `docs/SECURITY-AUDIT.md` reviewed; no open criticals

## 10. Deployment verification checklist (after every production deploy)

- [ ] Game loads at the production URL; hard-refresh shows the new build
- [ ] `GET /version.json` on the production host returns the pushed commit SHA
      (CI enforces this automatically — a red `deploy` run means production did NOT change)
- [ ] `GET /api/health` → `{ ok: true, db: true, stripe: true, webhook: true, turnstile: true, dayTickets: true, environment: "production" }`
- [ ] DevTools → Network: `/assets/*` served with `cache-control: immutable`; response headers include the CSP
- [ ] A **test-mode preview** purchase completes end-to-end (Stripe test card `4242 4242 4242 4242`) and delivers ONCE
- [ ] Refreshing the return URL does NOT grant again (`alreadyGranted`)
- [ ] Stripe Dashboard → Webhooks: recent deliveries all `200`
- [ ] Cloud backup + restore round-trips from Settings
- [ ] Daily screen shows standings; a submitted run appears with your profile name
- [ ] Browser console: zero errors on the hub and in a run
- [ ] Offline check: DevTools offline → the game still boots and plays; store/standings degrade quietly

## 11. Troubleshooting

Everything from the static era still applies (blank page ⇒ wrong output dir
`dist`; SPA 404s ⇒ `_redirects`; stale tab ⇒ hard refresh). Backend additions:

- **`/api/*` returns 404** — functions not deployed: confirm the `functions/`
  directory is committed and the build log lists "Functions".
- **`/api/health` says `db: false`** — the D1 binding is missing/misnamed: it
  must be exactly `DB` (Settings → Functions → D1 bindings), then redeploy.
- **Store button says unavailable** — `STRIPE_SECRET_KEY` unset, or production
  is holding a `sk_test_` key (refused by design; see `ENVIRONMENT`).
- **Webhook 400s in Stripe** — wrong `STRIPE_WEBHOOK_SECRET` (each endpoint has
  its own `whsec_…`; live and test differ).
- **Purchases stuck "processing"** — webhook unreachable AND claim's live
  verify failing: check both keys; the client retries on every boot, nothing is
  lost.
- **Turnstile always failing** — site key/secret from different Turnstile
  sites, or the domain isn't listed on the Turnstile site config.

### Auto cloud sync (accounts-lite)

The account sync engine (`src/net/syncEngine.ts`, docs/ACCOUNTS.md) mirrors the save to the
cloud slot automatically: any change marks dirty; flushes at most every 150s (≤4 of the
server's 12 PUTs/10min) plus an immediate flush when the tab hides (the mobile
"closed the game" moment). Unnamed saves never sync; offline/unconfigured backends
fail soft. The Settings → Cloud panel shows the last automatic mirror time, and the
existing sync-code flow is the cross-device recovery path.

## §ci — automated production deploys (GitHub Actions)

`.github/workflows/deploy.yml` runs the blessed deploy path (`npm run build` → `wrangler pages
deploy dist --project-name assimilate`) on every push to the development branch, plus manual
"Run workflow". It needs two repo secrets (Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN` — My Profile → API Tokens → Create Token → the Pages/Workers edit
  template (must include **Pages: Edit**).
- `CLOUDFLARE_ACCOUNT_ID` — Workers & Pages, right sidebar.

Until both exist the workflow builds (CI signal) and prints a notice instead of failing. The
deploy step is idempotent: it creates the `assimilate` Pages project on the first ever run.
Note: this is the DIRECT-UPLOAD flow (matching `npm run deploy`); do not also git-connect the
same Pages project in the dashboard, or the two will fight over production.

**Contract hardening (2026-07-19):** the workflow now (a) re-runs `npm run site` at HEAD
before building, so deployed patch notes are always current to the deploying commit
(committed artifacts remain the reviewable record), and (b) **fails RED when the
Cloudflare secrets are missing** — the bootstrap-era soft skip is gone; a push that cannot
change production is a failure by definition.

## §rollback — undoing a faulty deploy

Two speeds, both safe:

1. **Instant (CDN-level, no commit)** — Cloudflare dashboard → Workers & Pages →
   `assimilate` → Deployments → pick the previous deployment → **Rollback**; or
   `npx wrangler@3 pages deployment list --project-name assimilate` and re-promote from
   the dashboard. Production flips atomically to the prior build. Follow up with the git
   revert below so the next push doesn't re-deploy the fault.
2. **Source-of-truth (one commit)** — `git revert <bad-sha> && git push` on the deploying
   branch. CI rebuilds, redeploys, and the verify gate confirms production serves the
   reverted tree. Chronicle artifacts are committed data, so notes/news revert with it.
