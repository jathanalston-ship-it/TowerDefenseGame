# PROGRESSION-LOOP.md — The Recursive Loop & the 500-Hour Endgame

> Design bible for *why a player keeps pressing "Run Again"* — for ten minutes and for
> a thousand hours. Companion to `PROGRESSION.md` (the numbers), `PRODUCTION-AUDIT.md`
> (what's built), and `RETENTION-REVIEW.md` (the loot loop). No code — this is the
> design contract the systems must satisfy.
>
> **Status tags** tie each transition to the live build: ✅ built · 🟡 partial/weak ·
> 🔴 missing (per `PRODUCTION-AUDIT.md`).

---

## The one principle

> **Every lap of the loop must hand the player a new *decision*, not just a bigger
> *number*.** Power is kept legible (log curves, capped buckets, a single Power Score);
> *variety* is where infinity lives (builds × forks × gear × relics × classes × hybrids
> × cards × corruptions × biomes). A loop sustained by rising numbers dies the moment
> the player stops feeling them. A loop sustained by *new decisions* never does.

The chain the brief draws is a **circle**; a thousand-hour loop is a **spiral** — each
lap returns to "Run" at a higher altitude, with a wider decision space than the last.

---

# PART 1 — The complete recursive loop

## 1.1 The loop is *nested*, not single

Excitement to continue comes from one structural fact: **finishing a small loop advances
a bigger one.** Five loops run at once, each feeding the one above:

| Loop | Cadence | The carrot | Feeds… |
|---|---|---|---|
| **Micro** — kill → biomass → place/upgrade | seconds | immediate board control | the Run loop |
| **Run** — wave → card draft → build → clear | minutes | a one-run power fantasy (cards) | the Session loop |
| **Session** — loot meter → box → shards → **Star** → new build | an evening | a *new toy* to pilot | the Meta loop |
| **Meta** — gear → hero → **Mastery** → class | days/weeks | a personalized, deepening account | the Prestige loop |
| **Prestige** — reset → **new permanent system** | weeks/months | a *new kind of game* | the spiral's next lap |

The player is "excited to continue" at any moment because **whatever they just did paid
into a larger arc they can see.** A kill fills the loot meter; the meter earns a box; the
box funds a star; the star changes the build; the build makes the next run fresh. Break
any rung and the loop above it starves.

## 1.2 The canonical chain, transition by transition

For each: **the hook** (why excited) · **degradation risk** (how it rots into "bigger
numbers") · **the design that keeps it a decision** · **ASSIMILATE status + fix.**

### ① Run → Loot Box  ✅ (meter) / 🟡 (payoff)
- **Hook.** A telegraphed variable reward. The loot meter fills *visibly* as you fight
  (kills + waves), the rarity preview whispers "the next one is **Rare**," and the bar
  glows brighter toward full. Anticipation is *seen*, not abstract.
- **Degradation risk.** If the box just pays a number, the wind-up has no release.
- **Keeps it a decision.** The box must *sometimes* contain build-relevant loot (gear, a
  card unlock, a cosmetic) — a surprise that changes what you *can do*, not just what you
  *have*. Rarity + pity make the chase fair and exciting.
- **ASSIMILATE.** Meter is excellent ✅; box contents are **currency-only** 🟡. **Fix:**
  drop gear/card-unlock/cosmetic contents (audit Task #9) + an open ceremony.

### ② Loot Box → Shards  🟡
- **Hook.** The box converts to *agency*: shards are spendable, and spending is a
  **choice** — "which unit do I push?"
- **Degradation risk.** Generic shards that only ever accumulate = a savings account, not
  a decision.
- **Keeps it a decision.** Shards should be (or convert to) **unit-specific** investment,
  forcing "Needle or Ravager next?" Add a forward-pull ("1 box from your next ★").
- **ASSIMILATE.** Shards exist ✅ but feed *capped account tracks*, not units. **Fix:**
  tower/hero shards as the per-unit Star currency (audit Task #5).

### ③ Shards → Stars  🔴 (the missing spine)
- **Hook.** A star is a **telegraphed milestone unlock** — you can *see* the locked ★5
  fork and you want it. The wind-up is "three boxes to my Singularity Round."
- **Degradation risk.** If stars are mostly `+10% damage`, this is the textbook "bigger
  numbers" trap and the whole spiral collapses into a treadmill.
- **Keeps it a decision.** **Stars are mostly *mechanics*, lightly stats.** Each step
  unlocks behavior; ★5 and ★8 are **re-selectable A/B build forks**; ★10 is a *signature
  transformation*. One maxed tower = ~4 endgame configurations, not one bigger tower.
- **ASSIMILATE.** **Missing** 🔴 — and it is the single most important rung. **Fix:**
  Tower Stars v1 (audit Tasks #3–4); design unlocks as *forks*, not percentages.

### ④ Stars → New Ability  🔴
- **Hook.** A genuinely new toy → the *itch to test it* in a run.
- **Degradation risk.** A passive `+X%` unlock creates no itch.
- **Keeps it a decision.** The unlock must visibly change *how the unit plays* (a new
  active, a new on-hit, a fork that redirects the build) and the reveal must name the new
  verb: "Needle now **executes** low-HP targets."
- **ASSIMILATE.** Missing 🔴 (gated behind Stars). **Fix:** ability-bearing star nodes via
  the Ability Framework (audit Task #21).

### ⑤ New Ability → Different Build  🟡
- **Hook.** **Combinatorial discovery** — "this ability + that card + this reaction = a
  strategy I haven't run." This is where infinity actually lives.
- **Degradation risk.** An ability that doesn't *interact* is an island; build space adds
  instead of multiplies.
- **Keeps it a decision.** Every new ability must hook the **reaction matrix / cards /
  class / gear**, so it *multiplies* build space. (Needle-execute + the on-death-pool card
  + a Caustic relic = a new engine.)
- **ASSIMILATE.** The hook points exist (SHRED, card `RunModifiers`) ✅; the *content* to
  combine is thin (3 towers) 🟡. **Fix:** more towers/cards + reaction expansion.

### ⑥ Different Build → More Loot  🟡 (the weakest combat-side rung)
- **Hook.** The run is **renewed** — you're piloting a *new build*, not replaying the same
  run — *and* it's productive (the meter fills toward the next box).
- **Degradation risk.** **If runs play identically regardless of build, this rung is dead**
  — the "it gets solved" problem. This is currently ASSIMILATE's most fragile transition.
- **Keeps it a decision.** Runs must *demand* the build: an **AI Director** + enemy
  variety + objectives + boss check-pieces so a varied threat forces a varied answer. A
  build change must *matter on the board.*
- **ASSIMILATE.** Modes/objectives help ✅; only 11 enemies + a solvable SHRED meta 🟡.
  **Fix:** AI Director + enemy/boss variety (audit Tasks #19–20, #29).

### ⑦ More Loot → Equipment  🔴
- **Hook.** Gear is a **horizontal** lever with rolled affixes — a slot machine with
  skill. "What if *this* box rolls a better relic?" The perfect-roll chase is bottomless.
- **Degradation risk.** Stat-stick gear = bigger numbers with extra steps.
- **Keeps it a decision.** **Weapons alter attack behavior, armor carries auras that buff
  towers, relics bend rules.** Vertical power hard-capped; variety horizontal (affixes ×
  sets × relics). Gear is *new behavior*, not more stat.
- **ASSIMILATE.** Missing 🔴 (the "Equipment track" is account upgrades, not gear). **Fix:**
  the Equipment system as loot/boss contents (audit Task #8).

### ⑧ Equipment → Hero Improvement  🔴
- **Hook.** **Expression** — the hero becomes *yours*: a loadout that reflects your taste
  and shows your skill. Personalization is its own reward.
- **Degradation risk.** One hero + generic gear = no identity.
- **Keeps it a decision.** Heroes × gear × relics × class = a *personal build identity*;
  armor auras make the hero scale the *towers* too (a cross-layer decision).
- **ASSIMILATE.** 1 hero, no gear 🔴. **Fix:** heroes #2–3 + gear + loadout (audit #8–10).

### ⑨ Hero Improvement → Mastery  🔴 (the forever rung)
- **Hook.** **Guaranteed progress + status.** Every run advances *something permanent*,
  even when stars are maxed. "L240 on my main — and the next milestone perk is close."
- **Degradation risk.** Pure-% mastery is the purest "bigger numbers" failure of all.
- **Keeps it a decision.** Mastery's *power* is logarithmic (legible, never bloats); its
  *payoff* is **milestone perks (mechanics) + Ranks (titles/cosmetics)**. Mastery is a
  trophy that occasionally hands you a new perk — not a creeping number.
- **ASSIMILATE.** Missing 🔴 (the "Mastery track" is account upgrades). **Fix:** per-unit
  infinite Mastery with milestone perks (audit Task #11).

### ⑩ Mastery → Prestige  🟠
- **Hook.** **A real decision** — "do I reset *now* for the leap?" — plus prestige gates
  *new mechanics*. Anticipation of a power jump *and* new toys.
- **Degradation risk.** "Reset for ×2" with nothing new = the biggest-number trap wearing
  a fancy hat.
- **Keeps it a decision.** **Every prestige layer unlocks a new mechanic/system** (Molt →
  Adaptive Mutation slots; Speciation → Hybrid classes; Hivemind → idle Network; Apex →
  Corruption ladder; Singularity → Meta-Laws). **Trophies persist** (stars/gear/codex
  never reset) so the reset is a *re-climb*, not a *loss*. The sqrt currency makes
  *when-to-prestige* a genuine optimization.
- **ASSIMILATE.** Catalyst + a Prestige *track* exist 🟠; **no reset loop**. **Fix:**
  Prestige Layer 1 / Molt (audit Task #17).

### ⑪ Prestige → New Permanent Systems  🔴
- **Hook.** **The game expands.** A whole new *decision space* opens — not a new bar, a
  new *kind* of choice (fuse classes, deploy assimilated enemies, author run rules).
- **Degradation risk.** If "new systems" are just more upgrade tracks, the player smells
  the reskin instantly.
- **Keeps it a decision.** Each unlocked system is a genuinely new *verb* (§ Part 2). The
  game keeps **revealing new layers** — progressive disclosure of *depth*, the sense that
  there is always more *kind*, not just more *amount*.
- **ASSIMILATE.** Missing 🔴 (gated behind prestige). **Fix:** the prestige-layer mechanics
  (post-1.0, but Layer 1 seeds it).

### ⑫ New Permanent Systems → Run Again  🟡
- **Hook.** The loop restarts **richer**: a new build idea to test, a new goal to chase, a
  new system to push. "Run Again" is never the *same* run because everything above
  re-contextualized it.
- **Keeps it a decision.** This is the spiral closing one altitude higher. The run's
  *content* may be familiar, but its *meaning* (what you're testing / climbing toward) is
  new every lap.
- **ASSIMILATE.** The run loop itself is strong ✅; it just needs the rungs above it to
  exist so each lap *means* something new.

## 1.3 The weak transitions (ranked) and the unifying fix

In the **current** build, the chain is broken in the middle — rungs ③④⑦⑧⑨⑩⑪ are missing
or fake, which is exactly why the audit says progression "terminates in ~20–40 hours."
Ranked by fragility:

1. **Different Build → More Loot (⑥)** — the *structural* weak point even once content
   lands: if runs don't vary by build, the whole spiral is a treadmill. **Fix = AI
   Director + enemy/boss variety + objectives** (make the build matter *in* the run).
2. **Shards → Stars (③)** — the missing spine. **Fix = Stars as mechanics/forks, not %.**
3. **Mastery (⑨)** — the forever rung; trivially degrades to numbers. **Fix = milestone
   perks + Ranks, log power.**
4. **Prestige (⑩⑪)** — must unlock *mechanics*, not multipliers. **Fix = a new system per
   layer; trophies persist.**
5. **Loot Box → Shards/Equipment (①②⑦)** — the chase needs an *object*. **Fix = gear/card
   contents + choice + pity.**

**The single unifying fix** for all of them: **make variety combinatorial and power
legible.** Concretely — (a) every unlock is a *verb or a fork*, never only a stat; (b)
every system *hooks the others* so additions multiply build space; (c) the *exciting
spikes* live in the **temporary run bucket** (cards/reactions/corruptions) that resets
each run, so thrill is renewable without permanent inflation; (d) one **Power Score**
keeps the whole thing legible so growth *feels* large while staying countable. That is
how the loop supports thousands of hours **without relying on larger numbers.**

---

# PART 2 — The 500-hour endgame (owns everything)

A player has every tower, hero, equipment, star, card, and biome. Vertical acquisition is
*over*. If the only remaining axis is bigger numbers, they quit — and they're right to.

> **The endgame thesis: replace VERTICAL growth (acquire/strengthen) with HORIZONTAL
> growth (express/master/compete) and RENEWABLE goals (seasons/ladders/discovery).** The
> 500-hour player keeps playing because **new decisions keep emerging**, not because a
> bar keeps filling.

Seven motivation pillars, each a concrete ASSIMILATE system defined by **the new decision
it creates** — and *none* relies on more power.

### 1. Expression — "What is *my* ASSIMILATE?"
- **System:** **Signature Loadouts** + **mastery cosmetics**. With everything owned, the
  player *curates*: which 3 towers, which star forks, which hero + gear set + relics,
  which card-pool weighting — saved as named, shareable builds (loadout codes, a "build
  of the week" board). Mastery ranks unlock **cosmetic-only** tower skins, kill effects,
  biome dressing, hero titles, and a **player banner** that displays the identity.
- **New decision:** *how do I want to play and present myself* — taste, not power.
- **Why it lasts:** identity is bottomless; there is always a cleaner, cooler, more
  personal expression to chase, and sharing it makes it social.

### 2. Experimentation — "What weird thing should I try?"
- **System:** a **Synergy Codex** that tracks *combinations* run (not just content owned),
  surfaces **untried combos** ("you've never paired Viral-execute with the Contagion
  relic"), and rewards novelty with discovery entries + cosmetics. A **Practice Arena**
  (player-facing sandbox) lets veterans test builds without grinding. Self-chosen
  **Directives** (challenge modifiers) spice any run.
- **New decision:** *which corner of the combinatorial space haven't I explored?*
- **Why it lasts:** with hundreds of cards/gear/forks/hybrids, the combination space is
  astronomically larger than the content list — owning everything reveals how much you
  *haven't tried*.

### 3. Optimization — "How much can I squeeze from a fixed power budget?"
- **System:** the **Corruption Ladder** (Apex prestige) — voluntary difficulty tiers that
  scale *challenge*, not your power; how deep you push is a pure **skill** number, not a
  stat. Plus **gear affix perfection** (bounded rolls, astronomically rare to perfect →
  an endless optional chase via the Mutagen reroll sink) and **score/efficiency**
  optimization on daily seeds.
- **New decision:** *what's the optimal sequencing/positioning/build to push one tier
  deeper with the power I already have?*
- **Why it lasts:** theorycraft is infinite when the power is fixed but the challenge and
  the rolls are not — this is the classic ARPG "perfect the build" engine.

### 4. Collection — "Owning isn't mastering."
- **System:** a completion layer *beneath* ownership: every unit to **★10 + max Mastery
  Rank**, every gear with a **perfect roll**, every card **platinum** (won N runs with
  it), every enemy **assimilated** (Bestiary-as-Arsenal: deploy beaten enemies). A
  **Completion %** that keeps going far past "own everything," plus a meta-collection of
  *cosmetics* (skins/titles/banners).
- **New decision:** *what's the next mastery milestone, not the next purchase?*
- **Why it lasts:** mastery-gated collection (win-with-X, perfect-roll-Y) is orders of
  magnitude deeper than access-gated collection.

### 5. Discovery — "There's always something not-yet-seen."
- **System:** **Procedural Seasons (Omega)** — the honest infinite-content engine. Each
  cycle *generates* new modifiers, biome variants, boss mutations, and a challenge ladder,
  so even at 500h there is content the player has literally never encountered. **Hybrid
  classes** (fusing owned classes) create new units to discover; a **secret-synergy** layer
  rewards finding non-obvious interactions.
- **New decision:** *what does this season's generated ruleset let me build that nothing
  before could?*
- **Why it lasts:** authored content always runs out; *generated* content does not —
  procedural seasons + class fusion are combinatorial discovery, renewable forever.

### 6. Status — "Where do I stand?"
- **System:** **Leaderboards** (endless depth, daily seeds, corruption tier, score),
  **seasonal competitive ranks** that reset each cycle, and publicly-displayed **titles /
  borders / rare cosmetics** ("only 0.1% hold the Ω20 border"). Status items are
  *earned-and-visible*, never bought.
- **New decision:** *how do I climb the ladder / earn the rare status marker this season?*
- **Why it lasts:** comparison and competition are renewable by definition — there is
  always a higher rank, a faster daily, a rarer flex.

### 7. Long-term goals — "What's my project this month?"
- **System:** the deepest prestige (**Singularity Meta-Laws** — the veteran *authors the
  ruleset*; **Paragon** infinite respec-able trees = decisions, not levels) plus a
  renewable **seasonal goal track** (a cosmetic battle-pass-style ladder). Each is a
  weeks-to-months arc.
- **New decision:** *which multi-week project (a meta-law variant, a Paragon spec, an Ω
  push, a season completion) do I commit to next?*
- **Why it lasts:** authorship and respec-able specialization turn the veteran from a
  *consumer* of the game into a *designer* of their own variant — the deepest, most
  durable motivation there is.

## 2.1 The Veteran Director — never let the 500h player drift

A 500-hour player's enemy is not lack of *things to do* but lack of a *visible next
decision*. The game must **surface** it: a veteran-facing dashboard that always shows
"your highest-value next move" — the nearest mastery milestone, an enticing untried combo,
this week's leaderboard delta, the next season goal, a perfect-roll that's one reroll away.
Like the AI Director keeps *combat* honest, the **Veteran Director keeps *motivation*
honest** — it converts an enormous, owned game back into a *legible set of choices.*

## 2.2 How the endgame closes the spiral

Part 1's loop spirals outward from **acquisition** (hours 0–200: box → shards → stars →
gear → mastery) to **mastery + expression + competition** (200h+). The transition "New
Permanent Systems → Run Again" is sustained, in the endgame, **not by new content but by
new decisions** — a season's ruleset, a build to perfect, a ladder to climb, an identity
to express. The player presses "Run Again" at 500 hours for the same structural reason
they did at minute ten: *the thing they're about to do advances an arc they can see.* Only
now the arc is theirs to author.

---

## TL;DR for leadership

- **The loop is a spiral; every lap must add a *decision*, not a *number*.** Build the
  missing rungs (Stars → Gear → Mastery → Prestige) as **verbs and forks**, never stats.
- **The most fragile rung is "Different Build → More Loot"** — without AI-Director/enemy
  variety, the whole spiral is a treadmill no matter how much content ships.
- **The 500h endgame is horizontal, not vertical:** Expression, Experimentation,
  Optimization, Collection, Discovery, Status, Long-term goals — seven systems whose
  common output is *a new decision*, plus a **Veteran Director** to keep that decision
  visible. That is how ASSIMILATE earns "thousands of hours" honestly — without ever
  relying on a bigger number.
