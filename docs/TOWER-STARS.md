# TOWER-STARS.md — Stars as Evolution (redesign)

Stars stop being a stat dial and become the tower's **evolution tree**: every star is a
**mutation** that changes *what the tower does*. A new star should make a player think
"I have to see this" and queue another run. Aligns the implementation with
`PROGRESSION.md §2.2` ("stars are mostly *behavior*, only lightly *stats*") and the
philosophy in `PROGRESSION-PHILOSOPHY.md §2.2`.

> **Status: BUILT** (`core/stars.ts` + the star ceremony in `ui/TowerLab`/`StarCeremony`; runtime
> numbers in `core/config.ts`). This doc is the design intent. See `GAME-STATE.md`.

---

## 1. The problem

Today a star is `(1 + 0.06·stars)` damage × `(1 + 0.03·stars)` fire rate
(`config.ts: STAR`, `meta.towerProgress`). Five stars = "+30% damage." Nothing to *see*,
nothing to *try*, no decision. That is the stat-stick this redesign removes.

## 2. Principles

1. **Every star is a mutation, not a multiplier.** It grants a *capability* — a new
   behavior, attack, interaction, or visual — that is visible in the next run.
2. **Avoid generic %.** A star may carry a *small* incidental stat, but the **headline is
   always a mechanic.** If the only thing a star does is raise a number, redesign it.
3. **Forks create identity.** At fork stars the player chooses one of two mutually
   exclusive evolutions — **re-selectable per run** (loadout-level), so a maxed tower has
   several distinct configurations, not one.
4. **Excitement is the KPI.** The success metric for a star is "did the player immediately
   want to try it?" — not "+X% DPS."
5. **Scales to 100 towers.** Each tower authors its own path as data; zero per-tower
   `switch` statements in the sim.

## 3. The grant taxonomy (the kinds of star unlocks)

Each star contributes one or more **Grants** (the `op:'grant'` capability language from
`PROGRESSION-PHILOSOPHY.md §3A/B`). The categories the player feels:

| Grant kind | What it changes | Plugs into (existing seam) |
|---|---|---|
| **targeting** | who the tower shoots (focus boss, fastest, clustered, lowest-hp) | `targeting.ts` profiles |
| **projectile** | how the shot behaves (pierce, fork, ricochet, seek, split-on-kill) | new `ProjectileMutator` list, applied at spawn |
| **attack** | an additional/alternate attack (charged shot, volley, beam, aura pulse) | `ability.ts` ability-components |
| **interaction** | enables a Reaction or cross-tower/terrain synergy | reaction system + event bus |
| **conditional** | a triggered ability ("every 5th shot…", "on kill…", "vs slowed…") | `events.ts` bus + ability-components |
| **cosmetic** | a visual mutation of the tower (carapace/glow evolution) | cosmetic registry (`MASTERY.md §5`) |
| **stat** *(rare)* | a small incidental number, never the headline | bucket resolver (S bucket) |

These map onto the **generic ladder roles** from `PROGRESSION.md §2.2` (★1 unlock, ★2
targeting QoL, ★3 on-hit, ★4 economy, ★5 fork A/B, ★6 reaction enabler, ★7 active, ★8 fork
A/B, ★9 capstone, ★10 signature) — but each role is now a concrete grant, themed per tower.

## 4. Architecture

### 4.1 Data: a star path per tower

```ts
// proposed — NOT wired
interface StarNode {
  star: number;                 // 1..N (uncapped; ★ display stops, mechanics don't)
  name: string;                 // "Penetrator", "Hive Queen" — players say these names
  kind: GrantKind;              // headline category (above)
  grants: Effect[];             // capability grants (+ optional small stat)
  desc: string;                 // what changes, in player words (preview text)
  cost: number;                 // Genome Samples; geometric, from PROGRESSION §2.2
}
interface StarForkNode extends Omit<StarNode, 'grants'> {
  options: StarNode[];          // choose ONE; re-selectable per run
}
interface StarPath {
  tower: TowerKind;
  nodes: (StarNode | StarForkNode)[];   // ascending star order
}
```

A registry holds one path per tower — the scalability spine:

```ts
export const starPathRegistry = new Registry<StarPath>('starPath', { idOf: p => p.tower });
```

Adding a tower's evolution = one `starPathRegistry.register(path)` call. No sim edits.

### 4.2 Resolution: permanent unlock + per-run fork pick → a kit

Stars split into two state kinds (the permanent/per-run separation from
`PROGRESSION-PHILOSOPHY.md §3C`):

- **Permanent (saved):** `save.towerStars[tower]` — the highest star unlocked (a trophy;
  never resets outside prestige).
- **Per-run (loadout):** `runLoadout.forkPicks[tower]` — which option is chosen at each
  fork this run.

At run start the resolver folds them into a `ResolvedKit` the sim reads:

```ts
interface ResolvedKit {
  targeting: string;                 // last targeting grant wins (or composite)
  projectileMutators: string[];      // ordered, composed at projectile spawn
  abilities: GrantedAbility[];       // passive + event-triggered components
  reactions: string[];               // enabled reaction ids
  stat: { damageMult: number; /* incidental only */ };
  cosmetics: string[];               // visual mutations
}
```

This is assembled once, frozen, and passed into the `Game` — exactly how `towerProgress`
is snapshotted today, so **a fresh account (no stars) resolves to an empty kit ⇒ the run
is byte-identical ⇒ golden tests unchanged.**

### 4.3 How each grant reaches the sim (no new combat code paths needed)

- **targeting** → sets the tower's `TargetingProfile`; `targeting.ts` already selects by
  profile. New profiles are data.
