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
| Hero (Ravager) — data-driven roster of 1 | 🟡 | `config.ts HEROES`, `game.ts` | HEROES |
| Enemies (11 kinds + archetype hooks) | ✅ | `config.ts ENEMY_DEFS` | ENEMIES |
| Bosses — `isBoss` data hook (Brood Tyrant) | 🟡 | `config.ts ENEMY_DEFS` | ENEMIES |
| Status + SHRED reaction engine | ✅ | `game.ts`, `config.ts STATUS` | DESIGN |
| Gene Cards — roguelite draft (30) | ✅ | `core/cards.ts`, `ui/DraftModal.tsx` | CARDS |
| Procedural stage generation | ✅ | `core/stage.ts` | STAGES |
| Biomes (5, data-driven theming) | ✅ | `core/biomes.ts`, `render/renderer.ts` | STAGES |
| Endless mode + leaderboard score | ✅ | `core/game.ts`, `core/stage.ts` | STAGES |
| Multi-currency economy (4 currencies) | ✅ | `state/meta.ts`, `save/saveStore.ts` | ECONOMY |
| Meta upgrades (13 nodes / 4 tracks) | ✅ | `config.ts *_UPGRADES`, `ui/MetaShop.tsx` | ECONOMY, BALANCE-LOG |
| Prestige track (Catalyst sink) | 🟡 | `config.ts PRESTIGE_UPGRADES` | BALANCE-LOG |
| Codex / collection (enemies·biomes·cards) | ✅ | `state/meta.ts`, `ui/Codex.tsx` | COLLECTION |
| Achievements (16 / 5 chains) + titles | ✅ | `core/achievements.ts` | COLLECTION |
| Save: versioned, checksummed, backups | ✅ | `save/saveStore.ts`, `ui/SaveManager.tsx` | ARCHITECTURE |
| HUD / menus / results | ✅ | `src/ui/*` | HUD |
| Debug panel | ✅ | `ui/DebugPanel.tsx`, `debug/debug.ts` | — |
| Equipment **gear** (weapons/armor/relics) | ⚪ | — | EQUIPMENT, PROGRESSION |
| Tower/Hero stars · mastery · class levels | ⚪ | — | PROGRESSION |
| Prestige layers (Molt → Omega), Ω-tiers | ⚪ | — | PROGRESSION, LIVING-HIVE |
| Hive Tree / idle / loot boxes | ⚪ | — | LIVING-HIVE, LOOTBOX |

---

## Content inventory (implemented)

| Content | Count | Notes |
|---|---|---|
| Towers | 3 | Needle (Kinetic), Mortar (Caustic), Reactor (Vital) |
| Heroes | 1 | Ravager (Kinetic); roster is data-driven, selection UI pending |
| Enemies | 11 | runner, brute, tyrant, rusher, tank, flyer, burrower, splitter, spitter, mender, warden |
| Bosses | 1 | tyrant (`isBoss`) |
| Gene Cards | 30 | common + rare; ~12 behavioral |
| Biomes | 5 | wasteland, corporate, marsh, bone, machine |
| Authored waves | 12 | Classic/Stage; Endless waves are procedural |
| Meta upgrades | 13 | 4 Core · 3 Mastery · 3 Equipment · 3 Prestige |
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

The much larger permanent design — stars, infinite mastery, class levels, gear
buckets, and six nested prestige layers — is specified in `PROGRESSION.md` but
**not yet implemented**; the current four upgrade tracks are the shipped subset.

---

## Tests (guards)

`npm test` (Vitest) — all green. Coverage of note:

- **Determinism** — fixed seed + strategy reproduces identically (`sim.test.ts`).
- **SHRED reaction** correctness (`sim.test.ts`).
- **Game modes** — a generated Stage plays to a finite, deterministic end.
- **Stage generation** determinism (`stage.test.ts`).
- **Economy / progression** — per-mode currencies, currency-scoped purchases,
  Catalyst→Prestige sink (`state/meta.test.ts`).
- **Codex & achievements** — discovery union/dedupe, new-only unlock reporting,
  title earning (`meta.test.ts`); threshold + title logic (`achievements.test.ts`).
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
· `CARDS` · `EQUIPMENT` · `LIVING-HIVE` · `LOOTBOX`.

**Craft / quality docs:** `GAME-FEEL` · `HUD` · `READABILITY` · `STYLE-GUIDE` ·
`VISUAL-AUDIT` · `PLACEHOLDER-ART` · `PLAYTEST-CHECKLIST`.

When in doubt about whether something exists, **this file wins** over the design
docs.
