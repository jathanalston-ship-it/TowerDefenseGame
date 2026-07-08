-- ASSIMILATE backend schema (Cloudflare D1). Apply with:
--   npx wrangler@3 d1 migrations apply assimilate-db --local   (dev)
--   npx wrangler@3 d1 migrations apply assimilate-db --remote  (production)
-- Design: docs/DEPLOYMENT.md §Backend. Money-related tables are append-mostly;
-- the fulfillments PRIMARY KEY is the idempotency heart of the purchase flow.

-- One row per Stripe Checkout Session that reached a PAID state (written by the
-- webhook, or by /api/store/claim verifying directly against Stripe when the
-- webhook hasn't landed yet). status: 'paid' | 'refunded'.
CREATE TABLE purchases (
  session_id     TEXT PRIMARY KEY,
  event_id       TEXT,
  player_id      TEXT NOT NULL,
  offer_id       TEXT NOT NULL,
  amount_total   INTEGER NOT NULL,
  currency       TEXT NOT NULL,
  payment_intent TEXT,
  status         TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  refunded_at    INTEGER
);
CREATE INDEX idx_purchases_player ON purchases (player_id, created_at DESC);
CREATE INDEX idx_purchases_intent ON purchases (payment_intent);

-- Exactly ONE fulfillment per session, ever. A claim only grants when its INSERT
-- wins this primary key; every later claim (double click, second tab, refresh,
-- replayed request) sees alreadyGranted and grants NOTHING again.
CREATE TABLE fulfillments (
  session_id TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL,
  offer_id   TEXT NOT NULL,
  granted_at INTEGER NOT NULL
);
CREATE INDEX idx_fulfillments_player ON fulfillments (player_id, granted_at DESC);

-- Webhook replay/duplicate protection: a Stripe event id is processed once.
CREATE TABLE webhook_events (
  event_id    TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

-- Cloud saves: one row per player. token_hash is SHA-256 of the player's secret
-- sync token (trust-on-first-use: the first write claims the id).
CREATE TABLE cloud_saves (
  player_id  TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  blob       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Leaderboards: the best entry per (mode, day, player). day_key is '' for modes
-- without a daily identity (bossRush all-time).
CREATE TABLE leaderboard (
  mode         TEXT NOT NULL,
  day_key      TEXT NOT NULL,
  player_id    TEXT NOT NULL,
  name         TEXT NOT NULL,
  score        INTEGER NOT NULL,
  wave         INTEGER NOT NULL,
  power        INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  PRIMARY KEY (mode, day_key, player_id)
);
CREATE INDEX idx_lb_top ON leaderboard (mode, day_key, score DESC);

-- Fixed-window rate-limit counters (pruned opportunistically by the limiter).
CREATE TABLE rate_limits (
  rl_key       TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
