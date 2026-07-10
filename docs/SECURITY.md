# SECURITY.md — the Game Action Security Layer

The centralized protection framework every meaningful player action passes through before
executing. Companion to **docs/SECURITY-AUDIT.md** (the release audit + threat model): the
audit defines WHAT must be protected and grades the server boundary; this layer is the
client-side architecture that protects it — and everything else — automatically.

**Threat model recap (from the audit):** the entire simulation runs on the player's machine
by design. The hard boundary is what crosses the device line — money, receipts, cloud saves,
day identity, public standings — and the SERVER owns truth there (Stripe session claims +
fulfillment PKs, replay re-simulation for leaderboards, rev-based sync). This layer's job is
everything the server can't see: accidental double-fires, UI spam, runaway loops, scripted
flooding, offline clock games, and the maintenance problem of REMEMBERING to protect each
new system.

---

## §pipeline — the standardized action flow

```
Player input
  → UI boundary            (in-run actions: deterministic debounce — a blocked click never
  |                         becomes a sim input; the sim itself is NEVER wall-clock gated)
  → guard(actionId, key?)  (permission/state validation stays in the domain method)
  |    ├─ duplicate window (same key inside dedupeMs — double-click / lag resubmit / 2nd tab)
  |    ├─ cooldown         (hard spacing between accepted actions)
  |    └─ token bucket     (limit.count per limit.perMs, burst up to count)
  → domain validation      (currencies, ownership, eligibility, caps — the method's own checks)
  → execution + persist()  (one chokepoint: flood valve + clock high-water mark + cross-tab
  |                         writer arbitration, automatic for every CURRENT AND FUTURE
  |                         meta mutation; run settles are replay-cached — §replay)
  → save integrity         (checksummed blob, rolling backups — save/saveStore.ts)
  → analytics + log        (block ring buffer, onSecurityBlock listener)
  → UI feedback            (SecurityPulse — one throttled "hold on" nudge)
```

Key architectural rule: **guards live OUTSIDE the deterministic sim.** A run is a pure
function of seed + inputs (docs/GAME_CONSTITUTION.md); rate limiting in-run verbs with wall
clocks would corrupt replays, dailies, and the golden tests. In-run spam is absorbed at the
input boundary instead — a blocked click simply never enters the input stream.

## §engine — src/security/actionGuard.ts

- `guard(id, key?)` → `{ok:true}` or `{ok:false, block:{reason, retryInMs}}`. Reasons:
  `duplicate` (same key in the window), `cooldown`, `rate` (bucket empty), `flood`, and
  `conflict` (cross-tab takeover — reported by the arbiter via `reportConflict`, not a guard).
- **Token buckets** refill continuously (`count` per `perMs`); burst up to the full count.
- **Inert outside the browser.** The deterministic suite, economy personas and balance sims
  hammer meta methods thousands of times per second by design — in Node the layer is off
  unless a test enables it (`setSecurityEnabled(true)` + `setSecurityClock(fake)`).
- `admitWrite()` — the persist flood valve: ≤20 disk writes per rolling second; overflow
  coalesces into a 300 ms trailing flush (in-memory state stays exact; the newest state
  always lands on disk).
- `noteClock()` / `securityClockAnomaly()` — a device-local high-water mark (localStorage,
  deliberately NOT in the save: a clock is a device property and must not sync/merge).
  Rollback beyond 5 minutes flags the session. Time-keyed systems already self-heal on
  rollback (done-flags + stored timestamps pause rather than duplicate) — the flag makes the
  anomaly observable rather than silent.
- `securityLog()` — a 200-entry ring of blocks (timestamp, action, reason, retry) for
  debugging + analytics. `onSecurityBlock(fn)` feeds the UI pulse.

## §registry — src/security/registry.ts

Every guarded action declares: id, category (`purchase · claim · economy · progression ·
network · account`), level, bucket, cooldown, dedupe window, analytics tag, a one-line doc
contract, and `at:` — the file its guard call site must live in.

### §standards — rate-limit levels

| Level | Shape | For |
|---|---|---|
| permissive | ~12/10 s+ | opens/toggles a fast player legitimately spams |
| moderate | ~8–20/10 s | repeatable economy ops (crafting, upgrades, salvage) |
| strict | ≤2/s sustained (enforced) | value-dense claims/purchases with ceremonies |
| critical | ≤0.5/s sustained (enforced) | money, account surgery, network budgets |

Two shapes are deliberate NON-rules:
- **Grants that land after a paid ceremony** (roulette results, run outcomes) are never
  hard-guarded — blocking one would eat value the player already paid for. The upstream
  spend/ceremony is the pace; the domain stays idempotent.
- **Iterated claims** (claim-all) size their bucket to a full legitimate burst.

## §enforcement — new content inherits protection automatically

1. **The persist chokepoint.** Every meta mutation — including ones written years from now —
   flows through `persist()`, so flood control + clock marking need zero per-feature wiring.
2. **The name-shape scan** (securityRegistry.test.ts): any `meta.ts` method named like an
   economy mutator (`buy* · claim* · spend* · unlock* · salvage* · reforge* · upgrade* ·
   purchase*`) must be in `GUARDED_META_METHODS` or the explicit allowlist WITH A REASON —
   otherwise the build fails.
3. **Registry ↔ call-site symmetry:** every policy's `at:` file must contain
   `guard('<id>')`; every binding's method must exist on `meta`. Both directions tested.
