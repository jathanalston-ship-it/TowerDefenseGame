# EA-DESIGN-AUDIT.md — ASSIMILATE Early-Access Design Audit

> **Brief:** a brutally-honest, AAA-caliber design consultation, wearing all five hats
> at once — Lead Systems Designer, Technical Director, Progression Designer, Economy
> Designer, Creative Director. **No code was written for this audit.** Every claim is
> grounded in the actual repository (files/counts cited), not the design docs' ambitions.
> Where the docs and the build disagree, I audit the **build**.

**Date:** 2026-07-01 · **Scope:** the shipped codebase (`src/`), not the roadmap.

---

## 0. The one-paragraph verdict (read this even if you read nothing else)

ASSIMILATE is an **exceptionally well-engineered vertical slice wearing the design
documents of a 1,000-hour live-service game it is not yet.** The *frameworks* are
genuinely AAA — deterministic sim core, data-driven registries, a universal Power
index with (now) enforced coverage, versioned saves, a content validator, golden
tests. But the *content* sits at roughly **5% of the game's own stated targets**
(5/100 towers, 3/30 heroes, ~30/100 enemies, 45/500 cards, ~159/500 equipment,
21/1,000 upgrades, ~1/50 bosses), the **economy in code is a fraction of the economy
in the docs** (≈4 live currencies + 1 prestige layer vs. a designed 7-currency,
6-tier-prestige ladder), and the game is a **static browser SPA with local-only saves
and no backend** — which structurally forecloses the live-ops, cloud save, and
seasonal content the retention fantasy depends on. **The core loop is fun and the
architecture will scale; the game is content-starved and cannot yet retain past
~10–20 hours.** The single highest-leverage decision is not a feature — it's picking a
lane: *tight premium roguelite* (10–30 hrs, no backend) **or** *live-service idle-TD*
(1,000 hrs, needs a backend). The docs promise the second; the build is the first.

---

## 1. System map & dependency graph

**Layers (clean, and the best thing about this project):**

- **Sim core** (`src/core/`, no React/DOM): `game.ts` (deterministic tick), `config.ts`
  (all tunables + tower/enemy/hero/chest data), `cards.ts` (RunModifiers + effect DSL),
  `equipment.ts`, `stars.ts`, `branches.ts`, `mastery.ts`, `boss.ts`, `director.ts`,
  `campaign.ts`, `lootQueue.ts`, `power.ts`, `prestige.ts`, `ascendant.ts`, `validate.ts`.
- **Meta/state** (`src/state/`): `meta.ts` (the god-object save API — ~1,400 lines),
  `saveStore.ts` (schema v14 + migrations), read-models (`heroView`, `vaultReveal`,
  `itemPower`, `mechanics`, `branchTree`, …), `lootbox.ts`, `tutorial.ts`.
- **UI** (`src/ui/`): React HUD/menus + a Canvas renderer; `App.tsx` state machine
  (`menu | playing | results | tutorial`), `Hub.tsx` nav, panel-per-system.

**Dependency shape:** UI → state → core, cleanly one-directional. `core` never imports
up. The **one structural smell is `meta.ts`** — a single ~1,400-line module that is the
save API, the reward pipeline, the power calculator host, the container opener, the
prestige API, and the hero/tower/equipment mutation surface. It is the gravity well every
feature bends toward. It works, but it's the file most likely to become a merge-conflict
and reasoning bottleneck as content grows. **P1: decompose `meta.ts` by domain**
(economy, heroes, towers, loot, prestige) behind the same public object.

**Verdict:** architecture is a strength, not a risk. The dependency graph is acyclic and
legible. This is the part of the game most ready for scale.

---

## 2. Every progression loop, traced

1. **Core run loop** (seconds–minutes): place towers → draft gene cards → survive waves →
   extract. *Fun, juicy, the foundation is sound.*
