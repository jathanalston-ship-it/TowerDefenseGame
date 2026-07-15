# ONE-MORE-RUN.md — The Anticipation Engine (retention design + implementation roadmap)

> **The core principle:** players should **almost never quit right after receiving a
> reward** — they should quit **immediately before receiving the next one.** A session
> ends on a *cliffhanger*, not a *full stop*. Every menu teases the next unlock, every
> screen reinforces a future goal, every system manufactures anticipation. This doc walks
> the game as a brand-new player, asks *"why would I play one more run?"* at each beat,
> and where the answer is weak, designs a stronger pull. **No code changed here — this is
> the spec + an actionable roadmap.**

**Status:** PARTIAL — **Phase A shipped** (the Next-Goal engine `state/nextGoal.ts` + Home NEXT
banner + the Results cliffhanger/replay). Later phases remain PLANNED. Companion:
`RETENTION-ANALYSIS.md`, `PROGRESSION-REDESIGN.md`, `BOSS-DESIGN.md`, `IDENTITY-AUDIT.md`,
`PREDICTION.md`. Live status: `GAME-STATE.md`.

---

## 1. The psychology (why "quit before the reward" is the whole game)

A reward *received* is tension *released* — the natural place to stop. A reward
*imminent* is tension *held* — the natural place to keep going. Idle/gacha/roguelite
retention is built on **always having a meter that is 80–95% full.** ASSIMILATION already
has the *systems* to generate these meters (unlocks, evolutions, collections, prestige);
what it lacks is a **single engine that always surfaces the nearest one** and **paces
rewards to land just after a session would otherwise end.**

**Two rules:**
1. **Never resolve every meter at once.** When a run fills one bar, another should already
   be at 85%. Stagger the faucets so there is *always* a "next."
2. **Show the cliff.** The player must *see* the almost-done meter on the screen they'd
   quit from. Anticipation you can't see isn't anticipation.

---

## 2. The new-player mental playthrough (why one more run?)

Verdict per beat: 🟢 strong pull · 🟡 weak · 🔴 dead air (design a reward).

| Beat | "Why one more run?" | Verdict | Fix (if weak) |
|---|---|---|---|
| Finish tutorial | "I was just taught; let me try it" | 🟢 | — (onboarding is strong) |
| First real run → Results | "I got shards + a container to open" | 🟢 | — |
| Open first Bio-Container | "loot!" then… *now what?* | 🟡 | Results must already show the **next** almost-full meter |
| Run 2–3 | "unlock the next hero / hit the next Evolution" | 🟢 | ensure the **Release meter (42/100)** is visible on Home |
| ~Run 5, systems seen | "…raise a star?" | 🔴 | **content ceiling** — the anticipation engine must now carry it |
| First Campaign gate (star cap) | "unlock the cap at Stage 10" | 🟢 | surface "**Stage 8/10 → Evolution Ceiling +1**" on Home |
| First prestige in view | "almost at MOLT" | 🟢 | a **MOLT readiness meter** on Home |
| Post-content grind (10hr+) | "…mastery?" | 🔴 | Adaptation trees (`PROGRESSION-REDESIGN §2`) + **Depth Covenants** must exist |
| Any Vault open | "did I almost fill a collection / set?" | 🟡 | reveal the **collection/set "1 away"** teaser in the summary |
| Any session-end | "what's the nearest thing I'm about to get?" | must be 🟢 | **the Next-Goal engine (§4) guarantees this** |

**Finding:** the pull is strong early (onboarding + first unlocks) and **collapses at the
content ceiling** (~run 5–10). The anticipation engine + the progression redesigns are what
carry a player *past* the point where novelty runs out.

---

## 3. The "almost…" catalog (every near-miss is a hook)

Each is a meter the game should track and surface. The design pattern is identical:
**a labeled progress bar + an "N away" tease + a preview of the reward.**

