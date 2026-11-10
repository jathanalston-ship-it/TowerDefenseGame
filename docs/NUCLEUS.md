# NUCLEUS.md — Nucleus Mulligans (the Hive's own organ system)

The Hive Nucleus is a permanent build-customization pillar: the Mulligan system's HIVE twin.
Where every tower grafts ONE three-modifier organism, the Nucleus grows up to **three CHAMBERS**,
each a full three-organ Mulligan triple. Core: `src/core/nucleus.ts` (pure data + helpers).

## Identity (§identity)

Nucleus organs are **support, never raw tower DPS** — economy, survivability, wave manipulation,
enemy debuffs, hero support, tower support. The registry **rejects any organ touching
`towerDamageMult`** (the future-organ contract; `nucleus.test.ts` also pins the adaptation
bonuses to the same rule).

## Architecture

- **Organ** (`NucleusOrgan`): one registry row — class (the SAME six-class taxonomy towers and
  Mulligan modifiers share), category (`metabolic` economy / `membrane` survivability /
  `dominion` command), fixed rarity (the Mulligan rarity ladder), level-1 `CardEffect[]`, a
  `mutation` motif for the renderer, and a `powerWeight`. 30 organs: **five per class** (so a
  class adaptation is a CHOICE among organs, not a forced set — pinned by test), ten per category.
- **State** (`save.nucleus`, schema v37): `grown` (organ id → level — the permanent dex),
  `chambers` (organ id refs, exclusive — one seat per organ), `unlocked` (1..3), `adapted`
  (lifetime full-adaptation classes — the codex ledger, never confiscated by re-slotting).
- **Resolution** (`resolveNucleus`): identity until a chamber has all three organs grown+slotted
  (the Mulligan no-partial-activation rule ⇒ **golden-safe**: a fresh save folds nothing and the
  Power index reads exactly POWER_BASE). Active chambers contribute their organs' level-scaled
  effects, mutations, and power; each chamber's **class adaptation** (3-match = FULL + the crown
  crest, 2-match = minor) adds its bonus on top.

## Run integration (the seam)

`meta.nucleusEffects()` → `RunOptions.nucleusEffects` → folded at boot in `game.ts` right beside
`opts.runEffects` (before integrity/biomass/heroes consume the mods, so **boot-only fields like
`integrityMult` are legitimate organ vocabulary** — the Nucleus always applies at boot). Kept out
of the **tutorial** sandbox and the shared **Daily** gauntlet, mirroring tower Mulligans.

## Visuals (§visuals)

`render/nucleusDress.ts` — the wardrobeFx pattern: GameView sets the resolved mutation kit at run
boot (module state; null for daily/tutorial), `renderer.drawBase` draws the motifs over the
organism: **veins, plating, eyes (blinking), tentacles (waving), pulse halos, sacs, spores** —
duplicates deepen a motif; every COMPLETE adaptation crests the golden **crown**. Deterministic
from time only (no RNG, no flicker); empty kit ⇒ zero draw calls (the classic organ).

## Economy

Organs are **grown** and **leveled** with Gene Essence (the unified gene currency):
`organGrowCost` = 150 × 2^tier (150…4,800) · `organUpgradeCost` = 30·(tier+1)·1.35^(level−1),
capped by the shared Mulligan rarity level caps. Guards: `nucleus.grow` / `nucleus.slot` /
`nucleus.unlock` (security registry).

## Chamber gates (§gates)

Data rows over a meta-assembled snapshot (`NUCLEUS_GATES` + `nucleusGateProgress`) — every
requirement ALWAYS displayed with live progress; a future axis is one row + one snapshot field.

| Chamber | Trial | Requirements |
|---|---|---|
| 1 | — | Born open. |
| 2 | **THE TRIAL OF THE SWARM** | Campaign 40 · Genome Rank IV · 5 Mega Bosses · 8-boss Rush · 3 complete tower Mulligans · 7 Daily Runs |
| 3 | **THE APEX CHAMBER** | Campaign 75 · Genome Rank VII · 12,000 Power · 10 Megas · 2 Molts · 120 Mastery levels · 60% Bio-Dex — **plus 300 Ichor** |

Unlocks are sequential (`meta.unlockNucleusChamber`), once per account, XP-folded.

## Recognition

- **Power**: `nucleusPower` multiplies the existing **mulligans** PowerParts bucket (×1 empty).
- **Genome Rank**: `nucleusRatio` source row (weight 45) — active chambers + lifetime adaptations.
- **Collections**: `nucleusOrgans` codex (grow discovers, rarity-cap masters) + `nucleusAdaptations`
  codex (one entry per class, lifetime) with their own completion bonuses (biomass / integrity).
- **Achievements**: `nucleus_awake` / `nucleus_adapted` / `nucleus_sovereign` (hidden).
- **Help**: mechanics row `nucleus` (HelpWiki + What's-New pipeline).

## UI

`ui/NucleusChambers.tsx`, mounted at the top of the **Mulligan Lab** (both branches — the console
lives ABOVE the mega-boss seal because chamber 1 opens from the start): chamber cards with organ
sockets (arm → pick), adaptation readouts, sealed chambers' trial checklists with ✓/✗ live rows,
a two-step confirm on the Ichor unlock, the organ conservatory (grow/slot/level), and a live
canvas **preview** drawing the exact mutation kit the run will render (`drawKit`).

## Future hooks

- A **fourth chamber** = `NUCLEUS_CHAMBERS + 1`, one `NUCLEUS_GATES` row, zero other edits.
- A **new organ/class/motif** = one registry row / one `COMBAT_CLASSES` row / one draw case —
  everything else (UI, collections, power, sanitizer, adaptation math) derives.
- Organ **ascension** (rarity bumps) can reuse the Mulligan `nextRarity`/`ascendCost` curve.

## Invariants

- Empty/partial Nucleus ⇒ `resolveNucleus` identity ⇒ byte-identical golden run, POWER_BASE exact.
- An organ id lives in at most ONE chamber seat (sanitizer + MOVE semantics both enforce).
- Chambers above `unlocked` never activate, even if a forged save references organs there.
- `towerDamageMult` never appears in organ or adaptation effects (registry validation + tests).

NucleusPreview follows shared resolved motion plus live device changes. It renders a still mutation kit when motion is reduced, pauses animation offscreen/hidden, resumes without hidden-time jumps and releases its observer/listeners/frame on unmount. Mutation-list changes retain their existing redraw dependency. Organ/chamber rules, effects, costs and Power are unchanged.
