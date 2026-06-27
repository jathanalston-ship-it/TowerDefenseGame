# GAME-STATE.md — What Exists & Its Status

The canonical map of **what is actually built** vs **what is designed but not yet
built**. Every other doc says *what a system should be*; this says *whether it
exists today and where the code is*. Per `CLAUDE.md` and `ROADMAP.md §6`, this is
updated whenever a system lands.

> **Legend:** ✅ implemented & verified · 🟡 partial (a working subset of the
> designed system) · ⚪ designed only (spec exists, no code yet).

> **Big picture:** the game is a **playable vertical slice** — three modes, a full
> combat/status/reaction core, procedural stages + biomes, a roguelite card draft,
> a multi-currency meta economy with four upgrade tracks, and a collection/codex
> motivation layer — all on a deterministic sim core with hardened saves. The
> grand long-term design (`PROGRESSION.md`, `ROADMAP.md` M9–M14: gear, hybrids,
> the six prestige layers, Ω-tiers) is **designed, not yet built**.

---

## Tech stack & entry points

- **React 18 + TypeScript (strict) + Vite**, static SPA (Cloudflare Pages). Canvas
  2D rendering; no backend; browser-local saves.
- **Deterministic sim core** in `src/core/` — no React/DOM, no `Math.random`
  (seeded `Rng`, mulberry32). React is HUD/menus only.
- Entry: `src/main.tsx` → `src/ui/App.tsx`. Loop/render: `src/ui/GameView.tsx` →
  `src/core/game.ts` + `src/render/renderer.ts`.
- Commands: `npm run dev | build | preview | test | typecheck` (see `CLAUDE.md`).

---

## Systems status

| System | Status | Source | Spec doc |
|---|---|---|---|
| Deterministic sim loop (fixed timestep) | ✅ | `core/game.ts`, `core/rng.ts` | ARCHITECTURE |
| Three game modes (Classic / Stage / Endless) | ✅ | `core/game.ts`, `ui/ModePanel.tsx` | STAGES |
| Towers (3: Needle / Mortar / Reactor) | ✅ | `config.ts TOWER_DEFS`, `game.ts` | TOWERS |
| Heroes (2: Ravager · Bulwark) + selection | 🟡 | `config.ts HEROES`, `ui/HeroPanel.tsx`, `state/heroStore.ts` | HEROES |
| Enemies (11 kinds, composed from archetypes) | ✅ | `core/archetypes.ts`, `config.ts ENEMY_DEFS` | ENEMIES |
| Bosses — phased, weakness, abilities, silhouettes (12) | ✅ | `core/bosses.ts`, `game.ts` (`bossSystem`), `render/renderer.ts` | BOSSES |
| Status + SHRED reaction engine | ✅ | `game.ts`, `config.ts STATUS` | DESIGN |
| Wave Composer (themes/elites/bosses/scripted) | ✅ | `core/wavecomposer.ts` | WAVES |
| Elites (buffed champions) | ✅ | `wavecomposer.ts`, `config.ts ELITE` | WAVES |
| Gene Cards — roguelite draft (30) | ✅ | `core/cards.ts`, `ui/DraftModal.tsx` | CARDS |
| Procedural stage generation | ✅ | `core/stage.ts` | STAGES |
| Biomes (5, data-driven theming) | ✅ | `core/biomes.ts`, `render/renderer.ts` | STAGES |
| Endless mode + leaderboard score | ✅ | `core/game.ts`, `core/stage.ts` | STAGES |
| Multi-currency economy (4 currencies) | ✅ | `state/meta.ts`, `save/saveStore.ts` | ECONOMY |
| Meta upgrades (13 nodes / 4 tracks) | ✅ | `config.ts *_UPGRADES`, `ui/MetaShop.tsx` | ECONOMY, BALANCE-LOG |
| Tower Stars (per-unit, ★0–5, mechanic unlocks) | 🟡 | `config.ts STAR_TRACKS`, `ui/StarPanel.tsx` | PROGRESSION-LOOP |
| Genome Shards (Star currency, from loot + runs) | 🟡 | `state/meta.ts`, `config.ts LOOT_RARITY` | PROGRESSION-LOOP |
| Prestige track (Catalyst sink) | 🟡 | `config.ts PRESTIGE_UPGRADES` | BALANCE-LOG |
| Codex / collection (enemies·biomes·cards) | ✅ | `state/meta.ts`, `ui/Codex.tsx` | COLLECTION |
| Persistent Loot Meter (→ loot boxes → gear) | 🟡 | `config.ts LOOT`, `state/meta.ts`, `ui/LootMeter.tsx` | LOOTBOX |
| Hero gear (Weapon/Armor/Relic, affix rolls) | 🟡 | `config.ts AFFIX_POOL`, `state/meta.ts`, `ui/LoadoutPanel.tsx` | EQUIPMENT |
| Infinite Mastery (uncapped per-unit XP, log curve) | 🟡 | `config.ts MASTERY`, `state/meta.ts`, `ui/MasteryPanel.tsx` | PROGRESSION |
| Automatic wave flow + Build Phase | ✅ | `game.ts` (buildCountdown), `ui/BuildBanner.tsx` | WAVES |
| Achievements (16 / 5 chains) + titles | ✅ | `core/achievements.ts` | COLLECTION |
| Save: versioned + auto-migrated, checksummed, backups | ✅ | `save/saveStore.ts` (schema v6, `MIGRATIONS`) | ARCHITECTURE §15.2 |
| HUD / menus / results | ✅ | `src/ui/*` | HUD |
| Audio — procedural SFX + music bed (no assets) | 🟡 | `src/audio/*`, `ui/AudioControls.tsx` | GAME-FEEL |
| Internal balancing tools (dev-only) | ✅ | `ui/DebugPanel.tsx`, `debug/debug.ts` | — |
| Gear **depth** (sets, reforge/upgrade, bigger affix pools) | ⚪ | — | EQUIPMENT, PROGRESSION |
| Class levels · per-hero loadouts · mastery perks | ⚪ | — | PROGRESSION |
| Prestige layers (Molt → Omega), Ω-tiers | ⚪ | — | PROGRESSION, LIVING-HIVE |
| Hive Tree / idle / loot boxes | ⚪ | — | LIVING-HIVE, LOOTBOX |