| "Almost…" | Meter | Surfaced where | Reward preview |
|---|---|---|---|
| …unlocked a hero | Apex Genome to Release (42/100) | Home, Vault summary, Hero Codex | the silhouette + "what it does" |
| …upgraded | Strain Samples to next Evolution | Home, Results, strain card | the fork you'll get to choose |
| …evolved a branch | Biomass path / branch tier | in-run inspector, Home | the next mutation node |
| …prestiged | MOLT readiness (Stage/Power thresholds) | Home hero-slot, Evolution HQ | the keystone tree preview |
| …finished a collection | Codex completion (23/25 specimens) | Vault summary, Codex, Home | the completion reward |
| …finished equipment (a set) | Set pieces owned (3/4) | Armory, Vault summary | the set bonus that unlocks |
| …unlocked a tower branch | branch/Evolution unlock progress | Strain Lab, Home | the branch identity |
| …filled a mutation meter | **NEW: the Mutation Meter (§5)** | HUD (in-run) + Home | a free Evolution/graft roll |
| …reached a campaign milestone | Stage X/next-gate | Home, Campaign map | cap / slot / prestige unlock |
| …completed an event | **NEW: Directive/Covenant progress** | Home, Infinite | the event reward |
| …hit a personal best | best Surge − current | Infinite screen, in-run ghost line | next depth Covenant |

**Rule:** at any moment, **at least three of these are between 70% and 98% full**, and the
**single nearest one is always on the Home screen.**

---

## 4. The Next-Goal Engine (the one system that makes this real)

The highest-leverage build in this entire design pass. A **pure read-model** —
`state/nextGoal.ts` — that scans every meter in the save and returns a *ranked list of
imminent rewards*:

```
interface NextGoal { id; label; progress(0..1); remaining; rewardPreview; nav; urgency }
nextGoals(save): NextGoal[]   // sorted by "closest to done", filtered to unlocked systems
```

It aggregates: hero Release bars, Evolution costs, MOLT readiness, collection completion,
set completion, campaign gate distance, mutation meter, depth Covenants, achievements.
Then **every surface renders from it**:

- **Home / Hub:** a persistent **"NEXT: ▓▓▓▓▓░ 88% — 12 Strain Samples from Fusillade
  Evolution"** banner (the nearest goal), plus a "coming up" rail of the next 3.
- **Results screen:** ends on **"You're 1 run from …"** — the cliffhanger, not just a
  reward dump. This is the single most important placement.
- **Vault summary:** after loot, show which meter this haul *advanced* and how close it now
  is ("Needle Spitter — 2 samples from your next Evolution").
- **The hub "breathes" toward it:** veins/pulse in the living-lab background flow toward the
  nav item holding the nearest goal (`HOME-BASE.md` + `IDENTITY-AUDIT §3`).

Because it's a pure read-model over the existing save, it's **cheap, testable, and
non-invasive** — the same pattern as `vaultReveal`, `heroCollection`, `predict`.

---

## 5. The Mutation Meter (a new always-present in-run anticipation loop)

The game lacks a *fast* anticipation loop *inside* a run beyond the card draft. Add a
**Mutation Meter** that fills from combat (kills / assimilated Biomass) and, when full,
grants a **free Evolution/graft roll** — a mini reward every few minutes that *also*
carries across runs at 90% full so you *start* the next run near a payoff.

- Fills visibly in the HUD (an organic, throbbing bar — `IDENTITY-AUDIT` motion).
- Persists partially between runs (banked, like the loot meter) → you begin a run
  *almost* at a mutation → instant "one more run" pull on the menu.