- **projectile** → a `ProjectileMutator` is a pure transform `(proj, ctx) => void` applied
  at spawn from `kit.projectileMutators`. New mutators register in a `projectileMutatorRegistry`;
  the projectile system iterates the list. (Pierce/fork/ricochet/seek/split are mutators.)
- **attack / conditional** → an `AbilityComponent` (already the tower ability system) bound
  to a trigger: `'passive'`, or a `GameEvent` (`enemyKilled`, `projectileHit`, `waveStarted`)
  via the existing `events.ts` bus. "Every 5th shot" is a counter component; "on kill spawn
  spores" is an `enemyKilled` hook.
- **interaction** → adds a reaction id to the tower's enabled set (the reaction matrix
  already exists); or subscribes a battlefield hook on the bus.
- **cosmetic** → adds a visual-mutation id the renderer keys off (shared with mastery
  cosmetics).

Everything routes through **systems that already exist** (targeting, abilities, events,
reactions, projectiles). The only *new* primitive is `ProjectileMutator` — small and pure.

## 5. Worked paths (proof the architecture expresses distinct towers)

Condensed; full kits become a content doc. The point: three towers, three *different*
evolution fantasies — not one template reskinned.

### 5.1 Needle Spitter (Kinetic) — *precision → overkill*
| ★ | Name | Grant |
|---|---|---|
| ★2 | Tracker | **targeting**: unlock `fastest` profile |
| ★3 | Barbed | **projectile**: pierce 1 (mutator) |
| ★4 | Scavenger | **conditional**: on-kill refund 1 biomass (hook) |
| ★5 | **Fork** | **A Penetrator** (pierce all, dmg falloff) / **B Executioner** (on-hit <20% HP → execute) |
| ★6 | Resonant | **interaction**: enable Fracture reaction |
| ★7 | Railgun | **attack**: charged shot every 3s, line-pierce (ability) |
| ★8 | **Fork** | **A Autocannon** (fire-rate ramp while firing) / **B Marksman** (crit vs full-HP) |
| ★10 | Singularity Round | **attack/signature**: crit kills re-fire at a new target (chain) |

### 5.2 Parasite Nest (Viral) — *infection → pandemic*
| ★ | Name | Grant |
|---|---|---|
| ★2 | Questing | **targeting**: `mostCorrupted` (focus already-infected) |
| ★3 | Virulent | **conditional**: infection stacks spread on death (hook) |
| ★5 | **Fork** | **A Hatchery** (spawns parasite swarmlings) / **B Plaguebearer** (infection also slows) |
| ★6 | Symbiotic | **interaction**: infection enables Corrosion reaction |
| ★7 | Brood | **attack**: periodic spore burst aura (ability) |
| ★8 | **Fork** | **A Apex Strain** (infection ramps uncapped on elites) / **B Pandemic** (spread radius ×) |
| ★10 | Total Infestation | **signature**: infection becomes self-sustaining lane-wide |

### 5.3 Neural Obelisk (Neural) — *control → domination*
| ★ | Name | Grant |
|---|---|---|
| ★2 | Fixation | **targeting**: `highestHealth` (lock the biggest threat) |
| ★3 | Static | **projectile**: field pulses jump to a 2nd enemy (fork) |
| ★5 | **Fork** | **A Hijack** (briefly converts a normal enemy) / **B Terror** (fear: enemies flee) |
| ★6 | Synaptic | **interaction**: vulnerability enables cross-tower amp |
| ★7 | Suppressor | **attack**: AoE silence pulse (ability) |
| ★8 | **Fork** | **A Dominator** (convert lasts longer) / **B Disruptor** (slow → stun at cap) |
| ★10 | Hive Override | **signature**: mass-convert a chunk of a wave |

Needle = projectile/precision; Parasite = spread/economy of infection; Neural =
control/conversion. The grant taxonomy carries all three with no bespoke code.

## 6. Excitement & UX

- **Preview before you buy.** The Star screen shows each upcoming node's name + `desc` and
  a short animation/telegraph — the *anticipation* is part of the spend.
- **"Try it now" loop.** A freshly unlocked star is immediately visible next run; forks are
  re-pickable from the loadout so experimentation is free.
- **Names players say.** Every node has a proper name (Railgun, Plaguebearer) — stars become
  vocabulary, not "+6%."
- **Forks = replay.** ★5/★8 forks × towers = a combinatorial reason to run again.

## 7. Scaling, compatibility, anti-inflation

- **100 towers:** each is one `StarPath` data entry; the sim iterates registries and grant
  lists — no `switch`, no per-tower code.
- **Anti-inflation:** stars stay in the **S bucket** (additive-damped, `PROGRESSION §1.2`).
  Incidental stat per star stays tiny; the *pull* is the next mechanic. Power Score barely
  moves; build space explodes.
- **Golden-safe migration:** existing saves keep `towerStars[tower]` counts; the resolver
  maps a star count onto the path's first N nodes. With no path authored yet, the kit is the
  current small stat → unchanged. A fresh account has empty kits ⇒ identity ⇒ golden intact.
- **Determinism:** kits resolve at run start into the frozen `RunConfig`; any rng (e.g.
  ricochet target) uses the sim's seeded rng, never `Math.random`.

## 8. Build order (when implementation starts)
1. `ProjectileMutator` primitive + `projectileMutatorRegistry` (the only new combat seam).
2. `StarPath`/`StarNode` types + `starPathRegistry`; the resolver → `ResolvedKit`.
3. Per-run `forkPicks` in the run loadout; resolve into the kit.
4. Author the 5 launch towers' paths as data; keep incidental stats tiny.
5. Star-screen preview UX. Verify golden byte-identical at every step.
