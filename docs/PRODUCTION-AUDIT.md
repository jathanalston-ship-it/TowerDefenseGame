# PRODUCTION-AUDIT.md — ASSIMILATE Master Development Plan (Alpha → 1.0)

> Authored by the leadership group (Creative / Technical / Systems / Economy /
> Gameplay Direction) as the canonical production audit and roadmap. This is a
> *planning* document — no code. It supersedes the aspirational `ROADMAP.md` as the
> operating plan and is grounded in the **actual** codebase, not the design corpus.
> Companion: `CHURN-ANALYSIS.md` (Steam EA retention).

---

## 0. Executive summary

**Where we are: a genuinely strong vertical slice with a proven, polished core loop —
and a long way from the stated vision.** The engineering foundation is better than the
game. The *loop* is shippable-feeling; the *depth, content, and presentation* are not.

**Metrics (verified):** ~7,400 LOC of source across 38 files, 93 tests, deterministic
sim core cleanly split from React/Canvas, versioned+migrated saves (schema v3). Three
game modes, a roguelite draft, a 4-currency economy, a persistent loot loop, and a
codex all work and are tested.

**The four hard truths leadership must internalize:**

1. **The game has *one* permanent-progression mechanic wearing four costumes.** "Core,
   Mastery, Equipment, Prestige" are four **capped account-upgrade tracks** that differ
   only by which currency buys them (`*_UPGRADES` in `config.ts`). The vision's *5–7
   distinct recursive layers* (Stars, per-unit infinite Mastery, hero Gear, true
   Prestige resets) **do not exist** — they're proxies. This is the single most
   important finding.
2. **Permanent progression is FINITE and shallow.** ~13 upgrade nodes total; everything
   maxes in roughly **20–40 hours**. After that, currencies have no sink and the loot
   meter pays currency you can no longer spend. The "**thousands of hours**" promise is
   currently off by ~1.5–2 orders of magnitude.
3. **There is no audio and no authored art.** Zero SFX, zero music; visuals are
   procedural Canvas shapes. For a "satisfying combat / premium UX" pitch this is the
   biggest *felt* gap and a top-3 churn driver.
4. **Content is ~3–5% of vision** (3/100 towers, 1/30 heroes, 11/100 enemies, 1/50
   bosses, 30/500 cards, 0/300 equipment, 5/25 biomes). Raw counts are **not** the
   priority — the *systems and depth* that make content matter are.

**The leadership thesis for the road to 1.0:**

> **Depth before breadth. Feel before scale. Systems before content counts.**
> Do **not** chase 100 towers. Build (a) the **depth** that makes the existing slice
> retain (Stars → real Mastery → Gear → first Prestige), (b) the **feel** (audio +
> combat juice), and (c) the **content pipeline** that makes the eventual scale cheap.
> Then a *moderate* content bump to a credible launch roster. The 100-tower/30-hero
> endgame is **post-1.0 live-ops**, measured in years — not the 1.0 scope.

We are, in honest versioning terms, at **~v0.2 (late Alpha)**: the loop is proven; the
retention engine and the presentation are not yet built.

---

## 1. Current state vs vision (at a glance)

| Pillar | Now | Vision | Coverage |
|---|---|---|---|
| Towers | 3 | ~100 | 3% (and no stars/mastery/class/evolution) |
| Heroes | 1 | ~30 | 3% (no gear, selection, or per-hero AI) |
| Enemies | 11 | ~100 | 11% |
| Bosses | 1 | ~50 | 2% |
| Cards | 30 | ~500 | 6% |
| Equipment items | 0 | ~300 | 0% (system absent) |
| Biomes | 5 | ~25 | 20% |
| Procedural stages | ∞ (generator ✅) | ∞ | generator done; variety thin |
| Distinct progression layers | 1 (×4 currencies) | 5–7 | ~1 real layer |
| Audio | none | full | 0% |
| Authored art | none (procedural) | AAA bio-horror | 0% |

---

## 2. System-by-system audit

**Legend:** ✅ Complete · 🟡 Functional but expandable · 🟠 Prototype only · 🔴 Missing.

### 2.1 Status dashboard

