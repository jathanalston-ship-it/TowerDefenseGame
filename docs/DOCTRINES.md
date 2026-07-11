# DOCTRINES — exclusive run-start commitments

> Data + rank model: `src/core/doctrines.ts` · Gating: `src/save/derive.ts` (`isDoctrineUnlocked`)
> · Economy: `src/core/difficultyDirector.ts` (`doctrineEconomy`, `hazardRating`) · Ledgers:
> `src/state/stats.ts` · Picker: `src/ui/components/DoctrinePicker.tsx` · Tests:
> `src/core/doctrines.test.ts`. Supersedes the summary in `MODE-IDENTITY.md` §doctrines.

You pick exactly **one** doctrine at run start and it reshapes a rule for the whole run.
Exclusivity is the point: it forces divergent builds instead of "stack every multiplier".
Everything is data — a new doctrine is one `DOCTRINES` row, and every terminal, gate, rank,
hazard rating, and HUD chip picks it up with zero screen edits.

## 1. Three families (19 pickable + none)

- **BUILD** (`family: 'build'`, effects only — never touches the world): Glass ◇ (day one),
  Swarm ⁂ (st.2), Ascetic △ (st.3), **Overclock ⚡** (st.5 — fire rate ×1.35, biomass ×0.75),
  Cascade ⧉ (st.6), **Bastion ⛨** (st.7 — integrity ×1.6 +2/wave, tower dmg ×0.85),
  Resonance ◈ (st.8), **Vanguard ✥** (st.9 — hero dmg ×1.4, cooldowns ×0.8, tower dmg ×0.85).
- **PROTOCOLS** (`family: 'protocol'`, `DoctrineWarp` — reshape the ENEMY WORLD, pay run-end
  premiums): Swarm Protocol ⁙ (st.10), Titan ⬢ (st.12), Biological Frenzy ≋ (st.14),
  Experimental Mutation ⌬ (st.16), Adaptive Evolution ∿ (st.18), **Famine ◌** (st.20 — bounty
  ×0.55, rewards ×1.6), Corrupted Genome ☣ (st.22), **Velocity ≫** (st.25 — speed ×1.6, spawns
  ×0.8, rewards ×1.35), **Overmind ◉** (st.30 — the graduate exam: HP ×1.3, 12% elites, faster
  scaling AND movement, +2 Essence/wave, rewards ×1.45).
- **PACTS** (`family: 'pact'`, effects **and** warp — a sacrifice AND a payoff, both mandatory,
  validator-enforced): **Pact of Blood ⚉** (st.15 — integrity ×0.7 / bounty ×1.5, rewards ×1.2),
  **Predator's Wager ⌖** (st.26 — tower dmg ×1.25 / 18% elites, rewards ×1.3).

`DoctrineWarp` fields: `countMult` (queue inflate/thin), `hpMult`, `bountyMult` (drought <1 is
rated by hazard), `damageMult`, `speedMult`, `eliteChance`, `scalingRateMult` (endless ramp),
`rewardMult`, `essencePerWave`. Warps ride the same deterministic queue transforms as run
events; `none` draws zero warp RNG — the golden run stays byte-identical (test-pinned).

## 2. Gates — anticipation, not absence

Each doctrine names a campaign `unlockStage` (0 = day one). `isDoctrineUnlocked(save, def)`
unseals it at that frontier, and **grandfathers** any account whose `doctrineRuns` ledger shows
it was ever used (a gate added later never takes an option away). The picker renders sealed
cards with the gate and live progress ("Stage 20 · 14/20") — locked means *visible and coming*.

## 3. Mastery ranks — commitment pays

Per-doctrine ledgers accrue on run settle (`stats.ts`): `doctrineRuns`, `doctrineWins` (won
runs), `doctrineBestWave` (deepest wave, any mode). `doctrineRank(id, wins, bestWave)` derives
rank 0–4 (Unproven → Initiate → Adept → Zealot → Exemplar) from **whichever signal is further**
— wins `1/3/8/18` **or** best wave `12/20/32/50` — so campaign clearers and Infinite divers both
rank. `'none'` never ranks.

