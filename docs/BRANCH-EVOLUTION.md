# Branch Visual Evolution — every tier mutates the tower across all seven senses

> Status: **design → implementation**. Extends the existing Visual Evolution framework
> (`towerEvolution.ts`, `TOWER-BRANCHES.md §9`) so that **every** branch tier visibly /
> audibly mutates the tower across **all seven sensory dimensions**, and each branch reads
> as its own evolutionary lineage. Data-driven; golden-safe; scales to 100 towers.

---

## 1. Goal

A player should recognize a tower's **specialization** and roughly its **tier** from a
glance at the battlefield — never by opening the inspector. Each of a tower's two branches
is a distinct **evolutionary lineage**: one might grow *increasingly organic* (spines →
living needles → mutation sacs), the other *increasingly mechanical* (railgun → carbon
barrels → energy coils). Every purchased tier is a **mutation**, not a stat bump.

### The seven sensory dimensions

| # | Dimension | Owner | What "mutates per tier" means |
|---|-----------|-------|-------------------------------|
| 1 | **Model** (silhouette) | `towerEvolution.ts` | a NEW organ grows each tier; body swells |
| 2 | **Projectile** | `renderer.ts drawSkinnedProjectile` | the shot grows + gains detail with tier |
| 3 | **Particles** (muzzle) | `game.emitBranchSignature` | the matter sprayed per shot escalates + shifts |
| 4 | **Idle animation** | organ drawers (`PART_DRAWERS`) | organs pulse / throb / orbit; growth-in on purchase |
| 5 | **Attack animation** | muzzle flash + organ recoil | flash + recoil grow with tier |
| 6 | **Sound** | `sound.ts` branch cues | per-shot cue deepens / thickens with tier |
| 7 | **Impact** | `game.spawnBranchImpact` (NEW) | the shot LANDS a branch-flavoured burst, scaled by tier |

---

## 2. What already exists (do NOT rebuild)

The framework is data-driven and already covers **four** dimensions per-tier:

- **Model** — `BRANCH_EVOLUTION[branchId].parts`: an "organ vocabulary" (halo, barbs, barrel,
  armor, biomass, organs, spikes, limbs, tendrils, fangs, crown, glyphRing, arcs, pods,
  ripples, heart, nova). Every tier 1..5 introduces a new organ (enforced by
  `towerEvolution.test`), and the body silhouette scales `+growth` per tier.
- **Projectile** — `drawSkinnedProjectile` reads `p.skin` (= branchId) and `p.skinTier`; size
  `= 1 + (tier-1)·0.12` and several skins add detail at high tier.
- **Idle** — organ drawers animate continuously (pulse / orbit / heartbeat / whip); the body
  "breathes"; a freshly bought organ grows in over `MUTATION_GROW_TIME`.
- **Attack** — the muzzle flash radius scales `+tier·0.08`; firing recoil (`fired`) feeds the
  organ drawers; a one-shot mutation shockwave fires on purchase.

### The two real gaps this work closes

1. **Particles & Sound are frozen after Tier 1.** `BranchTier.particle` / `BranchTier.sfx` are
   set only on each branch's Tier-1 row, and `resolveBranchKit` folds "highest tier that sets
   one wins" — so tiers 2..5 spray the *same* matter and play the *same* cue as tier 1.
2. **Impact is generic.** A branch shot lands the base `'hit'` cue + no branch matter; the
   plague shot and the railspike detonate identically.

---

## 3. The extension (v2) — three small, data-driven mechanisms

All three are **cosmetic** (FX rng + sfx queue only) ⇒ they never perturb the pinned sim, and
they are inert on the unbranched/autoplay path (tier 0 → empty kit, `p.skin` undefined) ⇒ the
golden run stays **byte-identical**.

### 3a. Per-tier escalation factor (auto — every branch, every future tower)

```
intensity(tier) = 1 + EVO.muzzleGrowth · (tier − 1)      // EVO.muzzleGrowth = 0.22
```

`emitBranchSignature(bk, x, y, tier)` scales the sprayed particle's **count** and **speed** by
`intensity(tier)`. A Tier-5 muzzle erupts ~1.9× the matter of Tier-1 — so **particles visibly
escalate every tier for free**, including towers authored years from now.