| # | System | Status | One-line state | Long-term importance |
|---|---|---|---|---|
| 1 | Deterministic sim core | ✅ | Fixed-step, seeded RNG, headless-testable | Critical (foundation) |
| 2 | Combat (towers/hero/enemies) | 🟡 | Polished feel; 3 towers/1 hero/11 enemies; behavior hardcoded | Critical |
| 3 | Status + SHRED reactions | 🟡 | Fracture/Corrosion/SHRED + slow/weaken; not a general framework | High |
| 4 | Classic Mode | ✅ | 12 authored waves (the on-ramp) | Medium |
| 5 | Endless Mode | 🟡 | Infinite procedural waves + score; no Ω-tiers/seasons | High |
| 6 | Procedural Stage Mode | 🟡 | Biome×layout×modifier×objective×waves, deterministic | High |
| 7 | Wave Composer (Spawn Director) | 🟡 | Themes/elites/bosses/scripted/difficulty; data-driven | High |
| 8 | Automatic wave flow + Build Phase | ✅ | Countdown, banner, summary, preview, early-start | High |
| 9 | Roguelite card draft | 🟡 | 30 cards, 1-of-3, RunModifiers hooks; no pool progression | High |
| 10 | Enemy archetype kit | 🟡 | Composable movement/abilities/stats/visual/role | High (content velocity) |
| 11 | Economy (4 currencies) | 🟡 | Per-mode reward tables; legible | High |
| 12 | Permanent upgrades (4 tracks) | 🟡 | 13 nodes; **finite**, caps fast; one mechanic ×4 | High (but shallow) |
| 13 | **Tower Stars (1–10)** | 🔴 | Not built | **Critical (retention)** |
| 14 | **Per-unit infinite Mastery** | 🔴 | Not built (track ≠ mastery) | **Critical (forever-hook)** |
| 15 | Class progression | 🔴 | Classes are tags only; no XP/keystones | High |
| 16 | Tower/Hero evolutions | 🔴 | Not built | Medium |
| 17 | **Hero roster + selection** | 🟠 | 1 data-driven hero; no picker | High |
| 18 | **Hero Equipment / Gear** | 🔴 | Absent (track ≠ gear) | **Critical (build engine)** |
| 19 | Hero stars / shards / mastery | 🔴 | Not built | High |
| 20 | Unique hero AI behaviors | 🟠 | One autonomous AI; not per-hero | Medium |
| 21 | Loot Meter (persistent) | ✅ | Polished, rarity-accented, glanceable | High |
| 22 | Loot Boxes (rarity + opening) | 🟡 | 3 rarities, FIFO open, **currency-only** contents | High |
| 23 | Pity mechanics | 🔴 | Deterministic cadence proxy only | Medium |
| 24 | **Prestige (reset layers)** | 🟠 | Catalyst + a Prestige *track*; no reset loop | **Critical (1000h)** |
| 25 | Save: versioned + migrated | ✅ | Ordered migrations, field-ops, logging, backups | Critical |
| 26 | Codex / Collection tracking | ✅ | Enemies/biomes/cards discovery | High |
| 27 | Achievements + Titles | 🟡 | 16 across 5 chains; expandable | High |
| 28 | Statistics system | 🟠 | A few counters; no stats surface | Medium |
| 29 | AI Director (adaptive) | 🔴 | Not built | Medium |
| 30 | Universal Modifier System | 🟠 | 3 separate ad-hoc modifier bags | High (scalability) |
| 31 | Ability Framework | 🟠 | One hardcoded hero ability | High |
| 32 | Event Bus | 🔴 | Inline coupling (card hooks in game.ts) | Medium (scalability) |
| 33 | Data-driven content registry | 🟠 | Typed tables; no registry/Zod validation | High (scale safety) |
| 34 | Renderer (Canvas 2D) | 🟡 | Biome theming, tells, juice; procedural art | High |
| 35 | **Audio (SFX/music)** | 🔴 | **None** | **Critical (feel)** |
| 36 | Art / animation pipeline | 🔴 | Procedural placeholders only | High |
| 37 | UI/UX | 🟡 | Polished-functional; not art-directed/AAA | High |
| 38 | Onboarding / tutorial | 🟠 | A "how to play" blurb only | High |
| 39 | Performance / Worker offload | 🟡 | Single-thread; grid + caps; OK for slice | Medium |
| 40 | Balance / sim harness | 🟠 | Tests assert determinism, not balance | High |
| 41 | Accessibility | 🟠 | Reduced-motion + tokens; no remap/colorblind/scaling | Medium |

### 2.2 Detailed audits (major systems)

> Each card: **Current · Missing · Tech debt · Scalability · Dependencies · Complexity
> · Player impact · Long-term importance.** Complexity = S/M/L/XL dev-effort.

