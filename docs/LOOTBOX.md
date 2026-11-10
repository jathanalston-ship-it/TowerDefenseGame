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
everything, nothing clips; same fix pattern as BUGFIX-LOG #6). The ceremony is a diegetic
**four-act HATCHING** (see §hatching below), not a card pack: INCUBATE → RUPTURE → EMERGE
(one specimen sac per pull) → HARVEST. Reveal all with the remembered Skip animations switch
on jumps straight to the harvest (§clutch controls).

The harvest summary is **categorized, merged, animated** (prize banner + rarity tally + row
stagger + Power count-up) and **never auto-closes** — the player dismisses via Hatch Another
(N) / Return / Collect. Props
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
whole backdrop breathing light. FIRST DISCOVERY: `meta.openContainer` stamps `isNew` on an
equipment pull whose defId isn't in the inventory at roll time (each open persists before the
next, so the second copy in a multi-open batch is correctly not new); the reveal model carries
it (PullView/SummaryRow `isNew`) and the ceremony badges it — a pulsing gold "✦ NEW DISCOVERY"
ribbon on the pull face and a gold NEW chip on the summary row.


## §hatching (2026-07) — the ceremony REDONE as a four-act hatching

Supersedes §opening-flow's presentation (the FIRST DISCOVERY stamping is unchanged). The
card-pack metaphor (charge → face-down card → flip) is gone; the ceremony is now diegetic
to the bio-horror identity — the container is an EGG and the pulls are BORN:

1. **INCUBATE** — a living egg SQUEEZES on every audible heartbeat: each thump of the
   accelerating chain (`beatDelay ×0.84`) fires a WAAPI contraction on the pod (amplitude
   grows with the rate) plus a keyed echo ring, so sight and sound cannot drift apart; the
   pod's CSS timeline only ramps glow. Curved capillary veins brighten, a dim embryo stirs,
   hairline cracks spread, spore motes drift. The light LEAKING through the cracks is the
   rarity tell (`--leak`, tier-tinted). In the last ~460ms the egg goes **DEAD STILL** —
   beats stop, every animation pauses, the aura drops, the tap hint dims to "…" — then it
   gives. Duration `1700 + tier·350`ms; tap to force the hatch early.
2. **RUPTURE** — the shell tears in half (clip-path shell halves fly) with flash + spore
   burst + shockwave ring + a backdrop quake, plus: a fullscreen `hatch-worldflash` (sibling
   of the modal shell, so the whole ROOM lights up), 8 spinning chitin shrapnel bits, and 5
   heavy goo droplets that arc up then FALL. Brief, decisive, automatic (~680ms).
3. **EMERGE** — one wobbling SPECIMEN SAC per pull rises from the afterbirth, embryo dimly
   visible + umbilical cord. The sac ITSELF telegraphs the tier: commons run small and dim,
   epic+ swells with a stronger halo, and a legendary/exotic occupant visibly STRUGGLES
   (violent shake) before the burst. It auto-bursts after a rarity-paced beat
   (`700 + tier·260`ms; **340ms flat in Fast mode**) — wet `splice` cue, membrane shreds,
   pop ring, then the reward sting ~90ms later (shard cues; jackpot at epic+; conic beams
   behind rare+; an epic+ birth also washes the backdrop with the pull's color via
   `is-shine`). Epic+ ceremonies keep the room breathing throughout (`is-rare::before`).
   Tap opens/advances early · **Fast** auto-deals (460ms cadence) · **Skip All** jumps
   straight to the harvest. HUD: container name + "Specimen i/N" + pips.
4. **HARVEST** — the summary, led by the **PRIZE SPECIMEN banner** (first pull at the top
   rarity, INERT tag on commons) and a per-rarity tally (rendered only when >1 distinct
   rarity), then the categorized/merged ledger with Power count-up. Never auto-closes:
   **Hatch Another (N)** / Return / Collect.

Reduced-motion collapses every hatch animation to instant. The egg/sac silhouettes use the
sanctioned ORGANIC BLOB border-radius category (docs/UI-STANDARDS.md: 8 slash-syntax values,
each 30–70%).

## §meter (2026-07) — live HUD bar contract + earn ceremony

