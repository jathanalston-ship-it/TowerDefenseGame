# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-05 18:55 UTC · **Diff scope:** the four-part Boss Rush saga (02fea1e → eae0eda)
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** eae0eda

## Summary of work completed

Shipped the full four-prompt Boss Rush saga: (P1, 02fea1e) boss siege behaviors + multi-phase
AI on the registry; (P2, f7dd7fe) **Boss Rush mode** — the third pillar, wave N = N procedural
bosses in a staggered column with a thinned escort, gene draft every 2nd wave, per-boss
Core/loot payout, own records/prediction/qualify gate, gauntlet terminal + full HUD/Results
integration, probe-tuned (strength curve, flat boss bounty, opening biomass — see BOSS-RUSH.md
§balance); (P3, 1c7830d) **stamina** (100 cap, 20/entry, +1/3min lazy, first-of-day FREE,
market packs overflow to 120) + the **primary Ichor lane** (2 per NEW 5-boss single-run record
band, weighted-common Bio-Container per 10-band); (P4, eae0eda) the **Bio-Roulette** second
reward ceremony (spores = record delta + volume/5, fresh 12-pod weighted board, momentum
physics over pre-rolled outcomes, one-click collection). The one thing to know: everything is
mode-gated — the goldens never moved (`wave 12 / kills 196` across all six seeds).

## Files modified

- Source (12): `src/core/types.ts`, `src/dev/systemRegistry.ts`, `src/index.css`, `src/save/saveStore.ts`, `src/state/achievements.ts`, `src/state/bioRoulette.ts`, `src/state/mechanics.ts`, `src/state/meta.ts`, `src/state/stats.ts`, `src/ui/App.tsx`, `src/ui/BioRoulette.tsx`, `src/ui/BossRushScreen.tsx`
- Tests (1): `src/state/bioRoulette.test.ts` (saga total: +4 test files, 29 new tests → 952)
- Docs (4): `docs/BOSS-RUSH.md`, `docs/DEPENDENCY_GRAPH.md`, `docs/GAME-STATE.md`, `docs/VALIDATION_REPORT.md`

## Systems affected (from the dependency registry)

- **achievements** — `src/state/achievements.ts` (8 new: rush ladder ×6 + roulette ×2)
- **boss-rush** — `src/state/bioRoulette.ts`, `src/ui/BioRoulette.tsx`, `src/ui/BossRushScreen.tsx`
- **content-infra** — `src/core/types.ts` (RunStats.bossKills, LifetimeStats rush/roulette ledgers, HudState.bossRush)
- **dev-registry** — `src/dev/systemRegistry.ts` (boss-rush system entry)
- **hub-shell** — `src/ui/App.tsx` (bossRush mode wiring, roulette screen, single stamina pay point)
- **meta-store** — `src/save/saveStore.ts`, `src/state/meta.ts` (records, stamina, bands, roulette grants)
- **onboarding** — `src/state/mechanics.ts` (boss-rush + bio-roulette Help entries)
- **stats** — `src/state/stats.ts` (rushRuns/rushBossKills fold + rouletteSpores pass-through)
- Consumer ring (verified unchanged): biomes, bosses, collection, currencies, devtools, difficulty, engine, equipment, evolution-hq, gene-cards, heroes, loot, mastery, notifications, power, profile, run-ui, towers

## Power Score changes

None by design (`boss-rush` registers `powerScore: null`, like Infinite). Rewards feed Power
only through the currencies they grant (shards/gear), which the existing pins already cover.

## UI changes

New: `BossRushScreen` (skull-ladder artwork, contract rules, stamina bar + FREE chip,
prediction, records, Ichor-bleed panel, milestone bars), `BioRoulette` (canvas organ wheel),
Command Center Boss Rush tile, Profile "Boss Rush" career section, Results rush rows +
`rush-short` copy, mode-aware HUD (wave banner "WAVE N — N BOSSES", totals dropped in
meter/pause/Inspector/BuildControls). Fixed latent ENDLESS bugs: the Start Wave console and
wave meter clamped at `totalWaves` past depth 12. Headless-smoke covered: terminal render,
run launch, wave-1 fight, Results, the roulette ceremony end-to-end (screenshots in scratchpad).

## Documentation changes

`docs/BOSS-RUSH.md` (new — the system's canonical doc: contract, sim, rewards, stamina, ichor,
roulette, probe-tuned balance table), `docs/MODE-IDENTITY.md` §boss-rush (third pillar),
`docs/MARKET.md` (faucet row + stamina pack note), `docs/GAME-STATE.md` (mode entry),
`docs/DEPENDENCY_GRAPH.md` (regenerated). The wide registry list beyond these: no change
needed (nothing in their systems moved).

## Save changes

Additive only, no schema-version bump needed (sanitizer-covered): `rushBestWave`,
`rushBestBoss` (numeric coerce), `rushStamina {value, updatedAt, freeDay}`
(`sanitizeRushStamina`, pre-stamina saves start full), `prediction.bossRush` (defaultCalib),
`LifetimeStats.rushRuns/rushBossKills/rouletteSpores` (mergeStats spread covers old saves).
Pinned by `bossrushMeta.test.ts`, `rushStamina.test.ts`, `bioRoulette.test.ts`.

## Known edge cases

- Rush boss ids uniquify per spawn (`spawnProceduralBoss`) — two same-chassis/⌊TL⌋ bosses used
  to swap defs mid-fight via `procBosses` collision (latent Endless bug, fixed at the seam).
- Waves 1–3 re-roll `burrower` vanguards (uncounterable on an opening board); wave 4+ all legal.
- `bestWave` is NEVER moved by rush runs (Infinite's qualify gate + prediction floor stay clean).
- Stamina regen PAUSES above the 100 ceiling (overflow packs don't bank regen time).
- The Bio-Roulette collects on EVERY exit path (Skip included) — spores can't be lost; Results
  replays route through the ceremony while it's pending.
- `Results` replay for rush pays stamina via `App.startBossRush`; a short wallet falls back to
  the menu instead of a free run.

## Remaining technical debt

- The saveStore stamina clamp bound (120) duplicates `RUSH.staminaOverflowMax` as a literal
  (sanitizer convention, like the 999 container cap) — fine until the knob moves.
- The roulette ceremony has no vitest DOM coverage (canvas; jsdom not in the toolchain) — the
  pure model + meta grants are fully pinned, presentation is smoke-verified only.
- Boss Rush reward-per-minute at the fresh-account floor is mildly rich vs Infinite
  (~600 loot-pts/10min vs ~65/min) — P3's stamina gates frequency; revisit after live telemetry.

## Recommended next tasks

1. Wire the daily-reward seam to stamina (`meta.grantRushStamina` is grant-ready) if/when a
   daily system ships.
2. Boss Rush leaderboard/weekly modifiers — parameterize `startBossRushWave`'s TL curve +
   escort policy (deliberate seam, BOSS-RUSH.md §seams).
3. Consider surfacing `rushStamina` in the Command Center tile once a cheap staleness-free
   read exists (the terminal owns it today).

## Future expansion hooks

- `RUSH` config block (`src/core/config.ts`) — every gauntlet knob in one place.
- `spawnProceduralBoss(tl, strengthScale)` (`src/core/game.ts`) — per-spawn boss scaling seam.
- `rollBoard` (`src/state/bioRoulette.ts`) — push pods to grow the roulette; renderer +
  outcome roll are count-agnostic.
- `rushProgress` on `RunOutcome` (`src/state/meta.ts`) — the post-run rush payload any future
  ceremony can read.
