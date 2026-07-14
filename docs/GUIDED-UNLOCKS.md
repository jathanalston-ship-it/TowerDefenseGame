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

## Coalescing + reuse

Spend-screen guides point the practice step at the **Power Advisor's** BEST VALUE strip
(`[data-guide="bbs"]`, one mark covering all four spend wings) — the guide teaches the advisor, not
a parallel truth. The Help wiki replays any guide (`▶ Field guide`) via the same `guideBus`; the
HUD Tour is the sibling first-launch orientation (both ride the same primitives + reward ledger).

## Coverage is ENFORCED

Every `FEATURES` screen with a `teach` value and `guaranteedByStage ≤ 4` (the new-player window),
except `campaign` (owned by the Combat Tutorial + Mission Control) and the Premium Store (never
guide-pushed), **must** have a guide — `src/state/guidedUnlocks.test.ts` fails until a new early
wing's guide row exists. Later wings (stage 5+) may add rows any time; the framework is
content-agnostic.

## Verification

`src/state/guidedUnlocks.test.ts` (full-window coverage from the registry, no orphan guides,
anti-wordiness contract, Foundation help rows are core). Live headless E2E: card → Show me → vault
guide → real crack advanced it → +15 Cores → ceremony free → home return.
