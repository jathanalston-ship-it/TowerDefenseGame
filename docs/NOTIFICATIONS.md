# NOTIFICATIONS.md — Menu Badges + Reward Toasts

Compressed developer summary (the canonical reference — prefer over re-reading code).
Two layers: **badges** (dots that say "there's something here") and the **reward
placard stack** (miniature reward reveals that say "here's exactly what you just got").

## Purpose

Animated dots on Hub menus that say "there's something here," driven by a generic
registry so any feature can flag a menu without that menu — or the engine —
hardcoding the logic. Ships wired for: Genetic Vault (unopened containers), Tower
Lab (affordable next stars), Hero Lab (new equipment), Profile (achievements
unlocked), Collection (entries discovered).

## Architecture

- **`src/state/notifications.ts`** — the engine. A module-level array of
  `NotificationSource { id, channel, count(save) }`. A reactive `seenStore`
  (`createStore`) holds per-source "seen" watermarks, persisted device-local to
  `localStorage['assimilate.notif.seen']` (UX state, like prefs — not in the save).
- **`src/state/notificationSources.ts`** — declares the shipped sources (one
  `registerNotification` each). The ONLY place menu badges are wired; imported for
  its side effects by `Hub.tsx`.
- **`src/ui/Hub.tsx`** — reads `notifications.badges(save)` and renders a
  `.nav-badge` dot per channel keyed by nav key. Logic-free: it never knows what a
  badge *means*.

The badge for a channel = Σ over its sources of `max(0, count − min(seen, count))`.
The `min(seen, count)` clamp (also persisted by `sync`) means a watermark never
exceeds the live count, so this ONE rule covers both notification flavours:
pending/actionable counts that drop on action (containers, claims, affordable
upgrades) AND cumulative "new since viewed" counts that only climb (gear,
discoveries). Drop-then-rise re-lights the dot showing only the *new* delta.

## Public API (`notifications`)

- `registerNotification({ id, channel, count })` — add a source (idempotent by id).
- `badges(save): Record<channel, number>` — pure; empty channels omitted.
- `markSeen(channel, save)` — acknowledge a channel (badge clears now). Hub calls
  this on nav click → "disappears immediately once viewed".
- `sync(save)` — clamp watermarks down to live counts; call on save change (Hub
  effect). Makes claim/open/reset/import re-light correctly.
- `use()` — React subscription to watermark changes (pair with `meta.use()`).

## Extension points

