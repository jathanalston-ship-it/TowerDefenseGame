# Power Score — the universal strength index

Power Score is ASSIMILATE's single, always-visible measure of account strength. It exists to
answer one question at a glance, everywhere: **did that make me stronger?** Every permanent and
temporary upgrade folds into it, so the player never has to reason about whether a Star, an item,
or a gene card mattered — the number moves.

It is a **feedback and balancing index, not the literal sim damage number.** Its defining
invariant is monotonicity: _any_ upgrade strictly raises it.

Implementation: `src/core/power.ts` (pure) + `meta.power()` / `meta.powerWith()` (state).

---

## Formula

```
PowerScore = round( POWER_BASE × meta × towers × heroes × equipment × temporary )
POWER_BASE = 1000        # a fresh account (all multipliers = 1) reads exactly 1000
```

Each factor is a multiplier ≥ 1 on a fresh account. The composition is **multiplicative** on
purpose:

- **Every system scales every other.** A Star is worth more Power when your meta bucket is high,
  which mirrors how the systems actually compound in a run.
- **Any single increase strictly raises the total** (the core invariant) — never a wash.

A fresh account reads `1000`; a typical single upgrade moves it by a readable handful of points
(e.g. `1284 → 1297 (+13)`), which is why the base is 1000 rather than 1.

### Contributors (every listed system maps to exactly one bucket)

| Bucket | Contains | Source |
|---|---|---|
| `meta` | Permanent meta upgrades (**every** axis — tower/hero damage, fire rate, biomass, integrity, slots, cooldown, …), **Prestige** + Ascendant Tree, and **Collection** completion bonuses | `metaModifiers` × genome run-effects × `metaExtrasPower` × collection |
| `towers` | Tower **Stars** + Tower **Mastery**, geomean-averaged across the roster | `towerProgress(save)` |
| `heroes` | Hero **Stars** + Hero **Mastery**, geomean-averaged across the roster | `heroProgress(save)` |
| `equipment` | The equipped loadout: offense effects × each piece's rarity/affix index | `equipmentPower(save)` |
| `temporary` | In-run buffs: **Gene Cards** + **Tower Branch** upgrades (1 outside a run) | `meta.powerWith(effects)` |

**Future systems** attach by adding their multiplier to the relevant bucket (or a new one) — no
call site changes, because everything downstream reads the composed score.

### The `effectsPower` bridge

Equipment loadouts and gene cards are both `CardEffect[]`. `effectsPower(effects)` folds either
into one offense multiplier, so temporary and permanent gear count on the **same footing**:

- `mul` on an offense field compounds, **weighted**: raw offense (`towerDamageMult`,
  `heroDamageMult`, `towerFireRateMult`) counts fully; economy (`biomassMult`) at 0.3; everything
  else (utility, flags, instants) contributes **0** — it does not move Power.
- `add` on a designated offense field bumps (e.g. `+1` extra projectile ≈ +8%).

`itemRarityPower(rarity, affixCount)` adds a small flat index per equipped piece (rarity 1..5 →
+3%..+15%, +1% per affix) so even a pure-utility item reads as a gain when equipped.

Roster buckets use the **geometric mean** so one maxed tower/hero can't dominate the index.

---

## Display contract

Power Score is a primary feedback system, so:

- **Always visible** on the Main Menu, HUD, Profile, Run Summary, the Tower / Hero / Equipment
  screens, Gene Draft, loot summaries, upgrade screens, and both Campaign & Infinite.
- **Updates live** and **animates on change**: positive changes pulse (green); negative changes
  animate differently (red, a downward tick) so a loss never looks like a gain.
- **Upgrade previews show the delta.** Any actionable upgrade renders `current → new (+diff)` so
  the player knows _before_ committing whether it improves them.

UI primitives: `PowerBadge` (animated value) and `PowerDelta` (`current → new (+diff)`).

---

## Balancing role

Power Score is a first-class **balancing input**, not just a display. Systems that may reference it:

- **Progression-aware loot** — drop-quality windows, catch-up, and pity keyed off account
  strength (see `docs/LOOT-PROGRESSION.md`).
