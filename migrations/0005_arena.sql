-- Arena (live PvP) — docs/ARENA.md + docs/ONLINE-FOUNDATION.md §authority.
-- The server is the rating/settlement truth: one row per (player, season) on the ladder,
-- one exactly-once settlement row per (match, player), and the item-event ledger the future
-- Auction House's fraud audit reads (docs/TRADING-PREP.md §fraud).

CREATE TABLE IF NOT EXISTS arena_ratings (
  player_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  rating INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  placements INTEGER NOT NULL DEFAULT 5,
  streak INTEGER NOT NULL DEFAULT 0,
  peak INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, season)
);
CREATE INDEX IF NOT EXISTS idx_arena_ratings_ladder ON arena_ratings (season, rating DESC);

-- Exactly-once match settlement (the PK is the dedupe): a resubmitted matchId returns the
-- stored verdict instead of paying twice — the purchases/fulfillments discipline.
CREATE TABLE IF NOT EXISTS arena_matches (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  vs_ai INTEGER NOT NULL,
  opp_rating INTEGER NOT NULL,
  duration_sec INTEGER NOT NULL,
  wave INTEGER NOT NULL,
  power INTEGER NOT NULL,
  rating_after INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (match_id, player_id)
);

-- Item event ledger (Auction House backend prep): every future trade/listing/settlement
-- appends here; auditTradeEvents (src/core/trading.ts) is the reader. Append-only.
CREATE TABLE IF NOT EXISTS item_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  at INTEGER NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_item_events_item ON item_events (item_key, at);
CREATE INDEX IF NOT EXISTS idx_item_events_player ON item_events (player_id, at);
