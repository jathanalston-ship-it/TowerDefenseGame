-- 0004: the account platform (docs/ACCOUNTS.md). Accounts FORMALIZE the existing
-- anonymous identity: account_id IS the playerId UUID that already keys purchases,
-- cloud_saves and leaderboard rows — so a guest→email upgrade (or any future
-- provider attach) carries every prior record over with zero data movement.

CREATE TABLE accounts (
  account_id       TEXT PRIMARY KEY,           -- the client playerId UUID
  provider         TEXT NOT NULL,              -- 'guest' | 'email' (future: 'steam' | 'google' | 'apple' | 'discord')
  email            TEXT UNIQUE,                -- lowercased; NULL for guests
  pass_hash        TEXT,                       -- PBKDF2-SHA256 hex (NULL for guests)
  pass_salt        TEXT,                       -- 16-byte hex salt
  pass_iters       INTEGER,                    -- iteration count baked per-account (future-proof rehash)
  guest_token_hash TEXT,                       -- SHA-256 of the device sync token (guest credential)
  display_name     TEXT NOT NULL DEFAULT '',
  icon             TEXT NOT NULL DEFAULT '',
  created_at       INTEGER NOT NULL,
  last_login       INTEGER NOT NULL,
  playtime_sec     INTEGER NOT NULL DEFAULT 0, -- lifetime playtime as last reported by a save sync
  platforms        TEXT NOT NULL DEFAULT '[]'  -- JSON array of platform ids this account has signed in from
);

-- Opaque bearer sessions (token itself never stored — SHA-256 only).
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform   TEXT NOT NULL DEFAULT 'web',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_account ON sessions(account_id);

-- Password-reset tokens (single-use, short-lived; delivery via the email seam).
CREATE TABLE reset_tokens (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Cloud saves become versioned + described: rev increments on every accepted write
-- (optimistic concurrency — a stale baseRev is refused, never silently overwritten);
-- meta carries the envelope headline (savedAt, playtimeSec, power, stage, checksum,
-- platform) so conflict UIs can preview without downloading the blob.
ALTER TABLE cloud_saves ADD COLUMN rev  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cloud_saves ADD COLUMN meta TEXT    NOT NULL DEFAULT '{}';