### 3b. Per-tier signature authoring (data — identity escalation)

`BranchTier` gains an optional **`impact?: ParticleKind`** alongside the existing
`particle?` / `sfx?`. Each branch authors its sensory signature at the tiers where its fantasy
shifts (nascent → developed → apex), and `resolveBranchKit` folds each channel independently
("highest purchased tier that sets it wins"). So climbing a branch both **intensifies** (3a)
and **changes character** (3b): chitin barbs → venom-slick barbs → a shredding barb-storm.

### 3c. Branch + tier IMPACT (new dimension)

At the projectile-hit site (`projectileSystem`) and in `mortarImpact`, when `p.skin` is set:

```
spawnBranchImpact(x, y, skin, tier):
    kit  = resolveBranchKit(skin, tier)
    spray (kit.impact ?? kit.particle) at intensity(tier)        // branch matter on landing
    pushSfx(kit.impactSfx ?? 'hit', tier)                        // branch-flavoured, tier-deepened
```

The projectile already carries `skin` + `skinTier`; no new projectile field. Inert when
`skin` is undefined (golden path).

### 3d. Tier-deepened sound

`pushSfx(tag, tier?)` encodes the tier into the cue tag (`"br_swarm@5"`). `sound.ts cueBatch`
parses the `@tier` suffix into an **intensity 0..1** and the branch synths scale with it
(root pitch drops, an extra partial layers in) — so each tier's shot sounds heavier. Tags
without a suffix are unchanged (every non-branch cue is untouched); GameView's tally is
tag-agnostic, so no view change is needed.

---

## 4. The full mutation matrix

Lineage themes in **bold**. "Model" lists the organ introduced that tier (it keeps the
earlier organs, all swelling). "Proj/Particle/Impact" name the matter; intensity rises every
tier via 3a even where the *kind* holds. Tier-1 names are the in-game tier names.

### 4.1 NEEDLE SPITTER (Kinetic) — **Branch A organic ↔ Branch B mechanical**

**A · Hivemind Swarm** — *flesh that learns to hunt: spines → living needles → a thousand maws*

| Tier | Model organ | Projectile | Particle (muzzle) | Sound | Impact |
|------|-------------|-----------|-------------------|-------|--------|
| 1 Barbed Needles | halo + orbiting **barbs** | stubby venom barb | `barb` (chitin spines) | `br_swarm` | `barb` shard burst |
| 2 Twin Spinnerets | + **limbs** (spinnerets) | twin barb | `barb` (denser) | `br_swarm` | `barb` |
| 3 Venom Coating | + **organs** (venom sacs) | green-tipped barb | `venom` (caustic mist) | `br_swarm` | `venom` splash |
| 4 Swarm Logic | + **spikes** (barbed carapace) | trailing barb | `venom` (thicker) | `br_swarm` | `venom` |
| 5 The Thousand Maw | **nova** (the maw) | max barb + trail | `barbstorm` (capstone) | `br_swarm` | `barbstorm` shred-nova |

**B · Apex Railspike** — *a biogun: rail → carbon barrels → an annihilator coilgun*

| Tier | Model organ | Projectile | Particle | Sound | Impact |
|------|-------------|-----------|----------|-------|--------|
| 1 Hollowpoint | halo + **barrel** (rail) | coil-rail lance | `spark` | `br_rail` | `spark` discharge |
| 2 Armor Render | + **armor** plating | longer rail | `spark` | `br_rail` | `spark` |
| 3 Charged Shot | + **organs** (charge coils) | brighter charged lance | `spark` (heavy) | `br_rail` | `railburst` |
| 4 Executioner | + **limbs** (bracing struts) | longer streak | `spark` | `br_rail` | `railburst` |
| 5 Annihilator Rail | **nova** (flare) | max coil-rail | `railburst` (capstone) | `br_rail` | `railburst` detonation |

### 4.2 BONE MORTAR (Caustic) — **Branch A heavy artillery ↔ Branch B disease/acid**

**A · Necrotic Siege** — *bone cannons → explosive organs → an extinction battery*

