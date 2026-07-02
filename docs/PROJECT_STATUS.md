# PROJECT_STATUS.md — the live state board

> Maintained at the END of every session (paired with `docs/AI_HANDOFF.md` — the constitution's
> workflow step 4). This is the "where are we?" answer; `docs/GAME-STATE.md` remains the deeper
> per-system built-vs-planned index, `docs/PROJECT_MANIFEST.md` the system map.
> **Last updated:** 2026-07-02 (balance-architecture arc + tuning pass, Player Profile
> dashboard (registry-driven, save v22), and the full Tower Adaptation / Antigen system:
> per-tower generated trees, multi-source capped Antigen, campaign-gated depth, FORM stages,
> priced respec, lab UI — `docs/ADAPTATION.md`).

## Completed systems (shipped + tested + documented)

Core sim (deterministic, golden-pinned) · Towers/Stars/Branches/Codex · Mastery/Adaptation ·
Heroes (slots, evolution, selection) · Hero + general Equipment (~180 items, reforge,
safeguards) · Loot (meter/queue/vault/pity/catch-up) · **Gene Card Evolution (all 12 tasks —
pillar status, `docs/GENE-AUDIT-REPORT.md`)** · Collections · Evolution HQ (Genome Cores) ·
Prestige layer 1 (Molt/Ascendant) · Campaign (world map, gates) · Infinite (AI Director) ·
Power Score (+ mandatory-coverage validation) · Currencies · Achievements · Onboarding (Combat
Tutorial, HUD Tour, Help wiki, What's New, loading tips) · Notifications · Progress Prediction ·
Save (v20, migrations, backups, dev reset) · **Engineering automation (dependency registry,
doc-sync anchors, `npm run validate`, handoff scaffolder)** · UI standards + component library
(`docs/UI-STANDARDS.md`, style tests) · **Music engine (composition core + WebAudio manager,
`docs/GAME-FEEL.md` §music)** · Command Center living-lab redesign · Gameplay HUD redesign
(vital hierarchy, glass cells, responsive) · Power Score full-coverage audit + gain feel
(`docs/POWER-AUDIT.md`, toasts/previews) · **Visual identity trilogy + unification
(`docs/VISUAL_IDENTITY.md` / `docs/UI_STYLE_GUIDE.md` / `docs/DESIGN_LANGUAGE.md`; type/tracking
scales enforced, drone retired → live music intensity)** · Tower Lab v2 (specimen rail +
mutation-chamber showcase, bench prefs) · Live Mastery (in-run projection, level-up
celebrations, per-tower lifetime ledgers v20, Results ledger, Help entry) · **Multi-platform
responsive framework (`docs/RESPONSIVE-DESIGN.md`: drawer shell, container-sized panels, safe
areas, touch layer, probe-validated 13-viewport matrix)** · Hero Combat Console (three-region
in-run command surface, roster tabs, hold-to-buy, preview===outcome comparisons, HUD summary) ·
Campaign ROADMAP (gate jumps, goal rail, mission cards, fastest-clear ledger v21) · Doctrine
PROTOCOLS (six enemy-world warps, golden-safe) + Infinite experiment terminal · Gameplay Speed
(fixed-step 1×/2×/5×, auto-slow) · Genetic Vault v2 (objects/rates/multi-open/ledger) ·
staged Bio-Container openings (build-up, fast mode, legendary lighting, first-discovery NEW
badges) · Loot-meter rebuild (truthful-fill contract, earn ceremony + container flight,
self-heal, 5000-fill stress pin — `docs/BUGFIX-LOG.md` #10) · **Balance architecture
(`docs/BALANCE_ARCHITECTURE.md`): Universal Difficulty Director (one scaling-policy layer,
bit-exact parity) · Adaptive Economy Framework (factor-traced income chains + health guards) ·
Progression Loop Engine (8 enforced invariants, LoopDirective on Results/Campaign/Infinite) ·
Progression Simulator (virtual accounts over the real meta layer, hour-band report +
detectors, `npm run sim:progression`)** · Player Profile dashboard (registry-driven sections,
power attribution, frames/timeline/milestones, save v22 ledgers — `docs/PROFILE.md`) ·
**Tower Adaptation / Antigen (per-tower generated 4-branch trees, exclusive forks, capped
multi-source Antigen, campaign gates 15/30/50, battlefield FORM stages, priced stage-gated
respec, lab UI + inspector — `docs/ADAPTATION.md`)**.

## Systems in progress

- _(none — between milestones)_

## Known issues

- Economy: mid/late currency sinks thin out (star sink exhausts in tens of hours) — top design
  P0 from `docs/EA-DESIGN-AUDIT.md` §4; Gene Essence sink helps (≈hour-400) but doesn't close it.
- `GENE_POWER_SCALE` and similar constants are library-size-coupled (test bands fail loudly as
  the reminder — intentional).
- Hero abilities largely one-verb; roster of 3 caps team-comp depth (content, not systems).
- Giant files: `src/core/game.ts`, `src/state/meta.ts`, `src/index.css` (ranked debt —
  `docs/ENGINEERING-AUDIT.md` §4).

## Upcoming milestones

1. **Prestige layers 2–6 + content waves** — the deep band (stage ~165+, hours 500+) is the
   measured flattening zone reserved for them; `docs/PROGRESSION_REPORT.md` is the yardstick
   (watch items in `docs/BALANCE_ARCHITECTURE.md` §5).
2. **Card Ascension** — backend done; author tiers + one gameplay wire + ceremony.
3. **Content wave** — toward 10 towers / 6 heroes / 100 cards through the validators.
4. **meta.ts façade split + CI guards** (madge, ts-prune, import-direction lint).
5. **Hero mastery live projection** — towers wired; heroes ride the same bus (data change).

_Done 2026-07: **balance tuning pass** — molt milestone gate (minCells 12, linear +3
stages/molt), first-clear trim; molt spiral ended (31→8 @10h), deep freeze eliminated
(molts cycle past 3000h), sink exhaustion −75%; pacing envelope CI-pinned._

## Future roadmap (design-corpus scale)

Milestone bosses 2–4 · prestige layers 2–6 (Speciation…) · custom challenge/training modes
(FEATURES-flagged) · real art behind the procedural fallbacks · i18n layer (string surfaces
already registered per system) · platform decision on backend (cloud saves, dailies) — see
`docs/ROADMAP.md`, `docs/CONTENT-ROADMAP.md`.

## Documentation status

- **Self-enforcing:** doc ANCHORS + dead-path scan run in every `npm test`;
  `docs/DEPENDENCY_GRAPH.md` freshness is test-pinned; staleness advisory via `npm run docs:check`.
- First-read chain: `PROJECT_MANIFEST.md` → `GAME-STATE.md` → `CODEMAP.md` →
  `GAME_CONSTITUTION.md` (rules) → this board + `AI_HANDOFF.md` (live context).
- All 80+ docs reconciled as of the docs-audit + gene program; generated docs are marked as such.

## Architecture health

- 794 tests / 123 files green; golden sim byte-identical; typecheck strict; build clean.
- Zero runtime import cycles (type-only back-edges by design); near-zero dead exports.
- Registry-enforced: no orphan source files, no unresolvable system references.
- Debt ranked and bounded (`docs/ENGINEERING-AUDIT.md` §4–5); no unbounded growth surfaces known.
