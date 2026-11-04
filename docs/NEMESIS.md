# Nemesis & Boss Trophies — the personal hunt

Two linked systems: a boss that remembers you and escalates into a personal rival, and the
organs you carve from the bosses you fell. Both are **deterministic** (no server) and
**golden-safe** (a fresh save has no nemesis and an empty rack, so pinned seeds are untouched).

## The Nemesis (`src/core/nemesis.ts`)

A boss still standing when your Nucleus falls **remembers you**:
- The loss seeds (or deepens) `save.nemesis = { defId, slain }` — `deepenNemesis()` climbs
  `slain+1` on a repeat (cap `NEMESIS.slainCap = 50`); a different killer replaces the hunt at 1.

### The grudge ladder — escalation, not just a bigger HP bar

`slain` maps to a **grudge tier** (`GRUDGE_LADDER`), and `nemesisTraits(slain)` folds every rung
at or below it into a deterministic trait bundle. Tiers are **additive** — each keeps the ones
beneath it:

| Tier | `slain` | Name | Adds (on top of the hp/bounty curve) |
|---|---|---|---|
| 0 | 1–2 | **Marked** | — (just the ×hp / ×bounty scaling) |
| 1 | 3–4 | **Hunted** | +8 armor, ×1.15 Nucleus damage |
| 2 | 5–7 | **Reviled** | +16 armor, ×1.18 damage, ×1.15 siege cadence |
| 3 | 8+ | **Apex Predator** | +26 armor, ×1.22 damage, faster still |

- **The sim reads the bundle from ctor opts** (`RunOptions.nemesis`): `spawnBoss` applies
  `hpMult` (cap ×2.5), `bountyMult` (cap ×2), `armorBonus`, `damageMult`, and `attackSpeedMult`
  at spawn, and flags `boss.nemesis` + `boss.nemesisTier`. Riding opts means **replays reproduce
  the buffed rival exactly**. **Dailies are excluded** — the shared gauntlet stays fair.
- **Presentation escalates with the tier**: the renderer's black-red counter-rotating brand
  intensifies (extra rings + hotter glow at Reviled+) and labels the tier (`☠ NEMESIS · APEX
  PREDATOR`); a nemesis entrance fires a dedicated vengeful **roar** (`bossSpawned` event →
  `nemesis_roar` cue). The Player Profile shows the hunt's tier, its trait lines, and the bounty.

### Revenge

Killing your nemesis (`bossKilled` for its `defId` with `final: true` — a splitting nemesis is
repaid when its LAST piece dies, not its first body):
- pays `vengeanceCores(slain)` Genome Cores (blood-price `60 × slain` + a `40 × tier` bonus),
- grants one unowned **Abyssal phenotype** (docs/COSMETICS.md),
- grants a permanent **Vengeance organ** for that boss's chassis (recorded in `save.vengeance`),
- writes the timeline and **ends the hunt**.

## Boss Trophies (`src/core/trophies.ts`)

Three sources of trophy **organs**, each a `TrophyDef` folded into runs like gear:
- **Chassis** (5) — the first kill of each boss body plan. Ownership derived from `save.bossesSlain`.
- **Mega** (one per authored Mega Boss) — ownership derived from `save.megaProgress.slain`.
- **Vengeance** (5, one per chassis) — earned by **avenging a nemesis** of that chassis.
  Ownership reads the `save.vengeance` ledger (a real event, not a kill count).

- **Chassis + mega organs are tradeoffs** — one upside AND one downside (real R-bucket fields),
  e.g. Knuckle of the Bruiser `+5% tower damage / −4% biomass`. **Vengeance organs are PURE
  upside** — the spoils of the hardest, most personal fight (kept modest so a full rack is a
  reward, not a runaway). Test-pinned: tradeoff organs carry both signs; vengeance organs carry
  no downside.

### The Rack — a loadout, not a single mount

- `equippedTrophies` holds a **rack of up to `trophySlots(owned)` organs**. Slots grow with
  organs harvested (`TROPHY_SLOT_THRESHOLDS = [0, 5, 12]` → 1 / 2 / 3 slots).
- `meta.trophyRunEffects()` folds every mounted+owned organ's effects, **clamped to the live
  slot count** (a tamper ceiling on top of the sanitizer's hard cap). Empty rack = zero effect
  (golden-safe). `meta.equipTrophy(id, on)` mounts/unmounts one organ, refusing unowned organs
  and a full rack; it is light-guarded (`trophy.equip`, docs/SECURITY.md).
- UI: Player Profile → **Nemesis & Trophy Rack** (hunt banner with grudge tier + traits; rack
  slot meter; equip toggles; vengeance organs styled distinctly; locked organs name their source).

## Save shape (v34)

`nemesis: { defId, slain } | null` · `equippedTrophies: string[]` (v33→v34 migrates the legacy
single `equippedTrophy` into a one-organ rack) · `vengeance: string[]` (avenged chassis — the
vengeance-trophy ledger AND the hunt's rap sheet). All additive/migrated, sanitized, golden-safe.

## Extending

- **New chassis** → add one `CHASSIS_TROPHIES` row AND one `VENGEANCE_TROPHIES` row (coverage is
  test-pinned). **New megas** grow their Relic automatically (generator over `megaBossRegistry`).
- **Re-tune the hunt** entirely from data: `NEMESIS` (caps, reward curve) + `GRUDGE_LADDER`
  (tier thresholds + per-rung traits) — no logic edits, and the sim + UI both read the same folds.
