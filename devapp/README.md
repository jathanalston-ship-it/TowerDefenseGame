# ASSIMILATION Mission Control — the developer analytics desktop app

A **standalone, downloadable Electron desktop application** for reading the game's
analytics platform (docs/ANALYTICS.md). It is deliberately separate from the game and the
website: its own subproject, never part of the Vite build, never deployed anywhere. It
talks straight to your production `/api/dev/*` endpoints with the `DEV_KEY` secret.

## Run it (development)

```bash
cd devapp
npm install
npm start
```

On first launch enter:
- **API base URL** — your deployment, e.g. `https://your-game.pages.dev`
- **Dev key** — the `DEV_KEY` secret you configured on the server
  (`npx wrangler pages secret put DEV_KEY`)

Both persist locally (Electron user data); **Disconnect** in the sidebar forgets the key.

## Build installers (the downloadable app)

```bash
cd devapp
npm install
npm run dist
```

Installers land in `devapp/dist/` — NSIS `.exe` on Windows, `.dmg` on macOS, `.AppImage`
on Linux (each platform builds its own native installer; cross-building macOS requires a
Mac). **Binaries are never committed** — `devapp/dist/` and `node_modules/` are ignored.

## What's inside

| View | What it shows |
|---|---|
| Overview | players online now, DAU, totals, revenue, sessions/runs/errors today, version mix |
| Insights | the automatic findings feed — z-tested, ranked action → watch → info, with sample sizes |
| Series Explorer | any registry event kind as a daily chart + dimension breakdown (zero per-kind wiring) |
| Balance | tower/hero win-rate tables with significance shading; gene/equipment/mulligan/ability usage |
| Economy | faucet-vs-sink coverage per currency, gain sources, spend sinks, containers, rare finds |
| Retention | D1/D7/D30 cohort table from the activity spine |
| Heatmaps | 12×8 tap-density grids per screen |
| Player Lookup | one pseudonymous id → headline + durable-event timeline (all the platform stores) |
| Errors | hash-deduped crash/error ledger with counts and stack heads |
| Remote Config | edit + save the flags/numbers/experiments document (whitelist-sanitized on save) |
| Export | CSV/JSON download of the daily rollups any view derives from |

## Notes

- The UI is one self-contained `ui/index.html` — inline CSS/JS, no external libraries, no
  telemetry of its own. You can open it in a plain browser for a quick look; the packaged
  app is the supported path.
- The server answers CORS on `/api/dev/*` specifically so this app can call it from its
  `file://` renderer with web security fully enabled.
- If every view errors: check the base URL, the key, and that migration
  `migrations/0008_analytics.sql` has been applied to your D1 database.
