# MOLT VOWS — the prestige wager (`src/core/vows.ts`)

Before committing a Molt, the player may arm **0–3 VOWS**: handicaps that warp the ENEMY
WORLD for the **entire next cycle** and multiply the Ascendant Cell mint at the **next**
Molt. High risk for the whole cycle, paid once at its end — the "when do I molt?" decision
gains a "how hard do I dare make the climb?" axis.

## The shape

- **A vow is one data row** (`VOWS` in core/vows.ts): `{ id, name, icon, blurb, warp,
  cellYieldMult }`. The handicap is expressed by **reusing the existing `DoctrineWarp`
  machinery** (core/doctrines.ts) — enemy HP/speed/damage/count, bounty droughts, elite
  pressure — so a vow needs **zero new sim code**. Adding a vow = one row (`vowProblems`
  validates every row; vows.test.ts pins the book).
- Six vows ship: Flesh (+25% enemy HP, ×1.35), Haste (+15% speed, ×1.3), Famine (−20%
  biomass, ×1.4), Legion (+25% spawns, ×1.45), Cruelty (+30% enemy damage, ×1.4), Apex
  (+10% elites & +10% HP, ×1.6).
- **Yields stack multiplicatively** (`vowYieldProduct`); the UI displays the combined
  product AND the combined warp so the real wager is always visible.

## The sink (arm costs)

Arming costs **banked Genome Cores** on a geometric curve — `VOW_COST.base × growth^n`
(750 / 3,000 / 12,000): the 1st is cheap, the 3rd is a statement. This is a deliberate
**post-tree Core sink**: costs are consumed at arm time and are **never refunded** — not by
breaking the vow (the UI double-confirms the forfeit), and not by the Molt reset (the reset
zeroes what's left; the oath money is already gone). `meta.armVow`/`meta.disarmVow` are
guarded (`prestige.vow`, docs/SECURITY.md).

## The fold (composition with doctrines)

Armed vows persist in `save.prestige.vows` (v35, additive — withDefaults deep-fills,
sanitize dedupes/validates/caps at `MAX_VOWS`) and ride `RunOptions.vows` into **every run
of the cycle**, folding into the **Universal Difficulty Director at exactly the site the
doctrine warp folds** (game.ts construction):

```
warp = composeWarps(resolveDoctrine(opts.doctrine).warp, combinedVowWarp(opts.vows))
```

**Composition semantics** (`composeWarps`): multiplicative axes (`countMult · hpMult ·
bountyMult · damageMult · speedMult · scalingRateMult · rewardMult`) **multiply**; additive
axes (`eliteChance · essencePerWave`) **add**; keys absent from both sides **stay absent**
(consumers gate on presence — a materialized ×1 would wake warp paths). Vows therefore
**multiply the run's doctrine, never replace it**: Overmind Protocol's ×1.6 HP under a Vow
of Flesh is ×2.0 HP, one fold site, no special cases.

**Exclusions** (same reasoning as the Nemesis): the **shared daily gauntlet** stays fair —
identical worldwide boards and server replay verification both forbid per-account warps —
and the **tutorial** stays clean. GameView simply doesn't pass `vows` there.

## Settlement

`moltGain = ⌊cellsForCycle(cycleShards) × ascendant cellGainMult × vowYieldProduct(vows)⌋` —
one function feeds BOTH the Molt Chamber preview and the mint itself, so the dialog's
promise is exactly what the molt pays. `meta.molt()` then **clears the vows** (`vows: []`)
— oaths settle once; the next cycle starts unsworn.

## Golden safety

No armed vows ⇒ `combinedVowWarp([])` is `undefined` ⇒ `composeWarps(doctrineWarp,
undefined)` returns the doctrine warp **by reference** (not even a new object) ⇒ every axis
exactly ×1, zero extra RNG draws, byte-identical goldens. Pinned by vows.test.ts (the
referential no-op test) + the golden suite.

## UI

- **Molt Chamber → MOLT VOWS rail** (PrestigePanel): every vow with its humanized risk +
  yield, the geometric cost on the arm button, armed rows highlighted, a no-refund
  break-confirm, and the armed summary (`n/3 sworn · ×prod next mint`).
- **The Molt confirm dialog** states the wager it is about to pay (count, product, names).
- **Run HUD**: a compact `⛧` chip in the wm-chips row shows the armed icons all cycle.

## Extending

New vow = one `VOWS` row (any DoctrineWarp axis mix). Rebalance = edit `VOW_COST` /
`cellYieldMult`. New warp axes belong in `DoctrineWarp` first (doctrines + vows both
inherit them through `composeWarps`).
