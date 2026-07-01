# RUN-IDENTITY.md — every run develops a memorable identity

**Problem.** Runs blur together. Every run of a mode is the same *shape*, varied only by smooth,
predictable axes — geometric scaling, biome rotation on a fixed period, a slowly-ramping elite
chance. Nothing discrete, surprising, or run-defining ever happens, so no run earns an identity.
Players never say *"I remember the run where…"*.

**Solution.** A deterministic **Run Identity** layer: a seed-derived **Run Plan** that schedules
discrete **Run Events** (per-wave beats) and an optional run-wide **Anomaly** (the headline) on top
of the existing base curve. Rare, telegraphed, and impactful — so a run gets a fingerprint you
remember, while staying fully deterministic and replayable.

---

## 1. Determinism, replayability, golden-safety (the invariants)

- **Pure + seeded.** `generateRunPlan(seed, ctx)` is a pure function → same seed ⇒ same plan ⇒ same
  run. A replay/lockstep layer only needs the seed. Uses a **dedicated RNG stream** (`Rng(seed ^ K)`),
  never `Game.rng`, so the base waves/spawns/economy are **unperturbed** — events *layer on*, they
  don't reshuffle the run.
- **Golden-safe with NO re-baseline.** The plan is **empty in Stage mode** (`mode === 'stage'`), the
  golden path. Stage stays byte-identical — exactly how biomes/difficulty/doctrines/branches already
  gate to identity. Run Identity applies to **Campaign + Endless**, the replayable modes where "blur"
  is the real problem and where every listed example (invasions, objectives, biome events) belongs.
- **Fresh seed each play ⇒ variety even on a fixed stage.** Campaign stages are deterministic in
  *(stage, difficulty)* (same waves every replay), but the Game's run *seed* is fresh each play, so
  the Run Plan differs — replaying stage 5 now feels different every time.

---

## 2. Architecture (data-driven, one row per beat)

`src/core/runEvents.ts` — pure, no sim/DOM imports (only `EnemyKind` + `RunMode` types):

- **`WaveEffect`** — the declarative mechanical payload, expressed through knobs the sim *already*
  has, so integration is a tiny transform (no new spawn/economy code):
  `hpMult`, `bountyMult`, `eliteAll`, `eliteChance`, `countMult`, `injectKind`+`injectCount`,
  `bossTier`.
- **`RunEventDef`** (per-wave beat) — `{ id, name, desc, kind, weight, minWave, modes?, effect }`.
  The catalog `RUN_EVENTS` spans the brief's categories: **Corrupted Wave, Elite Invasion, Rare
  Invasion, Evolution Wave, Resource Boom, Mini-Boss Ambush, Unexpected Boss, Endless Swarm**.
- **`RunAnomalyDef`** (run-wide headline) — `{ id, name, tagline, desc, weight, everyWave }`; its
  `everyWave` effect folds into *every* wave (mildly). `RUN_ANOMALIES`: **Blood Moon, Gold Rush,
  The Swarm, Ancient Awakening, Feral Surge, Dead Calm**. This is the strongest "the ___ run" lever.
- **`generateRunPlan(seed, ctx) → RunPlan`** — picks (sometimes) one Anomaly, then walks candidate
  waves with a **cooldown** (no back-to-back) and a **budget** (few events per run) rolling weighted,
  eligible events; `Rare Invasion` picks an **out-of-biome** kind for genuine surprise. Returns
  `{ anomaly, events[], byWave, headline }`.
- **`planForWave(plan, wave) → { event, effect }`** — merges the wave's event with the anomaly's
  `everyWave` (mults multiply, chances max, flags OR, counts sum). The Game applies it.

### Sim integration (surgical — `game.ts`)
- Constructor: `this.runPlan = mode==='stage' ? null : generateRunPlan(seed, …)` + a dedicated
  `runEventRng`.
- `startWave` / `startEndlessWave`: after the spawn queue is scheduled, call `applyRunEvent(wave)` —
  a self-contained method that transforms the local `spawnQueue` (buff hp/bounty, promote elites,
  inflate counts, inject a group) and/or spawns an **ambush boss** via the existing `assembleBoss` +
  `spawnBoss`. It sets `activeRunEvent` for the HUD telegraph.
- Snapshot: `runEvent?: { name, desc, kind }` → the HUD shows a telegraph banner (like the biome
  chip). Memorability requires the player to *see* the beat land.

---

## 3. Why this maximizes memorable moments (not random noise)

- **Rare + telegraphed + impactful.** Events are budgeted (a run has a few, not a stream) and named
  on screen, so each is an *event*, not background noise. An Anomaly gives the *whole* run a one-line
  identity ("the Blood Moon run").
- **Surprise within fairness.** Effects reuse balanced knobs and skew **rewarding** (Corrupted &
  Boom raise bounty; invasions drop more) so a beat is a spike of *tension + payoff*, not a
  difficulty cliff. Numbers are modest first-pass tunables in one table.
- **Composable identity.** Anomaly × per-wave events combine into a huge space of run fingerprints
  from a small data catalog — e.g. a Gold-Rush run that hits an Unexpected Boss on wave 7.

---

## 4. Extension points (each remaining category = a data row)

The framework is the seam; these plug in without new engine code:

- **Weather / Environmental mutation** → a `RunAnomalyDef` (run-wide `everyWave`) — Dead Calm/Feral
  Surge are the first two; a future one can carry a tower/vision knob once that field exists.
- **Biome event** → a `RunEventDef` gated by `biome` (add an optional `biome?: string` predicate).
- **Special merchant / Hero event / Unique card-draft event** → a new `kind` + a `WaveEffect`-sibling
  payload (an inter-wave offer / draft override) + a small handler at the draft/prep seam. Catalogued
  here now as the documented next step; the plan generator + telegraph already carry them.
- **Unique campaign objectives / Randomized secondary objectives** → an `objective` on the Run Plan
  (or `StageConfig`) with a tracked predicate + bonus reward at `finishRun`.

---

## 5. Known limitations (first pass)

- Per-enemy **speed** is set at spawn (mode-gated); `WaveEffect` therefore expresses "feral/evolution"
  via `hpMult` + elite promotion rather than raw speed. A `speedMult` spawn hook is the noted follow-up.
- **Merchant / hero / draft-event / objective** categories are framed here and carried by the plan +
  telegraph, but their *interactive* handlers are the documented next increment — the per-wave beat
  system (the memorable core) ships first.
- Effects are modest first-pass tunables (one table) — a balance pass tunes magnitudes/weights later.
