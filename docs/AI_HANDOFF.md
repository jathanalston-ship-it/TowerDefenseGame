# AI_HANDOFF.md — session handoff

> Read together with docs/PROJECT_STATUS.md and the latest docs/VALIDATION_REPORT.md.
> Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-08 · **Diff scope:** batch-4 (production deployment)
- **Branch:** claude/zen-hawking-rh1gxl

## Summary of work completed

Production deployment prep, end to end. The static SPA gained a thin,
fail-soft Cloudflare backend (Pages Functions + D1) for exactly the surfaces a
client must never decide alone: **Stripe Checkout purchases** (server-priced
sessions from the shared catalog, HMAC-verified webhooks with event dedupe,
exactly-once fulfillments, refund handling, boot-time claim recovery), **cloud
saves** (sync-code TOFU auth), **daily day-tickets** (clock-forgery-proof
daily submissions), **leaderboards** (Turnstile + bounds + keep-best), and a
**health check**. The sim remains 100% client-side and offline-playable; with
zero backend config the store falls back to its sandbox stub. Build hardened
for Pages (CSP/_headers, vendor chunk, lazy debug panel, source maps, deploy +
migration scripts). The one thing the next session must know: **the offer
catalog (src/core/premium.ts) is imported by BOTH the client and
functions/** — keep it DOM-free and lean (it now imports core/hash.ts, not
campaign.ts).

## Files modified / added

- `functions/**` (new): api endpoints + dependency-free lib (stripe REST,
  webhook HMAC, turnstile, D1 rate limit, validation, purchase persistence,
  test kit) + 24-scenario endpoint suites
- `migrations/0001_init.sql` (new): purchases · fulfillments (exactly-once PK)
  · webhook_events · cloud_saves · leaderboard · rate_limits
- `src/net/**` (new): identity/sync codes, checkout begin+claim, cloudSave,
  leaderboard, invisible turnstile — all fail-soft
- `src/state/meta.ts`: shared grant interpreter (`interpretGrants`),
  `applyVerifiedPurchase` (server-verified path), pending-checkout markers
- `src/save/saveStore.ts`: **v23** — premium.claimedReceipts +
  premium.pendingCheckout (sanitized, capped)
- `src/ui/`: PremiumStore provider branch + reveal pickup, App boot claim
  recovery + banner, Settings CloudBackup panel, Daily/BossRush standings
- Build/config: vite.config (vendor chunk, sourcemaps), public/_headers (CSP),
  wrangler.toml, .env.example, functions/tsconfig, package.json scripts
- Docs: DEPLOYMENT.md (rewritten for the new architecture), STRIPE-SETUP.md,
  SECURITY-AUDIT.md, GAME-STATE anchor (v23), DEPENDENCY_GRAPH

## Save changes

v22→v23, additive: `premium.claimedReceipts: string[]` (apply-once ledger,
capped 200) + `premium.pendingCheckout` (crash-recovery marker). Migration via
withDefaults; sanitizer extended; round-trip covered in
`src/state/verifiedPurchase.test.ts`.

## Known edge cases

- `PREMIUM.checkout` stays 'sandbox' as DATA; the live switch is
  `VITE_CHECKOUT_PROVIDER=stripe` (client env) + server secrets. Production
  refuses `sk_test_` keys via `ENVIRONMENT=production`.
- `applyVerifiedPurchase` deliberately skips availability re-checks (money
  moved; server enforced caps at checkout creation).
- A limit-1 pack CAN be bought twice across different 10-min rate windows —
  full price both times; accepted business rule (refund path documented).
- `/api/store/history` requires the sync token once a cloud slot exists.
- Turnstile + day tickets are SKIPPED when their secrets are unset (dev);
  the go-live checklist makes configuring them mandatory.
- FakeD1 (functions/lib/testkit.ts) throws on unknown SQL — new endpoint
  queries need a fake added or their tests fail loudly (by design).

## Remaining technical debt / recommendations

Ordered list lives in docs/SECURITY-AUDIT.md §4 (R1 replay verification for
leaderboards; R2 D1 export cadence; R3 optional accounts; R4 Stripe Radar;
R5 R2 for save history). No open criticals.

## Recommended next tasks

1. Run the docs/STRIPE-SETUP.md §6 test-mode flow on a real Pages preview
   (needs dashboard access — cannot be done from this repo alone).
2. R1: replay-verification Worker for top leaderboard claims (the sim is
   deterministic; `(seed, input log)` re-run).
3. Wire `/api/store/history` into a small Profile "Receipts" view (endpoint
   exists, UI deferred).

## Future expansion hooks

- `functions/lib/purchases.ts` — one place to extend fulfillment (e-mail
  receipts, entitlement webhooks).
- `PremiumOfferDef.kind: 'event'` — windowed offers already flow through the
  same checkout with zero backend change; future cosmetics/expansions are
  catalog rows.
- `wrangler.toml` — R2 bucket binding slot documented for save history.
