# SECURITY-AUDIT.md — production security audit (public release)

Audit of ASSIMILATE as software preparing for public release on the
Cloudflare Pages + Functions + D1 + Stripe stack (docs/DEPLOYMENT.md). The
governing threat model: **the entire simulation runs on the player's machine by
design**, so the security boundary is drawn around the things that cross it —
money, receipts, backups, day identity, and public standings. Anything that
never leaves the device can be edited by its owner; that is a property of the
architecture ("do not move gameplay simulation to the server"), and the audit
grades it accordingly instead of pretending client integrity is achievable.

Verification evidence: `functions/purchases.test.ts` + `functions/backend.test.ts`
(24 endpoint scenarios), `src/state/verifiedPurchase.test.ts` (client ledger),
an XSS sink sweep (zero `dangerouslySetInnerHTML` / `innerHTML` / `eval` /
`document.write` in `src/`), a bundle secret sweep (no `sk_`/`whsec_` strings in
`dist/`), and the CSP/security headers in `public/_headers`.

Severity scale: **Critical** (money/account loss) · **High** (cross-player
damage) · **Medium** (public-surface abuse) · **Low** (self-inflicted /
cosmetic).

> **Companion framework:** the client-side **Game Action Security Layer**
> (docs/SECURITY.md — `src/security/`) now implements the audit's client-side
> hardening as ARCHITECTURE: a central action registry with data-driven rate
> limits, duplicate-request windows, a persist-level flood valve, clock-rollback
> detection, debug release-hardening (`VITE_RELEASE_HARDENED`), and build-failing
> enforcement so new economy surfaces cannot ship unguarded.

---

## 1. System-by-system review

### Authentication & identity
- **Design:** no accounts, no PII. An anonymous UUID (`playerId`) names the
  player; a 256-bit random `syncToken` proves cloud-slot ownership
  (trust-on-first-use; only its SHA-256 is stored). The pair is the copyable
  "sync code".
- **Risks:** a leaked sync code = someone else can read/overwrite that cloud
  save (Low–Medium: the player holds the secret, like a password; the UI says
  to treat it as one). A lost code = the cloud slot is orphaned (Low: local
  save + local backups remain; purchases remain restorable via receipts).
- **Verdict: acceptable for launch.** Recommendation R3 covers the account
  upgrade path.

### Save system
- **Local saves** are localStorage with a djb2 checksum + rolling backups. The
  checksum detects corruption, not malice — the owner can edit their save.
  **Risk: Low (self-cheat in a single-player economy).** All import paths run
  the full sanitizer (`parseImport` → `withDefaults` type-clamping), so a
  crafted save cannot smuggle unexpected shapes into the app.
- **Cloud saves** are server-validated: envelope check, 256 KB cap, JSON parse,
  token auth, rate limits — and re-sanitized on restore. **Risk: Low.**
- **XSS via save fields:** none found — React renders text nodes exclusively
  (sink sweep clean), and the only field that reaches OTHER players
  (leaderboard name) is additionally stripped server-side.

### Premium purchases (the real security boundary)
- **Server-authoritative end to end.** The client never sends a price; the
  server derives amounts from the in-repo catalog. Fulfillment requires
  Stripe-verified `paid`, catalog-matching amount, metadata-bound player, and
  winning the `fulfillments` PRIMARY KEY. Refunds flip the record via signed
  webhooks and claims stop granting. Exactly-once holds at three independent
  layers (Stripe idempotency key, fulfillments PK, client `claimedReceipts`).
  All of it covered by the automated failure-mode suite (cancelled, failed,
  duplicate webhook, forged/stale signature, refund, interruption, double
  click, second tab, refresh, power loss, tampered amount, foreign claim).
- **Purchase spoofing / webhook abuse:** signature (HMAC-SHA256, constant-time
  compare, 5-minute tolerance) + event-id replay dedupe + catalog amount
  verification. A forged webhook without the signing secret is a 400; a
  replayed one is a no-op. **Risk: Low.**
- **Residual:** a memory editor can still hand ITSELF Ichor locally (below);
  it cannot create a paid receipt, and support/restore always reflects the
  server ledger. **Verdict: launch-ready.**

### Power Score
- Client-computed progression metric. It buys nothing server-side; on
  leaderboards it is a display CLAIM, bounds-checked (≤ 5×10⁷). Spoofing is
  cosmetic vanity on a board that already accepts client score claims (see
  Leaderboards). **Risk: Low.**

