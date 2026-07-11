# HEROES.md — Hero System (canonical spec)

Detailed design of the five heroes (three launch + Vitriol and Revenant, both
progression-gated), hero-slot progression, and the autonomous-unit model. Companion to
`DESIGN.md`, `PROGRESSION.md`, `TOWERS.md`. Heroes share the five Combat Classes with towers
(`TOWERS.md`).

> Heroes are **autonomous battlefield units** — they move, target, and fight on
> their own; the player *steers* them (abilities, an ultimate, a stance, and an
> optional move/focus ping), but does not micro every step. They are the
> **active-skill** layer over the **placement** layer of towers.

> **Implementation status (vertical slice):** **five** heroes are built as data-driven
> `HeroDef`s with distinct autonomous AI — **Ravager** (`dive`: charges the deepest threat,
> melee + Fracture), **Shepherd** (`guard`: holds the zone, mends Nucleus Integrity + vital
> pulse), **Overseer** (`control`: floats to the densest crowd, fields Disruption),
> **Vitriol** (`siege`: the Caustic siege caste — holds the rear line and bombards the deepest
> threat with corrosive shells that leave Corrosion pools; the only ranged / area-denial hero,
> and the first **progression-gated** one — see §4), and **Revenant** (`phase`: the Viral
> phase-assassin — **blinks** to the biggest threat, strikes it, and injects Infection; a
> single-target boss-deleter, **progression-gated on Infinite Depth** — see §5). Each has its
> signature ability (Apex Leap / Bloom / Mass Override / Corrosive Cataclysm / Plague Rupture) —
> the Shepherd's **Bloom** now also grants the protector a brief **self-shield** (absorb
> pool soaked before HP), the first consumer of the `shield` ability component.
> Each has unique movement + targeting, per-hero **Stars + infinite Mastery** (Hero Lab), and an
> **equipment fold seam** (`HeroMods`) ready for `EQUIPMENT.md`. You **field one** hero
> per run (pick it in the Hero Lab); the engine carries a hero **roster** (`Game.heroes[]`)
> so slot 2/3 is "push another hero in." **Each hero now auto-casts a star-gated ability KIT** — two
> secondary skills (unlocked at ★3 and ★7, `HERO_SKILLS` / `HERO_SKILL_DEFS`) that fire on their own
> cooldowns on top of the ult + auto-attack, so a progressed hero fights with a full kit, not one verb
> (a fresh hero is still one-verb — the kit is progression depth; a 0-star account casts none, keeping
> the golden run byte-identical). **The ★5/★8 ability forks are now live** — each is an A/B choice
> that **reworks an already-unlocked ability in place** (e.g. Ravager's ★8 turns Rend into a wide
> *Reaving Cleave* or a focused *Slayer's Rend*), not a bolt-on verb; picks live in `save.heroForks`,
> resolve through `resolveHeroKit`, and every new/altered ability carries its own cast VFX
> (`particle`/`fxColor`). The **hero star cap is now ★10** (`STAR.maxStars`), so both fork tiers +
> the ★7 skill are reachable. The ★10 signature ability and the slot-unlock economy remain
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

## 4. VITRIOL — Caustic (siege / area-denial artillery) · **progression-gated**

**Lore.** The hive's answer to a siege it once lost. Grown from assimilated demolition
rigs and a refinery's worth of caustic sludge, Vitriol does not charge and does not mend —
it *saturates*. Every wall becomes acid, every charge a sea of it. The hive breeds this
caste only after it has assimilated a true threat, and it has been patient ever since.

**Role.** Ranged siege / area-denial DoT. The **only ranged-DPS hero**: holds a rear standoff
line and rains corrosive shells on the deepest threat — each impact splashes, applies
**Corrosion** (Caustic), and leaves a lingering acid pool. Melts armor, denies ground, and
sets up Caustic reactions (**Dissolve** with Fracture) for the whole build.

**Base abilities (implemented).**
- *Bombardment* (auto, `siege` AI) — lobs a splash shell at the deepest enemy in its long reach;
  each shell splashes, corrodes, and seeds a Corrosion pool (area denial).
- **Ult — Corrosive Cataclysm** — a wide caustic blast (AoE damage + heavy Corrosion) that
  then drops a large lingering acid pool at the target zone.

**Progression gate (unique).** Vitriol is **milestone-gated** — *earned*, not bought. The Ravager
is a starter and the Shepherd/Overseer are **Shard-claimed** (`unlockShards`, banked + spent);
Vitriol instead **auto-unlocks once the hive has assimilated 3 distinct Framework Boss chassis**
(`save.bossesSlain` is chassis-keyed; every campaign stage spawns a framework boss, so a plain
"any boss" gate would open on stage 1 — breadth across the enemy's war-forms is the feat) and can
never be claimed with Shards. The gate is data-driven (`HeroDef.unlock`, a `HeroUnlockReq`) and
evaluated in one place (`state/meta.ts` `isHeroUnlocked`), which the Hero Lab, the selection
guard, `unlockHero` (rejects it), run start, the home army board, the Splice Market roster,
expeditions, and the Bio-Roulette all read — so a locked hero can never be fielded or surfaced.
Milestone heroes are NEVER stored in `save.heroUnlocked` (ownership derives live from the feat;
the sanitizer strips them, healing saves from the era when they were wrongly seeded as starters),
and the Hero Collection surfaces the feat with live progress instead of a Shard bar.

**Strengths.** Safe ranged DPS; persistent area denial melts packs and armored lines; Corrosion
feeds Caustic reactions and pairs with the Bone Mortar's pools; excellent at holding a lane.
**Weaknesses.** No sustain, no control, no melee burst; fragile if the line collapses to its rear
standoff; its value is damage-over-time, so it's weak against single high-HP burst threats it
can't out-tick.

**Synergy.**
- **Bone Mortar** — shared Caustic pools stack into a killing field; both feed pool-damage mods.
- **Needle Spitter / Ravager** — their Fracture + Vitriol's Corrosion = **Dissolve** / SHRED.
- **Overseer** — Disrupted, slowed packs sit in the acid and take amplified DoT.

---

## 5. REVENANT — Viral (phase-assassin / single-target boss-deleter) · **progression-gated**

**Lore.** The hive's WRAITH caste, bred only from the endless deep. Where the Ravager charges and
Vitriol saturates, the Revenant simply *arrives* — it does not walk the field, it folds through it,
surfacing beside whatever is largest and leaving a spreading rot behind. The hive grows this caste
after it has learned patience the hard way: some threats you cannot out-mass, you can only delete.

**Role.** Single-target assassin / boss-deleter. The **only phase (blink) hero** and the **only Viral
hero**: it **teleports** to the biggest threat (boss → elite → highest-HP), lands a heavy strike, and
injects **Infection** (Viral) — a ramping, armor-ignoring DoT that spreads on death. It ignores the
swarm and hunts the one target that matters, then amplifies every other Infection source on the field.

**Base abilities (implemented).**
- *Blink-strike* (auto, `phase` AI) — instead of pathing, it **blinks** (teleports) to the biggest
  threat, strikes hard, and injects `REVENANT.infectPerStrike` Infection stacks (its **Plague Strike**
  identity). The teleport is real movement in the sim; the streak/after-image is render-only
  (`Hero.phaseT`, `HERO_PHASE_FLASH`) so the pinned golden sim is untouched.
- **Ult — Plague Rupture** — blinks to the target zone and **ruptures** it: a viral detonation (AoE
  damage + heavy Infection) that seeds the plague across everything caught, turning one kill into a
  spreading outbreak.

**Progression gate (unique — a distinct axis).** The Revenant is **earned from the deep**, never
bought: it **auto-unlocks the moment you reach Infinite Depth 40** (`save.bestWave ≥ 40`) and can
never be claimed with Hero Shards. This is a *different* unlock axis from every other hero — the
Ravager is a starter, Shepherd/Overseer are **Shard-claimed**, and Vitriol is **boss-slain** — so the
roster's four gates (starter · Shards · boss-slain · Infinite Depth) are all distinct. The gate is
data-driven (`HeroDef.unlock` = `{ kind: 'infiniteDepth', wave: 40 }`, a `HeroUnlockReq`) and
evaluated in one place (`state/meta.ts` `isHeroUnlocked` → `heroMilestoneMet`), which the Hero Lab,
the selection guard, `unlockHero` (rejects it), and run start all read — so a locked hero can never be
fielded, and the Hero Collection surfaces the Infinite-Depth feat instead of a Shard bar.

**Strengths.** Deletes single elites & bosses on demand; teleport mobility reaches anything, anywhere;
amplifies **all** Infection damage on the field (its own strikes + the Parasite Nest).
**Weaknesses.** Fragile — a glass assassin; no crowd clear, control, or sustain for the line; **wasted
on a swarm** — it wants ONE fat target, and a wide wave with no elite starves it.

**Synergy.**
- **Parasite Nest** — the other Viral source; the Revenant's strikes stack onto the Nest's Infection,
  and its on-field amplification boosts every Infection tick — the plague snowballs.
- **Ravager / Needle Spitter** — their Fracture + the Revenant's Infection = **Virulence** (wounds feed
  the plague for true burst).
- **Overseer** — Disruption + Infection = **Plague** (a vulnerable bloom that leaps between bodies).
- **Vitriol / Bone Mortar** — Corrosion + Infection = **Putrefy** (acid rot accelerates the plague).

---

## 6. KNELL — Resonant (amplification conductor / tolling bell) · **progression-gated**

**Lore.** When the hive completes its first **Molt**, the shed carapace does not rot — the hive
CASTS it. Hammered hollow and hung with chime-organs, the Knell is the colony's first true voice:
a bone-bell that walks. It does not hunt and it does not mend; it goes where the fight is thickest
and TOLLS, and everything the hive has ever grown answers the note.

**Role.** Amplification conductor — the roster's **only Resonant hero** and its sixth class. It
floats to the densest crowd (the `control` movement archetype) and tolls a **damaging resonant
shockwave** (real AoE chip with a brief stagger — concussion, not Overseer-grade control). Its
identity is the **amp**: its peals grant timed run-wide tower-damage windows through the shared
run-buff bus (`grantRunBuff` — refresh-not-stack, so re-casts never snowball), and its innate
**Resonance** aura (`towerAura`) hastens + hardens the towers standing near the bell.

**Base abilities (implemented).**
- *The Toll* (auto, `control` AI) — a pulsing resonant shockwave: real AoE damage each ring with a
  short stagger on everything caught.
- **Ult — Sundering Peal** — the bell SLAMS: a massive resonant blast that staggers the pack, and
  for 6s the whole hive answers — **every tower strikes +30% harder** (`buffStat: 'towerDamage'`).
- *Kit (★3/★7)* — **Tolling Strike** (a focused damaging toll) and **Battle Hymn** (a sustained
  +15% tower-damage hum). The ★5 fork chooses **Crescendo** (deeper, longer amp — via the
  `mulBuffAmount`/`addBuffSeconds` fork levers) or **Dirge** (heavier blasts, longer stagger); the
  ★8 fork transforms the Hymn near-permanent (**Eternal Hymn**) or the Strike devastating
  (**Requiem**).

**Progression gate (unique — the THIRD milestone axis).** The Knell is **cast from the hive's
first rebirth**: it **auto-unlocks at your first Molt** (`save.prestige.molts ≥ 1`) and can never
be claimed with Hero Shards. Prestige is the game's deepest progression beat and now breeds its
own war-form — a different axis from every other hero (starter · Shards · boss-chassis breadth ·
Infinite Depth · **Molt**). The gate is data-driven (`HeroDef.unlock` = `{ kind: 'molts',
count: 1 }`) and evaluated in `isHeroUnlocked` → `heroMilestoneMet` like its siblings, with live
progress in the Hero Hall.

**Strengths.** Run-wide damage windows on demand (the amp multiplies a whole BUILD); innate aura
hastens + hardens nearby towers; real AoE chip with a stagger.
**Weaknesses.** No single-target burst of its own; slow — the bell arrives late; its value
multiplies a build — fielded alone over empty ground, it is quiet.

**Synergy.**
- **Every tower at once** — the amp is build-agnostic: the stronger your board, the louder the Peal.
- **Overseer** — vulnerability (+damage taken) × the Knell's +damage dealt compound multiplicatively.
- **Resonance Coil** — the other Resonant voice; the codex/adaptation class pairings finally have a
  hero partner (Resonant expeditions too — *Echo Sounding*).

---

## 7. CINDERWYRM — Caustic (flying strafe-fighter) · **progression-gated**

**Lore.** The hive's SKY caste — a dragon-like BIOMECH grown from assimilated war-form chassis.
Five distinct Framework Boss chassis fell, and the hive kept the part of each that refused the
ground. It has not landed since; the sky is simply where it eats.

**Role.** The **only FLYING hero** and the first `behavior: 'swoop'` brain
(`game.updateSwoopHero`): it never parks on a target — it hunts the deepest threat (elites first,
the dive brain's sense), strikes on the **fly-by**, douses the wound in **Corrosion**
(`WYRM.corrodePerStrike`), then **BANKS THROUGH** to a point `WYRM.bankDist` past the victim
before wheeling back for the next pass. It spends its attack recovery *flying the strafe line*,
not standing in the scrum — constant motion is both its identity and its defense (it never
retreats; `survival: 'aggressive'` is the designed recklessness, like the Ravager).

**Base kit.** Caustic · 205 hp · speed **132** (the fastest hero — it flies) · strike 34 dmg /
0.8 s · colour `#ff8c3d`. **Ult — Pyroclastic Breath**: sweeps to the point and BREATHES — a
corroding blast (58 dmg, r 118, corrode 5) that leaves a **firestorm pool** (110 px, 20 dps, 4 s).
**Kit skills** (★3/★7): *Wing Shear* (a razor arc across the pack — 30 dmg, r 96, Fracture 1) and
*Skyfall Talon* (a folded-wing dive — 62 dmg, corrode 3). **Forks**: ★5 *Infernal Core* (deeper
burn) vs *Tempest Wing* (wider, faster); ★8 *Pyre Titan* (ult → **Cataclysm Breath**) vs *Talon
Lord* (Skyfall → **Annihilating Dive**). **Passive/identity** (heroIdentity): *Emberwake* —
CORRODED enemies take +15 % from ALL sources (the Caustic-amplifier family, stacking with
Vitriol's *Solvent Rounds*); *Firestorm* scaling deepens it with run depth.

**Unlock.** `{ kind: 'bossSlain', count: 5 }` — slay **five distinct Framework Boss chassis** (the
deepest breadth feat; Vitriol's gate is three). Never owned by a fresh account ⇒ golden-safe.

**Visuals.** Membrane **wings** beat behind the body (behavior-keyed — any future flyer inherits
them), quickening in motion; its star anatomy grows wing-edge blades, furnace sacs, and a horned
crown (`HERO_EVOLUTION.wyrm`).

**Synergy.** Corrosion on every pass primes **Shred** (Fracture sources — Needle/Ravager) and
**Putrefy** (Infection — Parasite/Revenant); *Emberwake* amplifies the Bone Mortar, Vitriol, and
the Wyrmwing Glaive's Ember Return branch — the draconic tower pairing it was bred beside.
---

## Hero roster summary

| Hero | Class | Identity | Personal DPS | Carries the team via |
|---|---|---|---|---|
| **Ravager** | Kinetic | dive bruiser | **High** | killing + Fracture setup |
| **Shepherd** | Vital | support/summoner | Low | sustain + drones + overcharge |
| **Overseer** | Neural | controller | ~None | vulnerability + hijack (amplifies *your* damage) |
| **Vitriol** | Caustic | siege / area-denial | **High (DoT)** | Corrosion pools + armor melt (gated) |
| **Revenant** | Viral | phase-assassin / boss-deleter | **Burst (single-target)** | teleport-deletes elites + spreads Infection (gated) |
| **Knell** | Resonant | amplification conductor | Low (AoE chip) | run-wide tower-damage peals + a tower aura (gated) |
| **Cinderwyrm** | Caustic | flying strafe-fighter | **High (mobile)** | Corrosion on every pass + Emberwake amplification (gated) |

Distinct roles, distinct classes, distinct failure modes. The "ideal" core
(Ravager + Shepherd + Overseer) is a classic damage/sustain/control trinity — and
Vitriol adds a ranged Caustic zone-denial option once earned, the Revenant adds a
Viral single-target executioner for the elites and bosses the trinity can't burst down, the
Knell (the sixth class — every combat class now has a hero) turns any mature board into a louder
one, and the Cinderwyrm adds a flying Caustic skirmisher that never stops moving. Since
slots unlock over time and classes are shared with towers, players build toward many other
combinations.

---

## Hero Symbiotes (late-game bio-augmentation) — see docs/HERO-SYMBIOTES.md

Every champion hosts up to **three Symbiote slots** (slot I free; II/III open through per-hero
identity trials + Ichor), each seating a three-organ Mulligan triple from the 36-species catalog.
Symbiotes are permanently grafted organisms that change HOW the hero fights — behavior verbs only
(strike toxins, kill surges, ability echoes, overheal carapaces, adaptive AI), never equipment
stat duplicates. Matching classes in a slot awaken a **Complete Hero Adaptation**; all three slots
together **resonate** (Apex Predator, Living Bastion, …). A NEW HERO must declare its two trials
in `HERO_SYMBIOTE_GATES` and its three visual stages in `HERO_SYMBIOTE_VISUALS` — the compiler and
tests refuse anything less.

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
The shipped unlock is **CAMPAIGN-GATED** — each slot is a concrete milestone the player can see
coming on the world map, not a hidden prestige side-effect:

| Slot | Unlock (shipped) | config |
|------|------------------|--------|
| 1 Prime | from the start | `HERO_SLOTS[0].campaignStage = 0` |
| 2 Twin | clear **Campaign Stage 25** | `HERO_SLOTS[1].campaignStage = 25` |
| 3 Trinity | clear **Campaign Stage 90** | `HERO_SLOTS[2].campaignStage = 90` |

Conditions are DATA in `config.HERO_SLOTS` (one row per slot; `campaignStage` = required
highest-cleared Campaign stage) — retune the thresholds, or add slot 4+, in one place. The Hero Lab's
locked slots show a live **`Campaign 18 / 25`** readout + progress bar (`heroSlotView` exposes
`campaignStage`/`campaignReq`). Crossing a gate on a campaign win fires a **cinematic Hero Slot Unlock**
(`ui/HeroSlotUnlock.tsx`): screen vignette, a bursting slot medallion, roster pips filling in, an
achievement banner, the milestone fanfare (`audio.cue('jackpot')`), and the new Power Score. Detected in
`finishRun` (`outcome.heroSlotUnlock`) and shown by App over Results, ahead of any Evolution Unlock.

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

### Per-hero equipment (independent loadouts) — SHIPPED

With 2–3 heroes fielded at once, **each hero maintains its OWN Weapon / Armor / Relic**. Equipping
a hero never touches another hero's loadout; a single physical item, if worn elsewhere, is pulled
off that hero first (single-instance move). Stars, Mastery, gear score, and Power Score were already
per-hero; equipment now joins them.

**Data model.** `save.equipment` holds a shared `inventory: OwnedItem[]` plus
`loadouts: Partial<Record<HeroKind, Loadout>>` (was a single `loadout`). Schema **v12**; the v11→v12
migration (`sanitizeLoadouts`) moves the legacy single loadout onto the slot-1 hero and resolves hero
aliases. Reset-Equipment clears all `loadouts` together (no orphan uid).

**Run application (the seam).** `game.foldHeroEquip(roster, opts.heroEquip)` folds each fielded hero's
gear in TWO passes, split by SCOPE. **Pass 1 — battlefield-GLOBAL:** stat fields the towers/economy/
aura read from the shared `this.mods` (everything NOT in `HERO_SCOPED_FIELDS` — and therefore ALL
**set bonuses**, which are tower/economy effects), plus tower projectile-mutator grants and relic
hooks, fold into `this.mods` so they actually reach the board; every geared hero contributes, so gear
**stacks across the roster** (the same product `equipmentPower` scores). **Pass 2 — hero-scoped:** the
`HERO_SCOPED_FIELDS` stats (damage/speed/crit/armor/lifesteal/… read via `hmods(h)`) and on-hit
ability/status verbs fold into that hero's private `heroHmods[kind]`/`heroKits[kind]`/`heroStatuses[kind]`
(cloned AFTER pass 1, so a hero also inherits the shared gear). Reads fall back to `this.mods` for a
gearless hero, so a gear-less roster is byte-identical (golden-safe). Folded BEFORE integrity/biomass
so boot-only survivability/economy gear (`integrityMult`, `startBiomassBonus`) lands too.

**Systems modified (this feature):**
- `core/equipment.ts` — `EQUIP_SLOTS`, `emptyLoadout()` (shared slot list + empty-loadout helper).
- `save/saveStore.ts` — `equipment.loadouts` map (schema **v12**) + `sanitizeLoadouts` migration.
- `state/meta.ts` — `loadoutOf(kind)`, `loadoutEffectsFor(kind)`, `heroRosterEquip()` (per-hero run
  effects for the fielded roster), `equip(hero, slot, uid)` (per-hero, single-instance); `equipmentPower`
  now the PRODUCT over all heroes' loadouts; finishRun favorite-equip + salvage iterate `loadouts`.
- `state/heroView.ts` — `heroDetail` reads that hero's own loadout for gear score / slots.
- `core/game.ts` — `heroHmods` / `heroKits` / `heroStatuses` + `foldHeroEquip` + `hmods/hkit/hstatuses`
  accessors; `RunOptions.heroEquip`; every hero stat/verb site rewired to the per-hero accessor; the
  hero aura is now per-roster (proximity checked across all heroes).
- `ui/App.tsx` + `ui/GameView.tsx` — snapshot `meta.heroRosterEquip()` and thread it into the run.
- `ui/EquipmentPanel.tsx` — a **hero-focus selector** (which fielded hero you're gearing), per-hero
  loadout/score/sets, and an **owner tag** ("Equipped · <hero>") with a *Move here* action when an item
  is worn by another hero.

**Tests:** `state/heroLab.test.ts` (loadout independence, single-instance move, `heroRosterEquip`),
`core/heroEquip.test.ts` (gear applies to that hero's max HP in-sim; never bleeds to another hero;
empty/omitted heroEquip = baseline). Goldens unchanged.

---

## Hero Collection ownership (as built)

Heroes are **owned**, not all-available — orthogonal to hero SLOTS (how many you field). `HeroDef.unlockShards`
gates a hero; **Ravager** is a starter, **Shepherd** (60) and **Overseer** (100) are locked and claimed with
their Hero Shards. `save.heroUnlocked[]` tracks ownership (schema v14; migration grandfathers in any hero an
existing player already used, so no access is stripped). `meta.isHeroUnlocked / heroCollection / unlockHero`;
`fieldedLoadout` + `setHeroInSlot` gate on ownership (a locked hero can never be fielded). Container hero-shard
pulls **bias toward still-locked heroes** so a "42 / 100" bar fills visibly. HeroLab renders locked roster cards
(silhouette + progress) and a dormant-strain page (sealed lore, Release CTA + celebration) — the hero is
selectable the instant it's claimed.
