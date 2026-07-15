# IDENTITY-AUDIT.md — "Could this exist in another tower defense?"

> **The test.** For every mechanic, screen, currency, button, reward, notification, and
> combat event, ask one question: **could this exist, unchanged, in a generic fantasy TD?**
> If yes, it is a leak in the ASSIMILATION identity and must be re-skinned until the answer
> is **no**. The target verbs — everything should *feel* like one of these, never like
> "tower defense": **growing · mutating · infecting · evolving · assimilating · corrupting
> · consuming · spreading.**
>
> **Grounding:** ASSIMILATION is already ~40% there — towers, currencies, and the Vault are
> bio-flavored. This audit targets the **generic remnants** hiding in the systems layer and
> the UI verbs, and specifies the rename/reflavor + the visual/animation direction for each.
> **No code changed here — this is the spec implementation follows.**

**Status:** PARTIAL — the identity pass has begun: `LEXICON.md` is authored and the ◈ star glyph,
rarity grade ladder (Inert→Aberrant), and currency renames (Strain Samples / Apex Genome) are
shipped. The deeper visual/audio identity work remains PLANNED. Companion: `LEXICON.md`,
`LIVING-HIVE.md`, `STYLE-GUIDE.md`, `GAME-FEEL.md`. Live status: `GAME-STATE.md`.

---

## 0. The identity thesis (the lens for every rename)

The player is not a *commander* placing *turrets* to stop *waves*. The player **IS the
infection** — a rogue hive-mind seeding its own biology into a host world. Reframe every
noun and verb from that seat:

- You don't **build** towers — you **germinate strains**.
- You don't **upgrade** — you **mutate / evolve / splice**.
- Enemies aren't attackers — they are the **host's immune response** (antibodies,
  phagocytes, the purge) trying to reach and sterilize your **Hive Core**.
- A **wave** is an **immune surge**. **Difficulty** is **virulence / host resistance**.
- **Winning a stage** is **assimilating the host**; losing is the host **purging the
  infection**.

Every term below is judged against this seat.

---

## 1. The generic-remnant audit (leak → verdict → assimilation)

Legend: **LEAK** = could be any TD · **PARTIAL** = themed noun, generic mechanic-feel ·
**CLEAN** = already unmistakably ASSIMILATION (leave it).

### Currencies & resources
| Current | Verdict | Assimilate it → | Visual / motion direction |
|---|---|---|---|
| Biomass (in-run) | CLEAN | keep | keep the pulsing ooze meter |
| Genome Cores (account ◆) | PARTIAL | **Neural Cores** — harvested cognition | core "thinks" (slow synaptic flicker) |
| Genome Samples / "Tower Shards" ✦ | LEAK ("shards") | **Strain Samples** (per-strain DNA) | helix shard, per-tower tint |
| Hero Essence / "Hero Shards" | LEAK | **Apex Genome** (per-champion) | denser, glowing helix |
| Mutagen / Scrap / Catalyst (mats) | PARTIAL | **Enzyme / Chitin / Catalyst** | wet/organic vs. current sterile icons |
| "Power Score" | **LEAK** (RPG term) | **Virulence Index** (or **Threat Rating**) | a rising infection-load gauge, not a number badge |
| Ascendant Cells / Molts | CLEAN-ish | keep "Molt"; cells → **Ascendant Strands** | shed-husk motif on molt |

### Towers ("strains")
| Current | Verdict | Note |
|---|---|---|
| Needle Spitter, Bone Mortar, Flesh Reactor, Parasite Nest, Neural Obelisk | CLEAN | best-named system in the game — the model for everything else |
| The word **"tower"** in UI/tooltips | LEAK | replace every player-facing "tower" with **"strain"** (or "growth"). Keep `tower` in code. |
| **"Place / Build"** a tower | LEAK | **"Germinate / Seed"** a strain; the placement ghost is a **spore** that takes root |
| **"Sell"** a tower | LEAK | **"Reabsorb"** — the strain is consumed back into Biomass (visually melts inward) |
| **"Relocate"** | LEAK | **"Migrate"** — the strain uproots as a crawling mass |

### Stars → "the generic upgrade ladder" (biggest offender)
| Current | Verdict | Assimilate it → |
|---|---|---|
| **"Stars" / ★** on towers & heroes | **LEAK** (universal RPG/TD icon) | **Evolutions** — each star is an **Evolution Tier**; the icon is a **mutation node** (◈ / a splitting cell), never a star |
| "Add Star · N shards" | LEAK | **"Splice Evolution · N Strain Samples"** |
| **"Star Cap"** (campaign-gated) | PARTIAL | **"Evolution Ceiling"** — the host only tolerates so much mutation until you spread further |
| "MAX STARS" | LEAK | **"APEX FORM"** |
| Star **fork** picks | PARTIAL | **"Divergent Mutation"** — a branch in the evolutionary path |