### Economy (biomass, cores, Ichor, containers, mats)
- Entirely client-side by design; nothing server-side consumes client-claimed
  balances. Money cannot mint prestige currency, cross campaign/evolution
  gates, or exceed the epic equipment cap — enforced by the type system and
  `premiumSafeguards` tests. **Infinite currency / infinite Ichor / infinite
  containers via memory or localStorage editing: possible, self-only, Low** —
  no other player is affected, no refundable value is created, and the
  server's purchase ledger stays truthful.

### Leaderboards (honest assessment)
- Because the sim is client-side, a submitted score is a **claim, not a
  proof**. Layered friction: Turnstile (bot gate), per-IP rate limits, strict
  integer bounds (wave ≤ 1000, score ≤ 5×10⁸), server-bound day tickets
  (below), keep-best-per-player upsert (spam cannot flood), name
  sanitization, and origin checks. A skilled cheater CAN place a fake entry
  within those bounds. **Risk: Medium (public surface, no in-game value).**
  The deterministic sim leaves a designed seam for real verification — submit
  `(seed, input log)` and re-run serverside — deliberately not built now per
  the no-server-simulation constraint. Recommendation R1.

### Daily Run
- The plan is **deliberately public-deterministic** (same run worldwide,
  offline included) — seed secrecy is not a goal. What the server DOES own is
  the calendar: `/api/daily/seed` issues an HMAC **day ticket** bound to
  (day, player), and daily submissions require it plus the matching server-day
  key. Clock-shifting a device can no longer submit yesterday's/tomorrow's
  daily. Scouting the day early by precomputing the plan is possible and
  symmetric for everyone. **Risk: Low.**

### Boss Rush
- Stamina and entry gates are client-side (self-cheat only, Low). Rush
  leaderboard entries share the daily board's protections minus day binding
  (all-time board). **Risk: Medium** under the same honest claim model.

### Progression / rewards / inventory
- All client-side; grants from purchases flow through the same capped
  pipelines as gameplay rewards (no legendary/exotic direct grants, containers
  roll normal odds — validated in `premiumSafeguards`). Reward duplication
  through the PURCHASE lane is closed by the exactly-once chain. **Risk: Low.**

## 2. Cross-cutting checks

| Vector | Finding |
|---|---|
| XSS | No dangerous sinks in `src/` (sweep clean); React text-node rendering; leaderboard names stripped server-side AND capped; CSP as backstop |
| Injection (SQL) | Every D1 statement uses bound parameters (`?N`); no string-built SQL anywhere in `functions/` |
| CSP / headers | `default-src 'self'`; scripts only self + Turnstile + CF Analytics; `frame-ancestors 'none'`; `X-Frame-Options DENY`; `nosniff`; COOP; HSTS; Permissions-Policy minimal |
| Secrets | Server-only env vars; bundle sweep clean; `.dev.vars`/`.env*` gitignored; production refuses `sk_test_` keys (`ENVIRONMENT` guard) |
| CSRF | State-changing endpoints reject mismatched `Origin`; no cookies exist (nothing ambient to ride) |
| Rate limiting | Every endpoint, per-IP fixed windows in D1; Cloudflare DDoS/WAF sits in front of everything |
| Replay | Webhooks: event-id dedupe + timestamp tolerance. Claims: idempotent by design (replay returns `alreadyGranted`). Tickets: HMAC-bound to day+player |
| Browser storage exploits | localStorage is self-owned data only; identity keys are opaque random values; no tokens of value to OTHER origins (strict CSP, no third-party JS beyond allowlisted CF) |
| Dependency surface | Runtime deps: react, react-dom. Functions: zero dependencies. Supply-chain exposure is minimal and lockfile-pinned |

## 3. Remaining risks (accepted or deferred)

| # | Risk | Level | Why accepted |
|---|---|---|---|
| A1 | Local save/memory editing self-grants progression & currencies | Low | Single-player economy; server never consumes client balances; no cross-player harm |
| A2 | Leaderboard entries are bounded claims, not proofs | Medium | Real verification needs replay checking (R1); launch scope keeps sim off the server |
| A3 | Sync-code theft exposes that player's cloud save | Low–Med | Player-held secret with explicit password framing; no PII in saves |
| A4 | Turnstile/rate limits are friction, not proof-of-human | Low | Industry-standard posture for this tier |
| A5 | Refunded purchases don't claw back already-spent virtual goods | Low | Deliberate: support decision, full server ledger exists |

## 4. Recommendations (post-launch, in order)

1. **R1 — Replay verification for leaderboards:** the sim is deterministic;
   accept `(seed, compressed input log, result)` and re-simulate the top N
   claims in a scheduled Worker. Turns A2 from claims into proofs without
   touching gameplay latency.
2. **R2 — D1 operational hygiene:** scheduled `wrangler d1 export` backups and
   a retention window; alert on webhook failure rates from the Stripe
   dashboard.
