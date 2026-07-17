# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-17 16:48 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 81a73c0

## Summary of work completed

Two user-directed batches this session. (1) **GENE-DRAFT EFFECT LANGUAGE** (commit
55435bd — see docs/CARDS.md §language): digit-free generated card text over a universal
impact scale + 12-category palette, DraftModal rebuilt with colored keywords, detail
expansion, live gene-stack comparison. (2) **HUB READY CHAIN** (commit 81a73c0 — the
hub-redesign brief's momentum layer, docs/HUB-FLOW.md): `state/readyChain.ts` derives
every live claim/open stop from the new watermark-free `notifications.live()` lane,
surfaced as the Command Center centerpiece, breathing doors/landing cards/portrait tabs,
and chain-aware NextUp handoffs. The one thing to know: **badges/reasons are the
attention lane (unseen), the chain is the truth lane (live)** — Hub.go marks-seen on
every visit, so any "what's waiting" feature must read `notifications.live()`/`readyChain`,
never `reasons()`, or visited-but-unclaimed rewards go dark (the exact bug this batch
fixed hub-wide).

## Files modified

- Source (1): `src/changelog/releases.gen.ts` (this rituals commit; 81a73c0 carried
  readyChain.ts, notifications.live(), CHANNEL_CLASS export, Hub/HubLanding/
  CommandCenter/MobileShell surfaces, index.css pulse vocabulary, registries)
- Tests (0): — (81a73c0 added `src/state/readyChain.test.ts`, 6 tests)
- Docs (2): `docs/HISTORY.md`, `docs/devlog/DRAFT-2026-07-17.md` (81a73c0: HUB-FLOW.md,
  DIL/DEP graphs)

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- (81a73c0) **notifications** — readyChain + live() lane; **hub-shell** — chain surfaces.

## Power Score changes

None — the chain is presentation-pure derivation (nothing granted, nothing saved).

## UI changes

Command Center `recommend` widget now leads with "◈ READY CHAIN — N STOPS" (gold rows,
one tap per stop) above the rotated Recommended-Now strip; hub doors and landing cards
pulse `.is-ready` (breathing glow, layout-stable, `prefers-reduced-motion` gated —
static glow fallback); portrait tabs + index rows carry the same treatment; NextUp on
claim surfaces shows "Ready chain — N stops left → next stop" while stops remain.
Verified by a headless chain-ride probe (desktop 1440×900 + portrait 390×844): the
centerpiece lists stops, riding lands on the Vault, a VISITED-but-unclaimed stop stays
listed and pulsing after its badge cleared, landing card pulses, portrait tab pulses.
mobilecheck CLEAN (all 4 viewports).

## Documentation changes

`docs/HUB-FLOW.md` written (genre lessons, the watermark-blind-spot audit, the chain
model + surfaces, the consolidation decision: navigation reduced by flow, screens stay —
contract-bound). DIL edge notifications→hub-shell records the truth-lane rule.
`docs/CHANGELOG-PIPELINE.md`: no change needed.

## Save changes

None — chain and live() are pure reads; no save fields, no watermark writes.

## Known edge cases

- The chain deliberately excludes spends/browse (harvest-only); the Recommended-Now
  strip still covers those — don't "unify" them, the split is the design.
- Channels double as NavKeys (`channel as NavKey`, same cast recommendations makes); a
  future notification channel that is NOT a real screen would make a dead chain stop —
  register channels on real navs only.
- A quiet account renders no chain block and no pulses at all (silence is meaningful —
  lesson 1 in HUB-FLOW.md). Don't add an empty-state filler there.
- The daily Bio-Cache reason rides the vault channel line ("Daily Bio-Cache sealed") —
  it reads a little oddly under "Genetic Vault" but is accurate (the cache card lives on
  both boards); splitting it into its own channel is a follow-up, not a bug.

## Remaining technical debt

- HarvestArrival remains its own ceremony beside the chain (by design — the one entry
  ceremony); if a future "arrival digest" is wanted, absorb HarvestArrival into it
  rather than stacking two greeters.
- Chain scores reuse CHANNEL_CLASS bands; if recommendation scores are ever re-banded,
  the chain ordering moves with them (shared vocabulary — intended, but re-check the
  readyChain ordering test).

## Recommended next tasks

1. Split the Daily Bio-Cache into its own notification channel (entry:
   `src/state/notificationSources.ts` vault source) so its chain stop names itself.
2. Consider expedition-return + season-tier chain stops on the developed-profile probe
   (they join automatically once their sources report live counts — verify with a
   deeper seeded save).
3. The brief's "study reference hubs" motion pass can go further: ambient particle
   reactions on claim (the reward bus already knows the moment — `state/rewardToast.ts`).

## Future expansion hooks

- `notifications.live()` — the watermark-free lane, reusable by any "what's ready" UI.
- `readyChain()/nextChainStop()/chainNavs()` (state/readyChain.ts) — the one queue.
- `CHANNEL_CLASS` (state/recommendations.ts, exported) — the shared action vocabulary.
- A new claim surface joins chain + badges + recommendations with ONE
  `registerNotification()` — no chain wiring.
