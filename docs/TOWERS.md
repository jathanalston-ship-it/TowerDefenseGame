# TOWERS.md — The Tower Roster (canonical spec: five launch + three expansion + three late-unlock)

Detailed design of the eleven towers — the five launch towers, the three expansion niches
(§expansion), the two Deep-Strain **beam** towers (§deep-strain: Resonance Coil · Marrow
Siphon), and the **trap** tower (§trap: Blight Sower). Companion to `DESIGN.md` (vision) and
`PROGRESSION.md` (scaling math). **This doc is canonical for tower names, classes, and the
reaction framework** — it supersedes the placeholder tower names used in the earlier bible.

> **Reconciliation note (read once):** the launch towers are pure bio-horror
> (flesh/bone/parasite/nerve/biomass) and include **no ice unit**, so the **Cryo**
> class is **retired from launch** and **Vital** (flesh/biomass/sustain — already
> present as the support class) is promoted to a full launch class. The five launch
> classes are therefore **Kinetic · Caustic · Viral · Neural · Vital**. Cryo is
> parked as a candidate post-launch expansion class (the one acceptable "deferred"
> item — genuinely out-of-scope future content).

> **Implementation status (vertical slice):** all **five** launch towers are built and
> placeable, each with its ★1–★3 core mechanic, status, projectile/field, visuals, and
> the data-driven hooks for the rest (`firing` dispatch, `RunModifiers` card hooks,
> auto Stars + Mastery via `TOWER_ORDER`). Implemented statuses: **Fracture, Corrosion,
> Infection, Disruption (slow + Vulnerability), Mark (Vital — Marrow Siphon), and Resonance
> (Resonant — Resonance Coil)**. The reaction matrix is now **complete**: all **15** unordered
> pairings of those six statuses are wired (C(6,2) — see §reactions). The ★4–★10 unlocks, A/B forks,
> Evolutions, and class keystones are the designed-but-future content this spec also covers. Balance values live in
> `src/core/config.ts`.
>
> **Roster now: eleven built towers.** Beyond the launch five, the placeable roster runs to
> **eleven**: the three post-siege expansion niches (§expansion — Carrion Maw · Amber Chrysalis ·
> Wailing Effigy), the two **Deep-Strain beam** towers (§deep-strain — **Resonance Coil**, a
> single-target resonance melter; **Marrow Siphon**, a Vital multi-tether *harvester* that drains a
> dying swarm into Biomass), and the **Blight Sower** (§trap — a Caustic `firing: 'trap'` that
> seeds armed spore mines up-lane). Each new tower adds a delivery mode (`beam`, `trap`) and is
> **doubly progression-gated** (a Campaign-stage gate → then its own Tower Shards). All are
> registry-driven — stars, mastery, conveyor, codex, loot, and Strain inherited them with no
> per-system code.

---

## Canonical class & reaction framework

Each tower **seeds one Combat Class** and applies that class's **status**. Putting
**two different statuses on one enemy triggers a Reaction** — the burst payoff that
rewards mixing classes (the core of build variety). Classes are shared with heroes
(`HEROES.md`).

| Class | Tower | Status applied | Status does |
|---|---|---|---|
| **Kinetic** | Needle Spitter | **Fracture** | armor shred + crit enabler |
| **Caustic** | Bone Mortar | **Corrosion** | acid DoT + armor melt + ground pools |
| **Viral** | Parasite Nest | **Infection** | spreading, ramping DoT |
| **Neural** | Neural Obelisk | **Disruption** | slow / stun / vulnerability / hijack |
| **Vital** | Flesh Reactor · Marrow Siphon | **Mark** | reaction fuel — harvested into a burst + Biomass |
| **Resonant** | Resonance Coil | **Resonance** | reaction fuel — shattered against the co-present status |

**Reaction matrix — now COMPLETE across all six status classes.** C(6,2) = **15** reactions, and
**every one is wired** (`reactions.ts` / `game.runReaction`). The 5×5 grid below is the launch core;
**Mark** (Vital, from the Marrow Siphon) and **Resonance** (Resonant, from the Resonance Coil) add
their pairings — listed under the grid. Marquee combos in **bold**.

| + | Kinetic | Caustic | Viral | Neural | Vital |
|---|---|---|---|---|---|
| **Kinetic** | — | **Shred** | Hemorrhage | Overstrike | Harvest |
| **Caustic** | **Shred** | — | **Plague** | Dissolve | Ferment |
| **Viral** | Hemorrhage | **Plague** | — | **Mind Rot** | Bloom Rot |
| **Neural** | Overstrike | Dissolve | **Mind Rot** | — | Synaptic Bloom |
| **Vital** | Harvest | Ferment | Bloom Rot | Synaptic Bloom | — |

