# TOWER-BRANCHES.md — Per-tower Branching Upgrade System (design)

Bloons-TD-style upgrade **paths**, adapted for ASSIMILATE. **Document-first** spec
(per the brief): every upgrade is designed here before any code lands. Companion to
`TOWERS.md` (base towers), `TOWER-STARS.md` (the permanent per-*kind* evolution), and
`CARDS.md` (the run-wide draft). Branches are the **per-instance, in-run** layer.

> **Status:** SHIPPED. **Two contrasting branches per tower** (10 branches, 50 tiers) are
> live; the framework supports N per tower (see §2). A tower instance commits to **one**
> path on the Tier-1 purchase (the lock). Code: `core/branches.ts` (data + resolver),
> `game.towerSystem`/`economySystem` (per-instance fold), `game.buyBranchTier` (+ lock),
> `ui/Inspector` (Mutation panel + confirm). Golden byte-identical (tier 0 = identity).
>
> **As-built roster** (full tier detail in `core/branches.ts`):
> - **Needle** — *Hivemind Swarm* (Barbed Needles → Twin Spinnerets → Venom Coating →
>   Swarm Logic → **The Thousand Maw**) · *Apex Railspike* (Hollowpoint → Armor Render →
>   Charged Shot → Executioner → **Annihilator Rail**)
> - **Mortar** — *Necrotic Siege* (Caustic Shells → Saturation Barrage → Shrapnel Bile →
>   Carpet Bomb → **Extinction Volley**) · *Corrosive Cauldron* (Acid Reservoir → Viscous
>   Tar → Dissolving Agent → Caustic Flood → **The Great Dissolution**)
> - **Reactor** — *Symbiotic Heart* (Engorged Sacs → Catalytic Lattice → Vital Conduit →
>   Mitotic Surge → **The Living Core**) · *Brood Spire* (Spore Pods → Lashing Tendrils →
>   Brood Mother → Acid Glands → **The Hive Node**)
> - **Parasite** — *Viral Apex* (Virulent Spores → Brood Parasites → Necrotic Surge →
>   Hemorrhage → **Pandemic Engine**) · *Ravager Strain* (Toxic Fangs → Deep Rot →
>   Virulent Strike → Necrosis → **Apex Predator Strain**)
> - **Obelisk** — *Psionic Tyrant* (Dread Field → Synaptic Lance → Mind Fracture → Stasis
>   Nova → **Hive Tyrant**) · *Mindrender* (Neural Spike → Arc Synapse → Overload → Forked
>   Lightning → **Cerebral Storm**)

---

## 1. What it is (goals)

- **Every placed tower upgrades individually.** Two Needle Spitters can end a run on
  completely different branches.
- **Bought with Biomass during the run.** Branches are *run-temporary* (like Gene
  Cards) — they reset every run and never touch permanent meta or the save.
- **Two contrasting paths per tower, both shipping now.** Each tower offers two distinct
  playstyles (e.g. swarm vs sniper); the instance locks into one on the Tier-1 buy. The
  data model/resolver/UI/pricing support N paths for future expansion.
- **Tier 1 locks the branch.** Buying Tier 1 shows a confirmation warning; once
  confirmed the tower is committed to that branch for the rest of the run.
- **5 tiers, each significantly pricier.** Geometric cost ramp; Tier 5 is a ~wave-50+
  endless investment (§4).
- **No boring stat bumps.** Every tier visibly *mutates* the tower across several of:
  projectiles · particles · combat behavior · targeting · attack animation · visual
  appearance · sound hooks. The incidental stat ride-along exists but is never the point.
- **Bio-horror throughout.** Towers don't "level up"; they *mutate, engorge, metastasize*.

---

## 2. Framework architecture

The branch layer **reuses the Star evolution vocabulary** (`core/stars.ts`: `StarGrant`
+ `ResolvedStarKit` + `applyGrant`) so no new sim executors are needed — but it resolves
**per tower instance** instead of per kind.

### 2.1 Data model (`core/branches.ts`, new)

