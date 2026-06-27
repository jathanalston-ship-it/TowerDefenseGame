# CHURN-ANALYSIS.md — "If ASSIMILATE launched on Steam Early Access tomorrow"

> A brutally honest retention teardown. Companion to `PRODUCTION-AUDIT.md`. The rule
> here: **no system gets credit for merely existing.** A loop that works in a test is
> not the same as a loop that *keeps a paying stranger playing.*

## The funnel (read this first)

Retention is a leaky funnel. Roughly, of 100 players who launch:

```
100 start ──10 min──▶ ~45 remain ──1 h──▶ ~18 ──10 h──▶ ~4 ──100 h──▶ ~0 (today)
```

Two consequences drive *urgency*:

- **Early cliffs (10 min / 1 h) affect the most absolute players** — fixing them is the
  highest-volume win and the EA-day priority. A great 100-hour endgame is worthless if
  nobody survives the first ten minutes.
- **Late cliffs (10 h / 100 h) are where the *pitch* lives.** ASSIMILATE is *sold* as
  "thousands of hours of recursive progression." If the core audience hits a wall at
  10–20 hours, the **store reviews** ("ran out of content," "shallow") will cap sales
  regardless of how good minute one feels. Both ends must be fixed; neither alone is
  enough.

`% affected` below = the estimated share of players *who reach that stage* who would be
pushed away or soured. These are designer estimates, not telemetry.

---

## ⏱ First 10 minutes — the impression cliff *(affects the MOST players)*

| # | Reason they leave | Why | % affected | Highest-leverage fix | Urgency |
|---|---|---|---|---|---|
| 1 | **No audio — combat feels dead.** | Silence reads as "cheap / unfinished"; every hit, kill, and SHRED lands with zero feedback. Single biggest felt gap. | ~75% | A small, consistent **SFX set + a music bed** (fire/hit/SHRED/death/UI/box). | **Critical** |
| 2 | **No onboarding.** Players don't grasp biomass→towers, SHRED, the autonomous hero, or 4 currencies. | The game front-loads systems and explains none in-context; a "how to play" paragraph isn't a tutorial. | ~55% | A **3–4 step first-run tutorial** (place→start→SHRED→draft) with just-in-time tips. | **Critical** |
| 3 | **Looks like a prototype.** Procedural shapes, no authored art. | "Asset-flip / Unity-default" perception kills the buy/keep decision in seconds. | ~60% | An **art pass** (sprites/VFX/biome dressing). Long pole → start the contract now. | High |
| 4 | **No "wow" in the first minute.** | Nothing spectacular happens early; SHRED is great but unexplained and easy to miss. | ~40% | Script a **guaranteed early SHRED moment** + screen-juice; lead with the hero ult. | High |
| 5 | **Readability in chaos.** 300+ same-colored dots; threats blur together. | Players can't parse what's dangerous → feels random, not strategic. | ~35% | Stronger **archetype silhouettes/colors + threat highlighting**; elite/boss emphasis. | High |
| 6 | **Cognitive overload of the HUD/economy.** Biomass + 4 currencies + loot meter + score cold. | Too many numbers with no scaffolding → "I don't know what matters." | ~30% | **Progressive disclosure** — hide meta currencies until first earned; tutorialize one at a time. | High |
| 7 | **The autonomous hero confuses.** | Players expect to control it; it wanders off. | ~20% | Clear **hero intent UI** (leash/rally telegraph) + one tutorial line. | Medium |
| 8 | **First placement is unguided.** The countdown arms on first tower, but *why* isn't shown. | A new player may stare, unsure what to do. | ~20% | Ghost-hint the first slot + "place a tower to begin." | Medium |

**Verdict:** the 10-minute experience is currently **mechanically sound but
presentationally alpha.** Audio + onboarding + a juice/art pass convert the most
players for the least work. **This is the EA-day make-or-break.**

---

## ⏱ First 1 hour — the "is there depth?" cliff

| # | Reason they leave | Why | % affected | Highest-leverage fix | Urgency |
|---|---|---|---|---|---|
| 9 | **The meta-shop is tiny (13 nodes).** "Wait, is this all the progression?" | The permanent layer is visibly shallow within an hour of buying nodes. | ~55% | **Tower Stars + Mastery** (visible, deep, per-unit) — a roadmap the player can *see*. | **Critical** |
| 10 | **Card pool repeats (30 cards).** | Players see most cards in a few runs; the draft stops surprising. | ~45% | **Card pool unlock progression** + more cards; rarity-gated reveals keep it fresh. | High |
| 11 | **Only 3 towers / 1 hero — build ceiling.** | Build diversity is exhausted fast; runs converge on the SHRED combo. | ~50% | **Towers #4–5, Heroes #2–3** + Stars/forks for build branches. | High |
| 12 | **The three modes feel the same.** | Same 3 towers + 1 hero in all of them; mode identity is thin. | ~35% | Mode-defining mechanics (stage objectives ✅ help; endless needs qualitative escalation). | Medium |
| 13 | **Nothing *new* unlocks after ~30 min.** | No new toy appears; the dopamine of "I got a new thing" is absent. | ~50% | A steady **unlock cadence** (a tower/hero/card/relic every few runs via Stars/loot). | High |
| 14 | **Loot boxes are anticlimactic.** They pay currency, soon with nothing to buy. | The chase has no *object* — it's just more of a currency you'll cap. | ~30% | **Gear as loot contents** (the build chase) + an open ceremony. | High |
| 15 | **The game gets "solved."** Once you know Fracture+Corrosion→SHRED, runs feel rote. | A single dominant strategy with no counter-pressure. | ~30% | **AI Director** + enemy variety that punishes one-note builds. | Medium |
| 16 | **No legible long-term goal.** Codex/achievements are thin (16). | The player can't see a reason to invest 50 hours. | ~40% | Surface the **progression roadmap** (Stars/Mastery/Prestige) + richer collection goals. | High |

