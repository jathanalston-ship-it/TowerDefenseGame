# PROJECT_STATUS.md — the live state board

> Maintained at the END of every session (paired with `docs/AI_HANDOFF.md` — the constitution's
> workflow step 4). This is the "where are we?" answer; `docs/GAME-STATE.md` remains the deeper
> per-system built-vs-planned index, `docs/PROJECT_MANIFEST.md` the system map.
> **Last updated:** 2026-07-13 (**HERO ROSTER → 10 + THE REACTION TRIO → 20 TOWERS** —
> three batches (3ac46c2/a38c36f/this). Heroes: **RIPTIDE** (Kinetic water-form zone
> controller, megaSlain-2 gate), **CARRION** (Vital charnel necromancer — GRAVEBIND raises
> corpses near it as corpse-scaled Risen Thralls off the death seam; lifetimeKills-20k gate;
> the pair's ONE new sim verb) and **FOVEA** (Neural executioner lance on the siege brain,
> Shard-160) — every typed-complete hero seam extended, roster-proof login-lane fix
> (`minIV` derives from roster size). Towers (TOWERS.md §reactionTrio): **MIASMA LUNG**
> (second Viral — a `field` plague fog coating the WHOLE pack with Infection; 18/240),
> **CHITIN BELL** (second Resonant — a toll slam priming the crowd with Resonance for the
> shatter reactions; 24/380) and **ACID LANCET** (Caustic EXECUTIONER — one 130-dmg
> `highestHealth` harpoon per 4.5 s, Corrosion wound, 120 px deadzone; 34/560) — the first
> roster growth with ZERO new sim verbs (all composed from `TowerDef.abilities`; the
> derived-Disruption field-kit caveat is a DIL edge). Both 1-tower class gaps closed. Full
> stacks: star paths, 2 branches each, 4-branch Adaptation rows, mastery lore, star/branch
> visual evolutions, +18 Mulligan pieces (the CATALOG_PER_TOWER ratio). All double-gated ⇒
> goldens byte-identical, zero golden re-pins. Suite 2017 green, validate PASS, live
> headless probes fielded the new content with no page errors. Balance = tuning clay
> (locked content; deep-account persona pass when wanted). NEXT (user-queued): 4 weak
> early-campaign enemy variations (#167), then an early-game/NPE + tutorial overhaul from
> playtest feedback (#168). Previous session below.)
>
> **2026-07-12** (**MEGA-TARGETING FIX + CAMPAIGN DIFFICULTY RESCALE** —
> two arcs, four batches (0fd3d2d/3844852/933e80b/0edce9a). (1) Mega raids were untargetable
> by most of the arsenal: organ descent band recalibrated to the REAL slot grid
> (MEGA.minWeakPointY..maxWeakPointY 560–700, bodyBandY 580, validator-enforced ± both
> bounds), Siphon organ-tether/body legs + Coil body chip (both feed the ADAPT ledger), hero
> `heroMegaRaid` seek duty. (2) The economy-vs-curve rescale (docs/DIFFICULTY.md §curve):
> Bio-Container meter DORMANT until the first mega kill (`hasSlainMega`; run/stage caches
> unaffected; sim world-model mirrors the cadence via the real megaKilled event); piecewise
> EHP curve (5% 1–8 · 20% 9–25 · 5% after, `hpMultFor`); honest ×1.8 raid-premium bar on
> mega stages (sawtooth ladder pinned by progressionLoop invariant 1); probe-discovered
> HIVE-GUARDIAN OVERRIDE (`megaRaidYield` — raid duty yields while the Core is threatened;
> stage 10 was unwinnable at ×3 without it, BUGFIX-LOG #14); Boss Rush gate 10→9; gene/hero/
> nucleus stage gates reviewed + kept (decisions in §curve). Evidence: baseline/post-gate/
> final BALANCE_REPORT runs, fair-pilot contract probe 1–30 (table holds vs displayed bars),
> acceptance probe (Average first-walls ~25 at 0.90×, Efficient 0.96×, fresh-bot 10h stage
> 62→29), live headless probe (dormant/awakened meter, on-screen premium bar == derivation).
> Suite 1991 green ×4 batches, goldens byte-identical throughout, validate PASS, mobilecheck
> CLEAN. Watch items: stage-28 band heat; possible dormant-meter teaser copy. Previous
> session below.)
>
> **2026-07-12** (**CLAIM-POPUP NOTIFICATION LAYER + MUTATION PANEL
> DE-SCROLL** — docs/NOTIFICATIONS.md §claim-popups: ONE bold itemized receipt popup
> (`state/rewardToast.ts` bus + `RewardToaster`, menu-only in App) now presents every hub
> claim — quest missions/finales (+`+N Season XP` line teaching the quests→pass loop),
> season-pass levels/claim-all/premium unlock, weekly directives (previously SILENT, now
> also cued), wardrobe milestones — with icon-derived "view it →" jumps (containers→Vault,
> cosmetics→Wardrobe, essence→Gene Archive) via navBus; per-screen `bp-receipt` strips
> removed; ceremonies (BioCache/Vault/WardrobeReveal/Store/Spoils/Genome) deliberately stay
> bespoke. And the in-run Tower Mutation panel de-scrolled (docs/TOWER-BRANCHES.md §3):
> BranchTree = five-pip tier track + ONE selected-tier detail card (tap any pip → cost,
> mutation text, projected stat deltas via `statDeltas`/`branchStatsView`), pre-lock
> lane-focus compare (CHOOSE/COMPARE), tree directly under the title, one-line stat strip,
> Host-vitals `<details>` fold, Move/Sell/Done one row, mobile 304px cap — the buy/splice
> is above the fold everywhere. No sim/save/Power changes (goldens byte-identical). Suite
> 1986 (+5 rewardToast), validate PASS, live headless smoke: toast small/big/queue/nav,
> pre-lock compare, pip preview, splice→T2 evolve, 620px band — 15 screenshots reviewed.
> Previous session below.)
>
> **2026-07-11** (**HERO SYMBIOTE SYSTEM** — the champion wing of the
> Mulligan pillar, docs/HERO-SYMBIOTES.md: every hero hosts 3 gated slots × 3 organ seats
> from a 36-species catalog (behavior-verb kit, structurally unable to duplicate Hero
> Equipment stats); per-slot Complete Hero Adaptations; category-census Resonance; per-hero
> identity trials + Ichor (`HERO_SYMBIOTE_GATES`, typed complete over HeroKind); staged
> visual mutation (`render/heroSymbiotes.ts`) + Hero Lab Symbiote Chamber console + live
> portrait preview; save **v41** `heroSymbiotes`; NEW hero killing-blow credit
> (`Enemy.lastHitHero` → lifetime `heroKills` — previously never accrued); Power via the
> mulligans bucket ×`accountSymbiotePower`; genome source, 4 collection codices, 4
> achievements. Suite 1943, validate PASS, mobilecheck CLEAN, live combat probe PASS
> (all 11 verbs), goldens byte-identical. Earlier same-day: DRACONIC content (Cinderwyrm
> swoop hero + Wyrmwing Glaive 'arc' + Drake Roost 'summon', pushed 7f2c837).
> Previous session below.)
>
> **2026-07-09** (**MULLIGAN PRESENTATION OVERHAUL** — the Mulligan Lab
> rebuilt to the design language (token-driven `.mgl-*`; host rail → live graft-chamber
> showcase → Power-previewed graft sites → category-filterable modifier library; auto-armed
> first empty site; DPR/reduced-motion-aware preview canvas); `MULLIGAN_RARITY` colors now
> mirror the global `--r-*` ladder; new `GENE_OVERFLOW` ⊛ identity shared by the Lab wallet
> + reveal pulls; Inspector/Daily phantom CSS vars fixed. Suite 1328, validate PASS,
> mobilecheck CLEAN, live headless equip/level/ascend loop verified. docs/MULLIGANS.md §UI
> updated. Previous session below.)
>
> **2026-07-08** · session 2 (**PUBLIC-RELEASE PACKAGE complete** —
> marketing site (`/welcome/`: hero/trailer/screenshots/features/modes/newsletter/legal
> skeletons + hidden modular ad slots, docs/WEBSITE.md), full branding/PWA (manifest,
> icons, OG card, boot splash, SEO/social meta), privacy-friendly analytics (D1
> aggregate counters + server-truth purchase funnel + CF Web Analytics readiness), and
> **FIELD RESEARCH** — the optional rewarded-ad lane, in-fiction and registry-driven
> (docs/RESEARCH.md): 5 sample/2 boost/1 specimen/1 stamina/1 emergency daily caps,
> progression-scaled payouts, flat Ichor trickle ≤5/day, one-run boosts consumed at
> finishRun, provider-agnostic (`VITE_ADS_PROVIDER`, ships hidden), Market panel +
> Daily/Rush/Results entries, reveal ceremony; save v24; suite 1187; live headless
> claim-loop verified. Release docs: docs/RELEASE-GUIDE.md (novice manual) +
> docs/PRODUCTION-READINESS.md (scorecard: launch blockers = legal pages, live-Stripe
> smoke, domain strings). Previous session below.)
>
> **2026-07-08** (**PRODUCTION DEPLOYMENT complete** — the game is
> launch-ready on Cloudflare Pages + Pages Functions + D1 + Stripe Checkout +
> Turnstile (docs/DEPLOYMENT.md: architecture/diagram/env-vars/checklists;
> docs/STRIPE-SETUP.md: operator checklist). Thin fail-soft backend only where a
> client must never decide alone: server-verified purchases (webhook HMAC +
> event dedupe + catalog-priced sessions + exactly-once fulfillments + refunds),
> cloud saves (sync-code TOFU), daily day-tickets, leaderboards (Turnstile +
> bounds + keep-best), health check. Sim stays 100% client-side/offline. Save
> v23 (claimedReceipts + pendingCheckout). 29 new failure-mode tests (dup
> webhooks, forged signatures, refunds, power-loss claims…); suite 1173.
> docs/SECURITY-AUDIT.md: cleared for release, no criticals; independent diff
> review clean at the reporting bar. Previous sessions below.)
>
> **2026-07-07** (**MEGA BOSS SAGA + three content batches complete**:
> the MEGA BOSS raid framework (battlefield-scale anchored organisms, 12-verb ability registry,
> 10-kind consequence-mapped Weak Point framework, campaign /10 · infinite /20 · rush /5
> cadence + the rare Daily Mega, Power-vs-kill-time efficiency rewards, collection category,
> `docs/MEGA-BOSS.md`) with FIVE authored megas (Voraxis / Meridia / Ossira / Vesperine /
> Moloch-Ama); SIX new campaign bosses — the Act-2 siege line (35/40/45) and the Act-3
> graduation line (50/55/60); THREE new towers, each a new firing verb (Blight Sower `'trap'`
> mine gardener — `docs/SOWER.md`; Synapse Spire chain-arc, first pure `TowerDef.abilities`
> composition — `docs/SPIRE.md`; Undertow Polyp pull-field displacement — `docs/POLYP.md`);
> 15 gene cards (pool 102, 44 gated) + 30 meta upgrades (87) + 9 Ascendant nodes (19) + 8
> enemies + 2 biomes (10) + the boss visual distinction overhaul
> (`render/bossChassis.ts` — five chassis body plans, authored palettes). Goldens
> byte-identical throughout; suite 1137; validate PASS. Previous sessions below.)
>
> **2026-07-05** (**BOSS RUSH SAGA complete — all four prompts shipped**:
> P1 boss siege behaviors + multi-phase AI (16-kind module library, canonical 100/70/40/15
> phase arc, desperation finales — `docs/BOSS-DESIGN.md` §siege); P2 **Boss Rush mode**, the
> third pillar (wave N = N procedural bosses, staggered column + thinned escort, draft every
> 2nd wave, per-boss Core/loot payout, own records + prediction + qualify gate, gauntlet
> terminal, probe-tuned fresh w7 / mid w8 / late w10); P3 **stamina** (100 cap, 20/entry,
> +1/3min lazy, first-of-day FREE, market packs) + the **primary Ichor lane** (2 per NEW
> 5-boss record band, container per 10-band); P4 **Bio-Roulette** second reward ceremony
> (Bio-Spores, fresh 12-pod weighted board, momentum physics, one-click Absorb) — all in
> `docs/BOSS-RUSH.md`; goldens byte-identical throughout; suite 952. Previous session below.)
>
> **2026-07-04** (evening session — **STRAIN + BIOMORPH CONVEYOR complete**:
> all 8 prompts shipped incl. the PROMPT-8 simulation report + economy retune (deploy
> 100·1.11ⁿ, strain 100·1.05ⁿ×[3,4,5,6]) and the integration long-tail (lifetime ledgers,
> achievements, tutorial nod) — `docs/STRAIN.md` §9; and the **TOWER EXPANSION**: Carrion Maw
> / Amber Chrysalis / Wailing Effigy with every progression layer (branches, stars,
> adaptation, organs, Strain II–V ×12 verbs, cards, affixes, sounds), Freeze/Fear statuses
> with the engine refractory window + flees semantics, contract probes green at 8 kinds,
> goldens re-pinned twice deliberately — `docs/TOWERS.md` §expansion. Earlier the same day:
> HIVE SIEGE combat model + contact rebalance + presentation — `docs/HIVE-SIEGE.md`).

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
respec, lab UI + inspector — `docs/ADAPTATION.md`)** · **Command Center home (registry-driven
widget zones over pure read-models; living World Status canvas organism, command strip, feed,
unlock roadmap, forecast, live army — `docs/COMMAND-CENTER.md`)** · **Permanent simulation
framework (11 personas over the real meta layer, dopamine-cadence ledger, 8 bottleneck
detectors with diagnosis, `npm run sim:report` → report-only `docs/BALANCE_REPORT.md` —
`docs/SIMULATION-FRAMEWORK.md`)** · Enemy/boss battlefield language (trait-on-body visuals,
artillery shells, boss runtime tells — `docs/ENEMIES.md` §8–9) · Deployment interstitial +
Wave Briefing threat console · **Danger Camera (hysteresis state machine → ONE smoothed
intensity for every tension effect; render-only, golden-safe — `docs/CAMERA.md`)** ·
**Onboarding overhaul (gated Combat Tutorial via `game.tutorialMode` + director-scripted
beats, milestone-reward ledger, anchored what/why/when/later Field Orientation, Help
"Watch out" rows + 5 new mechanic entries — audit record `docs/TUTORIAL-AUDIT.md`)** ·
Combat HUD v3 (phase-state skins, clustered zones, power celebration, HERO OPS, focal Start
Wave — `docs/HUD.md` §0) + game-feel pass (wave banner/camera push, boss arrival, crit pops,
placement tendrils — `docs/GAME-FEEL.md` §0) · **Early-campaign difficulty contract
(`docs/DIFFICULTY.md` §contract: >rec ≈ no damage · =rec ≈ chip/boss · ≤0.75 ≈ bad time;
EHP-priced waves, granularity ramps, §grace window, stage-flat leak damage, biome-ratchet
recommendedPower, mortar lead — goldens deliberately re-pinned, biomass-only drift)** ·
**Hive Siege (docs/HIVE-SIEGE.md): the Core is a COMBAT TARGET — converge/crust/attack-loop
enemy AI (statuses gate everything, artillery unified, suicide fuses, chassis boss cadence),
role-derived per-hit rebalance probe-held to the §contract, endless shape/EHP/swarm depth
gates, and the under-siege presentation (damage states, impact shudder, groans + heartbeat,
reactive integrity cell: UNDER ATTACK flag, ghost bar, ⚔ count, −DPS/s, survival clock)**.

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

- 1223 tests / 172 files green; golden sim byte-identical; typecheck strict; build clean.
- Zero runtime import cycles (type-only back-edges by design); RC sweep verified ZERO orphan modules (209 files, all imported) and zero TODO/FIXME in shipping code.
- Registry-enforced: no orphan source files, no unresolvable system references.
- Debt ranked and bounded (`docs/ENGINEERING-AUDIT.md` §4–5); no unbounded growth surfaces known.