```ts
interface BranchTier {
  tier: number;            // 1..5
  name: string;            // players say this ("Twin Spinnerets")
  desc: string;            // what changes, in player words
  cost: number;            // Biomass to purchase this tier
  // stat ride-along (modest; the mutation is the point):
  damageMult?: number;     // default 1
  fireRateMult?: number;   // default 1
  rangeMult?: number;      // default 1
  grants: StarGrant[];     // targeting / projectile / ability / reactor / cosmetic (reused)
  particle?: ParticleKind; // emitted on each attack (sensory mutation)
  sfx?: SfxKind;           // sound hook on attack/cast
}
interface Branch { id: string; tower: TowerKind; name: string; theme: string; tiers: BranchTier[5]; }
const branchRegistry = new Registry<Branch>('branch', …);   // self-registering, validated
```

A **`ResolvedBranchKit`** extends `ResolvedStarKit` with `damageMult / fireRateMult /
rangeMult / particle / sfx`. `resolveBranchKit(branchId, tier)` folds tiers `1..tier`
(cumulative — Tier 3 includes Tiers 1–2).

### 2.2 Per-instance state (`core/types.ts`)

`Tower` gains two **run-time** fields (not persisted — reset each run):
```ts
branchId: string | null;  // null = unbranched
tier: number;             // 0 = none … 5
```
`makeTower` defaults them to `null / 0`.

### 2.3 Application (`game.towerSystem`)

Today each tower folds its per-kind `prog` kit. Branches add **one more fold, gated on
`t.tier > 0`** so an unbranched tower (and therefore every golden/autoplay run, which
never buys branches) takes the *exact current code path* — byte-identical:

```
if (t.tier > 0) {
  const bk = resolveBranchKit(t.branchId, t.tier);   // cached on the instance; recomputed on purchase
  dmgMult   *= bk.damageMult;  rateMult *= bk.fireRateMult;  rangeMult *= bk.rangeMult;
  targeting  = bk.targeting ?? targeting;
  extraProjectiles += bk.extraProjectiles;  splashMult *= bk.splashMult;
  projectileMutators = prog.mutators ⧺ bk.projectileMutators;   // merged (cached)
  extraAbilities run: prog.extraAbilities then bk.extraAbilities;
  cosmeticTier = bk.cosmetics.length (drives the renderer);  emit bk.particle / bk.sfx
}
```

**Support towers (Flesh Reactor):** `towerSystem` currently `continue`s on
`firing === 'support'`. A branched reactor whose tiers grant `extraAbilities` (its
offensive/aura mutations) will run those abilities on the reactor's pulse cadence — a
small, branch-gated extension (still no-op at tier 0 ⇒ golden-safe).

### 2.4 Purchase API (`game.ts`)

```ts
branchOptions(towerId): { branchId, name, locked, tier, next?: { tier, name, desc, cost, affordable } }[]
buyBranchTier(towerId, branchId): 'ok' | 'locked' | 'maxed' | 'poor' | 'badTower'
```
- First purchase on a tower sets `branchId` + `tier=1` (the **lock**). Subsequent
  purchases must pass the same `branchId` and step `tier` 1→5.
- Spends `this.biomass` (same pattern as `placeTower`); refuses if `biomass < cost`.
- The Tier-1 **confirmation warning** is a UI concern (§3) — the sim just locks on buy.

### 2.5 Selection (new: inspect a *placed* tower)

Today the Inspector shows the *armed kind*. We add **placed-instance selection**:
`game.selectPlacedTower(id|null)` + `selectedPlacedId` exposed on `HudSnapshot`
(`selectedTower` instance: kind, branch state, the next-tier offer). Clicking a placed
tower selects it (and disarms placement); clicking empty space deselects.

### 2.6 Golden-safety & save

- Branches are **run state**: never serialized. No save-schema change, no migration.
- `tier === 0` everywhere ⇒ identical to today. Autoplay never buys ⇒ **golden
  byte-identical** (verified in the rigor loop).

### 2.7 Extensibility (multiple branches later)

`branchRegistry` already keys many branches per `tower`; `branchOptions` returns the
list. Adding a second path = a data entry + (once a tower has 2+) the UI shows both
pre-lock. The lock logic (`branchId` pin) already enforces "one path per instance."

