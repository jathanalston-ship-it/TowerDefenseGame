# DIL.md — the Design Intelligence Layer

The project's **brain**: a typed, bidirectional knowledge graph over every system, content entity,
concept, currency, doc, guide, tutorial, achievement and test — built live from the real
registries, enriched with curated design knowledge, queryable in milliseconds, and enforced by CI.

**The contract: consult the DIL instead of searching the repository.** "What does this affect?",
"what documents/tests/teaches this?", "what is this built on?", "what's missing X?" are lookups,
not investigations.

## Query it

```
npm run dil -- node system:towers          # one node + every relationship, both directions
npm run dil -- affects concept:power-score # transitive downstream impact ("what breaks?")
npm run dil -- requires system:daily       # transitive upstream requirements
npm run dil -- who tests system:mulligans  # who <edge>s this? (tests/documents/teaches/rewards/…)
npm run dil -- missing system tests        # gap query: nodes of a kind lacking an incoming edge
npm run dil -- checklist tower spitfang    # live feature-completion probes
npm run dil -- find siphon                 # substring search across ids/names/summaries
npm run dil -- regen                       # rewrite docs/DIL_GRAPH.md (drift-tested)
```

The written form is **docs/DIL_GRAPH.md** (generated, committed): stats, the domain indexes,
mermaid architecture maps, the gap report, and the full node directory.

## How it stays true (§sources)

| Layer | Source | Freshness |
|---|---|---|
| Systems + their docs/tutorials/help/achievements/save/power edges | `src/dev/systemRegistry.ts` (already CI-enforced: every file claimed, every doc exists) | automatic |
| Content entities (towers, heroes, enemies, bosses, megas, biomes, music) | the live game registries (`TOWER_DEFS`, `BIOMES`, …) | automatic — **new content joins the graph the moment it compiles** |
| Teaching + site surfaces (tutorials, help topics, guides) | `TUTORIALS`, `MECHANICS`, `site/guides.ts` | automatic |
| Tests → systems | file ownership + the `.test` twin's owner | automatic |
| Docs inventory | `docs/*.md` | automatic (unreferenced docs surface in the gap report) |
| **Curated design knowledge** — gates, rewards, balances, presentation couplings, CONFLICTS, future plans | `src/dev/dil/knowledge.ts` | **manual — this is the DIL's memory. One line per learned fact.** |

`src/dev/dil/dil.test.ts` enforces: graph integrity (no dangling edges/orphans), ingestion
completeness (every registry entity is a node), knowledge endpoints resolve (curated edges can
never point at ghosts), **every shipped entity passes its auto checklist**, the untested-system
list is a shrink-only ratchet, and the committed DIL_GRAPH.md matches the built graph.

## Feature checklists (§checklists)

`src/dev/dil/checklists.ts` defines per-feature-type completion checklists whose items are **live
probes** wherever a machine can check (star path exists, branches ≥ 2, silhouette + procedural
body registered, firing audio for discrete-fire kinds, Living-Battlefield influence resolves…) and
explicit manual items where judgment is required (balance pass, lore review, unlock pricing).
A shipped-but-half-integrated entity **fails CI** — it found its first real gap (Spitfang's
missing fire cue) on the day it was written.

## The recursive-improvement protocol (§protocol)

1. **Before non-trivial work:** query the DIL (`node`, `affects`, `requires`) instead of sweeping
   the repo. Check `conflictsWith` edges on everything you're about to touch.
2. **While working:** if you discover a relationship the graph doesn't know — a hidden coupling, a
   landmine, a reward flow, a planned extension — add **one line** to `knowledge.ts` (with a note
   saying WHY; the test requires it).
3. **After adding content/systems:** ingestion picks entities up automatically; run
   `npm run dil -- checklist <kind> <id>` to see what integration remains, and
   `npm run dil -- regen` before committing (the drift test reminds you if you forget).
4. **New feature CATEGORY:** add a node kind / checklist / ingestion pass — the engine is generic.

Every completed feature must leave the graph richer than it found it; the tests make forgetting
expensive and remembering cheap.

## Performance & shape

Stable slug ids (`tower:needle`, `concept:power-score`), indexed adjacency maps (O(1) lookups,
BFS traversals over ~600 nodes/1000+ edges in well under a millisecond), a single build pass from
registries (no persistence to go stale), and one generated artifact. The graph rebuilds fully in
~a second under vite-node — incremental caching is deliberately unnecessary at this scale.