> Stars are *already* backed by an evolution system (`stars.ts` grants capabilities). The
> **naming and iconography** are the leak — a ★ is the single most generic symbol in the
> genre. Killing the star icon alone measurably de-genericizes the whole game.

### Mastery → "invisible XP bar"
| Current | Verdict | Assimilate it → |
|---|---|---|
| **"Mastery" / "Mastery XP" / "Rank"** | **LEAK** (every live game has mastery) | **Adaptation** — a strain that fights *adapts* to the host. "Mastery Rank" → **Adaptation Stage**; XP → **Antigen Exposure** |
| Rank titles | PARTIAL | lean fully bio: *Dormant → Colonizing → Endemic → Systemic → Pandemic → Apex Vector* |
| Mastery **halo** (in-game) | PARTIAL | replace the halo with a **corruption aura** that spreads on the ground under veteran strains |

### Enemies → "the host immune response"
| Current | Verdict | Assimilate it → |
|---|---|---|
| Generic "enemy" / "minion" wording | LEAK | **antibodies / phagocytes / the purge** — the host's defenders |
| **"Wave"** | **LEAK** | **"Immune Surge"** (Campaign) / **"Escalation"** (Infinite). "Wave 12" → **"Surge 12"** |
| Enemy roles (runner/brute/flyer…) | PARTIAL | reframe as immune cell types: *Runner → Scout Antibody; Brute → Macrophage; Flyer → Airborne Antigen; Burrower → Subdermal Lymphocyte* |
| **"Boss"** | LEAK | **"Antigen Prime"** / **"Immune Titan"** — a purpose-built host superweapon |

### The battlefield & the goal
| Current | Verdict | Assimilate it → |
|---|---|---|
| **"Nucleus" / Hive Core** | CLEAN | keep — this is the heart you protect |
| **"Integrity"** (nucleus HP) | PARTIAL | **"Viability"** — how alive the Hive Core is; drains as **necrosis** creeping inward |
| **"Final Defense Zone"** | LEAK | **"Necrosis Line"** — the last membrane before the core dies |
| Map / "stage" | PARTIAL | **"Host / Organ"** — each stage is an organ of the host body being assimilated |

