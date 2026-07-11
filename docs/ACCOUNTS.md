# ACCOUNTS.md — the account platform (identity, cloud saves, cross-progression, offline)

> **One account, every platform.** The player creates an account (or stays a guest), plays on Web,
> and later continues on Steam/Android/iOS exactly where they left off — or plays fully offline and
> syncs when connection returns. Gameplay code is platform-independent; only this platform layer
> knows about servers.

- **Server:** `functions/api/account/*` (guest/register/login/logout/me/password/reset),
  `functions/api/save.ts` (versioned cloud slot), `functions/lib/accounts.ts` (crypto/sessions/auth —
  THE provider seam), `migrations/0004_accounts.sql`.
- **Client:** `src/account/accountStore.ts` (device account state), `src/account/providers.ts`
  (provider registry + API), `src/save/envelope.ts` (modular versioned save wrapper),
  `src/save/merge.ts` (conflict merge), `src/net/syncEngine.ts` (the sync manager),
  `src/net/connectivity.ts` (offline + server-feature gating),
  `src/ui/components/AccountPanel.tsx` (all account UI).
- **Registry:** `accounts` (docs/DEPENDENCY_GRAPH.md). Tests: `functions/accounts.test.ts`,
  `src/save/envelope.test.ts`, `src/net/syncEngine.test.ts`.

---

## Design pillars

1. **Offline-first, forever.** The game saves to localStorage exactly as it always has; every
   gameplay system (campaign, infinite, boss rush, containers, crafting, progression) works with no
   account and no network. The platform layer is an overlay that mirrors and restores — it can
   vanish mid-session and play never notices.
2. **The identity IS the account.** The pre-existing anonymous identity (`src/net/identity.ts`:
   `playerId` UUID + 256-bit sync token) is formalized server-side as a **Guest Account** with the
   same id. Upgrading to email/password attaches credentials to the SAME `account_id` — saves,
   purchases, and leaderboard history carry over with **zero data movement**.
3. **Never lose progress silently.** Cloud writes are versioned (`rev`); a stale writer gets a 409
   and the player decides (keep local / keep cloud / merge). Every restore path snapshots a local
   backup first (the standard import pipeline).
4. **The client is untrusted.** Passwords are PBKDF2-SHA256 hashed (210k iterations, per-account
   salt); session/reset tokens are stored as SHA-256 only; purchases/entitlements are
   server-authoritative (Stripe webhook → D1, docs/DEPLOYMENT.md). The save checksum is an
   *integrity* check (corruption), not tamper-proofing — cheating a local save only ever cheats
   yourself; anything with real-money value lives server-side.

---

## Account types & the provider seam

| Provider | Status | Credential |
|---|---|---|
| **Guest** | live | device sync token (TOFU — first presenter claims the id) |
| **Email / Password** | live | PBKDF2 password → opaque 90-day session token |
| Steam / Google / Apple / Discord / anonymous-mobile | future | one new `AccountProvider` entry + one `resolveAccount` branch |

Provider logic lives in exactly TWO places — `functions/lib/accounts.ts#resolveAccount` (server) and
`src/account/providers.ts` (client registry). Route files and UI never see provider names, so a new
provider touches neither.

**Guest → account upgrade:** `/api/account/register` always upgrades the presented guest identity
(creating it implicitly if needed). Same `account_id` ⇒ nothing to migrate. Registration returns a
session; the device keeps playing seamlessly.

**Sign-out** drops the session and mints a **fresh guest identity** — post-sign-out progress never
rides the old account. The old account (and its cloud save/purchases) is reachable again by signing
back in.

## First-time experience

**Tutorial completers** get the account decision as the SAFEGUARD step of THE COMMISSIONING
(docs/PROFILE.md §commissioning) — guest / create account / sign in, asked after the first
rewards land (something to lose), reusing this platform's `AuthForms` + onboarded flag +
sync arm. `WelcomeGate` (App, menu screen) remains the fallback for everyone else (tutorial
skippers who reach the menu without meaningful progress): **Continue as Guest** (instant,
works offline; server registration is lazy on first contact) or **I have an account** (email
sign-in → cloud pull). Existing saves are grandfathered — the gate never nags a device that
already has a life.

---

## Save architecture — the envelope

The in-memory `SaveData` remains the single aggregate the game reads (public API untouched — that is
deliberate: 40+ systems consume it). The **persistence boundary** is where modularity lives:
`buildEnvelope(save, ctx)` partitions the save into **17 independent modules** (profile, wallet,
progression, towers, heroes, equipment, genes, campaign, infinite, bossRush, daily, collections,
loot, statistics, achievements, tutorial, core), wrapped with:

```
fmt (2) · schemaVersion · migration · accountId · platform · savedAt ·
playtimeSec · power · campaignStage · checksum · modules{…}
```

- **Losslessness is structural:** the `core` module claims every field no other module names, so a
  brand-new SaveData field ships automatically; `envelope.test.ts` pins round-trip identity.
- **Versioning:** `schemaVersion` (existing SaveData migration counter, sanitizer-driven) +
  `migration` (envelope-shape counter) + `fmt`. Old blobs (v1 export wrapper / bare SaveData) import
  forever — `openEnvelope` feeds the NORMAL `parseImport` sanitizer, so envelope restores get every
  defense file imports have.
