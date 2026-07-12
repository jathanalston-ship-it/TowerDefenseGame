# NOTIFICATIONS.md — Menu Badges + the Claim Popup

Compressed developer summary (the canonical reference — prefer over re-reading code).
Two layers: **badges** (dots that say "there's something here") and the **claim popup**
(the bold receipt that says "here's exactly what you just got").

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

## §claim-popups — the global claim receipt

**Every hub claim presents through ONE popup** instead of per-screen receipt strips:
quest missions/finales, season-pass levels + claim-all + the premium unlock, weekly
directives (which had NO feedback before), and wardrobe milestones. Ceremonial
reveals deliberately stay bespoke (Bio-Cache, Vault reveal, WardrobeReveal, Premium
Store, expedition SpoilsCard, Genome promotions) — the popup is the RECEIPT layer,
not the ceremony layer.

- **`src/state/rewardToast.ts`** — the bus (navBus pattern, save-free). `rewardToast.push({
  title, name?, icon?, accent?, lines, big?, nav? })` where `lines` are
  `PremiumReceiptLine`-shaped `{ icon, label, rarity? }` — exactly what `meta.claim*`
  returns. `nav` omitted → **derived from the receipt icons** (single-sourced in
  `meta.applyRewardList` / `battlePass.rewardLabel`): containers → Vault, cosmetics/
  phenotypes → Wardrobe, essence → Gene Archive; containers out-rank the rest. Pass
  `nav: null` when the claim already lives on the destination screen.
- **`src/ui/components/RewardToaster.tsx`** — mounted once in App (menu only, so it can
  never cover a live run). Center band BELOW `.achv-stack` (top 88px, z 492): medallion,
  eyebrow title, headline name, itemized lines (rarity-tinted, ≤7 + "+N more"), the
  "view it →" chip (routes via `navBus.go`), a `+N` chip for queued receipts. One at a
  time; click dismisses; 5s dwell (6.8s for `big`); `role="status"`; reduced-motion safe.
- **Audio stays at the claim site** (no double cues). Quest claim receipts also append
  their `+N Season XP` line in `meta.claimQuestMission/Finale` — the popup teaches the
  quests→season-pass loop.
- **Add a claim surface:** call `meta`'s claim → get lines → `rewardToast.push` with a
  title/name and the right accent. Tests: `src/state/rewardToast.test.ts` (queue +
  destination derivation).
