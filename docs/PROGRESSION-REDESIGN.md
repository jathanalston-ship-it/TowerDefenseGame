# PROGRESSION-REDESIGN.md — From "how strong" to "how you play"

> **The audit question, applied to every permanent system:** *does this simply increase a
> stat, or does it create a new decision?* Flat power is the enemy of long-term
> engagement — a +8% that you can't say no to is not a choice, it's a tax. Wherever
> possible, **replace a flat increase with a fork**: a new mechanic, interaction, build,
> risk, or reward. The objective: progression that changes **how the player plays**, not
> only **how hard they hit.** **No code changed here — this is the redesign spec.**

**Status:** PARTIAL — **§2 Adaptation is SHIPPED** (`core/adaptation.ts`: mastery Ranks pay Antigen
Points into a 3-branch tower/hero tree, wired into `state/meta` folds + the Lab UIs). Other sections
remain PLANNED. Companion: `PROGRESSION-PHILOSOPHY.md`, `POWER-SCORE.md`, `TOWER-STARS.md`,
`MASTERY.md`, `EQUIPMENT-PHILOSOPHY.md`, `IDENTITY-AUDIT.md`. Live status: `GAME-STATE.md`.

**Scoring key:** 🟩 already a decision · 🟨 partly (a decision wrapped around a stat) · 🟥
pure stat — the redesign targets.

---

## 1. Tower Stars → **Evolutions** 🟨→🟩

**Current:** each star grants an evolution capability (targeting / projectile mutators /
granted attacks / forks) *plus* an incidental flat `damagePerStar`. Forks exist but not at
every tier. The capability layer is good; the **linear stat + non-forked tiers are the leak.**

**Redesign — every tier is a divergent mutation:**
- **Kill the flat `damagePerStar`.** Power comes from the *capability*, not a hidden
  multiplier. (Power Score already scores the capability effects.)
- **Every Evolution tier is a FORK** (`Divergent Mutation`): 2–3 mutually-exclusive
  mutations per tier, respecable but committing for the run. No tier is a straight "+".
- **Cross-strain reactions.** Some mutations only pay off next to another strain
  ("Corrosive Spore: acid pools *ignite* under a Bone Mortar") — the choice creates a
  *positioning + adjacency* decision, not a number.
- **Terminal Apex forks** (final tier) are build-defining identities (e.g., Needle Spitter →
  *Hemorrhage* [bleed/DoT carry] vs. *Fusillade* [burst multi-shot]). You can't have both.

**Result:** a maxed strain is a *statement of build intent*, not a bigger version of itself.

---

## 2. Mastery → **Adaptation** 🟥→🟩

**Current:** infinite XP-by-use → ranks + titles/lore + *sparse* mechanic perks + a cosmetic
halo. Mostly an invisible, flat, unavoidable hum. This is the biggest 🟥 in the game.

**Redesign — adaptation as a chosen mutation path:**
- Every Adaptation Stage grants an **Antigen Point** the player *spends* on a small
  **adaptation tree per strain** — 3 branches: **Virulence** (offense verbs), **Resilience**
  (survivability/anti-boss), **Contagion** (spread/economy/synergy). A branch, not a bar.
- Points are **respecable out of combat** but **fixed for a run** → a real pre-run decision
  ("this host needs Contagion").
