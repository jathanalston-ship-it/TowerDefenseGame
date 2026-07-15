# LEXICON.md — the ASSIMILATION dictionary (canonical player-facing terms)

> **Single source of truth for what the player is called things.** Every UI string, tooltip,
> reward, and doc uses THESE words. Fixes the doc/code/UI naming split (`EA-DESIGN-AUDIT §4`)
> and enforces the identity thesis (`IDENTITY-AUDIT`): the player IS the infection; nothing
> reads like generic fantasy tower defense. **Internal code ids never change** — this is a
> display layer. When a term isn't rolled out in code yet it's marked ⏳ (planned); ✅ = live.

| Concept (internal id) | ✅/⏳ | Player-facing term | Notes |
|---|---|---|---|
| tower | ⏳ | **Strain** / **Growth** | "germinate a strain," never "build a tower" |
| place/build | ⏳ | **Germinate / Seed** | placement ghost = a spore taking root |
| sell | ⏳ | **Reabsorb** | melts inward into Biomass |
| relocate | ⏳ | **Migrate** | the strain crawls |
| star (tower/hero tier) | ✅ | **Evolution** (tier) · glyph **◈** | the ★ icon is banned — see below |
| star fork | ⏳ | **Divergent Mutation** | a branch in the evolutionary path |
| max stars | ⏳ | **Apex Form** | |
| star cap (campaign) | ⏳ | **Evolution Ceiling** | the host's mutation tolerance |
| mastery / rank / XP | ⏳ | **Adaptation** / **Stage** / **Antigen Exposure** | |
| enemy / minion | ⏳ | **antibody / phagocyte / the purge** | the host's immune response |
| wave | ⏳ | **Surge** (Campaign) · **Escalation** (Infinite) | "Surge 12" |
| difficulty | ⏳ | **Virulence** | how hard the host resists |
| boss | ⏳ | **Antigen Prime** / **Immune Titan** | a purpose-built host superweapon |
| integrity (nucleus HP) | ⏳ | **Viability** | drains as necrosis |
| Final Defense Zone | ⏳ | **Necrosis Line** | last membrane before core death |
| stage / map | ⏳ | **Host / Organ** | each stage is an organ |
| Genome Cores (◆) | ✅ | **Genome Cores** | keep — already thematic |
| tower shards (✦) | ⏳ | **Strain Samples** | per-strain DNA (currency rename is a dedicated pass) |
| hero shards | ⏳ | **Apex Genome** | per-champion DNA |
| materials (mutagen/scrap/catalyst) | ⏳ | **Enzyme / Chitin / Catalyst** | |
| Power Score | ⏳ | **Virulence Index** | infection load, not an RPG stat |
| equipment / gear / item | ⏳ | **Graft / Symbiote** | biological augment, not "gear" |
| equip / unequip | ⏳ | **Graft / Excise** | |
| reforge | ⏳ | **Re-sequence** | |
| salvage | ⏳ | **Digest** | breaks down into Enzymes |
| favorite / lock | ⏳ | **Preserve / Encyst** | |
| rarity ladder | ✅ | **Inert · Active · Virulent · Rampant · Apex** | common→exotic; ids unchanged |
| hero | ⏳ | **Apex** / **Vanguard Strain** | championed hive organism |
| hero loadout/slots | ⏳ | **Symbiosis Slots** | |
| upgrade / buy | ⏳ | **Mutate / Splice / Express Gene** | |
| prestige / ascension | ✅ | **MOLT** · **Shed & Ascend** | keep MOLT — already in-world |
| achievements | ⏳ | **Assimilation Records** | |
| collection / codex | ⏳ | **Assimilation Archive** | specimens consumed |
| Help / wiki | ⏳ | **The Hive Mind** | a living memory you query |
| Start Run | ⏳ | **Infect** / **Seed the Host** | |
| Start Wave | ⏳ | **Provoke** | you trigger the immune response |
| Continue / Confirm | ⏳ | **Assimilate / Consume** | |
| "NEW!" badge | ⏳ | spore-burst / infection bloom | not a starburst |

## The ★ ban

The five-pointed **★** is the single most generic symbol in the genre. It is **banned from
Evolution tiers** and replaced by the **mutation node ◈** everywhere a tower/hero *tier*
renders (pips, buy buttons, ceremonies, cap displays). Exceptions kept intentionally: a
FAVORITE marker and a "personal best" marker are *different semantics* and are being
reworked separately (→ Preserve/Encyst, → a record glyph).

## Rollout

Rolled out in step 1 (this pass): the **rarity ladder** (Inert…Apex) and the **★→◈**
Evolution swap. Currencies, verbs, and the remaining nouns follow in sequenced identity
passes (`IDENTITY-AUDIT §4`), each a display-layer change with zero save impact.
