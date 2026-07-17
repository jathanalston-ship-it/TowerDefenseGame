-- Auction House (docs/AUCTION-HOUSE.md) — the player-driven market + the invisible Market
-- Authority. The server is the ONLY trade truth (docs/TRADING-PREP.md §authority): items
-- enter escrow at listing, every Ichor movement is a wallet-ledger row (exactly-once by
-- ledger PK), and the authority's state/metrics live in single-row windows the endpoints
-- advance lazily (no daemon — "always running" is a property of the data).

-- Server-side item registry: one row per item that has EVER entered the market. The row is
-- the identity + custody record (docs/TRADING-PREP.md item metadata); `payload` carries the
-- serialized item data (equipment def/rarity/affixes) the buyer's client reconstructs.
CREATE TABLE IF NOT EXISTS market_items (
  global_item_id TEXT PRIMARY KEY, -- itemIdentity.globalItemId (server-assigned at first listing)
  ref_key TEXT NOT NULL, -- eq:<uid> | cos:<id> | gene:<id> (per owner at ingress)
  category TEXT NOT NULL, -- equipment | cosmetic | geneCard
  family_key TEXT NOT NULL, -- stats aggregation key (def id / cosmetic id / gene id)
  rarity TEXT NOT NULL,
  season INTEGER NOT NULL DEFAULT 0, -- arena season at ingress (provenance)
  owner_id TEXT NOT NULL, -- current custodian (seller while escrowed, buyer after settle)
  state TEXT NOT NULL DEFAULT 'escrow', -- escrow | delivered | returned
  source TEXT NOT NULL DEFAULT 'legacy', -- provenance acquisition source
  transfers INTEGER NOT NULL DEFAULT 0, -- ownership changes through the market
  history TEXT NOT NULL DEFAULT '[]', -- prior owner ids (JSON array, capped)
  payload TEXT NOT NULL DEFAULT '{}', -- serialized item data (client reconstructs)
  fraud_flag INTEGER NOT NULL DEFAULT 0, -- set by the audit; moderation reads it
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_market_items_owner ON market_items (owner_id, state);

CREATE TABLE IF NOT EXISTS market_listings (
  listing_id TEXT PRIMARY KEY,
  global_item_id TEXT NOT NULL,
  family_key TEXT NOT NULL,
  category TEXT NOT NULL,
  rarity TEXT NOT NULL,
  seller_id TEXT NOT NULL, -- '@authority' for baseline stock
  season INTEGER NOT NULL DEFAULT 0, -- item's provenance season (search filter, denormalized)
  ask INTEGER NOT NULL,
  buy_now INTEGER, -- NULL = bid-only
  bid INTEGER, -- standing bid
  bidder_id TEXT,
  ends_at INTEGER NOT NULL, -- epoch ms (anti-snipe extends)
  created_at INTEGER NOT NULL,
  closed_at INTEGER, -- when it left 'active' (sold/expired/cancelled) — audit input
  state TEXT NOT NULL DEFAULT 'active', -- active | sold | expired | cancelled
  fee_paid INTEGER NOT NULL DEFAULT 0,
  authority INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_market_listings_browse ON market_listings (state, category, rarity, ends_at);
-- One ACTIVE listing per item, enforced by the schema: a double-list is a SQL error and the
-- whole batch (fee charge included) rolls back atomically.
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_listings_active_item ON market_listings (global_item_id) WHERE state = 'active';
CREATE INDEX IF NOT EXISTS idx_market_listings_family ON market_listings (state, family_key);
CREATE INDEX IF NOT EXISTS idx_market_listings_seller ON market_listings (seller_id, state);
CREATE INDEX IF NOT EXISTS idx_market_listings_expiry ON market_listings (state, ends_at);

-- Bid history (fraud evidence + the listing detail's bid trail).
CREATE TABLE IF NOT EXISTS market_bids (
  listing_id TEXT NOT NULL,
  bidder_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_market_bids_listing ON market_bids (listing_id, at);

-- The market wallet: Ichor INSIDE the trade system. Sale proceeds are server-sourced truth;
-- deposits are client-attested (the documented trust boundary — docs/AUCTION-HOUSE.md
-- §security) and every movement lands in market_wallet_ledger exactly-once.
CREATE TABLE IF NOT EXISTS market_wallets (
  player_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0), -- a negative wallet is a bug, never a state
  escrow INTEGER NOT NULL DEFAULT 0 CHECK (escrow >= 0), -- standing-bid escrow held out of balance
  deposited_lifetime INTEGER NOT NULL DEFAULT 0,
  withdrawn_lifetime INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, -- first market touch — the market-age gate's clock for token players
  updated_at INTEGER NOT NULL
);

-- Exactly-once money movements (the purchases/fulfillments discipline): op_id is the dedupe.
CREATE TABLE IF NOT EXISTS market_wallet_ledger (
  op_id TEXT PRIMARY KEY, -- caller-supplied idempotency key (or server-derived)
  player_id TEXT NOT NULL,
  kind TEXT NOT NULL, -- deposit | withdraw | listingFee | bidEscrow | refund | saleProceeds | buyNow
  amount INTEGER NOT NULL, -- signed against balance
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_market_ledger_player ON market_wallet_ledger (player_id, at);

-- Settled trades (the fraud audit's event log + history aggregation input).
CREATE TABLE IF NOT EXISTS market_trades (
  listing_id TEXT PRIMARY KEY, -- one settlement per listing — the exactly-once anchor
  global_item_id TEXT NOT NULL,
  family_key TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  price INTEGER NOT NULL,
  tax INTEGER NOT NULL,
  authority INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_market_trades_family ON market_trades (family_key, at);
CREATE INDEX IF NOT EXISTS idx_market_trades_pair ON market_trades (seller_id, buyer_id);

-- Per-day price history the trend endpoint serves (TRADE.historyDays retention).
CREATE TABLE IF NOT EXISTS market_history (
  family_key TEXT NOT NULL,
  day TEXT NOT NULL, -- UTC day key
  sales INTEGER NOT NULL DEFAULT 0,
  median_price INTEGER NOT NULL DEFAULT 0,
  low_price INTEGER NOT NULL DEFAULT 0,
  high_price INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (family_key, day)
);

-- The authority: ONE state row (id=0) + one metrics row per window. Ticks are exactly-once
-- by window key (the INSERT is the dedupe — concurrent requests race safely).
CREATE TABLE IF NOT EXISTS market_authority (
  id INTEGER PRIMARY KEY CHECK (id = 0),
  state TEXT NOT NULL, -- AuthorityState JSON
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS market_windows (
  window_key INTEGER PRIMARY KEY, -- UTC hour index
  metrics TEXT NOT NULL, -- MarketMetrics JSON
  created_at INTEGER NOT NULL
);

-- Fraud flags the audit writes and moderation reads (never auto-punishes).
CREATE TABLE IF NOT EXISTS market_flags (
  flag_id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL, -- signal JSON
  at INTEGER NOT NULL,
  reviewed INTEGER NOT NULL DEFAULT 0
);
