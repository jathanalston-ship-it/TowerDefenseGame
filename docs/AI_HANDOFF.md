# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-19 09:35 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 5466dce

## Summary of work completed

COSMETIC PROVENANCE & COLLECTOR PRESTIGE (v53 layer, docs/COSMETICS.md §provenance):
every cosmetic now resolves a **derived museum record** — release era, availability
(retired/reissued/limited/available), 13 truthful legacy badges, curated Hive Archives
lore, and null-provider census/market seams — joined by `meta.collectorView(id)` and
presented in the Specimen Vault's new **Collector Panel** (card tap). The one thing the
next session must know: **nothing here is authored per item and the client NEVER
fabricates network numbers** — census/market return null until a server installs
providers (TRADING-PREP.md §7; the future census source is the new durable `cos_claim`
analytics row, emitted ONLY in SpecimenVault's claim handler — the state layer stays
telemetry-free). Also fixed in passing: BOTH vault overlays now render through the
Popup portal — the screen-transition transform made `.screen` the fixed-position
containing block, off-centering every overlay on short screens.

## Files modified

- Source (8): `src/changelog/releases.gen.ts`, `src/core/analyticsEvents.ts`, `src/core/wardrobe.ts`, `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`, `src/index.css`, `src/state/meta.ts`, `src/ui/SpecimenVault.tsx`
- Tests (2): `src/core/wardrobe.test.ts` (+5 'provenance & collector prestige' laws), `src/state/wardrobeMeta.test.ts` (+3 'collectorView' joins)
- Docs (9): `docs/ANALYTICS.md`, `docs/COGLOAD_REPORT.md`, `docs/COSMETICS.md` (§provenance), `docs/DEPENDENCY_GRAPH.md`, `docs/DIL_GRAPH.md`, `docs/GAME-STATE.md`, `docs/HISTORY.md`, `docs/TRADING-PREP.md` (§7 census/market contract + stale cosmetic-unlock bullet corrected), `docs/VALIDATION_REPORT.md`

## Systems affected (from the dependency registry)

