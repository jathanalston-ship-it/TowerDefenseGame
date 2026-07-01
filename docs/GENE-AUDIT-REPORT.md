# GENE-AUDIT-REPORT.md — Gene Evolution: final audit, stress test & closing report

The Task 12 close-out of the 12-task Gene Evolution program (spec + design detail:
`GENE-EVOLUTION.md`; live status: `GAME-STATE.md`). **Verdict: the system passes every audit
item, scales to 500 cards with no redesign, and is hereby a permanent core progression pillar
alongside Towers, Heroes, Equipment, Campaign, and Prestige.**

Audit date: 2026-07-01 · suite at audit: **707 tests, 113 files, all green** · goldens
byte-identical · typecheck + build clean.

---

## 1. Audit checklist — every item verified with pinned evidence

| # | Verify | Result | Evidence |
|---|---|---|---|
| 1 | No Gene Card bypasses the upgrade system | ✅ | `cardProblems` REQUIRES 3–5 authored levels on every card (registration validator); `geneUpgrades.test.ts` sweeps all 45 + rejects orphans |
| 2 | No Gene Card bypasses Power Score | ✅ | `cardProblems` rejects any level (or ascension tier) with `effectsPower ≤ 1`; `geneUpgrades.test.ts` proves strictly-rising power per level; `geneAscension.test.ts` pins the tier rule |
| 3 | Every upgrade is documented | ✅ | doc-sync check: all **45 cards + 168 level notes** appear verbatim in `GENE-EVOLUTION.md` (audit script, NONE missing) |
| 4 | Save migration works | ✅ | `saveStore.test.ts`: pre-v18 import fills `genes {} / geneEssence 0 / geneSlots 1 / geneLoadout [null×5]`; manipulated state clamps (unknown ids dropped, levels/tiers to authored ceilings, wallet ≥ 0, loadout deduped) |
| 5 | Tutorials are updated | ✅ | Combat Tutorial gene-card step teaches run-boost + permanent Archive (`core/tutorial.ts`); `TUTORIAL.md` reconciled |
| 6 | Help pages are updated | ✅ | 4 Help mechanics (gene-cards/-essence/-archive/-loadout) + HUD Tour stop + loading tips + in-Archive help; headless smoke verified all four wiki entries incl. the gate ladder + future-Ascension teaching |
| 7 | Campaign gating functions | ✅ | `geneArchive.test.ts`: gate ladder (L2@15…L5@75), `upgradeGene` refuses gated buys, requirements always SHOWN, Next-Goal surfaces the biting gate |
| 8 | Loadouts function | ✅ | `geneLoadout.test.ts`: dual-gated slot buys, dedupe, swap, boot auto-apply (×1.187 measured) + golden-safe empty; live smoke (equip → run start splash) |
| 9 | Duplicate conversion functions | ✅ | `geneEssence.test.ts` + meta tests: max-Star excess shards → Essence at rarity rates, shown on the reveal with the reason; container-rarity seam fixed (loot boxes pay their own rarity) |
| 10 | Bio-Container drops function | ✅ | `geneEssence.test.ts`: `rollEssenceDrop` chance/amount scale with rarity/campaign/power under hard caps; never replaces guaranteed rewards (additive event pull) |
| 11 | UI scales correctly | ✅ | Archive renders from the registry-driven read-model (no per-card layouts); stress: 500-card row derivation 2.7 ms (§2) |
| 12 | Search works | ✅ | name+description query over rows (`GeneArchive.tsx`); live sort-smoke |
| 13 | Sorting works | ✅ | 6 sorts + 9 filters, pinned-first then favorites (`sortRows`); stress sort at 500 rows 0.2 ms |
| 14 | Notifications work | ✅ | `geneArchive.test.ts`: the `genes` channel counts upgradeable cards, clears on view, re-lights (generic engine clamp rule) |
| 15 | Upgrade previews work | ✅ | `geneArchive.test.ts`: preview uses the REAL Power model — `previewPower` prediction `===` post-upgrade score exactly |
| 16 | Performance remains acceptable | ✅ | §2: every hot derivation < 3 ms at 500 cards; the sim is untouched (genes fold at draft/boot only, never per-tick) |

---

## 2. Stress test — 100 / 250 / 500 Gene Cards

Synthetic, validator-clean cards registered on top of the real 45 (`state/geneStress.test.ts`
keeps this pinned in CI; measured timings via the bench script, warm, node):

| Registered cards | Archive rows | Summary | Power fold | Sort | Sanitize | Validate ALL | Maxed collection mult |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0.23 ms | 0.14 ms | 0.12 ms | 0.86 ms | 0.53 ms | 0.92 ms | ×3.55 |
| 250 | 0.57 ms | 0.04 ms | 0.27 ms | 0.08 ms | 0.33 ms | 0.82 ms | ×7.08 |
| 500 | 2.73 ms | 0.06 ms | 0.22 ms | 0.17 ms | 0.51 ms | 1.42 ms | ×12.97 |