**Verdict:** the hour-one player correctly senses the game is **wide but not deep.** The
fix is the *depth* systems (Stars → Gear → Mastery), made **visible early** so the player
believes the iceberg exists.

---

## ⏱ First 10 hours — the "why keep going?" cliff

| # | Reason they leave | Why | % affected | Highest-leverage fix | Urgency |
|---|---|---|---|---|---|
| 17 | **Everything maxes; currencies have no sink.** | All 13 nodes bought in ~tens of hours; loot pays currency you can't spend. Progression *ends.* | ~80% | **Infinite Mastery** + **Prestige Layer 1** (always something to spend toward / reset for). | **Critical** |
| 18 | **Content is exhausted.** Same 3 towers / 11 enemies / 5 biomes. | Procedural recombination isn't enough novelty at 10 h. | ~60% | Content bump (credible launch roster) + the pipeline to keep it cheap. | High |
| 19 | **Collection completed.** 16 achievements, small codex. | The completionist hook runs dry. | ~45% | **Achievement chains + codex completion rewards** + collection depth. | Medium |
| 20 | **Endless is just a bigger number.** | Depth scales HP/count but adds nothing *qualitative*; it's a leaderboard with no leaderboard. | ~45% | **Ω-tiers / season modifiers** + an actual score table. | Medium |
| 21 | **No reset-and-grow loop.** | Nothing lets the player "start over stronger" — the genre's core retention trick is missing. | ~55% | **Prestige Layer 1 (Molt).** | High |
| 22 | **Builds converge.** Without stars/gear/keystones, optimal play is identical each run. | No horizontal build space → no theorycraft. | ~50% | **Gear + Class keystones + Star forks** (re-selectable build identities). | High |

**Verdict:** today the game **structurally cannot retain a 10-hour player** — the
permanent loop terminates. This is the gap between "fun prototype" and "game." Mastery +
Prestige + Gear are non-negotiable before any "thousands of hours" claim is honest.

---

## ⏱ First 100 hours — the "1000-hour promise" cliff

| # | Reason they leave | Why | % affected | Highest-leverage fix | Urgency |
|---|---|---|---|---|---|
| 23 | **There is nothing here yet.** The game has **no content or systems** to fill 100 h today. | A player literally cannot find 100 hours of fresh progression; the pitch is unmet by ~1.5–2 orders of magnitude. | ~100% | The entire **depth stack** (Stars→Mastery→Gear→Prestige→content scale) — i.e. v0.3–v0.9. | **Critical (existential to the pitch)** |
| 24 | **No external refresh — no seasons / leaderboards / social.** | Even a deep solo game needs *renewable* goals at 100 h; authored content always runs out. | ~all | **Daily/weekly seeds → seasons → leaderboards** (the only honest infinite engine). | High |
| 25 | **No live-ops cadence / reason to return.** | After exhausting content there's no event, no patch rhythm, no "log in today." | ~all | A **content/event cadence** + the prestige-Ω procedural-season backbone. | High |

**Verdict:** the 100-hour segment is **~0 players today.** That is not a polish problem;
it is the *thesis* of the game still being unbuilt. Everything in the roadmap from
v0.3 → post-1.0 exists to manufacture this segment. **The "thousands of hours" line should
not appear in store copy until Mastery + Prestige + a real content cadence ship.**

---

## Bottom line for leadership

- **EA day is won or lost in the first 10 minutes** → **audio, onboarding, juice, art.**
  Highest-volume retention, lowest cost. Do first.
- **Reviews and refunds are decided in the first 1–10 hours** → **visible depth
  (Stars/Mastery/Gear) and a non-terminating loop (Prestige).** This is what makes the
  game *worth* the price and silences "shallow / ran out of content."
- **The pitch is honest only after the 10–100 h stack ships.** Until then, market it as
  what it is — a sharp, fast-loop roguelite TD in Early Access *building toward* deep
  progression — and **under-promise on the hours.**
- **The trap to avoid:** pouring effort into raw content counts (more towers/enemies)
  *before* the depth systems exist. That spends the budget widening a loop that still
  terminates at 10 hours. **Depth first, then scale.**
