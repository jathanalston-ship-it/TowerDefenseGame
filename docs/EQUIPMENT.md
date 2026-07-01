# EQUIPMENT.md — Hero Equipment System (canonical spec)

Deep hero-gear design. Companion to `PROGRESSION.md §4` (where Equipment is the
hero-only **E** bucket), `HEROES.md`, `TOWERS.md`. Three slots per hero —
**Weapon · Armor · Relic** — across up to 3 heroes = up to **9 equipped pieces**.

> **Design oath:** **no stat-sticks.** Every item — common to exotic — must change
> *how you play*, not just *how big a number is*. Per the brief: **weapons alter
> attack behavior, armor alters survivability + passives, relics alter gameplay
> rules.** Vertical power is hard-capped (`PROGRESSION §4.5`); variety is horizontal.

---

## 1. Slots & who uses what

- **Weapon** — the hero's offense *behavior*. Weapons have a **type** (Melee, Ranged,
  Conduit) and tag a preferred playstyle, but most are usable by any hero (off-class
  use loses the class-affix bonus, not the behavior).
- **Armor** — survivability + a **passive** and usually a tower-facing **aura** (the
  hero→tower bridge). Types: Carapace (tank), Hide (sustain/mobility), Weave (aura).
- **Relic** — a **rule-bender**. Not stats, not a set — a unique artifact that rewrites
  a run rule, almost always with a trade-off. You collect a *library* and equip one
  per hero.

---

## 2. Rarity tiers

| Rarity | Affixes | Legendary Effect | Role |
|---|---|---|---|
| **Common** | 1 | — | the *base behavior* alone (already gameplay-relevant) |
| **Rare** | 2 | — | base + 2 rolled affixes |
| **Epic** | 3 | — | base + 3 affixes; first build-shaping rolls |
| **Legendary** | 3 | **1 named Legendary Effect** | the build-defining tier; effects below |
| **Exotic** | 3 + 1 Exotic affix | **1 signature effect (fixed)** | hand-designed unique chase items |

- **Commons aren't filler:** because the *base* of every weapon/armor already changes
  play (e.g., "attacks cleave"), even a Common is a real choice, not "+5 dmg."
- **Legendaries** roll their named effect from a pool tied to the base.
- **Exotics** are specific, named, fixed-effect items (the marquee chase) — most of the
  named catalog (§9–11) is Legendary/Exotic tier.

---

## 3. Affixes

Affixes are **mostly behavioral**, drawn from pools by slot. Each rolls a **tier**
(T1→T6) that sets magnitude within a **bounded range** (anti-inflation: you chase a
*better roll*, never an *unbounded* one). Reroll with **Mutagen**; **lock** good
affixes while rerolling the rest.

**Offensive (weapon-biased):** `on-crit: +1 Fracture` · `every 5th hit: AoE pulse` ·
`+attack speed while target >50% HP` · `attacks chain to +1 enemy` · `+reaction
damage` · `first hit on a fresh target: guaranteed crit`.

**Defensive (armor-biased):** `−damage from AoE` · `regen % HP/s out of combat` ·
`on-hit: −X% incoming for 2s` · `revive timer −X%` · `thorns: attackers take a status`
· `immune to [slow/DoT]`.

**Utility (any):** `ability cooldown −X%` · `+ult charge rate` · `+drone count`
(Shepherd) · `+hijack cap` (Overseer) · `+overcharge aura radius` · `+biomass on kill`.

**Class affixes (bonus when hero matches item class):** `+X% [Kinetic/Caustic/Viral/
Neural/Vital] effect` · `+1 to that class's status cap`.

> **Anti-stat-stick rule:** an item may carry **at most one** flat stat affix; the
> rest must be conditional/behavioral. The roll chase is for *behavior + magnitude*,
> not a damage ladder.

---

## 4. Legendary effects (how the named items work)

A **Legendary Effect** is a discrete, named rule the item adds — the same vocabulary
the catalog uses (§9–11). Examples of the *kinds* of effects:

- **Behavior swaps** (weapons): "your attack becomes a piercing line," "you no longer
  auto-attack — you emit an aura instead."
- **Conditional engines** (armor): "overhealing becomes a shield, uncapped," "revive
  once per run."
- **Rule-bends** (relics): "reactions trigger twice," "infection never caps."

Legendary Effects are what make builds; affixes *tune* them.

---

## 4b. Managing gear — cards vs. the Details screen (SHIPPED · `ui/ItemDetails.tsx`)

To keep gear **understandable within seconds**, the two surfaces have distinct jobs:

- **Item cards** (the Armory grid) expose only three actions: **Equip / Unequip**, **Details**, and
  **Favorite**. That's the whole scan-and-slot loop — nothing destructive on the card.
- The **Details screen** is the single place everything else lives: large artwork + Power Score, a
  side-by-side **vs. the equipped item** (with the ▲/▼ Power verdict), affixes each written in
  **plain language** (`affixEffectText` — "+5% Tower Damage", "Hero attacks apply Corrosion"), the
  full upgrade bar (**Enhance / Reroll / Reforge / Upgrade Rarity / Salvage** with live material
  costs), and the item's story: **upgrade potential** (tier headroom vs. its ilvl ceiling), **power
  contribution** (its share of the hero's gear), **source** (`OwnedItem.source` — where it dropped),
  and **mod history** (`OwnedItem.history` — every Reforge op applied). Salvage here is guarded by
  the destruction safeguards (below).

### Destruction safeguards + Undo Salvage (SHIPPED)

Dismantling is hard to do by accident and easy to reverse:

- **Protected states can't be salvaged at all:** a **favorited** item, a **locked** item, or one
  that's **currently equipped** (unequip it first). The Salvage button is disabled with the reason;
  `meta.salvageItem` re-checks as a backstop.
- **The confirm ceremony scales with rarity:** Inert (common) salvages one-click; Active (rare) asks;
  Virulent (epic) asks **with a power comparison**; Rampant+ (legendary/exotic) throws a large
  warning.
- **A higher-Power dismantle hard-warns regardless of rarity** — salvaging gear stronger than what
  the hero wears shows: *"⚠ WARNING / This item has +N higher Power than your equipped {slot}. / Are
  you absolutely sure you want to salvage it?"*
- **Undo Salvage:** the last dismantle is recoverable from an Armory bar until the next salvage
  overwrites the buffer (`save.lastSalvage` — restores the item and reclaims the refunded materials).
- **"NEW" badge:** a freshly-dropped item shows a NEW pip until you open its Details
  (`OwnedItem.seen`).

---

## 5. Upgrade systems

| System | Currency | Effect | Bound |
|---|---|---|---|
| **Item Level** | Catalysts | +5% item power / level | **+20 cap** (×2.0) |
| **Ascension** (post-Apex prestige) | Catalysts + Apex Genes | unlock +21..+30 **and a 6th affix slot** | +30 cap |
| **Affix Reroll** | Mutagen | reroll unlocked affixes (chase tiers) | bounded ranges |
| **Affix Lock** | Mutagen (premium) | protect 1+ affixes while rerolling | — |
| **Relic Attunement** | Resonance | deepen a relic's effect over tiers | bounded tiers |

Upgrade cost is geometric (`cat(n)=10·1.25^n`); reroll is flat-repeatable (the
*optimization sink*). Vertical power is capped on purpose — beyond the cap, growth is
**horizontal** (better affixes, different relics/sets), which is **infinite *optional*
optimization with zero inflation**.

---

## 6. Crafting

A target-craft loop, not pure RNG:
- **Bases** drop or are crafted from **Scrap**; pick a base = pick a *behavior*.
- **Imbue** affixes onto a base using Mutagen + class **Extract** mats (from
  salvaging matching-class gear) → steer affix pools.
- **Transmute** — upgrade an item's rarity tier (Rare→Epic→…) with rarity mats
  (`Catalysts` + boss **Cores**), adding an affix slot.
- **Legendary Forge** — combine 3 Legendaries of a base + a boss Core to **choose**
  the Legendary Effect (deterministic chase target).
- **Exotic Distillation** — Exotics aren't crafted from scratch; you **awaken** a
  found Exotic with **Resonance** to unlock its full signature.
- **Relic Grafting** — fuse two duplicate relics to raise Attunement / add a minor
  secondary effect.

Crafting is **deterministic-ish**: RNG provides the raw material; crafting lets you
*aim*. No item is purely luck-gated.

## 7. Salvaging

- **Dismantle** any item → **Scrap** + **Catalysts** (scaled by rarity/level) +
  class **Extract** + a Mutagen chance.
- **Salvage relics** → **Resonance**.
- **Mass-salvage** by rarity/class filter (QoL; protects locked/favorited gear).
- Salvage→craft is the core gear economy: junk drops aren't trash, they're *feedstock*
  for target-crafting the piece you want.

## 8. Loot sources

| Source | What it gives |
|---|---|
| **Run drops** | 1–3 items/run, rarity weighted by **depth** |
| **Elite / boss drops** | **targeted** drops (boss-specific bases, Cores, guaranteed rarity floor) |
| **Node Caches** | gear + currencies (route choice in-run) |
| **Codex completion** | specific Legendary/Exotic unlocks (collection → gear) |
| **Prestige rewards** | Exotics, Ascension unlock (Apex), Resonance |
| **Vendor** | spend surplus currency on rotating bases/affix mats |
| **Crafting / salvage loop** | deterministic target gear |
| **Omega seasons / leaderboards** | seasonal Exotics + cosmetics |
| **Set bosses** | set-specific pieces (farm the set you want) |

### Materials — how crafting mats drop (SHIPPED · `core/materialDrop.ts`)

Cracking any Genetic Vault container can also yield **crafting materials**, as a deliberate
*secondary* feeder — **equipment stays the primary crafting source** (`EQUIP_DROP_CHANCE = 0.5`
vs. `MATERIAL_DROP.baseChance = 0.3`). Rules (`rollMaterialDrop`, all tunables in
`config.MATERIAL_DROP`):

- **At most one material stack per container**, small quantities. Common feeders (**Mutagen**,
  **Scrap**) are the usual drop; **Catalyst** is the RARE material — *extremely uncommon*
  (`rareBaseChance = 0.03`, capped low).
- **Scales** with account **Power Score**, **campaign progress**, and the **container's rarity**
  (bigger common stacks + slightly better rare odds as you grow).
- **Pity-protected:** after `rarePity` (22) containers without a Catalyst, the next material is a
  **guaranteed Catalyst** (`save.matPity` persists the counter; resets on any Catalyst). Verified
  live: over 120 cracks, the longest dry streak was 21 — the guarantee holds.
- **Reveal identity:** each material has its own name/color/glyph (`MATERIAL_META`) and its drop
  carries a rarity flare (Catalyst = *legendary* amber), so a rare pull makes the whole crack feel
  legendary (the ceremony magnitude reads `topRarity`).

---

## 9. WEAPONS (30) — *alter attack behavior*

Type: **M**=Melee, **R**=Ranged, **C**=Conduit/caster. Most are Legendary/Exotic.

| # | Name | Type · Class | Effect (behavior) |
|---|---|---|---|
| 1 | **Marrow Claws** | M · Kinetic | Attacks cleave an arc; every 3rd hit Fractures all struck. |
| 2 | **Vertebrae Whip** | M · Kinetic | Attacks hit in a line and pull the farthest struck enemy inward. |
| 3 | **Hookmaw Flail** | M · Kinetic | Every 4th attack yanks a target to the hero (peel/displace). |
| 4 | **Sawbone Gauntlets** | M · Kinetic | Attack speed ramps the longer you fight one target (resets on swap). |
| 5 | **Goremaul** | M · Kinetic | Slow heavy slams: AoE + knockback; no single-target spam. |
| 6 | **Tendon Garrote** | M · Viral | Attacks apply a bleed that detonates for burst on the killing blow. |
| 7 | **Splinterfist** | M · Kinetic | Crits shatter into shrapnel hitting nearby enemies. |
| 8 | **Quill Launcher** | R · Kinetic | Auto-attack fires 3 needles in a spread (soft AoE). |
| 9 | **Coilgun Carbine** | R · Kinetic | Charge-up shots that pierce a full line. |
| 10 | **Ricochet Stinger** | R · Kinetic | Projectiles bounce between up to 3 enemies. |
| 11 | **Harpoon Gland** | R · Kinetic | Long single shots that reel big targets toward the hero (or vice-versa). |
| 12 | **Scattergut** | R · Caustic | Close-range cone blast with falloff; point-blank shredder. |
| 13 | **Bile Sprayer** | C · Caustic | "Attack" is a short acid cone leaving a Corrosion pool. |
| 14 | **Marrowbomb Lobber** | C · Caustic | Lobs AoE acid grenades on a timer instead of attacking. |
| 15 | **Corrosive Lash** | M · Caustic | Attacks build Corrosion stacks; next attack consumes them for burst. |
| 16 | **Brood Ovipositor** | R · Viral | Attacks implant a parasite; host death spawns a Crawler. |
| 17 | **Plaguebloom Censer** | C · Viral | No auto-attack — emits an Infection aura that ramps with nearby enemies. |
| 18 | **Vector Needle** | R · Viral | Hits make the target "patient zero," doubling its infection spread. |
| 19 | **Synapse Lance** | C · Neural | Attacks apply Vulnerability; hits on vulnerable targets chain to a 2nd. |
| 20 | **Override Wand** | C · Neural | Attacks have a chance to briefly Hijack weak enemies. |
| 21 | **Static Conduit** | C · Neural | Channels a beam that ramps damage and slows while held. |
| 22 | **Mindspike** | C · Neural | Single beam; massive bonus damage to Hijacked/disrupted enemies. |
| 23 | **Lifegraft Censer** | C · Vital | "Attacks" heal the nearest tower/Nucleus; damage scales with hive HP. |
| 24 | **Bloomstaff** | C · Vital | Attacks spawn healing-spore patches allies/drones stand in. |
| 25 | **Harvest Sickle** | M · Vital | Kills with it yield bonus biomass (economy weapon). |
| 26 | **Totem Driver** | C · Vital | Plants temporary auto-firing turret-totems instead of attacking. |
| 27 | **Paradox Edge** *(Exotic)* | M · — | Every Nth attack repeats your last-used ability for free. |
| 28 | **The Hunger** *(Exotic)* | M · — | Weapon damage grows per kill this run (curve-capped; resets each run). |
| 29 | **Echoflesh Twinblades** *(Exotic)* | M · — | Attacks hit twice but add "strain" (self-dmg); strain converts to damage. |
| 30 | **Null Scalpel** *(Exotic)* | R · — | Attacks ignore all armor/shields but apply **no** status (anti-reaction trade-off). |

---

## 10. ARMOR (30) — *alter survivability + passives*

Type: **Ca**=Carapace (tank), **Hi**=Hide (sustain/mobility), **We**=Weave (aura). Many
carry a tower-facing **aura** (hero→tower bridge).

| # | Name | Type · Class | Effect |
|---|---|---|---|
| 1 | **Chitin Plating** | Ca · Kinetic | On lethal damage, become invulnerable 2s (once/wave) instead of dying. |
| 2 | **Regenerative Hide** | Hi · Vital | Regen %HP/s out of combat; doubled near a Flesh Reactor. |
| 3 | **Spineback Carapace** | Ca · Kinetic | Reflects a % of melee damage back as Fracture. |
| 4 | **Acid Gland Vest** | Ca · Caustic | Attackers gain Corrosion stacks (acid thorns). |
| 5 | **Parasite Symbiote Shell** | Hi · Viral | When hit, spawn a Crawler that attacks the attacker. |
| 6 | **Neural Lace Weave** | We · Neural | Aura: enemies near the hero gain Vulnerability. |
| 7 | **Bloom Cloak** | We · Vital | Aura: heals towers in radius. |
| 8 | **Overcharge Harness** | We · Vital | Aura: +attack speed to towers in radius. |
| 9 | **Phase Membrane** | Hi · Neural | Pass through enemies; −% damage while moving. |
| 10 | **Bulwark Ribcage** | Ca · Kinetic | Gain stacking armor while standing still (zoner). |
| 11 | **Adrenal Sacs** | Hi · Kinetic | Below 30% HP: +attack speed + lifesteal. |
| 12 | **Mirror Cyst** | Hi · Neural | First hit each wave is fully negated. |
| 13 | **Hardened Marrow** | Ca · Kinetic | Immune to slow/stun/knockback. |
| 14 | **Toxin Filter** | Hi · Caustic | Immune to enemy DoT/acid; converts incoming DoT into healing. |
| 15 | **Hive-Linked Plates** | Ca · Vital | Shares incoming damage with nearby drones/summons. |
| 16 | **Predator Hide** | Hi · Kinetic | +damage, −max HP (glass-cannon enabler). |
| 17 | **Sentinel Shell** | Ca · Neural | Taunts nearby enemies (pull aggro off towers). |
| 18 | **Molt Carapace** | Ca · Viral | Periodically sheds: clears all debuffs + small AoE burst. |
| 19 | **Veindrinker Mail** | We · Vital | Aura: hero + nearby allies lifesteal on hitting enemies. |
| 20 | **Static Field Vest** | We · Neural | Aura: enemies that hit the hero are slowed. |
| 21 | **Biomass Reservoir** | Ca · Vital | Stores overflow biomass; releases a heal/shield burst when full. |
| 22 | **Carrion Shroud** | Hi · Viral | Enemies killed near the hero leave healing biomass. |
| 23 | **Reactive Spines** | Ca · Kinetic | Taking a big hit triggers a Fracture nova. |
| 24 | **Living Anchor** | Ca · Vital | Cannot be displaced; +HP while holding ground/channeling. |
| 25 | **Symbiotic Weave** | We · — | Aura: towers in radius gain the hero's class bonuses. |
| 26 | **Ghostflesh** | Hi · Neural | Short blink-dodge on a cooldown (active mobility). |
| 27 | **Pustule Armor** | Ca · Viral | Taking damage builds pustules; at max, explode for AoE Infection. |
| 28 | **Aegis Cortex** *(Exotic)* | We · Vital | Overhealing becomes a shield with **no cap** (stacking shield engine). |
| 29 | **Second Heart** *(Exotic)* | Ca · Vital | Revive once per run at full HP (brief vulnerability window after). |
| 30 | **The Immortal Coil** *(Exotic)* | Hi · — | Can't drop below 1 HP for 3s after lethal (once/wave); survive → heal to full. |

---

## 11. RELICS (30) — *alter gameplay rules*

Relics rewrite **run rules**, almost always with a trade-off. One per hero; collect a
library; **Attune** to deepen. (`+`/`−` = upside/cost.)

| # | Name | Rule change |
|---|---|---|
| 1 | **Hivemind Catalyst** | +Reactions trigger **twice**. −Enemies gain +10% HP. |
| 2 | **Glass Genome** | +All damage ×2. −Nucleus integrity halved. |
| 3 | **Patient Zero** | +Infection never caps & spreads infinitely. −Infection starts 50% weaker. |
| 4 | **Overmind Crown** | +1 Hijack cap; hijacked enemies are permanent. −1 tower slot. |
| 5 | **Acid Rain** | +Corrosion spreads on enemy death. −Pools decay faster. |
| 6 | **Biomass Singularity** | +Biomass income ×2. −No biomass from non-elite kills. |
| 7 | **Frenzy Engine** | +All towers gain attack speed as a wave progresses (resets each wave). |
| 8 | **Famine Doctrine** | +Towers deal +X% per **empty** build slot (rewards minimalism). |
| 9 | **Swarm Doctrine** | +Damage per tower on the board (rewards going wide). |
| 10 | **Last Stand Protocol** | +When Nucleus <25%, all damage ×3. |
| 11 | **Reaction Cascade** | +Reactions can chain into other reactions. −Each reaction hits a given enemy once. |
| 12 | **Symbiosis** | +Heroes share each other's class bonuses. −Each hero −15% solo. |
| 13 | **Adaptive Evolution** | +Every 5 waves a random tower permanently mutates (gamble). |
| 14 | **The Long Game** | +DoT/Infection +5%/sec active. −Burst damage −25%. |
| 15 | **Executioner's Mandate** | +Instantly kill enemies <15% HP. −Elites/bosses immune & +HP. |
| 16 | **Hoarder's Instinct** | +Start with bonus biomass per lifetime prestige. −No income first 5 waves. |
| 17 | **Overclock Core** | +No ability cooldowns for first 10s of each wave. −+50% cooldowns after. |
| 18 | **Pacifist Paradox** | +Towers you *don't* manually upgrade gain +50% (rewards idle/low-APM). |
| 19 | **Blood Price** | +Build using Nucleus integrity instead of biomass (high-risk economy). |
| 20 | **Twin Strain** | +Draft 2 cards per pick (see two), keep 1 (better selection). |
| 21 | **Corruption Engine** | +1 free corruption tier; corruption rewards +50%. |
| 22 | **Mirror Hive** | +At wave start, copy your strongest tower's type onto a random slot. |
| 23 | **Necrotic Bloom** | +Enemy deaths may spawn a friendly spore that fights. |
| 24 | **The Conductor** | +Neural Vulnerability also increases **reaction** damage by its %. |
| 25 | **Endless Hunger** | +Rewards scale +30% faster. −Enemies scale +20% faster (endless-pusher). |
| 26 | **Phylactery** | +First Nucleus death each run: survive at 1 and clear the wave (extra life). |
| 27 | **Apex Instinct** | +Highest-mastery tower gains +1 effective star. −Lowest loses 1. |
| 28 | **Quantum Draft** *(Exotic)* | +Banished cards return to the pool as **upgraded** versions. |
| 29 | **The Devourer** *(Exotic)* | +Codex-complete enemy types can be summoned once/run as a boss-ally. |
| 30 | **Singularity Seed** *(Exotic)* | +At wave 50+, spawn a growing black hole that pulls & damages all enemies (scales with run length). |

---

## 12. Set bonuses (weapons + armor)

Counted across all equipped weapons+armor (up to 6 set-slots over 3 heroes). **2/4/6**
tiers; a 6-piece locks your itemization into one identity (opportunity cost = build
choice). Relics are **not** part of sets.

| Set | 2-piece | 4-piece | 6-piece |
|---|---|---|---|
| **Apex Predator** (Kinetic aggro) | +Fracture on hit | Frenzy ramps faster | kills reset ability cooldowns |
| **Epidemic** (Viral) | infection spreads farther | infection ignores cap | infected deaths spawn Crawlers |
| **Caustic Foundry** (Caustic) | +pool size | +corrosion stack cap | pools detonate on enemy death |
| **Dominion** (Neural) | +vulnerability | +1 hijack cap | hijacked deaths trigger mini Mass-Override |
| **Lifebloom** (Vital) | +heal aura | +overcharge strength | overhealing → team shields |
| **Berserker's Wake** (low-HP, cross-class) | +dmg below 50% HP | +lifesteal | survive 2s after lethal, then heal |
| **Architect** (economy/idle) | +biomass | towers cost less | passive biomass even between waves |

---

## 13. How equipment delivers depth without stat-sticks

- **Behavior-first at every rarity** — even Commons change play (the *base* is a
  mechanic); affixes are ≤1 flat stat by rule.
- **Weapons re-author the attack**, armor re-authors **survival + a tower aura**,
  relics re-author **the run's rules** — three distinct layers of change.
- **Bounded vertical, infinite horizontal** — capped upgrade/affix ranges mean power
  stays legible (`PROGRESSION §1`), while relic × set × affix × hero combinations make
  the build space effectively endless.
- **Deterministic crafting** turns drops into *feedstock*, so the chase is "build the
  piece I want," not "pray to RNG."
- **Cross-layer reach** — armor auras and relics scale *towers*; salvage feeds tower/
  hero *star currencies*; Ascension is a *prestige* payoff — gear is woven into every system,
  not a side pocket.

> **Interactions in one line:** Gear is heroes-only but touches everything — it amps
> Reactions (matrix), scales towers (auras/relics), gates off Mastery/Class/Prestige
> states, feeds star currencies (salvage), and is the late-game Mutagen/Resonance sink. Full
> bucket view in `PROGRESSION.md §6`.

---

## 15. The Armory (collectible inventory UI)

Equipment is presented as a **collectible ARPG inventory**, not a list (`ui/EquipmentPanel.tsx`).

- **Item cards** in a responsive grid — each: procedural **artwork** (`components/ItemArt.tsx`,
  asset-free, rarity-framed + slot/type sigil; premium tiers get an animated sheen), **rarity**
  (color/label), **traits** (affix chips), **set** chip (+ active piece count), **current owner**
  (Equipped · fielded hero), and a **Signature** line for legendary/exotic.
- **Per-card actions:** Equip/Unequip · **Compare** (overlay: selected vs equipped, side-by-side) ·
  **Favorite** (★ pin, sorts first) · **Lock** (🔒 protects from salvage) · reroll/transmute/salvage.
- **Controls:** Category (slot) · Rarity filter · Sort (Power/Rarity/Newest/Name/Set) · Favorites-only.
- **Equipment Score** — `loadoutScore()` (rarity weight + affix tiers + set synergy); shown in the
  Armory header and on each Hero page, and folded into the hero **Power Rating** (`state/heroView.ts`).
- **State:** `OwnedItem.favorite/locked` (additive, persisted); pure read-models `itemScore` /
  `activeSets` / `loadoutScore` in `core/equipment.ts`.
- **Future-proof:** rarity-agnostic colors (mythic-ready), optional `EquipDef.season` ribbon
  (seasonal-ready), data-driven grid (scales to hundreds).

---

## Acquisition & the Power comparison (as built)

**One acquisition path.** Equipment no longer drops per-roll from chest pools. Every container crack has
a **~50% chance** (`EQUIP_DROP_CHANCE`, config) to also yield **at most ONE** item, unified across run
caches + loot-queue boxes (`meta.openContainer`). Its rarity scales with the account **Power Score** —
`powerItemLevel(score)` maps score → an item level (fresh ⇒ Common floor; climbs smoothly; capped so
late-game reads Legendary/Exotic-capable without run-depth spikes) → the existing `rollItemDrop` ladder
via `rollItemForPower`. Folded into the Vault reveal + inventory in one place.

**Power comparison (▲/▼/=).** `state/itemPower.compareItemPower(save, item, hero)` returns the Power
Score delta vs whatever that hero wears in the same slot (`{ delta, verdict, candidate, equipped,
equippedName }`). The presentational `ui/components/PowerDelta` chip (▲ Stronger / ▼ Weaker / = Equal +
"+37 Power", with a hover tooltip) is reused on: the Armory item cards + Compare overlay, and the Vault
reveal (equipment pull faces + summary rows, threaded via `VaultReveal.compareEquip` → `buildReveal`).
`itemPowerScore` (rarity/affix weight × behavioral-effect offense) lives in `state/itemPower` so both
the reveal and the Armory read it without a power↔equipment import cycle.