**Combat & Towers (🟡)** — *Current:* 3 role-distinct towers (Needle/Mortar/Reactor),
SHRED synergy, elites, satisfying micro-feedback. *Missing:* 2 launch towers,
stars/mastery/class/evolutions, per-tower identity depth. *Tech debt:* tower behavior is
**dispatched by `t.kind` in `game.ts`** — a new mechanic = engine code, not data.
*Scalability:* hard cap on content velocity until behavior is data/handler-driven.
*Dependencies:* Ability/Modifier frameworks help. *Complexity:* M (2 towers) / L (behavior
framework). *Player impact:* High (the core fantasy). *Long-term:* Critical.

**Permanent progression (🟡, but the core retention gap)** — *Current:* 4 currencies →
4 capped upgrade tracks (13 nodes). Legible, anti-inflation. *Missing:* **everything that
makes it recursive** — Stars (per-unit, mechanic-unlocking), infinite Mastery (the
forever ramp), Gear (horizontal build space), real Prestige (reset → multiply). *Tech
debt:* four tracks are the *same* mechanic; `MetaModifiers` is a flat fixed bag (not
extensible per-unit). *Scalability:* cannot express per-tower/per-hero progression
without a new model. *Dependencies:* a save-schema growth + a per-unit progression
record. *Complexity:* L–XL. *Player impact:* Very high. *Long-term:* **Critical — this is
the "thousands of hours" engine and it is absent.**

**Heroes & Equipment (🟠/🔴)** — *Current:* one data-driven hero (Ravager) with
autonomous AI + one ability; the roster *structure* exists. *Missing:* 2 heroes, a
selection screen, the entire **gear** system (weapons/armor/relics as droppable loot),
hero stars/mastery/shards, per-hero AI/abilities. *Tech debt:* ability is hardcoded; no
equipment data model or loadout state. *Scalability:* gear is the natural **loot-box
content** and the second build axis — its absence makes loot boxes pay only currency.
*Dependencies:* Ability Framework, loot-content tables, loadout save state.
*Complexity:* XL (full gear) / M (2 more heroes as stat-variants). *Player impact:* Very
high. *Long-term:* Critical.

**Loot (🟡)** — *Current:* persistent meter (polished, rarity preview), deterministic
rarity cadence, FIFO opening with a rarity-scaled **currency** cache, end-of-run rewards,
forward-pull nudges. *Missing:* **gear/card contents** (the actual chase), true pity,
box-type variety, an opening *ceremony*. *Tech debt:* none significant; clean. *Scalability:*
ready to drop richer contents once gear/cards-as-loot exist. *Dependencies:* Gear system.
*Complexity:* M. *Player impact:* High. *Long-term:* High.

**Frameworks — Status / Ability / Modifier / Event Bus / Director (🟠–🔴)** — *Current:*
status effects + the one ability + three modifier bags work but are **hardcoded and
coupled**; the Wave Composer is a competent Spawn Director; no Event Bus, no adaptive AI
Director, no unified modifier system. *Missing:* generalized, data-driven versions of
each. *Tech debt:* the hardest scaling debt in the project — every novel mechanic
currently edits `game.ts`. *Scalability:* these frameworks are what let 500 cards / 300
items / 100 towers compose without combinatorial code. *Dependencies:* interlocking.
*Complexity:* L each. *Player impact:* Indirect (enables everything). *Long-term:* High —
but **build them just-in-time**, not speculatively (see §4).

**Audio & Art (🔴)** — *Current:* none / procedural. *Missing:* SFX bus (fire/hit/SHRED/
death/UI), adaptive music, authored sprites/VFX, an art pipeline. *Tech debt:* none (greenfield).
*Scalability:* a data-driven SFX/asset registry keeps it cheap. *Dependencies:* art/audio
contracting or asset packs. *Complexity:* M (audio system + a SFX pack) / XL (full art
direction). *Player impact:* **Very high — felt in the first 60 seconds.** *Long-term:* Critical.

---

## 3. Development roadmap (v0.3 → v1.0)

> Effort assumes a **small team (≈2 engineers + part-time art/audio)**. Sizes are
> *ranges*, not commitments. The ordering de-risks retention first.

### v0.3 — "Feel & the First Forever-Hook" *(the make-it-good-to-touch release)*
- **Primary goals:** fix the two earliest churn cliffs — *it feels flat* and *there's no
  visible long-term hook.*
