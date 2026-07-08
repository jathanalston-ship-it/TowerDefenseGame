# ENEMY-ROSTER.md — the implemented bestiary (~40 archetypes, 12 roles)

The IMPLEMENTATION reference for `ENEMY_DEFS` (`src/core/config.ts`). Companion to the
higher-level faction *design* spec in `ENEMIES.md` (fantasy / build-pressure). Every enemy here
trades on a **distinct battlefield identity** that forces a **different placement decision** —
coverage geometry, focus-vs-spread, or intercept timing — not a stat slide.

## How an enemy is defined

Stats + the data-driven `EnemyBehavior` (seek / avoidTowers / avoidHero / separation / jitter /
flying / burrowing) cover swarm / fast / heavy / burrowing / flying / hunter without any new code.
The remaining roles add an **optional trait**, each read by exactly ONE gated hook in the sim:

| Trait | Field(s) | Sim hook |
|---|---|---|
| Shielded | `shieldHp` | `applyDamage` soaks the hit into the front shield before HP |
| Regenerating | `regenPerSec` | `enemyAbilitySystem` self-heal |
| Summoner | `summon {kind,count,interval}` | `enemyAbilitySystem` periodic adds (`spawnNear`) |
| Support | `auraRadius` + `auraRegenPerSec` / `auraShield` | `enemyAbilitySystem` projects heal/shield onto allies |
| Suicide | `explodeRadius`, `explodeDamage` | `hitNucleus` detonation + hero AoE |
| Artillery | `siege {range,damage,interval}` | `enemyMoveSystem` halts short and bombards the core |

**Golden-safe:** the historical seven (runner/brute/tyrant/rusher/tank/flyer/burrower) carry NO
traits, so every hook is a no-op for them and the golden run is byte-identical (verified). New
enemies reach the field through the **registry** (Bestiary codex), the **AI Director** endless
`ROSTER`s, and the **debug panel**; the authored stage waves stay the golden contract.

---

## Roster by role (id · role · identity → placement decision)

### Swarm — many, weak, spread → reward AoE/splash over single-target
- **runner** — Skitterling — baseline chaff trickle.
- **mite** — Gnat Mite — a fragile, very fast cloud (huge separation); single-target wastes shots → bring splash.
- **larva** — Writhing Larva — slow chaff that piles up and clogs the lane (the common summon add).

### Fast — high speed, beeline → front-loaded DPS / static coverage
- **rusher** — Razor Sprinter — beelines, ignores defenses; punishes thin front coverage.
- **darter** — Synapse Darter — fastest; actively slips **past the hero** → needs static towers, not a chaser.
- **lasher** — Whip Lasher — shortest-line charge ignoring towers → punishes any gap in the lane.

### Heavy — high HP/armor, slow → shred + sustained focus
- **brute** — Carrion Brute — armored bulk.
- **tank** — Carapace Hauler — high armor soak.
- **golem** — Calcified Golem — armor 26 → leans hard on Fracture/Corrosion shred.
- **colossus** — Bonecrusher Colossus — an HP mountain (1100) → concentrated sustained fire.

### Shielded — a front shield soaks before HP → burst to crack, then finish
- **bulwark** — Aegis Drone — 120 shield before any HP; chip stalls, burst rewards.
- **warden** — Bastion Warden — shield + armor + HP = a triple wall for focus fire.

### Regenerating — heals over time → out-DPS / burst or it never dies
- **knitter** — Flesh Knitter — mends 26/s → needs burst, not a slow grind.
- **revenant** — Bog Revenant — mends 48/s while slow → demands a dedicated kill-lane.

### Burrowing — ignores obstacles, hunts gaps → even coverage
- **burrower** — Gut Tunneler — tunnels around kill-zones toward gaps.
- **molerat** — Sand Stalker — a **fast** gap-hunter (high avoidTowers) → punishes uneven coverage.

### Flying — over all obstacles → anti-air / wide coverage
- **flyer** — Spore Drifter — drifts over obstacles for the core.
- **wisp** — Mind Wisp — fast fragile air → responsive anti-air.
- **gargoyle** — Bone Gargoyle — **armored** air → anti-air must shred/penetrate, not chip.
- **cystwraith** — Cyst Wraith — a **regenerating** flyer (re-knits 28/s in flight) → anti-air must SUSTAIN, not chip; burst that can't finish it lets it re-form. *(flying + regenerating fusion.)*
- **stratovore** — Stratovore — an **artillery** flyer: shells the Nucleus from 260px at altitude → path answers don't apply AND range answers must reach the air; the coverage puzzle squared. *(flying + artillery fusion.)*

