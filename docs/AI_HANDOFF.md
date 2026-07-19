# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-19 18:44 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** e67e372

## Summary of work completed

Three user-reported issues closed. (1) **Mega-boss stall fix** — the reported "boss just
stops / projectiles ignore the body" dead-time was `towerMegaFire`'s body-chip gate
requiring a completely BARE field: one add alive anywhere froze every out-of-reach tower.
The rule now mirrors the heroes' (a tower with no prey in ITS OWN reach chips the armored
body; wp priority, Hive yield, and wave duty unchanged) — applied to projectile towers,
the Coil, and the Siphon; new HUD chips say WHY the bar moves slowly (`CARAPACE SEALED ·
CHIPPING` / `▲ REGENERATING` / `◆ ARMORED`). Pinned by megaboss.test §stall audit;
golden-safe (megas absent from golden runs, pins untouched). (2) **Website freshness** —
deploys were verified working (CI SHA-gate green); the staleness was editorial: one open
release absorbed 10 days of work while the site advertised July 9. Chronicle now
**auto-seals by calendar date** (v2026.07.19 opened itself), the deploy workflow re-runs
`npm run site` at HEAD (ephemeral) so deployed notes include the deploying commit, the
secrets-missing soft-skip is now a hard FAIL, and `src/changelog/siteSync.test.ts` is the
regen drift gate (the DIL pattern). Rollback documented (DEPLOYMENT.md §rollback).
(3) **Lab links** — TowerLab + HeroLab now carry real "Open Adaptation Chamber ▸" buttons
(navBus.go('adaptation')).

## Files modified

