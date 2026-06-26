# ASSIMILATE — Tower Defense (vertical slice)

A cyberpunk bio-horror tower defense. This repo currently contains the **design
corpus** (`docs/`) and a **playable vertical slice** built as a static
**React + TypeScript + Vite** app, deployable to **Cloudflare Pages**.

> Vision, systems, and the full 1000-hour design live in `docs/` —
> [`DESIGN.md`](docs/DESIGN.md), [`PROGRESSION.md`](docs/PROGRESSION.md),
> [`STAGES.md`](docs/STAGES.md), [`TOWERS.md`](docs/TOWERS.md),
> [`HEROES.md`](docs/HEROES.md), [`EQUIPMENT.md`](docs/EQUIPMENT.md),
> [`ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`ROADMAP.md`](docs/ROADMAP.md).

## Quickstart

```bash
npm install      # install dependencies
npm run dev      # http://localhost:5173  (Vite dev server)
npm run build    # type-checks, then builds static output to dist/
npm run preview  # serve the production build locally
npm test         # run the test suite (Vitest)
```

No environment variables, no backend, no server — it runs entirely in the browser
and saves progress to `localStorage`.

## The slice (what's playable)

- **One map** — a winding path with buildable cells; defend the **Nucleus**.
- **Five towers** — Needle Spitter (Kinetic, single-target Fracture), Bone Mortar
  (Caustic, AoE Corrosion pools), Flesh Reactor (Vital, biomass + adjacency
  overcharge), **Parasite Nest** (Viral, ramping **Infection** that ignores armor
  and spreads on death), and **Neural Obelisk** (Neural, a psionic field that
  **Disrupts** — slow + Vulnerability, amplifying all your damage). No two share a
  role, status, or scaling axis.
- **Three heroes (pick one to field)** — the **Ravager** (Kinetic dive bruiser),
  the **Shepherd** (Vital guardian — mends the Nucleus + vital pulse), and the
  **Overseer** (Neural controller — floats to the densest crowd, fields Disruption).
  Each is an autonomous unit you steer (right-click to re-anchor) with its own
  signature ability (Apex Leap / Bloom / Mass Override). Choose in the **Hero Lab**.
- **Reactions** — stack **Fracture** + **Corrosion** on an enemy to trigger
  **SHRED** (the build-variety hook). Disruption's Vulnerability lifts every source.
- **12 enemy waves** with a Brood Tyrant finale; survive to extract.
- **Card drafting** — pick 1 of 3 Gene Cards between waves (reset every run).
- **Saving / progression** — runs bank **Shards** (permanent upgrades) and per-unit
  **Tower/Hero Shards** → **Stars**, plus infinite **Mastery** from use. Best wave
  and run stats persist across sessions.

> Deliberately **out of scope** for the slice (designed, not yet built): prestige,
> equipment/loot, infinite scaling. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## How to play

Place towers on the lit cells (spend biomass) → **Start Wave** → survive → draft a
card → repeat. Place a Flesh Reactor next to other towers to overcharge them.
Combine Fracture (Needle/Hero) with Corrosion (Mortar) for SHRED. Earn Shards,
buy permanent upgrades, push further.

## Deploy

Static SPA → **Cloudflare Pages** (build command `npm run build`, output
directory `dist`). Full step-by-step in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Project layout

```
src/
  core/    deterministic sim — no React/DOM (game, towers, enemies, cards, map, rng, config)
  save/    versioned localStorage persistence
  state/   meta progression + a tiny React-bridged store
  render/  Canvas 2D renderer
  ui/      React components (menu, HUD, toolbar, draft, results)
public/    static assets (_redirects SPA fallback)
docs/      design + architecture + roadmap + deployment
```
