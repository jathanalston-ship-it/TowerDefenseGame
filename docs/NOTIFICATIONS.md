# NOTIFICATIONS.md — Global Menu Notification Badges

Compressed developer summary (the canonical reference — prefer over re-reading code).

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
