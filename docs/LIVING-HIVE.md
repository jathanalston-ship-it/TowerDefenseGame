# LIVING-HIVE.md — The Living Defensive Zone

Visual-behavior spec for making the defensive zone read as **one growing
organism**, not a construction site. Extends `STYLE-GUIDE.md` (organic motion),
`PLACEHOLDER-ART.md` (the geometric forms these behaviors animate), and the
renderer's existing **hive tendrils + core heartbeat + defense zone**. Pairs with
`GAME-FEEL.md` (growth juice/audio). No code — behaviors + implementation notes.

> **Fiction → feel:** the player is a rogue biotech hive. They don't *build* a
> defense — they **grow and spread** one. Every structure is an **organ**; the
> whole zone is **flesh that breathes, pulses, metabolizes, and creeps**. Placing a
> tower should feel like the organism *sprouting a new limb*.

---

## 1. The one idea that ties it together: the **pulse clock**

The hive **breathes as one body.** The core's heartbeat (already in the renderer,
and already faster when wounded) is the **master clock**: every living element
samples the *same* heartbeat phase, so towers, slots, veins, and the membrane all
**pulse in sync** with the core. One shared sine → the zone reads as a single
organism, not a pile of separate animations.

- Expose a `hivePhase(t)` (derived from the core beat + a per-element offset by
  `id`, like the existing tendril offset) that everything breathes against.
- Wounded core → faster, more frantic clock → the *whole zone* tenses up. Calm →
  slow, deep breathing. The battlefield's emotional state is its pulse rate.

---

## 2. Grown, not built (the universal rules)

- **Placement = growth.** A tower never pops in. It **sprouts**: over ~0.5s it
  eases from a seed nub to full size (over-scale → settle), unfurling parts, with a
  **birth bloom** of spores and a wet *growth* SFX. A vein **snakes out from the
  core** to feed it (extend the existing tendril).
- **Removal = reabsorption.** Selling/destroying a tower **withers** it (shrink +
  desaturate) and its biomass **flows back to the core** as motes.
- **Nothing is static.** Idle = breathing (pulse clock) + occasional **twitch**.
  Living things are never perfectly still.
- **Mutation = upgrade.** Star-ups **grow new structures** on the organ rather than
  swapping a sprite (STYLE-GUIDE §11; PLACEHOLDER-ART §3 forks).

---

## 3. Per-element behaviors

### Towers — organs
| | Behavior |
|---|---|
| **Birth** | sprout/unfurl from the slot (§2); vein connects to core |
| **Idle** | breathe on the pulse clock; class-specific micro-motion (below); rare twitch |
| **Fire** | a **muscular contraction → recoil → relax** (organic, not mechanical); the feeding vein **brightens** as it "spends" energy |
| **Mutate (★)** | grows a new limb/sac/spine; brief evolution ring + pulse |
| **Class motion signatures** | Kinetic = a tense barb that **flexes and snaps**; Caustic = a **bubbling, glistening sac**; Viral = a **writhing egg-cluster**; Neural = a **slow-breathing brain** under a floating glyph-ring; Vital = a **visibly beating heart** |

### Heroes — mobile avatars of the hive
| | Behavior |
|---|---|
| **Spawn / respawn** | **emerge from the hive core** (grown, then detach) rather than fade in |
| **Locomotion** | organic, per-hero (PLACEHOLDER-ART §4): Ravager **lunges** with muscle, Shepherd **drifts/blooms**, Overseer **floats** with trailing tendrils |
| **Idle** | breathe on the pulse clock; a faint **biomass trail** marks their path (they leave living residue) |
| **Presence** | a soft living aura so they read as *part of* the organism, not a separate sprite (still tops the salience hierarchy — READABILITY) |

### Base — the heart/brain (master organ)
| | Behavior |
|---|---|
| **Heartbeat** | the pulse clock source (already implemented; keep) — drives the whole zone |
| **Metabolism** | veins visibly **pump biomass** outward to feeding structures and inward from kills |
| **Wounded** | faster/erratic beat, **bleeding** wisps, the zone's pulse tenses (already partly via pressure vignette) |
| **Wave clear / heal** | a deep satisfied pulse that ripples calm outward through the membrane |

### Tower slots — fallow biomass nodes
| | Behavior |
|---|---|
| **Empty (unlocked)** | not a clean bracket but a **dormant fleshy nub / spore-pod** in the membrane that **twitches and pulses faintly** — visibly *ready to grow* |
| **Hover** | the node **reacts** — swells and **reaches toward the cursor** (it wants to grow) |
| **Locked** | **encysted / calcified** — a hardened dormant pod (still subtly alive), replacing the 🔒 with an organic "sealed cyst" |
| **Plant** | the node **blooms** into the tower (§2 growth) |