| Reaction | Effect |
|---|---|
| **Shred** (Kin+Cau) | armor fully stripped + kinetic burst |
| Hemorrhage (Kin+Vir) | crits/wounds seed Infection |
| Overstrike (Kin+Neu) | disrupted enemies take guaranteed crits |
| Harvest (Kin+Vit) | killing fractured/marked enemies → bonus biomass + Nucleus heal |
| **Plague** (Cau+Vir) | acid + infection → spreading mega-DoT |
| Dissolve (Cau+Neu) | disruption amplifies corrosion; melts shields |
| Ferment (Cau+Vit) | corrosion pools convert kills into biomass |
| **Mind Rot** (Vir+Neu) | hijacked enemies become infection super-spreaders |
| Bloom Rot (Vir+Vit) | infected deaths spawn friendly spores / heal hive |
| Synaptic Bloom (Neu+Vit) | disrupted/hijacked enemies buff your towers |
| **Shear** (Res+Kin) | the fractured shell shears apart — a burst scaling with Fracture (+ armor break) |
| **Melt** (Res+Cau) | resonance melts the corroded plating entirely (armor break) |
| **Rupture** (Res+Vir) | the plague ruptures on the resonant note — a burst scaling with Infection |
| **Overtone** (Res+Neu) | the destabilized shell rings itself apart |
| **Synthesis** (Mark+Res) | the two newest castes combine — a heavy burst + a Biomass windfall |

> **Shipped behavior (`reactions.ts` / `game.runReaction`).** The Vital (**Mark**) family — Harvest ·
> Ferment · Bloom Rot · Synaptic Bloom — renders the marked affliction into a **true-damage burst +
> Biomass** (Vital = economy). The Resonant (**Resonance**) family shatters the co-present status for a
> burst (scaling with Fracture/Infection stacks). The **Marrow Siphon** applies Mark on its drain pulse;
> the **Resonance Coil** applies Resonance on its beam — it no longer borrows Corrosion, it has its own
> status now. **Golden-safe:** both statuses require those two gated beam towers, which autoplay never
> fields, so the pinned golden sim is byte-identical.

**Role coverage (deliberately one each):** single-target DPS · AoE artillery ·
DoT/spread/summon · control/hijack · economy/support. Any 3-of-5 pick is viable;
each plays completely differently.

> **Beyond the launch five (§expansion, §deep-strain, §trap).** The class table above is the
> canonical **launch** mapping (one tower per class, a clean C(5,2) reaction matrix). Later towers
> extend it without redrawing it: the **Marrow Siphon** is a *second* **Vital** tower — but the
> first Vital *attacker* (the Flesh Reactor is economy/support), so Vital finally has an offensive
> body. The **Resonance Coil** carries a new **Resonant** class (a sustained beam-focus melter); its
> beam applies the **Resonance** status, a full participant in the reaction matrix — it *shatters* the
> co-present status (Fracture/Corrosion/Infection/Disruption) for a burst, so Resonant has its own
> reaction family (§reactions) rather than borrowing another class's status. The **Blight Sower** is
> a *second* **Caustic** tower (with the Bone Mortar) — its spore-mine detonations apply Corrosion,
> so it too feeds **Shred**. Full specs in §deep-strain and §trap below.

Each tower below follows `PROGRESSION.md` rules: **stat per star is light (+10%);
the point of a star is a *mechanic*.** ★5 and ★8 are re-selectable A/B **forks**
→ 4 endgame configurations ("Evolution paths") per tower.

---

## 1. NEEDLE SPITTER — Kinetic (single-target executioner)

**Core fantasy.** A barbed chitin gland that fires bone needles at blistering
speed, *heating up* the longer it fixates on one victim — a patient predator that
drills a single target into paste, then moves to the next.

**Combat role.** Sustained single-target DPS + anti-armor + crit/execute. The
boss-and-elite killer; your answer to anything with a big health bar.

**Strengths.** Highest single-target DPS in the roster; armor penetration via
stacking Fracture; crit/execute scaling; deletes elites and bosses.
**Weaknesses.** Near-zero AoE; helpless vs swarms; ramp resets on target swap;
wants targets to *commit* to.

**Synergy tags.** `Kinetic` `Fracture` `Crit` `Penetration` `Single-Target` `Ramp`

**Attack behavior.** Very fast needle volleys. Consecutive hits on the *same*
target add **Fracture** stacks (armor shred + crit chance) up to a cap; swapping
targets decays stacks. Later stars add piercing and charged "rail" shots.

**Visual design.** A tall, thin, barbed spire with a ribcage firing-chamber that
glows hotter and twitches faster as it ramps; needles are glistening bone slivers;
spent casings of marrow litter its base.

**Star unlocks.**

