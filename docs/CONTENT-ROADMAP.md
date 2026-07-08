# Content Roadmap — the production plan

The engine is substantially complete and the authoring pipeline is audited (`docs/AUTHORING.md`):
**almost every content type is a single-file edit**, and everything downstream (lookups, save records,
collection codex, validators, Power weighting) *derives* from the registry. That means the remaining
work is **content, not systems** — this doc sequences it.

**Where this fits in the doc corpus** (it *complements*, doesn't duplicate):

- **`ROADMAP.md`** — overall milestone plan (*what order to build systems*). This doc lives inside its
  content-breadth phase.
- **`EA-DESIGN-AUDIT.md`** — the honest audit that *motivates* this plan (cites the same counts: content
  at ~5% of stated targets).
- **Per-category design specs** — `BOSS-DESIGN`, `TOWERS`, `HEROES`, `BIOMES`, `CARDS`, `EQUIPMENT`,
  `ENEMIES`, `STAGES` say *what each entry is and why* (the design axis). **Design lives there.**
- **`AUTHORING.md`** — *which file(s) to touch to add one* (the mechanics).
- **This doc** — *how fast, in what order, and how we know a batch is done* (the execution plan).

> **Status: PLAN ONLY.** Nothing here is implemented yet. This is the batching, effort, and
> acceptance plan; content lands in follow-up work, one category-batch per push, verified green.

---

## Census — current vs. target

North-star targets are the CLAUDE.md scale table. Because 500 cards / 1000 upgrades is a *long-term*
north star (not one sprint), each category also has a **near-term milestone** — the first pass that
makes the game feel content-rich — which the waves below actually schedule.

| Category (★ = user priority) | Now | Near-term | North-star | Weakness | Files/entry |
|---|:--:|:--:|:--:|:--:|---|
| ★ **Bosses** | 1 authored | 12 | 50 | 🔴 critical | 1 (`core/boss.ts`) |
| ★ **Towers** | 5 | 15 | 100 | 🔴 critical | 2 (`types.ts`+`config.ts`) |
| ★ **Heroes** | 3 | 9 | 30 | 🔴 critical | 2 (`types.ts`+`config.ts`) |
| ★ **Biomes** | 6 | 12 | 24 (proposed) | 🟠 weak | 1 (`core/biomes.ts`) |
| ★ **Equipment Sets** | 3 | 15 | 40 (proposed) | 🟠 weak | 1 (`core/equipment.ts`) |
| ★ **Campaign events** | 0 (no seam) | 12 | 40 (proposed) | ⛔ blocked | seam first, then 1 |
| ★ **Gene Cards** | 45 | 120 | 500 | 🟡 thin | 1 (`core/cards.ts`) |
| ★ **Meta Upgrades** | 21 | 40 | 1000 | 🟡 thin | 1 (`core/config.ts`) |
| Enemies | 30 | 48 | 100 | 🟢 healthy | 2 (`types.ts`+`config.ts`) |
| Equipment items | 159 | 240 | 500 | 🟢 healthy | 1 (`core/equipment.ts`) |
| Doctrines | 6 | 12 | 20 (proposed) | 🟠 weak | 1 (`core/doctrines.ts`) |
| Achievements | 17 | 40 | — | 🟡 thin | 1 (`state/achievements.ts`) |
| Difficulties | 5 | 5 | — | 🟢 done | 1 (`core/difficulty.ts`) |

**Read:** the weakest, highest-impact categories are **Bosses, Towers, Heroes** (each < 10% of
north-star and each a *power spike the player feels immediately*). **Campaign events** is the only
priority that is **blocked on a small pipeline seam** (below). Enemies and equipment items are the
healthiest — they are *not* scheduled early.

> **Boss target reconciliation:** `BOSS-DESIGN.md` sets **25 as the Early-Access target** (its
> "25-Boss EA Roadmap"); the CLAUDE.md scale table sets **50 as the long-term north-star**. This plan
> uses **12 as the near-term first tranche** — the first ~half of the EA-25, in EA-roadmap order.

---

## Wave 0 — pipeline prerequisites (small seams, not frameworks)

Do these **only when the dependent batch needs them**; none is a major framework.

| Prereq | Why | Blocks | Effort |
|---|---|---|:--:|
| **Campaign-event seam** ✅ **LANDED** | ~~Stages are fully procedural (`generateStage`); there is *no* authoring hook.~~ Shipped: `src/core/campaignEvents.ts` — a `CampaignEventDef` registry `generateStage` samples (eliteRush / gauntlet / cache / mutation), layered onto separate `StageConfig.event` fields + existing levers so the base curve + golden stay intact. Docs: `docs/CAMPAIGN-EVENTS.md`. | Campaign-events batch | S |
| **B1 de-union** (`docs/AUTHORING.md`) | Collapses Tower/Enemy/Hero from 2-file → 1-file by deriving the union from the def map. | makes the Tower/Hero/Enemy batches cheaper & safer | M |
| **Power weighting** | Any card/set/upgrade touching a *strength* field must extend `POWER_RELEVANT_FIELDS` + `FIELD_WEIGHT` or `power-coverage` fails. | every strength batch | XS (per field) |

**Recommendation:** land **B1 de-union first** (a quiet structural window, before the big kinded
batches) and the **campaign-event seam** immediately before Wave 2. The other AUTHORING gaps
(localization, VFX registry, audio-cue registry) are **not** required for any batch below and stay
deferred.

---

## Waves — the schedule

Each wave is a set of **independent category-batches**. One owner per batch (one array/map), so two
batches never edit the same source — that keeps them merge-safe and parallelizable.

### Wave 1 — power spikes (highest impact, lowest count)
The content players feel first. Ship in this order.

1. **Bosses 1 → 12** — new chassis + module/phase combos (not stat clones), in EA-roadmap order
   from `BOSS-DESIGN.md` (each teaches one lesson / forces one adaptation). 1 file each.
2. **Towers 5 → 15** — each a distinct *role or firing behavior* (anti-air, anti-armor, economy,
   support aura), reusing `TowerFiring` verbs so it's data-only. Do **after B1**.
3. **Heroes 3 → 9** — each a distinct ability kit + battlefield role. Do **after B1**.
4. **Biomes 6 → 12** — each a new modifier + hazard + roster bias + boss-chassis bias.

### Wave 2 — depth & synergy
5. **Gene Cards 45 → 120** — new synergy axes, not +damage reskins; new offense fields get a Power weight.
6. **Equipment Sets 3 → 15** — new 2pc/4pc synergy pairs (wire items via `setId`).
7. **Doctrines 6 → 12** — new run-defining rule sets.
8. **Campaign events 0 → 12** — *after the Wave-0 seam*; special encounters on the ladder.

### Wave 3 — breadth toward north-star
9. **Meta Upgrades 21 → 40**, **Enemies 30 → 48**, **Equipment items 159 → 240**,
   **Achievements 17 → 40** — steady fill; lowest per-entry risk, so batch these large.

> Waves are dependency order, not a hard gate — a designer can pull any 🟢/🟡 batch forward. The only
> real dependencies are **Towers/Heroes ⇐ B1** and **Campaign events ⇐ seam**.

---

## Parallelism (per CLAUDE.md discipline decomposition)

- **safe-parallel** (no shared state, different files/arrays): Bosses, Biomes, Gene Cards, Equipment
  Sets, Doctrines, Meta Upgrades, Achievements — fan out freely, one owner per array.
- **dependent**: Towers, Heroes, Enemies (want B1 first); Campaign events (want the seam first).
- **integration**: B1 de-union and the campaign-event seam — these wire the pieces and should land in
  a quiet window, verified alone, before the batches that ride on them.

**Conflict rule:** never assign two batches to the *same* array in one wave (e.g. two card batches
both appending `CARD_POOL`) — partition by category so each push touches one source.

---

## Design-before-content briefs (so content isn't ad hoc)

Every new entry must trace to a design axis, per CLAUDE.md. The **canonical design spec** for each
category is its own doc (below) — read it before authoring; this is only the one-line acceptance axis.

| Category | New entry must add… | Canonical spec |
|---|---|---|
| Bosses | a new chassis **or** a novel module/phase script — a new *fight*, not a bigger HP bar | `BOSS-DESIGN.md` |
| Towers | a new niche or `TowerFiring` behavior — a new *answer to a threat* | `TOWERS.md`, `TOWER-CODEX.md` |
| Heroes | a distinct ability kit + role — a new *playstyle* | `HEROES.md`, `HERO-FRAMEWORK.md` |
| Biomes | a modifier + hazard + roster/chassis bias that *reshapes the board* | `BIOMES.md` |
| Equipment Sets | a 2pc/4pc synergy that *enables a build*, not a stat stack | `EQUIPMENT.md`, `EQUIPMENT-PHILOSOPHY.md` |
| Campaign events | a special encounter with a *choice or twist* | `STAGES.md`, `CAMPAIGN.md` |
| Gene Cards | a new synergy axis (new field ⇒ new Power weight) | `CARDS.md` |
| Meta Upgrades | a permanent knob on an *underserved* stat | `PROGRESSION.md` |

Capture cost/role/counter alongside each addition (design note in the def or the category's spec doc).

---

## Acceptance criteria — every content batch

A batch is **done** only when all pass:

```
npm run typecheck   # union⇄def, effect fields, exhaustive Records
npm test            # content-integrity (drift + census), per-def validators, power-coverage, golden
npm run build       # static dist/
```

Plus, per batch:

1. **Raise the census minimum** in `content-integrity.test.ts` to the new count (guards accidental loss).
2. **Power-coverage**: any new strength field is weighted (`POWER_RELEVANT_FIELDS` + `FIELD_WEIGHT`).
3. **Golden stays green** — new content must not shift the deterministic golden run; if a batch
   *intentionally* changes balance, regenerate goldens in that same batch and say so.
4. **Gameplay smoke** for anything that appears in a run (towers/heroes/bosses/enemies/biomes/events):
   launch a build and confirm it renders/behaves — a green test proves it *runs*, not that it's *fun*.
5. **Collection codex** auto-lists the new entry (0-file) — spot-check it appears.

---

## Explicit scope

- **Do not implement content yet.** This document is the plan; implementation is follow-up work.
- **No new major frameworks.** The only sanctioned pipeline work is the two small seams in Wave 0,
  and only when their dependent batch is next.
- **One category-batch per push**, verified green, census raised — never a mega-commit of everything.
