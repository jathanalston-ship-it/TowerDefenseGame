# GUIDED-UNLOCKS.md — Foundation #3 of the UX consolidation pass

> **Every new wing introduces itself.** You should never land on an unfamiliar screen and wonder
> what to touch. When a wing unlocks, its announcement offers a short anchored walkthrough that
> ends in your first real action there. Part of the foundational release pass
> (`docs/UX-CONSOLIDATION.md`). Playtest finding this answers: *wordy tutorials get skipped* — so
> every guide is ≤ 4 one-sentence steps, skippable at every moment.

## The sequence

What's New card ("Show me ▸") → navigate to the new wing → **FIELD GUIDE** walkthrough:

1. Spotlight the heart of the wing (a one-sentence *what/why*).
2. Spotlight its primary control, invite the **first real interaction** (the practice objective).
3. Pay a small one-time reward (15 Genome Cores).
4. Offer the way home (Command Center) or "Stay here".

A missing anchor degrades to a centered callout with no dim — a guide can never trap or black out
the lesson.

## Architecture

- `src/state/guidedUnlocks.ts` — data-driven `GUIDES` registry, one `GuideDef` per taught mechanic
  (keyed by the mechanic id, which equals a `FEATURES.teach` value). Each has ≤ 4 `GuideStep`s
  (`anchor`, `title`, one-sentence `text`, optional `interact`). Plus `guideBus` (mirrors
  `navBus`) so any surface can arm a guide.
- `src/ui/GuidedUnlock.tsx` — renders a guide with the Combat Tutorial's own primitives
  (`Spotlight`/`Callout`/`Typewriter`/`useTargetRect`) over `[data-guide]` marks the screens
  declare. The interact step advances on the player's **first real capture-phase click** — the
  click still lands, and the guide chrome drops in the same breath so any ceremony it opens stays
  free. Completion pays via `meta.grantTutorialMilestone('guided', mech)` — the tutorial's
  idempotence ledger, so replays re-teach but never re-grant.
- `App.tsx` owns the armed guide (menu-scoped; dropped on screen change; the What's New queue waits
  while a guide runs).

## §batching — many unlocks land as ONE summary

A first campaign clear can unlock a dozen systems in one breath (the 2026-11 fresh-account
playtest: 11 sequential WHAT/WHY/WHERE/NEXT walls, plus specimen ceremonies and toasts on top).
When `WHATS_NEW_SUMMARY_AT` (3) or more announcements are queued, `WhatsNew` renders ONE summary
card instead: each system as glyph · name · one-line hook · **Open ▸** (only when its wing is open —
`unlockSummaryRows` in `state/mechanics.ts` asks `isOpenNav`; a guided wing still arms its Field
Guide on Open), one **Got it** dismiss. One or two queued keep the full card. Dismiss or Open
archives the whole batch into Help, so every full briefing stays reachable in the wiki — never
lost. Cosmetic specimens that landed in the same breath fold into the summary ("Also acquired"
+ Claim ▸) and their reveal queue is banked there; otherwise `WardrobeReveal` waits until no
What's New card is up (sequential, never stacked). Reward placards hold while any What's New
card is up and flush afterwards, an achievement burst collapsed (docs/NOTIFICATIONS.md
§reward-toasts).

## Coalescing + reuse

Spend-screen guides point the practice step at the **Power Advisor's** BEST VALUE strip
(`[data-guide="bbs"]`, one mark covering all four spend wings) — the guide teaches the advisor, not
a parallel truth. The Help wiki replays any guide (`▶ Field guide`) via the same `guideBus`; the
HUD Tour is the sibling first-launch orientation (both ride the same primitives + reward ledger).

## Coverage is ENFORCED — the full curve

**Every** `FEATURES` screen with a `teach` value carries a guide, except `campaign` (owned by the
Combat Tutorial + Mission Control) and the Premium Store (never guide-pushed) —
`src/state/guidedUnlocks.test.ts` derives the required set from the unlock registry itself, so a
future wing fails CI until its guide row exists. (Shipped in two waves: the stage ≤ 4 new-player
window first, then the full later-wing set — modes and spend-decision screens use gentler practice
steps: a guide never forces a run start or a purchase.)

## Verification

`src/state/guidedUnlocks.test.ts` (full-window coverage from the registry, no orphan guides,
anti-wordiness contract, Foundation help rows are core). Live headless E2E: card → Show me → vault
guide → real crack advanced it → +15 Cores → ceremony free → home return.
