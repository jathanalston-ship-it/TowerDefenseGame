# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-12 19:17 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 7f52273

## Summary of work completed

Two UX overhauls, no sim/save/balance changes. **(1) Claim-popup notification layer:**
every hub claim (quest missions/finales, season-pass levels/claim-all/premium unlock,
weekly directives — which had ZERO feedback — and wardrobe milestones) now presents through
ONE bold itemized popup (`state/rewardToast.ts` bus + `ui/components/RewardToaster.tsx`,
mounted menu-only in App). It shows exactly what was received, appends the `+N Season XP`
credit on quest claims, and derives a "view it →" jump (containers→Vault,
cosmetics→Wardrobe, essence→Gene Archive) routed via navBus. The per-screen `bp-receipt`
strips were removed. **(2) Tower mutation panel de-scroll:** `BranchTree` is now a compact
pip-track + single tier-detail card (tap any pip to preview cost/mutation/projected stat
deltas); pre-lock only the focused lane opens its detail (tap the other card to compare);
the Inspector puts the tree directly under the title, compresses stats to one strip, folds
Strain/Mulligan/Mastery into a `<details>` Host-vitals, and merges Move/Sell/Done into one
row. The buy/splice action is above the fold at 900p/1080p and mobile gets a 304px cap.
**The one thing to know:** ceremonial reveals (BioCache, VaultReveal, WardrobeReveal,
PremiumStore, SpoilsCard, Genome promotions) deliberately stay bespoke — the popup is the
RECEIPT layer; don't migrate them into it.

## Files modified

- Source (14): `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`, `src/index.css`, `src/state/mechanics.ts`, `src/state/meta.ts`, `src/ui/App.tsx`, `src/ui/BattlePassScreen.tsx`, `src/ui/Inspector.tsx`, `src/ui/QuestBoard.tsx`, `src/ui/Wardrobe.tsx`, `src/ui/components/BranchTree.tsx`, `src/ui/components/DirectivesCard.tsx`, `src/state/rewardToast.ts`, `src/ui/components/RewardToaster.tsx`
- Tests (1): `src/state/rewardToast.test.ts`
- Docs (6): `docs/DEPENDENCY_GRAPH.md`, `docs/DIL_GRAPH.md`, `docs/NOTIFICATIONS.md`, `docs/PROJECT_MANIFEST.md`, `docs/TOWER-BRANCHES.md`, `docs/VALIDATION_REPORT.md`

## Systems affected (from the dependency registry)

- **battle-pass** — `src/ui/BattlePassScreen.tsx`
- **cosmetics** — `src/ui/Wardrobe.tsx`
- **dev-registry** — `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`
- **directives** — `src/ui/components/DirectivesCard.tsx`
- **hub-shell** — `src/ui/App.tsx`
- **meta-store** — `src/state/meta.ts`
- **notifications** — `src/state/rewardToast.ts`, `src/ui/components/RewardToaster.tsx`
- **onboarding** — `src/state/mechanics.ts`
- **quests** — `src/ui/QuestBoard.tsx`
- **run-ui** — `src/ui/Inspector.tsx`
- **towers** — `src/ui/components/BranchTree.tsx`
- Consumer ring (verify, unchanged): account-level, accounts, chronicle, contracts, cutscenes, daily, daily-login, devtools, engine, expeditions, field-research, genome-rank, hero-symbiotes, hive-construction, idle-harvest, infestation, liveops, mulligans, nemesis, net-backend, nucleus, pil, profile, progression-gating, security

## Power Score changes

None. `meta.ts` changes are receipt-line appends only (`+N Season XP` on quest claims —
display strings; `grantPassXp` was already called). No scoring, buckets, or preview
surfaces moved; power/preview tests untouched and green.

## UI changes

- **New:** `RewardToaster` — center band below `.achv-stack` (top 88px, z 492), one popup
  at a time, `+N` chip for queued receipts, itemized rarity-tinted lines (≤7 + "+N more"),
  optional nav chip, `role="status"`, reduced-motion safe, `--dur`/`--ease` tokens only.