- **Major features:** (1) **Audio system + a first SFX/music pass** (fire/hit/SHRED/
  death/UI/box-open + 2–3 music beds). (2) **Tower Stars v1** (per-tower stars 1–10:
  tower shards as a currency, stat steps + 2–3 mechanic unlocks per tower) — the first
  *real* recursive layer and the first per-unit progression record in the save.
- **Polish:** combat hit-stop/screenshake tuning; SHRED audio-visual punch; loot-box
  open ceremony.
- **Balance:** star cost curve; tower-shard income.
- **Architecture:** introduce a **per-unit progression record** in the save (the model
  Stars/Mastery/Gear all reuse) + the migration for it. Audio asset registry.
- **Risk:** audio scope creep (mitigate: ship a small, consistent SFX set); star design
  bloat (mitigate: stats + a few mechanics, not 10 bespoke kits yet).
- **Effort:** 4–6 weeks. **Player impact:** Very high (first-session feel + a forever goal).

### v0.4 — "The Tower Roster & Content Pipeline"
- **Primary goals:** widen the core fantasy and make content *cheap and safe*.
- **Major features:** 2 launch towers (→5, the Viral + Neural classes); a **tower-behavior
  handler framework** (data + registered handlers, retiring `t.kind` dispatch); a
  **content registry + schema validation** (load/validate/index all content).
- **Polish:** per-tower identity VFX/audio; tooltip/clarity pass for 5 towers.
- **Balance:** 5-tower reaction matrix; draft weighting across the wider pool.
- **Architecture:** handler framework + registry are the scalability unlock for all
  future content.
- **Risk:** framework over-engineering (mitigate: extract from the 5 real towers, don't
  design in the abstract). **Effort:** 5–7 weeks. **Player impact:** High.

### v0.5 — "Heroes & Gear" *(the second build axis + loot payoff)*
- **Primary goals:** make loot boxes pay **gear**, not just currency; add hero choice.
- **Major features:** 3 heroes + **selection screen**; the **Equipment system** (weapon/
  armor/relic slots, affixes, rarities) as **loot-box + boss-drop contents**; loadout
  save state.
- **Polish:** gear reveal ceremony; hero kit VFX/audio.
- **Balance:** gear power budget (hard-capped vertical, horizontal variety); drop rarity.
- **Architecture:** Ability Framework (extracted from the now-multiple hero abilities);
  loot-content tables.
- **Risk:** gear complexity explosion (mitigate: 3 slots, bounded affixes, no set bonuses
  yet). **Effort:** 7–10 weeks. **Player impact:** Very high.

### v0.6 — "Mastery & Class Progression" *(the infinite background ramp)*
- **Primary goals:** add the *truly* infinite, never-finishes progression.
- **Major features:** per-tower & per-hero **infinite Mastery** (log curve, milestone
  perks every N); **Class levels + keystones** (shared tower↔hero pool).
- **Polish:** mastery-up flourishes; rank badges.
- **Balance:** the bucket math (additive-within / multiplicative-across) from
  `PROGRESSION.md §1` — validated by a sim harness.
- **Architecture:** the per-unit record (from v0.3) generalizes; **balance sim harness**.
- **Risk:** number bloat (mitigate: log curves + Power Score). **Effort:** 5–7 weeks.
  **Player impact:** High (closes the "everything caps" cliff).

### v0.7 — "Enemies, Bosses & Directors"
- **Primary goals:** combat variety + encounters that scale.
- **Major features:** +10–15 enemies, +5–8 real bosses (multi-phase via the ability
  framework); **AI Director** (adaptive pressure) layered over the Spawn Director;
  generalized **Status Framework**.
- **Polish:** boss telegraphs, arenas, music stings.
- **Balance:** director aggression curves; boss DPS checks.
- **Architecture:** status framework generalization. **Risk:** director feeling unfair
  (mitigate: bounded, legible). **Effort:** 6–8 weeks. **Player impact:** High.

### v0.8 — "Prestige I + Compounding Architecture"
- **Primary goals:** the first **reset → multiply** loop (the 1000h seed) and the
  architecture that lets layers compound.
- **Major features:** **Prestige Layer 1 (Molt)** — reset a tier, mint a prestige
  currency, buy a global tree; the **Universal Modifier System** (one stacking/typed
  model replacing the three bags); **Event Bus** (decouple on-kill/on-hit/on-wave hooks).
