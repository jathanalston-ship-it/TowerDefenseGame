# HIVE-INTEL.md — Foundation #2 of the UX consolidation pass

> **The re-founded notification layer.** Every entry is meaningful and answers four questions —
> *what happened · why it matters · what to do · how much stronger* — or it does not appear.
> Silence over noise. Part of the foundational release pass (`docs/UX-CONSOLIDATION.md`).

## What it is

The Command Center's intel feed (`.cc-feed`). Three priorities:

- **ACT** (gold) — a one-tap action is waiting: banked containers to crack, the Advisor's best
  affordable Power move (with its exact `+N⚡`).
- **SOON** — the first unrevealed FEATURE whose requirement is *genuinely close* (progress > 25%) —
  "never noise about far horizons."
- **NOTE** — the low-priority tail: the account's recent milestones (the absorbed command-feed
  timeline), each with an `ago` label.

## Architecture

`src/state/hiveIntel.ts` — pure over `SaveData` + an injected clock:

```ts
hiveIntel(save: SaveData, now: number, limit = 6): IntelEntry[]
interface IntelEntry { id; icon; priority: 'act'|'soon'|'note'; what; why; action; nav; powerGain?; ago? }
```

Sorted `act < soon < note`, capped. ACT rows come from `pendingContainers` and
`advisorPlan(save, 1).moves[0]`; SOON from the first close unrevealed feature; NOTE from the
timeline top-3 (`agoLabel` from `ui/homeModel`).

**The feed is DERIVED, not logged.** Acting on a fact removes the state that produced its row —
crack the containers and `intel:vault` is simply gone next render, zero bookkeeping.

Rendered by the `CommandFeed` widget in `CommandCenter.tsx` (`is-act`/`is-soon`/`is-note` rows; a
one-tap `.cc-feed-act` button, or an `ago` label for notes). The `command-feed` home widget mounts
whenever the feed has anything to say — timeline **or** pending containers **or** wallet (pinned in
`homeModel.test.ts`; the old timeline-only gate hid a fresh account's first ACT rows).

## Reuse across the shell

The Update Briefing's returning-player **WAITING FOR YOU** strip renders this feed's own ACT rows
(`hiveIntel(...).filter(priority==='act')`), so "what changed" and "what to do now" share one
source (`src/ui/UpdateBriefing.tsx`, `docs/UX-CONSOLIDATION.md` decision 7).

## Invariants

- **Never meaningless.** A broke fresh account gets ≤ 2 rows, no advisor/vault rows (pinned).
- **Self-retiring.** Every ACT row is a live fact; there is no "mark read" state.
- Four questions answered on every row (`what`/`why`/`action`/`nav` all non-empty — pinned).

## Verification

`src/state/hiveIntel.test.ts` (four-questions, act ranking + exact powerGain, self-retirement,
quiet-feed guarantee, timeline note `ago`). The live home probe asserts `feed-act > 0`.
