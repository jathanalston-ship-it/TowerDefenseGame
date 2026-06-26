# RETENTION-ANALYSIS.md — Engagement audit & the three fixes shipped

Written as Lead Systems Designer after a mental playthrough as a **new player**. The
goal is long-term retention and replayability, not feature count. This documents
*where* engagement drops, *why*, a ranked top-20 by retention impact, and the **top
three** implemented this pass (architecture preserved).

---

## The new-player journey (where attention sags)

Menu → Start Run → place 3 towers on slots → press Start Wave → watch a swarm of
runners/brutes funnel down → draft 1-of-3 cards → repeat to wave 12 → win → Results
(shards + chest + mastery). Run two: it feels *identical* — same map, same enemies,
same opening. The juice is good (sound, shake, particles), but the **decisions and
the threat don't change**, so the second and third runs lose their pull.

---

## Top 20 issues, ranked by long-term-retention impact

Impact = how much it erodes the **"one more run"** pull over dozens of sessions.

| # | Issue | Why engagement drops |
|---|---|---|
| 1 | **Combat variety is suppressed** | rusher/tank/flyer/burrower are fully built but **never appear in waves** — only runner/brute/tyrant ship. Every run fights the same two enemies, so towers' differences barely matter. *Repetitive combat.* |
| 2 | **No anticipation before a wave** | the player presses Start with no idea what's coming, so prep is uninformed and there's no dread/plan. *Low anticipation.* |
| 3 | **Flat reward pacing at run-end** | every run grants the same chest whether you reach wave 3 or extract at 12 — pushing deeper isn't *rewarded*, killing the "push further" pull. *Poor reward pacing.* |
| 4 | **Shallow in-run decisions** | towers are place-and-forget; no upgrade/sell/reposition, so once slots are full the run plays itself. *Lack of meaningful decisions.* |
| 5 | **Passive hero** | the hero auto-paths and auto-fights; during the most active phase the player mostly watches. *Empty agency.* |
| 6 | **Thin build variety** | 3 towers + 1 hero, all always available; one dominant line (needle + mortar + reactor) converges every run. *Insufficient build variety.* |
| 7 | **No goals beyond "survive 12"** | nothing to chase, collect, or brag about between runs. *Weak progression hooks.* (Addressed by the new achievements layer.) |
| 8 | **Small card pool, mostly flat %** | ~14 cards, many "+12% damage" — few transformative or synergy-defining picks, so drafts feel same-y. *Low decision weight.* |
| 9 | **Single static map** | identical layout every run → no spatial novelty or re-learning. *Low replay novelty.* |
| 10 | **Finite ceiling** | the run ends at wave 12 with no harder modes; once you win, mastery is the only (slow, invisible) reason to return. *Endgame cliff.* |
| 11 | **Win/lose stakes are soft** | losing still grants a chest; success isn't differentially rewarded (tied to #3). *Low tension.* |
| 12 | **Mastery is invisible mid-run** | it accrues silently and pays out tiny; players don't feel it growing. *Weak progression feedback.* |
| 13 | **Two shard currencies** | global ◆ vs per-tower ✦ can confuse early economy reads. *Onboarding friction.* |
| 14 | **No difficulty expression** | no way to opt into more threat for more reward → skilled players plateau. *No mastery outlet.* |
| 15 | **Reactor is a no-brainer** | overcharge is so central that "reactor + neighbours" is auto-correct, not a choice. *Illusory decision.* |
| 16 | **Draft can't be re-rolled / banked** | one forced pick of three; no agency to shape a build over time. *Low draft depth.* |
| 17 | **No first-clear / streak bonuses** | nothing celebrates milestones in the economy, so grinding feels flat. *Reward monotony.* |
| 18 | **Prep has no pressure** | unlimited prep time, no incentive to start → pacing drags for some. *Downtime.* |
| 19 | **Hero ability is the only verb** | one button (Apex Leap) is the entire active toolkit. *Shallow moment-to-moment.* |
| 20 | **No session-level meta goals** | no dailies/contracts to seed a reason to log in. *Weak return hook.* |

---

## The three implemented (highest impact × architecture-safe)

Chosen to hit the **top of the list** while preserving the deterministic-sim
architecture. #1 (combat) and #2 (anticipation) are the two highest; #3 (reward
pacing) is the highest-impact change that also tightens the "push further" loop —
and all three reinforce each other (varied threat you can *see coming* and are
*rewarded for surviving*).

### 1. Combat variety — author the built archetypes into the waves (issue #1)
The four unused archetypes now appear across the 12 waves, each with a telegraphed
role: **rusher** (speed → tests gap coverage), **tank** (armor → leans on
Fracture+Corrosion/Shred), **flyer** (air → demands wide coverage), **burrower**
(tunnelling → punishes gaps). Pure **data** in `WAVES` (`config.ts`) — no sim code
changed. Verified the slice stays **winnable on every golden seed** by the naive
autoplay, and the golden snapshots were **re-pinned deliberately** (the spread in
surviving integrity now reflects varied pressure).

### 2. Anticipation — a next-wave telegraph (issue #2)
`Game.getNextWavePreview()` (read-only) exposes the upcoming wave's composition; the
Toolbar shows an **"Incoming"** strip of archetype chips during prep. The player now
plans against what's coming. Read-model + UI only — **golden untouched**.

### 3. Reward pacing — performance-scaled chests (issues #3, #11, #17)
Run-end chests now scale with how deep you got: **Biomass Cache** (standard) →
**Mutagen Vault** (wave 7+) → **Apex Reliquary** (full extraction), each with more
rolls, richer shard ranges, and a higher hero-shard chance. Deeper runs *pay off*,
creating a tangible "one more run, but further" pull. Data in `CHESTS` +
`chestForWave()`; applied in `meta.finishRun`. Meta-only — **golden untouched**.

---

## Deliberately deferred (next-highest, but out of scope here)
In-run tower upgrades (#4), active-hero depth (#5/#19), a larger/transformative card
pool (#6/#8), and difficulty/endless modes (#10/#14) are the next tier. They're
larger, gameplay-deep changes that deserve their own pass — noted so they aren't
lost. The achievements layer added in the dopamine pass directly addresses #7 (and
partly #12/#17) by making milestones visible and celebrated.
