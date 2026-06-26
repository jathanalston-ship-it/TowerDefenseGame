# WAVES.md — Wave Composer Framework

Every wave in the game is assembled by one data-driven framework
(`src/core/wavecomposer.ts`). It unifies the three wave sources (Classic, Stage,
Endless) behind a single composition model: a wave is a list of configurable
**groups**, optionally shaped by a **theme** and augmented with **elite** and
**boss** injections, then scaled by a per-mode **difficulty curve**. Adding a
theme, an injection, or a whole scripted encounter is a data entry — no engine
change.

> **Status:** ✅ IMPLEMENTED. Replaces the old hard-coded `WAVES` array. Current
> gameplay is preserved: the Classic campaign is byte-identical (now a *scripted
> encounter*), and the Stage/Endless procedural rolls make the same seeded RNG
> calls as before (byte-identical seeds).

---

## 1. The model

```
                       ┌── SCRIPTED ──────────────┐
   source ────────────►│ exact authored WaveDef[] │── (Classic campaign,
                       └──────────────────────────┘     future set-pieces)
                       ┌── PROCEDURAL ────────────┐
   pool + budget ─────►│ composeProceduralWave()  │
   + theme ───────────►│   theme-bias the pool    │
   + elite injection ─►│   roll to budget         │── WaveGroup[]
   + boss injection ──►│   inject elites + boss    │
                       └──────────────────────────┘
                                  │
   waveDifficulty(mode,index) ────┴──► hpMult / bountyMult  (spawn-time scaling)
```

### `WaveGroup` — the atom

```ts
interface WaveGroup {
  kind: EnemyKind;
  count: number;
  spacing: number; // seconds between spawns in the group
  delay: number;   // seconds before the group starts
  elite?: boolean; // spawn as a buffed "champion"
}
type WaveDef = WaveGroup[];
```

The spawner (`Game.startWave`) flattens groups into a time-sorted spawn queue, so
`delay`/`spacing` fully control pacing.

---

## 2. Enemy groups & spawn timing

A wave is just `WaveGroup[]`. Author them directly (scripted) or let the composer
roll them from a **threat budget**: each spawnable enemy has a `THREAT_COST`, and
the roll spends a budget picking weighted kinds until it's exhausted. Cheap kinds
(<2 cost) spawn tight; expensive kinds spawn spaced — both configurable via the
`fastSpacing` / `slowSpacing` / `delayStep` options.

---

## 3. Wave themes

A **theme** biases composition without new code (`WAVE_THEMES`):

```ts
interface WaveTheme {
  id: string; name: string;
  weightBias: Partial<Record<EnemyKind, number>>; // ×multiplier on pool weights
  budgetScale: number;                            // spend more/less budget
}
```

Shipped themes: `neutral` (identity — the default that preserves current
behavior), `swarm`, `armored`, `ranged`, `brood`. `neutral` multiplies every
weight by 1, so themed and un-themed rolls share one code path. **Add a theme:**
one `WAVE_THEMES` entry. **Use it:** pass `theme` to `composeProceduralWave`.

---

## 4. Elite injections

An **elite** is a normal enemy spawned with buffed stats (`ELITE` in `config.ts`:
×2.4 HP, ×1.5 damage, ×2.5 bounty) and a gold champion halo in the renderer.

`injectElites(groups, { count })` splits `count` of the costliest group into an
`elite: true` group (deterministic — no RNG, so it never desyncs a seed). It is
**off by default in every live mode** (current gameplay preserved); enable it by
passing an `elite` injection to `composeProceduralWave`. The spawn pipeline
(`Game.makeEnemyAt`) and renderer already handle the flag.

---

## 5. Boss injections

A **boss** is any enemy flagged `isBoss` (`ENEMIES.md`). `BossInjection`
`{ kind, count, spacing, delay }` is appended as the wave's trailing group; the
*caller* decides when (it has the wave/stage context). Current rules, preserved:

- **Stage:** a Brood Tyrant on the final wave of stages ≥ 3.
- **Endless:** a Tyrant surge every 5th wave, growing with depth.

`isBossWave(groups)` flags a wave for HUD/renderer set-piece treatment.

---

## 6. Difficulty scaling

`waveDifficulty(mode, index, stageNumber) → { hpMult, bountyMult }` owns the
per-mode ramp (the canonical curves):

| Mode | hpMult | bountyMult |
|---|---|---|
| Classic | `1 + 0.12·(index−1)` | `1 + 0.05·(index−1)` |
| Stage | `1 + 0.06·(index−1) + 0.05·(stage−1)` | `1 + 0.03·(index−1)` |
| Endless | `1 + 0.06·(index−1)` | `1 + 0.02·(index−1)` |

`Game.waveScaling` folds in the stage's env-modifier HP multiplier on top.

---

## 7. Scripted encounters (future-proofing)

Hand-authored, exact waves live in `SCRIPTED_ENCOUNTERS` (a registry of
`WaveDef[]`). The **Classic campaign** (`CLASSIC_CAMPAIGN`) is the first entry —
12 authored waves that introduce each archetype then remix them. Future story
beats or boss set-pieces are new registry entries, referenced by id. This is how
"future scripted encounters" plug in: author the `WaveDef[]`, register it, point a
mode/stage at it — no engine change.

---

## 8. Adding content (cheat sheet)

| Want | Do |
|---|---|
| A new scripted wave/campaign | Add a `WaveDef[]` to `SCRIPTED_ENCOUNTERS` |
| A composition style | Add a `WAVE_THEMES` entry; pass it as `theme` |
| Elites in a wave | Pass `elite: { count }` to `composeProceduralWave` |
| A boss moment | Pass `boss: { kind, count, spacing, delay }` |
| Retune a mode's ramp | Edit the curve in `waveDifficulty` |
| A new spawnable enemy in rolls | Give it a `THREAT_COST` (see `ENEMIES.md`) |

Verify with `npm test` (the composer, determinism, and stage suites) and
`npm run dev` to watch a wave live.