- **Checksum:** dual-FNV over the canonical module JSON — corruption/truncation is refused before
  import. The headline (savedAt/playtime/power/stage/platform/checksum) uploads as server-side
  `meta`, so conflict UIs preview **without downloading the blob**.

## Cloud save & the sync engine

`src/net/syncEngine.ts` — bidirectional, silent when possible:

```
boot / reconnect / 30s tick / tab-hidden ──▶ probe /api/save?meta=1 ──▶ decideSync ──▶
   pull  (cloud moved, local clean — the cross-device "continue" moment)
   push  (local dirty, cloud where we left it; ≥150s cadence, baseRev attached)
   conflict (both moved, OR sign-in onto a device with an existing life)
   noop  (offline / clean / backoff window)
```

- **decideSync is pure** and unit-tested — those six rows ARE the sync policy.
- **Optimistic concurrency:** every accepted PUT bumps the server `rev`; a stale `baseRev` gets
  **409 + the winning headline** and the engine raises the conflict flow. Legacy clients (no
  baseRev) keep last-write-wins.
- **Retry:** network failures back off 30s·2ⁿ (cap 5 min), tracked in `SyncState`
  (`phase/lastError/attempts/nextRetryAt`); reconnect events trigger an immediate opportunistic step.
- **Manual sync:** Settings → Account → *Sync now* (`syncEngine.syncNow()`).

### Conflict resolution

`ConflictModal` (rendered app-wide) previews both sides — saved-when, playtime, Power Score,
campaign stage — and offers:

- **Keep this device** — force-push local (adopts the cloud rev as base).
- **Keep cloud** — import the server copy (a local backup is snapshotted first; recoverable).
- **Smart merge** (`src/save/merge.ts`) — conservative: the side with more playtime contributes
  everything by default; then **unions** for id collections (achievements, lore, titles, boss
  trophies) and **maxima** for monotonic records (bestWave, rush records, lifetime counters,
  per-tower/hero mastery XP + kills). Wallets/inventory are never summed across sides — records can
  only grow, currency can never dupe.

Nothing is EVER deleted silently.

## Offline mode

Offline is not an error state. `src/net/connectivity.ts` owns the truth (navigator.onLine + events)
and `SERVER_FEATURES` names the ONLY things that need a server: cloud sync, leaderboards, daily
refresh, store purchases, analytics. Each lane already fails soft; UI surfaces show the shared
status line ("Offline — progress is saved on this device and will sync when you reconnect").
Everything else — the entire game — runs untouched. On reconnect the engine syncs automatically.

## Purchases & entitlements

Purchases were already account-attached: Stripe fulfillment keys off `player_id`, which IS the
`account_id`. Signing in on any device resolves the same id ⇒ Ichor grants, bundles, cosmetics and
future entitlements follow the account, not the device. (docs/DEPLOYMENT.md §store.)

## Analytics

Privacy-preserving counters only (no ids — docs/WEBSITE.md): `account_guest`, `account_register`,
`account_login`, `sync_push`, `sync_pull`, `sync_conflict`, `sync_fail` (once per failure streak),
`offline_session`. Playtime/platform history live on the account row (`/api/account/me`, monotonic).

## Security summary

- Passwords: PBKDF2-SHA256, 210k iters, 16-byte salt, per-row iteration count (future cost bumps
  rehash on login); never logged, never stored plaintext; uniform login errors (no enumeration).
- Sessions: 256-bit opaque tokens, SHA-256 at rest, 90-day expiry, revoked on password change/reset.
- Password reset: single-use 30-min tokens; delivery via the `RESET_EMAIL_WEBHOOK` seam (unset ⇒
  503 `email-not-configured`); responses never reveal whether an email exists.
- Cloud slot auth: session OR the TOFU sync token; timing-safe compares everywhere.
- Rate limits per endpoint (login 10/10min/IP, register 6/h, reset 5/h, save 12 PUT/10min).

## Platform support

The client reports `currentPlatform()` (web today; Steam/Android/iOS shells override one function at
boot). The account records platform history; saves record the writing platform. Nothing in
`src/core`/gameplay imports any of this — the sim stays platform-free.

## Developer workflow

- Apply the migration: `npx wrangler d1 migrations apply assimilate-db` (see docs/DEPLOYMENT.md).
- Local dev: `wrangler pages dev` serves `/api/*` against local D1; `.dev.vars` for secrets
  (optional `RESET_EMAIL_WEBHOOK`).
- Tests: `functions/accounts.test.ts` (real handlers over FakeD1 — flows incl. cross-device
  continue, conflict 409, reset), `src/save/envelope.test.ts`, `src/net/syncEngine.test.ts`.

## Known limitations / future hooks

- Reset-email delivery needs a provider webhook configured (the endpoint + token machinery is live).
- Sessions table has no admin "sign out everywhere" UI yet (password change already rotates all).
- The envelope's per-module `migration` counter is scaffolding — no envelope-shape migration has
  shipped yet (SaveData migrations continue through the sanitizer/schemaVersion path).
- `currentPlatform()` returns 'web' until platform shells land.
- Guest accounts on storage-less browsers (private mode) are per-session — the account store falls
  back to memory like the identity module always has.