**THE AWAKENING GATE (2026-07):** the meter is DORMANT until the account's first Mega Boss
kill (`hasSlainMega`, save/derive.ts — the `megaProgress.slain` ledger, written live by the
`megaKilled` event). While dormant, `syncRunLoot` and `finishRun`'s loot-queue leg bank
NOTHING — runs pay Run Caches and flawless Stage Caches only — and the HUD cell hides
entirely; the `loot-meter` mechanics row fires the What's-New reveal when the first mega
falls (the run that fells it banks its full backlog at settle, so nothing earned that run is
lost). Veterans wake instantly; market Ichor containers and the daily Bio-Cache never route
through the meter and are untouched. The progression simulator mirrors the campaign mega
cadence through the real event path so pacing comparisons stay meaningful. Rationale
(docs/DIFFICULTY.md §curve): the container firehose from minute 0 was the main early-power
accelerant that trivialized the campaign's first ~55 stages.

CONTRACT: the HUD Loot bar (`ui/LootMeter`) renders ONLY `save.lootQueue` — the fill width is
always `progress / costOf(queue[0])`, so the display cannot drift from the backend. A
completion celebrates with OVERLAYS, never a faked width (the old faked-full pop latched
permanently — docs/BUGFIX-LOG.md #10): at T0 the bar flashes in the completed rarity's color
and the fill element REMOUNTS (`key=cycle`) so the next box's small width starts fresh with
no backward drain; the earned container streaks from the toast rail into the meter chest
(`.loot-fly`) and on impact (~0.44s) the chest pops, an 8-ray burst fires, and the HUD cell
shakes subtly. Anticipation: the fill carries a constant charge shimmer, and at ≥85% the bar
breathes (`is-hot`). The Earned toast (`ui/LootToaster`) shows the rarity, the vault count
after banking, and what's now filling — the `lootContainerEarned` event carries
`{ rarity, banked, next }`. Backend self-heal: `syncRunLoot` awards an OWED front
(progress ≥ cost — only reachable via legacy/tampered saves) even with zero new points.
The invariant `0 ≤ progress < costOf(queue[0])` after every `addProgress` is stress-pinned
(5000 randomized fills + conservation) in `core/lootQueue.test.ts`.

## §ichor (2026-07) — the Ichor Bleed

Every opened container rolls an independent, pity-less **Ichor Bleed** (docs/MARKET.md
§gamble): 22% (26% on epic+) for 10/18/26/40 Ichor, shown on the reveal as an epic-emphasis
event row ("Ichor Bleed") so the jackpot plumbing fires, and merged into the harvest summary
like any currency. Its EV sits deliberately below the cheapest market container's price —
lucky streaks briefly self-fund more openings and always die (marketEconomy.test pins it).

## §clutch (2026-07) — the simultaneous specimen clutch (as built)

The one-at-a-time births are gone. After INCUBATE → RUPTURE, **every reward materializes at
once** as a face-down specimen in one grid (the *clutch*), and the player flips each by hand:

- **Faces stay honest**: backs are deliberately uniform membranes (no rarity leak — the
  mystery IS the draw). The flip is a 3D membrane turn whose duration, spring curve, glow
  and spark burst scale with the pull's tier; audio rides `flip@N` (the membrane turn
  deepens + after-rings with rarity, `src/audio/sound.ts sFlip`).
- **Interrupts**: a NEW strand recovery raises the discovery celebration (zoom card, flavor
  text, Archive X/Y + completion %, `strandFound` cue → the `discovery` stinger); a
  legendary+ pull raises the apex moment (god rays, double heartbeat, room warp, `jackpot`
  → the `legendary` stinger). Manual flips HOLD until tapped; the armed cascade
  auto-continues after a beat.
- **Controls** (2026-11 — one action, one remembered switch): **Reveal all ▸** ⇄ ⏸ Flip
  individually (a true toggle, the cascade) plus an inline **Skip animations** switch
  (`role="switch"`) — instant flips, celebrations defer to the summary, and with it on Reveal
  all fast-paths straight to the Harvest via `flipAll`. The switch is a DEVICE pref
  (`prefs.vaultSkipAnimsPref`, key `assimilate.vault.skipAnims`, in `DEVICE_PREF_KEYS`): every
  later session opens with the player's choice. The old Fast / Skip Anims / Skip All buttons are
  gone (the reducer keeps `fast` for API stability; the UI no longer dispatches it). The egg
  hatch (heartbeat squeezes + rupture) always plays.