3. **R3 — Optional accounts (passkeys or OAuth) IF social features grow** —
   replaces sync codes with recoverable identity; keep the anonymous path.
4. **R4 — Stripe Radar rules** once volume exists (velocity + prepaid-card
   rules on the two largest bundles).
5. **R5 — R2 for save history** (versioned backups) if cloud saves outgrow the
   single D1 slot.

## 5. Independent diff review (pre-release pass)

A focused second-pass security review of the full backend diff (payment flow,
webhook crypto, auth models, SQL surface, CSRF reasoning, CSP) confirmed **no
exploitable findings at the ≥0.7-confidence reporting bar**. Specific attacks
verified unexploitable: foreign-session minting via claim (our-key retrieval
404s foreign sessions; player binding from server-set metadata), price/offer
tampering (catalog re-asserted at webhook AND claim), idempotency-key
collisions (player-scoped), signature forgery/replay (raw-body HMAC,
tolerance, constant-time, event dedupe), Turnstile skip forcing, cloud-save
token timing, SQL injection (all statements parameterized), FakeD1 reachability
(test-only), leaderboard cross-player id leakage (ids never emitted), and CSP
weakening (none — strictly additive).

Four sub-threshold observations (0.25–0.40 confidence, all gated on
unguessable UUIDs) were recorded; one was fixed anyway for auth-model
consistency: `GET /api/store/history` now requires the sync token whenever the
player has a cloud slot (previously UUID scope alone). The remainder map to
accepted risks A1–A3 above. One business rule was noted and accepted: a
player who completes two checkouts for a limit-1 pack in different rate
windows pays twice and receives twice — full-price both times, refundable via
the standard support path; not an entitlement or money-theft vector.

## 6. Verdict

**Cleared for public release.** Every surface where real value moves (money,
receipts, refunds, backups) is server-verified, replay-safe, idempotent, and
covered by automated failure-mode tests. Every surface that stays on the
device is honestly classified as self-owned. The one Medium item (leaderboard
claims) is disclosed, bounded, and has a designed upgrade path that does not
compromise the client-side simulation constraint.

### RC re-audit (2026-07-08, release-candidate pass)

Surfaces added since the batch-4 audit, re-reviewed:

- **`DELETE /api/save`** — sync-token auth (TOFU hash), idempotent, rate-limited
  (10/10min/IP) — same posture as PUT/GET. No new trust boundary.
- **Committed `.env.production`** — PUBLIC build values only by contract;
  `npm run preflight` hard-fails if `sk_live|sk_test|whsec_` patterns ever appear
  in it. Server secrets flow exclusively through `wrangler pages secret put`
  (`npm run setup-secrets`), never through the repo.
- **Field Research (rewarded ads)** — all grants are CLIENT-side save mutations
  routed through `interpretGrants` day-caps; there is no server value at stake, so
  the cheat ceiling equals ordinary local-save editing (accepted, documented risk
  class — leaderboards remain the only competitive surface and carry their own
  server-side envelope checks).
- **Analytics `/api/events`** — aggregate counters only; no identifiers beyond the
  coarse event name; rate-limited; nothing PII-shaped to leak.

Verdict unchanged: no criticals; residual risks remain the §4 ranked list
(R1 leaderboard replay verification first). Exactly-once purchase pipeline is
still pinned by the 33-scenario backend suite (runs in `npm test`).

### R1 — IMPLEMENTED (2026-07-08): leaderboard replay verification

The sim's fixed-step accumulator makes `Game.stepCount` a complete timeline, so daily
runs now RECORD their full input log (`src/core/replay.ts`: every UI→sim call with its
step index + the exact constructor args + the end step). The blob (~10KB, 256KB cap)
persists with the day's best (save v25 `daily.lastReplay`), ships with the submission,
and lands in D1 (`migrations/0003_replay.sql`: `replay`, `verified`).

`npm run verify-leaderboard` re-simulates the day's unverified top claims with the real
sim and stamps verdicts: match → `verified=1` (a ✓ the client can render); mismatch →
`verified=-1` and the row VANISHES from `/api/leaderboard/top`. A better score resets
verification — every claim earns its own re-run. Debug-assisted runs (god mode, spawn
cheats) diverge on replay by construction, so they flag themselves.

Proven by `src/core/replay.test.ts`: exact outcome reproduction through the recorded UI
funnel, honest-claim acceptance, forged-claim + tampered-log rejection, and
record-vs-unrecorded observational equality. Residual: entries without a blob (old
clients) stay `verified=0` — visible but unbadged; the operator loop runs it daily.
