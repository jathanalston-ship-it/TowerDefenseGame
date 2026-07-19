# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-19 01:58 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** d4c29fa

## Summary of work completed

MENU UX / NAVIGATION OVERHAUL (docs/UX-AUDIT-2026-07.md): every registry screen was
captured headlessly and audited against premium-mobile principles, then fixed at
chokepoints. The big piece is the WAYFINDING FRAME — `ui/components/ScreenHeader.tsx`
rendered once by the Hub on every non-home screen: back ‹ over a real 32-stop nav
history, breadcrumb `group ▸ screen` (parent opens the landing), sibling chips for
one-tap moves inside a wing (no more hub round-trips), plus a finite 220ms page
transition and iOS edge swipe-back on touch. The one thing the next session must know:
the frame is registry-driven and renders ABOVE FeatureLocked — new screens inherit it
with zero wiring; never add per-screen back buttons or a second breadcrumb.

## Files modified

- Source (11): `src/changelog/releases.gen.ts`, `src/dev/systemRegistry.ts`, `src/i18n/index.ts`, `src/index.css`, `src/ui/DailyScreen.tsx`, `src/ui/Hub.tsx`, `src/ui/HubLanding.tsx`, `src/ui/PremiumStore.tsx`, `src/ui/QuestBoard.tsx`, `src/ui/components/WardrobeReveal.tsx`, `src/ui/components/ScreenHeader.tsx`
- Tests (0): — (contract coverage rides the existing instruments: mobilecheck walks all 30 screens through the new frame; cogload re-measured 70/70)
- Docs (7): `docs/COGLOAD_REPORT.md`, `docs/DEPENDENCY_GRAPH.md`, `docs/DIL_GRAPH.md`, `docs/HISTORY.md`, `docs/UX-CONSOLIDATION.md`, `docs/VALIDATION_REPORT.md`, `docs/UX-AUDIT-2026-07.md`

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- **cosmetics** — `src/ui/components/WardrobeReveal.tsx`
- **daily** — `src/ui/DailyScreen.tsx`
- **dev-registry** — `src/dev/systemRegistry.ts`
- **hub-shell** — `src/ui/Hub.tsx`, `src/ui/components/ScreenHeader.tsx`
- **i18n** — `src/i18n/index.ts`
- **notifications** — `src/ui/HubLanding.tsx`
- **premium** — `src/ui/PremiumStore.tsx`
- **quests** — `src/ui/QuestBoard.tsx`
- Consumer ring (verify, unchanged): battle-pass, contracts, daily-login, directives, field-research, hive-construction, infestation, liveops, metabolism, nemesis, net-backend, pil, profile, reward-architecture

## Power Score changes

None — pure presentation/navigation batch; no economy or stat surface moved.

## UI changes

- **ScreenHeader** on every non-home hub screen (desktop + landscape drawer; portrait
  keeps MobilePageHead): back ‹ (nav history; dry stack falls back screen → landing →
  home), breadcrumb with clickable parent, revealed-sibling chips with unseen badge dots
  (glyph-only ≤900px). Touch gets edge swipe-back (start ≤28px, >70px travel).
- **Page transition**: `.hub-screen` plays one finite fade-rise per navigation
  (reduced-motion stills it; attention-budget neutral — cogload 70/70).
- **Title normalization**: Quest Board / Premium Store / Daily Run dropped the 34–48px
  gradient `.title` for the standard `screen-h` (content starts ~110px earlier); the
  gradient stays only on the FeatureLocked unlock briefing.
- **Hub landing truthfulness**: the "All quiet" line now consults the LIVE lane; with
  seen-but-unclaimed stops it says "Earned rewards below are still waiting" instead.
- **Wardrobe backlog batching**: 6+ queued unlock ceremonies collapse to ONE summary card
  (all items named + rarity-tinted); per-card theater stays for ≤5 (the live trickle).
- **Top bar**: the Materials chip hides while all three mats are zero.
- Verified: mobilecheck CLEAN (30 screens × 6 viewports incl. drawer walk), cogload
  70/70, live headless probes (sibling jump quests→milestones, double-back to landing,
  fresh-boot funnel confirmed tutorial-first).

## Documentation changes

`docs/UX-AUDIT-2026-07.md` NEW (principles, findings→fixes table, per-screen notes,
honest deferrals, first-time-player contract). `docs/UX-CONSOLIDATION.md` gained the
§wayfinding standard (the frame's rules). DEPENDENCY_GRAPH/DIL_GRAPH/COGLOAD_REPORT
regenerated. All other listed docs: no change needed (blast-radius listing only).

## Save changes

None — save layer untouched.

## Known edge cases

- `goBack()` restores landings as real stops; from a screen with an EMPTY history it
  climbs to the screen's own hub landing, then home — never a dead end.
- The swipe-back only arms when the touch STARTS within 28px of the left viewport edge —
  deliberate, so horizontal scrollers (conveyor, card rows) never trigger it.
- ScreenHeader filters siblings by `featureRevealed`; a hub with one revealed screen
  renders no chip row (breadcrumb + back only).
- The wardrobe batch card takes over at >5 queued reveals; exactly 5 still plays five
  cards (skip-all remains from 3+).
- The "phantom panel" in two audit captures was the wardrobe ceremony mid-open, not a
  layout bug — do not chase it.

## Remaining technical debt

- Pre-content band stacks on the labs (Gene Archive 6 bands, Tower Lab 4) — recorded in
  UX-AUDIT §4; per-screen surgery deferred deliberately.
- Sibling chips show unseen dots only; ready-state (gold ring) coloring is a candidate
  for the next prominence pass.

## Recommended next tasks

1. Lab pre-content compression (fold advisor + completion + meta bands into one
   composite band) — start with GeneArchive.tsx; the audit doc names the bands.
2. Home deploy CTA outcome-first reframe ("Fight anyway — recommended Power not met") —
   CommandCenter `.mc-campaign` CTA, effect-language vocabulary.
3. Consider ScreenHeader ready-state chips (readyChain membership → gold ring).

## Future expansion hooks

- `ScreenHeader` props are registry-driven (`navModel.groupOf`) — a new screen in any
  group inherits breadcrumb/back/siblings with zero wiring; a future in-run breadcrumb
  could reuse the same component with a synthetic group.
- `Hub.goBack`/`histRef` — the history stack is the seam for browser-history binding
  (popstate) if the SPA ever wants URL-addressable screens.