Add a badge = one `registerNotification` call (in `notificationSources.ts` or the
feature's own module) with a pure `count(save)`. Channel string = the Hub nav key.
No menu or engine change. New nav keys get badges for free.

## Important assumptions

- `channel` matches a Hub `NavKey`. `count` is a pure function of `SaveData`.
- Acknowledgement is device-local; multi-device installs don't sync watermarks.
- "Disappear once viewed" is by design — viewing a menu acks it even if you didn't
  act; it re-lights when genuinely new things arrive.

## Known limitations / future hooks

- Achievements auto-grant their rewards, so the Profile badge means "new
  achievements unlocked" rather than a literal claim step.
- A fresh save shows a Collection dot (baseline-discovered entries are "new" to a
  new player); clears on first view.
- Dots are count-less by design (spec: "dots"); the count rides in the button
  `aria-label`. A numbered variant would be a CSS/markup tweak only.
- The pulse honors `prefers-reduced-motion` via the global catch-all in index.css
  (it neutralizes all animation/transition durations), so no per-badge gate is needed.

## §hubs — the behavior-hub navigation (2026-07 overhaul)

The sidebar groups are **behavior hubs in reward-loop order** (`src/ui/navModel.ts`):
MISSION (fight) → REWARDS (claim/open) → EVOLUTION (permanent growth) → MARKET
(trade/equip) → Store (separate by design) → PROFILE (identity/record). Every claim/open
surface lives in ONE hub, so "what's waiting for me?" is one place. Portrait tabs derive
from the same rows (Home / Battle / Rewards / Evolve / More — loop order).

- **The rail is ONLY the front doors (2026-07 compression):** the desktop sidebar renders
  HOME + one door per hub (+ the Store's direct door — `headerless` groups ARE their single
  screen) and nothing else — no per-screen rows, rings, or teaser rows at the rail level.
  Clicking a door opens the hub's **landing page** (`src/ui/HubLanding.tsx`) — identity
  header (glyph/promise/completion %), a "needs attention" strip of reason lines, the
  recommendation panel, the screen grid (unlock-registry cards with badges/reasons/rings/
  teasers — the ONLY desktop door to individual screens now), and a recently-unlocked shelf
  (`director.revealed` within the last 5 runs). Fully registry-driven — a new screen in
  navModel lands with everything for free; there is no per-hub layout.
- **Mobile:** the tab index pages render the same intelligence (compact recommendation
  strip + reason sublines on rows) — the landing and the index are the same idea at two
  widths.
- Aggregate door badges sum the members (on the glyph corner); door tooltips list the
  member reasons. The active door stays lit while any of its screens is open.
- **Consumers of the old per-row anchors moved with it:** the HUD tour's wing stops
  spotlight `[data-hub]` doors (`nav` field keeps the reveal gate), and the mobilecheck
  desktop sweep walks door → landing → `[data-nav]` card.

### Folded screens (2026-11 — "decisions, not destinations")

Five side screens are no longer nav rows; they are **tabs inside a host screen**
(`FOLDED_NAVS` in `src/ui/navModel.ts` — the single fold table): **Hive Production** and
**Expedition Command** → The Hive · **Milestones** (metabolism) → the Quest Board · **Specimen
Vault** → the Phenotype Lab (the wardrobe the stock binds into) · **Gear Codex** → the Armory.
The nav lists 26 destinations instead of 31.

- **Every NavKey still deep-links.** `Hub.go('harvest')` resolves `hostOf('harvest') = 'hive'`,
  calls `requestHostTab('harvest')` and opens The Hive on its Production tab — What's New CTAs,
  reward-toast jumps, the Ready Chain, guided unlocks and Command Center CTAs keep working
  unchanged. A request while the host is already on screen switches the tab live.
- **Tab hosting lives in the host component**, not in Hub's render switch: each host renders
  `<HostedScreen host="hive" views={{ hive, harvest, expeditions }} />`
  (`src/ui/components/HostTabs.tsx`, shared `.wing-tabs` styling). A folded tab keeps its own
  unlock-registry row, so it reveals on its own beat; the next unrevealed tab shows locked.
- **Badges/pulses roll up to the host** (`foldCounts` / `foldLines`, and the Ready Chain set is
  mapped through `hostOf`): a ripe Production tab badges The Hive; the tab itself carries the
  count. Visiting a tab acknowledges its channel and feeds the exposure ledger.
- Folded keys never spend a nav TEASER slot (they tease inside their host).
- Contracts: `navModel.test.ts` (26 rows, every fold resolves to a real host in the same hub and
  portrait tab, Hub renders no folded key, each host mounts `HostedScreen`).

## §decisions — a badge means a decision (2026-11)

A badge exists only where the player has a **decision** to make: an affordable upgrade
(tower Stars, gene upgrades, Hive organs), an unopened container (Vault, Daily Bio-Cache), a
pending choice (unspent Antigen, unclaimed specimens, expedition returns, Front actions, an
Evolution Track ready to EVOLVE), a **free gear upgrade** (`heroes.equipment` now counts the
equip advisor's Power-raising swaps, not every piece in the rack). Removed as non-decisions:
`profile.achievements` (auto-granted, already toasted), `collection.discovered` /
`collection.memories` (view counts), `store.rotation` (a daily "unseen" nag).

**Sealed screens never badge.** `notificationSources` installs a channel gate
(`setChannelGate`): a channel whose screen hasn't revealed (docs/PROGRESSION-GATING.md) counts
0 in `badges()`, `reasons()` and `live()`, so a hidden system never nags (the old portrait tab
bar summed hidden screens' badges) and its backlog surfaces at the reveal.

## §auto-claim — chores settle themselves at run end (2026-11)

`state/autoClaim.ts` (`autoClaimSettled`) claims every **no-choice** reward on a REVEALED
system when a run settles: Quest Board missions (weekly + the active chapter), Season Pass
levels (exactly `claimAllPass`), Metabolism milestones, live-event track milestones (the event
SHOP stays a decision), Mastery Evolution Track nodes. The
batch runs inside `rewardToast.capture()` — no toast per claim — and reads back as **ONE
"Also earned" row** under the Results verdict (`ui/components/AutoClaimSummary.tsx`, mounted
with one line; it settles once per run result, so a remount never claims twice).

- **Big moments keep a ceremony:** quest FINALES (story cutscene + exclusive cosmetic) and
  Evolution "EVOLVE" stay manual (their badges remain — they are the decision), and any
  tier-3 (legendary-takeover) reward still placards.
- **Backlogs land at the reveal:** quest progress, pass XP and milestones accrue from run 1;
  the first settle after their screen reveals claims the whole bank in one row.
- **Settings → Auto-Claim Rewards** (`prefs.autoClaimPref`, default ON, device-local) turns it
  off; every claim is then a manual tap with its badge, exactly as before.
- Every claim goes through the normal guarded meta APIs (security registry budgets unchanged).

## §reasons — smart notifications say WHY

`NotificationSource.reason?: (save, unseen) => string` gives every badge a human phrase —
"3 Bio-Containers to open · Daily Bio-Cache sealed", never "(4)". `notifications.
reasons(save)` returns the lines per channel (same watermark clamping as `badges`).
Rendered: nav-item tooltips + aria-labels, hub landing attention rows, landing/index card
sublines (the WHY replaces the blurb when something waits). Sources without a reason fall
back to "N new". Adding a reason is one line on the source.

## §recommendations — the "what next?" engine

`src/state/recommendations.ts` — `recommendationsFor(save, { navs?, limit? })` returns
ranked concrete actions `{ nav, kind, label, why, score }`. Candidates DERIVE from
registries: every notification source with a reason is a candidate (its channel classifies
kind/score via `CHANNEL_CLASS` — claim 90 > open 80 > upgrade ~55 > spend ~45 > browse;
unknown channels still surface as 'browse'), progression teasers ≥50% surface as
"almost unlocked" pulls routed toward their gate, and a PLAY action backstops so the list
is **never empty — no dead ends**. Bespoke candidates: `registerRecSource()`.
Rendered: hub landings, mobile tab indexes (compact), the Command Center 'recommend'
widget, and the `NextUp` strip mounted on claim-surface empty states (vault empty,
harvest warming). Tests: `src/state/recommendations.test.ts`.

## §reward-toasts — the reward placard stack

**Every reward in the game announces through ONE config-driven placard system** — a
miniature reward reveal (large art · big `+quantity` · unit name · source subtitle ·
rarity word · optional Power/collection lines), not a text notification. WHAT / HOW
MUCH / WHERE, readable in under a second.

- **`src/state/rewardToast.ts`** — the framework. `REWARD_TYPES` registry (see
  §reward-registry), `RewardEvent { type, qty?, name?, rarity?, source, power?,
  collection?, nav? }`, the pure queue rules (`applyEvent`, `pruneCards`, `tierOf`,
  `lifeOf` — all unit-tested), and the bus: `rewardToast.push(event)` /
  `pushMany(source, events)` / `onReward(fn)`. Events pushed while no toaster is
  mounted (run end, boot) **hold in a bounded buffer (40) and flush on mount** — a
  reward announcement is never silently dropped; run earnings placard the moment the
  player returns to the hub.
- **Queue rules:** identical rewards (`type:name`) landing within **4s merge** —
  `+100 +250 +75` becomes one `+425` card that pulses, re-arms its lifetime, and jumps
  back to the front; differing sources blend to "Multiple sources". `merge:'count'`
  types stack as ×N; `merge:'never'` types (equipment, achievements, cosmetics) keep
  distinct cards. Lifetime 5s (7s at tier 3); max 4 visible + "+N more" + Dismiss All.
- **Rarity presentation ladder:** tier = max(registry base, event rarity) — t0 subtle
  rise · t1 rim glow · t2 spark burst · t3 legendary takeover (bigger card, screen
  accent, `jackpot` stinger). Arrival audio is tier-keyed (`toast0/1/2` cues in
  `sound.ts`) and rate-limited; merges tick softly.
- **`src/ui/components/RewardToaster.tsx`** — pure presentation, mounted in App at the
  menu (never covers a live run). Top-right stack (top band on phones). Dismissal: X ·
  click/tap · swipe · Dismiss All. `role="status"`, reduced-motion safe (`.rwt2-*` CSS).
- **Grant-time pushes live in `meta.ts`** (single source of truth — placards are
  emitted where the save actually changes, never from screens): `applyRewardList`
  returns `events`; every claim seam pushes with its source string.

### Coverage audit (2026-07 placard overhaul): every reward lane has exactly ONE owner

| Reward lane | Owner |
|---|---|
| Run settle (Field/Campaign/Infinite/Boss Rush/Daily: cores, Season XP, banked loot) | placards on hub return (held buffer) |
| Quest missions / finales · Battle Pass levels · weekly directives | placards |
| Daily login Bio-Cache · Idle Harvest · expeditions · wardrobe milestones | ceremony **and** placards (ceremony is transient; placards are the claim trail) |
| Splice Market buys · Ichor Exchange trades · collection rank-up Ichor | placards |
| Mastery evolution claims / prestige · tutorial milestones | placards |
| Achievements (auto-grant on unlock) | AchievementToaster (headless watcher → placard) |
| Container/cache opening · Bio-Roulette · Premium Store · field research reveals | dedicated full-screen ceremony only (every item individually presented — no double-toast) |
| Genome-rank promotions | promotion cinematic only (rewards presented in-cinematic) |
| Permanent stat purchases (stars, primes, meta/idle/ascendant nodes) | Power delta popup (spends, not rewards) |
| In-run pickups | LootToaster corner lane (run-safe); banked totals placard at settle |

Single-owner rule for CEREMONY: a reward never fires two ceremonies. Placards are the
persistent trail layer — they coexist with transient ceremonies but never with a
dedicated full-screen reveal that already itemizes every reward.

## §reward-registry — adding a reward type

A future reward type is **one row** in `REWARD_TYPES` (`src/state/rewardToast.ts`):

```ts
{ id: 'relic', unit: 'Ancient Relic', art: { kind: 'glyph', glyph: '☥', color: 'var(--gold)' },
  merge: 'never', tier: 2, nav: { key: 'relics', label: 'View in the Reliquary' } }
```

- `art`: `currency` (animated medallion) · `glyph` (large tinted glyph) · `gene` ·
  `container` (rarity-tinted core).
- `merge`: `'sum'` (+425 pattern) · `'count'` (×N stacks) · `'never'` (unique items).
- `tier` 0–3 sets the floor presentation; event `rarity` raises it.
- `nav` is the "view it →" jump (Hub NavKey), overridable per event (`nav: null` when
  the grant already lives on the destination screen).

Unknown types still render (generic glyph card) — a new grant can never be silent.
`eventsForPassRewards` maps the `applyRewardList` reward language (`cores`, `mats`,
`container`, …) to events, so quest/pass/login/mission content needs no toast code at
all. Tests: `src/state/rewardToast.test.ts` (registry coverage, merge/prune rules, bus).

## §volatile — daily watermark lifetime (2026-07-19)

`NotificationSource.volatile: 'daily'` makes the seen-watermark count only on the day it
was stamped (`<id>@d` sidecar key beside the watermark — same record, no migration). Use
it for RECURRING SAME-COUNT offers: the free Boss Rush entry counts 1 today and 1 again
tomorrow, so a persistent watermark from one un-acted visit would suppress the badge
forever. At day rollover the badge re-lights while the count still stands; viewing quiets
it for that day only. `rush.freeEntry` is the first volatile source; apply deliberately —
persistent watermarks remain correct for cumulative/actionable counts that DROP on action.
