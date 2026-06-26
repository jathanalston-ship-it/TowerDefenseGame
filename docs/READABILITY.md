# READABILITY.md — Battlefield Readability & Visual Hierarchy

How the player instantly parses a chaotic battlefield. Derives from
`STYLE-GUIDE.md`; pairs with `PLACEHOLDER-ART.md` (which supplies the actual
shapes). Grounded in the current renderer (`src/render/renderer.ts`) and enemy
data (`src/core/config.ts`). No code — analysis + concrete recommendations.

---

## 1. Where the renderer is today

**Already strong (keep):** layered environment — depth gradient, top "spawn
membrane", glowing **defensive line**, **pressure vignette** (throbs as the hive is
pressed), hive-core **heartbeat**, hive tendrils, **status rings** (Corrosion green,
Fracture cyan, Shred flash), a **danger aura** on enemies that cross the line,
**flier shadows/trails**, pooled **particles**, and **LOD** that drops embellishments
past `PERF.lodEnemyCount` (220). This is a solid presentation base.

**The readability gap — the *units*:**
- **All enemies are circles**, separated only by radius + color. A Tyrant boss is just a bigger red dot; a rusher and a flyer differ only by hue. No shape language, no faction identity, no boss/elite tier.
- **The hero** is a lone gold diamond with no aura/trail/ring — it does not visibly outrank towers, and barely reads as "the hero."
- **Towers** are 3 primitives (triangle/square/circle) — distinct enough at 3, but no headroom for the 5-tower roster and no star/level expression.
- **Ally vs enemy** is carried by *position + color only*; under additive FX and pressure-red tint, that's fragile.

The fix is a **strict salience hierarchy**: importance must equal visual loudness.

---

## 2. The salience model

Five **salience channels** rank every on-screen thing. Importance is the sum; higher
tiers win **every** channel they need to:

| Channel | Low → High |
|---|---|
| **Size** | particle < projectile < normal < elite < tower < hero < boss |
| **Luminance/contrast** | dim, recedes → bright, blooms |
| **Motion uniqueness** | drifts with the swarm → unique, eye-catching cadence |
| **Silhouette uniqueness** | shared shape family → one-of-a-kind outline |
| **Framing** | none → outline, aura, screen-edge indicator, health banner |

**Inviolable rule:** *a lower tier never out-shouts a higher tier.* Particles and
projectiles may be numerous but must stay small, dim, and short — they can never
visually compete with a unit. (LOD already enforces part of this; §8 extends it.)

---

## 3. The 7-tier hierarchy

Ordered most → least salient. Each tier's required treatment:

### 1 · Bosses — *"oh no."* (max salience)
- **Size:** 2.5–4× a normal enemy; breaks the grid.
- **Unique silhouette** per boss (never a scaled-up normal).
- **Framing:** a persistent **boss health banner** (top of the LEFT gutter or under the TOP bar), a slow rotating **aura ring**, and a **screen-edge arrow** while off-screen-top (descending).
- **Motion:** deliberate, weighty (slow, ground-shaking idle), distinct from swarm drift.
- **Entrance:** brief screen-darken + name card ("BROOD TYRANT") + the pressure vignette spikes.
- **Color:** faction body + a hot core that pulses; immune to LOD culling (always full detail).

### 2 · Heroes — your hands on the field
- **Size:** larger than towers; **gold core + class-hue rim + soft ground halo + motion trail** (the constant "hero" signature, STYLE-GUIDE §7).
- **Unique silhouette** (not a tower shape) + per-hero form (`PLACEHOLDER-ART.md`).
- **Framing:** always full-detail (never LOD-culled); a faint **selection/positional ring** so you can find it in a swarm.
- Must read as **ally** instantly (cool rim, bottom-origin, gold) even amid red threat tint.

### 3 · Towers — your investments
- **Class color + per-tower silhouette** (5 distinct shapes, §`PLACEHOLDER-ART`).
- **Star/level glow** scales emissive intensity (STYLE-GUIDE §11) so a maxed tower visibly outranks a fresh one.
- Anchored in the defensive zone (positional identity). Overcharge halo already implemented.
- Stationary + "breathing" idle so they read as *structures*, distinct from mobile units.

### 4 · Elite enemies — priority targets
- A **normal enemy + an unmistakable marker**: a bright **rank chevron/crown** above, a thicker **faction-accent outline**, and a small **aura**.
- ~1.4–1.7× normal size; full-detail through LOD when the swarm allows.
- The player must pick elites out of a swarm in <0.5s.

### 5 · Normal enemies — the swarm
- **Faction shape family + faction color** (not all circles). Small, mostly desaturated bodies so the swarm reads as *texture/mass*, with the **bright bits** (boils, optics) carrying identity.
- Universal threat cues: **HP pip** above, **danger aura** once past the line (already implemented).
- LOD-cullable embellishments (already implemented) — the swarm degrades gracefully.

