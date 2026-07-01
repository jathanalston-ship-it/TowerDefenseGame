# PLACEHOLDER-ART.md — Geometric Placeholder Graphics & Implementation

A consistent, asset-free visual language for towers, heroes, and enemies — good
enough to ship a *handsome* prototype before final art. Derives shapes/colors from
`STYLE-GUIDE.md`, salience tiers from `READABILITY.md`. Grounded in the current
Canvas renderer (`src/render/renderer.ts`: `drawTower`/`drawEnemy`/`drawHero`, the
`pulse(t,…)` helper, `rs.time`, the LOD `detail` flag, the pooled particles, and
`ENEMY_DEFS`). No code — design + implementation recommendations.

---

## 1. Philosophy & constraints

- **Simple geometry, procedurally drawn.** Every unit is a small composition of
  polygons/arcs/gradients drawn in Canvas 2D. **No external textures or sprites** —
  the build stays asset-light and infinitely re-tintable (STYLE-GUIDE §13).
- **Identity from four channels** (never one): **shape, color, animation,
  silhouette**. A unit must be recognizable as a **black silhouette** alone.
- **Procedural FX only:** glow via `shadowBlur`/radial gradients, motion via
  `rs.time` + `pulse()`, death via faction-tinted particle dissolves.
- **Respect the budget:** all embellishment gates behind the existing `detail`
  (LOD) flag and the `PERF`/`PARTICLE` caps — a 200-enemy swarm must stay smooth.

---

## 2. Shared construction kit (build once, reuse everywhere)

Recommend a shared shape kit (LANDED as `src/render/vfx.ts`) so towers/heroes/enemies speak one language and
the renderer stays DRY. Primitives:

| Primitive | Use |
|---|---|
| `polygon(cx,cy,r,sides,rot)` | regular n-gons (hex bodies, triangles) |
| `spiky(cx,cy,r,points,jag)` | jagged parasite/aberration forms |
| `blob(cx,cy,r,lobes,t)` | wobbling organic mass (Hive, reactor) via summed sine radii |
| `dart(cx,cy,len,w,angle)` | projectiles & fast units |
| `glow(cx,cy,r,color,intensity)` | additive radial bloom (`shadowBlur` or gradient) |
| `rim(path,color)` | the **ally cool-rim / enemy accent-outline** contract |
| `ring(cx,cy,r,rot,segments)` | rotating glyph/aura rings |

Two cross-cutting treatments (READABILITY §4):
- **Ally signature:** cool inner rim + (hero) gold core.
- **Enemy signature:** faction body + accent outline + red HP pip; **danger aura** in-zone (already implemented).

---

## 3. Towers — distinct via shape · color · animation · silhouette

Each tower = its **class hue** (STYLE-GUIDE §8) + a **unique silhouette** + an
**idle** and a **fire** animation. Current build draws needle=triangle,
mortar=square, reactor=circle — replace with:

| Tower | Class | Silhouette | Idle | Fire / active |
|---|---|---|---|---|
| **Needle Spitter** | Kinetic cyan | tall **barbed spire** (narrow triangle + side barbs, sharp tip) | slight sway, tip glint | tip flares; quick recoil flick; cyan **dart** muzzle |
| **Bone Mortar** | Caustic lime | squat **hex drum** with a domed **acid sac** on top | sac bubbles (pulse alpha) | sac dims→lobs a glob→refills; barrel kicks up |
| **Parasite Nest** | Viral magenta | cluster of **3 overlapping ovoid sacs** + bright pustule dots | pustules pulse, sacs jiggle | a sac twitches and ejects a spore mote |
| **Neural Obelisk** | Neural indigo | slim tall **obelisk** topped by a floating **rotating glyph-ring** | ring rotates, faint glyph flicker | ring flares + a brief **tether line** to its target |
| **Flesh Reactor** | Vital orange | round **pulsing heart-orb** + brighter core | visible **heartbeat** (radius pulse) | emits **overcharge tendrils** to adjacent towers (extends existing hive-tendril look) |

