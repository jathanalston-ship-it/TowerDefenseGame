# HEROES.md — Hero System (canonical spec)

Detailed design of the three launch heroes, hero-slot progression, and the
autonomous-unit model. Companion to `DESIGN.md`, `PROGRESSION.md`, `TOWERS.md`.
Heroes share the five Combat Classes with towers (`TOWERS.md`).

> Heroes are **autonomous battlefield units** — they move, target, and fight on
> their own; the player *steers* them (abilities, an ultimate, a stance, and an
> optional move/focus ping), but does not micro every step. They are the
> **active-skill** layer over the **placement** layer of towers.

> **Implementation status (vertical slice):** all **three** launch heroes are built
> as data-driven `HeroDef`s with distinct autonomous AI — **Ravager** (`dive`: charges
> the deepest threat, melee + Fracture), **Shepherd** (`guard`: holds the zone, mends
> Nucleus Integrity + vital pulse), **Overseer** (`control`: floats to the densest crowd,
> fields Disruption). Each has its signature ability (Apex Leap / Bloom / Mass Override) —
> the Shepherd's **Bloom** now also grants the protector a brief **self-shield** (absorb
> pool soaked before HP), the first consumer of the `shield` ability component.
> Each has unique movement + targeting, per-hero **Stars + infinite Mastery** (Hero Lab), and an
> **equipment fold seam** (`HeroMods`) ready for `EQUIPMENT.md`. You **field one** hero
> per run (pick it in the Hero Lab); the engine carries a hero **roster** (`Game.heroes[]`)
> so slot 2/3 is "push another hero in." ★4–★10, forks, and the slot-unlock economy remain
> designed-but-future. Balance values live in `src/core/config.ts`.

---

## Autonomous-unit model

How a hero behaves on the field (applies to all heroes; per-hero flavor in their AI
profile):

- **Movement.** The hero roams its **leash zone** (a region you can drag/re-anchor),
  pathing to engage per its role — melee dives the front, support hugs valuable
  towers/Nucleus, controller floats to the densest/most dangerous cluster.
- **Auto-targeting.** Each hero has a default **target priority** (e.g., Ravager →
  highest-HP/elite; Overseer → densest cluster). ★2 of each hero sharpens this.
- **Player steering (no full micro):**
  - **Abilities** — 2–3 active skills on cooldown + one **Ultimate**, cast
    automatically by smart-AI *or* manually (player toggle per ability).
  - **Stance** — *Aggressive* (push forward, dive), *Defensive* (guard Nucleus/
    towers), *Hold* (stay on anchor). Stance reshapes the AI.
  - **Ping/Focus** — tap a point to reposition, or an enemy to focus-fire, for a few
    seconds before AI resumes.
- **Death & revival.** Heroes have HP; at 0 they're downed and **respawn after a
  timer** (shortened by progression/items), not permanently lost. Some gear changes
  this rule (`EQUIPMENT.md` — Second Heart, Immortal Coil).
