-- Player telemetry & analytics platform (docs/ANALYTICS.md §server).
-- Design law: storage stays BOUNDED regardless of player count — the rollup table's
-- cardinality is kinds × dims × versions × days (population-independent); raw events are
-- kept only for durable kinds (player timelines) and prune on retention windows.

-- Daily rollups — the spine every dashboard series, insight, and export reads.
-- One row per (day, kind, dim, version): n = event count, sum/sum2 = value moments
-- (mean/stddev derive without ever storing raw values).
CREATE TABLE IF NOT EXISTS an_daily (
  day TEXT NOT NULL, -- UTC YYYY-MM-DD
  kind TEXT NOT NULL, -- registry kind (core/analyticsEvents.ts)
  dim TEXT NOT NULL DEFAULT '', -- dimension token ('' for dimless kinds)
  ver TEXT NOT NULL DEFAULT '', -- app version (patch-impact split)
  n INTEGER NOT NULL DEFAULT 0,
  sum INTEGER NOT NULL DEFAULT 0,
  sum2 REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, dim, ver)
);
CREATE INDEX IF NOT EXISTS idx_an_daily_kind ON an_daily (kind, day);

-- Raw events — durable kinds only (buy/err/run_end/…; registry `durable` flag). Player
-- timelines and audits read these; non-durable signals exist ONLY as rollups. Pruned by
-- day on the retention windows (AN_LIMITS.rawDays / durableDays).
CREATE TABLE IF NOT EXISTS an_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  session TEXT NOT NULL,
  kind TEXT NOT NULL,
  at INTEGER NOT NULL, -- epoch ms (server-clamped)
  screen TEXT,
  mode TEXT,
  dim TEXT,
  val INTEGER,
  extras TEXT, -- JSON (registry-allowlisted keys only)
  ver TEXT NOT NULL DEFAULT '',
  day TEXT NOT NULL -- UTC day (prune key)
);
CREATE INDEX IF NOT EXISTS idx_an_events_player ON an_events (player_id, at);
CREATE INDEX IF NOT EXISTS idx_an_events_day ON an_events (day);

-- One row per player ever seen — headline facts only (no PII by construction).
CREATE TABLE IF NOT EXISTS an_players (
  player_id TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  first_ver TEXT NOT NULL DEFAULT '',
  last_ver TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '', -- server-derived country code (coarse)
  platform TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT '',
  power INTEGER NOT NULL DEFAULT 0, -- latest Power Score
  stage INTEGER NOT NULL DEFAULT 0, -- latest campaign stage
  sessions INTEGER NOT NULL DEFAULT 0,
  revenue_cents INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_an_players_first ON an_players (first_seen);

-- Live sessions (heartbeats drive "players online now"; duration from ses_end).
CREATE TABLE IF NOT EXISTS an_sessions (
  session TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_ping INTEGER NOT NULL,
  ver TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  dur_sec INTEGER NOT NULL DEFAULT 0,
  events INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_an_sessions_ping ON an_sessions (last_ping);
CREATE INDEX IF NOT EXISTS idx_an_sessions_player ON an_sessions (player_id);

-- Activity spine: one row per (player, active day) — D1/D7/D30 retention derives from
-- this + an_players.first_seen with two indexed reads.
CREATE TABLE IF NOT EXISTS an_activity (
  player_id TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (player_id, day)
);
CREATE INDEX IF NOT EXISTS idx_an_activity_day ON an_activity (day);

-- Crash/error ledger — deduped by the client's stable hash; counts grow, text stays.
CREATE TABLE IF NOT EXISTS an_errors (
  hash TEXT PRIMARY KEY,
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  msg TEXT NOT NULL DEFAULT '',
  stack TEXT NOT NULL DEFAULT '',
  ver TEXT NOT NULL DEFAULT '' -- last version seen
);

-- Remote config document (single row) — served publicly via GET /api/config after the
-- whitelist sanitizer; edited through the DEV_KEY-gated flags endpoint.
CREATE TABLE IF NOT EXISTS an_flags (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  doc TEXT NOT NULL DEFAULT '{}',
  rev INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
