# LOOTBOX.md — Loot Opening Experience

The complete chest-opening ceremony. Builds on `ECONOMY.md` (chest types,
currencies, dupe-conversion), `STYLE-GUIDE.md` (rarity colors), `GAME-FEEL.md`
(shake/hit-stop/audio), `LIVING-HIVE.md` (bio aesthetic). No code — full design.

> **The chests are alive.** Per the rogue-hive theme, loot containers are **bio
> spawn-sacs / cocoons / egg-pods**, not metal boxes. You don't *unlock* loot — the
> hive **gestates and births** it (assimilation made tangible).

> **Implemented status (see `GAME-STATE.md`):** 🟡 the **earn** side ships — a
> **Persistent Loot Meter** (`src/core/config.ts LOOT`, `state/meta.ts
> addLootProgress`, `ui/LootMeter.tsx`) that **never resets** across runs / Stage /
> Endless. It fills from **kills + completed waves**; filling it awards **one loot
> box** and rolls the overflow into the next meter (progress is never lost — folded
> in-memory live, persisted at wave boundaries, run end, and every box award). The
> meter size (`lootMeterSize(boxesEarned)`) is one function, so balancing/scaling is
> trivial. The **opening ceremony + box contents** below are **designed, not yet
> built** — today a box is a counted, bankable reward.

## 1. Goals & the core tension

Three requirements pull against each other:
- **Exciting after hundreds of opens**, but **fast for repeated use**, across **multiple rarity tiers**.

**The resolution — rarity-scaled ceremony.** *The length and intensity of the
reveal scales with the rarity of the result.* Commons resolve in well under a
second (and batch away); legendaries get the full slow-mo moment. Mass-opening
stays fast because 95% of pulls are quick; the rare big pull still lands hard. Add
**anticipation** (the sac *tells* you something good is coming before it reveals)
and **veteran controls** (hold-to-skip, auto-fast) and you get fast *and* thrilling.

---

## 2. The reveal sequence (single open)

Five stages; durations scale with rarity (§3):

1. **Present** — the **spawn-sac** drops/forms center-screen, pulsing with a faint glow that *hints* the floor rarity (every chest type has a guaranteed minimum). Background dims & blurs (battlefield/menu recedes). Camera does a slow **push-in**.
2. **Charge (anticipation)** — the sac **swells, veins light up, seams crack**, and a glow **builds and brightens**, its color **climbing the rarity ladder** with a **rising-pitch audio riser**. This is the dopamine core: *the longer/higher it climbs, the better the pull.* Include occasional **near-miss teases** (the glow flickers toward a higher tier, then settles) to keep variable-ratio thrill.
3. **Burst** — the sac **cracks open** in a spray of spores/biomass + a rarity-colored light flash; camera **punch-out** + a trauma kick (GAME-FEEL §screen-shake) scaled to rarity; brief **hit-stop** on Epic+.
4. **Reveal** — the item **rises and rotates**, materializing as a geometric crystal/organ in its rarity frame (STYLE-GUIDE §5); **name + rarity flare**; a **"NEW"** tag if first-ever; **set/relic** tags if relevant (EQUIPMENT.md).
5. **Resolve** — item flies to inventory (or **dupe-converts**, §6). Auto-continue after a short beat (or tap).

---

## 3. Rarity tiers — escalating treatment

Everything escalates with rarity; this *is* the anti-tedium engine.

| Tier | Glow / color | Charge time | Burst FX | Camera | Audio | Total |
|---|---|---|---|---|---|---|
| **Common** | dim grey | ~0.3s | small puff | none | soft *plip* | **~0.6s** |
| **Rare** | cyan | ~0.5s | spore spray | slight push | riser + *chime* | **~1.0s** |
| **Epic** | violet | ~0.8s | burst + ring + small shake | push-out | bigger riser + stinger | **~1.8s** |
| **Legendary** | **gold pillar of light** | ~1.4s | slow-mo crack, bloom, shockwave, screen flash | dolly + vignette focus + **slow-mo** | **choir/sub stinger** | **~3.0s** |
| **Exotic** | **prismatic, screen-wide** | ~1.8s | unique one-off animation + prismatic wash | full cinematic | **unique musical motif** | **~4.0s** |