### Summoner — spawns adds on a timer → priority-kill or drown
- **broodmother** — Brood Matron — births mites every 3.5s → focus it down or the swarm compounds.
- **broodweaver** — Brood Weaver — a **self-mending** womb (22/s regen while birthing larvae) → chip damage can't stop the brood; demands a real BURST answer. *(summoner + regenerating fusion.)*
- **hivecaller** — Hive Caller — **shielded** caller flooding larvae → crack the shield fast to stop the tide.

### Support — auras that heal/shield allies → kill the support FIRST
- **mender** — Vital Mender — heals the pack 18/s in radius → nothing dies until the healer does.
- **cantor** — Aegis Cantor — refreshes a 60 shield on the pack → silence it to strip the wall.

### Suicide — fragile bombs that detonate at the line → intercept early
- **bomber** — Bile Bomber — fast bomb; reaching the line detonates (heavy Nucleus + hero AoE) → kill it en route.
- **popper** — Spore Popper — a slow walking mine with a huge blast → kill it well clear of the line.
- **sapper** — Cinder Sapper — a **burrowing** bomb: skirts tower kill-zones (high avoidTowers) to reach the line through gaps, then detonates → demands EVEN coverage *and* early interception. *(burrowing + suicide fusion.)*
- **cataclyst** — Cataclyst — a **heavy** walking bomb: 330 HP of armored bulk carrying a 58-damage blast → the one wave you CANNOT let arrive; forces kill-before-the-line burst instead of line attrition. *(heavy + suicide fusion.)*

### Artillery — halt short and bombard the Nucleus from range → reach it mid-field
- **siegeworm** — Siege Maw — stops 220px out and shells the core (6/volley) → project DPS mid-field.
- **spitter** — Acid Spitter — a nimble standoff lobber from 180px → pressures mid-field coverage.

### Deep-Fauna — fresh role FUSIONS (each pairs two existing gated hooks into a new counter-puzzle)
Like the Cyst Wraith (fly+regen) and Cinder Sapper (burrow+suicide), these reuse existing traits — no
new sim code — but each fuses two into a distinct placement puzzle. Their campaign entry-stage auto-
derives from their traits (`unlockStage`), so they arrive staggered. All draftable in every mode, and
the Bestiary tracks each (the hidden **Deep Fauna** achievement rewards slaying all five).
- **zealot** — Aegis Zealot — a **shielded + regenerating** wall: the shield soaks burst, the flesh re-knits → answer with SUSTAINED shred/anti-regen, not one big hit. *(shield + regen fusion.)*
- **carrier** — Carrion Zeppelin — a **flying + summoner** carrier: drifts over defenses seeding mites behind the line → anti-air + focus it before it floods the backfield. *(flying + summon fusion.)*
- **entrencher** — Bastion Spitter — a **siege + regenerating** bombarder: parks mid-field and out-heals chip while it shells the core → reach it (long range) or burst it down. *(artillery + regen fusion.)*
- **oracle** — Hollow Oracle — a **double-support** keystone: heals AND shields the pack from the backline → kill the keystone FIRST or nothing else dies. *(aura-heal + aura-shield fusion.)*
- **glutling** — Bloat Cluster — a **swarm + suicide** cloud: fast, fragile bomblets that arrive together and detonate as one → AoE them early and keep spacing. *(swarm + explode fusion.)*

### Elite / Apex — premium multi-threats that fuse several roles
- **apex** — Apex Predator — regenerates **and** hunts the hero (avoidHero < 0) — a roaming premium threat.
- **dreadnought** — Dread Nought — shielded + larva-spewing capstone wall (the endless mini-siege).
- **tyrant** — Brood Tyrant — the authored stage-12 capstone (boss-tier body).

> Orthogonal layers: the Director also **promotes** generic elites (×HP/damage/bounty) on top of
> any archetype, and `boss.ts` composes full multi-phase boss encounters. This roster is the base
> archetype set those layers build on.