### Resource generation — visible metabolism
| | Behavior |
|---|---|
| **Kill income** | biomass from a kill becomes motes that **travel along veins to the core** (unifies death → resource feedback, GAME-FEEL P0) |
| **Reactor (Vital)** | visibly **pumps overcharge through veins** to adjacent towers — you *see* the buff flow |
| **Idle income** | a gentle, constant pulse of motes along the vein network — the organism is always metabolizing |
| **Membrane** | the defensive-zone floor is a **living membrane** that slowly undulates and glistens, denser near the core |

### Progression milestones — the organism evolving
| | Behavior |
|---|---|
| **Star-up** | the organ grows a new structure + evolution ring (GAME-FEEL star feedback) |
| **Class level** | the zone's **veining deepens and recolors** toward that class's hue as you specialize |
| **Slot unlock** | a calcified cyst **cracks and quickens** into a live node |
| **Prestige (molt)** | the hive **molts** — sheds a husk and **regrows larger**, with a palette shift toward the prestige/prismatic treatment (STYLE-GUIDE §11). The single most dramatic evolution beat (GAME-FEEL prestige) |
| **Overall** | as you progress, the **creep spreads further** up the battlefield (§4) — visible territorial growth |

---

## 4. The infected battlefield (the creep)

The defining motif: your zone is a **spreading living membrane**, and it *claims
ground* as you grow.

- **Creep membrane.** The defensive zone floor is procedural flesh — undulating
  veins, pores, faint spore drift — **densest at the core**, thinning toward the
  line. It **breathes** on the pulse clock.
- **Colonization.** Obstacles inside/near the zone get **wrapped in veins**; placed
  towers **root into** the membrane (tendrils web between neighbors).
- **Spread = progression.** A `creepLevel` (grows with towers built, waves
  survived, and prestige) pushes the membrane's **leading edge upward** past the
  defensive line over time — you literally **infect more of the map** as you get
  stronger. This is the visible reward of progression and the StarCraft-creep power
  fantasy: *the hive is winning ground.*
- **Two ecosystems meet.** The top stays a **cold, hostile** spawn membrane (the
  invading ecosystem, already rendered); your **warm, wet** creep climbs to meet it.
  The battle is two living tides colliding — and yours advances as you progress.

---

## 5. Implementation notes (procedural, on the current renderer)

- **Reuse what's there:** `pulse()`, the core heartbeat, hive tendrils, the
  defense-zone gradient, pooled particles, and the `pressure` value. This spec is
  mostly *extending* those, not new tech.
- **Pulse clock:** export a shared `hivePhase(t, idOffset)` so towers/slots/
  membrane/veins breathe in sync; drive its rate from core integrity (reuse the
  existing wounded-beat math).
- **Growth animation:** stamp a `bornAt` on placement; draw scale = eased
  `min(1,(t-bornAt)/0.5)` with a slight over-shoot; emit a birth particle burst.
- **Creep:** render the zone membrane as a cheap procedural field (layered sine/
  noise blobs or a vein lattice) clipped to `creepLevel`; it's **background** so it
  can be coarse and is LOD-friendly (drop detail under load). Expand the clip region
  as `creepLevel` rises.
- **Veins/metabolism:** extend `drawHiveTendrils` to carry **traveling motes**
  (parametric points along each quadratic curve) for income/overcharge flow.
- **Budgets:** all of this lives inside the existing `PERF`/`PARTICLE` caps and the
  LOD `detail` flag — the membrane and idle motes are the first things to simplify
  when the swarm is huge (units always win the frame — READABILITY).
- **Forms:** the *shapes* these behaviors animate come from `PLACEHOLDER-ART.md`;
  this doc supplies the *motion/life* layer over them.

---

## 6. Audio (the hive is audibly alive)

- An ambient **biological bed** — a slow heartbeat + wet, breathing texture — set to
  the **pulse clock**, intensifying with `pressure` (GAME-FEEL §music).
- **Wet organic SFX** for growth (a squelching *bloom*), firing (muscular *thmp*),
  reabsorption (a soft *slurp*), and molt (a huge tearing *gasp* → swell).
- The zone should *sound* like a breathing body, so even with eyes on the swarm the
  player feels the organism around them.

---

## 7. The feeling we're buying

Place a tower → a limb **sprouts and roots** with a wet bloom. Kills → biomass
**flows home through pulsing veins**. Upgrade → the organ **mutates new structures**.
Progress → the **creep claims the map**. Prestige → the whole hive **molts and
regrows**. The player isn't assembling machines on a grid — they're **cultivating a
living, spreading, hungry organism**, and every interaction feeds it.
