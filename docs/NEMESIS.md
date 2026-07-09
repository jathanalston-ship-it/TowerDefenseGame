# Nemesis & Boss Trophies — the personal hunt

## The Nemesis

A boss still standing when your Nucleus falls **remembers you**:
- The loss seeds (or deepens) `save.nemesis = { defId, slain }` — same boss again →
  `slain+1` (cap 50); a different killer replaces the hunt at 1.
- **It returns stronger**: every non-daily run passes the nemesis through `RunOptions`;
  `spawnBoss` gives the matching defId `hp ×(1 + 0.15×slain)` (cap ×2.5) and
  `bounty ×(1 + 0.1×slain)` (cap ×2), and flags `boss.nemesis` — the renderer brands it
  (black-red counter-rotating halo + ☠ NEMESIS label). Riding ctor opts means replays
  reproduce the buff exactly. **Dailies are excluded** — the shared gauntlet stays fair.
- **Revenge**: the `bossKilled` event for your nemesis pays `60 × slain` Genome Cores,
  grants one unowned **Abyssal phenotype** (docs/COSMETICS.md), writes the timeline, and
  ends the hunt.
- The Player Profile shows the active hunt (who, how many times it has ended you, the
  blood price on its head).

## Boss Trophies (`src/core/trophies.ts`)

First kill of each boss **chassis** (5) and each **Mega Boss** grows a trophy organ.
- **Ownership is derived** from `save.bossesSlain` + `save.megaProgress.slain` — no new
  ledger, can't desync.
- **Every trophy is a tradeoff**: one upside AND one downside (real R-bucket fields),
  e.g. Knuckle of the Bruiser `+5% tower damage / −4% biomass`. Test-pinned: both signs
  must exist on every organ.
- **One mounted at a time** (`save.equippedTrophy`); `meta.trophyRunEffects()` folds the
  pair into runs exactly like gear (App run-effects assembly). Nothing mounted = zero
  effect (golden-safe).
- UI: Player Profile → **Nemesis & Trophy Rack** (equip toggles; locked organs name
  their source).

## Extending

New chassis → add one `CHASSIS_TROPHIES` row (coverage is test-pinned). New megas grow
their Relic automatically (generator over `megaBossRegistry`). Tuning lives in the def
rows — no logic edits.