**The architecture scales without redesign**: every derivation is linear, registry order stays
stable (save compatibility), the real pool is untouched by growth, and the validator sweeps 500
cards in ~1.4 ms at dev boot. The one *scale-coupled tunable* is `GENE_POWER_SCALE` (see §5) —
a maxed 500-card library reads ×12.97 today because the constant is calibrated for 45 cards.

---

## 3. What was implemented (Tasks 1–12)

1. **Architecture** — every card a permanent collectible; `CardDef` scaffolding + sparse
   `save.genes`; `effectiveGeneEffects` run seam; golden-safe at level 0.
2. **Gene Essence** — new permanent currency; max-Star duplicate shards auto-convert at
   rarity-scaled rates, shown with the reason on the reveal; reset/manipulation-proof.
3. **Container drops** — rare additive Essence bonus scaling with rarity/campaign/power;
   economy simulated at 10/50/200/1000 h and retuned (first upgrade ≈ hour 3–4; duplicates
   remain 96–98 % of income; library sink ≈ hour-400).
4. **Upgrade content** — 3–5 meaningful levels for ALL 45 cards (168 levels: new projectiles,
   radii, durations, chains, statuses, stacking, keystones, riders) — no plain %-only levels.
5. **Gene Archive** — sidebar screen: art, pips, costs, gates, Power, owned/upgradeable signals
   + full inspection overlay; zero hardcoded layouts.
6. **Campaign gates** — global level unlocks L2@15 · L3@30 · L4@50 · L5@75; requirements always
   visible; the biting gate surfaces on Home/Results via Next-Goal.
7. **Starting Gene Loadouts** — 1 free slot → 5, each further slot Campaign AND Genome Cores;
   rearrange, no duplicates; auto-apply at boot + cinematic splash; Power updates instantly.
8. **Archive at scale** — search, 9 filters, 6 sorts, favorites, pinning, keyboard/controller
   grid navigation.
9. **Power integration** — `GENE_POWER_SCALE` calibrated (0.15 ⇒ ×≈2.26 maxed current library);
   real-model upgrade previews (prediction === outcome, test-pinned); bypass validation.
10. **Ascension backend** — complete data/effects/Power/rarity/art/save/validation seams;
    zero gameplay (no tiers authored; sanitizer clamps to 0); ONE documented wire remains.
11. **Onboarding + docs** — tutorial, HUD Tour, 4 Help mechanics, loading tips, Collection
    labels, in-Archive help; CARDS/ECONOMY/CODEMAP/PROGRESSION-SYSTEMS/HELP/TUTORIAL/GAME-STATE
    reconciled; compressed system summary in GAME-STATE.md.
12. **This audit** — checklist, migration/notification/stress pins, benchmarks, report.

## 4. Remaining future hooks

- **Card Ascension** — backend complete; ship = author `def.ascension.tiers` + pass the saved
  tier at the two run seams (`chooseCard`, starting-gene boot). Power/rarity/art/save/validation
  already live.
- **Rarity upgrades** — `GeneCardSave.rarityTier` + `geneEffectiveRarity` ladder resolution are
  in place; needs a grant path + UI.
- **Skins / artwork** — `def.skins` + `geneArtKey` resolution ready; `GeneCardArt` remains the
  procedural fallback until real art lands.
- **Library growth** — a new card is one `CARD_POOL` row + one `GENE_UPGRADES` entry; the
  validator refuses anything incomplete or Power-invisible.

## 5. Potential technical debt

- **`GENE_POWER_SCALE` is library-size-coupled.** Calibrated for 45 cards (×2.26 maxed). At
  100+ authored cards the maxed multiplier drifts up (×12.97 at 500) — re-measure per the
  calibration comment; the `geneCards.test.ts` ×2–2.6 band will fail loudly as the reminder.
- **Early-game Essence depends on the container drip** until a first max-Star unit exists;
  acceptable by design (duplicates dominate later), worth a first-conversion celebration later.
- **Archive DOM at 500 tiles** renders one grid (no virtualization). The read-model is ~3 ms;
  the DOM itself will want windowing somewhere past a few hundred VISIBLE tiles — filters
  already keep working sets small, so this is deferred, not forgotten.
- **`help.seen` / gene timestamps grow with content** — bounded by registry size; harmless.

## 6. Recommended next development steps

1. **Ship Card Ascension** (the backend's one wire + tier content + a Vault-style ceremony) —
   the designed post-level-cap sink the economy already points at (`GENE-EVOLUTION.md §sink`).
2. **Grow the library toward 100 cards** through the validator (synergy families that feed
   tower branches/heroes), re-calibrating `GENE_POWER_SCALE` at each milestone.
3. **First-conversion moment** — a one-time celebration when duplicate shards first become
   Essence (the loop's aha-moment currently teaches via tooltip/help only).
4. **Real card artwork + skins** through `geneArtKey` (procedural stays the fallback).
5. **Archive virtualization** when the visible grid regularly exceeds ~300 tiles.

---

**Closing statement:** the Gene Evolution system is complete, verified end-to-end, and is now a
**permanent core progression pillar** alongside Towers, Heroes, Equipment, Campaign, and
Prestige. Treat its seams (`geneCards.ts` reads, the validator contract, the linear Power fold)
as stable infrastructure; extend through data, not redesign.
