# BIOMES.md — Biome framework (gameplay, not cosmetics)

Biomes are a **shared ecosystem layer** used by BOTH Campaign Mode (a fixed biome
per stage) and Infinite Mode (biomes rotate as the run goes deep). A biome is no
longer a name + accent colour — it is a bundle of **mechanical modifiers** that
reshape multiple systems at once, so that fighting in the Frostbound Reach feels
materially different from the Ashen Warrens.

This doc is the **single source of truth for every biome modifier**. It is written
**before** the implementation (per the brief) and is the canonical reference: tune
biomes here + in `src/core/biomes.ts`, not by reading the consuming code.

---

## 1. Design goals & guarantees

1. **Every biome is mechanical, never cosmetic.** Each biome modifies *multiple*
   systems (enemy stats, enemy behaviour, tower efficiency, hero performance,
   roster, elites, boss flavour, economy/loot, a periodic hazard, visuals, audio).
2. **Smooth, spike-free difficulty (Campaign).** Biome stat mods are
   **threat-balanced**: every buff is paired with an offsetting nerf (faster ⇒
   frailer; tankier ⇒ slower). The *base* difficulty curve (`stageScaling` in
   `campaign.ts`) stays a pure, monotonic function of stage; the biome layer changes
   the *shape* of a threat, not its magnitude. So a stage in a "hard-looking" biome
   is not a spike — it just demands a different answer.
3. **Strategy texture without build invalidation (Infinite).** Tower modifiers are
   **per-combat-class** and moderate (±~10–15%). A biome makes one class *shine* and
   another *dip*, nudging which towers you lean on — but every class still works, so
   a biome transition never bricks a build. No hard counters.
