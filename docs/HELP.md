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
  / `completeHudTour()` (one-time, grants the Tutorial Bio-Container via the
  idempotent `grantTutorialRewards` ledger **and re-primes** so onboarding
  unlocks don't cascade as popups).
- **UI** — `WhatsNew.tsx` (front-of-queue card, "Got it · N more",
  `archiveMechanics` on close), `HelpWiki.tsx` (search + category index +
  What/Why/Where/Next detail + cross-links to *unlocked* mechanics only),
  `HudTour.tsx` (12-step area→purpose walk; finish → reward reveal). Mounted in
  `App.tsx` (tour/What's New, menu only) + `Hub.tsx` (`help` nav key).

## Public APIs (callers use these)

`meta.helpMechanics() | whatsNew() | archiveMechanics(ids) | primeHelp() |
shouldHudTour() | completeHudTour()`. UI reads via `meta.use()` for reactivity.

## Extension points

**Add a mechanic** = append one `MechanicDef` to `MECHANICS` (id, title,
category, summary, what/why/where/next, optional `unlock`, `nav`, `links`,
`media`). It auto-joins the wiki, and (if non-core) announces the first time its
predicate flips. No UI or save change required.

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