- **Silhouette test:** spire vs drum vs sac-cluster vs obelisk vs orb are unmistakable in black — passes.
- **Progression read (STYLE-GUIDE §11):** scale `glow` intensity + add emissive detail by **star level**; ★5/★8 forks alter the silhouette (e.g. Railgun = longer barrel, Autocannon = twin tips). Requires the renderer to know a tower's star/level (see §7 data notes).
- Overcharge halo already exists — keep, and let the Reactor's tendrils visibly originate it.

---

## 4. Heroes — distinct via size · movement · visual effects

All heroes share the **hero signature** (gold core + class-hue rim + ground halo +
motion trail + locator ring; READABILITY tier 2). They differ by form, movement,
and FX. Current build: one gold diamond — replace/extend with:

| Hero | Class | Form (largest of the mobile units) | Movement | Signature VFX |
|---|---|---|---|---|
| **Ravager** | Kinetic | chunky forward-leaning **blade/arrowhead** | fast aggressive **dashes**, strong trail | red **rend-arc** slash on hit; cyan rim |
| **Shepherd** | Vital | soft **orb with orbiting drone motes** (halo of small circles) | drifts/hovers mid-field | warm **bloom aura**; expanding **heal rings** to towers |
| **Overseer** | Neural | floating **angular eye-diamond** + rotating ring | glides, repositions, never grounded | indigo **tether lines** to disrupted/hijacked enemies; vulnerability marks |

- **Size:** heroes are clearly larger than towers and never share a tower silhouette.
- **Movement *is* identity:** Ravager snaps, Shepherd floats, Overseer glides — readable even before FX.
- The current single hero stays a gold diamond as **Ravager's placeholder**; layer the rim/halo/trail/ring first (cheap, big readability win — READABILITY rec #4), then the per-hero forms as heroes 2–3 unlock.

---

## 5. Enemies — distinct via shape language · color coding · faction identity

The key change: **stop drawing every enemy as a circle.** Give each **faction** a
**shape family** (silhouette identity) + its **signature accent** (STYLE-GUIDE §6).
Within a faction, **size = tier** and **motion = behavior**.

| Faction | Shape family | Accent | Motion feel |
|---|---|---|---|
| **Parasites** | small **jagged spikes** (3–5 pt spiky) | chartreuse | twitchy, fast, swarming |
| **Machine Cult** | hard **hexagons/rects** with plating notches | ember | slow, rigid, advancing |
| **Corporate Security** | clean **chevrons/arrowheads**, thin neon trim | white-cyan | uniform, disciplined |
| **Hive Organisms** | wobbling **bulbous blobs** with asymmetric tumors | crimson | heavy, lumbering |
| **Neural Aberrations** | **glitching** unstable polygons (jitter, partial alpha, rotate) | iridescent | warps, flickers, *wrong* |

**Mapping the current 7 archetypes onto families** (immediate implementation; the
data already carries `color` + `behavior`):

| Archetype (code) | Family / form | Tier cue |
|---|---|---|
| runner (Skitterling) | Parasite spiky-tri | small |
| rusher (Razor Sprinter) | Parasite **dart** (sharpened) | small, fast → motion-blur trail |
| brute (Carrion Brute) | Hive **blob** | medium, wobble |
| tank (Carapace Hauler) | Machine **hex** plated | large, slow |
| flyer (Spore Drifter) | Parasite **floating spiky orb** (shadow+lift already done) | medium, drifts |
| burrower (Gut Tunneler) | Hive **pointed drill** that half-submerges | medium |
| **tyrant (Brood Tyrant)** | **BOSS** — large multi-lobed Hive/Parasite mass, pulsing core, spikes | **2.5–4×**, aura, banner |