4. **Policy completeness:** `securityActionProblems` validates every entry (positive limits,
   namespaced analytics tags, doc contracts, level ceilings) — same pattern as every content
   registry in the game.

### Future-developer checklist (new system with player actions)

- [ ] Name the abusable actions; add one `ActionPolicy` per action to `SECURITY_ACTIONS`
      (pick the LEVEL first, inherit its shape).
- [ ] Add one `guardOk('<id>', key?)` line at the top of each domain entry point; return the
      method's natural failure value.
- [ ] Economy-named method? Add it to `GUARDED_META_METHODS` (or the allowlist, with the
      reason reviewed).
- [ ] Grants that follow a paid ceremony: do NOT hard-guard; make the domain idempotent.
- [ ] Network calls: strictest budgets; the server stays the source of truth.
- [ ] Debug/dev affordances: gate on `isDebugEnabled()` — release hardening must compile
      them out.
- [ ] `npm test` — the enforcement suite tells you what you forgot.

## §economy — validation conventions

The guard layer does RATE/DUPLICATE protection only. Resource validation stays in the domain
method (costs, ownership, eligibility, caps, progression gates) — it already exists on every
purchase path and must run AFTER the guard, never instead of it. Nothing may mutate the save
without passing `persist()` (the chokepoint), and no reward may be claimable twice by design
(claimed-ledgers, done-flags, receipt PKs — see §cloud).

## §cloud + §offline

- **Cloud saves:** rev-based optimistic concurrency + conflict UI (net/syncEngine.ts) with a
  hard MIN_INTERVAL; the `sync.push` guard adds a client budget on top. Merges route through
  save/merge.ts — schema changes need BOTH migration paths (see the DIL conflict edge).
- **Purchases:** session-id transaction flow with a persisted pending marker, boot-time
  recovery, a client `claimedReceipts` ledger AND a server fulfillments PK — exactly-once
  from both directions (net/checkout.ts). `purchase.checkout` spaces the entry.
- **Rewarded ads (Field Research):** claims are day-keyed + per-reward counted in the save;
  the `research.claim`/`pass.ad` guards space them; a real provider callback becomes the
  eligibility source when ads go live (never client say-so alone).
- **Leaderboards:** server re-simulates submitted replays (verified flag), best-per-player
  serverside, turnstile tokens; the `leaderboard.submit` guard keeps the client polite.
- **Offline:** everything works offline by design; time-keyed systems self-heal on clock
  rollback, and `securityClockAnomaly()` surfaces manipulation for analytics/support.

## §replay — run settlement happens exactly once

`meta.finishRun` is the single most value-dense action in the game (currencies, XP, loot,
directives, quests, contracts, infestation all settle there), so it carries structural
replay protection: a `WeakMap<RunResult, RunOutcome>` settle-once cache. The SAME result
object re-entering (a double game-over event, an effect re-fire, a navigation replay)
returns the FIRST settle's outcome without touching the save — duplicate run rewards are
impossible by construction. Object identity is the key: two legitimate runs are two distinct
result objects, and settled entries garbage-collect with the run. No token plumbing, no API
change, and every current and future run mode inherits it automatically.

## §tabs — cross-tab write arbitration (src/security/tabArbiter.ts)

Two tabs open on the same save are a duplicate-reward machine: each boots from the same
blob, both persist independently — last-writer-wins silently clobbers, and replaying a claim
in the stale tab pays it twice. The arbiter makes the NEWEST writing tab the owner:

- Every disk write stamps a **writer mark** (`assimilate.saveWriter` — a separate key, never
  inside the checksummed blob).
- Other tabs observe the mark through the `storage` event (which never fires for the writer
  itself) and latch **STALE**: the in-memory session keeps working, but `persist()` stops
  writing to disk (including the trailing flood-flush) and `SecurityPulse` shows a
  persistent "another tab took over — reload" notice (`reportConflict('save.tabConflict')`,
  block reason `conflict`).
- No merge machinery, no prompt fatigue — the resolution is always "reload the stale tab".

Node-safe (window-gated), tested on its pure parts (tabArbiter.test.ts), and inherited
automatically — future systems persist through the same chokepoint.

## §debug — release hardening

Debug tooling is OFF in production by default (`?debug` opt-in only). Building with
`VITE_RELEASE_HARDENED=1` compiles the entire surface to a dead branch — no `?debug` door,
no `window.__game` handle, and every `meta.debug*`/`devReset` mutator returns inert (each is
gated on `isDebugEnabled()`, enforced by test). CI, previews and the headless harnesses keep
the opt-in because they intentionally build WITHOUT the flag.

## §logging + §feedback

Blocked actions land in the ring log with action/reason/retry — read it in the console via
`securityLog()` (debug builds). The only player-visible surface is `SecurityPulse`: one
throttled "hold on" pill; legitimate players essentially never see it, which is the point —
the framework is invisible until something abnormal happens.

## Known limitations / future hooks

- In-run input debouncing beyond the natural UI pacing is a per-surface decision; the sim
  boundary rule (no wall-clock in the sim) is permanent.
- Analytics tags are declared per action but event *emission* is wired only for blocks (the
  ring + listener); a full funnel can subscribe later without registry changes.
- When a real server authority grows beyond purchases/leaderboards/sync, each new endpoint
  registers a `network`-category action here and keeps the server as truth.
