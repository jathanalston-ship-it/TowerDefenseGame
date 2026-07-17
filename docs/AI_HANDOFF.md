# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-17 23:46 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 1f93b53

## Summary of work completed

Bio-Roulette went game-wide (commit 1f93b53): a banked spore economy (`save.bioSpores`, v48)
now feeds the wheel from Boss Rush, the FIRST kill of every boss chassis in any mode, all six
quest finales, and Battle Pass milestone lanes — and the Vault gained a Roulette bay that
spins the bank on demand (`rouletteBus` → App session → returns to the Vault). The one thing
to know: **the wheel is now headlessly reachable** (seed `bioSpores` → vault → spin →
collect), which closed the REWARD-PRESENTATION.md "verified by build + review only" gap. The
working-tree diff this scaffold saw is just the Chronicle regen from `npm run notes`.

## Files modified

- Source (1): `src/changelog/releases.gen.ts`
- Tests (0): —
- Docs (1): `docs/HISTORY.md`

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- (Committed just prior, same batch: save, meta, battle-pass, quests, notifications,
  hub-shell/vault UI, bio-roulette — see PROJECT_STATUS entry 17k. Rebased over the twin's
  17j localized-economy batch: both v48 field sets coexist in saveStore.)

## Power Score changes

None — Bio-Spores are ceremony ammo, not a Power input; roulette grants flow through the
existing granted-currency paths.

## UI changes

- **GeneticVault:** new `.roulette-bay` card under the Daily Bio-Cache — banked count in
  gold, viral ✺ core that breathes when loaded (`is-loaded`), "Spin the Wheel" primary CTA,
  earn-path copy when empty. Verified by the headless probe (desktop) + `mobilecheck` CLEAN
  across all 4 viewports.
- **BioRoulette:** eyebrow "BOSS RUSH EXCLUSIVE" → "THE SPORE ENGINE"; spore counter tooltip
  + side hint now name all four sources and the Vault bank.
- **App:** roulette sessions carry `from: 'vault'` and exit back into the Vault via
  `navBus.go('vault')` (50ms post-mount, the established idiom).

## Documentation changes

- `docs/BOSS-RUSH.md` §roulette — rewritten header + THE SPORE BANK / THE VAULT BAY sections.
- `docs/REWARD-PRESENTATION.md` — the roulette headless-verification gap struck through and
  closed.
- `docs/GAME-STATE.md` — schema anchor bumped to `CURRENT_VERSION = 48`.
- `docs/CHANGELOG-PIPELINE.md` — no change needed (pipeline untouched; notes regenerated).
- DIL edge added (`system:boss-rush provides system:hub-shell` — the spore-engine contract);
  `docs/DIL_GRAPH.md` + `docs/DEPENDENCY_GRAPH.md` regenerated.

## Save changes

- **v47 → v48:** `bioSpores: number` (banked Roulette ammo). Additive: missing ⇒ 0; sanitizer
  floors junk/negatives and caps at 999 (deliberately far above `ROULETTE.sporeCap` 40 so a
  future session-cap change never burns a bank). `grantRouletteRewards` debits the bank by the
  session spend (clamped at 0 — a legacy rush session larger than the bank can't go negative).

## Known edge cases

- **Bank vs session:** a session plays `min(bank, sporeCap=40)`; the remainder stays banked
  and the bay re-arms on return. Over-spend clamps at 0 (pinned in bioRoulette.test).
- **Rush lane order matters:** `App.handleEnd` banks BEFORE opening so carried quest/pass
  spores ride the same session and consumption stays uniform. Zero EARNED spores ⇒ no forced
  popup even with a carried bank (deliberate — the bank surfaces via the vault badge/chain).
- **Abandoning the wheel** (closing the app mid-ceremony) grants nothing and consumes nothing
  — `collect()` is the only spend path, so it's player-favorable and dupe-free.
- **rouletteBus is menu-only** (App guard) so a stray emit can never yank a live run; emits on
  an empty bank no-op.
- **BP milestone lanes are ADDITIVE after the filler fallback** — pushing before it would
  displace the %10 container milestones (levels 20/40/60/80/100 premium, 50/100 free overlap).
  Keep any future lane after the `p.length === 0` / `f.length === 0` checks.

## Remaining technical debt

- The dev opener (`?debug&roulette=N`) plays phantom spores outside the bank (fine for debug —
  consumption clamps at 0 — but it diverges from the "sessions play the bank" model).
- `bossKilled` spore toast fires during combat (the placard buffer holds it until a toaster
  mounts — verified behavior, but worth a glance in a live full-mode run).

## Recommended next tasks

1. Live Boss Rush playtest of the full loop (rush earns + carried bank → one session) — the
   only lane still verified by reasoning rather than headless probe is the post-rush popup
   with a pre-existing bank.
2. Consider a `rouletteCollects`-style weekly quest that AWARDS spores on wheel collects
   (currently collects only credit quests; a small closed loop could deepen the habit).
3. The Vault bay could preview the current board tier (`boardTier(rushBestWave)`) so deep
   accounts see their ×N multiplier before spinning (`state/bioRoulette.ts boardTier`).

## Future expansion hooks

- **New spore source:** pay `{ kind: 'bioSpores', qty }` from any PassReward table (quests,
  pass, login, mail all inherit banking + placards + the vault badge), or call
  `meta.addBioSpores(n, source)` for direct lanes. Never mount `BioRoulette` directly.
- **`rouletteBus` (state/navBus.ts):** any future surface (Command Center widget, Results
  upsell) can open the banked session with one `rouletteBus.open()` call.
- **`vault.spores` notification source** already carries the bay into badges, recommendations
  and the Ready Chain — a bigger bank could raise its score via `count` later.
