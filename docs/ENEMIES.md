# ENEMIES.md — Enemy Factions (canonical spec)

The hostile ecosystems the hive assimilates. Companion to `TOWERS.md`,
`HEROES.md`, `CARDS.md`, `ECONOMY.md`. Five factions, each a **build-check**: its
mechanics *punish* one approach and *reward* another, so a varied run forces a
varied build (anti-homogenization, `DESIGN.md §15 risk #4`).

> **Design throughline:** factions are not just reskins with more HP — each is a
> **puzzle with a preferred answer**. Procedural stages mix factions, and which
> faction dominates a biome **rotates the optimal build**, which is the engine of
> long-term build variety. Each faction also **farms a different currency**
> (`ECONOMY.md`), giving players a reason to choose where to fight.

---

## Faction quick-reference

| Faction | Fantasy | Punishes | Rewards (build) | Farms |
|---|---|---|---|---|
| **Parasites** | swarming infestation | single-target | AoE, DoT-spread, summon-blocking | Biomass, Mutation Fragments |
| **Machine Cult** | armored techno-zealots | pure DoT, crit-without-pen | armor-pen, **Shred**, Corrosion, burst | Equipment Components |
| **Corporate Security** | tactical anti-tower elites | static/one-note play | CC, burst, heroes, anti-air | Equipment Components, Hero Essence |
| **Hive Organisms** | regenerating bio-titans | burst-only, mono-damage | DoT, execute, multi-type, flexibility | Biomass, Genome Samples |
| **Neural Aberrations** | reality-bending psychics | over-reliance on one system | redundancy, heroes, sustain, cleanse | Neural Fragments |

---

## 1. PARASITES — *the infestation*

**Fantasy.** A self-multiplying tide of chitinous vermin: individually trivial,
collectively a drowning wave. The ecosystem's immune response gone cancerous.

**Basic enemies.**
- **Skitterling** — tiny, fast melee; always in packs. Trivial alone, lethal en masse.
- **Burrower** — tunnels and re-emerges mid-lane, **skipping path segments** (bypasses
  front-loaded defenses).
- **Bloatling** — slow sac that **bursts into 3 Skitterlings** on death.

**Elite enemies.**
- **Brood Host** — periodically spawns Skitterlings; killing it **stops the spawns**
  (a priority target).
- **Hollow Carrier** — **immune until the parasite swarm around it is cleared** (its
  escorts are its shield).

**Boss — The Progenitor.** A mountainous egg-sac that floods the lane with parasites,
**splits into two** at 50% HP, and accelerates spawns as it dies. A DPS-vs-spawn race.

**Mechanics.** Multiply / split / swarm-overwhelm / path-skip / escort-shielding. The
threat is *density*, not individual durability.

**Visual identity.** Writhing yellow-brown chitin, glistening egg-sacs, twitching
mandibles, skittering masses; the lane *crawls*.

**Rewards.** High **Biomass** (kill volume) and **Mutation Fragments** (rampant
mutating biology). The go-to farm for fueling the card pool.

**Scaling behavior.** **Count** scales hard with depth (more, denser packs); individual
HP scales slowly. Deep runs = walls of bodies.

