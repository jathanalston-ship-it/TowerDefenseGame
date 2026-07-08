# PRODUCTION-READINESS.md — release scorecard

Honest subsystem-by-subsystem assessment for first public release. Scores: **A** ship
as-is · **B** ship with the noted follow-up · **C** needs the listed work before/at
launch. Evidence = the automated suite (1180+ tests), the guardrail tests named per
row, live headless verification, and the batch-4/5 audits.

| Subsystem | Score | State | Before-release notes |
|---|---|---|---|
| Deployment & hosting | **A** | Pages + Functions one-push deploys; `.node-version` + lockfile reproducible; immutable asset caching; brotli at edge; rollback = one click | Follow docs/RELEASE-GUIDE.md phases 1–3 |
| Build pipeline | **A** | tsc strict (app + functions) gates every build; hashed assets; vendor chunk; source maps; env typed | — |
| Payments / Premium Store | **A** | Server-priced sessions, HMAC webhooks, exactly-once fulfillment ×3 layers, refunds, boot recovery; 29-scenario failure-mode suite | Live-mode smoke (guide step 17) is the only unproven link — needs a real Stripe account |
| Security | **A−** | CSP/HSTS/XFO; parameterized SQL; validated inputs; Turnstile; rate limits; audit + independent diff review clean (docs/SECURITY-AUDIT.md) | Leaderboards remain bounded CLAIMS (accepted A2; upgrade path R1) |
| Saving (local) | **A** | Checksummed, versioned (v24), sanitized imports, rolling backups, export/import UI | — |
| Cloud saves | **A−** | Token-auth slot, size caps, sanitized restore, sync codes, one-tap DELETE (the privacy policy's deletion right) | Single slot, manual trigger; R5 (versioned history) post-launch |
| Leaderboards | **B** | Daily + Boss Rush boards live: Turnstile, bounds, day tickets, keep-best; fail-soft UI | Scores are client claims by design — disclose in FAQ; R1 replay-verification is the real fix |
| Daily Run | **A** | Worldwide-deterministic plan, offline-playable; server day authority for standings; streaks/rewards tested | — |
| Boss Rush | **A** | Stamina economy, record bands, Ichor bleed, standings, research stamina hook — all tested | — |
| Performance | **A−** | 60fps sim with hundreds of enemies (batch-1 pass); 318KB gz app chunk; instant boot shell; functions cold start ≈ ms | No low-end-device matrix run; monitor after launch |
| Audio | **A** | Synth cue/music layers with autoplay-policy unlock, category toggles | — |
| UI / UX | **A** | Token-enforced design system (uiStandards test), phase-reactive HUD, celebration ceremonies everywhere | — |
| Tutorial & Help | **A** | Combat tutorial, HUD tour, living Help wiki + What's New (Field Research entry included) | — |
| Accessibility | **B−** | Semantic buttons/labels/roles, global :focus-visible ring, prefers-reduced-motion honored app-wide + boot shell, labeled battlefield canvas, color-scheme meta | Canvas combat remains pointer-first; colorblind palettes unverified; full screen-reader journey untested — schedule a dedicated pass |
| Analytics | **A−** | Cookie-free: CF Web Analytics (pages) + aggregate D1 counters (game/store/research) + server-truth purchase funnel | Enable dashboard toggle at launch (guide step 18) |
| Rewarded ads (Field Research) | **B+** | Complete, themed, capped, tested, provider-agnostic — ships HIDDEN (`VITE_ADS_PROVIDER=none`) | Choosing/wiring a real network (+CSP hosts) is deliberate post-launch work |
| Website / branding | **B+** | Landing + news + legal skeletons, PWA manifest/icons, OG cards, boot splash, hidden ad slots | Trailer, newsletter action, Discord invite, LEGAL COMPLETION (see below) |
| Documentation | **A** | Deployment, Stripe, security, research, website, release guide, readiness (this), manifest/graph/state all synced | — |

## Must complete before public launch (the honest blockers)

1. **Legal sign-off** — the policy/terms are complete behavioral drafts; a human must
   read them, set the governing-law line (terms §8), and accept responsibility.
2. **Live Stripe smoke** — guide phase 4: one real purchase + refund on production keys
   (requires the live Stripe account — impossible from the repo).
3. **Run `npm run set-domain -- <domain> --contact <email>`** once the domain exists
   (one command; fills every URL + legal contact). Verify with `npm run preflight`.

## Should schedule soon after launch

- Accessibility pass (the C+ row) — highest-leverage quality gap.
- R1 leaderboard replay verification; R2 D1 export cadence (SECURITY-AUDIT §4).
- Low-end device performance matrix; PWA service-worker decision revisit.

**Verdict:** with the three blockers cleared, ASSIMILATE is production-ready: every
money path is server-verified and failure-tested, the game is fully playable offline
with zero backend, and every optional lane (cloud, standings, studies, ads) fails soft.