- **Polish:** prestige ceremony; "while you were away" framing if any idle.
- **Balance:** prestige currency (sqrt) + global mult (log) curves; the *when-to-prestige*
  decision. **Architecture:** the two frameworks pay back all prior debt.
- **Risk:** reset-anxiety (mitigate: trophies persist; fast re-climb). **Effort:** 6–9
  weeks. **Player impact:** Very high (unlocks the long tail).

### v0.9 — "Content scale, Collection completion, Stats, Pity, Balance"
- **Primary goals:** a credible launch volume + completionist surfaces + a real balance pass.
- **Major features:** content bump (toward ~12–15 towers, 6–8 heroes, ~40 enemies, ~120
  cards, ~80 gear, ~12 biomes — *credible launch*, not the full vision); **Stats screen**,
  **codex completion rewards**, **pity** on loot rarity; **achievement** expansion.
- **Polish:** numbers/UX consistency; daily/weekly seed hooks.
- **Balance:** full sim-harness sweep; difficulty curve audit. **Architecture:** stats
  pipeline. **Risk:** content grind on the team (mitigate: the pipeline from v0.4).
  **Effort:** 8–12 weeks. **Player impact:** High.

### v1.0 — "Ship Quality" *(Early-Access-ready / 1.0 launch)*
- **Primary goals:** make it *premium*: art direction, AAA UX, onboarding, accessibility,
  performance, store-readiness.
- **Major features:** **authored art pass** (sprites/VFX/biome dressing); **onboarding/
  tutorial**; accessibility (remap, colorblind, text scale, full reduced-motion); **Web
  Worker** sim offload for big endless waves; settings/options; cloud-save readiness.
- **Polish:** the whole-game juice + audio mix pass; trailer-worthy moments.
- **Balance:** new-player → 30-hour curve tuned on telemetry. **Architecture:** Worker
  bridge; perf budget hardening. **Risk:** art is the long pole (mitigate: contract early,
  consistent style guide). **Effort:** 10–16 weeks. **Player impact:** Very high (the
  difference between "interesting prototype" and "a game people buy").

> **Post-1.0 (live-ops, years):** the remaining content march toward the vision counts
> (100 towers, 30 heroes, 500 cards…), deeper Prestige layers (Speciation → Omega),
> seasons/leaderboards, the idle/empire layer. **None of this is 1.0 scope.**

---

## 4. Prioritization — what comes next, what waits

Ranked by a blended score of **Retention · Replayability · Long-term progression ·
Technical necessity · Ease-of-future-expansion · Return-on-dev-time.**

### Do these NEXT (highest ROI, unblock retention)
1. **Audio + a first SFX/music pass** — cheapest, most-felt win; fixes the 60-second cliff.
2. **Tower Stars v1 + the per-unit progression record** — the first real forever-hook and
   the *reusable data model* every later layer (mastery/gear) sits on.
3. **Tower-behavior handler framework + content registry** — the velocity unlock; do it
   while extracting the 4th/5th tower (concrete, not speculative).
4. **Hero Gear as loot-box contents** — turns the (already-built) loot loop from "currency"
   into a real *chase*; second build axis.
5. **Infinite Mastery** — closes the "everything caps in 30 hours" cliff with a log ramp.

### Build JUST-IN-TIME (valuable, but only when a concrete feature needs them)
- **Ability Framework** (when the 2nd–3rd hero ability lands, v0.5).
- **Universal Modifier System** (when modifier bags become painful, ~v0.8).
- **Event Bus** (when on-kill/on-hit hooks proliferate, ~v0.8).
- **Status Framework generalization** (with the boss/enemy wave, v0.7).
- **Balance sim harness** (with Mastery/Prestige curves, v0.6).

### Intentionally WAIT (do not build now — premature complexity)
- **Prestige layers 2–6 (Speciation→Omega)** — wait until Layer 1 proves the loop.
- **Idle / Hive-Network empire layer** — post-1.0; it's a different game mode.
- **Raw content counts toward the vision** (100 towers etc.) — live-ops; chasing counts
  now starves the depth systems that make content *matter*.
- **AI Director sophistication** — a simple adaptive director is enough until the enemy
  roster is large.
- **Multiplayer/leaderboards beyond a simple score table** — post-1.0.
- **A bespoke art engine / Pixi migration** — Canvas 2D is fine through 1.0.

