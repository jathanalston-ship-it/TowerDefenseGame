# Hero Expeditions — the benched-roster idle lane

Owned heroes who are **not** in the fielded run loadout can be sent on real-time
away-missions. The roster finally outgrowing the slots is the point: the bench forages
while the front line fights.

## Model (`src/core/expeditions.ts`)

**Seven missions** (`EXPEDITION_DEFS`), 2h–16h, each a fixed base bundle of **Genome
Cores + Gene Essence + materials** (⊕ mutagen / ◳ scrap / ✷ catalyst) plus three axes of
depth:

- **Class affinity** — every mission favors one `CombatClass`; a matching-class hero
  forages **+25%** (`AFFINITY_MULT`). All five hero classes are covered by the board.
- **Risk tier** (`RISK_TIERS`: Safe / Risky / Perilous) — riskier roads roll a claim-time
  outcome: **windfall** (×1.5 / ×2) or **setback** (×0.7 / ×0.5). Setbacks only shrink
  the haul — a mission never returns empty. EV rises with tier (the risk premium).
- **Mastery** — each completion writes `save.expeditions.mastery[defId]` (+2%/run,
  capped +20% — `masteryBonus`). Permanent, per-mission.

**Claim multiplier stack** (`expeditionMult`): `(1 + 0.1×stars) × (1.25 if affinity) ×
(1 + mastery)` — then the risk outcome multiplies on top. A claim can also surface a
**rare find** (`RARE_FINDS`, flat bonus bundle; chance = `0.05 + 0.01×hours +
0.06×risk`, cap 35%). `EXPEDITION_SLOTS = 3` concurrent missions.

## Determinism

Outcome and rare-find rolls hash the mission's identity (`defId:hero:endsAt`, FNV-1a via
`core/hash.ts`) — never stored, never `Math.random`. The same ticket resolves the same
fate in tests, offline, and across reloads.

## Time discipline

Missions store **absolute `endsAt` wall-clock timestamps** (`save.expeditions.active`) —
nothing ticks, so it's offline-safe by construction: a claim just compares
`now >= endsAt`. Every meta API (`expeditionsView` / `startExpedition` /
`claimExpedition`) takes `now` explicitly, so tests never sleep. The sim never sees any
of this.

## Rules (meta)

- Only **benched** heroes go (`heroUnlocked` minus `fieldedLoadout` minus already-away).
- One mission per hero; at most `EXPEDITION_SLOTS` live at once.
- `expeditionsView` exposes the **offer matrix**: every mission × every benched hero with
  its projected multiplier (outcome stays hidden until claim).
- Claiming pays the multiplied bundle (+ any find) into shards/essence/mats, bumps the
  mission's mastery, frees the hero, and writes outcome-flavored timeline events.

## UI

HeroLab → **Hero Expeditions** panel: live countdowns + progress bars (minute tick),
risk chips, affinity + mastery lines per offer, per-hero send buttons showing ★s and the
projected ×mult (affine foragers glow), and a claim ceremony styled by outcome
(windfall / setback / rare find).

## Extending

New mission = one `EXPEDITION_DEFS` row (id, hours, risk, affinity, bundle). New rare
find = one `RARE_FINDS` row. New reward lanes (equipment drops, research points) belong
in `ExpeditionReward` + `claimExpedition`'s fold, keeping the same absolute-timestamp +
hashed-roll discipline.