---

## 3. Purchase & lock UX

1. **Select a placed tower** → the Inspector becomes the **Mutation panel**: the tower's
   branch(es), each tier as a rung with name/desc/cost, the affordable next tier
   highlighted, locked/owned tiers marked.
2. **Buying Tier 1** opens a **confirmation modal**:
   > *"Splice the **{Branch}** strain? This permanently commits this tower to one
   > mutation path for the rest of the run. There is no reverting."* → **Commit / Cancel**.
3. On commit: Tier 1 applies, the branch **locks** (other paths greyed for that
   instance), and Tiers 2–5 unlock sequentially as Biomass allows.
4. Tiers 2–5 buy directly (no further lock warning — the commitment is already made).
5. Visual/audio feedback per tier: the tower's on-canvas appearance mutates (cosmetic
   tier), a splice sfx fires, and a mutation burst plays at the tower.

---

## 4. Pricing model (balance around Endless)

Costs are **data** (`config.BRANCH_COSTS[tower]` = `[t1,t2,t3,t4,t5]`, shared by both of a
tower's branches), geometric (~×3.7 per tier). **Calibrated to the real endless economy**
— a player reported **~55,000 Biomass banked by wave 20** — so the curve runs from a
"kind of expensive" first pick to a deep-endless capstone:

- **Tier 1 ≈ 500–1000** (affordable by ~wave 3–5; a real commitment, not trivial).
- **Tier 5 ≈ 100,000–200,000** (a wave-40-50+ investment; you fully max maybe 1–2 towers
  per long run).

| Tower | T1 | T2 | T3 | T4 | T5 | 1→5 total |
|---|--:|--:|--:|--:|--:|--:|
| Needle Spitter | 600 | 2,800 | 12,000 | 45,000 | 160,000 | ~220k |
| Bone Mortar | 900 | 3,800 | 15,000 | 55,000 | 200,000 | ~275k |
| Flesh Reactor | 800 | 3,200 | 13,000 | 48,000 | 175,000 | ~240k |
| Parasite Nest | 750 | 3,200 | 13,000 | 48,000 | 180,000 | ~245k |
| Neural Obelisk | 900 | 3,800 | 15,000 | 55,000 | 200,000 | ~275k |

Tuned to the measured endless income curve (ECONOMY.md "in-run Biomass curve"): T1 lands
mid-build (~W12–15), T5 is a deep-endless chase (~W30 for the first, deeper to max a board).

Per-tier stat ride-along stays small (≈ +12–25% dmg/rate per tier) so power comes from the
*mutation*, not the number — the five tiers together roughly 2–3× the tower, fitting a
six-figure Biomass sink. All values are data, tunable in one place after playtest.

---

## 5. The branches (one per tower)

Each tier lists the **facets it mutates** and the **primitive** that implements it
(reused unless marked **NEW**). "stat" = the modest ride-along only.

### 5.1 Needle Spitter — **"Hivemind Swarm"** (Kinetic: one spitter → a self-guiding needle swarm)

| T | Name | Mutates | Effect / primitive |
|--|--|--|--|
| 1 | **Barbed Needles** | projectile, targeting, visual | Needles **pierce 1**; retarget to **fastest**. `projectile{mutators:['pierce1']}` + `targeting:'fastest'` + cosmetic; barb particles. |
| 2 | **Twin Spinnerets** | projectile count, attack anim, rate | **+2 needles/shot**, faster cadence. `projectile{extraProjectiles:2}`, `fireRateMult 1.2`, spin cosmetic. |
| 3 | **Fracture Bloom** | behavior, particles, sound | On impact needles **burst into shrapnel** (small AoE) applying **Fracture**. `ability:[explosion + status Fracture]`; bone-shard particle; `sfx:'crack'`. |
| 4 | **Hunting Swarm** | projectile behavior, targeting | Needles **home & ricochet** to a new target; retarget to **lowest-HP** (finish wounded). `mutators:['homing']`**NEW** + `ability:[chain]`. |
| 5 | **The Thousand Maw** *(capstone)* | everything | A relentless **needle-storm**: **+4 needles, pierce 3, crit vs Fractured**; swarm aura cosmetic, screen-shake volley, signature sfx. `projectile{extraProjectiles:4,mutators:['pierce3']}` + `ability:[crit]`. |

### 5.2 Bone Mortar — **"Necrotic Siege"** (Caustic: artillery → apocalyptic acid bombardment)

| T | Name | Mutates | Effect / primitive |
|--|--|--|--|
| 1 | **Caustic Shells** | splash, particles, visual | **+40% splash**; thicker, harder-ticking Corrosion pools. `projectile{splashMult:1.4}` + pool tuning; acrid-smoke particle. |
| 2 | **Cluster Womb** | projectile, behavior, anim | Each shell **splits into 3 sub-shells** on impact. `mutators:['cluster3']`**NEW** (spawns child explosions) + stat. |
| 3 | **Dissolving Mist** | behavior, particles, sound | Pools also apply **Fracture** and **creep outward**, corroding neighbors. `ability:[debuff Corrosion aura]`; mist particle; `sfx:'hiss'`. |
| 4 | **Meteor Bile** | targeting, visual, behavior | Targets the **densest cluster**; a huge cratering impact. `targeting:'densest'`**NEW** + `projectile{splashMult:1.8}` + `ability:[explosion]`. |
| 5 | **Extinction Volley** *(capstone)* | everything | **3 meteors/volley**, each leaving a lasting acid crater; full-map bombardment cosmetic + signature sfx. `projectile{extraProjectiles:2}` + big pools. |

### 5.3 Flesh Reactor — **"Symbiotic Heart"** (Vital: economy support → a living, lashing core)

Reactor is support; its branch escalates **economy + overcharge** and then grows an
**offensive aura** (the reactor "attacks" — §2.3 support extension).

| T | Name | Mutates | Effect / primitive |
|--|--|--|--|
| 1 | **Engorged Sacs** | economy behavior, visual, particles | **+biomass generation**; pulsing engorged cosmetic, drip particles. `reactor{biomassMult:1.5}`. |
| 2 | **Overcharge Lattice** | support behavior, range, visual | **Bigger overcharge** + wider reach. `reactor{overchargeBonus:0.25}` + `rangeMult 1.4`; arc-link cosmetic. |
| 3 | **Vital Lash** | combat behavior (NEW attack), particles, sound | Grows a tendril: an **aura that damages enemies + heals the Nucleus**. `ability:[aura damage + heal]` (runs on reactor pulse); `sfx:'whip'`. |
| 4 | **Mitotic Surge** | economy + support, visual | Periodic **biomass burst** + a brief **overcharge of all towers**. `ability:[buff]` + `reactor{biomassMult}`; bloom cosmetic. |
| 5 | **The Living Core** *(capstone)* | everything | Huge biomass + overcharge; emits a **vital nova** (AoE damage + big heal) on a heartbeat; spawns biomass motes; signature heartbeat sfx + grand cosmetic. |

### 5.4 Parasite Nest — **"Viral Apex"** (Viral: infection seeder → an unstoppable plague)

| T | Name | Mutates | Effect / primitive |
|--|--|--|--|
| 1 | **Virulent Spores** | behavior, particles, targeting | Infection **ramps faster & spreads +1**; target **highest-HP** (rot the tanks). spore particle; infection tuning + `targeting:'highest'`. |
| 2 | **Brood Parasites** | projectile, visual | **+1 parasite/shot** and parasites **pierce**. `projectile{extraProjectiles:1, mutators:['pierce1']}`. |
| 3 | **Necrotic Burst** | behavior (death-spread), particles, sound | Infected **deaths erupt** in a spore cloud that infects nearby. `ability:[explosion + status Infection]`; `sfx:'squelch'`. |
| 4 | **Hemorrhage** | behavior, targeting | Infection also applies **Fracture**; **bonus damage vs infected**; target **most-infected**. `ability:[crit/status]` + targeting**NEW**. |
| 5 | **Pandemic Engine** *(capstone)* | everything | Infection **barely decays & spreads without limit**; the nest pulses **plague waves** (AoE infect); grand plague cosmetic + signature sfx. |

### 5.5 Neural Obelisk — **"Psionic Tyrant"** (Neural: control field → total domination)

| T | Name | Mutates | Effect / primitive |
|--|--|--|--|
| 1 | **Dread Field** | field behavior, range, particles | **Stronger Disruption** (slow + vuln) over a **wider** field. `rangeMult 1.3` + disruption tuning; hum particle. |
| 2 | **Synaptic Lance** | combat (NEW attack), targeting, anim | The pulse also fires a **neural bolt** at the strongest foe. `ability:[projectile/chain]` + `targeting:'highest'`. |
| 3 | **Mind Fracture** | behavior, particles, sound | Disrupted enemies take **Fracture** + amplified damage. `ability:[status]`; glitch particle; `sfx:'whine'`. |
| 4 | **Stasis Nova** | behavior (CC), visual | Periodic pulse **briefly stuns/roots** everything in range. `ability:[debuff Stun]` (status framework); ring-collapse cosmetic. |
| 5 | **Hive Tyrant** *(capstone)* | everything | A vast permanent domination field; periodic **mass-stun** + a **psionic storm** (AoE damage + heavy vuln); throne cosmetic + signature sfx. |

---

## 6. New primitives required — NONE (shipped on existing seams)

Every tier was built from the **existing** vocabulary, so no new sim executors landed:

- **Grants**: `targeting` (existing profiles — `fastest / highestHealth / elitePriority /
  bossPriority / mostCorrupted / closestToBase`), `projectile` (`extraProjectiles`,
  `splashMult`, `pierce1/2/3`), `ability` (existing components — explosion / aura / chain /
  status / crit / heal / buff / debuff / summon), `reactor` (biomass), `cosmetic`.
- **Two small engine extensions** (both branch-gated ⇒ golden-safe):
  - `towerSystem` runs a branched **support** tower's `extraAbilities` on a pulse cadence
    (`supportBranchPulse`) so the Flesh Reactor can attack/heal/summon; its branch biomass
    folds per-instance in `economySystem`.
  - `drawTower` reads the instance's `tier` for a per-instance "evolved" silhouette, and
    `selectedPlacedId` for the selection ring.
- Per-instance `overcharge` was deliberately **not** wired (the global star path owns it),
  so the Reactor's "lattice" tiers use a run-wide tower-damage **buff** instead (a real,
  wired effect — no dead grants).

