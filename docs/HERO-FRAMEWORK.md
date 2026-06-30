# HERO-FRAMEWORK.md — Heroes as a primary progression system

Redesigns heroes from "a unit with one ability" into a **data-driven identity framework** with the
depth of towers: every hero has a **Role · Passive · Active · Trait · Scaling mechanic · Strengths ·
Weaknesses**, plus a smarter, role-aware AI. Documented before implementation per the brief.

> Scope of this pass (Part 1): the **framework + the three identities + AI upgrade + Lab surfacing**.
> Numbers are placeholders ("do not rebalance yet"). New mechanics are designed **golden-safe** (see
> §4) so the pinned autoplay outcomes do not drift.

---

## 1. Architecture — a data-driven identity layer (`src/core/heroIdentity.ts`)

`HeroDef` (config.ts) keeps the *base* stats + the signature `ability` (the **Active**). A new,
separate **identity layer** adds everything else, so heroes scale through multiple systems and a new
hero is one data row (future expansion):

```
HERO_IDENTITIES: Record<HeroKind, HeroIdentity>
HeroIdentity = {
  kind, role, strengths[], weaknesses[],
  passive: { name, desc, kind: HeroPassiveKind, amount },   // always-on MECHANIC
  trait:   { name, desc, kind: HeroTraitKind },             // a defining identity rule
  scaling: { name, desc, kind: HeroScalingKind, perStack, cap }, // grows WITHIN a run → stays relevant
  survival: 'aggressive' | 'cautious' | 'evasive',          // AI repositioning profile
}
```

These are **mechanics, not stat bumps** — each `kind` is read by the sim at a fixed hook (like
biomes/difficulty plug in). The Lab renders the identity generically, so the player sees a hero's
full character (mirrors the Tower Codex).

A hero progresses through **four stacked systems**: Stars (meta, permanent), Mastery (lifetime),
Equipment (loadout), and now its **Scaling mechanic** (in-run, identity-specific). That breadth — not
bigger numbers — is the depth.

---

## 2. The three identities

### Ravager — aggressive frontline hunter (Kinetic)
- **Role:** dives the deadliest targets; exists to delete elites & bosses. High mobility, low support.
- **Passive — Apex Predator:** bonus damage vs **elite** enemies (`eliteDamage`).
- **Active — Apex Leap:** the existing AoE fracture leap.
- **Trait — Bloodthirst (`eliteHunter`):** an elite slain during the run heals the Ravager and briefly
  boosts its move speed (mobility payoff for hunting).
- **Scaling — Killchain (`killchain`):** each elite slain this run adds stacking bonus damage (capped) —
  the hunter snowballs, staying relevant at depth where elites dominate.
- **Strengths:** deletes elites/bosses · high mobility · frontline burst.
- **Weaknesses:** fragile, no self-sustain · no tower/crowd support · overextends (see `survival:'aggressive'`).

### Shepherd — summoner / support (Vital)
- **Role:** sustains the line, empowers nearby towers, births organisms, controls crowds.
- **Passive — Symbiosis (`towerAura`):** an innate aura — towers near the Shepherd gain fire-rate +
  damage (drives the existing hero-aura machinery, innately).
- **Active — Bloom:** the existing heal / self-shield / summon-wisps / AoE.
- **Trait — Brood Tender (`broodTender`):** its pulse also lightly slows (crowd control); summons lean stronger.
- **Scaling — Living Hive (`livingHive`):** the aura strengthens per nearby tower — rewards anchoring in a cluster.
- **Strengths:** buffs towers · heals Nucleus · summons + crowd control.
- **Weaknesses:** low personal damage · slow · positioning-dependent.

### Overseer — battlefield controller (Neural)
- **Role:** denies ground, debuffs crowds, manipulates targeting, amplifies the rest of your build.
- **Passive — Neural Static (`vulnField`):** enemies in its field take **+damage from all sources**
  (vulnerability) — area denial + targeting manipulation.
- **Active — Mass Override:** the existing deep-Disruption + tower overclock.
- **Trait — Hijack (`targetHijack`):** the field also drags enemies (extra slow) — denies the lane.
- **Scaling — Overload (`overload`):** the longer the field grips an enemy, the deeper the debuff (uptime).
- **Strengths:** area denial · deep debuffs · amplifies all damage on a marked crowd.
- **Weaknesses:** near-zero direct damage · needs a build to capitalize · fragile.

---

## 3. Hero AI upgrade (`game.ts` hero brains)

Driven by the identity's `survival` profile + role, all golden-safe (§4):

- **Target priority:** the Ravager prioritizes **elite/boss** targets (its identity) before falling
  back to the most-advanced threat — so it spends its burst where it matters.
- **Threat-aware repositioning & survival:** `cautious`/`evasive` heroes (Shepherd/Overseer)
  **retreat toward a safe anchor** when HP is low and **reposition** to their role's hot-spot instead
  of standing in melee; `aggressive` (Ravager) keeps diving (its weakness, by design).
- **Idle behavior:** with no threat, a hero eases to its **role anchor** (Ravager: forward patrol;
  Shepherd: the line in front of the core; Overseer: the densest choke) rather than wandering.
- **Ability value:** positioning is chosen so the role pulse / Active lands on the most targets.

---

## 4. Golden-safety (why the pinned autoplay outcomes don't drift)

The golden test fields the **Ravager** in **Stage mode** autoplay. Two facts make the new mechanics
inert there:
1. **Stage-mode authored waves spawn no `elite` enemies** (elites are an endless/campaign feature).
   Every Ravager identity mechanic is scoped to `enemy.elite === true`, so it **never fires** in the
   golden run (×1 damage, 0 killchain stacks, no Bloodthirst heals) — yet is fully active in
   endless/campaign where elites abound.
2. **Shepherd & Overseer are never fielded** by autoplay, so their passives/traits/AI changes can't
   touch golden.
3. The Ravager's `survival:'aggressive'` profile **reproduces the current dive AI exactly** (no innate
   retreat) — its recklessness is a designed weakness, not a regression.

So the redesign adds real depth while the golden invariant holds with **zero re-baselining**.

---

## 5. Future expansion & limitations
- New hero = one `HERO_IDENTITIES` row + (optional) a new `HeroPassiveKind`/`HeroTraitKind`/
  `HeroScalingKind` read at one hook. The Lab + AI consume it generically.
- Numbers are deliberately placeholder; a balance pass is explicitly out of scope here.
- Hero-Star/Mastery paths already exist; this layer is orthogonal and stacks with them. A future pass
  can author per-hero Star evolutions that grant identity upgrades (the seam is the identity `kind`s).