- **Enemy scaling / recommendation** — "recommended power" per campaign stage is now on the
  **universal index**: `recommendedPowerScore(stage) = POWER_BASE × recommendedPower(stage)` compares
  directly against `meta.power().score`, so Campaign / Play / Infinite readiness shows one number
  ("Recommended 1,500 · you 1,284 ⚠") — no more legacy `×1.x` multiples.
- **Future**: loot quality, matchmaking-style recommendations, and pity systems.

---

## Assumptions & limitations

- **Index, not sim truth.** Power Score is a monotonic, comparable index. It intentionally does
  **not** equal a run's exact damage output — statuses, reactions, targeting, and positioning are
  out of scope. It answers "stronger or not," reliably and cheaply.
- **One player-facing number.** `meta.power().score` is THE universal integer index shown everywhere
  (Menu, HUD, Profile, Run Summary, Tower/Hero/Equipment, Draft, loot, upgrades, Campaign & Infinite,
  and readiness). `meta.powerScore()` (the narrower meta × towers × heroes sub-index) is retained only
  as an internal read-model; readiness has been unified onto the universal index (above).
- **Weights are tunable.** `FIELD_WEIGHT`, `ADD_POWER`, `itemRarityPower`, and `POWER_BASE` are
  the levers; changing them re-scales the index without touching any consumer.

---

## Mandatory coverage — the engine-level guarantee (as built)

No strength-affecting content can ship without a Power evaluation, enforced in code
(`core/power.ts` + `core/validate.ts`, run at dev boot via `main.tsx` and in tests):

- **The contract.** `POWER_RELEVANT_FIELDS` lists every run-modifier field that represents account
  STRENGTH (raw + secondary offense, survivability, economy). Inverse trade-offs (`heroCooldownMult`,
  `enemyHpRunMult`) and pure utility/CC/behavior knobs are deliberately excluded.
- **The enforcement.** `uncoveredPowerFields()` returns any strength field the model
  (`FIELD_WEIGHT` ∪ `ADD_POWER`) fails to score. `validateAllContent()` (boot) and
  `validateAllContentReport()` (category `power-coverage`) turn a non-empty result into an **error** —
  the content check fails. So adding a strength field to `RunModifiers` + `POWER_RELEVANT_FIELDS`
  without weighting it is caught immediately; unknown fields score neutral (invisible to Power),
  which is exactly the danger this prevents.
- **Spike guard.** Each content source's single-source Power contribution is capped: PERMANENT gear
  (items / affixes / sets) at **+60%** (a spike permanently inflates the account curve), TEMPORARY
  run choices (gene cards / doctrines) at **+250%** (per-run, self-limiting — glass-cannon archetypes
  like Glass Genome / Apex Predator are by design, and carry an `enemyHpRunMult` downside).
- **Baseline-safe.** Every scored field defaults to its neutral value, so `effectsPower(defaults) === 1`
  and a fresh account still reads exactly `POWER_BASE` regardless of the weights — the model only grows
  MORE complete as gear/cards deviate from neutral. Pinned by `core/powerCoverage.test.ts`.
- **Every upgrade / star / item raises it (behavioral guarantee).** `state/powerIntegration.test.ts`
  buys one level of EVERY permanent upgrade, maxes each tower's and hero's Stars, and equips one item
  per slot — asserting Power STRICTLY rises every time. This is the auto-check that bites when new
  upgrade content forgets to register as strength. To honor it the `meta` bucket now folds **every**
  permanent axis (not just tower damage) + collection bonuses, and inverse upgrade fields
  (`heroCooldownMult`, `enemyHpRunMult`) are scored with negative weights so a permanent buff to them
  moves Power. No permanent upgrade can be invisible to the index.


## §feel — Power gains are events, not silent numbers (state/powerEvents.ts)

Every strength API announces `before → after + SOURCE` through the powerEvents bus:

- **Toast** (`PowerToaster`, mounted in the Hub + the in-run HUD): `▲ +18 Power` over its cause
  ("Needle Spitter — Evolution ◈4", "Equipped Marrow Claws", "Bone Mortar — Gene Level 2",
  "Tower Branch upgrade"), with burst coalescing and a 3-toast cap.