Rank pays `+4 %` run-end rewards per rank (cap +16 %) **on that doctrine's own lane**:
`doctrineEconomy(id, rank)` multiplies the doctrine `rewardMult` by `doctrineRankBonus(rank)`;
`meta.finishRun` reads the PRE-run ledgers (this run settles after). Essence payouts are
rank-free. Rank 0 is an exact ×1 identity — golden-safe.

## 4. Hazard rating

`hazardRating(difficulty, doctrine)` composes enemy load (HP × damage × count>1 × speed ×
scaling) **plus** two doctrine axes: economy droughts (`bountyMult < 1` rates like a load rise)
and elite pressure (`eliteChance`). The Infinite terminal's skulls, the picker's per-card
diamonds, and any future mode picker read the same number.

## 5. Surfaces

- **`DoctrinePicker`** (`ui/components/`) — THE shared picker: family-grouped cards, lock
  seals, rank pips (with next-rank tooltip), hazard at the selected difficulty, effect/warp
  readout lines (`doctrineLines`). `compact` renders the tighter Command Center variant.
  Used by: InfiniteScreen (full), CommandCenter Mission Control (collapsible field → compact).
- **Run HUD** — the active doctrine rides the wave module's chip row (`wm-doc`).
- **Results** — the commitment reads back under the verdict headline (`rr-doctrine`).

## 6. Adding content (the workflows)

- **New doctrine** = one `DOCTRINES` row (id, name, blurb, icon glyph, family, unlockStage,
  effects and/or warp). The registry validator enforces family contracts (protocol ⇒ warp;
  pact ⇒ both). Nothing else anywhere — picker, gates, ranks, hazard, HUD, Results, economy
  all derive.
- **New warp axis** = one optional `DoctrineWarp` field + its one consumer seam (queue
  transform / director curve / finishRun) + a `doctrineLines` label (+ hazard axis if it's
  difficulty). Keep `none` at zero draws.
- **New rank tier** = extend `DOCTRINE_RANK_NAMES` + thresholds.

## 7. Invariants (test-pinned)

- `none` = byte-identical golden run; every warp run deterministic per seed.
- Validator: name/icon/gate on every row; protocol ⇒ warp; pact ⇒ effects + warp; build never
  warps.
- Gates: `none` at 0, ≥2 day-one doctrines, ≥3 deep gates, nothing past stage 30;
  grandfathering via `doctrineRuns`.
- Ranks: thresholds as above; `doctrineRankBonus(0) = 1`; essence rank-free; economy default
  rank 0 keeps every legacy call site's numbers.
- Ledgers: losses never advance wins, depth always counts, `'none'` is never ledgered.

## 8. Recognition layer (§collection · §achievements)

- **Doctrines codex** (`core/collection.ts`, category `doctrines`): one entry per real
  doctrine — `'none'` is no commitment and never rows. A settled run DISCOVERS it
  (`Tested`); beyond that the codex **tier IS `1 + doctrineRank`** over the stats ledgers
  (`Untested → Tested → Initiate → Adept → Zealot → Exemplar`) — one ladder shared with the
  picker, so the codex can never drift. Fresh save = zero runs = tier 0 (golden-safe).
  Category bonus stays light (Biomass ×1.04 at full mastery, powerWeight 0.02): ranks
  already pay their own run-end premium — the codex rewards BREADTH, not the same lever
  twice. Doctrine mastery thereby also feeds Collection Power + the Genome Rank collection
  axis through the existing pipes.
- **Achievements** (`state/achievements.ts`): `doctrine_first` (win under any doctrine),
  `doctrine_breadth` (5 distinct), `doctrine_families` (a Build + a Protocol + a Pact),
  `doctrine_exemplar` (max mastery rank, either signal). All registry-checked against the
  ledgers — stale/unknown ledger ids never count.

## 9. Known limitations / future hooks

- Ranks pay economy only (no in-run power) — deliberate: doctrines must stay sidegrades.
- Boss Rush and Daily run doctrine-less **by design** (DIL-recorded): the Daily is ONE
  worldwide seed — a doctrine choice would fragment the fair board — and Boss Rush's
  boss-count pacing is its own contract. The shared picker makes opting a mode in a
  two-line change if the design ever wants it; treat that as a design decision, not an
  integration gap.
