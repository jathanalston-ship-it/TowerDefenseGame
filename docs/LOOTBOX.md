# LOOTBOX.md — Loot Opening Experience

The complete chest-opening ceremony. Builds on `ECONOMY.md` (chest types,
currencies, dupe-conversion), `STYLE-GUIDE.md` (rarity colors), `GAME-FEEL.md`
(shake/hit-stop/audio), `LIVING-HIVE.md` (bio aesthetic). No code — full design.

> **The chests are alive.** Per the rogue-hive theme, loot containers are **bio
> spawn-sacs / cocoons / egg-pods**, not metal boxes. You don't *unlock* loot — the
> hive **gestates and births** it (assimilation made tangible).

---

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

---

## Implementation — the Vault reveal (as built)

The ceremony is code now; this is the canonical reference (prefer it over re-reading).

**Split of concerns (the pull-count invariant).** `state/vaultReveal.buildReveal(chests)`
is a pure read-model returning two shapes from the rolled `ChestResult`s:
- `pulls[]` — **one entry per raw roll, never collapsed.** Its length equals the
  container's roll count, so the "Pull 2/5" HUD and the one-by-one reveal can never
  disagree with what was rolled. (This is the fix for BUGFIX-LOG #8: the old reveal
  merged before counting, so "5 pulls" showed 3 rows.)
- `sections[]` — the **only** place duplicates merge: same-reward pulls collapse into a
  categorized row carrying a `count` ("×N") + summed total. Equipment keys per-uid, so
  distinct pieces never merge. Categories: Equipment · Tower Shards · Hero Shards ·
  Materials · Other. Equipment carries an intrinsic Power Score (`itemPowerScore` =
  `itemRarityPower × effectsPower(itemEffects)`); the section + grand totals highlight it.

**Presentation.** `ui/VaultReveal` renders both, as a **fullscreen fixed overlay portaled
to `document.body`** (escapes the Hub's `isolation: isolate` stacking context — covers
everything, nothing clips; same fix pattern as BUGFIX-LOG #6). Two modes:
- **Cinematic** (default) — face-down card → flip → reward → Continue → next, with a bottom
  HUD (container name + "Pull i/N" + pips). Rarity scales the pace/spectacle.
- **Reveal All** — one button skips straight to the summary.

The summary is **categorized, merged, animated** (row stagger + Power count-up) and **never
auto-closes** — the player dismisses via Open More (N) / Return / Collect. Props
(`chest, title, color, onClose, onOpenMore, remaining`) serve both run caches and loot-queue
boxes; `GeneticVault` is the sole caller and keys the reveal per crack so Open More replays.

**Extension points.** A new reward family = one `case` in `describePull` + a `RevealCategory`.
Rarity label/color maps are open (an unknown tier like `mythic` degrades gracefully).


## §vault (2026-07) — the Vault as a collection floor

Premium VAULT OBJECTS (per-rarity stacks with counts; breathing cores, hover halos, tooltip
reward readouts: rolls x shard ranges x hero-shard %), the roll-distribution DROP RATES strip
(weights normalized), Open One / Five / Ten (batches merge into ONE ceremony via mergeCracked
— best pull drives the scale; "Open All" is the same helper with pending.length), the pity
guarantees bars (unchanged), and the device-local VAULT LEDGER (opened counters by rarity +
the last openings — state/prefs vaultLedger, in the factory-reset registry).


## §opening-flow (2026-07) — anticipation staged in

Closed container → ENERGY BUILD-UP (the sealed vault charges: glow ramp + core shake,
rarity-scaled ~1–2.3s, tap to crack early; the chest cue lands ON the break) → individual
card reveals (tap-to-flip, per-pull audio: shard cues / jackpot at epic+, beams on rare) →
persistent summary (never auto-closes). Modes: Normal · FAST (auto-deals the next card after
each reveal) · Reveal All (straight to summary) · tap-to-skip the charge. Legendary/exotic
presentation is fundamentally bigger: faster charge shake, a RUNNING card border, and the
whole backdrop breathing light. Known gap (documented): the summary does not yet badge
first-time collection items as NEW — the reveal model doesn't carry ownership deltas.