- Ties every kill to visible progress (fixes RETENTION #12 "mastery invisible mid-run").

---

## 6. Reward pacing — stagger the faucets

The failure mode is **all meters resolving on the same run** (then a dead session). Pace so
rewards *interleave*:

- **Fast loop** (per run): Mutation Meter, loot container, run-end shards.
- **Medium** (few runs): an Evolution, a hero Release, a set piece.
- **Slow** (many runs): a campaign gate, a MOLT, a collection.
- **The engine enforces the stagger:** if two meters would complete on the same run, the
  Next-Goal ranking *surfaces the next one* immediately on Results, so the player never sees
  an empty "coming up" rail.

**Anti-pattern to kill:** the current Results screen can feel like a *terminus* (reward
dump → menu). It must become a *springboard* (reward → "next is 1 run away" → Infect again).

---

## 7. Every menu teases (surface-by-surface checklist)

| Surface | Today | Add |
|---|---|---|
| Home | dashboard + continue | the **NEXT banner** + "coming up ×3" rail |
| Results | reward recap | **"1 run from …"** cliffhanger + one-tap **Infect Again** |
| Vault summary | loot list | **"this advanced X to 92%"** per relevant meter |
| Campaign map | node progress | next-gate reward preview on the frontier node |
| Strain/Hero Lab | current stats | the **next fork/Release** preview, always visible |
| Armory | inventory | **set "3/4 — 1 graft away"** callouts |
| Infinite | best wave | **next Depth Covenant** teaser + ghost target line |
| Codex/Archive | collection grid | **"23/25 — 2 specimens from the completion reward"** |

**Test:** open any screen and ask *"does this show me something I'm about to get?"* If not,
it's a dead surface — wire the Next-Goal engine into it.

---

## 8. Actionable implementation roadmap

Phased, prioritized, grounded in the existing architecture (read-models + surfacing).

### Phase A — the engine (unblocks everything) · **P0**
1. `state/nextGoal.ts` — the pure Next-Goal read-model (§4) over the current save. Tests.
2. Home **NEXT banner** + "coming up ×3" rail rendered from it.
3. **Results cliffhanger** — "1 run from …" + one-tap **Infect Again** (the highest-ROI
   single placement in this whole doc).

### Phase B — the fast in-run loop · **P0/P1**
4. **Mutation Meter** (§5): HUD bar + banked cross-run progress (mirror the loot-meter
   plumbing) + the free-roll payoff. Golden-safe (a fresh save banks 0 → identity).
5. Vault summary **"advanced X to N%"** hooks (extend the reward summary from `#76`).

### Phase C — deepen the meters worth chasing · **P1** (depends on `PROGRESSION-REDESIGN`)
6. Surface the **hero Release / Evolution / set / collection / campaign-gate / MOLT** meters
   through the engine (they exist; they just aren't ranked or surfaced together).
7. **Depth Covenants** (`PROGRESSION-REDESIGN §7`) — the Infinite anticipation spine.

### Phase D — the atmosphere · **P2**
8. The hub **breathes toward the nearest goal** (living-lab veins) — anticipation you *feel*.
9. **Organic-motion easing** on every meter fill (`IDENTITY-AUDIT §2`).

### Phase E — events/return hooks · **P2** (needs the live-service lane decision — `EA-DESIGN-AUDIT §9`)
10. **Directives** (local, deterministic per seed-epoch) — a rotating objective + meter, so
    there's always an "almost-completed event" even without a backend.

**Definition of done:** stand on any screen a player might quit from, and there is a
visible meter between 70–98% full with a named, previewed reward one run away. When that is
true everywhere, the anticipation engine is complete — and the "one more run" question
answers itself.

---

## 9. How the four design docs connect

- **`IDENTITY-AUDIT`** makes every one of these meters *feel* like growing/infecting, not a
  progress bar.
- **`BOSS-DESIGN`** supplies mechanic-shaped rewards (beating a boss unlocks a *capability*,
  the best kind of "almost").
- **`PROGRESSION-REDESIGN`** turns the meters into *decisions* worth chasing (a fork you'll
  get to pick, not a number that ticks up).
- **`ONE-MORE-RUN`** (this doc) surfaces them all, always, on the screen you'd quit from.

Together they convert a great 10–20 hour game into one with a *reason to open it tomorrow*.