---

## Content inventory (implemented)

| Content | Count | Notes |
|---|---|---|
| Towers | 3 | Needle (Kinetic), Mortar (Caustic), Reactor (Vital) |
| Heroes | 2 | Ravager (Kinetic, Apex Leap) · Bulwark (Vital, Seismic Slam); distinct stats + abilities, class-tinted, menu picker |
| Enemies | 11 | runner, brute, tyrant, rusher, tank, flyer, burrower, splitter, spitter, mender, warden |
| Bosses | 12 | phased build-checks across 5 faction-biomes; 9 ability verbs, 7 silhouette forms, 6 modifiers |
| Gene Cards | 30 | common + rare; ~12 behavioral |
| Biomes | 5 | wasteland, corporate, marsh, bone, machine |
| Authored waves | 12 | Classic/Stage; Endless waves are procedural |
| Meta upgrades | 13 | 4 Core · 3 Mastery · 3 Equipment · 3 Prestige |
| Gear affixes | 13 | 3 Weapon · 5 Armor · 5 Relic (drop from loot boxes) |
| Currencies | 4 | Shards · Essence · Components · Catalyst |
| Achievements | 16 | across 5 chains; 6 grant titles |

All content is **data-driven** — adding more is a config entry, not engine code
(see `CONTENT-GUIDE.md`).

---

## Economy & progression (as built)

Per-mode reward tables route distinct currencies to distinct sinks so each mode
pulls a different playstyle (full formulas in `ECONOMY.md`, tuning rationale in
`BALANCE-LOG.md`):

- **Classic** → Shards → Core track.
- **Stage** → Shards + Components → Core + Equipment tracks.
- **Endless** → Essence + Catalyst → Mastery + Prestige tracks.

Every currency has a sink; every main mode advances ≥2 tracks. The **Codex /
achievements / titles** layer adds long-term *motivation* goals that grant **no
power** (`COLLECTION.md`).

Beyond the four upgrade tracks, three **per-unit** progression layers now ship as
v1 subsets: **Tower Stars** (capped ★-ladders), **Hero Gear** (loot-box affix items),
and **Infinite Mastery** (uncapped per-unit XP). The larger permanent design still
ahead — class levels, per-hero loadouts, gear sets/reforge, and the six nested
prestige layers — is specified in `PROGRESSION.md` but not yet built.

---

## Tests (guards)

`npm test` (Vitest) — all green. Coverage of note:

- **Determinism** — fixed seed + strategy reproduces identically (`sim.test.ts`).
- **SHRED reaction** correctness (`sim.test.ts`).
- **Game modes** — a generated Stage plays to a finite, deterministic end.
- **Stage generation** determinism (`stage.test.ts`).
- **Economy / progression** — per-mode currencies, currency-scoped purchases,
  Catalyst→Prestige sink (`state/meta.test.ts`).
- **Hero gear** — drops at every rarity, equip/unequip/dismantle, run-fold of
  equipped affixes, loot-box drops never voided (`state/meta.test.ts`, `sim.test.ts`).
- **Infinite Mastery** — uncapped + monotonic level curve, diminishing (logarithmic)
  damage, XP awarded to fielded units, run-fold of mastery (`state/meta.test.ts`).
- **Audio** — registry voices well-formed, prefs clamp/parse/persist, and the manager
  is a safe no-op with no Web Audio (the Node test contract) (`audio/audio.test.ts`).
- **Codex & achievements** — discovery union/dedupe, new-only unlock reporting,
  title earning (`meta.test.ts`); threshold + title logic (`achievements.test.ts`).
- **Bosses** — roster contracts (valid phases/abilities/silhouettes), phase
  transitions, weakness/adaptive damage bias, modifiers, deterministic selection
  (`bosses.test.ts`).
- **Content contracts** — record keys, HERO alias, `isBoss`, unique ids
  (`content.test.ts`).
- **Saves** — versioning, checksums, normalization, recovery (`saveStore.test.ts`).

---

## Documentation index

**Implemented-system docs (kept in sync with code):** `GAME-STATE` (this) ·
`ECONOMY` · `BALANCE-LOG` · `COLLECTION` · `CONTENT-GUIDE` · `ARCHITECTURE` ·
`DEPLOYMENT`.

**Design corpus (forward-looking specs; "designed" unless this file says ✅):**
`DESIGN` · `PROGRESSION` · `ROADMAP` · `STAGES` · `TOWERS` · `HEROES` · `ENEMIES`
· `BOSSES` (✅) · `CARDS` · `EQUIPMENT` · `WAVES` (✅ framework) · `LIVING-HIVE` · `LOOTBOX`.

**Craft / quality docs:** `GAME-FEEL` · `HUD` · `READABILITY` · `STYLE-GUIDE` ·
`VISUAL-AUDIT` · `PLACEHOLDER-ART` · `PLAYTEST-CHECKLIST`.

When in doubt about whether something exists, **this file wins** over the design
docs.
