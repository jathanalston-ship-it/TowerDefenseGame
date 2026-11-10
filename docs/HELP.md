# Help, HUD Tour & "What's New?" — living onboarding + wiki

Three surfaces over **one registry**: a first-launch **HUD Tour**, celebratory
**What's New?** unlock announcements, and a permanent searchable **Help** wiki.
All read the same `MechanicDef` list, so a mechanic is authored once and appears
in every surface automatically as the player unlocks it.

## Architecture

- **`src/state/mechanics.ts`** — the registry + pure read-models. `MECHANICS`
  is a flat array of `MechanicDef`; each declares an optional `unlock(save)`
  predicate (absent ⇒ `core`, always visible) and its taxonomy/links/nav target.
  Read-models: `unlockedMechanics(save)`, `isMechanicUnlocked(def, save)`,
  `pendingAnnouncements(save)` (unlocked ∧ non-core ∧ not in `help.seen`),
  `MECHANIC_BY_ID`. No React/DOM imports; `highestCampaignStage` is inlined to
  avoid a `meta ↔ mechanics` cycle.
- **Save (`saveStore.ts`)** — `help: { seen: string[]; primed: boolean;
  hudTour: boolean }`, defaulted + `sanitizeHelp`, folded through
  `withDefaults`. `seen` is the What's New archive; `primed` gates the one-time
  boot prime; `hudTour` gates the one-time tour.
- **Meta API (`state/meta.ts`)** — the only mutation surface:
  `helpMechanics()` (wiki list), `whatsNew()` (pending queue),
  `archiveMechanics(ids)` (mark seen), `primeHelp()` (boot: silently archive
  everything already unlocked so existing saves never flood), `shouldHudTour()`
  / `completeHudTour()` (one-time; pays nothing of its own since the onboarding
  payout merged into the tutorial's ONE graduation — docs/TUTORIAL.md
  §graduation — except a LEGACY graduate's owed `hudtour` ledger; it **re-primes**
  so onboarding unlocks don't cascade as popups).
- **UI** — `WhatsNew.tsx` (front-of-queue card, "Got it · N more",
  `archiveMechanics` on close), `HelpWiki.tsx` (search + category index +
  What/Why/Where/Next + "Watch out" (`mistakes`) detail + cross-links to
  *unlocked* mechanics only + a Field Orientation replay button; **§search** — a query
  ranks via `ui/helpSearch.ts` `searchMechanics`: title-prefix → title-word → title →
  summary → body/category, stable within a tier, shown as ONE flat best-first list whose
  top hit fills the detail pane until you pick another — "threat" opens The Threat Ladder,
  not Infinite; `helpSearch.test.ts`),
  `HudTour.tsx` — **Field Orientation**: an ANCHORED tour that spotlights the
  real Hub element per stop (`data-nav`/`data-tour` anchors; centered fallback
  when hidden) and teaches WHAT / WHY / WHEN / what unlocks LATER — FOUR stops
  (next fight → rewards → spend → profile & help; docs/TUTORIAL.md
  §onboarding-flow). Back/Next confirmed clicks; Finish and Skip are identical
  (`completeHudTour()` — nothing to forfeit). Replayable from Help or
  Settings — never re-grants. Mounted in `App.tsx` (tour/What's New, menu only) + `Hub.tsx`
  (`help` nav key).
- **Loading tips (`src/ui/tips.ts`)** — a fourth, lighter surface: one-line
  teachers rotated per visit at the foot of the Play screen (`.mc-tip`). Pure
  data (adding a tip is one row), weighted toward the Gene Evolution loop.
  In-place help also lives where the system does: the Gene Archive's
  "How the Gene system works" collapsible.

## Public APIs (callers use these)

`meta.helpMechanics() | whatsNew() | archiveMechanics(ids) | primeHelp() |
shouldHudTour() | completeHudTour()` + the graduation pair `grantOnboardingRewards() |
pendingOnboardingReward()` (docs/TUTORIAL.md §graduation). UI reads via `meta.use()` for reactivity.

## Extension points

**Add a mechanic** = append one `MechanicDef` to `MECHANICS` (id, title,
category, summary, what/why/where/next, optional `mistakes` ("Watch out" row),
`unlock`, `nav`, `links`, `media`). It auto-joins the wiki, and (if non-core)
announces the first time its predicate flips. No UI or save change required.
Registry coverage now includes the wave/build rhythm, Game Speed, Emergency
Defense, Adaptation/Antigen, and in-run Hero Evolution.

## Important assumptions

- `unlock(save)` is **pure** over `SaveData` and monotonic (never re-locks).
- `primeHelp()` runs once at boot **before** any reward grant; `completeHudTour`
  re-primes **after** its grant. Together they guarantee announcements fire only
  for *play-driven* unlocks, never for onboarding-granted ones.
- Wiki visibility == unlocked; cross-links to still-locked mechanics are hidden.

## Future hooks

`media` fields are placeholders for gifs/screenshots. `nav` keys route the
"Show me" button — new Hub destinations wire in by key. Categories are open
(`MechanicCategory`).

## Known limitations

- Media is placeholder-only (no assets yet).
- Announcement order follows `MECHANICS` array order, not unlock recency.
- `help.seen` grows unbounded (bounded in practice by the registry size).

### Search and related-topic navigation
Search normalizes punctuation/spacing and searches all What/Why/Where/Next/Watch out text plus titles, summaries and categories. Exact title/summary/body phrases rank before results whose query words span sections. All query words must match. Each query change selects the best result; related links clear the filter and focus their opened article. Unlocked-topic gating remains unchanged.

What's New keyboard access: a visible queue captures its opener once. Each card focuses Got it, Tab stays inside the dialog (including the named explanation/list), and Escape uses the same acknowledgement as Got it. Closing the queue or unmounting restores a connected opener. Single cards include the mechanic title in the accessible dialog name; card identity follows the mechanic so the next card receives fresh focus.

Field Manual reading flow: selecting an index entry focuses its article, including reselecting the current topic. Enter in search reads the current result without changing the query; typing and empty-result Enter retain search focus. Back to topics focuses the selected index entry (falling back to search if missing). Related-topic links still clear search and focus their destination. Search ranking and unlocked-only filtering are unchanged.