- **Adaptation answers bosses.** Some nodes are explicit counters ("Membrane Piercer:
  ignore armor-facing"), so Mastery becomes the *long-game answer* to the boss-mechanic
  curve (`BOSS-DESIGN.md`) rather than a passive number.
- Keep the identity layer (titles/lore/halo) — it's good flavor on top of a real decision.

**Result:** the thing you grind forever now *shapes your build*, and it's finally *visible*.

---

## 3. Equipment → **Grafts / Symbiotes** 🟩 (protect it; deepen)

**Current:** already the best 🟩 — behavioral verbs, set bonuses, per-hero loadouts,
reforge. The `grant/set/hook` DSL authors *playstyle*, not stat-sticks. Keep the model.

**Deepen the decisions:**
- **Set fantasies** are thin (few sets). Author **archetype sets** that hard-commit a build
  ("Full Hemorrhage set: all damage becomes DoT, but no burst").
- **Graft *conflicts*** (anti-synergy) so loadout is a *trade*, not a stack: a mobility
  graft that *disables* an anchor graft. Real opportunity cost.
- **Reforge → Re-sequence** should let you *chase a build*, not just bigger tiers — allow
  targeting a *behavioral* affix, not only magnitude.
- **Corruption risk grafts** (see §10): powerful grafts that add a downside (glass-cannon
  as *gear*, mirroring the glass-cannon *cards*).

---

## 4. Ascension (Ascendant Tree) → **keystones, not multipliers** 🟨→🟩

**Current:** MOLT mints Ascendant Cells (sqrt→log global ×) spent on a spendable tree —
largely global multipliers. The *act* (MOLT) is 🟩; the *tree* is 🟨 (mostly bigger numbers).

**Redesign — the tree is keystones:**
- Replace flat-× nodes with **keystones that change rules**: "**Symbiotic Genesis:** start
  each run with a free random Evolution already spliced"; "**Rampant Spread:** kills spread
  a stacking corruption to nearby enemies"; "**Necrotic Economy:** Reabsorbing a strain
  refunds 100% Biomass but the tile stays barren for 20s." Each is a *playstyle*, not a %.
- **Mutually-exclusive apex keystones** at the tree's crown → your MOLT identity for the
  cycle. You cannot take all.
- Keep a *few* honest multiplier nodes as the "trivialize old grinds" idle-payoff (that's a
  legitimate prestige promise) — but the *headline* nodes are decisions.

---

## 5. Prestige (MOLT ladder) → **each layer adds an AXIS** 🟥(as-built)→🟩

**Current:** one layer (MOLT/Ascendant). ECONOMY.md designs six; five are unbuilt — so the
"old grinds trivialize, new depth opens" thesis is a promise, not a system.

**Redesign — each prestige layer opens a *new kind of choice*, not a bigger number:**
- **MOLT 1 (Ascension):** the keystone tree (§4).
- **MOLT 2 (Speciation):** permanently **fork a strain into a sub-species** you keep across
  runs — a roster-building decision.
- **MOLT 3 (Symbiosis):** unlock **hive-wide passives** you slot (limited slots → choose).
- **MOLT 4+ (Singularity):** meta-rules ("two Apex champions at once," "start at Surge 5").
- The rule: **a new prestige layer is only worth adding when it introduces a decision the
  game didn't have.** Never a sixth multiplier.

### §molt-chamber — the shipped prestige surface (2026-07 overhaul)

`src/ui/PrestigePanel.tsx` is **the Molt Chamber**: a live canvas chamber (the cutscene
library's `molt` tableau, rethemed via `drawCutsceneFrame` — reuse, never fork) fronting the
decision — the **×now → ×after** multiplier move, the mint headline, a progress bar to the
NEXT cell (`prestigeView.nextCellNeed/nextCellProgress`, `mintProgress` pre-ready), the
campaign gate, and an explicit **SHEDS / KEEPS manifest** with live counts
(`upgradeLevels`, banked Cores). The browser `confirm()` is gone: an in-app Popup confirms,
then the Molt plays a fullscreen **ceremony** (shed → cell count-up on `cin_heart` ticks →
seal with the multiplier move, auto-dismissing). The Ascendant Tree renders as three
stat-derived **wings** — Dominion (combat) / Economy Engine / Income Axes — each node a card
with level pips and a "now → next" preview; new nodes auto-join their wing by stat
(`WING_OF`). View-model decision fields are additive on `meta.prestigeView()` and pinned by
`src/state/prestigeView.test.ts`; core math (`prestige.ts`/`ascendant.ts`) is untouched.

---

## 6. Campaign unlocks → **a branching corruption path** 🟨→🟩

**Current:** clearing stages linearly gates star caps, hero slots (25/90), and prestige (10).
Good *pacing*, but it's a **straight line of gates** — no player choice in the path.

**Redesign — assimilate the body in an order you choose:**
- The host map **branches** (organs): choose which region to corrupt next → each grants a
  *different* permanent capability (the **Cardiac** branch → survivability keystones; the
  **Neural** branch → economy/tempo; the **Gastric** branch → damage). You can't take all
  early → a real long-horizon build decision.
- Gates (caps/slots/prestige) still exist, but *which reward you reach first* is chosen.
- **Set-piece stages** (finale bosses) at branch ends make the path memorable (fixes the
  "procedurally samey" finding in `EA-DESIGN-AUDIT §7`).

---

## 7. Infinite unlocks → **give ∞ a progression spine** 🟥→🟩

**Current:** Infinite grants loot + mastery + depth + a personal best. There is **no unlock
spine** — depth is its own reward, which is thin for the de-facto endgame.

**Redesign — depth milestones unlock *mechanics*, not just loot:**
- **Depth Covenants:** reaching Surge 25/50/75/… unlocks an optional **run modifier you
  toggle** ("The Famine: no Biomass income, but triple corruption spread") — risk/reward
  choices that change how a run plays, and gate the best rewards.
- **Rotating Directives** (weekly-style, but local/deterministic per seed-epoch): a
  changing objective ("survive using only DoT strains") that reshapes build choice.
- **Elite-variant bosses** (`BOSS-DESIGN §4`) are the Infinite content that isn't "more HP."

---

## 8. Power Score → **Virulence Index: a soft gate + a diversity reward** 🟨→🟩

**Current:** a well-instrumented, now-enforced *feedback number* (see `POWER-SCORE.md`).
But it's *only* feedback — it gates nothing and rewards nothing, so it can't shape play.

**Redesign — make it *do* something without making it a hard wall:**
- **Soft recommendations:** every Campaign node / Infinite goal shows a *recommended*
  Virulence ("expects ~3,200") — orientation, never a lock.
- **Diversity, not just magnitude:** add a **Spectrum** sub-score that rises with *build
  breadth* (distinct damage types, strain classes, graft archetypes). Reward *balanced*
  accounts with drops/currency — nudging players off the one-dominant-build convergence
  (`EA-DESIGN-AUDIT §2`, RETENTION #6).
- Rename to **Virulence Index** (`IDENTITY-AUDIT`) so even the meta-number is in-world.

---

## 9. Hero progression → **mutation paths, not a stat trio** 🟨→🟩

**Current:** heroes have stars + mastery + per-hero grafts + (new) shard-gated unlock. The
unlock + grafts are 🟩; hero *stars/mastery* are the same flat ladders towers have.

**Redesign — each Apex evolves along a chosen path:**
- Apply the **Evolution-fork** (§1) and **Adaptation-tree** (§2) redesigns to heroes too —
  a hero's stars are **identity forks** (Ravager → *Berserker* [rush/lifesteal] vs.
  *Executioner* [threshold-kill carry]).
- **Symbiosis slots** (grafts) already differentiate; add **hero-specific keystones** at
  Apex form.
- **Team composition becomes a decision** once the roster grows (`EA-DESIGN` P1 #19): with
  more Apexes, the 3 slots are a real comp choice (front-line/support/carry), not "field
  your 3 owned heroes because that's all you have."

---

## 10. Cross-cutting principle: **every power gain should carry a choice or a risk**

The unifying rule behind all nine redesigns:

- **Choice:** prefer 2-of-3 forks over linear "+"s. A maxed anything should read as a
  *build statement*.
- **Risk:** the strongest options carry a downside (glass-cannon grafts, Depth Covenants,
  Necrotic Economy) — power you *opt into*, not power you *accrue*.
- **Interaction:** the best nodes only pay off next to *another* choice (adjacency,
  damage-type synergy, boss-counter) → decisions compound into *builds*.
- **Legibility:** every fork states its trade in-world (`IDENTITY-AUDIT` copy) so choosing
  is informed, not a wiki lookup.

---

## 11. Prioritized redesign roadmap

| Priority | System | Change | Why first |
|---|---|---|---|
| **P0** | Mastery → Adaptation | the biggest 🟥; grinded forever, currently invisible & flat | highest engagement ROI |
| **P0** | Tower/Hero Stars → all-forks | kills the flat `damagePerStar`; every tier a choice | de-genericizes core progression |
| **P1** | Ascendant tree → keystones | replaces multiplier nodes with rule-benders | makes the *only* prestige layer meaningful |
| **P1** | Campaign → branching path | choice in the mandatory spine + set-pieces | fixes "samey campaign" |
| **P1** | Infinite → Depth Covenants | gives the endgame a real spine | fixes the endgame cliff |
| **P2** | Power → Virulence + Spectrum | soft gate + diversity reward | pacing + anti-convergence |
| **P2** | Equipment → sets/conflicts/risk | deepen an already-good system | build fantasies |
| **P3** | Prestige layers 2–4 | each adds an axis | only after layer 1 is a real decision |

**Definition of done:** for every system, a new player can name a *choice* they made — not
just a number that went up. When "what did you pick?" has an interesting answer for all
nine, the redesign is complete.
