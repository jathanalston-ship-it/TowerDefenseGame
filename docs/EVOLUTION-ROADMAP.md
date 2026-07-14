# EVOLUTION-ROADMAP.md — Foundation #4 of the UX consolidation pass

> **The whole progression future on one rail.** Every major system, in the learning curve's order —
> so the future feels exciting, not overwhelming: one ordered path, no surprises, nothing hidden.
> Part of the foundational release pass (`docs/UX-CONSOLIDATION.md`).
> (Not to be confused with `docs/ROADMAP.md`, the *development* build plan.)

## What it is

The Command Center's roadmap rail (`.cc-roadmap`). Conquered wings are history; the **next** wing
leads with a live requirement ring, an honest distance in stages, and the Power its frontier will
ask for; a few far stops trail behind as quiet glyphs. A `{conquered}/{total} wings` count says how
far you've come. Renders nothing once every wing is revealed (the veteran board stays calm).

## Architecture

`src/state/evolutionRoadmap.ts` — pure over `SaveData`:

```ts
evolutionRoadmap(save): { nodes: RoadmapNode[]; conquered: number; next: RoadmapNode | null }
interface RoadmapNode { id; name; glyph; hook; revealed; progress; requirement; stagesAhead; powerAtUnlock }
```

Walks `FEATURES.filter(kind==='screen').sort(order)` → one node each. `revealed` mirrors
`featureRevealed`; `requirement`/`progress` from `evalCondition`; `stagesAhead` from
`guaranteedByStage` (the luck-proof backbone) minus `highestCampaignStage`; `powerAtUnlock` from
`recommendedPowerScore` at the gate stage. `next` is the first unrevealed node (the headline).

Rendered by the `Roadmap` widget in `CommandCenter.tsx` (headline `.is-next` with the ring,
requirement and ready-Power line; three far `.is-far` glyph stops).

## Coalescing contract

Nodes derive from the **same** unlock registry (`state/unlocks` `FEATURES`) that gates the nav and
the What's-New reveals — **the roadmap can never disagree with the doors.** Distance uses
`guaranteedByStage`, Power uses the campaign's own `recommendedPowerScore`, so every number matches
the surface it points at. The rail owns only the *system* curve; resource goals live in Mission
Control's ledger (`docs/UX-CONSOLIDATION.md`).

## Invariants

- Every screen walked, in authored order — nothing hidden (depth stays visible).
- `revealed === featureRevealed(save, id)` for every node; the requirement is always spelled out
  for locked nodes.
- `powerAtUnlock === recommendedPowerScore(stagesAhead, 'standard')` at the gate.

## Verification

`src/state/evolutionRoadmap.test.ts` (registry agreement, authored order, honest distances,
deeper-accounts-conquer-more).