| ★ | Unlock |
|---|---|
| 1 | Fires bone needles, single-target, fast |
| 2 | **Auto-Focus** — prioritizes highest-HP target; ramps faster while held |
| 3 | **Fracture Stacks** — same-target hits stack armor-shred + crit chance |
| 4 | **Salvage Rounds** — crits refund a little biomass |
| 5 | **FORK — Penetrate** (needles pierce a full line) **/ Execute** (huge bonus dmg <25% HP) |
| 6 | **Open Wound** — Fracture enables Kinetic reactions (Shred/Hemorrhage/Overstrike/Harvest) |
| 7 | **Overdraw** (active) — charged rail-needle for big burst every N attacks |
| 8 | **FORK — Railgun** (slow, +range, +pierce, each shot a mini-Overdraw) **/ Autocannon** (fast, lower per-hit, higher Fracture cap) |
| 9 | **Overflow** — a Fractured enemy's death flings its stacks to the nearest enemy |
| 10 | **SIGNATURE — Singularity Round**: periodic shot that re-triggers every crit dealt to that target this wave |

**Infinite mastery rewards.** Log damage ramp (`PROGRESSION §2.3`) **plus**: M25
+1 max Fracture stack · M50 Overflow jumps to 2 targets · M100 crits have a chance
to auto-fire a free Overdraw · M250 Fracture also lowers enemy attack speed ·
Ranks (every 100) grant titles/borders + a stacking +1% execute threshold.

**Class progression tree — Kinetic keystones** (slotted, shared with Ravager):

| Lvl | Keystone |
|---|---|
| 10 | **Overpenetration** — Kinetic attacks pierce +1 enemy |
| 20 | **Lethality** — +crit damage; crits apply +1 Fracture |
| 30 | **Momentum** — Kinetic dmg ramps per second of continuous fire |
| 40 | **Exposed Nerve** — max-Fracture enemies take +25% from *all* sources |
| 50 | **Apex Caliber** — every Nth Kinetic hit is an unmitigable guaranteed crit |

**Evolution paths** (★5 × ★8):
- Penetrate + Railgun = **Lancer** — line-piercing artillery-sniper.
- Penetrate + Autocannon = **Hailstorm** — rapid piercing volleys (soft anti-group).
- Execute + Railgun = **Headsman** — pure single-target boss deleter.
- Execute + Autocannon = **Reaper** — fast low-HP shredder (snowballs through waves).

**Example card interactions.** *Hair-Trigger* (+atk speed → faster Fracture
stacking) · *Twin Fang* (fire 2 needles, double stack rate) · *Cull the Weak*
(+execute threshold, turns it into a wave-cleaner with Reaper).