- **Audio**: the ascending `power` chime (`audio.cue('power')`) rides every gain.
- **The badge rolls**: `PowerBadge` animates the number to its new value (easeOutCubic) while
  pulsing green (gains) / red (losses) — a loss never looks like a gain.
- **Previews**: `PowerPreview` (UI-STANDARDS §11) is the standard upgrade preview — current → new
  (+diff) plus "≈ +N% strength" estimated combat impact, computed with `meta.previewPower` (the
  REAL model, so preview always equals outcome — test-pinned). Wired: Tower Lab, Hero Lab,
  Evolution HQ, Gene Archive, equipment compares.
- **Meta tripwire**: a declared strength source announcing a non-positive delta records into
  `powerAnnounceWarnings` + console.warn — the meta twin of `game.powerAuditWarnings`
  (POWER-AUDIT.md). Sidegrade/unequip announcers pass `expectGain: false`.


## §advisor — the Best-Purchase strip

"Which of these upgrades is the best Power per currency?" answered EXACTLY:
`state/bestPurchase.ts` enumerates every legal next purchase on a surface (gene card levels,
Evolution HQ genome upgrades, tower stars + Prime, hero stars + Prime — gates and caps
pre-filtered, affordability a flag, never a filter), applies each mutation hypothetically, and diffs the real pure scorer
(`powerBreakdown`). Rankings are per-currency (`valuePer1k` = Power per 1000 spent) because
cross-currency prices aren't comparable — each surface gets its own champion.

`BestBuyStrip` (ui/components) renders the headline atop the Gene Archive, Evolution HQ,
Tower Lab and Hero Lab: the best AFFORDABLE pick now, plus the overall champion as a "save up" tease when
the wallet can't reach it yet, and a QUICK-BUY key executes the affordable pick in place
(`executePurchase` — the same guarded meta action the screen's own button calls, so the strip
self-advances to the next pick). Memoized per save revision; zero-gain purchases are never
recommended. **Extension point:** a new upgradeable system adds one `candidates()` block
(mutate + cost rows) — scorer, ranking and strip are shared.

## §atlas — the Power Atlas + the Growth panel

`state/powerAtlas.ts` answers the whole loop on one card: for EVERY system that raises Power,
"what's my best next move, can I afford it now, how many moves are open?" Buy-systems (towers,
heroes — both incl. Prime rows for max-◈ units — Evolution HQ, genes, adaptation) reuse the
exact advisors above; equipment surfaces FREE exact moves (`state/equipAdvisor.ts` — the best
strictly-better vault piece per fielded hero x slot, itemPowerScore-prefiltered, exact-diffed,
one-click equip in the Armory); the remaining tend-systems (Mulligans, the Archive) get an
honest status line instead of a fake price. The cross-system **headline** compares raw `powerDelta` of
affordable picks (currency-free, so the comparison is honest — per-1k value stays per-surface).

`GrowthPanel` (ui/components) renders it as the Command Center's `growth` side organ (gated on
the towers reveal): Power headline + weekly trend + 30-day sparkline, the BEST MOVE strip, and
one jump-row per system; the headline carries a quick-buy (`AtlasAction` → purchase / adapt /
equip, each routed through its wing's guarded action). **Extension point:** a new buy-system adds
a `bestPurchase` surface and one `buyRow(...)` line; a new tend-system adds one status block.

## §history — the daily Power ledger

`save.powerLog` (v43) remembers one `{ day, score }` per UTC day — the LAST score observed that
day, bounded to the newest 90 (`POWER_LOG_CAP`). Written by `meta.notePowerSnapshot()` on app
boot and (600 ms-debounced) after every announced power gain; browser-only wiring, identical
scores never persist. `state/powerLog.ts` owns the pure folds + queries: `weeklyPowerDelta`
(newest entry ≥ 7 days old, oldest-entry fallback, null with no prior day) and `powerSeries`
(sparkline). Surfaces: the Growth panel and the Profile's Power Breakdown trend.
