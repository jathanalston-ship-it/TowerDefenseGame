# UX-AUDIT-2026-07.md — full menu UX / hierarchy / navigation audit

> The 2026-07 "premium mobile strategy" pass: every registry screen captured headlessly
> (desktop 1366 + landscape 844, developed profile), reviewed against the principles that
> make polished progression-heavy interfaces (Warframe / AFK Journey / Clash Royale class)
> feel clean, then fixed at CHOKEPOINTS, not per-screen. Companion standards:
> docs/UX-CONSOLIDATION.md (§wayfinding is new), docs/INFO-HIERARCHY.md, docs/ICON-LANGUAGE.md,
> docs/UI-MOTION.md. Instruments: `npm run cogload`, `npm run mobilecheck`.

## 1. The principles distilled (reference pass)

What those interfaces share, independent of art style:

1. **One focal point per screen** — a single dominant CTA; everything else supports.
   (Already enforced here by the cogload attention budget.)
2. **Persistent wayfinding** — you always know where you are, what the parent is, and how
   to go back, without memorizing the tree.
3. **Siblings one tap away** — screens in the same wing feel like tabs, not destinations
   you re-navigate to from a hub.
4. **Chrome is thin** — titles identify, they don't occupy; content starts above the fold.
5. **State speaks in color and badges**, numbers appear where decisions are made.
6. **Ceremonies are moments, not queues** — backlogs collapse to summaries.
7. **Motion acknowledges, never loops** — enter/hover/press transitions, finite.

## 2. What shipped this pass

| Finding (audit) | Fix | Where |
|---|---|---|
| No location/back/sibling nav on desktop — every screen change was a hub round-trip | **ScreenHeader** on every non-home screen: back ‹ (real nav HISTORY), breadcrumb `group ▸ screen` (parent opens the landing), sibling chips with badge dots (direct jump, glyph-only ≤900px) | `ui/components/ScreenHeader.tsx`, Hub chokepoint |
| No back affordance at all; browser-back leaves the game | Nav history stack (32 stops) behind the ‹ button; dry stack falls back screen → its landing → home | `Hub.tsx` (`histRef`/`goBack`) |
| No touch back gesture | iOS-standard edge swipe-back (start ≤28px from left edge, >70px travel) on the screen container — inert for mouse, never fights horizontal scrollers | `Hub.tsx` touch handlers |
| Page changes teleported | One quiet fade-rise per arrival (`hub-screen-in`, 220ms, finite, reduced-motion-safe) — the section already re-keys per navigation | `index.css` |
| Title treatments inconsistent: Quest Board / Premium Store / Daily Run burned ~110px on 34–48px gradient display titles while every other screen used the compact `screen-h` | All three normalized to `screen-h` (content starts a full card earlier); the gradient `.title` remains for the FeatureLocked unlock briefing, where the name IS the moment | `QuestBoard.tsx`, `PremiumStore.tsx`, `DailyScreen.tsx` |
| Hub landing said "All quiet here — nothing is waiting on you" ABOVE member cards glowing with seen-but-unclaimed rewards (the quiet line read the unseen lane; cards read the live lane) | Quiet line now consults the LIVE lane too; when live-ready stops exist it says "Earned rewards below are still waiting" instead | `HubLanding.tsx` + i18n ×3 |
| Wardrobe unlock backlog ran a 21-tap "Next (1/21)" ceremony chain (and interrupted store entry) | 6+ queued unlocks collapse into ONE summary card (every item named, rarity-tinted, one gesture); per-card theater stays for the live trickle (≤5) | `WardrobeReveal.tsx` |
| Top bar showed "⊕ 0 · ◳ 0 · ✷ 0 Materials" | Triple-zero mats chip hides until the first drop | `Hub.tsx` |

## 3. Verified page-by-page notes (the sweep)

- **home** — strong: live-event band, command stats, campaign hero card, ready chain, one
  breathing rec. No change needed.
- **hub landings** — strong structure; quiet-line contradiction fixed (above); the
  "phantom panel" seen in two captures was the wardrobe backlog ceremony caught mid-open,
  not a layout bug — resolved by the batching fix.
- **quests / season / vault / store / daily** — clean bodies; display-title waste fixed on
  the three offenders.
- **towers / heroes / genes / mulligans** — the lab pattern (list + focus panel) reads
  well on desktop; landscape phones spend the first viewport on pre-content bands
  (title + advisor + search + filters) — see §4.
- **metabolism** — progress-first rows hold up; reward chips sit far right of names on
  very wide rows (two-ended layout, acceptable); ⚔ renders thin at 12px but stays legible.
- **profile / collection / help / settings** — consistent tabbed dashboards, no findings.

## 4. Deferred honestly (recorded, not shunted)

- **Pre-content compression on the labs** (Gene Archive stacks six full-width bands before
  its collection; Tower Lab four): the fix is per-screen surgery — fold advisor + completion
  + meta-bands into one composite band per lab. Worth its own pass; the new thin ScreenHeader
  already reclaims one band's worth on every screen.
- **"Deploy Under-Powered ⚠ 1,125 / 51,039"** leads the home CTA with alarm numbers; a
  softer outcome-first frame ("Fight anyway — recommended Power not met") fits the
  effect-language vocabulary. Small, but it is THE first-eye-catch on home.
- **Sibling chips could carry ready-state color** (gold ring like landing cards) beyond
  the badge dot — revisit with the next prominence pass.

## 5. The first-time-player contract (§usability test)

A truly fresh boot never sees the hub first — the tutorial director funnels straight into
the scripted first run (verified live: "Trial One — Hold the Line" with deployment
scripted), so first contact is taught, not navigated. From the first hub visit onward,
every screen answers "where am I" (breadcrumb), "how do I leave" (‹ / swipe / rail), and
"what else is here" (sibling chips) with ZERO memorized structure — the frame renders
above FeatureLocked, so even locked screens carry location + back. The primary action
still reads inside two seconds on every audited screen (cogload's primaries gauge,
unchanged). Regression tripwires: `npm run cogload` (attention budget) and
`npm run mobilecheck` (30 screens × 6 viewports incl. the landscape drawer), both green
after the pass; the reveal-pacing tests pin the calm first-session band.