**Elite & boss variants (READABILITY tiers 1 & 4):**
- **Elite** = the family form + **rank chevron above + thick accent outline + small aura**, ~1.5× size.
- **Boss** (Tyrant today) = unique enlarged silhouette, slow weighty idle, rotating **aura ring**, a **health banner**, a **name-card entrance**, and **LOD-immunity** (always full detail).

**Death = faction-tinted dissolve** (reuse `PARTICLE.death`): enemies burst into
motes of their faction accent — confirms kills *and* sells "assimilation."

---

## 6. Projectiles & status FX (formalize the existing)

- **Projectiles by class:** Kinetic = sharp cyan **dart** + short trail; Caustic =
  lobbed lime **glob** (already larger) with a splat decal; Viral = small magenta
  homing **spore**; Neural = quick indigo **bolt**; Vital = no projectile (pulse).
  Apply the **size floor/cap** from READABILITY §3 tier 6.
- **Status FX (mostly implemented — keep & standardize):** Fracture = cyan shard
  rim, Corrosion = green ring + ground pool, Infection = magenta tendrils, Disruption
  = indigo stutter/desat, Mark = warm ring.
- **Reactions = bright, brief, named floats** (Shred exists): add Plague / Mind Rot /
  Overstrike / etc. with their pair-color flash, per the matrix in `TOWERS.md`.

---

## 7. Implementation recommendations

**Where it plugs in (existing functions):**
- `drawTower(ctx,t)` → switch on `t.kind` into the 5 procedural builders (§3); pass `rs.time` for idle/fire animation (recoil/muzzle can be derived from `t.cooldown` vs the def's `fireInterval`, or add a small `t.flash` timestamp on fire).
- `drawEnemy(ctx,e,detail)` → switch on a **faction/shape family**, not a circle. Reuse the `detail` flag exactly as now (skip rim/aura/trail when the swarm is huge).
- `drawHero(ctx,rs)` → add the shared hero signature first; switch on a hero `kind` for per-hero forms when heroes 2–3 land.

**Recommended data additions (centralized in `config.ts`, per CLAUDE.md):**
- `EnemyDef.faction` + `EnemyDef.shape` (e.g. `'spiky'|'hex'|'chevron'|'blob'|'glitch'|'dart'|'boss'`) and a `tier` (`'normal'|'elite'|'boss'`). Drives `drawEnemy` + elite/boss treatment with zero new branching logic.
- Tower render data needs **star/mastery level** to scale star-glow (expose on the tower or via `RenderState`).
- Hero render data needs a **kind** (for multi-hero forms) — already structured per-hero in `updateHero`.

**Techniques & performance:**
- **Glow** via `ctx.shadowBlur`/radial gradients — cheap in moderation, but **gate behind `detail`** and cap concurrent glows; never glow swarm normals.
- **Animation** from `rs.time` + the existing `pulse()`; keep per-unit phase offset by `e.id`/`t.id` (the renderer already does this for tendrils) so the swarm doesn't pulse in lockstep.
- **Silhouette-first:** draw the solid body, then the accent/rim, then (if `detail`) glow/trail — so the LOD fallback is always a clean readable shape.
- **Death dissolve** reuses the pooled particle system (`PARTICLE.death`) — emit faction-accent motes; respects `PERF.maxParticles`.
- Keep everything in the **token map** (STYLE-GUIDE §13) so a season re-skin is a data swap.

**Phased plan (highest clarity ROI first — matches READABILITY §6):**
1. **Enemy faction shapes + boss/elite tiers** (`shapes.ts` + `drawEnemy` switch + Tyrant boss treatment). Biggest readability win.
2. **Hero signature** (rim/halo/trail/ring) on the current hero.
3. **Tower silhouettes** (the 5 forms) + **star-glow** scaling.
4. **Projectile/status/reaction polish** + the shared `shapes.ts` cleanup.

Each phase is independently shippable, asset-free, and leaves the build green — a
progressively better-looking prototype with no external art dependency.
