# PROFILE.md — the Player Profile (account dashboard)

> The profile answers: **who is this player** (banner, frames, worn title),
> **what have they accomplished** (career statistics, power breakdown, achievements showcase,
> milestone timeline), **what are they working toward** (loop directive + Next-Goal
> milestones), and **how do they play** (performance analytics). Read-model + registry:
> `src/state/profile.ts` (pinned by `profile.test.ts`); screen: `src/ui/PlayerProfile.tsx`
> (Hub → Profile). Save schema v22 adds the identity fields + ledgers.

## §tabs — four wings under one banner (2026-07 overhaul)

The dashboard no longer stacks every section into one infinite scroll. The **identity
banner stays always-visible**; below it a sticky `wing-tabs` sub-nav splits the screen
into four focused pages (each tab chip carries a live count):

| Tab | Contents |
|---|---|
| **Overview** | Genome Rank panel · Account Level (bar, next-level pay, milestones, standings boards) · Account & Sync card · Next Milestones (loop directive + goals) |
| **Career** | Power Breakdown · Career Statistics — each registry section renders as a `Fold` (combat open by default), Performance Analytics folds in as the last group |
| **Honors** | Nemesis & Trophy Rack · Achievements showcase · identity galleries (titles + achievement gallery) |
| **Timeline** | The account's story feed, newest first |

`Fold` (`src/ui/components/MobileSection.tsx`) is the universal `<details>` collapsible
(all layout profiles); `MobileSection` remains the portrait-only wrapper over it. The
`wing-tabs`/`wing-tab` CSS pattern is shared with the Bio-Dex Codex (`--wingc` sets the
accent) — reuse it for any future in-screen sub-nav.

---

## 1. Architecture — the provider registry (no hardcoded stat lists)

The screen renders **whatever `profileRegistry` yields**. A provider owns one slice:

```ts
profileRegistry.register({
  id: 'my-system', section: 'economy' | 'combat' | … | 'analytics', order: 20,
  stats: (save) => [{ id, label, value, hint?, color?, progress? }],
});
```

`profileSection(save, id)` returns the section's stats in registry order — the UI's only
career entry point. **A future system surfaces itself by registering a provider** (the same
self-registration pattern as every content registry); the screen inherits it with zero UI
edits. Structured surfaces are dedicated read-models over the same save: `playerBanner`
(identity + frames), `powerBreakdown` (bucket attribution), `achievementShowcase`,
`save.timeline` (raw), plus `nextGoals` + `loopState` reused for the milestones section.

## 2. Save schema v22 (all additive)

| Field | Meaning |
|---|---|
| `createdAt` | 0 in `defaultSave()` (determinism); stamped by the FIRST settled run |
| `profileName` | the specimen line's name (1–24 chars, inline-editable on the banner) |
| `profileFrame` | selected banner frame id (falls back to `membrane` if no longer unlocked) |
| `timeline` | `TimelineEvent[]` — newest LAST, capped at 60 (`pushTimeline`) |
| `stats.playtimeSec` / `longestRunSec` / `waveSum` | run-length + average-wave ledgers |
| `stats.doctrineRuns` / `cardDrafts` | per-doctrine settles / per-card lifetime drafts |

Timeline recorders (the moments that matter): first settle ("Specimen line established"),
new Infinite best crossing a 25-band, every 10th first-cleared stage, hero releases, MOLTs,
achievement unlocks. Adding a recorder = one `pushTimeline` call at the event's persist.

## 3. Frames & badges

`PROFILE_FRAMES` (data): membrane (default) · chitin (Stage 25) · molted (first MOLT) ·
abyssal (Depth 100) · archivist (50% Archive) · apex (15 achievements). Appending an entry
is the whole feature — unlock predicate + banner accent (`.pf-banner.frame-<id>` CSS).
**Badges are the existing mastery titles** (worn via the embedded Mastery Profile panel and
shown beside the name).

## 4. Power breakdown attribution

`powerBreakdown` splits `score − POWER_BASE` across the REAL power-model buckets
(towers / heroes / equipment / meta a.k.a. Permanent Evolution / collection) by **log-share**
of each multiplicative bucket — mathematically consistent (shares sum to the gained total)
and honest about the model's actual shape. New power buckets appear by extending the
`defs` list in step with `PowerParts`.

## 5. Known limitations (registry-ready gaps)

- Towers sold/moved and reforge counts have no lifetime ledgers yet — their stats land by
  adding a ledger + a provider row (the registry is the seam).
- `Containers Opened` reads the device-local vault ledger (labeled as such in its tooltip).
- Ledgers added in v22 (`playtime`, drafts, doctrines) start counting from v22 onward for
  existing accounts; the timeline starts at the first post-v22 settle.

## Commander designation (post-tutorial prompt)