**The one-sentence rule:** *next = the thing that makes the current slice retain past 30
hours (Stars → Gear → Mastery) plus the thing that makes it feel good (audio); wait =
anything that adds breadth before that depth exists.*

---

## 5. Top 50 Highest-Value Remaining Tasks (ranked)

> Each: **Why · Dependencies · Difficulty (S/M/L/XL) · Player-experience impact · Now/Later.**
> Ranked highest-value first. "Now" = next 2–3 milestones.

1. **Core SFX set + audio bus** — Why: combat has *no* feedback; the #1 felt gap. Deps:
   asset registry. Diff: M. Impact: Very high. **Now.**
2. **Adaptive/ambient music (2–3 beds + stings)** — Why: pacing & tension; retention.
   Deps: audio bus. Diff: M. Impact: High. **Now.**
3. **Per-unit progression record (save model)** — Why: the spine Stars/Mastery/Gear all
   reuse. Deps: save migration (✅). Diff: M. Impact: High (enabling). **Now.**
4. **Tower Stars 1–10 (stats + mechanic unlocks)** — Why: first real forever-hook. Deps:
   #3, tower shards. Diff: L. Impact: Very high. **Now.**
5. **Tower shards currency + sources** — Why: feeds Stars; per-tower investment choice.
   Deps: economy. Diff: S. Impact: High. **Now.**
6. **Tower-behavior handler framework** — Why: retire `t.kind` dispatch; content velocity.
   Deps: none. Diff: L. Impact: High (enabling). **Now.**
7. **Towers #4–5 (Viral, Neural)** — Why: completes the launch class fantasy + reactions.
   Deps: #6. Diff: M. Impact: High. **Now.**
8. **Hero Equipment system (slots/affixes/rarity)** — Why: the build engine + loot payoff.
   Deps: Ability Framework, loot tables. Diff: XL. Impact: Very high. **Now/next.**
9. **Gear as loot-box & boss contents** — Why: turns loot into a chase. Deps: #8. Diff: M.
   Impact: Very high. **Now/next.**
10. **Heroes #2–3 + selection screen** — Why: second build axis; choice. Deps: hero record
    (✅). Diff: M. Impact: High. **Now/next.**
11. **Infinite Mastery (towers + heroes)** — Why: kills the "everything caps" cliff. Deps:
    #3. Diff: L. Impact: Very high. **Next.**
12. **Loot-box open ceremony (juice)** — Why: payoff feel. Deps: audio. Diff: S. Impact:
    High. **Now.**
13. **Onboarding / first-run tutorial** — Why: 10-minute comprehension cliff. Deps: none.
    Diff: M. Impact: High. **Now.**
14. **Combat juice pass (hit-stop, shake, SHRED punch)** — Why: "satisfying combat" claim.
    Deps: audio. Diff: S–M. Impact: High. **Now.**
15. **Content registry + schema validation** — Why: scale safety for 100s of items. Deps:
    none. Diff: M. Impact: Medium (enabling). **Now.**
16. **Balance sim harness (headless auto-player)** — Why: tune curves without guessing.
    Deps: none. Diff: M. Impact: Medium (enabling). **Next.**
17. **Prestige Layer 1 (Molt): reset→currency→global tree** — Why: the long-tail seed.
    Deps: #3, #11. Diff: L. Impact: Very high. **Next.**
18. **Class levels + keystones (shared pool)** — Why: specialization axis; tower↔hero bridge.
    Deps: #3. Diff: L. Impact: High. **Next.**
19. **+10 enemies via the archetype kit** — Why: combat variety; cheap (data). Deps: kit
    (✅). Diff: S–M. Impact: Medium. **Next.**
20. **+5 real multi-phase bosses** — Why: run climaxes; anticipation. Deps: Ability
    Framework. Diff: M–L. Impact: High. **Next.**
21. **Ability Framework (data-driven)** — Why: hero kits + boss phases without bespoke code.
    Deps: extract from 2–3 abilities. Diff: L. Impact: Medium (enabling). **Next.**
22. **Pity system on loot rarity** — Why: protects against droughts; trust. Deps: loot (✅).
    Diff: S. Impact: Medium. **Next.**
23. **Stats screen + tracked metrics** — Why: completionist + self-measurement. Deps: a
    stats pipeline. Diff: M. Impact: Medium. **Later.**
24. **Card pool unlock progression** — Why: meta-goal feeding the draft; build diversity.
    Deps: economy. Diff: M. Impact: High. **Next.**
