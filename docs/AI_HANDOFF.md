# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-19 08:06 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 0fe4247

## Summary of work completed

TWO-STATE COSMETIC OWNERSHIP (save v53, docs/COSMETICS.md §claiming/§bonuses/§families):
every cosmetic now ARRIVES as an UNCLAIMED tradable instance in the new **Specimen Vault**
(nav `specimens`, reveal-on-need) and only CLAIMING (`meta.claimCosmetic`, guard
`cosmetic.claim`) binds it — unlocking equip/collections and activating a tiny saturating
permanent bonus. The one thing the next session must know: **`wardrobe.owned` still means
CLAIMED** — every pre-v53 consumer (equip gates, codices, dressing, achievements) reads it
unchanged BY CONSTRUCTION, and `receiveCosmetic` (state/meta) is the ONE delivery
chokepoint every acquisition lane goes through. Substitution is retired for cosmetics:
repeatable reward tracks mint tradable duplicates (the future Auction House's supply);
`wardrobe.granted` is the once-per-source gate for auto/boutique/direct lanes.

## Files modified

- Source (18): `src/changelog/releases.gen.ts`, `src/core/itemIdentity.ts`, `src/core/wardrobe.ts`, `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`, `src/i18n/index.ts`, `src/index.css`, `src/save/saveStore.ts`, `src/security/registry.ts`, `src/state/mechanics.ts`, `src/state/meta.ts`, `src/state/notificationSources.ts`, `src/state/unlocks.ts`, `src/ui/App.tsx`, `src/ui/Hub.tsx`, `src/ui/components/WardrobeReveal.tsx`, `src/ui/navModel.ts`, `src/ui/SpecimenVault.tsx` (NEW)
- Tests (4): `src/core/wardrobe.test.ts` (+6 ownership/bonus laws), `src/state/wardrobeMeta.test.ts` (rewritten for two-state: poll/claim/dupes/boutique/milestones/migration/sanitizer — 15 tests), `src/state/loginMeta.test.ts` + `src/state/questsMeta.test.ts` (owned assertions → Vault assertions)
- Docs (8): `docs/COGLOAD_REPORT.md`, `docs/COSMETICS.md` (three new sections), `docs/DEPENDENCY_GRAPH.md`, `docs/DIL_GRAPH.md`, `docs/GAME-STATE.md` (anchor 53 + wardrobe summary), `docs/HISTORY.md`, `docs/UNLOCK-TREE.md`, `docs/VALIDATION_REPORT.md`

## Systems affected (from the dependency registry)

- **cosmetics** — `src/core/wardrobe.ts` (ownership/bonus/family layer), `src/ui/SpecimenVault.tsx` (NEW screen), `src/ui/components/WardrobeReveal.tsx` (arrival copy)
- **meta-store** — `src/save/saveStore.ts` (v53), `src/state/meta.ts` (receiveCosmetic + claimCosmetic + folds + power)
- **online-foundation** — `src/core/itemIdentity.ts` (cosmetic instance stamps + pruning)
- **progression-gating** — `src/state/unlocks.ts` (`cosmeticInventory` condition + specimens row)
- **hub-shell / i18n / notifications / onboarding / security / dev-registry / chronicle** — routing, nav.specimens ×3 locales, `cosmetic.unclaimed` source, teach row, `cosmetic.claim` guard, registry claims, notes regen
- Consumer ring (verify, unchanged): battle-pass, quests, daily-login, liveops, collection — their COSMETIC GRANTS now land in the Vault (tests updated), their own logic untouched

## Power Score changes

Claimed-cosmetic bonuses fold into the `meta` bucket as `wardrobeMult`
(`effectsPower(wardrobeEffectsOf(save))`) beside the Battle Pass permanents. **Fresh
accounts still read POWER_BASE**: starters carry NO bonus by validator law
(`wardrobeProblems` — the 1002-bug guard), so the fold is ×1 until something is claimed.
Magnitudes are tiny (0.2–0.8% per claim, 7 lanes saturating at 6%/lane ≈ +4.4%/lane for a
complete launch collection). Pinned by wardrobe.test (starters-zero + saturation laws) and
wardrobeMeta.test ("claiming moves the fold and Power").

## UI changes

- **Specimen Vault** (NEW screen, Market hub, `⧉`): masthead stats (awaiting/bound/spares)
  + Detail explainer, search, ownership chips (Awaiting/Bound/All), group + sort filters
  (recent/rarity/name/duplicates), rarity-tinted cards with dupe counts,
  TRADABLE/BOUND ✓ chips, per-item bonus line, favorite stars on bound pieces, bounded
  240-card render window. ZERO ambient animators (cogload attn 0). Claim plays the finite
  **assimilation ceremony** (rarity card + "+X% lane — forever" + "Woven in").
- **WardrobeReveal** copy retuned: arrivals read "SPECIMEN ACQUIRED … Claim it in the
  Vault" (they are no longer unlocks); batch card says "landed in the Vault".
- Verified live headlessly: seeded instances → vault renders states/dupes/bonuses → real
  claim → ceremony + achievements/Account-XP cascade + Bound view; mobilecheck CLEAN
  (31 screens — the Vault auto-joined the registry sweep), cogload 72/72 in budget.

## Documentation changes

`docs/COSMETICS.md` gained §claiming (two states, chokepoint, migration, provenance,
Vault UI), §bonuses (lane table, rarity magnitudes, saturation math, consumption seams,
POWER_BASE law) and §families (the derived AH taxonomy). GAME-STATE: anchor
`CURRENT_VERSION = 53` + the Wardrobe summary's v53 paragraph. DIL edge added + graph
regenerated; DEPENDENCY_GRAPH + UNLOCK-TREE regenerated. All other registry-listed docs:
no change needed (blast-radius listing only).

## Save changes

`CURRENT_VERSION` 52 → **53**. `wardrobe` gains `inventory: CosmeticInstance[]`
({uid, item, at, src}, uid `ci_`-prefixed, sanitizer: known items only, unique uids,
cap 999) and `granted: string[]` (ids ever delivered; sanitizer seeds it from
owned ∪ inventory so pre-v53 saves migrate lossless — **owned stays CLAIMED, nothing is
taken away**). `pendingReveal` sanitizer now keeps ids held in EITHER state.
`reconcileProvenance` gained `cosmeticInstanceUids` (stamps instances legacy, prunes
`cos:ci_*` stamps whose instance left; `cos:wd_*` stamps stay permanent). Migration law
pinned by wardrobeMeta.test "a pre-v53 save migrates".

## Known edge cases

- A stray `shopBought`-style edge does NOT exist here, but its cousin does: a hacked
  `granted` entry for an item never delivered simply blocks that item's auto-grant — the
  sanitizer unions granted from owned∪inventory and never invents deliveries.
- `claimCosmetic` deliberately does NOT mark the item `seen` — the Wardrobe's NEW badge
  flow still works (markWardrobeSeen clears on visit).
- The login-drop jackpot now ALWAYS delivers (dupes are tradable) — the old owned-gated
  "wasted jackpot" path is gone; its provenance rides the instance uid, not `cos:<id>`.
- The Vault reveals on the FIRST instance (minute ~1 via the Bronze Fret poll). This is
  deliberate reveal-on-need — the arrival card points at the Vault, so it must be
  reachable; the unlocks pacing tests accept it (condition reveals are exempt from the
  per-stage ceiling, the stage-8 backstop takes the last stage-8 slot).
- Boutique stays once-per-account (granted-gated) — re-buy-after-trade is an explicit
  FUTURE AH-era decision, recorded in COSMETICS.md.

## Remaining technical debt

- `BONUS_OVERRIDES` / `FAMILY_OVERRIDES` are empty maps — the balancing knobs exist but
  no per-item overrides are authored yet (defaults cover the catalog).
- The Vault renders a bounded window instead of virtualizing; at true thousands-scale a
  windowed list is the upgrade (the 240-cap + filters carry to ~1k comfortably).
- Trading itself (listing/settlement) remains future work — this batch is the ownership
  backend the Auction House will consume (TRADING-PREP.md).

## Recommended next tasks

1. Auction House cosmetic listings — wire `wardrobe.inventory` instances into the AH
   surface (`src/ui/Auction*.tsx`), tradable = unclaimed instance, settle via
   `recordTransfer` + instance move.
2. Vault polish — bulk-claim ("Bind all commons"), provenance inspector per instance
   (`itemProvenance`), family shelf headers.
3. ScreenHeader ready-state chips (carried; gold ring on readyChain membership).

## Future expansion hooks

- `WardrobeBonusLane` union + `KIND_LANE` map (`src/core/wardrobe.ts`) — a future lane is
  one union member + one consumption line in `wardrobeEffectsOf`/`accountEconomyBonuses`
  (an `idleHarvest` lane is the named candidate).
- `BONUS_OVERRIDES`/`FAMILY_OVERRIDES` — per-item balancing/curation without row churn;
  `wardrobeProblems()` bounds every override.
- `CosmeticInstance.src` carries the human acquisition source into the bound provenance
  stamp — the AH's item-history tooltip reads it for free.
- `cosmeticFamily` is the AH browse taxonomy; `globalItemId` namespaces instance uids at
  the trade boundary (server-owned).
