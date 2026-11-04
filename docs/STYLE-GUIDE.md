# STYLE-GUIDE.md — Visual Style Guide (canonical art direction)

The single source of truth for the game's **battlefield look** (art direction:
enemies, arenas, luminance, render specs). The game-wide identity layer above it —
UI, audio, motion, notification/reward language — lives in `docs/VISUAL_IDENTITY.md`
+ `docs/UI_STYLE_GUIDE.md` + `docs/DESIGN_LANGUAGE.md`. Companion to `DESIGN.md`
(fiction), `TOWERS.md` / `HEROES.md` / `ENEMIES.md` (content), and the live code
(`src/index.css` tokens, `src/render/renderer.ts`). The HUD, readability, and
placeholder-art specs (`HUD.md`, `READABILITY.md`, `PLACEHOLDER-ART.md`) all
derive their values from here.

> **Status:** v0 art bible. Hex values marked _(impl)_ already exist in
> `src/index.css`; the rest are proposed and should be added as design tokens.
> Designed for a commercial indie live-service: tokenized, asset-light,
> seasonally re-skinnable.

---

## 1. Art pillars

1. **Living technology.** Nothing is purely metal or purely flesh — chrome grows
   veins, organs sprout circuitry. Every form reads as *grown, not built*.
2. **Darkness is the canvas; light is information.** The world is near-black; the
   only bright, saturated things on screen are **gameplay-critical** (your units,
   threats, reactions). Beauty comes from restraint and contrast, not clutter.
3. **Assimilation & mutation.** Growth is shown as *accretion and corruption* —
   spreading glow, pulsing veins, silhouettes that gain mass and asymmetry as they
   level. Upgrades look like the thing *becoming more itself*, not a new sprite.
4. **Clinical horror, neon dread.** Cyberpunk neon meets body-horror wetness:
   cold UI chrome framing warm, wet, twitching organics.

**The prime directive (every art decision answers to it):** _readability during a
40-enemy swarm beats spectacle, always._

---

## 2. Core color philosophy

- **Three luminance zones** keep large battles legible:
  - **Environment (0–25% luminance):** arena, grid, obstacles, panels. Desaturated, recedes.
  - **Allies & structures (40–70%):** your towers/hero/base — saturated *class* hues with a cool rim-light.
  - **Threats & events (60–100%):** enemies' threat cues, reactions, projectiles — the brightest, most saturated, most *transient* things on screen.
- **Saturation is a budget.** High chroma is reserved for things the player must act on. Idle/background art stays desaturated so action "pops."
- **Hue is never the only signal** (accessibility + swarm clarity): every meaningful color is reinforced by **shape, position, motion, or icon** (see `READABILITY.md`).

---

## 3. Color palette — neutrals & base