4. **Deterministic.** Biome selection is a pure function of (stage #) in Campaign and
   (depth) in Infinite. Hazard pulses are a pure function of sim time. No new RNG
   draws on the golden path.
5. **Golden-safe.** Stage Mode (the authored golden run) uses the `NEUTRAL_BIOME`
   identity (all mults ×1, all bonuses +0, no hazard). Every hook multiplies by 1.0 /
   adds 0, so the simulation is byte-identical and the golden tests do not move.

---

## 2. The modifier model (`BiomeModifiers`)

Each biome carries one `BiomeModifiers` record. The sim reads it at fixed hook
points; adding/removing a biome is one data row. Knobs (identity value in parens):

### Enemy (applied at spawn, per enemy — like the campaign speed scalar)
| Field | Meaning | Identity |
|---|---|---|
| `enemyHpMult` | × max HP | 1 |
| `enemySpeedMult` | × move speed (stacks with campaign stage speed) | 1 |
| `enemyDamageMult` | × contact (integrity) damage | 1 |
| `enemyArmorBonus` | + flat armour | 0 |
| `enemyRegenFrac` | + regen as a fraction of maxHP / sec (reuses the regen system) | 0 |
| `bountyMult` | × bounty (in-run economy = the biome's "loot weighting", both modes) | 1 |

### Towers (efficiency — build-shifting, never build-breaking)
| Field | Meaning | Identity |
|---|---|---|
| `towerClassMult` | × damage, keyed by combat class (`Caustic/Kinetic/Neural/Viral/Vital`) | {} ⇒ 1 each |
| `towerFireRateMult` | × fire rate for ALL towers | 1 |

### Hero (performance)
| Field | Meaning | Identity |
|---|---|---|
| `heroDamageMult` | × hero attack damage | 1 |
| `heroCooldownMult` | × ability cooldown (lower = faster) | 1 |

### Roster / encounters (selection — exclusive enemies, elites, boss flavour)
| Field | Meaning | Identity |
|---|---|---|
| `bias` | category weight × (`swarm/fast/heavy/special`) on the roster roll | {} ⇒ 1 |
| `signature` | biome-DOMINANT enemy kinds (heavily up-weighted, and force-present) | [] |
| `eliteMult` | × elite frequency in this biome | 1 |
| `bossChassisBias` | weights the procedural boss's chassis (body plan) toward a biome flavour | {} ⇒ uniform |
| `difficulty` | the biome's OVERALL toughness as a damage-multiple, folded into `recommendedPower` as a ratchet (docs/DIFFICULTY.md §contract) — authored, since hazards/bias/armor interact too nonlinearly to derive | 1 |

> **"Exclusive" = dominant, not hard-locked.** Signatures are heavily up-weighted and
> guaranteed to appear, but not the *only* spawns — hard locking risks empty/invalid
> rosters across a long rotating run and can brick a build. Hard biome-locked content
> is a documented future hook (§7), not the v1 contract.

### Hazard (periodic, telegraphed environmental pulse)
A single, data-driven pulse — no per-biome code. Active when
`period > 0 && (simTime mod period) < duration` (pure function of time):

| Field | Meaning | Identity |
|---|---|---|
| `hazard.period` | seconds between pulses (`0` = no pulse; the biome's identity is its passive mods) | 0 |
| `hazard.duration` | pulse length (s) | 0 |
| `hazard.enemySpeedMult` | × enemy speed DURING the pulse | 1 |
| `hazard.towerRateMult` | × tower fire rate DURING the pulse | 1 |
| `hazard.name` / `desc` | telegraph text (HUD banner) | — |

The pulse reads at the same two sites as the steady mods (enemy move, tower fire),
so it costs no new systems. It is surfaced to the renderer + HUD so it is *seen and
heard* before it bites.

### Presentation
| Field | Meaning |
|---|---|
| `accent` | CSS var driving the biome tint (background gradient, particles, HUD chip) |
| `ambient` | audio tuning `{ root, fifth, cutoff, wave }` — reserved data seam; the composed music engine (src/audio/music.ts) owns the soundtrack, and per-biome flavor will ride its intensity/layer API |

---

## 3. The biomes (full modifier table)

Eight biomes (the rotation order). All stat mods are threat-balanced (see §1.2). Biomes 7–8 are
the **deep** biomes: in Campaign/Infinite/Boss-Rush rotation they first appear at stage/depth 31–40
(regions 7–8), so their harsher character lands when the player is stronger; the Daily rolls any of
the eight uniformly.

### 1. Verdant Hive — `verdant` · accent `--caustic` (green)
Lush, fast-breeding swarms — many fragile bodies, fast.
- Enemy: hp **×0.90**, speed **×1.12**, bounty ×1.0.
- Towers: **Caustic ×1.10** (splash thrives vs packs), Kinetic ×0.96.
- Hero: damage ×1.05.
- Roster: swarm ×1.3, fast ×1.15; signature `mite`, `larva`; elite ×0.9.
- Boss: `swarmlord` flavour.
- Hazard **Spore Bloom** — period 18s, dur 3s, enemy speed ×1.18. *"The hive blooms — the swarm surges forward."*

### 2. Necrotic Mire — `necrotic` · accent `--viral` (violet)
Rot and attrition — everything regenerates; grindy, rewards sustained DPS.
- Enemy: hp ×1.08, speed ×0.96, **regen 0.018·maxHP/s**, bounty **×1.08**.
- Towers: **Viral ×1.15** (DoT out-paces regen), Vital ×0.92.
- Hero: cooldown ×1.05 (abilities sluggish in the mire).
- Roster: special ×1.6, swarm ×1.1; signature `knitter`, `revenant`; elite ×1.1.
- Boss: `controller` flavour.
- Hazard **Miasma** — *passive* (period 0): the regen IS the hazard.

### 3. Frostbound Reach — `frostbound` · accent `--kinetic` (ice blue)
Slow, armoured, grinding bulwarks — the line holds longer but towers chill.
- Enemy: hp ×1.12, speed **×0.86**, **armour +5**, bounty ×1.0.
- Towers: **Kinetic ×1.12** (pierces armour), all towers fire-rate **×0.95** (cold).
- Hero: cooldown ×1.06.
- Roster: heavy ×1.5; signature `golem`, `bulwark`; elite ×1.0.
- Boss: `juggernaut` flavour.
- Hazard **Deep Freeze** — period 20s, dur 3.5s, tower fire rate ×0.85. *"Towers ice over — fire rate drops."*

### 4. Ashen Warrens — `ashen` · accent `--vital` (ember)
Aggressive, fast, hard-hitting packs — race the line, punish slow reactions.
- Enemy: hp **×0.88**, speed **×1.15**, damage ×1.06, bounty ×1.0.
- Towers: **Neural ×1.08**, Caustic ×0.95.
- Hero: damage ×1.05.
- Roster: fast ×1.7, swarm ×1.2; signature `rusher`, `darter`; elite ×1.0.
- Boss: `bruiser` flavour.
- Hazard **Firestorm** — period 16s, dur 3s, enemy speed ×1.25. *"A firestorm whips the swarm into a sprint."*

### 5. Carapace Wastes — `carapace` · accent `--neural` (teal)
Armoured, shielded bulwarks — demands shred / armour-pierce, slower cadence.
- Enemy: hp ×1.10, speed ×0.92, **armour +6**, bounty **×1.05**.
- Towers: **Kinetic ×1.12**, Caustic ×0.90.
- Roster: heavy ×1.6, special ×1.3; signature `bulwark`, `warden`; elite ×1.0.
- Boss: `juggernaut` flavour.
- Hazard **Shellquake** — period 22s, dur 4s, tower fire rate ×0.90. *"The ground heaves — towers misfire."*

### 6. Neural Expanse — `neural` · accent `--gold` (gold)
High-pressure, erratic, overcharged — richest economy, fastest abilities, chaos.
- Enemy: hp ×0.94, speed ×1.05, **damage ×1.10**, bounty **×1.10**.
- Towers: **Neural ×1.12**, Vital ×1.05.
- Hero: cooldown **×0.95** (overcharged — abilities come faster).
- Roster: fast ×1.2, special ×1.4; signature `wisp`, `darter`; elite ×1.1.
- Boss: `controller` flavour.
- Hazard **Static Field** — period 14s, dur 2.5s, enemy speed ×1.2 AND tower rate ×0.92. *"A static surge — the swarm jolts, towers stutter."*

### 7. Molten Verge — `molten` · accent `--molten` (crimson)
Deep volcanic siege-front — slow, armoured, **hard-hitting** bombardment. The line holds, but every
breach scorches. The first biome to field the **`artillery`** boss chassis.
- Enemy: hp **×1.12**, speed **×0.88**, **damage ×1.10**, **armour +4**, bounty ×1.06.
- Towers: **Caustic ×1.12** (splash/DoT chews the grouped siege), Neural ×0.95.
- Hero: cooldown ×1.04 (heat saps abilities).
- Roster: heavy ×1.5, special ×1.3; signature `brute`, `spitter`; elite ×1.0.
- Boss: **`artillery`** flavour (the bombardier body plan — previously unused by any biome).
- Difficulty ×1.20 (tanky + armour + hard-hitting = the harshest region).
- Hazard **Eruption** — period 19s, dur 3s, enemy speed ×1.20. *"A lava surge whips the slow siege into a charge."* (a surge on a normally-slow biome — the inverse of the fast biomes' hazards.)

### 8. Tempest Reach — `tempest` · accent `--tempest` (electric violet)
A charged ionosphere — the ambient static **overclocks your towers** (the only biome to buff global
fire rate), but the storm-hardened hosts are tanky, armoured, shielded and shrug it off. A different
rhythm: your towers scream while a durable host grinds in.
- Enemy: hp **×1.10**, speed **×0.94**, **armour +3**, bounty ×1.05.
- Towers: **all towers fire-rate ×1.08** (the charged air quickens every tower), Neural ×1.05.
- Hero: damage ×1.05, cooldown **×0.96** (abilities recharge faster in the storm).
- Roster: special ×1.4, heavy ×1.2; signature `warden`, `cantor`; elite ×1.0.
- Boss: `controller` flavour.
- Difficulty ×1.12 (tanky/armoured, but the tower-rate buff nets it moderate).
- Hazard **Gale** — period 17s, dur 3s, enemy speed ×1.15. *"A gale rips through — the swarm surges on the wind."*

> **Both new biomes cover fresh ground:** Molten Verge is the first user of the `artillery` boss
> chassis; Tempest Reach is the first biome with a **net-positive tower passive** (global fire-rate
> buff) balanced by tankier enemies — so neither duplicates an existing biome's feel.

---

## 4. Campaign integration

`generateStage(stage, difficulty)` already picks `BIOMES[(stage-1) % BIOMES.length]`.
The stage now carries the **full** biome (with modifiers) on `StageConfig.biome`. The
Game sets `activeBiome` once at construction and never changes it (one biome per
stage). The CampaignScreen ladder shows the biome's mechanical character (the existing
modifier/hazard tags now reflect real effects).

The base difficulty curve is unchanged — biome mods layer on top and are **the same
every time you visit that biome**, so a stage stays fully deterministic and the
smooth-scaling guarantee (CAMPAIGN.md §3) holds for the base curve.

---

## 5. Infinite Mode integration — rotation & transitions

- **Rotation.** `biomeForDepth(depth)` = `BIOMES[floor((depth-1) / BIOME_PERIOD) % len]`
  with `BIOME_PERIOD = 5`. So depths 1–5 are Verdant, 6–10 Necrotic, … wrapping
  forever. Pure function of depth ⇒ deterministic.
- **Transition.** At the wave where `biomeForDepth` changes, the Game:
  - swaps `activeBiome` (new spawns use the new ecosystem's mods);
  - emits a `biome` SFX sting + sets a render transition flash + a HUD banner
    ("Entering: Frostbound Reach"), so it *feels* like crossing into a new ecosystem;
  - cross-fades the background tint toward the new accent over a couple of seconds.
- **Already-spawned enemies keep their birth biome's stats** (applied at spawn) — the
  ecosystem you walked out of doesn't retroactively change, which reads naturally.
- **Builds survive transitions** by design (§1.3): moderate, per-class tower shifts.

---

## 6. Determinism & golden-safety (implementation contract)

- Biome selection: pure (stage # / depth). Hazard pulses: pure (sim time). No new RNG
  draws ⇒ the run seed produces the same stream.
- Stage Mode uses `NEUTRAL_BIOME` (identity). Every hook is `x * 1.0` / `x + 0` /
  `period 0`, which is IEEE-exact, so Stage Mode + the golden run are byte-identical.
- Boss chassis bias defaults to uniform when empty, preserving existing boss rolls
  where no bias is supplied.

---

## 7. Known limitations / future hooks

- **Signatures are dominant, not hard-locked** (§2). A `biomeLock` flag on enemy defs
  (true exclusivity) is a future extension; it needs roster-floor guards so a gated
  Campaign stage or a shallow Infinite depth can't produce an empty pool.
- **Hazard pulse has two effect axes** (enemy speed, tower rate). Further axes
  (telegraphed AoE, spawn floods, integrity drain) slot in as new `hazard.*` fields
  read at their site — no new system, same pattern.
- **Biome-exclusive bosses** are expressed as chassis *bias* (flavour), not bespoke
  boss defs; a biome-keyed authored boss table is a future hook on `bossRegistry`.
- **Per-biome audio flavor is a reserved seam** on the composed music engine (intensity/layers), not bespoke tracks (asset-free audio). The legacy re-voiced drone was retired when the music engine landed.