**Build pressure.** *Punishes* single-target (Needle Spitter alone drowns). *Rewards*
AoE (Bone Mortar), DoT-spread (Parasite Nest — a mirror match), and **summon
body-blocking** (Shepherd's Flock). **Plague** clears them wholesale.

---

## 2. MACHINE CULT — *the armored faithful*

**Fantasy.** A doomsday cult of flesh-fused machines worshipping the old corporate
gods of steel. Slow, shielded, self-repairing, relentless.

**Basic enemies.**
- **Drone Acolyte** — armored walker; **plinks your towers** from range.
- **Censer-Bot** — heavy frontal armor; **shields allies behind it** (line-of-cover).
- **Sparkhound** — fast leaper that **disables a tower** for a few seconds on contact.

**Elite enemies.**
- **Reclaimer** — **repairs and shields nearby machines**; must die first or the pack
  is unkillable.
- **Aegis Frame** — enormous **frontal shield: immune from the front** — needs flank,
  AoE, or pierce.

**Boss — The Forgemind.** A cathedral-walker that deploys **shield domes**, **repairs**,
and summons drones; its **armor regenerates** unless met with penetration or Corrosion.

**Mechanics.** Armor + shields + repair + tower-disable + directional immunity. A
sustained-mitigation puzzle.

**Visual identity.** Chrome-and-bone zealot machines, glowing cult sigils, drifting
incense smoke, ritual plating, candle-lit optics.

**Rewards.** **Equipment Components** (mechanical salvage) and the best **gear** drop
rates. The faction you farm for itemization.

**Scaling behavior.** **Armor & shield values** scale steeply with depth → raw damage
stalls; **penetration becomes mandatory** deep.

**Build pressure.** *Punishes* pure DoT (shields soak, armor mitigates) and crits
without penetration. *Rewards* Kinetic penetration + **Shred** (Needle Spitter + Bone
Mortar melts armor), Corrosion (armor strip), and burst that pops shields.

---

## 3. CORPORATE SECURITY — *the professionals*

**Fantasy.** Sleek, disciplined private military — the people who *made* the hive in a
lab and want their asset back. They fight smart and target your infrastructure.

**Basic enemies.**
- **Enforcer** — balanced armored trooper; the reliable backbone.
- **Riot Drone** — advancing **shield wall** that blocks projectiles from the front.
- **Recon Flyer** — **flying** (only anti-air towers/heroes hit it); **tags towers**
  for a damage-taken debuff.

**Elite enemies.**
- **Breacher** — rushes and **EMPs a tower** (disables it) — forces reactive target
  priority and repositioning.
- **Field Commander** — buffs nearby units and **calls reinforcements** (extra spawns).

**Boss — "Golden Parachute" (CEO Mech).** A heavily-armed executive frame: **EMP
bursts** (mass tower-disable), deployable turrets, shields, and **airstrikes on your
towers**; each phase swaps tactics.

**Mechanics.** Anti-tower (EMP/disable), **flyers** (air coverage), reinforcements,
unit buffs, board pressure. Punishes a passive, set-and-forget defense.

**Visual identity.** Neon-trimmed riot tech, holographic corp logos, clean lethal
drones — a deliberate cold contrast to the wet bio-horror.

**Rewards.** **Equipment Components** + **Hero Essence** (assimilating elite operatives)
+ strong gear. The faction for hero progression.

**Scaling behavior.** Gains *more abilities and reinforcements* with depth (tactical
escalation), not just bigger numbers.

**Build pressure.** *Punishes* static/one-note builds and no anti-air. *Rewards* CC
(Neural lock the Breachers), **heroes** (mobile, harder to EMP, kill priority targets),
burst, and anti-air coverage. **Mind Rot / hijack** turns their elites against them.

---

## 4. HIVE ORGANISMS — *the rival*

**Fantasy.** A competing rogue hive — bigger, older, hungrier. The mirror of what *you*
are becoming. Tanky bio-titans that regenerate and adapt.

**Basic enemies.**
- **Lumberer** — huge, slow, high-HP tank that **regenerates** out of combat.
- **Spitter Maw** — ranged **acid glob** at your towers (zoning you).
- **Crawling Mass** — medium bruiser that **splits into two** on death.

**Elite enemies.**
- **Regenerator** — **heals rapidly unless suffering DoT** — out-damage it or rot it.
- **Mutagen Beast** — **gains a random buff each wave segment it survives** (it adapts
  if you stall).

**Boss — The Apex Rival.** A colossal rival titan: massive HP, strong regen, and
**mutates a new resistance to your most-used damage type each phase** — explicitly
forcing damage diversity.

**Mechanics.** Regeneration + splitting + **adaptive resistance**. Punishes slow,
narrow, or bursty-but-gappy damage.

**Visual identity.** Building-sized fleshy horrors, pulsing tumors, many mouths,
visibly knitting wounds, dripping ichor — grotesque and awe-inspiring.

**Rewards.** Huge **Biomass** + **Genome Samples** (rival genetics → tower stars) +
**Mutation Fragments**. The faction for tower progression.

**Scaling behavior.** HP and regen scale hard; **adaptive resistances** intensify with
depth (the boss reads your build faster).

**Build pressure.** *Punishes* burst-only (regen heals the gaps) and mono-damage (boss
adapts). *Rewards* DoT (Infection/Corrosion ignore regen), execute (Needle Spitter),
**sustained multi-type** damage, and flexible builds that can pivot damage types.

---

## 5. NEURAL ABERRATIONS — *the wrongness*

**Fantasy.** Things that should not exist — psychic, reality-bending horrors born from
the assimilation of too many minds. They don't fight your army; they **edit it**.

**Basic enemies.**
- **Phantasm** — periodically **phases out** (untargetable/immune in pulses).
- **Static Wisp** — floats and **jams a random tower's targeting** periodically.
- **Echo** — on death **splits into illusory copies** (only one is real).

**Elite enemies.**
- **Mindflayer** — **aura that debuffs your towers** (−damage/−range) within range.
- **Paradox** — **reflects a % of damage** and briefly **reverses a tower's targeting**.

**Boss — The Dreaming God.** A reality-warper that, by phase, **disables random systems**
(a tower type, a card category, or a hero's abilities), spawns illusions, and **inverts
your buffs into debuffs**. Beating it demands redundancy.

**Mechanics.** Phase/untargetable, tower jam/debuff, illusions, **system-disable**,
buff-inversion. Punishes any single point of failure.

**Visual identity.** Non-euclidean glitch-flesh, shifting geometry, drifting eyes and
static, impossible colors, the lane *tearing* at the edges.

**Rewards.** The **primary source of Neural Fragments** (+ Mutation Fragments). The
faction you farm for the Hive Tree.

**Scaling behavior.** More frequent/longer disables and phases with depth — it
increasingly *interferes* rather than out-statting you.

**Build pressure.** *Punishes* over-reliance on one tower/system (it disables them) and
passive towers (jammed). *Rewards* **redundancy** (multiple damage sources/classes),
**heroes** (autonomous, harder to jam), Vital **sustain/cleanse**, and effects that
don't care about targeting (auras, DoT already applied).

---

## 6. Cross-faction interactions (the variety engine)

Procedural stages **mix factions**, and the combinations are where build diversity is
forced:

- **Machine Cult + Hive Organisms** — armor *and* regen in one run → you need
  **penetration AND DoT**. Neither a pure-crit nor pure-poison build clears it.
- **Parasites + a Reclaimer (Machine)** — a swarl shielded/repaired → AoE *plus* a way
  to kill the healer → priority-target discipline.
- **Corporate Breachers + Neural jam** — your towers get EMP'd *and* jammed → heroes and
  redundancy carry, not a single super-tower.
- **Hive adaptive boss + Neural disable** — can't lean on one damage type *or* one
  system → the most flexible builds win.

**Anti-homogenization in practice:** because the dominant faction **rotates by biome/
stage**, the "best build" rotates with it. A run that punishes your favorite build is a
*feature* — it's the game asking you to draft differently (`CARDS.md`) and field a
different 3-of-5 (`TOWERS.md`). The faction→currency mapping also gives **player agency**
over the grind: need gear → hit Machine Cult biomes; need Hive Tree → hit Neural
biomes; need cards → hit Parasite/Hive biomes.

**Reaction answers (designed counters):**

| Threat | Designed answer |
|---|---|
| Machine armor/shields | **Shred** (Kinetic+Caustic), Corrosion strip |
| Parasite/Hive swarms & regen | **Plague** (Caustic+Viral), DoT spread |
| Corporate elites & commanders | **Mind Rot**/hijack (Viral+Neural), CC, burst |
| Neural disables & phases | **redundancy** + heroes + **Synaptic Bloom** sustain |
| Hive adaptive resistance | multi-type damage + execute + build pivots |

---

## 7. Scaling & reward summary

| Faction | Threat axis (scales) | Primary currency | Secondary |
|---|---|---|---|
| Parasites | density/count | Biomass | Mutation Fragments |
| Machine Cult | armor/shields | Equipment Components | gear |
| Corporate Security | abilities/anti-tower | Equipment Components | Hero Essence |
| Hive Organisms | HP/regen/adaptation | Genome Samples | Biomass, Mutation Fragments |
| Neural Aberrations | disables/phases | Neural Fragments | Mutation Fragments |

All five appear from early game (in mild form) and escalate along their *own* axis, so
the *kind* of challenge keeps changing across the 1000-hour curve — not just the size of
the health bars.

---

## 8. Battlefield visual language — roles read BEFORE they act

Every role trait in the ~30-archetype roster (`src/core/config.ts` `ENEMY_DEFS`) now carries
a battlefield tell, drawn by `src/render/renderer.ts` `drawEnemy` (LOD-gated; the historical
seven set no traits, so the golden-era look is untouched):

| Role | Tell |
|---|---|
| **Shielded** (Aegis Drone, Bastion Warden) | a cyan front-arc bubble facing the line, alpha = remaining charge; it **visibly shatters** the instant it breaks (`shieldFlash`, set by the sim at the 0-cross) |
| **Regenerating** (Flesh Knitter, Bog Revenant, Apex) | green knitting motes rise while wounded flesh reweaves |
| **Summoner** (Brood Matron, Hive Caller, Dread Nought) | the womb **swells toward each birth** and releases with a spore burst |
| **Support** (Vital Mender, Aegis Cantor) | the aura's true reach drawn as a slow-pulsing dashed circle |
| **Suicide** (Bile Bomber, Spore Popper) | a pulsing blast-radius warning ring once the line is in reach |
| **Artillery** (Siege Maw, Acid Spitter) | dug-in stance braces + a muzzle charge that betrays the next volley (§9) |
| **Boss runtime** (`BossRuntime`) | invulnerability = hard golden shell; carapace = rotating bone plating; enrage = deepening blood rim; charge = flashing dash vector + chevron; Nucleus channel = feeding tether; **phase pips** under the health bar |

### 8.1 Creature body forms — the roster reads as distinct organisms

At full detail, non-boss enemies no longer render as one of five flat polygons. `src/render/enemyForms.ts`
draws **12 procedural CREATURE body-forms** — a shaded silhouette + anatomy (legs / wings / eyes /
segments) + a subtle idle animation — keyed per kind by `ENEMY_BODY` (`render/theme.ts`):

| Form | Archetype | Silhouette |
|---|---|---|
| `grub` | swarm | plump segmented larva, wiggling leg nubs |
| `dart` | fast | sleek arrowhead + swept fins + motion streaks |
| `beetle` | heavy | domed plated carapace, ridge, braced legs (colossus = a colossal beetle) |
| `crab` | shielded | low shell with a lit **front shield-plate** + claws |
| `polyp` | regen | pulsating gelatinous sac with knitting cilia + a nucleus |
| `mole` | burrow | torpedo body + big digging claws |
| `moth` | flying | **flapping** wings + segmented body |
| `broodsac` | summoner | translucent egg-sac with pulsing embryos |
| `frond` | support | floating anemone with waving healing tendrils |
| `bulb` | suicide | swollen bulb with a glowing **unstable core** + fuse |
| `mortar` | artillery | dug-in base with a raised, charging barrel |
| `maw` | apex/elite | fanged bruiser mass with back-spikes + a gaping maw |

Per-kind **colour** + a stable `ENEMY_VARIANT` seed vary the build within a form (segment/leg/plate/
eye counts), so variants (runner vs mite vs larva) differ structurally, not just in hue. The trait
tells above LAYER on top. **Cosmetic only** (the renderer is outside the deterministic sim — no golden
impact) and **LOD-gated**: below `PERF.lodEnemyCount` (220) enemies get the full body; a huge swarm
falls back to the flat `ENEMY_SHAPE` (also the bestiary icon). Each form is ~8–14 canvas ops, no
per-enemy gradients (shading is memoized by colour).

**Lifecycle animation** (`renderer.ts` — a presentation-only per-id **motion tracker**, like `heroTrail`,
never read by the sim): the tracker derives each enemy's smoothed screen **velocity** + **spawn age**,
so bodies **bank + walking-bob** as they move (idle wing-flap / leg-wiggle / core-pulse always run),
play their archetype's **BIRTH intro** (§8.2) when they spawn, and leave a **crumple echo** (splay +
squash-flat + fade) where they die. Grounded units get a contact **shadow** (fliers already had one); a per-instance size
jitter keeps a swarm from looking stamped. All render-side ⇒ golden-safe (the crumple is capped at 48
and fades in 0.3 s; a >200 px id jump re-emerges rather than banking, so a new run never cross-contaminates).

**Death audio** (`config.enemyDeathCue` → `audio/sound.ts`): a kill now layers a body-specific IMPACT
timbre — trait-derived into 5 classes (`squelch` soft-bodied · `crack` plated/shielded · `screech`
flying · `pop` suicide · `splat` heavy bruiser) — UNDER the kept rising kill-streak reward ping. The
sim pushes the cue on death (and a suicide's `pop` under the Core-breach); throttled per class so a
swarm-wipe never blows out. Golden-safe: a cue never touches wave/kills/integrity/biomass.

### 8.2 Assimilation — the death is a payoff, the birth is a moment

**Death → ASSIMILATION gore** (`render/gore.ts`, fed by the sim's one-shot `DeathEvent` buffer —
seq-ingested so each death fires exactly once, decoupled from draw rate). An enemy shatters into
**colour-CODED pieces routed to organized destinations**, so the payoff of a kill is legible, not a mess:

| Piece | Colour | Goes to | Count scales with |
|---|---|---|---|
| **Viscera gibs** | body colour (dark) | burst out, gravity, **settle as fading floor decals** ("stay in place") | overkill |
| **Juice spray** | body colour (light, translucent) | **OCCASIONAL** bio-juice droplets (chance ∝ overkill) that arc + splat | overkill |
| **Biomass motes** | biomass green | coalesce **up into the biomass HUD readout** | relative bounty |
| **XP shards** | the killer's colour | **home into the killing tower/hero and THROB it** (a feed-pulse scale) | relative bounty |
| **Assim chunks** | container violet | coalesce **toward the bio-container meter** | relative bounty |

Explosion strength scales with **overkill** (`-hp/maxHp` at the killing blow) and piece counts with the
enemy's **relative value** (`bounty / GORE_REF`), so a fat elite showers where chaff pops. Coalescers
fly as short-trailed comets, shrink as they're absorbed, and **snap** into the target (bumping the
tower/hero throb the renderer reads via `goreThrob`). A soft **`assimilate`** shimmer plays under the
death timbre. Cosmetic + render-only (never read by the sim ⇒ golden-safe), pooled + capped (≤520
pieces / ≤130 decals). The biomass/container HUD readouts already pulse on gain, completing the loop
without DOM coupling.

**Spawn → BIRTH intro** (`enemyForms.ts` `drawSpawnIntro`): each archetype is *born* with its own
animation over ~0.55 s (a mode + a birth VFX), not a uniform scale-in — **hatch** (grub cracks from a
spore shell), **erupt** (mole/maw burst up through a debris mound), **bloom** (polyp/broodsac/frond
inflate inside an expanding ring), **assemble** (beetle/crab/mortar carapace plates snap inward),
**phase** (dart/moth drop in from above through a ripple + motion streaks), **ignite** (bulb swells as
its core flashes alight). Driven by the motion tracker's spawn age; render-side ⇒ golden-safe.

## 9. Artillery shells — bombardment is visible and lands on impact

Siege enemies previously deducted Nucleus integrity **instantly** on their timer, with only
a damage float — an invisible tax. They now **lob a real shell** (`EnemyShell`, sim-owned):
launched on the volley timer, arcing to the Nucleus over `distance/260` seconds (≥ 0.5 s),
with a ground-tracking shadow and a landing reticle that sharpens on descent; **integrity
damage applies on impact**, with the breach float + burst at the landing point. In-flight
shells keep flying through the wave-end settle (combat residue, like tower projectiles).
The shell array is empty on the golden path (no historical enemy sets `siege`), and the
lifecycle is pinned in `src/core/enemies.test.ts`.