- **cosmetics** — `src/core/wardrobe.ts` (eras/availability/badges/HIVE_ARCHIVES/census+market seams + wardrobeProblems provenance laws), `src/ui/SpecimenVault.tsx` (CollectorPanel + Popup-portaled overlays + `cos_claim` emit)
- **meta-store** — `src/state/meta.ts` (`CollectorView` interface + `meta.collectorView` read-model; no state mutation added)
- **analytics** — `src/core/analyticsEvents.ts` (ONE new row: `cos_claim`, dim=item id, durable)
- **dev-registry** — knowledge edge (provenance layer) + cosmetics purpose note; graphs regenerated
- **chronicle** — `releases.gen.ts` regen (previous batch's commit chronicled)
- Consumer ring (verify, unchanged): battle-pass/quests/daily-login/liveops/collection — no grant-path or claim-path behavior moved this batch

## Power Score changes

None. The provenance layer is read-only derivation: `collectorView` reads existing
state, badges/eras/lore are pure functions of the catalog, and census/market are null
seams. No bonus values, lanes, folds, or weights moved — pinned unchanged by the
existing wardrobe.test saturation laws and wardrobeMeta.test power test (2557/2557
suite green).

## UI changes

- **Collector Panel** (SpecimenVault): tapping any vault card opens the museum page —
  static rarity-lit specimen plate, badge chips (glyph+label, desc tooltips), HIVE
  ARCHIVES lore shelf (omitted when no entry), 9 provenance ledger rows (Released
  during / First introduced / Originally earned by / Availability / Currently owned by /
  Network census / Auction record / Collection status / Auction eligible — census and
  market rows show the honest "— awaiting network census / market data" placeholders
  pre-AH), bonus line, your-copy history (acquired date · source · season · transfers
  from the provenance stamp), claim CTA (unclaimed only — same `claim()` handler as the
  card), family completion meter footer. Zero ambient animators (cogload attn 0 holds);
  `svCereIn` reused as the one finite entrance.
- **Popup-portal fix**: CollectorPanel AND ClaimCeremony now render through
  `components/Popup.tsx` — verified headlessly (panel geometry measured: was centering
  against the transformed `.screen` box, top clipped off-viewport; now viewport-centered).
- Headless probe (scratchpad probe-collector.ts): card tap → full museum page → claim
  from panel → ceremony stacks above → page flips to bound in place (family 0/9 → 1/9,
  Auction eligible Yes → No — bound, claim CTA gone). mobilecheck CLEAN (31 screens),
  cogload in budget, uiStandards-conformant fonts/tracking/radii.

## Documentation changes

`docs/COSMETICS.md` gained §provenance (eras/availability/badges/archives/census/
collectorView/panel + validator laws). `docs/TRADING-PREP.md` gained §7 (census +
market-record contract: shapes, server sources of truth incl. the `cos_claim` census
lane, the future GET /api/census/cosmetics endpoint) and its Known-limitations bullet
now records that cosmetics left the unlock-transfer model in v53 (instances are the
tradable unit). `docs/ANALYTICS.md` taxonomy line lists `cos_claim`. GAME-STATE wardrobe
summary gained the provenance paragraph (anchor stays `CURRENT_VERSION = 53`).
DIL edge added (system:cosmetics provides system:online-foundation — the provenance
note) + DIL_GRAPH/DEPENDENCY_GRAPH regenerated. All other registry-listed docs: no
change needed (blast-radius listing only).

## Save changes

None — save layer untouched. The entire layer derives from the existing v53 shape
(catalog + `wardrobe.owned/inventory` + the provenance ledger); `CURRENT_VERSION`
stays 53 and no sanitizer moved.

## Known edge cases

- **Fixed overlays under screen transitions**: any `position: fixed` overlay rendered
  INSIDE `.screen` centers against the screen box, not the viewport (the transition
  transform persists as the containing block). Always return overlays through
  `components/Popup.tsx` — this batch retrofitted both vault overlays; check any new
  screen dialog against this.
- **Hand-injected instances read "legacy"**: instances that skip `receiveCosmetic`
  (e.g. probe-seeded saves) get honest `legacy` reconcile stamps (at: 0 renders
  "acquired before the ledger"). Real deliveries carry source/at — claiming carries
  them into the permanent bound stamp (probe-verified: "Pollen Bazaar · Season 1").
- **The unclaimed view's stamp** is the NEWEST instance's; older dupes keep their own
  stamps until claimed/pruned. The bound stamp always wins once claimed.
- **`introducedLabel` month parsing** reads the era version tag (`v2026.07` → July
  2026) and falls back to the year alone for tags without a month — a future era with
  a non-standard version never crashes the panel.
- **Availability wording**: battlepass/event/quest/login-drop sources read "Limited
  distribution window" even while their window is live — the availability derivation
  is about source class, not live calendar state (deliberate; the calendar is liveops').

## Remaining technical debt

- `RETIRED_ITEMS`/`REISSUED_ITEMS`/`BADGE_OVERRIDES`/`ERA_OVERRIDES` are empty —
  the curation knobs exist with validator laws but no rows are authored yet (correct
  for a launch catalog that is all first-edition genesis).
- The census/market endpoint (`GET /api/census/cosmetics`) is documented but not
  implemented — the seams stay null until the Auction House server work lands.
- CollectorPanel shows season only via the your-copy stamp; a battle-pass season NAME
  row (from `def.source.season`) was folded into "Originally earned by" (sourceLabel
  already names the season) — revisit only if players ask for a dedicated row.

## Recommended next tasks

1. Auction House cosmetic listings — `wardrobe.inventory` instances into the AH
   surface (`src/ui/AuctionHouse.tsx`), tradable = unclaimed instance, settle via
   `recordTransfer` + instance move; the census endpoint (TRADING-PREP.md §7) can land
   with it and light up the panel's network rows.
2. Curate the first BADGE_OVERRIDES/lore expansion — e.g. anniversary rows when the
   first anniversary era ships (pure data, `wardrobeProblems` bounds it).
3. Vault polish carried from last batch — bulk-claim ("Bind all commons"), family
   shelf headers in the grid.

## Future expansion hooks

- `ERA_OVERRIDES` / `COSMETIC_ERAS` (`src/core/wardrobe.ts`) — a future content wave
  is ONE era row + per-item override rows; `cosmeticEra` resolves everything else.
- `RETIRED_ITEMS`/`REISSUED_ITEMS` sets — retirement/reissue is a data decision;
  `cosmeticAvailability` + badges + the panel react automatically.
- `setCosmeticCensusProvider`/`setCosmeticMarketProvider` — the boot sequence installs
  both from one fetch when the census endpoint ships; every UI surface lights up with
  zero component changes.
- `CollectorView` (`src/state/meta.ts`) — the AH item-inspection page can reuse the
  same read-model verbatim (it already carries tradable counts + the stamp).
- `cos_claim` durable row — server-side aggregation per item id IS the census
  `claimed` column; no additional client instrumentation needed.