### The Vault, loot & rewards
| Current | Verdict | Note |
|---|---|---|
| **Genetic Vault**, **Bio-Containers**, cinematic reveal | CLEAN | the redesigned Vault is a model surface — keep |
| "Container / chest / cache" residual wording | PARTIAL | standardize on **"Bio-Container"** / **"Gestation Sac"**; never "chest" |
| **"Rarity: Common/Rare/Epic/Legendary/Exotic"** | **LEAK** (universal loot ladder) | **Strain Grades:** *Inert → Active → Virulent → Rampant → Apex* (drop "Exotic" → **"Aberrant"**) |
| **"Equipment / gear / item"** | LEAK | **"Mutagens / Grafts / Symbiotes"** — biological augments grafted onto a champion, not "gear" |
| **"Equip / Unequip"** | LEAK | **"Graft / Excise"** |
| **"Reforge"** | LEAK | **"Re-sequence"** (rewrite the graft's DNA) |
| **"Salvage"** | LEAK | **"Digest"** — break a graft down into Enzymes |
| **"Favorite / Lock"** | LEAK | **"Preserve / Encyst"** |

### Heroes → "champions of the hive"
| Current | Verdict | Assimilate it → |
|---|---|---|
| **"Hero"** wording | LEAK | **"Apex"** / **"Vanguard Strain"** — the hive's championed organism |
| Ravager, Shepherd, Overseer | CLEAN-ish | strong; ensure lore frames them as *evolved hive organs*, not knights |
| **"Unlock hero"** → "Release" | GOOD | keep the "Release a dormant strain" framing from the new Collection |
| Hero **"Loadout / slots"** | LEAK | **"Symbiosis Slots"** — grafts fused to the Apex |

### Meta upgrades & prestige
| Current | Verdict | Assimilate it → |
|---|---|---|
| **"Upgrade" / "Buy Upgrade"** | LEAK | **"Mutate"** / **"Express Gene"** — spend Neural Cores to express a permanent gene |
| The 21 meta upgrades' names | AUDIT each | already partly themed (Lethal Spores, Rich Biomass) — purge any with generic stat names |
| **"Prestige" / "Ascension"** | LEAK ("prestige" is idle-game jargon) | **"MOLT"** is already CLEAN — lean into it. Prestige currency = **Ascendant Strands**; the act = **"Shed & Ascend"** |
| **"Achievements"** | LEAK | **"Assimilation Records"** / **"Milestones of Corruption"** |

### UI verbs & chrome (the death-by-a-thous-generic-buttons)
| Current button/label | Assimilate it → |
|---|---|
| Buy / Purchase | **Splice / Express / Cultivate** |
| Continue / OK / Confirm | **Assimilate / Proceed / Consume** |
| Start Run | **Infect** / **Seed the Host** |
| Start Wave | **Provoke** (you trigger the immune response) |
| Auto-Wave / Auto-Gene | **Auto-Provoke / Auto-Splice** |
| Settings | keep (chrome), but skin the panel as a **Genome Console** |
| "Collection" | **Codex → the Assimilation Archive** |
| "Help / Wiki" | **The Hive Mind** (a living memory the player queries) |
| "New!" badge | a **spore-burst / infection bloom** motif, not a starburst |

---

## 2. Combat events — every beat should read as biology

| Event | Generic now? | Assimilate the FEEL |
|---|---|---|
| Tower fires | LEAK (a shot) | a **strain convulses and expels** — muzzle = a wet spray of spores/needles/bile, not a "bullet" |
| Enemy hit-flash | LEAK | a **corrosion bloom** spreads on the antibody's membrane (already partly there) |
| Enemy death | PARTIAL | **lyse / rupture** — the cell bursts into biomass motes that drift toward your strains (you *consume* the kill) |
| Status: Fracture/Corrosion/Disruption | CLEAN-ish | keep; ensure VFX read as *chitin cracking / acid digestion / neural static* |
| Reaction (Shred) | GOOD | frame as a **synergistic mutation reaction** in the tooltip, not a "combo" |
| Wave clear | LEAK ("wave cleared!") | **"Surge Repelled — host tissue assimilated +X Biomass"** |
| Boss spawn | LEAK | the **ground births it** — a birthing-sac animation erupts, screen pulses like a heartbeat |
| Stage clear | PARTIAL | **"HOST ASSIMILATED"** — the organ visibly corrupts/darkens as yours |
| Nucleus damaged | PARTIAL | **necrosis** creeps in from the edges; the whole screen desaturates toward death |

**Animation direction (global):** replace *mechanical* motion (snap, click, slide) with
*organic* motion everywhere — **pulse, throb, bloom, ooze, twitch, spread.** Everything
eases like tissue under tension, not UI panels. The motion language (`UI-MOTION.md`) should
add an **"organic" easing set** (asymmetric, slightly wet) used for all reveals.

---

## 3. Screens — is each one unmistakably ASSIMILATION?

| Screen | Verdict | Fix |
|---|---|---|
| Home / Hub | PARTIAL | already a "living lab" — push further: the hub **breathes**, veins pulse toward whatever is "almost ready" (ties to `ONE-MORE-RUN.md`) |
| Play/Campaign map | PARTIAL | the map is a **host body**; cleared nodes are **corrupted organs**; the frontier **festers** |
| In-run HUD | PARTIAL | rename every label (Integrity→Viability, Wave→Surge, Biomass CLEAN) |
| Results | LEAK-ish | reframe as an **"Assimilation Report"** — how much host you consumed, corruption spread, genome harvested |
| Vault reveal | CLEAN | keep (model surface) |
| Hero Lab | PARTIAL | reframe as the **"Apex Incubator"** |
| Armory | LEAK | reframe as the **"Graft Lab / Splicing Bench"** |
| Codex/Collection | PARTIAL | **"Assimilation Archive"** — specimens you've consumed |
| Settings | chrome | light skin only |

---

## 4. Rename implementation plan (safe, save-compatible)

Renames touch **player-facing strings only** — never stored ids. The codebase already
resolves content through registries with **alias support** (`heroRegistry.resolve`), so:

1. **Display-name layer.** Keep all internal ids (`towerShards`, `stars`, `rarity: 'exotic'`).
   Change only the `name`/`label`/`title` fields + a central UI copy map. Saves are untouched.
2. **Rarity labels** map at the display layer (`'exotic' → "Apex"`) — the `LootRarity` union
   stays; only `RARITY_LABEL`/`RARITY` display maps change (already centralized).
3. **The ★ icon** is the highest-ROI single change: swap the star glyph for a mutation-node
   glyph everywhere it renders (pips, buy buttons, hero/tower cards). Pure presentation.
4. **A `docs/LEXICON.md`** (the ASSIMILATION dictionary) becomes the single source of truth for
   player-facing terms, so no two surfaces disagree (the current doc/code/UI split — see
   `EA-DESIGN-AUDIT §4` — gets fixed here).
5. **Sequence:** (a) LEXICON + the ★→◈ icon swap (1 PR, zero risk); (b) currencies + rarity
   labels; (c) stars→Evolutions, mastery→Adaptation copy; (d) equipment→grafts copy; (e)
   combat-event copy + the "Assimilation Report" results reskin; (f) organic-motion easing set.

**Definition of done for the identity pass:** walk every screen and re-run the test — *could
this exist in another TD?* When the honest answer is "no" on every surface, ship it.