Every save is born as the placeholder (`saveStore.DEFAULT_PROFILE_NAME`). The FIRST
hub visit after the tutorial ends (complete or skipped; the HUD tour, if any, goes
first) shows the designation ceremony (`components/CommanderName.tsx`): pick the 2–20
char name the leaderboards will show — validation mirrors the server's `sanitizeName`
exactly, with a live "will appear as" preview. Confirming sets the name, marks the
device designated (`localStorage assimilate.designated`), arms auto cloud sync, and
takes the first backup. "Later" defers for the session; the Profile rename (which also
sets the designated flag) remains the permanent editor.

## §commissioning — account creation as a ceremony (2026-07 overhaul)

The scattered onboarding asks (rewards reveal → later a CommanderName modal → a cold
first-launch WelcomeGate that *completers never even saw*) are unified into **THE
COMMISSIONING** (`ui/tutorial/Commissioning.tsx`) — fired once, at genuine tutorial
completion, in four skippable steps:

1. **GRADUATION** — THE onboarding reward moment: one reveal of every unclaimed onboarding
   ledger (`meta.grantOnboardingRewards`, docs/TUTORIAL.md §graduation — the tour no longer
   pays a second card). Shared `RewardRows` primitives with the legacy tour remainder reveal.
2. **DESIGNATION** — the commander name: server-mirrored sanitizer, live preview, and a
   one-tap callsign generator (`core/identity.ts suggestCommanderName` — always
   sanitizer-clean). Auto-skipped for already-named veterans; skipping defers to the
   CommanderName modal next session (same keys, no double-ask this session).
3. **IDENTITY** — a **SIGIL** (`core/identity.ts SIGILS`, 12 glyph+accent rows, worn
   beside the name on the banner; freely re-chosen later in the Mastery Profile via
   `meta.setProfileSigil`) and a **FOUNDING TITLE** — one of three, granted **once,
   permanently** (`meta.commission` refuses a second oath): the roads not taken stay
   untaken. Founding titles share the equipped-title slot through the `titleName` chain.
4. **SAFEGUARD** — the account decision, folded in from the accounts platform (guest /
   create account / sign in — the exported `AuthForms`), asked *after* the player has
   something to lose. Completing any route marks the device onboarded, arms the sync
   engine, and takes the first mirror. ONE guest choice — "Continue as Guest" (durable, on
   this device) with a one-line note; the session-only Guest Mode is not offered here (it
   sat beside it with near-identical wording and would discard the graduate's payout).

**Save:** `profileSigil: string | null` (additive; junk sanitizes to null). Both name steps
preview the full identity including the register number (§designation-tags). **Skippers**
(tutorial Skip) keep the legacy fallbacks unchanged — CommanderName modal + WelcomeGate.
Tests: `core/identity.test.ts` (registry, oath one-time, generator hygiene, round-trip).

## §designation-tags — the duplicate-name system

Commander names are deliberately **not unique** — any number of players may be "Marrowthorn."
What IS unique-in-practice is the **register number**: a stable 4-digit tag (`#0421`) derived
from the player's permanent identity (`net/identity playerId` — the same id the accounts
platform formalizes, so it survives guest→account upgrades and never changes).

- **One implementation, both sides.** `designationTag(id)` lives in `src/core/identity.ts`;
  the leaderboard read (`functions/api/leaderboard/top.ts`) imports THE SAME function (the
  `premium.ts` shared-module pattern) and derives each row's tag from its **stored**
  `player_id` at read time — zero schema changes, and a client can never forge a tag because
  it never rides the submission. Pinned in `functions/backend.test.ts`.
- **Deterministic + offline-first.** FNV-1a → `0001`–`9999` (never `0000`): no server
  coordination, instant offline, ~50 same-named players still collide rarely (birthday over
  9,999). A collision merely means two players share the full identity string — cosmetic, and
  the verified-replay lane already disambiguates records by `player_id`.
- **Surfaces.** Leaderboard rows (`LbEntry.tag`, dim `.lb-tag` suffix; absent on old API
  responses → name renders bare), the Profile banner (`.pf-tag`, tooltip explains it), and
  both name prompts (Commissioning DESIGNATION + CommanderName modal) always preview the FULL
  identity — *"Will appear as 'Marrowthorn #0421'"* — so the number never surprises anyone.

### Reading Power explanations

Power category rows are native details/summary disclosures, usable with pointer, Enter or Space. Each summary has a 44px minimum target; descriptions and multipliers expand inline and stay readable without hover. Display multipliers use two to four decimal places so small positive bonuses remain visible. Score, share attribution and bar widths still use the same powerBreakdown model.

Career StatCell hints use explicit Details buttons with aria-expanded/aria-controls and 44px minimum targets. Hints expand inline without hover; ordinary cells remain static. Closing/reopening a parent Fold retains each card's reading state while the Career page stays mounted. Registry values and progress calculations are unchanged.