- **Why autonomous:** keeps the game a *tower-defense* (placement + economy is the
  core decision space) while heroes add a controllable, high-skill-ceiling layer —
  active players micro abilities/positioning for more value; casual players let the
  AI drive and still benefit (pillar #5: active beats idle, idle still pays).

Each hero follows `PROGRESSION.md`: four permanent axes — **Stars** (Hero Essence,
mechanics + ★5/★8 forks), **Mastery** (infinite log), **Class** (shared pool +
keystones), **Equipment** (`EQUIPMENT.md`). Star stat per level is light (+8%); the
point of a star is a *mechanic*.

---

## 1. RAVAGER — Kinetic (frontline bruiser / dive DPS)

**Lore.** The hive's first weaponized avatar — a hulking apex predator fused from
assimilated megafauna and a gutted corpo war-mech. It was the hive's first taste of
*hunting*, and it never lost the appetite. The Ravager leads from the front because
it has never once considered the back.

**Role.** Frontline melee DPS / dive / bruiser. Charges the strongest threats,
cleaves, and applies **Fracture** (Kinetic) to set up reactions.

**Base abilities.**
- *Cleave* (auto) — melee arc, hits multiple adjacent enemies.
- **Rend** — gap-close strike that bursts Fracture stacks onto the target + nearby.
- **Frenzy** — temporary big attack-speed + move-speed window.
- **Ult — Apex Predator** — leap across the lane, AoE strike, execute low-HP enemies.

**Star progression.**

| ★ | Unlock |
|---|---|
| 1 | Melee cleave bruiser; auto-charges nearest threat |
| 2 | **Bloodscent** — prioritizes elites/low-HP%; faster charge |
| 3 | **Rend** ability unlocked (gap-close + Fracture burst) |
| 4 | **Carnage** — kills grant stacking atk-speed + lifesteal |
| 5 | **FORK — Berserker** (more damage the lower his HP) **/ Juggernaut** (more armor/sustain the more enemies near) |
| 6 | **Open Wounds** — his Fracture enables Kinetic reactions |
| 7 | **Frenzy** ability unlocked |
| 8 | **FORK — Reaver** (Rend becomes an AoE cleave) **/ Slayer** (Rend single-target executes — boss focus) |
| 9 | **Unstoppable** — immune to CC/displacement during Frenzy & Ult |
| 10 | **SIGNATURE — Apex Predator** ult upgraded: leaps refund cooldown per kill (chain across a wave) |

**Mastery rewards.** Log damage ramp **plus**: M25 +Carnage stack cap · M50 Rend
cooldown −15% · M100 reviving is 30% faster + returns with Frenzy · M250 executes
heal him · Ranks: titles + +1% lifesteal.

**Infinite class progression.** Draws on the shared **Kinetic** keystone tree
(`TOWERS.md` — Overpenetration / Lethality / Momentum / Exposed Nerve / Apex
Caliber), so leveling Kinetic powers Ravager *and* Needle Spitter. Post-Apex,
gains a personal **Avatar Paragon** track (infinite, respec-able): small % + perks
like "Frenzy can be active permanently below 25% HP."

**Strengths.** Top mobile single-target/cleave DPS; dives backline & elites;
self-sustains via lifesteal; applies Fracture for the whole build's reactions.
**Weaknesses.** Melee = exposed to AoE/hazards; overextends and dies; needs healing
support; weak vs ranged kiters/fliers; limited *true* AoE without Reaver.

**Synergy with towers.**
- **Needle Spitter** — both stack Fracture → fast **Shred** (with Bone Mortar) and
  consistent crit setups; Ravager front-loads stacks Needle Spitter capitalizes on.
- **Flesh Reactor / (Shepherd)** — overcharge + healing let him dive recklessly.
- **Neural Obelisk** — vulnerability makes his dives delete elites; **Overstrike**
  guarantees crits on disrupted targets he leaps onto.
- **Bone Mortar** — he holds enemies in pools; Shred melts the armored ones.

---

## 2. SHEPHERD — Vital (support / summoner / sustain)

**Lore.** A gentle-monstrous caretaker grown from assimilated medical and
agricultural systems — part nurse, part farmer, part thing-that-should-not-be. It
"shepherds" the swarm: tending towers like crops, herding a flock of bio-drones,
and keeping the Nucleus beating long after it should have stopped.

**Role.** Support / sustain / summoner. Heals and shields towers & Nucleus,
overcharges the hive (Vital), and commands a **Flock** of bio-drones that fight.

**Base abilities.**
- *Tend* (auto) — passive heal aura to nearby towers/Nucleus; light drone command.
- **Graft** — shield + heal + temporarily empower a target tower.
- **Flock** — summon/refresh bio-drones that attack and infect (chip + blocking).
- **Ult — Bloom** — AoE mass-heal + buff + spawn a burst of drones.

**Star progression.**

| ★ | Unlock |
|---|---|
| 1 | Heal aura + small Flock of bio-drones |
| 2 | **Triage** — auto-heals the most endangered tower/Nucleus |
| 3 | **Graft** ability unlocked (shield/heal/empower a tower) |
| 4 | **Fertile Ground** — drone kills generate bonus biomass |
| 5 | **FORK — Warden** (stronger shields, tower/Nucleus protection) **/ Broodmother** (bigger, stronger Flock) |
| 6 | **Symbiosis** — her Marks enable Vital reactions |
| 7 | **Bloom** ability unlocked |
| 8 | **FORK — Lifeweaver** (overhealing → team shields) **/ Beastmaster** (drones evolve/gain abilities during a run) |
| 9 | **Eternal Garden** — dead drones have a chance to instantly respawn |
| 10 | **SIGNATURE — Genesis Bloom** ult upgraded: mass heal + full overcharge + a temporary elite **Apex Drone** guardian |

**Mastery rewards.** Log ramp on heal/aura/drone strength **plus**: M25 +1 drone ·
M50 Graft also cleanses · M100 auras persist 3s after she leaves · M250 drones
inherit one of your tower's status types · Ranks: +1% heal power.

**Infinite class progression.** Shared **Vital** keystone tree (Rich Soil / Conduit
/ Transfusion / Vital Resonance / Living Hive) — powers Shepherd *and* Flesh
Reactor. Avatar Paragon flavor: "drones count as towers for adjacency/overcharge,"
"Bloom cooldown scales with biomass spent."

**Strengths.** Keeps Ravager & towers alive; drone DPS scales and bodies-block;
amplifies economy + overcharge (Vital); enables Bloom Rot/Harvest; shines in long &
endless runs.
**Weaknesses.** Low personal DPS; value depends on having things worth protecting;
drones are fragile to AoE; slow to snowball; weak solo early.

**Synergy with towers.**
- **Flesh Reactor** — stacks Vital hard: overcharge + heals + Living Hive = an
  unkillable engine; **Synaptic Bloom** & **Ferment** light up.
- **Parasite Nest** — her drones spread **Infection**; **Bloom Rot** turns infected
  deaths into *more* friendly spores (a self-feeding army).
- **Any DPS tower** — Graft-empowered + overcharged towers spike hard.
- **Ravager** — her healing is what lets him dive without dying.

---

## 3. OVERSEER — Neural (controller / commander / hijacker)

**Lore.** A detached intelligence node assimilated from a corporate AI command
core — cold, patient, and utterly without mercy. It does not fight the enemy; it
*reads* them, finds the exploit, and rewrites them into assets. To the Overseer,
every hostile is just misconfigured hardware.

**Role.** Control / debuff / hijack commander. Slows, makes enemies vulnerable, and
converts them to your side — a pure force-multiplier whose damage is *your build's*
damage.

**Base abilities.**
- *Glitch* (auto) — projects an AoE field: slow + **Vulnerability**.
- **Hijack** — convert a target enemy to fight for you (capped count).
- **Subjugate** (passive) — hijacked units are buffed and inherit some abilities.
- **Ult — Mass Override** — hijack/mind-control a chunk of the current wave at once.

**Star progression.**

| ★ | Unlock |
|---|---|
| 1 | Glitch field (AoE slow + vulnerability); floats & repositions |
| 2 | **Priority Routing** — auto-targets the most valuable cluster/elite |
| 3 | **Hijack** ability unlocked |
| 4 | **Data Harvest** — disrupted-enemy deaths refund biomass |
| 5 | **FORK — Tyrant** (Hijack stronger, can take elites) **/ Saboteur** (Glitch larger, deeper vulnerability) |
| 6 | **Neural Link** — his Disruption enables Neural reactions |
| 7 | **Mass Override** ult unlocked |
| 8 | **FORK — Puppetmaster** (more simultaneous hijacks) **/ Oracle** (vulnerability massively amplifies *reactions*) |
| 9 | **Cascading Control** — a hijacked enemy's death hijacks a nearby enemy (chain) |
| 10 | **SIGNATURE — Total Dominion** ult upgraded: convert a huge wave portion *and* grant them your overcharge/buffs |

**Mastery rewards.** Log ramp on field size / vulnerability % **plus**: M25 +slow ·
M50 +1 hijack cap · M100 hijacked allies keep elite abilities · M250 vulnerability
fully affects bosses · Ranks: +1% vulnerability.

**Infinite class progression.** Shared **Neural** keystone tree (Deep Slow /
Authority / Synaptic Overload / Marked for Death / Puppeteer) — powers Overseer
*and* Neural Obelisk. Avatar Paragon flavor: "+hijack cap per Paragon tier,"
"Glitch also applies a stacking damage-amp."

**Strengths.** Enormous force-multiplication (vulnerability amplifies *everything*);
turns elites against the wave; crowd control; enables Mind Rot/Overstrike/Dissolve;
scales with the rest of your build rather than competing with it.
**Weaknesses.** Near-zero personal damage (pure enabler); hijack caps/cooldowns;
needs a damage core; fragile/expensive; useless in a vacuum.

**Synergy with towers.**
- **Neural Obelisk** — stacked control + vulnerability; double hijack pressure.
- **Parasite Nest** — hijack an infected enemy → **Mind Rot** super-spreader that
  walks the plague back through the wave.
- **Needle Spitter** — **Overstrike** = guaranteed crits on disrupted elites.
- **Bone Mortar** — **Dissolve** shreds shielded/armored packs he's slowed into pools.

---

## Hero triad summary

| Hero | Class | Identity | Personal DPS | Carries the team via |
|---|---|---|---|---|
| **Ravager** | Kinetic | dive bruiser | **High** | killing + Fracture setup |
| **Shepherd** | Vital | support/summoner | Low | sustain + drones + overcharge |
| **Overseer** | Neural | controller | ~None | vulnerability + hijack (amplifies *your* damage) |

Distinct roles, distinct classes, distinct failure modes. The "ideal" trio
(Ravager + Shepherd + Overseer) is a classic damage/sustain/control core — but
since slots unlock over time and classes are shared with towers, players build
toward many other combinations.

---

## Hero Lab — Champion Select (UI)

The Hero Lab is a **champion-select**, not a roster spreadsheet: a scrollable roster
**rail** (future-proof for 30+) frames ONE focused hero at a time on a dedicated page.
The whole page is tinted by the hero's color (`--hc`) so each hero feels distinct.

- **Portrait** (`ui/components/HeroPortrait.tsx`) — procedural, asset-free, animated
  (rotating class aura, breathing core, orbiting motes, class sigil), driven purely by
  `HeroDef` (color + class + behavior) + mastery rank. No art needed for new heroes.
- **Identity flavor** (`core/heroLore.ts`) — epithet / tagline / specialization / role,
  authored for the shipped heroes and **derived from `HeroDef` otherwise** (30+ ready).
- **Read-model** (`state/heroView.ts → heroDetail(save, kind)`) — folds stars, mastery
  (rank + bar + perks), bonuses, current loadout, specialization, lifetime stats, and the
  next unlocks into one view object. Pure; tested in `state/heroLab.test.ts`.
- **Ownership stats** — per-hero **lifetime kills** + **favorite equipment** are banked for
  the fielded hero in `meta.finishRun` (save v9: `heroKills`, `heroFavEquip`); runs-fielded
  reuse `stats.heroUsage`. Sim untouched → golden-safe.
- The shared **Armory** (EquipmentPanel) sits below for equip/craft; the page shows the
  live loadout and points to it.

---

## Hero slot progression

You command **1 → 2 → 3** heroes. Going wide is a *step-change*, not a stat bump, but
carries an opportunity cost (Hero Essence/gear spread thinner), so 2-hero focus vs 3-hero
breadth is a real choice.

### Slot 1 — from the start
Begin with one hero (default **Ravager**, the most legible "go hit things" unit for
onboarding; the others unlock early). Teaches the autonomous-unit model on one body
before adding more.

### Slot 2 — Phase 1 unlock (~2–15h)
- **Condition:** defeat the first major boss (the **Stage-5 Apex**) **and** purchase
  the **"Twin Avatar"** node in the Hive Tree (Roster branch).
- **Cost:** ~one early Hive-Tree investment in Neural Fragments (intentionally cheap — this is
  a Phase-1 "the game opens up" moment).
- **Impact:** two heroes = first real hero *synergy* (e.g., Ravager dives while
  Shepherd keeps him alive; or Overseer disrupts while Ravager executes). Active
  ability juggling roughly doubles.

### Slot 3 — Speciation prestige unlock (~15–80h)
- **Condition:** reach **Speciation** (Prestige Layer 2) — slot 3 is one of its
  headline rewards (`DESIGN.md §12`, `PROGRESSION.md §5.2`) — then spend a small
  **Splice Threads** cost to socket it.
- **Cost:** prestige milestone + minor Splice Threads.
- **Impact:** the full damage/sustain/control trinity (or a 2-class fusion build with
  a flex hero). Combined with multi-lane (Hivemind) later, a third hero becomes
  essential for covering parallel lanes.

> **Design intent:** slot 2 is an *early* dopamine gate (cheap, exciting); slot 3 is
> a *prestige* reward (earned, transformative). Spacing them keeps "the next hero
> slot" as a visible long-horizon goal, and ties hero breadth to the prestige ladder
> rather than to raw grind.

### The "focus vs breadth" tension (anti-power-creep)
More heroes ≠ strictly better: Hero Essence, gear, mastery, and your attention are
finite. Two highly-invested heroes can out-perform three thin ones in many builds,
so the slot count is a *build lever*, not a free power-up — preserving meaningful
choice instead of "always run 3 maxed."

### Interactions with other systems
- **Class XP:** each hero pumps its class (shared with towers) — adding the Overseer
  deepens **Neural** for the Obelisk too.
- **Equipment:** every slot adds 3 gear slots (`EQUIPMENT.md`) → more set pieces, more
  relics, more build space (and more to itemize).
- **Reactions:** more heroes = more status-appliers on the field = more/faster
  reactions; a control+DoT+Vital trio chains Mind Rot → Bloom Rot trivially.
- **Multi-lane (Hivemind):** slot 3 is what makes parallel-lane defense tractable.

### Implementation status — SHIPPED (was previously design-only)

The 1 → 2 → 3 slot progression is implemented and unit-pinned (`state/heroSlots.test.ts`).
The aspirational unlock hooks above (Twin Avatar node, Speciation Layer 2) do not exist yet,
so the **shipped unlock is PRESTIGE-GATED** — the natural long-horizon lever:

| Slot | Unlock (shipped) | config |
|------|------------------|--------|
| 1 Prime | from the start | `HERO_SLOTS[0].molts = 0` |
| 2 Twin | after your **1st Molt** | `HERO_SLOTS[1].molts = 1` |
| 3 Trinity | after your **3rd Molt** | `HERO_SLOTS[2].molts = 3` |

Conditions are DATA in `config.HERO_SLOTS` (one row per slot; `molts` = required Prestige
count) — retune, or swap to a future Twin-Avatar/Speciation gate, in one place.

**Systems modified (this feature):**
- `core/config.ts` — `HERO_SLOTS` / `HeroSlotDef` / `MAX_HERO_SLOTS` (the data-driven unlock ladder).
- `save/saveStore.ts` — new `heroLoadout: HeroKind[]` (schema **v11**), migrated from the legacy
  `selectedHero`; `sanitizeLoadout` resolves aliases, dedupes, clamps.
- `state/meta.ts` — `heroSlotsUnlocked` / `fieldedLoadout` / `heroSlotView` (pure) + `setHeroInSlot`
  (distinct-swap) + `heroSlots()`; `selectedHero`/`setSelectedHero` now slot-1 wrappers.
- `core/game.ts` — the roster is fielded from `opts.heroRoster` (defaults to one hero ⇒ golden-safe);
  per-hero identity (`heroIdById`) + per-hero scaling state (`Hero.killchain` / `Hero.rushUntil`);
  `heroEliteDamage`/`heroVulnBonus`/`onEliteSlain`/survival/rush now iterate the roster; **non-primary
  heroes are autonomous** (auto-cast their signature on cooldown) while slot-1 stays player-controlled.
- `core/types.ts` — `Hero.killchain` / `Hero.rushUntil`.
- `ui/App.tsx` + `ui/GameView.tsx` — snapshot + thread the fielded roster into the run.
- `ui/HeroLab.tsx` + `index.css` — the **Hero Slots strip**: assign a hero per unlocked slot; LOCKED
  slots show their prestige unlock + progress bar (anticipation). The renderer already iterated
  `rs.heroes[]`, so 1–3 heroes draw with no render change.

**Golden-safety:** a fresh account has exactly one slot ⇒ single-hero runs. All multi-hero code is
gated behind per-roster iteration that is a no-op for one hero (the autonomous-cast loop starts at
index 1), so `golden.test` stays byte-identical.
