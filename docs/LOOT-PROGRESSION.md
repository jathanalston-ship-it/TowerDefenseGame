# Progression-aware loot

Drops should feel _consistently_ rewarding. Two failure modes to avoid:

- **Droughts** — long stretches where "nothing happened."
- **Spikes** — an accidental flood of power that trivializes the next stretch.

The loot system reads the player's **account strength** and quietly steers rewards to smooth both
out. It composes with the existing **pity** system (`core/loot.ts` / `core/lootQueue.ts`), which
already guarantees a tier after enough dry opens:

| Mechanism | Stops a drought by… | Where |
|---|---|---|
| **Pity** (soft ceiling → hard guarantee) | …TIME (opens since a tier last hit) | `loot.ts` `rollRarity` + `PityState` |
| **Catch-up weighting** | …NEED (your power vs your depth) | `core/progressionLoot.ts` → `RollOpts.bias` |
| **Duplicate protection** | …RELEVANCE (avoid dead dupes) | `progressionLoot.dupeWeights` |

Everything is **subtle and invisible** — no pity percentages, no "pity is X% full" UI. The player
just notices that runs keep paying off.

Implementation: `src/core/progressionLoot.ts` (pure) → `meta.lootBiasFor(save)` → threaded into
`addProgress` (live `syncRunLoot` + run-end `finishRun`).

### Fill toast (the "you earned a container" moment)

When the LIVE meter completes a container, `meta.syncRunLoot` emits the `lootContainerEarned`
gameEvent (rarity). `ui/LootToaster.tsx` (mounted once at the app root) enqueues it and slides in a
compact toast — *"Bio-Container Acquired · &lt;Rarity&gt; Container Earned · Open it from the Genetic
Vault"* — glowing in the container's rarity color (`--rc`), with an animated icon and a rarity-scaled
audio cue. It **never interrupts play** (a pointer-through corner overlay) and **never overlaps**: the
toaster renders only the FRONT of its queue, so a burst of completions plays out one at a time and
auto-dismisses (`TOAST_MS`). Hovering or keyboard focus pauses expiry; leaving grants a fresh reading interval. A labeled dismiss button advances keyboard focus through queued notices and restores the prior control after the last notice. Reading holds do not replay the reward cue; the entry animation remains visible until dismissal. `meta.debugAddLootPoints` emits the same event, so the toast is testable
from the debug panel. Golden-safe: emission is gated on a listener, so the sim/headless path is untouched.

---

## Inputs

The design references these account signals (all already in the save):

- **Power Score** (`meta.power().mult`) — the universal strength multiple (see `POWER-SCORE.md`).
- **Campaign progress** (deepest cleared stage) and **Highest Infinite wave** — the two frontiers.
- **Tower Stars / Hero Stars / Equipment** — folded into Power Score, so they enter via it.
- **Prestige** — also folded into Power Score (the P bucket).
- **Difficulty** — a direct tilt toward richer drops on harder tracks.

## How catch-up works

1. `expectedPower(campaignStage, bestWave)` — the power the game _expects_ for your depth (a soft,
   smooth target: `1 + 0.02 × max(stage, wave/2)`).
2. `catchupFactor(expected, actual, difficultyTier)` — the ratio `expected / actual`, tilted by
   difficulty, **clamped to `[0.85, 1.6]`**:
   - **behind** (weak gear for your depth) → factor > 1 → higher rarities weighted up.
   - **ahead** (over-geared) → factor < 1 → rewards normalize back down.
   - **on par / fresh** → factor = 1 → the weight table is **untouched** (a true no-op).
3. `rarityBias(idsAscending, factor)` — turns the factor into a per-tier weight multiplier: commons
   ×f⁻¹, mid ×1, high ×f, ×f² … The roll (`rollRarity`) normalizes weights, so this shifts the
   _distribution_ without ever inventing probability.

**Expected upgrade window.** With catch-up on, a behind player's rare+ mass rises by up to ~60%
per bad-luck stretch while pity still backstops the worst case; an ahead player's excess is trimmed
toward commons. Net effect: meaningful upgrades arrive on a tighter, self-correcting cadence
instead of clustering or vanishing.

## Duplicate protection / near-upgrades

When choosing _which_ item drops, `dupeWeights(ownedCounts)` shrinks an option's pick weight with
ownership (`1 / (1 + 0.6·count)`), so an un-owned or scarce option is favored — a drop is more
likely to be a **near-upgrade** than a dead duplicate. (The item-selection call site supplies the
owned counts; the weights are pure.)

---

## Balancing assumptions

- **Golden-safe / no-op at baseline.** A fresh or on-par account yields an all-ones bias, so the
  drop stream is byte-identical to the un-biased system. Only players who are meaningfully behind
  or ahead see any steering, and only within the clamp.
- **Bounded steering.** The `[0.85, 1.6]` clamp guarantees the effect is a nudge, never a jackpot:
  catch-up can't manufacture a spike, and normalization can't punish success into a drought.
- **Pity remains the floor.** Catch-up biases odds; pity still hard-guarantees a tier after its
  ceiling, so even a wildly over-geared player is never fully starved of high tiers.
- **Difficulty pays.** Each tier above Standard adds `+0.06` to the factor — a small, honest
  premium for harder play, stacked before the clamp.
- **Tunables:** `PROG_LOOT` (`expectPerStage`, `catchupFloor/Cap`, `difficultyStep`, `dupeK`).
  Changing them re-tunes cadence without touching any call site.

## Limitations / future

- **Drought-by-count** (consecutive opens with no _account power gain_) is currently served by the
  existing per-tier **pity** counters rather than a separate "runs since upgrade" ledger; a
  dedicated ledger could make the "recently upgraded → normalize" beat sharper. The hook
  (`RollOpts.bias`) already supports feeding it in.
- **Item-level catch-up** (biasing equipment slots you're weakest in) reuses `dupeWeights`; wiring
  it into the equipment drop roll is a localized follow-up.
