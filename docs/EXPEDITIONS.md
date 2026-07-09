# Hero Expeditions — the benched-roster idle lane

Owned heroes who are **not** in the fielded run loadout can be sent on real-time
away-missions. The roster finally outgrowing the slots is the point: the bench forages
while the front line fights.

## Model (`src/core/expeditions.ts`)

Three duration tiers (`EXPEDITION_DEFS`): Perimeter Patrol **2h**, Deep Harvest **6h**,
Relic Descent **12h** — each a fixed base bundle of **Genome Cores + Gene Essence +
materials** (⊕ mutagen / ◳ scrap / ✷ catalyst). `EXPEDITION_SLOTS = 2` concurrent
missions. Payouts scale **+10% per hero star at claim time** (`scaleReward`).

## Time discipline

Missions store **absolute `endsAt` wall-clock timestamps** (`save.expeditions.active`,
v26) — nothing ticks, so it's offline-safe by construction: a claim just compares
`now >= endsAt`. Every meta API (`expeditionsView` / `startExpedition` /
`claimExpedition`) takes `now` explicitly, so tests never sleep. The sim never sees any
of this.

## Rules (meta)

- Only **benched** heroes go (`heroUnlocked` minus `fieldedLoadout` minus already-away).
- One mission per hero; at most `EXPEDITION_SLOTS` live at once.
- Claiming pays the star-scaled bundle into shards/essence/mats, frees the hero, and
  writes departure/return timeline events.

## UI

HeroLab → **Hero Expeditions** panel: live countdowns (minute tick), claim ceremony
line, and a send flow listing every offer × every benched hero.

## Extending

New mission = one `EXPEDITION_DEFS` row. New reward lanes (equipment drops, research
points) belong in `ExpeditionReward` + `claimExpedition`'s fold, keeping the same
absolute-timestamp discipline.
