# AI_HANDOFF.md — session handoff

> Read together with docs/PROJECT_STATUS.md and the latest docs/VALIDATION_REPORT.md.
> Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-08 · **Diff scope:** batch-5 (public-release package; batch-4 summary below still applies)
- **Branch:** claude/zen-hawking-rh1gxl

## Summary of work completed

**Batch 5c (operator-zero pass):** a REAL 45s gameplay trailer recorded headlessly from
the build (playwright recordVideo + the playwright ffmpeg component symlinked 1011→1010
in /opt/pw-browsers) now lives at /welcome/trailer.webm and plays on the landing page.
Google H5 Games Ads is fully wired (src/ads/googleAdapter.ts — defensive adBreak reward
flow) behind `npm run set-ads -- google --client ca-pub-…` (CSP swap + ads.txt + site
slots) and `-- off`. `npm run setup-db` collapses D1 setup to one command; preflight
prints a ready-to-paste DAY_TICKET_SECRET. Operator remainder: accounts/keys, AdSense
approval (if ads wanted), legal sign-off, live purchase smoke.

**Batch 5b (release-simplification pass):** everything doable without the operator's
accounts is now done. Complete review-ready legal drafts (privacy/terms describe actual
behavior; only contact + governing-law tokens remain) backed by a NEW cloud-data
deletion lane (DELETE /api/save + Settings button + test — the policy's deletion right
is real). `npm run set-domain -- <domain> --contact <email>` fills every domain/contact
string in one command (og/canonical/robots/sitemap/legal; round-trip tested).
`npm run preflight [-- --url …]` prints ✓/–/✗ launch state with exact next actions;
`npm run db:backup` snapshots D1. robots.txt + sitemap.xml added. Accessibility raised
to B− (app-wide prefers-reduced-motion, labeled battlefield canvas; :focus-visible
already existed). v1.0.0 stamped. Operator's remaining list: accounts/keys, one
set-domain run, legal sign-off, live purchase smoke.

**Batch 5 (this session):** the public-release package. Marketing site at `/welcome/`
(+news/privacy/terms skeletons, hidden modular ad slots via `ads.js`), branding/PWA
(manifest + generated icons + OG card + boot splash + full social meta), aggregate
analytics (`/api/events` → D1 `analytics_counters`, client beacon `src/net/events.ts`,
server-truth purchase counters in webhook/claim), and FIELD RESEARCH — the optional
rewarded-ad lane (core/research.ts registry + save v24 `research` block +
meta.claimResearch/researchView + one-run boosts folded at finishRun/metaModifiers +
src/ads/provider.ts with `VITE_ADS_PROVIDER` none/simulated). Ships HIDDEN by default.
Sharp corner: research grants reuse meta.interpretGrants — any store-safeguard change
covers research automatically. docs/RELEASE-GUIDE.md + docs/PRODUCTION-READINESS.md are
the launch handoffs; readiness blockers: legal pages, live-Stripe smoke, domain strings.

--- batch-4 record follows ---

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

## Batch 5c — media pipeline + last-mile setup (2026-07-08)

- **Hi-DPI battlefield**: `GameView` backs the canvas at `devicePixelRatio` (clamped ×3)
  and re-asserts the DPR base transform EVERY frame (the render loop's per-frame
  `setTransform` reset must use `dpr`, never identity). `canvas.board` CSS caps at the
  logical 720×960 via `min(100%, …)` so the bigger backing store can't inflate layout.
  DPR=1 is byte-identical; node/jsdom tests never enter the branch.
- **Display-only rounding**: integrity + hero HP text render sites use `Math.round`
  (hive current additionally clamps ≤ max — regen float overshoot read "823/822").
- **Capture recipe (stills + trailer)**: Playwright fake clock (`page.clock.install`
  BEFORE goto) + `clock.runFor(step)` frame-stepping at deviceScaleFactor 2.
  `page.screenshot` internally waits on a rAF the frozen clock never fires — start the
  screenshot, `runFor` the second half-step to release it, then await (≈10× faster).
  Legibility art direction: filter `g.floats` to numerics (+ mega narrative lines
  `WEAK POINT|CHANNELING|DESTROYED`) and monkey-patch `floats.push` with the same
  predicate while capturing — reaction words (SHRED/FERMENT/…) fire in cadence-tick
  bursts and otherwise bury the board. Force mega drama deterministically:
  `g.mega.abilityCd = cds.map(() => 0.1)` (casts → weak points + banners), keep at most
  one tide zone (`g.mega.active` radius entries), `debugDamageMega` for phase pushes.
- **Media encoding**: playwright's bundled ffmpeg decodes MJPEG but NOT PNG — trailer
  frames are JPEG q90, assembled with `libvpx` VP8 into WebM; stills are downscaled to
  1200w WebP via a browser canvas (`toDataURL('image/webp')`). Landing uses
  `shots/{command,combat,megaraid}.webp`; poster = combat.webp.
- **Last-mile setup**: `npm run setup-secrets` pushes the four server secrets with
  `wrangler pages secret put` (auto-generates `DAY_TICKET_SECRET`; `--preview` mirrors
  to the preview env); `ENVIRONMENT` ships in `wrangler.toml` `[vars]`/`[env.preview.vars]`;
  public build values live in the COMMITTED `.env.production` (dashboard vars still
  override). Preflight validates the file and refuses committed secrets.

## RC pass addendum (2026-07-08, same session)

Full 12-phase release-candidate audit → `docs/RELEASE-CANDIDATE.md` (scorecard, top-10).
Live-probe recipes (all against `npm run preview`, headless chromium, mature-profile
storageState): 17-screen crawl at 1280/390/320 with overflow + console tripwires;
click-spam dup probes (vault: found + fixed a burst multi-open — ref-window guard in
GeneticVault.crack); localStorage corruption fuzz (5 shapes, all recover);
frame/heap profiling (sim-only `g.advance` timing isolates engine from raster);
cold-start FTUE walk (found + fixed the tutorial "100100/100100" readout — TutorialRunner
now uses god-mode instead of a +100000 integrity bonus).

## R1 + mobile batch (2026-07-08, same session)

- Replay verification shipped end-to-end (see SECURITY-AUDIT §R1 — IMPLEMENTED):
  `core/replay.ts` (recorder wraps the 21-method UI→sim funnel; step-indexed log;
  `end` step pins the claim), GameView records daily runs, save v25 `daily.lastReplay`,
  submit/top/migration 0003, `npm run verify-leaderboard` (wrangler-auth, no new API).
- Mobile: `npm run mobilecheck` gate (in validate) + `mobileContent.test.ts` caps.
  CSS: body overflow-x hidden; drawer + tooltip visibility pattern; ≤520px 24px tap
  floor; wave-banner 100vw clamp + full shrink/wrap chain; conveyor self-scrolls.
  Latent bug fixed: the ≤640 build-bar clamp (line ~2188) was silently dead — the
  BASE rule later in the file overrode it; the clamp now lives on the base rule.
