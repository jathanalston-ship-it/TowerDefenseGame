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

## UI — §screen

**Expedition Command** (`src/ui/ExpeditionScreen.tsx`) — its own nav wing in the
Progression group (relocated out of the HeroLab basement, 2026-07; stage-6 reveal beside
Idle Harvest as the away-game pair; a `expeditions` nav badge lights when spoils are
claimable). Two boards under a masthead (slots chip + ready-count pulse):
**AWAY TEAM** — per-mission cards with hero portrait, risk chip, live progress bar +
countdown (30s tick), and a pulsing claim when returned; the claim raises an
outcome-tinted **spoils ceremony** card (windfall / setback / rare find, itemized haul).
**MISSION BOARD** — risk-chromed offer cards (tier accent border), affinity chip,
10-pip mastery meter (+% label), payout row, and per-hero portrait send buttons showing
the projected ×mult (affine foragers glow).

## Extending

New mission = one `EXPEDITION_DEFS` row (id, hours, risk, affinity, bundle). New rare
find = one `RARE_FINDS` row. New reward lanes (equipment drops, research points) belong
in `ExpeditionReward` + `claimExpedition`'s fold, keeping the same absolute-timestamp +
hashed-roll discipline.

Expedition dispatch focus (2026-11-11): a successful send from a focused control records the hero for post-render focus/nearest-scroll to its matching named Away Team group. Shared useId status references expose the live return time or claim state. Send accessible names include hero, mission, hours, risk and projected multiplier; claim names identify hero and mission. Failed starts do not move focus. Actual-meta phone probes cover one and three dispatches, distinct tickets, full-slot board disappearance, unchanged wallets/fielded loadout and accessible ETA. Mission timing, rewards, claims and slot rules are untouched.

Expedition receipt reading/focus (2026-11-11): removed the9-second auto-dismiss. The latest spoils card stays until explicit dismissal, replacement by another successful claim, or leaving the screen. Focused claims move focus/nearest-scroll to the receipt; dismissing from within it restores Mission Board heading focus. The status region has associated hero/outcome and haul descriptions; Mutagen, Scrap and Catalyst are separate named chips. Failed claims do not move focus. Real completed-mission probes verify persistence past9300ms, dismissal without reward/save changes, two claims replacing one receipt after the existing800ms guard cooldown, named material accessibility and dispatch regression. Timing/reward/security rules unchanged.