The riser's **pitch ceiling = the result tier** — players learn to *hear* the pull
mid-charge, which is its own hit of anticipation.

---

## 4. Camera, VFX, SFX detail

**Camera (procedural, no real 3D needed — scale/translate/vignette on the 2D scene):**
- Push-in on Present; punch-out on Burst; for Legendary+, a slow **dolly** + **slow-motion** (time-scale ~0.4 for ~0.6s) + a **vignette** that tunnels focus onto the item.
- Trauma kick on Burst scaled by rarity (GAME-FEEL trauma model).

**VFX:**
- The sac: a **breathing cocoon** with glowing seams (reuse `pulse()` + the living-hive vein look); cracks propagate along the seams.
- Spores/biomass particles (pooled) tinted to the rarity color; a **volumetric glow** column for Legendary (gold) / prismatic for Exotic.
- The item materializes as a rotating geometric form; rarity frame + animated foil (Exotic only animates, per STYLE-GUIDE §5).

**SFX (procedural, GAME-FEEL audio layer):**
- A **rising riser** during Charge (pitch ceiling = tier), a **crack**, a **burst boom** (sub scaled to rarity), a **per-tier stinger** (Legendary = choir+sub; Exotic = a short unique motif), and an item **settle chime**.
- **Duck** music/SFX under the stinger so the big pulls breathe.

---

## 5. Multi-open (the speed solution)

For **10× / bulk** opens (where tedium lives):
- Show all sacs; **charge them together**; then **reveal in a fast cascade** — commons/rares **fly straight to inventory** with a quick blip, while the **single best item (Epic+) auto-pauses for its full moment**.
- A **summary screen** at the end (everything gained + total dupe-currency).
- **Hold-to-skip / auto-fast** fast-forwards the cascade; the best-item moment can be set to "always play" or "skip all."
- Net feel: a 10× takes ~2–4s + one real fireworks moment, not ten separate ceremonies.

---

## 6. Duplicate handling — never a dud

- Dupes **auto-convert** to the matching currency (ECONOMY.md dupe-conversion: Prime Genome / Pure Essence / Resonance / Scrap / etc.).
- Visually: the dupe item **dissolves into currency motes** that fly to the counter with the satisfying **resource-collection feedback** (GAME-FEEL P0) — a *positive* micro-reward, so a dupe still feels like progress, not disappointment.
- For gear, dupes can instead offer **+1 rank / fodder** so collections deepen rather than waste.
- **Rule:** every open yields a *visible gain* — a new item, a meaningful currency chunk, or progress toward a pity. There is no "nothing."

---

## 7. Legendary & Exotic moments

The payoff the whole system exists for:
- **Time slows**, the screen darkens to a vignette, a **pillar/bloom of gold** (Legendary) erupts from the cracking sac; the item **rises rotating in slow-mo**; **name + rarity flare** with a screen-wide light sweep; trauma **builds then releases**; a **choir/sub stinger** hits; held one beat, then auto-continues (or tap).
- **Exotic** adds a **one-off unique animation** + the **prismatic** treatment + its **own musical motif** — rare enough that the animation never goes stale.
- These moments are **deliberately un-skippable on first acquisition** (the "NEW" pull), then skippable on dupes — so the *first* time always lands.

---

## 8. Anti-tedium rules (the contract)

1. **Ceremony scales to rarity** — fast floor, big ceiling.
2. **Batch + cascade + hold-to-skip** for veterans.
3. **Never-a-dud** — dupes become currency with satisfying feedback.
4. **Visible pity** — chests show a "guaranteed [tier] in N" meter; the meter filling is its own anticipation (and removes the bad-luck rage that breeds tedium-quitting).
5. **Variable anticipation** — near-miss riser teases keep the charge phase exciting even when the result is common.
6. **Respect time** — a "Quick Open" toggle (skip to summary) and a "Cinematic" toggle (always full) let each player pick their pace; default auto-scales.

---

## 9. Pacing budget (summary)

| Action | Target time |
|---|---|
| Single common | ~0.6s |
| Single legendary | ~3.0s (the moment) |
| 10× (mostly common) | ~2–4s incl. one Epic+ moment |
| 10× quick-open | ~1s → summary |

Fast where it's routine, slow where it's special. That ratio — not raw spectacle —
is what keeps loot exciting after the five-hundredth sac.