- **Scale**: stockpiles page in clutches of 12 (`revealGrid`) — only the active page mounts,
  so 50×/100× opens (the Vault's new Open 50 / Open 100) never scroll and never render
  hundreds of nodes. A 600-pull session builds + flips in <400ms (perf-pinned).
- **Harvest**: ledger unchanged, with **New Discoveries leading** (strand labels kept) and
  **Replay Highlights** — every ceremony-worthy flip (interrupts, rare+ pulls, first finds)
  replayable in the order the player revealed them.

**The framework contract** (`state/vaultReveal.ts`): a specimen derives ENTIRELY from
`describePull`'s output — `buildSpecimens` assigns tier magnitude + interrupt class from the
PullView alone, and `revealReduce` (a pure reducer: flip / ack / revealAll / flipAll / fast /
skipAnims / page) enforces every flow rule. **A future reward type only needs its
`describePull` case** — grid, flips, interrupts, summary grouping, highlights and audio all
follow with zero reveal-specific code. The rules are unit-pinned in
`state/vaultReveal.test.ts` (adapter coverage across every RewardItem variant, hold/ack,
double-flip refusal, skip suppression, cascade order, 1/5/10/50/100 geometry, perf).

## §rarity-fx (2026-11 VFX pass) — the Vault speaks the shared rarity language

**Fixed: rarity read as the reward's family colour.** The clutch face's rarity word, the harvest's rarity
tally chips and the prize banner's rarity chip took `PullView.color` — the reward FAMILY's hue (a tower's
colour, a material's) — so "8× INERT" read blue and a Legendary material read pink. Now every rarity
signal comes from `rarityColor(pull.rarity)` (the one map); the emblem and the amount keep the family
colour (what it IS), the frame speaks the tier (how RARE it is). The legendary interrupt's rays/zoom
(`.vintr.is-legendary`) wear the rarity too (discoveries keep the card-rarity colour they already had).

**Shared layers** (docs/UI-STANDARDS.md §rarity): a flipped face is a full `rfx` host (frame, glow, sweep,
rare+ edge, epic+ motes — no crown in a 12-tile clutch) with a one-shot flash timed to its flip
(`--flash-d` per tier; off under Skip animations); the PRIZE SPECIMEN banner and the apex interrupt card
wear the full layers (the banner's own motes retired); the shelf's banked containers and the
incubating box glow in their tier. Face-down backs stay deliberately uniform (the layers mount only on
`is-up`). Settings → Motion → Flashes now also silences the room-wide `hatch-worldflash`
(`:root[data-flashes="off"]`).

**The Open tap answers next frame.** `meta.openContainers` is synchronous and heavy (it persists the save
and the hub re-renders — measured ~0.6 s from tap to overlay on a stage-80 account, and the button never
even showed its press). `GeneticVault.crack` now sets `is-cracking` (buttons held pressed, the shelf's
containers pulse on a compositor transform that keeps moving through the main-thread work) and runs the
open after the next paint (rAF → timeout 0). The 600 ms burst guard is unchanged. Staging note for
captures: the roll is META `Math.random`, so a driver can script it across that deferred open to show upper
tiers on demand.

Vault keyboard flow: labeled opening/harvest modal restores its opener on unmount. Hatch now supports Enter/Space. Phase/page/flip/highlight transitions repair removed or disabled focus without moving a valid current choice. Tab stays within the active highlight or main reveal; Escape acknowledges a highlight/replay or closes the completed harvest. Summary initially prefers Collect/Return over Hatch Another. Nested highlights hide underlying reveal content from assistive technology. Reward reducer, purchases, pacing and persistence unchanged.

Vault feedback preferences resolve live OS and device settings. Heartbeat WAAPI checks the latest resolved motion without restarting incubation/audio timers; switching to reduced motion cancels the active pulse. Reveal cleanup cancels pulse/listeners. World/inner/rarity flashes obey flashes off, highlight shine is separate from warp, and zero resolved shake omits rupture quake. Existing CSS reduced-motion styling remains in place.

Harvest Power announcements expose the final total as stable assistive text alongside an aria-hidden visual count-up, avoiding per-frame live text changes.

HUD meter accessibility: the bar exposes a rarity-qualified progressbar with bounds and current value from the same clamped fill/cost used visually. Value text matches the visible integer percentage and tooltip point count. The existing focusable meter is a named group linked to its explanation by useId; no live-region announcements are added to the per-tick progress, and gate/queue/award/ceremony behavior is unchanged.
