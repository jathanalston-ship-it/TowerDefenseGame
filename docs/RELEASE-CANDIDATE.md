# RELEASE-CANDIDATE.md — final pre-release engineering pass

**Date:** 2026-07-08 · **Verdict: RELEASE CANDIDATE.** Ship after the three human
blockers in §3 (they require accounts/counsel, not code).

This report is the outcome of the full 12-phase RC pass: feature validation, edge-case
audit, visual/UX review, performance profiling, architecture + dead-code sweep, docs
audit, security re-audit, deployment prep, and a cold-start player-experience pass.
Method: everything below is **measured on the real build** (headless Chromium against
`npm run preview`), not asserted. Evidence commands are reproducible from the repo.

---

## 1. Readiness scorecard

| Axis | Score | Grounding (what was actually measured) |
|---|---|---|
| **Overall production readiness** | **92%** | All rows below; 3 human-only blockers remain (§3) |
| Visual polish | 93% | 17 screens × 3 widths (1280/390/320): ZERO overflow, zero console errors; type scale + tokens machine-enforced (`uiStandards`); sampled screens read as designed; new Hi-DPI media suite |
| Gameplay polish | 92% | 1223 tests / 172 files green; golden byte-identity; live smokes of all 4 modes + vault/lab/store flows; this pass fixed the vault burst-open and the tutorial integrity readout |
| Technical quality | 95% | TS strict + noUnusedLocals/Params; ZERO TODO/FIXME in shipping code; deterministic sim core with byte-pinned golden |
| Architecture quality | 95% | 209 modules — ZERO orphans (import-graph verified); every file claimed in the system registry; content behind registries (towers/biomes/megas/cards/rarities); dependency graph regenerated with no drift |
| Performance | 90% | Sim core **1.98 ms/tick @ 407 live enemies** (12% of a 60fps budget); heap FLAT at 22–26MB over 20s siege (pooling holds); frame cost beyond that is canvas raster, GPU-accelerated on real devices (headless software-render measured 43ms avg under a 4×-organic 412-entity + mega + boss load) |
| Documentation | 93% | Doc anchors test-pinned (docSync); graph test-pinned; live docs refreshed this pass (STATUS, DEPLOYMENT §rollback, SECURITY-AUDIT §RC, WEBSITE, READINESS, RELEASE-GUIDE) |
| Security | 90% | Exactly-once purchases at 3 independent layers (33-scenario backend suite); webhook signature + replay + dedupe; TOFU cloud saves; all endpoints rate-limited; RC re-audit of new surfaces recorded — zero criticals; residual list ranked in SECURITY-AUDIT §4 |
| Deployment readiness | 92% | One-command lanes: `setup-db`, `setup-secrets`, `set-domain`, `set-ads`, `preflight` (local + live probes); rollback runbook (code/static/data/secrets); `.env.production` public-config lane |
| Monetization readiness | 88% | Sandbox E2E purchase verified live this pass (grant applied through the verified pipeline); Stripe test-mode path scripted; NEEDS the live-key smoke (§3) and AdSense approval for the optional rewarded lane |
| Mobile readiness | 88% | 320px: zero horizontal overflow on all 17 screens; portrait-first layout; touch-action + tap targets in place; REMAINING: a real-device matrix (see Top-10 #3) |
| Desktop readiness | 95% | Primary dev/verify target; all evidence above gathered at desktop sizes too |
| Accessibility | 85% | focus-visible pass, reduced-motion honored (incl. outro/boot), aria labels/roles on interactive surfaces + canvas; deeper screen-reader flows untested |
| Future expandability | 95% | Registry + data-driven pipelines sized for the CLAUDE.md scale table (100 towers / 500 cards / 1000 upgrades); adding content = data rows, verified across 5 content batches |
| QA confidence | 90% | 1223 automated tests + `npm run validate` + this pass's live crawls/probes; the gap to 100 is human playtest hours, not machine coverage |

## 2. What this pass changed (fixes shipped)

1. **Vault burst-open** (found by an 8-click spam probe: 6 containers consumed at once)
   → ref-based burst guard; re-proved exactly-once under the same spam.
2. **Tutorial integrity readout** ("100100/100100" during the "your one life" spotlight —
   the +100000 fail-safe bonus leaked into the first number a new player reads)
   → the lesson's can't-lose guarantee now uses god-mode; the HUD shows the true 100/100.
3. **Hive/hero HP display rounding + clamp** ("823/822.2499999999999" class) — display-only.
4. **Hi-DPI battlefield** — devicePixelRatio-backed canvas (see AI_HANDOFF batch-5c notes).
5. Docs: DEPLOYMENT rollback runbook completed; RELEASE-GUIDE step 12 de-staled
   (set-domain does the URL rewrite); SECURITY-AUDIT RC re-audit appended; PROJECT_STATUS
   architecture-health numbers refreshed.

## 3. Launch blockers (human-only; no code missing)

1. **Legal sign-off** — the complete policy/terms drafts need a human read + the
   governing-law line (`PLACEHOLDER_JURISDICTION`).
2. **Live Stripe smoke** — one real purchase + refund on production keys (guide phase 4).
3. **`npm run set-domain`** once the real domain exists, then `npm run preflight -- --url …`.

## 4. THE TOP TEN — most significant remaining work, ranked

1. **Live-money verification + legal sign-off** — the only true launch gate.
   Why: real charges + refunds must be proven once on live keys; terms need counsel.
   Complexity: LOW (hours; guide phase 4 is the script). Player impact: none directly,
   existential for the operator. Dependencies: Stripe business verification, counsel.
   **Required before launch.**
2. **Real-device mobile matrix + touch-feel pass** — iOS Safari / Android Chrome on
   low/mid hardware: thermal frame pacing, audio unlock quirks, touch-target feel at speed.
   Why: measured desktop evidence doesn't cover device compositors/thermals; mobile is
   likely the majority audience. Complexity: MEDIUM (a day with devices; fixes usually
   small CSS/timing). Impact: HIGH retention. Deps: none. **Required before a wide
   launch; a soft launch can precede it.**
3. **Leaderboard replay verification (SECURITY-AUDIT R1)** — a Worker re-runs top daily
   claims from `(seed, input log)`; the deterministic core makes this cheap and turns
   leaderboards from honor-system into verified.
   Why: the one competitive surface an attacker can spoof today. Complexity: MEDIUM.
   Impact: HIGH for competitive integrity (invisible until someone cheats publicly).
   Deps: none (design documented). **Post-launch OK; ship before promoting leaderboards.**
4. **Authored audio pass** — the synth engine is complete and layered, but authored
   stems/mix (combat intensity buses, mega themes as composed pieces, UI foley set)
   would move feel more than any remaining visual work.
   Complexity: MEDIUM-HIGH (content, not architecture — hooks all exist). Impact: HIGH
   on perceived quality. Deps: audio assets/budget. **Post-launch update.**
5. **Accounts + cross-device cloud saves** — TOFU sync tokens work but are device-bound
   trust; email-code or OAuth accounts unlock cross-device continuity, recovery, and a
   real identity for future social features.
   Complexity: HIGH (auth flows, migration from token saves). Impact: HIGH long-term
   retention. Deps: none technically; privacy policy already anticipates it.
   **Post-launch; schedule early.**
6. **Service worker / offline + update toast** — installable PWA is done except offline;
   a SW with a versioned cache + "new version — refresh" toast closes the loop.
   Why deferred so far: cache-invalidation risk during rapid iteration. Complexity:
   MEDIUM (the risk is discipline, not code volume). Impact: MEDIUM-HIGH (mobile
   retention, resilience). Deps: stable release cadence. **Post-launch.**
7. **LiveOps calendar framework** — Daily runs + windowed premium offers exist; a small
   scheduled-events registry (weekend modifiers, boss-rush weeks, first login streaks)
   would formalize a retention heartbeat.
   Complexity: MEDIUM (the seams — daily seeds, offer windows, mega rotation — exist).
   Impact: HIGH retention/monetization. Deps: none. **Post-launch; first content beat.**
8. **Rewarded-ads activation** — the Field Research lane is fully built behind
   `VITE_ADS_PROVIDER`; needs AdSense account + H5 Games approval on the real domain,
   then `npm run set-ads -- google …`.
   Complexity: LOW repo-side (external approval gate). Impact: MEDIUM monetization
   (deliberately capped by design). Deps: launch domain, AdSense. **Post-launch.**
9. **Localization framework** — strings are inline English; extraction + a locale layer
   (even EN→2 languages) meaningfully widens reach for a browser game.
   Complexity: HIGH (touch-everything extraction; the data-driven content helps).
   Impact: MEDIUM-HIGH reach. Deps: none. **Post-launch.**
10. **Shareable run seeds / replays** — determinism makes "share this exact run" nearly
    free (seed + input log → link); a spectate/replay viewer is the cheapest virality
    feature this codebase can buy.
    Complexity: MEDIUM. Impact: MEDIUM (community/virality upside). Deps: R1 shares the
    same replay plumbing (build once). **Post-launch.**

## 5. Deployment guide

`docs/RELEASE-GUIDE.md` **is** the complete novice checklist (verified this pass against
the full mandate list: accounts, sites, settings, keys + where to paste, DNS, HTTPS
(automatic + HSTS), build + deploy commands, GitHub + Cloudflare + Stripe connection,
analytics, rewarded ads, purchase verification, production testing, and the 60-second
update-publishing loop). The fast path is 7 steps; `npm run preflight -- --url …` audits
any deployment and prints the exact next action for anything unfinished.

## 6. Reproduce this audit

```
npm run validate                  # typecheck + full suite + goldens → VALIDATION_REPORT
npm test                          # 1223 tests / 172 files
npm run preflight                 # launch checklist state
npm run docs:graph && git diff    # dependency-graph freshness (expect no diff)
```
Live probes (crawls, spam/corruption/perf/FTUE) were session scripts against
`npm run preview`; recipes recorded in docs/AI_HANDOFF.md (batch 5c + RC notes).