| Tier | Model organ | Projectile | Particle | Sound | Impact |
|------|-------------|-----------|----------|-------|--------|
| 1 Caustic Shells | halo + **barrels** (battery) | iron shell + fuse | `ember` | `br_siege` | `ember` (fire + bone shrapnel) |
| 2 Saturation Barrage | + **armor** | fatter shell | `ember` | `br_siege` | `ember` |
| 3 Shrapnel Bile | + **organs** (ember vents) | bigger shell | `ember` (heavy) | `br_siege` | `shrapnel` (bone burst) |
| 4 Carpet Bomb | + **spikes** | heavy ordnance | `ember` | `br_siege` | `shrapnel` |
| 5 Extinction Volley | **nova** | max ordnance | `shrapnel` (capstone) | `br_siege` | `shrapnel` firestorm |

**B · Corrosive Cauldron** — *rot & fungus: acid sacs → dissolving spores → the great dissolution*

| Tier | Model organ | Projectile | Particle | Sound | Impact |
|------|-------------|-----------|----------|-------|--------|
| 1 Acid Reservoir | halo + **biomass** (acid sacs) | wobbling glob | `acid` | `br_acid` | `acid` splash |
| 2 Viscous Tar | + **armor** (pot rim) | bigger glob | `acid` | `br_acid` | `acid` |
| 3 Dissolving Agent | + **organs** (acid glands) | glob + droplet | `acid` (heavy) | `br_acid` | `dissolve` (fungal bloom) |
| 4 Caustic Flood | + **limbs** | shed-droplet glob | `acid` | `br_acid` | `dissolve` |
| 5 The Great Dissolution | **nova** (green) | max glob | `dissolve` (capstone) | `br_acid` | `dissolve` melt-pool |

### 4.3 FLESH REACTOR (Vital, support — pulse not projectile) — **Branch A symbiotic heart ↔ Branch B brooding spire**

Impact = the **pulse** burst (no shot); particles escalate per tier via 3a; the body throbs.

**A · Symbiotic Heart** — *a swelling living engine: heartbeat → veins → the living core*

| Tier | Model organ | Pulse FX | Particle | Sound |
|------|-------------|----------|----------|-------|
| 1 Engorged Sacs | **heart** (beating + veins) | warm bloom | `vital` | `br_vital` |
| 2 Catalytic Lattice | + **organs** | brighter bloom | `vital` | `br_vital` |
| 3 Vital Conduit | + **biomass** (engorged) | mend motes | `vital` (heavy) | `br_vital` |
| 4 Mitotic Surge | + **limbs** (veins) | surge | `vital` | `br_vital` |
| 5 The Living Core | **nova** | vital nova | `vitalcore` (capstone) | `br_vital` |

**B · Brood Spire** — *the reactor grows teeth: egg-pods → tendrils → a hive node*

| Tier | Model organ | Pulse FX | Particle | Sound |
|------|-------------|----------|----------|-------|
| 1 Spore Pods | **pods** (budding) | spore puff | `spore` | `br_spore` |
| 2 Lashing Tendrils | + **tendrils** | lash | `spore` | `br_spore` |
| 3 Brood Mother | + **organs** | richer spore | `spore` (heavy) | `br_spore` |
| 4 Acid Glands | + **armor** (chitin) | corrosive drip | `acid` | `br_spore` |
| 5 The Hive Node | **nova** (green) | corrosive field | `acid` (folds Acid Glands) | `br_spore` |

### 4.4 PARASITE NEST (Viral) — **Branch A pandemic plague ↔ Branch B apex predator**

**A · Viral Apex** — *an unstoppable plague: spores → blisters → a pandemic engine*

| Tier | Model organ | Projectile | Particle | Sound | Impact |
|------|-------------|-----------|----------|-------|--------|
| 1 Virulent Spores | **ripples** (contagion) | spore cluster | `infect` | `br_plague` | `infect` spore-burst |
| 2 Brood Parasites | + **biomass** (blisters) | +spores | `infect` | `br_plague` | `infect` |
| 3 Necrotic Surge | + **organs** | denser cluster | `infect` (heavy) | `br_plague` | `infect` |
| 4 Hemorrhage | + **limbs** | bleeding cluster | `infect` | `br_plague` | `infect` |
| 5 Pandemic Engine | **nova** | max swarm | `pandemic` (capstone) | `br_plague` | `pandemic` outbreak |