---

## 7. Implementation plan (after sign-off)

1. **Framework**: `core/branches.ts` (data + `resolveBranchKit`), `Tower` fields,
   `towerSystem` fold (gated `tier>0`), purchase API, the 2 mutators + 2 targeting
   profiles + support-ability extension. Validation in `core/validate.ts`.
2. **One branch authored per tower** (the 25 tiers above) in `branches.ts` + costs in
   `config.ts`.
3. **UI**: placed-tower selection (sim + `GameView` canvas click + `HudSnapshot`),
   Inspector → Mutation panel, Tier-1 confirmation modal, CSS, per-instance canvas
   cosmetic + mutation burst.
4. **Tests**: `branches.test.ts` (resolve folds cumulatively; purchase locks the branch;
   biomass spent; maxes at 5; `tier 0` kit is identity) + a behavioral check (a branched
   needle out-kills an unbranched one) + **golden unchanged**.
5. **Docs**: flip this file's status to *shipped*; add a CODEMAP entry + a compressed
   summary in the system notes.

## 8. Open questions (for sign-off)

- **Branch identities** — are the five fantasies above the right flavor, or do you want
  different themes (e.g., a more crowd-control Needle, an economy-pure Reactor)?
- **Pricing** — is "Tier 5 ≈ wave 50" the right gate, or earlier/later?
- **Refund/sell** — should selling a branched tower refund any Biomass? (Default: no
  sell exists today; out of scope unless wanted.)
- **Lock granularity** — lock on Tier 1 (as specified) is assumed; confirmed.