| Token | Hex | Use |
|---|---|---|
| `--void` | `#070a0f` _(impl: --bg)_ | deepest background, arena void |
| `--bg-arena` | `#080b11` _(impl)_ | battlefield fill |
| `--panel` | `#11161f` _(impl)_ | HUD panels |
| `--panel-2` | `#161d28` _(impl)_ | raised panel / buttons |
| `--panel-3` | `#1c2533` | hover / selected surface |
| `--line` | `#232c3a` _(impl)_ | borders, grid |
| `--line-strong` | `#3a4a63` | active borders, dividers |
| `--text` | `#d7e0ec` _(impl)_ | primary text |
| `--text-muted` | `#8a97a8` _(impl)_ | secondary text |
| `--dim` | `#808d9f` | tertiary text — still ≥ 4.5:1 on every panel (was #5b6677, 3.1:1; docs/UI-STANDARDS.md §readability) |

Grid lines sit at **3% white** (barely visible) so the play area reads as *space*,
not graph paper.

---

## 4. Class palette (towers + heroes + class UI accents)

Five Combat Classes, each a fixed hue used by its towers, its heroes, its status
FX, and its UI accents. Chosen for maximum wheel separation.

| Class | Token | Hex | Status FX | Identity |
|---|---|---|---|---|
| **Kinetic** | `--kinetic` | `#5ad1ff` _(impl)_ | Fracture (cyan shards) | cold, precise, crystalline |
| **Caustic** | `--caustic` | `#b6e84a` _(impl)_ | Corrosion (acid pools) | wet, sickly, dissolving |
| **Viral** | `--viral` | `#e24dff` | Infection (magenta spread) | virulent, branching, alive |
| **Neural** | `--neural` | `#6e7bff` | Disruption (indigo glitch) | psionic, unstable, controlling |
| **Vital** | `--vital` | `#ff7a59` _(impl)_ | Mark / overcharge (warm pulse) | warm, fleshy, life-giving |

Each hue ships as a **4-stop ramp** (used for fills, glow, rim, and dim states),
e.g. Kinetic: `#0e2a36 → #2f8fb8 → #5ad1ff → #c7f3ff`. Tokenize as
`--kinetic-900/-500/-300/-100`.

---

## 5. UI palette

| Token | Hex | Use |
|---|---|---|
| `--gold` | `#ffd24d` _(impl)_ | hero/primary highlight, currency-positive |
| `--success` | `#3fe08a` | affordable, healthy, gains |
| `--warn` | `#ffb24d` | low resource, cooldown, caution |
| `--danger` | `#ff5d73` _(impl)_ | integrity loss, base, lethal |
| **Rarity** | | (cards, gear, drops) |
| Common | `#9aa7b8` | grey |
| Rare | `#5ad1ff` | cyan |
| Epic | `#c98bff` _(impl: --rare)_ | violet |
| Legendary | `#ffd24d` | gold |
| Exotic | prismatic `#ff7ad9→#7be0ff` animated | shifting gradient (the only animated rarity) |
| **Currencies** | | (per `ECONOMY.md`) |
| Biomass | `#b6e84a` | in-run lime |
| Genome Samples | `#5ad1ff` | tower cyan |
| Hero Essence | `#ffd24d` | hero gold |
| Neural Fragments | `#6e7bff` | meta indigo |
| Mutation Fragments | `#e24dff` | card magenta |
| Equipment Components | `#9aa7b8` | gear grey |
| Prestige (Ω) | prismatic | reserved shimmer tier |

**Currency color = its system's color**, so the eye learns "indigo = Hive Tree,
magenta = cards" once and forever. Prestige currencies escalate toward the
prismatic/shimmer treatment to read as "end-game."

---

## 6. Enemy palette (factions)

The hard problem: 5 class hues + 5 faction hues on one screen. **Solution —
separate the channels.** Allies and enemies are told apart by *position, rim-light,
HP-bar, and silhouette*, **not hue**:

- **Allies** (towers/heroes): saturated class hue + **cool inner rim-light**, always anchored in the bottom defensive zone.
- **Enemies**: desaturated organic/metal **body** + one **faction signature accent** + universal threat cues — a **desaturated-red HP pip** above, and a **hostile underglow** (elites/bosses only). They always enter from the top.

| Faction | Body | Signature accent | Shape/identity |
|---|---|---|---|
| **Parasites** | pallid grey-green `#7e8a6b` | chartreuse `#aaff4d` | small, many, twitchy; jagged |
| **Machine Cult** | gunmetal `#3a4150` | ember orange `#ff7a3d` | boxy, plated, slow; hard edges |
| **Corporate Security** | slate-navy `#2a3550` | clean white-cyan `#cfe9ff` | sleek, uniform; thin neon trim |
| **Hive Organisms** | maroon flesh `#5e2330` | bruised crimson `#ff3b6b` | bulbous, asymmetric, huge |
| **Neural Aberrations** | void-black `#0a0c14` | iridescent `#b86bff⇄#7be0ff` | shifting, glitching, *wrong* |

**Disambiguation rules** where a faction accent nears a class hue:
- Machine ember vs Vital orange → Machine is *armored geometry from the top*; Vital is a *stationary organ at the base*.
- Corporate white-cyan vs Kinetic cyan → Corporate is *desaturated panels*; Kinetic *glows*.
- Neural Aberrations have **no stable hue on purpose** — the shimmer/glitch *is* the identity (reinforced by glitch motion), so they never read as an ally.

---

## 7. Hero palette

Heroes are the brightest *persistent* allies (only bosses outrank them — see
`READABILITY.md`). Each hero = **its class hue + a personal signature** + the
shared "hero" treatment:

- **Hero treatment (all heroes):** a warm `--gold` core glow + a bright cool rim, a soft ground-shadow halo, and a faint motion trail. This is the constant that says "this is a hero" regardless of class.
- **Per-hero signature:**

| Hero | Class hue | Signature |
|---|---|---|
| **Ravager** | Kinetic `#5ad1ff` | gold/cyan, aggressive forward lean, red rend-slash FX |
| **Shepherd** | Vital `#ff7a59` | warm bloom aura, orbiting drone motes |
| **Overseer** | Neural `#6e7bff` | indigo, floating, tethered glitch-lines to hijacked foes |

The current build's single hero renders gold `#ffd24d` _(impl)_ — keep gold as the
universal hero core; layer the class hue as the rim/aura.

---

## 8. Tower palette

Towers wear their **class hue** as the primary, plus a per-tower value/shape so
two Kinetic towers still differ. Current build _(impl)_: needle `#5ad1ff`, mortar
`#b6e84a`, reactor `#ff7a59`.

| Tower | Class hue | Per-tower treatment |
|---|---|---|
| Needle Spitter | Kinetic `#5ad1ff` | thin, bright, sharp tip; rapid muzzle flicker |
| Bone Mortar | Caustic `#b6e84a` | squat, darker body, glowing acid sac |
| Parasite Nest | Viral `#e24dff` | pulsing egg-cluster, dim body + bright pustules |
| Neural Obelisk | Neural `#6e7bff` | tall, slim, floating glyph-ring |
| Flesh Reactor | Vital `#ff7a59` | round, *visibly beating*, warm radial pulse |

**Overcharged** towers gain a `--vital` halo (already implemented as a faint ring).
Tower **glow intensity scales with star level** (§11) — a maxed tower is visibly
hotter than a fresh one.

---

## 9. Typography

A two-typeface system + a numeric rule. All faces are **OFL / free for commercial
use**, self-hosted & subset for live-service performance.

**SHIPPED (2026-07):** the system below is live — `public/fonts/` (latin woff2, ~71KB
total incl. the Exo 2 variable), `@font-face` at the top of `src/index.css`, preloaded
in `play/index.html`, precached by the service worker, `font-src 'self'` CSP-clean.
Body deviates from the earlier Inter recommendation **deliberately**: Inter reads like
the system fonts it replaced; Exo 2 (techy-humanist, variable 100–900) carries actual
character at the same small-size legibility. Canvas text draws the same stacks
(renderer floats/labels → Exo 2; the big assimilation banner + crit callouts → Chakra
Petch), so DOM and battlefield speak one voice.

| Role | Face (shipped) | Fallback | Notes |
|---|---|---|---|
| **Display / headers** | **Chakra Petch** 500/600/700 (700 file serves 800/900 sites) | Exo 2 → system-ui | cyber-industrial; uppercase, +0.06–0.18em tracking; generic `h1–h3` + the `.hero-name`-class sites |
| **Body / UI** | **Exo 2** variable (wght 100–900) | system-ui | the `body` base — everything inherits it |
| **Numerics (stats/damage)** | **Exo 2 + `tnum`** (body-wide `font-feature-settings`) | monospace | **tabular** so counters don't jitter |

**Type scale** (desktop, 1.0 = 16px base): 11 / 12 / 13 / 15 / 18 / 24 / 34 / 44.
- HUD stat labels: 11px uppercase, `--text-muted`, +0.05em.
- HUD stat values: 18–24px, 700, tabular, `--text`.
- Floating combat numbers: 14px bold (current), scale ±20% by magnitude; crits/reactions larger + colored.
- Never more than **3 weights** on screen (400/600/800).

Live-service: ship a **display-font seasonal swap** hook (e.g. a corrupted glyph
variant for an Aberration season) without touching layout metrics.

---

## 10. Effects, animation & particle philosophy

### 10.1 Visual effects philosophy
- **Procedural & additive.** All FX are code-drawn (shapes, gradients, `shadowBlur`, additive composite) — **no external textures** (`PLACEHOLDER-ART.md`). This keeps the build asset-light and infinitely re-tintable per class/season.
- **Telegraph > flourish.** Every effect must *communicate state* first (what hit what, which status, which reaction). Decorative-only FX are cut.
- **Status is color-coded, consistently:** Fracture = cyan rim, Corrosion = acid ring/pool, Infection = magenta tendrils, Disruption = indigo stutter, Mark = warm pulse. **Reactions** get a brief bright **flash + named float** (e.g. SHRED — already implemented) so combos are felt.
- **Additive-glow cap:** total additive coverage is budgeted (see READABILITY); when a swarm is huge, FX *fade transparency* before they fight the units for attention.

### 10.2 Animation philosophy
- **Organic + mechanical duality:** structures *breathe* (subtle scale/opacity sine, ~0.2–0.5Hz) so the hive feels alive; weapons *snap* (fast attack, ease-out recoil) so combat feels crisp.
- **Anticipation & follow-through** on every action: wind-up → fire → recoil; spawn → emerge → settle. Even 2-frame procedural easing reads as "juice."
- **Idle never dead:** towers pulse, the base heartbeat sets the run's tempo, the hero has a hover bob. Motion = aliveness = theme.
- **Curves:** ease-out for impacts, ease-in-out for breathing, linear only for travel. Keep durations short (80–250ms) so nothing lags the read.

### 10.3 Particle philosophy
- **Pooled & capped.** Fixed pools per type; over budget → recycle oldest, not spawn. A 40-enemy swarm must never tank the frame.
- **Particles are the lowest tier of attention** (READABILITY §7) — small, short-lived, semi-transparent, and **never** brighter/larger than a unit.
- **Meaningful by default:** muzzle sparks, impact puffs, death dissolves, status motes, pool bubbles. Each is **status/class-tinted** so even particles teach the player.
- **Death = dissolve, not vanish:** enemies disperse into faction-tinted motes (assimilation), reinforcing the fiction and confirming kills.

---

## 11. Progression visual language

Progression must be *seen on the unit*, not just in menus — "numbers go up" becomes
"the thing visibly evolves" (DESIGN.md mechanics-first).

| Track | Visual language |
|---|---|
| **Tower stars (1→10)** | star pips on the info card; **glow intensity + emissive detail** grow with stars; ★5/★8 forks change the **silhouette** (e.g. Railgun = longer barrel) |
| **Mastery (infinite)** | a thin **rank ring** that fills/recolors per milestone; subtle particle aura at high ranks (kept faint to protect readability) |
| **Class levels** | class-hue **keystone glyphs** on the unit base; deeper class = richer hue ramp |
| **Hero stars/gear** | gear shows as **silhouette attachments** (weapon shape, armor plating, relic mote); stars brighten the gold core |
| **Cards (run)** | drafted cards glow their **category color**; stacks add pips |
| **Rarity** | frame + name color per §5; **Exotic is the only animated frame** (prismatic) |
| **Prestige** | each layer unlocks a **palette/FX overlay** — Molt adds an ascendant shimmer, deeper layers shift toward the **prismatic Ω** treatment; a maxed account *looks* end-game |

**Rule:** escalate via **glow → emissive detail → silhouette → aura → palette
shift**, in that order, so early upgrades stay readable and only the deepest
progression earns screen-dominating shimmer.

---

## 12. Accessibility

- **Never hue-alone.** Every color signal is doubled by shape/icon/position/motion (built into the faction & hierarchy systems).
- **Colorblind modes** (live-service toggle): deuter/prot/tritanopia palettes that re-map the two riskiest pairs (Caustic↔Parasite green, Viral↔Neural purple) to safe hues; plus a **shape-tag** option (small glyph on enemy HP bars by faction).
- **High-contrast mode:** boosts unit rim-lights and dims background/FX further.
- **Reduce-motion mode:** disables breathing/idle sines and trims particle counts.
- Minimum contrast 4.5:1 for all HUD text on its panel.

---

## 13. Live-service & scalability

- **Design tokens, not hardcoded hex.** Everything above is a token (extend the existing CSS variables + a parallel JS token map the Canvas renderer reads). A season = swap a token file.
- **Silhouette & color contracts:** new towers/heroes/enemies must obey the class-hue / faction-channel / hierarchy rules so future content drops in *readably* without re-teaching the player.
- **Asset-light by mandate:** procedural geometry + FX means new content is *parameters*, not art files — fast to ship, cheap to theme, trivial to localize.
- **Seasonal hooks:** prismatic Ω treatment, corrupted display-font variant, and per-faction "event" accent swaps are pre-planned so live ops can re-skin without engineering.

> Downstream specs: HUD layout & widgets → `HUD.md`; battlefield salience tiers →
> `READABILITY.md`; concrete geometric shapes & procedural FX → `PLACEHOLDER-ART.md`.