**Example mutation interactions.** *Kinetic Lineage* strain (Fracture stacks buff
your whole build's crit) · Corruption **Armored Horde** (enemies +armor) is a *boon*
here — penetration/Shred shine where other towers stall.

---

## 2. BONE MORTAR — Caustic (area artillery / zoner)

**Core fantasy.** A hunched cannon of fused vertebrae that belches marrow-bombs in
slow arcs; where they land, caustic marrow pools bubble and eat through armor and
ground alike. It doesn't aim at enemies — it aims at *places*.

**Combat role.** AoE / splash artillery + persistent ground hazard + armor melt.
The zoner and anti-cluster specialist.

**Strengths.** Strong AoE; lingering corrosion pools (area denial + armor strip);
excels vs grouped enemies and slow tanks; sets up Shred/Plague.
**Weaknesses.** Slow fire rate; arcing travel time (whiffs fast/erratic targets);
poor single-target burst; predictable.

**Synergy tags.** `Caustic` `AoE` `Corrosion` `Ground-Hazard` `Splash` `Armor-Melt`

**Attack behavior.** Lobs arcing marrow shells with real travel time; impact deals
splash + leaves a **Corrosion** pool (DoT + armor reduction) for several seconds;
pools can merge and (late) drift toward enemies.

### §deadzone — the artillery minimum range

A mortar cannot lob a shell point-blank: it has a **deadzone** (`minRange` on the tower def,
`100px`), a minimum engagement radius inside which enemies are simply **not targetable** by it.
This is a real gameplay lever, not flavor — it hands the last line of defense to short-range
towers (Carrion Maw, Parasite Nest, Neural Obelisk), so a mortar-heavy board still needs a
close-quarters answer when a leaker slips under the guns.

`minRange` is a general, optional `TowerDef` field (absent = `0` = no deadzone — identity for
every other tower), so future artillery-style towers can adopt it. It is enforced in the
**targeting query** (`Game.pickTargets`, deadzone filter — never in projectile flight), so a
mortar with only a point-blank enemy in reach simply holds fire. The tower Inspector shows a
`Deadzone` stat, and selecting a mortar draws a subtle **inner ring** at the cutoff radius. The
last-stand Emergency Defense reach (docs/RANGE.md §4) also respects the deadzone.

**Visual design.** Squat and ribbed, built from a fused spinal column with gurgling
marrow sacs; belches yellow-green shells; craters bubble and hiss; the whole thing
recoils and resettles like a heaving ribcage.

**Star unlocks.**

| ★ | Unlock |
|---|---|
| 1 | Lobs marrow shells, AoE splash |
| 2 | **Spotter** — impact marker; auto-targets densest cluster |
| 3 | **Corrosive Pools** — impacts leave acid pools (DoT + armor melt) |
| 4 | **Scavenger Shells** — pool kills refund biomass |
| 5 | **FORK — Saturation** (barrage of small shells) **/ Heavy Ordnance** (one big shell, +radius + knockback) |
| 6 | **Caustic Catalyst** — Corrosion enables Caustic reactions (Shred/Plague/Dissolve/Ferment) |
| 7 | **Marrow Storm** (active) — timed barrage on a target area |
| 8 | **FORK — Contagion Pools** (pools grow/spread toward enemies) **/ Concentrated Acid** (small pools that melt armor to zero fast) |
| 9 | **Sympathetic Detonation** — enemies dying in a pool explode, spreading corrosion |
| 10 | **SIGNATURE — Marrow Cataclysm**: periodically drowns the whole lane in a corrosive deluge |

**Infinite mastery rewards.** Log damage ramp **plus**: M25 +1s pool duration ·
M50 pools tick faster · M100 shells gain a second mini-splash on impact · M250
corrosion can over-stack past cap · Ranks grant +1% area size.

**Class progression tree — Caustic keystones** (shared with future Caustic hero):

| Lvl | Keystone |
|---|---|
| 10 | **Solvent** — corrosion strips extra armor |
| 20 | **Spread** — pools larger & longer |
| 30 | **Acidic Blood** — corroded deaths splash acid on neighbors |
| 40 | **Liquefy** — max-Corrosion enemies take +25% from all sources |
| 50 | **Caustic Tide** — all pools drift toward the nearest enemies |

**Evolution paths.**
- Saturation + Contagion = **Deluge** — endless creeping acid field (wave-locker).
- Saturation + Concentrated = **Acid Rain** — many fast armor-melting strikes.
- Heavy + Contagion = **Tar Pit** — huge growing pool that swallows a lane.
- Heavy + Concentrated = **Demolisher** — armor-deleting bombs for elite groups.

**Example card interactions.** *Volatile Marrow* (pools deal +dmg but shorter) ·
*Wide Bore* (+splash radius) · *Caustic Catalyst* card (Corrosion stacks faster →
reliable Plague with Parasite Nest).

**Example mutation interactions.** *Caustic Lineage* strain (your pools also apply
a stacking damage-taken debuff) · Corruption **Swarm Tide** (huge enemy density) →
Bone Mortar's value skyrockets (more bodies in every pool).

---

## 3. PARASITE NEST — Viral (epidemic engine / summoner)

**Core fantasy.** A throbbing clutch of egg-sacs that flings burrowing parasites
into the horde. Infection ramps, then *leaps* from the dying to the living — and
the Nest keeps birthing crawlers to carry the plague forward.

**Combat role.** Damage-over-time + infection spread (scales with density) + light
summons. The epidemic engine; the longer and denser the wave, the more terrifying.

**Strengths.** Scales explosively with enemy density (spread); ramping DoT that
ignores armor (biological); superb vs swarms and long/endless waves; summons add
chip + body-blocking.
**Weaknesses.** Low upfront/burst (slow to ramp); weak vs lone fast targets; needs
time + crowds; underwhelming vs short bursty elite waves.

**Synergy tags.** `Viral` `Infection` `DoT` `Spread` `Summon` `Density-Scaling`

**Attack behavior.** Fires parasites that attach and apply ramping **Infection**;
infected deaths spread infection to nearby enemies; periodically births **Crawlers**
(weak melee minions that also infect).

**Visual design.** A bulbous, translucent nest of pulsing egg-sacs and twitching
ovipositors, slick with fluid; parasites skitter like ticks; infected enemies bloat
with pulsing boils that burst on death.

**Star unlocks.**

| ★ | Unlock |
|---|---|
| 1 | Fires parasites; ramping Infection DoT |
| 2 | **Brood Sense** — prioritizes *uninfected* enemies (maximize spread) |
| 3 | **Virulence** — infection ramps over time; spreads to nearby on death |
| 4 | **Carrion Yield** — infected deaths drop extra biomass |
| 5 | **FORK — Hatchery** (spawns Crawler minions) **/ Plaguebearer** (infection spreads on *contact* between enemies, not just death) |
| 6 | **Viral Load** — Infection enables Viral reactions (Hemorrhage/Plague/Mind Rot/Bloom Rot) |
| 7 | **Swarm Release** (active) — burst-spawn crawlers / a parasite cloud |
| 8 | **FORK — Apex Strain** (+infection damage, −spread radius) **/ Pandemic Strain** (+spread/jumps, −damage) |
| 9 | **Mutation** — infection that kills an elite mutates +50% stronger for the wave |
| 10 | **SIGNATURE — Total Infestation**: infection becomes uncapped & self-sustaining; a fully infected wave keeps spreading until cleared |

**Infinite mastery rewards.** Log damage ramp **plus**: M25 +1 infection spread
jump · M50 Crawlers tougher · M100 infection ramp starts higher · M250 spread can
infect off-screen approaching enemies · Ranks grant +1% infection ramp rate.

**Class progression tree — Viral keystones** (shared with future Viral hero):

| Lvl | Keystone |
|---|---|
| 10 | **Contagion** — infection jumps to +1 more enemy |
| 20 | **Virulence** — +infection ramp rate |
| 30 | **Resilient Strain** — infection no longer decays; persists to death |
| 40 | **Weakened Immunity** — infected enemies take +25% from all sources |
| 50 | **Patient Zero** — one enemy/wave becomes a hyper-spreader (huge radius) |

**Evolution paths.**
- Hatchery + Apex = **Brood Tyrant** — minion swarm + lethal infection.
- Hatchery + Pandemic = **Hive Plague** — minions carry far-spreading infection.
- Plaguebearer + Apex = **Black Death** — contact-spread, high-lethality epidemic.
- Plaguebearer + Pandemic = **Wildfire** — unstoppable map-wide contagion (with Total Infestation, a wave-ender).

**Example card interactions.** *Aggressive Strain* (+ramp speed) · *Vectoring*
(infection also spreads via your Crawlers) · *Superspreader* (first infected each
wave is a Patient Zero) — with Bone Mortar = perpetual **Plague**.

**Example mutation interactions.** *Viral Lineage* strain (every reaction also
applies infection) · Corruption **Elite Surge** (more elites) → Mutation (★9) feeds
on elite kills, snowballing infection lethality.

---

## 4. NEURAL OBELISK — Neural (controller / commander)

**Core fantasy.** A monolith of fused brain-stems and chrome wire that radiates a
psionic field. It barely "attacks" — it *rewrites* the battlefield: slowing,
terrifying, and hijacking minds, and marking enemies so everything else hits harder.

**Combat role.** Control + debuff + hijack; force-multiplier support. Low personal
damage, enormous *team* damage.

**Strengths.** Crowd control (slow/stun/fear); hijacks enemies to fight for you;
**Vulnerability** debuff amplifies ALL your damage; enables every Neural reaction;
great vs elites (hijack) and dense waves (AoE slow).
**Weaknesses.** Low direct damage (needs a damage core to convert its setup);
hijack is capped/cooldowned; expensive; does little in a vacuum.

**Synergy tags.** `Neural` `Control` `Hijack` `Vulnerability` `Slow` `Amplify`

**Attack behavior.** Pulses a psionic field (AoE **Disruption**: slow +
vulnerability); periodically **Hijacks** a target to fight for you; marks enemies as
vulnerable (+% damage taken). It's a disruptor, not a DPS.

**Visual design.** A tall obelisk of pulsing neural tissue laced with chrome,
ringed by slowly orbiting glyphs of light and arcs of static; a cluster of unblinking
eyes; enemies in its field stutter, glitch, and twitch off-rhythm.

**Star unlocks.**

| ★ | Unlock |
|---|---|
| 1 | Psionic field: AoE slow |
| 2 | **Threat Assessment** — auto-targets elites / most dangerous |
| 3 | **Vulnerability** — field marks enemies, +% damage taken from all sources |
| 4 | **Mind Tax** — disrupted enemy deaths refund biomass |
| 5 | **FORK — Hijack** (convert an enemy to fight for you) **/ Terror** (field fears/staggers, enemies periodically lock up in panic) |
| 6 | **Neural Link** — Disruption enables Neural reactions (Overstrike/Dissolve/Mind Rot/Synaptic Bloom) |
| 7 | **Mass Override** (active) — briefly hijack/stun a chunk of the wave |
| 8 | **FORK — Dominator** (hijacked enemies stronger, higher cap) **/ Suppressor** (bigger field, deeper slow + vulnerability, no hijack) |
| 9 | **Feedback Loop** — Vulnerability also amplifies *reaction* damage, not just direct |
| 10 | **SIGNATURE — Hive Override**: periodically converts a large portion of the current wave into temporary allies |

**Infinite mastery rewards.** Log effect ramp (field size / vulnerability %) **plus**:
M25 +slow strength · M50 +1 hijack cap · M100 hijacked allies inherit one elite
ability · M250 vulnerability affects bosses fully · Ranks grant +1% vulnerability.

**Class progression tree — Neural keystones** (shared with Overseer):

| Lvl | Keystone |
|---|---|
| 10 | **Deep Slow** — +slow strength |
| 20 | **Authority** — +1 hijack cap |
| 30 | **Synaptic Overload** — disruption also lowers enemy damage & healing |
| 40 | **Marked for Death** — +10% vulnerability (everything hits disrupted enemies harder) |
| 50 | **Puppeteer** — hijacked enemies keep elite abilities & gain +50% stats |

**Evolution paths.**
- Hijack + Dominator = **Warlord** — fields an elite army of converted enemies.
- Hijack + Suppressor = **Manipulator** — control + amplify, light conversion.
- Terror + Dominator = **Tyrant** — panic-locks waves while building a hijack force.
- Terror + Suppressor = **Nightmare** — pure lockdown + max vulnerability (enables a glass-cannon DPS partner).

**Example card interactions.** *Overclock* (vulnerability also grants your towers
attack speed) · *Hostile Takeover* (hijacked enemies explode on death) · *Mind
Spike* (first hit on a disrupted enemy crits) — with Needle Spitter = reliable
**Overstrike**.

**Example mutation interactions.** *Neural Lineage* strain (your vulnerability % is
shared globally) · Corruption **Unstoppable Elites** (CC-resistant elites) → builds
around Suppressor's raw vulnerability instead of hijack, turning a hard corruption
into a damage-amp engine.

---

## 5. FLESH REACTOR — Vital (heart / economy / overcharge)

**Core fantasy.** A colossal, exposed biomass heart you can *see* beating. It
doesn't kill — it **fuels**: pumping biomass, overcharging neighbors through pulsing
veins, knitting the Nucleus back together, and exhaling vital steam. The engine that
makes everything else monstrous.

**Combat role.** Economy + support + sustain + overcharge buff; minor pulse AoE. The
build's multiplier and lifeline — especially in long/endless runs.

**Strengths.** Generates biomass (economy); overcharges adjacent towers (huge force
multiplier); repairs Nucleus integrity; sustains the hive late; enables Vital
reactions (Harvest/Ferment/Bloom Rot/Synaptic Bloom).
**Weaknesses.** Almost no direct damage; high-value and fragile (must be protected);
positional (adjacency matters); does nothing alone; slow to pay off.

**Synergy tags.** `Vital` `Economy` `Overcharge` `Sustain` `Adjacency` `Pulse`

**Attack behavior.** Emits a rhythmic **vital pulse** (small AoE + Nucleus heal),
generates biomass over time, and projects an **Overcharge** aura (+atk speed/damage)
to adjacent towers; converts nearby kills into bonus biomass (**Mark**).

**Visual design.** A massive heart/lung organ pulsing on the beat, veins visibly
pumping glowing biomass out through tendrils to neighboring towers, warm red-orange
glow, periodic exhale of bio-steam; its heartbeat sets the run's audio tempo.

**Star unlocks.**

| ★ | Unlock |
|---|---|
| 1 | Vital pulse: small AoE + generates biomass over time |
| 2 | **Circulation** — auto-routes overcharge to the most valuable neighbor |
| 3 | **Overcharge Aura** — adjacent towers gain attack speed + damage |
| 4 | **Metabolism** — nearby kills convert into bonus biomass (Harvest hook) |
| 5 | **FORK — Furnace** (stronger overcharge, fewer targets) **/ Network** (weaker overcharge, large radius / all towers) |
| 6 | **Vital Catalyst** — Marks enable Vital reactions (Harvest/Ferment/Bloom Rot/Synaptic Bloom) |
| 7 | **Vital Surge** (active) — burst Nucleus heal + massive temporary overcharge |
| 8 | **FORK — Heart** (Nucleus repair + survivability auras) **/ Engine** (biomass income + economy) |
| 9 | **Symbiosis** — buffed towers and the Reactor feed each other mastery/XP (co-level boost) |
| 10 | **SIGNATURE — Apotheosis Bloom**: periodic hive-wide overcharge + heal + biomass surge (a "spike" button) |

**Infinite mastery rewards.** Log ramp on aura strength / biomass rate **plus**:
M25 +aura radius · M50 pulse also cleanses a Nucleus debuff · M100 overcharge
partially persists 3s after leaving the aura · M250 Vital Surge cooldown −20% ·
Ranks grant +1% biomass income.

**Class progression tree — Vital keystones** (shared with Shepherd):

| Lvl | Keystone |
|---|---|
| 10 | **Rich Soil** — +biomass generation |
| 20 | **Conduit** — +overcharge aura radius |
| 30 | **Transfusion** — part of overcharge also heals the Nucleus |
| 40 | **Vital Resonance** — buffed towers gain +25% *reaction* damage |
| 50 | **Living Hive** — the Nucleus slowly regenerates between waves |

**Evolution paths.**
- Furnace + Engine = **Powerhouse** — a few towers go nuclear + rich economy.
- Furnace + Heart = **Bastion Core** — overcharged anchor towers + tanky Nucleus.
- Network + Engine = **Grid** — whole-board uplift + economy snowball (idle-friendly).
- Network + Heart = **Sanctuary** — global sustain build (the endless-run backbone).

**Example card interactions.** *Compound Interest* (biomass generation compounds
per wave) · *Power Grid* (overcharge affects +1 ring of towers) · *Vital Resonance*
card (overcharged towers' reactions hit far harder) — turns any 2-class pair into a
reaction powerhouse.

**Example mutation interactions.** *Vital Lineage* strain (Harvest also drops Genome Samples
faster — meta-progression accelerator) · Corruption **Sudden Death** (Nucleus has
−50% integrity) → Heart fork + Living Hive becomes the only way to survive, a
build-defining response.

---

## Distinctness summary

| Tower | One-word identity | Wants | Hates |
|---|---|---|---|
| Needle Spitter | **Focus** | a fat single target | swarms |
| Bone Mortar | **Zone** | tight clusters & slow tanks | fast erratic targets |
| Parasite Nest | **Spread** | dense, long waves | short bursty elite waves |
| Neural Obelisk | **Control** | a damage partner to enable | being run solo |
| Flesh Reactor | **Fuel** | neighbors worth buffing & time | being left unprotected |

No two share a role, a status, a scaling axis, or a failure mode — they are
**completely distinct**, and the reaction matrix makes every *pair* a third thing.


---

## Expansion roster (§expansion) — Carrion Maw · Amber Chrysalis · Wailing Effigy

Three niches the launch five deliberately do not own, added post-siege (enemies attack the
Core — docs/HIVE-SIEGE.md), where "the last 170 px" and "who is attacking RIGHT NOW" became
real design space. All three compose the shared ability blocks (`TowerDef.abilities`) — no new
firing modes, no per-tower sim forks. Registry-driven systems (conveyor, stars, mastery,
adaptation, codex, loot, prediction, Strain) inherited them with zero per-system code.

| | Carrion Maw | Amber Chrysalis | Wailing Effigy |
|---|---|---|---|
| Class / status | Kinetic (no status — raw meat) | Caustic / **Freeze** (encase) | Neural / **Fear** (flee) |
| Niche | crust BRAWLER — cleaves everything inside its jaws | elite WARDEN — hard-locks the biggest threat | dread TOTEM — pure tempo, panics attackers off the crust |
| Range band | **170** (the shortest in the game — its range IS its jaws) | **430** (mid warden) | **300** (crust guard) |
| Cost / cadence / hit | 140 · 1.25 s · 26 to ALL in reach | 155 · 3.4 s · 18 + Freeze 1.4 s (highestHealth) | 150 · 2.6 s · 0 — Fear 1.6 s in the field |
| Counter-play | useless at range; wants chokes/crust | single-target; swarms walk past it | zero damage; needs killers behind it |
| Branches | Butcher's Row (carnage) / Tidal Gullet (undertow control) | Deep Freeze (lockdown) / Preserving Amber (sap utility) | Choir of Sorrow (wide dread) / Totem of Malice (psychic wounds) |
| Strain II–V | Gorging Gullet · Bone Vice · Acid Reflux · Apex Devourer | Setting Resin · Splinter Shards · Twin Cocoon · Living Amber | Creeping Dread · Contagious Panic · Nightmare Feast · Death Knell |

**Status semantics (engine-level, shared):** Freeze = full stop + attack-disabled; Fear =
attack-disabled + **flees** (a feared sieger breaks off the crust and scatters up-lane,
re-converging when it fades). Both carry a **refractory window** (freeze 3.5 s, fear 4.0 s —
`status.ts`): after the effect ends, the same effect bounces off that enemy until the window
clears, so perma-CC from stacked towers is impossible by construction. Identity run-mods:
`mawCleaveRadiusMult` · `chrysalisFreezeDurationMult` · `effigyDreadDurationMult` (cards
`wider_jaws`/`gnashing_hunger`, `thick_amber`/`crystalline_matrix`, `lingering_dread`/
`chorus_of_grief`, epic `total_lockdown`; affixes `gnashing`/`preserving`/`dreadful`).

**Unlock gate (shard synthesis):** the expansion trio is **dormant on new profiles** —
`TowerDef.unlockShards` (Maw 80 · Chrysalis 120 · Effigy 150, each in its OWN Tower Shards,
which containers drop for locked kinds too — the same loop as hero unlocks at 60/100).
Synthesis happens in the Tower Lab (the dormant-strain bar; spends the shards); until then the
kind never rails, never grows on the Biomorph Conveyor, can't anchor it as the favorite, can't
be starred, and its Gene Cards never appear in drafts. The save carries `towerUnlocked`
(starters = every def without a gate); pre-gate saves grandfather in any kind they engaged
with. The sim receives the roster per run (`RunOptions.unlocked`; omitted ⇒ ALL — the
golden/tests path is untouched).

**Balance verification (probe, 5 seeds × stages 1/5/8 × ×0.75/×1.0/×1.7):** the DIFFICULTY.md
§contract bands held unchanged at the 8-kind roster (s8: 3/5 wins at ×0.75, 5/5 + chip at
×1.0, 5/5 + 0 lost at ×1.7; the s5 mid-stage keeps its structural ~20-integrity artillery chip
at every ratio — pre-expansion baseline). Mono-board checks at s5 ×1.0: MONO-maw 2/5 wins
(lost 101) and MONO-chrysalis 3/5 (lost 107) vs the mixed board's 5/5 (lost ~24) — the new
kinds anchor nothing alone (niches, not clones) but function (needle-mono is 0/5 by
comparison). The Effigy is zero-damage by definition and was probe-capped alongside the
reactor in the instrument's deploy policy (max 2 zero-damage towers per board).

---

## Deep-Strain roster (§deep-strain) — Resonance Coil · Marrow Siphon

The two **beam** towers — the roster's ninth and tenth towers, and the first two to add the
`firing: 'beam'` delivery mode (a hitscan channel, no projectile). They share the beam plumbing
(`towerAttackMods` fold; star/branch grants pulse on each beam's cadence) but are deliberately
**opposite identities**: the **Coil** is a single-target **melter** (locks ONE target; resonance
HEAT ramps its damage the longer it holds, resetting on a switch), while the **Siphon** is a
multi-tether **harvester** (spreads a drain WEB across the wounded, finishing the weakest and
gorging FATTER the more the lane dies — momentum that never hard-resets). One deletes the fat
target the AoE/DoT launch kit can't; the other turns a dying swarm into Biomass. Full spec + gate
mechanics: **`SIPHON.md`** (the compressed system summary, canonical for both).

| | Resonance Coil | Marrow Siphon |
|---|---|---|
| Class / status | **Resonant** / applies **Resonance** — its own reaction status (shattered against any co-present status) | **Vital** / applies **Mark** — reaction fuel harvested into a burst + Biomass (the first Vital **attacker**) |
| Identity | single-target **melter**: resonance **HEAT** ramps damage to **×4** while it holds ONE target (resets on switch) | multi-tether **harvester**: a drain **WEB** (2+ tethers) that finishes the wounded; **Gorge** ramps to **×2.6** on VOLUME (slow decay, no hard reset) + siphons kills into **Biomass** |
| Sim path | `game.beamTowerSystem` (BEAM tunables) | bespoke `game.beamSystem` (SIPHON tunables) |
| Range band | **340** (SKIRMISHER — place FORWARD so the target stays in the beam to ramp) | **300** (HARVESTER — close; place AT the kill-zone where the swarm dies) |
| Cost / cadence / hit | 150 · 0.5 s pulse · 26 base DPS → ramps ×4 (highestHealth — bites the toughest) | 175 · 0.4 s pulse · 22 DPS per tether × 2+ → Gorge ×2.6 + Biomass drain (lowestHealth — finishes the weakest) |
| Counter-play | cold-start weak; a swarm with no fat target never lets HEAT climb | wants VOLUME — a lone elite with no dying lane starves the Gorge (the Coil's mirror) |
| Branches | Overcharge Lattice (runaway single-target delete) / Refraction Prism (splitting beam → crowd) | Insatiable Gorge (finish-the-wounded tide) / Bloodwell (forking rays + Nucleus mend) |

**Identity run-mods:** `coilRampMult` · `coilBeamTargets` (cards *Harmonic Overtuning* /
*Prismatic Conduits*) for the Coil; the Siphon rides its **`SIPHON`** tunables (Gorge ramp, drain
fraction, fork share) plus the two identity Gene Cards *Gorging Instinct* / *Hemophage*. On the beam
pulse the Coil applies **Resonance** and the Siphon applies **Mark** — their own reaction statuses —
completing the six-class reaction matrix (§reactions); the Coil no longer borrows Corrosion.

**Unlock gate (double — the deepest in the game):** both are **doubly progression-gated**. Clearing
**Campaign Stage 15** (`DEEP_STRAIN_STAGE`) is the single milestone that opens the Deep-Strain
roster — only then do their Tower Shards even begin dropping — **and** each is shard-locked
(`unlockShards`: Coil 320 · Siphon 200), which must then bank to claim it. Before the stage gate
their shards are invisible to the loot pool. The same Stage-15 milestone also releases the
seven-card Deep-Strain gene set. Data-driven (`TowerDef.unlockStage` + `unlockShards`) and sim-blind
(the roster arrives via `RunOptions.unlocked`; omitted ⇒ ALL, so the golden/tests path is
untouched) — see `SIPHON.md §gate`.

---

## Trap roster (§trap) — Blight Sower

The roster's **eleventh tower** and the first `firing: 'trap'` — it **never attacks**. Instead the
**Blight Sower** (Caustic) *plants* **armed spore mines** up-lane and the wave walks into them: a
pre-placed **area-denial** identity, the inverse of everyone else's reactive fire. Detonations apply
**Corrosion** (so it feeds **Shred** with any Kinetic partner), and star/branch organs bloom AT the
crater. Its numbers are baked at **plant time** with that moment's mods (a distinct scaling axis):
Caustic · range 300 (planting reach) · one mine per 2.8 s up to a cap · 46 dmg + splash 88 per
detonation · bespoke `game.trapTowerSystem`/`mineSystem`. **Doubly gated** — its Tower Shards only
drop after **Campaign Stage 20**, then **360** must bank (`unlockStage` 20 · `unlockShards` 360);
two signature Gene Cards gate on owning it. Full spec: **`SOWER.md`** (canonical).