- Source (7): `src/changelog/releases.gen.ts`, `src/core/game.ts`, `src/core/types.ts`, `src/index.css`, `src/ui/GameView.tsx`, `src/ui/HeroLab.tsx`, `src/ui/TowerLab.tsx`
- Tests (2): `src/core/megaboss.test.ts`, `src/changelog/siteSync.test.ts`
- Docs (8): `docs/CHANGELOG-PIPELINE.md`, `docs/COGLOAD_REPORT.md`, `docs/DEPLOYMENT.md`, `docs/DIL_GRAPH.md`, `docs/HISTORY.md`, `docs/MEGA-BOSS.md`, `docs/VALIDATION_REPORT.md`, `docs/devlog/DRAFT-2026-07-19.md`
- Also: `scripts/gen-notes.ts` (auto-seal), `.github/workflows/deploy.yml` (site refresh + hard-fail), `changelog/ledger.json` + `site/patchnotes.json` + `public/*` (regen)

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts` (+ gen-notes auto-seal + siteSync gate)
- **content-infra** — `src/core/types.ts` (MegaBannerSnapshot regenActive/armored)
- **engine** — `src/core/game.ts` (mega raid body-chip gates ×3 + banner fields)
- **heroes** — `src/ui/HeroLab.tsx` (Adaptation Chamber link)
- **run-ui** — `src/ui/GameView.tsx` (mega banner damage-gate chips)
- **towers** — `src/ui/TowerLab.tsx` (Adaptation Chamber link)
- Consumer ring (verify, unchanged): arena, audio, biomes, boss-rush, bosses, campaign, collection, contracts, currencies, daily, difficulty, doctrines, equipment, evolution-hq, expeditions, gene-cards, hero-cinematics, hero-symbiotes, infinite, living-battlefield, loot, mastery, mega-bosses, meta-store, mulligans, nemesis, nucleus, onboarding, online-foundation, power, premium, rendering, website

## Power Score changes

None. The mega fix changes in-run raid targeting only (no account state, no modifier
scale); goldens byte-identical (megas never appear in golden runs) and the power suite is
untouched.

## UI changes

Surfaces in the blast radius: `App (UpdateBriefing popup)`, `GameView`, `Hud`, `Toolbar`, `BuildControls`, `Inspector`, `BuildPanel`, `HeroLab`, `ability button`, `HeroSelectPanel`, `Results`, `ALL`, `TowerLab`, `TowerCodex`, `StarCeremony`, `tower rail`

- **Mega raid banner** (GameView): three new honest-state chips — `CARAPACE SEALED ·
  CHIPPING` (no open organs; conditional on !exposed && !staggered), `▲ REGENERATING`,
  `◆ ARMORED` — each tooltip names the weak-point counter. CSS: `.mega-chip-sealed/
  regen/armor` (static, no new animators — attention budget holds).
- **TowerLab**: the "Antigen specialization lives in the Adaptation Chamber" hint gained
  a real `☣ Open Adaptation Chamber ▸` button (`.tl-adapt-go`).
- **HeroLab**: same button in the Mastery section hint (`.hsec-golink`).
- Coverage: mobilecheck CLEAN (31 screens × 6 viewports — both labs walked), cogload in
  budget; the mega chips are conditional JSX over new snapshot booleans pinned by the
  stall-audit test.

## Documentation changes

- Updated this batch: `docs/MEGA-BOSS.md` (§targeting stall-fix note + new §damage-gate
  honesty), `docs/CHANGELOG-PIPELINE.md` (auto-seal, CI freshness, drift gate, revert),
  `docs/DEPLOYMENT.md` (contract hardening + §rollback), `docs/DIL_GRAPH.md` (regen),
  `docs/HISTORY.md`, `docs/VALIDATION_REPORT.md`, `docs/COGLOAD_REPORT.md`.
- The wider registry list: no change needed — no save/Power/mode/economy contract moved.

## Save changes

None — save layer untouched.

## Known edge cases

- **Mega body-chip rule is per-tower reach, not per-field**: `towerHasTarget` (the idle
  batch's helper) is the shared gate. A tower with prey in range still fights the wave
  (towerMegaFire returns false → normal targeting). Weak-point priority is UNCHANGED and
  still outranks add-defense unless `megaRaidYield` (Hive threatened) parks the raid.
- **Chip damage now flows continuously** — mega kill times shorten somewhat (heroes always
  could chip; now stationary guns join). The efficiency reward model self-adjusts (Power
  raises the kill-time bar); reward clamps pinned by the existing tests.
- **Auto-seal fires on the first `npm run notes` of a NEW day** — the previous open
  release seals no matter its size. Deliberate mid-day cuts still use `--seal`. The
  siteSync gate fails if notes ran without the site render (`npm run site` fixes both).
- **deploy.yml now needs `fetch-depth: 0`** (Chronicle reads history since ledger.lastSha)
  — do not "optimize" the checkout back to shallow.
- **A push without Cloudflare secrets is now RED**, not a notice — restoring the secrets
  is the fix, not editing the workflow back to soft-skip.

## Remaining technical debt

- The stall-audit test seals organs by direct state pokes each tick (fixture reach-in,
  same pattern as the existing raid-guts tests) — a def-level "no weak points" test
  variant would be cleaner if megaboss defs ever grow a test-only flag.
- The mega banner sealed-chip derives from `weakPoints.length === 0` in JSX; if a future
  def opens organs off-screen, consider a dedicated `sealed` snapshot field.

## Recommended next tasks

1. **Play-validate Voraxis on campaign 10** (the user's original repro) — the fight should
   now show continuous chip tracers between windows and the new state chips; confirm feel.
2. **Infinite-mode mega spot-check** (every 20 waves, same loop — same fix applies; a
   quick sim probe like the stall test but with `infiniteMegaFor` would pin it).
3. **Deep-link the Adaptation Chamber** to the lab's focused unit (extend navBus cargo or
   a prefs field; AdaptationChamber already picks focus by advisor).

## Future expansion hooks

- `src/core/game.ts` `towerHasTarget` — now the single reach test for idle postures AND
  mega raid gating; any future "do I have prey" question should reuse it.
- `MegaBannerSnapshot.regenActive/armored` — surface for any future raid UI (Inspector
  hints, spectate overlays).
- `scripts/gen-notes.ts` auto-seal — the date-roll seam; a weekly cadence would be a
  one-line change to the `last.date === date` comparison.