### 6 · Projectiles — fast, legible, secondary
- **Class-tinted**, with a **minimum size floor** (so they're visible) but **capped max** (so they don't read as units). Short trails for direction.
- Distinct shape per family: Kinetic = sharp dart, Caustic = lobbed glob (already bigger), etc.
- Never bloom brighter than the unit that fired them.

### 7 · Particles — flavor, never information-bearing on their own
- Smallest, dimmest, shortest, **semi-transparent**, **pooled & capped** (`PARTICLE`/`PERF` — already implemented).
- Status/class/faction-tinted so they *reinforce* reads (Shred = yellow burst, death = faction motes) but carry no read a unit doesn't already carry.
- First thing to shed under load.

---

## 4. Instant threat identification

- **Ally vs enemy is a hard contract** (STYLE-GUIDE §6): allies = cool rim + gold(hero)/class hue + bottom origin; enemies = faction body + **desaturated-red HP pip** + (in-zone) red danger aura + top origin. Never rely on hue alone.
- **Faction at a glance** = **shape family + signature accent** (Parasite jagged/chartreuse, Machine boxy/ember, Corporate sleek/white-cyan, Hive bulbous/crimson, Aberration glitching). One look = "what am I fighting."
- **Elite = marker**, **Boss = framing** (banner + aura + edge arrow). These never share treatment with normals.
- **Most-dangerous-first:** the danger aura on in-zone enemies (done) + a subtle brightening of enemies nearest the line draws the eye to what's about to breach (matches the AI/tower targeting that already prioritizes line-distance).

---

## 5. Effects: impactful, not obscuring

- **Additive budget:** cap total additive-blend coverage; when a swarm/FX storm exceeds it, **fade FX transparency first** (units keep full opacity). FX serve units, never bury them.
- **Status over the unit, not across the screen:** keep status as **rings/auras on the unit** (already done) rather than full-screen washes (reserve full-screen for the pressure vignette and boss entrances only).
- **Reaction punch with restraint:** Shred-style flash + named float (done) is the model — bright, *brief* (<0.5s), local. Big combos scale the float, not the screen.
- **Clear cones:** the area immediately around the hero and the hive core gets a slight FX-density reduction so your two most important things are never fully occluded.
- **Telegraph, then resolve:** boss/elite attacks and mortar impacts get a quick ground-decal telegraph before the payload, so AoE is anticipated, not surprising.

---

## 6. Concrete recommendations (prioritized)

Building on the current renderer — what to change, highest impact first:

| # | Change | Why | Effort |
|---|---|---|---|
| 1 | **Faction shape language for enemies** (replace the universal circle) — see `PLACEHOLDER-ART.md` | Single biggest clarity win; enables tier 4/5 + faction ID | M |
| 2 | **Boss tier for the Tyrant**: 3× size, unique silhouette, aura ring, health banner, name-card entrance, LOD-immune | Bosses are currently invisible-as-bosses | M |
| 3 | **Elite markers**: chevron + thick accent outline + aura on elite variants | Priority targeting in swarms | S |
| 4 | **Hero signature**: gold core + class-hue rim + ground halo + motion trail + locator ring | Hero must outrank towers & read as ally | S |
| 5 | **Ally rim / enemy threat-tint contract** applied uniformly | Robust ally/enemy parse under FX | S |
| 6 | **Per-tower silhouettes** for the 5-tower roster + **star-glow** scaling | Tower identity + progression read | M |
| 7 | **Projectile size floor/cap + class tint + short trail** | Keep tier 6 legible but subordinate | S |
| 8 | **Additive-coverage cap** (extend the existing LOD/PERF budget to FX alpha) | Guarantees FX never bury units at peak load | S |
| 9 | **Clear cones** around hero + core | Never lose your two key anchors | S |

Items 1–4 deliver ~80% of the readability gain. All are procedural (no assets) and
fit the existing `drawEnemy`/`drawTower`/`drawHero`/particle structure.

---

## 7. Salience audit (target end-state)

| Element | Size | Luminance | Motion | Silhouette | Framing |
|---|---|---|---|---|---|
| Boss | ●●●●● | ●●●●● | ●●●●○ | unique | banner+aura+arrow |
| Hero | ●●●●○ | ●●●●○ | ●●●●● | unique | halo+ring+trail |
| Tower | ●●●○○ | ●●●○○ (scales w/ stars) | ●○○○○ (breathe) | 5 distinct | overcharge halo |
| Elite | ●●●○○ | ●●●○○ | ●●○○○ | family+marker | chevron+outline |
| Normal | ●●○○○ | ●○○○○ | ●●○○○ | faction family | HP pip |
| Projectile | ●○○○○ | ●●○○○ | ●●●●● | class dart/glob | short trail |
| Particle | ○○○○○ | ○○○○○ | ●●○○○ | n/a | none |

Read top-to-bottom, loudness strictly decreases — that ordering *is* readability.