25. **+60 cards (toward ~120 launch)** — Why: draft depth/diversity. Deps: hooks/registry.
    Diff: M (volume). Impact: High. **Later.**
26. **Biomes #6–12** — Why: stage variety + visual freshness. Deps: data (✅) + art. Diff:
    M. Impact: Medium. **Later.**
27. **Universal Modifier System** — Why: unify the 3 bags; safe stacking at scale. Deps:
    none. Diff: L. Impact: Medium (enabling). **Later (v0.8).**
28. **Event Bus** — Why: decouple hooks; safer composition. Deps: none. Diff: M. Impact:
    Low-Med (enabling). **Later (v0.8).**
29. **AI Director (adaptive pressure)** — Why: keeps difficulty honest across builds. Deps:
    Spawn Director (✅). Diff: M. Impact: Medium. **Later.**
30. **Authored art pass (sprites/VFX/dressing)** — Why: premium perception; the buy
    decision. Deps: art contract + style guide. Diff: XL. Impact: Very high. **v1.0.**
31. **Hero stars + hero shards** — Why: deepen the hero axis. Deps: #3. Diff: M. Impact:
    Medium. **Later.**
32. **Tower/Hero evolutions (★10 capstones)** — Why: aspirational endgame identity. Deps:
    Stars. Diff: M. Impact: Medium. **Later.**
33. **Daily/weekly seeded runs** — Why: habitual return; "one more day." Deps: seed plumbing
    (✅). Diff: S–M. Impact: High. **Later.**
34. **Endless Ω-tier / season modifiers** — Why: honest-infinite endgame. Deps: Prestige.
    Diff: M. Impact: Medium. **Later.**
35. **Codex completion rewards** — Why: payoff for collection. Deps: codex (✅). Diff: S.
    Impact: Medium. **Later.**
36. **Accessibility (remap, colorblind, text scale)** — Why: reach + retention; store
    quality. Deps: none. Diff: M. Impact: Medium. **v1.0.**
37. **Web Worker sim offload** — Why: smooth deep-endless on weak devices. Deps: bridge.
    Diff: M–L. Impact: Medium. **v1.0.**
38. **Settings/options screen** — Why: table-stakes (audio/graphics/controls). Deps: audio.
    Diff: S. Impact: Medium. **v1.0.**
39. **Per-hero unique AI behaviors** — Why: heroes feel distinct. Deps: hero kits. Diff:
    M. Impact: Medium. **Later.**
40. **Set bonuses / affix rerolls (gear depth)** — Why: theorycraft tail. Deps: #8. Diff:
    M. Impact: Medium. **Later.**
41. **Boss-specific arenas/mechanics** — Why: memorable encounters. Deps: bosses. Diff: M.
    Impact: Medium. **Later.**
42. **Telemetry/analytics hooks** — Why: data-driven balance for EA. Deps: none. Diff: S–M.
    Impact: Medium (team). **v1.0.**
43. **Cloud save adapter** — Why: cross-device trust. Deps: save (✅). Diff: M. Impact:
    Low-Med. **v1.0+.**
44. **Mutation encyclopedia / enemy codex detail** — Why: lore + collection depth. Deps:
    codex. Diff: S. Impact: Low-Med. **Later.**
45. **Permanent Directives / global challenge modifiers** — Why: self-imposed goals. Deps:
    modifier system. Diff: M. Impact: Medium. **Later.**
46. **Tower-class reaction expansion (beyond SHRED)** — Why: build-matrix depth. Deps:
    status framework. Diff: M. Impact: Medium. **Later.**
47. **Inventory / loadout management UX** — Why: gear needs a home. Deps: #8. Diff: M.
    Impact: Medium. **Later.**
48. **Leaderboards (endless/daily)** — Why: competitive pull. Deps: backend. Diff: L (needs
    a service). Impact: Medium. **Post-1.0.**
49. **Localization scaffolding** — Why: market reach. Deps: string extraction. Diff: M.
    Impact: Low (now). **Post-1.0.**
50. **Idle / Hive-Network empire layer** — Why: lapsed-player insurance. Deps: deep
    prestige. Diff: XL. Impact: Medium. **Post-1.0 (intentionally last).**

---

*See `CHURN-ANALYSIS.md` for the Steam Early-Access retention teardown (Top 25 reasons
players would quit at 10 min / 1 h / 10 h / 100 h).*
