-- Market Constructs (docs/CONSTRUCTS.md): the roster of the game's own AI players. One row per
-- construct — its cloud-save credential and its play-pacing state. The constructs' SAVES live in
-- cloud_saves like any player's; their trades live in the market tables like any player's.
-- Idempotent (IF NOT EXISTS): the constructs deploy job applies this file directly.
CREATE TABLE IF NOT EXISTS constructs (
  player_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- The construct's sync token (cloud_saves stores only its SHA-256, like every slot).
  token TEXT NOT NULL,
  -- Play-time balance in seconds (owed play; negative when a run overshot the clock).
  credit_sec REAL NOT NULL DEFAULT 0,
  last_tick_at INTEGER NOT NULL DEFAULT 0,
  runs_total INTEGER NOT NULL DEFAULT 0,
  -- The last tick's report (JSON) — what the status endpoint shows.
  last_report TEXT NOT NULL DEFAULT '',
  -- Tick lease (compare-and-set): overlapping scheduled runs never tick one construct twice.
  lease_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