2. **Star loop** (runs): earn Genome Samples (tower shards) / Hero Essence (hero shards)
   from containers → spend on tower/hero **Stars** (capability unlocks via `stars.ts`).
   Gated by the **Campaign Evolution Cap**.
3. **Mastery loop** (continuous, passive): using a tower/hero accrues Mastery XP →
   ranks + sparse perks. **Infinite by design, but low-feedback** (see §10, RETENTION #12).
4. **Equipment loop** (runs): containers drop gear (now ~50%/container, power-scaled) →
   equip per-hero → reforge with mats. Comparison (▲/▼/=) now everywhere.
5. **Meta-upgrade loop** (weeks): Genome Cores → 21 permanent upgrades (`META_UPGRADES`).
6. **Hero Collection loop** (new): collect Hero Essence → unlock Shepherd/Overseer.
7. **Prestige loop** (MOLT/Ascendant): reset for Ascendant Cells → spendable tree.
8. **Campaign loop**: clear procedural stages → unlock star caps, hero slots, prestige.
9. **Infinite loop**: push depth → loot + mastery + a personal best.

**The problem:** loops 2, 4, 5, 7 all terminate in *the same verb* — "spend a currency to
raise a multiplier, then play another run." They are **mechanically parallel, not
qualitatively different.** Stars→evolution and Equipment→playstyle *try* to differentiate
(and partly succeed), but the moment-to-moment payoff of every loop is "number went up,
play again." A 1,000-hour game needs loops that change **how you play**, not just **how
hard you hit** — and most here change the latter.

**P1: at least two progression loops must produce a NEW DECISION, not a bigger number.**

---

## 3. Dead ends & half-wired features

- ~~**"Custom Challenge" and "Training" menu tiles render "Soon"**~~ — **RESOLVED.** Both
  unbuilt tiles are now hidden behind `core/features.ts` (`FEATURES.customChallenge` /
  `FEATURES.trainingMode`, default `false`); flip the flag in the commit that ships the mode.
  No more dead entrances — the PLAY screen shows only real modes (Campaign / Infinite / Quick
  Skirmish).
- **Bosses are a framework with ~1 authored boss** (`boss.ts` + Bestiary tracking). The
  "Every Boss" collection promises 50; there is essentially one. *P1.*
- **Doctrines (6)** are a thin run-modifier layer with little identity; most players will
  never notice them. *P2 — either deepen into real strategic commitments or fold away.*
- **The authored 12-wave "Quick Skirmish"** still uses a narrow enemy set relative to the
  ~30-archetype roster (RETENTION #1 was "built but not shipped"; the roster expanded, but
  the *authored* path did not fully absorb it). *P2 — verify every built enemy actually
  appears somewhere a player will reach.*
- **`docs/BACKLOG.md` does not exist**, yet many docs reference deferred work — deferred
  items live only in prose. *P3 — a single backlog of honestly-deferred work.*
- **Genome Core "progression HQ" / Evolution tab** is strong, but several sub-systems it
  showcases (prestige tiers beyond MOLT) are aspirational placeholders.

---

## 4. Economy audit — every currency

**Live currencies (in `saveStore`):** Biomass (volatile, in-run), Genome Cores (`shards`),
Genome Samples (`towerShards`, per-tower), Hero Essence (`heroShards`, per-hero), Mutagen
/ Scrap / Catalyst (equipment mats), Ascendant Cells + Molts (prestige). ≈ **8 real
counters, ~4 meaningfully-spent.**

**Designed but absent (ECONOMY.md):** Neural Fragments, Mutation Fragments, Splice Threads,
Synaptic Cores, Apex Genes, Singularity Shards, Omega Strain — an entire **6-tier prestige
ladder and two meta-currencies that do not exist in code.** The doc calls itself
"canonical for currency names," yet the UI shows different names again ("Genome Cores",
"Tower/Hero Shards"). **Three naming systems (design doc / code / UI) for one economy** is
a real onboarding and trust problem. *P0 for live-service ambitions; P2 if scope shrinks.*

**Sinks vs. faucets:** faucets are healthy (containers, run-end, live loot meter). **Sinks
cap out fast** — with 5 towers × 5 stars and 3 heroes × 5 stars, the star sink is
**exhausted in tens of hours**; after that, Genome Samples/Hero Essence have nowhere to go
(mastery is free, not bought). ECONOMY.md's thesis — "every phase opens a new sink so
currency never caps" — is **designed but not built.** *P0: overflow currency has no sink
past mid-game → the economy stagnates exactly when retention needs it most.*

**Cross-currency friction:** two per-unit shard currencies (per-tower, per-hero) plus a
global core plus three mats is **a lot of counters for a game with 5 towers.** The bias I
added (locked-hero shards) helps direction, but the early economy still reads busy.

---

## 5. Power Score validation audit

**Now a genuine strength** (this pass hardened it). `power.ts` composes one monotonic index
over meta/towers/heroes/equipment/temporary; `POWER_RELEVANT_FIELDS` + `validate.ts`
enforce that **no strength field is invisible to Power** (boot-check error), and a
category-aware spike guard flags permanent inflation. Comparison (▲/▼/=) surfaces on
inventory, the Vault reveal, and tooltips.

**Remaining gaps:**
- Power is a **feedback number, not a gate.** Only equipment-drop rarity + the Progress
  Prediction consume it. Nothing *requires* a Power threshold, so it can't pace content
  (e.g., "this stage expects ~3,000 Power"). *P2 — use Power as a soft gate/recommendation
  on Campaign nodes and Infinite goals.*
- The enforcement covers the **effect/RunModifier surface**; raw stat content (a new
  hero's base `attackDamage`, a tower's base DPS) contributes via the towers/heroes
  buckets but is **not spike-checked**. A grossly over-statted new hero would pass. *P2.*
- Weights (splash 0.5, DoT 0.5, …) are **heuristic and uncalibrated against real DPS**.
  Power ≠ actual clear-speed; treat it as ordinal, not cardinal. *P3.*

---

## 6. Player timeline (5 min → 1,000 hr)

- **5 min:** Combat Tutorial → HUD Tour → first container. *Onboarding is strong* (this
  is a genuine highlight — few EA TDs teach this well).
- **30–60 min:** first Campaign clears, first hero-slot progress, first equipment, first
  "What's New" unlocks. *Good discovery cadence.*
- **3–5 hr:** all 5 towers + 3 heroes touched; first prestige in view; most *systems* seen.
- **10–20 hr:** **the content ceiling.** Every tower, hero, enemy archetype, and most cards
  have been seen. Star sinks near cap. From here the game is **grind the same 5 towers'
  stars/mastery on procedural-but-samey stages.**
- **100 hr:** only mastery (infinite, low-feedback) and Infinite-depth chasing remain.
  Nothing *new* is introduced. Attrition is near-total for all but idle-grinder players.
- **1,000 hr:** **unreachable with current content.** The 1,000-hr fantasy is written into
  the docs (ECONOMY §Goal) but requires the unbuilt prestige ladder, seasonal content, and
  a backend. *P0 for the stated vision.*

**The honest curve:** a great 10–20 hour game with a 1,000-hour skin. That is not an
insult — many acclaimed roguelites are 20–40 hr games. But the marketing/docs must match.

---

## 7. Campaign ↔ Infinite relationship

Per MODE-IDENTITY.md and the build: **Campaign = currency + gated unlocks** (star cap,
hero slots at Stage 25/90, prestige at Stage 10), **Infinite = loot + mastery + depth +
personal best.** This is a *reasonable* split and better than most EA TDs.

**But:** both ultimately feed **the same account Power**, and Campaign is the *mandatory*
path (it gates the caps that make Infinite meaningful). So the honest answer to "which do
I play?" is "**Campaign until it stops gating things, then Infinite forever.**" Infinite is
the de-facto endgame, yet it's the *thinner* of the two (procedural density + an AI
director, but no bespoke beats). The **prediction system** is a nice bridge (it tells you
how deep you'll get), but it underlines the treadmill rather than breaking it. *P2: give
Infinite its own progression spine (depth milestones that unlock content, not just loot).*

---

## 8. Content density

| Axis | Built | Target (CLAUDE.md) | % |
|---|---:|---:|---:|
| Towers | 5 | 100 | 5% |
| Heroes | 3 | 30 | 10% |
| Enemies | ~30 | 100 | 30% |
| Bosses | ~1 | 50 | 2% |
| Cards | 45 | 500 | 9% |
| Equipment | ~159 | 500 | 32% |
| Meta upgrades | 21 | 1,000 | 2% |

**This is the headline risk.** The registries, effect DSL, star/branch/mastery frameworks,
and validators are all built to hold 20× this — which is *correct* per the constitution —
but a player does not experience a framework; they experience content. **Equipment (32%)
is the healthiest axis** (the behavioral-verb system paid off). **Bosses (2%), meta
upgrades (2%), towers (5%) are famine.** *P0: content is the binding constraint on every
retention metric; no systems work will move retention until the catalogs fill.*

The good news: because everything is data-driven, **content is cheap to add** — the
expensive part (the systems) is done. This is exactly the position the architecture was
built to enable. The audit's job is to say plainly: **now is the time to spend months on
content, not systems.**

---

## 9. Live-service readiness

**Structurally not ready, by design.** The game is a **static SPA on Cloudflare Pages, no
backend, browser-local saves** (`ARCHITECTURE`/`DEPLOYMENT`). That means:

- **No cloud save / cross-device** — clearing the browser wipes a 100-hour account. For a
  progression game this is the single scariest retention hole. *P0.*
- **No dailies/contracts/events/seasons** (RETENTION #20 still open) — no reason to return
  on a schedule. *P1.*
- **No analytics / A-B / remote config / content push** — you cannot see where players
  churn, cannot tune without a client release, cannot run events. *P1 for live-ops.*
- **Checksummed local save** blocks casual tampering but also means **support cannot
  recover a corrupted save** and players cannot back it up meaningfully. *P2 — add
  export/import to a file (the plumbing exists via `serializeExport`; surface it).*

**Decision forcing:** true live-service needs a backend (accounts, cloud save, config,
events). That is a *platform* decision, not a feature. If the answer is "no backend," then
**cut the live-service language from the docs** and design for a **premium finite-with-
prestige** shape. Either is viable; the current straddle is not.

---

## 10. Design-philosophy check (against the project's own constitution)

The constitution (CLAUDE.md) values *scalability, maintainability, performance,
readability, extensibility, player experience, developer velocity*.

- **Maintainability / readability / extensibility:** ✅ excellent. Data-driven, registried,
  validated, tested, documented to a fault (67 design docs).
- **Scalability:** ✅ frameworks; ⚠️ the *documentation* has outrun the code (67 docs
  describing systems, several aspirational — a reader can't tell built from planned).
  *P2: mark every doc `BUILT / PARTIAL / PLANNED` at the top.*
- **Player experience:** ✅ moment-to-moment (juice, onboarding, the new Vault); ❌
  session-to-session (content ceiling, no return hook).
- **"Boring code wins" / no overengineering:** mostly honored, but the game has
  **speculative generality** — a 6-tier prestige ladder's worth of design and a
  100-tower's worth of framework for 5 towers. The constitution *explicitly* endorses
  building for target scale, so this is sanctioned; but it becomes debt if the content
  never comes. *Judgment call, flagged not condemned.*

**The philosophy is being followed almost too well on the engineering axis and not enough
on the content axis.** Discipline has been spent on systems; the same discipline now needs
to be spent on *filling them*.

---

## 11. Top-100 critical issues (prioritized)

**P0 = blocks the stated vision / loses player data. P1 = major retention/feel. P2 =
meaningful. P3 = polish.** Grouped; ~100 concrete items.

### P0 — existential (12)
1. Content is ~5% of target across most axes — the binding retention constraint. 2. No
cloud save; browser-local save loss = account loss. 3. Star/currency sinks cap in tens of
hours; no mid/late sink (economy stagnates). 4. 1,000-hr vision unreachable with built
content. 5. Designed 7-currency / 6-tier prestige economy is ~30% built; docs claim
canonical. 6. No backend → no live-ops/events/seasons/config. 7. Bosses ~1 of 50 (the
"Every Boss" pillar is hollow). 8. Meta upgrades 21 of 1,000 (permanent-depth pillar
thin). 9. Prestige is 1 layer of a designed 6 — the "old grinds trivialize" thesis isn't
realized. 10. Infinite (the de-facto endgame) has no content spine, only scaling. 11.
Three currency-naming systems (doc/code/UI) — trust + onboarding. 12. No analytics → tuning
is blind.

### P1 — major (24)
13. `meta.ts` is a 1,400-line god-object; decompose. 14. Progression loops converge on
"raise a multiplier" — need loops that change decisions. 15. Dead menu tiles ("Custom
Challenge/Training — Soon"). 16. Authored 12-wave path underuses the enemy roster. 17. No
dailies/contracts → no scheduled return hook. 18. Doctrines (6) lack identity. 19. Hero
roster of 3 caps team-comp depth (slots go to 3, roster is 3 → no *choice* of who fills a
slot until more heroes exist). 20. Mastery is invisible mid-run (RETENTION #12 partially
open). 21. Campaign stages are procedurally samey (no bespoke set-pieces). 22. Card pool
(45) still leans on flat-% picks vs. transformative synergies. 23. No meaningful loss
state in Infinite beyond "you stopped." 24. Reactor/needle/mortar convergence — one
dominant tower line (RETENTION #6/#15). 25. Equipment sets are few → set-build fantasy
thin. 26. No build templates / loadout presets for returning players. 27. Power Score isn't
a soft gate anywhere (missed pacing tool). 28. No "why did I lose?" post-mortem in Results.
29. Genome Core HQ showcases aspirational tiers as if built. 30. Tutorial → first-hour has
a gap once tutorials end (no guided goals). 31. Achievements exist but don't ladder into
rewards beyond shards. 32. No codex entry for many mechanics until unlocked (good) but no
"next goal" surfacing on the home screen for mid-game. 33. Doctrine/difficulty interplay
undocumented for players. 34. Infinite AI Director is invisible — players can't read the
threat. 35. No spectator/replay/share of a great run (social hook absent). 36. Save
export/import not surfaced in UI (plumbing exists). 37. Reforge is an optimization sink few
will discover. 38. No "power fantasy spike" moment authored into Campaign (a boss you
crush after grinding).

### P2 — meaningful (36)
39. Two shard currencies confuse early reads. 40. Materials (3) are undifferentiated in
use. 41. No enemy-affix/elite modifier system to remix the roster cheaply. 42. Waves lack
telegraph/"next wave preview" depth. 43. Biome mechanics are shallow relative to their
docs. 44. Tower branches (Bloons-style) are strong but under-surfaced in decision UI. 45.
No per-run objective variety (always "survive"). 46. Results screen is dense; reward
hierarchy could be clearer. 47. Hero abilities are one-verb (RETENTION #19). 48. No
build-defining keystones on cards at common rarity. 49. Prediction is nice but reinforces
the treadmill. 50. Vault (now good) still lacks a "compare to owned" for non-equipment. 51.
No pity/bad-luck protection surfaced for equipment rarity. 52. Equipment ilvl vs Power
Score dual axes may confuse. 53. Campaign map is procedural — no memorable landmarks. 54.
No difficulty-earned cosmetics. 55. No account-level prestige cosmetics. 56. Sound design
lacks a musical layer (per docs, audio is SFX-only). 57. No haptics/juice on mobile. 58.
No colorblind/accessibility pass documented as complete. 59. Power weights uncalibrated to
DPS. 60. Raw-stat content not spike-checked. 61. No "recommended power" on stages. 62.
Mastery perks are sparse (few milestones). 63. No respec/loadout swap friction analysis.
64. Card draft can't bank across runs (RETENTION #16 partial). 65. No synergy hints in the
draft. 66. Enemy roster lacks "puzzle" enemies that demand specific towers. 67. No
tower-vs-enemy rock-paper-scissors legibility. 68. Genome/Ascendant trees are small. 69.
Container types (3 chest tiers + rarity boxes) overlap in feel. 70. No seasonal reset/
leaderboard for Infinite. 71. Collection completion rewards are one-shot. 72. No
"mastery of the week" or rotating spotlight. 73. Doctrine count (6) < difficulty (5) <
tower (5) — everything is ~5, so nothing feels deep. 74. No cross-tower synergy system.

### P3 — polish (28)
75. Docs don't mark BUILT/PLANNED. 76. `GAME-STATE.md` doesn't exist (constitution asks
for it). 77. `BACKLOG.md` absent. 78. Currency icons could carry tooltips explaining sinks.
79. Some panels are inline-styled vs. CSS classes. 80. Chunk-size build warning (code-split
later). 81. Reduced-motion covers most but not the JS count-up. 82. No in-game changelog
beyond "What's New" mechanics. 83. Placeholder art throughout (acknowledged). 84. Some
hover tooltips missing on stat chips. 85. No keyboard nav map documented. 86. Vault
Reveal-All has no confirm for rare pulls (minor). 87. Power badge lacks a breakdown popover
in some surfaces. 88. Hero lore is gated (good) but short. 89. No "new player vs veteran"
UI density toggle. 90. Results→menu transition could carry more continuity. 91. No
per-tower DPS readout for min-maxers. 92. Infinite best-wave has no ghost/target line in
the run. 93. No quick-restart from Results. 94. Settings lacks a data-export button. 95.
Some magic numbers in balance not centralized (mostly are). 96. Doctrine descriptions
terse. 97. No tutorial for Reforge/branches specifically. 98. Achievement toasts vs inline
Results overlap risk (mitigated, watch it). 99. No FPS/perf HUD for QA. 100. The audit's
own finding: **67 design docs is itself a maintenance surface** — consolidate.

---

## 12. Future-proofing verdict

**What will age well:** the sim/render/UI split, the effect DSL + registries, versioned
saves + migrations, the Power index + its new coverage enforcement, the validation
framework, golden tests. New content is *data*, and the machinery to add it safely exists.
**A team could pour content into this for a year without rewriting a system.** That is rare
and valuable.

**What will age badly if unaddressed:** (1) the **doc/code divergence** — 67 docs, several
aspirational, will mislead every new contributor until each is tagged BUILT/PLANNED; (2)
**`meta.ts` gravity** — it will fight you at scale; (3) the **no-backend ceiling** — every
live-service ambition dies here until it's a platform decision; (4) **content debt** — the
frameworks' generality is only justified if the catalogs fill, else it's the most
elaborate 5-tower TD ever shipped.

**The single recommendation:** *pick the lane.* Write it down. If **premium roguelite**:
delete the live-service/1,000-hr language, cap the prestige ladder honestly, and spend
everything on 20–40 hours of *bespoke* content (real bosses, memorable stages, keystone
cards, distinct heroes). If **live-service**: the next milestone is **not a feature, it's a
backend** (accounts, cloud save, config, events), and the content plan must be a
*pipeline*, not a push. Everything else in this audit is downstream of that one choice.

*— End of audit. No code was changed.*