- **QuestBoard / BattlePassScreen:** claims push the popup; local `bp-receipt` strips
  removed (CSS pruned; `bp-pop` keyframe kept — the popup's lines reuse it). Claim bursts
  on the cell/cursor kept as local juice. Premium unlock pushes a big popup.
- **DirectivesCard:** claims now popup + `audio.cue('chest'|'jackpot')` (was silent).
- **Wardrobe milestones:** claims popup (nav: null); `wd-miles-receipt` strip removed.
- **Inspector (mutate):** order is the design — title → branch/tier summary → one-line
  stat strip → one-line lock note → BranchTree → Host-vitals `<details>` → Move/Sell/Done
  row. `Done` button folded into the manage row; `branch-done` CSS removed.
- **BranchTree:** pip track (28px-min tap targets, aria-pressed) + `TierDetail` card with
  projected `statDeltas` ("DPS ~8 → ~63"); pre-lock lane focus (CHOOSE/COMPARE tags);
  committed lane pins; locked-out lanes stay slim bars.
- **Headless smoke coverage:** scripted Chromium run (scratchpad) drove the real app —
  toast small/big/queue/nav-to-Vault, pre-lock compare, T4 pip preview, splice confirm,
  T2 evolve, host-vitals fold, 620px mobile band. 15 screenshots reviewed; panel overflow
  measured (pre-lock decision fully above the fold at 752px/572px client heights).

## Documentation changes

- Updated: `docs/NOTIFICATIONS.md` (new §claim-popups — canonical for the popup),
  `docs/TOWER-BRANCHES.md` §3 (compact panel layout), `docs/PROJECT_MANIFEST.md`
  (Notifications framework row), `docs/DEPENDENCY_GRAPH.md` + `docs/DIL_GRAPH.md`
  (regenerated), `docs/VALIDATION_REPORT.md` (PASS), HelpWiki `tower-branches.where`
  copy (teaches pip preview).
- The long registry list in this section's scaffold: no other doc moved — "no change
  needed" (no behavior in those systems changed; only their claim RECEIPT presentation,
  documented in NOTIFICATIONS.md).

## Save changes

None — save layer untouched.

## Known edge cases

- `rewardToast.push` before the toaster mounts is dropped by design (navBus semantics);
  claims only happen on hub screens where App mounts it, so nothing is lost.
- Explicit `nav: null` suppresses the derived jump (used when the claim already lives on
  the destination screen — wardrobe milestones, battle-pass premium unlock).
- Destination derivation keys on receipt ICONS — if `meta.applyRewardList` /
  `battlePass.rewardLabel` ever change an icon, update `DESTINATIONS` in
  `state/rewardToast.ts` (rewardToast.test pins the mapping).
- Nav jumps can land on a progression-sealed screen (e.g. Vault before first container) —
  the screen's own sealed presentation handles it; after a real container claim the wing
  is unsealed by definition.
- `BranchTree` is keyed by tower instance (`key={sp.id}`) so pip previews never leak
  between towers; after a buy, the lane's selection snaps back to "the next tier".
- Pre-lock lane focus lives in component state — selecting another tower resets it (same
  key mechanism). The unfocused lane card is fully clickable to flip focus.

## Remaining technical debt

- The smoke scripts live in the session scratchpad (not the repo) — a committed
  Playwright harness is still an open item (ENGINEERING-AUDIT.md).
- `index.css` remains one large stylesheet (~9.7k lines; known audit item).
- Expedition SpoilsCard is a second, older receipt presentation — fine (it's inline and
  informative), but if it ever needs uplift, route it through `rewardToast`.

## Recommended next tasks

1. Play a real weekly-quest claim → finale → cutscene premiere chain end-to-end on a
   progressed save (the smoke drove the bus + real claims on fresh-save surfaces; a
   deep-save pass would exercise repeat-finale substitution lines in the popup).
2. Consider a `notifSound` wardrobe-kind hook for the popup (audio stays at claim sites
   today; a per-claim cosmetic voice is a natural extension).
3. If the branch roster grows past 2 lanes/tower, the focus pattern already scales — but
   revisit the pre-lock default (focus the lane matching the tower's last-used branch?).

## Future expansion hooks

- `state/rewardToast.ts` — `RewardToastInput.nav` accepts any Hub NavKey; new claim
  surfaces are one `rewardToast.push` after their `meta` claim call.
- `DESTINATIONS` table (same file) — one row per new reward icon → destination.
- `BranchTree`'s `statDeltas` (`ui/components/BranchTree.tsx`) — extend when
  `branchStatsView` grows new dimensions; chips cap at 3 by design.