**B · Ravager Strain** — *not a plague, a predator: fangs → gore → an apex devourer*

| Tier | Model organ | Projectile | Particle | Sound | Impact |
|------|-------------|-----------|----------|-------|--------|
| 1 Toxic Fangs | halo + **fangs** | barbed gore-dart | `gore` | `br_gore` | `gore` viscera |
| 2 Deep Rot | + **spikes** | +barb | `gore` | `br_gore` | `gore` |
| 3 Virulent Strike | + **armor** (chitin) | faster dart | `gore` (heavy) | `br_gore` | `gore` |
| 4 Necrosis | + **limbs** | double-barb | `gore` | `br_gore` | `gore` |
| 5 Apex Predator Strain | **nova** | max gore-dart | `gore` (capstone, max intensity) | `br_gore` | `gore` rend |

### 4.5 NEURAL OBELISK (Neural, field/caster) — **Branch A psionic control ↔ Branch B storm caster**

**A · Psionic Tyrant** — *a widening throne of domination: glyph-crown → arms → a hive tyrant*

| Tier | Model organ | Field/bolt | Particle | Sound | Impact (T2 lance) |
|------|-------------|-----------|----------|-------|-------------------|
| 1 Dread Field | **glyphRing** + **crown** | wider field | `disrupt` | `br_psi` | — |
| 2 Synaptic Lance | + **organs** | neural bolt | `disrupt` | `br_psi` | `disrupt` bolt-burst |
| 3 Mind Fracture | + **armor** | fracturing field | `disrupt` (heavy) | `br_psi` | `disrupt` |
| 4 Stasis Nova | + **limbs** (psi-arms) | stasis pulse | `disrupt` | `br_psi` | `disrupt` |
| 5 Hive Tyrant | **nova** | vast field | `disrupt` (capstone) | `br_psi` | `disrupt` |

**B · Mindrender** — *the obelisk turns predator: neural spike → arc synapse → a cerebral storm*

| Tier | Model organ | Field/arc | Particle | Sound | Impact |
|------|-------------|-----------|----------|-------|--------|
| 1 Neural Spike | **arcs** (lightning) | searing field | `spark` | `br_storm` | `spark` |
| 2 Arc Synapse | + **organs** (charge nodes) | chain bolt | `spark` | `br_storm` | `spark` |
| 3 Overload | + **spikes** (conductive) | harder field | `spark` (heavy) | `br_storm` | `railburst` |
| 4 Forked Lightning | + **limbs** (tesla arms) | forked arc | `spark` | `br_storm` | `railburst` |
| 5 Cerebral Storm | **nova** | standing storm | `railburst` (capstone) | `br_storm` | `railburst` |

---

## 5. New content this introduces (all data rows)

- **ParticleKinds** (+ `PARTICLE[...]` specs): `venom`, `barbstorm`, `railburst`, `shrapnel`,
  `dissolve`, `pandemic`, `vitalcore`. Each is a recoloured / denser sibling of an existing
  kind (no new render code — `spawnParticles` already takes a spec).
- **`BranchTier.impact?` + `ResolvedBranchKit.impact`** and the fold; authored impacts above.
- **`EVO.muzzleGrowth`** escalation constant (config).
- **Tier-deepened branch synths** in `sound.ts` (parse `@tier` → intensity).

## 6. Invariants & scale

- **Golden-safe:** every channel is cosmetic; tier 0 resolves to the empty kit; `p.skin` is
  undefined on the autoplay path; FX rng / sfx queue are independent of the gameplay rng.
- **Data-driven / O(1) per tower:** adding a branch is still a `branches.ts` row + an organ
  list; impact/particle/sound all read from the resolved kit. No per-tower `switch`.
- **Test invariants:** `towerEvolution.test` (every tier adds an organ) stays green;
  `branches.test` gains: every branch sets `particle`+`sfx`+`impact`, and the resolved
  signature **escalates monotonically** (intensity at T5 > T1). Tier-0 deep-equals the empty
  kit (the golden contract).
